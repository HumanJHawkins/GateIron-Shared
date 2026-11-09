// ONE ACCOUNT PER TAB, the browser half (GateIron.com docs/SIGN-IN-FOR-PRODUCTS.md, "Several accounts on one browser";
// the server half is gateiron-shared/tabs).
//
// mode 'path': the tab's account is in its address, /u/<key>/, and the page's <base href> (the server's pathTab) makes
// every relative address it uses carry it, so nothing here touches a request. This half tells the other tabs of a
// sign-out, moves a tab whose account stops being the browser's default under its prefix (and back under it on Back or
// Reload to an entry from before the move), and keeps links and history entries that mean this page ("", "?page=2",
// "#main"), which the base would send to the site's front page, on it.
//
// mode 'param', for sites not yet on the path: the tab names its account by key on everything it sends to its own
// site: the site's header on fetch and XHR, `au` on EventSource and sendBeacon, and, while the browser holds more than
// one account or another than this tab's, `au` in its address and on each link, form, window and script navigation it
// follows. sessionStorage keeps the key through Reload and Back.
//
// A classic script, the first on the page: in 'param' mode it must wrap fetch before any other script fetches.
// Started by its own tag's data-gateiron-tabs attributes, or by GateIronTabs.start(options) from the site's first
// script.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.GateIronTabs = api;
  const tag = root.document && root.document.currentScript;
  if (tag && tag.hasAttribute('data-gateiron-tabs')) { api.start(api.fromAttributes(tag)); }
})(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  // A link here is somebody's text, or one drawn for another account (the account menu's Switch to).
  const SKIP = '[contenteditable], .ProseMirror, [data-account], [data-gi-account]';
  const DEFAULTS = {
    param: 'au', storageKey: 'gateiron.tab', meta: 'gateiron-tab', keyPattern: /^[A-Za-z0-9_-]{6,16}$/,
    signOutSelector: 'form[action*="logout"]', skipSelector: '', observe: false, onSignedOut: null,
  };
  const REQUIRED = ['header', 'keysCookie', 'goneCookie', 'channel'];
  const REQUIRED_PATH = ['keysCookie', 'channel'];

  /** The options a script tag's data- attributes give: data-header, data-keys-cookie, data-gone-cookie, data-channel... */
  function fromAttributes(tag) {
    const d = tag.dataset;
    return {
      mode: d.mode, header: d.header, keysCookie: d.keysCookie, goneCookie: d.goneCookie, channel: d.channel, param: d.param,
      storageKey: d.storageKey, meta: d.meta, skipSelector: d.skipSelector, signOutSelector: d.signOutSelector,
      observe: d.observe === 'true', keyPattern: d.keyPattern ? new RegExp(d.keyPattern) : undefined,
    };
  }

  function start(options, win) {
    const w = win || window;
    const o = Object.assign({}, DEFAULTS);
    for (const [k, v] of Object.entries(options || {})) { if (v !== undefined && v !== '') { o[k] = v; } }
    for (const k of o.mode === 'path' ? REQUIRED_PATH : REQUIRED) { if (!o[k]) { throw new Error(`gateiron-shared tabs: ${k} is required`); } }
    if (w.GateIronTab) { return w.GateIronTab; }
    if (o.mode === 'path') { return startPath(o, w); }
    const d = w.document;
    const loc = w.location;
    const P = o.param;
    const skipping = o.skipSelector ? `${SKIP}, ${o.skipSelector}` : SKIP;

    const valid = (k) => (typeof k === 'string' && o.keyPattern.test(k) ? k : null);
    // The keys signed in here, the default first, and the keys signed out here, as the server last wrote them. A keys
    // list starting with '.' has no default: a tab naming none is signed out.
    const raw = (name) => {
      for (const c of String(d.cookie || '').split('; ')) {
        const i = c.indexOf('=');
        const n = c.slice(0, i);
        if (n === name || n === `__Host-${name}`) { try { return decodeURIComponent(c.slice(i + 1)).split('.'); } catch { return []; } }
      }
      return [];
    };
    const list = (name) => raw(name).filter((k) => o.keyPattern.test(k));
    const keys = () => list(o.keysCookie);
    const gone = () => list(o.goneCookie);
    const byDefault = () => valid(raw(o.keysCookie)[0]);
    const read = () => { try { return valid(w.sessionStorage.getItem(o.storageKey)); } catch { return null; } };
    const store = (k) => { try { if (k) { w.sessionStorage.setItem(o.storageKey, k); } else { w.sessionStorage.removeItem(o.storageKey); } } catch { /* blocked */ } };

    const here = new URL(loc.href);
    const named = valid(here.searchParams.get(P));
    const stored = read();
    const how = w.performance && w.performance.getEntriesByType ? (w.performance.getEntriesByType('navigation')[0] || {}).type : null;
    const again = how === 'reload' || how === 'back_forward';
    let replacing = false;
    // Reload or Back to an address from before another account signed in here names none, so it was drawn as the
    // default: the tab goes on as its own account, or stays signed out when that account signed out here.
    if (!named && again && stored) {
      const k = keys();
      if (byDefault() !== stored && (k.includes(stored) || gone().includes(stored))) {
        here.searchParams.set(P, stored);
        replacing = true;
        loc.replace(here.href);
      }
    }
    const metaTag = d.querySelector(`meta[name="${o.meta}"]`);
    const drawn = valid(metaTag ? metaTag.content : null);
    // A page a script of this tab opened, where the Navigation API is missing, names its account by the page it came from.
    let from = null;
    try { const r = new URL(d.referrer); if (r.origin === loc.origin) { from = valid(r.searchParams.get(P)); } } catch { /* none */ }
    let key = replacing ? stored : drawn || named || from || (again ? stored : null);
    // Drawn signed out, naming none, a tab whose account signed out here keeps naming it, so it stays signed out.
    if (!key && stored && gone().includes(stored)) { key = stored; }
    store(key);
    let listed = Boolean(key) && keys().includes(key);

    // While the browser holds more than one account, or one that is not this tab's or not the default.
    const many = () => {
      const k = keys();
      return k.length > 1 || (k.length === 1 && Boolean(key) && byDefault() !== key);
    };
    const absolute = (raw) => /^[a-z][a-z0-9+.-]*:/i.test(raw);
    // `raw` as this tab goes to it, or null when it needs nothing: another site's, a fragment, already this tab's, or
    // naming another account signed in here on purpose (GateIronTab.as). `force` marks it with one account too.
    const marked = (raw, force) => {
      if (!key || raw == null || String(raw).startsWith('#') || !(force || many())) { return null; }
      let u;
      try { u = new URL(String(raw), loc.href); } catch { return null; }
      if (u.origin !== loc.origin || !/^https?:$/.test(u.protocol)) { return null; }
      const now = u.searchParams.get(P);
      if (now === key || (now !== null && now !== key && keys().includes(now))) { return null; }
      u.searchParams.set(P, key);
      return absolute(String(raw)) ? u.href : u.pathname + u.search + u.hash;
    };
    const unmarked = (raw) => {
      let u;
      try { u = new URL(String(raw), loc.href); } catch { return raw; }
      if (!u.searchParams.has(P)) { return raw; }
      u.searchParams.delete(P);
      return absolute(String(raw)) ? u.href : u.pathname + u.search + u.hash;
    };
    const skip = (el) => Boolean(el.closest && el.closest(skipping));

    const markLink = (a) => {
      if (skip(a)) { return; }
      const v = marked(a.getAttribute('href'));
      if (v) { a.setAttribute('href', v); }
    };
    const markForm = (f, submitter) => {
      if (!key || !many() || skip(f)) { return; }
      const via = submitter && submitter.getAttribute ? submitter.getAttribute('formaction') : null;
      const method = ((submitter && submitter.getAttribute && submitter.getAttribute('formmethod')) || f.getAttribute('method') || 'get').toLowerCase();
      if (method === 'dialog') { return; }
      if (method === 'get') {
        // A GET form's fields replace its address's query, so the key goes as a field, and only to this site.
        let ours = false;
        try { ours = new URL(via || f.getAttribute('action') || loc.href, loc.href).origin === loc.origin; } catch { /* not ours */ }
        let field = f.querySelector(`:scope > input[type="hidden"][name="${P}"]`);
        if (!ours) { if (field) { field.remove(); } return; }
        if (!field) { field = d.createElement('input'); field.type = 'hidden'; field.name = P; f.prepend(field); }
        field.value = key;
      } else if (via !== null) {
        const v = marked(via);
        if (v) { submitter.setAttribute('formaction', v); }
      } else {
        const v = marked(f.getAttribute('action') || loc.href);
        if (v) { f.setAttribute('action', v); }
      }
    };
    const markAll = (root) => {
      const all = (sel) => [...(root.matches && root.matches(sel) ? [root] : []), ...(root.querySelectorAll ? root.querySelectorAll(sel) : [])];
      all('a[href], area[href]').forEach(markLink);
      all('form').forEach((f) => markForm(f));
    };

    const replaceWas = w.history.replaceState.bind(w.history);
    const settle = () => {
      if (replacing) { return; }
      const v = many() ? marked(loc.href) : unmarked(loc.href);
      if (v && v !== loc.href) { replaceWas(w.history.state, '', v); }
      if (o.observe && many()) { markAll(d); }
    };

    // Everything this tab sends to its own site.
    const same = (url) => { try { return new URL(url, loc.href).origin === loc.origin; } catch { return false; } };
    const fetchWas = w.fetch;
    if (fetchWas) {
      w.fetch = function fetchAs(input, init) {
        const isRequest = w.Request && input instanceof w.Request;
        const url = isRequest ? input.url : String(input);
        if (!key || !same(url)) { return fetchWas.apply(this, arguments); }
        const headers = new w.Headers((init && init.headers) || (isRequest ? input.headers : undefined));
        headers.set(o.header, key);
        return fetchWas.call(this, input, Object.assign({}, init, { headers }));
      };
    }
    if (w.XMLHttpRequest) {
      const openWas = w.XMLHttpRequest.prototype.open;
      w.XMLHttpRequest.prototype.open = function openAs(method, url) {
        openWas.apply(this, arguments);
        if (key && same(String(url))) { this.setRequestHeader(o.header, key); }
      };
    }
    if (w.EventSource) {
      const Stream = w.EventSource;
      w.EventSource = class EventSourceAs extends Stream {
        constructor(url, opts) { super(marked(url, true) || url, opts); }
      };
    }
    if (w.navigator && w.navigator.sendBeacon) {
      const beacon = w.navigator.sendBeacon.bind(w.navigator);
      w.navigator.sendBeacon = (url, data) => beacon(marked(url, true) || url, data);
    }
    // The Navigation API sees no new window.
    if (w.open) {
      const openWas = w.open;
      w.open = function openAs(url) {
        const args = Array.prototype.slice.call(arguments);
        if (url != null && url !== '') { args[0] = marked(url) || url; }
        return openWas.apply(this, args);
      };
    }
    // form.submit() fires no submit event; requestSubmit() does.
    if (w.HTMLFormElement) {
      const submitWas = w.HTMLFormElement.prototype.submit;
      w.HTMLFormElement.prototype.submit = function submitAs() { markForm(this); return submitWas.call(this); };
    }
    for (const name of ['pushState', 'replaceState']) {
      const was = w.history[name].bind(w.history);
      w.history[name] = (state, title, url) => was(state, title, url == null ? url : marked(url) || url);
    }
    // Links are marked as they are used: followed, opened in a new tab, copied, dragged, reached by keyboard. Their
    // hrefs stay as drawn otherwise, so a script comparing addresses sees no key.
    for (const type of ['pointerdown', 'click', 'auxclick', 'contextmenu', 'focusin', 'dragstart']) {
      w.addEventListener(type, (e) => {
        const a = e.target && e.target.closest && e.target.closest('a[href], area[href]');
        if (a) { markLink(a); }
      }, true);
    }
    const channel = w.BroadcastChannel ? new w.BroadcastChannel(o.channel) : null;
    const leaving = () => { if (key && channel) { channel.postMessage({ type: 'leaving', key }); } };
    w.addEventListener('submit', (e) => {
      markForm(e.target, e.submitter);
      if (e.target.matches && e.target.matches(o.signOutSelector)) { leaving(); }
    }, true);
    // Script navigations: location.href, assign, replace, a link nothing marked. A navigation within the page (a
    // fragment, Back inside it, pushState), a download and a form post go as they are.
    const nav = w.navigation;
    if (nav && nav.addEventListener) {
      nav.addEventListener('navigate', (e) => {
        if (!key || replacing || !e.cancelable || !e.canIntercept || e.hashChange || e.destination.sameDocument) { return; }
        if (e.downloadRequest != null || e.formData || (e.navigationType !== 'push' && e.navigationType !== 'replace')) { return; }
        if (e.sourceElement && skip(e.sourceElement)) { return; }
        const to = marked(e.destination.url);
        if (!to) { return; }
        e.preventDefault();
        nav.navigate(to, { history: e.navigationType, state: e.destination.getState() });
      });
    }
    if (o.observe && w.MutationObserver) {
      new w.MutationObserver((changes) => {
        if (!many()) { return; }
        for (const c of changes) {
          if (c.type === 'attributes') { markAll(c.target); } else { c.addedNodes.forEach((n) => { if (n.nodeType === 1) { markAll(n); } }); }
        }
      }).observe(d.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'action', 'formaction'] });
    }

    // Another tab's sign-in, sign-out or choice. A tab whose account signed out here, by any tab, reads again.
    let ended = false;
    const recheck = () => {
      if (replacing) { return; }
      settle();
      if (key && listed && !ended && !keys().includes(key)) {
        ended = true;
        if (o.onSignedOut) { o.onSignedOut(key); } else { loc.reload(); }
      }
    };
    if (channel) {
      channel.addEventListener('message', (e) => {
        const m = e.data || {};
        if (m.type === 'leaving' && m.key === key) { d.dispatchEvent(new w.CustomEvent('gateiron:leaving', { detail: { key } })); }
        if (m.type === 'keys') { recheck(); }
      });
      channel.postMessage({ type: 'keys' });
    }
    d.addEventListener('visibilitychange', () => { if (d.visibilityState === 'visible') { recheck(); } });
    w.addEventListener('pageshow', (e) => { if (e.persisted) { recheck(); } });

    const api = {
      /** This tab's account key, or null. */
      key: () => key,
      /** The account the server says this tab is, when that arrives after load (/api/me, a popup sign-in's key). */
      adopt(k) {
        const v = valid(k);
        if (!v || v === key) { return; }
        key = v;
        ended = false;
        listed = keys().includes(v);
        store(v);
        settle();
        if (channel) { channel.postMessage({ type: 'keys' }); }
      },
      /** The tab names no account: it is the default's. */
      forget() { key = null; listed = false; store(null); settle(); },
      /** A URL of this site as this tab goes to it. */
      address: (url) => marked(url) || url,
      /** The same URL as the account `k`. */
      as(url, k) {
        const u = new URL(String(url), loc.href);
        u.searchParams.set(P, k);
        return u.origin === loc.origin ? u.pathname + u.search + u.hash : u.href;
      },
      /** A URL without this tab's key. */
      unmarked,
      /** Before a sign-out made by fetch: the tabs of this account fire gateiron:leaving (to keep drafts). */
      leaving,
    };
    w.GateIronTab = api;
    settle();
    return api;
  }

  function startPath(o, w) {
    const d = w.document;
    const loc = w.location;
    const PREFIX = /^\/u\/([A-Za-z0-9_-]{6,16})(?=[/?#]|$)/;
    const valid = (k) => (typeof k === 'string' && o.keyPattern.test(k) ? k : null);
    const raw = () => {
      for (const c of String(d.cookie || '').split('; ')) {
        const i = c.indexOf('=');
        const n = c.slice(0, i);
        if (n === o.keysCookie || n === `__Host-${o.keysCookie}`) { try { return decodeURIComponent(c.slice(i + 1)).split('.'); } catch { return []; } }
      }
      return [];
    };
    // The keys signed in here, the default first; a list starting with '.' has no default.
    const keys = () => raw().filter((k) => o.keyPattern.test(k));
    const byDefault = () => valid(raw()[0]);
    const inPath = (p) => { const m = PREFIX.exec(p); return m ? m[1] : null; };
    const metaTag = d.querySelector(`meta[name="${o.meta}"]`);
    // The account the page was drawn as, else the one its address names (a page drawn signed out).
    let key = valid(metaTag ? metaTag.content : null) || inPath(loc.pathname);
    let listed = Boolean(key) && keys().includes(key);

    const bare = (p) => { const m = PREFIX.exec(p); return m ? (p.slice(m[0].length) || '/') : p; };
    const under = (url, k) => {
      let u;
      try { u = new URL(String(url), d.baseURI); } catch { return url; }
      if (u.origin !== loc.origin) { return u.href; }
      const rest = bare(u.pathname);
      return (k ? `/u/${k}${rest.startsWith('/') ? rest : `/${rest}`}` : rest) + u.search + u.hash;
    };
    const baseTag = () => d.querySelector('base[href]') || d.head.appendChild(Object.assign(d.createElement('base'), { href: '/' }));
    // The address and the base name this tab's account while another is the default here; a page drawn signed out
    // keeps the key it names, until the tab's account is signed in here under another key (GN-1933).
    const settle = () => {
      const named = inPath(loc.pathname);
      const mine = key && keys().includes(key) && named !== key ? null : named;
      const want = key && (keys().length > 1 || byDefault() !== key) ? key : mine;
      if (want === named) { return; }
      w.history.replaceState(w.history.state, '', under(loc.href, want));
      baseTag().setAttribute('href', want ? `/u/${want}/` : '/');
    };
    // A link of "", "?..." or "#..." means this page, not the base: it goes there.
    const onPage = (h) => h === '' || h.startsWith('?') || h.startsWith('#');
    const here = (a) => {
      const h = a.getAttribute('href');
      if (h != null && onPage(h)) { a.setAttribute('href', loc.pathname + (h.startsWith('?') ? h : loc.search + h)); }
    };
    // The account this tab last had at each address, prefix or not, so Back or Reload to one from before the tab moved
    // under its prefix opens as that account, signed in or out, not as the default. In sessionStorage, not history
    // state, which would take a replaceState as each page loads: in Firefox that broke a select's keyboard use.
    const PATHS = `${o.storageKey}.paths`;
    const seen = () => { try { return JSON.parse(w.sessionStorage.getItem(PATHS)) || {}; } catch { return {}; } };
    const remember = () => {
      const all = seen();
      const at = bare(loc.pathname) + loc.search;
      delete all[at];
      if (key) { all[at] = key; }
      const last = Object.entries(all).slice(-100);
      try { w.sessionStorage.setItem(PATHS, JSON.stringify(Object.fromEntries(last))); } catch { /* blocked */ }
    };
    for (const name of ['pushState', 'replaceState']) {
      const was = w.history[name].bind(w.history);
      w.history[name] = (state, title, url) => {
        was(state, title, typeof url === 'string' && onPage(url) ? loc.pathname + (url.startsWith('?') ? url : loc.search + url) : url);
        remember();
      };
    }
    for (const type of ['pointerdown', 'click', 'auxclick', 'contextmenu', 'focusin', 'dragstart']) {
      w.addEventListener(type, (e) => {
        const a = e.target && e.target.closest && e.target.closest('a[href], area[href]');
        if (a) { here(a); }
      }, true);
    }

    const channel = w.BroadcastChannel ? new w.BroadcastChannel(o.channel) : null;
    const leaving = () => { if (key && channel) { channel.postMessage({ type: 'leaving', key }); } };
    w.addEventListener('submit', (e) => { if (e.target.matches && e.target.matches(o.signOutSelector)) { leaving(); } }, true);
    let ended = false;
    const recheck = () => {
      settle();
      if (key && listed && !ended && !keys().includes(key)) {
        ended = true;
        if (o.onSignedOut) { o.onSignedOut(key); } else { loc.reload(); }
      }
    };
    if (channel) {
      channel.addEventListener('message', (e) => {
        const m = e.data || {};
        if (m.type === 'leaving' && m.key === key) { d.dispatchEvent(new w.CustomEvent('gateiron:leaving', { detail: { key } })); }
        if (m.type === 'keys') { recheck(); }
      });
      channel.postMessage({ type: 'keys' });
    }
    d.addEventListener('visibilitychange', () => { if (d.visibilityState === 'visible') { recheck(); } });
    w.addEventListener('pageshow', (e) => { if (e.persisted) { recheck(); } });

    const api = {
      /** This tab's account key, or null. */
      key: () => key,
      /** The account the server says this tab is, when that arrives after load (a popup sign-in's key). */
      adopt(k) {
        const v = valid(k);
        if (!v || v === key) { return; }
        key = v; ended = false; listed = keys().includes(v);
        settle();
        remember();
        if (channel) { channel.postMessage({ type: 'keys' }); }
      },
      /** The tab names no account: it is the default's. */
      forget() {
        key = null; listed = false;
        w.history.replaceState(w.history.state, '', under(loc.href, null));
        baseTag().setAttribute('href', '/');
      },
      /** A URL of this site as this tab goes to it. */
      address: (url) => under(url, inPath(loc.pathname)),
      /** The same URL as the account `k`. */
      as: (url, k) => under(url, k),
      /** A URL without this tab's key. */
      unmarked: (url) => under(url, null),
      /** Before a sign-out made by fetch: the tabs of this account fire gateiron:leaving (to keep drafts). */
      leaving,
    };
    w.GateIronTab = api;
    const how = w.performance && w.performance.getEntriesByType ? (w.performance.getEntriesByType('navigation')[0] || {}).type : null;
    const before = valid(seen()[loc.pathname + loc.search]);
    if ((how === 'reload' || how === 'back_forward') && before && before !== key && !inPath(loc.pathname)) {
      loc.replace(under(loc.href, before));
      return api;
    }
    settle();
    remember();
    return api;
  }

  return { start, fromAttributes };
});
