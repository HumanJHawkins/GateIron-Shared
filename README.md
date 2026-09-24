# GateIron Shared

The presentation layer GateIron's sites share: palette, type, the gate mark,
the top bar, the footer, and the components pages are built from — buttons,
forms, tables, badges, notices, the account menu.

## Install

```bash
npm install --allow-git=all github:HumanJHawkins/GateIron-Shared#v0.5.0
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

## Constraints

What the consuming sites need, and what this package does about it.

**GateIron has no build step and uses `require()`.** Plain files, CommonJS, no
compile. The `module.exports` object is statically analysable, so ESM consumers
get named imports.

**GateIron builds its chrome by string substitution at serve time, with no
request in scope.** The functions take plain data — never an Express `req`.

**GateIron's CSP sets `script-src-attr 'none'` and forbids inline `<script>`.**
Nothing here emits either. The account menu is a `<details>` element.

**Game pages tighten the bar.** `body.gi-compact`, or
`page({ density: 'compact' })`.

**GateIron stamps its own build marker on every asset and serves images through
a CDN.** No address is hard-coded; `assetUrl({ base, version }, name)` builds
them all.

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
  the others.

## Versioning

Semver; the tag is the contract. Changing a token's value is a minor. Removing
a token, renaming a class, or changing what a function returns is a major.
`CHANGELOG.md` carries the release notes.

## License

MIT for the code and its documentation. `NOTICE` says what it does not cover:
GateIron's names and marks wherever they appear, and any file carrying its own
licence or none. Fraunces and Hanken Grotesk ship under the SIL Open Font
License 1.1; both licence texts are in `assets/fonts`.
