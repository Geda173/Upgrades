/**
 * Upgrades — entry point.
 */
import { MODULE_ID, SETTINGS, registerSettings, getVocabulary, warnIfNoPartyActor } from "./data.js";
import { initSockets } from "./sockets.js";
import { ShopApp } from "./apps/shop-app.js";
import { EditorApp } from "./apps/editor-app.js";
import { SettingsApp } from "./apps/settings-app.js";

Hooks.once("init", () => {
  registerSettings();

  // Every individual setting is config:false, so Foundry's list shows one button that opens
  // the setup window instead — where the choices have pickers and a live preview.
  game.settings.registerMenu(MODULE_ID, "setup", {
    name: "Upgrades setup",
    label: "Open setup",
    hint: "Theme, wording, currency icon, party actor and purchase rules — with a live preview.",
    icon: "fa-solid fa-sliders",
    type: SettingsApp,
    restricted: true
  });
});

Hooks.once("ready", () => {
  initSockets();
  warnIfNoPartyActor();

  // Public API: macros can call game.modules.get("upgrades").api.openShop()
  const mod = game.modules.get(MODULE_ID);
  mod.api = {
    openShop: () => ShopApp.show(),
    openEditor: () => EditorApp.show(),
    openSettings: () => SettingsApp.show()
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
