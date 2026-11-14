// A SETTINGS PAGE, one implementation for both sides: settingsHtml(opts) draws it (require it on the
// server as gateiron-shared/settings, or serve it and call window.GateIronSettings.settingsHtml), and
// in a page it wires every [data-gi-settings] on load (wire(el) for one added later): the category
// sidebar, search, the phone's drill-down, each row's modified mark and Reset, and the announcements.
// It holds no settings and saves nothing. A change fires 'gi-settings-change' on the root with
// detail { id, value, reset, done }; the site saves and calls done(true) or done(false), and a
// failed save puts the control back. An action row's button fires it with { id, action: true, done }.
(function (root, api) {
  if (typeof module === 'object' && module.exports) { module.exports = api; } else { root.GateIronSettings = api; }
  if (typeof document !== 'undefined' && typeof module === 'undefined') {
    var start = function () { Array.prototype.forEach.call(document.querySelectorAll('[data-gi-settings]'), api.wire); };
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); } else { start(); }
  }
})(typeof self !== 'undefined' ? self : this, (function () {
  'use strict';

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }

  var WORDS = {
    title: 'Preferences',
    searchLabel: 'Search preferences',
    navLabel: 'Categories',
    emptyText: 'No preferences match',
    resetLabel: 'Reset',
    modifiedLabel: 'Modified',
    savedText: 'Saved',
    failedText: 'Could not save',
    accountLabel: 'Manage your GateIron account'
  };
  var TYPES = ['switch', 'radio', 'select', 'number', 'range', 'action'];

  // A value as the DOM holds it, and back: switches are booleans, numbers numbers, and a radio or
  // select whose options are all numbers gives numbers.
  function str(v) { return v === true ? 'true' : v === false ? 'false' : String(v == null ? '' : v); }

  function control(row, fid, labelId, describedBy) {
    var described = describedBy ? ' aria-describedby="' + describedBy + '"' : '';
    var dis = (row.locked ? ' disabled' : '') + described;
    var v = str(row.value);
    if (row.type === 'switch') {
      return '<input type="checkbox" role="switch" id="' + fid + '"' + (row.value === true ? ' checked' : '') + dis + '>';
    }
    if (row.type === 'action') {
      // The button's name is its own words; the row's label and description say what it acts on.
      var about = ' aria-describedby="' + [labelId].concat(describedBy ? [describedBy] : []).join(' ') + '"';
      return row.href && !row.locked
        ? '<a class="btn btn-secondary btn-small gi-settings-action" id="' + fid + '" href="' + esc(row.href) + '"' + about + '>' + esc(row.actionLabel) + '</a>'
        : '<button type="button" class="btn btn-secondary btn-small gi-settings-action" id="' + fid + '"' + (row.locked ? ' disabled' : '') + about + '>' + esc(row.actionLabel) + '</button>';
    }
    if (row.type === 'number' || row.type === 'range') {
      var input = '<input type="' + row.type + '" id="' + fid + '" value="' + esc(v) + '"'
        + (row.min != null ? ' min="' + esc(row.min) + '"' : '') + (row.max != null ? ' max="' + esc(row.max) + '"' : '')
        + (row.step != null ? ' step="' + esc(row.step) + '"' : '') + dis + '>';
      // A slider shows its value beside it; a screen reader hears it from the slider itself.
      return row.type === 'number' ? input
        : '<span class="gi-settings-range">' + input + '<output class="gi-settings-range-value" for="' + fid + '" aria-hidden="true">' + esc(v) + '</output></span>';
    }
    var opts = row.options || [];
    if (row.type === 'select') {
      return '<select id="' + fid + '"' + dis + '>' + opts.map(function (o) {
        return '<option value="' + esc(str(o.value)) + '"' + (str(o.value) === v ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      }).join('') + '</select>';
    }
    return '<div class="gi-settings-choices" role="radiogroup" aria-labelledby="' + labelId + '"' + described + '>' + opts.map(function (o, i) {
      return '<label class="gi-settings-choice"><input type="radio" name="' + fid + '" id="' + fid + '-' + i + '" value="' + esc(str(o.value)) + '"'
        + (str(o.value) === v ? ' checked' : '') + (row.locked ? ' disabled' : '') + '> <span>' + esc(o.label) + '</span></label>';
    }).join('') + '</div>';
  }

  function rowHtml(row, w, prefix, modified) {
    var fid = prefix + '-' + esc(row.id);
    var labelId = fid + '-label';
    var own = row.controlHtml != null;
    if (!own && TYPES.indexOf(row.type) < 0) { throw new Error('gateiron-shared settings: row ' + row.id + ' has type ' + row.type + '; one of ' + TYPES.join(', ') + ', or controlHtml'); }
    if (row.type === 'action' && !row.actionLabel) { throw new Error('gateiron-shared settings: action row ' + row.id + ' needs an actionLabel'); }
    var numeric = (row.type === 'radio' || row.type === 'select') && (row.options || []).length
      && (row.options || []).every(function (o) { return typeof o.value === 'number'; });
    var action = !own && row.type === 'action';
    var kind = own ? 'own' : action ? 'action' : row.type === 'switch' ? 'boolean' : row.type === 'number' || row.type === 'range' || numeric ? 'number' : 'string';
    var labelTag = own || action || row.type === 'radio' ? 'span' : 'label';
    // The description and a locked row's reason are read with the control.
    var describedBy = [row.description ? fid + '-desc' : '', row.locked ? fid + '-lock' : ''].filter(Boolean).join(' ');
    var valued = !own && !action;
    return '<div class="gi-settings-row' + (own ? '' : ' gi-settings-row-' + row.type) + (modified ? ' gi-settings-is-modified' : '') + (row.locked ? ' gi-settings-is-locked' : '') + '" data-gi-row="' + esc(row.id) + '" data-kind="' + kind + '"'
      + (valued ? ' data-default="' + esc(str(row.default)) + '"' : '')
      + (row.keywords && row.keywords.length ? ' data-keywords="' + esc(row.keywords.join(' ')) + '"' : '') + '>'
      + '<div class="gi-settings-text">'
      + '<' + labelTag + ' class="gi-settings-label" id="' + labelId + '"' + (labelTag === 'label' ? ' for="' + fid + '"' : '') + '>' + esc(row.label) + '</' + labelTag + '>'
      + (row.description ? '<p class="gi-settings-desc" id="' + fid + '-desc">' + esc(row.description) + '</p>' : '')
      + (row.locked ? '<p class="gi-settings-lock" id="' + fid + '-lock">' + esc(row.locked) + '</p>' : '')
      + '</div>'
      + '<div class="gi-settings-control">' + (own ? String(row.controlHtml) : control(row, fid, labelId, describedBy)) + '</div>'
      + (!valued || row.locked ? '' : '<div class="gi-settings-state"><span class="gi-settings-modified">' + esc(w.modifiedLabel) + '</span>'
        + '<button type="button" class="btn btn-quiet btn-small gi-settings-reset" aria-label="' + esc(w.resetLabel + ' ' + row.label) + '">' + esc(w.resetLabel) + '</button></div>')
      + '</div>';
  }

  /** The whole page: plain data in, escaped HTML out. Every word is an option (WORDS). */
  function settingsHtml(opts) {
    var o = opts || {};
    var w = {};
    Object.keys(WORDS).forEach(function (k) { w[k] = o[k] != null ? o[k] : WORDS[k]; });
    var back = o.backLabel != null ? o.backLabel : w.title;
    var prefix = 'gi-set';
    var cats = o.categories || [];
    var modified = function (r) { return r.controlHtml == null && r.type !== 'action' && !r.locked && str(r.value) !== str(r.default); };
    return '<div class="gi-settings" data-gi-settings data-saved="' + esc(w.savedText) + '" data-failed="' + esc(w.failedText) + '"'
      + (o.start != null ? ' data-gi-start="' + esc(o.start) + '"' : '') + '>'
      + '<div class="gi-settings-side">'
      + '<h1 class="gi-settings-title">' + esc(w.title) + '</h1>'
      + '<label class="gi-settings-search"><span class="gi-sr-only">' + esc(w.searchLabel) + '</span>'
      + '<input type="search" placeholder="' + esc(w.searchLabel) + '" autocomplete="off"' + (o.query ? ' value="' + esc(o.query) + '"' : '') + ' data-gi-settings-search></label>'
      + '<nav class="gi-settings-nav" aria-label="' + esc(w.navLabel) + '"><ul>' + cats.map(function (c) {
        return '<li><a href="#' + esc(c.id) + '" data-gi-cat="' + esc(c.id) + '">' + esc(c.label) + '</a></li>';
      }).join('') + '</ul></nav>'
      + (o.accountHref ? '<a class="gi-settings-account" href="' + esc(o.accountHref) + '">' + esc(w.accountLabel) + '</a>' : '')
      + '</div>'
      + '<div class="gi-settings-pane">'
      + '<a class="gi-settings-back" href="#" data-gi-settings-back>' + esc(back) + '</a>'
      + '<p class="gi-settings-empty" hidden>' + esc(w.emptyText) + '</p>'
      + cats.map(function (c) {
        return '<section class="gi-settings-cat" id="' + esc(c.id) + '" data-gi-cat="' + esc(c.id) + '" aria-labelledby="' + prefix + '-h-' + esc(c.id) + '">'
          + '<h2 id="' + prefix + '-h-' + esc(c.id) + '" tabindex="-1">' + esc(c.label) + '</h2>'
          + (c.rows || []).map(function (r) {
            return rowHtml(r, w, prefix, modified(r));
          }).join('')
          + '</section>';
      }).join('')
      + '</div>'
      + '<p class="gi-sr-only" role="status" aria-live="polite" data-gi-settings-status></p>'
      + '</div>';
  }

  // ---------------- the page's half ----------------

  var PHONE = '(max-width: 48rem)';

  function read(row) {
    var kind = row.getAttribute('data-kind');
    var el = row.querySelector('.gi-settings-control input:checked, .gi-settings-control select, .gi-settings-control input:not([type=radio])');
    if (!el) { return kind === 'boolean' ? false : null; }
    if (kind === 'boolean') { return el.checked; }
    return kind === 'number' ? Number(el.value) : el.value;
  }
  function put(row, v) {
    var s = str(v);
    Array.prototype.forEach.call(row.querySelectorAll('.gi-settings-control input, .gi-settings-control select'), function (el) {
      if (el.type === 'checkbox') { el.checked = s === 'true'; } else if (el.type === 'radio') { el.checked = el.value === s; } else { el.value = s; }
    });
    shows(row);
  }
  // A slider's value beside it.
  function shows(row) {
    var out = row.querySelector('.gi-settings-range-value');
    if (out) { out.textContent = row.querySelector('.gi-settings-control input[type=range]').value; }
  }
  function fromDefault(row) {
    var d = row.getAttribute('data-default');
    var kind = row.getAttribute('data-kind');
    return kind === 'boolean' ? d === 'true' : kind === 'number' ? Number(d) : d;
  }
  function mark(row) {
    row.classList.toggle('gi-settings-is-modified', str(read(row)) !== row.getAttribute('data-default'));
  }

  // The words a row is found by, and its text put back with each match marked.
  function highlight(el, words) {
    if (!el) { return; }
    var text = el.getAttribute('data-text');
    if (text == null) { text = el.textContent; el.setAttribute('data-text', text); }
    el.textContent = '';
    var lower = text.toLowerCase();
    var at = 0;
    while (words) {
      var i = lower.indexOf(words, at);
      if (i < 0) { break; }
      el.appendChild(document.createTextNode(text.slice(at, i)));
      var m = document.createElement('mark');
      m.className = 'gi-settings-hit';
      m.textContent = text.slice(i, i + words.length);
      el.appendChild(m);
      at = i + words.length;
    }
    el.appendChild(document.createTextNode(text.slice(at)));
  }

  function announce(rootEl, text) {
    var status = rootEl.querySelector('[data-gi-settings-status]');
    status.textContent = '';
    window.setTimeout(function () { status.textContent = text; }, 50);
  }

  /** Saved, or Could not save, announced for a save the site made itself (a controlHtml row). */
  function say(el, ok) {
    var rootEl = el.closest('[data-gi-settings]');
    announce(rootEl, rootEl.getAttribute(ok ? 'data-saved' : 'data-failed'));
  }

  /** The category open by choice (a # or start): a redrawn page passes it as start. A panel (opened
      with start) with none open gives '', which redraws a panel at its overview; a page gives null. */
  function openCategory(el) {
    var rootEl = el.closest('[data-gi-settings]');
    return rootEl.getAttribute('data-gi-open') || (rootEl.hasAttribute('data-gi-start') ? '' : null);
  }

  function wire(rootEl) {
    if (!rootEl || rootEl.getAttribute('data-gi-wired')) { return; }
    rootEl.setAttribute('data-gi-wired', '1');
    var search = rootEl.querySelector('[data-gi-settings-search]');
    var empty = rootEl.querySelector('.gi-settings-empty');
    var cats = Array.prototype.slice.call(rootEl.querySelectorAll('section.gi-settings-cat'));
    var links = Array.prototype.slice.call(rootEl.querySelectorAll('.gi-settings-nav a'));
    var phone = window.matchMedia ? window.matchMedia(PHONE) : { matches: false };
    var say = function (text) { announce(rootEl, text); };

    // The category the address's # names, if any.
    function named() {
      var id = window.location.hash.slice(1);
      try { id = decodeURIComponent(id); } catch (e) { /* as written */ }
      return cats.filter(function (c) { return c.getAttribute('data-gi-cat') === id; })[0] || null;
    }
    // A page opened with start is a panel over another page: its category and search live in the
    // panel, never in that page's address or history. A page's live in its # and ?q=.
    var panel = rootEl.hasAttribute('data-gi-start');
    var chosen = cats.filter(function (c) { return c.getAttribute('data-gi-cat') === rootEl.getAttribute('data-gi-start'); })[0] || null;
    // A # naming no category (the skip link's #main, a site's own anchor) keeps the open one.
    var last = null;
    function current() {
      if (panel) { return chosen; }
      var c = named();
      if (c) { last = c; return c; }
      return window.location.hash.length > 1 ? last : null;
    }
    function show() {
      var q = search.value.trim().toLowerCase();
      var picked = current();
      var open = picked || (phone.matches ? null : cats[0]);
      rootEl.classList.toggle('gi-settings-searching', !!q);
      rootEl.classList.toggle('gi-settings-in-cat', !!picked);
      rootEl.setAttribute('data-gi-open', picked ? picked.getAttribute('data-gi-cat') : '');
      var found = 0;
      cats.forEach(function (c) {
        var any = 0;
        Array.prototype.forEach.call(c.querySelectorAll('.gi-settings-row'), function (row) {
          var label = row.querySelector('.gi-settings-label');
          var desc = row.querySelector('.gi-settings-desc');
          var hay = [label && (label.getAttribute('data-text') || label.textContent), desc && (desc.getAttribute('data-text') || desc.textContent),
            row.getAttribute('data-keywords')].join(' ').toLowerCase();
          var hit = !q || hay.indexOf(q) >= 0;
          row.hidden = !hit;
          highlight(label, q);
          highlight(desc, q);
          if (hit) { any++; }
        });
        found += any;
        c.hidden = q ? !any : c !== open;
      });
      empty.hidden = !q || found > 0;
      links.forEach(function (a) {
        if (open && a.getAttribute('data-gi-cat') === open.getAttribute('data-gi-cat') && !q) { a.setAttribute('aria-current', 'true'); } else { a.removeAttribute('aria-current'); }
      });
    }
    function address() {
      if (panel) { return; }
      var u = new URL(window.location.href);
      if (search.value.trim()) { u.searchParams.set('q', search.value.trim()); } else { u.searchParams.delete('q'); }
      window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    }

    if (!panel) { search.value = new URL(window.location.href).searchParams.get('q') || ''; }
    search.addEventListener('input', function () { address(); show(); });
    // A page redrawn by the site (a new settingsHtml in its place, wired again) keeps its category
    // and search, which live in the address; the old one's window listeners go with it.
    var onHash = function () {
      if (!rootEl.isConnected) { window.removeEventListener('hashchange', onHash); return; }
      if (window.location.hash.length > 1 && !named()) { return; }
      show();
      var c = current();
      if (c) { c.querySelector('h2').focus(); } else if (!search.contains(document.activeElement)) { search.focus(); }
    };
    var onPhone = function () {
      if (!rootEl.isConnected) { phone.removeEventListener('change', onPhone); return; }
      show();
    };
    if (panel) {
      links.forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          chosen = cats.filter(function (c) { return c.getAttribute('data-gi-cat') === a.getAttribute('data-gi-cat'); })[0] || null;
          show();
          if (chosen) { chosen.querySelector('h2').focus(); }
        });
      });
    } else {
      window.addEventListener('hashchange', onHash);
    }
    if (phone.addEventListener) { phone.addEventListener('change', onPhone); }
    rootEl.querySelector('[data-gi-settings-back]').addEventListener('click', function (e) {
      e.preventDefault();
      chosen = null;
      last = null;
      if (!panel && named()) { window.history.pushState(window.history.state, '', window.location.pathname + window.location.search); }
      show();
      search.focus();
    });

    function change(row, reset) {
      var before = row.getAttribute('data-saved-value');
      // An empty number, or one outside its min, max or step, is not sent: the saved one comes back.
      var num = row.querySelector('.gi-settings-control input[type=number]');
      if (num && (num.value === '' || !num.validity.valid)) {
        put(row, before);
        mark(row);
        say(rootEl.getAttribute('data-failed'));
        return;
      }
      var value = read(row);
      var answered = false;
      mark(row);
      rootEl.dispatchEvent(new CustomEvent('gi-settings-change', { bubbles: true, detail: {
        id: row.getAttribute('data-gi-row'), value: value, reset: !!reset,
        done: function (ok) {
          if (answered) { return; }
          answered = true;
          if (ok) { row.setAttribute('data-saved-value', str(value)); } else { put(row, before); }
          mark(row);
          say(rootEl.getAttribute(ok ? 'data-saved' : 'data-failed'));
        }
      } }));
    }
    function act(row) {
      rootEl.dispatchEvent(new CustomEvent('gi-settings-change', { bubbles: true, detail: {
        id: row.getAttribute('data-gi-row'), action: true,
        done: function (ok) { say(rootEl.getAttribute(ok ? 'data-saved' : 'data-failed')); }
      } }));
    }
    Array.prototype.forEach.call(rootEl.querySelectorAll('.gi-settings-row'), function (row) {
      var kind = row.getAttribute('data-kind');
      if (kind === 'own') { return; }
      if (kind === 'action') {
        var button = row.querySelector('button.gi-settings-action');
        if (button) { button.addEventListener('click', function () { act(row); }); }
        return;
      }
      row.setAttribute('data-saved-value', str(read(row)));
      row.querySelector('.gi-settings-control').addEventListener('change', function () { change(row, false); });
      row.querySelector('.gi-settings-control').addEventListener('input', function () { shows(row); });
      var reset = row.querySelector('.gi-settings-reset');
      if (reset) {
        reset.addEventListener('click', function () {
          put(row, fromDefault(row));
          change(row, true);
          // Reset hides itself; the focus goes to what it changed.
          row.querySelector('.gi-settings-control input:checked, .gi-settings-control select, .gi-settings-control input:not([type=radio])').focus();
        });
      }
    });
    show();
  }

  return { settingsHtml: settingsHtml, wire: wire, say: say, openCategory: openCategory, esc: esc };
})());
