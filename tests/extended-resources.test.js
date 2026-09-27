const assert = require('node:assert/strict');
const { test } = require('node:test');
const { context, UUID } = require('./context');
const P = '/customer-api/v1';

for (const resource of ['person', 'user']) {
  test(`${resource}: getById uses the numeric lookup endpoint`, async () => {
    const h = context({ resource, operation: 'getById', [`${resource}NumericId`]: 42 }, [{ path: `${P}/${resource}/by-id/42`, response: { uuid: UUID, id: 42 } }]);
    assert.equal((await h.execute())[0][0].json.uuid, UUID);
    h.done();
  });
}

test('person createUser requires a filter and sends the nested API filter', async () => {
  const invalid = context({ resource: 'person', operation: 'createUser' });
  await assert.rejects(invalid.execute(), /at least one filter/);
  const h = context({ resource: 'person', operation: 'createUser', filterRows: { filters: [{ field: 'email', operator: 'eq', values: 'user@example.com' }] } }, [{
    method: 'POST', path: `${P}/persons/create-user`, check: (r) => assert.deepEqual(r.body, { filter: { email: { eq: 'user@example.com' } } }), response: '',
  }]);
  assert.equal((await h.execute())[0][0].json.created, true);
  h.done();
});

for (const kind of ['Item', 'Order']) {
  test(`Circularity Hub ${kind}: update parses JSON and PATCHes then fetches`, async () => {
    const path = `${P}/circularity-hub/${kind.toLowerCase()}/7`;
    const h = context({ resource: `circularityHub${kind}`, operation: 'update', id: 7, fields: '{"price":0}' }, [
      { method: 'PATCH', path, check: (r) => assert.deepEqual(r.body, { price: 0 }), response: '' },
      { path, response: { id: 7, price: 0 } },
    ]);
    assert.equal((await h.execute())[0][0].json.price, 0);
    h.done();
  });
  for (const fields of ['[]', 'null', '{invalid']) {
    test(`Circularity Hub ${kind}: rejects invalid object JSON ${fields}`, async () => {
      await assert.rejects(context({ resource: `circularityHub${kind}`, operation: 'update', id: 7, fields }).execute());
    });
  }
}

test('Circularity Hub create order sends integer IDs and follows Location-Id', async () => {
  const h = context({ resource: 'circularityHubOrder', operation: 'create', itemIds: ['7', '8'] }, [
    { method: 'POST', path: `${P}/circularity-hub/orders`, check: (r) => assert.deepEqual(r.body, [7, 8]), response: { headers: { 'Location-Id': '12' } } },
    { path: `${P}/circularity-hub/order/12`, response: { id: 12 } },
  ]);
  assert.equal((await h.execute())[0][0].json.id, 12);
  h.done();
});

test('Circularity Hub addObjects keeps zero prices and uses UUID-keyed payloads', async () => {
  const h = context({ resource: 'circularityHubItem', operation: 'addObjects', objects: { entries: [{ assetUuid: UUID, category: 'Furniture', price: 0 }] } }, [{
    method: 'POST', path: `${P}/circularity-hub/add-objects-to-circularity-hub`, check: (r) => assert.deepEqual(r.body, { [UUID]: { category: 'Furniture', price: '0' } }), response: '',
  }]);
  assert.equal((await h.execute())[0][0].json.added, true);
  h.done();
});

for (const [operation, suffix] of [['suggestCategory', 'suggest-category'], ['suggestRestPrice', 'suggest-rest-price']]) {
  test(`Circularity Hub ${operation} converts empty suggestions to valid n8n JSON`, async () => {
    const h = context({ resource: 'circularityHubItem', operation }, [{ method: 'POST', path: `${P}/circularity-hub/${suffix}`, response: [] }]);
    assert.deepEqual((await h.execute())[0][0].json, { result: null });
    h.done();
  });
}

for (const template of ['asset', 'room', 'person']) {
  for (const operation of ['create', 'update']) {
    test(`field definition ${template} ${operation} builds the strict schema and fetches the result`, async () => {
      const path = `${P}/asset-tracking/${template}/field-definition`;
      const h = context({ resource: 'fieldDefinition', operation, template, fieldDefinitionId: UUID, fieldKey: 'enabled', fieldTypeName: 'BOOLEAN', label: 'Enabled', defaultValue: 'false' }, [
        { method: operation === 'create' ? 'POST' : 'PUT', path: operation === 'create' ? path : `${path}/${UUID}`, check: (r) => {
          assert.deepEqual(r.body, {
            field_type: { name: 'BOOLEAN', constraints: [] }, label: 'Enabled', attributes: [], relations: [], comment: null, default_value: false, possible_values: [],
            ...(operation === 'update' ? { uuid: UUID, field_key: 'enabled' } : {}),
          });
        }, response: { headers: { Location: `${path}/${UUID}` } } },
        { path: `${path}/${UUID}`, response: { uuid: UUID, label: 'Enabled' } },
      ]);
      assert.equal((await h.execute())[0][0].json.label, 'Enabled');
      h.done();
    });
  }
}

for (const [name, value] of [['constraints', '{}'], ['possibleValues', 'bad-json'], ['attributes', 'false'], ['relations', 'null'], ['defaultValue', 'bad-json']]) {
  test(`field definition rejects invalid ${name} before writing`, async () => {
    await assert.rejects(context({ resource: 'fieldDefinition', operation: 'create', fieldTypeName: 'TEXT', label: 'Label', [name]: value }).execute());
  });
}
