'use strict';
// The server half of one account per tab (tabs.js): what a request names and how it is served.
const test = require('node:test');
const assert = require('node:assert/strict');
const tabs = require('../tabs');

const A = 'aaaa1111';
const B = 'bbbb2222';
const GONE = 'cccc3333';
const req = (url, headers = {}, method = 'GET') => ({ url, method, protocol: 'https', headers: { host: 'site.test', ...headers } });
const read = (r, more) => tabs.readTab(r, { header: 'X-Site-Account', keys: [B, A], gone: [GONE], ...more });

test('au leaves the address the routes read, wherever it sits in the query', () => {
  assert.deepEqual(tabs.stripParam(`/x?au=${A}`), { url: '/x', key: A });
  assert.deepEqual(tabs.stripParam(`/x?q=1&au=${A}&r=2#h`), { url: '/x?q=1&r=2#h', key: A });
  assert.deepEqual(tabs.stripParam('/x?audio=1'), { url: '/x?audio=1', key: null });
  assert.deepEqual(tabs.stripParam('/x?au=<bad>'), { url: '/x', key: null });
  const r = req(`/p?au=${A}&q=1`);
  read(r);
  assert.equal(r.url, '/p?q=1');
});

test('a redirect names the key once, on this site only', () => {
  assert.equal(tabs.withParam(`/next?au=${B}&q=1#f`, A), `/next?q=1&au=${A}#f`);
  assert.equal(tabs.withParam(`/next?au=${B}`, null), '/next');
  assert.equal(tabs.withParam('https://other.example/x', A), 'https://other.example/x');
  assert.equal(tabs.withParam('//other.example/x', A), '//other.example/x');
  let to = null;
  const res = { redirect: (s, u) => { to = [s, u]; } };
  let keep = A;
  tabs.keepOnRedirect(res, () => keep);
  keep = B;
  res.redirect('/after');
  assert.deepEqual(to, [302, `/after?au=${B}`]);
  res.redirect(303, `/after?au=${A}`);
  assert.deepEqual(to, [303, `/after?au=${B}`]);
});

test('a request naming an account signed in here is that account, by param, header or its page', () => {
  assert.deepEqual(read(req(`/p?au=${A}`)), { asked: A, source: 'param', key: A, signedOut: false, keep: A, background: false });
  const h = read(req('/api/me', { 'x-site-account': A, 'sec-fetch-dest': 'empty', 'sec-fetch-site': 'same-origin' }));
  assert.equal(h.source, 'header');
  assert.equal(h.key, A);
  assert.equal(h.background, true);
  const img = read(req('/pic.png', { referer: `https://site.test/p?au=${A}`, 'sec-fetch-dest': 'image', 'sec-fetch-site': 'same-origin' }));
  assert.equal(img.source, 'referer');
  assert.equal(img.key, A);
});

test('naming none is the default; a Referer from another site names nothing', () => {
  assert.equal(read(req('/p')).key, B);
  const r = read(req('/p', { referer: `https://evil.example/p?au=${A}`, 'sec-fetch-site': 'cross-site' }));
  assert.equal(r.asked, null);
  assert.equal(r.key, B);
  // A same-origin Referer on a cross-site request is a forgery: not read.
  assert.equal(read(req('/p', { referer: `https://site.test/p?au=${A}`, 'sec-fetch-site': 'cross-site' })).asked, null);
});

test('a shared or typed link naming a key never held here is the default; anything else naming one is signed out', () => {
  const typed = read(req('/p?au=zzzz9999', { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'none' }));
  assert.equal(typed.key, B);
  assert.equal(typed.keep, null);
  const shared = read(req('/p?au=zzzz9999', { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'cross-site' }));
  assert.equal(shared.key, B);
  // Its own tab, after its account signed out here, stays signed out, even typed.
  const goneTyped = read(req(`/p?au=${GONE}`, { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'none' }));
  assert.equal(goneTyped.signedOut, true);
  assert.equal(goneTyped.keep, GONE);
  // This site's own page naming a key it no longer holds: that tab, signed out, gone list or not.
  const own = read(req('/p?au=zzzz9999', { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'same-origin' }));
  assert.equal(own.signedOut, true);
  const bg = read(req('/api/x', { 'x-site-account': 'zzzz9999', 'sec-fetch-dest': 'empty', 'sec-fetch-site': 'same-origin' }));
  assert.equal(bg.signedOut, true);
  assert.equal(bg.background, true);
  const post = read(req('/p?au=zzzz9999', { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'none' }, 'POST'));
  assert.equal(post.signedOut, true);
});

test('list cookies read under either name; the gone list keeps each key once, newest last', () => {
  assert.deepEqual(tabs.readList(req('/', { cookie: `x=1; __Host-keys=${B}.${A}.bad!` }), 'keys'), [B, A]);
  assert.deepEqual(tabs.readList(req('/', { cookie: `keys=${A}` }), 'keys'), [A]);
  assert.deepEqual(tabs.readList(req('/'), 'keys'), []);
  assert.equal(tabs.cookieName('keys', true), '__Host-keys');
  assert.equal(tabs.cookieName('keys', false), 'keys');
  assert.deepEqual(tabs.addGone([A, B], A), [B, A]);
  assert.equal(tabs.addGone(Array.from({ length: 12 }, (_, i) => `k000000${i}`.slice(-8)), A).length, tabs.GONE_MAX);
});

test('a site with no default: naming none is signed out of nothing, and a header is never a typed link', () => {
  const r = tabs.readTab(req('/p'), { keys: [A, B], default: null });
  assert.equal(r.key, null);
  assert.equal(r.signedOut, false);
  // No Sec-Fetch headers (an old browser, a test client): a header still marks a background request.
  const h = tabs.readTab(req('/api/me', { 'x-site-account': 'zzzz9999' }), { header: 'X-Site-Account', keys: [A] });
  assert.equal(h.signedOut, true);
  assert.equal(h.background, true);
  assert.doesNotThrow(() => tabs.readTab({ method: 'GET', headers: {} }, { keys: [] }));
});
