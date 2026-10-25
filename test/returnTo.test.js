'use strict';
// npm test. Every returnTo trick reported on a GateIron site (GN-1115, NH-1143, NH-1144, NUC-1145),
// on the server and in a page.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { safeReturnTo } = require('../assets/returnTo.js');

const OFF_SITE = ['//evil.example', '/\\evil.example', '/\\/evil.example', '\\\\evil.example', '/\t/evil.example', '/\n/evil.example',
  '/\r/evil.example', '\t//evil.example', ' //evil.example', 'https://evil.example', 'javascript:alert(1)', 'evil.example',
  '//evil.example@good.example', '', null, undefined, 42, ['/'], { toString: () => '/' }];
const KEPT = [['/', '/'], ['/profile', '/profile'], ['/a?b=1#c', '/a?b=1#c'], ['/.//evil.example', '/evil.example'],
  ['/x/..//evil.example/y', '/evil.example/y'], ['/./\\evil.example', '/evil.example'], ['/%2F%2Fevil.example', '/%2F%2Fevil.example'],
  ['/%5Cevil.example', '/%5Cevil.example'], ['/%09/evil.example', '/%09/evil.example'], ['/@evil.example', '/@evil.example'],
  ['/a b', '/a%20b'], ['/\u0000/evil.example', '/%00/evil.example'], ['/oauth/auth?client_id=x&redirect_uri=https%3A%2F%2Fa.example%2Fcb', '/oauth/auth?client_id=x&redirect_uri=https%3A%2F%2Fa.example%2Fcb']];

test('anything that could leave the site is the fallback', () => {
  for (const v of OFF_SITE) { assert.equal(safeReturnTo(v), '/', JSON.stringify(v)); }
  assert.equal(safeReturnTo('//evil.example', null), null);
  assert.equal(safeReturnTo('/ok', null), '/ok');
});

test('a path on the site comes back re-serialised, and never begins //', () => {
  for (const [v, want] of KEPT) { assert.equal(safeReturnTo(v), want, JSON.stringify(v)); }
});

test('what comes back stays on the site wherever it is resolved', () => {
  for (const v of OFF_SITE.concat(KEPT.map((k) => k[0]))) {
    const out = safeReturnTo(v);
    assert.equal(new URL(out, 'https://site.example/deep/page').origin, 'https://site.example', JSON.stringify(v));
    assert.ok(!/[\u0000-\u001f\\]/.test(out), JSON.stringify(v));
  }
});

test('in a page it is GateIronReturnTo.safeReturnTo, the same function', () => {
  const win = { URL };
  win.self = win;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'returnTo.js'), 'utf8'), win);
  for (const v of OFF_SITE) { assert.equal(win.GateIronReturnTo.safeReturnTo(v), '/', JSON.stringify(v)); }
  for (const [v, want] of KEPT) { assert.equal(win.GateIronReturnTo.safeReturnTo(v), want, JSON.stringify(v)); }
});

test('an ES module imports it by name', async () => {
  const mod = await import('gateiron-shared/returnTo');
  assert.equal(mod.safeReturnTo('/\\evil.example'), '/');
});
