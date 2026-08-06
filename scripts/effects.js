/**
 * Effect authoring: turn plain-language choices into an ActiveEffect payload,
 * so a GM never has to know a UUID or a system data path.
 *
 * An upgrade carries one of three payload modes:
 *   "none"  — cosmetic only
 *   "link"  — effectUuid points at an existing ActiveEffect or Item (drag & drop in the editor)
 *   "build" — effectBuild.rows are preset bonuses assembled here into ActiveEffect changes
 */
import { MODULE_ID } from "./settings.js";
import { t, localizeFields } from "./i18n.js";

export const EFFECT_MODE = {
  NONE: "none",
  LINK: "link",
  BUILD: "build"
};

const MODES = CONST.ACTIVE_EFFECT_MODES;

/**
 * Preset bonuses, grouped for the editor's dropdown.
 * Paths verified against the dnd5e 5.3.3 actor data models (release-5.3.3).
 *
 * Each preset writes `value` into one or more system paths. `keys` (plural) exists because
 * some player-facing concepts — "all weapon damage" — are several data paths in dnd5e.
 *
 * `type` matters more than it looks. Almost every dnd5e bonus target is a FormulaField, i.e. a
 * *string*, and Foundry's ADD mode on a string concatenates rather than adds. Two upgrades each
 * granting "1d8[cold]" would produce "1d8[cold]1d6[fire]" — not a formula. So formula values are
 * normalised to carry an explicit sign ("+1d8[cold]"), which makes concatenation compose correctly:
 * "" + "+2" + "+3" evaluates as 5. Only genuinely numeric fields use type "number".
 */
const RAW_DND5E = [
  { group: "AttackDamage", id: "weapon.attack", placeholder: "+1",
    keys: ["system.bonuses.mwak.attack", "system.bonuses.rwak.attack"] },
  { group: "AttackDamage", id: "weapon.damage", damage: true, placeholder: "+1d8",
    keys: ["system.bonuses.mwak.damage", "system.bonuses.rwak.damage"] },
  { group: "AttackDamage", id: "melee.attack", placeholder: "+1",
    keys: ["system.bonuses.mwak.attack"] },
  { group: "AttackDamage", id: "melee.damage", damage: true, placeholder: "+1d8",
    keys: ["system.bonuses.mwak.damage"] },
  { group: "AttackDamage", id: "ranged.attack", placeholder: "+1",
    keys: ["system.bonuses.rwak.attack"] },
  { group: "AttackDamage", id: "ranged.damage", damage: true, placeholder: "+1d6",
    keys: ["system.bonuses.rwak.damage"] },

  // dnd5e has no `bonuses.spell.attack`; spell attacks are the melee/ranged spell-attack pair.
  { group: "Spellcasting", id: "spell.attack", placeholder: "+2",
    keys: ["system.bonuses.msak.attack", "system.bonuses.rsak.attack"] },
  { group: "Spellcasting", id: "spell.dc", placeholder: "+1",
    keys: ["system.bonuses.spell.dc"] },
  { group: "Spellcasting", id: "spell.damage", damage: true, placeholder: "+1d4",
    keys: ["system.bonuses.msak.damage", "system.bonuses.rsak.damage"] },

  { group: "Defence", id: "ac", placeholder: "+1",
    keys: ["system.attributes.ac.bonus"] },
  { group: "Defence", id: "hp.max", placeholder: "+10",
    keys: ["system.attributes.hp.bonuses.overall"] },
  { group: "Defence", id: "save.all", placeholder: "+1",
    keys: ["system.bonuses.abilities.save"] },

  // dnd5e keeps these as *sets of damage types*, not numbers: `system.traits.dr` is a
  // DamageTraitField whose `value` is a SetField, so the change adds the type itself and there
  // is no amount to give. Verified against release-5.3.3 module/data/actor/templates/traits.mjs.
  { group: "Defence", id: "resistance", iwr: true,
    valueIsType: true, type: "set", keys: ["system.traits.dr.value"] },
  { group: "Defence", id: "immunity", iwr: true,
    valueIsType: true, type: "set", keys: ["system.traits.di.value"] },
  { group: "Defence", id: "vulnerability", iwr: true,
    valueIsType: true, type: "set", keys: ["system.traits.dv.value"] },

  // Per-ability saves. PF2e has had Fortitude/Reflex/Will separately since the builder shipped;
  // dnd5e could only ever say "all saves". Verified against actor/templates/common.mjs
  // (release-5.3.3): each ability carries bonuses.{check,save}, both FormulaFields — so they are
  // signed like every other formula target, not treated as numbers.
  ...["str", "dex", "con", "int", "wis", "cha"]
    .map(key => ({
      group: "Defence", id: `save.${key}`, placeholder: "+1",
      keys: [`system.abilities.${key}.bonuses.save`]
    })),

  { group: "Checks", id: "check.all", placeholder: "+1",
    keys: ["system.bonuses.abilities.check"] },
  { group: "Checks", id: "skill.all", placeholder: "+1",
    keys: ["system.bonuses.abilities.skill"] },
  { group: "Checks", id: "init", placeholder: "+2",
    keys: ["system.attributes.init.bonus"] },

  // Ability scores are real NumberFields, so these add arithmetically.
  { group: "AbilityScores", id: "ability.str", placeholder: "2", type: "number",
    keys: ["system.abilities.str.value"] },
  { group: "AbilityScores", id: "ability.dex", placeholder: "2", type: "number",
    keys: ["system.abilities.dex.value"] },
  { group: "AbilityScores", id: "ability.con", placeholder: "2", type: "number",
    keys: ["system.abilities.con.value"] },
  { group: "AbilityScores", id: "ability.int", placeholder: "2", type: "number",
    keys: ["system.abilities.int.value"] },
  { group: "AbilityScores", id: "ability.wis", placeholder: "2", type: "number",
    keys: ["system.abilities.wis.value"] },
  { group: "AbilityScores", id: "ability.cha", placeholder: "2", type: "number",
    keys: ["system.abilities.cha.value"] },

  // The individual skills, to match what PF2e has always offered. Keys are the system's own
  // three-letter ids from CONFIG.DND5E.skills; the bonus path is skills.<key>.bonuses.check,
  // a FormulaField, verified against actor/templates/creature.mjs at release-5.3.3.
  ...["acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv",
      "med", "nat", "prc", "prf", "per", "rel", "slt", "ste", "sur"]
    .map(key => ({
      group: "Skills", id: `skill.${key}`, placeholder: "+2",
      keys: [`system.skills.${key}.bonuses.check`]
    })),

  { group: "MovementSenses", id: "speed.walk", placeholder: "+10",
    keys: ["system.attributes.movement.walk"] },
  // Also a FormulaField — on a creature with no fly speed, "+30" simply yields 30.
  { group: "MovementSenses", id: "speed.fly", placeholder: "+30",
    keys: ["system.attributes.movement.fly"] },
  // Moved under `ranges` in dnd5e 5.3; the old senses.darkvision is a deprecated getter.
  { group: "MovementSenses", id: "darkvision", placeholder: "60",
    type: "number", mode: MODES.UPGRADE,
    keys: ["system.attributes.senses.ranges.darkvision"] },

  { group: "Advanced", id: "custom", placeholder: "+1", custom: true, keys: [] }
];

/**
 * PF2e presets. Verified against pf2e-8.3.0.
 *
 * The two catalogues are peers and are kept at parity; what follows is a note on how PF2e differs,
 * not on which system matters more. Bonuses here are structured rule elements rather than formula
 * strings appended to a field, so the whole concatenation problem above simply does not exist.
 * Targets are semantic selectors ("attack", "ac", "fortitude") taken from
 * getStrikeAttackDomains/getAttackDamageDomains and the statistic domains, not data paths that
 * can silently not exist. And PF2e enforces its own stacking rules — only the highest bonus of
 * each type counts — so a +1 item bonus from an upgrade correctly refuses to stack with a
 * magic weapon's, which dnd5e cannot express at all.
 */
const RAW_PF2E = [
  { group: "AttackDamage", id: "attack", selectors: ["attack"], placeholder: "1" },
  { group: "AttackDamage", id: "damage", selectors: ["damage"], damage: true, placeholder: "1d6" },
  { group: "AttackDamage", id: "melee.damage", selectors: ["melee-damage"], damage: true, placeholder: "1d6" },
  { group: "AttackDamage", id: "ranged.damage", selectors: ["ranged-damage"], damage: true, placeholder: "1d6" },

  { group: "Defence", id: "ac", selectors: ["ac"], placeholder: "1" },
  { group: "Defence", id: "save.all", selectors: ["saving-throw"], placeholder: "1" },
  { group: "Defence", id: "save.fortitude", selectors: ["fortitude"], placeholder: "1" },
  { group: "Defence", id: "save.reflex", selectors: ["reflex"], placeholder: "1" },
  { group: "Defence", id: "save.will", selectors: ["will"], placeholder: "1" },

  // Not modifiers at all: PF2e expresses these as their own rule elements, whose `type` is an
  // *array* of resistance types even when it names one. Resistance and Weakness carry an amount;
  // Immunity declares `readonly value = null` and takes none, so its row asks only for the type.
  // Verified against src/module/rules/rule-element/iwr/{resistance,immunity}.ts and the
  // RuleElements registry in src/module/rules/index.ts at pf2e-8.3.0.
  { group: "Defence", id: "resistance", iwr: true,
    ruleKey: "Resistance", placeholder: "5" },
  { group: "Defence", id: "weakness", iwr: true,
    ruleKey: "Weakness", placeholder: "5" },
  { group: "Defence", id: "immunity", iwr: true,
    valueIsType: true, ruleKey: "Immunity" },

  { group: "Checks", id: "perception", selectors: ["perception"], placeholder: "1" },
  { group: "Checks", id: "skill.all", selectors: ["skill-check"], placeholder: "1" },
  ...["acrobatics","arcana","athletics","crafting","deception","diplomacy","intimidation","medicine",
      "nature","occultism","performance","religion","society","stealth","survival","thievery"]
    .map(slug => ({
      group: "Skills", id: `skill.${slug}`, selectors: [slug], placeholder: "1"
    })),

  { group: "Spellcasting", id: "spell.attack", selectors: ["spell-attack"], placeholder: "1" },
  { group: "Spellcasting", id: "spell.dc", selectors: ["spell-dc"], placeholder: "1" },
  { group: "Spellcasting", id: "class.dc", selectors: ["class-dc"], placeholder: "1" },

  // Max HP is a real modifier domain here, extracted in the *character* document rather than the
  // creature one — extractModifiers(synthetics, ["hp"]) — which is why it is easy to conclude it
  // does not exist. Initiative and the per-type speeds are ordinary statistic domains.
  { group: "Defence", id: "hp.max", selectors: ["hp"], placeholder: "10" },
  { group: "Checks", id: "init", selectors: ["initiative"], placeholder: "2" },

  { group: "Movement", id: "speed", selectors: ["all-speeds"], placeholder: "5" },
  // Speeds are filtered on ["all-speeds", `${type}-speed`], so a per-type selector is the type's
  // own name with -speed appended.
  { group: "Movement", id: "speed.walk", selectors: ["land-speed"], placeholder: "5" },
  { group: "Movement", id: "speed.fly", selectors: ["fly-speed"], placeholder: "5" },

  { group: "Advanced", id: "custom", placeholder: "1", custom: true, selectors: [] }
];

/** Systems we have no catalog for get the custom row only. */
const RAW_GENERIC = [
  { group: "Advanced", id: "custom", placeholder: "+1", custom: true, keys: [] }
];

/**
 * PF2e modifier types, from MODIFIER_TYPES in src/module/actor/modifiers.ts.
 * The type is what drives stacking, so it is a first-class choice rather than a hidden default.
 */
const RAW_BONUS_TYPES = [
  { id: "circumstance" },
  { id: "item" },
  { id: "status" },
  { id: "untyped" },
  // Flagged rather than detected from the wording: the legend used to filter on the
  // English "rarely", which any translation silently empties.
  { id: "proficiency", rare: true },
  { id: "ability", rare: true }
];

/**
 * The catalogues, with their wording resolved through `game.i18n` on read.
 *
 * A preset's label and its group heading are derived from its id, so adding one means adding a
 * key rather than touching this. IWR presets also carry a `noun` ("Resistance") — the player-
 * facing description used to produce it by stripping " to a damage type" off the end of the
 * label, which is English grammar hard-coded into the composition and the first thing that
 * breaks in German. `short` does the same job for the one preset whose label carries a
 * parenthetical that reads badly on a card.
 */
const presetFields = catalogue => ({
  group: p => `UPGRADES.PresetGroup.${p.group}`,
  label: p => `UPGRADES.Preset.${catalogue}.${p.id.replaceAll(".", "_")}`,
  noun: p => (p.iwr ? `UPGRADES.PresetNoun.${p.id}` : null),
  short: p => (p.mode === MODES.UPGRADE ? `UPGRADES.PresetShort.${p.id.replaceAll(".", "_")}` : null)
});

const PRESETS_DND5E = localizeFields(RAW_DND5E, presetFields("Dnd5e"));
const PRESETS_PF2E = localizeFields(RAW_PF2E, presetFields("Pf2e"));
const PRESETS_GENERIC = localizeFields(RAW_GENERIC, presetFields("Generic"));

export const PF2E_BONUS_TYPES = localizeFields(RAW_BONUS_TYPES, {
  label: b => `UPGRADES.BonusType.${b.id}`,
  hint: b => `UPGRADES.BonusType.${b.id}Hint`
});

/** Dice sizes PF2e accepts for a DamageDice rule element. */
export const PF2E_DIE_SIZES = ["d4", "d6", "d8", "d10", "d12"];

export function isPf2e() {
  return game.system.id === "pf2e";
}

/** "1d6" -> {diceNumber:1, dieSize:"d6"}; a flat number returns null. */
export function parseDice(value) {
  const m = String(value ?? "").trim().match(/^\+?\s*(\d*)\s*d\s*(\d+)$/i);
  if (!m) return null;
  const diceNumber = m[1] === "" ? 1 : Number(m[1]);
  return { diceNumber, dieSize: `d${m[2]}` };
}

/**
 * Assemble rows into PF2e rule elements.
 *
 * Flat bonuses are FlatModifier; extra dice must be DamageDice instead — FlatModifier's value
 * is numeric, so "1d6" there would not do what a GM expects.
 */
export function buildRules(rows = [], { label = "Upgrade" } = {}) {
  const rules = [];
  for (const row of rows) {
    const raw = String(row.value ?? "").trim();
    if (!raw) continue;

    const preset = getPreset(row.preset);
    if (!preset) {
      console.warn(`${MODULE_ID} | Unknown effect preset "${row.preset}" — row skipped.`);
      continue;
    }

    // Resistance and Weakness are their own rule elements rather than modifiers: no selector, no
    // bonus type, and `type` is an array even when it names exactly one thing. Checked before the
    // selector guard below, which they would otherwise fall foul of by having none.
    if (preset.iwr) {
      // Immunity has no amount, so the row's one field holds the type itself.
      if (preset.valueIsType) {
        rules.push({ key: preset.ruleKey, type: [raw] });
        continue;
      }
      const kind = String(row.damageType ?? "").trim();
      const amount = Number(splitDamageValue(raw).amount.replace(/^\+/, ""));
      if (!kind || !Number.isFinite(amount)) {
        console.warn(`${MODULE_ID} | ${preset.ruleKey} row needs a type and a number — row skipped.`);
        continue;
      }
      rules.push({ key: preset.ruleKey, type: [kind], value: amount });
      continue;
    }

    const selectors = row.preset === "custom"
      ? String(row.key ?? "").trim().split(/[\s,]+/).filter(Boolean)
      : preset.selectors ?? [];
    if (!selectors.length) continue;

    const parsed = splitDamageValue(raw);
    const damageType = preset.damage ? (row.damageType || parsed.damageType || null) : null;
    const dice = preset.damage ? parseDice(parsed.amount) : null;

    if (dice) {
      rules.push({
        key: "DamageDice", selector: selectors, label,
        diceNumber: dice.diceNumber, dieSize: dice.dieSize,
        ...(damageType ? { damageType } : {})
      });
    } else {
      const value = Number(String(parsed.amount).replace(/^\+/, ""));
      if (!Number.isFinite(value)) {
        console.warn(`${MODULE_ID} | "${raw}" is not a number or dice expression — row skipped.`);
        continue;
      }
      rules.push({
        key: "FlatModifier", selector: selectors, label,
        type: row.bonusType || "circumstance", value,
        ...(damageType ? { damageType } : {})
      });
    }
  }
  return rules;
}

/**
 * dnd5e damage types, verified against CONFIG.DND5E.damageTypes in release-5.3.3.
 * Read from the live config when it exists so a system update can't leave this stale.
 */
export function getDamageTypes() {
  const live = CONFIG?.DND5E?.damageTypes;
  if (live && Object.keys(live).length) {
    return sortByLabel(dropNullTypes(Object.entries(live).map(([id, v]) => ({ id, label: v?.label ?? id }))));
  }
  return ["acid","bludgeoning","cold","fire","force","lightning","necrotic",
          "piercing","poison","psychic","radiant","slashing","thunder"]
    .map(id => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) }));
}

/**
 * Drop the "no type at all" sentinels other modules add to the system's damage-type config.
 *
 * Reading that config live is deliberate — a system update must not leave this list stale — but
 * it is shared, and modules write into it. Midi-QOL contributes `none` ("No Type") and
 * `midi-none` ("No Damage"), which are markers for the *absence* of a type and read as nonsense
 * in a list of things to resist.
 *
 * Deliberately narrow: match only ids that literally say "none", never a hardcoded roster of the
 * system's own types. A world that adds a real type — `vitality`, say — must keep it, because
 * resisting it is a perfectly sensible thing to want.
 */
function dropNullTypes(entries) {
  return entries.filter(e => e.id && !/^(none|.*-none)$/.test(e.id));
}

function sortByLabel(entries) {
  return [...entries].sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

/**
 * What a resistance, weakness, immunity or vulnerability can be *to*.
 *
 * Read from the live config first so a system update cannot leave this stale — PF2e's list is
 * long and includes things that are not damage types at all (physical, precision, all-damage,
 * every material). The frozen fallbacks are the common subset, each checked against
 * `resistanceTypes` in src/scripts/config/iwr.ts (pf2e-8.3.0) and CONFIG.DND5E.damageTypes
 * (release-5.3.3).
 */
export function getResistanceTypes() {
  if (isPf2e()) {
    const live = CONFIG?.PF2E?.resistanceTypes;
    if (live && Object.keys(live).length) {
      // Same passenger problem as the dnd5e list: the config is shared with every other module.
      return sortByLabel(dropNullTypes(Object.entries(live).map(([id, v]) => ({ id, label: labelOf(v, id) }))));
    }
    return ["acid","air","all-damage","bleed","bludgeoning","cold","earth","electricity","energy",
            "fire","force","light","magical","mental","metal","non-magical","physical","piercing",
            "plant","poison","precision","slashing","sonic","spirit","vitality","void","water","wood"]
      .map(id => ({ id, label: titleCase(id) }));
  }
  // dnd5e resists damage types and nothing else, so the damage list is the whole answer.
  return getDamageTypes();
}

/** PF2e config values are localisation keys; dnd5e's are objects carrying a label. */
function labelOf(value, id) {
  if (typeof value === "string") return titleCase(id);
  return value?.label ?? titleCase(id);
}

function titleCase(id) {
  return String(id).replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/** Split "1d8[cold]" into its amount and type; tolerates a plain "1d8". */
export function splitDamageValue(value) {
  const m = String(value ?? "").match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  if (m) return { amount: m[1].trim(), damageType: m[2].trim() };
  return { amount: String(value ?? "").trim(), damageType: "" };
}

export function getPresets() {
  if (game.system.id === "dnd5e") return PRESETS_DND5E;
  if (game.system.id === "pf2e") return PRESETS_PF2E;
  return PRESETS_GENERIC;
}

export function getPreset(id) {
  return getPresets().find(p => p.id === id) ?? null;
}

/** True when we ship a real preset catalogue for the current system. */
export function systemSupportsBuilder() {
  return game.system.id === "dnd5e" || game.system.id === "pf2e";
}

/** Presets shaped for a <select> with <optgroup>s. */
export function getPresetGroups() {
  const groups = [];
  for (const preset of getPresets()) {
    let group = groups.find(g => g.label === preset.group);
    if (!group) groups.push(group = { label: preset.group, presets: [] });
    group.presets.push(preset);
  }
  return groups;
}

/**
 * Give a formula value an explicit sign so that stacking composes.
 *
 * dnd5e bonus fields hold formula *strings*, and Foundry's ADD mode concatenates strings.
 * Unsigned values corrupt the formula the moment a second effect touches the same field:
 * "2" then "3" becomes "23". Signed, the same pair becomes "+2+3" — which evaluates to 5.
 */
export function signFormula(value) {
  const v = String(value).trim();
  if (!v || /^[+-]/.test(v)) return v;
  return `+${v}`;
}

/**
 * Assemble an upgrade's built rows into ActiveEffect `changes`.
 * Rows referencing an unknown preset are skipped rather than silently writing a bad path.
 */
export function buildChanges(rows = []) {
  const changes = [];
  for (const row of rows) {
    const raw = String(row.value ?? "").trim();
    if (!raw) continue;

    if (row.preset === "custom") {
      const key = String(row.key ?? "").trim();
      if (!key) continue;
      // Custom rows keep the GM's value verbatim — they chose the path and the mode themselves.
      changes.push({ key, mode: Number(row.mode ?? MODES.ADD), value: raw, priority: null });
      continue;
    }

    const preset = getPreset(row.preset);
    if (!preset) {
      console.warn(`${MODULE_ID} | Unknown effect preset "${row.preset}" — row skipped.`);
      continue;
    }
    const mode = preset.mode ?? MODES.ADD;
    let value;
    if (preset.valueIsType) {
      // `system.traits.dr.value` is a SetField, and ADD on a set adds the member. The value is
      // the damage type verbatim — signing it would write "+fire" into the set.
      value = raw;
    } else if (preset.damage) {
      // The amount and the type are edited separately; older rows kept "1d8[cold]" in one field.
      const parsed = splitDamageValue(raw);
      const type = (row.damageType ?? parsed.damageType ?? "").trim();
      value = signFormula(parsed.amount) + (type ? `[${type}]` : "");
    } else {
      // Only formula targets need signing; numeric fields add arithmetically already.
      value = (preset.type === "number" || mode !== MODES.ADD) ? raw : signFormula(raw);
    }
    for (const key of preset.keys) {
      changes.push({ key, mode, value, priority: null });
    }
  }
  return changes;
}

/**
 * Human-readable lines describing what a built payload actually does, for players.
 * Phrased as it reads on a card — "All weapon damage +1d4 cold" — rather than as data paths.
 */
export function describeRows(rows = []) {
  const out = [];
  for (const row of rows) {
    const raw = String(row.value ?? "").trim();
    if (!raw) continue;

    if (row.preset === "custom") {
      const key = String(row.key ?? "").trim();
      if (key) out.push(`${key} ${raw}`);
      continue;
    }

    const preset = getPreset(row.preset);
    if (!preset) continue;

    // Resistance and its relatives read as a statement, not as a bonus to something. The noun is
    // its own key rather than the label with " to a damage type" chopped off the end, because
    // that chop is English grammar and there is no reason the German label ends the same way.
    if (preset.iwr) {
      const kind = preset.valueIsType ? raw : (row.damageType || "");
      out.push(preset.valueIsType
        ? t("UPGRADES.Describe.IwrPlain", { noun: preset.noun, type: kind })
        : t("UPGRADES.Describe.IwrAmount", { noun: preset.noun, amount: raw, type: kind }));
      continue;
    }

    // PF2e names the bonus type, because the type is what decides whether it stacks.
    if (isPf2e()) {
      const parsed = splitDamageValue(raw);
      const type = preset.damage ? (row.damageType || parsed.damageType || "") : "";
      const amount = /^[+-]/.test(parsed.amount) ? parsed.amount : `+${parsed.amount}`;
      const kind = parseDice(parsed.amount) ? "" : (row.bonusType || "circumstance");
      out.push(t(kind ? "UPGRADES.Describe.BonusPf2e" : "UPGRADES.Describe.BonusTyped",
        { label: preset.label, amount, type, kind }).replace(/\s{2,}/g, " ").trim());
      continue;
    }

    const parsed = splitDamageValue(raw);
    const amount = preset.damage ? parsed.amount : raw;
    const type = preset.damage ? (row.damageType ?? parsed.damageType ?? "").trim() : "";

    if ((preset.mode ?? MODES.ADD) === MODES.UPGRADE) {
      // "Darkvision (raise to, in feet)" reads badly on a card, so these carry a short label.
      out.push(t("UPGRADES.Describe.RaisedTo", { label: preset.short ?? preset.label, amount }));
    } else {
      const signed = /^[+-]/.test(amount) ? amount : `+${amount}`;
      out.push(t("UPGRADES.Describe.BonusTyped", { label: preset.label, amount: signed, type })
        .replace(/\s{2,}/g, " ").trim());
    }
  }
  return out;
}

/**
 * What an upgrade will do, for the player-facing window.
 * Async because a linked payload has to be resolved to get its name.
 */
export async function describeUpgradeEffect(upgrade) {
  const mode = upgrade.effectMode ?? (upgrade.effectUuid ? EFFECT_MODE.LINK : EFFECT_MODE.NONE);
  if (mode === EFFECT_MODE.BUILD) return describeRows(upgrade.effectBuild?.rows ?? []);
  if (mode === EFFECT_MODE.LINK && upgrade.effectUuid) {
    const doc = await fromUuid(upgrade.effectUuid).catch(() => null);
    return doc ? [doc.name] : [];
  }
  return [];
}

/** One-line human summary of a built payload, for the GM console list. */
export function describeBuild(rows = []) {
  const parts = [];
  for (const row of rows) {
    const raw = String(row.value ?? "").trim();
    if (!raw) continue;
    const preset = getPreset(row.preset);
    const label = row.preset === "custom" ? (row.key || "custom") : (preset?.label ?? row.preset);
    if (preset?.iwr) {
      const kind = preset.valueIsType ? raw : (row.damageType || "");
      const noun = String(preset.noun).toLowerCase();
      parts.push(preset.valueIsType
        ? t("UPGRADES.Describe.IwrPlain", { noun, type: kind })
        : t("UPGRADES.Describe.IwrAmount", { noun, amount: raw, type: kind }));
      continue;
    }
    const parsed = splitDamageValue(raw);
    const type = preset?.damage ? ((row.damageType ?? parsed.damageType ?? "").trim()) : "";
    parts.push(t("UPGRADES.Describe.Summary",
      { amount: `${parsed.amount || raw}${type ? `[${type}]` : ""}`, label: label.toLowerCase() }));
  }
  return parts.join(", ");
}
