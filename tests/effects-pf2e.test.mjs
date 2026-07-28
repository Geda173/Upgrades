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
const unknown = all.filter(p=>p.id!=="custom").flatMap(p=>p.selectors).filter(sel=>!VALID.has(sel));
t('every selector exists in pf2e 8.3.0'+(unknown.length?` (unknown: ${unknown.join(", ")})`:''), unknown.length===0);
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
