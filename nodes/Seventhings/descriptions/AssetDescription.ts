/**
 * UI properties for the Asset resource.
 *
 * Ported from the Zapier `creates/*asset*.js` and `searches/*asset*.js` input
 * fields, re-expressed as n8n `INodeProperties`. Dynamic, tenant-specific asset
 * fields are surfaced via a resourceMapper (`getAssetFields`); asset selection
 * uses a resourceLocator backed by `searchAssets` / `searchArchivedAssets`.
 */

import type { INodeProperties } from 'n8n-workflow';

/** Operations available on the Asset resource. */
export const assetOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['asset'] } },
	options: [
		{ name: 'Archive', value: 'archive', description: 'Archive an asset', action: 'Archive an asset' },
		{
			name: 'Attach File',
			value: 'attachFile',
			description: 'Attach a file to an asset',
			action: 'Attach a file to an asset',
		},
		{ name: 'Create', value: 'create', description: 'Create an asset', action: 'Create an asset' },
		{ name: 'Delete', value: 'delete', description: 'Delete an asset', action: 'Delete an asset' },
		{
			name: 'Detach File',
			value: 'detachFile',
			description: 'Detach a file from an asset',
			action: 'Detach a file from an asset',
		},
		{ name: 'Get', value: 'get', description: 'Get an asset by UUID', action: 'Get an asset' },
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'Get many assets',
			action: 'Get many assets',
		},
		{
			name: 'Move to Location',
			value: 'moveToLocation',
			description: 'Move an asset to a location',
			action: 'Move an asset to a location',
		},
		{
			name: 'Move to Room',
			value: 'moveToRoom',
			description: 'Move an asset to a room',
			action: 'Move an asset to a room',
		},
		{
			name: 'Unarchive',
			value: 'unarchive',
			description: 'Unarchive an asset',
			action: 'Unarchive an asset',
		},
		{ name: 'Update', value: 'update', description: 'Update an asset', action: 'Update an asset' },
	],
	default: 'create',
};

/**
 * Asset selector (resourceLocator) used by operations that act on an existing
 * asset. `searchListMethod` differs per operation, so this is a factory.
 */
function assetLocator(
	searchListMethod: 'searchAssets' | 'searchArchivedAssets',
	operations: string[],
	displayName = 'Asset',
): INodeProperties {
	return {
		displayName,
		name: 'assetId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The asset to act on',
		displayOptions: { show: { resource: ['asset'], operation: operations } },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod, searchable: true },
			},
			{
				displayName: 'By UUID',
				name: 'id',
				type: 'string',
				placeholder: 'f4849c54-0437-477a-913c-479c4aebd928',
				validation: [
					{
						type: 'regex',
						properties: {
							regex:
								'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
							errorMessage: 'Not a valid asset UUID',
						},
					},
				],
			},
		],
	};
}

/** The dynamic, tenant-specific field mapper used by Create and Update. */
function assetFieldsMapper(operations: string[]): INodeProperties {
	return {
		displayName: 'Fields',
		name: 'fields',
		type: 'resourceMapper',
		default: { mappingMode: 'defineBelow', value: null },
		noDataExpression: true,
		required: true,
		displayOptions: { show: { resource: ['asset'], operation: operations } },
		typeOptions: {
			resourceMapper: {
				resourceMapperMethod: 'getAssetFields',
				mode: 'add',
				fieldWords: { singular: 'field', plural: 'fields' },
				addAllFields: false,
				multiKeyMatch: false,
				supportAutoMap: false,
			},
		},
	};
}

export const assetFields: INodeProperties[] = [
	// ---- Create -------------------------------------------------------------
	assetFieldsMapper(['create', 'update']),

	{
		displayName: 'Find or Create',
		name: 'findOrCreate',
		type: 'boolean',
		default: false,
		description:
			'Whether to first search for an existing asset by a chosen field and only create a new one if none matches',
		displayOptions: { show: { resource: ['asset'], operation: ['create'] } },
	},
	{
		displayName: 'Match Field Name or ID',
		name: 'matchFieldKey',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getAssetFieldKeys' },
		default: '',
		required: true,
		description:
			'The asset field to search by when finding an existing match. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: { resource: ['asset'], operation: ['create'], findOrCreate: [true] },
		},
	},
	{
		displayName: 'Match Value',
		name: 'matchValue',
		type: 'string',
		default: '',
		required: true,
		description:
			'The value to match on. If no asset has this value in the match field, a new asset is created with this value set.',
		displayOptions: {
			show: { resource: ['asset'], operation: ['create'], findOrCreate: [true] },
		},
	},

	// ---- Update -------------------------------------------------------------
	assetLocator('searchAssets', ['update']),

	// ---- Get ----------------------------------------------------------------
	assetLocator('searchAssets', ['get']),

	// ---- Archive / Delete / Move (active assets) ----------------------------
	assetLocator('searchAssets', ['archive', 'delete', 'moveToLocation', 'moveToRoom']),

	// ---- Unarchive (archived assets) ----------------------------------------
	assetLocator('searchArchivedAssets', ['unarchive'], 'Archived Asset'),

	// ---- Move to Location ---------------------------------------------------
	{
		displayName: 'Location',
		name: 'location',
		type: 'string',
		default: '',
		required: true,
		description:
			'The location identifier (UUID or value matching your tenant’s location field)',
		displayOptions: { show: { resource: ['asset'], operation: ['moveToLocation'] } },
	},

	// ---- Move to Room -------------------------------------------------------
	{
		displayName: 'Room',
		name: 'room',
		type: 'string',
		default: '',
		required: true,
		description: 'The room identifier (UUID or value matching your tenant’s room field)',
		displayOptions: { show: { resource: ['asset'], operation: ['moveToRoom'] } },
	},

	// ---- Attach File / Detach File ------------------------------------------
	assetLocator('searchAssets', ['attachFile', 'detachFile']),
	{
		displayName: 'Attachment Field Name or ID',
		name: 'fieldKey',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getAttachmentFieldKeys' },
		default: '',
		required: true,
		description:
			'The ATTACHMENT-typed field on the asset to attach the file to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: { resource: ['asset'], operation: ['attachFile', 'detachFile'] },
		},
	},
	{
		displayName: 'File UUID',
		name: 'fileUuid',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'f4849c54-0437-477a-913c-479c4aebd928',
		description: 'The UUID of the file to attach or detach, e.g. the output of File → Upload',
		displayOptions: {
			show: { resource: ['asset'], operation: ['attachFile', 'detachFile'] },
		},
	},

	// ---- Get Many -----------------------------------------------------------
	{
		displayName: 'Filter by Field Name or ID',
		name: 'filterFieldKey',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getAssetFieldKeys' },
		default: '',
		description:
			'Optionally restrict results to assets whose chosen field matches a value. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: { resource: ['asset'], operation: ['getAll'] } },
	},
	{
		displayName: 'Filter Value',
		name: 'filterValue',
		type: 'string',
		default: '',
		description: 'The value the chosen field must match',
		displayOptions: { show: { resource: ['asset'], operation: ['getAll'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['asset'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['asset'], operation: ['getAll'], returnAll: [false] },
		},
	},
];
