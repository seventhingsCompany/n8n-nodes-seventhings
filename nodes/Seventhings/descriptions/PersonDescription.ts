import type { INodeProperties } from 'n8n-workflow';

import {
	FILTER_OPERATOR_OPTIONS,
	LOWERCASE_SORT_DIRECTION_OPTIONS,
} from '../transport/sdkListOptions';

const UUID_REGEX =
	'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

export const personOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['person'] } },
	options: [
		{ name: 'Create', value: 'create', description: 'Create a person', action: 'Create a person' },
		{
			name: 'Create User',
			value: 'createUser',
			description: 'Create users for persons matching a filter',
			action: 'Create user from person',
		},
		{ name: 'Delete', value: 'delete', description: 'Delete a person', action: 'Delete a person' },
		{ name: 'Get', value: 'get', description: 'Get a person by UUID', action: 'Get a person' },
		{
			name: 'Get by ID',
			value: 'getById',
			description: 'Get a person by numeric ID',
			action: 'Get a person by ID',
		},
		{ name: 'Get Many', value: 'getAll', description: 'Get many persons', action: 'Get many persons' },
		{ name: 'Update', value: 'update', description: 'Update a person', action: 'Update a person' },
	],
	default: 'create',
};

function personLocator(operations: string[]): INodeProperties {
	return {
		displayName: 'Person',
		name: 'personId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The person to act on',
		displayOptions: { show: { resource: ['person'], operation: operations } },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchPersons', searchable: true },
			},
			{
				displayName: 'By UUID',
				name: 'id',
				type: 'string',
				placeholder: '8b5d8c3e-3f7c-4a1a-9f5b-2e6a1c0d4b11',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: UUID_REGEX,
							errorMessage: 'Not a valid person UUID',
						},
					},
				],
			},
		],
	};
}

function personFieldsMapper(operations: string[]): INodeProperties {
	return {
		displayName: 'Fields',
		name: 'fields',
		type: 'resourceMapper',
		default: { mappingMode: 'defineBelow', value: null },
		noDataExpression: true,
		required: true,
		displayOptions: { show: { resource: ['person'], operation: operations } },
		typeOptions: {
			resourceMapper: {
				resourceMapperMethod: 'getPersonFields',
				mode: 'add',
				fieldWords: { singular: 'field', plural: 'fields' },
				addAllFields: false,
				multiKeyMatch: false,
				supportAutoMap: false,
			},
		},
	};
}

const personSortFields: INodeProperties[] = [
	{
		displayName: 'Sort By',
		name: 'sortBy',
		type: 'string',
		default: '',
		description: 'Field key to sort by, for example email',
	},
	{
		displayName: 'Order',
		name: 'order',
		type: 'options',
		default: 'asc',
		options: LOWERCASE_SORT_DIRECTION_OPTIONS,
		description: 'Sort direction',
	},
];

const createUserFilter: INodeProperties = {
	displayName: 'Filter',
	name: 'filterRows',
	type: 'fixedCollection',
	placeholder: 'Add Filter',
	default: {},
	typeOptions: { multipleValues: true },
	displayOptions: { show: { resource: ['person'], operation: ['createUser'] } },
	options: [
		{
			displayName: 'Filter',
			name: 'filters',
			values: [
				{
					displayName: 'Field',
					name: 'field',
					type: 'string',
					default: 'email',
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

export const personFields: INodeProperties[] = [
	personFieldsMapper(['create', 'update']),
	personLocator(['update', 'get', 'delete']),
	{
		displayName: 'Person ID',
		name: 'personNumericId',
		type: 'number',
		default: 0,
		required: true,
		typeOptions: { minValue: 1 },
		description: 'Numeric person ID',
		displayOptions: { show: { resource: ['person'], operation: ['getById'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['person'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['person'], operation: ['getAll'], returnAll: [false] },
		},
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['person'], operation: ['getAll'] } },
		options: personSortFields,
	},
	createUserFilter,
];
