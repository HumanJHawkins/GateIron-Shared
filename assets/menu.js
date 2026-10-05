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
