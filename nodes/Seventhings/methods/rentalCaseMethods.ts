/**
 * Dynamic-option methods for the Rental Case resource.
 *
 *  - `searchRentalCases` (listSearch): pick a rental case from a searchable list
 *    in the resourceLocator used by Update / Get / Delete.
 *
 * Replaces the Zapier `list_rental_cases` dynamic dropdown data source.
 */

import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
} from 'n8n-workflow';

import { normalizeRentalCase, seventhingsApiRequest } from '../transport';

/** Best-effort human label for a rental-case row in the picker. */
function rentalCaseLabel(item: IDataObject, uuid: string): string {
	const candidate = item.title;
	const text = typeof candidate === 'string' && candidate.trim() !== '' ? candidate : uuid;
	return text === uuid ? uuid : `${text} (${uuid})`;
}

export const rentalCaseListSearch = {
	async searchRentalCases(
		this: ILoadOptionsFunctions,
		filter?: string,
	): Promise<INodeListSearchResult> {
		// The rental-cases endpoint returns an `{ items, page, per_page, total }`
		// wrapper (verified live), so read the items array out of it.
		const response = (await seventhingsApiRequest.call(this, {
			path: '/customer-api/v1/rental-management/rental-cases',
			qs: {
				'sort[updated_at]': 'DESC',
			},
		})) as IDataObject;

		const items = Array.isArray(response.items) ? (response.items as IDataObject[]) : [];
		const search = (filter ?? '').toLowerCase();

		const results = items
			.map((item) => {
				const normalized = normalizeRentalCase(item);
				const uuid = (normalized.uuid as string | undefined) ?? '';
				return { name: rentalCaseLabel(normalized, uuid), value: uuid };
			})
			.filter((entry) => entry.value !== '')
			.filter((entry) => search === '' || entry.name.toLowerCase().includes(search));

		return { results };
	},
};
