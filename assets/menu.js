// The account menu is a <details>: its summary opens and closes it on a click, Enter or Space.
// This adds the rest. A click elsewhere, Escape, or Tab leaving the menu closes it; Escape from
// inside returns focus to the summary. ArrowDown and ArrowUp open it from the summary and move
// through its items; Home and End go to the first and last.
(function () {
  var MENU = 'details.gi-account';

  function items(menu) {
    return Array.prototype.filter.call(
      menu.querySelectorAll('.gi-account-menu a[href], .gi-account-menu button:not([disabled])'),
      function (el) { return !el.closest('[hidden]'); });
  }
  function close(menu, refocus) {
    menu.open = false;
    var summary = menu.querySelector('summary');
    if (refocus && summary) { summary.focus(); }
  }
  function openMenus() { return document.querySelectorAll(MENU + '[open]'); }

  document.addEventListener('click', function (e) {
    Array.prototype.forEach.call(openMenus(), function (menu) { if (!menu.contains(e.target)) { close(menu, false); } });
  });

  document.addEventListener('focusout', function (e) {
    var menu = e.target.closest && e.target.closest(MENU);
    if (menu && menu.open && e.relatedTarget && !menu.contains(e.relatedTarget)) { close(menu, false); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      Array.prototype.forEach.call(openMenus(), function (menu) { close(menu, menu.contains(document.activeElement)); });
      return;
    }
    var menu = e.target.closest && e.target.closest(MENU);
    if (!menu) { return; }
    var list = items(menu);
    if (!list.length) { return; }
    var onSummary = e.target.tagName === 'SUMMARY';
    var at = list.indexOf(document.activeElement);
    var next = null;
    if (e.key === 'ArrowDown') { next = onSummary || at < 0 ? 0 : (at + 1) % list.length; }
    else if (e.key === 'ArrowUp') { next = onSummary || at < 0 ? list.length - 1 : (at - 1 + list.length) % list.length; }
    else if (e.key === 'Home' && !onSummary) { next = 0; }
    else if (e.key === 'End' && !onSummary) { next = list.length - 1; }
    if (next === null) { return; }
    e.preventDefault();
    menu.open = true;
    list[next].focus();
  });
})();

// THE BAR ON ONE LINE WHEN IT FITS (chrome.css, narrow screens). The nav or a site's own buttons
// take a second line only when they, the brand and the account chip do not fit side by side:
// html.gi-bar-fits says they do. Measured at start, on resize, when the fonts arrive and when the
// account chip fills in; each part's width is its children's, the same in either layout.
(function () {
  if (typeof window === 'undefined' || !window.matchMedia) { return; }
  var narrow = window.matchMedia('(max-width: 720px)');
  var root = document.documentElement;
  function px(v) { return parseFloat(v) || 0; }
  function natural(el) {
    var cs = getComputedStyle(el);
    var kids = Array.prototype.filter.call(el.children, function (k) { return getComputedStyle(k).position !== 'absolute'; });
    if (!kids.length) { return el.getBoundingClientRect().width; }
    var w = kids.reduce(function (sum, k) { return sum + k.getBoundingClientRect().width + px(getComputedStyle(k).marginLeft) + px(getComputedStyle(k).marginRight); }, 0);
    return w + px(cs.columnGap) * (kids.length - 1) + px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth);
  }
  function fit() {
    var bar = document.querySelector('.gi-bar-inner');
    var middle = bar && (bar.querySelector('.gi-bar-actions') || bar.querySelector('.gi-nav'));
    if (!middle || !narrow.matches) { root.classList.remove('gi-bar-fits'); return; }
    var account = bar.querySelector('.gi-account-slot') || bar.querySelector('.gi-account');
    var parts = [bar.querySelector('.gi-brand'), middle, account].filter(Boolean);
    var cs = getComputedStyle(bar);
    var room = bar.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight);
    var need = parts.reduce(function (sum, p) { return sum + (p === account ? p.getBoundingClientRect().width : natural(p)); }, 0)
      + px(cs.columnGap) * (parts.length - 1);
    root.classList.toggle('gi-bar-fits', need <= room);
  }
  var queued = false;
  function soon() { if (!queued) { queued = true; requestAnimationFrame(function () { queued = false; fit(); }); } }
  function start() {
    fit();
    window.addEventListener('resize', soon);
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(soon); }
    var bar = document.querySelector('.gi-bar-inner');
    if (bar && window.MutationObserver) { new MutationObserver(soon).observe(bar, { childList: true, subtree: true }); }
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); } else { start(); }
})();
