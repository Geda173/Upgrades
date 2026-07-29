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

/* --- the damage-type list is read from a config other modules write into ---
   Observed in a real world running Midi-QOL: 16 entries where dnd5e 5.3.3 ships 13. Two are
   markers for the *absence* of a type and read as nonsense in a list of things to resist; the
   third is a genuine extra type and must survive. */
globalThis.CONFIG = { DND5E: { damageTypes: {
  acid: { label: 'Acid' }, fire: { label: 'Fire' }, cold: { label: 'Cold' },
  'midi-none': { label: 'No Damage' },   // Midi-QOL
  none: { label: 'No Type' },            // Midi-QOL
  vitality: { label: 'Vitality' }        // a third-party type that is real
} } };
const { getDamageTypes } = await import(new URL('../scripts/effects.js', import.meta.url));
const typeIds = getDamageTypes().map(t => t.id);
t('the "no damage" sentinel is dropped', !typeIds.includes('midi-none'));
t('the "no type" sentinel is dropped', !typeIds.includes('none'));
t('a real third-party damage type survives', typeIds.includes('vitality'));
t('the system\'s own types survive', ['acid','fire','cold'].every(id => typeIds.includes(id)));
t('the list is sorted by label', getDamageTypes().map(t => t.label).join() === 'Acid,Cold,Fire,Vitality');

/* --- resistance, immunity, vulnerability ---
   `system.traits.dr` is a DamageTraitField whose `value` is a SetField of damage types
   (release-5.3.3 module/data/actor/templates/traits.mjs), so the change adds the *type* and
   there is no amount. Signing it would put "+fire" into the set. */
const res = buildChanges([{ preset: "resistance", value: "fire" }]);
t('resistance writes the trait set path', res[0].key === 'system.traits.dr.value');
t('resistance adds to the set', res[0].mode === 2);
t('resistance value is the bare damage type', res[0].value === 'fire');
t('resistance value is NOT signed like a formula', res[0].value !== '+fire');
t('immunity writes the di path',
  buildChanges([{ preset: "immunity", value: "poison" }])[0].key === 'system.traits.di.value');
t('vulnerability writes the dv path',
  buildChanges([{ preset: "vulnerability", value: "cold" }])[0].key === 'system.traits.dv.value');
t('a resistance with no type chosen is skipped',
  buildChanges([{ preset: "resistance", value: "" }]).length === 0);
t('describes a resistance as a statement, not a bonus',
  describeBuild([{ preset: "resistance", value: "fire" }]) === 'resistance to fire');

/* --- verified against dnd5e 5.3.3 release source --- */
const SCHEMA_5_3_3 = new Set([
  'system.traits.dr.value','system.traits.di.value','system.traits.dv.value',
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
  // per-ability saves and per-skill checks, both FormulaFields — actor/templates/common.mjs and
  // actor/templates/creature.mjs at release-5.3.3; skill keys are CONFIG.DND5E.skills
  ...['str','dex','con','int','wis','cha'].map(a => `system.abilities.${a}.bonuses.save`),
  ...['acr','ani','arc','ath','dec','his','ins','itm','inv','med','nat','prc','prf','per','rel',
      'slt','ste','sur'].map(s => `system.skills.${s}.bonuses.check`),
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

/* --- parity with PF2e: the individual skills and saves --- */
t('every dnd5e skill has its own preset',
  ['acr','ani','arc','ath','dec','his','ins','itm','inv','med','nat','prc','prf','per','rel','slt','ste','sur']
    .every(s => getPreset(`skill.${s}`)));
t('a skill preset writes the check bonus, not the passive one',
  getPreset('skill.ste').keys[0] === 'system.skills.ste.bonuses.check');
t('every ability has its own save preset',
  ['str','dex','con','int','wis','cha'].every(a => getPreset(`save.${a}`)));
t('a save preset writes that ability\'s save bonus',
  getPreset('save.dex').keys[0] === 'system.abilities.dex.bonuses.save');
// Both are FormulaFields, so they concatenate unless signed — the same trap as weapon damage.
t('a skill bonus is signed', buildChanges([{preset:'skill.ste', value:'2'}])[0].value === '+2');
t('a save bonus is signed', buildChanges([{preset:'save.dex', value:'1'}])[0].value === '+1');
t('the blanket "all skills" preset still exists alongside them', !!getPreset('skill.all'));

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
