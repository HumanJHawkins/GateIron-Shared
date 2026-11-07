// The account chip's markup, one implementation for both sides. chrome.js requires this file to
// render the bar on the server; a page that fills the bar's slot after load serves it and calls
// window.GateIronChrome.fillAccount(slot, { account } or { signIn }), and watchAccount to notice a
// sign-out made in another tab.
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

  // The other accounts shown before More Accounts.
  var SHOWN = 2;

  // Another account this browser has used: its avatar, name and address, as a link, a form or a
  // button the page binds (data-gi-account carries the site's key for it). One signed out says so,
  // and may carry a Remove. Past the first SHOWN, rows wait hidden for More Accounts.
  function switchHtml(other, i) {
    var off = other.signedIn === false;
    var inner = '<span class="gi-sr-only">' + (off ? 'Sign in as ' : 'Switch to ') + '</span>' + avatarHtml(other) + '<span><b>' + esc(other.name || other.email) + '</b>'
      + (other.email && other.name ? '<span>' + esc(other.email) + '</span>' : '')
      + (off ? '<span class="gi-account-state">' + esc(other.stateLabel || 'Signed out') + '</span>' : '') + '</span>';
    var key = other.key != null ? ' data-gi-account="' + esc(other.key) + '"' : '';
    var el;
    if (other.form) {
      el = '<form method="' + esc(other.form.method || 'post') + '" action="' + esc(other.form.action) + '">'
        + (other.form.hiddenHtml || '') + '<button type="submit" class="gi-account-switch"' + key + '>' + inner + '</button></form>';
    } else if (other.button) {
      el = '<button type="button" class="gi-account-switch" data-gi-action="' + esc(other.button) + '"' + key + '>' + inner + '</button>';
    } else {
      el = '<a class="gi-account-switch" href="' + esc(other.href) + '"' + key + '>' + inner + '</a>';
    }
    var r = other.remove;
    var remove = '';
    if (r) {
      var label = ' aria-label="' + esc((r.label || 'Remove') + ' ' + (other.name || other.email)) + '"';
      remove = r.form
        ? '<form method="' + esc(r.form.method || 'post') + '" action="' + esc(r.form.action) + '">' + (r.form.hiddenHtml || '') + '<button type="submit" class="gi-account-remove"' + label + '>' + esc(r.label || 'Remove') + '</button></form>'
        : '<button type="button" class="gi-account-remove" data-gi-action="' + esc(r.button) + '"' + key + label + '>' + esc(r.label || 'Remove') + '</button>';
    }
    return '<div class="gi-account-row' + (off ? ' gi-account-off' : '') + '"' + (i >= SHOWN ? ' data-gi-more-row hidden' : '') + '>' + el + remove + '</div>';
  }

  // The other accounts, More Accounts past the first SHOWN, then Add another account, then a rule
  // above the site's own items.
  function accountsHtml(account) {
    var list = account.accounts || [];
    var more = list.length > SHOWN ? '<button type="button" class="gi-account-more" data-gi-more aria-expanded="false">' + esc(account.moreLabel || 'More Accounts') + '</button>' : '';
    var others = list.length ? '<div class="gi-account-list">' + list.map(switchHtml).join('') + more + '</div>' : '';
    var add = account.add ? '<a href="' + esc(account.add.href) + '">' + esc(account.add.label || 'Add another account') + '</a>' : '';
    return others || add ? others + add + '<hr class="gi-account-rule">' : '';
  }

  // More Accounts shows the rest in place, the list scrolling past a set height.
  function showMore(button) {
    var list = button.closest('.gi-account-list');
    var first = list.querySelector('[data-gi-more-row]');
    Array.prototype.forEach.call(list.querySelectorAll('[data-gi-more-row]'), function (row) { row.hidden = false; });
    list.classList.add('gi-account-all');
    button.hidden = true;   // hidden, not removed: the menu's outside-click check still finds it inside
    var target = first && first.querySelector('a, button');
    if (target) { target.focus(); }
  }
  if (typeof document !== 'undefined' && !(typeof self !== 'undefined' && self.GateIronChrome)) {
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-gi-more]');
      if (b) { e.preventDefault(); showMore(b); }
    });
  }

  /**
   * The chip and its menu for `account`, a sign-in button for `signIn` alone, or with neither the
   * empty slot a client script fills (none if `accountSlot` is false).
   *
   * A menu item is { href, label }; { label, form: { action, method, hiddenHtml } } for anything
   * that changes state; or { label, button } for a <button data-gi-action="<button>"> the page
   * binds itself.
   *
   * `account.accounts` lists the other accounts this browser has used, each { name, email,
   * avatarSrc, key } with href, form or button as a menu item has; `signedIn: false` marks one
   * signed out (`stateLabel` its words, default Signed out), whose href, form or button signs it in
   * again, and `remove` ({ label, button } or { label, form }) gives it a Remove. The first two show;
   * More Accounts (`account.moreLabel`) shows the rest. `account.add` is { href, label } for Add
   * another account. Both sit under the address, above `menu`. Pass no `accounts` when there are
   * none: a person with one account sees no switching item.
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
      + accountsHtml(account)
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

  /**
   * A SIGN-OUT IN ANOTHER TAB (GN-1654). A page shown as `id` asks `meUrl` again when it is shown or
   * focused and each minute while in view (at most once in 5 s), and at once when a tab of this site
   * loads as someone else; a 401, or another account, reloads it. Any other answer, or none, proves
   * nothing. A sign-out at GateIron.com or in another product reaches a product as GateIron's
   * back-channel notice, which ends its session, so its next ask is the 401.
   * opts: { id: the account the page shows, or null; meUrl: default 'api/me' under a <base href> (path mode), else
   * '/api/me'; channel: a name for
   * this site's tabs, default 'gateiron-account'; presenceUrl: where to say this account still has a tab open, for
   * GateIron's auto sign-out }. A page inside a frame does not watch.
   *
   * WITH presenceUrl the page POSTs to it on load and each minute, hidden or not (a background tab's timers still
   * wake about once a minute), and as it goes, if no other tab of this site shows the same account, it sends a
   * beacon to presenceUrl with gone=1. GateIron signs the account out of the browser five minutes after the last
   * ping from any site, or half a minute after a gone=1 that no new page follows.
   */
  function watchAccount(opts) {
    var o = opts || {};
    var w = typeof window !== 'undefined' ? window : null;
    if (!w || w.top !== w) { return; }
    var who = o.id == null || o.id === '' ? null : String(o.id);   // a meta tag's string and JSON's number compare alike
    var channel = w.BroadcastChannel ? new w.BroadcastChannel(o.channel || 'gateiron-account') : null;
    if (channel) { channel.postMessage({ who: who }); }
    if (!who) { return; }
    var last = 0;
    function check(now) {
      if (!now && Date.now() - last < 5000) { return; }
      last = Date.now();
      w.fetch(o.meUrl || (w.document.querySelector('base[href]') ? 'api/me' : '/api/me'), { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } })
        .then(function (r) { return r.status === 401 ? null : r.ok ? r.json() : undefined; })
        .then(function (me) { if (me !== undefined && (me && me.id != null ? String(me.id) : null) !== who) { w.location.reload(); } }, function () {});
    }
    if (channel) { channel.onmessage = function (e) { if (e.data && e.data.who !== who) { check(true); } }; }
    if (o.presenceUrl) { presence(w, o, who); }
    w.document.addEventListener('visibilitychange', function () { if (w.document.visibilityState === 'visible') { check(); } });
    w.addEventListener('focus', function () { check(); });
    w.setInterval(function () { if (w.document.visibilityState === 'visible') { check(); } }, 60000);
  }

  // The tabs of one account on this site hear each other on their own channel, so the last one can say it is going.
  function presence(w, o, who) {
    var url = o.presenceUrl;
    var me = Math.random().toString(36).slice(2);
    var others = {};
    var tabs = w.BroadcastChannel ? new w.BroadcastChannel((o.channel || 'gateiron-account') + '-tabs') : null;
    function ping() { w.fetch(url, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { accept: 'application/json' } }).catch(function () {}); }
    function hello() { if (tabs) { tabs.postMessage({ who: who, tab: me }); } }
    if (tabs) {
      tabs.onmessage = function (e) {
        var d = e.data || {};
        if (d.who !== who || !d.tab) { return; }
        if (d.bye) { delete others[d.tab]; return; }
        if (!others[d.tab]) { others[d.tab] = 0; hello(); }   // a new tab hears who is here at once
        others[d.tab] = Date.now();
      };
    }
    ping(); hello();
    w.setInterval(function () { ping(); hello(); }, 60000);
    w.addEventListener('pageshow', function (e) { if (e.persisted) { ping(); hello(); } });
    w.addEventListener('pagehide', function () {
      var now = Date.now();
      var alone = !Object.keys(others).some(function (k) { return now - others[k] < 90000; });
      // The beacon first: a page being torn down may not run past the channel's post.
      if (alone && w.navigator.sendBeacon) { w.navigator.sendBeacon(url + (url.indexOf('?') < 0 ? '?' : '&') + 'gone=1'); }
      if (tabs) { tabs.postMessage({ who: who, tab: me, bye: true }); }
    });
  }

  return { esc: esc, initials: initials, accountHtml: accountHtml, fillAccount: fillAccount, watchAccount: watchAccount };
})());
