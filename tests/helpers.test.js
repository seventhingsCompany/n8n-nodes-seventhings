const assert = require('node:assert/strict');
const test = require('node:test');

const {
	buildFilterObject,
	encodeSdkListOptions,
	readFilterRows,
} = require('../dist/nodes/Seventhings/transport/sdkListOptions');
const {
	buildFieldDefinitionBody,
} = require('../dist/nodes/Seventhings/transport/fieldDefinitions');
const {
	idFromLocationIdHeader,
	uuidFromLocation,
} = require('../dist/nodes/Seventhings/transport/validators');

test('encodes SDK list options with sort and multi-value filters', () => {
	assert.deepEqual(
		encodeSdkListOptions({
			page: 2,
			perPage: 25,
			sort: [{ field: 'updated_at', direction: 'DESC' }],
			filters: [
				{ field: 'status', operator: 'eq', values: ['open'] },
				{ field: 'category', operator: 'in', values: ['a', 'b'] },
			],
		}),
		{
			page: 2,
			per_page: 25,
			'sort[updated_at]': 'DESC',
			'filter[status][eq]': 'open',
			'filter[category][in][]': ['a', 'b'],
		},
	);
});

test('builds Circularity Hub filter object bodies', () => {
	assert.deepEqual(
		buildFilterObject(
			[
				{ field: 'email', operator: 'eq', values: ['tester@example.com'] },
				{ field: 'tag', operator: 'in', values: ['red', 'blue'] },
			],
			[{ field: 'name', direction: 'ASC' }],
		),
		{
			filter: {
				email: { eq: 'tester@example.com' },
				tag: { in: ['red', 'blue'] },
			},
			sort: { name: 'ASC' },
		},
	);
});

test('reads n8n fixed-collection filter rows', () => {
	assert.deepEqual(
		readFilterRows({
			filters: [
				{ field: 'status', operator: 'eq', values: 'open' },
				{ field: 'category', operator: 'in', values: 'a, b' },
			],
		}),
		[
			{ field: 'status', operator: 'eq', values: ['open'] },
			{ field: 'category', operator: 'in', values: ['a', 'b'] },
		],
	);
});

test('builds field-definition create and update bodies', () => {
	assert.deepEqual(
		buildFieldDefinitionBody({
			uuid: 'fd-1',
			fieldKey: 'custom_field',
			fieldTypeName: 'TEXT',
			constraints: [{ type: 'max_length', value: 255 }],
			label: 'Custom Field',
			attributes: [{ type: 'required', value: true }],
			relations: [{ type: 'depends_on', field_uuid: 'fd-2' }],
			comment: 'Comment',
			defaultValue: 'default',
			possibleValues: ['a', 'b'],
		}),
		{
			uuid: 'fd-1',
			field_key: 'custom_field',
			field_type: {
				name: 'TEXT',
				constraints: [{ type: 'max_length', value: 255 }],
			},
			label: 'Custom Field',
			attributes: [{ type: 'required', value: true }],
			relations: [{ type: 'depends_on', field_uuid: 'fd-2' }],
			comment: 'Comment',
			default_value: 'default',
			possible_values: ['a', 'b'],
		},
	);
});

test('parses Location and Location-Id headers', () => {
	assert.equal(
		uuidFromLocation('/customer-api/v1/asset-tracking/asset/field-definition/abc-123'),
		'abc-123',
	);
	assert.equal(idFromLocationIdHeader({ 'Location-Id': '42' }), 42);
	assert.equal(idFromLocationIdHeader({ 'location-id': 7 }), 7);
	assert.equal(idFromLocationIdHeader({}), null);
});
