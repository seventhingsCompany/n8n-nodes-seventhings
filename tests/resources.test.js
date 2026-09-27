const assert = require('node:assert/strict');
const { test } = require('node:test');
const { context, UUID } = require('./context');

const resources = [
  ['asset', 'assetId', '/object', '/objects'],
  ['task', 'taskId', '/task-management/task', '/task-management/tasks'],
  ['rentalCase', 'rentalCaseId', '/rental-management/rental-case', '/rental-management/rental-cases'],
  ['location', 'locationId', '/location', '/locations'],
  ['room', 'roomId', '/room', '/rooms'],
  ['person', 'personId', '/person', '/persons'],
  ['user', 'userId', '/user', '/users'],
  ['file', 'fileId', '/file', '/files'],
  ['fieldDefinition', 'fieldDefinitionId', '/asset-tracking/asset/field-definition', '/asset-tracking/asset/field-definitions'],
  ['circularityHubItem', 'id', '/circularity-hub/item', '/circularity-hub/items'],
  ['circularityHubOrder', 'id', '/circularity-hub/order', '/circularity-hub/orders'],
];
const prefix = '/customer-api/v1';
const record = { uuid: UUID, id: 7, title: 'Test', created_at: '2026-01-01 10:00:00', custom: false };

for (const [resource, parameter, single, list] of resources) {
  const id = parameter === 'id' ? 7 : UUID;
  test(`${resource}: get uses the correct endpoint and preserves payload and item linking`, async () => {
    const h = context({ resource, operation: 'get', [parameter]: parameter === 'id' ? id : { value: id } }, [{ path: `${prefix}${single}/${id}`, response: record }]);
    const [[item]] = await h.execute();
    assert.equal(item.json.custom, false);
    assert.deepEqual(item.pairedItem, { item: 0 });
    h.done();
  });

  test(`${resource}: getAll unwraps API lists and handles empty results`, async () => {
    for (const items of [[record], []]) {
      const response = ['task', 'fieldDefinition'].includes(resource) ? items : { items };
      const h = context({ resource, operation: 'getAll', limit: 1 }, [{ path: prefix + list, response }]);
      const [output] = await h.execute();
      assert.equal(output.length, items.length);
      if (items.length) assert.deepEqual(output[0].pairedItem, { item: 0 });
      h.done();
    }
  });

  test(`${resource}: get rejects invalid identifiers before requesting`, async () => {
    const h = context({ resource, operation: 'get', [parameter]: parameter === 'id' ? -1 : '' });
    await assert.rejects(h.execute(), /required/i);
    assert.equal(h.requests.length, 0);
  });

  for (const operation of ['get', 'getAll']) {
    test(`${resource}: ${operation} propagates API errors instead of empty success`, async () => {
      const h = context({ resource, operation, [parameter]: id }, [{
        path: operation === 'get' ? `${prefix}${single}/${id}` : prefix + list,
        error: { statusCode: 403, message: 'Permission denied' },
      }]);
      await assert.rejects(h.execute(), /Permission denied|Forbidden|authorization/i);
      h.done();
    });
  }

  if (!['user', 'file', 'fieldDefinition', 'circularityHubOrder'].includes(resource)) {
    test(`${resource}: delete sends DELETE and returns confirmation`, async () => {
      const h = context({ resource, operation: 'delete', [parameter]: id }, [{ method: 'DELETE', path: `${prefix}${single}/${id}`, response: '' }]);
      const [[item]] = await h.execute();
      assert.equal(item.json.deleted, true);
      h.done();
    });
  }

  if (!['task', 'file', 'fieldDefinition'].includes(resource)) {
    test(`${resource}: Return All follows pages`, async () => {
      const first = Array.from({ length: 100 }, (_, id) => ({ ...record, id }));
      const h = context({ resource, operation: 'getAll', returnAll: true }, [
        { path: prefix + list, check: (r) => assert.equal(r.qs.page, 1), response: { items: first, total: 101 } },
        { path: prefix + list, check: (r) => assert.equal(r.qs.page, 2), response: { items: [{ ...record, id: 100 }], total: 101 } },
      ]);
      const [output] = await h.execute();
      assert.equal(output.length, 101);
      h.done();
    });

    test(`${resource}: a limit spanning pages returns exactly the requested count`, async () => {
      const page = Array.from({ length: 100 }, (_, id) => ({ ...record, id }));
      const h = context({ resource, operation: 'getAll', returnAll: false, limit: 101 }, [
        { path: prefix + list, response: { items: page } },
        { path: prefix + list, response: { items: page.map((item) => ({ ...item, id: item.id + 100 })) } },
      ]);
      assert.equal((await h.execute())[0].length, 101);
      h.done();
    });
  }
}

test('execute processes multiple inputs and retains per-item errors with continueOnFail', async () => {
  const h = context([
    { resource: 'asset', operation: 'get', assetId: 'invalid' },
    { resource: 'asset', operation: 'get', assetId: UUID },
  ], [{ path: `${prefix}/object/${UUID}`, response: record }], { continueOnFail: true });
  const [items] = await h.execute();
  assert.match(items[0].json.error, /valid Asset UUID/);
  assert.deepEqual(items.map((item) => item.pairedItem), [{ item: 0 }, { item: 1 }]);
  assert.equal(items[1].json.id, 7);
  h.done();
});

test('execute stops on failure by default and rejects unsupported operations', async () => {
  const h = context({ resource: 'asset', operation: 'unknown' });
  await assert.rejects(h.execute(), /not implemented/);
});
