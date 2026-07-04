import type { IDataObject } from 'n8n-workflow';

import { normalizeTimestamps } from './timestamps';

export function normalizeCircularityHubItem(item: IDataObject): IDataObject {
	return normalizeTimestamps(item);
}

export function normalizeCircularityHubOrder(item: IDataObject): IDataObject {
	return normalizeTimestamps(item);
}
