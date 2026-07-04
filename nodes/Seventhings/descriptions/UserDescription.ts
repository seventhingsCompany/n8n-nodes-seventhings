import type { INodeProperties } from 'n8n-workflow';

import { LOWERCASE_SORT_DIRECTION_OPTIONS } from '../transport/sdkListOptions';

const UUID_REGEX =
	'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

export const userOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['user'] } },
	options: [
		{ name: 'Get', value: 'get', description: 'Get a user by UUID', action: 'Get a user' },
		{
			name: 'Get by ID',
			value: 'getById',
			description: 'Get a user by numeric ID',
			action: 'Get a user by ID',
		},
		{ name: 'Get Many', value: 'getAll', description: 'Get many users', action: 'Get many users' },
	],
	default: 'get',
};

function userLocator(operations: string[]): INodeProperties {
	return {
		displayName: 'User',
		name: 'userId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The user to act on',
		displayOptions: { show: { resource: ['user'], operation: operations } },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchUsers', searchable: true },
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
							errorMessage: 'Not a valid user UUID',
						},
					},
				],
			},
		],
	};
}

export const userFields: INodeProperties[] = [
	userLocator(['get']),
	{
		displayName: 'User ID',
		name: 'userNumericId',
		type: 'number',
		default: 0,
		required: true,
		typeOptions: { minValue: 1 },
		description: 'Numeric user ID',
		displayOptions: { show: { resource: ['user'], operation: ['getById'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['user'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['user'], operation: ['getAll'], returnAll: [false] },
		},
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['user'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Sort By',
				name: 'sortBy',
				type: 'options',
				default: 'id',
				options: [
					{ name: 'Email', value: 'email' },
					{ name: 'ID', value: 'id' },
				],
			},
			{
				displayName: 'Order',
				name: 'order',
				type: 'options',
				default: 'asc',
				options: LOWERCASE_SORT_DIRECTION_OPTIONS,
			},
		],
	},
];
