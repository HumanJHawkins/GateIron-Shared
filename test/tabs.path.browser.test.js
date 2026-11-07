'use strict';
// One account per tab by path (/u/<key>/), in headless Firefox: pathTab and tabs.js mode "path" against a small site
// whose "accounts" are the keys in its list cookie. Relative addresses keep the tab's account under its <base href>
// with nothing wrapped; a tab whose account stops being the default moves under its prefix; a sign-out in one tab
// reaches the others; links that mean this page stay on it. Skipped without Firefox.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const tabs = require('../tabs');
const { firefox } = require('./lib/firefox');

const A = 'aaaa1111';
const B = 'bbbb2222';
const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'assets', 'tabs.js'));
const log = [];

const page = (key) => `<!doctype html><html><head><meta charset="utf-8"><title>t</title>
<meta name="gateiron-tab" content="${key || ''}">
<script src="/tabs.js" data-gateiron-tabs data-mode="path" data-keys-cookie="tk" data-channel="tp-tabs"></script>
</head><body data-served="${key || 'none'}">
<a id="link" href="next?x=1">next</a> <a id="frag" href="#main">skip</a> <a id="self" href="">refresh</a> <a id="query" href="?p=2">page 2</a>
<form id="post" method="post" action="posted"><button id="postgo">go</button></form>
<form id="out" method="post" action="logout"><button id="outgo">out</button></form>
<form id="fields"><select id="pick"><option>one</option><option>two</option></select><textarea id="note"></textarea></form>
<div id="main">main</div></body></html>`;

const pathTab = tabs.pathTab({ bare: ['/mail/'] });
const server = http.createServer((req, res) => {
  res.redirect = (status, to) => { res.writeHead(status, { location: to }); res.end(); };
  res.get = (h) => res.getHeader(h);
  res.send = (body) => res.end(body);
  pathTab(req, res, () => {
    const keys = tabs.readList(req, 'tk');
    const gone = tabs.readList(req, 'tg');
    const t = tabs.readTab(req, { keys, gone, origin: `http://${req.headers.host}` });
    tabs.keepPath(res, t.keep);
    const url = new URL(req.url, 'http://x');
    log.push({ method: req.method, path: url.pathname, query: url.search, tabPath: req.tabPath, source: t.source, key: t.key });
    if (url.pathname === '/tabs.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(SCRIPT); return; }
    if (url.pathname === '/favicon.ico') { res.writeHead(404); res.end(); return; }
    if (url.pathname === '/api/me') { res.writeHead(t.signedOut ? 401 : 200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ key: t.key })); return; }
    if (url.pathname === '/posted') { res.redirect(303, '/next?from=post'); return; }
    if (url.pathname.startsWith('/mail/')) { res.redirect(302, '/next?from=mail'); return; }
    if (url.pathname === '/logout') {
      const left = keys.filter((k) => k !== t.key);
      res.setHeader('set-cookie', [`tk=${left.join('.')}; path=/`, `tg=${tabs.addGone(gone, t.key).join('.')}; path=/`]);
      res.redirect(303, '/next');
      return;
    }
    // A page belongs under its tab's prefix while the browser holds more than one account or another default.
    const want = tabs.pathFor(t, keys, keys[0] || null);
    if (req.method === 'GET' && want !== req.tabPath) { tabs.keepPath(res, want); res.redirect(302, req.url); return; }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    // Firefox keeps no form state for a no-store page.
    if (url.pathname !== '/form') { res.setHeader('cache-control', 'no-store'); }
    res.send(page(t.key));
  });
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
const cookies = (t, list, goneList = '') => t.eval(`(document.cookie = 'tk=${list}; path=/', document.cookie = 'tg=${goneList}; path=/', true)`);
const at = (t) => t.eval('location.pathname + location.search + location.hash');
const served = (t) => t.eval('document.body ? document.body.dataset.served : ""');
const click = (t, id) => t.eval(`(document.getElementById('${id}').click(), true)`);
const loaded = (t, where) => until(async () => (await at(t)) === where && (await t.eval('document.readyState')) === 'complete' && await served(t), `at ${where}`);

test('one account: no prefix, the base is "/", and relative addresses are that account', async (t) => {
  if (!ff) { t.skip('Firefox is not installed'); return; }
  const tab = await ff.tab();
  await tab.go(`${base}/blank`);
  await cookies(tab, A);
  await tab.go(`${base}/page`);
  await loaded(tab, '/page');
  assert.equal(await tab.eval('document.querySelector("base").getAttribute("href")'), '/');
  assert.equal(await served(tab), A);
  assert.equal(JSON.parse(await tab.eval('fetch("api/me").then((r) => r.text())')).key, A);
  await click(tab, 'link');
  await loaded(tab, '/next?x=1');
  assert.equal(await served(tab), A);
});

test('two accounts: the tab of the one not the default lives under /u/<key>/, by link, fetch, form, script and Reload', async (t) => {
  if (!ff) { t.skip('Firefox is not installed'); return; }
  const tab = await ff.tab();
  await tab.go(`${base}/blank`);
  await cookies(tab, `${A}.${B}`);
  await tab.go(`${base}/u/${B}/page`);
  await loaded(tab, `/u/${B}/page`);
  assert.equal(await served(tab), B);
  assert.equal(await tab.eval('document.querySelector("base").getAttribute("href")'), `/u/${B}/`);
  assert.equal(JSON.parse(await tab.eval('fetch("api/me").then((r) => r.text())')).key, B);
  assert.equal(JSON.parse(await tab.eval('new Promise((ok) => { const x = new XMLHttpRequest(); x.open("GET", "api/me"); x.onload = () => ok(x.responseText); x.send(); })')).key, B);
  await click(tab, 'link');
  await loaded(tab, `/u/${B}/next?x=1`);
  assert.equal(await served(tab), B);
  await click(tab, 'postgo');
  await loaded(tab, `/u/${B}/next?from=post`);
  assert.equal(await served(tab), B);
  await tab.eval('(location.href = "page", true)');
  await loaded(tab, `/u/${B}/page`);
  await tab.reload();
  await loaded(tab, `/u/${B}/page`);
  assert.equal(await served(tab), B);
  // A typed or pasted address with no prefix is the default account's, and with two here the tab names it.
  await tab.go(`${base}/page`);
  await loaded(tab, `/u/${A}/page`);
  assert.equal(await served(tab), A);
});

test('links that mean this page stay on it under the base', async (t) => {
  if (!ff) { t.skip('Firefox is not installed'); return; }
  const tab = await ff.tab();
  await tab.go(`${base}/blank`);
  await cookies(tab, `${A}.${B}`);
  await tab.go(`${base}/u/${B}/deep/page?z=1`);
  await loaded(tab, `/u/${B}/deep/page?z=1`);
  await click(tab, 'frag');
  await until(async () => (await at(tab)) === `/u/${B}/deep/page?z=1#main`, 'the fragment on this page');
  await click(tab, 'query');
  await loaded(tab, `/u/${B}/deep/page?p=2`);
  // The same address loads again: wait for the new document.
  await tab.eval('(window.before = true)');
  await click(tab, 'self');
  await until(async () => (await tab.eval('document.readyState === "complete" && !window.before && !!document.body')), 'the page again');
  assert.equal(await at(tab), `/u/${B}/deep/page?p=2`);
  // As the page's own script: what the driver runs does not see the page's wrapped history.
  await tab.eval('(document.body.appendChild(Object.assign(document.createElement("script"), { textContent: \'history.pushState(null, "", "?p=3")\' })), true)');
  assert.equal(await at(tab), `/u/${B}/deep/page?p=3`);
});

test('a tab whose account stops being the default moves under its prefix; another tab\'s sign-out reaches it', async (t) => {
  if (!ff) { t.skip('Firefox is not installed'); return; }
  const one = await ff.tab();
  await one.go(`${base}/blank`);
  await cookies(one, A);
  await one.go(`${base}/page`);
  await loaded(one, '/page');
  assert.equal(await served(one), A);
  // Another tab signs B in, and B becomes the default.
  const two = await ff.tab();
  await two.go(`${base}/blank`);
  await cookies(two, `${B}.${A}`);
  await two.eval('(new BroadcastChannel("tp-tabs").postMessage({ type: "keys" }), true)');
  await until(async () => (await at(one)) === `/u/${A}/page`, 'tab one under its prefix');
  assert.equal(await one.eval('document.querySelector("base").getAttribute("href")'), `/u/${A}/`);
  await click(one, 'link');
  await loaded(one, `/u/${A}/next?x=1`);
  assert.equal(await served(one), A);
  // A signs out in another tab of its own: tab one reads again, signed out, and stays under A's prefix.
  const three = await ff.tab();
  await three.go(`${base}/u/${A}/page`);
  await loaded(three, `/u/${A}/page`);
  await click(three, 'outgo');
  await until(async () => (await served(one)) === 'none', 'tab one signed out');
  assert.match(await at(one), new RegExp(`^/u/${A}/`));
});

test('Reload or Back to an entry from before the tab moved under its prefix opens as the tab\'s account', async (t) => {
  if (!ff) { t.skip('Firefox is not installed'); return; }
  const tab = await ff.tab();
  await tab.go(`${base}/blank`);
  await cookies(tab, A);
  await tab.go(`${base}/page`);
  await loaded(tab, '/page');
  await click(tab, 'link');
  await loaded(tab, '/next?x=1');
  // B signs in elsewhere and becomes the default; this tab has not heard yet.
  await cookies(tab, `${B}.${A}`);
  await tab.reload();
  await loaded(tab, `/u/${A}/next?x=1`);
  assert.equal(await served(tab), A);
  await tab.back();
  await loaded(tab, `/u/${A}/page`);
  assert.equal(await served(tab), A);
  // History state is the site's alone, and nothing replaces the entry as a page loads.
  assert.equal(await tab.eval('history.state'), null);
  await tab.go(`${base}/blank`);
  await cookies(tab, A);
  await tab.go(`${base}/page`);
  await loaded(tab, '/page');
  assert.equal(await tab.eval('history.state'), null);
});

test('the account a tab last had at an address is the one a Reload keeps, after the other signs out', async (t) => {
  if (!ff) { t.skip('Firefox is not installed'); return; }
  const tab = await ff.tab();
  await tab.go(`${base}/blank`);
  await cookies(tab, A);
  await tab.go(`${base}/page`);
  await loaded(tab, '/page');
  assert.equal(await served(tab), A);
  // B signs in in this tab, then A signs out elsewhere: B is the only account, and the page loses its prefix.
  await cookies(tab, `${A}.${B}`);
  await tab.go(`${base}/u/${B}/page`);
  await loaded(tab, `/u/${B}/page`);
  await cookies(tab, B);
  await tab.reload();
  await loaded(tab, '/page');
  assert.equal(await served(tab), B);
});

test('a page with no prefix keeps the Firefox form state and keyboard use of its controls', async (t) => {
  if (!ff) { t.skip('Firefox is not installed'); return; }
  const tab = await ff.tab();
  await tab.go(`${base}/blank`);
  await cookies(tab, A);
  await tab.go(`${base}/form`);
  await loaded(tab, '/form');
  await tab.eval('(document.getElementById("pick").focus(), true)');
  await tab.keys('');
  assert.equal(await tab.eval('document.getElementById("pick").value'), 'two');
  await tab.eval('(document.getElementById("note").focus(), true)');
  await tab.keys('h', 'i');
  await tab.reload();
  await loaded(tab, '/form');
  assert.deepEqual(await tab.eval('[document.getElementById("pick").value, document.getElementById("note").value]'), ['two', 'hi']);
});

test('an address no tab names stays bare, prefix or not', async (t) => {
  if (!ff) { t.skip('Firefox is not installed'); return; }
  const tab = await ff.tab();
  await tab.go(`${base}/blank`);
  await cookies(tab, `${A}.${B}`);
  await tab.go(`${base}/u/${B}/mail/link`);
  await loaded(tab, `/u/${A}/next?from=mail`);
  assert.equal(await served(tab), A);
});
