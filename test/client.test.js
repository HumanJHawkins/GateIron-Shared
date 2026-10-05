'use strict';
// npm test. The two browser scripts, run as a page runs them.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const brand = require('..');
const source = (name) => fs.readFileSync(path.join(__dirname, '..', 'assets', name), 'utf8');

test('account.js in a page draws the chip the server draws', () => {
  const win = {};
  win.self = win;
  vm.runInNewContext(source('account.js'), win);
  const api = win.GateIronChrome;
  const account = { name: 'Ada <Lovelace>', email: 'ada@example.test', role: 'admin', avatarSrc: 'https://x.test/a"b.png',
    menu: [{ href: '/profile', label: 'Profile' }, { label: 'Sign out', button: 'sign-out' }] };
  const server = brand.topBar({ account });
  assert.ok(server.includes(api.accountHtml({ account })), 'the two sides differ');

  const slot = { innerHTML: null, get firstElementChild() { return this.innerHTML ? { html: this.innerHTML } : null; } };
  assert.equal(api.fillAccount(slot, { account }).html, api.accountHtml({ account }));
  assert.ok(slot.innerHTML.includes('Ada &lt;Lovelace&gt;') && slot.innerHTML.includes('a&quot;b.png'));
  api.fillAccount(slot, { signIn: { href: '/signin?returnTo=%2F' } });
  assert.equal(slot.innerHTML, '<a class="btn btn-secondary btn-small" href="/signin?returnTo=%2F">Sign in</a>');
  assert.equal(api.fillAccount(slot, {}), null);
});

// Just enough DOM for menu.js: a tree with closest, contains, focus and the selectors it asks for.
function fakePage() {
  const listeners = {};
  const doc = {
    activeElement: null,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    querySelectorAll(sel) {
      assert.equal(sel, 'details.gi-account[open]');
      return menu.open ? [menu] : [];
    },
  };
  function el(tag, cls, parent, extra) {
    const node = Object.assign({ tagName: tag.toUpperCase(), cls: cls || '', parent, hidden: false, children: [] }, extra);
    if (parent) parent.children.push(node);
    node.contains = (other) => { for (let n = other; n; n = n.parent) { if (n === node) return true; } return false; };
    node.closest = (sel) => {
      for (let n = node; n; n = n.parent) {
        if (sel === 'details.gi-account' && n.tagName === 'DETAILS' && /\bgi-account\b/.test(n.cls)) return n;
        if (sel === '[hidden]' && n.hidden) return n;
      }
      return null;
    };
    node.focus = () => { doc.activeElement = node; };
    node.querySelector = (sel) => { assert.equal(sel, 'summary'); return node.children.find((c) => c.tagName === 'SUMMARY'); };
    node.querySelectorAll = (sel) => {
      assert.equal(sel, '.gi-account-menu a[href], .gi-account-menu button:not([disabled])');
      const out = [];
      (function walk(n) { for (const c of n.children) { if (c.tagName === 'A' || c.tagName === 'BUTTON') out.push(c); walk(c); } })(node);
      return out;
    };
    return node;
  }
  const body = el('body');
  const outside = el('a', '', body);
  const menu = el('details', 'gi-account', body, { open: false });
  const summary = el('summary', '', menu);
  const list = el('div', 'gi-account-menu', menu);
  const profile = el('a', '', list);
  const reports = el('a', '', list, { hidden: true });
  const form = el('form', '', list);
  const signOut = el('button', '', form);
  const win = { document: doc };
  vm.runInNewContext(source('menu.js'), win);
  const fire = (type, target, extra) => {
    const e = Object.assign({ target, prevented: false, preventDefault() { this.prevented = true; } }, extra);
    for (const fn of listeners[type] || []) fn(e);
    return e;
  };
  return { doc, fire, menu, summary, profile, reports, signOut, outside };
}

test('menu.js: arrows open and move, Escape closes and returns focus', () => {
  const p = fakePage();
  p.summary.focus();
  assert.ok(p.fire('keydown', p.summary, { key: 'ArrowDown' }).prevented);
  assert.ok(p.menu.open);
  assert.equal(p.doc.activeElement, p.profile);
  p.fire('keydown', p.profile, { key: 'ArrowDown' });
  assert.equal(p.doc.activeElement, p.signOut, 'a hidden item is skipped');
  p.fire('keydown', p.signOut, { key: 'ArrowDown' });
  assert.equal(p.doc.activeElement, p.profile, 'the last item wraps to the first');
  p.fire('keydown', p.profile, { key: 'ArrowUp' });
  assert.equal(p.doc.activeElement, p.signOut);
  p.fire('keydown', p.signOut, { key: 'Home' });
  assert.equal(p.doc.activeElement, p.profile);
  p.fire('keydown', p.profile, { key: 'End' });
  assert.equal(p.doc.activeElement, p.signOut);
  assert.ok(!p.fire('keydown', p.signOut, { key: 'a' }).prevented, 'other keys are left alone');
  p.fire('keydown', p.signOut, { key: 'Escape' });
  assert.ok(!p.menu.open);
  assert.equal(p.doc.activeElement, p.summary);

  p.fire('keydown', p.summary, { key: 'ArrowUp' });
  assert.ok(p.menu.open);
  assert.equal(p.doc.activeElement, p.signOut, 'ArrowUp opens on the last item');
});

test('menu.js: a click outside or Tab leaving closes it; a click inside does not', () => {
  const p = fakePage();
  p.menu.open = true;
  p.fire('click', p.profile);
  assert.ok(p.menu.open);
  p.fire('click', p.outside);
  assert.ok(!p.menu.open);

  p.menu.open = true;
  p.fire('focusout', p.profile, { relatedTarget: p.signOut });
  assert.ok(p.menu.open);
  p.fire('focusout', p.signOut, { relatedTarget: p.outside });
  assert.ok(!p.menu.open);
  assert.notEqual(p.doc.activeElement, p.summary, 'leaving by Tab does not pull focus back');
});
