import type { IDataObject } from 'n8n-workflow';

export type JsonParameterResult<T = unknown> =
	| { ok: true; value: T }
	| { ok: false; message: string };

export function parseJsonParameter(value: unknown, label: string): JsonParameterResult {
	if (value === undefined || value === null || value === '') {
		return { ok: true, value: undefined };
	}
	if (typeof value !== 'string') {
		return { ok: true, value };
	}
	try {
		return { ok: true, value: JSON.parse(value) };
	} catch {
		return { ok: false, message: `${label} must be valid JSON.` };
	}
}

export function parseJsonArray(
	value: unknown,
	label: string,
	fallback: unknown[] = [],
): JsonParameterResult<unknown[]> {
	const parsed = parseJsonParameter(value, label);
	if (!parsed.ok) {
		return parsed;
	}
	if (parsed.value === undefined) {
		return { ok: true, value: fallback };
	}
	if (!Array.isArray(parsed.value)) {
		return { ok: false, message: `${label} must be a JSON array.` };
	}
	return { ok: true, value: parsed.value };
}

export function parseJsonObject(
	value: unknown,
	label: string,
	fallback: IDataObject = {},
): JsonParameterResult<IDataObject> {
	const parsed = parseJsonParameter(value, label);
	if (!parsed.ok) {
		return parsed;
	}
	if (parsed.value === undefined) {
		return { ok: true, value: fallback };
	}
	if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
		return { ok: false, message: `${label} must be a JSON object.` };
	}
	return { ok: true, value: parsed.value as IDataObject };
}
