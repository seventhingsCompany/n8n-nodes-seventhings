/**
 * Dynamic-option methods for the Location resource.
 *
 *  - `searchLocations` (listSearch): pick a location from a searchable list in
 *    the resourceLocator used by Update / Get / Delete (value = location UUID).
 *  - `getLocationOptions` (loadOptions): the tenant's locations as a dropdown,
 *    keyed by the location's **integer `id`** — used by the Room resource's
 *    Building field, which references a building by integer id, not UUID.
 *
 * Replaces the Zapier `list_locations` dynamic dropdown (used both as
 * `list_locations.uuid.name` and `list_locations.id.name`).
 */

import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
} from 'n8n-workflow';

import { normalizeLocation, seventhingsApiRequest } from '../transport';

const LOCATIONS_PATH = '/customer-api/v1/locations';

/** Best-effort human label for a location row in the picker. */
function locationLabel(item: IDataObject, uuid: string): string {
	const candidate = item.name;
	const text = typeof candidate === 'string' && candidate.trim() !== '' ? candidate : uuid;
	return text === uuid ? uuid : `${text} (${uuid})`;
}

/** Fetch all locations from the `{ items }`-wrapped list endpoint. */
async function fetchLocations(this: ILoadOptionsFunctions): Promise<IDataObject[]> {
	const response = (await seventhingsApiRequest.call(this, {
		path: LOCATIONS_PATH,
		qs: { per_page: 100 },
	})) as IDataObject;
	return Array.isArray(response.items) ? (response.items as IDataObject[]) : [];
}

export const locationListSearch = {
	async searchLocations(
		this: ILoadOptionsFunctions,
		filter?: string,
	): Promise<INodeListSearchResult> {
		const items = await fetchLocations.call(this);
		const search = (filter ?? '').toLowerCase();

		const results = items
			.map((item) => {
				const normalized = normalizeLocation(item);
				const uuid = (normalized.uuid as string | undefined) ?? '';
				return { name: locationLabel(normalized, uuid), value: uuid };
			})
			.filter((entry) => entry.value !== '')
			.filter((entry) => search === '' || entry.name.toLowerCase().includes(search));

		return { results };
	},
};

export const locationLoadOptions = {
	async getLocationOptions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		const items = await fetchLocations.call(this);

		return items
			.map((item) => {
				const id = item.id;
				const uuid = (item.uuid as string | undefined) ?? '';
				const name =
					typeof item.name === 'string' && item.name.trim() !== ''
						? (item.name as string)
						: String(id ?? uuid);
				return { name, value: (id ?? '') as string | number };
			})
			.filter((entry) => entry.value !== '');
	},
};
