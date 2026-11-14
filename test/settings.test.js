'use strict';
// settingsHtml: escaped, every word an option, the controls and their marks; settings.css scoped.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { settingsHtml } = require('gateiron-shared/settings');

const CATS = [
  { id: 'words', label: 'Words', rows: [
    { id: 'level', label: 'Reading level', description: 'Grade of the words served', type: 'select', value: 6, default: 8,
      options: [{ value: 6, label: 'Grade 6' }, { value: 8, label: 'Grade 8' }], keywords: ['grade', 'difficulty'] },
    { id: 'filter', label: 'Filter <words>', type: 'radio', value: 'strict', default: 'strict',
      options: [{ value: 'strict', label: 'Strict' }, { value: 'mild', label: 'Mild' }], locked: 'Set by your class: Word Processing' }] },
  { id: 'sound', label: 'Sound', rows: [
    { id: 'music', label: 'Music', type: 'switch', value: false, default: true },
    { id: 'volume', label: 'Volume', type: 'number', value: 5, default: 5, min: 0, max: 10 },
    { id: 'color', label: 'Colour', controlHtml: '<input type="color" id="mine">' }] }];

test('the page: title, search, a link per category, the account link, a status region', () => {
  const html = settingsHtml({ categories: CATS, accountHref: 'https://GateIron.com/profile?as=a&b' });
  assert.ok(html.includes('<h1 class="gi-settings-title">Preferences</h1>'));
  assert.ok(html.includes('placeholder="Search preferences"'));
  assert.ok(html.includes('<a href="#words" data-gi-cat="words">Words</a>') && html.includes('<a href="#sound" data-gi-cat="sound">Sound</a>'));
  assert.ok(html.includes('href="https://GateIron.com/profile?as=a&amp;b">Manage your GateIron account</a>'));
  assert.ok(html.includes('role="status" aria-live="polite"'));
  assert.ok(!settingsHtml({ categories: CATS }).includes('gi-settings-account'), 'no account link without accountHref');
});

test('every word is an option', () => {
  const html = settingsHtml({ categories: CATS, title: 'Einstellungen', searchLabel: 'Suchen', emptyText: 'Nichts', resetLabel: 'Zurück',
    modifiedLabel: 'Geändert', savedText: 'Gespeichert', failedText: 'Fehler', backLabel: 'Alle', navLabel: 'Bereiche', accountHref: '/p', accountLabel: 'Konto' });
  for (const w of ['Einstellungen', 'Suchen', 'Nichts', '>Zurück<', 'Geändert', 'data-saved="Gespeichert"', 'data-failed="Fehler"', '>Alle<', 'aria-label="Bereiche"', '>Konto<']) {
    assert.ok(html.includes(w), w);
  }
});

test('rows: each control labelled, a changed one marked, a locked one disabled with its reason and no Reset', () => {
  const html = settingsHtml({ categories: CATS });
  assert.ok(html.includes('<label class="gi-settings-label" id="gi-set-level-label" for="gi-set-level">Reading level</label>'));
  assert.ok(/data-gi-row="level" data-kind="number" data-default="8" data-keywords="grade difficulty"/.test(html), 'numeric options give numbers');
  assert.ok(/class="gi-settings-row gi-settings-row-select gi-settings-is-modified" data-gi-row="level"/.test(html), 'level differs from its default');
  assert.ok(html.includes('<option value="6" selected>Grade 6</option>'));
  assert.ok(html.includes('Filter &lt;words&gt;') && !html.includes('<words>'), 'escaped');
  assert.ok(/role="radiogroup" aria-labelledby="gi-set-filter-label"/.test(html));
  const filter = html.slice(html.indexOf('data-gi-row="filter"'), html.indexOf('data-gi-row="music"'));
  assert.ok(filter.includes('Set by your class: Word Processing') && filter.includes(' disabled>') && !filter.includes('gi-settings-reset'));
  assert.ok(/<input type="checkbox" role="switch" id="gi-set-music">/.test(html), 'a switch is a native checkbox');
  assert.ok(/class="gi-settings-row gi-settings-row-switch gi-settings-is-modified" data-gi-row="music"/.test(html));
  assert.ok(/class="gi-settings-row gi-settings-row-number" data-gi-row="volume"/.test(html) && html.includes('min="0" max="10"'));
  assert.ok(html.includes('aria-label="Reset Volume"'));
  const own = html.slice(html.indexOf('data-gi-row="color"'));
  assert.ok(own.includes('<input type="color" id="mine">') && !own.includes('gi-settings-reset') && own.includes('data-kind="own"'));
});

test('a row id is escaped wherever it lands; the description and lock reason describe the control', () => {
  const html = settingsHtml({ categories: [{ id: 'a', label: 'A', rows: [
    { id: 'x" onfocus="alert(1)', label: 'X', type: 'number', value: 1, default: 1 },
    { id: 'lv', label: 'Level', description: 'Grade', type: 'select', value: 1, default: 1, options: [{ value: 1, label: 'One' }], locked: 'Set by your class' },
    { id: 'pick', label: 'Pick', description: 'One of two', type: 'radio', value: 'a', default: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }] }] });
  assert.ok(!html.includes('" onfocus="'), 'no attribute breaks out');
  assert.ok(html.includes('id="gi-set-x&quot; onfocus=&quot;alert(1)"'));
  assert.ok(html.includes('<select id="gi-set-lv" disabled aria-describedby="gi-set-lv-desc gi-set-lv-lock">'));
  assert.ok(html.includes('<p class="gi-settings-lock" id="gi-set-lv-lock">Set by your class</p>'));
  assert.ok(html.includes('role="radiogroup" aria-labelledby="gi-set-pick-label" aria-describedby="gi-set-pick-desc"'));
});

test('a row names its type; a range shows its value; an action is a button or a link with no value', () => {
  const html = settingsHtml({ start: 'a', categories: [{ id: 'a', label: 'A', rows: [
    { id: 'm', label: 'Music', type: 'switch', value: true, default: true },
    { id: 'vol', label: 'Volume', type: 'range', value: 40, default: 70, min: 0, max: 100, step: 5 },
    { id: 'again', label: 'Hints', description: 'Hidden after the first game', type: 'action', actionLabel: 'Show Again' },
    { id: 'acct', label: 'Account', type: 'action', actionLabel: 'Open', href: '/p?a=1&b=2' },
    { id: 'off', label: 'Off', type: 'action', actionLabel: 'Go', href: '/x', locked: 'Not here' },
    { id: 'own', label: 'Own', controlHtml: '<input type="checkbox" role="switch">' }] }] });
  assert.ok(html.includes('data-gi-start="a"'));
  assert.ok(/class="gi-settings-row gi-settings-row-switch" data-gi-row="m"/.test(html));
  assert.ok(/class="gi-settings-row" data-gi-row="own"/.test(html), 'a controlHtml row names no type');
  assert.ok(/class="gi-settings-row gi-settings-row-range gi-settings-is-modified" data-gi-row="vol" data-kind="number" data-default="70"/.test(html));
  assert.ok(html.includes('<input type="range" id="gi-set-vol" value="40" min="0" max="100" step="5">'));
  assert.ok(html.includes('<output class="gi-settings-range-value" for="gi-set-vol" aria-hidden="true">40</output>'));
  const again = html.slice(html.indexOf('data-gi-row="again"'), html.indexOf('data-gi-row="acct"'));
  assert.ok(again.includes('data-kind="action"') && !again.includes('data-default') && !again.includes('gi-settings-reset'));
  assert.ok(again.includes('<button type="button" class="btn btn-small gi-settings-action" id="gi-set-again" aria-describedby="gi-set-again-label gi-set-again-desc">Show Again</button>'));
  assert.ok(html.includes('<a class="btn btn-small gi-settings-action" id="gi-set-acct" href="/p?a=1&amp;b=2" aria-describedby="gi-set-acct-label">Open</a>'));
  const off = html.slice(html.indexOf('data-gi-row="off"'), html.indexOf('data-gi-row="own"'));
  assert.ok(off.includes('<button type="button"') && off.includes(' disabled ') && !off.includes('href='), 'a locked link is a disabled button');
});

test('an unknown control is refused', () => {
  assert.throws(() => settingsHtml({ categories: [{ id: 'a', label: 'A', rows: [{ id: 'x', label: 'X', type: 'slider' }] }] }), /type slider/);
});

test('settings.css styles nothing but its own gi-settings classes', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'settings.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  for (const m of css.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1].trim();
    if (sel && !sel.startsWith('@')) { selectors.push(...sel.split(',').map((s) => s.trim())); }
  }
  assert.deepEqual(selectors.filter((s) => !s.startsWith('.gi-settings')), []);
});
