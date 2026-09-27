const assert = require('node:assert/strict');
const { test } = require('node:test');
const { context, UUID, OTHER_UUID } = require('./context');
const P = '/customer-api/v1';
const bytes = Buffer.from([0, 255, 128, 10, 65]);

for (const [operation, kind] of [['downloadData', 'data'], ['downloadThumbnail', 'thumbnail']]) {
  for (const format of ['buffer', 'arraybuffer', 'view']) {
    test(`file ${operation}: preserves ${format} bytes, metadata and binary output name`, async () => {
      const body = format === 'buffer' ? bytes : format === 'arraybuffer' ? Uint8Array.from(bytes).buffer : Uint8Array.from([99, ...bytes, 99]).subarray(1, 6);
      let prepared = false;
      const h = context({ resource: 'file', operation, fileId: UUID, binaryPropertyName: 'attachment' }, [
        { path: `${P}/file/${UUID}`, response: { uuid: UUID, name: 'photo.png' } },
        { path: `${P}/file/${UUID}/${kind}`, check: (r) => { assert.equal(r.json, false); assert.equal(r.encoding, 'arraybuffer'); assert.equal(r.returnFullResponse, true); }, response: { body, headers: { 'content-type': 'image/png; charset=binary' } } },
      ], { helpers: { async prepareBinaryData(buffer, filename, mimeType) {
        prepared = true;
        assert.deepEqual(buffer, bytes);
        assert.equal(filename, kind === 'thumbnail' ? 'thumbnail-photo.png' : 'photo.png');
        assert.equal(mimeType, 'image/png');
        return { data: 'stored-binary-id', mimeType, fileName: filename };
      } } });
      const [[item]] = await h.execute();
      assert.equal(prepared, true);
      assert.equal(item.binary.attachment.data, 'stored-binary-id');
      assert.equal(item.json.downloaded, true);
      assert.deepEqual(item.pairedItem, { item: 0 });
      h.done();
    });
  }
}

for (const headers of [{ 'location-uuid': UUID }, { Location: `${P}/file/${UUID}/data?download=1` }]) {
  test(`file upload extracts UUID from ${Object.keys(headers)[0]} and preserves multipart bytes`, async () => {
    const h = context({ resource: 'file', operation: 'upload' }, [{
      method: 'POST', path: `${P}/file`, response: { headers }, check: (r) => {
        assert.equal(r.json, false);
        const boundary = r.headers['Content-Type'].split('boundary=')[1];
        assert.ok(boundary);
        assert.equal(Number(r.headers['Content-Length']), r.body.length);
        assert.ok(r.body.includes(bytes));
        assert.match(r.body.toString(), /name="data"; filename="upload.bin"/);
        assert.ok(r.body.toString().endsWith(`\r\n--${boundary}--\r\n`));
      },
    }], { helpers: { assertBinaryData: () => ({ mimeType: 'application/octet-stream', fileName: 'upload.bin' }), getBinaryDataBuffer: async () => bytes } });
    const [[item]] = await h.execute();
    assert.equal(item.json.file_uuid, UUID);
    assert.equal(item.json.size, bytes.length);
    h.done();
  });
}

test('file URL upload fetches without tenant credentials and uses decoded filename', async () => {
  let downloaded = false;
  const h = context({ resource: 'file', operation: 'upload', source: 'url', fileUrl: 'https://files.example/my%20file.pdf' }, [{
    method: 'POST', path: `${P}/file`, response: { headers: { 'location-uuid': UUID } }, check: (r) => assert.match(r.body.toString(), /filename="my file.pdf"/),
  }], { helpers: { async httpRequest(request) {
    downloaded = true;
    assert.equal(request.url, 'https://files.example/my%20file.pdf');
    assert.equal(request.headers, undefined);
    return { body: bytes, headers: { 'content-type': 'application/pdf' } };
  } } });
  await h.execute();
  assert.equal(downloaded, true);
  h.done();
});

for (const [operation, suffix, flag] of [['attachFile', 'add-file', 'attached'], ['detachFile', 'remove-file', 'detached']]) {
  test(`asset ${operation} sends kebab-case array payload and returns confirmation`, async () => {
    const h = context({ resource: 'asset', operation, assetId: UUID, fileUuid: OTHER_UUID, fieldKey: ' documents ' }, [{
      method: 'POST', path: `${P}/object/${UUID}/${suffix}`, response: { statusCode: 200, body: '' }, check: (r) => { assert.equal(r.returnFullResponse, true); assert.deepEqual(r.body, [{ 'field-key': 'documents', 'file-uuid': OTHER_UUID }]); },
    }]);
    assert.equal((await h.execute())[0][0].json[flag], true);
    h.done();
  });

  test(`asset ${operation} does not report HTTP 207 partial failure as success`, async () => {
    const h = context({ resource: 'asset', operation, assetId: UUID, fileUuid: OTHER_UUID, fieldKey: 'documents' }, [{
      method: 'POST', path: `${P}/object/${UUID}/${suffix}`,
      check: (r) => assert.equal(r.returnFullResponse, true), response: { statusCode: 207, body: ['File already exists in field key documents'], headers: {} },
    }]);
    await assert.rejects(h.execute(), /already exists/);
    h.done();
  });
}

test('file getAll accepts a bare array response as well as items wrapper', async () => {
  const h = context({ resource: 'file', operation: 'getAll' }, [{ path: `${P}/files`, response: [{ uuid: UUID }] }]);
  assert.equal((await h.execute())[0].length, 1);
  h.done();
});
