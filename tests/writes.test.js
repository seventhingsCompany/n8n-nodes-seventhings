const assert = require('node:assert/strict');
const { test } = require('node:test');
const { context, UUID, OTHER_UUID } = require('./context');
const P = '/customer-api/v1';
const definitions = [
  { field_key: 'count', field_type: { name: 'NUMBER' } },
  { field_key: 'active', field_type: { name: 'BOOLEAN' } },
];
const taskInputs = { title: 'Inspect', deadline: '2026-06-01T10:00:00Z', assignees: [OTHER_UUID, UUID], referenceAssetUuid: UUID, reminderValue: 0, additionalFields: { notify: false } };
const rentalInputs = { title: 'Loan', renterType: 'plain', renterValue: 'Customer', referenceAssetUuid: UUID, issueDate: '2026-06-01T10:00:00Z', dueDate: '2026-06-10T10:00:00Z', comment: 'Note', responsibleUserUuid: OTHER_UUID };

const creates = [
  { resource: 'asset', path: '/object', template: 'asset', inputs: { fields: { value: { count: '0', active: 'false', name: 'Desk' } } }, body: { count: 0, active: false, name: 'Desk' } },
  { resource: 'room', path: '/room', template: 'room', inputs: { buildingId: '7', fields: { value: { count: '2', name: 'Office' } } }, body: { count: 2, name: 'Office', building_id: 7 } },
  { resource: 'location', path: '/location', inputs: { name: 'HQ', additionalFields: { city: 'Dresden', country: '', unknown: 'ignored' } }, body: { name: 'HQ', city: 'Dresden' } },
  { resource: 'person', path: '/person', inputs: { fields: { value: { email: 'user@example.com', active: false } } }, body: { fields: { email: 'user@example.com', active: false } } },
  { resource: 'task', path: '/task-management/task', inputs: taskInputs, body: { title: 'Inspect', deadline: '2026-06-01', assignees: [OTHER_UUID], references: [{ type: 'asset', uuid: UUID }], reminders: [{ unit: 'days', value: 0 }], recurring_schedule: null, comment: null, attachments: [], notify: false } },
  { resource: 'rentalCase', path: '/rental-management/rental-case', inputs: rentalInputs, body: { title: 'Loan', renter: { type: 'plain', value: 'Customer' }, references: [{ type: 'asset', uuid: UUID }], issue_date: '2026-06-01', due_date: '2026-06-10', issue_date_reminder: { unit: 'days', value: 1 }, due_date_reminder: { unit: 'days', value: 1 }, comment: 'Note', responsible_user_uuid: OTHER_UUID, attachments: [] } },
];

for (const entry of creates) {
  test(`${entry.resource}: create sends the API body and follows Location to fetch the result`, async () => {
    const h = context({ resource: entry.resource, operation: 'create', ...entry.inputs }, [
      ...(entry.template ? [{ path: `${P}/asset-tracking/${entry.template}/field-definitions`, response: definitions }] : []),
      { method: 'POST', path: P + entry.path, check: (r) => { assert.deepEqual(r.body, entry.body); assert.equal(r.returnFullResponse, true); }, response: { headers: { Location: `${P}${entry.path}/${UUID}` }, body: '' } },
      { path: `${P}${entry.path}/${UUID}`, response: { uuid: UUID, name: 'Created' } },
    ]);
    const [[item]] = await h.execute();
    assert.equal(item.json.name, 'Created');
    assert.deepEqual(item.pairedItem, { item: 0 });
    h.done();
  });
}

for (const missing of ['title', 'deadline', 'assignees', 'referenceAssetUuid']) {
  test(`task create rejects missing ${missing} before sending a request`, async () => {
    const h = context({ resource: 'task', operation: 'create', ...taskInputs, [missing]: '' });
    await assert.rejects(h.execute(), /required/);
    assert.equal(h.requests.length, 0);
  });
}

for (const [operation, status] of [['close', 'closed'], ['reopen', 'open']]) {
  test(`task ${operation} uses PUT status and fetches the result`, async () => {
    const path = `${P}/task-management/task/${UUID}`;
    const h = context({ resource: 'task', operation, taskId: UUID }, [
      { method: 'PUT', path: `${path}/status`, check: (r) => assert.deepEqual(r.body, { status }), response: '' },
      { path, response: { uuid: UUID, status } },
    ]);
    assert.equal((await h.execute())[0][0].json.status, status);
    h.done();
  });
}

for (const [operation, field] of [['moveToLocation', 'location'], ['moveToRoom', 'room']]) {
  test(`asset ${operation} sends a partial PATCH`, async () => {
    const path = `${P}/object/${UUID}`;
    const h = context({ resource: 'asset', operation, assetId: UUID, [field]: 'Destination' }, [
      { method: 'PATCH', path, check: (r) => assert.deepEqual(r.body, { [field]: 'Destination' }), response: '' },
      { path, response: { uuid: UUID, [field]: 'Destination' } },
    ]);
    assert.equal((await h.execute())[0][0].json[field], 'Destination');
    h.done();
  });
}

for (const operation of ['archive', 'unarchive']) {
  test(`asset ${operation} returns an explicit archive flag`, async () => {
    const path = `${P}/object/${UUID}`;
    const h = context({ resource: 'asset', operation, assetId: UUID }, [
      { method: 'POST', path: `${path}/${operation}`, response: '' }, { path, response: { uuid: UUID } },
    ]);
    assert.equal((await h.execute())[0][0].json.archived, operation === 'archive');
    h.done();
  });
}

for (const [resource, idKey, template] of [['asset', 'assetId', 'asset'], ['room', 'roomId', 'room'], ['person', 'personId', null], ['location', 'locationId', null]]) {
  test(`${resource}: update sends only selected fields, preserving false and zero`, async () => {
    const singular = resource === 'asset' ? 'object' : resource;
    const fields = resource === 'location' ? { city: '' } : { count: 0, active: false };
    const h = context({ resource, operation: 'update', [idKey]: UUID, fields: { value: fields }, updateFields: fields }, [
      ...(template ? [{ path: `${P}/asset-tracking/${template}/field-definitions`, response: definitions }] : []),
      { method: 'PATCH', path: `${P}/${singular}/${UUID}`, check: (r) => assert.deepEqual(r.body, fields), response: '' },
      { path: `${P}/${singular}/${UUID}`, response: { uuid: UUID, ...fields } },
    ]);
    await h.execute();
    h.done();
  });
}

for (const [resource, path, idKey, updateKey] of [['task', '/task-management/task', 'taskId', 'additionalFields'], ['rentalCase', '/rental-management/rental-case', 'rentalCaseId', 'updateFields']]) {
  test(`${resource}: update fetches, merges writable fields, PUTs, and fetches again`, async () => {
    const existing = { uuid: UUID, title: 'Original', comment: 'Keep', deadline: '2026-06-01T10:00:00Z', issue_date: '2026-06-01', due_date: '2026-06-10', reminders: [{ unit: 'days', value: 0 }], assignees: [OTHER_UUID], references: [{ type: 'asset', uuid: OTHER_UUID, name: 'Expanded' }], renter: { type: 'plain', value: 'Customer' }, responsible_user_uuid: OTHER_UUID };
    const h = context({ resource, operation: 'update', [idKey]: UUID, [updateKey]: { title: 'Edited' } }, [
      { path: P + path + '/' + UUID, response: existing },
      { method: 'PUT', path: P + path + '/' + UUID, check: (r) => {
        assert.equal(r.body.title, 'Edited');
        assert.equal(r.body.comment, 'Keep');
        assert.deepEqual(r.body.references, [{ type: 'asset', uuid: OTHER_UUID }]);
        assert.equal(r.body.uuid, undefined);
        if (resource === 'task') { assert.equal(r.body.deadline, '2026-06-01'); assert.deepEqual(r.body.assignees, [OTHER_UUID]); }
        else assert.deepEqual(r.body.renter, existing.renter);
      }, response: '' },
      { path: P + path + '/' + UUID, response: { ...existing, title: 'Edited' } },
    ]);
    assert.equal((await h.execute())[0][0].json.title, 'Edited');
    h.done();
  });
}

test('asset find-or-create returns an exact case-insensitive match without creating', async () => {
  const h = context({ resource: 'asset', operation: 'create', findOrCreate: true, matchFieldKey: 'barcode', matchValue: 'ABC' }, [
    { path: `${P}/asset-tracking/asset/field-definitions`, response: [] },
    { path: `${P}/objects`, check: (r) => assert.equal(r.qs['filter[barcode][eq]'], 'ABC'), response: { items: [{ uuid: UUID, barcode: 'abc' }, { barcode: 'other' }] } },
  ]);
  assert.equal((await h.execute())[0][0].json.asset_uuid, UUID);
  h.done();
});

test('asset find-or-create seeds the search field when no match exists', async () => {
  const h = context({ resource: 'asset', operation: 'create', findOrCreate: true, matchFieldKey: 'barcode', matchValue: 'ABC' }, [
    { path: `${P}/asset-tracking/asset/field-definitions`, response: [] },
    { path: `${P}/objects`, response: { items: [] } },
    { method: 'POST', path: `${P}/object`, check: (r) => assert.deepEqual(r.body, { barcode: 'ABC' }), response: { body: { uuid: UUID } } },
    { path: `${P}/object/${UUID}`, response: { uuid: UUID } },
  ]);
  await h.execute();
  h.done();
});
