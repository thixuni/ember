#!/usr/bin/env node
/*
 * Cut a release.
 *
 *   npm run release patch   1.0.0 -> 1.0.1   ordinary work
 *   npm run release minor   1.0.0 -> 1.1.0   a major change
 *   npm run release same    1.0.0 -> 1.0.0   publish the version as it stands,
 *                                            for the first release and for
 *                                            retrying one that failed part way
 *
 * The version number moves here and nowhere else, so every number that
 * exists is one somebody can download and the releases page has no gaps.
 *
 * Everything is checked before anything is changed, so a refusal leaves the
 * repository exactly as it was.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const step = msg => console.log('  ' + msg);

function fail(what, fix) {
  console.error('\nCannot release: ' + what);
  if (fix) console.error('  ' + fix);
  process.exit(1);
}

/* Written here rather than by `npm version`, which on Windows cannot be run
   without a shell. The lock file carries the number in two places. */
function setVersion(v) {
  const pkgFile = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  pkg.version = v;
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

  const lockFile = path.join(root, 'package-lock.json');
  if (fs.existsSync(lockFile)) {
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    lock.version = v;
    if (lock.packages && lock.packages['']) lock.packages[''].version = v;
    fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
  }
}

const kind = (process.argv[2] || '').toLowerCase();
if (kind !== 'patch' && kind !== 'minor' && kind !== 'same') {
  fail('say which kind of release this is.',
    'npm run release patch   (ordinary work)\n' +
    '  npm run release minor   (a major change)\n' +
    '  npm run release same    (publish the current version unchanged)');
}

console.log('\nChecking the repository');

// A release must describe a committed state, not whatever is lying around.
if (run('git', ['status', '--porcelain'])) {
  fail('there are uncommitted changes.', 'Commit or stash them, then run this again.');
}

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'main') fail('you are on "' + branch + '", not main.', 'git switch main');
step('on main, working tree clean');

run('git', ['fetch', 'origin', '--quiet']);
const behind = run('git', ['rev-list', '--count', 'HEAD..origin/main']);
if (behind !== '0') {
  fail('origin/main has ' + behind + ' commit(s) you do not have.', 'git pull, then run this again.');
}
step('up to date with origin');

// Never ship something the checks have not seen. Node itself runs both, rather
// than shelling out to npm: on Windows execFile refuses a .cmd without a shell.
console.log('\nRunning the checks');
try {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build-standalone.js')], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, ['--test'], { cwd: root, stdio: 'inherit' });
} catch (e) {
  fail('the checks did not pass.', 'Fix them and run this again; nothing has been changed.');
}

const pkgPath = path.join(root, 'package.json');
const from = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
const [maj, min, pat] = from.split('.').map(Number);
const to = kind === 'same'  ? from
         : kind === 'minor' ? [maj, min + 1, 0].join('.')
         : [maj, min, pat + 1].join('.');
const tag = 'v' + to;

const existing = run('git', ['tag', '-l', tag]);
if (existing) fail(tag + ' already exists.', 'Delete it first, or pick a different kind of release.');

console.log(kind === 'same'
  ? '\nReleasing ' + to + ' as it stands'
  : '\nReleasing ' + from + ' -> ' + to + ' (' + kind + ')');

setVersion(to);
step('version set to ' + to);

run('git', ['add', 'package.json', 'package-lock.json']);
// With `same` the version did not move, so there may be nothing to commit.
if (run('git', ['status', '--porcelain'])) run('git', ['commit', '-m', 'Release ' + tag]);
run('git', ['tag', '-a', tag, '-m', 'Ember ' + to]);
step('committed and tagged');

run('git', ['push', 'origin', 'main']);
run('git', ['push', 'origin', tag]);
step('pushed');

let repo = 'thixuni/ember';
try {
  const url = run('git', ['remote', 'get-url', 'origin']);
  const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (m) repo = m[1];
} catch (e) { /* keep the default */ }

console.log('\nDone. The installers are building now.');
console.log('  Progress: https://github.com/' + repo + '/actions');
console.log('  Release:  https://github.com/' + repo + '/releases/tag/' + tag + '\n');
