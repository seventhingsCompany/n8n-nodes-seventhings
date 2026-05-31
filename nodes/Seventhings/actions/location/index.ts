/**
 * Location operation handlers.
 *
 * Each handler runs one Location operation for a single input item and returns
 * the resulting execution-data array (Get Many can return several items; the
 * rest return one). Ported from the Zapier `lib/location_crud.js` helper. Per
 * the Phase 3/4 lessons (the Zapier source is not a faithful contract), the
 * request shapes here are to be **verified against the live tenant**:
 *   - The Zapier source updates via PATCH with a partial body. We instead use
 *     the fetch-merge-PUT pattern (consistent with Task / Rental Case); if the
 *     live API rejects PUT for this resource (404), switch to PATCH.
 *   - The list endpoint is expected to return an `{ items }` wrapper with a
 *     `filter[name][like]` filter and `per_page`/`page` pagination; we read the
 *     items array and slice client-side as a safeguard.
 *
 * Endpoints (all relative to the tenant base URL built in transport):
 *   create   POST   /customer-api/v1/location          (Location header → GET)
 *   update   PUT    /customer-api/v1/location/{uuid}    (fetch-merge-PUT, then GET)
 *   get      GET    /customer-api/v1/location/{uuid}
 *   getAll   GET    /customer-api/v1/locations          (filter/paginate)
 *   delete   DELETE /customer-api/v1/location/{uuid}
 */

import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	locationHeader,
	normalizeLocation,
	seventhingsApiRequest,
	uuidFromLocation,
	validateUuid,
} from '../../transport';

const LOCATION_PATH = '/customer-api/v1/location';
const LOCATIONS_PATH = '/customer-api/v1/locations';

/** Read the location UUID from the resourceLocator parameter and validate it. */
function getLocationUuid(this: IExecuteFunctions, i: number): string {
	const value = this.getNodeParameter('locationId', i, undefined, {
		extractValue: true,
	}) as string;
	try {
		return validateUuid(value, 'Location UUID');
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
	}
}

/** The writable location fields (fixed schema — no tenant field-definitions). */
interface LocationBody extends IDataObject {
	name?: string;
	address?: string;
	city?: string;
	country?: string;
}

/** The optional address fields a location carries, beyond its required name. */
const LOCATION_OPTIONAL_KEYS = ['address', 'city', 'country'] as const;

/** GET a location by UUID and normalize it (used after create/update). */
async function fetchLocation(this: IExecuteFunctions, uuid: string): Promise<IDataObject> {
	const record = (await seventhingsApiRequest.call(this, {
		path: `${LOCATION_PATH}/${uuid}`,
	})) as IDataObject;
	return normalizeLocation(record, uuid);
}

/** POST a new location, read the created UUID from Location, then GET it back. */
async function createLocation(
	this: IExecuteFunctions,
	i: number,
	body: LocationBody,
): Promise<IDataObject> {
	const response = (await seventhingsApiRequest.call(this, {
		method: 'POST',
		path: LOCATION_PATH,
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
			'Create location: the API did not return a UUID for the new location.',
			{ itemIndex: i },
		);
	}

	return fetchLocation.call(this, uuid);
}

/** Build the Get Many query string from the Filters collection. */
function buildFiltersQs(filters: IDataObject): IDataObject {
	const qs: IDataObject = {};
	if (filters.name !== undefined && filters.name !== '') {
		qs['filter[name][like]'] = filters.name as IDataObject[string];
	}
	return qs;
}

type LocationHandler = (this: IExecuteFunctions, i: number) => Promise<INodeExecutionData[]>;

const handlers: Record<string, LocationHandler> = {
	async create(this: IExecuteFunctions, i: number) {
		const body: LocationBody = { name: this.getNodeParameter('name', i) as string };
		const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		for (const key of LOCATION_OPTIONAL_KEYS) {
			const value = additional[key];
			if (value !== undefined && value !== '') {
				body[key] = value as string;
			}
		}
		const created = await createLocation.call(this, i, body);
		return [{ json: created, pairedItem: { item: i } }];
	},

	async update(this: IExecuteFunctions, i: number) {
		const uuid = getLocationUuid.call(this, i);
		const updates = this.getNodeParameter('updateFields', i, {}) as IDataObject;

		if (Object.keys(updates).length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				'Update location: provide at least one field to update.',
				{ itemIndex: i },
			);
		}

		// The API accepts a PATCH partial body (PUT is not supported — 404), so we
		// send only the fields the user set.
		const body: LocationBody = {};
		if (updates.name !== undefined && updates.name !== '') {
			body.name = updates.name as string;
		}
		for (const key of LOCATION_OPTIONAL_KEYS) {
			const value = updates[key];
			if (value !== undefined) {
				body[key] = value as string;
			}
		}

		await seventhingsApiRequest.call(this, {
			method: 'PATCH',
			path: `${LOCATION_PATH}/${uuid}`,
			body,
			headers: { 'Content-Type': 'application/json' },
		});

		const updated = await fetchLocation.call(this, uuid);
		return [{ json: updated, pairedItem: { item: i } }];
	},

	async get(this: IExecuteFunctions, i: number) {
		const uuid = getLocationUuid.call(this, i);
		const record = await fetchLocation.call(this, uuid);
		return [{ json: record, pairedItem: { item: i } }];
	},

	async getAll(this: IExecuteFunctions, i: number) {
		const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const limit = returnAll ? undefined : (this.getNodeParameter('limit', i, 50) as number);

		// The locations endpoint returns an `{ items }` wrapper. Request per_page
		// when a limit applies; read the items array and slice as a safeguard.
		const response = (await seventhingsApiRequest.call(this, {
			path: LOCATIONS_PATH,
			qs: {
				...(limit !== undefined ? { per_page: limit } : {}),
				...buildFiltersQs(filters),
			},
		})) as IDataObject;

		const list = Array.isArray(response.items) ? (response.items as IDataObject[]) : [];
		const normalized = list.map((location) => normalizeLocation(location));
		const limited = limit === undefined ? normalized : normalized.slice(0, limit);

		return limited.map((json) => ({ json, pairedItem: { item: i } }));
	},

	async delete(this: IExecuteFunctions, i: number) {
		const uuid = getLocationUuid.call(this, i);
		await seventhingsApiRequest.call(this, {
			method: 'DELETE',
			path: `${LOCATION_PATH}/${uuid}`,
		});
		return [{ json: { uuid, deleted: true }, pairedItem: { item: i } }];
	},
};

/** True when this Location operation is implemented in Phase 5. */
export function isLocationOperationSupported(operation: string): boolean {
	return operation in handlers;
}

/** Run a Location operation for input item `i`. */
export async function executeLocationOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const handler = handlers[operation];
	if (!handler) {
		throw new NodeOperationError(
			this.getNode(),
			`The location operation "${operation}" is not implemented yet.`,
			{ itemIndex: i },
		);
	}
	return handler.call(this, i);
}
