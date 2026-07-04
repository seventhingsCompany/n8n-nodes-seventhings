import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	ResourceMapperFields,
} from 'n8n-workflow';

import {
	fetchFieldDefinitions,
	fieldDefinitionsToMapperFields,
	normalizePerson,
	seventhingsApiRequest,
} from '../transport';

function personLabel(item: IDataObject, uuid: string): string {
	const name = [item.first_name, item.last_name]
		.filter((part) => typeof part === 'string' && part.trim() !== '')
		.join(' ');
	const email = typeof item.email === 'string' ? item.email : '';
	const text = name || email || uuid;
	return text === uuid ? uuid : `${text} (${uuid})`;
}

export const personListSearch = {
	async searchPersons(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		const response = (await seventhingsApiRequest.call(this, {
			path: '/customer-api/v1/persons',
			qs: { per_page: 100 },
		})) as IDataObject;
		const items = Array.isArray(response.items) ? (response.items as IDataObject[]) : [];
		const search = (filter ?? '').toLowerCase();
		const results = items
			.map((item) => {
				const normalized = normalizePerson(item);
				const uuid = (normalized.uuid as string | undefined) ?? '';
				return { name: personLabel(normalized, uuid), value: uuid };
			})
			.filter((entry) => entry.value !== '')
			.filter((entry) => search === '' || entry.name.toLowerCase().includes(search));
		return { results };
	},
};

export const personResourceMapping = {
	async getPersonFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
		const defs = await fetchFieldDefinitions.call(this, 'person');
		return { fields: fieldDefinitionsToMapperFields(defs) };
	},
};
