import type { IDataObject, ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';

import { seventhingsApiRequest } from '../transport';

export const reportListSearch = {
	async searchReportTemplates(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		const templates = (await seventhingsApiRequest.call(this, {
			path: '/customer-api/v1/report-template',
		})) as IDataObject[];
		const search = (filter ?? '').toLowerCase();
		return {
			results: templates
				.filter((template) => typeof template.uuid === 'string' && template.uuid !== '')
				.map((template) => ({ name: String(template.name || template.uuid), value: template.uuid as string }))
				.filter((entry) => `${entry.name} ${entry.value}`.toLowerCase().includes(search)),
		};
	},
};
