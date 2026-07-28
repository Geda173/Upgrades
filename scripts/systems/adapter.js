/**
 * System adapter: applies/removes an upgrade's mechanical payload on player characters.
 *
 * The payload (upgrade.effectUuid) may point at:
 *  - an ActiveEffect (dnd5e & most systems)  → copied onto each actor as an ActiveEffect
 *  - an Item (PF2e Effect items, or a 5e feature/item) → copied onto each actor as an Item
 * Everything created is flagged with the upgrade id for clean refund/undo.
 */
import { MODULE_ID } from "../data.js";

/** All player-owned characters (the "party"). Prefers explicit party/group actors when present. */
export function getPartyActors() {
  // PF2e: Party actor
  if (game.system.id === "pf2e") {
    const party = game.actors.find(a => a.type === "party");
    if (party?.members?.length) return [...party.members];
  }
  // dnd5e: Group actor (use the first group that has members)
  if (game.system.id === "dnd5e") {
    for (const group of game.actors.filter(a => a.type === "group")) {
      const members = (group.system?.members ?? [])
        .map(m => m?.actor ?? (typeof m === "string" ? game.actors.get(m) : null))
        .filter(a => a && a.type === "character");
      if (members.length) return members;
    }
  }
  // Fallback: every player-owned character
  return game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);
}

/** Copy the source document onto one actor, flagged with the upgrade id. */
async function createFromSource(actor, source, upgradeId) {
  const data = source.toObject();
  delete data._id;
  foundry.utils.setProperty(data, `flags.${MODULE_ID}.upgradeId`, upgradeId);
  const embeddedName = source.documentName === "ActiveEffect" ? "ActiveEffect" : "Item";
  if (embeddedName === "ActiveEffect") {
    data.origin = null;
    data.transfer = false;
  }
  return actor.createEmbeddedDocuments(embeddedName, [data]);
}

function hasUpgrade(actor, upgradeId) {
  const inItems = actor.items?.some(i => i.getFlag(MODULE_ID, "upgradeId") === upgradeId);
  const inEffects = actor.effects?.some(e => e.getFlag(MODULE_ID, "upgradeId") === upgradeId);
  return inItems || inEffects;
}

/** Apply the upgrade's effect (if any) to all party actors. GM-side only. */
export async function applyUpgradeEffect(upgrade) {
  if (!upgrade.effectUuid) return { count: 0 };
  const source = await fromUuid(upgrade.effectUuid);
  if (!source) {
    ui.notifications.warn(`Pearl Upgrades: could not resolve effect for "${upgrade.name}".`);
    return { count: 0 };
  }

  let count = 0;
  for (const actor of getPartyActors()) {
    try {
      if (hasUpgrade(actor, upgrade.id)) continue;
      await createFromSource(actor, source, upgrade.id);
      count++;
    } catch (err) {
      console.error(`${MODULE_ID} | Could not apply effect to ${actor.name}`, err);
    }
  }
  return { count };
}

/** Remove everything this module created for a given upgrade (refund/undo). GM-side only. */
export async function removeUpgradeEffect(upgradeId) {
  let count = 0;
  for (const actor of game.actors) {
    const items = actor.items?.filter(i => i.getFlag(MODULE_ID, "upgradeId") === upgradeId) ?? [];
    if (items.length) {
      await actor.deleteEmbeddedDocuments("Item", items.map(i => i.id));
      count += items.length;
    }
    const effects = actor.effects?.filter(e => e.getFlag(MODULE_ID, "upgradeId") === upgradeId) ?? [];
    if (effects.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id));
      count += effects.length;
    }
  }
  return { count };
}

/** Re-sync: ensure every party actor has effects for all purchased upgrades (late joiners). */
export async function resyncUpgrades() {
  const { getUpgrades } = await import("../data.js");
  const purchased = getUpgrades().filter(u => u.purchased && u.effectUuid);
  let created = 0;
  for (const upgrade of purchased) {
    const source = await fromUuid(upgrade.effectUuid);
    if (!source) continue;
    for (const actor of getPartyActors()) {
      if (hasUpgrade(actor, upgrade.id)) continue;
      await createFromSource(actor, source, upgrade.id);
      created++;
    }
  }
  return { created };
}
