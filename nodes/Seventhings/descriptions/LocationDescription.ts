/**
 * UI properties for the Location resource.
 *
 * Locations are a simple UUID-keyed CRUD resource: Create needs only a name;
 * Update fetch-merges the existing record so its single editable field (name)
 * is offered in an Update Fields collection; Get / Delete select an existing
 * location via a resourceLocator backed by `searchLocations`; Get Many exposes
 * Return All / Limit and a name-substring filter. Mirrors
 * `RentalCaseDescription.ts`.
 */

import type { INodeProperties } from 'n8n-workflow';

const UUID_REGEX = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

/**
 * Location selector (resourceLocator) used by operations that act on an existing
 * location. List mode is backed by the `searchLocations` listSearch; By-UUID
 * mode accepts a pasted UUID. Mirrors `rentalCaseLocator`.
 */
function locationLocator(operations: string[]): INodeProperties {
	return {
		displayName: 'Location',
		name: 'locationId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The location to act on',
		displayOptions: { show: { resource: ['location'], operation: operations } },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchLocations', searchable: true },
			},
			{
				displayName: 'By UUID',
				name: 'id',
				type: 'string',
				placeholder: 'c1f7a4d6-1234-4abc-9def-0123456789ab',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: UUID_REGEX,
							errorMessage: 'Not a valid location UUID',
						},
					},
				],
			},
		],
	};
}

/**
 * The "Update Fields" collection for Update. Locations only have an editable
 * name; the handler requires at least one field to be set.
 */
/** The optional address fields a location carries beyond its name. */
const ADDRESS_FIELDS: INodeProperties[] = [
	{
		displayName: 'Address',
		name: 'address',
		type: 'string',
		default: '',
		description: 'Street address of the location',
	},
	{
		displayName: 'City',
		name: 'city',
		type: 'string',
		default: '',
		description: 'City of the location',
	},
	{
		displayName: 'Country',
		name: 'country',
		type: 'string',
		default: '',
		description: 'Country of the location',
	},
];

/** Optional address fields for Create (Name is a separate top-level required input). */
const locationAdditionalFields: INodeProperties = {
	displayName: 'Additional Fields',
	name: 'additionalFields',
	type: 'collection',
	placeholder: 'Add Field',
	default: {},
	displayOptions: { show: { resource: ['location'], operation: ['create'] } },
	options: ADDRESS_FIELDS,
};

/**
 * The "Update Fields" collection for Update. The API accepts a PATCH partial
 * body, so each field optionally overrides the stored value; the handler
 * requires at least one field to be set.
 */
const locationUpdateFields: INodeProperties = {
	displayName: 'Update Fields',
	name: 'updateFields',
	type: 'collection',
	placeholder: 'Add Field',
	default: {},
	displayOptions: { show: { resource: ['location'], operation: ['update'] } },
	options: [
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			default: '',
			description: 'The name of the location',
		},
		...ADDRESS_FIELDS,
	],
};

export const locationFields: INodeProperties[] = [
	// ---- Create -------------------------------------------------------------
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		description: 'The name of the location',
		displayOptions: { show: { resource: ['location'], operation: ['create'] } },
	},
	locationAdditionalFields,

	// ---- Update -------------------------------------------------------------
	locationLocator(['update']),
	locationUpdateFields,

	// ---- Get / Delete -------------------------------------------------------
	locationLocator(['get']),
	locationLocator(['delete']),

	// ---- Get Many -----------------------------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['location'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['location'], operation: ['getAll'], returnAll: [false] },
		},
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['location'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Only locations whose name contains this text',
			},
		],
	},
];
