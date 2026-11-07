# GateIron Shared

The presentation layer GateIron's sites share: palette, type, the gate mark,
the top bar, the footer, and the components pages are built from — buttons,
forms, tables, badges, notices, the account menu. With it, the browser contract
every site applies alike: one account per tab, and the lint that keeps a site's
addresses in step with it.

## Install

```bash
npm install --allow-git=all github:HumanJHawkins/GateIron-Shared#v0.20.7
```

Install a tag, not a branch.

npm 12 blocks git dependencies by default (`EALLOWGIT`). Put `allow-git=all`
in the project's `.npmrc` so the setting travels with the repository. The
narrower `root` looks right and works for a first install, but refuses an
already-locked git dependency on reinstall (npm/cli#9189), so an upgrade fails
until it is widened. A container build also needs `git` installed and `.npmrc`
copied before `npm ci`.

## Serve the assets

Everything the chrome references lives under `assets/`, including the
stylesheet, whose `@font-face` rules resolve relative to itself. One mount:

```js
const path = require('path');
const ASSETS = path.join(path.dirname(require.resolve('gateiron-shared/package.json')), 'assets');
app.use('/brand', express.static(ASSETS, { maxAge: '365d', immutable: true }));
```

Pass the package version as `assets.version` and cache hard. A new release is a
new address.

## A page with its own layout

`brand.css` styles the whole page: body, headings, links, bare buttons, form fields, tables, and
the page vocabulary (`.card`, `.notice`, `.badge`, `.table-wrap`, `.muted`, `.prose`, `.linkish`,
`.field-pair`, `.row-actions` and the rest of `brand.css`). A page that has its own look (a game board, an editor) loads
`chrome.css` instead. It carries only the tokens, the two faces, the skip link, the bar, the
account menu, `.btn`, the footer and the compact rules. Its classes all start with `gi-` (and
`.btn`), so a site's own `.brand` or `.avatar` never reaches the bar, and the bar's rules never
reach the page.

```html
<link rel="stylesheet" href="/brand/chrome.css?v=0.20.7">
```

## The account menu's script

`page()` includes `menu.js`. A site with its own shell adds it once:

```html
<script src="/brand/menu.js" defer></script>
```

It closes the menu on a click outside it, on Escape (focus returns to the chip) and when Tab leaves
it; ArrowDown and ArrowUp open it from the chip and move through its items, Home and End jump to
the ends. Without it the menu still opens and closes from its chip.

## Filling the account slot after load

A site that learns who is signed in only after the page loads leaves the slot (`topBar` with
neither `account` nor `signIn`) and fills it with `account.js`, which is the same code `topBar`
renders the chip with:

```html
<script src="/brand/account.js" defer></script>
```

```js
const chip = GateIronChrome.fillAccount(document.querySelector('.gi-account-slot'),
  user ? { account: { name, email, role, avatarSrc, accent, menu } }
       : { signIn: { href: 'signin?returnTo=' + here, label: 'Sign in' } });
chip.querySelector('[data-gi-action="sign-out"]')?.addEventListener('click', signOut);
```

`account` and `signIn` take exactly what `topBar` takes. A menu entry `{ label, button: 'sign-out' }`
is a `<button data-gi-action="sign-out">` the site binds itself.

Once the page knows who it shows, it watches for a sign-out made in another tab, of this site or of
any GateIron product:

```js
GateIronChrome.watchAccount({ id: user ? user.id : null, meUrl: 'api/me', channel: 'mysite-account' });
```

`meUrl` defaults to `api/me` on a page with a `<base href>` (the path) and `/api/me` on one without; a
site on the path that passes its own passes it relative, or the ask goes out as the default account and
the page reloads each time. A signed-in page asks `meUrl` again when it is shown or focused and each minute while in view, and at
once when another tab of the site loads as someone else; a 401 or a different `id` reloads the page.
Call it on every page, signed in or not: a page that loads signed out tells the site's other tabs. A
sign-out made at GateIron.com or in another product reaches the site as GateIron's back-channel
logout, which must end the site's session so the next ask is the 401.
The page's CSP must allow the ask: `connect-src 'self'` (or the origin of `meUrl`). A `default-src
'none'` with no `connect-src` blocks it silently and the watch never fires.

## One account per tab

A browser holds several accounts and each tab acts as its own (GateIron.com
docs/SIGN-IN-FOR-PRODUCTS.md, "Several accounts on one browser"). The site mints
an opaque key per browser and account and keeps the list in two readable cookies
(the keys signed in here, the default first; the keys signed out here). Where the
accounts are kept, how many (GateIron's are 5), and what a sign-in or sign-out
writes stay the site's. `gateiron-shared/tabs` is the server half, `assets/tabs.js`
the browser half.

A tab's account is the start of its address: `/u/<key>/shop/cart`. The server
takes the prefix off before any route sees it and gives every page
`<base href="/u/<key>/">` (`"/"` with none), so every relative address the page
uses (link, form, `fetch`, XHR, `location.href = 'next'`, `pushState`) carries the
account with nothing wrapped. A page is under its prefix while the browser holds
more than one account, or its account is not the default; otherwise under none.

### The server

```js
const tabs = require('gateiron-shared/tabs');
app.use(tabs.pathTab({ bare: ['/oauth/'] }));         // first, before any route
// ...after the session:
app.use((req, res, next) => {
  const keys = keysHere(req);
  req.tab = tabs.readTab(req, { keys, gone: goneHere(req) });
  tabs.keepPath(res, () => req.tab.keep);             // every redirect stays under the tab's key
  const want = tabs.pathFor(req.tab, keys, keys[0]);
  if (req.method === 'GET' && want !== req.tabPath && !req.tab.background && req.accepts('html')) {
    tabs.keepPath(res, want);
    return res.redirect(302, req.originalUrl);        // the page under the right prefix, or none
  }
  next();
});
```

- `pathTab({ bare })` strips `/u/<key>` from `req.url` and `req.originalUrl`
  (the key is `req.tabPath`), puts the tab's key on every same-origin redirect,
  and starts every HTML page's `<head>` with its `<base href>`. `bare`: addresses
  no tab names (prefixes or RegExps), served and redirected without one: a
  provider's endpoints, a mail link's token page, a calendar feed, webhooks.
  A response written outside Express's `res.send` (oidc-provider's own pages,
  `res.sendFile`) gets no `<base>`: keep its addresses absolute.
- `readTab(req, { keys, gone, default })` answers `{ asked, source, key,
  signedOut, keep, background }`. `key` is the account to serve. A request
  naming none is the default's, and so is a shared or typed link naming a key
  this browser never held (`pathFor` then moves it to the address with none). On
  the path, a page with no prefix is the default's whatever page it came from (a
  redirect keeps an older page's Referer); a picture or frame with none takes its
  page's key from the Referer. Anything else naming a key not signed in here is signed
  out. A `background` request (fetch, XHR, EventSource, beacon) signed out is
  answered 401, never a redirect to sign in and never the default.
- `withPath(to, key)` is `to` under `key` (or under none); `stripPath(url)` the
  reverse. `pathFor(tab, keys, default)` is the prefix a page belongs under.
- While sites move, `readTab` also reads `au` and the site's `header` (pass it)
  and the Referer's `au`; an old address naming `au` is moved under the prefix by
  `pathFor`'s redirect.

The site's rules:

- Write every page, form and API address relative: `shop/cart`, `api/me`,
  `auth/logout`, the front page `./`. `location.assign` and `replace` resolve against
  the base too, so a fallback is `./` (`x ?? './'`), the front page under the
  tab's prefix. Static files keep their slash (`/css/site.css`,
  `/brand/brand.css`): under each account's prefix they would be fetched and
  cached again. The lint below enforces it; `rel('/x')` from
  `gateiron-shared/eslint` converts one.
- Redirects stay root-relative (`res.redirect('/signin')`): `pathTab` puts the
  tab's key on them.
- An address the server sends to a page (JSON `url`, `next`) is root-relative;
  the page uses it through `GateIronTab.address(url)`, which puts it under the
  tab's key. So does one a script reads from a `data-` attribute and fetches,
  unless the attribute is written relative.
- A page script resolving an address does it against `document.baseURI`, not
  `location.href`. One comparing addresses strips the key first:
  `GateIronTab.unmarked(location.pathname)`.
- The CSP allows the tag: `base-uri 'self'` (`'none'` blocks it).
- A site whose first path segment can be chosen by its users (an organization
  slug) reserves `u`.
- After a sign-in, redirect under the new account's key (`keepPath(res, key)`),
  so the tab that signed in becomes it; with one account here, under none. A popup
  sign-in's last page sends the new key to its opener, which calls `adopt(key)`.
- The gone list holds what the server ended: the site's own sign-outs, and the
  keys its back-channel logout removed, kept server-side and written into the
  cookie on the browser's next answer. A key the browser names that the server
  never held is signed out, not added. `addGone(list, ...keys)` keeps the last 12.
- Send a Referrer-Policy that gives same-origin requests the full URL:
  `same-origin` or `strict-origin-when-cross-origin`, never `no-referrer`
  (helmet's default).
- Cookie helpers: `readList(req, name)` reads `name` or `__Host-name`;
  `cookieName(name, secure)` is the one to write.
- A site where a tab naming none can be signed out with accounts still here
  (GateIron.com, after its current account signs out) writes the keys list with
  a leading `.` (`.k1.k2`) and passes `default: null` to `readTab`.

### The browser

```html
<meta name="gateiron-tab" content="<the key this page was drawn as, or empty>">
<script src="/brand/tabs.js?v=0.20.7" data-gateiron-tabs data-mode="path"
  data-keys-cookie="nhKeys" data-channel="nothangman-tabs"></script>
```

Or `GateIronTabs.start({ mode: 'path', keysCookie, channel, meta, keyPattern,
signOutSelector, onSignedOut })` from the site's first script. It touches no
request. It tells the site's other tabs when an account signs out (a form
matching `signOutSelector`, `form[action*="logout"]`, or `leaving()` before a
sign-out made by `fetch`): that account's tabs get a `gateiron:leaving` event on
`document` to save drafts, then `onSignedOut(key)` (the default reloads). It
moves a tab whose account stops being the default under its prefix (address and
`<base>`); sessionStorage keeps the account the tab last had at each address,
prefix or not, so Back or Reload to one from before the move goes under that
prefix too. All of this needs the tab's key: a page drawn without the meta's key
(one served ahead of the session) calls `adopt(key)` once it learns it, or the
tab stays the default's and follows whichever account becomes the default. A site needs no copy of its own. `history.state` is the site's alone. And a
link or history entry meaning this page (`""`, `?page=2`, `#main`), which the
base would send to the front page, stays on the page.

`window.GateIronTab`: `key()`; `adopt(key)`; `forget()`; `address(url)`, an
address under this tab's key; `as(url, key)`, under another account's;
`unmarked(url)`, under none; `leaving()`. Each takes any address of this site,
relative or not, resolved against the page's base.

### The lint

```js
// eslint.config.js
const gateiron = require('gateiron-shared/eslint');   // or: import gateiron from 'gateiron-shared/eslint'
{ files: ['src/**/*.js'], plugins: { gateiron },
  rules: { 'gateiron/relative-urls': ['error', { allow: ['/oauth/'] }] } },
{ files: ['public/**/*.js'], plugins: { gateiron },
  rules: { 'gateiron/relative-urls': ['error', { allow: ['/oauth/'], calls: ['post'] }] } },
```

It reports a root-relative address where a browser goes or sends: `fetch`,
XMLHttpRequest `open`, `EventSource`, `sendBeacon`, `window.open`,
`pushState`/`replaceState`, `location` and its `assign`/`replace`, an assignment
to `.href` or `.action`, a property named `href`, `action`, `home` or `meUrl`, and an
`href`, `action` or `formaction` attribute in any string (HTML built in code),
following both branches of `?:`, `||` and `??`. It cannot see an address that
starts with an expression (`` `${at}/files` ``).
A file of a static type (`.css`, `.js`, an image, a font, a sound) in any
folder keeps its slash without an entry. `allow`: more static folders and bare
addresses (`'/*.json'` is any `.json` file at the root). `calls`: the page scripts' own helpers whose first argument is an
address; not in server code, where `router.post('/x')` is a route. For HTML
files, `rootRelative(html, allow)` returns `[{ attr, url, line }]` for a test;
it skips the page's own `<base href="/">`. Run it over the HTML the site renders
too (each page a test signs in to), which finds what the lint cannot. `rel`,
`rootRelative` and `STATIC` also import by name.

### Sites still on `au`

`mode: 'param'` (the default) is 0.19.0's: `data-header`, `data-gone-cookie` and
`au` on the address, each link, form and script navigation, the header on fetch
and XHR, sessionStorage through Reload and Back; on the server
`keepOnRedirect(res, keep)` and `withParam`. It goes once every site is on the
path.

## API

Plain data in, HTML strings out.

```js
const { page, skipLink, topBar, siteFooter, initials, assetUrl, esc } = require('gateiron-shared');
```

### `topBar(opts)`

| option | meaning |
|---|---|
| `home` | where the mark and wordmark link |
| `product` | the name in the bar |
| `mark: 'gate'` | GateIron's gate beside it |
| `markHtml` | the site's own mark, an `<img>` or inline `<svg>` |
| `homeLabel` | the home link's name when there is a mark and no `product` (default "Home") |
| `context` | the smaller line beneath it — a district, a class |
| `nav` | `[{ href, label, current?, external?, title? }]`; `title` is the link's tooltip |
| `navLabel` | the nav's name for a screen reader (default "Sections") |
| `account` | `{ name, email, role?, avatarSrc?, accent?, menuLabel?, accounts?, add?, menu }`, or omit. `accounts` are the other accounts signed in on this browser, `[{ name, email, avatarSrc, key, href \| form \| button }]`, drawn under the address with their avatars; `add` is `{ href, label? }` for Add another account. A person with one account gets no `accounts` |
| `signIn` | `{ href, label }` for the signed-out state |
| `actionsHtml` | placed before the account chip, for the site's own buttons; on a narrow screen they take a second line only when they don't fit beside the brand and the account chip (`menu.js` measures; or the page's body has `gi-bar-inline`) |
| `assets` | `{ base, version }` |

A menu entry is `{ href, label }`; `{ label, form: { action, method, hiddenHtml } }` for anything
that changes state — sign-out is a POST, not a link a prefetcher can follow; or
`{ label, button }` for a button the page's own script binds. An entry the page hides later takes
the `hidden` attribute.

The chip's name for a screen reader is what it shows (name, then role) followed by `menuLabel`
(default "Account menu"). On a narrow screen the name is hidden from sight but still read.

Omitting both `account` and `signIn` emits `<span class="gi-account-slot"></span>` for
`account.js` to fill after load. Pass `accountSlot: false` to leave nothing.

Pass `avatarSrc` with the picture from the person's sign-in whenever there is one
(`~/Projects/CLAUDE.md`, SIGN-IN IDENTITY); initials are for an account without one.

### `siteFooter(opts)`

`brand`, `links`, `linksLabel`, `finePrint`, `variant: 'classroom'`, `assets`.

`brand: 'gateiron'` is GateIron, LLC's company block with the gate. Another
company passes `{ href, name, locality, mark: 'gate' }` or `{ href, name, locality, markHtml }`.
Omit it for none. The links are a `<nav>` named `linksLabel` (default "Footer").

The classroom variant holds the footer at its smallest, for pages a child may be
reading; the links are yours to pass.

### `page(opts)`

A whole document, for sites without their own shell: `title`, `bodyHtml`, `headHtml` (after the
stylesheet, so the site's own CSS wins), `lang` (default `en`), `density: 'compact'`, `bodyClass`,
`darkMode: 'auto'`, `skipLabel`, `footer` (`siteFooter`'s options), plus everything `topBar` takes.
It writes the charset and viewport, links `brand.css` and `menu.js`, puts the skip link first and
the body in `<main id="main" tabindex="-1">`.

It asks of the site: serve `assets/` at `assets.base`; a policy allowing `style-src 'self'`,
`font-src 'self'`, `img-src 'self'` and `script-src 'self'`, plus `img-src https://gateiron.com`,
where GateIron serves every account's picture (`/avatar/<id>`).

A site with its own shell writes `skipLink()` first in `<body>`, then `topBar(...)`, and gives its
main content `id="main"`. `skipLink({ label, target })` defaults to "Skip to content" and `main`.

An option renamed in 0.11.0 (`body`, `head`, `actions`, a raw `mark`, a menu form's `hidden`)
throws, naming its replacement.

### `initials(person)`, `assetUrl(assets, name)`, `esc(value)`

For a site rendering part of the bar itself and wanting the same initials,
addresses and escaping.

## Contact form

The section GateIron.com's `/contactForm` wears: backdrop, heading, the four fields, a hidden field
for bots, optional Cloudflare Turnstile, and a status line. The site keeps its route, its rate
limit, its mail transport and the words it answers with.

```js
const { contactForm, readContact, verifyTurnstile } = require('gateiron-shared/contact');

// the page, at serve time
html = contactForm({
  action: '/contact',
  title: 'What can we do for you?',
  placeholder: 'If requesting custom colors or a quote, please give as much detail as possible.',
  backdrop: '/image/valley.jpg',
  turnstileSiteKey: '...',
});

// the route
const got = readContact(req.body);          // { spam } | { problem } | { fields }
if (got.spam) return res.json({ message: 'Sent.' });
if (got.problem) return res.status(400).json({ error: myWords[got.problem] });
if (!await verifyTurnstile(secret, req.body['cf-turnstile-response'], req.ip)) ...
// send got.fields your own way; answer { message } or { error }
```

```html
<link rel="stylesheet" href="/brand/contact.css">
<script src="/brand/contact.js" defer></script>
```

The options are listed above `contactForm` in `contact.js`; the look is reskinned through the
custom properties listed at the top of `assets/contact.css`. `backdrop` is set as an inline style;
a site whose policy forbids inline styles sets `--gi-contact-backdrop` in its own CSS instead.

## Reskinning

Through custom properties, never by overriding rules. The top of `assets/chrome.css` lists them:
the role tokens (`--bg`, `--text`, `--accent` and the rest), which restyle everything that uses
them, and the per-component ones (`--bar-bg`, `--gi-avatar-bg`, `--gi-footer-bg` and the rest). The
palette (`--paper-*`, `--ink-*`, `--clay-*`, `--pine-*`, `--ochre-*`) is GateIron's: a site changes a
role, not a palette value. `test/contrast.test.js` computes every pairing the stylesheets draw in
both schemes against 4.5:1 for text and 3:1 for a focus ring or a field's edge; a site that
changes a role holds its pairings to the same.

The footer's ground is dark in both schemes, and its gate is the light one.

## Layout

Every GateIron page uses the window it is given. A page that leaves most of a wide window empty
does so because of what it holds, not by default.

- Running text keeps a reading measure: `.prose` and `main.narrow`, `--gi-measure` (42rem).
- Tables, grids, boards and lists of records take the width there is: `main` runs to `--shell`
  (96rem); a page that needs more sets its own `main { max-width: none }`.
- A form is a column of `--gi-form-width` (48rem); `.field-pair` sets fields side by side as it
  widens.
- A dialog or a settings page is as wide as its content needs.

## Bar and footer sizes

The bar's height and the footer's mark follow the window's height: their minimum up to 400px tall,
a straight rise to their standard at 1024px, the standard to 1200px, and a straight rise to their
maximum at 1600px. The three sizes of each and the four heights are tokens at the top of
`chrome.css`, set on `:root` or on the bar or footer. Padding, marks, buttons and the avatar follow
the size; text has rem floors, so browser zoom still enlarges it, and every control keeps a 24px
target.

`page({ density: 'compact' })` (`body.gi-compact`) holds the bar at its minimum, for a page whose
board needs the height. `siteFooter({ variant: 'classroom' })` holds the footer at its minimum.

`--bar-h` is the bar's height, for content sized as `calc(100svh - var(--bar-h))`. It counts the
nav's second row on a narrow screen; a bar whose content wraps further is taller than it says.

## Buttons

`.btn` with `.btn-primary` or `.btn-quiet`, and `.btn-small`, is the button everywhere, chrome and
page; a disabled one is faded and inert. Buttons are solid: `.btn-secondary` draws the same as
`.btn-primary`, and no button is an outline. `brand.css` also makes every bare `<button>` inside
`main` the solid pill, at zero specificity, so any rule of the site's own wins; `.btn` and
`.linkish` opt out. `chrome.css` alone
leaves bare buttons as the browser draws them.

## Tables

A `.table-wrap` scrolls sideways inside its own box. Make it reachable by keyboard:
`<div class="table-wrap" tabindex="0" role="region" aria-label="Requests">`.

## Sign in with Google

`assets/google-signin.svg` is Google's own light pill button, unchanged from Google's
signin-assets. Every GateIron site showing a Google sign-in uses this file, served from the package
(`assetUrl(assets, 'google-signin.svg')`), not a copy of its own.

- Use it only on a control that starts Sign in with Google, with `alt="Sign in with Google"`.
- Never edit, recolour, crop or redraw it. Scale it whole.
- Show it at least as prominently as any other third-party sign-in on the page.
- Another wording or theme Google offers ("Continue with Google", dark, neutral) is a new file from
  Google's signin-assets, added here unchanged.

It is Google's trademark, not MIT; `NOTICE` says so, and Google's branding guidelines
(developers.google.com/identity/branding-guidelines) govern its use.

## Forms

Every GateIron form follows these, whether or not it is a shared component.

- No label says "optional".
- A form with both required and optional fields marks each required label with a red asterisk,
  `<span class="required-mark" aria-hidden="true">*</span>`, and puts
  `<p class="required-note"><span class="required-mark" aria-hidden="true">*</span> Required field</p>`
  directly above the first field. A form whose fields are all required shows neither.
- Each required input carries `required`; that is what a screen reader announces.
- The submit button is disabled, and looks it, until every required field is filled and valid.
- An email address is checked in the browser by the same rule the server applies. A bad one is
  flagged under its field ("Enter a valid email address.") when the person leaves the field, not
  while they type.
- A hint is `class="field-hint"`: a `<span>` inside the label ("(for age-gated content)"), or a
  `<p>` under the field.

- A form that takes more than a moment to answer shows it was sent at once: its button reads what
  it is doing beside a spinner ("Sending Invoice…"; "Processing…" by default) and no button can
  send it twice.
- A pressed button moves down and darkens, so a click is seen before the page answers.

`assets/forms.js` does the browser half: serve it and load it with `defer`, then mark a form
`data-submit-gate` (and `data-msg-email` for other words), and `data-busy` (with `data-busy-label`
on the form or a button for words other than "Processing…"). The server half is the same file:
`require('gateiron-shared/forms').validEmail`. `brand.css` styles the marks, the hint and the error,
which is announced to a screen reader when it appears. `contactForm()` follows these rules.

## Where a sign-in returns to

Every site that takes a `returnTo` (or any address to send the browser to after a sign-in) passes it
through `safeReturnTo`, on the server and in a page, and through nothing else. It gives back a path
on the site, re-serialised, or `'/'` (or the second argument) for anything that could reach another
host: a backslash, a tab or newline, `/.//host`, a scheme. A site does not write its own check.

```js
const { safeReturnTo } = require('gateiron-shared/returnTo');   // or: import { safeReturnTo } from 'gateiron-shared/returnTo'
res.redirect(safeReturnTo(req.query.returnTo));
```

In a page, serve `assets/returnTo.js` and call `GateIronReturnTo.safeReturnTo(value)`.

## Rules for a shared component

Every component here meets these; the tests check escaping, the chrome's scoping, contrast and the
absence of inline script.

1. **Plain data in, escaped HTML out.** No request object. Raw HTML only through an option whose
   name ends in `Html`.
2. **Its CSS cannot restyle the page it lands in.** Every selector names the component's own
   classes, and they start with `gi-`. No element, universal or `:root` rule outside the tokens.
   `.btn` and `brand.css`'s page vocabulary predate the prefix.
3. **No inline script and no inline handler.** Behaviour is an asset loaded with `defer`,
   configured by `data-` attributes.
4. **Every word a user reads is an option,** with GateIron's words as the default.
5. **Reskinned through custom properties,** listed at the top of its stylesheet with GateIron's
   values as the defaults, rather than by overriding its rules.
6. **Accessible:** every control labelled, results announced in a live region, focus visible,
   usable by keyboard alone.
7. **A server-side part only checks what the component submits.** Transport, storage, rate limits
   and authentication stay with the site.

## Constraints

**GateIron has no build step and uses `require()`.** Plain files, CommonJS, no
compile. `eslint` is a dev dependency for the lint's own tests; a site brings its own. The `module.exports` object is statically analysable, so ESM consumers
get named imports.

**GateIron builds its chrome by string substitution at serve time, with no
request in scope.** The functions take plain data — never an Express `req`.

**GateIron's CSP sets `script-src-attr 'none'` and forbids inline `<script>`.**
Nothing here emits either. The account menu is a `<details>` element.
`menu.js`, `account.js` and `contact.js` are files served beside the stylesheets, so a site's
policy needs `script-src 'self'`; with `default-src 'none'` and no `script-src`
they are blocked silently and the menu stays open on an outside click.

**Game pages hold the bar at its minimum.** `body.gi-compact`, or
`page({ density: 'compact' })`.

**No asset address is hard-coded.** `assetUrl({ base, version }, name)` builds
them all from the base and version the site passes.

**GateIron fills the account slot client-side from `/api/me`; NotUserError
renders it server-side.** Both draw it with the same code (`account.js`).

**Districts and classrooms allow-list domains, and children's browsers should
not reach third parties.** Fraunces and Hanken Grotesk are in `assets/fonts`
under the SIL Open Font License 1.1, with both licence texts; neither declares a
Reserved Font Name, so the Latin subsets keep their names. Nothing the package
serves fetches from another origin. The one cross-origin request is the
sign-in's picture when a site passes `avatarSrc`, sent without a referrer.

**Colour is never the only carrier of meaning.** Badges state their value in
words; the priority ramp is ordered by weight as well as hue. A skip link
precedes the bar, the active nav item carries `aria-current`, and focus is
visible.

**Every interpolated value is escaped.** Passing a user's name into the bar is
safe.

## What belongs here

The presentation layer: colour, type, spacing, the bar, the footer, buttons,
forms, tables, badges, notices, dialogs, and the helpers those need. And what
the bar's account menu stands on, which every site must do alike: one account
per tab (`tabs`, both halves) and its lint (`eslint`).

Not here:

- **A product's vocabulary.** NotUserError maps ticket statuses to badge tones
  in its own `src/ui.js`. This package knows badges; it does not know what
  "Waiting" means.
- **Any school-, district- or class-specific value.**
- **Anything requiring a build step.**
- **Business logic, database helpers, auth, date maths,** except the two checks a sign-in page
  shares with its server, `validEmail` and `safeReturnTo`, and the tab rules above, which hold no
  accounts and read no database: where accounts are kept stays each site's. A second kind of
  shared code gets a second package, so a site can upgrade one without taking
  the others. A component's check of its own fields (`readContact`) is part of
  the component; sending, storing and throttling are not.

## Versioning

Semver; the tag is the contract. Changing a token's value is a minor. Removing
a token, renaming a class, or changing what a function returns is a major;
before 1.0 it is a minor marked **Breaking** in the changelog.
`CHANGELOG.md` carries the release notes.

## License

MIT for the code and its documentation. `NOTICE` says what it does not cover:
GateIron's names and marks wherever they appear, Google's sign-in button, and
any file carrying its own licence or none. Fraunces and Hanken Grotesk ship under the SIL Open Font
License 1.1; both licence texts are in `assets/fonts`.
