/*
 * The Google account, from the main process: signing in with Google, and the
 * two things that account is then used for -- Google Calendar, and a backup
 * in the person's own Google Drive.
 *
 * This file owns the two things the planner page must never hold: the
 * sign-in and the tokens it produces. It signs in the way Google prescribes
 * for installed apps -- the system browser, a redirect back to a throwaway
 * server on 127.0.0.1, and PKCE -- keeps the refresh token encrypted with the
 * operating system's keychain through safeStorage, and makes API calls on the
 * page's behalf.
 *
 * Access is asked for a piece at a time, when the person reaches the step
 * that needs it: who they are when they sign in, Calendar when they connect
 * it, Drive when they choose to back up there. Each later ask carries the
 * earlier ones along (include_granted_scopes), so there is one key for all.
 *
 * What to sync and how lives in app.js, next to the data it is about. This
 * side is only sign-in and transport, and it refuses any request that is not
 * to the Calendar API or to the Drive files it made.
 */
const http = require('http');
const crypto = require('crypto');
const {shell, safeStorage} = require('electron');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/calendar/v3';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
/* What each part asks for, and nothing wider. The account is who you are;
   Calendar reads every calendar (to show them) and writes events (to sync);
   Drive reaches only the files this app itself created -- not the rest of
   someone's Drive. */
const SCOPE_SETS = {
  account: ['openid', 'email', 'profile'],
  calendar: ['https://www.googleapis.com/auth/calendar.readonly',
             'https://www.googleapis.com/auth/calendar.events'],
  drive: ['https://www.googleapis.com/auth/drive.file']
};
const SCOPES = SCOPE_SETS.calendar;
/* Which parts a granted scope list covers. A key saved before scopes were
   written down came from the Calendar-only sign-in. */
function partsOf(granted){
  if(!granted) return {account: false, calendar: true, drive: false};
  const has = s => granted.indexOf(s) > -1 || granted.indexOf(s.replace('https://www.googleapis.com/auth/', '')) > -1;
  return {account: has('email') || has('https://www.googleapis.com/auth/userinfo.email'),
    calendar: SCOPE_SETS.calendar.every(has), drive: SCOPE_SETS.drive.every(has)};
}
/* The id_token comes straight from Google's token endpoint over TLS, so its
   claims can be read without checking the signature, as Google allows for a
   token received that way. Only who the person is is taken from it. */
function claims(idToken){
  try{ return JSON.parse(Buffer.from(String(idToken).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) || {}; }
  catch(e){ return {}; }
}
const SIGN_IN_TIMEOUT = 5 * 60 * 1000;
/* Only the Calendar API, and only these corners of it; in Drive, only files. */
const PATH_OK = /^\/(users\/me\/calendarList|calendars\/[^/?#]+(\/events(\/[^/?#]+)?)?)$/;
const DRIVE_OK = /^\/files(\/[A-Za-z0-9_-]+)?$/;
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* A secret at rest is encrypted by the OS where it can be. On a Linux box
   with no keyring it cannot, and the prefix says so rather than pretending. */
function seal(v){
  if(!v) return '';
  try{ if(safeStorage && safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(v).toString('base64'); }catch(e){}
  return 'raw:' + v;
}
function unseal(v){
  if(!v) return '';
  if(v.indexOf('enc:') === 0){
    try{ return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64')); }catch(e){ return ''; }
  }
  return v.indexOf('raw:') === 0 ? v.slice(4) : '';
}

module.exports = function makeGcal(readSettings, writeSettings, opts){
  const fetchFn = (opts && opts.fetch) || fetch;
  /* The app's own Google client, shipped with it. A copy built without one
     falls back to a Client ID and secret pasted into the app. */
  const builtIn = (opts && opts.builtIn) || {};
  const openExternal = (opts && opts.openExternal) || (url => shell.openExternal(url));
  let access = null;        // {token, exp} -- memory only, never written down
  let pending = null;       // the sign-in in flight, so a second click replaces it

  const conf = () => readSettings().gcal || {};
  const saveConf = patch => writeSettings({gcal: Object.assign({}, conf(), patch)});

  async function postForm(url, fields){
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams(fields).toString()
    });
    let data = null;
    try{ data = await res.json(); }catch(e){}
    return {ok: res.ok, status: res.status, data: data || {}};
  }

  /* ---- sign-in ----
     A throwaway server on 127.0.0.1 at whatever port the OS hands out, which
     is where Google sends the browser back to with the code. Resolves with
     the port once listening, and with the code once it arrives. */
  function loopback(state){
    let server, finish;
    const code = new Promise((resolve, reject) => {
      server = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://127.0.0.1');
        const code = u.searchParams.get('code'), err = u.searchParams.get('error');
        if(!code && !err){ res.writeHead(404); res.end(); return; }     // a favicon, say
        const good = code && u.searchParams.get('state') === state;
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
        res.end('<!doctype html><meta charset="utf-8"><title>Ember</title>' +
          '<body style="font:15px system-ui;padding:48px;color:#222">' +
          (good ? '<h2>You are signed in.</h2><p>You can close this tab and go back to Ember.</p>'
                : '<h2>That did not work.</h2><p>Go back to Ember and try connecting again.</p>') +
          '</body>');
        finish(good ? null : new Error(err === 'access_denied' ? 'You declined access in Google.' :
          err ? 'Google said: ' + err : 'The sign-in did not match. Try again.'), code);
      });
      let done = false;
      const timer = setTimeout(() => finish(new Error('Timed out waiting for Google. Try again.')), SIGN_IN_TIMEOUT);
      finish = (error, got) => {
        if(done) return; done = true;
        clearTimeout(timer);
        server.close();
        error ? reject(error) : resolve(got);
      };
      server.on('error', e => finish(e));
    });
    code.catch(() => {});     // a sign-in cancelled before anyone awaits it is not an unhandled error
    const port = new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
    return {port, code, cancel: () => finish(new Error('cancelled'))};
  }

  /* input.want names the parts to ask for: 'account', 'calendar', 'drive'.
     Left out, it is Calendar alone, as the first version of this asked. */
  async function connect(input){
    const clientId = String((input && input.clientId) || conf().clientId || builtIn.clientId || '').trim();
    const clientSecret = String((input && input.clientSecret) || unseal(conf().secret) || builtIn.clientSecret || '').trim();
    const want = (input && Array.isArray(input.want) && input.want.length ? input.want : ['calendar'])
      .filter(w => SCOPE_SETS[w]);
    const scopes = [].concat.apply([], want.map(w => SCOPE_SETS[w]));
    if(!/\.apps\.googleusercontent\.com$/.test(clientId))
      return {ok: false, error: 'That does not look like a Client ID. It ends in .apps.googleusercontent.com.'};
    if(!clientSecret) return {ok: false, error: 'The Client secret is missing.'};
    if(pending){ try{ pending.cancel(); }catch(e){} pending = null; }

    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));

    const lb = loopback(state);
    pending = lb;
    const redirect = 'http://127.0.0.1:' + await lb.port;

    const url = AUTH_URL + '?' + new URLSearchParams({
      client_id: clientId, redirect_uri: redirect, response_type: 'code',
      scope: scopes.join(' '), code_challenge: challenge, code_challenge_method: 'S256',
      state: state, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true'
    }).toString();
    openExternal(url);

    let code;
    try{ code = await lb.code; }
    catch(e){ pending = null; return {ok: false, error: e.message === 'cancelled' ? 'Cancelled.' : e.message}; }
    pending = null;

    const tok = await postForm(TOKEN_URL, {
      code: code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier
    });
    if(!tok.ok || !tok.data.access_token)
      return {ok: false, error: 'Google refused the sign-in: ' + (tok.data.error_description || tok.data.error || tok.status)};
    if(!tok.data.refresh_token)
      return {ok: false, error: 'Google did not hand back a long-lived key. Remove Ember from your Google account\'s third-party access and connect again.'};

    access = {token: tok.data.access_token, exp: Date.now() + (tok.data.expires_in || 3600) * 1000};
    /* Only a pasted client is written down; the shipped one is read afresh
       each launch, so a new build's keys take over by themselves. */
    const own = clientId !== builtIn.clientId;
    const granted = tok.data.scope ? String(tok.data.scope).split(' ') : scopes;
    const was = conf();
    saveConf({clientId: own ? clientId : '', secret: own ? seal(clientSecret) : '',
      refresh: seal(tok.data.refresh_token), scopes: granted});

    /* Who this is: the id_token when the account was asked for; otherwise
       the primary calendar's id, which is the account's address. */
    const who = claims(tok.data.id_token);
    let email = who.email || '', name = who.name || '', first = who.given_name || '';
    if(!email && partsOf(granted).calendar){
      const me = await request({method: 'GET', path: '/calendars/primary'});
      email = me.ok && me.data && me.data.id || '';
    }
    /* A later ask (Calendar, Drive) returns no fresh profile; keep the one
       from signing in, unless the account itself has changed. */
    if(!email) email = was.email || '';
    if(!name && email === was.email){ name = was.name || ''; first = was.first || ''; }
    saveConf({email: email, name: name, first: first});
    return Object.assign({ok: true, email: email}, name ? {name: name} : {});
  }

  function cancel(){ if(pending){ try{ pending.cancel(); }catch(e){} pending = null; } return true; }

  async function disconnect(){
    const refresh = unseal(conf().refresh);
    access = null;
    /* Keep the Client ID and secret: reconnecting should not mean digging
       them out of Google Cloud again. The key that grants access goes. */
    saveConf({refresh: '', email: '', name: '', first: '', scopes: null});
    if(refresh){ try{ await postForm(REVOKE_URL, {token: refresh}); }catch(e){} }
    return true;
  }

  function status(){
    const c = conf(), connected = !!unseal(c.refresh);
    return {connected: connected, email: c.email || '', clientId: c.clientId || '',
      hasSecret: !!unseal(c.secret), name: c.name || '', first: c.first || '',
      builtIn: !!builtIn.clientId,
      parts: connected ? partsOf(c.scopes) : {account: false, calendar: false, drive: false}};
  }

  /* ---- transport ---- */
  async function token(force){
    if(!force && access && access.exp - 60000 > Date.now()) return access.token;
    const c = conf(), refresh = unseal(c.refresh);
    if(!refresh) return null;
    const r = await postForm(TOKEN_URL, {
      client_id: c.clientId || builtIn.clientId, client_secret: unseal(c.secret) || builtIn.clientSecret,
      refresh_token: refresh, grant_type: 'refresh_token'
    });
    if(!r.ok || !r.data.access_token){
      /* invalid_grant means the key is dead -- revoked, expired, or the app
         left in Testing for more than a week. Say so; do not keep retrying. */
      if(r.data.error === 'invalid_grant'){ saveConf({refresh: ''}); access = null; }
      return null;
    }
    access = {token: r.data.access_token, exp: Date.now() + (r.data.expires_in || 3600) * 1000};
    return access.token;
  }

  /* req.api picks the service: 'calendar' (the default), 'drive' for file
     listings and downloads, 'upload' for writing a file. An upload is sent
     as {meta, content, type} and put together here as Drive's multipart. */
  async function request(req){
    const method = String(req && req.method || 'GET').toUpperCase();
    const path = String(req && req.path || '');
    const api = String(req && req.api || 'calendar');
    const base = api === 'drive' ? DRIVE : api === 'upload' ? UPLOAD : api === 'calendar' ? API : '';
    const pathOk = api === 'calendar' ? PATH_OK.test(path) : DRIVE_OK.test(path);
    if(!base || METHODS.indexOf(method) < 0 || !pathOk)
      return {ok: false, status: 0, error: (api === 'calendar' ? 'Not a Calendar API request: ' : 'Not a Drive file request: ') + method + ' ' + path};
    const qs = req.query ? '?' + new URLSearchParams(req.query).toString() : '';
    let body, ctype;
    if(api === 'upload'){
      const up = req.upload || {}, b = 'orbit' + crypto.randomBytes(12).toString('hex');
      ctype = 'multipart/related; boundary=' + b;
      body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(up.meta || {}) +
        '\r\n--' + b + '\r\nContent-Type: ' + (up.type || 'application/json') + '\r\n\r\n' + String(up.content || '') +
        '\r\n--' + b + '--';
    }else if(req.body){ ctype = 'application/json'; body = JSON.stringify(req.body); }
    const send = async tok => fetchFn(base + path + qs, {
      method: method,
      headers: Object.assign({Authorization: 'Bearer ' + tok}, ctype ? {'Content-Type': ctype} : {}),
      body: body
    });
    try{
      let tok = await token(false);
      if(!tok) return {ok: false, status: 401, error: 'reconnect'};
      let res = await send(tok);
      if(res.status === 401){                   // expired early; one fresh try
        tok = await token(true);
        if(!tok) return {ok: false, status: 401, error: 'reconnect'};
        res = await send(tok);
      }
      let data = null;
      if(res.status !== 204){ try{ data = await res.json(); }catch(e){} }
      return {ok: res.ok, status: res.status, data: data,
        error: res.ok ? '' : (data && data.error && data.error.message) || ('HTTP ' + res.status)};
    }catch(e){
      return {ok: false, status: 0, error: 'offline'};
    }
  }

  return {connect, cancel, disconnect, status, request, _seal: seal, _unseal: unseal, _claims: claims};
};
