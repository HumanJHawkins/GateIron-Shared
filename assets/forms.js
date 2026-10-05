// THE FORM RULES (README, Forms), one file for both sides. On the server, require('gateiron-shared/forms')
// gives validEmail(), the one test of an address. In a page, a form marked data-submit-gate keeps its
// submit buttons disabled until every required field is filled and valid; an email field is checked
// with validEmail(), and a bad address is flagged, and announced, when the field is left, in the
// words of the form's data-msg-email. Load with defer.
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

  function start(doc) {
    function init() { Array.prototype.forEach.call(doc.querySelectorAll('form[data-submit-gate]'), gate); }
    if (doc.readyState === 'loading') { doc.addEventListener('DOMContentLoaded', init); } else { init(); }
  }

  return { validEmail: validEmail, gate: gate, start: start };
})());
