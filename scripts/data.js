/**
 * Data layer: upgrade catalog, currency balance, purchase history.
 * Everything lives in world-scoped settings (GM-writable only).
 */
export const MODULE_ID = "upgrades";

export const SETTINGS = {
  UPGRADES: "upgrades",
  CATEGORIES: "categories",
  BALANCE: "balance",
  HISTORY: "history",
  REQUIRE_APPROVAL: "requireApproval",
  PLAYERS_CAN_OPEN: "playersCanOpen",
  PARTY_ACTOR: "partyActor",
  CURRENCY_ITEM: "currencyItem",
  AUTO_DEPOSIT: "autoDeposit",
  THEME: "theme",
  CURRENCY_NAME: "currencyName",
  CURRENCY_ICON: "currencyIcon",
  WINDOW_TITLE: "windowTitle",
  ACTION_VERB: "actionVerb",
  HOST_ACTOR: "hostActor",
  HOST_NAME: "hostName",
  HOST_IMG: "hostImg",
  GREETING: "greeting"
};

/** Upgrade target modes. */
export const TARGET = {
  PARTY: "party",
  ACTOR: "actor",
  /** Whoever buys it — resolved at purchase time, so the GM need not know in advance. */
  BUYER: "buyer"
};

/**
 * Visual themes. Each id maps to a `.upg-theme-<id>` block in styles/shop.css that
 * redefines the palette custom properties — no structural CSS is theme-specific.
 */
export const THEMES = [
  // Fantasy
  { id: "abyss",      group: "Fantasy", label: "Abyss",       blurb: "deep sea, gold and pearl" },
  { id: "grove",      group: "Fantasy", label: "Grove",       blurb: "moss, bark and bloom" },
  { id: "ember",      group: "Fantasy", label: "Ember",       blurb: "forge-light on dark iron" },
  { id: "arcane",     group: "Fantasy", label: "Arcane",      blurb: "violet astral haze" },
  { id: "frost",      group: "Fantasy", label: "Frost",       blurb: "pale ice and winter blue" },
  { id: "ossuary",    group: "Fantasy", label: "Ossuary",     blurb: "bone, grave-earth and witchlight" },
  { id: "bloodmoon",  group: "Fantasy", label: "Bloodmoon",   blurb: "crimson gothic, nightshade and rose" },
  { id: "goldenhall", group: "Fantasy", label: "Golden Hall", blurb: "oak, amber and hearth-light" },
  { id: "mycelium",   group: "Fantasy", label: "Mycelium",    blurb: "spore violet and pale cap" },
  { id: "tempest",    group: "Fantasy", label: "Tempest",     blurb: "wet slate and lightning" },
  { id: "parchment",  group: "Fantasy", label: "Parchment",   blurb: "light, inked and bookish" },

  // Sci-fi
  { id: "holo",     group: "Sci-fi", label: "Holo",     blurb: "cyan HUD on deep navy" },
  { id: "neon",     group: "Sci-fi", label: "Neon",     blurb: "magenta and cyan, rain-slick" },
  { id: "starship", group: "Sci-fi", label: "Starship", blurb: "light, sterile, azure trim" },
  { id: "rust",     group: "Sci-fi", label: "Rust",     blurb: "hazard amber and oxidised copper" },
  { id: "phosphor", group: "Sci-fi", label: "Phosphor", blurb: "CRT green with amber alerts" }
];

export function getTheme() {
  const id = game.settings.get(MODULE_ID, SETTINGS.THEME);
  return THEMES.some(t => t.id === id) ? id : "abyss";
}

/**
 * Re-render open windows so a settings change is visible immediately.
 * Attached to every setting that affects what is on screen — otherwise a GM renames the
 * currency, sees the old name still sitting there, and reasonably concludes it didn't work.
 */
async function refreshWindows() {
  const { emit, refreshOpenApps } = await import("./sockets.js");
  refreshOpenApps();
  emit({ type: "refresh" });   // players have the window open too
}

export function registerSettings() {
  const S = game.settings;

  // Hidden data stores
  S.register(MODULE_ID, SETTINGS.UPGRADES, { scope: "world", config: false, type: Array, default: [] });
  S.register(MODULE_ID, SETTINGS.CATEGORIES, { scope: "world", config: false, type: Array, default: [] });
  S.register(MODULE_ID, SETTINGS.BALANCE, { scope: "world", config: false, type: Number, default: 0 });
  S.register(MODULE_ID, SETTINGS.HISTORY, { scope: "world", config: false, type: Array, default: [] });

  // Behaviour
  S.register(MODULE_ID, SETTINGS.REQUIRE_APPROVAL, {
    name: "Purchases require GM approval",
    hint: "If enabled, player purchase requests must be approved by the GM before the cost is deducted.",
    scope: "world", config: false, type: Boolean, default: true,
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.PLAYERS_CAN_OPEN, {
    name: "Players can open the window freely",
    hint: "If disabled, players only see it when the GM shows it to them.",
    scope: "world", config: false, type: Boolean, default: true,
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.PARTY_ACTOR, {
    name: "Party actor",
    hint: "The Group (dnd5e) or Party (PF2e) actor whose members count as “the party” for party-wide upgrades. "
        + "Strongly recommended: without it the module falls back to every player-owned character, which in a world "
        + "full of loot, summon and wildshape actors is rarely what you want.",
    // Choices start empty and are filled in on "ready": game.actors does not exist yet at "init",
    // and Foundry reads this object as-is rather than calling it, so a lazy function would render blank.
    scope: "world", config: false, type: String, default: "",
    choices: {},
    onChange: () => refreshWindows()
  });

  S.register(MODULE_ID, SETTINGS.CURRENCY_ITEM, {
    name: "Currency item",
    hint: "An Item representing one unit, so the currency can be looted from a chest or a body.",
    scope: "world", config: false, type: String, default: "",
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.AUTO_DEPOSIT, {
    name: "Credit currency automatically when picked up",
    scope: "world", config: false, type: Boolean, default: false,
    onChange: () => refreshWindows()
  });

  // Presentation
  S.register(MODULE_ID, SETTINGS.THEME, {
    name: "Theme",
    hint: "Colour and texture of the player-facing window.",
    scope: "world", config: false, type: String, default: "abyss",
    // Foundry's choices dropdown is flat, so the group rides along in the label.
    choices: Object.fromEntries(THEMES.map(t => [t.id, `${t.group} · ${t.label} — ${t.blurb}`])),
    onChange: () => refreshWindows()
  });

  // Vocabulary — everything the players read
  S.register(MODULE_ID, SETTINGS.WINDOW_TITLE, {
    name: "Window title",
    hint: "Shown in the window title bar. E.g. “The Memorial Garden”.",
    scope: "world", config: false, type: String, default: "Upgrades",
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.CURRENCY_NAME, {
    name: "Currency name",
    hint: "The resource that is spent. E.g. “Sprigs”.",
    scope: "world", config: false, type: String, default: "Points",
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.CURRENCY_ICON, {
    name: "Currency icon",
    hint: "A Font Awesome class (e.g. “fa-solid fa-seedling”) or a path to an image in your Foundry data folder.",
    scope: "world", config: false, type: String, default: "fa-solid fa-gem",
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.ACTION_VERB, {
    name: "Action verb",
    hint: "The label on the purchase button. E.g. “Plant”, “Request”, “Buy”.",
    scope: "world", config: false, type: String, default: "Request",
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.HOST_ACTOR, {
    name: "Merchant actor",
    hint: "Double-clicking this actor's token opens the window, so the party has somewhere to go.",
    scope: "world", config: false, type: String, default: "",
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.HOST_NAME, {
    name: "Host name",
    hint: "The NPC or place presenting the upgrades. E.g. “Elara’s Respite”.",
    scope: "world", config: false, type: String, default: "The Merchant",
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.HOST_IMG, {
    name: "Host portrait (image path)",
    hint: "Path to an image in your Foundry data folder. Leave empty for a default icon.",
    scope: "world", config: false, type: String, default: "", filePicker: "image",
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.GREETING, {
    name: "Greeting",
    scope: "world", config: false, type: String,
    default: "Well met. Shall we see what can be made of this?",
    onChange: () => refreshWindows()
  });
}

/** Group/Party actors offered by the "Party actor" setting. */
function partyActorChoices() {
  const choices = { "": "— Fall back to all player-owned characters —" };
  for (const actor of game.actors ?? []) {
    if (actor.type === "group" || actor.type === "party") choices[actor.id] = actor.name;
  }
  return choices;
}

/**
 * Warn the GM when the world has no Group actor to point the Party actor setting at.
 * The dropdown itself now lives in the setup window, which builds its own choices.
 */
export function warnIfNoPartyActor() {
  if (!game.user.isGM) return;
  const groups = game.actors.filter(a => a.type === "group" || a.type === "party").length;
  if (groups) return;
  console.warn(`${MODULE_ID} | No Group or Party actor found — party-wide upgrades will fall back `
    + `to every player-owned character. Create a Group actor and pick it in the setup window.`);
}

/* ---------- Vocabulary helpers ---------- */

/** Everything the UI needs in order to call things by the GM's chosen names. */
function isImagePath(value) {
  return /[/\\]/.test(value ?? "") || /\.(webp|png|jpe?g|gif|svg)$/i.test(value ?? "");
}

export function getVocabulary() {
  const icon = game.settings.get(MODULE_ID, SETTINGS.CURRENCY_ICON) ?? "";
  // A bound merchant actor supplies its own name and portrait, so the same thing is not
  // configured twice; either field still wins if the GM has filled it in.
  const hostActor = getHostActor();
  const hostImg = game.settings.get(MODULE_ID, SETTINGS.HOST_IMG) || hostActor?.img || "";
  return {
    windowTitle: game.settings.get(MODULE_ID, SETTINGS.WINDOW_TITLE) || "Upgrades",
    currencyName: game.settings.get(MODULE_ID, SETTINGS.CURRENCY_NAME) || "Points",
    currencyIcon: icon,
    // Treat the icon as an image if it looks like a path; otherwise it's Font Awesome classes.
    currencyIconIsImg: isImagePath(icon),
    actionVerb: game.settings.get(MODULE_ID, SETTINGS.ACTION_VERB) || "Request",
    hostName: game.settings.get(MODULE_ID, SETTINGS.HOST_NAME) || hostActor?.name || "",
    hostImg: hostImg,
    // The portrait may be artwork or a Font Awesome class; the template branches on this.
    hostIsImage: !!hostImg && isImagePath(hostImg),
    hostIconClass: (hostImg && !isImagePath(hostImg)) ? hostImg : (icon || "fa-solid fa-gem"),
    greeting: game.settings.get(MODULE_ID, SETTINGS.GREETING) || ""
  };
}

/* ---------- Upgrade catalog ---------- */

/**
 * Upgrade shape:
 * { id, name, cost, img, flavor, description (HTML), hidden, purchased,
 *   purchasedBy, purchasedAt, target, targetActorId, sort,
 *   effectMode, effectUuid, effectBuild: { rows: [{preset, value, damageType?, key?, mode?}] },
 *   hideEffect, categoryId, repeatable, showInEffectsBar, requires: [upgradeId],
 *   purchases: [{ id, actorId, actorName, by, at }] }
 *
 * `purchases` is the record of every acquisition. `purchased` is derived from it and kept
 * because the templates and availability checks read it.
 *
 * target: "party" → effect applies to every member of the party actor
 *         "actor" → effect applies only to targetActorId
 */
export function getUpgrades() {
  const stored = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.UPGRADES)) ?? [];
  return stored.map(normalizeUpgrade);
}

/** Fill in fields added after an upgrade was first authored. */
function normalizeUpgrade(upgrade) {
  const normalized = {
    target: TARGET.PARTY,
    targetActorId: null,
    effectBuild: { rows: [] },
    hideEffect: false,
    categoryId: null,
    repeatable: false,
    showInEffectsBar: false,
    requires: [],
    ...upgrade
  };

  // Upgrades authored before repeat-buying existed recorded a single boolean.
  if (!Array.isArray(normalized.purchases)) {
    normalized.purchases = upgrade.purchased
      ? [{
          id: "legacy", actorId: upgrade.targetActorId ?? null, actorName: null,
          by: upgrade.purchasedBy ?? "GM", at: upgrade.purchasedAt ?? null
        }]
      : [];
  }
  normalized.purchased = normalized.purchases.length > 0;
  normalized.purchaseCount = normalized.purchases.length;
  // Upgrades authored before effect modes existed only ever had a UUID.
  normalized.effectMode ??= upgrade.effectUuid ? "link" : "none";
  normalized.effectBuild.rows ??= [];
  return normalized;
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
    effectMode: "none", effectUuid: null, effectBuild: { rows: [] }, hideEffect: false,
    categoryId: null, repeatable: false, purchases: [], showInEffectsBar: false, requires: [],
    target: TARGET.PARTY, targetActorId: null, sort: upgrades.length,
    ...data
  });
  return setUpgrades(upgrades);
}

export async function deleteUpgrade(id) {
  return setUpgrades(getUpgrades().filter(u => u.id !== id));
}

/** The actor standing in for the merchant, if one is bound. */
export function getHostActor() {
  const id = game.settings.get(MODULE_ID, SETTINGS.HOST_ACTOR);
  return id ? (game.actors?.get(id) ?? null) : null;
}

/** Is this token the merchant? */
export function isHostToken(token) {
  const id = game.settings.get(MODULE_ID, SETTINGS.HOST_ACTOR);
  return !!id && token?.actor?.id === id;
}

/* ---------- Upgrade paths ---------- */

/** Every prerequisite of this upgrade that has not been bought yet. */
export function unmetRequirements(upgrade, all = getUpgrades()) {
  const byId = new Map(all.map(u => [u.id, u]));
  return (upgrade.requires ?? [])
    .map(id => byId.get(id))
    .filter(req => req && !req.purchases?.length);
}

export function isUnlocked(upgrade, all = getUpgrades()) {
  return unmetRequirements(upgrade, all).length === 0;
}

/**
 * Does `upgrade` depend on `targetId`, directly or through a chain?
 * Used to keep the prerequisite picker from offering an option that would close a loop —
 * a cycle would leave every upgrade in it permanently unbuyable.
 */
export function dependsOn(upgrade, targetId, all = getUpgrades(), seen = new Set()) {
  if (!upgrade || seen.has(upgrade.id)) return false;
  seen.add(upgrade.id);
  const byId = new Map(all.map(u => [u.id, u]));
  for (const id of upgrade.requires ?? []) {
    if (id === targetId) return true;
    if (dependsOn(byId.get(id), targetId, all, seen)) return true;
  }
  return false;
}

/** Which upgrades may safely be offered as prerequisites of this one. */
export function eligiblePrerequisites(upgrade, all = getUpgrades()) {
  return all.filter(u => u.id !== upgrade?.id && !dependsOn(u, upgrade?.id, all));
}

/** How deep into a path an upgrade sits; roots are 0. Cycles are clamped rather than hung on. */
export function pathDepth(upgrade, all = getUpgrades(), seen = new Set()) {
  if (!upgrade || seen.has(upgrade.id)) return 0;
  seen.add(upgrade.id);
  const byId = new Map(all.map(u => [u.id, u]));
  const depths = (upgrade.requires ?? [])
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(req => 1 + pathDepth(req, all, new Set(seen)));
  return depths.length ? Math.max(...depths) : 0;
}

/** Order so that a prerequisite always appears before the upgrades that need it. */
export function sortByPath(upgrades, all = getUpgrades()) {
  return [...upgrades].sort((a, b) =>
    (pathDepth(a, all) - pathDepth(b, all)) || ((a.sort ?? 0) - (b.sort ?? 0)));
}

/** Can this still be bought? Repeatable upgrades never run out. */
export function isAvailable(upgrade) {
  return !!upgrade.repeatable || !upgrade.purchases?.length;
}

/** Record an acquisition. Returns the new purchase record. */
export async function addPurchase(upgradeId, { actorId = null, actorName = null, by = "GM" } = {}) {
  const upgrades = getUpgrades();
  const upgrade = upgrades.find(u => u.id === upgradeId);
  if (!upgrade) return null;
  const record = { id: foundry.utils.randomID(), actorId, actorName, by, at: Date.now() };
  upgrade.purchases = [...(upgrade.purchases ?? []), record];
  upgrade.purchased = true;
  upgrade.purchasedBy = by;
  upgrade.purchasedAt = record.at;
  await setUpgrades(upgrades);
  return record;
}

/** Undo one acquisition (the most recent unless a specific one is named). */
export async function removePurchase(upgradeId, purchaseId = null) {
  const upgrades = getUpgrades();
  const upgrade = upgrades.find(u => u.id === upgradeId);
  if (!upgrade?.purchases?.length) return null;
  const idx = purchaseId
    ? upgrade.purchases.findIndex(p => p.id === purchaseId)
    : upgrade.purchases.length - 1;
  if (idx < 0) return null;
  const [removed] = upgrade.purchases.splice(idx, 1);
  upgrade.purchased = upgrade.purchases.length > 0;
  if (!upgrade.purchased) { upgrade.purchasedBy = null; upgrade.purchasedAt = null; }
  await setUpgrades(upgrades);
  return removed;
}

/* ---------- Categories ---------- */

/**
 * Sections the GM groups upgrades into ("Lighthouse", "Runes and Enchanting").
 * Shape: { id, name, icon, sort }. Upgrades reference one by id, or null for uncategorised.
 */
export function getCategories() {
  const stored = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.CATEGORIES)) ?? [];
  return stored.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

export async function setCategories(categories) {
  return game.settings.set(MODULE_ID, SETTINGS.CATEGORIES, categories);
}

export async function upsertCategory(data) {
  const categories = getCategories();
  const idx = categories.findIndex(c => c.id === data.id);
  if (idx >= 0) categories[idx] = { ...categories[idx], ...data };
  else categories.push({
    id: data.id ?? foundry.utils.randomID(),
    name: "New section", icon: "fa-solid fa-folder", sort: categories.length,
    ...data
  });
  return setCategories(categories);
}

/** Deleting a section keeps its upgrades — they fall back to uncategorised. */
export async function deleteCategory(id) {
  await setCategories(getCategories().filter(c => c.id !== id));
  const upgrades = getUpgrades();
  let touched = false;
  for (const u of upgrades) {
    if (u.categoryId === id) { u.categoryId = null; touched = true; }
  }
  if (touched) await setUpgrades(upgrades);
}

/** Swap a section with its neighbour. */
export async function moveCategory(id, delta) {
  const categories = getCategories();
  const i = categories.findIndex(c => c.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= categories.length) return;
  [categories[i], categories[j]] = [categories[j], categories[i]];
  categories.forEach((c, n) => { c.sort = n; });
  return setCategories(categories);
}

/**
 * Upgrades arranged into their sections, for display.
 * Uncategorised upgrades come last, and only carry a heading when sections exist at all —
 * a world that never defines one should look exactly as it did before.
 */
export function groupByCategory(upgrades) {
  const categories = getCategories();
  if (!categories.length) return [{ id: null, name: null, icon: null, upgrades }];

  const groups = categories.map(c => ({ ...c, upgrades: upgrades.filter(u => u.categoryId === c.id) }));
  const known = new Set(categories.map(c => c.id));
  const loose = upgrades.filter(u => !u.categoryId || !known.has(u.categoryId));
  if (loose.length) groups.push({ id: null, name: "Other", icon: "fa-solid fa-folder-open", upgrades: loose });
  return groups.filter(g => g.upgrades.length);
}

/* ---------- Currency pool ---------- */

export function getBalance() {
  return game.settings.get(MODULE_ID, SETTINGS.BALANCE) ?? 0;
}

export async function adjustBalance(delta, reason = "") {
  const before = getBalance();
  const after = Math.max(0, before + delta);
  await game.settings.set(MODULE_ID, SETTINGS.BALANCE, after);
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
