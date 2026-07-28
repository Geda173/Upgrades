/**
 * Effect authoring: turn plain-language choices into an ActiveEffect payload,
 * so a GM never has to know a UUID or a system data path.
 *
 * An upgrade carries one of three payload modes:
 *   "none"  — cosmetic only
 *   "link"  — effectUuid points at an existing ActiveEffect or Item (drag & drop in the editor)
 *   "build" — effectBuild.rows are preset bonuses assembled here into ActiveEffect changes
 */
import { MODULE_ID } from "./data.js";

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
const PRESETS_DND5E = [
  { group: "Attack & damage", id: "weapon.attack", label: "All weapon attack rolls", placeholder: "+1",
    keys: ["system.bonuses.mwak.attack", "system.bonuses.rwak.attack"] },
  { group: "Attack & damage", id: "weapon.damage", damage: true, label: "All weapon damage", placeholder: "+1d8",
    keys: ["system.bonuses.mwak.damage", "system.bonuses.rwak.damage"] },
  { group: "Attack & damage", id: "melee.attack", label: "Melee weapon attack rolls", placeholder: "+1",
    keys: ["system.bonuses.mwak.attack"] },
  { group: "Attack & damage", id: "melee.damage", damage: true, label: "Melee weapon damage", placeholder: "+1d8",
    keys: ["system.bonuses.mwak.damage"] },
  { group: "Attack & damage", id: "ranged.attack", label: "Ranged weapon attack rolls", placeholder: "+1",
    keys: ["system.bonuses.rwak.attack"] },
  { group: "Attack & damage", id: "ranged.damage", damage: true, label: "Ranged weapon damage", placeholder: "+1d6",
    keys: ["system.bonuses.rwak.damage"] },

  // dnd5e has no `bonuses.spell.attack`; spell attacks are the melee/ranged spell-attack pair.
  { group: "Spellcasting", id: "spell.attack", label: "Spell attack rolls", placeholder: "+2",
    keys: ["system.bonuses.msak.attack", "system.bonuses.rsak.attack"] },
  { group: "Spellcasting", id: "spell.dc", label: "Spell save DC", placeholder: "+1",
    keys: ["system.bonuses.spell.dc"] },
  { group: "Spellcasting", id: "spell.damage", damage: true, label: "Spell damage", placeholder: "+1d4",
    keys: ["system.bonuses.msak.damage", "system.bonuses.rsak.damage"] },

  { group: "Defence", id: "ac", label: "Armor Class", placeholder: "+1",
    keys: ["system.attributes.ac.bonus"] },
  { group: "Defence", id: "hp.max", label: "Maximum hit points", placeholder: "+10",
    keys: ["system.attributes.hp.bonuses.overall"] },
  { group: "Defence", id: "save.all", label: "All saving throws", placeholder: "+1",
    keys: ["system.bonuses.abilities.save"] },

  { group: "Checks", id: "check.all", label: "All ability checks", placeholder: "+1",
    keys: ["system.bonuses.abilities.check"] },
  { group: "Checks", id: "skill.all", label: "All skill checks", placeholder: "+1",
    keys: ["system.bonuses.abilities.skill"] },
  { group: "Checks", id: "init", label: "Initiative", placeholder: "+2",
    keys: ["system.attributes.init.bonus"] },

  // Ability scores are real NumberFields, so these add arithmetically.
  { group: "Ability scores", id: "ability.str", label: "Strength score", placeholder: "2", type: "number",
    keys: ["system.abilities.str.value"] },
  { group: "Ability scores", id: "ability.dex", label: "Dexterity score", placeholder: "2", type: "number",
    keys: ["system.abilities.dex.value"] },
  { group: "Ability scores", id: "ability.con", label: "Constitution score", placeholder: "2", type: "number",
    keys: ["system.abilities.con.value"] },
  { group: "Ability scores", id: "ability.int", label: "Intelligence score", placeholder: "2", type: "number",
    keys: ["system.abilities.int.value"] },
  { group: "Ability scores", id: "ability.wis", label: "Wisdom score", placeholder: "2", type: "number",
    keys: ["system.abilities.wis.value"] },
  { group: "Ability scores", id: "ability.cha", label: "Charisma score", placeholder: "2", type: "number",
    keys: ["system.abilities.cha.value"] },

  { group: "Movement & senses", id: "speed.walk", label: "Walking speed", placeholder: "+10",
    keys: ["system.attributes.movement.walk"] },
  // Also a FormulaField — on a creature with no fly speed, "+30" simply yields 30.
  { group: "Movement & senses", id: "speed.fly", label: "Flying speed", placeholder: "+30",
    keys: ["system.attributes.movement.fly"] },
  // Moved under `ranges` in dnd5e 5.3; the old senses.darkvision is a deprecated getter.
  { group: "Movement & senses", id: "darkvision", label: "Darkvision (raise to, in feet)", placeholder: "60",
    type: "number", mode: MODES.UPGRADE,
    keys: ["system.attributes.senses.ranges.darkvision"] },

  { group: "Advanced", id: "custom", label: "Custom data path…", placeholder: "+1", custom: true, keys: [] }
];

/**
 * PF2e presets. Verified against pf2e-8.3.0.
 *
 * PF2e is a much better fit for this module than dnd5e. Bonuses are structured rule elements
 * rather than formula strings appended to a field, so the whole concatenation problem above
 * simply does not exist. Targets are semantic selectors ("attack", "ac", "fortitude") taken from
 * getStrikeAttackDomains/getAttackDamageDomains and the statistic domains, not data paths that
 * can silently not exist. And PF2e enforces its own stacking rules — only the highest bonus of
 * each type counts — so a +1 item bonus from an upgrade correctly refuses to stack with a
 * magic weapon's, which dnd5e cannot express at all.
 */
const PRESETS_PF2E = [
  { group: "Attack & damage", id: "attack", label: "Attack rolls", selectors: ["attack"], placeholder: "1" },
  { group: "Attack & damage", id: "damage", label: "Damage", selectors: ["damage"], damage: true, placeholder: "1d6" },
  { group: "Attack & damage", id: "melee.damage", label: "Melee damage", selectors: ["melee-damage"], damage: true, placeholder: "1d6" },
  { group: "Attack & damage", id: "ranged.damage", label: "Ranged damage", selectors: ["ranged-damage"], damage: true, placeholder: "1d6" },

  { group: "Defence", id: "ac", label: "Armor Class", selectors: ["ac"], placeholder: "1" },
  { group: "Defence", id: "save.all", label: "All saving throws", selectors: ["saving-throw"], placeholder: "1" },
  { group: "Defence", id: "save.fortitude", label: "Fortitude saves", selectors: ["fortitude"], placeholder: "1" },
  { group: "Defence", id: "save.reflex", label: "Reflex saves", selectors: ["reflex"], placeholder: "1" },
  { group: "Defence", id: "save.will", label: "Will saves", selectors: ["will"], placeholder: "1" },

  { group: "Checks", id: "perception", label: "Perception", selectors: ["perception"], placeholder: "1" },
  { group: "Checks", id: "skill.all", label: "All skill checks", selectors: ["skill-check"], placeholder: "1" },
  ...["acrobatics","arcana","athletics","crafting","deception","diplomacy","intimidation","medicine",
      "nature","occultism","performance","religion","society","stealth","survival","thievery"]
    .map(slug => ({
      group: "Skills", id: `skill.${slug}`,
      label: slug.charAt(0).toUpperCase() + slug.slice(1),
      selectors: [slug], placeholder: "1"
    })),

  { group: "Spellcasting", id: "spell.attack", label: "Spell attack rolls", selectors: ["spell-attack"], placeholder: "1" },
  { group: "Spellcasting", id: "spell.dc", label: "Spell DC", selectors: ["spell-dc"], placeholder: "1" },
  { group: "Spellcasting", id: "class.dc", label: "Class DC", selectors: ["class-dc"], placeholder: "1" },

  { group: "Movement", id: "speed", label: "All speeds", selectors: ["all-speeds"], placeholder: "5" },

  { group: "Advanced", id: "custom", label: "Custom selector…", placeholder: "1", custom: true, selectors: [] }
];

/** Systems we have no catalog for get the custom row only. */
const PRESETS_GENERIC = [
  { group: "Advanced", id: "custom", label: "Custom data path…", placeholder: "+1", custom: true, keys: [] }
];

/**
 * PF2e modifier types, from MODIFIER_TYPES in src/module/actor/modifiers.ts.
 * The type is what drives stacking, so it is a first-class choice rather than a hidden default.
 */
export const PF2E_BONUS_TYPES = [
  { id: "circumstance", label: "Circumstance — from the situation" },
  { id: "item", label: "Item — from gear or an upgrade" },
  { id: "status", label: "Status — from a spell or condition" },
  { id: "proficiency", label: "Proficiency" },
  { id: "ability", label: "Ability" },
  { id: "untyped", label: "Untyped — always stacks" }
];

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
    return Object.entries(live).map(([id, v]) => ({ id, label: v?.label ?? id }));
  }
  return ["acid","bludgeoning","cold","fire","force","lightning","necrotic",
          "piercing","poison","psychic","radiant","slashing","thunder"]
    .map(id => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) }));
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
    if (preset.damage) {
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

    // PF2e names the bonus type, because the type is what decides whether it stacks.
    if (isPf2e()) {
      const parsed = splitDamageValue(raw);
      const type = preset.damage ? (row.damageType || parsed.damageType || "") : "";
      const amount = /^[+-]/.test(parsed.amount) ? parsed.amount : `+${parsed.amount}`;
      const kind = parseDice(parsed.amount) ? "" : ` ${row.bonusType || "circumstance"}`;
      out.push(`${preset.label} ${amount}${type ? ` ${type}` : ""}${kind}`);
      continue;
    }

    const parsed = splitDamageValue(raw);
    const amount = preset.damage ? parsed.amount : raw;
    const type = preset.damage ? (row.damageType ?? parsed.damageType ?? "").trim() : "";

    if ((preset.mode ?? MODES.ADD) === MODES.UPGRADE) {
      // "Darkvision (raise to, in feet)" reads badly on a card; drop the parenthetical.
      out.push(`${preset.label.replace(/\s*\(.*\)$/, "")} raised to ${amount}`);
    } else {
      const signed = /^[+-]/.test(amount) ? amount : `+${amount}`;
      out.push(`${preset.label} ${signed}${type ? ` ${type}` : ""}`);
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
    const parsed = splitDamageValue(raw);
    const type = preset?.damage ? ((row.damageType ?? parsed.damageType ?? "").trim()) : "";
    parts.push(`${parsed.amount || raw}${type ? `[${type}]` : ""} ${label.toLowerCase()}`);
  }
  return parts.join(", ");
}
