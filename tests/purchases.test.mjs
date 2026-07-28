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

// This suite spans both halves of the old data.js: what an upgrade is, and what it costs.
// Merged into one namespace so the assertions below read as they always did.
const D = {
  ...await import(new URL('../scripts/catalog.js', import.meta.url)),
  ...await import(new URL('../scripts/economy.js', import.meta.url))
};

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

/* ---------- mutually exclusive choices ---------- */
// Exclusion is derived from the purchase record, never written down, so a refund has to reopen
// the alternatives without anything having been told to undo itself.
const oaths = [
  { id: 'O1', name: 'Oath of Ash', exclusiveGroupId: 'g1', requires: [], purchases: [] },
  { id: 'O2', name: 'Oath of Salt', exclusiveGroupId: 'g1', requires: [], purchases: [] },
  { id: 'O3', name: 'Oath of Bone', exclusiveGroupId: 'g1', requires: [], purchases: [] },
  { id: 'F1', name: 'Fair Winds', exclusiveGroupId: null, requires: [], purchases: [] }
];
reset(oaths);
store.set('exclusions', [{ id: 'g1', name: 'The Three Oaths', sort: 0 }]);

t('an upgrade in no group has no rivals', D.exclusiveSiblings(oaths[3], oaths).length === 0);
t('a group member competes with the rest of its group',
  D.exclusiveSiblings(oaths[0], oaths).map(u => u.id).join() === 'O2,O3');
t('a member never counts as its own rival',
  !D.exclusiveSiblings(oaths[0], oaths).some(u => u.id === 'O1'));
t('nothing is ruled out while the choice is open', oaths.every(u => !D.isExcluded(u, oaths)));

const chosen = oaths.map(u => u.id === 'O2' ? { ...u, purchases: [{ id: 'p' }] } : u);
t('taking one rules out the others', D.isExcluded(chosen[0], chosen) && D.isExcluded(chosen[2], chosen));
t('the taken one is not ruled out by itself', !D.isExcluded(chosen[1], chosen));
t('the rival is named, so a card can say why', D.exclusiveClaim(chosen[0], chosen).name === 'Oath of Salt');
t('an upgrade outside the group is untouched', !D.isExcluded(chosen[3], chosen));
t('a claim on an unrelated group does not leak', D.exclusiveClaim(chosen[3], chosen) === null);

// a repeatable member must not rule itself out on its second purchase
const twice = oaths.map(u => u.id === 'O2'
  ? { ...u, repeatable: true, purchases: [{ id: 'p1' }, { id: 'p2' }] } : u);
t('buying a repeatable member again does not rule itself out', !D.isExcluded(twice[1], twice));

// refunding the choice must reopen the rest, with nothing having recorded that it should
reset(oaths.map(u => u.id === 'O2' ? { ...u, purchases: [] } : u));
t('refunding the taken one reopens its rivals',
  D.getUpgrades().every(u => !D.isExcluded(u, D.getUpgrades())));

// a prerequisite inside your own group can never be met — taking it is what closes you off
reset(oaths);
t('a same-group upgrade is not offered as a prerequisite',
  !D.eligiblePrerequisites(oaths[0], oaths).some(u => u.exclusiveGroupId === 'g1'));
t('an upgrade outside the group is still offered',
  D.eligiblePrerequisites(oaths[0], oaths).some(u => u.id === 'F1'));
t('an ungrouped upgrade may still require a grouped one',
  D.eligiblePrerequisites(oaths[3], oaths).some(u => u.id === 'O1'));

/* the group registry */
t('groups come back in sort order',
  (store.set('exclusions', [{ id: 'b', name: 'Second', sort: 1 }, { id: 'a', name: 'First', sort: 0 }]),
   D.getExclusiveGroups().map(g => g.name).join() === 'First,Second'));
t('a group can be looked up by id', D.getExclusiveGroup('a').name === 'First');
t('an unknown group id resolves to nothing', D.getExclusiveGroup('gone') === null);
t('no id at all resolves to nothing', D.getExclusiveGroup(null) === null);

reset(oaths);   // reset clears the whole store, so the registry is seeded after it
store.set('exclusions', [{ id: 'g1', name: 'The Three Oaths', sort: 0 }]);
await D.upsertExclusiveGroup({ id: 'g1', name: 'The Oaths' });
t('renaming a group keeps its id', D.getExclusiveGroups()[0].id === 'g1' && D.getExclusiveGroups()[0].name === 'The Oaths');
await D.upsertExclusiveGroup({ name: 'Patrons' });
t('a new group is appended', D.getExclusiveGroups().length === 2);

await D.deleteExclusiveGroup('g1');
t('deleting a group removes it', !D.getExclusiveGroups().some(g => g.id === 'g1'));
t('its upgrades survive', D.getUpgrades().length === 4);
t('and stop ruling each other out',
  D.getUpgrades().every(u => u.exclusiveGroupId === null));

/* ---------- resources ---------- */
// A world that predates multiple resources must keep working with nothing configured.
store.clear();
store.set('currencyName', 'Sprigs');
store.set('currencyIcon', 'fa-solid fa-seedling');
store.set('balance', 7);
t('a world with no resource list still gets one', D.getCurrencies().length === 1);
t('the synthesised resource takes the old name', D.getCurrencies()[0].name === 'Sprigs');
t('the old single balance becomes its balance', D.getBalance() === 7);
t('a single resource does not read as multiple', !D.hasMultipleCurrencies());

// an upgrade priced with the old bare number still resolves
t('a legacy cost migrates to the first resource',
  JSON.stringify(D.getCosts({ cost: 3 })) === JSON.stringify([{ currencyId: 'default', amount: 3 }]));
t('a costless upgrade has no price components', D.getCosts({ cost: 0 }).length === 0);
t('a legacy cost is affordable against the migrated balance', D.canAfford({ cost: 7 }));
t('and unaffordable above it', !D.canAfford({ cost: 8 }));

// now define two
store.set('currencies', [
  { id: 'sprigs', name: 'Sprigs', icon: 'i', sort: 0 },
  { id: 'pearls', name: 'Pearls', icon: 'i', sort: 1 }
]);
store.set('balances', { sprigs: 5, pearls: 2 });
t('both resources are listed', D.getCurrencies().length === 2);
t('now it reads as multiple', D.hasMultipleCurrencies());
t('each balance is separate', D.getBalance('sprigs') === 5 && D.getBalance('pearls') === 2);
t('an unknown resource reads as zero', D.getBalance('nope') === 0);
t('getBalance with no argument uses the first resource', D.getBalance() === 5);

const dual = { costs: [{ currencyId: 'sprigs', amount: 3 }, { currencyId: 'pearls', amount: 1 }] };
t('a price in two resources is affordable when both cover it', D.canAfford(dual));
t('a price is unaffordable when only one falls short',
  !D.canAfford({ costs: [{ currencyId: 'sprigs', amount: 3 }, { currencyId: 'pearls', amount: 9 }] }));
t('zero-amount components are dropped',
  D.getCosts({ costs: [{ currencyId: 'sprigs', amount: 0 }, { currencyId: 'pearls', amount: 2 }] }).length === 1);
t('describeCosts pairs each amount with its resource',
  D.describeCosts(dual).map(c => c.currency.name).join() === 'Sprigs,Pearls');
t('a component naming a deleted resource is dropped from display',
  D.describeCosts({ costs: [{ currencyId: 'gone', amount: 1 }] }).length === 0);

await D.adjustBalance('pearls', -1, 'test');
t('adjusting one resource leaves the others alone',
  D.getBalance('pearls') === 1 && D.getBalance('sprigs') === 5);
await D.adjustBalance('pearls', -99, 'test');
t('a balance cannot go negative', D.getBalance('pearls') === 0);
await D.adjustBalance(3, 'legacy call');
t('the old two-argument adjustBalance still targets the first resource', D.getBalance('sprigs') === 8);

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
