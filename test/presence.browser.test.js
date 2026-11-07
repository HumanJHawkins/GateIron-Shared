'use strict';
// watchAccount's presence in headless Firefox: each tab of an account pings presenceUrl, and the last tab of that
// account on the site says it is going with a gone=1 beacon; a tab leaving while another of its account is open
// does not. Skipped without Firefox.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { firefox } = require('./lib/firefox');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'assets', 'account.js'));
const pings = [];
const page = (who) => `<!doctype html><html><head><meta charset="utf-8"><title>p</title><script src="/account.js"></script>
<script>GateIronChrome.watchAccount({ id: ${JSON.stringify(who)}, meUrl: '/api/me', channel: 'p-account', presenceUrl: '/presence' });</script>
</head><body>${who}</body></html>`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/account.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(SCRIPT); return; }
  // The page a request came from names its account, as a tab's address would.
  const who = new URL(req.headers.referer || 'http://x/a').pathname.slice(1);
  if (url.pathname === '/presence') { pings.push({ who, gone: url.searchParams.get('gone') === '1', at: Date.now() }); res.writeHead(204); res.end(); return; }
  if (url.pathname === '/api/me') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: who })); return; }
  if (url.pathname === '/blank') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>b</title>blank'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(page(url.pathname.slice(1) || 'a'));
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
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const gones = (who) => pings.filter((p) => p.gone && p.who === who);

test('the last tab of an account says it is going; one with company does not', async (t) => {
  if (!ff) { return t.skip('no Firefox'); }
  const one = await ff.tab();
  await one.go(base + '/a');
  const two = await ff.tab();
  await two.go(base + '/a');
  await settle(400);
  assert.ok(pings.filter((p) => !p.gone).length >= 2, 'each tab pings as it loads');
  await two.go(base + '/blank');
  await settle(400);
  assert.equal(gones('a').length, 0, 'a tab leaves while another of its account is open: no beacon');
  // A tab of another account is no company for this one.
  const other = await ff.tab();
  await other.go(base + '/b');
  await settle(300);
  await one.go(base + '/blank');
  await settle(500);
  assert.equal(gones('a').length, 1, 'the last tab of the account goes: one gone=1 beacon');
  assert.equal(gones('b').length, 0, 'and the other account\'s tab says nothing');
  await other.close();
  await one.close();
  await two.close();
});
