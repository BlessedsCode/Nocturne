const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Profile } = require('../src/main/profile');
const { setupFavicons } = require('../src/main/favicons');

test('favicon discovery reads bounded HTML head but rejects truncated oversized images',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nocturne-icon-limits-'));const requested=[];
 const icons=setupFavicons({directory:dir,fetch:async url=>{requested.push(url);if(url.endsWith('/large.svg'))return new Response('x'.repeat(70000),{headers:{'content-type':'image/svg+xml'}});if(url.endsWith('/favicon.ico'))return new Response('valid-fallback',{headers:{'content-type':'image/x-icon'}});return new Response('<link rel="icon" href="/large.svg">'+' '.repeat(150000));}});
 try{const icon=await icons.get('https://icon.example/');assert(requested.includes('https://icon.example/large.svg'));assert.equal(Buffer.from(icon.split(',')[1],'base64').toString(),'valid-fallback');}finally{icons.flush();fs.rmSync(dir,{recursive:true,force:true});}
});

test('profile memory saver preferences: defaults, validation, and exceptions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nocturne-ms-'));
  try {
    const profile = new Profile(dir);
    assert.equal(profile.preferences.memorySaver, true);
    assert.equal(profile.preferences.discardTimeoutMinutes, 30);
    assert.deepEqual(profile.preferences.discardExceptions, []);

    // Valid update
    profile.update({
      memorySaver: false,
      discardTimeoutMinutes: 60,
      discardExceptions: ['example.com', 'mail.google.com']
    });
    assert.equal(profile.preferences.memorySaver, false);
    assert.equal(profile.preferences.discardTimeoutMinutes, 60);
    assert.deepEqual(profile.preferences.discardExceptions, ['example.com', 'mail.google.com']);

    // Invalid timeout minutes rejected (remains 60)
    profile.update({ discardTimeoutMinutes: 999 });
    assert.equal(profile.preferences.discardTimeoutMinutes, 60);

    // Persistence across restart
    const restarted = new Profile(dir);
    assert.equal(restarted.preferences.memorySaver, false);
    assert.equal(restarted.preferences.discardTimeoutMinutes, 60);
    assert.deepEqual(restarted.preferences.discardExceptions, ['example.com', 'mail.google.com']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('favicons cache bounds and pending request lifecycle', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nocturne-fav-'));
  try {
    let fetchCalls = 0;
    const fakeFetch = async (url) => {
      fetchCalls++;
      if (url.endsWith('/favicon.ico')) {
        return {
          ok: true,
          url,
          body: {
            getReader() {
              let done = false;
              return {
                async read() {
                  if (done) return { done: true };
                  done = true;
                  return { done: false, value: Buffer.from('FAKEPNGDATA') };
                },
                async cancel() {}
              };
            }
          },
          headers: {
            get(name) {
              return name.toLowerCase() === 'content-type' ? 'image/png' : null;
            }
          }
        };
      }
      return { ok: false, status: 404, url };
    };

    const icons = setupFavicons({ directory: dir, fetch: fakeFetch });

    // Concurrent get requests for the same origin share a single discover promise
    const [res1, res2] = await Promise.all([
      icons.get('https://test-site.example/page1'),
      icons.get('https://test-site.example/page2')
    ]);
    assert.equal(res1, res2);
    assert.ok(res1.startsWith('data:image/png;base64,'));

    // Flushes cleanly to disk
    icons.flush();
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'favicons.json'), 'utf8'));
    assert.ok(saved['https://test-site.example']);

    // Second instance loads from saved cache without new fetch
    const fetchCallsBefore = fetchCalls;
    const icons2 = setupFavicons({ directory: dir, fetch: fakeFetch });
    const cachedRes = await icons2.get('https://test-site.example/page3');
    assert.equal(cachedRes, res1);
    assert.equal(fetchCalls, fetchCallsBefore);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
