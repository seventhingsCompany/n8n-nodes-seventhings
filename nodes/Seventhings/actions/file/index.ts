/**
 * File operation handlers.
 *
 * File operations. Upload pushes a file into the tenant's file store and
 * returns its `file_uuid`; SDK-parity operations list/get metadata and download
 * raw data/thumbnail bytes into n8n binary data.
 *
 * Endpoint (relative to the tenant base URL built in transport):
 *   upload  POST  /customer-api/v1/file   (multipart; UUID from response header)
 *   list    GET   /customer-api/v1/files
 *   get     GET   /customer-api/v1/file/{uuid}
 *   data    GET   /customer-api/v1/file/{uuid}/data
 *   thumb   GET   /customer-api/v1/file/{uuid}/thumbnail
 */

import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	normalizeFile,
	seventhingsApiRequest,
	uploadFile,
	validateUuid,
} from '../../transport';

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
const FILE_PATH = '/customer-api/v1/file';
const FILES_PATH = '/customer-api/v1/files';

function getFileUuid(this: IExecuteFunctions, i: number): string {
	const value = this.getNodeParameter('fileId', i, undefined, {
		extractValue: true,
	}) as string;
	try {
		return validateUuid(value, 'File UUID');
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
	}
}

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

function bufferFromBody(body: unknown): Buffer {
	if (Buffer.isBuffer(body)) {
		return body;
	}
	if (body instanceof ArrayBuffer) {
		return Buffer.from(body);
	}
	if (ArrayBuffer.isView(body)) {
		return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
	}
	if (typeof body === 'string') {
		return Buffer.from(body);
	}
	return Buffer.from(body as ArrayBuffer);
}

function contentTypeFromHeaders(headers: IDataObject | undefined): string {
	const raw = (headers?.['content-type'] ?? headers?.['Content-Type']) as string | undefined;
	return raw ? raw.split(';')[0].trim() : DEFAULT_CONTENT_TYPE;
}

async function fetchFile(this: IExecuteFunctions, uuid: string): Promise<IDataObject> {
	const response = (await seventhingsApiRequest.call(this, {
		path: `${FILE_PATH}/${uuid}`,
	})) as IDataObject;
	return normalizeFile(response, uuid);
}

async function downloadFileBinary(
	this: IExecuteFunctions,
	i: number,
	uuid: string,
	kind: 'data' | 'thumbnail',
): Promise<INodeExecutionData[]> {
	const metadata = await fetchFile.call(this, uuid);
	const response = (await seventhingsApiRequest.call(this, {
		path: `${FILE_PATH}/${uuid}/${kind}`,
		json: false,
		encoding: 'arraybuffer',
		returnFullResponse: true,
	})) as { body: unknown; headers?: IDataObject };

	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i, 'data') as string;
	const originalName = (metadata.name as string | undefined) ?? `${uuid}.bin`;
	const filename = kind === 'thumbnail' ? `thumbnail-${originalName}` : originalName;
	const binaryData = await this.helpers.prepareBinaryData(
		bufferFromBody(response.body),
		filename,
		contentTypeFromHeaders(response.headers),
	);

	return [
		{
			json: {
				...metadata,
				downloaded: true,
				download_type: kind,
				binary_property: binaryPropertyName,
			},
			binary: {
				[binaryPropertyName]: binaryData,
			},
			pairedItem: { item: i },
		},
	];
}

type FileHandler = (
	this: IExecuteFunctions,
	i: number,
) => Promise<INodeExecutionData[]>;

const handlers: Record<string, FileHandler> = {
	async get(this: IExecuteFunctions, i: number) {
		const uuid = getFileUuid.call(this, i);
		const record = await fetchFile.call(this, uuid);
		return [{ json: record, pairedItem: { item: i } }];
	},

	async getAll(this: IExecuteFunctions, i: number) {
		const returnAll = this.getNodeParameter('returnAll', i, true) as boolean;
		const limit = returnAll ? Number.POSITIVE_INFINITY : (this.getNodeParameter('limit', i, 50) as number);
		const response = (await seventhingsApiRequest.call(this, {
			path: FILES_PATH,
		})) as IDataObject;
		const items = Array.isArray(response.items) ? (response.items as IDataObject[]) : [];
		return items
			.slice(0, limit)
			.map((item) => ({ json: normalizeFile(item), pairedItem: { item: i } }));
	},

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

	async downloadData(this: IExecuteFunctions, i: number) {
		const uuid = getFileUuid.call(this, i);
		return downloadFileBinary.call(this, i, uuid, 'data');
	},

	async downloadThumbnail(this: IExecuteFunctions, i: number) {
		const uuid = getFileUuid.call(this, i);
		return downloadFileBinary.call(this, i, uuid, 'thumbnail');
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
