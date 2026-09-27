import type { INodeProperties } from 'n8n-workflow';

const resources = ['asset', 'location', 'person', 'rentalCase', 'room', 'task'];

export const historyFields: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: resources, operation: ['getHistory'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: { show: { resource: resources, operation: ['getHistory'], returnAll: [false] } },
	},
];
