import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';

import {
	fetchFieldDefinitions,
	type AssetTrackingTemplate,
} from '../transport';

function currentTemplate(this: ILoadOptionsFunctions): AssetTrackingTemplate {
	try {
		return this.getNodeParameter('template') as AssetTrackingTemplate;
	} catch {
		return 'asset';
	}
}

export const fieldDefinitionListSearch = {
	async searchFieldDefinitions(
		this: ILoadOptionsFunctions,
		filter?: string,
	): Promise<INodeListSearchResult> {
		const defs = await fetchFieldDefinitions.call(this, currentTemplate.call(this));
		const search = (filter ?? '').toLowerCase();
		const results = defs
			.map((def) => {
				const uuid = def.uuid ?? '';
				const label = def.label ?? def.field_key ?? uuid;
				const name = label === uuid ? uuid : `${label} (${uuid})`;
				return { name, value: uuid };
			})
			.filter((entry) => entry.value !== '')
			.filter((entry) => search === '' || entry.name.toLowerCase().includes(search));
		return { results };
	},
};
