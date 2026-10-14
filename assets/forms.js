// THE FORM RULES (README, Forms), one file for both sides. On the server, require('gateiron-shared/forms')
// gives validEmail(), the one test of an address. In a page, a form marked data-submit-gate keeps its
// submit buttons disabled until every required field is filled and valid; an email field is checked
// with validEmail(), and a bad address is flagged, and announced, when the field is left, in the
// words of the form's data-msg-email. A form marked data-busy shows the moment it is sent: its submit
// button reads its data-busy-label (or the form's, or "Processing…") beside a spinner, and every
// submit button is disabled so it is sent once. Load with defer.
(function (root, api) {
  if (typeof module === 'object' && module.exports) { module.exports = api; } else { root.GateIronForms = api; }
  if (typeof document !== 'undefined') { api.start(document); }
})(typeof self !== 'undefined' ? self : this, (function () {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  function validEmail(value) {
    var v = String(value == null ? '' : value);
    return v.length <= 254 && EMAIL_RE.test(v);
  }

  function gate(form) {
    var buttons = form.querySelectorAll('button[type="submit"]');
    var emails = form.querySelectorAll('input[type="email"]');
    var message = form.getAttribute('data-msg-email') || 'Enter a valid email address.';

    function check() {
      var ok = form.checkValidity();
      Array.prototype.forEach.call(buttons, function (b) { b.disabled = !ok; });
    }

    Array.prototype.forEach.call(emails, function (input) {
      // Present and empty from the start, so a screen reader announces the words when they appear.
      var note = form.ownerDocument.createElement('p');
      note.className = 'field-error';
      note.id = (input.id || input.name) + 'Error';
      note.setAttribute('aria-live', 'polite');
      (input.closest('p, div, label') || input).insertAdjacentElement('afterend', note);

      function valid() { return validEmail(input.value.trim()); }
      function flag(show) {
        input.setAttribute('aria-invalid', show ? 'true' : 'false');
        if (show) { input.setAttribute('aria-describedby', note.id); } else { input.removeAttribute('aria-describedby'); }
        note.textContent = show ? message : '';
      }
      function setValidity() { input.setCustomValidity(input.value === '' || valid() ? '' : message); }
      input.addEventListener('input', function () { setValidity(); if (valid()) { flag(false); } });
      input.addEventListener('blur', function () { flag(input.value !== '' && !valid()); });
      setValidity();
    });

    form.addEventListener('input', check);
    form.addEventListener('change', check);
    // A browser that autofills may not fire input; look again once it has.
    setTimeout(check, 600);
    check();
  }

  // After the page's own submit handlers: one that sent the form by script and called
  // preventDefault() shows its own progress, so nothing changes.
  function busy(form, later) {
    var wait = later || setTimeout;
    var held = [];
    form.addEventListener('submit', function (e) {
      wait(function () {
        if (e.defaultPrevented) { return; }
        var buttons = form.querySelectorAll('button[type="submit"], button:not([type])');
        var pressed = e.submitter || buttons[0];
        Array.prototype.forEach.call(buttons, function (b) { held.push({ b: b, disabled: b.disabled, text: b.textContent }); b.disabled = true; });
        if (pressed) {
          pressed.setAttribute('aria-busy', 'true');
          pressed.textContent = pressed.getAttribute('data-busy-label') || form.getAttribute('data-busy-label') || 'Processing…';
        }
      }, 0);
    });
    // Back to a page the browser kept: as it was before it was sent.
    return function reset() {
      held.forEach(function (h) { h.b.disabled = h.disabled; h.b.textContent = h.text; h.b.removeAttribute('aria-busy'); });
      held = [];
    };
  }

  function start(doc) {
    function init() {
      Array.prototype.forEach.call(doc.querySelectorAll('form[data-submit-gate]'), gate);
      var resets = Array.prototype.map.call(doc.querySelectorAll('form[data-busy]'), function (f) { return busy(f); });
      var win = doc.defaultView;
      if (win && resets.length) { win.addEventListener('pageshow', function (e) { if (e.persisted) { resets.forEach(function (r) { r(); }); } }); }
    }
    if (doc.readyState === 'loading') { doc.addEventListener('DOMContentLoaded', init); } else { init(); }
  }

  return { validEmail: validEmail, gate: gate, busy: busy, start: start };
})());
