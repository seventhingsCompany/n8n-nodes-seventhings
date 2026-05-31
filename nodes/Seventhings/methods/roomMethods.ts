/**
 * Dynamic-option methods for the Room resource.
 *
 *  - `searchRooms` (listSearch): pick a room from a searchable list in the
 *    resourceLocator used by Update / Get / Delete (value = room UUID).
 *  - `getRoomFields` (resourceMapper): the tenant's writable room fields (incl.
 *    custom fields like "Raumtyp") as mappable, typed columns for Create/Update.
 *
 * Replaces the Zapier `list_rooms` dynamic dropdown.
 */

import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	ResourceMapperFields,
} from 'n8n-workflow';

import {
	fetchRoomFieldDefinitions,
	normalizeRoom,
	roomFieldDefinitionsToResourceMapperFields,
	seventhingsApiRequest,
} from '../transport';

/** Best-effort human label for a room row in the picker. */
function roomLabel(item: IDataObject, uuid: string): string {
	const candidate = item.name;
	const text = typeof candidate === 'string' && candidate.trim() !== '' ? candidate : uuid;
	return text === uuid ? uuid : `${text} (${uuid})`;
}

export const roomListSearch = {
	async searchRooms(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		// The rooms endpoint returns an `{ items }` wrapper.
		const response = (await seventhingsApiRequest.call(this, {
			path: '/customer-api/v1/rooms',
			qs: { per_page: 100 },
		})) as IDataObject;

		const items = Array.isArray(response.items) ? (response.items as IDataObject[]) : [];
		const search = (filter ?? '').toLowerCase();

		const results = items
			.map((item) => {
				const normalized = normalizeRoom(item);
				const uuid = (normalized.uuid as string | undefined) ?? '';
				return { name: roomLabel(normalized, uuid), value: uuid };
			})
			.filter((entry) => entry.value !== '')
			.filter((entry) => search === '' || entry.name.toLowerCase().includes(search));

		return { results };
	},
};

export const roomResourceMapping = {
	async getRoomFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
		const defs = await fetchRoomFieldDefinitions.call(this);
		return { fields: roomFieldDefinitionsToResourceMapperFields(defs) };
	},
};
