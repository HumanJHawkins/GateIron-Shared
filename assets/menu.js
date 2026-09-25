// The account menu is a <details>, which opens and closes only on its own summary. A click
// anywhere else, or Escape, closes it too.
(function () {
  function openMenus() { return document.querySelectorAll('details.account[open]'); }
  document.addEventListener('click', function (e) {
    openMenus().forEach(function (menu) { if (!menu.contains(e.target)) { menu.open = false; } });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') { return; }
    openMenus().forEach(function (menu) {
      menu.open = false;
      var summary = menu.querySelector('summary');
      if (summary) { summary.focus(); }
    });
  });
})();
