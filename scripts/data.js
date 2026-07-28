/**
 * Data layer: upgrade catalog, pearl balance, purchase history.
 * Everything lives in world-scoped settings (GM-writable only).
 */
export const MODULE_ID = "pearl-upgrades";

export const SETTINGS = {
  UPGRADES: "upgrades",
  PEARLS: "pearls",
  HISTORY: "history",
  REQUIRE_APPROVAL: "requireApproval",
  PLAYERS_CAN_OPEN: "playersCanOpen",
  CURRENCY_NAME: "currencyName",
  MERCHANT_NAME: "merchantName",
  MERCHANT_IMG: "merchantImg",
  MERCHANT_GREETING: "merchantGreeting"
};

export function registerSettings() {
  const S = game.settings;

  // Hidden data stores
  S.register(MODULE_ID, SETTINGS.UPGRADES, { scope: "world", config: false, type: Array, default: [] });
  S.register(MODULE_ID, SETTINGS.PEARLS, { scope: "world", config: false, type: Number, default: 0 });
  S.register(MODULE_ID, SETTINGS.HISTORY, { scope: "world", config: false, type: Array, default: [] });

  // Visible config
  S.register(MODULE_ID, SETTINGS.REQUIRE_APPROVAL, {
    name: "Purchases require GM approval",
    hint: "If enabled, player purchase requests must be approved by the GM before pearls are spent.",
    scope: "world", config: true, type: Boolean, default: true
  });
  S.register(MODULE_ID, SETTINGS.PLAYERS_CAN_OPEN, {
    name: "Players can open the shop freely",
    hint: "If disabled, players only see the shop when the GM shows it to them.",
    scope: "world", config: true, type: Boolean, default: true
  });
  S.register(MODULE_ID, SETTINGS.CURRENCY_NAME, {
    name: "Currency name",
    scope: "world", config: true, type: String, default: "Pearls of Power"
  });
  S.register(MODULE_ID, SETTINGS.MERCHANT_NAME, {
    name: "Merchant name",
    scope: "world", config: true, type: String, default: "The Pearl Merchant"
  });
  S.register(MODULE_ID, SETTINGS.MERCHANT_IMG, {
    name: "Merchant portrait (image path)",
    hint: "Path to an image in your Foundry data folder. Leave empty for a default icon.",
    scope: "world", config: true, type: String, default: "", filePicker: "image"
  });
  S.register(MODULE_ID, SETTINGS.MERCHANT_GREETING, {
    name: "Merchant greeting",
    scope: "world", config: true, type: String,
    default: "Ah… the deep has been generous to you. Shall we trade?"
  });
}

/* ---------- Upgrade catalog ---------- */

/**
 * Upgrade shape:
 * { id, name, cost, img, flavor, description (HTML), hidden, purchased,
 *   purchasedBy, purchasedAt, effectUuid (Phase 2), sort }
 */
export function getUpgrades() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.UPGRADES)) ?? [];
}

export async function setUpgrades(upgrades) {
  return game.settings.set(MODULE_ID, SETTINGS.UPGRADES, upgrades);
}

export function getUpgrade(id) {
  return getUpgrades().find(u => u.id === id) ?? null;
}

export async function upsertUpgrade(data) {
  const upgrades = getUpgrades();
  const idx = upgrades.findIndex(u => u.id === data.id);
  if (idx >= 0) upgrades[idx] = foundry.utils.mergeObject(upgrades[idx], data);
  else upgrades.push({
    id: data.id ?? foundry.utils.randomID(),
    name: "New Upgrade", cost: 1, img: "", flavor: "", description: "",
    hidden: false, purchased: false, purchasedBy: null, purchasedAt: null,
    effectUuid: null, sort: upgrades.length,
    ...data
  });
  return setUpgrades(upgrades);
}

export async function deleteUpgrade(id) {
  return setUpgrades(getUpgrades().filter(u => u.id !== id));
}

/* ---------- Pearl pool ---------- */

export function getPearls() {
  return game.settings.get(MODULE_ID, SETTINGS.PEARLS) ?? 0;
}

export async function adjustPearls(delta, reason = "") {
  const before = getPearls();
  const after = Math.max(0, before + delta);
  await game.settings.set(MODULE_ID, SETTINGS.PEARLS, after);
  await addHistory({ type: "adjust", delta, before, after, reason });
  return after;
}

/* ---------- History ---------- */

export async function addHistory(entry) {
  const history = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.HISTORY)) ?? [];
  history.push({ ts: Date.now(), user: game.user?.name ?? "GM", ...entry });
  return game.settings.set(MODULE_ID, SETTINGS.HISTORY, history);
}

export function getHistory() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.HISTORY)) ?? [];
}
