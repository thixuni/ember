/*
 * Guards for the conventions in CLAUDE.md that are easy to break by accident.
 * Run with: npm test
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const html = read('src/index.html');
const css = read('src/app.css');
const js = read('src/app.js');

/** Strip comments so we test code, not prose about code. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}
const jsCode = stripComments(js);

/* ---------- sources ---------- */

test('the three sources are present and non-trivial', () => {
  assert.ok(html.length > 1000, 'src/index.html looks empty');
  assert.ok(css.length > 10000, 'src/app.css looks empty');
  assert.ok(js.length > 50000, 'src/app.js looks empty');
});

test('index.html links the split assets exactly once each', () => {
  assert.strictEqual((html.match(/<link rel="stylesheet" href="app\.css">/g) || []).length, 1);
  assert.strictEqual((html.match(/<script src="app\.js"><\/script>/g) || []).length, 1);
});

test('the scripts parse as JavaScript', () => {
  // Every other check reads the sources as text, so a stray bracket would
  // pass all of them while the app itself could not start.
  const vm = require('vm');
  for (const f of ['src/app.js', 'main.js', 'preload.js', 'gcal.js']) {
    assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }), f + ' has a syntax error');
  }
  const inline = (read('src/timer.html').match(/<script>([\s\S]*?)<\/script>/) || [])[1];
  assert.ok(inline, 'timer.html has no inline script');
  assert.doesNotThrow(() => new vm.Script(inline, { filename: 'timer.html' }), 'timer.html script has a syntax error');
});

test('app.js is wrapped in an IIFE so it leaks nothing global', () => {
  assert.match(js.trimStart(), /^\(function\s*\(\s*\)\s*\{/);
  assert.match(js.trimEnd(), /\}\)\(\);$/);
});

/* ---------- documented conventions ---------- */

test('no blocking dialogs: they fail silently in the artifact sandbox', () => {
  const hits = [...jsCode.matchAll(/(^|[^.\w$])(alert|confirm|prompt)\s*\(/g)].map(m => m[2]);
  assert.deepStrictEqual(hits, [], 'use arm() or an inline bar instead of ' + hits.join('/'));
});

test('every data-act is handled somewhere', () => {
  const acts = new Set();
  for (const m of (html + js).matchAll(/data-act="([a-z0-9-]+)"/g)) acts.add(m[1]);

  // Most acts land in the delegated click switch; a few (form inputs) are
  // handled by a direct comparison in the change/input listener instead.
  const handled = new Set([
    ...[...jsCode.matchAll(/case\s+"([a-z0-9-]+)"\s*:/g)].map(m => m[1]),
    ...[...jsCode.matchAll(/\.act\s*===\s*"([a-z0-9-]+)"/g)].map(m => m[1])
  ]);

  assert.ok(acts.size > 30, 'expected to find the data-act attributes, found ' + acts.size);
  const orphans = [...acts].filter(a => !handled.has(a)).sort();
  assert.deepStrictEqual(orphans, [], 'data-act values nothing handles: ' + orphans.join(', '));
});

test('dates and times open the planner pickers, not the browser ones', () => {
  // The browser's pickers come in the operating system's colours and match
  // nothing on the page; dateField() and timeField() draw the planner's own.
  const hits = [...(html + jsCode).matchAll(/type=\\?"(date|time|datetime-local|month|week)\\?"/g)].map(m => m[0]);
  assert.deepStrictEqual(hits, [], 'use dateField()/timeField() instead of ' + hits.join(', '));
  assert.match(jsCode, /function pickField\(/, 'the picker fields are gone from app.js');
});

test('a redraw keeps the scroll position of the screen it redraws', () => {
  // Without this every tick threw scrolled lists back to the top.
  const body = (jsCode.match(/function renderView\(\)\{([\s\S]*?)\n\}/) || [])[1] || '';
  assert.match(body, /scrollMarks\(vp\)/, 'renderView no longer notes the scroll positions before drawing');
  assert.match(body, /putScroll\(vp,marks\)/, 'renderView no longer puts the scroll positions back');
});

test('no invisible characters hide in the sources', () => {
  // A non-breaking or zero-width space in a regex looks like an ordinary one
  // and matches something else. Write them as   and ​.
  for (const [name, text] of [['app.js', js], ['app.css', css]]) {
    const hits = [...text.matchAll(/[ ​‌‍﻿]/g)].map(m => text.slice(0, m.index).split('\n').length);
    assert.deepStrictEqual(hits, [], name + ' has invisible characters on lines ' + hits.join(', '));
  }
});

test('redraws stay fast on a big planner', () => {
  // Asking every element for its scroll position forced a full layout: over
  // a second per redraw on a year-old board.
  const marks = (jsCode.match(/function scrollMarks\(root\)\{([\s\S]*?)\n\}/) || [])[1] || '';
  assert.doesNotMatch(marks, /querySelectorAll\("\*"\)/, 'scrollMarks() walks every element again');
  // Per-card and per-day scans of the big lists go through the lookups.
  assert.doesNotMatch(jsCode, /S\.activity\.reduce\(\(n,a\)=>n\+\(a\.task===t\.id/, 'task cards scan all activity again');
  assert.doesNotMatch(jsCode, /S\.sessions\.forEach\(x=>\{if\(ymd\(new Date\(x\.start\)\)===dayStr\)/, 'sittings() scans every session per day again');
  // Storage is written once per burst of saves, and flushed when the page goes.
  assert.match(jsCode, /function saveLocal\(\)\{if\(!lsTimer\)/, 'saveLocal() writes on every save again');
  assert.match(jsCode, /addEventListener\("pagehide",flushLocal\)/, 'a pending write is no longer flushed on close');
});

test('panels() redraws settings and setup rather than calling itself', () => {
  // A rename once left it calling itself whenever Settings was open.
  const body = (jsCode.match(/function panels\(\)\{([\s\S]*?)\n\}/) || [])[1] || '';
  assert.match(body, /settingsModal\(\)/, 'panels() no longer redraws Settings');
  assert.doesNotMatch(body, /\bpanels\(/, 'panels() calls itself');
});

test('the browser copy reaches Google through the same calls as the desktop', () => {
  const surface = ['gcalStatus', 'gcalConnect', 'gcalCancel', 'gcalDisconnect', 'gcalRequest'];
  const web = (jsCode.match(/const WEB_GOOGLE=\{([\s\S]*?)\};/) || [])[1] || '';
  for (const k of surface) assert.match(web, new RegExp('\\b' + k + ':'), 'the web Google bridge lacks ' + k);
  // Its Client ID file is per address and never committed.
  assert.match(read('.gitignore'), /^google-web-client\.json$/m, 'google-web-client.json is not git-ignored');
});

test('colours come from tokens, not hardcoded hex in rules', () => {
  // A token block is any rule whose declarations are all custom properties —
  // :root, the accent hues, the dark ramp. Literal colours belong only there;
  // everywhere else must go through var().
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stray = [];
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().split('\n').pop().trim();
    for (const decl of m[2].split(';')) {
      if (!/#[0-9a-fA-F]{3,8}\b/.test(decl)) continue;
      if (decl.trim().startsWith('--')) continue;    // defining a token is the point
      stray.push(selector + ' → ' + decl.trim());
    }
  }
  assert.deepStrictEqual(stray, [], 'hardcoded colours outside a token block:\n  ' + stray.join('\n  '));
});

test('the state keys are the ones persistence knows about', () => {
  const m = jsCode.match(/const KEYS\s*=\s*\[([^\]]+)\]/);
  assert.ok(m, 'KEYS array not found');
  const keys = [...m[1].matchAll(/"([a-z]+)"/g)].map(x => x[1]);
  assert.deepStrictEqual(keys, ['categories', 'tasks', 'routines', 'notes', 'completions',
    'prefs', 'activity', 'docs', 'sessions']);
});

test('the Eisenhower quadrant is derived, never stored on a task', () => {
  assert.match(jsCode, /const quadOf\s*=\s*t\s*=>/, 'quadOf should derive the quadrant');
  assert.ok(!/\bt\.quad\s*=/.test(jsCode), 'a quadrant must never be assigned onto a task');
});

test('the app ships with no personal data', () => {
  const banned = ['thisuni', 'gunawardena', '@gmail', 'code94'];
  const lower = (html + css + js).toLowerCase();
  for (const word of banned) {
    assert.ok(lower.indexOf(word) === -1, 'found "' + word + '" in the shipped sources');
  }
});

/* ---------- the app and the shell must agree ---------- */

test('the vault file format round-trips between the app and the shell', () => {
  const mainJs = read('main.js');

  // The shape app.js writes (docFileBody) and main.js reads back (readBack).
  const file = [
    '---',
    'title: "Missing figures"',
    'task: "Chase Priya"',
    'category: "Office"',
    'updated: 2026-09-09T10:00:00.000Z',
    'orbit-id: d_abc123',
    '---',
    '',
    '# Context',
    '',
    'Body text.'
  ].join('\n');

  // app.js must emit the id line the shell keys on.
  assert.ok(js.includes('"\\norbit-id: "+d.id'), 'app.js no longer writes orbit-id into the front matter');

  // main.js must recover the id, the title and the body from exactly that.
  const idRe = /^orbit-id:\s*(\S+)\s*$/m;
  const titleRe = /^title:\s*(.*)$/m;
  const stripRe = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
  for (const src of [idRe, titleRe, stripRe]) {
    assert.ok(mainJs.includes(src.source), 'main.js no longer parses with ' + src);
  }
  assert.strictEqual((file.match(idRe) || [])[1], 'd_abc123');
  assert.strictEqual(JSON.parse((file.match(titleRe) || [])[1]), 'Missing figures');
  assert.strictEqual(file.replace(stripRe, '').replace(/^\r?\n/, ''), '# Context\n\nBody text.');
});

test('everything reaching the shell goes through the preload bridge', () => {
  const preload = read('preload.js');
  const mainJs = read('main.js');

  // The agreed surface. Adding a bridge call means adding it in all three.
  const surface = {
    pathFor: null, saveFile: 'file:save', openFile: 'file:open',
    chooseVault: 'vault:choose', forgetVault: 'vault:forget',
    openVault: 'vault:open', useVault: 'vault:use',
    writeDoc: 'doc:write', deleteDoc: 'doc:delete', onVaultChange: 'vault:changed',
    chooseBackupDir: 'backup:dir', writeBackup: 'backup:write',
    timer: 'timer:state', popTimer: 'timer:pop', onTimerCmd: 'timer:cmd',
    gcalConnect: 'gcal:connect', gcalCancel: 'gcal:cancel', gcalDisconnect: 'gcal:disconnect',
    gcalStatus: 'gcal:status', gcalRequest: 'gcal:request',
    scheduleReminders: 'remind:schedule', testReminder: 'remind:test', onReminderOpen: 'remind:open'
  };
  for (const [member, channel] of Object.entries(surface)) {
    assert.ok(new RegExp('\\b' + member + '\\s*[:(]').test(preload), 'preload.js no longer exposes ' + member);
    if (channel) assert.ok(mainJs.includes("'" + channel + "'"), 'main.js no longer handles ' + channel);
  }

  // Anything the app reaches for on the bridge has to be part of that surface.
  const builtins = new Set(['split', 'join', 'map', 'filter', 'forEach', 'slice', 'replace',
    'trim', 'indexOf', 'push', 'concat', 'match', 'toString', 'bind', 'call', 'apply', 'then']);
  const used = [...new Set([...js.matchAll(/\bo\.([a-zA-Z]+)\s*\(/g)].map(m => m[1]))]
    .filter(k => !builtins.has(k));
  const missing = used.filter(k => !(k in surface)).sort();
  assert.deepStrictEqual(missing, [], 'app.js calls window.orbit members preload.js does not expose: ' + missing.join(', '));

  // The renderer must stay sandboxed.
  assert.ok(/contextIsolation:\s*true/.test(read('main.js')), 'contextIsolation must stay on');
  assert.ok(/nodeIntegration:\s*false/.test(read('main.js')), 'nodeIntegration must stay off');
});

/* ---------- the standalone build ---------- */

test('build:html produces one self-contained file', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build-standalone.js')], { cwd: root });
  const out = read('dist/everyday-orbit.html');

  assert.ok(out.indexOf('href="app.css"') === -1, 'app.css was not inlined');
  assert.ok(out.indexOf('src="app.js"') === -1, 'app.js was not inlined');

  const scripts = out.match(/<script[^>]*>/g) || [];
  assert.deepStrictEqual(scripts, ['<script>'], 'expected exactly one inline script, got ' + scripts.join(' | '));

  // The $-sequences in the sources must survive inlining untouched.
  assert.ok(out.indexOf('"$& "') !== -1, 'a $-sequence was mangled during inlining');

  assert.ok(out.indexOf(css.trim().slice(0, 200)) !== -1, 'CSS body missing from the build');
  assert.ok(out.indexOf(js.trim().slice(0, 200)) !== -1, 'JS body missing from the build');
  assert.ok(out.length > 100000, 'build looks truncated');
});

test('the built file has no local asset references left', () => {
  const out = read('dist/everyday-orbit.html');
  // Look at the markup only: the inline script legitimately contains strings
  // like href="$2" that are not asset references.
  const markup = out.replace(/<script[\s\S]*?<\/script>/g, '');
  const refs = [...markup.matchAll(/(?:src|href)="(?!https?:|#|data:)([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(refs, [], 'unresolved local references: ' + refs.join(', '));
});

test("the release flow is wired up and the version is clean", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, "version should be three plain numbers, got " + pkg.version);
  assert.ok(pkg.scripts && pkg.scripts.release, "npm run release is not wired up in package.json");
  assert.ok(fs.existsSync(path.join(root, "scripts", "release.js")), "scripts/release.js is missing");

  // The version moves during a release and nowhere else, so nothing else may write it.
  const release = read("scripts/release.js");
  assert.ok(/npm version|--no-git-tag-version/.test(release), "the release script should be the thing that sets the version");
});
