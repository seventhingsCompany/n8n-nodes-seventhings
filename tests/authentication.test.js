const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SeventhingsApi } = require('../dist/credentials/SeventhingsApi.credentials');
const { seventhingsApiRequest } = require('../dist/nodes/Seventhings/transport');
const { NodeApiError, NodeOperationError } = require('n8n-workflow');
const { context } = require('./context');

const credential = new SeventhingsApi();
const auth = { subdomain: ' TEST ', username: ' user@example.com ', password: 'a&b=+ ü', clientId: 'client&123' };

test('session auth sends a correctly encoded password grant and returns the cached token', async () => {
  let calls = 0;
  const result = await credential.preAuthentication.call({ helpers: { async httpRequest(request) {
    calls++;
    assert.equal(request.url, 'https://test.seventhings.com/customer-api/v1/auth_token');
    assert.equal(request.method, 'POST');
    assert.ok(request.body instanceof URLSearchParams);
    assert.deepEqual(Object.fromEntries(new URLSearchParams(request.body.toString())), {
      username: 'user@example.com', password: auth.password, client_id: auth.clientId, grant_type: 'password',
    });
    return { access_token: 'token', refresh_token: 'refresh' };
  } } }, auth);
  assert.deepEqual(result, { sessionToken: 'token' });
  assert.equal(calls, 1);
  const token = credential.properties.find((p) => p.name === 'sessionToken');
  assert.equal(token.type, 'hidden');
  assert.equal(token.typeOptions.expirable, true);
  assert.equal(token.typeOptions.password, true);
  assert.equal(credential.properties.find((p) => p.name === 'password').typeOptions.password, true);
  assert.equal(credential.authenticate.properties.headers.Authorization, '=Bearer {{$credentials.sessionToken}}');
  assert.equal(credential.test.request.url, '/customer-api/v1/users');
});

for (const invalid of [{ subdomain: '' }, { subdomain: 'https://test.com' }, { subdomain: 'test/other' }, { username: 'bad' }, { username: '' }]) {
  test(`auth rejects invalid inputs before networking: ${JSON.stringify(invalid)}`, async () => {
    await assert.rejects(credential.preAuthentication.call({ helpers: { httpRequest() { assert.fail('Must not request'); } } }, { ...auth, ...invalid }));
  });
}

for (const response of [null, {}, { access_token: '' }, { access_token: 42 }]) {
  test(`auth rejects a missing or invalid token: ${JSON.stringify(response)}`, async () => {
    await assert.rejects(credential.preAuthentication.call({ helpers: { httpRequest: async () => response } }, auth), /no access token/);
  });
}

for (const status of [401, 403, 404, 422, 500]) {
  test(`transport surfaces HTTP ${status} as NodeApiError`, async () => {
    const h = context({}, [{ path: '/test', error: { message: 'API rejected request', statusCode: status } }]);
    await assert.rejects(seventhingsApiRequest.call(h.ctx, { path: '/test' }), NodeApiError);
    h.done();
  });
}

test('transport rejects invalid subdomain as a configuration error', async () => {
  const h = context({}, [], { credentials: { subdomain: 'bad/host' } });
  await assert.rejects(seventhingsApiRequest.call(h.ctx, { path: '/test' }), NodeOperationError);
  assert.equal(h.requests.length, 0);
});
