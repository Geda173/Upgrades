/**
 * Pearl Upgrades — entry point.
 */
import { MODULE_ID, SETTINGS, registerSettings } from "./data.js";
import { initSockets } from "./sockets.js";
import { ShopApp } from "./apps/shop-app.js";
import { EditorApp } from "./apps/editor-app.js";

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  initSockets();

  // Public API: macros can call game.modules.get("pearl-upgrades").api.openShop()
  const mod = game.modules.get(MODULE_ID);
  mod.api = {
    openShop: () => ShopApp.show(),
    openEditor: () => EditorApp.show()
  };

  console.log(`${MODULE_ID} | Ready. Open the shop via the token controls button or game.modules.get("${MODULE_ID}").api.openShop()`);
});

/**
 * Scene controls button (token controls group).
 * v13 uses record-shaped controls/tools; keep a defensive fallback for array shape.
 */
Hooks.on("getSceneControlButtons", (controls) => {
  const canOpen = game.user.isGM || game.settings.get(MODULE_ID, SETTINGS.PLAYERS_CAN_OPEN);
  if (!canOpen) return;

  const tool = {
    name: "pearl-upgrades",
    title: "Pearl Upgrades — Open Shop",
    icon: "fa-solid fa-gem",
    button: true,
    onChange: () => ShopApp.show(),
    onClick: () => ShopApp.show()
  };

  const tokens = Array.isArray(controls)
    ? controls.find(c => c.name === "token" || c.name === "tokens")
    : (controls.tokens ?? controls.token);
  if (!tokens) return;

  if (Array.isArray(tokens.tools)) tokens.tools.push(tool);
  else tokens.tools[tool.name] = { ...tool, order: Object.keys(tokens.tools).length };
});
