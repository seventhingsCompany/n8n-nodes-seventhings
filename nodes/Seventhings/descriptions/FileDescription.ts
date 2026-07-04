/**
 * UI properties for the File resource.
 *
 * Upload is ported from the Zapier `creates/upload_file.js` input fields. SDK
 * parity also exposes file metadata listing/get and binary data/thumbnail
 * downloads.
 */

import type { INodeProperties } from 'n8n-workflow';

const UUID_REGEX =
	'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

function fileLocator(operations: string[]): INodeProperties {
	return {
		displayName: 'File',
		name: 'fileId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The file to act on',
		displayOptions: { show: { resource: ['file'], operation: operations } },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchFiles', searchable: true },
			},
			{
				displayName: 'By UUID',
				name: 'id',
				type: 'string',
				placeholder: 'f4849c54-0437-477a-913c-479c4aebd928',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: UUID_REGEX,
							errorMessage: 'Not a valid file UUID',
						},
					},
				],
			},
		],
	};
}

export const fileFields: INodeProperties[] = [
	fileLocator(['get', 'downloadData', 'downloadThumbnail']),
	{
		displayName: 'Source',
		name: 'source',
		type: 'options',
		noDataExpression: true,
		default: 'binaryData',
		description: 'Where the file to upload comes from',
		options: [
			{
				name: 'Binary File',
				value: 'binaryData',
				description: 'Use a binary property from a previous node',
			},
			{
				name: 'URL',
				value: 'url',
				description: 'Download the file from a public URL',
			},
		],
		displayOptions: { show: { resource: ['file'], operation: ['upload'] } },
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		description: 'The name of the input binary field containing the file to upload',
		displayOptions: {
			show: { resource: ['file'], operation: ['upload'], source: ['binaryData'] },
		},
	},
	{
		displayName: 'URL',
		name: 'fileUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'https://example.com/invoice.pdf',
		description: 'A public URL to download the file from',
		displayOptions: {
			show: { resource: ['file'], operation: ['upload'], source: ['url'] },
		},
	},
	{
		displayName: 'Filename',
		name: 'filename',
		type: 'string',
		default: '',
		description: 'Override the inferred filename for the uploaded file',
		displayOptions: { show: { resource: ['file'], operation: ['upload'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: true,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['file'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['file'], operation: ['getAll'], returnAll: [false] },
		},
	},
	{
		displayName: 'Output Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		description: 'Name of the binary field to write the downloaded file to',
		displayOptions: {
			show: { resource: ['file'], operation: ['downloadData', 'downloadThumbnail'] },
		},
	},
];
