import type { INodeProperties } from 'n8n-workflow';
import { FILTER_OPERATOR_OPTIONS, SORT_DIRECTION_OPTIONS } from '../transport/sdkListOptions';

export const catalogItemOperations: INodeProperties = {
	displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
	displayOptions: { show: { resource: ['catalogItem'] } },
	options: [
		{ name: 'Create', value: 'create', description: 'Create a catalog item', action: 'Create a catalog item' },
		{ name: 'Delete', value: 'delete', description: 'Delete a catalog item without deleting its assets', action: 'Delete a catalog item' },
		{ name: 'Get', value: 'get', description: 'Get a catalog item', action: 'Get a catalog item' },
		{ name: 'Get Many', value: 'getAll', description: 'Get many catalog items', action: 'Get many catalog items' },
		{ name: 'Update', value: 'update', description: 'Replace all fields of a catalog item', action: 'Update a catalog item' },
	],
	default: 'getAll',
};

export const catalogItemFields: INodeProperties[] = [
	{
		displayName: 'Catalog Item UUID', name: 'catalogItemId', type: 'string', default: '', required: true,
		displayOptions: { show: { resource: ['catalogItem'], operation: ['get', 'update', 'delete'] } },
	},
	{
		displayName: 'Fields (JSON)', name: 'catalogFields', type: 'json', default: '{}', required: true,
		description: 'Complete field map, for example {"catalog_object_inventory_name":"Laptop"}. Object field keys use the catalog_object_ prefix.',
		displayOptions: { show: { resource: ['catalogItem'], operation: ['create', 'update'] } },
	},
	{
		displayName: 'Update replaces all fields. Omitted fields are emptied; existing assets are not changed.',
		name: 'catalogUpdateNotice', type: 'notice', default: '',
		displayOptions: { show: { resource: ['catalogItem'], operation: ['update'] } },
	},
	{
		displayName: 'Return All', name: 'returnAll', type: 'boolean', default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['catalogItem'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit', name: 'limit', type: 'number', default: 50, typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['catalogItem'], operation: ['getAll'], returnAll: [false] } },
	},
	{
		displayName: 'Filters', name: 'filterRows', type: 'fixedCollection', default: {}, placeholder: 'Add Filter',
		typeOptions: { multipleValues: true },
		displayOptions: { show: { resource: ['catalogItem'], operation: ['getAll'] } },
		options: [{ displayName: 'Filter', name: 'filters', values: [
			{ displayName: 'Field', name: 'field', type: 'string', default: '' },
			{ displayName: 'Operator', name: 'operator', type: 'options', default: 'eq', options: FILTER_OPERATOR_OPTIONS },
			{ displayName: 'Values', name: 'values', type: 'string', default: '', description: 'Comma-separated values; scalar operators use the first value' },
		] }],
	},
	{
		displayName: 'Sort', name: 'sortRows', type: 'fixedCollection', default: {}, placeholder: 'Add Sort',
		typeOptions: { multipleValues: true },
		displayOptions: { show: { resource: ['catalogItem'], operation: ['getAll'] } },
		options: [{ displayName: 'Sort', name: 'sort', values: [
			{ displayName: 'Field', name: 'field', type: 'string', default: '' },
			{ displayName: 'Direction', name: 'direction', type: 'options', default: 'ASC', options: SORT_DIRECTION_OPTIONS },
		] }],
	},
];
