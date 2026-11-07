'use strict';
// Headless Firefox over WebDriver BiDi with Node's own WebSocket: no dependency and no browser download. Resolves to
// null where Firefox is not installed, and the test skips. (NotUserError's test/browser.mjs is the fuller driver.)
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const which = (cmd) => { try { return execFileSync('which', [cmd]).toString().trim(); } catch { return null; } };

async function firefox() {
  const bin = process.env.FIREFOX || which('firefox');
  if (!bin) { return null; }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-firefox-'));
  const proc = spawn(bin, ['--headless', '--no-remote', '--profile', profile, '--remote-debugging-port=0'],
    { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, TMPDIR: profile } });
  const kill = () => { try { proc.kill('SIGKILL'); } catch { /* gone */ } fs.rmSync(profile, { recursive: true, force: true }); };
  process.once('exit', kill);
  const url = await new Promise((resolve, reject) => {
    let err = '';
    const timer = setTimeout(() => reject(new Error(`Firefox did not start: ${err}`)), 30000);
    proc.stderr.on('data', (d) => {
      err += d;
      const m = /WebDriver BiDi listening on (ws:\/\/\S+)/.exec(err);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    proc.on('exit', () => reject(new Error(`Firefox exited: ${err}`)));
  });
  const ws = new WebSocket(`${url}/session`);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id == null || !waiting.has(msg.id)) { return; }
    const { resolve, reject } = waiting.get(msg.id);
    waiting.delete(msg.id);
    if (msg.type === 'error') { reject(new Error(`${msg.error}: ${msg.message}`)); } else { resolve(msg.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    waiting.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send('session.new', { capabilities: {} });
  const tab = async () => {
    const { context } = await send('browsingContext.create', { type: 'tab' });
    return {
      context,
      /** The value of an expression in the page, through JSON. */
      eval: async (expression) => {
        const r = await send('script.evaluate', { target: { context }, awaitPromise: true,
          expression: `(async () => JSON.stringify(await (async () => (${expression}))() ?? null))()` });
        if (r.type === 'exception') { throw new Error(`in the page: ${r.exceptionDetails.text}`); }
        return r.result.type === 'string' ? JSON.parse(r.result.value) : undefined;
      },
      go: (to) => send('browsingContext.navigate', { context, url: to, wait: 'complete' }),
      reload: () => send('browsingContext.reload', { context, wait: 'complete' }),
      back: () => send('browsingContext.traverseHistory', { context, delta: -1 }),
      close: () => send('browsingContext.close', { context }),
      /** Presses each key in turn ("\uE015" is ArrowDown). */
      keys: (...ks) => send('input.performActions', { context, actions: [{ type: 'key', id: 'keys',
        actions: ks.flatMap((k) => [{ type: 'keyDown', value: k }, { type: 'keyUp', value: k }]) }] }),
    };
  };
  return {
    tab,
    /** Runs a function at the start of every page from now on, ahead of the page's own scripts. */
    preload: (fn) => send('script.addPreloadScript', { functionDeclaration: fn.toString() }),
    close: async () => {
      try { await send('session.end'); } catch { /* already going */ }
      const exited = proc.exitCode != null ? Promise.resolve() : new Promise((r) => proc.once('exit', r));
      proc.kill();
      const timer = setTimeout(() => proc.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(timer);
      fs.rmSync(profile, { recursive: true, force: true });
    },
  };
}

module.exports = { firefox };
