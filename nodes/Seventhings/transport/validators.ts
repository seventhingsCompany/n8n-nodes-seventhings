/**
 * Validation + URL helpers shared by every seventhings operation.
 *
 * Ported from the Zapier integration's `lib/request.js` (`buildBaseUrl`,
 * `validateUuid`, `uuidFromLocation`, `locationHeader`) and the username-is-email
 * check from `authentication.js`. These throw plain `Error`s; callers in the
 * node layer wrap them into `NodeOperationError` so they surface as
 * configuration/validation errors in n8n.
 */

/** A seventhings subdomain may only contain lowercase letters, digits and dashes. */
export const SUBDOMAIN_RE = /^[a-z0-9-]+$/;

/** Canonical RFC-4122 UUID shape (case-insensitive), matching the Zapier helper. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pragmatic email check, mirroring the Zapier `EMAIL_RE`. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Build the per-tenant API base URL from the credential's subdomain.
 *
 * The host is never hardcoded: it is derived (and validated) per request.
 */
export function buildBaseUrl(subdomain: string | undefined): string {
	const value = (subdomain ?? '').trim().toLowerCase();
	if (!SUBDOMAIN_RE.test(value)) {
		throw new Error('Subdomain can only contain letters, numbers and dashes (-).');
	}
	return `https://${value}.seventhings.com`;
}

/** Validate a UUID and return its trimmed form, throwing on anything malformed. */
export function validateUuid(value: unknown, label = 'UUID'): string {
	const trimmed = String(value ?? '').trim();
	if (!trimmed || !UUID_RE.test(trimmed)) {
		throw new Error(`A valid ${label} is required.`);
	}
	return trimmed;
}

/** Validate that the given value is a syntactically valid email address. */
export function validateEmail(value: unknown): string {
	const trimmed = String(value ?? '').trim();
	if (!EMAIL_RE.test(trimmed)) {
		throw new Error('Username must be a valid email address.');
	}
	return trimmed;
}

/**
 * Extract the created record's UUID from a `Location` header value.
 *
 * The API returns the new resource's URL in `Location`; the UUID is the last
 * path segment (query string and trailing slashes stripped).
 */
export function uuidFromLocation(location: unknown): string | null {
	if (!location || typeof location !== 'string') {
		return null;
	}
	const trimmed = location.replace(/\?.*$/, '').replace(/\/+$/, '');
	const last = trimmed.split('/').pop();
	return last || null;
}

/** Read the `Location` header from a response's headers object, case-insensitively. */
export function locationHeader(headers: unknown): string | undefined {
	if (!headers || typeof headers !== 'object') {
		return undefined;
	}
	const record = headers as Record<string, unknown>;
	const value = record.location ?? record.Location;
	return typeof value === 'string' ? value : undefined;
}

/** Parse the integer `Location-Id` header returned by Circularity Hub creates. */
export function idFromLocationIdHeader(headers: unknown): number | null {
	if (!headers || typeof headers !== 'object') {
		return null;
	}
	const record = headers as Record<string, unknown>;
	const value = record['location-id'] ?? record['Location-Id'] ?? record['Location-ID'];
	if (value === undefined || value === null || value === '') {
		return null;
	}
	const id = Number(value);
	return Number.isInteger(id) ? id : null;
}
