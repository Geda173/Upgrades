/**
 * Upgrades — entry point.
 */
import { MODULE_ID, SETTINGS, registerSettings, getVocabulary } from "./data.js";
import { initSockets } from "./sockets.js";
import { ShopApp } from "./apps/shop-app.js";
import { EditorApp } from "./apps/editor-app.js";

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  initSockets();

  // Public API: macros can call game.modules.get("upgrades").api.openShop()
  const mod = game.modules.get(MODULE_ID);
  mod.api = {
    openShop: () => ShopApp.show(),
    openEditor: () => EditorApp.show()
  };

  console.log(`${MODULE_ID} | Ready. Open via the token controls button or game.modules.get("${MODULE_ID}").api.openShop()`);
});

/**
 * Scene controls button (token controls group).
 * v13 uses record-shaped controls/tools; keep a defensive fallback for array shape.
 */
Hooks.on("getSceneControlButtons", (controls) => {
  const canOpen = game.user.isGM || game.settings.get(MODULE_ID, SETTINGS.PLAYERS_CAN_OPEN);
  if (!canOpen) return;

  const vocab = getVocabulary();
  const tool = {
    name: "upgrades",
    title: `Open ${vocab.windowTitle}`,
    // Reuse the currency icon when it's a Font Awesome class; an image path can't go here.
    icon: vocab.currencyIconIsImg ? "fa-solid fa-gem" : (vocab.currencyIcon || "fa-solid fa-gem"),
    button: true,
    // onChange only — supplying the old onClick alongside it makes v13+ log a deprecation warning.
    onChange: () => ShopApp.show()
  };

  const tokens = Array.isArray(controls)
    ? controls.find(c => c.name === "token" || c.name === "tokens")
    : (controls.tokens ?? controls.token);
  if (!tokens) return;

  if (Array.isArray(tokens.tools)) tokens.tools.push(tool);
  else tokens.tools[tool.name] = { ...tool, order: Object.keys(tokens.tools).length };
});
