/**
 * GM console: upgrade CRUD, currency ledger, history. (ApplicationV2 + Handlebars)
 */
import {
  MODULE_ID, SETTINGS, getUpgrades, getUpgrade, upsertUpgrade, deleteUpgrade,
  getBalance, adjustBalance, getHistory, getVocabulary,
  getCategories, upsertCategory, deleteCategory, moveCategory, groupByCategory, removePurchase,
  getCurrencies, getCurrency, getBalances, getCosts, describeCosts, hasMultipleCurrencies
} from "../data.js";
import { emit, refreshOpenApps } from "../sockets.js";
import { resyncUpgrades, removeUpgradeEffect, reapplyUpgradeEffect, describeTarget } from "../systems/adapter.js";
import { describeBuild, EFFECT_MODE } from "../effects.js";
import { UpgradeEditor } from "./upgrade-editor.js";
import { applyTheme, fitToViewport } from "./theme.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class EditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "upgrades-editor",
    classes: ["upgrades", "upg-editor"],
    window: { title: "Upgrades — GM Console", icon: "fa-solid fa-scale-balanced", resizable: true },
    position: { width: 760, height: 640 },
    actions: {
      addUpgrade: EditorApp.#onAddUpgrade,
      editUpgrade: EditorApp.#onEditUpgrade,
      deleteUpgrade: EditorApp.#onDeleteUpgrade,
      toggleHidden: EditorApp.#onToggleHidden,
      refund: EditorApp.#onRefund,
      adjustBalance: EditorApp.#onAdjustBalance,
      resync: EditorApp.#onResync,
      openSettings: EditorApp.#onOpenSettings,
      placeCurrency: EditorApp.#onPlaceCurrency,
      addCategory: EditorApp.#onAddCategory,
      editCategory: EditorApp.#onEditCategory,
      removeCategory: EditorApp.#onRemoveCategory,
      moveCategoryUp: EditorApp.#onMoveCategoryUp,
      moveCategoryDown: EditorApp.#onMoveCategoryDown
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/editor.hbs` }
  };

  static show() {
    if (!game.user.isGM) return;
    EditorApp.instance ??= new EditorApp();
    EditorApp.instance.render({ force: true });
    return EditorApp.instance;
  }

  async _prepareContext(_options) {
    const vocab = getVocabulary();
    return {
      vocab,
      balance: getBalance(),
      currencies: getCurrencies().map(c => ({
        ...c, balance: getBalances()[c.id] ?? 0, isImage: /[/\\]/.test(c.icon ?? "")
      })),
      hasMultipleCurrencies: hasMultipleCurrencies(),
      hasCurrencyItem: !!game.settings.get(MODULE_ID, SETTINGS.CURRENCY_ITEM),
      categories: getCategories(),
      hasCategories: getCategories().length > 0,
      groups: groupByCategory(
        getUpgrades()
          .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
          .map(u => ({
            ...u,
            targetLabel: describeTarget(u),
            effectLabel: EditorApp.#effectLabel(u),
            ownedCount: u.purchases?.length ?? 0,
            isRepeatable: !!u.repeatable,
            ownedNames: (u.purchases ?? []).map(p => p.actorName).filter(Boolean).join(", ")
          }))
      ),
      history: getHistory().slice(-25).reverse().map(h => ({
        ...h,
        when: new Date(h.ts).toLocaleString(),
        isPurchase: h.type === "purchase",
        deltaStr: (h.delta > 0 ? "+" : "") + h.delta
      }))
    };
  }

  /** Short "what does it do" cell for the upgrade table. */
  static #effectLabel(upgrade) {
    let label = "";
    if (upgrade.effectMode === EFFECT_MODE.BUILD) label = describeBuild(upgrade.effectBuild?.rows) || "empty bonus";
    else if (upgrade.effectMode === EFFECT_MODE.LINK) label = upgrade.effectUuid ? "linked effect" : "link not set";
    if (label && upgrade.hideEffect && !upgrade.purchased) label += " · hidden from players";
    return label;
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    fitToViewport(this);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    applyTheme(this);
  }

  /* ---------- actions ---------- */

  static async #onAddUpgrade() {
    new UpgradeEditor(null, async data => {
      await upsertUpgrade(data);
      EditorApp.#afterMutation();
    }).render({ force: true });
  }

  static async #onEditUpgrade(_event, target) {
    const existing = getUpgrade(target.dataset.id);
    if (!existing) return;
    new UpgradeEditor(existing, async data => {
      await upsertUpgrade({ id: existing.id, ...data });
      // An owned upgrade whose payload or target changed must be rebuilt on the sheets.
      if (existing.purchased) {
        const updated = getUpgrade(existing.id);
        const { count } = await reapplyUpgradeEffect(updated);
        if (count) ui.notifications.info(`Upgrades: re-applied “${updated.name}” to ${count} character(s).`);
      }
      EditorApp.#afterMutation();
    }).render({ force: true });
  }

  static async #onDeleteUpgrade(_event, target) {
    const u = getUpgrade(target.dataset.id);
    if (!u) return;
    const ok = await DialogV2.confirm({
      window: { title: "Delete upgrade" },
      content: `<p>Delete <strong>${foundry.utils.escapeHTML(u.name)}</strong>?</p>`
        + (u.purchased ? `<p>It is currently owned — its effect will also be removed from every character that has it.</p>` : "")
        + `<p>This cannot be undone.</p>`
    });
    if (!ok) return;
    // Delete the catalog entry *and* whatever it put on the sheets, or the bonus is orphaned forever.
    const { count } = await removeUpgradeEffect(u.id);
    await deleteUpgrade(u.id);
    if (count) ui.notifications.info(`Upgrades: removed ${count} granted document(s) from character sheets.`);
    EditorApp.#afterMutation();
  }

  static async #onToggleHidden(_event, target) {
    const u = getUpgrade(target.dataset.id);
    if (!u) return;
    await upsertUpgrade({ id: u.id, hidden: !u.hidden });
    EditorApp.#afterMutation();
  }

  /** Refunds one acquisition — the most recent — so a repeatable upgrade can be unwound stepwise. */
  static async #onRefund(_event, target) {
    const u = getUpgrade(target.dataset.id);
    if (!u?.purchases?.length) return;
    const vocab = getVocabulary();
    const last = u.purchases[u.purchases.length - 1];
    const who = last.actorName ?? describeTarget(u).toLowerCase();
    const remaining = u.purchases.length - 1;

    const ok = await DialogV2.confirm({
      window: { title: "Refund upgrade" },
      content: `<p>Refund <strong>${foundry.utils.escapeHTML(u.name)}</strong> — 
        ${foundry.utils.escapeHTML(describeCosts(u).map(c => `${c.amount} ${c.currency.name}`).join(", ") || "nothing")}
        back, and its effect removed from
        ${foundry.utils.escapeHTML(who)}?</p>`
        + (remaining ? `<p>${remaining} other acquisition(s) of this upgrade are left untouched.</p>` : "")
    });
    if (!ok) return;

    for (const cost of getCosts(u)) await adjustBalance(cost.currencyId, cost.amount, `Refund: ${u.name}`);
    await removePurchase(u.id, last.id);
    // Repeatable grants carry a purchase id, so only this one is removed.
    await removeUpgradeEffect(u.id, u.repeatable ? last.id : null);
    EditorApp.#afterMutation();
  }

  static async #onAdjustBalance(_event, target) {
    const currencies = getCurrencies();
    // The picker only appears once there is a choice to make.
    const preset = target?.dataset?.currencyId;
    const picker = (currencies.length > 1 && !preset)
      ? `<div class="form-group"><label>Resource</label><select name="currencyId">`
        + currencies.map(c => `<option value="${c.id}">${foundry.utils.escapeHTML(c.name)}</option>`).join("")
        + `</select></div>`
      : "";

    const result = await DialogV2.prompt({
      window: { title: preset ? `Adjust ${getCurrency(preset)?.name ?? ""}` : "Adjust" },
      content: `${picker}
        <div class="form-group"><label>Amount (use negatives to remove)</label>
          <input type="number" name="delta" value="1" step="1" autofocus></div>
        <div class="form-group"><label>Reason (shown in history)</label>
          <input type="text" name="reason" placeholder="Cleared the blighted grove"></div>`,
      ok: {
        label: "Apply",
        callback: (_event, button) => {
          const form = button.form;
          return {
            currencyId: preset ?? form.elements.currencyId?.value ?? currencies[0]?.id,
            delta: Number(form.elements.delta.value) || 0,
            reason: form.elements.reason.value
          };
        }
      }
    }).catch(() => null);
    if (!result || !result.delta) return;
    await adjustBalance(result.currencyId, result.delta, result.reason);
    EditorApp.#afterMutation();
  }

  static async #onOpenSettings() {
    const { SettingsApp } = await import("./settings-app.js");
    SettingsApp.show();
  }

  /** Drop currency into a chest, a body, or anyone else the party will search. */
  static async #onPlaceCurrency() {
    const { getCurrencyItem, placeCurrency } = await import("../currency.js");
    const source = await getCurrencyItem();
    if (!source) {
      return ui.notifications.warn("Upgrades: choose a currency item in Setup first.");
    }
    const actors = game.actors.filter(a => a.isOwner).sort((a, b) => a.name.localeCompare(b.name));
    const options = actors
      .map(a => `<option value="${a.id}">${foundry.utils.escapeHTML(a.name)} (${a.type})</option>`).join("");
    const result = await DialogV2.prompt({
      window: { title: `Place ${source.name}` },
      content: `<div class="form-group"><label>Into</label><select name="actorId">${options}</select></div>
        <div class="form-group"><label>How many</label>
          <input type="number" name="amount" value="1" min="1" step="1" autofocus></div>`,
      ok: {
        label: "Place",
        callback: (_e, button) => ({
          actorId: button.form.elements.actorId.value,
          amount: Math.max(1, Number(button.form.elements.amount.value) || 0)
        })
      }
    }).catch(() => null);
    if (!result) return;
    const actor = game.actors.get(result.actorId);
    const placed = await placeCurrency(actor, result.amount);
    if (placed) ui.notifications.info(`Upgrades: placed ${placed} × ${source.name} on ${actor.name}.`);
  }

  static async #onAddCategory() {
    const name = await EditorApp.#promptName("New section", "");
    if (!name) return;
    await upsertCategory({ name });
    EditorApp.#afterMutation();
  }

  static async #onEditCategory(_event, target) {
    const category = getCategories().find(c => c.id === target.dataset.id);
    if (!category) return;
    const name = await EditorApp.#promptName("Rename section", category.name);
    if (!name) return;
    await upsertCategory({ id: category.id, name });
    EditorApp.#afterMutation();
  }

  static async #onRemoveCategory(_event, target) {
    const category = getCategories().find(c => c.id === target.dataset.id);
    if (!category) return;
    const inside = getUpgrades().filter(u => u.categoryId === category.id).length;
    const ok = await DialogV2.confirm({
      window: { title: "Delete section" },
      content: `<p>Delete the section <strong>${foundry.utils.escapeHTML(category.name)}</strong>?</p>`
        + (inside ? `<p>Its ${inside} upgrade(s) are kept — they simply become uncategorised.</p>` : "")
    });
    if (!ok) return;
    await deleteCategory(category.id);
    EditorApp.#afterMutation();
  }

  static async #onMoveCategoryUp(_event, target) {
    await moveCategory(target.dataset.id, -1);
    EditorApp.#afterMutation();
  }

  static async #onMoveCategoryDown(_event, target) {
    await moveCategory(target.dataset.id, 1);
    EditorApp.#afterMutation();
  }

  static async #promptName(title, initial) {
    const result = await DialogV2.prompt({
      window: { title },
      content: `<div class="form-group"><label>Name</label>
        <input type="text" name="name" value="${foundry.utils.escapeHTML(initial ?? "")}"
               placeholder="Lighthouse" autofocus></div>`,
      ok: { label: "Save", callback: (_e, button) => button.form.elements.name.value.trim() }
    });
    return result || null;
  }

  static async #onResync() {
    const { created } = await resyncUpgrades();
    ui.notifications.info(`Upgrades: re-sync complete (${created} document(s) created).`);
    EditorApp.#afterMutation();
  }

  static #afterMutation() {
    emit({ type: "refresh" });
    refreshOpenApps();
  }

  async _onClose(options) {
    await super._onClose(options);
    if (EditorApp.instance === this) EditorApp.instance = null;
  }
}
