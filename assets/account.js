// The account chip's markup, one implementation for both sides. chrome.js requires this file to
// render the bar on the server; a page that fills the bar's slot after load serves it and calls
// window.GateIronChrome.fillAccount(slot, { account } or { signIn }).
(function (root, api) {
  if (typeof module === 'object' && module.exports) { module.exports = api; } else { root.GateIronChrome = api; }
})(typeof self !== 'undefined' ? self : this, (function () {
  'use strict';

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }

  /** Two letters from a name, one from an address. Never empty. */
  function initials(person) {
    var name = ((person && person.name) || '').trim();
    if (name) {
      var parts = name.split(/\s+/);
      var letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
      return letters.toUpperCase();
    }
    return ((person && person.email) || '?').slice(0, 1).toUpperCase();
  }

  // Hidden from screen readers either way: the name beside it already says who this is.
  function avatarHtml(account) {
    var cls = 'gi-avatar' + (account.accent ? ' gi-accent' : '');
    if (account.avatarSrc) {
      return '<span class="' + cls + ' gi-avatar-img" aria-hidden="true"><img src="' + esc(account.avatarSrc)
        + '" alt="" width="64" height="64" referrerpolicy="no-referrer"></span>';
    }
    return '<span class="' + cls + '" aria-hidden="true">' + esc(initials(account)) + '</span>';
  }

  function itemHtml(item) {
    if (item.form) {
      if (item.form.hidden !== undefined) { throw new Error('gateiron-shared: a menu form takes hiddenHtml since 0.11.0, not hidden'); }
      return '<form method="' + esc(item.form.method || 'post') + '" action="' + esc(item.form.action) + '">'
        + (item.form.hiddenHtml || '') + '<button type="submit">' + esc(item.label) + '</button></form>';
    }
    if (item.button) {
      return '<button type="button" data-gi-action="' + esc(item.button) + '">' + esc(item.label) + '</button>';
    }
    return '<a href="' + esc(item.href) + '">' + esc(item.label) + '</a>';
  }

  /**
   * The chip and its menu for `account`, a sign-in button for `signIn` alone, or with neither the
   * empty slot a client script fills (none if `accountSlot` is false).
   *
   * A menu item is { href, label }; { label, form: { action, method, hiddenHtml } } for anything
   * that changes state; or { label, button } for a <button data-gi-action="<button>"> the page
   * binds itself.
   */
  function accountHtml(opts) {
    var o = opts || {};
    var account = o.account;
    if (!account) {
      if (o.signIn) {
        return '<a class="btn btn-secondary btn-small" href="' + esc(o.signIn.href) + '">'
          + esc(o.signIn.label || 'Sign in') + '</a>';
      }
      return o.accountSlot === false ? '' : '<span class="gi-account-slot"></span>';
    }
    var menu = (account.menu || []).map(itemHtml).join('');
    // `role` is how the person is signed in; `accent` colours it and the avatar, for the unusual ways.
    var role = account.role ? '<span class="gi-account-role">' + esc(account.role) + '</span>' : '';
    return '<details class="gi-account' + (account.accent ? ' gi-accent' : '') + '">'
      + '<summary>'
      + '<span class="gi-account-who"><b>' + esc(account.name || account.email) + '</b>' + role + '</span>'
      + avatarHtml(account)
      + '<span class="gi-sr-only">' + esc(account.menuLabel || 'Account menu') + '</span>'
      + '</summary>'
      + '<div class="gi-account-menu">'
      + (account.email ? '<div class="gi-account-meta">' + esc(account.email) + '</div>' : '')
      + menu
      + '</div>'
      + '</details>';
  }

  /** Fills a .gi-account-slot in the browser; returns the chip or the sign-in button. */
  function fillAccount(slot, opts) {
    var o = opts || {};
    slot.innerHTML = o.account || o.signIn ? accountHtml(o) : '';
    return slot.firstElementChild;
  }

  return { esc: esc, initials: initials, accountHtml: accountHtml, fillAccount: fillAccount };
})());
