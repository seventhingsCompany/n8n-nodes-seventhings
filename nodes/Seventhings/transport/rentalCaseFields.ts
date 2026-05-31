/**
 * Rental-case record normalization, ported from the Zapier integration's
 * `lib/rental_cases.js` `normalizeRentalCase`.
 *
 * Rental cases come back from the API with space-separated datetimes
 * (`created_at` / `updated_at`) and date-ish `issue_date` / `due_date` fields.
 * We normalize every record before returning it so downstream nodes get a stable
 * shape: ISO-8601 UTC timestamps and a guaranteed `uuid` / `id`. Mirrors
 * `normalizeTask` / `normalizeAsset`.
 */

import type { IDataObject } from 'n8n-workflow';

import { normalizeTimestamps, toIsoDate } from './timestamps';

/**
 * Normalize a rental-case record: ensure `uuid` and `id` are present, convert
 * `created_at` / `updated_at` to ISO-8601 UTC, and normalize the date-ish
 * `issue_date` / `due_date` fields.
 */
export function normalizeRentalCase(item: IDataObject, fallbackUuid?: string): IDataObject {
	const uuid = (item.uuid as string | undefined) ?? fallbackUuid;
	const normalized = normalizeTimestamps(item);
	normalized.uuid = uuid;
	normalized.id = item.id != null ? item.id : uuid;
	if ('issue_date' in normalized) {
		normalized.issue_date = toIsoDate(normalized.issue_date) as IDataObject[string];
	}
	if ('due_date' in normalized) {
		normalized.due_date = toIsoDate(normalized.due_date) as IDataObject[string];
	}
	return normalized;
}
