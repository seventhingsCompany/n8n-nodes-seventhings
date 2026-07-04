import type { INodeProperties } from 'n8n-workflow';

import {
	FILTER_OPERATOR_OPTIONS,
	SORT_DIRECTION_OPTIONS,
} from '../transport/sdkListOptions';

export const circularityHubItemOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['circularityHubItem'] } },
	options: [
		{
			name: 'Add Objects',
			value: 'addObjects',
			description: 'Add assets to Circularity Hub in bulk',
			action: 'Add objects to circularity hub',
		},
		{
			name: 'Delete',
			value: 'delete',
			description: 'Delete a Circularity Hub item',
			action: 'Delete a circularity hub item',
		},
		{
			name: 'Get',
			value: 'get',
			description: 'Get a Circularity Hub item',
			action: 'Get a circularity hub item',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'Get many Circularity Hub items',
			action: 'Get many circularity hub items',
		},
		{
			name: 'Suggest Category',
			value: 'suggestCategory',
			description: 'Suggest a category from filters',
			action: 'Suggest a circularity hub category',
		},
		{
			name: 'Suggest Rest Price',
			value: 'suggestRestPrice',
			description: 'Suggest a rest price from input fields',
			action: 'Suggest a circularity hub rest price',
		},
		{
			name: 'Update',
			value: 'update',
			description: 'Update a Circularity Hub item',
			action: 'Update a circularity hub item',
		},
	],
	default: 'getAll',
};

export const circularityHubOrderOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['circularityHubOrder'] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			description: 'Create a Circularity Hub order',
			action: 'Create a circularity hub order',
		},
		{
			name: 'Get',
			value: 'get',
			description: 'Get a Circularity Hub order',
			action: 'Get a circularity hub order',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'Get many Circularity Hub orders',
			action: 'Get many circularity hub orders',
		},
		{
			name: 'Update',
			value: 'update',
			description: 'Update a Circularity Hub order',
			action: 'Update a circularity hub order',
		},
	],
	default: 'getAll',
};

function idField(resource: 'circularityHubItem' | 'circularityHubOrder', operations: string[]): INodeProperties {
	return {
		displayName: 'ID',
		name: 'id',
		type: 'number',
		default: 0,
		required: true,
		typeOptions: { minValue: 1 },
		description: 'Numeric Circularity Hub ID',
		displayOptions: { show: { resource: [resource], operation: operations } },
	};
}

function listFields(resource: 'circularityHubItem' | 'circularityHubOrder'): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show: { resource: [resource], operation: ['getAll'] } },
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			default: 50,
			typeOptions: { minValue: 1 },
			description: 'Max number of results to return',
			displayOptions: {
				show: { resource: [resource], operation: ['getAll'], returnAll: [false] },
			},
		},
		filterRowsField(resource, ['getAll']),
		sortRowsField(resource, ['getAll']),
	];
}

function filterRowsField(
	resource: 'circularityHubItem' | 'circularityHubOrder',
	operations: string[],
): INodeProperties {
	return {
		displayName: 'Filters',
		name: 'filterRows',
		type: 'fixedCollection',
		placeholder: 'Add Filter',
		default: {},
		typeOptions: { multipleValues: true },
		displayOptions: { show: { resource: [resource], operation: operations } },
		options: [
			{
				displayName: 'Filter',
				name: 'filters',
				values: [
					{
						displayName: 'Field',
						name: 'field',
						type: 'string',
						default: '',
						required: true,
					},
					{
						displayName: 'Operator',
						name: 'operator',
						type: 'options',
						default: 'eq',
						options: FILTER_OPERATOR_OPTIONS,
					},
					{
						displayName: 'Values',
						name: 'values',
						type: 'string',
						default: '',
						required: true,
						description: 'Comma-separated values for multi-value operators',
					},
				],
			},
		],
	};
}

function sortRowsField(
	resource: 'circularityHubItem' | 'circularityHubOrder',
	operations: string[],
): INodeProperties {
	return {
		displayName: 'Sort',
		name: 'sortRows',
		type: 'fixedCollection',
		placeholder: 'Add Sort',
		default: {},
		typeOptions: { multipleValues: true },
		displayOptions: { show: { resource: [resource], operation: operations } },
		options: [
			{
				displayName: 'Sort',
				name: 'sort',
				values: [
					{
						displayName: 'Field',
						name: 'field',
						type: 'string',
						default: '',
						required: true,
					},
					{
						displayName: 'Direction',
						name: 'direction',
						type: 'options',
						default: 'ASC',
						options: SORT_DIRECTION_OPTIONS,
					},
				],
			},
		],
	};
}

export const circularityHubItemFields: INodeProperties[] = [
	idField('circularityHubItem', ['get', 'update', 'delete']),
	...listFields('circularityHubItem'),
	filterRowsField('circularityHubItem', ['suggestCategory']),
	sortRowsField('circularityHubItem', ['suggestCategory']),
	{
		displayName: 'Input Fields',
		name: 'inputFields',
		type: 'json',
		default: '{}',
		required: true,
		description: 'JSON object sent to the rest-price suggestion endpoint',
		displayOptions: { show: { resource: ['circularityHubItem'], operation: ['suggestRestPrice'] } },
	},
	{
		displayName: 'Objects',
		name: 'objects',
		type: 'fixedCollection',
		placeholder: 'Add Object',
		default: {},
		typeOptions: { multipleValues: true },
		displayOptions: { show: { resource: ['circularityHubItem'], operation: ['addObjects'] } },
		options: [
			{
				displayName: 'Object',
				name: 'entries',
				values: [
					{
						displayName: 'Asset UUID',
						name: 'assetUuid',
						type: 'string',
						default: '',
						required: true,
					},
					{
						displayName: 'Category',
						name: 'category',
						type: 'string',
						default: '',
						required: true,
					},
					{
						displayName: 'Price',
						name: 'price',
						type: 'string',
						default: '',
						required: true,
					},
				],
			},
		],
	},
	{
		displayName: 'Fields',
		name: 'fields',
		type: 'json',
		default: '{}',
		required: true,
		description: 'JSON object of fields to patch on the item',
		displayOptions: { show: { resource: ['circularityHubItem'], operation: ['update'] } },
	},
];

export const circularityHubOrderFields: INodeProperties[] = [
	idField('circularityHubOrder', ['get', 'update']),
	...listFields('circularityHubOrder'),
	{
		displayName: 'Item IDs',
		name: 'itemIds',
		type: 'string',
		typeOptions: { multipleValues: true },
		default: [],
		required: true,
		description: 'Circularity Hub item IDs to include in the order',
		displayOptions: { show: { resource: ['circularityHubOrder'], operation: ['create'] } },
	},
	{
		displayName: 'Fields',
		name: 'fields',
		type: 'json',
		default: '{}',
		required: true,
		description: 'JSON object of fields to patch on the order',
		displayOptions: { show: { resource: ['circularityHubOrder'], operation: ['update'] } },
	},
];
