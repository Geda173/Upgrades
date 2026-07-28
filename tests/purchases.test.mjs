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

/* ---------- upgrade paths ---------- */
const chain = [
  { id: 'A', name: 'Activate Magelight', requires: [], purchases: [] },
  { id: 'B', name: 'Connect to Lighthouse', requires: ['A'], purchases: [] },
  { id: 'C', name: 'Beacon Network', requires: ['B'], purchases: [] },
  { id: 'D', name: 'Dreamward', requires: ['A', 'B'], purchases: [] }
];
reset(chain);

t('a root upgrade is unlocked', D.isUnlocked(chain[0], chain));
t('a dependent upgrade is locked', !D.isUnlocked(chain[1], chain));
t('the unmet requirement is named', D.unmetRequirements(chain[1], chain)[0].name === 'Activate Magelight');
t('a two-step dependant is locked', !D.isUnlocked(chain[2], chain));

const bought = chain.map(u => u.id === 'A' ? { ...u, purchases: [{ id: 'p' }] } : u);
t('buying the prerequisite unlocks the next step', D.isUnlocked(bought[1], bought));
t('but not the step after that', !D.isUnlocked(bought[2], bought));
t('an upgrade needing two things reports only what is still missing',
  D.unmetRequirements(bought[3], bought).map(u => u.id).join() === 'B');

t('depth: a root is 0', D.pathDepth(chain[0], chain) === 0);
t('depth: one step in is 1', D.pathDepth(chain[1], chain) === 1);
t('depth: two steps in is 2', D.pathDepth(chain[2], chain) === 2);
t('depth uses the longest route when requirements converge', D.pathDepth(chain[3], chain) === 2);
t('prerequisites sort before the upgrades that need them',
  D.sortByPath(chain, chain).map(u => u.id).join() === 'A,B,C,D');

/* cycles must be impossible to create, not merely survived */
t('an upgrade cannot be offered itself as a prerequisite',
  !D.eligiblePrerequisites(chain[0], chain).some(u => u.id === 'A'));
t('something that already depends on this one is not offered',
  !D.eligiblePrerequisites(chain[0], chain).some(u => u.id === 'B'));
t('an unrelated upgrade is still offered',
  D.eligiblePrerequisites(chain[1], chain).some(u => u.id === 'A'));
t('dependsOn follows a chain', D.dependsOn(chain[2], 'A', chain));
t('dependsOn is false for an unrelated pair', !D.dependsOn(chain[0], 'C', chain));

/* a cycle that somehow reached the data must not hang the module */
const looped = [
  { id: 'X', requires: ['Y'], purchases: [] },
  { id: 'Y', requires: ['X'], purchases: [] }
];
t('a cycle does not hang pathDepth', typeof D.pathDepth(looped[0], looped) === 'number');
t('a cycle does not hang dependsOn', D.dependsOn(looped[0], 'X', looped) === true);
t('a cycle does not hang isUnlocked', D.isUnlocked(looped[0], looped) === false);

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
