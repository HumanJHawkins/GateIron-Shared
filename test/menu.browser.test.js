'use strict';
// The account menu in headless Firefox: a signed-out row with a long address and its Remove keeps the address on one
// line on a desktop window, and the menu stays inside a phone's. Skipped without Firefox.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const brand = require('..');
const { firefox } = require('./lib/firefox');

const LONG = 'codehawkins.webmaster@gmail.com';
const off = (name, email) => ({ name, email, signedIn: false, href: '/in', remove: { label: 'Remove', button: 'remove' } });
const account = { name: 'Ada Lovelace', email: 'ada@example.test', menu: [{ href: '/profile', label: 'Profile' }],
  accounts: [off('Code Hawkins', LONG), off('Grace Hopper', 'grace@example.test')], add: { href: '/add' } };

const CSS = fs.readFileSync(path.join(__dirname, '..', 'assets', 'chrome.css'));
const server = http.createServer((req, res) => {
  if (req.url === '/chrome.css') { res.writeHead(200, { 'content-type': 'text/css' }); res.end(CSS); return; }
  if (req.url !== '/') { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>m</title><link rel="stylesheet" href="/chrome.css"></head><body>${brand.topBar({ account })}</body></html>`);
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

// The open menu's box and the long address's line count at a window width.
async function measure(width) {
  const t = await ff.tab();
  await ff.send('browsingContext.setViewport', { context: t.context, viewport: { width, height: 800 } });
  await t.go(base + '/');
  const m = await t.eval(`(() => {
    document.querySelector('details.gi-account').open = true;
    const menu = document.querySelector('.gi-account-menu').getBoundingClientRect();
    const addr = [...document.querySelectorAll('.gi-account-switch b + span')].find((s) => s.textContent === ${JSON.stringify(LONG)});
    const lines = Math.round(addr.getBoundingClientRect().height / parseFloat(getComputedStyle(addr).lineHeight));
    return { left: menu.left, right: menu.right, lines, view: document.documentElement.clientWidth };
  })()`);
  await t.close();
  return m;
}

test('a signed-out row keeps a 31-character address on one line at 1280px', async (t) => {
  if (!ff) { t.skip('no Firefox'); return; }
  const m = await measure(1280);
  assert.equal(m.lines, 1, `the address wraps to ${m.lines} lines`);
});

test('the menu stays inside a 360px window', async (t) => {
  if (!ff) { t.skip('no Firefox'); return; }
  const m = await measure(360);
  assert.ok(m.left >= 0 && m.right <= m.view, `menu ${m.left}..${m.right} in ${m.view}`);
});
