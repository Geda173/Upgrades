/**
 * Player-facing shop window (ApplicationV2 + Handlebars).
 */
import { MODULE_ID, SETTINGS, getUpgrades, getPearls } from "../data.js";
import { requestPurchase } from "../purchase.js";
import { emit } from "../sockets.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ShopApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "pearl-upgrades-shop",
    classes: ["pearl-upgrades", "pu-shop"],
    window: { title: "The Pearl Merchant", icon: "fa-solid fa-gem", resizable: true },
    position: { width: 920, height: "auto" },
    actions: {
      buy: ShopApp.#onBuy,
      showToPlayers: ShopApp.#onShowToPlayers,
      openEditor: ShopApp.#onOpenEditor,
      selectCard: ShopApp.#onSelectCard
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/shop.hbs` }
  };

  #selectedId = null;

  static show() {
    ShopApp.instance ??= new ShopApp();
    ShopApp.instance.render({ force: true });
    return ShopApp.instance;
  }

  async _prepareContext(_options) {
    const isGM = game.user.isGM;
    const pearls = getPearls();
    const upgrades = getUpgrades()
      .filter(u => isGM || !u.hidden || u.teaser !== false) // hidden upgrades appear as "???" teasers
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map(u => {
        const mystery = u.hidden && !isGM;
        return {
          ...u,
          mystery,
          displayName: mystery ? "???" : u.name,
          displayFlavor: mystery ? "“Prove yourselves further, and I may show you more…”" : u.flavor,
          displayImg: mystery ? "" : u.img,
          affordable: !u.purchased && pearls >= u.cost,
          selected: u.id === this.#selectedId
        };
      });

    const selected = upgrades.find(u => u.selected && !u.mystery) ?? null;

    return {
      isGM,
      pearls,
      upgrades,
      selected,
      selectedDescription: selected ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(selected.description ?? "") : null,
      currencyName: game.settings.get(MODULE_ID, SETTINGS.CURRENCY_NAME),
      merchantName: game.settings.get(MODULE_ID, SETTINGS.MERCHANT_NAME),
      merchantImg: game.settings.get(MODULE_ID, SETTINGS.MERCHANT_IMG),
      merchantGreeting: game.settings.get(MODULE_ID, SETTINGS.MERCHANT_GREETING)
    };
  }

  static #onBuy(_event, target) {
    requestPurchase(target.dataset.upgradeId);
  }

  static #onSelectCard(_event, target) {
    const app = ShopApp.instance;
    if (!app) return;
    app.#selectedId = app.#selectedId === target.dataset.upgradeId ? null : target.dataset.upgradeId;
    app.render();
  }

  static #onShowToPlayers() {
    emit({ type: "openShop" });
    ui.notifications.info("The shop has been shown to all players.");
  }

  static async #onOpenEditor() {
    const { EditorApp } = await import("./editor-app.js");
    EditorApp.show();
  }

  async _onClose(options) {
    await super._onClose(options);
    if (ShopApp.instance === this) ShopApp.instance = null;
  }
}
