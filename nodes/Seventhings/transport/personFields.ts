import type { IDataObject } from 'n8n-workflow';

import { normalizeTimestamps } from './timestamps';
import { withRecordFields } from './recordFields';

export function normalizePerson(item: IDataObject, fallbackUuid?: string): IDataObject {
	item = withRecordFields(item);
	const uuid =
		(item.person_uuid as string | undefined) ||
		(item.uuid as string | undefined) ||
		fallbackUuid;
	const normalized = normalizeTimestamps(item);
	normalized.uuid = uuid;
	normalized.person_uuid = uuid;
	return normalized;
}
