/**
 * Rental Case operation handlers.
 *
 * Each handler runs one Rental Case operation for a single input item and
 * returns the resulting execution-data array (Get Many can return several items;
 * the rest return one). Ported from the Zapier `lib/rental_cases.js` helper, but
 * the request shapes were corrected against the **live API** (the Zapier source
 * is not a faithful contract — verified against a real tenant).
 *
 * API schema notes (October 2026):
 *   - Create/Update use a STRICT full body: `title`, `renter {type,value}` (non-null),
 *     `references [{type:'asset',uuid}]` (non-empty), `issue_date`/`due_date` as
 *     **date-only `YYYY-MM-DD`**, optional nullable reminders, `comment`,
 *     `responsible_user_uuid`, and attachment UUIDs. Timed rentals additionally
 *     accept `is_full_day`, `issue_at`, and `due_at`.
 *     Omitting renter currently returns 500; validate it locally.
 *   - Update is PUT (returns 204); PATCH is NOT supported for this resource (404).
 *   - The list endpoint returns an `{ items, page, per_page, total }` wrapper and
 *     honors `per_page`/`page`. GET returns `references` already reduced to
 *     `{type,uuid}` (no read-vs-write sanitization needed); records have no `id`.
 *
 * Endpoints (all relative to the tenant base URL built in transport):
 *   create   POST   /customer-api/v1/rental-management/rental-case          (Location → GET)
 *   update   PUT    /customer-api/v1/rental-management/rental-case/{uuid}    (fetch-merge-PUT, then GET)
 *   get      GET    /customer-api/v1/rental-management/rental-case/{uuid}
 *   getAll   GET    /customer-api/v1/rental-management/rental-cases          (filter/sort/paginate)
 *   delete   DELETE /customer-api/v1/rental-management/rental-case/{uuid}
 */

import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	locationHeader,
	normalizeRentalCase,
	seventhingsApiRequest,
	seventhingsApiRequestAllItems,
	toApiDate,
	uuidFromLocation,
	validateUuid,
} from '../../transport';

const RENTAL_CASE_PATH = '/customer-api/v1/rental-management/rental-case';
const RENTAL_CASES_PATH = '/customer-api/v1/rental-management/rental-cases';

/** Read the rental-case UUID from the resourceLocator parameter and validate it. */
function getRentalCaseUuid(this: IExecuteFunctions, i: number): string {
	const value = this.getNodeParameter('rentalCaseId', i, undefined, {
		extractValue: true,
	}) as string;
	try {
		return validateUuid(value, 'Rental Case UUID');
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
	}
}

type Reminder = { unit: string; value: number };
type Renter = { type: string; value: string };
type Reference = { type: string; uuid: string };

/**
 * The complete set of writable rental-case fields. The live API write schema is
 * uses full replacement. Preserve writable values during fetch-merge-PUT.
 */
interface RentalCaseBody extends IDataObject {
	title: string;
	renter: Renter;
	references: Reference[];
	issue_date: string;
	issue_date_reminder: Reminder | null;
	due_date: string;
	due_date_reminder: Reminder | null;
	comment: string;
	responsible_user_uuid: string;
	attachments: string[];
}

/** Build a reminder object from a unit + value (the API requires a non-null one). */
function buildReminder(unit: unknown, valueRaw: unknown): Reminder {
	const value = Number(valueRaw);
	return {
		unit: typeof unit === 'string' && unit !== '' ? unit : 'days',
		value: Number.isNaN(value) ? 1 : value,
	};
}

/** Build the asset reference array from an asset UUID. */
function buildReferences(assetUuid: unknown): Reference[] {
	return typeof assetUuid === 'string' && assetUuid !== ''
		? [{ type: 'asset', uuid: assetUuid }]
		: [];
}

/** Build the renter object from a type + value. */
function buildRenter(type: unknown, value: unknown): Renter {
	return {
		type: typeof type === 'string' && type !== '' ? type : 'plain',
		value: typeof value === 'string' ? value : '',
	};
}

/**
 * Retain existing create defaults, adding timing/reminder overrides only when
 * selected. Date fields stay YYYY-MM-DD; timestamp fields retain their offsets.
 */
function buildCreateBody(this: IExecuteFunctions, i: number): RentalCaseBody {
	const body: RentalCaseBody = {
		title: this.getNodeParameter('title', i) as string,
		renter: buildRenter(
			this.getNodeParameter('renterType', i, 'plain'),
			this.getNodeParameter('renterValue', i, ''),
		),
		references: buildReferences(this.getNodeParameter('referenceAssetUuid', i, '')),
		issue_date: toApiDate(this.getNodeParameter('issueDate', i)),
		issue_date_reminder: buildReminder(
			this.getNodeParameter('issueDateReminderUnit', i, 'days'),
			this.getNodeParameter('issueDateReminderValue', i, 1),
		),
		due_date: toApiDate(this.getNodeParameter('dueDate', i)),
		due_date_reminder: buildReminder(
			this.getNodeParameter('dueDateReminderUnit', i, 'days'),
			this.getNodeParameter('dueDateReminderValue', i, 1),
		),
		comment: this.getNodeParameter('comment', i) as string,
		responsible_user_uuid: this.getNodeParameter('responsibleUserUuid', i) as string,
		attachments: [],
	};
	applyTiming.call(this, body, this.getNodeParameter('rentalTiming', i, {}) as IDataObject, i);
	validateRenter.call(this, body, i);
	return body;
}

function validateRenter(this: IExecuteFunctions, body: RentalCaseBody, i: number): void {
	if (!body.renter.value.trim()) {
		throw new NodeOperationError(this.getNode(), 'Rental case: a renter value is required.', { itemIndex: i });
	}
}

/** Omit unchanged timing on PUT so the API preserves times when dates move. */
function applyTiming(
	this: IExecuteFunctions, body: RentalCaseBody, changes: IDataObject, i: number, existing: IDataObject = {},
): void {
	if (typeof changes.isFullDay === 'boolean') body.is_full_day = changes.isFullDay;
	if (changes.isFullDay !== true && (changes.isFullDay === false || changes.issueAt !== undefined || changes.dueAt !== undefined)) {
		const issueAt = changes.issueAt ?? existing.issue_at;
		const dueAt = changes.dueAt ?? existing.due_at;
		const valid = (value: unknown): value is string => typeof value === 'string'
			&& /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)
			&& Number.isFinite(Date.parse(value));
		if (!valid(issueAt) || !valid(dueAt) || Date.parse(dueAt) <= Date.parse(issueAt)) {
			throw new NodeOperationError(this.getNode(), 'Timed rentals require Issue At and Due At timestamps with a timezone, and Due At must be after Issue At.', { itemIndex: i });
		}
		body.issue_at = issueAt;
		body.due_at = dueAt;
		// Explicit timestamps select a timed rental; the API derives dates in UTC.
		body.is_full_day = false;
	}
	if (changes.disableIssueReminder === true) body.issue_date_reminder = null;
	if (changes.disableDueReminder === true) body.due_date_reminder = null;
}

/**
 * Reduce a record fetched from the API into the writable body shape. GET already
 * returns `references` as `{type,uuid}`, but we re-map defensively. Reminders and
 * renter come back in the same shape the write schema wants. Dates are reduced to
 * date-only. Expanded attachment objects are reduced to their UUIDs.
 */
function sanitizeExistingRentalCase(existing: IDataObject): RentalCaseBody {
	const references = Array.isArray(existing.references)
		? (existing.references as IDataObject[]).map((ref) => ({
				type: String(ref.type ?? 'asset'),
				uuid: String(ref.uuid ?? ''),
			}))
		: [];
	const renter = (existing.renter as Renter | null) ?? null;
	const issueReminder = (existing.issue_date_reminder as Reminder | null) ?? null;
	const dueReminder = (existing.due_date_reminder as Reminder | null) ?? null;

	return {
		title: String(existing.title ?? ''),
		renter: buildRenter(renter?.type, renter?.value),
		references,
		issue_date: toApiDate(existing.issue_date),
		issue_date_reminder: issueReminder ? buildReminder(issueReminder.unit, issueReminder.value) : null,
		due_date: toApiDate(existing.due_date),
		due_date_reminder: dueReminder ? buildReminder(dueReminder.unit, dueReminder.value) : null,
		comment: String(existing.comment ?? ''),
		responsible_user_uuid: String(existing.responsible_user_uuid ?? ''),
		attachments: Array.isArray(existing.attachments) ? (existing.attachments as unknown[]).map((file) =>
			typeof file === 'string' ? file : String((file as IDataObject)?.uuid ?? ''),
		).filter(Boolean) : [],
		...(existing.status === undefined ? {} : { status: existing.status }),
	};
}

/** Overlay the Update collection's set fields onto a sanitized base body. */
function applyRentalCaseUpdates(base: RentalCaseBody, updates: IDataObject): RentalCaseBody {
	const body: RentalCaseBody = { ...base };

	if (updates.title !== undefined && updates.title !== '') {
		body.title = updates.title as string;
	}
	if (updates.issueDate !== undefined && updates.issueDate !== '') {
		body.issue_date = toApiDate(updates.issueDate);
	}
	if (updates.dueDate !== undefined && updates.dueDate !== '') {
		body.due_date = toApiDate(updates.dueDate);
	}
	if (updates.comment !== undefined && updates.comment !== '') {
		body.comment = updates.comment as string;
	}
	if (updates.responsibleUserUuid !== undefined && updates.responsibleUserUuid !== '') {
		body.responsible_user_uuid = updates.responsibleUserUuid as string;
	}
	if (updates.renterType !== undefined || updates.renterValue !== undefined) {
		body.renter = buildRenter(
			updates.renterType ?? base.renter.type,
			updates.renterValue ?? base.renter.value,
		);
	}
	if (updates.referenceAssetUuid !== undefined && updates.referenceAssetUuid !== '') {
		body.references = buildReferences(updates.referenceAssetUuid);
	}
	if (updates.issueDateReminderUnit !== undefined || updates.issueDateReminderValue !== undefined) {
		body.issue_date_reminder = buildReminder(
			updates.issueDateReminderUnit ?? base.issue_date_reminder?.unit,
			updates.issueDateReminderValue ?? base.issue_date_reminder?.value,
		);
	}
	if (updates.dueDateReminderUnit !== undefined || updates.dueDateReminderValue !== undefined) {
		body.due_date_reminder = buildReminder(
			updates.dueDateReminderUnit ?? base.due_date_reminder?.unit,
			updates.dueDateReminderValue ?? base.due_date_reminder?.value,
		);
	}

	return body;
}

/** GET a rental case by UUID and normalize it (used after create/update). */
async function fetchRentalCase(this: IExecuteFunctions, uuid: string): Promise<IDataObject> {
	const record = (await seventhingsApiRequest.call(this, {
		path: `${RENTAL_CASE_PATH}/${uuid}`,
	})) as IDataObject;
	return normalizeRentalCase(record, uuid);
}

/** POST a new rental case, read the created UUID from Location, then GET it back. */
async function createRentalCase(
	this: IExecuteFunctions,
	i: number,
	body: RentalCaseBody,
): Promise<IDataObject> {
	const response = (await seventhingsApiRequest.call(this, {
		method: 'POST',
		path: RENTAL_CASE_PATH,
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
			'Create rental case: the API did not return a UUID for the new rental case.',
			{ itemIndex: i },
		);
	}

	return fetchRentalCase.call(this, uuid);
}

/** Build the Get Many query string from the Filters collection. */
function buildFiltersQs(filters: IDataObject): IDataObject {
	const qs: IDataObject = {};
	const map: Record<string, string> = {
		status: 'status',
		responsibleUserUuid: 'responsible_user_uuid',
		referenceAssetUuid: 'reference_asset_uuid',
	};
	for (const [key, param] of Object.entries(map)) {
		const value = filters[key];
		if (value !== undefined && value !== null && value !== '') {
			qs[param] = value as IDataObject[string];
		}
	}
	return qs;
}

type RentalCaseHandler = (
	this: IExecuteFunctions,
	i: number,
) => Promise<INodeExecutionData[]>;

const handlers: Record<string, RentalCaseHandler> = {
	async create(this: IExecuteFunctions, i: number) {
		const body = buildCreateBody.call(this, i);
		const created = await createRentalCase.call(this, i, body);
		return [{ json: created, pairedItem: { item: i } }];
	},

	async update(this: IExecuteFunctions, i: number) {
		const uuid = getRentalCaseUuid.call(this, i);
		const updates = this.getNodeParameter('updateFields', i, {}) as IDataObject;

		if (Object.keys(updates).length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				'Update rental case: provide at least one field to update.',
				{ itemIndex: i },
			);
		}

		// The API PUT is a strict full replace (every field required and non-null),
		// so fetch the existing rental case, sanitize it into a writable body, then
		// overlay the user's changes.
		const existing = await fetchRentalCase.call(this, uuid);
		const body = applyRentalCaseUpdates(sanitizeExistingRentalCase(existing), updates);
		applyTiming.call(this, body, updates, i, existing);
		validateRenter.call(this, body, i);

		await seventhingsApiRequest.call(this, {
			method: 'PUT',
			path: `${RENTAL_CASE_PATH}/${uuid}`,
			body,
			headers: { 'Content-Type': 'application/json' },
		});

		const updated = await fetchRentalCase.call(this, uuid);
		return [{ json: updated, pairedItem: { item: i } }];
	},

	async get(this: IExecuteFunctions, i: number) {
		const uuid = getRentalCaseUuid.call(this, i);
		const record = await fetchRentalCase.call(this, uuid);
		return [{ json: record, pairedItem: { item: i } }];
	},

	async getAll(this: IExecuteFunctions, i: number) {
		const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const limit = returnAll ? undefined : (this.getNodeParameter('limit', i, 50) as number);

		const list = await seventhingsApiRequestAllItems.call(this, {
			path: RENTAL_CASES_PATH,
			qs: {
				'sort[created_at]': 'DESC',
				...buildFiltersQs(filters),
			},
		}, limit);
		const normalized = list.map((rentalCase) => normalizeRentalCase(rentalCase));
		const limited = limit === undefined ? normalized : normalized.slice(0, limit);

		return limited.map((json) => ({ json, pairedItem: { item: i } }));
	},

	async delete(this: IExecuteFunctions, i: number) {
		const uuid = getRentalCaseUuid.call(this, i);
		await seventhingsApiRequest.call(this, {
			method: 'DELETE',
			path: `${RENTAL_CASE_PATH}/${uuid}`,
		});
		return [{ json: { uuid, deleted: true }, pairedItem: { item: i } }];
	},
};

/** True when this Rental Case operation is implemented in Phase 4. */
export function isRentalCaseOperationSupported(operation: string): boolean {
	return operation in handlers;
}

/** Run a Rental Case operation for input item `i`. */
export async function executeRentalCaseOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const handler = handlers[operation];
	if (!handler) {
		throw new NodeOperationError(
			this.getNode(),
			`The rental case operation "${operation}" is not implemented yet.`,
			{ itemIndex: i },
		);
	}
	return handler.call(this, i);
}
