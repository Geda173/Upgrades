/**
 * Player-facing shop window (ApplicationV2 + Handlebars).
 */
import { MODULE_ID, getUpgrades, getBalance, getVocabulary } from "../data.js";
import { requestPurchase } from "../purchase.js";
import { emit } from "../sockets.js";
import { describeTarget } from "../systems/adapter.js";
import { describeUpgradeEffect } from "../effects.js";
import { applyTheme, fitToViewport } from "./theme.js";

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
    const visible = getUpgrades()
      .filter(u => isGM || !u.hidden || u.teaser !== false) // hidden upgrades appear as "???" teasers
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

    // Players should be able to read what an upgrade does *before* paying for it.
    // Teasers stay blank — the whole point of a "???" card is that it gives nothing away.
    const effectLines = new Map();
    await Promise.all(visible.map(async u => {
      if (u.hidden && !isGM) return;                       // teasers give nothing away
      if (u.hideEffect && !u.purchased && !isGM) return;   // deliberately kept secret until owned
      effectLines.set(u.id, await describeUpgradeEffect(u));
    }));

    const upgrades = visible
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
          targetLabel: (!mystery && u.target === "actor") ? describeTarget(u) : null,
          effectLines: mystery ? [] : (effectLines.get(u.id) ?? []),
          // Distinguish "kept secret" from "does nothing" — otherwise a secret upgrade
          // looks identical to a purely cosmetic one.
          effectSecret: !mystery && u.hideEffect && !u.purchased && !isGM,
          // The GM needs to see at a glance that players are not seeing this.
          effectSecretForGM: isGM && u.hideEffect && !u.purchased
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

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    fitToViewport(this);
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
