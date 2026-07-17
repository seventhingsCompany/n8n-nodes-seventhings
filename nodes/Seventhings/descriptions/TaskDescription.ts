/**
 * UI properties for the Task resource.
 *
 * Ported from the Zapier `creates/*task*.js`, `searches/*task*.js`, and
 * `lib/tasks.js` input fields, re-expressed as n8n `INodeProperties`. Task
 * selection uses a resourceLocator backed by `searchTasks`; the optional create/
 * update fields and the Get Many filters are grouped into collections to keep
 * the UI tidy.
 */

import type { INodeProperties } from 'n8n-workflow';

const UUID_REGEX =
	'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

/**
 * Task selector (resourceLocator) used by operations that act on an existing
 * task. List mode is backed by the `searchTasks` listSearch; By-UUID mode
 * accepts a pasted task UUID. Mirrors the Asset resource's `assetLocator`.
 */
function taskLocator(operations: string[]): INodeProperties {
	return {
		displayName: 'Task',
		name: 'taskId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The task to act on',
		displayOptions: { show: { resource: ['task'], operation: operations } },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchTasks', searchable: true },
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
							errorMessage: 'Not a valid task UUID',
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

/**
 * The "Additional Fields" collection of optional task fields.
 *
 * For Create, the API-required fields (deadline, assignees, reference, reminder)
 * live as top-level required inputs, so this collection only holds the genuinely
 * optional ones. For Update every field is optional (we fetch-merge the existing
 * record), so the full set is offered here.
 */
function taskAdditionalFields(operation: 'create' | 'update'): INodeProperties {
	const options: INodeProperties[] = [
		{
			displayName: 'Comment',
			name: 'comment',
			type: 'string',
			typeOptions: { rows: 3 },
			default: '',
			description: 'A comment to add to the task',
		},
		{
			displayName: 'Notify Assignees',
			name: 'notify',
			type: 'boolean',
			default: false,
			description: 'Whether to notify the assignees about the task',
		},
	];

	// Update offers every field optionally; the required Create fields are
	// top-level there, so they are only added to the collection for Update.
	if (operation === 'update') {
		options.unshift(
			{
				displayName: 'Assignee UUIDs',
				name: 'assignees',
				type: 'string',
				typeOptions: { multipleValues: true },
				default: [],
				description:
					'User UUIDs to assign the task to. The API accepts a single assignee; if you provide more than one, only the first is used.',
			},
			{
				displayName: 'Deadline',
				name: 'deadline',
				type: 'dateTime',
				default: '',
				description: 'When the task is due',
			},
			{
				displayName: 'Referenced Asset UUID',
				name: 'referenceAssetUuid',
				type: 'string',
				default: '',
				description: 'Link the task to an asset by its UUID',
			},
			{
				displayName: 'Reminder Unit',
				name: 'reminderUnit',
				type: 'options',
				default: 'days',
				description: 'Pair with Reminder Value to set the reminder before the deadline',
				options: REMINDER_UNIT_OPTIONS,
			},
			{
				displayName: 'Reminder Value',
				name: 'reminderValue',
				type: 'number',
				default: 1,
				description: 'Pair with Reminder Unit to set the reminder before the deadline',
			},
		);
	}

	return {
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['task'], operation: [operation] } },
		options,
	};
}

export const taskFields: INodeProperties[] = [
	// ---- Create -------------------------------------------------------------
	// The API requires title, a deadline, at least one assignee, a reference and
	// a reminder on every task, so these are top-level required inputs.
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		required: true,
		description: 'The title of the task',
		displayOptions: { show: { resource: ['task'], operation: ['create'] } },
	},
	{
		displayName: 'Deadline',
		name: 'deadline',
		type: 'dateTime',
		default: '',
		required: true,
		description: 'When the task is due',
		displayOptions: { show: { resource: ['task'], operation: ['create'] } },
	},
	{
		displayName: 'Assignee UUIDs',
		name: 'assignees',
		type: 'string',
		typeOptions: { multipleValues: true },
		default: [],
		required: true,
		description:
			'User UUIDs to assign the task to. Paste from a task trigger or your tenant’s user list. The API accepts a single assignee; if you provide more than one, only the first is used.',
		displayOptions: { show: { resource: ['task'], operation: ['create'] } },
	},
	{
		displayName: 'Referenced Asset UUID',
		name: 'referenceAssetUuid',
		type: 'string',
		default: '',
		required: true,
		description: 'The asset the task is about. The API requires every task to reference an asset.',
		displayOptions: { show: { resource: ['task'], operation: ['create'] } },
	},
	{
		displayName: 'Reminder Unit',
		name: 'reminderUnit',
		type: 'options',
		default: 'days',
		required: true,
		description: 'The unit of the reminder before the deadline',
		options: REMINDER_UNIT_OPTIONS,
		displayOptions: { show: { resource: ['task'], operation: ['create'] } },
	},
	{
		displayName: 'Reminder Value',
		name: 'reminderValue',
		type: 'number',
		default: 1,
		required: true,
		description: 'How many of the reminder unit before the deadline to remind',
		displayOptions: { show: { resource: ['task'], operation: ['create'] } },
	},
	taskAdditionalFields('create'),

	// ---- Update -------------------------------------------------------------
	taskLocator(['update']),
	taskAdditionalFields('update'),

	// ---- Get / Close / Reopen / Delete --------------------------------------
	taskLocator(['get']),
	taskLocator(['close']),
	taskLocator(['reopen']),
	taskLocator(['delete']),

	// ---- Get Many -----------------------------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['task'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['task'], operation: ['getAll'], returnAll: [false] },
		},
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['task'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Assignee UUID',
				name: 'assignee',
				type: 'string',
				default: '',
				description: 'Only tasks assigned to this user UUID',
			},
			{
				displayName: 'Author UUID',
				name: 'author',
				type: 'string',
				default: '',
				description: 'Only tasks created by this user UUID',
			},
			{
				displayName: 'Deadline From',
				name: 'deadlineFrom',
				type: 'dateTime',
				default: '',
				description: 'Only tasks with a deadline on or after this date',
			},
			{
				displayName: 'Deadline To',
				name: 'deadlineTo',
				type: 'dateTime',
				default: '',
				description: 'Only tasks with a deadline on or before this date',
			},
			{
				displayName: 'Reference Type',
				name: 'referenceType',
				type: 'options',
				default: 'asset',
				description: 'Only tasks referencing this type of record',
				options: [{ name: 'Asset', value: 'asset' }],
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: 'open',
				description: 'Only tasks with this status',
				options: [
					{ name: 'Open', value: 'open' },
					{ name: 'Closed', value: 'closed' },
				],
			},
		],
	},
];
