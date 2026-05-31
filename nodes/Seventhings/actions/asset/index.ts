/**
 * Asset operation handlers.
 *
 * Each handler runs one Asset operation for a single input item and returns the
 * resulting execution-data array (Get Many can return several items; the rest
 * return one). Ported from the Zapier `lib/asset_*.js` helpers and the
 * `creates/` + `searches/` asset actions.
 *
 * Endpoints (all relative to the tenant base URL built in transport):
 *   create            POST   /customer-api/v1/object              (Location → GET)
 *   update            PATCH  /customer-api/v1/object/{uuid}        (then GET)
 *   get               GET    /customer-api/v1/object/{uuid}
 *   getAll            GET    /customer-api/v1/objects              (filter/sort/paginate)
 *   archive/unarchive POST   /customer-api/v1/object/{uuid}/{archive|unarchive}
 *   delete            DELETE /customer-api/v1/object/{uuid}
 *   moveToLocation    PATCH  /customer-api/v1/object/{uuid}  { location }
 *   moveToRoom        PATCH  /customer-api/v1/object/{uuid}  { room }
 *   attachFile        POST   /customer-api/v1/object/{uuid}/add-file     [{ field-key, file-uuid }]
 *   detachFile        POST   /customer-api/v1/object/{uuid}/remove-file  [{ field-key, file-uuid }]
 */

import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	coerceFieldValues,
	fetchAssetFieldDefinitions,
	locationHeader,
	normalizeAsset,
	seventhingsApiRequest,
	uuidFromLocation,
	validateUuid,
} from '../../transport';

const OBJECT_PATH = '/customer-api/v1/object';
const OBJECTS_PATH = '/customer-api/v1/objects';

/**
 * Build the query-string fragment for an equality filter on the objects
 * endpoint. The API keys the filter by operator: `filter[<key>][eq]=<value>`.
 * The scalar (`filter[key]=v`) and array (`filter[key][]=v`) forms are rejected
 * with HTTP 500.
 */
function buildFilterQs(fieldKey: string, value: string): IDataObject {
	return {
		[`filter[${fieldKey}][eq]`]: value,
	};
}

/** Read the asset UUID from the resourceLocator parameter and validate it. */
function getAssetUuid(this: IExecuteFunctions, i: number): string {
	const value = this.getNodeParameter('assetId', i, undefined, {
		extractValue: true,
	}) as string;
	try {
		return validateUuid(value, 'Asset UUID');
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
	}
}

/** Read the resourceMapper values for the dynamic asset fields. */
function getMappedFields(this: IExecuteFunctions, i: number): IDataObject {
	const fields = this.getNodeParameter('fields', i, {}) as IDataObject;
	return (fields.value as IDataObject | null) ?? {};
}

/** GET an asset by UUID and normalize it (used after create/update/archive). */
async function fetchAsset(
	this: IExecuteFunctions,
	uuid: string,
): Promise<IDataObject> {
	const record = (await seventhingsApiRequest.call(this, {
		path: `${OBJECT_PATH}/${uuid}`,
	})) as IDataObject;
	return normalizeAsset(record, uuid);
}

/** POST a new asset, read the created UUID from Location, then GET it back. */
async function createAsset(
	this: IExecuteFunctions,
	i: number,
	body: IDataObject,
): Promise<IDataObject> {
	const response = (await seventhingsApiRequest.call(this, {
		method: 'POST',
		path: OBJECT_PATH,
		body,
		headers: { 'Content-Type': 'application/json' },
		returnFullResponse: true,
	})) as { body?: IDataObject; headers?: IDataObject };

	const responseBody = (response.body ?? {}) as IDataObject;
	const uuid =
		uuidFromLocation(locationHeader(response.headers)) ??
		(responseBody.uuid as string | undefined) ??
		(responseBody.asset_uuid as string | undefined);

	if (!uuid) {
		throw new NodeOperationError(
			this.getNode(),
			'Create asset: the API did not return a UUID for the new asset.',
			{ itemIndex: i },
		);
	}

	return fetchAsset.call(this, uuid);
}

/**
 * Find assets whose `fieldKey` equals `value` (case-insensitive), newest first.
 * Mirrors the Zapier `findAssetsByField`.
 */
async function findAssetsByField(
	this: IExecuteFunctions,
	fieldKey: string,
	value: string,
): Promise<IDataObject[]> {
	const response = (await seventhingsApiRequest.call(this, {
		path: OBJECTS_PATH,
		qs: {
			...buildFilterQs(fieldKey, value),
			'sort[updated_at]': 'DESC',
			per_page: 50,
		},
	})) as IDataObject;

	const items = (response?.items as IDataObject[] | undefined) ?? [];
	const target = value.toLowerCase();
	return items
		.filter((item) => {
			const actual = item[fieldKey];
			return actual != null && String(actual).toLowerCase() === target;
		})
		.map((item) => normalizeAsset(item));
}

type AssetHandler = (
	this: IExecuteFunctions,
	i: number,
) => Promise<INodeExecutionData[]>;

const handlers: Record<string, AssetHandler> = {
	async create(this: IExecuteFunctions, i: number) {
		const defs = await fetchAssetFieldDefinitions.call(this);
		const mapped = getMappedFields.call(this, i);
		const findOrCreate = this.getNodeParameter('findOrCreate', i, false) as boolean;

		const body = coerceFieldValues(defs, mapped);

		if (findOrCreate) {
			const matchFieldKey = this.getNodeParameter('matchFieldKey', i) as string;
			const matchValue = this.getNodeParameter('matchValue', i) as string;

			const matches = await findAssetsByField.call(this, matchFieldKey, matchValue);
			if (matches.length > 0) {
				return [{ json: matches[0], pairedItem: { item: i } }];
			}
			// No match: create, seeding the match field with the search value.
			body[matchFieldKey] = matchValue;
		}

		const created = await createAsset.call(this, i, body);
		return [{ json: created, pairedItem: { item: i } }];
	},

	async update(this: IExecuteFunctions, i: number) {
		const uuid = getAssetUuid.call(this, i);
		const defs = await fetchAssetFieldDefinitions.call(this);
		const body = coerceFieldValues(defs, getMappedFields.call(this, i));

		if (Object.keys(body).length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				'Update asset: provide at least one field to update.',
				{ itemIndex: i },
			);
		}

		await seventhingsApiRequest.call(this, {
			method: 'PATCH',
			path: `${OBJECT_PATH}/${uuid}`,
			body,
			headers: { 'Content-Type': 'application/json' },
		});

		const updated = await fetchAsset.call(this, uuid);
		return [{ json: updated, pairedItem: { item: i } }];
	},

	async get(this: IExecuteFunctions, i: number) {
		const uuid = getAssetUuid.call(this, i);
		const record = await fetchAsset.call(this, uuid);
		return [{ json: record, pairedItem: { item: i } }];
	},

	async getAll(this: IExecuteFunctions, i: number) {
		const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
		const filterFieldKey = this.getNodeParameter('filterFieldKey', i, '') as string;
		const filterValue = this.getNodeParameter('filterValue', i, '') as string;

		const qs: IDataObject = { 'sort[updated_at]': 'DESC' };
		if (filterFieldKey && filterValue !== '') {
			Object.assign(qs, buildFilterQs(filterFieldKey, filterValue));
		}

		const limit = returnAll
			? Number.POSITIVE_INFINITY
			: (this.getNodeParameter('limit', i, 50) as number);

		const collected: IDataObject[] = [];
		let page = 1;
		const perPage = 100;

		// Paginate until we have enough (Limit) or the API returns a short page.
		for (;;) {
			const response = (await seventhingsApiRequest.call(this, {
				path: OBJECTS_PATH,
				qs: { ...qs, per_page: perPage, page },
			})) as IDataObject;

			const items = (response?.items as IDataObject[] | undefined) ?? [];
			for (const item of items) {
				collected.push(normalizeAsset(item));
				if (collected.length >= limit) {
					break;
				}
			}

			if (collected.length >= limit || items.length < perPage) {
				break;
			}
			page += 1;
		}

		const sliced = returnAll ? collected : collected.slice(0, limit);
		return sliced.map((json) => ({ json, pairedItem: { item: i } }));
	},

	async archive(this: IExecuteFunctions, i: number) {
		return setArchiveState.call(this, i, 'archive');
	},

	async unarchive(this: IExecuteFunctions, i: number) {
		return setArchiveState.call(this, i, 'unarchive');
	},

	async delete(this: IExecuteFunctions, i: number) {
		const uuid = getAssetUuid.call(this, i);
		await seventhingsApiRequest.call(this, {
			method: 'DELETE',
			path: `${OBJECT_PATH}/${uuid}`,
		});
		return [{ json: { asset_uuid: uuid, deleted: true }, pairedItem: { item: i } }];
	},

	async moveToLocation(this: IExecuteFunctions, i: number) {
		const uuid = getAssetUuid.call(this, i);
		const location = this.getNodeParameter('location', i) as string;
		return patchAndFetch.call(this, i, uuid, { location });
	},

	async moveToRoom(this: IExecuteFunctions, i: number) {
		const uuid = getAssetUuid.call(this, i);
		const room = this.getNodeParameter('room', i) as string;
		return patchAndFetch.call(this, i, uuid, { room });
	},

	async attachFile(this: IExecuteFunctions, i: number) {
		return setAssetFile.call(this, i, 'add-file', 'attached');
	},

	async detachFile(this: IExecuteFunctions, i: number) {
		return setAssetFile.call(this, i, 'remove-file', 'detached');
	},
};

/**
 * Attach or detach a file on an asset's ATTACHMENT field.
 *
 * Mirrors the Zapier `setAssetFiles`: POSTs a single-element array with the
 * kebab-case keys the API expects (`field-key`, `file-uuid`).
 *
 * Verified live against the loadtest tenant:
 *   - A successful attach/detach returns HTTP 200 with an empty body; the
 *     attached document's `uuid` equals the supplied file UUID.
 *   - If the target field is already occupied (some fields hold a single file),
 *     the API returns HTTP 207 with a per-item message like
 *     `["File ... already exists in field key ..."]` and does NOT add the file.
 *     n8n surfaces that 207 as a `NodeApiError` carrying the message — a clear,
 *     actionable failure — so no special handling is added here.
 */
async function setAssetFile(
	this: IExecuteFunctions,
	i: number,
	action: 'add-file' | 'remove-file',
	resultFlag: 'attached' | 'detached',
): Promise<INodeExecutionData[]> {
	const assetUuid = getAssetUuid.call(this, i);
	const fieldKey = (this.getNodeParameter('fieldKey', i, '') as string).trim();
	const fileInput = this.getNodeParameter('fileUuid', i, '') as string;

	if (!fieldKey) {
		throw new NodeOperationError(
			this.getNode(),
			'Provide the attachment field to attach the file to.',
			{ itemIndex: i },
		);
	}

	let fileUuid: string;
	try {
		fileUuid = validateUuid(fileInput, 'File UUID');
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
	}

	await seventhingsApiRequest.call(this, {
		method: 'POST',
		path: `${OBJECT_PATH}/${assetUuid}/${action}`,
		body: [{ 'field-key': fieldKey, 'file-uuid': fileUuid }],
		headers: { 'Content-Type': 'application/json' },
	});

	return [
		{
			json: {
				asset_uuid: assetUuid,
				field_key: fieldKey,
				file_uuid: fileUuid,
				[resultFlag]: true,
			},
			pairedItem: { item: i },
		},
	];
}

/** PATCH an asset with `body`, then GET and return the refreshed record. */
async function patchAndFetch(
	this: IExecuteFunctions,
	i: number,
	uuid: string,
	body: IDataObject,
): Promise<INodeExecutionData[]> {
	await seventhingsApiRequest.call(this, {
		method: 'PATCH',
		path: `${OBJECT_PATH}/${uuid}`,
		body,
		headers: { 'Content-Type': 'application/json' },
	});
	const record = await fetchAsset.call(this, uuid);
	return [{ json: record, pairedItem: { item: i } }];
}

/** Archive or unarchive an asset, then GET and return the refreshed record. */
async function setArchiveState(
	this: IExecuteFunctions,
	i: number,
	action: 'archive' | 'unarchive',
): Promise<INodeExecutionData[]> {
	const uuid = getAssetUuid.call(this, i);
	await seventhingsApiRequest.call(this, {
		method: 'POST',
		path: `${OBJECT_PATH}/${uuid}/${action}`,
		headers: { 'Content-Type': 'application/json' },
	});
	const record = await fetchAsset.call(this, uuid);
	// The GET response carries no `archived` boolean, so synthesize one from the
	// action just performed (mirrors the Zapier helper) — otherwise callers can't
	// tell the archive/unarchive succeeded.
	record.archived = action === 'archive';
	return [{ json: record, pairedItem: { item: i } }];
}

/** True when this Asset operation is implemented in Phase 2. */
export function isAssetOperationSupported(operation: string): boolean {
	return operation in handlers;
}

/** Run an Asset operation for input item `i`. */
export async function executeAssetOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const handler = handlers[operation];
	if (!handler) {
		throw new NodeOperationError(
			this.getNode(),
			`The asset operation "${operation}" is not implemented yet.`,
			{ itemIndex: i },
		);
	}
	return handler.call(this, i);
}
