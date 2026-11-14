// THE THEME: System, Light or Dark, kept by each site. Loaded in <head> without defer, so the first
// paint is in the chosen theme. <html data-gi-theme="system|light|dark"> is the site's stored choice;
// without it, the choice this browser last made on the site. Dark, or System on a computer set to
// dark, puts .gi-dark on <html>; System follows the computer as it changes.
//   GateIronTheme.set('dark')   on the site's Theme setting changing; get() reads it.
(function () {
  'use strict';
  var KEY = 'gi-theme';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var valid = function (c) { return c === 'light' || c === 'dark' ? c : 'system'; };
  var remembered = null;
  try { remembered = window.localStorage.getItem(KEY); } catch (e) { /* storage blocked: System */ }
  var choice = valid(root.getAttribute('data-gi-theme') || remembered);

  function paint() {
    root.classList.toggle('gi-dark', choice === 'dark' || (choice === 'system' && !!media && media.matches));
  }
  if (media) {
    if (media.addEventListener) { media.addEventListener('change', paint); } else { media.addListener(paint); }
  }
  paint();

  window.GateIronTheme = {
    get: function () { return choice; },
    set: function (c) {
      choice = valid(c);
      root.setAttribute('data-gi-theme', choice);
      try { window.localStorage.setItem(KEY, choice); } catch (e) { /* this page still changes */ }
      paint();
    }
  };
})();
