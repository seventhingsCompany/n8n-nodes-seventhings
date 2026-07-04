import type { IDataObject, ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';

import { normalizeUser, seventhingsApiRequest } from '../transport';

function userLabel(item: IDataObject, uuid: string): string {
	const displayName =
		typeof item.display_name === 'string' && item.display_name.trim() !== ''
			? item.display_name
			: '';
	const email = typeof item.email === 'string' ? item.email : '';
	const text = displayName || email || uuid;
	return text === uuid ? uuid : `${text} (${uuid})`;
}

export const userListSearch = {
	async searchUsers(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		const response = (await seventhingsApiRequest.call(this, {
			path: '/customer-api/v1/users',
			qs: { per_page: 100 },
		})) as IDataObject;
		const items = Array.isArray(response.items) ? (response.items as IDataObject[]) : [];
		const search = (filter ?? '').toLowerCase();
		const results = items
			.map((item) => {
				const normalized = normalizeUser(item);
				const uuid = (normalized.uuid as string | undefined) ?? '';
				return { name: userLabel(normalized, uuid), value: uuid };
			})
			.filter((entry) => entry.value !== '')
			.filter((entry) => search === '' || entry.name.toLowerCase().includes(search));
		return { results };
	},
};
