/**
 * The purchase record: availability, repeat buying, undoing one acquisition, and the
 * migration from the single `purchased` boolean that upgrades were authored with before.
 */
const store = new Map();
globalThis.game = {
  system: { id: 'dnd5e' },
  settings: {
    get: (_m, k) => store.get(k),
    set: (_m, k, v) => { store.set(k, v); return v; }
  },
  user: { name: 'GM' }
};
let idCounter = 0;
globalThis.foundry = {
  utils: {
    deepClone: v => structuredClone(v),
    randomID: () => `id${++idCounter}`,
    mergeObject: (a, b) => ({ ...a, ...b })
  }
};

const D = await import(new URL('../scripts/data.js', import.meta.url));

let bad = 0;
const t = (n, c) => { if (!c) bad = 1; console.log((c ? 'PASS ' : 'FAIL ') + n); };
const reset = upgrades => { store.clear(); store.set('upgrades', upgrades); };

/* ---------- availability ---------- */
t('a fresh upgrade is available', D.isAvailable({ purchases: [] }));
t('a bought one-off is not', !D.isAvailable({ purchases: [{ id: 'p1' }] }));
t('a bought repeatable still is', D.isAvailable({ repeatable: true, purchases: [{ id: 'p1' }] }));
t('a repeatable bought many times still is',
  D.isAvailable({ repeatable: true, purchases: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }));

/* ---------- migration from the old boolean ---------- */
reset([{ id: 'u1', name: 'Legacy', purchased: true, purchasedBy: 'Pat', purchasedAt: 123 }]);
let u = D.getUpgrade('u1');
t('a legacy purchased upgrade gains one purchase record', u.purchases.length === 1);
t('the legacy buyer is preserved', u.purchases[0].by === 'Pat');
t('the legacy timestamp is preserved', u.purchases[0].at === 123);
t('purchased stays true after migration', u.purchased === true);
t('a legacy unbought upgrade has no records',
  (reset([{ id: 'u2', name: 'Fresh', purchased: false }]), D.getUpgrade('u2').purchases.length === 0));
t('an unbought legacy upgrade reads as available', D.isAvailable(D.getUpgrade('u2')));

/* ---------- buying ---------- */
reset([{ id: 'u1', name: 'Draught', repeatable: true, purchases: [] }]);
const p1 = await D.addPurchase('u1', { actorId: 'a1', actorName: 'Ander', by: 'Pat' });
const p2 = await D.addPurchase('u1', { actorId: 'a2', actorName: 'Syllith', by: 'Kim' });
u = D.getUpgrade('u1');
t('each purchase is recorded', u.purchases.length === 2);
t('purchases carry distinct ids', p1.id !== p2.id);
t('a purchase remembers its actor', u.purchases[0].actorId === 'a1' && u.purchases[1].actorName === 'Syllith');
t('a purchase remembers who bought it', u.purchases[1].by === 'Kim');
t('purchaseCount is exposed for display', u.purchaseCount === 2);

/* ---------- undoing ---------- */
await D.removePurchase('u1');                       // most recent
u = D.getUpgrade('u1');
t('refunding with no id removes the most recent', u.purchases.length === 1 && u.purchases[0].id === p1.id);
await D.removePurchase('u1', p1.id);                // specific
u = D.getUpgrade('u1');
t('refunding a named purchase removes exactly it', u.purchases.length === 0);
t('purchased goes false once the last one is undone', u.purchased === false);
t('and it becomes available again', D.isAvailable(u));
t('refunding an empty upgrade is a no-op', (await D.removePurchase('u1')) === null);

reset([{ id: 'u1', name: 'One-off', purchases: [] }]);
await D.addPurchase('u1', { by: 'Pat' });
t('a party purchase records no actor', D.getUpgrade('u1').purchases[0].actorId === null);
t('a one-off becomes unavailable once bought', !D.isAvailable(D.getUpgrade('u1')));

/* ---------- sections ---------- */
store.set('categories', [
  { id: 'c2', name: 'Runes', sort: 1 },
  { id: 'c1', name: 'Lighthouse', sort: 0 }
]);
t('sections come back in sort order', D.getCategories().map(c => c.name).join() === 'Lighthouse,Runes');

const grouped = D.groupByCategory([
  { id: 'a', categoryId: 'c1' }, { id: 'b', categoryId: 'c2' }, { id: 'c', categoryId: null }
]);
t('upgrades land in their section', grouped[0].name === 'Lighthouse' && grouped[0].upgrades.length === 1);
t('uncategorised upgrades go last, under Other',
  grouped[grouped.length - 1].name === 'Other' && grouped[grouped.length - 1].upgrades.length === 1);
t('an upgrade pointing at a deleted section is not lost',
  D.groupByCategory([{ id: 'x', categoryId: 'gone' }]).some(g => g.upgrades.length === 1));
store.set('categories', []);
t('with no sections defined there are no headings',
  D.groupByCategory([{ id: 'a' }])[0].name === null);

process.exit(bad);
