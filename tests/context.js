const assert = require('node:assert/strict');
const { Seventhings } = require('../dist/nodes/Seventhings/Seventhings.node');

const UUID = 'f4849c54-0437-477a-913c-479c4aebd928';
const OTHER_UUID = 'a2c2e8c0-0000-0000-0000-000000000001';
const node = { name: 'seventhings', type: 'seventhings', typeVersion: 1, position: [0, 0], parameters: {} };

// Mock only n8n's network boundary: execute the real node, handlers and transport.
// Unexpected or unconsumed requests fail the test; no live credentials are used.
function context(parameters = {}, steps = [], options = {}) {
  const queue = [...steps];
  const requests = [];
  const rows = Array.isArray(parameters) ? parameters : [parameters];
  const state = options.state ?? {};
  const ctx = {
    getNode: () => node,
    getInputData: () => rows.map(() => ({ json: {} })),
    getNodeParameter(name, index = 0, fallback, settings) {
      const value = rows[index]?.[name] ?? fallback;
      if (settings?.extractValue && value && typeof value === 'object') return value.value;
      return value;
    },
    getCredentials: async () => ({ subdomain: ' Test ', ...options.credentials }),
    continueOnFail: () => options.continueOnFail ?? false,
    getMode: () => options.mode ?? 'trigger',
    getWorkflowStaticData: () => state,
    helpers: {
      async httpRequestWithAuthentication(credential, request) {
        assert.equal(credential, 'seventhingsApi');
        assert.equal(request.baseURL, 'https://test.seventhings.com');
        requests.push(request);
        const step = queue.shift();
        assert.ok(step, `Unexpected request: ${request.method} ${request.url}`);
        assert.equal(request.headers.Accept, step.accept ?? 'application/json');
        assert.equal(request.method, step.method ?? 'GET');
        assert.equal(request.url, step.path);
        if (step.check) step.check(request);
        if (step.error) throw step.error;
        return step.response;
      },
      async httpRequest() { assert.fail('Unexpected unauthenticated request'); },
      ...options.helpers,
    },
  };
  return {
    ctx, requests, state,
    done() { assert.equal(queue.length, 0, `${queue.length} unconsumed requests`); },
    async execute() { return Seventhings.prototype.execute.call(ctx); },
  };
}

module.exports = { context, UUID, OTHER_UUID, node };
