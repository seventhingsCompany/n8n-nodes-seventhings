/**
 * UI properties for the Rental Case resource.
 *
 * The field set is driven by the **live API schema** (verified against a real
 * tenant), which is stricter than the Zapier source: create requires a title,
 * a non-null renter, at least one asset reference, issue/due dates (date-only
 * `YYYY-MM-DD`), a reminder object for each date, a comment, and a responsible
 * user. Those are therefore top-level **required** inputs for Create. Update
 * fetch-merges the existing record, so every field is offered optionally in an
 * Additional Fields collection. Rental-case selection uses a resourceLocator
 * backed by `searchRentalCases`. Mirrors `TaskDescription.ts`.
 */

import type { INodeProperties } from 'n8n-workflow';

const UUID_REGEX =
	'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

/**
 * Rental-case selector (resourceLocator) used by operations that act on an
 * existing rental case. List mode is backed by the `searchRentalCases`
 * listSearch; By-UUID mode accepts a pasted UUID. Mirrors `taskLocator`.
 */
function rentalCaseLocator(operations: string[]): INodeProperties {
	return {
		displayName: 'Rental Case',
		name: 'rentalCaseId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The rental case to act on',
		displayOptions: { show: { resource: ['rentalCase'], operation: operations } },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchRentalCases', searchable: true },
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
							errorMessage: 'Not a valid rental case UUID',
						},
					},
				],
			},
		],
	};
}

/** Reminder-unit options, shared by Create and Update. */
const REMINDER_UNIT_OPTIONS = [
	{ name: 'Days', value: 'days' },
	{ name: 'Weeks', value: 'weeks' },
	{ name: 'Months', value: 'months' },
	{ name: 'Years', value: 'years' },
];

/** Renter-type options (free-text name vs referenced user UUID). */
const RENTER_TYPE_OPTIONS = [
	{ name: 'Plain', value: 'plain' },
	{ name: 'User', value: 'user' },
];

/** Rental-case status options, shared by the Get Many filter. */
const STATUS_OPTIONS = [
	{ name: 'Requested', value: 'requested' },
	{ name: 'Confirmed', value: 'confirmed' },
	{ name: 'Borrowed', value: 'borrowed' },
	{ name: 'Rejected', value: 'rejected' },
	{ name: 'Completed', value: 'completed' },
	{ name: 'Return Overdue', value: 'return_overdue' },
	{ name: 'Pickup Overdue', value: 'pickup_overdue' },
];

/**
 * The "Additional Fields" collection for Update. The API PUT is a strict full
 * replace (every field required and non-null); we fetch-merge the existing
 * record, so each field here optionally overrides the fetched value. Create
 * does not use a collection — every API-required field is a top-level required
 * input there.
 */
const rentalCaseUpdateFields: INodeProperties = {
	displayName: 'Update Fields',
	name: 'updateFields',
	type: 'collection',
	placeholder: 'Add Field',
	default: {},
	displayOptions: { show: { resource: ['rentalCase'], operation: ['update'] } },
	options: [
		{
			displayName: 'Comment',
			name: 'comment',
			type: 'string',
			typeOptions: { rows: 3 },
			default: '',
			description: 'A comment on the rental case',
		},
		{
			displayName: 'Due Date',
			name: 'dueDate',
			type: 'dateTime',
			default: '',
			description: 'When the asset is due back',
		},
		{
			displayName: 'Due Date Reminder Unit',
			name: 'dueDateReminderUnit',
			type: 'options',
			default: 'days',
			description: 'Pair with Due Date Reminder Value to set a reminder before the due date',
			options: REMINDER_UNIT_OPTIONS,
		},
		{
			displayName: 'Due Date Reminder Value',
			name: 'dueDateReminderValue',
			type: 'number',
			default: 1,
			description: 'Pair with Due Date Reminder Unit to set a reminder before the due date',
		},
		{
			displayName: 'Issue Date',
			name: 'issueDate',
			type: 'dateTime',
			default: '',
			description: 'When the asset is issued',
		},
		{
			displayName: 'Issue Date Reminder Unit',
			name: 'issueDateReminderUnit',
			type: 'options',
			default: 'days',
			description: 'Pair with Issue Date Reminder Value to set a reminder before the issue date',
			options: REMINDER_UNIT_OPTIONS,
		},
		{
			displayName: 'Issue Date Reminder Value',
			name: 'issueDateReminderValue',
			type: 'number',
			default: 1,
			description: 'Pair with Issue Date Reminder Unit to set a reminder before the issue date',
		},
		{
			displayName: 'Referenced Asset UUID',
			name: 'referenceAssetUuid',
			type: 'string',
			default: '',
			description: 'Replace the referenced asset by its UUID',
		},
		{
			displayName: 'Renter Type',
			name: 'renterType',
			type: 'options',
			default: 'plain',
			description:
				'Pair with Renter Value. "Plain" for a free-text name, "User" to reference a user UUID.',
			options: RENTER_TYPE_OPTIONS,
		},
		{
			displayName: 'Renter Value',
			name: 'renterValue',
			type: 'string',
			default: '',
			description: 'The renter name (if Plain) or user UUID (if User)',
		},
		{
			displayName: 'Responsible User UUID',
			name: 'responsibleUserUuid',
			type: 'string',
			default: '',
			description: 'UUID of the user responsible for the rental case',
		},
		{
			displayName: 'Title',
			name: 'title',
			type: 'string',
			default: '',
			description: 'The title of the rental case',
		},
	],
};

export const rentalCaseFields: INodeProperties[] = [
	// ---- Create -------------------------------------------------------------
	// The live API schema requires every one of these on create (verified against
	// a real tenant): a renter, an asset reference, both date reminders, a comment
	// and a responsible user are all mandatory, so they are top-level required.
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		required: true,
		description: 'The title of the rental case',
		displayOptions: { show: { resource: ['rentalCase'], operation: ['create'] } },
	},
	{
		displayName: 'Renter Type',
		name: 'renterType',
		type: 'options',
		default: 'plain',
		required: true,
		description:
			'Pair with Renter Value. "Plain" for a free-text name, "User" to reference a user UUID.',
		options: RENTER_TYPE_OPTIONS,
		displayOptions: { show: { resource: ['rentalCase'], operation: ['create'] } },
	},
	{
		displayName: 'Renter Value',
		name: 'renterValue',
		type: 'string',
		default: '',
		required: true,
		description: 'The renter name (if Plain) or user UUID (if User)',
		displayOptions: { show: { resource: ['rentalCase'], operation: ['create'] } },
	},
	{
		displayName: 'Referenced Asset UUID',
		name: 'referenceAssetUuid',
		type: 'string',
		default: '',
		required: true,
		description: 'The asset this rental case is for. The API requires a referenced asset.',
		displayOptions: { show: { resource: ['rentalCase'], operation: ['create'] } },
	},
	{
		displayName: 'Issue Date',
		name: 'issueDate',
		type: 'dateTime',
		default: '',
		required: true,
		description: 'When the asset is issued (sent to the API as a date, YYYY-MM-DD)',
		displayOptions: { show: { resource: ['rentalCase'], operation: ['create'] } },
	},
	{
		displayName: 'Issue Date Reminder Unit',
		name: 'issueDateReminderUnit',
		type: 'options',
		default: 'days',
		required: true,
		description: 'The unit of the reminder before the issue date',
		options: REMINDER_UNIT_OPTIONS,
		displayOptions: { show: { resource: ['rentalCase'], operation: ['create'] } },
	},
	{
		displayName: 'Issue Date Reminder Value',
		name: 'issueDateReminderValue',
		type: 'number',
		default: 1,
		required: true,
		description: 'How many of the reminder unit before the issue date to remind',
		displayOptions: { show: { resource: ['rentalCase'], operation: ['create'] } },
	},
	{
		displayName: 'Due Date',
		name: 'dueDate',
		type: 'dateTime',
		default: '',
		required: true,
		description: 'When the asset is due back (sent to the API as a date, YYYY-MM-DD)',
		displayOptions: { show: { resource: ['rentalCase'], operation: ['create'] } },
	},
	{
		displayName: 'Due Date Reminder Unit',
		name: 'dueDateReminderUnit',
		type: 'options',
		default: 'days',
		required: true,
		description: 'The unit of the reminder before the due date',
		options: REMINDER_UNIT_OPTIONS,
		displayOptions: { show: { resource: ['rentalCase'], operation: ['create'] } },
	},
	{
		displayName: 'Due Date Reminder Value',
		name: 'dueDateReminderValue',
		type: 'number',
		default: 1,
		required: true,
		description: 'How many of the reminder unit before the due date to remind',
		displayOptions: { show: { resource: ['rentalCase'], operation: ['create'] } },
	},
	{
		displayName: 'Comment',
		name: 'comment',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		required: true,
		description: 'A comment on the rental case',
		displayOptions: { show: { resource: ['rentalCase'], operation: ['create'] } },
	},
	{
		displayName: 'Responsible User UUID',
		name: 'responsibleUserUuid',
		type: 'string',
		default: '',
		required: true,
		description: 'UUID of the user responsible for the rental case',
		displayOptions: { show: { resource: ['rentalCase'], operation: ['create'] } },
	},

	// ---- Update -------------------------------------------------------------
	rentalCaseLocator(['update']),
	rentalCaseUpdateFields,

	// ---- Get / Delete -------------------------------------------------------
	rentalCaseLocator(['get']),
	rentalCaseLocator(['delete']),

	// ---- Get Many -----------------------------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['rentalCase'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['rentalCase'], operation: ['getAll'], returnAll: [false] },
		},
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['rentalCase'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Reference Asset UUID',
				name: 'referenceAssetUuid',
				type: 'string',
				default: '',
				description: 'Only rental cases referencing this asset UUID',
			},
			{
				displayName: 'Responsible User UUID',
				name: 'responsibleUserUuid',
				type: 'string',
				default: '',
				description: 'Only rental cases with this responsible user UUID',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: 'requested',
				description: 'Only rental cases with this status',
				options: STATUS_OPTIONS,
			},
		],
	},
];
