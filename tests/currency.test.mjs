/**
 * Physical currency: counting stacks, handing in, and the auto-credit guard rails.
 * Matching is by name, because a GM will copy the item around by hand.
 */
globalThis.game = { system: { id: 'pf2e' }, settings: { get: () => '' } };
globalThis.foundry = { utils: { setProperty: (o, k, v) => { o[k] = v; }, escapeHTML: s => s } };

const C = await import(new URL('../scripts/currency.js', import.meta.url));

let bad = 0;
const t = (n, c) => { if (!c) bad = 1; console.log((c ? 'PASS ' : 'FAIL ') + n); };
const item = (name, quantity) => ({ name, system: { quantity } });
const actor = items => ({ items });

t('an item with the currency name matches', C.isCurrencyItem(item('Sprig', 1), 'Sprig'));
t('matching ignores case', C.isCurrencyItem(item('sprig', 1), 'Sprig'));
t('matching ignores surrounding space', C.isCurrencyItem(item('  Sprig  ', 1), 'Sprig'));
t('a different item does not match', !C.isCurrencyItem(item('Rations', 1), 'Sprig'));
t('nothing matches when no currency is configured', !C.isCurrencyItem(item('Sprig', 1), ''));
t('a missing item does not match', !C.isCurrencyItem(null, 'Sprig'));

const carrying = actor([item('Sprig', 3), item('Rations', 5), item('Sprig', 2)]);
t('only currency stacks are collected', C.currencyItemsOn(carrying, 'Sprig').length === 2);
t('quantities across stacks are summed', C.countCurrencyOn(carrying, 'Sprig') === 5);
t('a stack with no quantity counts as one',
  C.countCurrencyOn(actor([item('Sprig', undefined)]), 'Sprig') === 1);
t('a quantity of zero still counts as one, not none',
  C.countCurrencyOn(actor([item('Sprig', 0)]), 'Sprig') === 1);
t('carrying none counts zero', C.countCurrencyOn(actor([item('Rations', 2)]), 'Sprig') === 0);
t('an actor with no items counts zero', C.countCurrencyOn(actor([]), 'Sprig') === 0);
t('a missing actor counts zero', C.countCurrencyOn(null, 'Sprig') === 0);

process.exit(bad);
