/**
 * Location record normalization, ported from the Zapier integration's
 * `lib/location_crud.js` `normalizeLocation`.
 *
 * Locations come back from the API with space-separated datetimes
 * (`created_at` / `updated_at`) and a numeric `id`. We normalize every record
 * before returning it so downstream nodes get a stable shape: ISO-8601 UTC
 * timestamps, a guaranteed `uuid` / `id`, and a `location_uuid` alias for
 * convenience. Mirrors `normalizeRentalCase` / `normalizeTask`.
 */

import type { IDataObject } from 'n8n-workflow';

import { normalizeTimestamps } from './timestamps';

/**
 * Normalize a location record: ensure `uuid`, `location_uuid` and `id` are
 * present and convert the `created_at` / `updated_at` timestamps to ISO-8601 UTC.
 *
 * The live API keys locations by `location_uuid` (there is no `uuid` field), so
 * we read that first and mirror it onto `uuid` for a consistent downstream shape.
 */
export function normalizeLocation(item: IDataObject, fallbackUuid?: string): IDataObject {
	const uuid =
		(item.location_uuid as string | undefined) ?? (item.uuid as string | undefined) ?? fallbackUuid;
	const normalized = normalizeTimestamps(item);
	normalized.uuid = uuid;
	normalized.location_uuid = uuid;
	normalized.id = item.id != null ? item.id : uuid;
	return normalized;
}
