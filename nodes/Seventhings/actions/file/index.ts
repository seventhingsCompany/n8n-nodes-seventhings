/**
 * File operation handlers.
 *
 * Currently a single operation — Upload — which pushes a file into the tenant's
 * file store and returns its `file_uuid`. Ported from the Zapier `creates/
 * upload_file.js` + `lib/file_upload.js`. The file source is either an upstream
 * node's binary property or a public URL we download.
 *
 * Endpoint (relative to the tenant base URL built in transport):
 *   upload  POST  /customer-api/v1/file   (multipart; UUID from response header)
 */

import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { uploadFile } from '../../transport';

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/** Best-effort filename from a URL's path, or `null`. */
function filenameFromUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		const last = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '');
		return last || null;
	} catch {
		return null;
	}
}

/** Download a public URL to a Buffer, returning the buffer + its content type. */
async function fetchUrlAsBuffer(
	this: IExecuteFunctions,
	url: string,
): Promise<{ buffer: Buffer; contentType: string }> {
	const response = (await this.helpers.httpRequest({
		method: 'GET',
		url,
		encoding: 'arraybuffer',
		json: false,
		returnFullResponse: true,
	})) as { body: unknown; headers?: IDataObject };

	const headers = response.headers ?? {};
	const rawType = (headers['content-type'] ?? headers['Content-Type']) as string | undefined;
	const contentType = rawType ? rawType.split(';')[0].trim() : DEFAULT_CONTENT_TYPE;
	const buffer = Buffer.isBuffer(response.body)
		? response.body
		: Buffer.from(response.body as ArrayBuffer);
	return { buffer, contentType };
}

type FileHandler = (
	this: IExecuteFunctions,
	i: number,
) => Promise<INodeExecutionData[]>;

const handlers: Record<string, FileHandler> = {
	async upload(this: IExecuteFunctions, i: number) {
		const source = this.getNodeParameter('source', i, 'binaryData') as string;
		const filenameOverride = (this.getNodeParameter('filename', i, '') as string).trim();

		let buffer: Buffer;
		let contentType: string;
		let inferredFilename: string | null;

		if (source === 'url') {
			const url = (this.getNodeParameter('fileUrl', i, '') as string).trim();
			if (!url) {
				throw new NodeOperationError(this.getNode(), 'Upload file: a URL is required.', {
					itemIndex: i,
				});
			}
			const downloaded = await fetchUrlAsBuffer.call(this, url);
			buffer = downloaded.buffer;
			contentType = downloaded.contentType;
			inferredFilename = filenameFromUrl(url);
		} else {
			const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i, 'data') as string;
			const binary = this.helpers.assertBinaryData(i, binaryPropertyName);
			buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
			contentType = binary.mimeType || DEFAULT_CONTENT_TYPE;
			inferredFilename = binary.fileName ?? null;
		}

		const filename = filenameOverride || inferredFilename || 'upload.bin';
		const result = await uploadFile.call(this, { buffer, filename, contentType });
		return [{ json: result, pairedItem: { item: i } }];
	},
};

/** True when this File operation is implemented. */
export function isFileOperationSupported(operation: string): boolean {
	return operation in handlers;
}

/** Run a File operation for input item `i`. */
export async function executeFileOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const handler = handlers[operation];
	if (!handler) {
		throw new NodeOperationError(
			this.getNode(),
			`The file operation "${operation}" is not implemented yet.`,
			{ itemIndex: i },
		);
	}
	return handler.call(this, i);
}
