const assert = require('node:assert/strict');
const { test } = require('node:test');
const { context, UUID, OTHER_UUID } = require('./context');
const { Seventhings } = require('../dist/nodes/Seventhings/Seventhings.node');
const { normalizePerson } = require('../dist/nodes/Seventhings/transport');

// Contracts from SDK v1.4.0 and API v0.19571_89862c247_20260915.
const P = '/customer-api/v1';
const historyResources = [
  ['asset', 'object'],
  ['room', 'room'],
  ['location', 'location'],
  ['person', 'person'],
  ['task', 'task-management/task'],
  ['rentalCase', 'rental-management/rental-case'],
];

for (const barcode of ['INV/100 ?#%', '00100', ' leading and trailing ', 'Ä-椅子']) {
  test(`barcode lookup encodes the raw scancode once: ${barcode}`, async () => {
    const h = context({ resource: 'asset', operation: 'getByBarcode', barcode }, [{
      path: `${P}/object/by-barcode/${encodeURIComponent(barcode)}`,
      check: (r) => assert.equal(r.qs, undefined),
      response: { uuid: UUID, archived: true, scancode: barcode, custom: { colour: 'green' } },
    }]);
    const [[item]] = await h.execute();
    assert.equal(item.json.uuid, UUID);
    assert.equal(item.json.archived, true);
    assert.equal(item.json.scancode, barcode);
    assert.deepEqual(item.json.custom, { colour: 'green' });
    assert.deepEqual(item.pairedItem, { item: 0 });
    h.done();
  });
}

test('barcode lookup rejects empty input before requesting the API', async () => {
  const h = context({ resource: 'asset', operation: 'getByBarcode', barcode: '' });
  await assert.rejects(h.execute(), /barcode is required/);
  assert.equal(h.requests.length, 0);
});

for (const [resource, path] of historyResources) {
  test(`${resource} history returns unmodified events, newest first, linked to each input`, async () => {
    const event = resource === 'asset'
      ? { type: 'object_merge', user_id: 42, absorbedObjectData: { uuid: OTHER_UUID, custom: 'value' } }
      : { event_name: 'updated', occurred_at: '2026-09-15 12:00:00', details: '{"custom":"value"}', user_uuid: OTHER_UUID };
    const parameters = { resource, operation: 'getHistory', [`${resource}Id`]: { mode: 'id', value: UUID }, limit: 2 };
    const h = context([parameters, parameters], [0, 1].map(() => ({
      path: `${P}/${path}/${UUID}/history`,
      check: (r) => assert.deepEqual(r.qs, { page: 1, per_page: 2 }),
      response: { items: [event, { ...event, event_name: 'created' }], page: 1, per_page: 2, total: 10 },
    })));
    const [items] = await h.execute();
    assert.equal(items.length, 4);
    assert.deepEqual(items[0].json, event);
    assert.equal(items[1].json.event_name, 'created');
    assert.deepEqual(items.map((item) => item.pairedItem), [{ item: 0 }, { item: 0 }, { item: 1 }, { item: 1 }]);
    h.done();
  });

  test(`${resource} history handles records without changes`, async () => {
    const h = context({ resource, operation: 'getHistory', [`${resource}Id`]: UUID, returnAll: true }, [{
      path: `${P}/${path}/${UUID}/history`, response: { items: [], total: 0 },
    }]);
    assert.deepEqual(await h.execute(), [[]]);
    h.done();
  });

  test(`${resource} history validates UUID before HTTP`, async () => {
    const h = context({ resource, operation: 'getHistory', [`${resource}Id`]: 'not-a-uuid' });
    await assert.rejects(h.execute(), /UUID is required/);
    assert.equal(h.requests.length, 0);
  });
}

for (const returnAll of [true, false]) {
  test(`history paginates within the API cap and respects ${returnAll ? 'total' : 'limit'}`, async () => {
    const events = Array.from({ length: 100 }, (_, n) => ({ event_name: `event-${200 - n}` }));
    const h = context({ resource: 'asset', operation: 'getHistory', assetId: UUID, returnAll, limit: 105 }, [1, 2].map((page) => ({
      path: `${P}/object/${UUID}/history`,
      check: (r) => assert.deepEqual(r.qs, { page, per_page: 100 }),
      response: { items: events, page, per_page: 100, total: 200 },
    })));
    const [items] = await h.execute();
    assert.equal(items.length, returnAll ? 200 : 105);
    h.done();
  });
}

test('history stops on a short page without total metadata', async () => {
  const h = context({ resource: 'task', operation: 'getHistory', taskId: UUID, returnAll: true }, [{
    path: `${P}/task-management/task/${UUID}/history`, response: { items: [{ event_name: 'created' }] },
  }]);
  assert.equal((await h.execute())[0].length, 1);
  h.done();
});

for (const limit of [0, -1, 1.5, NaN]) {
  test(`history rejects invalid limit ${limit}`, async () => {
    const h = context({ resource: 'asset', operation: 'getHistory', assetId: UUID, limit });
    await assert.rejects(h.execute(), /positive integer/);
    assert.equal(h.requests.length, 0);
  });
}

for (const [resource, operation, parameters, path, statusCode, message] of [
  ['asset', 'getByBarcode', { barcode: 'missing' }, 'object/by-barcode/missing', 404, 'not found'],
  ['rentalCase', 'getHistory', { rentalCaseId: UUID }, `rental-management/rental-case/${UUID}/history`, 403, 'Feature is inactive'],
  ['person', 'getHistory', { personId: UUID }, `person/${UUID}/history`, 403, 'permission denied'],
]) {
  test(`${resource} ${operation} surfaces ${message} and supports continue-on-fail`, async () => {
    for (const continueOnFail of [false, true]) {
      const h = context({ resource, operation, ...parameters }, [{
        path: `${P}/${path}`, error: { statusCode, message },
      }], { continueOnFail });
      if (continueOnFail) {
        const [[item]] = await h.execute();
        assert.equal(typeof item.json.error, 'string');
        assert.deepEqual(item.pairedItem, { item: 0 });
      } else {
        await assert.rejects(h.execute());
      }
      h.done();
    }
  });
}

const templates = [{ uuid: UUID, name: 'Inventory list' }, { uuid: OTHER_UUID, name: 'Handover' }];
for (const returnAll of [true, false]) {
  test(`report template listing handles the API's bare array (returnAll=${returnAll})`, async () => {
    const h = context({ resource: 'report', operation: 'getTemplates', returnAll, limit: 1 }, [{
      path: `${P}/report-template`, response: templates,
    }]);
    const [items] = await h.execute();
    assert.deepEqual(items.map((item) => item.json), returnAll ? templates : templates.slice(0, 1));
    assert.deepEqual(items[0].pairedItem, { item: 0 });
    h.done();
  });
}

test('report templates support empty results and searchable name/UUID selection', async () => {
  const empty = context({ resource: 'report', operation: 'getTemplates' }, [{ path: `${P}/report-template`, response: [] }]);
  assert.deepEqual(await empty.execute(), [[]]);
  empty.done();
  for (const filter of ['HANDOVER', OTHER_UUID]) {
    const h = context({}, [{ path: `${P}/report-template`, response: templates }]);
    const result = await new Seventhings().methods.listSearch.searchReportTemplates.call(h.ctx, filter);
    assert.deepEqual(result, { results: [{ name: 'Handover', value: OTHER_UUID }] });
    h.done();
  }
});

for (const assetUuids of [`${OTHER_UUID}, ${UUID}, ${OTHER_UUID}`, [OTHER_UUID, UUID, OTHER_UUID]]) {
  test(`PDF report preserves ordered assets and raw bytes (${typeof assetUuids})`, async () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from([0, 128, 255, 10])]);
    const parameters = { resource: 'report', operation: 'create', reportTemplateId: { mode: 'list', value: UUID }, assetUuids, binaryPropertyName: 'document', fileName: 'inventory.pdf' };
    const h = context([parameters, parameters], [0, 1].map(() => ({
      method: 'POST', path: `${P}/report`, accept: 'application/pdf',
      check: (r) => {
        assert.equal(r.headers['Content-Type'], 'application/json');
        assert.equal(r.json, false);
        assert.equal(r.encoding, 'arraybuffer');
        assert.equal(typeof r.body, 'string');
        assert.deepEqual(JSON.parse(r.body), { report_template_uuid: UUID, object_uuids: [OTHER_UUID, UUID, OTHER_UUID] });
      },
      response: pdf,
    })), { helpers: {
      async prepareBinaryData(buffer, fileName, mimeType) {
        assert.deepEqual(buffer, pdf);
        assert.equal(fileName, 'inventory.pdf');
        assert.equal(mimeType, 'application/pdf');
        return { data: buffer.toString('base64'), fileName, mimeType };
      },
    } });
    const [items] = await h.execute();
    assert.equal(items.length, 2);
    for (const [i, item] of items.entries()) {
      assert.deepEqual(item.json.object_uuids, [OTHER_UUID, UUID, OTHER_UUID]);
      assert.deepEqual(Buffer.from(item.binary.document.data, 'base64'), pdf);
      assert.deepEqual(item.pairedItem, { item: i });
    }
    h.done();
  });
}

for (const overrides of [
  { reportTemplateId: 'bad' }, { assetUuids: '' }, { assetUuids: [] },
  { assetUuids: [UUID, 'bad'] }, { assetUuids: `${UUID},` }, { binaryPropertyName: ' ' },
]) {
  test(`report validates inputs before HTTP: ${JSON.stringify(overrides)}`, async () => {
    const h = context({ resource: 'report', operation: 'create', reportTemplateId: UUID, assetUuids: UUID, ...overrides });
    await assert.rejects(h.execute());
    assert.equal(h.requests.length, 0);
  });
}

test('PDF API failures produce an error item rather than a binary document', async () => {
  const h = context({ resource: 'report', operation: 'create', reportTemplateId: UUID, assetUuids: UUID }, [{
    method: 'POST', path: `${P}/report`, accept: 'application/pdf', error: { statusCode: 404, message: 'Template not found' },
  }], { continueOnFail: true });
  const [[item]] = await h.execute();
  assert.equal(typeof item.json.error, 'string');
  assert.equal(item.binary, undefined);
  h.done();
});

for (const [order, expected] of [['asc', 'ASC'], ['desc', 'DESC'], [undefined, 'ASC']]) {
  test(`persons sorting uses the deep-object API query (${order})`, async () => {
    const h = context({ resource: 'person', operation: 'getAll', options: { sortBy: 'email', order } }, [{
      path: `${P}/persons`,
      check: (r) => assert.deepEqual(r.qs, { 'sort[email]': expected, page: 1, per_page: 50 }),
      response: { items: [{ uuid: UUID, fields: { email: 'person@example.com', custom: 'preserved' } }], total: 1 },
    }]);
    const [[item]] = await h.execute();
    assert.equal(item.json.custom, 'preserved');
    assert.equal(item.json.person_uuid, UUID);
    h.done();
  });
}

test('person UUID compatibility prefers non-empty legacy IDs and falls back to uuid', () => {
  const fields = { custom: 'preserved', attachments: [{ uuid: OTHER_UUID }] };
  for (const record of [{ ...fields }, { fields }]) {
    assert.equal(normalizePerson({ ...record, person_uuid: OTHER_UUID, uuid: UUID }).uuid, OTHER_UUID);
    const normalized = normalizePerson({ ...record, person_uuid: '', uuid: UUID });
    assert.equal(normalized.uuid, UUID);
    assert.equal(normalized.person_uuid, UUID);
    assert.deepEqual(normalized.attachments, fields.attachments);
    assert.equal(normalized.custom, 'preserved');
  }
  assert.equal(normalizePerson({ person_uuid: '', uuid: '' }, UUID).uuid, UUID);
});
