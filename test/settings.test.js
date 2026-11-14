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
  assert.ok(/class="gi-settings-row gi-settings-is-modified" data-gi-row="level"/.test(html), 'level differs from its default');
  assert.ok(html.includes('<option value="6" selected>Grade 6</option>'));
  assert.ok(html.includes('Filter &lt;words&gt;') && !html.includes('<words>'), 'escaped');
  assert.ok(/role="radiogroup" aria-labelledby="gi-set-filter-label"/.test(html));
  const filter = html.slice(html.indexOf('data-gi-row="filter"'), html.indexOf('data-gi-row="music"'));
  assert.ok(filter.includes('Set by your class: Word Processing') && filter.includes(' disabled>') && !filter.includes('gi-settings-reset'));
  assert.ok(/<input type="checkbox" role="switch" id="gi-set-music">/.test(html), 'a switch is a native checkbox');
  assert.ok(/class="gi-settings-row gi-settings-is-modified" data-gi-row="music"/.test(html));
  assert.ok(/class="gi-settings-row" data-gi-row="volume"/.test(html) && html.includes('min="0" max="10"'));
  assert.ok(html.includes('aria-label="Reset Volume"'));
  const own = html.slice(html.indexOf('data-gi-row="color"'));
  assert.ok(own.includes('<input type="color" id="mine">') && !own.includes('gi-settings-reset') && own.includes('data-kind="own"'));
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
