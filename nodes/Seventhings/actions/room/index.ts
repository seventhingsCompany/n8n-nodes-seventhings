/**
 * Room operation handlers.
 *
 * Each handler runs one Room operation for a single input item and returns the
 * resulting execution-data array (Get Many can return several items; the rest
 * return one). Ported from the Zapier `lib/room_crud.js` helper. A room belongs
 * to a building (location) referenced by an **integer `building_id`**, not a
 * UUID — the one resource in this integration keyed off an integer id.
 *
 * Verified against the live tenant:
 *   - Rooms carry tenant-specific dynamic custom fields (some server-side
 *     mandatory), so Create/Update are driven by a **resourceMapper** over the
 *     room field-definitions plus a dedicated Building (location) dropdown for
 *     the integer `building_id`. Submitted values are coerced to the right type.
 *   - Update is **PATCH** with a partial body (PUT → 404). Create returns 201
 *     with an empty body and the UUID in the `Location` header.
 *   - The list endpoint returns an `{ items }` wrapper and honors
 *     `filter[name][like]` / `filter[building_id][eq]` / `per_page`.
 *
 * Endpoints (all relative to the tenant base URL built in transport):
 *   create   POST   /customer-api/v1/room          (Location header → GET)
 *   update   PATCH  /customer-api/v1/room/{uuid}    (partial body, then GET)
 *   get      GET    /customer-api/v1/room/{uuid}
 *   getAll   GET    /customer-api/v1/rooms          (filter/paginate)
 *   delete   DELETE /customer-api/v1/room/{uuid}
 */

import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	coerceRoomFieldValues,
	fetchRoomFieldDefinitions,
	locationHeader,
	normalizeRoom,
	seventhingsApiRequest,
	uuidFromLocation,
	validateUuid,
} from '../../transport';

const ROOM_PATH = '/customer-api/v1/room';
const ROOMS_PATH = '/customer-api/v1/rooms';

/** Read the room UUID from the resourceLocator parameter and validate it. */
function getRoomUuid(this: IExecuteFunctions, i: number): string {
	const value = this.getNodeParameter('roomId', i, undefined, {
		extractValue: true,
	}) as string;
	try {
		return validateUuid(value, 'Room UUID');
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
	}
}

/** Coerce a building-id value (dropdown option / pasted number) to a number. */
function toBuildingId(value: unknown): number | undefined {
	if (value === undefined || value === null || value === '') {
		return undefined;
	}
	const num = Number(value);
	return Number.isNaN(num) ? undefined : num;
}

/** Read the resourceMapper values for the dynamic room fields. */
function getMappedFields(this: IExecuteFunctions, i: number): IDataObject {
	const fields = this.getNodeParameter('fields', i, {}) as IDataObject;
	return (fields.value as IDataObject | null) ?? {};
}

/**
 * Build a room request body from the resourceMapper fields (coerced to the right
 * types) plus the Building dropdown. `building_id` lives outside the mapper
 * because resourceMapper option fields can't load their options dynamically.
 */
async function buildRoomBody(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const defs = await fetchRoomFieldDefinitions.call(this);
	const body = coerceRoomFieldValues(defs, getMappedFields.call(this, i));
	const buildingId = toBuildingId(this.getNodeParameter('buildingId', i, '') as unknown);
	if (buildingId !== undefined) {
		body.building_id = buildingId;
	}
	return body;
}

/** GET a room by UUID and normalize it (used after create/update). */
async function fetchRoom(this: IExecuteFunctions, uuid: string): Promise<IDataObject> {
	const record = (await seventhingsApiRequest.call(this, {
		path: `${ROOM_PATH}/${uuid}`,
	})) as IDataObject;
	return normalizeRoom(record, uuid);
}

/** POST a new room, read the created UUID from Location, then GET it back. */
async function createRoom(
	this: IExecuteFunctions,
	i: number,
	body: IDataObject,
): Promise<IDataObject> {
	const response = (await seventhingsApiRequest.call(this, {
		method: 'POST',
		path: ROOM_PATH,
		body,
		headers: { 'Content-Type': 'application/json' },
		returnFullResponse: true,
	})) as { body?: IDataObject; headers?: IDataObject };

	const responseBody = (response.body ?? {}) as IDataObject;
	const uuid =
		uuidFromLocation(locationHeader(response.headers)) ?? (responseBody.uuid as string | undefined);

	if (!uuid) {
		throw new NodeOperationError(
			this.getNode(),
			'Create room: the API did not return a UUID for the new room.',
			{ itemIndex: i },
		);
	}

	return fetchRoom.call(this, uuid);
}

/** Build the Get Many query string from the Filters collection. */
function buildFiltersQs(filters: IDataObject): IDataObject {
	const qs: IDataObject = {};
	if (filters.name !== undefined && filters.name !== '') {
		qs['filter[name][like]'] = filters.name as IDataObject[string];
	}
	const buildingId = toBuildingId(filters.buildingId);
	if (buildingId !== undefined) {
		qs['filter[building_id][eq]'] = buildingId;
	}
	return qs;
}

type RoomHandler = (this: IExecuteFunctions, i: number) => Promise<INodeExecutionData[]>;

const handlers: Record<string, RoomHandler> = {
	async create(this: IExecuteFunctions, i: number) {
		const buildingId = toBuildingId(this.getNodeParameter('buildingId', i, '') as unknown);
		if (buildingId === undefined) {
			throw new NodeOperationError(
				this.getNode(),
				'Create room: a building (location) is required.',
				{ itemIndex: i },
			);
		}

		const body = await buildRoomBody.call(this, i);
		const created = await createRoom.call(this, i, body);
		return [{ json: created, pairedItem: { item: i } }];
	},

	async update(this: IExecuteFunctions, i: number) {
		const uuid = getRoomUuid.call(this, i);

		// PATCH partial body: send only the mapped fields the user set, plus the
		// Building dropdown if changed (PUT is not supported — 404).
		const body = await buildRoomBody.call(this, i);

		if (Object.keys(body).length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				'Update room: provide at least one field to update.',
				{ itemIndex: i },
			);
		}

		await seventhingsApiRequest.call(this, {
			method: 'PATCH',
			path: `${ROOM_PATH}/${uuid}`,
			body,
			headers: { 'Content-Type': 'application/json' },
		});

		const updated = await fetchRoom.call(this, uuid);
		return [{ json: updated, pairedItem: { item: i } }];
	},

	async get(this: IExecuteFunctions, i: number) {
		const uuid = getRoomUuid.call(this, i);
		const record = await fetchRoom.call(this, uuid);
		return [{ json: record, pairedItem: { item: i } }];
	},

	async getAll(this: IExecuteFunctions, i: number) {
		const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const limit = returnAll ? undefined : (this.getNodeParameter('limit', i, 50) as number);

		// The rooms endpoint returns an `{ items }` wrapper. Request per_page when
		// a limit applies; read the items array and slice as a safeguard.
		const response = (await seventhingsApiRequest.call(this, {
			path: ROOMS_PATH,
			qs: {
				...(limit !== undefined ? { per_page: limit } : {}),
				...buildFiltersQs(filters),
			},
		})) as IDataObject;

		const list = Array.isArray(response.items) ? (response.items as IDataObject[]) : [];
		const normalized = list.map((room) => normalizeRoom(room));
		const limited = limit === undefined ? normalized : normalized.slice(0, limit);

		return limited.map((json) => ({ json, pairedItem: { item: i } }));
	},

	async delete(this: IExecuteFunctions, i: number) {
		const uuid = getRoomUuid.call(this, i);
		await seventhingsApiRequest.call(this, {
			method: 'DELETE',
			path: `${ROOM_PATH}/${uuid}`,
		});
		return [{ json: { uuid, deleted: true }, pairedItem: { item: i } }];
	},
};

/** True when this Room operation is implemented in Phase 5. */
export function isRoomOperationSupported(operation: string): boolean {
	return operation in handlers;
}

/** Run a Room operation for input item `i`. */
export async function executeRoomOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const handler = handlers[operation];
	if (!handler) {
		throw new NodeOperationError(
			this.getNode(),
			`The room operation "${operation}" is not implemented yet.`,
			{ itemIndex: i },
		);
	}
	return handler.call(this, i);
}
