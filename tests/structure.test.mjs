/**
 * Structural invariants that are easy to break with an innocent edit and produce
 * no error when broken — an unreachable Save button, an unbound preview, a window
 * that grows off the bottom of the screen.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

let bad = 0;
const t = (n, c) => { if (!c) bad = 1; console.log((c ? 'PASS ' : 'FAIL ') + n); };
const read = rel => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

/* ---------- every script parses as an ES module ---------- */
const scripts = [
  'scripts/data.js', 'scripts/effects.js', 'scripts/main.js', 'scripts/purchase.js',
  'scripts/sockets.js', 'scripts/systems/adapter.js',
  'scripts/apps/shop-app.js', 'scripts/apps/editor-app.js', 'scripts/apps/upgrade-editor.js',
  'scripts/apps/settings-app.js', 'scripts/apps/theme.js'
];
for (const rel of scripts) {
  const path = new URL(`../${rel}`, import.meta.url).pathname;
  let ok = true;
  try { execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' }); }
  catch { ok = false; }
  t(`${rel} parses`, ok);
}

/* ---------- CSS is well-formed ---------- */
const css = read('styles/shop.css');
const opens = (css.match(/{/g) || []).length, closes = (css.match(/}/g) || []).length;
t(`stylesheet braces balanced (${opens} rules)`, opens === closes);

/* ---------- forms scroll, footers stay reachable ---------- */
for (const [file, body] of [['templates/upgrade-editor.hbs', 'upg-form-body'],
                            ['templates/settings.hbs', 'upg-settings-panes']]) {
  const s = read(file);
  const bodyAt = s.indexOf(`class="${body}"`);
  const footAt = s.indexOf('class="upg-form-footer"');
  t(`${file}: has a scroll container`, bodyAt >= 0);
  t(`${file}: footer sits after it`, footAt > bodyAt);
  const between = s.slice(bodyAt, footAt);
  t(`${file}: container closes before the footer`,
    (between.match(/<\/div>/g) || []).length >= (between.match(/<div/g) || []).length);
}
t('scroll container actually scrolls', /\.upg-form-body \{[^}]*overflow-y: auto/.test(css));
t('footer is pinned', /\.upg-form-footer \{[^}]*flex: none/.test(css));
t('footer is opaque so content cannot show through',
  /\.upg-form-footer \{[^}]*background: var\(--upg-bg-panel\)/.test(css));
for (const cls of ['upg-upgrade-editor', 'upg-settings-app', 'upg-editor', 'upg-shop']) {
  t(`${cls} is capped to the viewport`,
    new RegExp(`\\.${cls} \\.window-content \\{[^}]*max-height: calc\\(100vh`).test(css));
}
for (const app of ['shop-app', 'editor-app', 'settings-app', 'upgrade-editor']) {
  t(`${app} shrinks itself on first render`, /fitToViewport\(this\)/.test(read(`scripts/apps/${app}.js`)));
}

/* ---------- the setup window's live preview stays wired ---------- */
const settingsHbs = read('templates/settings.hbs');
const settingsJs = read('scripts/apps/settings-app.js');
const inTpl = new Set([...settingsHbs.matchAll(/data-bind="([^"]+)"/g)].map(m => m[1]));
const inJs = new Set([
  ...[...settingsJs.matchAll(/setText\("([\w-]+)"/g)].map(m => m[1]),
  ...[...settingsJs.matchAll(/\[data-bind="([\w-]+)"\]/g)].map(m => m[1])
]);
t('preview patches at least six bindings', inJs.size >= 6);
for (const b of [...inJs].sort()) t(`  template defines [data-bind="${b}"]`, inTpl.has(b));
for (const b of [...inTpl].sort()) t(`  JS patches [data-bind="${b}"]`, inJs.has(b));

const actions = new Set([...settingsHbs.matchAll(/data-action="([^"]+)"/g)].map(m => m[1]));
const registered = new Set([...settingsJs.matchAll(/^\s{6}(\w+):/gm)].map(m => m[1]));
for (const a of [...actions].sort()) t(`  setup action "${a}" is registered`, registered.has(a));
t('preview can show a theme the surrounding window is not using',
  /class="upgrades upg-theme-\{\{draft\.theme\}\} upg-preview"/.test(settingsHbs));

/* ---------- effect visibility rules ---------- */
const shopJs = read('scripts/apps/shop-app.js');
t('teasers never compute effect lines', /u\.hidden && !isGM\) return;/.test(shopJs));
t('secret upgrades withhold lines until owned',
  /u\.hideEffect && !u\.purchased && !isGM\) return;/.test(shopJs));
t('the GM is shown a hidden-from-players marker',
  /effectSecretForGM: isGM && u\.hideEffect && !u\.purchased/.test(shopJs));

process.exit(bad);
