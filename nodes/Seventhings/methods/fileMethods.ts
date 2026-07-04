import type { IDataObject, ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';

import { normalizeFile, seventhingsApiRequest } from '../transport';

function fileLabel(item: IDataObject, uuid: string): string {
	const name = typeof item.name === 'string' && item.name.trim() !== '' ? item.name : uuid;
	return name === uuid ? uuid : `${name} (${uuid})`;
}

export const fileListSearch = {
	async searchFiles(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		const response = (await seventhingsApiRequest.call(this, {
			path: '/customer-api/v1/files',
		})) as IDataObject;
		const items = Array.isArray(response.items) ? (response.items as IDataObject[]) : [];
		const search = (filter ?? '').toLowerCase();
		const results = items
			.map((item) => {
				const normalized = normalizeFile(item);
				const uuid = (normalized.uuid as string | undefined) ?? '';
				return { name: fileLabel(normalized, uuid), value: uuid };
			})
			.filter((entry) => entry.value !== '')
			.filter((entry) => search === '' || entry.name.toLowerCase().includes(search));
		return { results };
	},
};
