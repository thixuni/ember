/*
 * Colour contrast, held to WCAG AA (4.5:1 for text).
 * Run with: npm test
 *
 * Two things can quietly fall below it: an accent someone picks, and the
 * neutral ramp when someone edits it. The accent maths is lifted straight out
 * of app.js and swept across the colour wheel; the ramp is read straight out
 * of app.css. Neither is a copy that could drift from the real thing.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const AA = 4.5;

/* ---- the accent maths, from app.js ---- */
const from = js.indexOf('/* ---- colour arithmetic');
const to = js.indexOf('function setCustomAccent');
assert.ok(from > -1 && to > from, 'could not find the colour section in app.js');
const presetsAt = js.indexOf('const ACCENTS=[');
assert.ok(presetsAt > -1, 'could not find ACCENTS in app.js');
const presets = js.slice(presetsAt, js.indexOf('];', presetsAt) + 2);
const ctx = {};
vm.createContext(ctx);
vm.runInContext(presets + js.slice(from, to) + ';this.lib={accentTrio,hex2rgb,rgb2hex,hsl2rgb,contrast,mixRGB,ACCENTS};', ctx);
const {accentTrio, hex2rgb, rgb2hex, hsl2rgb, contrast, mixRGB, ACCENTS} = ctx.lib;
const mix = (a, p, b) => mixRGB(typeof a === 'string' ? hex2rgb(a) : a, p, typeof b === 'string' ? hex2rgb(b) : b);

/* Every preset, the extremes, and a grid across hue, saturation, lightness. */
const sweep = ACCENTS.map(a => a.hex).concat(['#000000', '#FFFFFF', '#FFFF00', '#00FF00', '#00FFFF', '#FF00FF', '#808080']);
for (let h = 0; h < 360; h += 24)
  for (const s of [0, 35, 70, 100])
    for (const l of [4, 20, 40, 55, 70, 85, 97]) sweep.push(rgb2hex(hsl2rgb(h, s, l)));

const WHITE = [255, 255, 255], ON_DARK = [14, 17, 19], DARK_PANEL = [28, 32, 35];

test('any accent colour keeps its text readable in both themes', () => {
  const bad = [];
  for (const hex of sweep) {
    const t = accentTrio(hex), base = hex2rgb(t.base), dark = hex2rgb(t.dark), lift = hex2rgb(t.lift);
    const panel = mix(lift, 5, DARK_PANEL);
    const checks = {
      'white text on a light-mode button': contrast(WHITE, base),
      'accent text on its light tint': contrast(dark, mix(base, 13, WHITE)),
      'accent text on a dark panel': contrast(lift, panel),
      'accent text on its dark tint': contrast(lift, mix(lift, 13, panel)),
      'dark text on a dark-mode button': contrast(ON_DARK, lift)
    };
    for (const [what, r] of Object.entries(checks)) if (r < AA) bad.push(hex + ' ' + what + ' ' + r.toFixed(2));
  }
  assert.ok(sweep.length > 400, 'the sweep looks too small: ' + sweep.length);
  assert.deepStrictEqual(bad, [], 'accents that fall under AA:\n  ' + bad.join('\n  '));
});

/* ---- the neutral ramp, from app.css ---- */
function block(selector) {
  const i = css.indexOf(selector + '{');
  assert.ok(i > -1, 'no ' + selector + ' block in app.css');
  return css.slice(i, css.indexOf('}', i));
}
/* A ramp token is a plain hex, or a hex with a little of the accent mixed in. */
function token(src, name, accent) {
  const m = src.match(new RegExp('--' + name + ':\\s*([^;]+);'));
  assert.ok(m, '--' + name + ' not found');
  const v = m[1].trim();
  const cm = v.match(/^color-mix\(in srgb,\s*var\(--a-(?:base|lift)\)\s*([\d.]+)%,\s*(#[0-9a-fA-F]{6})\)$/);
  if (cm) return mix(accent, +cm[1], cm[2]);
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return hex2rgb(v);
  throw new Error('--' + name + ' is neither a hex nor an accent mix: ' + v);
}

test('every text grey clears AA on every panel it can sit on, for any accent', () => {
  const light = block(':root'), dark = block(':root[data-theme="dark"]');
  const texts = ['ink', 'ink-2', 'muted', 'faint'];
  const bad = [];
  for (const hex of ACCENTS.map(a => a.hex).concat(['#000000', '#FFFFFF', '#FFFF00'])) {
    const t = accentTrio(hex);
    const L = n => token(light, n, hex2rgb(t.base)), D = n => token(dark, n, hex2rgb(t.lift));
    const lightBgs = {surface: L('surface'), 'surface-2': L('surface-2'), 'surface-3': L('surface-3'), ground: L('ground')};
    const ds = D('surface');
    const darkBgs = {surface: ds, 'surface-2': D('surface-2'), 'surface-3': D('surface-3'), ground: D('ground'),
      'accent tint': mix(hex2rgb(t.lift), 13, ds)};
    for (const n of texts) {
      for (const [b, bg] of Object.entries(lightBgs)) { const r = contrast(L(n), bg); if (r < AA) bad.push('light ' + hex + ' ' + n + ' on ' + b + ' ' + r.toFixed(2)); }
      for (const [b, bg] of Object.entries(darkBgs)) { const r = contrast(D(n), bg); if (r < AA) bad.push('dark ' + hex + ' ' + n + ' on ' + b + ' ' + r.toFixed(2)); }
    }
  }
  assert.deepStrictEqual(bad, [], 'greys under AA:\n  ' + bad.join('\n  '));
});

test('the dark ramp is declared the same way for the system setting and the explicit one', () => {
  const media = css.match(/@media \(prefers-color-scheme:dark\)\{\s*:root:not\(\[data-theme="light"\]\)\{([^}]*)\}/);
  assert.ok(media, 'no system dark block found');
  const norm = s => s.replace(/\s+/g, '');
  assert.strictEqual(norm(media[1]), norm(block(':root[data-theme="dark"]').slice(':root[data-theme="dark"]{'.length)),
    'the two dark blocks have drifted apart');
});
