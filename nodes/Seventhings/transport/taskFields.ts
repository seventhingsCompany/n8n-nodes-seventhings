/**
 * Task record normalization, ported from the Zapier integration's
 * `lib/tasks.js` `normalizeTask`.
 *
 * Tasks come back from the API with space-separated datetimes and an optional
 * `id`. We normalize every record before returning it so downstream nodes get a
 * stable shape: ISO-8601 UTC timestamps and a guaranteed `uuid` / `id`.
 */

import type { IDataObject } from 'n8n-workflow';

import { normalizeTimestamps } from './timestamps';

/**
 * Normalize a task record: ensure `uuid` and `id` are present and convert the
 * `created_at` / `updated_at` timestamps to ISO-8601 UTC. Mirrors
 * `normalizeAsset`.
 */
export function normalizeTask(item: IDataObject, fallbackUuid?: string): IDataObject {
	const uuid = (item.uuid as string | undefined) ?? fallbackUuid;
	const normalized = normalizeTimestamps(item);
	normalized.uuid = uuid;
	normalized.id = item.id != null ? item.id : uuid;
	return normalized;
}
