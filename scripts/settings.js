/**
 * Configuration: the settings themselves, the vocabulary the players read, the theme, and the
 * merchant actor the board is reached through.
 *
 * Everything here answers "how is this world set up". Nothing here knows what an upgrade is.
 */

/**
 * Data layer: upgrade catalog, currency balance, purchase history.
 * Everything lives in world-scoped settings (GM-writable only).
 */
export const MODULE_ID = "upgrades";

export const SETTINGS = {
  UPGRADES: "upgrades",
  CATEGORIES: "categories",
  BALANCE: "balance",
  BALANCES: "balances",
  CURRENCIES: "currencies",
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
  // Imported dynamically on purpose: the socket layer reaches back into the windows, which read
  // settings. A static import here would close that loop at module-load time.
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
  S.register(MODULE_ID, SETTINGS.BALANCES, { scope: "world", config: false, type: Object, default: {} });
  S.register(MODULE_ID, SETTINGS.CURRENCIES, { scope: "world", config: false, type: Array, default: [] });
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
    // No choices here: the dropdown lives in the setup window, which builds its own.
    scope: "world", config: false, type: String, default: "",
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

/* ---------- Currencies ---------- */

/** Everything the UI needs in order to call things by the GM's chosen names. */
/**
 * Icons are stored as either a Font Awesome class or a path to artwork, and every surface that
 * renders one has to tell them apart. Four copies of this had drifted: two accepted a bare
 * "pearl.png", two demanded a slash, so the same value rendered as an image in one window and as
 * a broken icon class in another.
 */
export function isImagePath(value) {
  const v = value ?? "";
  return /[/\\]/.test(v) || /\.(webp|png|jpe?g|gif|svg)$/i.test(v);
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

/** The actor standing in for the merchant, if one is bound. */
export function getHostActor() {
  const id = game.settings.get(MODULE_ID, SETTINGS.HOST_ACTOR);
  return id ? (game.actors?.get(id) ?? null) : null;
}

/**
 * Can the players actually interact with the merchant's token?
 *
 * Foundry only dispatches a double-click to a token the user is permitted to view, so a merchant
 * that players have no ownership of simply never responds to them — silently, and only for them.
 * LIMITED is the lowest level that lets the click through.
 */
export function merchantAccessLevel() {
  const actor = getHostActor();
  if (!actor) return null;
  const LEVELS = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const players = game.users.filter(u => !u.isGM);
  if (!players.length) return LEVELS.LIMITED;   // nothing to block
  return Math.min(...players.map(u => actor.testUserPermission(u, "LIMITED") ? LEVELS.LIMITED : LEVELS.NONE));
}

export function merchantNeedsAccess() {
  const actor = getHostActor();
  if (!actor) return false;
  return merchantAccessLevel() < CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
}

/** Give every player the minimum ownership that lets a token respond to them. */
export async function grantMerchantAccess() {
  const actor = getHostActor();
  if (!actor) return false;
  await actor.update({
    "ownership.default": Math.max(
      actor.ownership?.default ?? 0,
      CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED
    )
  });
  return true;
}

/** Is this token the merchant? */
export function isHostToken(token) {
  const id = game.settings.get(MODULE_ID, SETTINGS.HOST_ACTOR);
  return !!id && token?.actor?.id === id;
}

/* ---------- Upgrade paths ---------- */
