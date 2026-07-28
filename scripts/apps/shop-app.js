/**
 * Player-facing shop window (ApplicationV2 + Handlebars).
 */
import { MODULE_ID, getUpgrades, getBalance, getVocabulary } from "../data.js";
import { requestPurchase } from "../purchase.js";
import { emit } from "../sockets.js";
import { describeTarget } from "../systems/adapter.js";
import { applyTheme } from "./theme.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ShopApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "upgrades-shop",
    classes: ["upgrades", "upg-shop"],
    window: { title: "Upgrades", icon: "fa-solid fa-gem", resizable: true },
    position: { width: 920, height: "auto" },
    actions: {
      buy: ShopApp.#onBuy,
      showToPlayers: ShopApp.#onShowToPlayers,
      openEditor: ShopApp.#onOpenEditor,
      openSettings: ShopApp.#onOpenSettings,
      selectCard: ShopApp.#onSelectCard
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/shop.hbs` }
  };

  #selectedId = null;

  /** The GM names the window ("The Memorial Garden"), so the title can't live in DEFAULT_OPTIONS. */
  get title() {
    return getVocabulary().windowTitle;
  }

  static show() {
    ShopApp.instance ??= new ShopApp();
    ShopApp.instance.render({ force: true });
    return ShopApp.instance;
  }

  async _prepareContext(_options) {
    const isGM = game.user.isGM;
    const balance = getBalance();
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
          affordable: !u.purchased && balance >= u.cost,
          selected: u.id === this.#selectedId,
          // Only worth showing when it isn't the default "everyone" case.
          targetLabel: (!mystery && u.target === "actor") ? describeTarget(u) : null
        };
      });

    const selected = upgrades.find(u => u.selected && !u.mystery) ?? null;

    return {
      isGM,
      balance,
      upgrades,
      selected,
      selectedDescription: selected ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(selected.description ?? "") : null,
      vocab: getVocabulary()
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    applyTheme(this);
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

  static async #onOpenSettings() {
    const { SettingsApp } = await import("./settings-app.js");
    SettingsApp.show();
  }

  async _onClose(options) {
    await super._onClose(options);
    if (ShopApp.instance === this) ShopApp.instance = null;
  }
}
