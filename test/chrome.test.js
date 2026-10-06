'use strict';
// npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const brand = require('..');

const ASSETS = { base: '/brand', version: '7' };

test('escapes every interpolated value', () => {
  const html = brand.topBar({
    product: '<script>alert(1)</script>',
    context: 'A & B',
    account: { name: '"><img src=x>', email: 'a@b.test', menu: [] },
    assets: ASSETS,
  });
  assert.ok(!html.includes('<script>alert'), 'product name was not escaped');
  assert.ok(!html.includes('"><img src=x>'), 'account name was not escaped');
  assert.ok(html.includes('A &amp; B'));
});

test('asset addresses come from the consumer, with no hard-coded path', () => {
  assert.equal(brand.assetUrl({ base: '/static/x/', version: '9' }, 'brand.css'),
    '/static/x/brand.css?v=9');
  assert.equal(brand.assetUrl({ base: 'https://cdn.example/b' }, 'gate-dark.png'),
    'https://cdn.example/b/gate-dark.png');
  // A consumer passing nothing still renders, not "undefined/brand.css".
  assert.equal(brand.assetUrl(undefined, 'brand.css'), '/brand/brand.css');
});

test('initials: two letters from a name, one from an address', () => {
  assert.equal(brand.initials({ name: 'Ada Lovelace' }), 'AL');
  assert.equal(brand.initials({ name: 'Prince' }), 'PR');
  assert.equal(brand.initials({ name: '  Grace  Brewster  Hopper ' }), 'GH');
  assert.equal(brand.initials({ email: 'zoe@example.test' }), 'Z');
  assert.equal(brand.initials({}), '?');
  assert.equal(brand.initials(undefined), '?');
});

// GateIron's CSP sets script-src-attr 'none' and forbids inline <script>.
test('the account menu carries no inline script and no event handler', () => {
  const html = brand.page({
    title: 'x',
    bodyHtml: '<p>y</p>',
    assets: ASSETS,
    account: {
      name: 'Ada Lovelace', email: 'ada@example.test', role: 'admin',
      menu: [{ href: '/settings', label: 'Settings' },
             { label: 'Sign out', form: { action: '/logout' } }],
    },
  });
  assert.ok(!/<script(?![^>]*\ssrc=)/i.test(html), 'an inline <script> block appeared in the chrome');
  assert.ok(!/\son[a-z]+\s*=/i.test(html), 'an inline event handler appeared in the chrome');
  assert.ok(html.includes('<details class="gi-account"'), 'the menu is not a details element');
  // A link that changes state is one a prefetcher will follow.
  assert.ok(html.includes('<form method="post" action="/logout">'));
});

test('signed out renders a sign-in button; no account at all leaves a slot', () => {
  const out = brand.topBar({ signIn: { href: '/login', label: 'Staff sign in' }, assets: ASSETS });
  assert.ok(out.includes('href="/login"') && out.includes('Staff sign in'));

  const slot = brand.topBar({ assets: ASSETS });
  assert.ok(slot.includes('<span class="gi-account-slot"></span>'));

  const none = brand.topBar({ assets: ASSETS, accountSlot: false });
  assert.ok(!none.includes('account-slot'));
});

test('nav marks the current item with aria-current, not only a class', () => {
  const html = brand.topBar({
    assets: ASSETS,
    nav: [{ href: '/a', label: 'A', current: true }, { href: '/b', label: 'B' }],
  });
  assert.ok(html.includes('href="/a" aria-current="page"'));
  assert.ok(html.includes('href="/b">B</a>'));
});

test('compact density sets the body class GateIron already uses', () => {
  assert.ok(brand.page({ title: 't', density: 'compact', assets: ASSETS })
    .includes('<body class="gi-compact">'));
});

test('the classroom footer is a variant, and its links are passed in', () => {
  const f = brand.siteFooter({ variant: 'classroom', links: [{ href: '/privacy', label: 'Privacy' }] });
  assert.ok(f.includes('gi-footer-classroom'));
  assert.ok(f.includes('href="/privacy"'));
  // Nothing commercial may be invented by this package.
  assert.ok(!/etsy|shop/i.test(f));
});

test('the skip link comes before the bar in the DOM', () => {
  const html = brand.page({ title: 't', bodyHtml: '', assets: ASSETS });
  assert.ok(html.indexOf('class="gi-skip-link"') < html.indexOf('<header class="gi-bar"'));
  assert.ok(html.includes('<main id="main" tabindex="-1">'));
});

// Node's named-export detection reads a static module.exports object. A dynamic
// one leaves ESM consumers with a default import only, and says nothing.
test('an ESM consumer can import the named exports', () => {
  const script = "import { topBar, initials } from " + JSON.stringify(path.resolve(__dirname, '..', 'chrome.js'))
    + "; console.log(typeof topBar, initials({ name: 'Ada Lovelace' }));";
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(out.trim(), 'function AL');
});

test('every asset the chrome asks for is actually in the package', () => {
  const html = brand.page({ title: 't', bodyHtml: '', mark: 'gate', assets: { base: '/brand' },
    footer: { brand: 'gateiron', assets: { base: '/brand' } } });
  const names = [...html.matchAll(/\/brand\/([\w./-]+)/g)].map((m) => m[1]);
  assert.ok(names.length >= 3, 'expected the stylesheet and both gate marks');
  for (const name of new Set(names)) {
    // One mount serves the package, so everything sits under assets/.
    assert.ok(fs.existsSync(path.resolve(__dirname, '..', 'assets', name)),
      'missing from the package: ' + name);
  }
});

test('the fonts carry their licences', () => {
  const dir = path.resolve(__dirname, '..', 'assets', 'fonts');
  for (const f of ['fraunces-latin.woff2', 'hanken-grotesk-latin.woff2',
                   'OFL-fraunces.txt', 'OFL-hanken-grotesk.txt']) {
    assert.ok(fs.existsSync(path.join(dir, f)), 'missing: ' + f);
  }
});

test('no stylesheet fetches from a third party', () => {
  for (const file of ['brand.css', 'chrome.css', 'contact.css']) {
    const css = fs.readFileSync(path.resolve(__dirname, '..', 'assets', file), 'utf8');
    const urls = [...css.matchAll(/(?:url\(|@import\s+)\s*['"]?([^'")\s]+)/g)].map((m) => m[1]);
    for (const u of urls) {
      assert.ok(!/^https?:|^\/\//.test(u), file + ' reaches off-site: ' + u);
    }
  }
});

test('the bar GateIron needs can be built from this package', () => {
  // GateIron has not adopted the package yet. This fails here rather than
  // there if the API stops fitting what its bar needs.
  const html = brand.topBar({
    home: '/',
    product: 'GateIron, LLC',
    mark: 'gate',
    context: 'Hood River · Oregon',
    density: 'compact',
    assets: { base: '/brand', version: '20260920-a' },
    actionsHtml: '<a class="btn btn-line" href="/games/">Games</a>'
           + '<a class="btn btn-primary" href="https://www.etsy.com/shop/GateIronLLC"'
           + ' target="_blank" rel="noopener">Shop</a>',
  });
  assert.ok(html.includes('Hood River'));
  assert.ok(html.includes('href="/games/"'), 'the consumer\'s own action row was dropped');
  assert.ok(html.indexOf('btn-primary') < html.indexOf('gi-account-slot'),
    'actions must come before the account chip, as GateIron orders them');
  assert.ok(html.includes('?v=20260920-a'), 'the consumer\'s cache marker was not used');
  assert.ok(/<div class="gi-bar-actions"><a class="btn btn-line" href="\/games\/">Games<\/a><a class="btn btn-primary"[^>]*>Shop<\/a><\/div>/.test(html), 'the site\'s buttons sit in .gi-bar-actions');
  assert.ok(!/<script|\son[a-z]+\s*=/i.test(html));
});

test('only a site that passes mark: "gate" wears the gate in its bar', () => {
  // The gate is the company's. A product putting it in its own top bar is
  // claiming to be GateIron.
  const product = brand.topBar({ product: 'NotUserError', mark: null, assets: ASSETS });
  assert.ok(!product.includes('gate-dark.png'));
  assert.ok(product.includes('NotUserError'));

  const gateiron = brand.topBar({ product: 'GateIron, LLC', mark: 'gate', assets: ASSETS });
  assert.ok(gateiron.includes('gate-dark.png'));

  assert.ok(!brand.topBar({ product: 'Anyone', assets: ASSETS }).includes('gate-dark.png'));
});

// The names and the mark are GateIron, LLC's trademarks, not MIT. Someone
// installing the package must not ship them without asking.
test('nothing of GateIron\'s appears unless a site asks for it', () => {
  const html = brand.page({ title: 't', bodyHtml: '', assets: ASSETS });
  assert.ok(!/GateIron|Hood River|gate-(dark|light)\.png/.test(html));
  assert.ok(!html.includes('gi-brand'), 'an empty brand link was left in the bar');
});

test('brand: "gateiron" puts the company in the footer, whatever the bar says', () => {
  const f = brand.siteFooter({ brand: 'gateiron', assets: ASSETS,
    links: [{ href: '/privacy', label: 'Privacy' }], finePrint: ['© 2026 GateIron, LLC'] });
  assert.ok(f.includes('GateIron, LLC') && f.includes('Hood River, Oregon'));
  assert.ok(f.includes('gate-light.png'), 'the dark footer needs the light mark');
  assert.ok(f.includes('gi-fine-print'));
});

test('another company\'s footer wears its own mark, not the gate', () => {
  const f = brand.siteFooter({ assets: ASSETS,
    brand: { href: 'https://example.test', name: 'Example Co', markHtml: '<svg></svg>' } });
  assert.ok(f.includes('Example Co') && f.includes('<svg></svg>'));
  assert.ok(!f.includes('gate-light.png') && !f.includes('<small>'));
});

test('dark is opt-in', () => {
  assert.ok(!brand.page({ title: 't', assets: ASSETS }).includes('gi-dark-auto'));
  assert.ok(brand.page({ title: 't', assets: ASSETS, darkMode: 'auto' })
    .includes('<html lang="en" class="gi-dark-auto">'));
});

test('a footer with nothing to show is no footer, and one with only fine print has no empty grid', () => {
  assert.equal(brand.siteFooter({ assets: ASSETS }), '');
  assert.equal(brand.siteFooter({ assets: ASSETS, variant: 'classroom' }), '');
  const fine = brand.siteFooter({ assets: ASSETS, finePrint: ['© GateIron, LLC'] });
  assert.ok(fine.includes('gi-fine-print') && !fine.includes('gi-footer-grid'), fine);
  const page = brand.page({ title: 'x', assets: ASSETS });
  assert.ok(!page.includes('gi-footer'), 'page() with no footer asked for draws none');
});

test('page() loads the menu script, and the script ships', () => {
  const html = brand.page({ title: 't', assets: ASSETS });
  assert.ok(html.includes('src="/brand/menu.js?v=7" defer'), 'page() carries the menu script');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'menu.js')));
});

function selectorsOf(file) {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  const re = /([^{}]+)\{/g; let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim();
    if (!sel || sel.startsWith('@')) continue;
    selectors.push(...sel.split(',').map((s) => s.trim()).filter(Boolean));
  }
  return selectors;
}

// A site's own .brand or .avatar must not reach into the bar, and the bar's must not reach out.
test('chrome.css styles nothing but its own gi- classes and .btn', () => {
  const selectors = selectorsOf('chrome.css');
  const foreign = selectors.filter((s) => !/^:root/.test(s) && !/\.gi-|^\.btn/.test(s));
  assert.deepEqual(foreign, []);
  assert.ok(selectors.length > 50);
});

// The scale as chrome.css writes it, worked out in px for a window `h` px tall: var() resolved
// against the given tokens, then the CSS maths run as JavaScript.
const chromeCss = () => fs.readFileSync(path.join(__dirname, '..', 'assets', 'chrome.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
function declared(block) {
  const out = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) { out[m[1]] = m[2].replace(/\s+/g, ' ').trim(); }
  return out;
}
function scaleAt(name, h, overrides) {
  const css = chromeCss();
  const tokens = Object.assign(declared(css.match(/:root\s*\{([^}]*)\}/)[1]),
    declared(css.match(/:root, \.gi-compact, \.gi-bar, \.gi-footer\s*\{([^}]*)\}/)[1]), overrides);
  let expr = 'var(' + name + ')';
  for (let i = 0; i < 20 && expr.includes('var('); i++) {
    expr = expr.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (all, v, fallback) => (tokens[v] !== undefined ? tokens[v] : fallback));
  }
  const js = expr.replace(/\bcalc\(/g, '(').replace(/\btan\(/g, 'Math.tan(').replace(/\batan2\(/g, 'Math.atan2(')
    .replace(/\bmax\(/g, 'Math.max(').replace(/\bmin\(/g, 'Math.min(')
    .replace(/(\d*\.?\d+)rem\b/g, '($1*16)').replace(/(\d+)svh\b/g, '($1*' + h + '/100)').replace(/(\d*\.?\d+)px\b/g, '$1');
  return Function('clamp', 'return ' + js)((lo, v, hi) => Math.min(Math.max(v, lo), hi));
}

test('the bar and the footer follow the window height in straight lines, without steps', () => {
  const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.01, what + ': ' + a + ' is not ' + b);
  for (const [h, bar, footer] of [[300, 40, 24], [400, 40, 24], [712, 50, 30], [1024, 60, 36], [1100, 60, 36],
    [1200, 60, 36], [1400, 66, 40], [1600, 72, 44], [2400, 72, 44]]) {
    near(scaleAt('--gi-bar-size', h), bar, 'bar at ' + h);
    near(scaleAt('--gi-footer-size', h), footer, 'footer at ' + h);
  }
  near(scaleAt('--bar-h', 900), scaleAt('--gi-bar-size', 900) + 1, '--bar-h is the bar and its rule');
  near(scaleAt('--bar-h', 900, { '--gi-nav-row': '2.4rem' }), scaleAt('--gi-bar-size', 900) + 2.4 * 16 + 1, 'and the nav\'s row on a narrow screen');
  const barCss = require('fs').readFileSync(require('path').join(__dirname, '..', 'assets', 'chrome.css'), 'utf8');
  assert.ok(/:root:has\(\.gi-bar \.gi-bar-actions\):not\(:has\(\.gi-bar \.gi-nav\)\):not\(:has\(body\.gi-bar-inline\)\) \{ --gi-nav-row: 2\.4rem; \}/.test(barCss), 'a bar with buttons and no nav counts its second row in --bar-h too, unless the site keeps them inline');
  let last = scaleAt('--gi-bar-size', 200);
  for (let h = 202; h <= 2000; h += 2) {
    const now = scaleAt('--gi-bar-size', h);
    assert.ok(now >= last && now - last < 0.1, 'a step at ' + h + 'px: ' + last + ' to ' + now);
    last = now;
  }
  const pinned = { '--gi-bar-size-std': 'var(--gi-bar-size-min)', '--gi-bar-size-max': 'var(--gi-bar-size-min)' };
  near(scaleAt('--gi-bar-size', 1800, pinned), 40, 'a pinned bar stays at its minimum');
  near(scaleAt('--gi-avatar-size', 300), 24, 'the account chip keeps a 24px target');
  const css = chromeCss();
  assert.ok(css.includes('.gi-compact { --gi-bar-size-std: var(--gi-bar-size-min); --gi-bar-size-max: var(--gi-bar-size-min); }'));
  assert.ok(css.includes('.gi-footer-classroom { --gi-footer-size-std: var(--gi-footer-size-min); --gi-footer-size-max: var(--gi-footer-size-min); }'));
});

test('brand.css: one error notice, and the measures are tokens', () => {
  const selectors = selectorsOf('brand.css');
  assert.deepEqual(selectors.filter((s) => /\.error\b/.test(s)), [], '.error is .notice-error');
  assert.equal(selectors.filter((s) => s === '.notice-error').length, 1);
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'brand.css'), 'utf8');
  for (const rule of ['max-width: var(--shell)', '.prose { max-width: var(--gi-measure); }', 'form { max-width: var(--gi-form-width); }']) {
    assert.ok(css.includes(rule), rule);
  }
});

test('every class the chrome renders is a gi- class or .btn, and chrome.css styles it', () => {
  const html = brand.page({
    title: 't', assets: ASSETS, mark: 'gate', product: 'P', context: 'c', density: 'compact',
    nav: [{ href: '/a', label: 'A', current: true }],
    account: { name: 'Ada', email: 'a@b.test', role: 'r', accent: true, avatarSrc: 'https://x.test/a.png',
      menu: [{ href: '/p', label: 'P' }, { label: 'Out', form: { action: '/o' } }, { label: 'Go', button: 'go' }] },
    footer: { brand: 'gateiron', variant: 'classroom', links: [{ href: '/x', label: 'X' }], finePrint: ['f'], assets: ASSETS },
  });
  const classes = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'chrome.css'), 'utf8');
  for (const c of classes) {
    assert.ok(/^(gi-|btn)/.test(c), 'an unscoped class in the chrome: ' + c);
    assert.ok(css.includes('.' + c), 'chrome.css never styles .' + c);
  }
});

test('an option renamed in 0.11.0 throws instead of rendering nothing', () => {
  assert.throws(() => brand.page({ title: 't', body: '<p>x</p>' }), /bodyHtml/);
  assert.throws(() => brand.page({ title: 't', head: '<link>' }), /headHtml/);
  assert.throws(() => brand.topBar({ actions: '<a>' }), /actionsHtml/);
  assert.throws(() => brand.topBar({ mark: '<svg></svg>' }), /markHtml/);
  assert.throws(() => brand.siteFooter({ brand: { name: 'X', mark: '<svg></svg>' } }), /markHtml/);
  assert.throws(() => brand.topBar({ account: { name: 'A', menu: [{ label: 'Out', form: { action: '/o', hidden: '<input>' } }] } }), /hiddenHtml/);
  assert.ok(brand.topBar({ markHtml: '<svg class="m"></svg>', product: 'P' }).includes('<svg class="m"></svg>'));
});

test('a bar with a mark and no name still names its home link', () => {
  assert.ok(brand.topBar({ markHtml: '<svg></svg>', homeLabel: 'Example home' }).includes('<a class="gi-brand" href="/" aria-label="Example home">'));
  assert.ok(!brand.topBar({ markHtml: '<svg></svg>', product: 'P' }).includes('aria-label="Home"'));
});

test('the chip is named by what it shows, then what it is', () => {
  const html = brand.topBar({ account: { name: 'Ada Lovelace', role: 'Operator', menu: [] } });
  const summary = html.match(/<summary>([\s\S]*?)<\/summary>/)[1];
  assert.ok(!/aria-label/.test(html.match(/<summary[^>]*>/)[0]), 'an aria-label would replace the visible name');
  const text = summary.replace(/<span class="gi-avatar[^"]*" aria-hidden="true">[^<]*<\/span>/, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  assert.equal(text, 'Ada Lovelace Operator Account menu');
});

test('menu items: a link, a form that posts, a button the page binds', () => {
  const html = brand.topBar({ account: { name: 'A', menu: [
    { href: '/p', label: 'Profile' },
    { label: 'Sign out', form: { action: '/out', hiddenHtml: '<input type="hidden" name="_csrf" value="t">' } },
    { label: 'Everywhere', button: 'sign-out-everywhere' },
  ] } });
  assert.ok(html.includes('<a href="/p">Profile</a>'));
  assert.ok(html.includes('<form method="post" action="/out"><input type="hidden" name="_csrf" value="t"><button type="submit">Sign out</button></form>'));
  assert.ok(html.includes('<button type="button" data-gi-action="sign-out-everywhere">Everywhere</button>'));
});

test('compact density keeps the page\'s own body class', () => {
  assert.ok(brand.page({ title: 't', density: 'compact', bodyClass: 'game', assets: ASSETS }).includes('<body class="gi-compact game">'));
  assert.ok(brand.page({ title: 't', bodyClass: 'game', assets: ASSETS }).includes('<body class="game">'));
});

test('the footer\'s links are a labelled nav; the skip link\'s words are an option', () => {
  const f = brand.siteFooter({ links: [{ href: '/x', label: 'X' }], linksLabel: 'Legal' });
  assert.ok(f.includes('<nav class="gi-footer-links" aria-label="Legal">'));
  assert.equal(brand.skipLink({ label: 'Zum Inhalt' }), '<a class="gi-skip-link" href="#main">Zum Inhalt</a>');
  assert.ok(brand.page({ title: 't', lang: 'de', skipLabel: 'Zum Inhalt' }).includes('>Zum Inhalt</a>'));
});

test('Google\'s button ships unchanged, and NOTICE keeps it out of the MIT grant', () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'assets', 'google-signin.svg'), 'utf8');
  assert.ok(svg.includes('stroke="#747775"') && svg.includes('fill="white"'), 'not Google\'s light button');
  const notice = fs.readFileSync(path.join(__dirname, '..', 'NOTICE'), 'utf8');
  assert.ok(notice.includes('assets/google-signin.svg') && /Google's\s+trademarks/.test(notice));
});

test('brand.css imports the chrome of this very release', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'brand.css'), 'utf8');
  const version = require('../package.json').version;
  assert.ok(css.startsWith(`@import url('chrome.css?v=${version}');`), 'brand.css must import chrome.css?v=' + version);
});

const contact = require('../contact.js');

test('contactForm escapes what it is given and needs an action', () => {
  assert.throws(() => contact.contactForm({}), /action is required/);
  const html = contact.contactForm({
    action: '/contact', title: '<script>x</script>', placeholder: '"quoted" <b>',
    backdrop: '/img/a"b.jpg', messages: { unexpected: 'Try <Etsy>' },
  });
  assert.ok(!html.includes('<script>x'), 'title not escaped');
  assert.ok(html.includes('placeholder="&quot;quoted&quot; &lt;b&gt;"'));
  assert.ok(html.includes('style="--gi-contact-backdrop: url(&quot;/img/a\\&quot;b.jpg&quot;)"'), html.match(/style="[^"]*"/)[0]);
  assert.ok(html.includes('data-msg-unexpected="Try &lt;Etsy&gt;"'));
  assert.ok(!/<script(?![^>]*\ssrc=)/i.test(html) && !/\son[a-z]+\s*=/i.test(html), 'no inline script or handler');
  assert.ok(html.includes('name="homepage" tabindex="-1"'), 'the hidden field is there');
  assert.ok(/<form class="gi-contact-form"[^>]* data-submit-gate/.test(html) && !html.includes('required-mark'), 'Send waits for valid fields; all required, so no marks');
  assert.ok(!html.includes('cf-turnstile'), 'no Turnstile without a site key');
  assert.ok(contact.contactForm({ action: '/c', turnstileSiteKey: 'k' }).includes('data-sitekey="k"'));
});

test('readContact: spam, incomplete, too long, or clean fields', () => {
  assert.deepEqual(contact.readContact({ homepage: 'x', name: 'a' }), { spam: true });
  assert.deepEqual(contact.readContact({ name: 'A', email: 'nope', subject: 's', message: 'm' }), { problem: 'incomplete' });
  assert.deepEqual(contact.readContact({ name: 'A', email: 'a@b.co', subject: 's', message: 'x'.repeat(50001) }), { problem: 'too-long' });
  assert.deepEqual(contact.readContact({ name: ' <b>Ada</b>\n', email: ' a@b.co ', subject: 'Hi\r\nthere', message: '<p>Hello</p> ' }),
    { fields: { name: 'Ada', email: 'a@b.co', subject: 'Hi there', message: 'Hello' } });
});

test('contact.css styles nothing outside .gi-contact', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'contact.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  const re = /([^{}]+)\{/g; let m;
  while ((m = re.exec(css))) { const s = m[1].trim(); if (s && !s.startsWith('@')) { selectors.push(...s.split(',').map((x) => x.trim())); } }
  assert.deepEqual(selectors.filter((s) => !/^\.gi-contact/.test(s)), []);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'contact.js')));
});
