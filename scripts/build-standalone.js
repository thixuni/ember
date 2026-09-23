#!/usr/bin/env node
/*
 * Inlines src/index.html, src/app.css and src/app.js into one self-contained
 * HTML file that runs from a double-click, with no server and no network
 * beyond the Google Fonts link.
 *
 * Electron loads src/index.html directly, so this build exists purely to
 * produce the shareable single file:
 *
 *   dist/ember.html
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const outDir = path.join(root, 'dist');
const outFile = path.join(outDir, 'ember.html');

const read = f => fs.readFileSync(path.join(src, f), 'utf8');

function build() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  let html = read('index.html');
  const css = read('app.css');
  const js = read('app.js');

  const cssTag = '<link rel="stylesheet" href="app.css">';
  const jsTag = '<script src="app.js"></script>';

  if (html.indexOf(cssTag) === -1) throw new Error('src/index.html is missing ' + cssTag);
  if (html.indexOf(jsTag) === -1) throw new Error('src/index.html is missing ' + jsTag);

  // A literal </script> anywhere in the JS would close the tag early.
  if (/<\/script/i.test(js)) throw new Error('src/app.js contains a literal </script> — escape it as <\\/script');

  // Replacer functions, not strings: the sources contain "$&" and other
  // $-sequences that String.replace would expand as backreferences.
  html = html.replace(cssTag, () => '<style>\n' + css.trim() + '\n</style>');
  html = html.replace(jsTag, () => '<script>\n' + js.trim() + '\n</script>');

  const banner = '<!-- Ember ' + pkg.version + ' — built ' +
    new Date().toISOString().slice(0, 10) + ' from src/. Edit the files in src/, not this one. -->\n';
  html = html.replace(/^<!doctype html>\s*/i, '<!doctype html>\n' + banner);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, html, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log('Built dist/ember.html  (' + kb + ' KB, version ' + pkg.version + ')');
}

build();
