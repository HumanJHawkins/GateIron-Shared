'use strict';
// contact.css in headless Firefox, light and Dark, over a white backdrop (the worst case for Dark):
// text 4.5:1 and field edges 3:1 against what is really behind them. Skipped without Firefox.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { firefox } = require('./lib/firefox');
const { contactForm } = require('../contact.js');

const ASSET = (f) => fs.readFileSync(path.join(__dirname, '..', 'assets', f));
const PAGE = (dark) => `<!doctype html><html lang="en"${dark ? ' class="gi-dark"' : ''}><head><meta charset="utf-8"><title>c</title>
<link rel="stylesheet" href="/chrome.css"><link rel="stylesheet" href="/contact.css"><link rel="stylesheet" href="/site.css"></head>
<body>${contactForm({ action: '/contact', label: 'Get in touch', title: 'Say hello', lead: 'A line under the heading.', afterHtml: '<p class="gi-contact-after">Or <a href="/x">elsewhere</a>.</p>' })}</body></html>`;

const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/chrome.css' || p === '/contact.css') { res.writeHead(200, { 'content-type': 'text/css' }); res.end(ASSET(p.slice(1))); return; }
  if (p === '/site.css') { res.writeHead(200, { 'content-type': 'text/css' }); res.end('.gi-contact { --gi-contact-backdrop: linear-gradient(#fff, #fff); }'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(PAGE(p === '/dark'));
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

const rgba = (s) => { const p = s.match(/[\d.]+/g).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
const over = (top, under) => top.slice(0, 3).map((c, i) => c * top[3] + under[i] * (1 - top[3])).concat(1);
const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const scheme of ['light', 'dark']) {
  test(`contact, ${scheme}: text 4.5:1 and field edges 3:1 over a white backdrop`, async (t) => {
    if (!ff) { return t.skip('no Firefox'); }
    const tab = await ff.tab();
    await tab.go(base + '/' + (scheme === 'dark' ? 'dark' : ''));
    const got = await tab.eval(`(() => {
      const cs = (sel, pseudo) => getComputedStyle(document.querySelector(sel), pseudo || null);
      const before = cs('.gi-contact', '::before');
      return {
        scrim: getComputedStyle(document.documentElement).getPropertyValue('--image-scrim').trim(),
        fadeBg: before.backgroundColor, mask: before.maskImage,
        title: cs('.gi-contact-title').color, kicker: cs('.gi-contact-label').color, lead: cs('.gi-contact-lead').color,
        label: cs('.gi-contact-field label').color, after: cs('.gi-contact-after').color, link: cs('.gi-contact-after a').color,
        fieldText: cs('.gi-contact-field input').color, fieldBg: cs('.gi-contact-field input').backgroundColor,
        fieldEdge: cs('.gi-contact-field input').borderTopColor,
      };
    })()`);
    assert.match(got.mask, /linear-gradient/, 'the fade is a mask over the backdrop');
    // The band where the labels sit: the backdrop under --bg at --image-scrim (0 in light).
    const behind = over(rgba(got.fadeBg).slice(0, 3).concat(Number(got.scrim)), [255, 255, 255]);
    const fails = [];
    for (const k of ['title', 'kicker', 'lead', 'label', 'after', 'link']) {
      const r = ratio(over(rgba(got[k]), behind), behind);
      if (r < 4.5) { fails.push(`${k} ${r.toFixed(2)}`); }
    }
    const field = rgba(got.fieldBg);
    if (ratio(rgba(got.fieldText), field) < 4.5) { fails.push('field text'); }
    for (const [what, against] of [['field edge on the field', field], ['field edge on the backdrop', behind]]) {
      const r = ratio(rgba(got.fieldEdge), against);
      if (r < 3) { fails.push(`${what} ${r.toFixed(2)}`); }
    }
    assert.deepEqual(fails, [], JSON.stringify(got));
    if (scheme === 'dark') { assert.equal(got.scrim, '0.9'); }
    await tab.close();
  });
}
