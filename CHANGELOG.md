# Changelog

Semver. Changing a token's value is a minor. Removing a token, renaming a
class, or changing what a function returns is a major.

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
