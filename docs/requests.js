/* Requests, on the roadmap itself.
   ---------------------------------------------------------------------
   The board used to send people to GitHub to ask for something, which is
   a sign-up and a different website in the way of a sentence. A request is
   written here now and appears here, in a column of its own, for everyone.

   A static site cannot receive anything, so the rows live in one Supabase
   table. Its anon key is meant to be public -- it is in the page, as the
   service intends -- and the table's policies decide what it can do:
   insert a row, read rows, and bump a vote. Nothing else.

   Until window.EMBER_REQUESTS carries a url and a key, the column and the
   button are not drawn at all. A board that offers a form that cannot send
   is worse than one that does not offer it.
   --------------------------------------------------------------------- */
(function () {
  var CFG = window.EMBER_REQUESTS || {};
  if (!CFG.url || !CFG.key) return;

  var TABLE = CFG.table || 'requests';
  var API = CFG.url.replace(/\/+$/, '') + '/rest/v1/' + TABLE;
  var HEAD = { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' };
  var VOTED = 'ember-voted';

  /* Which requests this browser has already voted for. One vote each, kept
     here rather than behind a sign-in: the count is a signal, not a ballot. */
  function voted() {
    try { return JSON.parse(localStorage.getItem(VOTED) || '[]'); } catch (e) { return []; }
  }
  function remember(id) {
    try { var v = voted(); v.push(id); localStorage.setItem(VOTED, JSON.stringify(v)); } catch (e) {}
  }

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  /* "3 days ago", because a date on a request says less than how long it
     has been sitting there. */
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!isFinite(s) || s < 0) return '';
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    if (s < 2592000) return Math.round(s / 86400) + 'd ago';
    return Math.round(s / 2592000) + 'mo ago';
  }

  function get(el) { return document.getElementById(el); }

  function card(r) {
    var mine = voted().indexOf(r.id) > -1;
    return '<article class="item req" data-id="' + r.id + '">' +
      '<div class="req-row">' +
        '<button class="req-vote' + (mine ? ' on' : '') + '" data-vote="' + r.id + '"' +
          (mine ? ' aria-pressed="true" title="You asked for this too"' : ' aria-pressed="false" title="I want this too"') + '>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg>' +
          '<b>' + (r.votes || 0) + '</b>' +
        '</button>' +
        '<p>' + esc(r.body) + '</p>' +
      '</div>' +
      '<div class="tags"><span class="tag">' + esc(ago(r.created_at)) + '</span></div>' +
    '</article>';
  }

  function render(rows) {
    var list = get('reqList'), n = get('reqCount');
    if (!list) return;
    if (n) n.textContent = rows.length;
    list.innerHTML = rows.length
      ? rows.map(card).join('')
      : '<div class="col-empty">Nothing asked for yet. Yours would be the first.</div>';
  }

  function load() {
    return fetch(API + '?select=id,body,votes,created_at&order=votes.desc,created_at.desc&limit=60', { headers: HEAD })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(render)
      .catch(function () {
        var list = get('reqList');
        if (list) list.innerHTML = '<div class="col-empty">Could not load the requests just now. Reload the page to try again.</div>';
      });
  }

  /* ---- the form ---- */
  function openForm() {
    var d = get('reqDlg');
    if (!d) return;
    d.hidden = false;
    document.body.classList.add('req-open');
    var t = get('reqBody'); if (t) { t.value = ''; t.focus(); }
    var m = get('reqMail'); if (m) m.value = '';
    say('');
  }
  function closeForm() {
    var d = get('reqDlg');
    if (!d) return;
    d.hidden = true;
    document.body.classList.remove('req-open');
  }
  function say(msg, bad) {
    var s = get('reqSay');
    if (!s) return;
    s.textContent = msg || '';
    s.className = 'req-say' + (bad ? ' bad' : '');
  }

  function send() {
    var body = (get('reqBody').value || '').trim();
    var mail = (get('reqMail').value || '').trim();
    if (body.length < 4) { say('Say a little more than that.', true); get('reqBody').focus(); return; }
    if (body.length > 600) { say('That is a bit long — 600 characters is the limit.', true); return; }
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { say('That email does not look right.', true); return; }

    var btn = get('reqSend');
    btn.disabled = true; say('Sending…');
    fetch(API, {
      method: 'POST',
      headers: Object.assign({ Prefer: 'return=representation' }, HEAD),
      body: JSON.stringify({ body: body, email: mail || null })
    })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function () {
        closeForm();
        return load();
      })
      .catch(function () { say('That did not send. Try again in a moment.', true); })
      .then(function () { btn.disabled = false; });
  }

  function vote(id) {
    if (voted().indexOf(id) > -1) return;
    var el = document.querySelector('.req[data-id="' + id + '"] .req-vote');
    var now = el ? Number(el.querySelector('b').textContent) || 0 : 0;
    /* Shown at once, then written: a vote that waits for a round trip feels
       like it did not register. */
    if (el) { el.classList.add('on'); el.setAttribute('aria-pressed', 'true'); el.querySelector('b').textContent = now + 1; }
    remember(id);
    fetch(API + '?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: HEAD, body: JSON.stringify({ votes: now + 1 })
    }).catch(function () {});
  }

  /* ---- wiring ---- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;
    if (t.closest('[data-act="req-open"]')) { e.preventDefault(); openForm(); return; }
    if (t.closest('[data-act="req-close"]')) { e.preventDefault(); closeForm(); return; }
    if (t.closest('#reqSend')) { e.preventDefault(); send(); return; }
    var v = t.closest('[data-vote]');
    if (v) { e.preventDefault(); vote(Number(v.getAttribute('data-vote'))); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeForm();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !get('reqDlg').hidden) send();
  });

  /* The column and the button only exist once there is somewhere to send. */
  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('req-on');
    load();
  });
})();
