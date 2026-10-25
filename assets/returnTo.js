// WHERE A SIGN-IN MAY SEND THE BROWSER BACK TO: a path on this site, and nothing else. One file for
// both sides. On the server, require('gateiron-shared/returnTo').safeReturnTo; in a page, serve this
// file and call GateIronReturnTo.safeReturnTo.
//
// The value is resolved by the URL parser, as the browser will resolve it, and only the path, query
// and fragment of a same-origin result are given back, re-serialised. A string test cannot keep up
// with what browsers forgive: a backslash read as a slash, a tab or newline dropped, '/.//host' or
// '/x/..//host' collapsing to '//host'. A result that would begin '//' keeps one slash.
(function (root, api) {
  // Named, not assigned whole, so an ES module's import { safeReturnTo } finds it.
  if (typeof module === 'object' && module.exports) { module.exports.safeReturnTo = api.safeReturnTo; } else { root.GateIronReturnTo = api; }
})(typeof self !== 'undefined' ? self : this, (function () {
  'use strict';

  var BASE = 'https://return-to.invalid';

  // value: what the request carried. fallback: what any other value becomes ('/' by default).
  function safeReturnTo(value, fallback) {
    var otherwise = fallback === undefined ? '/' : fallback;
    if (typeof value !== 'string' || value.charAt(0) !== '/') { return otherwise; }
    var url;
    try { url = new URL(value, BASE); } catch (e) { return otherwise; }
    if (url.origin !== BASE) { return otherwise; }
    return url.pathname.replace(/^\/{2,}/, '/') + url.search + url.hash;
  }

  return { safeReturnTo: safeReturnTo };
})());
