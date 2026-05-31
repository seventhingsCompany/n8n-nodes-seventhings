/**
 * Shared HTTP transport for the Seventhings nodes.
 *
 * Ported from the Zapier integration's `lib/request.js` (`authedRequest` +
 * `apiError`). Responsibilities:
 *   - Build the per-tenant base URL from the credential's subdomain
 *     (never hardcoded — derived and validated per request).
 *   - Delegate auth to n8n via `httpRequestWithAuthentication`, so the session
 *     token from the credential's `preAuthentication` (Phase 1) is injected and
 *     auto-refreshed on 401.
 *   - Map non-2xx responses onto `NodeApiError` (404 / 4xx / 5xx) the way the
 *     Zapier `apiError` helper did, and validation failures onto
 *     `NodeOperationError`.
 */

import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { buildBaseUrl } from './validators';

/** The machine name of the Seventhings credential (defined in Phase 1). */
export const CREDENTIALS_NAME = 'seventhingsApi';

/** Contexts from which the API helper may be called. */
export type SeventhingsRequestContext =
	| IExecuteFunctions
	| ILoadOptionsFunctions
	| IPollFunctions
	| IHookFunctions;

export interface SeventhingsApiRequestOptions {
	/** Path relative to the tenant base URL, e.g. `/customer-api/v1/object`. */
	path: string;
	method?: IHttpRequestMethods;
	/** Request body: a JSON object, a JSON array (e.g. attach/detach), raw bytes, or a string. */
	body?: IDataObject | IDataObject[] | Buffer | string;
	/** Query-string parameters. */
	qs?: IDataObject;
	headers?: IDataObject;
	/**
	 * When `true`, resolve with the full response (`{ body, headers, statusCode }`)
	 * instead of just the body — needed to read the `Location` header on creates.
	 */
	returnFullResponse?: boolean;
	/** Override JSON handling (defaults to `true`). */
	json?: boolean;
	/** Encoding for binary downloads (e.g. `'arraybuffer'`). */
	encoding?: IHttpRequestOptions['encoding'];
}

/**
 * Issue an authenticated request against the seventhings API.
 *
 * Resolves with the parsed response body by default, or the full response when
 * `returnFullResponse` is set.
 */
export async function seventhingsApiRequest(
	this: SeventhingsRequestContext,
	options: SeventhingsApiRequestOptions,
): Promise<IDataObject | IDataObject[] | Buffer | unknown> {
	const credentials = await this.getCredentials(CREDENTIALS_NAME);

	let baseURL: string;
	try {
		baseURL = buildBaseUrl(credentials.subdomain as string | undefined);
	} catch (error) {
		// Invalid subdomain is a configuration problem, not an API failure.
		throw new NodeOperationError(this.getNode(), error as Error);
	}

	const requestOptions: IHttpRequestOptions = {
		baseURL,
		url: options.path,
		method: options.method ?? 'GET',
		headers: {
			Accept: 'application/json',
			...(options.headers ?? {}),
		},
		json: options.json ?? true,
		returnFullResponse: options.returnFullResponse ?? false,
	};

	if (options.body !== undefined) {
		requestOptions.body = options.body;
	}
	if (options.qs !== undefined) {
		requestOptions.qs = options.qs;
	}
	if (options.encoding !== undefined) {
		requestOptions.encoding = options.encoding;
	}

	try {
		return await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIALS_NAME,
			requestOptions,
		);
	} catch (error) {
		// n8n throws on non-2xx; surface it as a typed API error. n8n's NodeApiError
		// already derives a friendly message from the status code (incl. 404/4xx/5xx),
		// mirroring the Zapier `apiError` mapping.
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}
