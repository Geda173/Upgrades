/**
 * Socket layer (native game.socket — no external dependency).
 * All world mutations run on the active GM's client; players only send requests.
 */
import { MODULE_ID } from "./data.js";
import { handlePurchaseRequest } from "./purchase.js";

const CHANNEL = `module.${MODULE_ID}`;

export function initSockets() {
  game.socket.on(CHANNEL, async (msg) => {
    switch (msg?.type) {
      case "requestPurchase":
        // Only one GM client should handle the request
        if (isActiveGM()) await handlePurchaseRequest(msg);
        break;
      case "openShop":
        if (!game.user.isGM) openShopForClient();
        break;
      case "refresh":
        refreshOpenApps();
        break;
      case "notify":
        if (msg.userId === game.user.id) ui.notifications.info(msg.message);
        break;
    }
  });
}

export function emit(msg) {
  game.socket.emit(CHANNEL, msg);
}

/** True if this client is the active GM with the lowest user id (dedupe when several GMs are logged in). */
export function isActiveGM() {
  if (!game.user.isGM) return false;
  const activeGMs = game.users.filter(u => u.isGM && u.active).sort((a, b) => a.id.compare?.(b.id) ?? (a.id < b.id ? -1 : 1));
  return activeGMs[0]?.id === game.user.id;
}

export function anyGMOnline() {
  return game.users.some(u => u.isGM && u.active);
}

async function openShopForClient() {
  const { ShopApp } = await import("./apps/shop-app.js");
  ShopApp.show();
}

export async function refreshOpenApps() {
  const { ShopApp } = await import("./apps/shop-app.js");
  const { EditorApp } = await import("./apps/editor-app.js");
  ShopApp.instance?.render();
  EditorApp.instance?.render();
  // The scene-control button's label, icon and very existence come from settings too.
  ui.controls?.render();
}
