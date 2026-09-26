'use strict';
// THE CONTACT FORM, for any GateIron site: contactForm() writes the section (plain data in, escaped
// HTML out), readContact() and verifyTurnstile() check a submission on the server. The site keeps
// its own route, rate limit, mail transport and the words it answers with. Styles are
// assets/contact.css, behaviour assets/contact.js; both are scoped to .gi-contact.
const { esc } = require('./chrome.js');

// The same limits the fields carry as maxlength, so the browser and the server agree.
const LIMITS = Object.freeze({ name: 200, email: 254, subject: 200, message: 50000 });
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const DEFAULT_MESSAGES = Object.freeze({
  sending: 'Sending…',
  sent: 'Thanks — your message has been sent.',
  network: 'Network error — please check your connection and try again.',
  unexpected: 'The server returned an unexpected response. Please try again.',
});

// A CSS url() inside an attribute: quotes, backslashes and line breaks escaped for CSS, then the
// whole value escaped for HTML.
const cssUrl = (u) => 'url("' + String(u).replace(/[\\"]/g, '\\$&').replace(/[\n\r\f]/g, '') + '")';

function field(id, label, control) {
  return '<div class="gi-contact-field"><label for="' + id + '">' + esc(label) + '</label>' + control + '</div>';
}

/**
 * The contact section. Every option but `action` has a default.
 *   action        where the form posts (the site's own route)
 *   label         the small line above the heading
 *   title         the heading, an <h1>
 *   lead          a paragraph under the heading
 *   placeholder   example text in the message box
 *   submitLabel   the button's words
 *   note          a line beside the button
 *   backdrop      an image address for the section's background (sets --gi-contact-backdrop inline;
 *                 a site whose policy forbids inline styles sets that property in its own CSS)
 *   turnstileSiteKey  renders Cloudflare Turnstile; the site loads its script and allows it
 *   draftKey      localStorage key for the unsent draft
 *   messages      { sending, sent, network, unexpected } for the page script
 *   afterHtml     trusted HTML placed after the form, unescaped
 *   idPrefix      prefix for the field ids, for two forms on one page
 */
function contactForm(opts) {
  const o = opts || {};
  if (!o.action) { throw new Error('contactForm: action is required'); }
  const p = o.idPrefix || 'gi-contact';
  const m = Object.assign({}, DEFAULT_MESSAGES, o.messages);
  const style = o.backdrop ? ' style="' + esc('--gi-contact-backdrop: ' + cssUrl(o.backdrop)) + '"' : '';
  const data = ' data-draft-key="' + esc(o.draftKey || 'gi-contact-draft') + '"'
    + Object.entries(m).map(([k, v]) => ' data-msg-' + k + '="' + esc(v) + '"').join('');
  return '<section class="gi-contact"' + style + '>'
    + '<div class="gi-contact-inner">'
    + '<div class="gi-contact-head">'
    + '<span class="gi-contact-label">' + esc(o.label || 'Get in touch') + '</span>'
    + '<h1 class="gi-contact-title">' + esc(o.title || 'What can we do for you?') + '</h1>'
    + (o.lead ? '<p class="gi-contact-lead">' + esc(o.lead) + '</p>' : '')
    + '</div>'
    + '<form class="gi-contact-form" action="' + esc(o.action) + '" method="POST"' + data + '>'
    + field(p + '-name', 'Name', '<input type="text" id="' + p + '-name" name="name" maxlength="' + LIMITS.name + '" required autocomplete="name">')
    + field(p + '-email', 'Email address', '<input type="email" id="' + p + '-email" name="email" maxlength="' + LIMITS.email + '" required autocomplete="email">')
    + field(p + '-subject', 'Subject', '<input type="text" id="' + p + '-subject" name="subject" maxlength="' + LIMITS.subject + '" required>')
    + field(p + '-message', 'Message', '<textarea id="' + p + '-message" name="message" maxlength="' + LIMITS.message + '" required'
      + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + '></textarea>')
    // Hidden from people, filled by bots; a submission that fills it is answered as sent and dropped.
    + '<div class="gi-contact-extra" aria-hidden="true"><label for="' + p + '-homepage">Website</label>'
    + '<input type="text" id="' + p + '-homepage" name="homepage" tabindex="-1" autocomplete="off"></div>'
    + (o.turnstileSiteKey ? '<div class="gi-contact-field"><div class="cf-turnstile" data-sitekey="' + esc(o.turnstileSiteKey) + '" data-theme="auto"></div></div>' : '')
    + '<div class="gi-contact-actions">'
    + '<button type="submit" class="btn btn-primary gi-contact-submit"><span class="gi-contact-submit-label">'
    + esc(o.submitLabel || 'Send message') + '</span> <span class="gi-contact-arrow" aria-hidden="true">→</span></button>'
    + (o.note ? '<span class="gi-contact-note">' + esc(o.note) + '</span>' : '')
    + '</div>'
    + '<div class="gi-contact-status" role="status" aria-live="polite"></div>'
    + '</form>'
    + (o.afterHtml || '')
    + '</div></section>';
}

const stripTags = (v) => String(v).replace(/<[^>]*>/g, '');
const oneLine = (v) => stripTags(v).replace(/[\r\n]+/g, ' ').trim();

/**
 * A posted form, checked. One of:
 *   { spam: true }                      the hidden field was filled: answer as sent, send nothing
 *   { problem: 'incomplete' }           a field is empty or the address is not one
 *   { problem: 'too-long' }             a field is over its limit
 *   { fields: { name, email, subject, message } }   tags stripped, name and subject on one line
 */
function readContact(body) {
  const b = body || {};
  if (b.homepage) { return { spam: true }; }
  const f = {
    name: oneLine(b.name || ''), email: String(b.email || '').trim(),
    subject: oneLine(b.subject || ''), message: stripTags(b.message || '').trim(),
  };
  if (!f.name || !f.subject || !f.message || !EMAIL_RE.test(f.email)) { return { problem: 'incomplete' }; }
  if (Object.keys(LIMITS).some((k) => f[k].length > LIMITS[k])) { return { problem: 'too-long' }; }
  return { fields: f };
}

// Cloudflare Turnstile. True with no secret configured; false on a missing or forged token; true
// when Cloudflare itself cannot be reached, so its outage does not take the form down.
async function verifyTurnstile(secret, token, ip) {
  if (!secret) { return true; }
  if (!token) { return false; }
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip || '' }), signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return !!data && data.success === true;
  } catch { return true; }
}

module.exports = { contactForm, readContact, verifyTurnstile, LIMITS, DEFAULT_MESSAGES };
