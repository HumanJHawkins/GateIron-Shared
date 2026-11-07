'use strict';
// RELATIVE ADDRESSES (gateiron-shared/tabs, path mode): a page's <base href="/u/<key>/"> carries the tab's account
// only on relative addresses, so a page, form or API address is written without a leading slash ("shop/cart"). A
// static file keeps its slash ("/css/site.css"): under every account's prefix it would be fetched and cached again.
//
// The ESLint rule `gateiron/relative-urls` reports a root-relative address where a browser goes or sends: fetch,
// XMLHttpRequest open, EventSource, sendBeacon, window.open, history.pushState and replaceState, the site's own helpers
// (calls), location.assign and replace, an assignment to location,
// .href or .action, a property named href or action ({ href: '/profile' }), and an href, action or formaction
// attribute inside any string (HTML built in code). `rootRelative`
// does the same for an HTML file, for a site's test.
//
//   const gateiron = require('gateiron-shared/eslint');
//   { plugins: { gateiron }, rules: { 'gateiron/relative-urls': ['error', { allow: ['/oauth/', '/*.css'], calls: ['post'] }] } }
//
// allow: a site's own static files and the addresses that never carry a tab (pathTab's bare). `rel` converts one.

const STATIC = ['/brand/', '/css/', '/js/', '/image/', '/images/', '/fonts/', '/vendor/', '/favicon'];
// An attribute's value up to its closing quote, or to the end of a string that goes on in code ('<a href="/list/' + c).
const ATTR = /\b(href|action|formaction)\s*=\s*["'](\/(?![/\\])[^"'\s>]*)/gi;

// An allow entry is a path prefix ("/oauth/"), or "/*.js" for any file of that type at the root ("/app.js").
const allowed = (s, a) => (a.startsWith('/*.') ? new RegExp(`^/[^/?#]+\\${a.slice(2)}(?:[?#]|$)`).test(s) : s.startsWith(a));
const rooted = (s, allow) => typeof s === 'string' && /^\/(?![/\\])/.test(s) && !allow.some((a) => allowed(s, a));

/** `to` relative, for a page under <base href>: "/shop/cart" is "shop/cart", "/" is "./"; a static file stays as it is. */
const rel = (to, allow = []) => (rooted(to, STATIC.concat(allow)) ? (to === '/' ? './' : to.slice(1)) : to);

/** The root-relative page, form and API addresses in `html`: [{ attr, url, line }]. */
function rootRelative(html, allow = []) {
  const ok = STATIC.concat(allow);
  const out = [];
  for (const m of String(html).matchAll(ATTR)) {
    if (rooted(m[2], ok)) { out.push({ attr: m[1], url: m[2], line: html.slice(0, m.index).split('\n').length }); }
  }
  return out;
}

// The text a string expression starts with: a literal, a template's first part, or the left of a +.
function head(node) {
  if (!node) { return null; }
  if (node.type === 'Literal' && typeof node.value === 'string') { return node.value; }
  if (node.type === 'TemplateLiteral') { return node.quasis[0].value.cooked; }
  if (node.type === 'BinaryExpression' && node.operator === '+') { return head(node.left); }
  return null;
}
const name = (n) => (n && n.type === 'Identifier' ? n.name : n && n.type === 'MemberExpression' && !n.computed ? n.property.name : null);
const objName = (n) => (n && n.type === 'MemberExpression' ? name(n.object) : null);

const relativeUrls = {
  meta: {
    type: 'problem',
    docs: { description: 'Page, form and API addresses are relative, so the page\'s <base href> keeps the tab\'s account' },
    schema: [{ type: 'object', properties: { allow: { type: 'array', items: { type: 'string' } }, calls: { type: 'array', items: { type: 'string' } } }, additionalProperties: false }],
    messages: { rooted: '"{{url}}" starts with "/": write it relative ("{{fix}}") so it keeps the tab\'s account, or allow it' },
  },
  create(context) {
    const allow = STATIC.concat(((context.options[0] || {}).allow) || []);
    // calls: the site's own helpers whose first argument is an address (post('/api/x', body)).
    const calls = ((context.options[0] || {}).calls) || [];
    const report = (node, url) => context.report({ node, messageId: 'rooted', data: { url, fix: url.slice(1) } });
    const check = (node) => { const h = head(node); if (rooted(h, allow)) { report(node, h); } };
    const text = (node, s) => { for (const m of String(s).matchAll(ATTR)) { if (rooted(m[2], allow)) { report(node, m[2]); } } };
    return {
      CallExpression(node) {
        const callee = name(node.callee);
        const on = objName(node.callee);
        if (callee === 'fetch' || callee === 'sendBeacon' || calls.includes(callee)) { check(node.arguments[0]); }
        if (callee === 'pushState' || callee === 'replaceState') { check(node.arguments[2]); }
        if (callee === 'open') {
          // XMLHttpRequest's open(method, url); window.open(url).
          const method = head(node.arguments[0]);
          if (typeof method === 'string' && /^(GET|POST|PUT|PATCH|DELETE|HEAD)$/i.test(method)) { check(node.arguments[1]); } else if (on === 'window' || node.callee.type === 'Identifier') { check(node.arguments[0]); }
        }
        if ((callee === 'assign' || callee === 'replace') && /location$/i.test(on || '')) { check(node.arguments[0]); }
      },
      NewExpression(node) { if (name(node.callee) === 'EventSource') { check(node.arguments[0]); } },
      // { href: '/profile' }: a link or form handed to code that draws it (the account menu's items, the bar's home).
      Property(node) { if (['href', 'action', 'formAction', 'home'].includes(name(node.key) || (node.key.type === 'Literal' && node.key.value))) { check(node.value); } },
      AssignmentExpression(node) {
        const target = name(node.left);
        if (target === 'location' || target === 'href' || target === 'action' || target === 'formAction') { check(node.right); }
      },
      Literal(node) { if (typeof node.value === 'string' && node.value.includes('=')) { text(node, node.value); } },
      TemplateElement(node) { if (node.value.cooked && node.value.cooked.includes('=')) { text(node, node.value.cooked); } },
    };
  },
};

module.exports = { rules: { 'relative-urls': relativeUrls }, rootRelative, rel, STATIC };
