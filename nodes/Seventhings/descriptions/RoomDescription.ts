/**
 * UI properties for the Room resource.
 *
 * Rooms have two structural quirks, both confirmed against the live API:
 *  1. A room belongs to a building (location) referenced by an **integer
 *     `building_id`**, not a UUID. The Building field is an options dropdown
 *     backed by the `getLocationOptions` loadOptions method (values are the
 *     locations' integer ids).
 *  2. Rooms carry **tenant-specific dynamic custom fields** (e.g. "Raumtyp",
 *     "Etage", "Fläche"), some of them server-side mandatory. Those are driven
 *     by a **resourceMapper** over the room field-definitions (`getRoomFields`)
 *     rather than static inputs — mirroring the Asset resource.
 *
 * Create/Update therefore expose: the Building dropdown plus the resourceMapper
 * (which includes `number`, `name`, and the tenant custom fields, marking the
 * mandatory ones required). Get / Delete select an existing room via a
 * resourceLocator backed by `searchRooms`; Get Many exposes Return All / Limit
 * and name / building filters.
 */

import type { INodeProperties } from 'n8n-workflow';

const UUID_REGEX = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

/**
 * Room selector (resourceLocator) used by operations that act on an existing
 * room. List mode is backed by the `searchRooms` listSearch; By-UUID mode
 * accepts a pasted UUID. Mirrors `locationLocator`.
 */
function roomLocator(operations: string[]): INodeProperties {
	return {
		displayName: 'Room',
		name: 'roomId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The room to act on',
		displayOptions: { show: { resource: ['room'], operation: operations } },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchRooms', searchable: true },
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
							errorMessage: 'Not a valid room UUID',
						},
					},
				],
			},
		],
	};
}

/** The Building (location) dropdown — value is the location's integer id. */
function buildingField(operations: string[], required: boolean): INodeProperties {
	return {
		// eslint-disable-next-line n8n-nodes-base/node-param-display-name-wrong-for-dynamic-options
		displayName: 'Building',
		name: 'buildingId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getLocationOptions' },
		default: '',
		required,
		// eslint-disable-next-line n8n-nodes-base/node-param-description-wrong-for-dynamic-options
		description: 'The location (building) that owns this room',
		displayOptions: { show: { resource: ['room'], operation: operations } },
	};
}

/** The dynamic, tenant-specific room field mapper used by Create and Update. */
function roomFieldsMapper(operations: string[]): INodeProperties {
	return {
		displayName: 'Fields',
		name: 'fields',
		type: 'resourceMapper',
		default: { mappingMode: 'defineBelow', value: null },
		noDataExpression: true,
		required: true,
		displayOptions: { show: { resource: ['room'], operation: operations } },
		typeOptions: {
			resourceMapper: {
				resourceMapperMethod: 'getRoomFields',
				mode: 'add',
				fieldWords: { singular: 'field', plural: 'fields' },
				addAllFields: true,
				multiKeyMatch: false,
				supportAutoMap: false,
			},
		},
	};
}

export const roomFields: INodeProperties[] = [
	// ---- Create -------------------------------------------------------------
	buildingField(['create'], true),
	roomFieldsMapper(['create']),

	// ---- Update -------------------------------------------------------------
	roomLocator(['update']),
	buildingField(['update'], false),
	roomFieldsMapper(['update']),

	// ---- Get / Delete -------------------------------------------------------
	roomLocator(['get']),
	roomLocator(['delete']),

	// ---- Get Many -----------------------------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['room'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['room'], operation: ['getAll'], returnAll: [false] },
		},
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['room'], operation: ['getAll'] } },
		options: [
			{
				// eslint-disable-next-line n8n-nodes-base/node-param-display-name-wrong-for-dynamic-options
				displayName: 'Building',
				name: 'buildingId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getLocationOptions' },
				default: '',
				// eslint-disable-next-line n8n-nodes-base/node-param-description-wrong-for-dynamic-options
				description: 'Only rooms belonging to this location (building)',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Only rooms whose name contains this text',
			},
		],
	},
];
