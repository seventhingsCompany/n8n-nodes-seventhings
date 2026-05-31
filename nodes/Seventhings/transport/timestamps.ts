/**
 * Timestamp normalization, ported from the Zapier integration's
 * `lib/timestamps.js`.
 *
 * The seventhings API returns datetimes as `"YYYY-MM-DD HH:MM:SS"` with no
 * timezone. We treat them as UTC and convert to ISO-8601 (`...T...Z`) so n8n
 * and downstream nodes get unambiguous, parseable timestamps.
 */

import type { IDataObject } from 'n8n-workflow';

/** Matches the API's space-separated, timezone-less datetime format. */
const SPACE_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/**
 * Convert a `"YYYY-MM-DD HH:MM:SS"` datetime to ISO-8601 UTC.
 * Non-matching values (including non-strings) are returned unchanged.
 */
export function toIsoUtc<T>(value: T): T | string {
	if (typeof value !== 'string' || !SPACE_DATETIME_RE.test(value)) {
		return value;
	}
	return value.replace(' ', 'T') + 'Z';
}

/**
 * Like {@link toIsoUtc}, but intended for date-ish fields. Currently identical
 * behavior — kept as a distinct export to mirror the Zapier helper surface and
 * leave room for date-only handling later.
 */
export function toIsoDate<T>(value: T): T | string {
	if (typeof value !== 'string') {
		return value;
	}
	if (SPACE_DATETIME_RE.test(value)) {
		return value.replace(' ', 'T') + 'Z';
	}
	return value;
}

/**
 * Reduce a value to a date-only `YYYY-MM-DD` string for the API's date fields
 * (e.g. rental-case `issue_date` / `due_date`, which reject datetime/ISO-Z
 * formats). Accepts an n8n dateTime (ISO `...T...Z`), a space-separated
 * datetime, or an already-date-only string and returns just the date part.
 * Empty / non-string values are returned unchanged.
 */
export function toApiDate(value: unknown): string {
	if (typeof value !== 'string' || value === '') {
		return value as string;
	}
	// Take everything up to the first 'T' or space, i.e. the calendar date.
	const datePart = value.split(/[T ]/)[0];
	return datePart;
}

/** Field keys that should always be normalized when present on a record. */
const DEFAULT_TIMESTAMP_KEYS = ['created_at', 'updated_at'];

/**
 * Return a shallow copy of a record with its timestamp fields normalized to
 * ISO-8601 UTC. By default this normalizes `created_at` / `updated_at`; pass
 * `keys` to normalize additional fields (e.g. `deadline`, `issue_date`).
 *
 * This captures the inline `toIsoUtc(item.created_at)` pattern repeated across
 * the Zapier helpers so later phases can reuse it instead of re-implementing.
 */
export function normalizeTimestamps(
	record: IDataObject,
	keys: string[] = DEFAULT_TIMESTAMP_KEYS,
): IDataObject {
	const normalized: IDataObject = { ...record };
	for (const key of keys) {
		if (key in normalized) {
			normalized[key] = toIsoUtc(normalized[key]) as IDataObject[string];
		}
	}
	return normalized;
}
