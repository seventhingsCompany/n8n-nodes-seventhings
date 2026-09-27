import type { INodeProperties } from 'n8n-workflow';

export const reportOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['report'] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			description: 'Generate a PDF from a template and ordered assets',
			action: 'Create a report',
		},
		{
			name: 'Get Many Templates',
			value: 'getTemplates',
			description: 'Get available PDF report templates',
			action: 'Get many report templates',
		},
	],
	default: 'create',
};

export const reportFields: INodeProperties[] = [
	{
		displayName: 'Report Template',
		name: 'reportTemplateId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The PDF template to render',
		displayOptions: { show: { resource: ['report'], operation: ['create'] } },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchReportTemplates', searchable: true },
			},
			{
				displayName: 'By UUID',
				name: 'id',
				type: 'string',
				validation: [{
					type: 'regex',
					properties: {
						regex: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
						errorMessage: 'Not a valid report template UUID',
					},
				}],
			},
		],
	},
	{
		displayName: 'Asset UUIDs',
		name: 'assetUuids',
		type: 'string',
		default: '',
		required: true,
		description: 'Comma-separated asset UUIDs, or an expression returning an array of UUIDs. At least one is required. Order is preserved in the PDF.',
		displayOptions: { show: { resource: ['report'], operation: ['create'] } },
	},
	{
		displayName: 'Output Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		description: 'The binary output field to store the generated PDF in',
		displayOptions: { show: { resource: ['report'], operation: ['create'] } },
	},
	{
		displayName: 'File Name',
		name: 'fileName',
		type: 'string',
		default: 'report.pdf',
		description: 'File name for the generated PDF',
		displayOptions: { show: { resource: ['report'], operation: ['create'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['report'], operation: ['getTemplates'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['report'], operation: ['getTemplates'], returnAll: [false] } },
	},
];
