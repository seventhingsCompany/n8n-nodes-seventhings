import type { IDataObject } from 'n8n-workflow';

export function normalizeUser(item: IDataObject, fallbackUuid?: string): IDataObject {
	const normalized = { ...item };
	normalized.uuid = (item.uuid as string | undefined) ?? fallbackUuid;
	return normalized;
}
