import type { INodeProperties } from 'n8n-workflow';

import { FIELD_TYPE_OPTIONS } from '../transport/fieldDefinitions';

const UUID_REGEX =
	'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

export const fieldDefinitionOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['fieldDefinition'] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			description: 'Create a field definition',
			action: 'Create a field definition',
		},
		{
			name: 'Get',
			value: 'get',
			description: 'Get a field definition by UUID',
			action: 'Get a field definition',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'Get many field definitions',
			action: 'Get many field definitions',
		},
		{
			name: 'Update',
			value: 'update',
			description: 'Update a field definition',
			action: 'Update a field definition',
		},
	],
	default: 'getAll',
};

function fieldDefinitionLocator(operations: string[]): INodeProperties {
	return {
		displayName: 'Field Definition',
		name: 'fieldDefinitionId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The field definition to act on',
		displayOptions: { show: { resource: ['fieldDefinition'], operation: operations } },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchFieldDefinitions', searchable: true },
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
							errorMessage: 'Not a valid field definition UUID',
						},
					},
				],
			},
		],
	};
}

const templateField: INodeProperties = {
	displayName: 'Template',
	name: 'template',
	type: 'options',
	default: 'asset',
	required: true,
	options: [
		{ name: 'Asset', value: 'asset' },
		{ name: 'Person', value: 'person' },
		{ name: 'Room', value: 'room' },
	],
	description: 'The asset-tracking template the field belongs to',
	displayOptions: { show: { resource: ['fieldDefinition'] } },
};

function jsonArrayField(
	displayName: string,
	name: string,
	description: string,
	operations: string[],
	defaultValue = '[]',
): INodeProperties {
	return {
		displayName,
		name,
		type: 'json',
		default: defaultValue,
		description,
		displayOptions: { show: { resource: ['fieldDefinition'], operation: operations } },
	};
}

const writableFields: INodeProperties[] = [
	{
		displayName: 'Field Type',
		name: 'fieldTypeName',
		type: 'options',
		default: 'TEXT',
		required: true,
		options: FIELD_TYPE_OPTIONS,
		description: 'The field type name sent as field_type.name',
		displayOptions: { show: { resource: ['fieldDefinition'], operation: ['create', 'update'] } },
	},
	{
		displayName: 'Label',
		name: 'label',
		type: 'string',
		default: '',
		required: true,
		description: 'The user-visible field label',
		displayOptions: { show: { resource: ['fieldDefinition'], operation: ['create', 'update'] } },
	},
	jsonArrayField(
		'Field Type Constraints',
		'constraints',
		'JSON array sent as field_type.constraints',
		['create', 'update'],
	),
	jsonArrayField('Attributes', 'attributes', 'JSON array sent as attributes', ['create', 'update']),
	jsonArrayField('Relations', 'relations', 'JSON array sent as relations', ['create', 'update']),
	{
		displayName: 'Comment',
		name: 'comment',
		type: 'string',
		default: '',
		description: 'Optional comment for the field definition',
		displayOptions: { show: { resource: ['fieldDefinition'], operation: ['create', 'update'] } },
	},
	{
		displayName: 'Default Value',
		name: 'defaultValue',
		type: 'json',
		default: 'null',
		description: 'JSON value sent as default_value',
		displayOptions: { show: { resource: ['fieldDefinition'], operation: ['create', 'update'] } },
	},
	jsonArrayField(
		'Possible Values',
		'possibleValues',
		'JSON array sent as possible_values',
		['create', 'update'],
	),
];

export const fieldDefinitionFields: INodeProperties[] = [
	templateField,
	fieldDefinitionLocator(['get', 'update']),
	{
		displayName: 'Field Key',
		name: 'fieldKey',
		type: 'string',
		default: '',
		required: true,
		description: 'The immutable field key required by the update endpoint',
		displayOptions: { show: { resource: ['fieldDefinition'], operation: ['update'] } },
	},
	...writableFields,
];
