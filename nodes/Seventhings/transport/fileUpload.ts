/**
 * Multipart file upload, ported from the Zapier integration's
 * `lib/file_upload.js`.
 *
 * The seventhings file endpoint (`POST /customer-api/v1/file`) accepts a single
 * multipart part named `data` and returns the new file's UUID in a
 * `location-uuid` response header (falling back to the `Location` header). We
 * build the multipart body by hand — same as the Zapier helper — so the request
 * shape is explicit and we depend on no extra packages.
 */

import type { IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	seventhingsApiRequest,
	type SeventhingsRequestContext,
} from './apiRequest';
import { uuidFromLocation, locationHeader } from './validators';

const FILE_PATH = '/customer-api/v1/file';
const DEFAULT_FILENAME = 'upload.bin';
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/** A monotonic counter making each boundary in a run distinct (no `Math.random`). */
let boundarySeq = 0;

/**
 * Build the multipart/form-data body for a single `data` part.
 *
 * The boundary only needs to not appear in the file bytes; a fixed prefix plus
 * an in-process counter is sufficient and deterministic.
 */
export function buildMultipartBody(
	filename: string,
	contentType: string,
	fileBuffer: Buffer,
): { body: Buffer; boundary: string } {
	boundarySeq += 1;
	const boundary = `----seventhingsFormBoundary${boundarySeq.toString(16)}${fileBuffer.length.toString(16)}`;
	const safeName = String(filename).replace(/"/g, '');
	const header =
		`--${boundary}\r\n` +
		`Content-Disposition: form-data; name="data"; filename="${safeName}"\r\n` +
		`Content-Type: ${contentType}\r\n\r\n`;
	const footer = `\r\n--${boundary}--\r\n`;
	const body = Buffer.concat([
		Buffer.from(header, 'utf8'),
		fileBuffer,
		Buffer.from(footer, 'utf8'),
	]);
	return { body, boundary };
}

/**
 * Extract the file UUID from an upload `Location` header. The file endpoint's
 * Location points at the file's `/data` sub-resource, so strip that suffix
 * before reading the trailing UUID.
 */
export function uuidFromUploadLocation(location: unknown): string | null {
	if (typeof location !== 'string' || location === '') {
		return null;
	}
	const stripped = location.replace(/\/data\/?(\?.*)?$/, '');
	return uuidFromLocation(stripped);
}

/** Read the `location-uuid` response header (case-insensitive), if present. */
function locationUuidHeader(headers: unknown): string | undefined {
	if (!headers || typeof headers !== 'object') {
		return undefined;
	}
	const record = headers as Record<string, unknown>;
	const value = record['location-uuid'] ?? record['Location-UUID'] ?? record['Location-Uuid'];
	return typeof value === 'string' ? value : undefined;
}

export interface UploadFileInput {
	buffer: Buffer;
	filename: string;
	contentType: string;
}

/**
 * Upload a file buffer and return its record:
 * `{ file_uuid, uuid, filename, content_type, size }`.
 *
 * Throws `NodeOperationError` when the upload succeeds but the API returns no
 * UUID (mirrors the Zapier helper).
 */
export async function uploadFile(
	this: SeventhingsRequestContext,
	input: UploadFileInput,
): Promise<IDataObject> {
	const filename = input.filename || DEFAULT_FILENAME;
	const contentType = input.contentType || DEFAULT_CONTENT_TYPE;
	const { body, boundary } = buildMultipartBody(filename, contentType, input.buffer);

	const response = (await seventhingsApiRequest.call(this, {
		method: 'POST',
		path: FILE_PATH,
		body,
		// Raw multipart body — n8n must not JSON-encode it or set its own type.
		json: false,
		headers: {
			'Content-Type': `multipart/form-data; boundary=${boundary}`,
			'Content-Length': String(body.length),
		},
		returnFullResponse: true,
	})) as { headers?: IDataObject };

	const headers = response.headers ?? {};
	const uuid =
		locationUuidHeader(headers) ?? uuidFromUploadLocation(locationHeader(headers));

	if (!uuid) {
		throw new NodeOperationError(
			this.getNode(),
			'Upload file: the upload succeeded but the API did not return a file UUID.',
		);
	}

	return {
		file_uuid: uuid,
		uuid,
		filename,
		content_type: contentType,
		size: input.buffer.length,
	};
}
