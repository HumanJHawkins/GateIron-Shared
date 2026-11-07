'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Linter } = require('eslint');
const gateiron = require('../eslint');

const lint = (code, allow, calls) => new Linter().verify(code, {
  plugins: { gateiron },
  languageOptions: { ecmaVersion: 2023, sourceType: 'script' },
  rules: { 'gateiron/relative-urls': ['error', Object.assign({}, allow ? { allow } : {}, calls ? { calls } : {})] },
}).map((m) => m.message.match(/"([^"]*)"/)[1]);

test('a root-relative page, form or API address is reported where a browser goes or sends', () => {
  assert.deepStrictEqual(lint(`
    fetch('/api/me'); window.fetch(\`/api/\${x}\`); fetch('/shop/' + id);
    const r = new XMLHttpRequest(); r.open('POST', '/api/x');
    new EventSource('/live'); navigator.sendBeacon('/beacon', d); window.open('/print');
    location.href = '/shop/cart'; location = '/'; location.assign('/a'); location.replace('/b'); a.href = '/c'; f.action = '/d';
    const h = '<a href="/list/' + code + '">' + \`<form action="/auth/logout">\`;
    const menu = [{ href: '/profile' }, { label: 'x', action: '/admin/view-as' }];
    history.pushState(null, '', '/e'); post('/api/f', {}); cart.post('/api/g');
  `, undefined, ['post']), ['/api/me', '/api/', '/shop/', '/api/x', '/live', '/beacon', '/print', '/shop/cart', '/', '/a', '/b', '/c', '/d', '/list/', '/auth/logout', '/profile', '/admin/view-as', '/e', '/api/f', '/api/g']);
});

test('relative, absolute, other-site and static addresses pass, and allow adds more', () => {
  assert.deepStrictEqual(lint(`
    fetch('api/me'); fetch('https://gateiron.com/x'); fetch('//cdn.example/x'); location.href = 'shop/cart';
    const css = '<link href="/css/site.css"><script src="/js/a.js"></script><img src="/image/a.png"><a href="#main">';
    res.redirect('/signin'); const p = '/u/' + key; a.href = '/oauth/auth';
  `, ['/oauth/']), []);
});

test('rootRelative finds them in an HTML file, with the line', () => {
  assert.deepStrictEqual(gateiron.rootRelative('<a href="shop">\n<a href="/shop">\n<link href="/css/a.css">\n<form action=\'/x\'>'),
    [{ attr: 'href', url: '/shop', line: 2 }, { attr: 'action', url: '/x', line: 4 }]);
});
