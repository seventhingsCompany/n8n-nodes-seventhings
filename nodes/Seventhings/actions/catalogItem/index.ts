import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	encodeSdkListOptions, locationHeader, parseJsonObject, readFilterRows, readSortRows,
	seventhingsApiRequest, seventhingsApiRequestAllItems, uuidFromLocation, validateUuid,
} from '../../transport';

const PATH = '/customer-api/v1/catalog-item';

/** Preserve the catalog's {uuid, fields} envelope and instance-specific field keys. */
export async function executeCatalogItemOperation(
	this: IExecuteFunctions, operation: string, i: number,
): Promise<INodeExecutionData[]> {
	const output = (json: IDataObject): INodeExecutionData => ({ json, pairedItem: { item: i } });
	if (operation === 'getAll') {
		const limit = this.getNodeParameter('returnAll', i, false)
			? undefined : this.getNodeParameter('limit', i, 50) as number;
		const items = await seventhingsApiRequestAllItems.call(this, {
			path: '/customer-api/v1/catalog-items',
			qs: encodeSdkListOptions({
				filters: readFilterRows(this.getNodeParameter('filterRows', i, {})),
				sort: readSortRows(this.getNodeParameter('sortRows', i, {})),
			}),
		}, limit);
		return items.map(output);
	}
	let uuid = '';
	if (operation !== 'create') {
		try {
			uuid = validateUuid(this.getNodeParameter('catalogItemId', i), 'Catalog Item UUID');
		} catch (error) {
			throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
		}
	}
	if (operation === 'delete') {
		await seventhingsApiRequest.call(this, { path: `${PATH}/${uuid}`, method: 'DELETE' });
		return [output({ uuid, deleted: true })];
	}
	if (operation === 'create' || operation === 'update') {
		const parsed = parseJsonObject(this.getNodeParameter('catalogFields', i, '{}'), 'Catalog fields');
		if (!parsed.ok) throw new NodeOperationError(this.getNode(), parsed.message, { itemIndex: i });
		const response = await seventhingsApiRequest.call(this, {
			path: operation === 'create' ? PATH : `${PATH}/${uuid}`,
			method: operation === 'create' ? 'POST' : 'PUT',
			body: { fields: parsed.value }, returnFullResponse: true,
		}) as { headers?: IDataObject; body?: IDataObject };
		if (operation === 'create') {
			const header = Object.entries(response.headers ?? {}).find(([key]) => key.toLowerCase() === 'location-uuid')?.[1];
			uuid = String(header ?? uuidFromLocation(locationHeader(response.headers)) ?? response.body?.uuid ?? '');
			if (!uuid) throw new NodeOperationError(this.getNode(), 'Create catalog item: the API did not return a UUID.', { itemIndex: i });
		}
	}
	if (!['get', 'create', 'update'].includes(operation)) {
		throw new NodeOperationError(this.getNode(), `Unsupported catalog item operation: ${operation}`, { itemIndex: i });
	}
	return [output(await seventhingsApiRequest.call(this, { path: `${PATH}/${uuid}` }) as IDataObject)];
}
