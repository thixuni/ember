/*
 * gcal.js, the main-process half of Google Calendar, against a fake Google.
 * Run with: npm test
 *
 * The real sign-in needs a browser and a Google account, so this stands in
 * for both: it catches the URL that would open in the browser, plays the
 * browser's part by calling the loopback server back, and answers the token
 * and Calendar endpoints itself.
 */
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const crypto = require('crypto');
const Module = require('module');

/* electron does not exist under plain node; gcal.js only needs safeStorage. */
const fakeSafe = {available: true,
  isEncryptionAvailable(){ return this.available; },
  encryptString: s => Buffer.from('X' + s),
  decryptString: b => b.toString().slice(1)};
const realLoad = Module._load;
Module._load = function(req, ...rest){
  if(req === 'electron') return {shell: {openExternal(){}}, safeStorage: fakeSafe};
  return realLoad.call(this, req, ...rest);
};
const makeGcal = require('../gcal');

const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ID = 'abc123.apps.googleusercontent.com';

function store(){
  let s = {};
  return {read: () => JSON.parse(JSON.stringify(s)), write: p => { s = Object.assign(s, p); return s; }};
}
const json = (status, body) => ({ok: status >= 200 && status < 300, status, json: async () => body});

/* Plays the browser: follows the redirect back to the loopback server. */
function comeBack(authUrl, params){
  const u = new URL(authUrl);
  const back = new URL(u.searchParams.get('redirect_uri'));
  for(const [k, v] of Object.entries(params(u))) back.searchParams.set(k, v);
  return new Promise((res, rej) => http.get(back, r => { r.resume(); r.on('end', res); }).on('error', rej));
}

test('secrets are sealed with the OS keychain, and say so when they cannot be', () => {
  const g = makeGcal(() => ({}), () => ({}));
  fakeSafe.available = true;
  const a = g._seal('hunter2');
  assert.ok(a.startsWith('enc:') && a.indexOf('hunter2') < 0, 'should not store the secret in the clear');
  assert.strictEqual(g._unseal(a), 'hunter2');
  fakeSafe.available = false;
  assert.strictEqual(g._seal('hunter2'), 'raw:hunter2');
  assert.strictEqual(g._unseal('raw:hunter2'), 'hunter2');
  fakeSafe.available = true;
  assert.strictEqual(g._unseal('nonsense'), '');
});

test('requests outside the Calendar API are refused before any network', async () => {
  let called = 0;
  const g = makeGcal(() => ({}), () => ({}), {fetch: async () => { called++; return json(200, {}); }});
  for(const p of ['/../drive/v3/files', 'https://evil.example/', '/calendars/primary/acl', '/users/me/settings', '/files']){
    const r = await g.request({method: 'GET', path: p});
    assert.strictEqual(r.ok, false, p + ' should be refused');
  }
  assert.strictEqual((await g.request({method: 'TRACE', path: '/calendars/primary/events'})).ok, false);
  assert.strictEqual(called, 0, 'nothing should have reached the network');
});

test('a Client ID that is not one is turned away with a plain reason', async () => {
  const g = makeGcal(() => ({}), () => ({}));
  const r = await g.connect({clientId: 'my-project', clientSecret: 's'});
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /apps\.googleusercontent\.com/);
});

test('the full sign-in: browser, loopback, PKCE, tokens, account', async () => {
  const st = store();
  let authUrl = '';
  const seen = {};
  const fetchFn = async (url, init) => {
    if(url.startsWith('https://oauth2.googleapis.com/token')){
      const f = new URLSearchParams(init.body);
      seen.token = Object.fromEntries(f);
      /* PKCE: the verifier sent now must hash to the challenge sent earlier. */
      const challenge = new URL(authUrl).searchParams.get('code_challenge');
      const ok = b64url(crypto.createHash('sha256').update(f.get('code_verifier')).digest()) === challenge;
      if(!ok || f.get('code') !== 'the-code') return json(400, {error: 'invalid_grant'});
      return json(200, {access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600});
    }
    if(url === 'https://www.googleapis.com/calendar/v3/calendars/primary'){
      seen.auth = init.headers.Authorization;
      return json(200, {id: 'someone@example.com'});
    }
    throw new Error('unexpected ' + url);
  };
  const g = makeGcal(st.read, st.write, {fetch: fetchFn, openExternal: u => {
    authUrl = u;
    comeBack(u, a => ({code: 'the-code', state: a.searchParams.get('state')}));
  }});

  const r = await g.connect({clientId: ID, clientSecret: 'shh'});
  assert.deepStrictEqual(r, {ok: true, email: 'someone@example.com'});

  const a = new URL(authUrl).searchParams;
  assert.strictEqual(a.get('client_id'), ID);
  assert.strictEqual(a.get('code_challenge_method'), 'S256');
  assert.strictEqual(a.get('access_type'), 'offline');
  assert.match(a.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(a.get('scope'), /calendar\.events/);
  assert.strictEqual(seen.token.redirect_uri, a.get('redirect_uri'), 'token exchange must repeat the redirect');
  assert.strictEqual(seen.auth, 'Bearer AT1');

  const saved = st.read().gcal;
  assert.ok(saved.refresh.startsWith('enc:') && saved.refresh.indexOf('RT1') < 0, 'refresh token must be sealed');
  assert.ok(saved.secret.indexOf('shh') < 0, 'client secret must be sealed');
  const s = g.status();
  assert.deepStrictEqual([s.connected, s.email, s.clientId, s.hasSecret], [true, 'someone@example.com', ID, true]);
  assert.deepStrictEqual(s.parts, {account: false, calendar: true, drive: false});
  assert.strictEqual(a.get('include_granted_scopes'), 'true', 'a later ask must keep what was granted before');
});

test('a callback with the wrong state is rejected, not trusted', async () => {
  const g = makeGcal(store().read, store().write, {
    fetch: async () => { throw new Error('should not exchange a code it cannot trust'); },
    openExternal: u => comeBack(u, () => ({code: 'x', state: 'forged'}))
  });
  const r = await g.connect({clientId: ID, clientSecret: 's'});
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /did not match/);
});

test('declining in Google comes back as a sentence', async () => {
  const g = makeGcal(store().read, store().write, {
    fetch: async () => json(500, {}),
    openExternal: u => comeBack(u, a => ({error: 'access_denied', state: a.searchParams.get('state')}))
  });
  const r = await g.connect({clientId: ID, clientSecret: 's'});
  assert.deepStrictEqual(r, {ok: false, error: 'You declined access in Google.'});
});

test('an expired access token is refreshed once and the call retried', async () => {
  const st = store();
  const g0 = makeGcal(st.read, st.write);
  st.write({gcal: {clientId: ID, secret: g0._seal('shh'), refresh: g0._seal('RT1'), email: 'x@y'}});
  let refreshes = 0, calls = 0;
  const g = makeGcal(st.read, st.write, {fetch: async (url, init) => {
    if(url.startsWith('https://oauth2.googleapis.com/token')){ refreshes++; return json(200, {access_token: 'AT' + refreshes, expires_in: 3600}); }
    calls++;
    return init.headers.Authorization === 'Bearer AT1' ? json(401, {}) : json(200, {items: []});
  }});
  const r = await g.request({method: 'GET', path: '/users/me/calendarList'});
  assert.strictEqual(r.ok, true);
  assert.strictEqual(refreshes, 2);
  assert.strictEqual(calls, 2);
});

test('a dead refresh token disconnects instead of retrying forever', async () => {
  const st = store();
  const g0 = makeGcal(st.read, st.write);
  st.write({gcal: {clientId: ID, secret: g0._seal('shh'), refresh: g0._seal('RT1'), email: 'x@y'}});
  const g = makeGcal(st.read, st.write, {fetch: async url =>
    url.startsWith('https://oauth2.googleapis.com/token') ? json(400, {error: 'invalid_grant'}) : json(200, {})});
  const r = await g.request({method: 'GET', path: '/users/me/calendarList'});
  assert.deepStrictEqual([r.ok, r.error], [false, 'reconnect']);
  assert.strictEqual(g.status().connected, false);
  assert.strictEqual(g.status().clientId, ID, 'the Client ID should survive, so reconnecting is one click');
});

/* ---- signing in with Google, and Drive ---- */

const fakeIdToken = c => 'x.' + b64url(Buffer.from(JSON.stringify(c))) + '.y';

test('signing in with Google asks only who you are, and uses the shipped client', async () => {
  const st = store();
  let authUrl = '', sent = null;
  const g = makeGcal(st.read, st.write, {builtIn: {clientId: ID, clientSecret: 'shipped'},
    fetch: async (url, init) => {
      if(url.startsWith('https://oauth2.googleapis.com/token')){
        sent = Object.fromEntries(new URLSearchParams(init.body));
        return json(200, {access_token: 'AT', refresh_token: 'RT', expires_in: 3600, scope: 'openid email profile',
          id_token: fakeIdToken({email: 'ana@example.com', name: 'Ana Silva', given_name: 'Ana'})});
      }
      throw new Error('signing in should not touch any API: ' + url);
    },
    openExternal: u => { authUrl = u; comeBack(u, a => ({code: 'c', state: a.searchParams.get('state')})); }});
  const r = await g.connect({want: ['account']});
  assert.deepStrictEqual(r, {ok: true, email: 'ana@example.com', name: 'Ana Silva'});
  assert.strictEqual(new URL(authUrl).searchParams.get('scope'), 'openid email profile');
  assert.strictEqual(sent.client_secret, 'shipped');
  const s = g.status();
  assert.deepStrictEqual([s.email, s.first, s.builtIn, s.clientId], ['ana@example.com', 'Ana', true, ''],
    'the shipped client is not written down, so the keys of a new build take over');
  assert.deepStrictEqual(s.parts, {account: true, calendar: false, drive: false});
});

test('adding Drive later keeps the account, and Drive reaches only files', async () => {
  const st = store();
  const g0 = makeGcal(st.read, st.write);
  st.write({gcal: {refresh: g0._seal('RT0'), scopes: ['openid', 'email', 'profile'], email: 'ana@example.com', name: 'Ana Silva', first: 'Ana'}});
  let authUrl = '';
  const calls = [];
  const g = makeGcal(st.read, st.write, {builtIn: {clientId: ID, clientSecret: 's'},
    fetch: async (url, init) => {
      if(url.startsWith('https://oauth2.googleapis.com/token'))
        return json(200, {access_token: 'AT', refresh_token: 'RT1', expires_in: 3600,
          scope: 'openid email profile https://www.googleapis.com/auth/drive.file'});
      calls.push({url, init});
      return json(200, {id: 'F1'});
    },
    openExternal: u => { authUrl = u; comeBack(u, a => ({code: 'c', state: a.searchParams.get('state')})); }});
  const r = await g.connect({want: ['drive']});
  assert.strictEqual(r.ok, true);
  assert.strictEqual(new URL(authUrl).searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
  const s = g.status();
  assert.deepStrictEqual([s.email, s.name], ['ana@example.com', 'Ana Silva'], 'the profile from signing in survives');
  assert.deepStrictEqual(s.parts, {account: true, calendar: false, drive: true});

  for(const p of ['/about', '/files/abc/permissions', '/files/../x', '/changes']){
    assert.strictEqual((await g.request({api: 'drive', method: 'GET', path: p})).ok, false, p + ' should be refused');
  }
  assert.strictEqual((await g.request({api: 'photos', method: 'GET', path: '/files'})).ok, false);
  assert.strictEqual(calls.length, 0);

  const up = await g.request({api: 'upload', method: 'POST', path: '/files', query: {uploadType: 'multipart'},
    upload: {meta: {name: 'backup.json'}, content: '{"tasks":[]}', type: 'application/json'}});
  assert.strictEqual(up.ok, true);
  const c = calls[0];
  assert.strictEqual(c.url, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
  const boundary = c.init.headers['Content-Type'].split('boundary=')[1];
  assert.ok(boundary && c.init.body.indexOf('--' + boundary + '--') > 0, 'the multipart body should close its boundary');
  assert.ok(c.init.body.indexOf('{"name":"backup.json"}') > 0 && c.init.body.indexOf('{"tasks":[]}') > 0);
});
