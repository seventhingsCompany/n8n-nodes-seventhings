import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	buildFilterObject,
	encodeSdkListOptions,
	fixedCollectionRows,
	idFromLocationIdHeader,
	normalizeCircularityHubItem,
	normalizeCircularityHubOrder,
	parseJsonObject,
	readFilterRows,
	readSortRows,
	seventhingsApiRequest,
} from '../../transport';

const HUB_PATH = '/customer-api/v1/circularity-hub';

type HubHandler = (this: IExecuteFunctions, i: number) => Promise<INodeExecutionData[]>;
type HubKind = 'item' | 'order';

function getNumericId(this: IExecuteFunctions, i: number): number {
	const id = this.getNodeParameter('id', i) as number;
	if (!Number.isInteger(id) || id <= 0) {
		throw new NodeOperationError(this.getNode(), 'A positive numeric ID is required.', {
			itemIndex: i,
		});
	}
	return id;
}

function parseObjectParameter(
	this: IExecuteFunctions,
	i: number,
	name: string,
	label: string,
): IDataObject {
	const result = parseJsonObject(this.getNodeParameter(name, i, '{}'), label);
	if (!result.ok) {
		throw new NodeOperationError(this.getNode(), result.message, { itemIndex: i });
	}
	return result.value;
}

function suggestionResult(response: unknown): IDataObject {
	if (Array.isArray(response) && response.length === 0) {
		return { result: null };
	}
	if (response && typeof response === 'object' && !Array.isArray(response)) {
		return response as IDataObject;
	}
	return { result: response as IDataObject[string] };
}

function listParameters(this: IExecuteFunctions, i: number) {
	const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
	const limit = returnAll ? Number.POSITIVE_INFINITY : (this.getNodeParameter('limit', i, 50) as number);
	const filters = readFilterRows(this.getNodeParameter('filterRows', i, {}));
	const sort = readSortRows(this.getNodeParameter('sortRows', i, {}));
	return { returnAll, limit, filters, sort };
}

async function collectList(
	this: IExecuteFunctions,
	kind: HubKind,
	returnAll: boolean,
	limit: number,
	filters: ReturnType<typeof readFilterRows>,
	sort: ReturnType<typeof readSortRows>,
): Promise<IDataObject[]> {
	const collected: IDataObject[] = [];
	let page = 1;
	const perPage = returnAll ? 100 : Math.min(limit, 100);
	const path = kind === 'item' ? `${HUB_PATH}/items` : `${HUB_PATH}/orders`;

	for (;;) {
		const response = (await seventhingsApiRequest.call(this, {
			path,
			qs: encodeSdkListOptions({ page, perPage, filters, sort }),
		})) as IDataObject;
		const items = Array.isArray(response.items) ? (response.items as IDataObject[]) : [];
		collected.push(
			...items.map((item) =>
				kind === 'item' ? normalizeCircularityHubItem(item) : normalizeCircularityHubOrder(item),
			),
		);

		if ((!returnAll && collected.length >= limit) || items.length < perPage) {
			break;
		}
		page += 1;
	}

	return returnAll ? collected : collected.slice(0, limit);
}

function addObjectEntries(this: IExecuteFunctions, i: number): IDataObject {
	const rows = fixedCollectionRows(this.getNodeParameter('objects', i, {}), 'entries');
	const body: IDataObject = {};
	for (const row of rows) {
		const assetUuid = String(row.assetUuid ?? '').trim();
		const category = String(row.category ?? '').trim();
		const price = String(row.price ?? '').trim();
		if (assetUuid && category && price) {
			body[assetUuid] = { category, price };
		}
	}
	if (Object.keys(body).length === 0) {
		throw new NodeOperationError(this.getNode(), 'Add objects: provide at least one object.', {
			itemIndex: i,
		});
	}
	return body;
}

async function fetchItem(this: IExecuteFunctions, id: number): Promise<IDataObject> {
	const item = (await seventhingsApiRequest.call(this, {
		path: `${HUB_PATH}/item/${id}`,
	})) as IDataObject;
	return normalizeCircularityHubItem(item);
}

async function fetchOrder(this: IExecuteFunctions, id: number): Promise<IDataObject> {
	const order = (await seventhingsApiRequest.call(this, {
		path: `${HUB_PATH}/order/${id}`,
	})) as IDataObject;
	return normalizeCircularityHubOrder(order);
}

export const circularityHubItemHandlers: Record<string, HubHandler> = {
	async suggestCategory(this: IExecuteFunctions, i: number) {
		const filters = readFilterRows(this.getNodeParameter('filterRows', i, {}));
		const sort = readSortRows(this.getNodeParameter('sortRows', i, {}));
		const response = await seventhingsApiRequest.call(this, {
			method: 'POST',
			path: `${HUB_PATH}/suggest-category`,
			body: buildFilterObject(filters, sort),
			headers: { 'Content-Type': 'application/json' },
		});
		return [{ json: suggestionResult(response), pairedItem: { item: i } }];
	},

	async suggestRestPrice(this: IExecuteFunctions, i: number) {
		const body = parseObjectParameter.call(this, i, 'inputFields', 'Input Fields');
		const response = await seventhingsApiRequest.call(this, {
			method: 'POST',
			path: `${HUB_PATH}/suggest-rest-price`,
			body,
			headers: { 'Content-Type': 'application/json' },
		});
		return [{ json: suggestionResult(response), pairedItem: { item: i } }];
	},

	async addObjects(this: IExecuteFunctions, i: number) {
		const body = addObjectEntries.call(this, i);
		await seventhingsApiRequest.call(this, {
			method: 'POST',
			path: `${HUB_PATH}/add-objects-to-circularity-hub`,
			body,
			headers: { 'Content-Type': 'application/json' },
		});
		return [{ json: { added: true, objects: body }, pairedItem: { item: i } }];
	},

	async get(this: IExecuteFunctions, i: number) {
		const id = getNumericId.call(this, i);
		const json = await fetchItem.call(this, id);
		return [{ json, pairedItem: { item: i } }];
	},

	async getAll(this: IExecuteFunctions, i: number) {
		const params = listParameters.call(this, i);
		const records = await collectList.call(this, 'item', params.returnAll, params.limit, params.filters, params.sort);
		return records.map((json) => ({ json, pairedItem: { item: i } }));
	},

	async update(this: IExecuteFunctions, i: number) {
		const id = getNumericId.call(this, i);
		const fields = parseObjectParameter.call(this, i, 'fields', 'Fields');
		await seventhingsApiRequest.call(this, {
			method: 'PATCH',
			path: `${HUB_PATH}/item/${id}`,
			body: fields,
			headers: { 'Content-Type': 'application/json' },
		});
		const json = await fetchItem.call(this, id);
		return [{ json, pairedItem: { item: i } }];
	},

	async delete(this: IExecuteFunctions, i: number) {
		const id = getNumericId.call(this, i);
		await seventhingsApiRequest.call(this, {
			method: 'DELETE',
			path: `${HUB_PATH}/item/${id}`,
		});
		return [{ json: { id, deleted: true }, pairedItem: { item: i } }];
	},
};

export const circularityHubOrderHandlers: Record<string, HubHandler> = {
	async create(this: IExecuteFunctions, i: number) {
		const rawIds = (this.getNodeParameter('itemIds', i, []) as string[]) ?? [];
		const itemIds = rawIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
		if (itemIds.length === 0) {
			throw new NodeOperationError(this.getNode(), 'Create order: provide at least one item ID.', {
				itemIndex: i,
			});
		}

		const response = (await seventhingsApiRequest.call(this, {
			method: 'POST',
			path: `${HUB_PATH}/orders`,
			body: itemIds as unknown as IDataObject[],
			headers: { 'Content-Type': 'application/json' },
			returnFullResponse: true,
		})) as { body?: IDataObject; headers?: IDataObject };
		const id = idFromLocationIdHeader(response.headers);
		const json = id ? await fetchOrder.call(this, id) : { created: true, item_ids: itemIds };
		return [{ json, pairedItem: { item: i } }];
	},

	async get(this: IExecuteFunctions, i: number) {
		const id = getNumericId.call(this, i);
		const json = await fetchOrder.call(this, id);
		return [{ json, pairedItem: { item: i } }];
	},

	async getAll(this: IExecuteFunctions, i: number) {
		const params = listParameters.call(this, i);
		const records = await collectList.call(this, 'order', params.returnAll, params.limit, params.filters, params.sort);
		return records.map((json) => ({ json, pairedItem: { item: i } }));
	},

	async update(this: IExecuteFunctions, i: number) {
		const id = getNumericId.call(this, i);
		const fields = parseObjectParameter.call(this, i, 'fields', 'Fields');
		await seventhingsApiRequest.call(this, {
			method: 'PATCH',
			path: `${HUB_PATH}/order/${id}`,
			body: fields,
			headers: { 'Content-Type': 'application/json' },
		});
		const json = await fetchOrder.call(this, id);
		return [{ json, pairedItem: { item: i } }];
	},
};

export function isCircularityHubItemOperationSupported(operation: string): boolean {
	return operation in circularityHubItemHandlers;
}

export function isCircularityHubOrderOperationSupported(operation: string): boolean {
	return operation in circularityHubOrderHandlers;
}

export async function executeCircularityHubItemOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const handler = circularityHubItemHandlers[operation];
	if (!handler) {
		throw new NodeOperationError(
			this.getNode(),
			`The Circularity Hub item operation "${operation}" is not implemented yet.`,
			{ itemIndex: i },
		);
	}
	return handler.call(this, i);
}

export async function executeCircularityHubOrderOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const handler = circularityHubOrderHandlers[operation];
	if (!handler) {
		throw new NodeOperationError(
			this.getNode(),
			`The Circularity Hub order operation "${operation}" is not implemented yet.`,
			{ itemIndex: i },
		);
	}
	return handler.call(this, i);
}
