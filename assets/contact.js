// The contact form's page behaviour (contactForm() in contact.js): send in the background and show
// the answer in the status line, and keep an unsent draft in localStorage. The words and the draft
// key come from the form's data- attributes. Load with defer.
(function () {
  var FIELDS = ['name', 'email', 'subject', 'message'];   // never the hidden field

  function resetTurnstile() {
    // Its tokens are single-use: every attempt needs a fresh one.
    if (window.turnstile) { try { window.turnstile.reset(); } catch (e) { /* no widget */ } }
  }

  function setUp(form) {
    var d = form.dataset;
    var status = form.querySelector('.gi-contact-status');
    var button = form.querySelector('.gi-contact-submit');
    var label = button.querySelector('.gi-contact-submit-label');
    var idle = label.textContent;

    function say(kind, text) {
      status.className = 'gi-contact-status is-shown is-' + kind;
      status.textContent = text;
    }
    function done() { button.disabled = !form.checkValidity(); label.textContent = idle; resetTurnstile(); }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      button.disabled = true;
      label.textContent = d.msgSending;
      status.className = 'gi-contact-status';
      // URL-encoded, not multipart: no files here, and every server parses it without help.
      fetch(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)), headers: { Accept: 'application/json' } })
        .then(function (res) {
          return res.text().then(function (text) {
            var data = null;
            try { data = JSON.parse(text); } catch (err) { /* not JSON */ }
            return { ok: res.ok, data: data };
          });
        })
        .then(function (r) {
          done();
          if (r.ok && r.data) {
            say('ok', r.data.message || d.msgSent);
            form.reset();
            button.disabled = true;   // empty again (forms.js re-enables it as the fields fill)
            try { localStorage.removeItem(d.draftKey); } catch (err) { /* no storage */ }
          } else {
            say('error', (r.data && r.data.error) || d.msgUnexpected);
          }
        })
        .catch(function () { done(); say('error', d.msgNetwork); });
    });

    try {
      var saved = JSON.parse(localStorage.getItem(d.draftKey) || '{}');
      FIELDS.forEach(function (n) { if (saved[n] && form.elements[n]) { form.elements[n].value = saved[n]; } });
    } catch (err) { /* no storage: no draft */ }
    var timer;
    form.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        try {
          var data = {};
          FIELDS.forEach(function (n) { if (form.elements[n]) { data[n] = form.elements[n].value; } });
          localStorage.setItem(d.draftKey, JSON.stringify(data));
        } catch (err) { /* no storage */ }
      }, 300);
    });
  }

  function init() { Array.prototype.forEach.call(document.querySelectorAll('form.gi-contact-form'), setUp); }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
