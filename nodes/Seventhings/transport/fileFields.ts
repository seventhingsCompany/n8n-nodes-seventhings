import type { IDataObject } from 'n8n-workflow';

import { normalizeTimestamps } from './timestamps';

export function normalizeFile(item: IDataObject, fallbackUuid?: string): IDataObject {
	const uuid = (item.uuid as string | undefined) ?? fallbackUuid;
	const normalized = normalizeTimestamps(item);
	normalized.uuid = uuid;
	normalized.id = uuid;
	return normalized;
}
