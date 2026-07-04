import type { IDataObject, ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';

import {
	normalizeCircularityHubItem,
	normalizeCircularityHubOrder,
	seventhingsApiRequest,
} from '../transport';

function itemLabel(item: IDataObject, id: string): string {
	const text =
		typeof item.name === 'string' && item.name.trim() !== ''
			? item.name
			: typeof item.title === 'string' && item.title.trim() !== ''
				? item.title
				: id;
	return text === id ? id : `${text} (${id})`;
}

async function searchHubList(
	this: ILoadOptionsFunctions,
	path: string,
	filter: string | undefined,
	kind: 'item' | 'order',
): Promise<INodeListSearchResult> {
	const response = (await seventhingsApiRequest.call(this, {
		path,
		qs: { per_page: 100 },
	})) as IDataObject;
	const items = Array.isArray(response.items) ? (response.items as IDataObject[]) : [];
	const search = (filter ?? '').toLowerCase();
	const results = items
		.map((item) => {
			const normalized =
				kind === 'item' ? normalizeCircularityHubItem(item) : normalizeCircularityHubOrder(item);
			const id = normalized.id === undefined ? '' : String(normalized.id);
			return { name: itemLabel(normalized, id), value: id };
		})
		.filter((entry) => entry.value !== '')
		.filter((entry) => search === '' || entry.name.toLowerCase().includes(search));
	return { results };
}

export const circularityHubListSearch = {
	async searchCircularityHubItems(
		this: ILoadOptionsFunctions,
		filter?: string,
	): Promise<INodeListSearchResult> {
		return searchHubList.call(this, '/customer-api/v1/circularity-hub/items', filter, 'item');
	},

	async searchCircularityHubOrders(
		this: ILoadOptionsFunctions,
		filter?: string,
	): Promise<INodeListSearchResult> {
		return searchHubList.call(this, '/customer-api/v1/circularity-hub/orders', filter, 'order');
	},
};
