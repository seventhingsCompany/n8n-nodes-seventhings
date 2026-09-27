// Opt-in checks against a real tenant: reads and non-persisted PDF generation. This executes the
// compiled n8n nodes with a live HTTP adapter, not an n8n workflow/server.
// Load credentials with node --env-file=/path/to/.env tests/live-smoke.js.
const { Seventhings } = require('../dist/nodes/Seventhings/Seventhings.node');
const { SeventhingsTrigger } = require('../dist/nodes/SeventhingsTrigger/SeventhingsTrigger.node');
const { SeventhingsApi } = require('../dist/credentials/SeventhingsApi.credentials');
const assert = require('node:assert/strict');

const env = process.env;
const credentials = {
  subdomain: env.SEVENTHINGS_SUBDOMAIN || env.authData_subdomain,
  username: env.SEVENTHINGS_USERNAME || env.EMAIL || env.authData_username,
  password: env.SEVENTHINGS_PASSWORD || env.PASSWORD || env.authData_password,
  clientId: env.SEVENTHINGS_CLIENT_ID || env.CLIENT_ID || env.authData_client_id,
};
const results = [];
let requestCount = 0;
let token;
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length).toLowerCase();

async function request(options, authenticated = false) {
  const url = new URL(options.url, options.baseURL);
  for (const [key, value] of Object.entries(options.qs || {})) {
    for (const entry of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(entry));
  }
  const headers = { ...options.headers };
  if (authenticated) headers.Authorization = `Bearer ${token}`;
  let body = options.body;
  if (body && !(body instanceof URLSearchParams) && !Buffer.isBuffer(body) && typeof body !== 'string') {
    body = JSON.stringify(body);
    headers['Content-Type'] ||= 'application/json';
  }
  requestCount++;
  const response = await fetch(url, { method: options.method || 'GET', headers, body, signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok) {
    // Never print response bodies or credentials in the smoke report.
    const error = new Error(`HTTP ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  let data;
  if (options.encoding === 'arraybuffer') {
    data = Buffer.from(await response.arrayBuffer());
  } else {
    const text = await response.text();
    data = text ? JSON.parse(text) : '';
  }
  if (process.argv.includes('--inspect-shapes') && Array.isArray(data?.items) && data.items.length) {
    console.log(`SHAPE ${url.pathname}: ${Object.entries(data.items[0]).map(([key, value]) => `${key}:${typeof value}`).join(', ')}`);
    const fields = data.items[0].fields;
    if (fields && typeof fields === 'object') console.log(`FIELDS ${url.pathname}: ${Object.entries(fields).map(([key, value]) => `${key}:${typeof value}`).join(', ')}`);
  }
  return options.returnFullResponse ? { body: data, headers: Object.fromEntries(response.headers), statusCode: response.status } : data;
}

function context(parameters = {}) {
  return {
    getNode: () => ({ name: 'seventhings smoke', type: 'seventhings', typeVersion: 1, parameters: {}, position: [0, 0] }),
    getCredentials: async () => credentials,
    getNodeParameter(name, _index, fallback, settings) {
      const value = parameters[name] ?? fallback;
      return settings?.extractValue && value && typeof value === 'object' ? value.value : value;
    },
    getInputData: () => [{ json: {} }],
    continueOnFail: () => false,
    getMode: () => 'manual',
    getWorkflowStaticData: () => ({}),
    helpers: {
      httpRequest: (options) => request(options),
      httpRequestWithAuthentication: (_name, options) => request(options, true),
      prepareBinaryData: async (buffer, fileName, mimeType) => ({ data: buffer.toString('base64'), fileName, mimeType }),
    },
  };
}

async function step(name, perform) {
  if (only && name !== 'authentication' && !name.toLowerCase().includes(only)) return undefined;
  try {
    const result = await perform();
    const count = Array.isArray(result) ? result.length : result ? 1 : 0;
    results.push({ name, passed: true });
    console.log(`PASS ${name}: ${count} record(s)`);
    return result;
  } catch (error) {
    results.push({ name, passed: false });
    console.log(`FAIL ${name}: ${error.httpCode || error.statusCode || error.name || 'Error'}`);
    return undefined;
  }
}

function skip(name, reason) {
  if (only && !name.toLowerCase().includes(only)) return;
  results.push({ name, skipped: true });
  console.log(`SKIP ${name}: ${reason}`);
}

async function main() {
  if (Object.values(credentials).some((value) => !value)) {
    throw new Error('Set SEVENTHINGS_SUBDOMAIN, SEVENTHINGS_USERNAME, SEVENTHINGS_PASSWORD and SEVENTHINGS_CLIENT_ID, or load the existing test-tenant .env using --env-file.');
  }
  const api = new SeventhingsApi();
  const session = await step('authentication', () => api.preAuthentication.call(context(), credentials));
  if (!session) { process.exitCode = 1; return; }
  token = session.sessionToken;
  const node = new Seventhings();
  const execute = async (params) => {
    const items = (await node.execute.call(context(params)))[0].map((item) => item.json);
    for (const item of items) {
      if (item.fields?.id !== undefined) assert.equal(item.id, item.fields.id, 'Nested record ID must be available to downstream nodes');
    }
    return items;
  };
  let hasNumericLocations = false;
  let assets = [];
  const resources = node.description.properties.find((p) => p.name === 'resource').options;
  const idParameters = { asset: 'assetId', task: 'taskId', rentalCase: 'rentalCaseId', location: 'locationId', room: 'roomId', person: 'personId', user: 'userId', file: 'fileId', fieldDefinition: 'fieldDefinitionId', circularityHubItem: 'id', circularityHubOrder: 'id' };
  for (const { value: resource } of resources) {
    if (resource === 'report') continue;
    const items = await step(`${resource}.getAll`, () => execute({ resource, operation: 'getAll', returnAll: false, limit: 2, template: 'asset' }));
    if (resource === 'asset') assets = items || [];
    if (resource === 'location') hasNumericLocations = items?.some((item) => typeof item.id === 'number') || false;
    if (items?.length) {
      const first = items[0];
      const id = resource.startsWith('circularityHub') ? first.id : first.uuid || first.asset_uuid;
      if (id) await step(`${resource}.get`, () => execute({ resource, operation: 'get', [idParameters[resource]]: id, template: 'asset' }));
      if (id && ['asset', 'room', 'location', 'person', 'task', 'rentalCase'].includes(resource)) {
        await step(`${resource}.getHistory`, async () => {
          const history = await execute({ resource, operation: 'getHistory', [idParameters[resource]]: id, returnAll: false, limit: 2 });
          assert.ok(history.length <= 2, 'History must respect Limit');
          return history;
        });
      }
    } else if (items && ['asset', 'room', 'location', 'person', 'task', 'rentalCase'].includes(resource)) {
      skip(`${resource}.getHistory`, 'No existing record available');
    }
  }

  const barcodeOf = (asset) => asset.barcode || asset.scancode || asset.fields?.barcode || asset.fields?.scancode;
  const barcodeAsset = assets.find((asset) => barcodeOf(asset));
  if (barcodeAsset) {
    await step('asset.getByBarcode', async () => {
      const items = await execute({ resource: 'asset', operation: 'getByBarcode', barcode: String(barcodeOf(barcodeAsset)) });
      assert.equal(items.length, 1);
      assert.equal(items[0].uuid || items[0].asset_uuid, barcodeAsset.uuid || barcodeAsset.asset_uuid, 'Barcode must resolve to the sampled asset');
      return items;
    });
  } else {
    skip('asset.getByBarcode', 'No sampled asset with a scancode');
  }

  const templates = await step('report.getTemplates', () => execute({ resource: 'report', operation: 'getTemplates', returnAll: true }));
  if (templates?.length) {
    if (!assets.length) assets = await step('report.sampleAssets', () => execute({ resource: 'asset', operation: 'getAll', returnAll: false, limit: 2 })) || [];
    if (assets.length) {
      await step('report.create', async () => {
        const assetUuids = assets.map((asset) => asset.uuid || asset.asset_uuid).reverse();
        const [items] = await node.execute.call(context({
          resource: 'report', operation: 'create', reportTemplateId: { mode: 'list', value: templates[0].uuid },
          assetUuids, binaryPropertyName: 'document', fileName: 'smoke-report.pdf',
        }));
        assert.equal(items.length, 1);
        assert.deepEqual(items[0].json.object_uuids, assetUuids);
        assert.deepEqual(items[0].pairedItem, { item: 0 });
        const binary = items[0].binary.document;
        assert.equal(binary.mimeType, 'application/pdf');
        assert.equal(binary.fileName, 'smoke-report.pdf');
        const pdf = Buffer.from(binary.data, 'base64');
        assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', 'Response must have a PDF header');
        assert.ok(pdf.subarray(-1024).includes(Buffer.from('%%EOF')), 'Response must contain the PDF end marker');
        console.log(`PDF validated: ${pdf.length} bytes, ${assetUuids.length} asset(s)`);
        return items;
      });
    } else {
      skip('report.create', 'No existing assets available');
    }
  } else if (templates) {
    skip('report.create', 'No report templates available');
  }
  for (const group of ['loadOptions', 'listSearch', 'resourceMapping']) {
    for (const [name, perform] of Object.entries(node.methods[group])) {
      await step(`${group}.${name}`, async () => {
        const result = await perform.call(context({ template: 'asset' }));
        if (name === 'getLocationOptions' && hasNumericLocations) assert.ok(result.length > 0, 'Building dropdown must include existing locations');
        return result.results || result.fields || result;
      });
    }
  }
  const trigger = new SeventhingsTrigger();
  for (const { value: event } of trigger.description.properties.find((p) => p.name === 'event').options) {
    await step(`trigger.${event}`, async () => (await trigger.poll.call(context({ event, daysAhead: 3 })))?.[0] || []);
  }
  const failed = results.filter((result) => result.passed === false).length;
  const passed = results.filter((result) => result.passed === true).length;
  const skipped = results.filter((result) => result.skipped).length;
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped; ${requestCount} live HTTP requests. No tenant records written.`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
