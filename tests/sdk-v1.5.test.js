const assert = require('node:assert/strict');
const { test } = require('node:test');
const { context, UUID, OTHER_UUID } = require('./context');
const { SeventhingsApi } = require('../dist/credentials/SeventhingsApi.credentials');
const { seventhingsApiRequest } = require('../dist/nodes/Seventhings/transport');
const { waitForRateLimit, retryAfterMilliseconds } = require('../dist/nodes/Seventhings/transport/rateLimit');
const P = '/customer-api/v1';

for (const header of [{ 'Location-UUID': UUID }, { location: `${P}/catalog-item/${UUID}` }]) {
  test(`catalog create wraps fields and follows ${Object.keys(header)[0]}`, async () => {
    const fields = { catalog_object_inventory_name: 'Laptop', catalog_object_price: 0, active: false };
    const h = context({ resource: 'catalogItem', operation: 'create', catalogFields: JSON.stringify(fields) }, [
      { method: 'POST', path: `${P}/catalog-item`, check: (r) => assert.deepEqual(r.body, { fields }), response: { headers: header } },
      { path: `${P}/catalog-item/${UUID}`, response: { uuid: UUID, fields } },
    ]);
    const [[item]] = await h.execute();
    assert.deepEqual(item.json, { uuid: UUID, fields });
    assert.deepEqual(item.pairedItem, { item: 0 });
    h.done();
  });
}

test('catalog update uses full replacement PUT, including an intentionally empty field map', async () => {
  const h = context({ resource: 'catalogItem', operation: 'update', catalogItemId: UUID, catalogFields: '{}' }, [
    { method: 'PUT', path: `${P}/catalog-item/${UUID}`, check: (r) => assert.deepEqual(r.body, { fields: {} }), response: {} },
    { path: `${P}/catalog-item/${UUID}`, response: { uuid: UUID, fields: {} } },
  ]);
  await h.execute();
  h.done();
});

test('catalog list paginates and encodes filters/sorting without flattening catalog fields', async () => {
  const h = context({ resource: 'catalogItem', operation: 'getAll', limit: 101,
    filterRows: { filters: [{ field: 'catalog_object_inventory_name', operator: 'like', values: ['Laptop', 'Desk'] }] },
    sortRows: { sort: [{ field: 'id', direction: 'DESC' }] },
  }, [1, 2].map((page) => ({ path: `${P}/catalog-items`, check: (r) => {
    assert.equal(r.qs.page, page);
    assert.equal(r.qs.per_page, 100);
    assert.equal(r.qs['sort[id]'], 'DESC');
    assert.deepEqual(r.qs['filter[catalog_object_inventory_name][like][]'], ['Laptop', 'Desk']);
  }, response: { items: Array.from({ length: 100 }, () => ({ uuid: UUID, fields: { custom: false } })), total: 200 } })));
  const [items] = await h.execute();
  assert.equal(items.length, 101);
  assert.equal(items[0].json.fields.custom, false);
  h.done();
});

for (const operation of ['get', 'delete']) {
  test(`catalog ${operation} uses the UUID endpoint`, async () => {
    const h = context({ resource: 'catalogItem', operation, catalogItemId: UUID }, [
      { method: operation === 'delete' ? 'DELETE' : 'GET', path: `${P}/catalog-item/${UUID}`, response: { uuid: UUID, fields: {} } },
    ]);
    const [[item]] = await h.execute();
    assert.equal(item.json.uuid, UUID);
    if (operation === 'delete') assert.equal(item.json.deleted, true);
    h.done();
  });
}

for (const catalogFields of ['{', '[]', 'null']) {
  test(`catalog rejects invalid field maps: ${catalogFields}`, async () => {
    const h = context({ resource: 'catalogItem', operation: 'create', catalogFields });
    await assert.rejects(h.execute(), /JSON/);
    h.done();
  });
}
for (const operation of ['get', 'update', 'delete']) {
  test(`catalog ${operation} rejects invalid UUID before networking`, async () => {
    const h = context({ resource: 'catalogItem', operation, catalogItemId: 'bad', catalogFields: '{}' });
    await assert.rejects(h.execute(), /UUID/);
    h.done();
  });
}
for (const operation of ['get', 'getAll', 'create', 'update', 'delete']) {
  test(`catalog ${operation} surfaces feature and permission errors with continue-on-fail`, async () => {
    const h = context({ resource: 'catalogItem', operation, catalogItemId: UUID, catalogFields: '{}' }, [
      { method: ({ create: 'POST', update: 'PUT', delete: 'DELETE' })[operation] ?? 'GET',
        path: operation === 'getAll' ? `${P}/catalog-items` : operation === 'create' ? `${P}/catalog-item` : `${P}/catalog-item/${UUID}`,
        error: { statusCode: 403, message: 'Feature is inactive' } },
    ], { continueOnFail: true });
    assert.match((await h.execute())[0][0].json.error, /Forbidden/);
    h.done();
  });
}

const taskInputs = { resource: 'task', title: 'Inspect', deadline: '2026-10-20', assignees: [OTHER_UUID], referenceAssetUuid: UUID };
for (const [reminderMode, reminders] of [['none', []], ['default', undefined], ['custom', [{ unit: 'days', value: 0 }]]]) {
  test(`task create reminder mode ${reminderMode}`, async () => {
    const h = context({ ...taskInputs, operation: 'create', reminderMode, reminderValue: 0 }, [
      { method: 'POST', path: `${P}/task-management/task`, check: (r) => {
        assert.deepEqual(r.body.reminders, reminders);
        assert.equal(Object.hasOwn(r.body, 'reminders'), reminderMode !== 'default');
      }, response: { body: { uuid: UUID } } },
      { path: `${P}/task-management/task/${UUID}`, response: { uuid: UUID } },
    ]);
    await h.execute();
    h.done();
  });
}

for (const reminders of [undefined, [], [{ unit: 'weeks', value: 0 }]]) {
  test(`task update preserves reminders ${JSON.stringify(reminders)} and attachment UUIDs`, async () => {
    const existing = { ...taskInputs, reminders, attachments: [{ uuid: OTHER_UUID }], references: [{ type: 'asset', uuid: UUID }] };
    const h = context({ ...taskInputs, operation: 'update', taskId: UUID, additionalFields: { comment: 'Edit' } }, [
      { path: `${P}/task-management/task/${UUID}`, response: existing },
      { method: 'PUT', path: `${P}/task-management/task/${UUID}`, check: (r) => {
        assert.deepEqual(r.body.reminders, reminders);
        assert.equal(Object.hasOwn(r.body, 'reminders'), reminders !== undefined);
        assert.deepEqual(r.body.attachments, [OTHER_UUID]);
      }, response: {} },
      { path: `${P}/task-management/task/${UUID}`, response: existing },
    ]);
    await h.execute();
    h.done();
  });
}
test('task update can explicitly disable existing reminders', async () => {
  const h = context({ resource: 'task', operation: 'update', taskId: UUID, additionalFields: { reminderMode: 'none' } }, [
    { path: `${P}/task-management/task/${UUID}`, response: { reminders: [{ unit: 'days', value: 1 }] } },
    { method: 'PUT', path: `${P}/task-management/task/${UUID}`, check: (r) => assert.deepEqual(r.body.reminders, []), response: {} },
    { path: `${P}/task-management/task/${UUID}`, response: { reminders: [] } },
  ]);
  await h.execute();
  h.done();
});

const rentalInputs = { resource: 'rentalCase', title: 'Timed rental', renterValue: 'Customer', referenceAssetUuid: UUID,
  issueDate: '2026-10-20', dueDate: '2026-10-21', responsibleUserUuid: OTHER_UUID, comment: '' };
const issueAt = '2026-10-20T10:00:00+02:00';
const dueAt = '2026-10-20T12:00:00+02:00';
test('timed rental create retains offsets, explicit false and disabled reminders', async () => {
  const h = context({ ...rentalInputs, operation: 'create', rentalTiming: { isFullDay: false, issueAt, dueAt, disableIssueReminder: true, disableDueReminder: true } }, [
    { method: 'POST', path: `${P}/rental-management/rental-case`, check: (r) => {
      assert.equal(r.body.is_full_day, false);
      assert.equal(r.body.issue_at, issueAt);
      assert.equal(r.body.due_at, dueAt);
      assert.equal(r.body.issue_date_reminder, null);
      assert.equal(r.body.due_date_reminder, null);
    }, response: { body: { uuid: UUID } } },
    { path: `${P}/rental-management/rental-case/${UUID}`, response: { uuid: UUID, is_full_day: false, issue_at: issueAt, due_at: dueAt } },
  ]);
  const [[item]] = await h.execute();
  assert.equal(item.json.issue_at, issueAt);
  h.done();
});
for (const rentalTiming of [{ isFullDay: false }, { issueAt }, { issueAt, dueAt: issueAt }, { issueAt: '2026-10-20T10:00:00', dueAt }]) {
  test(`rental rejects invalid timed inputs before networking: ${JSON.stringify(rentalTiming)}`, async () => {
    const h = context({ ...rentalInputs, operation: 'create', rentalTiming });
    await assert.rejects(h.execute(), /Timed rentals/);
    h.done();
  });
}
test('rental create rejects missing renter locally', async () => {
  const h = context({ ...rentalInputs, operation: 'create', renterValue: '' });
  await assert.rejects(h.execute(), /renter value is required/);
  h.done();
});

for (const updateFields of [{ title: 'Edited' }, { issueDate: '2026-10-22', dueDate: '2026-10-23' }, { isFullDay: true }, { issueAt: '2026-10-20T09:00:00+02:00' }]) {
  test(`rental PUT preserves attachments, status, nullable reminders and timing semantics: ${JSON.stringify(updateFields)}`, async () => {
    const existing = { uuid: UUID, title: 'Loan', renter: { type: 'plain', value: 'Customer' },
      issue_date: '2026-10-20', due_date: '2026-10-20', is_full_day: false, issue_at: issueAt, due_at: dueAt,
      issue_date_reminder: null, due_date_reminder: null, attachments: [{ uuid: OTHER_UUID }], status: 'borrowed' };
    const h = context({ resource: 'rentalCase', operation: 'update', rentalCaseId: UUID, updateFields }, [
      { path: `${P}/rental-management/rental-case/${UUID}`, response: existing },
      { method: 'PUT', path: `${P}/rental-management/rental-case/${UUID}`, check: (r) => {
        assert.deepEqual(r.body.attachments, [OTHER_UUID]);
        assert.equal(r.body.status, 'borrowed');
        assert.equal(r.body.issue_date_reminder, null);
        if (updateFields.isFullDay === true) assert.equal(r.body.is_full_day, true);
        else if (updateFields.issueAt) {
          assert.equal(r.body.is_full_day, false);
          assert.equal(r.body.issue_at, updateFields.issueAt);
          assert.equal(r.body.due_at, dueAt);
        } else {
          assert.equal(Object.hasOwn(r.body, 'issue_at'), false);
          assert.equal(Object.hasOwn(r.body, 'is_full_day'), false);
        }
      }, response: {} },
      { path: `${P}/rental-management/rental-case/${UUID}`, response: existing },
    ]);
    await h.execute();
    h.done();
  });
}

for (const thumbnailSize of [{ width: 0, height: 10 }, { width: 10 }, { width: 10, height: 2001 }, { width: 1.5, height: 10 }]) {
  test(`thumbnail rejects invalid dimensions before requesting metadata: ${JSON.stringify(thumbnailSize)}`, async () => {
    const h = context({ resource: 'file', operation: 'downloadThumbnail', fileId: UUID, thumbnailSize });
    await assert.rejects(h.execute(), /width and height/);
    h.done();
  });
}
test('thumbnail passes both dimensions while retaining binary output', async () => {
  const h = context({ resource: 'file', operation: 'downloadThumbnail', fileId: UUID, thumbnailSize: { width: 320, height: 240 } }, [
    { path: `${P}/file/${UUID}`, response: { uuid: UUID, name: 'photo.jpg' } },
    { path: `${P}/file/${UUID}/thumbnail`, check: (r) => assert.deepEqual(r.qs, { width: 320, height: 240 }), response: { body: Buffer.from('image'), headers: { 'content-type': 'image/jpeg' } } },
  ], { helpers: { prepareBinaryData: async (buffer) => ({ data: buffer.toString('base64') }) } });
  assert.equal((await h.execute())[0][0].binary.data.data, Buffer.from('image').toString('base64'));
  h.done();
});

test('Retry-After accepts seconds and HTTP dates, clamps past dates and rejects malformed/repeated values', () => {
  const now = Date.parse('2026-10-18T10:00:00Z');
  assert.equal(retryAfterMilliseconds({ 'Retry-After': '12' }, now), 12000);
  assert.equal(retryAfterMilliseconds({ 'retry-after': 'Sun, 18 Oct 2026 10:00:30 GMT' }, now), 30000);
  assert.equal(retryAfterMilliseconds({ 'retry-after': 'Sun, 18 Oct 2026 09:00:00 GMT' }, now), 0);
  for (const value of ['', '-1', '1.5', '1, 2', ['1'], '999999999999999999999', '2026-10-18', 'garbage']) {
    assert.equal(retryAfterMilliseconds({ 'retry-after': value }, now), undefined);
  }
  assert.equal(retryAfterMilliseconds({ 'Retry-After': '1', 'retry-after': '2' }), undefined);
});
for (const headers of [{ 'Retry-After': '30' }, { 'retry-after': 'invalid' }, {}]) {
  test(`429 surfaces actionable retry information without replaying a write: ${JSON.stringify(headers)}`, async () => {
    const h = context({}, [{ method: 'POST', path: '/test', error: { statusCode: 429, headers, message: 'Limit' } }]);
    await assert.rejects(seventhingsApiRequest.call(h.ctx, { path: '/test', method: 'POST', body: {} }), (error) => {
      assert.equal(error.httpCode, '429');
      assert.match(error.description, /not retried/);
      if (headers['Retry-After']) assert.match(error.description, /30 seconds/);
      return true;
    });
    assert.equal(h.requests.length, 1);
    h.done();
  });
}
test('action execution retains Retry-After details and status through error wrapping', async () => {
  const h = context({ resource: 'catalogItem', operation: 'get', catalogItemId: UUID }, [
    { path: `${P}/catalog-item/${UUID}`, error: { response: { status: 429, headers: { 'retry-after': '30' } }, message: 'Limit' } },
  ]);
  await assert.rejects(h.execute(), (error) => {
    assert.equal(error.httpCode, '429');
    assert.match(error.description, /30 seconds/);
    return true;
  });
  h.done();
});

test('rate limiter defaults to 200 RPM, spaces concurrent calls FIFO and shares a connection across contexts', async () => {
  assert.equal(new SeventhingsApi().properties.find((p) => p.name === 'requestsPerMinute').default, 200);
  const credentials = { subdomain: 'fifo-test', username: 'user', clientId: 'client', requestsPerMinute: 3000 };
  const order = [];
  const starts = [];
  await Promise.all([0, 1, 2, 3].map(async (i) => {
    await waitForRateLimit({ ...credentials });
    order.push(i);
    starts.push(Date.now());
  }));
  assert.deepEqual(order, [0, 1, 2, 3]);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 18);
});
test('password login and bearer injection share the same throttle, including credential tests', async () => {
  const credential = new SeventhingsApi();
  const credentials = { subdomain: 'auth-rate-test', username: 'user@example.com', clientId: 'client', password: 'unused', requestsPerMinute: 3000 };
  let loginAt;
  const session = await credential.preAuthentication.call({ helpers: { httpRequest: async () => {
    loginAt = Date.now();
    return { access_token: 'token' };
  } } }, credentials);
  const request = await credential.authenticate({ ...credentials, ...session }, { url: '/test' });
  assert.equal(request.headers.Authorization, 'Bearer token');
  assert.ok(Date.now() - loginAt >= 18, 'The first API call must not burst immediately after login');
});
test('transport forwards execution cancellation so no network request is sent after cancellation', async () => {
  const controller = new AbortController();
  controller.abort(new Error('canceled'));
  const h = context({}, [], { credentials: { requestsPerMinute: 200 } });
  h.ctx.getExecutionCancelSignal = () => controller.signal;
  await assert.rejects(seventhingsApiRequest.call(h.ctx, { path: '/test' }));
  h.done();
  assert.equal(h.requests.length, 0);
});
test('canceled queue waiters reject promptly without consuming a slot or blocking later requests', async () => {
  const credentials = { subdomain: 'cancel-test', requestsPerMinute: 600 };
  await waitForRateLimit(credentials);
  const head = new AbortController();
  const middle = new AbortController();
  const first = waitForRateLimit(credentials, head.signal);
  const second = waitForRateLimit(credentials, middle.signal);
  const last = waitForRateLimit(credentials);
  const rejected = [assert.rejects(first, /canceled/), assert.rejects(second, /canceled/)];
  middle.abort(new Error('canceled'));
  head.abort(new Error('canceled'));
  await Promise.all(rejected);
  await last;
});
test('disabled limiting is immediate and invalid settings fail before HTTP', async () => {
  await Promise.all(Array.from({ length: 30 }, () => waitForRateLimit({ requestsPerMinute: 0 })));
  for (const requestsPerMinute of [-1, 1.5, NaN, '200']) {
    const h = context({}, [], { credentials: { requestsPerMinute } });
    await assert.rejects(seventhingsApiRequest.call(h.ctx, { path: '/test' }), /Requests Per Minute/);
    h.done();
  }
});
