/**
 * Seventhings API credential.
 *
 * Ports the Zapier integration's `type: "session"` authentication
 * (`authentication.js`). Seventhings issues a short-lived bearer token from a
 * form-urlencoded password grant; every subsequent request carries it as
 * `Authorization: Bearer <token>`.
 *
 * The idiomatic n8n mapping (confirmed against n8n's `MetabaseApi` credential):
 *   - A hidden, **expirable** `sessionToken` property. The `expirable` flag is
 *     what makes n8n run `preAuthentication` whenever the token is empty or has
 *     expired, then cache the returned value back into the credential.
 *   - `preAuthentication` performs the password-grant login and returns the
 *     fresh token under the `sessionToken` key.
 *   - `authenticate` injects the cached token as a Bearer header.
 *   - `test` hits `/customer-api/v1/users` to validate the connection.
 *
 * n8n automatically re-runs `preAuthentication` on a `401` response, which
 * matches seventhings (expired tokens return 401) — so no custom refresh
 * handling is needed in the transport layer.
 */

import type {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IAuthenticateGeneric,
	IDataObject,
	IHttpRequestHelper,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

import { buildBaseUrl, validateEmail } from '../nodes/Seventhings/transport/validators';

export class SeventhingsApi implements ICredentialType {
	name = 'seventhingsApi';

	displayName = 'Seventhings API';

	icon: Icon = { light: 'file:seventhings.svg', dark: 'file:seventhings.dark.svg' };

	documentationUrl =
		'https://helpcenter.seventhings.com/en/articles/58547-how-do-i-use-the-seventhings-api';

	properties: INodeProperties[] = [
		{
			displayName: 'Subdomain',
			name: 'subdomain',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'yourcompany',
			description:
				'The subdomain of your seventhings instance. If you log in at https://yourcompany.seventhings.com, enter "yourcompany".',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'name@example.com',
			description: 'Your seventhings login username (email address)',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Your seventhings password',
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
			required: true,
			description:
				'Your client ID, found in seventhings under Integrations → Rest API',
		},
		{
			// Hidden, cached bearer token. n8n only runs `preAuthentication` (to
			// fetch and cache this token) when it finds a property that is BOTH
			// `type: 'hidden'` AND `expirable: true` — a plain `string` here makes
			// n8n skip preAuthentication entirely, so the token never gets set and
			// every request (and the credential test) fails with 401. Matches the
			// canonical `MetabaseApi` / `CrowdStrikeOAuth2Api` credentials.
			displayName: 'Session Token',
			name: 'sessionToken',
			type: 'hidden',
			typeOptions: {
				password: true,
				expirable: true,
			},
			default: '',
		},
	];

	async preAuthentication(
		this: IHttpRequestHelper,
		credentials: ICredentialDataDecryptedObject,
	): Promise<IDataObject> {
		// Validate inputs up front so the user sees a clear message on connect
		// rather than an opaque network error. `buildBaseUrl` enforces the
		// subdomain regex; `validateEmail` enforces the username-is-email rule.
		const baseUrl = buildBaseUrl(credentials.subdomain as string | undefined);
		const username = validateEmail(credentials.username);

		// The auth endpoint expects an `application/x-www-form-urlencoded` body.
		// `helpers.httpRequest` serializes a plain object as JSON, so the body
		// must be a `URLSearchParams` instance for it to be form-encoded (and the
		// helper sets the matching Content-Type itself).
		const form = new URLSearchParams({
			username,
			password: credentials.password as string,
			client_id: credentials.clientId as string,
			grant_type: 'password',
		});

		const response = (await this.helpers.httpRequest({
			method: 'POST',
			url: `${baseUrl}/customer-api/v1/auth_token`,
			headers: {
				Accept: 'application/json',
			},
			body: form,
		})) as IDataObject;

		const accessToken = response?.access_token;
		if (typeof accessToken !== 'string' || accessToken === '') {
			throw new Error('Authentication failed: no access token returned by seventhings.');
		}

		// Key must match the `sessionToken` property name so n8n caches it there.
		return { sessionToken: accessToken };
	}

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.sessionToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '=https://{{$credentials.subdomain}}.seventhings.com',
			url: '/customer-api/v1/users',
			method: 'GET',
		},
	};
}
