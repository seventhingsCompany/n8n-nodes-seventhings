const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Seventhings } = require('../dist/nodes/Seventhings/Seventhings.node');
const transport = require('../dist/nodes/Seventhings/transport');
const { context, UUID, OTHER_UUID } = require('./context');
const node = new Seventhings();

test('all UI dropdown and resource mapper methods are registered', () => {
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.loadOptionsMethod) assert.equal(typeof node.methods.loadOptions[value.loadOptionsMethod], 'function', value.loadOptionsMethod);
    if (value.searchListMethod) assert.equal(typeof node.methods.listSearch[value.searchListMethod], 'function', value.searchListMethod);
    if (value.resourceMapperMethod) assert.equal(typeof node.methods.resourceMapping[value.resourceMapperMethod], 'function', value.resourceMapperMethod);
    for (const child of Object.values(value)) visit(child);
  }
  visit(node.description.properties);
});

for (const [template, method] of [['asset', 'getAssetFields'], ['room', 'getRoomFields'], ['person', 'getPersonFields']]) {
  test(`${template}: dynamic mapper converts field types and dropdown choices`, async () => {
    const defs = [
      { field_key: 'count', field_type: { name: 'NUMBER' } },
      { field_key: 'active', field_type: { name: 'BOOLEAN' } },
      { field_key: 'date', field_type: { name: 'DATE' } },
      { field_key: 'choice', label: 'Choice', field_type: { name: 'DROPDOWN' }, possible_values: ['A', 0] },
      { label: 'No key' },
    ];
    const h = context({}, [{ path: `/customer-api/v1/asset-tracking/${template}/field-definitions`, response: defs.map((def) => ({ ...def, attributes: [{ type: 'editable', value: 'web_app' }] })) }]);
    const result = await node.methods.resourceMapping[method].call(h.ctx);
    assert.deepEqual(result.fields.map((f) => [f.id, f.type]), [['count', 'number'], ['active', 'boolean'], ['date', 'dateTime'], ['choice', 'options']]);
    assert.deepEqual(result.fields[3].options, [{ name: 'A', value: 'A' }, { name: '0', value: '0' }]);
    h.done();
  });
}

test('asset attachment dropdown excludes non-attachment and malformed definitions', async () => {
  const h = context({}, [{ path: '/customer-api/v1/asset-tracking/asset/field-definitions', response: [
    { field_key: 'docs', label: 'Documents', field_type: { name: 'ATTACHMENT' } },
    { field_key: 'title', field_type: { name: 'TEXT' } }, { field_type: { name: 'ATTACHMENT' } },
  ] }]);
  assert.deepEqual(await node.methods.loadOptions.getAttachmentFieldKeys.call(h.ctx), [{ name: 'Documents', value: 'docs' }]);
  h.done();
});

for (const [method, path, wrapped] of [
  ['searchAssets', '/objects', true], ['searchTasks', '/task-management/tasks', false],
  ['searchRentalCases', '/rental-management/rental-cases', true], ['searchPersons', '/persons', true],
]) {
  test(`${method}: filters labels case-insensitively and drops records without IDs`, async () => {
    const items = [{ uuid: UUID, name: 'Desk', title: 'Desk', first_name: 'Desk' }, { uuid: OTHER_UUID, name: 'Other', title: 'Other', first_name: 'Other' }, { title: 'Desk' }];
    const h = context({}, [{ path: '/customer-api/v1' + path, response: wrapped ? { items } : items }]);
    const result = await node.methods.listSearch[method].call(h.ctx, 'DESK');
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].value, UUID);
    h.done();
  });
}

test('field coercion preserves false and zero and ignores blank inputs', () => {
  const defs = [{ field_key: 'active', field_type: { name: 'BOOLEAN' } }, { field_key: 'count', field_type: { name: 'NUMBER' } }];
  assert.deepEqual(transport.coerceFieldValues(defs, { active: 'false', count: '0', blank: '', missing: null }), { active: false, count: 0 });
  assert.deepEqual(transport.coerceFieldValues(defs, { active: true, count: 0 }), { active: true, count: 0 });
});

test('building dropdown reads integer IDs from nested location fields', async () => {
  const h = context({}, [{ path: '/customer-api/v1/locations', response: { items: [
    { uuid: UUID, fields: { id: 7, name: 'HQ' } },
    { uuid: OTHER_UUID, name: 'No numeric ID' },
  ] } }]);
  assert.deepEqual(await node.methods.loadOptions.getLocationOptions.call(h.ctx), [{ name: 'HQ', value: 7 }]);
  h.done();
});

test('asset picker searches the API inventory_name field', async () => {
  const h = context({}, [{ path: '/customer-api/v1/objects', response: { items: [{ asset_uuid: UUID, inventory_name: 'Desk' }] } }]);
  assert.deepEqual((await node.methods.listSearch.searchAssets.call(h.ctx, 'desk')).results, [{ name: `Desk (${UUID})`, value: UUID }]);
  h.done();
});

for (const [resource, normalize, alias] of [['location', transport.normalizeLocation, 'location_uuid'], ['room', transport.normalizeRoom, 'room_uuid'], ['person', transport.normalizePerson, 'person_uuid']]) {
  test(`${resource}: nested API fields retain numeric IDs, names, timestamps and original payload`, () => {
    const input = { uuid: UUID, fields: { id: 7, [alias]: UUID, name: 'HQ', created_at: '2026-06-01 10:00:00', active: false } };
    const before = structuredClone(input);
    const result = normalize(input);
    assert.equal(result.id, 7);
    assert.equal(result.uuid, UUID);
    assert.equal(result.name, 'HQ');
    assert.equal(result.active, false);
    assert.equal(result.created_at, '2026-06-01T10:00:00Z');
    assert.deepEqual(result.fields, input.fields);
    assert.deepEqual(input, before);
  });
}

for (const [input, expected] of [['2026-06-01 12:30:00', '2026-06-01T12:30:00Z'], ['2026-06-01T12:30:00+02:00', '2026-06-01T12:30:00+02:00']]) {
  test(`timestamps normalize ${input} without rewriting explicit timezones`, () => {
    assert.equal(transport.toIsoUtc(input), expected);
  });
}
