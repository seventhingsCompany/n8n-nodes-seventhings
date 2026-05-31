/**
 * Room record normalization, ported from the Zapier integration's
 * `lib/room_crud.js` `normalizeRoom`.
 *
 * Rooms come back from the API with space-separated datetimes
 * (`created_at` / `updated_at`), a numeric `id`, and a numeric `building_id`
 * (the owning location/building — rooms are the one resource referenced by an
 * integer id rather than a UUID). We normalize every record before returning it
 * so downstream nodes get a stable shape: ISO-8601 UTC timestamps, a guaranteed
 * `uuid` / `id`, and a `room_uuid` alias. `building_id` is preserved as-is.
 * Mirrors `normalizeLocation`.
 */

import type { IDataObject, ResourceMapperField } from 'n8n-workflow';

import { seventhingsApiRequest, type SeventhingsRequestContext } from './apiRequest';
import { mapFieldType } from './assetFields';
import { normalizeTimestamps } from './timestamps';

/**
 * Normalize a room record: ensure `uuid`, `room_uuid` and `id` are present and
 * convert the `created_at` / `updated_at` timestamps to ISO-8601 UTC.
 *
 * The live API keys rooms by `room_uuid` (there is no `uuid` field), so we read
 * that first and mirror it onto `uuid` for a consistent downstream shape.
 */
export function normalizeRoom(item: IDataObject, fallbackUuid?: string): IDataObject {
	const uuid =
		(item.room_uuid as string | undefined) ?? (item.uuid as string | undefined) ?? fallbackUuid;
	const normalized = normalizeTimestamps(item);
	normalized.uuid = uuid;
	normalized.room_uuid = uuid;
	normalized.id = item.id != null ? item.id : uuid;
	return normalized;
}

/**
 * Room field definitions.
 *
 * Like assets, rooms have a tenant-specific field template (custom fields such
 * as "Raumtyp", "Etage", "Fläche") served from a field-definitions endpoint.
 * The live API enforces mandatory fields server-side (e.g. `number` and the
 * room-type dropdown), so Room Create/Update are driven by a resourceMapper over
 * these definitions rather than static inputs.
 */

/** The field-definitions endpoint for the room template (parallels the asset one). */
export const ROOM_FIELD_DEFINITIONS_PATH = '/customer-api/v1/asset-tracking/room/field-definitions';

/** A `{ type, value }` attribute pair on a field definition. */
interface FieldAttribute {
	type?: string;
	value?: string;
}

/** A single room field definition as returned by the API (subset we rely on). */
export interface RoomFieldDefinition {
	field_key?: string;
	label?: string;
	field_type?: { name?: string };
	attributes?: FieldAttribute[];
	possible_values?: unknown[];
}

/** Read an attribute value by type from a definition's `attributes` array. */
function attr(def: RoomFieldDefinition, type: string): string | undefined {
	return def.attributes?.find((a) => a.type === type)?.value;
}

/** The uppercase API field-type name for a definition. */
function roomFieldTypeName(def: RoomFieldDefinition): string | undefined {
	return def.field_type?.name;
}

/**
 * Fetch the tenant's room field definitions. Failures resolve to an empty array
 * so dynamic input loading never crashes the node (mirrors the asset helper).
 */
export async function fetchRoomFieldDefinitions(
	this: SeventhingsRequestContext,
): Promise<RoomFieldDefinition[]> {
	try {
		const response = (await seventhingsApiRequest.call(this, {
			path: ROOM_FIELD_DEFINITIONS_PATH,
		})) as RoomFieldDefinition[] | IDataObject;
		return Array.isArray(response) ? response : [];
	} catch {
		return [];
	}
}

/**
 * A field is user-writable when it carries a non-empty `editable` attribute
 * (e.g. `web_app` / `mobile_app`). System audit fields (created_at, id,
 * room_uuid, …) have no editable attribute and are excluded from the mapper.
 * ATTACHMENT (binary) and LINKED_USER fields are also excluded — they are not
 * editable as plain values here.
 */
function isWritableRoomField(def: RoomFieldDefinition): boolean {
	if (!def.field_key) {
		return false;
	}
	const editable = attr(def, 'editable');
	if (!editable) {
		return false;
	}
	const typeName = roomFieldTypeName(def);
	// `building_id` (LINKED_LOCATION) is surfaced as a dedicated Building dropdown
	// (a locations picker) outside the mapper, since resourceMapper option fields
	// can't load their options dynamically. ATTACHMENT/LINKED_USER aren't editable
	// as plain values here.
	return typeName !== 'ATTACHMENT' && typeName !== 'LINKED_USER' && typeName !== 'LINKED_LOCATION';
}

/**
 * Turn the tenant's room field definitions into resourceMapper fields for Room
 * Create/Update. Only user-writable fields are surfaced; `mandatory` fields are
 * marked required. DROPDOWN fields become single-select options; LINKED_LOCATION
 * (`building_id`) is rendered as the locations dropdown via `loadOptionsMethod`.
 */
export function roomFieldDefinitionsToResourceMapperFields(
	defs: RoomFieldDefinition[],
): ResourceMapperField[] {
	const fields: ResourceMapperField[] = [];
	for (const def of defs) {
		if (!isWritableRoomField(def)) {
			continue;
		}
		const key = def.field_key as string;
		const typeName = roomFieldTypeName(def);
		const required = attr(def, 'mandatory') === 'yes';

		const field: ResourceMapperField = {
			id: key,
			displayName: def.label ?? key,
			required,
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
 * Coerce submitted room field values to the right JS type based on the
 * definitions, dropping empty values. NUMBER → number; LINKED_LOCATION
 * (`building_id`) → number; everything else passes through as-is.
 */
export function coerceRoomFieldValues(
	defs: RoomFieldDefinition[],
	values: IDataObject,
): IDataObject {
	const typeByKey = new Map<string, string | undefined>();
	for (const def of defs) {
		if (def.field_key) {
			typeByKey.set(def.field_key, roomFieldTypeName(def));
		}
	}

	const out: IDataObject = {};
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined || value === null || value === '') {
			continue;
		}
		const typeName = typeByKey.get(key);
		if (typeName === 'NUMBER' || typeName === 'DECIMAL' || typeName === 'LINKED_LOCATION') {
			const parsed = Number(value);
			out[key] = (Number.isNaN(parsed) ? value : parsed) as IDataObject[string];
		} else {
			out[key] = value as IDataObject[string];
		}
	}
	return out;
}
