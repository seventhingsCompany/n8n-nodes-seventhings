/**
 * UI properties for the File resource.
 *
 * Ported from the Zapier `creates/upload_file.js` input fields. The Zapier
 * "file" input accepted a binary, a URL, or a text string; in n8n the natural
 * sources are an upstream node's binary property or a public URL (the text
 * branch is dropped — see the dev plan's Out-of-scope).
 *
 * The Upload `operation` itself is declared inline in `Seventhings.node.ts`
 * alongside the other resources' operation blocks.
 */

import type { INodeProperties } from 'n8n-workflow';

export const fileFields: INodeProperties[] = [
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
];
