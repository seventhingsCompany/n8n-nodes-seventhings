import type {
	IDataObject,
	IPollFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import {
	normalizeAsset,
	normalizeRentalCase,
	normalizeTask,
	seventhingsApiRequest,
} from '../Seventhings/transport';

/**
 * seventhings polling trigger.
 *
 * The seventhings API is polling-only (no webhooks), so this node implements
 * `poll`. Each event polls the same list endpoint as the matching Get Many
 * operation and emits only records new/changed since the last poll, tracked in
 * `getWorkflowStaticData('node')`.
 *
 * Assets and new rental cases use timestamp watermarks. Tasks and rental-case
 * updates have no reliable updated_at: compare stable record signatures for
 * edits, UUIDs for status entry, and UUID/deadline pairs for deadline events.
 */

const OBJECTS_PATH = '/customer-api/v1/objects';
const TASKS_PATH = '/customer-api/v1/task-management/tasks';
const RENTAL_CASES_PATH = '/customer-api/v1/rental-management/rental-cases';

type Resource = 'asset' | 'task' | 'rentalCase';

interface EventConfig {
	resource: Resource;
	path: string;
	/** Timestamp field used for the high-water mark (asset / rental case only). */
	watermarkField?: 'created_at' | 'updated_at';
	/** Compare content for update events that have no reliable timestamp. */
	compareContent?: boolean;
	/** `status` query param sent to the API, if any. */
	statusQuery?: string;
	/** Client-side re-filter applied after fetch (defensive — params can be ignored). */
	predicate?: (record: IDataObject) => boolean;
	/** Deadline-window events (tasks): need `deadline_from`/`deadline_to` + Days Ahead. */
	deadlineWindow?: 'overdue' | 'dueSoon';
}

const EVENTS: Record<string, EventConfig> = {
	newAsset: { resource: 'asset', path: OBJECTS_PATH, watermarkField: 'created_at' },
	updatedAsset: { resource: 'asset', path: OBJECTS_PATH, watermarkField: 'updated_at' },
	// Tasks carry no timestamps → seen-UUID set, not a watermark.
	newTask: { resource: 'task', path: TASKS_PATH },
	updatedTask: { resource: 'task', path: TASKS_PATH, compareContent: true },
	taskClosed: {
		resource: 'task',
		path: TASKS_PATH,
		statusQuery: 'closed',
		predicate: (r) => r.status === 'closed',
	},
	taskReopened: {
		resource: 'task',
		path: TASKS_PATH,
		statusQuery: 'open',
		predicate: (r) => r.status === 'open',
	},
	taskOverdue: {
		resource: 'task',
		path: TASKS_PATH,
		statusQuery: 'open',
		deadlineWindow: 'overdue',
	},
	taskDueSoon: {
		resource: 'task',
		path: TASKS_PATH,
		statusQuery: 'open',
		deadlineWindow: 'dueSoon',
	},
	newRentalCase: { resource: 'rentalCase', path: RENTAL_CASES_PATH, watermarkField: 'created_at' },
	updatedRentalCase: {
		resource: 'rentalCase',
		path: RENTAL_CASES_PATH,
		compareContent: true,
	},
	rentalCaseReturned: {
		resource: 'rentalCase',
		path: RENTAL_CASES_PATH,
		predicate: (r) => r.status === 'completed',
	},
};

/** Records sampled in manual mode / cap on items emitted per poll. */
const SAMPLE_SIZE = 50;
/** Bound on the persisted seen-UUID set so static data can't grow forever. */
const MAX_SEEN = 2000;

/** Format a Date as the `YYYY-MM-DD` the deadline filters expect. */
function toApiDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** Parse a timestamp/date string to epoch ms; NaN-safe (returns -Infinity). */
function parseTime(value: unknown): number {
	const ms = Date.parse(String(value ?? ''));
	return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

function normalizeForResource(resource: Resource, item: IDataObject): IDataObject {
	if (resource === 'asset') return normalizeAsset(item);
	if (resource === 'rentalCase') return normalizeRentalCase(item);
	return normalizeTask(item);
}

export class SeventhingsTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'seventhings Trigger',
		name: 'seventhingsTrigger',
		icon: { light: 'file:seventhings.svg', dark: 'file:seventhings.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts a workflow when seventhings records change',
		defaults: {
			name: 'seventhings Trigger',
		},
		// Present to satisfy the node-usable-as-tool lint rule. n8n never exposes a
		// polling trigger as an AI agent tool, so this has no runtime effect here;
		// the n8n type only permits `true`, not `false`.
		usableAsTool: true,
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'seventhingsApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'New Asset', value: 'newAsset', description: 'A new asset was created' },
					{
						name: 'New Rental Case',
						value: 'newRentalCase',
						description: 'A new rental case was created',
					},
					{ name: 'New Task', value: 'newTask', description: 'A new task was created' },
					{
						name: 'Rental Case Returned',
						value: 'rentalCaseReturned',
						description: 'A rental case was returned',
					},
					{ name: 'Task Closed', value: 'taskClosed', description: 'A task was closed' },
					{ name: 'Task Due Soon', value: 'taskDueSoon', description: 'A task is due soon' },
					{ name: 'Task Overdue', value: 'taskOverdue', description: 'A task became overdue' },
					{ name: 'Task Reopened', value: 'taskReopened', description: 'A task was reopened' },
					{ name: 'Updated Asset', value: 'updatedAsset', description: 'An asset was updated' },
					{
						name: 'Updated Rental Case',
						value: 'updatedRentalCase',
						description: 'A rental case was updated',
					},
					{ name: 'Updated Task', value: 'updatedTask', description: 'A task was updated' },
				],
				default: 'newAsset',
			},
			{
				displayName: 'Days Ahead',
				name: 'daysAhead',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 3,
				description: 'How many days ahead to look for tasks that are due soon',
				displayOptions: {
					show: {
						event: ['taskDueSoon'],
					},
				},
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event', 0) as string;
		const config = EVENTS[event];
		if (!config) {
			return null;
		}

		// Build the query string. Asset/rental-case lists honor `sort[...]`; the
		// task list ignores it (bare array) and we sort client-side instead.
		const qs: IDataObject = {};
		if (config.watermarkField) {
			qs[`sort[${config.watermarkField}]`] = 'DESC';
			qs.per_page = SAMPLE_SIZE;
		}
		if (config.statusQuery) {
			qs.status = config.statusQuery;
		}
		if (config.resource === 'rentalCase') {
			qs['sort[created_at]'] = 'DESC';
			qs.per_page = SAMPLE_SIZE;
		}

		// Deadline-window events need a date range. `new Date()` is fine here (node
		// runtime, not a workflow script).
		const today = new Date();
		let cutoff = today;
		if (config.deadlineWindow === 'overdue') {
			qs.deadline_to = toApiDay(today);
		} else if (config.deadlineWindow === 'dueSoon') {
			const daysAhead = (this.getNodeParameter('daysAhead', 0) as number) || 3;
			const future = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);
			cutoff = future;
			qs.deadline_from = toApiDay(today);
			qs.deadline_to = toApiDay(future);
		}

		const response = await seventhingsApiRequest.call(this, { path: config.path, qs });

		// Asset/rental-case lists wrap in `{ items }`; the task list is a bare array.
		const rawList: IDataObject[] = Array.isArray(response)
			? (response as IDataObject[])
			: (((response as IDataObject)?.items as IDataObject[] | undefined) ?? []);

		// Normalize (mirrors the right UUID field onto `uuid`, ISO-izes timestamps),
		// then apply the event's client-side status / deadline filters.
		let records = rawList.map((item) => normalizeForResource(config.resource, item));
		if (config.predicate) {
			records = records.filter(config.predicate);
		}
		if (config.deadlineWindow) {
			records = filterDeadlineWindow(records, config.deadlineWindow, today, cutoff);
		}

		const isManual = this.getMode() === 'manual';

		const newItems =
			config.watermarkField
				? filterByWatermark.call(this, event, config.watermarkField, records, isManual)
				: filterBySeenSet.call(this, event, records, isManual, config);

		if (isManual) {
			const sample = newItems.slice(0, SAMPLE_SIZE);
			return sample.length ? [sample.map((json) => ({ json }))] : null;
		}

		return newItems.length ? [newItems.map((json) => ({ json }))] : null;
	}
}

/**
 * Seen-UUID dedupe for task events (no timestamps on the API). Emits each task
 * the first time it appears for this event; remembers the rest. On the first run
 * (empty set) it seeds the set and emits nothing, so activation doesn't replay
 * history. Manual mode ignores the set entirely.
 */
function filterBySeenSet(
	this: IPollFunctions,
	event: string,
	records: IDataObject[],
	isManual: boolean,
	config: EventConfig,
): IDataObject[] {
	if (isManual) {
		return records;
	}

	const staticData = this.getWorkflowStaticData('node');
	const key = `${config.compareContent || config.deadlineWindow ? 'signatures' : 'seen'}_${event}`;
	const seenList = Array.isArray(staticData[key]) ? (staticData[key] as string[]) : undefined;
	const seen = new Set(seenList);
	const firstRun = seenList === undefined;

	const identified = records.filter((record) => Boolean(record.uuid));
	const signature = (record: IDataObject): string => {
		if (config.compareContent) return stableSignature(record);
		if (config.deadlineWindow) return `${record.uuid}-${String(record.deadline).slice(0, 10)}`;
		return String(record.uuid);
	};
	const currentUuids = identified.map(signature);
	const fresh = firstRun ? [] : identified.filter((record) => !seen.has(signature(record)));

	// Persist the current UUIDs (bounded), so a task can re-fire if it leaves and
	// later re-enters this event's status.
	staticData[key] = currentUuids.slice(-MAX_SEEN);

	return fresh;
}

/** Canonical JSON avoids false updates caused only by API object-key ordering. */
function stableSignature(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableSignature).join(',')}]`;
	if (value && typeof value === 'object') {
		const object = value as Record<string, unknown>;
		return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableSignature(object[key])}`).join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

/**
 * High-water-timestamp dedupe for asset / rental-case events. Emits records
 * strictly newer than the stored mark, then advances it. First run seeds the
 * mark and emits nothing. Manual mode ignores the mark.
 */
function filterByWatermark(
	this: IPollFunctions,
	event: string,
	field: 'created_at' | 'updated_at',
	records: IDataObject[],
	isManual: boolean,
): IDataObject[] {
	// Newest-first so the cap keeps the most recent records.
	records.sort((a, b) => parseTime(b[field]) - parseTime(a[field]));

	if (isManual) {
		return records;
	}

	const staticData = this.getWorkflowStaticData('node');
	const markKey = `lastSeen_${event}`;
	const initializedKey = `initialized_${event}`;
	const lastSeen = parseTime(staticData[markKey]);
	const idsKey = `watermarkIds_${event}`;
	const previousIds = Array.isArray(staticData[idsKey]) ? (staticData[idsKey] as string[]) : undefined;
	const seenIds = new Set(previousIds);
	const identity = (record: IDataObject): string => String(record.asset_uuid ?? record.uuid ?? record.id ?? '');

	let newestMs = lastSeen;
	for (const record of records) {
		const ms = parseTime(record[field]);
		if (ms > newestMs) {
			newestMs = ms;
		}
	}

	const firstRun = !staticData[initializedKey] && !staticData[markKey];
	const fresh = records.filter((record) => {
		const ms = parseTime(record[field]);
		return Number.isFinite(ms) && (ms > lastSeen ||
			(ms === lastSeen && previousIds !== undefined && !seenIds.has(identity(record))));
	});
	staticData[initializedKey] = true;
	if (Number.isFinite(newestMs)) {
		staticData[markKey] = new Date(newestMs).toISOString();
		const ids = newestMs === lastSeen ? seenIds : new Set<string>();
		for (const record of records) {
			if (parseTime(record[field]) === newestMs) ids.add(identity(record));
		}
		staticData[idsKey] = [...ids];
	}

	return firstRun ? [] : fresh;
}

/**
 * Re-filter task records by their deadline window, defending against the API
 * ignoring `deadline_from`/`deadline_to`. Overdue = deadline on or before today;
 * due-soon = deadline today or later (the qs bounds the upper end).
 */
function filterDeadlineWindow(
	records: IDataObject[],
	window: 'overdue' | 'dueSoon',
	today: Date,
	cutoff: Date,
): IDataObject[] {
	const todayMs = Date.parse(toApiDay(today));
	return records.filter((record) => {
		const deadline = record.deadline;
		if (!deadline || record.status !== 'open') {
			return false;
		}
		const deadlineMs = parseTime(String(deadline).slice(0, 10));
		if (!Number.isFinite(deadlineMs)) {
			return false;
		}
		if (window === 'overdue') {
			return deadlineMs <= todayMs;
		}
		return deadlineMs >= todayMs && deadlineMs <= Date.parse(toApiDay(cutoff));
	});
}
