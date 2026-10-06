# Changelog

Semver. Changing a token's value is a minor. Removing a token, renaming a
class, or changing what a function returns is a major.

## 0.13.0 — 2026-10-05

**Breaking.** `.error` is gone, and the bar and the footer change size with the window's height.

- `.error` is removed; it drew the same box as `.notice notice-error`, which replaces it.
- The bar's height and the footer's mark follow the window's height in straight lines with no
  steps: minimum up to 400px tall, standard from 1024px to 1200px, maximum from 1600px. Bar
  2.5rem / 3.75rem / 4.5rem, footer mark 1.5rem / 2.25rem / 2.75rem; padding, the marks, the
  avatar and buttons in the bar follow, and text keeps rem floors. Tokens `--gi-bar-size-min`,
  `-std`, `-max`, `--gi-footer-size-min`, `-std`, `-max` and the heights `--gi-scale-min-at`,
  `--gi-scale-std-from`, `--gi-scale-std-to`, `--gi-scale-max-at` (README, Bar and footer sizes).
- `--bar-h` is now the bar's height as drawn, nav row included on a narrow screen, for
  `calc(100svh - var(--bar-h))`. It was the bar's minimum height; setting it no longer sizes the bar.
- `gi-compact` holds the bar at its minimum and the classroom footer holds the footer at its
  minimum, in place of their own fixed sizes. `gi-compact` no longer shrinks the footer's mark.
- Wider measures (README, Layout): `main` runs to `--shell`, now 96rem (was 1140px), and a form to
  `--gi-form-width`, 48rem (was 36rem). `.prose` and `main.narrow` stay at 42rem, now
  `--gi-measure`. Running text outside `.prose` runs the page's width.

## 0.12.1 — 2026-10-05

- The contact form's email field turns `--urgent` when `forms.js` flags it; `contact.css`'s field
  rule had outranked `brand.css`'s.

## 0.12.0 — 2026-10-05

The form rules (README, Forms) are in the package. Nothing a site uses changes; GateIron.com's own
copies retire.

- `assets/forms.js`, one file for both sides: in a page, a form marked `data-submit-gate` keeps its
  submit disabled until every required field is valid, and a bad email address is flagged when its
  field is left, in a live region a screen reader announces. On the server,
  `require('gateiron-shared/forms').validEmail` is the same rule (254 characters at most).
- `brand.css` styles `.required-mark`, `.required-note`, `.field-error`, an `aria-invalid` field and
  a `.field-hint` inside a label, all from `--urgent` and `--text-muted`. `.label-hint` is not a
  class here: a hint is `.field-hint`.
- `contactForm()` marks its form `data-submit-gate`, and `readContact()` checks the address with
  `validEmail`. The contact form's Send stays disabled until its fields are valid when the page
  loads `forms.js`, and again after a message is sent.

## 0.11.0 — 2026-10-05

**Breaking.** Every chrome class is renamed to a `gi-` name, raw-HTML options end in `Html`, and
the accent and muted text are darker. A site upgrading changes the names below; an old option name
throws, naming its replacement.

| was | is |
|---|---|
| `skip-link` | `gi-skip-link` (or call `skipLink()`) |
| `topbar` | `gi-bar` |
| `topbar-inner` | `gi-bar-inner` |
| `topbar-spacer` | `gi-bar-spacer` |
| `brand` (bar and footer) | `gi-brand` |
| `wordmark` | `gi-wordmark` |
| `topnav` | `gi-nav` |
| `gate` (the gate's `<img>`) | no class |
| `account-slot` | `gi-account-slot` |
| `account` (`<details>`) | `gi-account` |
| `account is-accent` | `gi-account gi-accent` |
| `who` | `gi-account-who` |
| `role` | `gi-account-role` |
| `avatar` | `gi-avatar` |
| `avatar is-accent` | `gi-avatar gi-accent` |
| `avatar has-img` | `gi-avatar gi-avatar-img` |
| `account-menu` | `gi-account-menu` |
| `meta` (in the menu) | `gi-account-meta` |
| `site-footer` | `gi-footer` |
| `site-footer is-classroom` | `gi-footer gi-footer-classroom` |
| `inner` (in the footer) | `gi-footer-inner` |
| `grid` (in the footer) | `gi-footer-grid` |
| `footer-links` (a `<div>`) | `gi-footer-links` (a `<nav aria-label="Footer">`) |
| `fine-print` | `gi-fine-print` |
| `topBar({ actions })`, `page({ actions })` | `actionsHtml` |
| `topBar({ mark: '<svg…>' })`, footer `brand.mark` raw | `markHtml` (`mark: 'gate'` is unchanged) |
| `page({ body, head })` | `bodyHtml`, `headHtml` |
| menu `form: { hidden }` | `form: { hiddenHtml }` |
| `nav.label` | `navLabel` |

- `assets/account.js` draws the account chip. `chrome.js` renders with it on the server, and a page
  filling the slot after load calls `GateIronChrome.fillAccount(slot, { account } | { signIn })`
  instead of building the markup itself. A menu entry `{ label, button }` is a
  `<button data-gi-action>` the page binds; an entry with the `hidden` attribute stays hidden.
- The account chip has no `aria-label`: a screen reader hears its name and role, then "Account
  menu" (`account.menuLabel`). On a narrow screen the name is hidden from sight, not from the
  reader.
- `menu.js`: ArrowDown and ArrowUp open the menu from the chip and move through it, Home and End
  jump to the ends, and Tab leaving it closes it. Escape returns focus to the chip only from inside
  the menu.
- A bar with a mark and no product name labels its home link (`homeLabel`, default "Home").
- `skipLink({ label, target })`; `page({ skipLabel })`.
- `page({ density: 'compact', bodyClass })` keeps both classes; before, `bodyClass` was dropped.
- Contrast, computed in both schemes by `test/contrast.test.js`: `--accent` is `--clay-dark` and
  `--accent-hover` `--clay-darker` (clay was 4.0:1 as a link and 4.4:1 under white);
  `--ink-lighter`, so `--text-muted`, is `#6b6255` (was 3.9:1 on `--surface-2`); the accented
  avatar is `--clay-dark`; the footer's locality and fine print are 62% cream (were 50% and 45%).
- `--field-border` (default `--text-muted`) edges inputs, selects and textareas in `brand.css`; the
  old edge was 1.8:1.
- The footer is reskinned through `--gi-footer-bg`, `-text`, `-strong`, `-muted` and `-rule`, the
  initials through `--gi-avatar-bg`, `--gi-avatar-accent-bg` and `--gi-avatar-text`; the top of
  `chrome.css` lists every token a site may set.
- `brand.css`'s bare-button and form-submit rules are at zero specificity, so a site's own button
  rule wins without outranking them. A disabled `.btn` or bare button is faded and inert.
- `assets/google-signin.svg`: Google's light pill "Sign in with Google" button, unchanged, under
  Google's terms (`NOTICE`, README).
- The company block's link reads `https://GateIron.com`.

## 0.10.0 — 2026-09-26

- The top bar and the footer span the whole window (28px side padding), so the logo and the
  account menu sit at the window's edges on a wide screen instead of 1140px apart in the middle.
  `--bar-max` restores a cap (`--bar-max: var(--shell)` aligns them with the content column).
  Narrower than about 1200px nothing moves.

## 0.9.1 — 2026-09-25

- The bar and footer set their own text alignment and zero their images' margins, so a page that
  centres its body text or images (Not Hangman) no longer moves them. GateIron.com renders the
  same.

## 0.9.0 — 2026-09-25

- The contact form is a component: `require('gateiron-shared/contact')` gives `contactForm(opts)`
  (the section as HTML), `readContact(body)` (spam, incomplete, too long, or clean fields) and
  `verifyTurnstile(secret, token, ip)`. `assets/contact.css` is scoped to `.gi-contact` and
  reskinned through custom properties; `assets/contact.js` sends in the background, shows the
  answer and keeps a draft. GateIron.com renders it exactly as its own page did.
- README: the rules every shared component meets.

## 0.8.0 — 2026-09-25

- `assets/chrome.css`: the tokens, faces, top bar, account menu, `.btn`, footer and compact rules,
  every rule scoped to a chrome class, for a page with its own layout. `brand.css` imports it
  (versioned) and keeps the element rules, so a page that loads `brand.css` renders as before.
- Generic chrome names (`.brand`, `.account`, `.avatar`, `.topnav`) match only inside the bar or
  the footer, through `:where()`, so their specificity is unchanged.

## 0.7.0 — 2026-09-25

- `assets/menu.js` closes an open account menu on a click outside it or Escape, and returns focus
  to its summary. `page()` includes it; a site with its own shell adds the script tag (README).

## 0.6.0 — 2026-09-24

- `siteFooter` with no `brand`, no `links` and no `finePrint` returns an empty
  string, and with only fine print it draws no empty grid. Before, a site that
  upgraded to 0.5.0 without passing `brand` could get a blank page-wide band
  and not notice. `page()` with no `footer` therefore draws no footer.

## 0.5.0 — 2026-09-24

**Breaking.** Nothing of GateIron's renders unless a site asks for it. The
names and the mark are GateIron, LLC's trademarks and are not under MIT, so
installing the package must not put them on someone else's page.

- `topBar` shows no mark unless passed one; `mark: 'gate'` is GateIron's. With
  no `product` there is no wordmark, and with neither there is no brand link.
- `siteFooter` shows no company block unless passed `brand`. `brand: 'gateiron'`
  is GateIron's; an object `{ href, name, locality, mark }` is anyone's, and
  shows the gate only if its `mark` is `'gate'`.

## 0.4.0 — 2026-09-20

- The line under the name in the account chip is a `<span class="role">`, and
  `account.accent` now puts `.is-accent` on the chip as well as the avatar, so
  an unusual way of being signed in is visible rather than inferred.

## 0.3.0 — 2026-09-20

- The bar wears GateIron.com's own translucent paper tone over a blur, not a
  flat surface colour. `--bar-bg` overrides it.
- The footer is pinned to the end of the page: `body` is a flex column,
  `main` grows, so a short page still ends with the footer at the bottom of
  the window and a long one pushes it below the fold.
- `h1` is 2rem, and `.subtitle` is the large secondary line under it.
- `.field-pair` puts two fields on one line and drops to one when narrow.

## 0.2.0 — 2026-09-20

**Breaking.** The dark theme is now opt-in, the bar and footer changed shape,
and a site that is not GateIron.com must say so.

- `topBar({ mark })` — raw HTML for the product's own mark, `'gate'` for
  GateIron's, `null` for none. Defaults to `'gate'`, so GateIron needs no
  argument and every other site must pass one.
- `siteFooter` now renders GateIron's own footer: the company block with the
  light mark, name and locality on the left, links on the right, fine print
  under a rule. `brand` overrides it, `brand: null` omits it. `byline` is gone;
  `finePrint` takes an array.
- Light unless asked. `page({ darkMode: 'auto' })` adds `.gi-dark-auto` to
  `<html>` and honours the system preference. Anything relying on dark by
  default loses it.
- Bar and footer metrics are GateIron's: 1140px shell, 28px gutters, 40px mark,
  39px avatar, 14px bar padding.

## 0.1.1 — 2026-09-20

Editorial pass over every comment and document in the repository.

## 0.1.0 — 2026-09-20

First release, extracted from NotUserError.

- Palette (paper, ink, clay, pine, ochre), light and dark.
- Fraunces and Hanken Grotesk, self-hosted, with their OFL texts.
- `topBar`, `siteFooter`, `page`, `initials`, `assetUrl`, `esc`.
- Buttons, forms, cards, notices, tables, status and priority badges, the
  account menu.
- Two densities: the default and `gi-compact`.
- Classroom footer variant.

Changed from the NotUserError original:

- Functions take plain data, never an Express `req`.
- CommonJS, with a statically analysable `module.exports`.
- `avatar.is-admin` became `avatar.is-accent`. A role is the consumer's
  vocabulary.
- The stylesheet moved in beside the fonts it references, so one static mount
  serves the package.
