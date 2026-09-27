const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SeventhingsTrigger } = require('../dist/nodes/SeventhingsTrigger/SeventhingsTrigger.node');
const { context, UUID, OTHER_UUID } = require('./context');

const taskPath = '/customer-api/v1/task-management/tasks';
const assetPath = '/customer-api/v1/objects';
const rentalPath = '/customer-api/v1/rental-management/rental-cases';
const events = {
  newAsset: assetPath, updatedAsset: assetPath,
  newTask: taskPath, updatedTask: taskPath, taskClosed: taskPath, taskReopened: taskPath,
  taskOverdue: taskPath, taskDueSoon: taskPath,
  newRentalCase: rentalPath, updatedRentalCase: rentalPath, rentalCaseReturned: rentalPath,
};
async function poll(event, items, state = {}, options = {}) {
  const path = events[event];
  const h = context({ event, daysAhead: 3 }, [{ path, response: path === taskPath ? items : { items }, check: options.check }], { state, ...options });
  const result = await SeventhingsTrigger.prototype.poll.call(h.ctx);
  h.done();
  return result;
}
const row = { uuid: UUID, asset_uuid: UUID, title: 'Original', created_at: '2026-01-01 10:00:00', updated_at: '2026-01-01 10:00:00' };

for (const event of Object.keys(events)) {
  test(`${event}: empty polling result returns null`, async () => {
    assert.equal(await poll(event, []), null);
  });
  test(`${event}: API failures do not advance polling state`, async () => {
    const state = { sentinel: true };
    const h = context({ event }, [{ path: events[event], error: { statusCode: 500, message: 'Unavailable' } }], { state });
    await assert.rejects(SeventhingsTrigger.prototype.poll.call(h.ctx));
    assert.deepEqual(state, { sentinel: true });
    h.done();
  });
}

for (const event of ['newAsset', 'updatedAsset', 'newRentalCase']) {
  test(`${event}: seeds history, emits new timestamps once, manual mode leaves state untouched`, async () => {
    const state = {};
    assert.equal(await poll(event, [row], state), null);
    const fresh = { ...row, uuid: OTHER_UUID, asset_uuid: OTHER_UUID, created_at: '2026-01-02 10:00:00', updated_at: '2026-01-02 10:00:00' };
    const result = await poll(event, [row, fresh], state);
    assert.equal(result[0].length, 1);
    assert.equal(result[0][0].json.created_at, '2026-01-02T10:00:00Z');
    assert.equal(await poll(event, [fresh], state), null);
    const before = structuredClone(state);
    assert.equal((await poll(event, [row], state, { mode: 'manual' }))[0].length, 1);
    assert.deepEqual(state, before);
  });

  test(`${event}: activation with an empty list does not swallow the first new record`, async () => {
    const state = {};
    await poll(event, [], state);
    assert.equal((await poll(event, [row], state))?.[0].length, 1);
  });

  test(`${event}: emits a new record sharing the previous watermark timestamp once`, async () => {
    const state = {};
    await poll(event, [row], state);
    const added = { ...row, uuid: OTHER_UUID, asset_uuid: OTHER_UUID };
    assert.equal((await poll(event, [row, added], state))?.[0].length, 1);
    assert.equal(await poll(event, [row, added], state), null);
  });
}

for (const event of ['updatedTask', 'updatedRentalCase']) {
  test(`${event}: detects edits without timestamps and ignores object-key ordering`, async () => {
    const state = {};
    const original = { uuid: UUID, title: 'Original', details: { a: 1, b: 2 } };
    assert.equal(await poll(event, [original], state), null);
    assert.equal(await poll(event, [{ details: { b: 2, a: 1 }, title: 'Original', uuid: UUID }], state), null);
    const result = await poll(event, [{ ...original, title: 'Changed' }], state);
    assert.equal(result?.[0][0].json.title, 'Changed');
    assert.equal(await poll(event, [{ ...original, title: 'Changed' }], state), null);
  });
}

for (const [event, status] of [['taskClosed', 'closed'], ['taskReopened', 'open'], ['rentalCaseReturned', 'completed']]) {
  test(`${event}: emits status entry once and permits re-entry without timestamps`, async () => {
    const state = {};
    await poll(event, [], state);
    const matching = { uuid: UUID, status };
    assert.equal((await poll(event, [matching, { uuid: OTHER_UUID, status: 'other' }], state))?.[0].length, 1);
    assert.equal(await poll(event, [matching], state), null);
    await poll(event, [], state);
    assert.equal((await poll(event, [matching], state))?.[0].length, 1);
  });
}

test('newTask emits new UUIDs but not edits', async () => {
  const state = {};
  await poll('newTask', [{ uuid: UUID }], state);
  assert.equal(await poll('newTask', [{ uuid: UUID, title: 'Edited' }], state), null);
  const result = await poll('newTask', [{ uuid: UUID }, { uuid: OTHER_UUID }], state);
  assert.equal(result[0][0].json.uuid, OTHER_UUID);
});

for (const event of ['taskDueSoon', 'taskOverdue']) {
  test(`${event}: enforces date bounds and open status even if API ignores filters`, async () => {
    const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const items = [
      { uuid: UUID, status: 'open', deadline: day(0) },
      { uuid: 'past', status: 'open', deadline: day(-1) },
      { uuid: 'edge', status: 'open', deadline: day(3) },
      { uuid: 'far', status: 'open', deadline: day(4) },
      { uuid: 'closed', status: 'closed', deadline: day(0) },
      { uuid: 'invalid', status: 'open', deadline: 'invalid' },
    ];
    const result = await poll(event, items, {}, { mode: 'manual', check: (request) => {
      assert.equal(request.qs.status, 'open');
      assert.equal(request.qs.deadline_to, day(event === 'taskDueSoon' ? 3 : 0));
    } });
    assert.deepEqual(result[0].map((item) => item.json.uuid).sort(), (event === 'taskDueSoon' ? [UUID, 'edge'] : [UUID, 'past']).sort());
  });
}

test('taskDueSoon re-fires when a deadline changes within the window', async () => {
  const state = {};
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  await poll('taskDueSoon', [{ uuid: UUID, status: 'open', deadline: day(1) }], state);
  assert.equal((await poll('taskDueSoon', [{ uuid: UUID, status: 'open', deadline: day(2) }], state))?.[0].length, 1);
});
