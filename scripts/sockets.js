/**
 * Socket layer (native game.socket — no external dependency).
 * All world mutations run on the active GM's client; players only send requests.
 */
import { MODULE_ID } from "./settings.js";

const CHANNEL = `module.${MODULE_ID}`;

export function initSockets() {
  game.socket.on(CHANNEL, async (msg) => {
    switch (msg?.type) {
      case "requestPurchase": {
        // Only one GM client should handle the request. Imported here rather than at the top
        // because purchase.js emits through this module — a static pair would be a cycle.
        if (!isActiveGM()) break;
        const { handlePurchaseRequest } = await import("./purchase.js");
        await handlePurchaseRequest(msg);
        break;
      }
      case "deposit":
        if (isActiveGM()) {
          const { depositFrom } = await import("./currency.js");
          const actor = game.actors.get(msg.actorId);
          const amount = await depositFrom(actor);
          emit({ type: "notify", userId: msg.userId,
                 message: amount ? `Handed in ${amount}.` : "Nothing to hand in." });
          refreshOpenApps();
          emit({ type: "refresh" });
        }
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
  // Plain code-point order, not localeCompare: every GM client must sort the same way, and
  // locale-aware collation is exactly the thing that can differ between them.
  const activeGMs = game.users.filter(u => u.isGM && u.active)
    .sort((a, b) => (a.id > b.id) - (a.id < b.id));
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
