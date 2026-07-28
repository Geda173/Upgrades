globalThis.CONST = { ACTIVE_EFFECT_MODES:{CUSTOM:0,MULTIPLY:1,ADD:2,DOWNGRADE:3,UPGRADE:4,OVERRIDE:5} };
globalThis.game = { system: { id: "dnd5e" } };
const { buildChanges, describeBuild, getPreset, getPresetGroups, signFormula } =
  await import(new URL('../scripts/effects.js', import.meta.url));

let bad = 0;
const t = (n,c) => { if(!c) bad = 1; console.log((c?'PASS ':'FAIL ')+n); };

/* --- the two user-facing examples --- */
const cold = buildChanges([{ preset:"weapon.damage", value:"1d8[cold]" }]);
t('weapon damage fans out to melee + ranged', cold.length === 2);
t('weapon damage writes mwak path', cold.some(c => c.key === 'system.bonuses.mwak.damage'));
t('weapon damage writes rwak path', cold.some(c => c.key === 'system.bonuses.rwak.damage'));
t('weapon damage uses ADD mode', cold.every(c => c.mode === 2));
const spell = buildChanges([{ preset:"spell.attack", value:"+2" }]);
t('spell attack hits msak + rsak only', spell.length === 2);
t('spell attack does NOT write the nonexistent bonuses.spell.attack',
  !spell.some(c => c.key === 'system.bonuses.spell.attack'));

/* --- verified against dnd5e 5.3.3 release source --- */
const SCHEMA_5_3_3 = new Set([
  'system.bonuses.mwak.attack','system.bonuses.mwak.damage',
  'system.bonuses.rwak.attack','system.bonuses.rwak.damage',
  'system.bonuses.msak.attack','system.bonuses.msak.damage',
  'system.bonuses.rsak.attack','system.bonuses.rsak.damage',
  'system.bonuses.spell.dc',
  'system.bonuses.abilities.check','system.bonuses.abilities.save','system.bonuses.abilities.skill',
  'system.attributes.ac.bonus','system.attributes.init.bonus',
  'system.attributes.hp.bonuses.overall',
  'system.attributes.movement.walk','system.attributes.movement.fly',
  'system.attributes.senses.ranges.darkvision',
  ...['str','dex','con','int','wis','cha'].map(a => `system.abilities.${a}.value`)
]);
const allKeys = getPresetGroups().flatMap(g => g.presets).flatMap(p => p.keys);
const unknown = [...new Set(allKeys)].filter(k => !SCHEMA_5_3_3.has(k));
t('every preset path exists in dnd5e 5.3.3' + (unknown.length ? ` (unknown: ${unknown.join(', ')})` : ''),
  unknown.length === 0);
t('darkvision uses the 5.3 ranges path',
  getPreset('darkvision').keys[0] === 'system.attributes.senses.ranges.darkvision');

/* --- the stacking bug: formula fields concatenate --- */
t('signFormula adds a sign', signFormula('1d8[cold]') === '+1d8[cold]');
t('signFormula leaves a signed value alone', signFormula('+2') === '+2');
t('signFormula leaves a negative alone', signFormula('-1') === '-1');
t('formula values are signed', cold.every(c => c.value === '+1d8[cold]'));
t('AC value is signed', buildChanges([{preset:"ac",value:"1"}])[0].value === '+1');
t('walk speed is signed', buildChanges([{preset:"speed.walk",value:"10"}])[0].value === '+10');
t('hp max is signed', buildChanges([{preset:"hp.max",value:"10"}])[0].value === '+10');
// two upgrades on the same field must concatenate into a valid formula
const stacked = ['+' + '1d8[cold]', buildChanges([{preset:"weapon.damage",value:"1d6[fire]"}])[0].value];
t('stacked damage bonuses form a valid formula', ('' + stacked[0] + stacked[1]) === '+1d8[cold]+1d6[fire]');

/* --- numeric fields must NOT be signed --- */
t('ability score stays numeric', buildChanges([{preset:"ability.str",value:"2"}])[0].value === '2');
t('darkvision stays numeric', buildChanges([{preset:"darkvision",value:"60"}])[0].value === '60');
t('darkvision uses UPGRADE mode', buildChanges([{preset:"darkvision",value:"60"}])[0].mode === 4);

/* --- hygiene --- */
t('blank values are dropped',  buildChanges([{preset:"ac", value:"  "}]).length === 0);
t('unknown preset is dropped', buildChanges([{preset:"nope", value:"+1"}]).length === 0);
t('custom needs a key',        buildChanges([{preset:"custom", value:"+1", key:""}]).length === 0);
const custom = buildChanges([{preset:"custom", value:"1", key:"system.foo", mode:5}]);
t('custom honours key and mode', custom[0].key === 'system.foo' && custom[0].mode === 5);
t('custom value is left verbatim', custom[0].value === '1');
t('rows accumulate', buildChanges([{preset:"ac",value:"1"},{preset:"weapon.damage",value:"1d4[fire]"}]).length === 3);
t('describeBuild reads naturally',
  describeBuild([{preset:"weapon.damage", value:"1d8[cold]"}]) === '1d8[cold] all weapon damage');

const all = getPresetGroups().flatMap(g => g.presets);
t('catalog non-empty', all.length > 15);
t('all presets resolvable', all.every(p => getPreset(p.id)));
t('all non-custom presets have keys', all.filter(p => p.id !== 'custom').every(p => p.keys.length > 0));

globalThis.game.system.id = 'pf2e';
t('pf2e now has its own catalogue', getPresetGroups().flatMap(g => g.presets).length > 25);
globalThis.game.system.id = 'wfrp4e';
t('an unsupported system gets only the custom row',
  getPresetGroups().flatMap(g => g.presets).length === 1);
process.exit(bad);
