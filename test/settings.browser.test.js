'use strict';
// settings.js and theme.js in headless Firefox: the category shown, search, a save answered both
// ways, Reset, the phone's drill-down, a redrawn page, and the theme's choice. Skipped without Firefox.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { firefox } = require('./lib/firefox');
const { settingsHtml } = require('../assets/settings.js');

const ASSET = (f) => fs.readFileSync(path.join(__dirname, '..', 'assets', f));
const CATS = [
  { id: 'words', label: 'Words', rows: [
    { id: 'level', label: 'Reading level', description: 'Grade of the words served', type: 'select', value: 8, default: 8,
      options: [{ value: 6, label: 'Grade 6' }, { value: 8, label: 'Grade 8' }], keywords: ['difficulty'] }] },
  { id: 'sound', label: 'Sound', rows: [
    { id: 'music', label: 'Music', type: 'switch', value: true, default: true },
    { id: 'volume', label: 'Volume', type: 'number', value: 5, default: 5, min: 1, max: 10 },
    { id: 'loud', label: 'Loudness', type: 'range', value: 50, default: 50, min: 0, max: 100, step: 10 },
    { id: 'again', label: 'Hints', type: 'action', actionLabel: 'Show Again' },
    { id: 'filter', label: 'Filter', controlHtml: '<select id="step"><option>1</option></select> <input type="checkbox" role="switch" id="adv">' },
    { id: 'theme', label: 'Theme', type: 'radio', value: 'system', default: 'system',
      options: [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }] }] }];
// The page answers each save as window.answer says, and keeps what it was told.
const PAGE = (attr, start) => `<!doctype html><html lang="en"${attr || ''}><head><meta charset="utf-8"><title>s</title>
<link rel="stylesheet" href="/chrome.css"><link rel="stylesheet" href="/settings.css">
<script src="/theme.js"></script><script src="/settings.js" defer></script><script src="/page.js" defer></script></head>
<body><main id="main">${settingsHtml({ categories: CATS, accountHref: '/profile', start: start || undefined })}</main></body></html>`;
const PAGE_JS = `window.answer = true; window.told = [];
document.addEventListener('gi-settings-change', function (e) {
  window.told.push(e.detail.action ? { id: e.detail.id, action: true } : { id: e.detail.id, value: e.detail.value, reset: e.detail.reset });
  e.detail.done(window.answer);
});`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const files = { '/chrome.css': ['text/css', 'chrome.css'], '/settings.css': ['text/css', 'settings.css'],
    '/theme.js': ['text/javascript', 'theme.js'], '/settings.js': ['text/javascript', 'settings.js'] };
  if (files[url.pathname]) { res.writeHead(200, { 'content-type': files[url.pathname][0] }); res.end(ASSET(files[url.pathname][1])); return; }
  if (url.pathname === '/page.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(PAGE_JS); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(PAGE(url.pathname === '/dark' ? ' data-gi-theme="dark"' : '', url.searchParams.get('start')));
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
const shown = (t) => t.eval(`[...document.querySelectorAll('section.gi-settings-cat')].filter((c) => !c.hidden).map((c) => c.id)`);
const visible = (t, sel) => t.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && getComputedStyle(e).display !== 'none' && !e.closest('[hidden]'); })()`);

test('desktop: the first category, then the one named in the address, marked in the sidebar', async (t) => {
  if (!ff) { return t.skip('no Firefox'); }
  const tab = await ff.tab();
  await ff.send('browsingContext.setViewport', { context: tab.context, viewport: { width: 1200, height: 800 } });
  await tab.go(base + '/');
  assert.deepEqual(await shown(tab), ['words']);
  assert.equal(await tab.eval(`document.querySelector('.gi-settings-nav a[aria-current]').textContent`), 'Words');
  await tab.go(base + '/#sound');
  assert.deepEqual(await shown(tab), ['sound']);
  assert.equal(await visible(tab, '.gi-settings-back'), false, 'no back link beside a sidebar');
  await tab.eval(`location.hash = 'main'`);
  await settle(100);
  assert.deepEqual(await shown(tab), ['sound'], 'a # naming no category (the skip link) leaves the open one');
  await tab.close();
});

test('search: rows filtered across categories, matches marked, keywords count, the query in the address', async (t) => {
  if (!ff) { return t.skip('no Firefox'); }
  const tab = await ff.tab();
  await ff.send('browsingContext.setViewport', { context: tab.context, viewport: { width: 1200, height: 800 } });
  await tab.go(base + '/');
  const type = (q) => tab.eval(`(() => { const s = document.querySelector('[data-gi-settings-search]'); s.value = ${JSON.stringify(q)}; s.dispatchEvent(new Event('input')); })()`);
  await type('m');
  assert.deepEqual(await shown(tab), ['sound'], 'Music, Volume and Theme match, Reading level does not');
  assert.deepEqual(await tab.eval(`[...document.querySelectorAll('.gi-settings-hit')].map((m) => m.textContent)`), ['M', 'm', 'm']);
  await type('difficulty');
  assert.deepEqual(await shown(tab), ['words'], 'a keyword finds its row');
  assert.equal(await tab.eval('location.search'), '?q=difficulty');
  await type('zebra');
  assert.deepEqual(await shown(tab), []);
  assert.equal(await tab.eval(`document.querySelector('.gi-settings-empty').hidden`), false);
  await tab.reload();
  assert.equal(await tab.eval(`document.querySelector('[data-gi-settings-search]').value`), 'zebra', 'the query survives a reload');
  await type('');
  assert.equal(await tab.eval(`document.querySelectorAll('.gi-settings-hit').length`), 0);
  assert.equal(await tab.eval('location.search'), '');
  await tab.close();
});

test('a save: Saved announced and the mark follows; a failed one puts the control back; Reset says reset', async (t) => {
  if (!ff) { return t.skip('no Firefox'); }
  const tab = await ff.tab();
  await tab.go(base + '/#words');
  const pick = (v) => tab.eval(`(() => { const s = document.getElementById('gi-set-level'); s.value = '${v}'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const modified = () => tab.eval(`document.querySelector('[data-gi-row=level]').classList.contains('gi-settings-is-modified')`);
  await pick(6);
  await settle(120);
  assert.deepEqual(await tab.eval('window.told'), [{ id: 'level', value: 6, reset: false }], 'a number, as its options are');
  assert.equal(await tab.eval(`document.querySelector('[data-gi-settings-status]').textContent`), 'Saved');
  assert.equal(await modified(), true);
  assert.equal(await visible(tab, '[data-gi-row=level] .gi-settings-reset'), true);
  await tab.eval('window.answer = false');
  await pick(8);
  await settle(120);
  assert.equal(await tab.eval(`document.getElementById('gi-set-level').value`), '6', 'refused: back to the saved value');
  assert.equal(await tab.eval(`document.querySelector('[data-gi-settings-status]').textContent`), 'Could not save');
  await tab.eval('window.answer = true');
  await tab.eval(`document.querySelector('[data-gi-row=level] .gi-settings-reset').click()`);
  assert.deepEqual((await tab.eval('window.told')).at(-1), { id: 'level', value: 8, reset: true });
  assert.equal(await modified(), false);
  assert.equal(await tab.eval(`document.activeElement.id`), 'gi-set-level', 'focus goes to the control Reset changed');
  await tab.close();
});

test('a number left empty or out of range is not sent: the saved one comes back', async (t) => {
  if (!ff) { return t.skip('no Firefox'); }
  const tab = await ff.tab();
  await tab.go(base + '/#sound');
  const enter = (v) => tab.eval(`(() => { const n = document.getElementById('gi-set-volume'); n.value = '${v}'; n.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  for (const v of ['', '999', '0']) {
    await enter(v);
    await settle(120);
    assert.equal(await tab.eval(`document.getElementById('gi-set-volume').value`), '5', JSON.stringify(v) + ' put back');
  }
  assert.deepEqual(await tab.eval('window.told'), [], 'nothing sent');
  assert.equal(await tab.eval(`document.querySelector('[data-gi-row=volume]').classList.contains('gi-settings-is-modified')`), false);
  assert.equal(await tab.eval(`document.querySelector('[data-gi-settings-status]').textContent`), 'Could not save');
  await enter('7');
  assert.deepEqual(await tab.eval('window.told'), [{ id: 'volume', value: 7, reset: false }]);
  await tab.close();
});

test('phone: the overview, a category with its back link, back to the overview', async (t) => {
  if (!ff) { return t.skip('no Firefox'); }
  const tab = await ff.tab();
  await ff.send('browsingContext.setViewport', { context: tab.context, viewport: { width: 390, height: 800 } });
  await tab.go(base + '/');
  assert.equal(await visible(tab, '.gi-settings-nav'), true);
  assert.equal(await visible(tab, '.gi-settings-pane'), false, 'the overview: categories only');
  await tab.eval(`document.querySelector('.gi-settings-nav a[data-gi-cat=sound]').click()`);
  await settle(100);
  assert.equal(await visible(tab, '.gi-settings-side'), false);
  assert.equal(await visible(tab, '.gi-settings-back'), true);
  assert.equal(await tab.eval('document.activeElement.textContent'), 'Sound', 'focus on the category\'s title');
  await tab.eval(`location.hash = 'main'`);
  await settle(100);
  assert.equal(await visible(tab, '.gi-settings-back'), true, 'and on a phone it stays in the category');
  await tab.eval(`location.hash = 'sound'`);
  await settle(100);
  await tab.eval(`document.querySelector('.gi-settings-back').click()`);
  await settle(100);
  assert.equal(await visible(tab, '.gi-settings-nav'), true);
  assert.equal(await tab.eval('location.hash'), '');
  await tab.eval(`document.querySelector('.gi-settings-nav a[data-gi-cat=words]').click()`);
  await settle(100);
  await tab.back();
  await settle(200);
  assert.equal(await tab.eval(`document.activeElement.matches('[data-gi-settings-search]')`), true, 'the browser\'s Back: focus to the search box');
  await tab.close();
});

test('a page redrawn in place and wired again keeps its category and search', async (t) => {
  if (!ff) { return t.skip('no Firefox'); }
  const tab = await ff.tab();
  await ff.send('browsingContext.setViewport', { context: tab.context, viewport: { width: 1200, height: 800 } });
  await tab.go(base + '/?q=mus#sound');
  await tab.eval(`(() => {
    const old = document.querySelector('[data-gi-settings]');
    old.insertAdjacentHTML('afterend', GateIronSettings.settingsHtml({ categories: [{ id: 'sound', label: 'Sound', rows: [
      { id: 'music', label: 'Music', type: 'switch', value: true, default: true },
      { id: 'teacher', label: 'Teacher mode', type: 'switch', value: false, default: false }] }] }));
    old.remove();
    GateIronSettings.wire(document.querySelector('[data-gi-settings]'));
  })()`);
  assert.equal(await tab.eval(`document.querySelector('[data-gi-settings-search]').value`), 'mus');
  assert.deepEqual(await tab.eval(`[...document.querySelectorAll('.gi-settings-row')].filter((r) => !r.hidden).map((r) => r.dataset.giRow)`), ['music']);
  await tab.eval(`document.getElementById('gi-set-music').click()`);
  assert.deepEqual((await tab.eval('window.told')).at(-1), { id: 'music', value: false, reset: false }, 'the new rows are wired');
  await tab.close();
});

test('start: the category opens with the address untouched; a # wins; Back leaves it', async (t) => {
  if (!ff) { return t.skip('no Firefox'); }
  const tab = await ff.tab();
  await ff.send('browsingContext.setViewport', { context: tab.context, viewport: { width: 390, height: 800 } });
  await tab.go(base + '/?start=sound');
  assert.deepEqual(await shown(tab), ['sound']);
  assert.equal(await visible(tab, '.gi-settings-back'), true, 'on a phone, inside the category');
  assert.equal(await tab.eval('location.hash'), '');
  assert.equal(await tab.eval(`GateIronSettings.openCategory(document.getElementById('gi-set-music'))`), 'sound');
  const entries = await tab.eval('history.length');
  await tab.eval(`document.querySelector('.gi-settings-back').click()`);
  await settle(100);
  assert.equal(await visible(tab, '.gi-settings-pane'), false, 'Back: the overview');
  assert.equal(await tab.eval('history.length'), entries, 'and no history entry');
  assert.equal(await tab.eval(`GateIronSettings.openCategory(document.querySelector('[data-gi-settings]'))`), null);
  await tab.go(base + '/?start=sound#words');
  assert.deepEqual(await shown(tab), ['words'], 'the address wins');
  await tab.go(base + '/?start=sound&own=1#main');
  assert.deepEqual(await shown(tab), ['sound'], 'a site\'s own # leaves start alone');
  const before = await tab.eval('history.length');
  await tab.eval(`document.querySelector('.gi-settings-back').click()`);
  await settle(100);
  assert.equal(await visible(tab, '.gi-settings-pane'), false);
  assert.equal(await tab.eval('location.hash'), '#main', 'Back keeps the site\'s own #');
  assert.equal(await tab.eval('history.length'), before);
  assert.equal(await tab.eval(`(() => { const b = document.getElementById('gi-set-again'); return getComputedStyle(b).backgroundColor !== getComputedStyle(document.body).backgroundColor && b.classList.contains('btn-secondary'); })()`), true, 'an action button is solid');
  await tab.close();
});

test('start: its search stays out of the address; query carries a search into a redraw', async (t) => {
  if (!ff) { return t.skip('no Firefox'); }
  const tab = await ff.tab();
  await ff.send('browsingContext.setViewport', { context: tab.context, viewport: { width: 1200, height: 800 } });
  await tab.go(base + '/?start=sound&q=level');
  assert.equal(await tab.eval(`document.querySelector('[data-gi-settings-search]').value`), '', 'the page\'s own ?q= is not the panel\'s');
  await tab.eval(`(() => { const s = document.querySelector('[data-gi-settings-search]'); s.value = 'mus'; s.dispatchEvent(new Event('input')); })()`);
  assert.equal(await tab.eval('location.search'), '?start=sound&q=level', 'the address untouched');
  await tab.eval(`(() => {
    const old = document.querySelector('[data-gi-settings]');
    old.insertAdjacentHTML('afterend', GateIronSettings.settingsHtml({ start: GateIronSettings.openCategory(old),
      query: old.querySelector('[data-gi-settings-search]').value,
      categories: [{ id: 'sound', label: 'Sound', rows: [
        { id: 'music', label: 'Music', type: 'switch', value: true, default: true },
        { id: 'teacher', label: 'Teacher mode', type: 'switch', value: false, default: false }] }] }));
    old.remove();
    GateIronSettings.wire(document.querySelector('[data-gi-settings]'));
  })()`);
  assert.equal(await tab.eval(`document.querySelector('[data-gi-settings-search]').value`), 'mus');
  assert.deepEqual(await tab.eval(`[...document.querySelectorAll('.gi-settings-row')].filter((r) => !r.hidden).map((r) => r.dataset.giRow)`), ['music']);
  assert.equal(await tab.eval('location.search'), '?start=sound&q=level');
  await tab.close();
});

test('range: its value shows as it moves and is sent once let go; an action fires with action: true; say() announces', async (t) => {
  if (!ff) { return t.skip('no Firefox'); }
  const tab = await ff.tab();
  await ff.send('browsingContext.setViewport', { context: tab.context, viewport: { width: 1200, height: 800 } });
  await tab.go(base + '/#sound');
  const status = () => tab.eval(`document.querySelector('[data-gi-settings-status]').textContent`);
  await tab.eval(`(() => { const r = document.getElementById('gi-set-loud'); r.value = '80'; r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  assert.equal(await tab.eval(`document.querySelector('[data-gi-row=loud] .gi-settings-range-value').textContent`), '80');
  assert.deepEqual(await tab.eval('window.told'), [], 'nothing sent while it moves');
  await tab.eval(`document.getElementById('gi-set-loud').dispatchEvent(new Event('change', { bubbles: true }))`);
  assert.deepEqual(await tab.eval('window.told'), [{ id: 'loud', value: 80, reset: false }]);
  await tab.eval(`document.querySelector('[data-gi-row=loud] .gi-settings-reset').click()`);
  assert.equal(await tab.eval(`document.querySelector('[data-gi-row=loud] .gi-settings-range-value').textContent`), '50', 'Reset moves the value shown');
  await tab.eval(`document.getElementById('gi-set-again').click()`);
  assert.deepEqual((await tab.eval('window.told')).at(-1), { id: 'again', action: true });
  await settle(120);
  assert.equal(await status(), 'Saved');
  await tab.eval(`GateIronSettings.say(document.getElementById('adv'), false)`);
  await settle(120);
  assert.equal(await status(), 'Could not save');
  await tab.close();
});

test('phone: a controlHtml row holding a switch keeps the stacked layout; a switch row does not', async (t) => {
  if (!ff) { return t.skip('no Firefox'); }
  const tab = await ff.tab();
  await ff.send('browsingContext.setViewport', { context: tab.context, viewport: { width: 390, height: 800 } });
  await tab.go(base + '/#sound');
  const areas = (id) => tab.eval(`getComputedStyle(document.querySelector('[data-gi-row=${id}]')).gridTemplateAreas`);
  assert.equal(await areas('filter'), '"text" "control" "state"');
  assert.equal(await areas('music'), '"text control" "state state"');
  await tab.close();
});

test('theme: the stored choice wins, set() changes and remembers it, System follows nothing forced', async (t) => {
  if (!ff) { return t.skip('no Firefox'); }
  const tab = await ff.tab();
  await tab.go(base + '/dark');
  assert.equal(await tab.eval(`document.documentElement.classList.contains('gi-dark')`), true);
  assert.equal(await tab.eval(`getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()`), '#17140f');
  await tab.eval(`GateIronTheme.set('light')`);
  assert.equal(await tab.eval(`document.documentElement.classList.contains('gi-dark')`), false);
  await tab.go(base + '/');
  assert.equal(await tab.eval('GateIronTheme.get()'), 'light', 'with no stored choice, the browser\'s last one on the site');
  await tab.eval(`GateIronTheme.set('dark')`);
  await tab.go(base + '/');
  assert.equal(await tab.eval(`document.documentElement.classList.contains('gi-dark')`), true);
  await tab.eval(`GateIronTheme.set('nonsense')`);
  assert.equal(await tab.eval('GateIronTheme.get()'), 'system');
  await tab.close();
});
