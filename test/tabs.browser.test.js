'use strict';
// One account per tab in headless Firefox: both halves of tabs.js against a small site whose "accounts" are the keys in
// its list cookie. A tab keeps acting as its own account by link, form, script navigation, window, fetch, Reload and
// Back while another becomes the default; a sign-out in one tab reaches the others. Skipped without Firefox.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const tabs = require('../tabs');
const { firefox } = require('./lib/firefox');

const A = 'aaaa1111';
const B = 'bbbb2222';
const C = 'cccc3333';
const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'assets', 'tabs.js'));
const log = [];

const page = (key, bodyExtra = '') => `<!doctype html><html><head><meta charset="utf-8"><title>t</title>
<meta name="gateiron-tab" content="${key || ''}">
<script src="/tabs.js" data-gateiron-tabs data-header="X-T-Account" data-keys-cookie="tk" data-gone-cookie="tg" data-channel="t-tabs"></script>
</head><body data-served="${key || 'none'}">
<a id="link" href="/next?x=1">next</a>
<a id="other" data-gi-account="${B}" href="/next?au=${B}">as B</a>
<form id="get" action="/next"><input name="q" value="1"><button id="getgo">go</button></form>
<form id="post" method="post" action="/posted"><button id="postgo">go</button></form>
<form id="out" method="post" action="/logout"><button id="outgo">out</button></form>
${bodyExtra}</body></html>`;

const server = http.createServer((req, res) => {
  const keys = tabs.readList(req, 'tk');
  const gone = tabs.readList(req, 'tg');
  const t = tabs.readTab(req, { header: 'X-T-Account', keys, gone, origin: `http://${req.headers.host}` });
  const url = new URL(req.url, 'http://x');
  log.push({ method: req.method, path: url.pathname, query: url.search, asked: t.asked, source: t.source, key: t.key });
  res.redirect = (status, to) => { res.writeHead(status, { location: to }); res.end(); };
  tabs.keepOnRedirect(res, t.keep);
  if (url.pathname === '/tabs.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(SCRIPT); return; }
  if (url.pathname === '/favicon.ico') { res.writeHead(404); res.end(); return; }
  if (url.pathname === '/api/me') { res.writeHead(t.signedOut ? 401 : 200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ key: t.key })); return; }
  if (url.pathname === '/posted') { res.redirect(303, '/next?from=post'); return; }
  if (url.pathname === '/logout') {
    const left = keys.filter((k) => k !== t.key);
    res.writeHead(303, { location: tabs.withParam('/next', t.key), 'set-cookie': [`tk=${left.join('.')}; path=/`, `tg=${tabs.addGone(gone, t.key).join('.')}; path=/`] });
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'referrer-policy': 'same-origin', 'cache-control': 'no-store' });
  res.end(page(t.key));
});

let ff;
let base;
test.before(async () => {
  ff = await firefox();
  if (!ff) { return; }
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (ff) { await ff.close(); } server.close(); });

const until = async (fn, what) => {
  for (let i = 0; i < 100; i++) {
    const v = await fn();
    if (v) { return v; }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`never: ${what}`);
};
const last = (p) => [...log].reverse().find((e) => e.path === p);
const cookies = (t, list, goneList = '') => t.eval(`(document.cookie = 'tk=${list}; path=/', document.cookie = 'tg=${goneList}; path=/', true)`);
const at = (t) => t.eval('location.pathname + location.search');
const freshLog = () => { log.length = 0; };

test('one account: addresses carry nothing, fetches carry the header', async (t) => {
  if (!ff) { t.skip('Firefox is not installed'); return; }
  const tab = await ff.tab();
  await tab.go(`${base}/blank`);
  await cookies(tab, A);
  await tab.go(`${base}/page`);
  assert.equal(await tab.eval('document.body?.dataset.served ?? null'), A);
  assert.equal(await tab.eval('GateIronTab.key()'), A);
  assert.equal(await at(tab), '/page');
  freshLog();
  assert.deepEqual(await tab.eval(`fetch('/api/me').then((r) => r.json())`), { key: A });
  assert.equal(last('/api/me').source, 'header');
  await tab.eval(`document.getElementById('link').click(), true`);
  await until(async () => (await at(tab)).startsWith('/next'), 'followed the link');
  assert.equal(await at(tab), '/next?x=1');
  await tab.close();
});

test('two accounts: a tab drawn as A stays A by every way it leaves a page', async (t) => {
  if (!ff) { t.skip('Firefox is not installed'); return; }
  const tab = await ff.tab();
  await tab.go(`${base}/blank`);
  await cookies(tab, `${B}.${A}`);
  await tab.go(`${base}/page?au=${A}`);
  assert.equal(await tab.eval('document.body?.dataset.served ?? null'), A);
  assert.equal(await at(tab), `/page?au=${A}`);

  freshLog();
  await tab.eval(`document.getElementById('link').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), document.getElementById('link').click(), true`);
  await until(() => last('/next'), 'link');
  assert.equal(last('/next').asked, A, 'a link');
  assert.equal(last('/next').source, 'param');

  await tab.go(`${base}/page?au=${A}`);
  freshLog();
  await tab.eval(`location.href = '/next?script=1', true`);
  await until(() => last('/next'), 'script navigation');
  assert.equal(last('/next').asked, A, 'location.href');
  assert.equal(last('/next').source, 'param', 'location.href, by the Navigation API');
  await until(async () => (await at(tab)).includes('script=1'), 'arrived');
  assert.equal(await tab.eval('history.length') >= 2, true);

  await tab.go(`${base}/page?au=${A}`);
  freshLog();
  await tab.eval(`document.getElementById('getgo').click(), true`);
  await until(() => last('/next'), 'GET form');
  assert.equal(last('/next').asked, A, 'a GET form');
  assert.match(last('/next').query, /q=1/);

  await tab.go(`${base}/page?au=${A}`);
  freshLog();
  await tab.eval(`document.getElementById('post').submit(), true`);
  await until(() => last('/next'), 'form.submit()');
  assert.equal(last('/posted').asked, A, 'form.submit(), which fires no submit event');
  assert.equal(last('/next').asked, A, 'and the redirect after it');

  await tab.go(`${base}/page?au=${A}`);
  freshLog();
  assert.deepEqual(await tab.eval(`fetch(new URL('/api/me', location.href)).then((r) => r.json())`), { key: A }, 'fetch of a URL object');
  assert.deepEqual(await tab.eval(`new Promise((ok) => { const x = new XMLHttpRequest(); x.open('GET', '/api/me'); x.onload = () => ok(JSON.parse(x.responseText)); x.send(); })`), { key: A }, 'XHR');
  assert.equal(await tab.eval(`GateIronTab.address('/x?y=1')`), `/x?y=1&au=${A}`);
  assert.equal(await tab.eval(`GateIronTab.address('https://other.example/x')`), 'https://other.example/x');

  // A link drawn for another account keeps it.
  freshLog();
  await tab.eval(`document.getElementById('other').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), document.getElementById('other').click(), true`);
  await until(() => last('/next'), 'switch link');
  assert.equal(last('/next').asked, B);
  await tab.close();
});

test('Reload and Back to an address that names none go on as the tab\'s own account', async (t) => {
  if (!ff) { t.skip('Firefox is not installed'); return; }
  const tab = await ff.tab();
  await tab.go(`${base}/blank`);
  await cookies(tab, A);
  await tab.go(`${base}/page`);
  assert.equal(await tab.eval('GateIronTab.key()'), A);
  // Another tab signs in B, the new default; this tab's address still names none.
  await cookies(tab, `${B}.${A}`);
  await tab.reload();
  await until(async () => (await at(tab)) === `/page?au=${A}` && (await tab.eval('document.body?.dataset.served ?? null')) === A, 'reload drawn as A');

  await tab.go(`${base}/blank2?au=${A}`);
  await tab.eval(`history.replaceState(null, '', '/blank2?au=${A}'), true`);
  await cookies(tab, A);
  await tab.go(`${base}/page`);
  await cookies(tab, `${B}.${A}`);
  await tab.go(`${base}/elsewhere?au=${A}`);
  await tab.back();
  await until(async () => (await at(tab)) === `/page?au=${A}`, 'Back names A');
  await until(async () => (await tab.eval('document.body?.dataset.served ?? null')) === A, 'drawn as A');
  await tab.close();
});

test('a sign-out in one tab: its other tabs keep drafts, then read again signed out; another account\'s tab stays', async (t) => {
  if (!ff) { t.skip('Firefox is not installed'); return; }
  const one = await ff.tab();
  await one.go(`${base}/blank`);
  await cookies(one, `${B}.${A}.${C}`);
  await one.go(`${base}/page?au=${A}`);
  await one.eval(`(document.addEventListener('gateiron:leaving', () => sessionStorage.setItem('leavingSeen', '1')), window.marker = 1, true)`);
  const asC = await ff.tab();
  await asC.go(`${base}/page?au=${C}`);
  await asC.eval('(window.marker = 1, true)');
  const two = await ff.tab();
  await two.go(`${base}/page?au=${A}`);
  await two.eval(`document.getElementById('outgo').click(), true`);
  await until(async () => (await at(two)).startsWith('/next') && (await two.eval('document.body?.dataset.served ?? null')) === 'none', 'signed out');
  // Kept in sessionStorage: the tab reloads soon after.
  await until(() => one.eval(`sessionStorage.getItem('leavingSeen')`), 'gateiron:leaving reached the other tab');
  // The page after the sign-out tells the other tabs the list changed: A's tab reloads, signed out; C's does not.
  await until(async () => (await one.eval('window.marker ?? null')) === null && (await one.eval('document.body?.dataset.served ?? null')) === 'none', 'A\'s other tab read again, signed out');
  assert.equal(await one.eval('GateIronTab.key()'), A);
  assert.equal(await asC.eval('window.marker'), 1);
  assert.equal(await asC.eval('document.body?.dataset.served ?? null'), C);
  // The signed-out tab stays signed out on Reload, though B is the default.
  await one.reload();
  assert.equal(await one.eval('document.body?.dataset.served ?? null'), 'none');
  await Promise.all([one.close(), asC.close(), two.close()]);
});

test('a link opened by window.open names the tab', async (t) => {
  if (!ff) { t.skip('Firefox is not installed'); return; }
  await ff.preload(() => { window.opened = []; window.open = (u) => { window.opened.push(String(u)); return null; }; });
  const tab = await ff.tab();
  await tab.go(`${base}/blank`);
  await cookies(tab, `${B}.${A}`);
  await tab.go(`${base}/page?au=${A}`);
  await tab.eval(`(window.open('/next?w=1', '_blank'), window.open('https://other.example/', '_blank'), true)`);
  assert.deepEqual(await tab.eval('window.opened'), [`/next?w=1&au=${A}`, 'https://other.example/']);
  await tab.close();
});
