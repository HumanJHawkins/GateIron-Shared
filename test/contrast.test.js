'use strict';
// npm test. Contrast of every pairing the stylesheets draw, computed from chrome.css's own values in
// both schemes. WCAG 2.2: 4.5:1 for text, 3:1 for a focus ring or a field's edge.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'chrome.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

function declarations(block) {
  const out = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) { out[m[1]] = m[2].trim(); }
  return out;
}
const light = declarations(css.match(/:root\s*\{([^}]*)\}/)[1]);
const dark = Object.assign({}, light, declarations(css.match(/:root\.gi-dark-auto\s*\{([^}]*)\}/)[1]));

// A value as [r, g, b, a], with var() resolved against the scheme and a fallback honoured.
function color(value, tokens) {
  const v = String(value).trim();
  const ref = v.match(/^var\((--[\w-]+)(?:\s*,\s*(.+))?\)$/);
  if (ref) { return color(tokens[ref[1]] !== undefined ? tokens[ref[1]] : ref[2], tokens); }
  if (/^#[0-9a-f]{6}$/i.test(v)) { return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)).concat(1); }
  const rgba = v.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) { const p = rgba[1].split(',').map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  throw new Error('not a colour: ' + v);
}
const over = (top, under) => top.slice(0, 3).map((c, i) => c * top[3] + under[i] * (1 - top[3])).concat(1);
function luminance(rgb) {
  const [r, g, b] = rgb.slice(0, 3).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [what, foreground, background, the ground the background sits on, minimum]
const PAIRS = [
  ['body text', 'var(--text)', 'var(--bg)', null, 4.5],
  ['text on a card', 'var(--text)', 'var(--surface)', null, 4.5],
  ['muted text', 'var(--text-muted)', 'var(--bg)', null, 4.5],
  ['muted text on a card', 'var(--text-muted)', 'var(--surface)', null, 4.5],
  ['table heading', 'var(--text-muted)', 'var(--surface-2)', null, 4.5],
  ['link', 'var(--accent)', 'var(--bg)', null, 4.5],
  ['link on a card', 'var(--accent)', 'var(--surface)', null, 4.5],
  ['link, hovered', 'var(--accent-hover)', 'var(--bg)', null, 4.5],
  ['primary button', 'var(--accent-on)', 'var(--accent)', null, 4.5],
  ['primary button, hovered', 'var(--accent-on)', 'var(--accent-hover)', null, 4.5],
  ['bar text', 'var(--text)', 'var(--bar-bg)', 'var(--bg)', 4.5],
  ['bar context line', 'var(--text-muted)', 'var(--bar-bg)', 'var(--bg)', 4.5],
  ['current nav item', 'var(--accent)', 'var(--bar-bg)', 'var(--bg)', 4.5],
  ['initials', 'var(--gi-avatar-text)', 'var(--gi-avatar-bg)', null, 4.5],
  ['initials, accented', 'var(--gi-avatar-text)', 'var(--gi-avatar-accent-bg)', null, 4.5],
  ['footer text', 'var(--gi-footer-text)', 'var(--gi-footer-bg)', null, 4.5],
  ['footer muted', 'var(--gi-footer-muted)', 'var(--gi-footer-bg)', null, 4.5],
  ['badge ok', 'var(--ok)', 'var(--ok-bg)', 'var(--surface)', 4.5],
  ['badge warn', 'var(--warn)', 'var(--warn-bg)', 'var(--surface)', 4.5],
  ['badge urgent', 'var(--urgent)', 'var(--urgent-bg)', 'var(--surface)', 4.5],
  ['badge quiet', 'var(--quiet)', 'var(--quiet-bg)', 'var(--surface)', 4.5],
  ['notice ok', 'var(--text)', 'var(--ok-bg)', 'var(--bg)', 4.5],
  ['notice warn', 'var(--text)', 'var(--warn-bg)', 'var(--bg)', 4.5],
  ['notice error', 'var(--text)', 'var(--urgent-bg)', 'var(--bg)', 4.5],
  ['focus ring', 'var(--focus)', 'var(--bg)', null, 3],
  ['field edge', 'var(--field-border)', 'var(--bg)', null, 3],
];

for (const [scheme, tokens] of [['light', light], ['dark', dark]]) {
  test('contrast, ' + scheme, () => {
    const failures = [];
    for (const [what, fg, bg, ground, min] of PAIRS) {
      let back = color(bg, tokens);
      if (back[3] < 1) { back = over(back, color(ground, tokens)); }
      const r = ratio(over(color(fg, tokens), back), back);
      if (r < min) { failures.push(what + ' ' + r.toFixed(2) + ':1, needs ' + min); }
    }
    assert.deepEqual(failures, []);
  });
}
