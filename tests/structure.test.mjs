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

/* ---------- cards align across a row ---------- */
t('cards are flex columns so their content can be distributed',
  /\.upg-card \{[^}]*flex-direction: column/.test(css));
t('the card body flexes to fill the card',
  /\.upg-card \.upg-body \{[^}]*flex: 1/.test(css));
t('the cost row is pushed to the bottom, so buttons line up across a row',
  /\.upg-cost \{[^}]*margin-top: auto/.test(css));
t('card art keeps its height when a neighbour is taller',
  /\.upg-card \.upg-art \{[^}]*flex: none/.test(css));
t('the description excerpt is clamped so one card cannot run away',
  /\.upg-excerpt \{[^}]*-webkit-line-clamp: 3/.test(css));

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

/* ---------- upgrade paths ---------- */
t('a locked upgrade is refused at the socket entry point, not just in the UI',
  /unmetRequirements\(upgrade\)/.test(read('scripts/purchase.js')));
t('locked cards are visually distinct', /\.upg-card\.locked \{/.test(css));
t('cards on a path carry a rail', /\.upg-card\.on-path \{[^}]*border-left/.test(css));

t('a repeatable upgrade does not declare itself take-once',
  /maxTakable: upgrade\.repeatable/.test(read('scripts/systems/adapter.js')));
t('the bonus type is hidden on a dice row, where it would be discarded',
  /bonusType\.classList\.toggle\("hidden", isDice\)/.test(read('scripts/apps/upgrade-editor.js')));

t('the merchant token wrap falls through for every other token',
  /return original\.call\(this, event\)/.test(read('scripts/main.js')));
t('the merchant token wrap is applied only once',
  /_upgradesMerchantBound/.test(read('scripts/main.js')));

t('the buyer is asked on their own client, before the request is sent',
  /promptForDocument[\s\S]{0,400}emit\(\{ type: "requestPurchase"/.test(read('scripts/purchase.js')));
t('cancelling the prompt spends nothing', /if \(!choice\) return;/.test(read('scripts/purchase.js')));
t('the choice is remembered on the purchase so re-sync can rebuild it',
  /choice: purchase\.choice/.test(read('scripts/systems/adapter.js')));
t('re-renders restore scroll position', /restoreViewState\(this/.test(read('scripts/apps/upgrade-editor.js')));

/* ---------- no dead interactive surfaces ---------- */
// A drop zone in a template with no listener behind it looks completely normal and does nothing
// at all. Both zones in the setup window shipped that way, unnoticed, because the edit that was
// supposed to add their listeners anchored on text that lived in a different file.
const APP_FOR_TEMPLATE = {
  'settings.hbs': 'scripts/apps/settings-app.js',
  'upgrade-editor.hbs': 'scripts/apps/upgrade-editor.js',
  'shop.hbs': 'scripts/apps/shop-app.js',
  'editor.hbs': 'scripts/apps/editor-app.js'
};
for (const [template, app] of Object.entries(APP_FOR_TEMPLATE)) {
  const tplSrc = read(`templates/${template}`);
  const appSrc = read(app);
  const zones = [...new Set([...tplSrc.matchAll(/data-drop="([\w-]+)"/g)].map(m => m[1]))];
  for (const zone of zones) {
    // either named directly, or reached through a loop over zone names
    const wired = appSrc.includes(`data-drop="${zone}"`) || appSrc.includes(`"${zone}"`);
    t(`${template}: drop zone "${zone}" has a listener behind it`, wired);
  }
  // every data-action in a template must be a registered action
  const actions = [...new Set([...tplSrc.matchAll(/data-action="([\w-]+)"/g)].map(m => m[1]))];
  const registered = new Set([...appSrc.matchAll(/^\s{6}(\w+):/gm)].map(m => m[1]));
  for (const action of actions) {
    t(`${template}: action "${action}" is registered`, registered.has(action));
  }
}

/* ---------- nothing should ask the user to know an icon name ---------- */
// This was fixed three separate times: the currency icon, the host portrait, and the resource
// dialog. Each surface that takes an icon must offer a way to choose one.
const settingsApp = read('scripts/apps/settings-app.js');
t('the setup form offers a picker for the currency icon',
  /iconGroups/.test(settingsHbs) && /name="currencyIcon"/.test(settingsHbs));
t('the setup form offers a picker for the host portrait',
  /hostIconGroups/.test(settingsHbs) && /name="hostImg"/.test(settingsHbs));
t('the resource dialog offers a picker rather than a bare field',
  /iconPickerHtml\(ICON_GROUPS/.test(settingsApp));
t('the resource dialog wires the picker up to its field',
  /wireIconPicker\((?:dialog|root)[^)]*, "icon"\)/.test(settingsApp));
t('every icon surface also allows browsing for an image',
  (settingsApp.match(/data-browse-icon|pickIconImage|pickHostImg/g) || []).length >= 2);
t('the picker writes into the field, keeping one source of truth',
  /input\.value = b\.dataset\.pickIcon/.test(settingsApp));

/* ---------- effect visibility rules ---------- */
const shopJs = read('scripts/apps/shop-app.js');
t('teasers never compute effect lines', /u\.hidden && !isGM\) return;/.test(shopJs));
t('secret upgrades withhold lines until owned',
  /u\.hideEffect && !u\.purchased && !isGM\) return;/.test(shopJs));
t('the GM is shown a hidden-from-players marker',
  /effectSecretForGM: isGM && u\.hideEffect && !u\.purchased/.test(shopJs));

process.exit(bad);
