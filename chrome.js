'use strict';
// The bar, the footer, and the document around them, as strings.
//
// Nothing here may touch a request object. GateIron substitutes its chrome into
// static HTML at serve time, with no request in scope.

const { esc, initials, accountHtml } = require('./assets/account.js');

// Consumers serve the files from their own path and stamp their own cache
// marker, so no address is hard-coded.
function assetUrl(assets, name) {
  const base = String((assets && assets.base) || '/brand').replace(/\/+$/, '');
  const v = assets && assets.version;
  return base + '/' + name + (v ? '?v=' + encodeURIComponent(v) : '');
}

// An option renamed in 0.11.0 fails loudly rather than rendering nothing.
function refuseRenamed(o, where, names) {
  for (const old of Object.keys(names)) {
    if (o[old] !== undefined) { throw new Error('gateiron-shared: ' + where + ' takes ' + names[old] + ' since 0.11.0, not ' + old); }
  }
  if (typeof o.mark === 'string' && o.mark !== 'gate') {
    throw new Error('gateiron-shared: ' + where + ' takes markHtml for its own mark since 0.11.0; mark is only \'gate\'');
  }
}

/**
 * The GateIron gate, in the tone that shows on the given ground.
 * `alt` is empty - the wordmark beside it already names the company.
 */
function gateMark(assets, tone) {
  const file = tone === 'light' ? 'gate-light.png' : 'gate-dark.png';
  return '<img src="' + esc(assetUrl(assets, file)) + '" alt="" width="148" height="96">';
}

/**
 * The image beside a wordmark: `mark: 'gate'` for GateIron's own, or `markHtml`, an <img> or inline
 * <svg> the site supplies. Nothing by default: the gate is GateIron, LLC's trademark, so a site has
 * to ask for it by name.
 */
function productMark(o, assets, tone) {
  if (o.mark === 'gate') return gateMark(assets, tone);
  return o.markHtml ? String(o.markHtml) : '';
}

// The company block a GateIron site's footer asks for with `brand: 'gateiron'`.
const GATEIRON = {
  href: 'https://GateIron.com', name: 'GateIron, LLC', locality: 'Hood River, Oregon', mark: 'gate',
};

function navHtml(o) {
  if (!o.nav || !o.nav.length) return '';
  const items = o.nav.map((item) => {
    const current = item.current ? ' aria-current="page"' : '';
    const rel = item.external ? ' target="_blank" rel="noopener"' : '';
    return '<a href="' + esc(item.href) + '"' + current + rel + '>' + esc(item.label) + '</a>';
  }).join('');
  return '<nav class="gi-nav" aria-label="' + esc(o.navLabel || 'Sections') + '">' + items + '</nav>';
}

/** The skip link. It comes before the bar, so it is the first thing a Tab press reaches. */
function skipLink(opts) {
  const o = opts || {};
  return '<a class="gi-skip-link" href="#' + esc(o.target || 'main') + '">' + esc(o.label || 'Skip to content') + '</a>';
}

/**
 * `context` is the smaller line under the product name - a district, a class. A mark with no
 * product name is labelled `homeLabel`.
 */
function topBar(opts) {
  const o = opts || {};
  refuseRenamed(o, 'topBar', { actions: 'actionsHtml' });
  const context = o.context ? '<small>' + esc(o.context) + '</small>' : '';
  const mark = productMark(o, o.assets, 'dark');
  const wordmark = o.product ? '<span class="gi-wordmark">' + esc(o.product) + context + '</span>' : '';
  const label = wordmark ? '' : ' aria-label="' + esc(o.homeLabel || 'Home') + '"';
  return '<header class="gi-bar">'
    + '<div class="gi-bar-inner">'
    + (mark || wordmark ? '<a class="gi-brand" href="' + esc(o.home || '/') + '"' + label + '>' + mark + wordmark + '</a>' : '')
    + navHtml(o)
    + '<span class="gi-bar-spacer"></span>'
    + (o.actionsHtml || '')
    + accountHtml(o)
    + '</div>'
    + '</header>';
}

/**
 * The company block on the left, links on the right, fine print underneath.
 * `brand: 'gateiron'` is GateIron's own block, so the bottom of a GateIron
 * product's page says GateIron even where the top says the product. Another
 * company passes `{ href, name, locality, mark: 'gate' | markHtml }`. Omitted, there is none.
 *
 * `variant: 'classroom'` is the quieter footer for pages a child may be
 * reading. It sets the class; the links are still passed in.
 *
 * With no brand, no links and no fine print it returns an empty string.
 */
function siteFooter(opts) {
  const o = opts || {};
  const b = o.brand === 'gateiron' ? GATEIRON : o.brand;
  if (b && typeof b === 'object') { refuseRenamed(b, 'siteFooter brand', {}); }
  const brand = !b ? '' : '<a class="gi-brand" href="' + esc(b.href || '/') + '">'
    + productMark(b, o.assets, 'light')
    + '<span class="gi-wordmark">' + esc(b.name)
    + (b.locality ? '<small>' + esc(b.locality) + '</small>' : '') + '</span></a>';
  const links = (o.links || []).map((l) => {
    const rel = l.external ? ' target="_blank" rel="noopener"' : '';
    return '<a href="' + esc(l.href) + '"' + rel + '>' + esc(l.label) + '</a>';
  }).join('');
  const fine = (o.finePrint || []).map((t) => '<span>' + esc(t) + '</span>').join('');
  // Nothing to show is no footer, not an empty band a site would not notice.
  if (!brand && !links && !fine) { return ''; }
  const nav = links ? '<nav class="gi-footer-links" aria-label="' + esc(o.linksLabel || 'Footer') + '">' + links + '</nav>' : '';
  return '<footer class="gi-footer' + (o.variant === 'classroom' ? ' gi-footer-classroom' : '') + '">'
    + '<div class="gi-footer-inner">'
    + (brand || nav ? '<div class="gi-footer-grid">' + brand + nav + '</div>' : '')
    + (fine ? '<div class="gi-fine-print">' + fine + '</div>' : '')
    + '</div>'
    + '</footer>';
}

/** A whole document. Sites with their own shell use skipLink, topBar and siteFooter. */
function page(opts) {
  const o = opts || {};
  refuseRenamed(o, 'page', { body: 'bodyHtml', head: 'headHtml', actions: 'actionsHtml' });
  const classes = [o.density === 'compact' ? 'gi-compact' : '', o.bodyClass || ''].filter(Boolean).join(' ');
  // Light unless the page asks. A product whose users arrive worried - a help
  // desk, a classroom - reads better bright, and GateIron has only ever had
  // paper, so honouring the system preference is opt-in.
  const rootClass = o.darkMode === 'auto' ? ' class="gi-dark-auto"' : '';
  return '<!doctype html>\n<html lang="' + esc(o.lang || 'en') + '"' + rootClass + '>\n<head>\n'
    + '<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<title>' + esc(o.title) + '</title>\n'
    + '<link rel="stylesheet" href="' + esc(assetUrl(o.assets, 'brand.css')) + '">\n'
    + '<script src="' + esc(assetUrl(o.assets, 'menu.js')) + '" defer></script>\n'
    + (o.headHtml || '')
    + '</head>\n<body' + (classes ? ' class="' + esc(classes) + '"' : '') + '>\n'
    + skipLink({ label: o.skipLabel })
    + '\n' + topBar(o)
    + '\n<main id="main" tabindex="-1">\n' + (o.bodyHtml || '') + '\n</main>\n'
    + siteFooter(o.footer || { assets: o.assets })
    + '\n</body>\n</html>';
}

// Keep every value below a bare identifier. Node reads this object statically
// to find a CommonJS module's named exports, and a call expression here makes
// the package default-only for ESM consumers.
const VERSION = require('./package.json').version;

module.exports = {
  VERSION,
  esc,
  assetUrl,
  initials,
  gateMark,
  skipLink,
  topBar,
  siteFooter,
  page,
};
