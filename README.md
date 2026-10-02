# GateIron Shared

The presentation layer GateIron's sites share: palette, type, the gate mark,
the top bar, the footer, and the components pages are built from — buttons,
forms, tables, badges, notices, the account menu.

## Install

```bash
npm install --allow-git=all github:HumanJHawkins/GateIron-Shared#v0.10.0
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

`brand.css` styles the whole page: body, headings, links, bare buttons, form fields, tables. A page
that has its own look (a game board, an editor) loads `chrome.css` instead. It carries only the
tokens, the two faces, the bar, the account menu, `.btn`, the footer and the compact rules, each
scoped to its own class, so nothing outside them changes.

```html
<link rel="stylesheet" href="/brand/chrome.css?v=0.10.0">
```

## Close the account menu on an outside click or Escape

`page()` includes `menu.js`. A site with its own shell adds it once:

```html
<script src="/brand/menu.js" defer></script>
```

## API

Plain data in, HTML strings out.

```js
const { page, topBar, siteFooter, initials, assetUrl, esc } = require('gateiron-shared');
```

### `topBar(opts)`

| option | meaning |
|---|---|
| `home` | where the mark and wordmark link |
| `product` | the name in the bar |
| `mark` | raw HTML for the site's own mark, or `'gate'` for GateIron's; omit for none |
| `context` | the smaller line beneath it — a district, a class |
| `nav` | `[{ href, label, current?, external? }]` |
| `account` | `{ name, email, role?, avatarSrc?, accent?, menu }`, or omit |
| `signIn` | `{ href, label }` for the signed-out state |
| `actions` | HTML placed before the account chip, for the site's own buttons |
| `assets` | `{ base, version }` |

A menu entry is `{ href, label }`, or
`{ label, form: { action, method, hidden } }` for anything that changes state —
sign-out is a POST, not a link a prefetcher can follow.

Omitting both `account` and `signIn` emits `<span class="account-slot"></span>`
for a client script to fill after load. Pass `accountSlot: false` to leave
nothing.

Avatars are initials by default. Pass `avatarSrc` for a picture; on a signed-in
page that is a third-party request on every load.

### `siteFooter(opts)`

`brand`, `links`, `finePrint`, `variant: 'classroom'`, `assets`.

`brand: 'gateiron'` is GateIron, LLC's company block with the gate. Another
company passes `{ href, name, locality, mark }`. Omit it for none.

The classroom variant is the quieter footer for pages a child may be reading.
It sets the class; the links are yours to pass.

### `page(opts)`

A whole document: `title`, `body`, `head`, `lang`, `density`, `bodyClass`,
`footer`, plus everything `topBar` takes. For sites without their own shell.
GateIron has one — it should call `topBar` and `siteFooter` into it.

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

## Rules for a shared component

Every component here meets these; `test/chrome.test.js` checks escaping, the chrome's scoping and
the absence of inline script.

1. **Plain data in, escaped HTML out.** No request object. Raw HTML only through an option whose
   name ends in `Html`.
2. **Its CSS cannot restyle the page it lands in.** Every selector names the component's own
   classes; a new component's classes start with `gi-`. No element, universal or `:root` rule
   outside the tokens.
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
compile. The `module.exports` object is statically analysable, so ESM consumers
get named imports.

**GateIron builds its chrome by string substitution at serve time, with no
request in scope.** The functions take plain data — never an Express `req`.

**GateIron's CSP sets `script-src-attr 'none'` and forbids inline `<script>`.**
Nothing here emits either. The account menu is a `<details>` element.
`menu.js` and `contact.js` are files served beside the stylesheets, so a site's
policy needs `script-src 'self'`; with `default-src 'none'` and no `script-src`
they are blocked silently and the menu stays open on an outside click.

**Game pages tighten the bar.** `body.gi-compact`, or
`page({ density: 'compact' })`.

**No asset address is hard-coded.** `assetUrl({ base, version }, name)` builds
them all from the base and version the site passes.

**GateIron fills the account slot client-side from `/api/me`; NotUserError
renders it server-side.** Both work.

**Districts and classrooms allow-list domains, and children's browsers should
not reach third parties.** Fraunces and Hanken Grotesk are in `assets/fonts`
under the SIL Open Font License 1.1, with both licence texts. Nothing here
fetches from another origin.

**Colour is never the only carrier of meaning.** Badges state their value in
words; the priority ramp is ordered by weight as well as hue. A skip link
precedes the bar, the active nav item carries `aria-current`, and focus is
visible.

**Every interpolated value is escaped.** Passing a user's name into the bar is
safe.

## What belongs here

The presentation layer, and nothing else: colour, type, spacing, the bar, the
footer, buttons, forms, tables, badges, notices, dialogs, and the helpers those
need.

Not here:

- **A product's vocabulary.** NotUserError maps ticket statuses to badge tones
  in its own `src/ui.js`. This package knows badges; it does not know what
  "Waiting" means.
- **Any school-, district- or class-specific value.**
- **Anything requiring a build step.**
- **Business logic, database helpers, auth, date maths.** A second kind of
  shared code gets a second package, so a site can upgrade one without taking
  the others. A component's check of its own fields (`readContact`) is part of
  the component; sending, storing and throttling are not.

## Versioning

Semver; the tag is the contract. Changing a token's value is a minor. Removing
a token, renaming a class, or changing what a function returns is a major.
`CHANGELOG.md` carries the release notes.

## License

MIT for the code and its documentation. `NOTICE` says what it does not cover:
GateIron's names and marks wherever they appear, and any file carrying its own
licence or none. Fraunces and Hanken Grotesk ship under the SIL Open Font
License 1.1; both licence texts are in `assets/fonts`.
