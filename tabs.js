'use strict';
// ONE ACCOUNT PER TAB, the server half (the browser half is assets/tabs.js; GateIron.com docs/SIGN-IN-FOR-PRODUCTS.md,
// "Several accounts on one browser"). Plain functions over an Express request: which account a request names, and
// whether it is served as that account, as the browser's default or signed out. Where the accounts are kept, how many,
// and what a sign-in or sign-out writes stay each site's own.
//
// A tab names its account by the path, /u/<key>/... (pathTab), and each page's <base href> makes every relative
// address it uses carry it. The `au` parameter, the site's header and the Referer are read too, for sites still on
// them and for tabs opened before a site moved.

const KEY = /^[A-Za-z0-9_-]{6,16}$/;
const GONE_MAX = 12;
const PREFIX = /^\/u\/([A-Za-z0-9_-]{6,16})(?=[/?#]|$)/;

const keyIn = (v, pattern = KEY) => (pattern.test(String(v == null ? '' : v)) ? String(v) : null);

/** `url` without its /u/<key> prefix, and the key it named. */
function stripPath(url) {
  const m = PREFIX.exec(String(url));
  if (!m) { return { url, key: null }; }
  const rest = url.slice(m[0].length);
  return { url: rest.startsWith('/') ? rest : `/${rest}`, key: m[1] };
}

/** `to`, a path on this site, under the account `key`'s prefix, or under none with no key; any other address as it is. */
function withPath(to, key, param = 'au', pattern = KEY) {
  if (typeof to !== 'string' || !to.startsWith('/') || to.startsWith('//') || to.startsWith('/\\')) { return to; }
  const bare = stripParam(stripPath(to).url, param, pattern).url;
  return key ? `/u/${key}${bare}` : bare;
}

/**
 * Express middleware, first in the app (opts.bare: addresses that never carry a tab, such as a mail link's or a
 * provider's callback): takes a /u/<key> prefix off the request before any route sees it (req.url and
 * req.originalUrl; the key is req.tabPath), keeps it on every same-origin redirect (res.tabKeep, set by keepPath, takes
 * its place), and starts every HTML page's head with <base href="/u/<key>/">, or "/", so the page's relative addresses
 * carry the tab's account. A site writes its page, form and API addresses relative ("shop/cart"); static files stay
 * absolute ("/css/site.css").
 */
function pathTab(opts = {}) {
  // bare: addresses no tab names, served and redirected without a prefix: [prefix string or RegExp].
  const bare = (p) => (opts.bare || []).some((b) => (b instanceof RegExp ? b.test(p) : p.startsWith(b)));
  return (req, res, next) => {
    const s = stripPath(String(req.url || ''));
    req.tabPath = bare(s.url) ? null : s.key;
    if (s.key) {
      req.url = s.url;
      req.originalUrl = stripPath(String(req.originalUrl || '')).url;
    }
    const redirect = res.redirect.bind(res);
    res.redirect = (a, b) => {
      const [status, to] = typeof a === 'number' ? [a, b] : [302, a];
      const keep = res.tabKeep === undefined ? req.tabPath : typeof res.tabKeep === 'function' ? res.tabKeep(to) : res.tabKeep;
      return redirect(status, withPath(to, typeof to === 'string' && bare(to) ? null : keep));
    };
    const send = res.send.bind(res);
    res.send = function sendWithBase(body) {
      if (typeof body === 'string' && /html/.test(String(res.get('Content-Type') || '')) && !/<base\s/i.test(body)) {
        const base = `<base href="${req.tabPath ? `/u/${req.tabPath}/` : '/'}">`;
        body = body.replace(/<head(\s[^>]*)?>/i, (h) => `${h}\n${base}`);
      }
      return send(body);
    };
    next();
  };
}

/** Every same-origin redirect of this answer goes under the key `keep` gives: a value, or a function of the target. */
function keepPath(res, keep) { res.tabKeep = keep; }

/**
 * The prefix a page of this tab belongs under: its key while the browser holds more than one account or the tab is not
 * the default's, else none. tab: readTab's answer.
 */
function pathFor(tab, keys, def) {
  const k = tab && tab.keep;
  return k && (keys.length > 1 || k !== def) ? k : null;
}

/** `url` without `param`, and the key it named. */
function stripParam(url, param = 'au', pattern = KEY) {
  const q = url.indexOf('?');
  if (q < 0) { return { url, key: null }; }
  const hash = url.indexOf('#', q);
  const query = hash < 0 ? url.slice(q + 1) : url.slice(q + 1, hash);
  let key = null;
  const rest = query.split('&').filter((p) => {
    if (p !== param && !p.startsWith(`${param}=`)) { return true; }
    if (key === null) { key = keyIn(decodeURIComponent(p.slice(param.length + 1)), pattern); }
    return false;
  });
  const frag = hash < 0 ? '' : url.slice(hash);
  return { url: url.slice(0, q) + (rest.length ? `?${rest.join('&')}` : '') + frag, key };
}

/** `to`, a path on this site, naming the account `key`, or naming none with no key; any other address as it is. */
function withParam(to, key, param = 'au', pattern = KEY) {
  if (typeof to !== 'string' || !to.startsWith('/') || to.startsWith('//') || to.startsWith('/\\')) { return to; }
  const bare = stripParam(to, param, pattern).url;
  if (!key) { return bare; }
  const hash = bare.indexOf('#');
  const [path, frag] = hash < 0 ? [bare, ''] : [bare.slice(0, hash), bare.slice(hash)];
  return `${path}${path.includes('?') ? '&' : '?'}${param}=${encodeURIComponent(key)}${frag}`;
}

/** The keys a readable list cookie holds, under `name` or `__Host-name`. */
function readList(req, name, pattern = KEY) {
  for (const part of String((req.headers && req.headers.cookie) || '').split(';')) {
    const i = part.indexOf('=');
    const n = i > 0 ? part.slice(0, i).trim() : '';
    if (n === name || n === `__Host-${name}`) {
      try { return decodeURIComponent(part.slice(i + 1).trim()).split('.').filter((k) => pattern.test(k)); } catch { return []; }
    }
  }
  return [];
}

/** The cookie name a site writes: `__Host-` where the cookie is secure. */
const cookieName = (name, secure) => (secure ? `__Host-${name}` : name);

/**
 * Which account this request is for. Takes `param` out of req.url first, so no route, page or redirect built from
 * req.url or req.query carries it twice.
 *
 * opts: header (the site's, e.g. 'X-NH-Account'), keys (the keys signed in on this browser, the default first), gone
 * (the keys signed out here, by this browser or by the server), default (keys[0]; null where a tab naming none is
 * signed out), param ('au'), pattern, origin (this site's, for the Referer; default the request's own).
 *
 * Returns { asked, source, key, signedOut, keep, background }:
 * - asked: the key the request names, by `source` 'path', 'param', 'header' or 'referer', or null.
 * - key: the account to serve: asked when signed in here; the default (keys[0]) when it names none, or when it is a
 *   shared or typed link naming a key this browser never held; null when signed out.
 * - signedOut: it names an account not signed in here. A background request (fetch, XHR, EventSource, beacon) so
 *   answered gets a 401, never a redirect to sign in and never the default account.
 * - keep: the key every redirect of this answer names (keepOnRedirect).
 */
function readTab(req, opts) {
  const o = Object.assign({ param: 'au', pattern: KEY, keys: [], gone: [] }, opts);
  const stripped = stripParam(String(req.url || ''), o.param, o.pattern);
  if (typeof req.url === 'string') { req.url = stripped.url; }
  const get = (h) => (typeof req.get === 'function' ? req.get(h) : (req.headers || {})[h.toLowerCase()]);
  const fetchSite = get('sec-fetch-site');
  let asked = req.tabPath ? keyIn(req.tabPath, o.pattern) : null;
  let source = asked ? 'path' : null;
  if (!asked) { asked = stripped.key; source = asked ? 'param' : null; }
  if (!asked && o.header) { asked = keyIn(get(o.header), o.pattern); source = asked ? 'header' : null; }
  // A picture, a frame, or a page opened by a script where the Navigation API is missing names none itself: the page
  // of this site that asked for it is its tab.
  if (!asked && (fetchSite === undefined || fetchSite === 'same-origin')) {
    try {
      const page = new URL(get('referer') || '');
      const origin = o.origin || `${req.protocol}://${get('host')}`;
      if (page.origin.toLowerCase() === String(origin).toLowerCase()) { asked = stripPath(page.pathname).key || keyIn(page.searchParams.get(o.param), o.pattern); }
    } catch { /* none */ }
    source = asked ? 'referer' : null;
  }
  const dest = get('sec-fetch-dest');
  const background = dest === 'empty' || source === 'header';
  const page = !background && req.method === 'GET' && (dest === undefined || dest === 'document');
  const linked = fetchSite === undefined || fetchSite === 'none' || fetchSite === 'cross-site';
  const def = o.default !== undefined ? o.default : o.keys[0] || null;
  if (!asked) { return { asked, source, key: def, signedOut: false, keep: null, background }; }
  if (o.keys.includes(asked)) { return { asked, source, key: asked, signedOut: false, keep: asked, background }; }
  // A shared or typed address naming a key never signed in here is the default's. One this site's own page sent, or
  // naming a key signed out here, is that tab's, signed out.
  if (page && linked && !o.gone.includes(asked)) { return { asked, source, key: def, signedOut: false, keep: null, background }; }
  return { asked, source, key: null, signedOut: true, keep: asked, background };
}

/**
 * Every same-origin redirect of this answer names the key `keep` gives, replacing any it named: a value, or a function
 * of the redirect's target read at the redirect, for a sign-in that changes it.
 */
function keepOnRedirect(res, keep, param = 'au', pattern = KEY) {
  if (typeof res.redirect !== 'function') { return; }
  const redirect = res.redirect.bind(res);
  res.redirect = (a, b) => {
    const [status, to] = typeof a === 'number' ? [a, b] : [302, a];
    return redirect(status, withParam(to, typeof keep === 'function' ? keep(to) : keep, param, pattern));
  };
}

/** The gone list after `ended` keys signed out: each once, the newest last, the last GONE_MAX. */
const addGone = (gone, ...ended) => gone.filter((k) => !ended.includes(k)).concat(ended).slice(-GONE_MAX);

module.exports = { readTab, pathTab, keepPath, pathFor, stripPath, withPath, stripParam, withParam, keepOnRedirect, readList, cookieName, addGone, keyIn, KEY, GONE_MAX };
