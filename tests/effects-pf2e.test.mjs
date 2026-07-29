globalThis.CONST = { ACTIVE_EFFECT_MODES:{CUSTOM:0,MULTIPLY:1,ADD:2,DOWNGRADE:3,UPGRADE:4,OVERRIDE:5} };
globalThis.game = { system: { id: "pf2e" } };
globalThis.CONFIG = {};
const E = await import(new URL('../scripts/effects.js', import.meta.url));
let bad=0; const t=(n,c)=>{if(!c)bad=1;console.log((c?'PASS ':'FAIL ')+n)};

// selectors verified against pf2e-8.3.0 source
const VALID = new Set(["attack","damage","melee-damage","ranged-damage","ac","saving-throw",
  "fortitude","reflex","will","perception","skill-check","spell-attack","spell-dc","class-dc","all-speeds",
  "acrobatics","arcana","athletics","crafting","deception","diplomacy","intimidation","medicine",
  "nature","occultism","performance","religion","society","stealth","survival","thievery"]);
const all = E.getPresetGroups().flatMap(g=>g.presets);
t('pf2e catalogue is populated', all.length > 25);
// Resistance and its relatives are rule elements in their own right and carry no selector at all,
// so they are held to a different contract — a ruleKey — rather than skipped quietly.
const selectorPresets = all.filter(p => p.id !== "custom" && !p.iwr);
const unknown = selectorPresets.flatMap(p=>p.selectors).filter(sel=>!VALID.has(sel));
t('every selector exists in pf2e 8.3.0'+(unknown.length?` (unknown: ${unknown.join(", ")})`:''), unknown.length===0);
t('every non-IWR preset actually has a selector',
  selectorPresets.every(p => Array.isArray(p.selectors) && p.selectors.length > 0));
const iwrPresets = all.filter(p => p.iwr);
t('the IWR presets name a real rule element',
  iwrPresets.length === 3 && iwrPresets.every(p => ["Resistance","Weakness","Immunity"].includes(p.ruleKey)));
t('no IWR preset also claims a selector', iwrPresets.every(p => !p.selectors));
t('builder is supported on pf2e', E.systemSupportsBuilder());

// the lighthouse: +1 circumstance to hit
const hit = E.buildRules([{preset:"attack", value:"1", bonusType:"circumstance"}], {label:"Lighthouse"});
t('flat bonus is a FlatModifier', hit[0].key === "FlatModifier");
t('flat bonus targets the attack selector', JSON.stringify(hit[0].selector) === '["attack"]');
t('flat bonus is numeric, not a string', hit[0].value === 1);
t('bonus type is carried through', hit[0].type === "circumstance");
t('rule is labelled with the upgrade name', hit[0].label === "Lighthouse");

// dice must not be a FlatModifier
const dice = E.buildRules([{preset:"damage", value:"1d6", damageType:"fire"}]);
t('dice become a DamageDice rule', dice[0].key === "DamageDice");
t('dice number parsed', dice[0].diceNumber === 1);
t('die size parsed', dice[0].dieSize === "d6");
t('damage type carried', dice[0].damageType === "fire");
t('DamageDice carries no numeric value field', dice[0].value === undefined);
t('bare "d8" means one die', E.parseDice("d8").diceNumber === 1);
t('"2d10" parses', E.parseDice("2d10").dieSize === "d10" && E.parseDice("2d10").diceNumber === 2);
t('a flat number is not dice', E.parseDice("2") === null);

// flat damage stays a FlatModifier but keeps its type
const flatDmg = E.buildRules([{preset:"damage", value:"2", damageType:"cold", bonusType:"item"}]);
t('flat damage is a FlatModifier', flatDmg[0].key === "FlatModifier" && flatDmg[0].value === 2);
t('flat damage keeps its damage type', flatDmg[0].damageType === "cold");

// hygiene
t('blank rows skipped', E.buildRules([{preset:"attack", value:" "}]).length === 0);
t('non-numeric junk is skipped', E.buildRules([{preset:"attack", value:"banana"}]).length === 0);
t('custom selectors split on comma', JSON.stringify(
   E.buildRules([{preset:"custom", key:"attack, damage", value:"1"}])[0].selector) === '["attack","damage"]');
t('custom with no selector is skipped', E.buildRules([{preset:"custom", key:"", value:"1"}]).length === 0);
t('default bonus type is circumstance', E.buildRules([{preset:"ac", value:"1"}])[0].type === "circumstance");

// description names the type, since the type decides stacking
t('describes a flat bonus with its type',
  E.describeRows([{preset:"attack", value:"1", bonusType:"item"}])[0] === "Attack rolls +1 item");
t('describes dice without a bonus type',
  E.describeRows([{preset:"damage", value:"1d6", damageType:"fire"}])[0] === "Damage +1d6 fire");

/* ---------- resistance, weakness, immunity ----------
   These are rule elements in their own right, not modifiers. Verified against
   src/module/rules/rule-element/iwr/{resistance,immunity}.ts and the RuleElements registry in
   src/module/rules/index.ts at pf2e-8.3.0: `type` is an array even for one entry, Resistance and
   Weakness carry a numeric `value`, and Immunity declares `readonly value = null`. */
const resist = E.buildRules([{ preset: "resistance", value: "5", damageType: "fire" }]);
t('resistance is its own rule element, not a FlatModifier', resist[0].key === "Resistance");
t('resistance type is an array even for one type', Array.isArray(resist[0].type));
t('resistance names the type', resist[0].type[0] === "fire");
t('resistance value is numeric', resist[0].value === 5);
t('resistance carries no selector', resist[0].selector === undefined);
// A resistance has no stacking type; emitting one would be meaningless at best.
t('resistance carries no bonus type', resist[0].type[0] !== "circumstance" && resist[0].bonusType === undefined);

const weak = E.buildRules([{ preset: "weakness", value: "5", damageType: "cold" }]);
t('weakness uses the Weakness rule element', weak[0].key === "Weakness" && weak[0].value === 5);

const immune = E.buildRules([{ preset: "immunity", value: "poison" }]);
t('immunity uses the Immunity rule element', immune[0].key === "Immunity");
t('immunity takes the type as its whole payload', immune[0].type[0] === "poison");
t('immunity emits no value, because the rule element has none', !("value" in immune[0]));

t('a resistance with no type is skipped rather than written half-formed',
  E.buildRules([{ preset: "resistance", value: "5" }]).length === 0);
t('a resistance with no amount is skipped',
  E.buildRules([{ preset: "resistance", value: "", damageType: "fire" }]).length === 0);
t('a non-numeric resistance amount is skipped',
  E.buildRules([{ preset: "resistance", value: "1d6", damageType: "fire" }]).length === 0);

// the type list must be real: checked against resistanceTypes in src/scripts/config/iwr.ts
const PF2E_RESIST = new Set(["acid","air","alchemical","all-damage","area-damage","axes","bleed",
  "bludgeoning","cold","critical-hits","custom","damage-from-spells","earth","electricity","energy",
  "fire","force","ghost-touch","light","magical","mental","metal","mythic","non-magical","nonlethal",
  "nonlethal-attacks","persistent-damage","physical","piercing","plant","poison","precision",
  "protean-anatomy","radiation","salt","salt-water","slashing","sonic","spells","spirit","time",
  "unarmed-attacks","vitality","void","vorpal","vorpal-adamantine","water","weapons",
  "weapons-shedding-bright-light","wood"]);
const offered = E.getResistanceTypes().map(x => x.id);
const bogus = offered.filter(id => !PF2E_RESIST.has(id));
t('every offered resistance type exists in pf2e 8.3.0'
  + (bogus.length ? ` (unknown: ${bogus.join(", ")})` : ''), bogus.length === 0);
t('the fallback list is not empty', offered.length > 20);
// The PF2e config is shared with every other module too, so the same guard applies there.
globalThis.CONFIG = { PF2E: { resistanceTypes: {
  fire: 'Fire', physical: 'Physical', none: 'No Type', 'midi-none': 'No Damage'
} } };
const live = E.getResistanceTypes().map(x => x.id);
t('null-type sentinels are dropped from the PF2e list too',
  !live.includes('none') && !live.includes('midi-none'));
t('and the real ones survive', live.includes('fire') && live.includes('physical'));
globalThis.CONFIG = {};
t('resistance types are not merely the damage types — physical is offered', offered.includes("physical"));

t('describes a resistance as a statement, not a bonus',
  E.describeRows([{ preset: "resistance", value: "5", damageType: "fire" }])[0] === "Resistance 5 to fire");
t('describes an immunity without an amount',
  E.describeRows([{ preset: "immunity", value: "poison" }])[0] === "Immunity to poison");

// dnd5e must be untouched by all of this
globalThis.game.system.id = "dnd5e";
t('dnd5e still builds ActiveEffect changes',
  E.buildChanges([{preset:"ac", value:"1"}])[0].key === "system.attributes.ac.bonus");
/* ---------- the labels are the interface; jargon alone is not enough ---------- */
for (const b of E.PF2E_BONUS_TYPES) {
  t(`bonus type "${b.id}" explains itself`, typeof b.hint === 'string' && b.hint.length > 30);
  t(`bonus type "${b.id}" is labelled in plain language`, /—|\(/.test(b.label));
}
t('the two rarely-right types say so',
  E.PF2E_BONUS_TYPES.filter(b => /rarely/.test(b.label)).map(b => b.id).sort().join() === 'ability,proficiency');
t('untyped is offered as the just-make-it-work option',
  E.PF2E_BONUS_TYPES.find(b => b.id === 'untyped').label.includes('always stacks'));

process.exit(bad);
