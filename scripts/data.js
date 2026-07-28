/**
 * Data layer: upgrade catalog, currency balance, purchase history.
 * Everything lives in world-scoped settings (GM-writable only).
 */
export const MODULE_ID = "upgrades";

export const SETTINGS = {
  UPGRADES: "upgrades",
  BALANCE: "balance",
  HISTORY: "history",
  REQUIRE_APPROVAL: "requireApproval",
  PLAYERS_CAN_OPEN: "playersCanOpen",
  PARTY_ACTOR: "partyActor",
  GRANT_AS: "grantAs",
  THEME: "theme",
  CURRENCY_NAME: "currencyName",
  CURRENCY_ICON: "currencyIcon",
  WINDOW_TITLE: "windowTitle",
  ACTION_VERB: "actionVerb",
  HOST_NAME: "hostName",
  HOST_IMG: "hostImg",
  GREETING: "greeting"
};

/** Upgrade target modes. */
export const TARGET = {
  PARTY: "party",
  ACTOR: "actor"
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
  S.register(MODULE_ID, SETTINGS.BALANCE, { scope: "world", config: false, type: Number, default: 0 });
  S.register(MODULE_ID, SETTINGS.HISTORY, { scope: "world", config: false, type: Array, default: [] });

  // Behaviour
  S.register(MODULE_ID, SETTINGS.REQUIRE_APPROVAL, {
    name: "Purchases require GM approval",
    hint: "If enabled, player purchase requests must be approved by the GM before the cost is deducted.",
    scope: "world", config: true, type: Boolean, default: true
  });
  S.register(MODULE_ID, SETTINGS.PLAYERS_CAN_OPEN, {
    name: "Players can open the window freely",
    hint: "If disabled, players only see it when the GM shows it to them.",
    scope: "world", config: true, type: Boolean, default: true
  });
  S.register(MODULE_ID, SETTINGS.PARTY_ACTOR, {
    name: "Party actor",
    hint: "The Group (dnd5e) or Party (PF2e) actor whose members count as “the party” for party-wide upgrades. "
        + "Strongly recommended: without it the module falls back to every player-owned character, which in a world "
        + "full of loot, summon and wildshape actors is rarely what you want.",
    // Choices start empty and are filled in on "ready": game.actors does not exist yet at "init",
    // and Foundry reads this object as-is rather than calling it, so a lazy function would render blank.
    scope: "world", config: true, type: String, default: "",
    choices: {},
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.GRANT_AS, {
    name: "Grant upgrades as",
    hint: "“Feature” creates a named feature on the character sheet carrying the effect — visible, and removing it "
        + "removes the bonus. “Active Effect” puts a bare effect on the Effects tab instead.",
    scope: "world", config: true, type: String, default: "feature",
    choices: {
      feature: "Feature on the sheet (recommended)",
      effect: "Active Effect only"
    },
    onChange: () => refreshWindows()
  });

  // Presentation
  S.register(MODULE_ID, SETTINGS.THEME, {
    name: "Theme",
    hint: "Colour and texture of the player-facing window.",
    scope: "world", config: true, type: String, default: "abyss",
    // Foundry's choices dropdown is flat, so the group rides along in the label.
    choices: Object.fromEntries(THEMES.map(t => [t.id, `${t.group} · ${t.label} — ${t.blurb}`])),
    onChange: () => refreshWindows()
  });

  // Vocabulary — everything the players read
  S.register(MODULE_ID, SETTINGS.WINDOW_TITLE, {
    name: "Window title",
    hint: "Shown in the window title bar. E.g. “The Memorial Garden”.",
    scope: "world", config: true, type: String, default: "Upgrades",
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.CURRENCY_NAME, {
    name: "Currency name",
    hint: "The resource that is spent. E.g. “Sprigs”.",
    scope: "world", config: true, type: String, default: "Points",
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.CURRENCY_ICON, {
    name: "Currency icon",
    hint: "A Font Awesome class (e.g. “fa-solid fa-seedling”) or a path to an image in your Foundry data folder.",
    scope: "world", config: true, type: String, default: "fa-solid fa-gem",
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.ACTION_VERB, {
    name: "Action verb",
    hint: "The label on the purchase button. E.g. “Plant”, “Request”, “Buy”.",
    scope: "world", config: true, type: String, default: "Request",
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.HOST_NAME, {
    name: "Host name",
    hint: "The NPC or place presenting the upgrades. E.g. “Elara’s Respite”.",
    scope: "world", config: true, type: String, default: "The Merchant",
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.HOST_IMG, {
    name: "Host portrait (image path)",
    hint: "Path to an image in your Foundry data folder. Leave empty for a default icon.",
    scope: "world", config: true, type: String, default: "", filePicker: "image",
    onChange: () => refreshWindows()
  });
  S.register(MODULE_ID, SETTINGS.GREETING, {
    name: "Greeting",
    scope: "world", config: true, type: String,
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
 * Fill in the Party actor dropdown once the actor directory exists.
 * Called from the "ready" hook; mutating the registered setting is the supported way to
 * offer choices that aren't knowable at registration time.
 */
export function populatePartyActorChoices() {
  const setting = game.settings.settings.get(`${MODULE_ID}.${SETTINGS.PARTY_ACTOR}`);
  if (!setting) return;
  setting.choices = partyActorChoices();
  const count = Object.keys(setting.choices).length - 1;
  if (!count) {
    console.warn(`${MODULE_ID} | No Group or Party actor found — party-wide upgrades will fall back `
      + `to every player-owned character. Create a Group actor and set it in module settings.`);
  }
}

/* ---------- Vocabulary helpers ---------- */

/** Everything the UI needs in order to call things by the GM's chosen names. */
export function getVocabulary() {
  const icon = game.settings.get(MODULE_ID, SETTINGS.CURRENCY_ICON) ?? "";
  return {
    windowTitle: game.settings.get(MODULE_ID, SETTINGS.WINDOW_TITLE) || "Upgrades",
    currencyName: game.settings.get(MODULE_ID, SETTINGS.CURRENCY_NAME) || "Points",
    currencyIcon: icon,
    // Treat the icon as an image if it looks like a path; otherwise it's Font Awesome classes.
    currencyIconIsImg: /[/\\]/.test(icon) || /\.(webp|png|jpe?g|gif|svg)$/i.test(icon),
    actionVerb: game.settings.get(MODULE_ID, SETTINGS.ACTION_VERB) || "Request",
    hostName: game.settings.get(MODULE_ID, SETTINGS.HOST_NAME) || "",
    hostImg: game.settings.get(MODULE_ID, SETTINGS.HOST_IMG) || "",
    greeting: game.settings.get(MODULE_ID, SETTINGS.GREETING) || ""
  };
}

/* ---------- Upgrade catalog ---------- */

/**
 * Upgrade shape:
 * { id, name, cost, img, flavor, description (HTML), hidden, purchased,
 *   purchasedBy, purchasedAt, target, targetActorId, sort,
 *   effectMode, effectUuid, effectBuild: { rows: [{preset, value, key?, mode?}] } }
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
    ...upgrade
  };
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
    effectMode: "none", effectUuid: null, effectBuild: { rows: [] },
    target: TARGET.PARTY, targetActorId: null, sort: upgrades.length,
    ...data
  });
  return setUpgrades(upgrades);
}

export async function deleteUpgrade(id) {
  return setUpgrades(getUpgrades().filter(u => u.id !== id));
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
