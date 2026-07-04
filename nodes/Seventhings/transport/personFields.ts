import type { IDataObject } from 'n8n-workflow';

import { normalizeTimestamps } from './timestamps';

export function normalizePerson(item: IDataObject, fallbackUuid?: string): IDataObject {
	const uuid =
		(item.person_uuid as string | undefined) ??
		(item.uuid as string | undefined) ??
		fallbackUuid;
	const normalized = normalizeTimestamps(item);
	normalized.uuid = uuid;
	normalized.person_uuid = uuid;
	return normalized;
}
