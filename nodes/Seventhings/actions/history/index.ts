import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { seventhingsApiRequestAllItems, validateUuid } from '../../transport';

const historyResources = {
	asset: { path: 'object', parameter: 'assetId', label: 'Asset UUID' },
	location: { path: 'location', parameter: 'locationId', label: 'Location UUID' },
	person: { path: 'person', parameter: 'personId', label: 'Person UUID' },
	rentalCase: {
		path: 'rental-management/rental-case',
		parameter: 'rentalCaseId',
		label: 'Rental Case UUID',
	},
	room: { path: 'room', parameter: 'roomId', label: 'Room UUID' },
	task: { path: 'task-management/task', parameter: 'taskId', label: 'Task UUID' },
};

type HistoryResource = keyof typeof historyResources;

export function isHistoryResource(resource: string): resource is HistoryResource {
	return Object.prototype.hasOwnProperty.call(historyResources, resource);
}

/** History payloads are deliberately kept intact, including dynamic merge events. */
export async function executeHistoryOperation(
	this: IExecuteFunctions,
	resource: HistoryResource,
	i: number,
): Promise<INodeExecutionData[]> {
	const { path, parameter, label } = historyResources[resource];
	let uuid: string;
	try {
		uuid = validateUuid(this.getNodeParameter(parameter, i, undefined, { extractValue: true }), label);
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
	}
	const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
	const limit = returnAll ? Number.POSITIVE_INFINITY : (this.getNodeParameter('limit', i, 50) as number);
	if (!returnAll && (!Number.isInteger(limit) || limit < 1)) {
		throw new NodeOperationError(this.getNode(), 'Limit must be a positive integer.', { itemIndex: i });
	}
	// The shared collector uses at most 100 entries per page (history permits 200).
	const items = await seventhingsApiRequestAllItems.call(this, {
		path: `/customer-api/v1/${path}/${uuid}/history`,
	}, limit);
	return items.map((json) => ({ json, pairedItem: { item: i } }));
}
