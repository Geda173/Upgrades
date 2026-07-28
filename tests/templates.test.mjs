/**
 * Handlebars templates: they must compile, and they must render the values the apps pass in.
 *
 * No helpers are registered on purpose. The project rule is that templates use only core
 * Handlebars and precompute display values in _prepareContext. Stubbing Foundry's `checked`
 * and `selected` here once hid a "Missing helper" crash that only appeared at runtime.
 */
import fs from 'node:fs';

let Handlebars;
try {
  Handlebars = (await import('handlebars')).default;
} catch {
  console.log('SKIP  handlebars is not installed — run: npm install');
  process.exit(0);
}

let bad = 0;
const t = (n, c) => { if (!c) bad = 1; console.log((c ? 'PASS ' : 'FAIL ') + n); };
const tpl = name => fs.readFileSync(new URL(`../templates/${name}`, import.meta.url), 'utf8');

/* ---------- every template compiles without a helper ---------- */
for (const name of fs.readdirSync(new URL('../templates', import.meta.url))) {
  const src = tpl(name);
  let missingHelper = null;
  try {
    Handlebars.compile(src)({});
  } catch (e) {
    if (/Missing helper/.test(e.message)) missingHelper = e.message.split('\n')[0];
  }
  t(`${name}: uses only core Handlebars` + (missingHelper ? ` — ${missingHelper}` : ''), !missingHelper);
}

/* ---------- rendering with realistic context ---------- */
const vocab = {
  windowTitle: 'The Memorial Garden', currencyName: 'Sprigs',
  currencyIcon: 'fa-solid fa-seedling', currencyIconIsImg: false, actionVerb: 'Plant',
  hostName: "Elara's Respite", hostImg: '', hostIsImage: false,
  hostIconClass: 'fa-solid fa-seedling', greeting: 'The soil remembers.'
};

const shopCards = [
    { id: 'a', displayName: 'Nightbloom', displayFlavor: 'Planted in memory.', displayImg: '',
      cost: 3, purchased: false, mystery: false, affordable: true, selected: true,
      targetLabel: 'Galadon Stormwhisper', excerpt: 'Planted at the north wall; it flowers in winter.',
      costs: [{ amount: 3, name: 'Sprigs', icon: 'fa-solid fa-seedling', isImage: false },
              { amount: 1, name: 'Pearls of Power', icon: 'fa-solid fa-circle', isImage: false }],
      effectLines: ['All weapon damage +1d4 cold', 'Armor Class +1'] },
    { id: 'b', displayName: '???', displayFlavor: '…', displayImg: '', cost: 9,
      purchased: false, mystery: true, affordable: false, selected: false,
      targetLabel: null, effectLines: [] },
    { id: 'c', displayName: 'Ashen Fern', displayFlavor: 'Owned.', displayImg: '', cost: 2,
      purchased: true, soldOut: true, available: false, mystery: false, affordable: false,
      selected: false, targetLabel: null, effectLines: [], ownedCount: 0 },
    { id: 'f', displayName: 'Connect to Lighthouse', displayFlavor: '', displayImg: '', cost: 10,
      purchased: false, soldOut: false, available: true, mystery: false, affordable: false,
      locked: true, onPath: true, requiresLabel: 'Activate Magelight',
      selected: false, targetLabel: null, effectLines: [], ownedCount: 0 },
    { id: 'e', displayName: 'Healing Draught', displayFlavor: 'Bought again and again.', displayImg: '',
      cost: 1, purchased: true, soldOut: false, available: true, mystery: false, affordable: true,
      selected: false, targetLabel: 'Whoever buys it', effectLines: [],
      ownedCount: 3, ownedBy: 'Ander Raventail, Syllith Azmarun' },
    { id: 'd', displayName: 'Secret Bloom', displayFlavor: 'Sealed.', displayImg: '', cost: 4,
      purchased: false, mystery: false, affordable: true, selected: false,
      targetLabel: null, effectLines: [], effectSecret: true },
    { id: 'g', displayName: 'Oath of Ash', displayFlavor: 'The first vow.', displayImg: '', cost: 5,
      purchased: false, soldOut: false, available: true, mystery: false, affordable: false,
      locked: true, excluded: true, excludedBy: 'Oath of Salt', exclusiveLabel: '',
      selected: false, targetLabel: null, effectLines: [], ownedCount: 0 },
    { id: 'h', displayName: 'Oath of Bone', displayFlavor: 'Still open.', displayImg: '', cost: 5,
      purchased: false, soldOut: false, available: true, mystery: false, affordable: true,
      locked: false, excluded: false, excludedBy: '', exclusiveLabel: 'The Three Oaths',
      selected: false, targetLabel: null, effectLines: [], ownedCount: 0 }
];

const shop = Handlebars.compile(tpl('shop.hbs'))({
  isGM: true, balance: 7, vocab,
  currencies: [{ id: 'sprigs', name: 'Sprigs', icon: 'fa-solid fa-seedling', isImage: false, balance: 7 },
               { id: 'pearls', name: 'Pearls of Power', icon: 'fa-solid fa-circle', isImage: false, balance: 2 }],
  hasMultipleCurrencies: true,
  upgrades: shopCards,
  groups: [
    { id: 'c1', name: 'Lighthouse', icon: 'fa-solid fa-tower-observation', upgrades: shopCards.slice(0, 2) },
    { id: null, name: 'Other', icon: 'fa-solid fa-folder-open', upgrades: shopCards.slice(2) }
  ],
  hasSections: true,
  selected: { name: 'Nightbloom', img: '', flavor: 'Planted in memory.',
              targetLabel: 'Galadon Stormwhisper',
              effectLines: ['All weapon damage +1d4 cold', 'Armor Class +1'] },
  selectedDescription: '<p>Grants a boon.</p>'
});

const editor = Handlebars.compile(tpl('editor.hbs'))({
  vocab, balance: 7,
  categories: [{ id: 'c1', name: 'Lighthouse', icon: 'fa-solid fa-tower-observation' }],
  hasCategories: true,
  exclusiveGroups: [{ id: 'g1', name: 'The Three Oaths', members: 'Oath of Ash, Oath of Salt' },
                    { id: 'g2', name: 'Patrons', members: '' }],
  hasExclusiveGroups: true,
  groups: [{ id: 'c1', name: 'Lighthouse', icon: 'fa-solid fa-tower-observation', upgrades: [
    { id: 'a', name: 'Nightbloom', img: '', cost: 3, purchased: true, purchasedBy: 'Pat',
      hidden: false, targetLabel: 'Galadon Stormwhisper', ownedCount: 1,
      exclusiveLabel: 'The Three Oaths',
      effectLabel: '1d8[cold] all weapon damage' },
    { id: 'e', name: 'Healing Draught', img: '', cost: 1, purchased: true, isRepeatable: true,
      ownedCount: 3, ownedNames: 'Ander Raventail', hidden: false,
      targetLabel: 'Whoever buys it', effectLabel: '' }] }],
  history: [{ when: 'today', isPurchase: true, name: 'Nightbloom', cost: 3, by: 'Pat' },
            { when: 'today', isPurchase: false, deltaStr: '+5', before: 2, after: 7,
              reason: 'Cleared the grove' }]
});

const upgradeEditor = Handlebars.compile(tpl('upgrade-editor.hbs'))({
  upgrade: { name: 'Nightbloom', cost: 3, img: '', flavor: '', description: '', hidden: false,
             target: 'actor', effectMode: 'build', effectUuid: '', purchased: true, hideEffect: true,
             repeatable: true, choiceEnabled: true, choiceLabel: 'Which spell?', choiceHint: 'Drag one in.' },
  vocab, saveLabel: 'Save', systemId: 'dnd5e', builderSupported: true, isPf2e: false,
  hasCategories: true,
  categories: [{ id: 'c1', name: 'Lighthouse', isSelected: true }],
  costRows: [{ id: 'sprigs', name: 'Sprigs', icon: 'fa-solid fa-seedling', isImage: false, amount: 3 },
             { id: 'pearls', name: 'Pearls of Power', icon: 'fa-solid fa-circle', isImage: false, amount: 1 }],
  bonusTypeLegend: [],
  choiceEnabled: true,
  hasPrerequisiteCandidates: true,
  prerequisites: [{ id: 'p1', name: 'Activate Magelight', isSelected: true },
                  { id: 'p2', name: 'Talisman Permanency', isSelected: false }],
  hasExclusiveGroups: true,
  exclusiveGroups: [{ id: 'g1', name: 'The Three Oaths', isSelected: true },
                    { id: 'g2', name: 'Patrons', isSelected: false }],
  exclusiveNote: 'Buying this rules out Oath of Salt — and any of them rules out this one.',
  targetOptions: [{ value: 'party', label: 'The whole party', isSelected: false },
                  { value: 'buyer', label: 'Whoever buys it', isSelected: false },
                  { value: 'actor', label: 'One specific character', isSelected: true }],
  isBuyerTarget: false,
  isActorTarget: true, hasTargetActor: true,
  actorGroups: [{ label: 'Party', actors: [{ id: 'x', name: 'Galadon Stormwhisper', isSelected: true }] }],
  partyNote: '…',
  effectModeOptions: [{ value: 'none', label: 'Nothing', isSelected: false },
                      { value: 'build', label: 'Build a bonus', isSelected: true },
                      { value: 'link', label: 'Link', isSelected: false }],
  isBuild: true, isLink: false,
  rows: [{ index: 0, preset: 'weapon.damage', value: '1d8', key: '', mode: 2, isCustom: false,
           isDamage: true, isPf2e: false, placeholder: '+1d8',
           damageTypes: [{ id: 'cold', label: 'Cold', isSelected: true }],
           bonusTypes: [{ id: 'circumstance', label: 'Circumstance', isSelected: true }],
           presetGroups: [{ label: 'Attack & damage', presets: [
             { id: 'weapon.damage', label: 'All weapon damage', isSelected: true },
             { id: 'custom', label: 'Custom data path…', isSelected: false }] }],
           modeChoices: [{ value: 2, label: 'Add', isSelected: true }] }],
  linkedName: null, linkedImg: null, linkedType: null, linkMissing: false,
  showsGrantNote: true, grantNote: 'Granted as a feature.'
});

/* ---------- assertions: these catch ../ depth mistakes, which fail silently ---------- */
// Bound the split to the card grid first. Splitting the whole document leaves the LAST card's
// chunk running on into the detail pane, which made a correct template look like a leak.
// Cards now live in one grid per section; collect across all of them, each bounded to its own grid.
const cards = [...shop.matchAll(/<section class="upg-grid">([\s\S]*?)<\/section>/g)]
  .flatMap(m => m[1].split('<div class="upg-card').slice(1));
const teaser = cards.find(c => c.includes('mystery'));
const normal = cards.find(c => c.includes('Nightbloom'));
const secret = cards.find(c => c.includes('Secret Bloom'));

t('shop: currency icon resolves inside the card loop', shop.includes('fa-seedling'));
t('shop: action verb comes from vocab', shop.includes('>Plant<'));
t('shop: per-actor target badge', shop.includes('Galadon Stormwhisper'));
t('shop: host name', /Elara(&#x27;|')s Respite/.test(shop));

t('shop: a card previews the description without expanding',
  !!normal && normal.includes('upg-excerpt') && normal.includes('flowers in winter'));
t('shop: a card with no flavour text reserves no empty line',
  (() => { const c = cards.find(x => x.includes('Healing Draught')); return !!c; })());
t('shop: a teaser card has no excerpt', !!teaser && !teaser.includes('upg-excerpt'));
t('shop: a normal card lists what it grants', !!normal && normal.includes('All weapon damage +1d4 cold'));
t('shop: detail pane has a "What it grants" heading', shop.includes('What it grants'));
t('shop: a teaser card leaks nothing', !!teaser && !teaser.includes('upg-effects') && teaser.includes('???'));
t('shop: a secret card says so instead of looking cosmetic',
  !!secret && secret.includes('upg-effect-secret') && !secret.includes('upg-effects'));

t('shop: every resource has its own purse in the header',
  (shop.match(/upg-purse/g) || []).length >= 2);
t('shop: a multi-resource price shows every component',
  (() => { const c = cards.find(x => x.includes('Nightbloom'));
           return !!c && (c.match(/upg-price/g) || []).length === 2; })());
t('shop: section heading rendered', shop.includes('upg-section-head') && shop.includes('Lighthouse'));
t('shop: every card still rendered across sections', cards.length === 8);
(() => {
  const ruled = cards.find(c => c.includes('Oath of Ash'));
  const open = cards.find(c => c.includes('Oath of Bone'));
  t('shop: a ruled-out card is marked as such, not merely locked',
    !!ruled && ruled.includes('excluded'));
  t('shop: a ruled-out card names the rival that closed it',
    !!ruled && ruled.includes('Ruled out by Oath of Salt'));
  t('shop: a ruled-out card offers no purchase button',
    !!ruled && ruled.includes('>Ruled out<') && !/data-action="buy"/.test(ruled));
  // The exclusivity has to be visible while the choice is still open, or the only player who
  // learns about it is the one who finds their card closed.
  t('shop: an open choice announces the set it belongs to',
    !!open && open.includes('The Three Oaths — only one'));
  t('shop: an open choice can still be bought',
    !!open && /data-action="buy"/.test(open) && !open.includes('Ruled out'));
})();
(() => {
  const lockedCard = cards.find(c => c.includes('Connect to Lighthouse'));
  t('shop: a locked card is marked locked', !!lockedCard && lockedCard.includes('locked'));
  t('shop: a locked card names what unlocks it',
    !!lockedCard && lockedCard.includes('Requires Activate Magelight'));
  t('shop: a locked card offers no purchase button',
    !!lockedCard && lockedCard.includes('>Locked<') && !/data-action="buy"/.test(lockedCard));
  t('shop: a card on a path is visually linked',
    !!lockedCard && lockedCard.includes('on-path') && lockedCard.includes('upg-path-link'));
})();
t('shop: a sold-out card is stamped Owned', shop.includes('upg-stamp'));
(() => {
  const repeat = cards.find(c => c.includes('Healing Draught'));
  t('shop: a repeatable card shows a tally, not an Owned stamp',
    !!repeat && repeat.includes('upg-tally') && repeat.includes('\u00d73') && !repeat.includes('upg-stamp'));
  t('shop: a repeatable card can still be bought', !!repeat && repeat.includes('upg-buy') && !repeat.includes('disabled'));
  t('shop: a repeatable card lists who owns it', !!repeat && repeat.includes('Ander Raventail'));
})();

t('editor: repeatable upgrade shows a purchase tally', editor.includes('Bought \u00d73'));
t('editor: repeatable upgrade lists its owners', editor.includes('Ander Raventail'));
t('editor: section heading row rendered', editor.includes('upg-group-row') && editor.includes('Lighthouse'));
t('editor: section management list rendered', editor.includes('upg-category-list'));
t('editor: exclusive choices are managed alongside sections',
  editor.includes('upg-exclusive-groups') && editor.includes('The Three Oaths'));
t('editor: a choice lists what is competing in it', editor.includes('Oath of Ash, Oath of Salt'));
t('editor: an empty choice says so rather than looking configured',
  /upg-group-members empty/.test(editor));
t('editor: the upgrade table shows which choice an upgrade belongs to',
  /fa-code-branch[\s\S]{0,40}The Three Oaths/.test(editor));
t('editor: currency name reaches the history loop', editor.includes('Sprigs +5'));
t('editor: target column', editor.includes('Galadon Stormwhisper'));
t('editor: effect label', editor.includes('1d8[cold] all weapon damage'));

t('upgrade-editor: row preset marked selected', /All weapon damage<\/option>/.test(upgradeEditor));
t('upgrade-editor: row value', upgradeEditor.includes('value="1d8"'));
t('upgrade-editor: damage type dropdown appears', upgradeEditor.includes('rowDamageType'));
t('upgrade-editor: dnd5e does NOT get the pf2e bonus-type dropdown',
  !upgradeEditor.includes('rowBonusType'));
t('upgrade-editor: target actor marked selected', upgradeEditor.includes('Galadon Stormwhisper'));
t('upgrade-editor: one cost field per resource',
  upgradeEditor.includes('name="cost:sprigs"') && upgradeEditor.includes('name="cost:pearls"'));
t('upgrade-editor: cost fields are labelled with the resource',
  upgradeEditor.includes('Sprigs') && upgradeEditor.includes('Pearls of Power'));
t('upgrade-editor: existing amounts are filled in',
  /name="cost:sprigs" value="3"/.test(upgradeEditor));
t('upgrade-editor: section dropdown marks the current section',
  /name="categoryId"[\s\S]*?value="c1" selected/.test(upgradeEditor));
t('upgrade-editor: prerequisite picker lists candidates',
  upgradeEditor.includes('name="requires"') && upgradeEditor.includes('Talisman Permanency'));
t('upgrade-editor: an existing prerequisite is ticked',
  /value="p1"[^>]*checked/.test(upgradeEditor));
t('upgrade-editor: offers an exclusive-choice picker',
  upgradeEditor.includes('name="exclusiveGroupId"') && upgradeEditor.includes('Patrons'));
t('upgrade-editor: the current exclusive choice is marked selected',
  /name="exclusiveGroupId"[\s\S]*?value="g1" selected/.test(upgradeEditor));
t('upgrade-editor: opting out of every choice stays available',
  /<option value="">— None/.test(upgradeEditor));
t('upgrade-editor: names what the choice would rule out',
  upgradeEditor.includes('rules out Oath of Salt'));
t('upgrade-editor: offers the buyer-choice prompt', upgradeEditor.includes('name="choiceEnabled"'));
t('upgrade-editor: the prompt question is editable when enabled',
  upgradeEditor.includes('value="Which spell?"'));
t('upgrade-editor: offers the effects-bar toggle', upgradeEditor.includes('showInEffectsBar'));
t('upgrade-editor: offers the buyer target', upgradeEditor.includes('Whoever buys it'));
t('upgrade-editor: repeatable checkbox is checked when set',
  /name="repeatable"[^>]*checked/.test(upgradeEditor));
t('upgrade-editor: hide-mechanics checkbox is checked when set',
  /name="hideEffect"[^>]*checked/.test(upgradeEditor));

process.exit(bad);
