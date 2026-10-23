const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const {ExtensionsManager, crxToZip, normalizeKey} = require('./extensions');

test('crxToZip handles raw zip and crx magic headers', () => {
  const pkZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02]);
  assert.deepEqual(crxToZip(pkZip), pkZip);

  // CRX3 mock
  const headerLen = 8;
  const crx3 = Buffer.alloc(12 + headerLen + 4);
  crx3.write('Cr24', 0);
  crx3.writeUInt32LE(3, 4);
  crx3.writeUInt32LE(headerLen, 8);
  crx3.fill(0xaa, 12, 12 + headerLen);
  crx3.fill(0xbb, 12 + headerLen);
  const zipPart = crxToZip(crx3);
  assert.equal(zipPart.length, 4);
  assert.equal(zipPart[0], 0xbb);
});

test('normalizeKey cleans spaces and punctuation', () => {
  assert.equal(normalizeKey('uBlock Origin'), 'ublockorigin');
  assert.equal(normalizeKey('uBlock Origin!'), 'ublockorigin');
  assert.equal(normalizeKey('Тёмная тема (Dark Reader)'), 'тёмнаятемаdarkreader');
});

test('ExtensionsManager deduplicates catalog and handles install/toggle/remove', async () => {
  const tmpDir = path.resolve('artifacts', 'test-ext-' + Date.now());
  const fakeSession = {
    extensions: {
      loadExtension: async () => ({id: 'runtime-123'}),
      removeExtension: async () => {}
    }
  };

  const mgr = new ExtensionsManager({
    directory: tmpDir,
    session: fakeSession,
    fetch: async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            slug: 'darkreader',
            name: 'Dark Reader',
            summary: 'Dark theme',
            current_version: {file: {url: 'https://example.com/dark.xpi'}}
          }
        ]
      })
    })
  });

  await mgr.initialize();
  assert.equal(mgr.listInstalled().length, 0);

  const results = await mgr.search('dark');
  const darkReader = results.find(r => r.name === 'Dark Reader');
  assert(darkReader, 'Dark Reader must exist in search results');
  // Deduplicated sources should contain both chrome and firefox
  assert(darkReader.sources.includes('chrome'));
  assert(darkReader.sources.includes('firefox'));

  // Test toggle & remove on mock item
  mgr.installed.push({
    id: 'test-ext',
    name: 'Test Extension',
    version: '1.0',
    enabled: true,
    unpackedPath: tmpDir,
    runtimeId: 'test-runtime'
  });
  await mgr.saveConfig();
  assert.equal(mgr.listInstalled().length, 1);

  await mgr.toggle('test-ext', false);
  assert.equal(mgr.listInstalled()[0].enabled, false);

  await mgr.remove('test-ext');
  assert.equal(mgr.listInstalled().length, 0);

  await fs.rm(tmpDir, {recursive: true, force: true});
});

test('extension loading does not grant local file access',async()=>{
 let options;const mgr=new ExtensionsManager({directory:'unused',session:{extensions:{loadExtension:async(_path,value)=>{options=value;return {id:'test'};}}}});await mgr._loadIntoSession('fixture');assert.equal(options.allowFileAccess,false);
});
