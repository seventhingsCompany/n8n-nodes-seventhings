import type { IDataObject } from 'n8n-workflow';

/** Support both flat records and the API's `{ uuid, fields }` representation. */
export function withRecordFields(item: IDataObject): IDataObject {
	const fields = item.fields;
	return fields && typeof fields === 'object' && !Array.isArray(fields)
		? { ...fields, ...item }
		: { ...item };
}
