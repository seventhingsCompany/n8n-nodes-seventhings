/**
 * Asset field-definition helpers, ported from the Zapier integration's
 * `lib/asset_fields.js` and `lib/field_definitions.js`.
 *
 * The seventhings asset template is tenant-specific: each tenant defines its own
 * set of asset fields (barcode, description, custom fields, …) with their own
 * types. We fetch those definitions to build dynamic inputs (resourceMapper /
 * loadOptions) and to coerce submitted values to the right JS type before
 * sending them to the API.
 */

import type { IDataObject, ResourceMapperField } from 'n8n-workflow';

type FieldType = ResourceMapperField['type'];

import {
	seventhingsApiRequest,
	type SeventhingsRequestContext,
} from './apiRequest';
import { normalizeTimestamps } from './timestamps';

/** The field-definitions endpoint for the asset template. */
export const ASSET_FIELD_DEFINITIONS_PATH =
	'/customer-api/v1/asset-tracking/asset/field-definitions';

/** Shape of the `field_type` object on a field definition. */
interface FieldTypeRef {
	name?: string;
}

/** A single asset field definition as returned by the API (subset we rely on). */
export interface AssetFieldDefinition {
	field_key?: string;
	label?: string;
	field_type?: FieldTypeRef;
	possible_values?: unknown[];
	default_value?: unknown;
}

/**
 * Fetch the tenant's asset field definitions.
 *
 * Mirrors the Zapier helper: failures resolve to an empty array so dynamic input
 * loading (dropdowns, resourceMapper) never crashes the node — the user just
 * sees no dynamic fields rather than an error.
 */
export async function fetchAssetFieldDefinitions(
	this: SeventhingsRequestContext,
): Promise<AssetFieldDefinition[]> {
	try {
		const response = (await seventhingsApiRequest.call(this, {
			path: ASSET_FIELD_DEFINITIONS_PATH,
		})) as AssetFieldDefinition[] | IDataObject;
		return Array.isArray(response) ? response : [];
	} catch {
		return [];
	}
}

/** The uppercase API field-type name for a definition, or `undefined`. */
function fieldTypeName(def: AssetFieldDefinition): string | undefined {
	return def.field_type?.name;
}

/**
 * Map an API field-type name to an n8n resourceMapper field type.
 * Ported from the Zapier `zapierTypeFor` switch (number/boolean/dateTime/string).
 */
export function mapFieldType(typeName: string | undefined): FieldType {
	switch (typeName) {
		case 'NUMBER':
		case 'DECIMAL':
		case 'MONEY':
			return 'number';
		case 'BOOLEAN':
			return 'boolean';
		case 'DATE':
		case 'DATETIME':
			return 'dateTime';
		default:
			return 'string';
	}
}

/**
 * Turn the tenant's field definitions into resourceMapper fields for Asset
 * Create/Update. DROPDOWN definitions become single-select options.
 */
export function fieldDefinitionsToResourceMapperFields(
	defs: AssetFieldDefinition[],
): ResourceMapperField[] {
	const fields: ResourceMapperField[] = [];
	for (const def of defs) {
		const key = def.field_key;
		if (!key) {
			continue;
		}
		const typeName = fieldTypeName(def);
		const field: ResourceMapperField = {
			id: key,
			displayName: def.label ?? key,
			required: false,
			defaultMatch: false,
			display: true,
			type: mapFieldType(typeName),
		};
		if (
			typeName === 'DROPDOWN' &&
			Array.isArray(def.possible_values) &&
			def.possible_values.length > 0
		) {
			field.type = 'options';
			field.options = def.possible_values.map((value) => {
				const stringValue = String(value);
				return { name: stringValue, value: stringValue };
			});
		}
		fields.push(field);
	}
	return fields;
}

/**
 * Coerce submitted field values to the right JS type based on the tenant's field
 * definitions. Ported from the Zapier `coerceFieldValues`/`coerceValue` pair:
 * NUMBER/DECIMAL/MONEY → number, BOOLEAN → boolean; empty values are dropped.
 */
export function coerceFieldValues(
	defs: AssetFieldDefinition[],
	values: IDataObject,
): IDataObject {
	const typeByKey = new Map<string, string | undefined>();
	for (const def of defs) {
		if (def.field_key) {
			typeByKey.set(def.field_key, fieldTypeName(def));
		}
	}

	const out: IDataObject = {};
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined || value === null || value === '') {
			continue;
		}
		out[key] = coerceValue(typeByKey.get(key), value) as IDataObject[string];
	}
	return out;
}

/** Coerce a single value to the JS type implied by its API field type. */
function coerceValue(typeName: string | undefined, value: unknown): unknown {
	switch (typeName) {
		case 'NUMBER':
		case 'DECIMAL':
		case 'MONEY': {
			if (typeof value === 'number') {
				return value;
			}
			const parsed = Number(value);
			return Number.isNaN(parsed) ? value : parsed;
		}
		case 'BOOLEAN': {
			if (typeof value === 'boolean') {
				return value;
			}
			if (value === 'true') {
				return true;
			}
			if (value === 'false') {
				return false;
			}
			return value;
		}
		default:
			return value;
	}
}

/**
 * Field keys whose type is ATTACHMENT — used by the Phase 6 file attach/detach
 * operations. Exported now so the helper lives with the rest of the field logic.
 */
export function attachmentFieldKeys(
	defs: AssetFieldDefinition[],
): Array<{ key: string; label: string }> {
	return defs
		.filter((def) => fieldTypeName(def) === 'ATTACHMENT' && def.field_key)
		.map((def) => ({ key: def.field_key as string, label: def.label ?? (def.field_key as string) }));
}

/**
 * Normalize an asset record for output: ensure `asset_uuid`/`id` are present and
 * convert timestamps to ISO-8601 UTC. Mirrors the Zapier `normalizeAsset`.
 *
 * `fallbackUuid` is the UUID we created/fetched by, used when the record itself
 * omits `asset_uuid`/`uuid` (e.g. a thin response).
 */
export function normalizeAsset(item: IDataObject, fallbackUuid?: string): IDataObject {
	const uuid =
		(item.asset_uuid as string | undefined) ??
		(item.uuid as string | undefined) ??
		fallbackUuid;

	// normalizeTimestamps converts created_at / updated_at to ISO-8601 UTC.
	const normalized = normalizeTimestamps(item);
	normalized.asset_uuid = uuid;
	normalized.id = item.id != null ? item.id : uuid;
	return normalized;
}
