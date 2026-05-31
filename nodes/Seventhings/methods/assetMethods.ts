/**
 * Dynamic-option methods for the Asset resource.
 *
 *  - `getAssetFieldKeys` (loadOptions): the tenant's asset field keys, used by
 *    the find-or-create match field and the Get Many filter field.
 *  - `getAssetFields` (resourceMapper): the tenant's asset fields as mappable,
 *    typed columns for Create / Update.
 *  - `searchAssets` / `searchArchivedAssets` (listSearch): pick an asset (or an
 *    archived asset) from a searchable list in the resourceLocator.
 *
 * These replace the Zapier `list_asset_field_keys` dynamic dropdown and the
 * asset list data source.
 */

import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
	ResourceMapperFields,
} from 'n8n-workflow';

import {
	attachmentFieldKeys,
	fetchAssetFieldDefinitions,
	fieldDefinitionsToResourceMapperFields,
	normalizeAsset,
	seventhingsApiRequest,
} from '../transport';

/** Best-effort human label for an asset row in the picker. */
function assetLabel(item: IDataObject, uuid: string): string {
	const candidate =
		item.name ?? item.description ?? item.barcode ?? item.label ?? item.title;
	const text = typeof candidate === 'string' && candidate.trim() !== '' ? candidate : uuid;
	return text === uuid ? uuid : `${text} (${uuid})`;
}

/**
 * Shared list-search over the assets endpoint.
 *
 * The list endpoint only surfaces active (non-archived) assets — the API has no
 * working query param to list archived ones — so both the "assets" and
 * "archived assets" pickers show the active list; an archived asset is reached
 * by pasting its UUID into the resourceLocator's "By ID" field.
 */
async function searchAssetList(
	this: ILoadOptionsFunctions,
	filter: string | undefined,
): Promise<INodeListSearchResult> {
	const qs: IDataObject = {
		'sort[updated_at]': 'DESC',
		per_page: 100,
	};

	const response = (await seventhingsApiRequest.call(this, {
		path: '/customer-api/v1/objects',
		qs,
	})) as IDataObject;

	const items = (response?.items as IDataObject[] | undefined) ?? [];
	const search = (filter ?? '').toLowerCase();

	const results = items
		.map((item) => {
			const normalized = normalizeAsset(item);
			const uuid = (normalized.asset_uuid as string | undefined) ?? '';
			return { name: assetLabel(normalized, uuid), value: uuid };
		})
		.filter((entry) => entry.value !== '')
		.filter((entry) => search === '' || entry.name.toLowerCase().includes(search));

	return { results };
}

export const assetListSearch = {
	async searchAssets(
		this: ILoadOptionsFunctions,
		filter?: string,
	): Promise<INodeListSearchResult> {
		return searchAssetList.call(this, filter);
	},

	async searchArchivedAssets(
		this: ILoadOptionsFunctions,
		filter?: string,
	): Promise<INodeListSearchResult> {
		// See searchAssetList: the list endpoint can't return archived assets,
		// so this shows the active list; pick archived assets by UUID.
		return searchAssetList.call(this, filter);
	},
};

export const assetLoadOptions = {
	async getAssetFieldKeys(
		this: ILoadOptionsFunctions,
	): Promise<INodePropertyOptions[]> {
		const defs = await fetchAssetFieldDefinitions.call(this);
		return defs
			.filter((def) => def.field_key)
			.map((def) => ({
				name: def.label ?? (def.field_key as string),
				value: def.field_key as string,
			}));
	},

	async getAttachmentFieldKeys(
		this: ILoadOptionsFunctions,
	): Promise<INodePropertyOptions[]> {
		const defs = await fetchAssetFieldDefinitions.call(this);
		return attachmentFieldKeys(defs).map(({ key, label }) => ({
			name: label,
			value: key,
		}));
	},
};

export const assetResourceMapping = {
	async getAssetFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
		const defs = await fetchAssetFieldDefinitions.call(this);
		return { fields: fieldDefinitionsToResourceMapperFields(defs) };
	},
};
