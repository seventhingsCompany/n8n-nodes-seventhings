/**
 * Task operation handlers.
 *
 * Each handler runs one Task operation for a single input item and returns the
 * resulting execution-data array (Get Many can return several items; the rest
 * return one). Ported from the Zapier `lib/tasks.js` helper and the `creates/` +
 * `searches/` task actions.
 *
 * Endpoints (all relative to the tenant base URL built in transport):
 *   create        POST   /customer-api/v1/task-management/task          (Location → GET)
 *   update        PUT    /customer-api/v1/task-management/task/{uuid}    (fetch-merge-PUT, then GET)
 *   get           GET    /customer-api/v1/task-management/task/{uuid}
 *   getAll        GET    /customer-api/v1/task-management/tasks          (filter/sort/paginate)
 *   close/reopen  PUT    /customer-api/v1/task-management/task/{uuid}/status  { status }
 *   delete        DELETE /customer-api/v1/task-management/task/{uuid}
 */

import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	locationHeader,
	normalizeTask,
	seventhingsApiRequest,
	toApiDate,
	uuidFromLocation,
	validateUuid,
} from '../../transport';

const TASK_PATH = '/customer-api/v1/task-management/task';
const TASKS_PATH = '/customer-api/v1/task-management/tasks';

/** Read the task UUID from the resourceLocator parameter and validate it. */
function getTaskUuid(this: IExecuteFunctions, i: number): string {
	const value = this.getNodeParameter('taskId', i, undefined, {
		extractValue: true,
	}) as string;
	try {
		return validateUuid(value, 'Task UUID');
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
	}
}

/**
 * The complete set of writable task fields the API's create/update schema
 * requires to be present. `deadline` must be a non-null string and
 * `reminders`/`assignees`/`references` must be non-empty (enforced by the API);
 * `comment`/`recurring_schedule` may be null and `attachments` may be empty.
 */
interface TaskBody extends IDataObject {
	title: string;
	comment: string | null;
	deadline: string | null;
	reminders: Array<{ unit: string; value: number }>;
	recurring_schedule: IDataObject | null;
	assignees: string[];
	references: Array<{ type: string; uuid: string }>;
	attachments: IDataObject[];
}

/** Build a single reminder array from a unit + value, or `[]` when unset. */
function buildReminders(unit: unknown, valueRaw: unknown): Array<{ unit: string; value: number }> {
	if (typeof unit !== 'string' || unit === '' || valueRaw === undefined || valueRaw === '') {
		return [];
	}
	const value = Number(valueRaw);
	return Number.isNaN(value) ? [] : [{ unit, value }];
}

/**
 * Normalize the assignees input to the shape the API accepts. The create/update
 * schema is `maxItems: 1`, so the API rejects a body with more than one
 * assignee; we drop the empties and keep only the first.
 */
function normalizeAssignees(input: unknown): string[] {
	const list = Array.isArray(input)
		? (input as unknown[]).filter((a): a is string => typeof a === 'string' && a !== '')
		: typeof input === 'string' && input !== ''
			? [input]
			: [];
	return list.slice(0, 1);
}

/** Build the asset reference array from an asset UUID, or `[]` when unset. */
function buildReferences(assetUuid: unknown): Array<{ type: string; uuid: string }> {
	return typeof assetUuid === 'string' && assetUuid !== ''
		? [{ type: 'asset', uuid: assetUuid }]
		: [];
}

/**
 * Build the full create body from the required top-level inputs plus the
 * optional Additional Fields collection. The API rejects partial bodies, so
 * every writable key is always present.
 */
function buildCreateBody(this: IExecuteFunctions, i: number): TaskBody {
	const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	const assignees = normalizeAssignees(this.getNodeParameter('assignees', i, []));
	const comment = additional.comment as string | undefined;

	// The deadline is a `dateTime` input (ISO `...T...Z`), but the API's create
	// schema is `format: date`, so reduce it to a bare `YYYY-MM-DD`.
	const deadline = toApiDate(this.getNodeParameter('deadline', i, '') as string);
	// `reminders` is `minItems: 1`; if the user cleared it, fall back to a
	// zero-day reminder so the body still satisfies the schema.
	const reminders = buildReminders(
		this.getNodeParameter('reminderUnit', i, 'days'),
		this.getNodeParameter('reminderValue', i, 1),
	);

	const body: TaskBody = {
		title: this.getNodeParameter('title', i) as string,
		comment: comment ? comment : null,
		deadline,
		reminders: reminders.length > 0 ? reminders : [{ unit: 'days', value: 0 }],
		recurring_schedule: null,
		assignees,
		references: buildReferences(this.getNodeParameter('referenceAssetUuid', i, '')),
		attachments: [],
	};

	if (typeof additional.notify === 'boolean') {
		body.notify = additional.notify;
	}

	return body;
}

/**
 * Validate the API-required create inputs up front so the node surfaces a clear
 * error instead of the opaque "Body does not match schema" 400. The UI marks
 * these fields required, but an expression can still resolve to an empty value.
 */
function validateCreateBody(this: IExecuteFunctions, i: number, body: TaskBody): void {
	const fail = (message: string): never => {
		throw new NodeOperationError(this.getNode(), `Create task: ${message}`, { itemIndex: i });
	};

	if (!body.title || body.title.trim() === '') {
		fail('a title is required.');
	}
	if (!body.deadline) {
		fail('a deadline is required.');
	}
	if (body.assignees.length === 0) {
		fail('an assignee UUID is required.');
	}
	// The API rejects tasks with no references ("References cannot be empty"),
	// even though the OpenAPI schema does not mark references non-empty.
	if (body.references.length === 0) {
		fail('a referenced asset UUID is required.');
	}
}

/**
 * Reduce a record fetched from the API into a body the write schema accepts:
 * `references` comes back expanded (with name/status/id) but the schema wants
 * just `{ type, uuid }`; `attachments` come back as file objects but the schema
 * wants an empty/UUID form, so we drop them to `[]`.
 */
function sanitizeExistingTask(existing: IDataObject): TaskBody {
	const references = Array.isArray(existing.references)
		? (existing.references as IDataObject[]).map((ref) => ({
				type: String(ref.type ?? 'asset'),
				uuid: String(ref.uuid ?? ''),
			}))
		: [];
	const reminders = Array.isArray(existing.reminders)
		? (existing.reminders as IDataObject[]).map((rem) => ({
				unit: String(rem.unit ?? ''),
				value: Number(rem.value ?? 0),
			}))
		: [];

	const existingDeadline = existing.deadline as string | null;
	return {
		title: String(existing.title ?? ''),
		comment: (existing.comment as string | null) ?? null,
		// The API's date fields are `format: date`; normalize any datetime the
		// GET returns so the fetch-merge-PUT round-trip stays schema-valid.
		deadline: existingDeadline ? toApiDate(existingDeadline) : null,
		reminders,
		recurring_schedule: (existing.recurring_schedule as IDataObject | null) ?? null,
		assignees: Array.isArray(existing.assignees) ? (existing.assignees as string[]) : [],
		references,
		// Editing attachments is out of scope (Phase 6); preserve none on update.
		attachments: [],
	};
}

/** Overlay the Update collection's set fields onto a sanitized base body. */
function applyTaskUpdates(base: TaskBody, additional: IDataObject): TaskBody {
	const body: TaskBody = { ...base };

	if (additional.title !== undefined && additional.title !== '') {
		body.title = additional.title as string;
	}
	if (additional.comment !== undefined) {
		body.comment = (additional.comment as string) || null;
	}
	if (additional.deadline !== undefined && additional.deadline !== '') {
		// The API's date fields are `format: date`; normalize the dateTime input.
		body.deadline = toApiDate(additional.deadline as string);
	}
	if (additional.assignees !== undefined) {
		const list = normalizeAssignees(additional.assignees);
		if (list.length > 0) {
			body.assignees = list;
		}
	}
	if (additional.referenceAssetUuid !== undefined && additional.referenceAssetUuid !== '') {
		body.references = buildReferences(additional.referenceAssetUuid);
	}
	if (additional.reminderUnit !== undefined && additional.reminderValue !== undefined) {
		const reminders = buildReminders(additional.reminderUnit, additional.reminderValue);
		if (reminders.length > 0) {
			body.reminders = reminders;
		}
	}
	if (typeof additional.notify === 'boolean') {
		body.notify = additional.notify;
	}

	return body;
}

/** GET a task by UUID and normalize it (used after create/update/close/reopen). */
async function fetchTask(this: IExecuteFunctions, uuid: string): Promise<IDataObject> {
	const record = (await seventhingsApiRequest.call(this, {
		path: `${TASK_PATH}/${uuid}`,
	})) as IDataObject;
	return normalizeTask(record, uuid);
}

/** POST a new task, read the created UUID from Location, then GET it back. */
async function createTask(
	this: IExecuteFunctions,
	i: number,
	body: TaskBody,
): Promise<IDataObject> {
	const response = (await seventhingsApiRequest.call(this, {
		method: 'POST',
		path: TASK_PATH,
		body,
		headers: { 'Content-Type': 'application/json' },
		returnFullResponse: true,
	})) as { body?: IDataObject; headers?: IDataObject };

	const responseBody = (response.body ?? {}) as IDataObject;
	const uuid =
		uuidFromLocation(locationHeader(response.headers)) ??
		(responseBody.uuid as string | undefined);

	if (!uuid) {
		throw new NodeOperationError(
			this.getNode(),
			'Create task: the API did not return a UUID for the new task.',
			{ itemIndex: i },
		);
	}

	return fetchTask.call(this, uuid);
}

/** Build the Get Many query string from the Filters collection. */
function buildFiltersQs(filters: IDataObject): IDataObject {
	const qs: IDataObject = {};
	const map: Record<string, string> = {
		status: 'status',
		assignee: 'assignee',
		author: 'author',
		deadlineFrom: 'deadline_from',
		deadlineTo: 'deadline_to',
		referenceType: 'reference_type',
	};
	for (const [key, param] of Object.entries(map)) {
		const value = filters[key];
		if (value !== undefined && value !== null && value !== '') {
			qs[param] = value as IDataObject[string];
		}
	}
	return qs;
}

type TaskHandler = (
	this: IExecuteFunctions,
	i: number,
) => Promise<INodeExecutionData[]>;

const handlers: Record<string, TaskHandler> = {
	async create(this: IExecuteFunctions, i: number) {
		const body = buildCreateBody.call(this, i);
		validateCreateBody.call(this, i, body);
		const created = await createTask.call(this, i, body);
		return [{ json: created, pairedItem: { item: i } }];
	},

	async update(this: IExecuteFunctions, i: number) {
		const uuid = getTaskUuid.call(this, i);
		const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

		if (Object.keys(additional).length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				'Update task: provide at least one field to update.',
				{ itemIndex: i },
			);
		}

		// The API PUT is a full replace with a strict schema (all fields required,
		// references in {type,uuid} form), so fetch the existing task, sanitize it
		// into a writable body, then overlay the user's changes.
		const existing = await fetchTask.call(this, uuid);
		const body = applyTaskUpdates(sanitizeExistingTask(existing), additional);

		await seventhingsApiRequest.call(this, {
			method: 'PUT',
			path: `${TASK_PATH}/${uuid}`,
			body,
			headers: { 'Content-Type': 'application/json' },
		});

		const updated = await fetchTask.call(this, uuid);
		return [{ json: updated, pairedItem: { item: i } }];
	},

	async get(this: IExecuteFunctions, i: number) {
		const uuid = getTaskUuid.call(this, i);
		const record = await fetchTask.call(this, uuid);
		return [{ json: record, pairedItem: { item: i } }];
	},

	async getAll(this: IExecuteFunctions, i: number) {
		const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

		// The tasks endpoint returns a bare array and ignores `per_page`/`page`
		// (unlike the assets endpoint), so we fetch the full list and slice
		// client-side — mirroring the Zapier task searches/triggers.
		const response = (await seventhingsApiRequest.call(this, {
			path: TASKS_PATH,
			qs: {
				'sort[updated_at]': 'DESC',
				...buildFiltersQs(filters),
			},
		})) as IDataObject[];

		const tasks = Array.isArray(response) ? response : [];
		const normalized = tasks.map((task) => normalizeTask(task));
		const limited = returnAll
			? normalized
			: normalized.slice(0, this.getNodeParameter('limit', i, 50) as number);

		return limited.map((json) => ({ json, pairedItem: { item: i } }));
	},

	async close(this: IExecuteFunctions, i: number) {
		return setStatus.call(this, i, 'closed');
	},

	async reopen(this: IExecuteFunctions, i: number) {
		return setStatus.call(this, i, 'open');
	},

	async delete(this: IExecuteFunctions, i: number) {
		const uuid = getTaskUuid.call(this, i);
		await seventhingsApiRequest.call(this, {
			method: 'DELETE',
			path: `${TASK_PATH}/${uuid}`,
		});
		return [{ json: { uuid, deleted: true }, pairedItem: { item: i } }];
	},
};

/** Set a task's status via the `/status` endpoint, then GET and return it. */
async function setStatus(
	this: IExecuteFunctions,
	i: number,
	status: 'open' | 'closed',
): Promise<INodeExecutionData[]> {
	const uuid = getTaskUuid.call(this, i);
	await seventhingsApiRequest.call(this, {
		method: 'PUT',
		path: `${TASK_PATH}/${uuid}/status`,
		body: { status },
		headers: { 'Content-Type': 'application/json' },
	});
	const record = await fetchTask.call(this, uuid);
	return [{ json: record, pairedItem: { item: i } }];
}

/** True when this Task operation is implemented in Phase 3. */
export function isTaskOperationSupported(operation: string): boolean {
	return operation in handlers;
}

/** Run a Task operation for input item `i`. */
export async function executeTaskOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const handler = handlers[operation];
	if (!handler) {
		throw new NodeOperationError(
			this.getNode(),
			`The task operation "${operation}" is not implemented yet.`,
			{ itemIndex: i },
		);
	}
	return handler.call(this, i);
}
