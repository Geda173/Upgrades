/**
 * GM console: upgrade CRUD, currency ledger, history. (ApplicationV2 + Handlebars)
 */
import {
  MODULE_ID, getUpgrades, getUpgrade, upsertUpgrade, deleteUpgrade,
  getBalance, adjustBalance, getHistory, getVocabulary
} from "../data.js";
import { emit, refreshOpenApps } from "../sockets.js";
import { resyncUpgrades, removeUpgradeEffect, reapplyUpgradeEffect, describeTarget } from "../systems/adapter.js";
import { describeBuild, EFFECT_MODE } from "../effects.js";
import { UpgradeEditor } from "./upgrade-editor.js";
import { applyTheme } from "./theme.js";

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
      resync: EditorApp.#onResync
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
      upgrades: getUpgrades()
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        .map(u => ({
          ...u,
          targetLabel: describeTarget(u),
          effectLabel: EditorApp.#effectLabel(u)
        })),
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
    if (upgrade.effectMode === EFFECT_MODE.BUILD) return describeBuild(upgrade.effectBuild?.rows) || "empty bonus";
    if (upgrade.effectMode === EFFECT_MODE.LINK) return upgrade.effectUuid ? "linked effect" : "link not set";
    return "";
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

  static async #onRefund(_event, target) {
    const u = getUpgrade(target.dataset.id);
    if (!u?.purchased) return;
    const vocab = getVocabulary();
    const ok = await DialogV2.confirm({
      window: { title: "Refund upgrade" },
      content: `<p>Refund <strong>${foundry.utils.escapeHTML(u.name)}</strong> — ${u.cost}
        ${foundry.utils.escapeHTML(vocab.currencyName)} back, and its effect removed from
        ${foundry.utils.escapeHTML(describeTarget(u).toLowerCase())}?</p>`
    });
    if (!ok) return;
    await adjustBalance(u.cost, `Refund: ${u.name}`);
    await upsertUpgrade({ id: u.id, purchased: false, purchasedBy: null, purchasedAt: null });
    await removeUpgradeEffect(u.id);
    EditorApp.#afterMutation();
  }

  static async #onAdjustBalance() {
    const vocab = getVocabulary();
    const result = await DialogV2.prompt({
      window: { title: `Adjust ${vocab.currencyName}` },
      content: `
        <div class="form-group"><label>Amount (use negatives to remove)</label>
          <input type="number" name="delta" value="1" step="1" autofocus></div>
        <div class="form-group"><label>Reason (shown in history)</label>
          <input type="text" name="reason" placeholder="Cleared the blighted grove"></div>`,
      ok: {
        label: "Apply",
        callback: (_event, button) => {
          const form = button.form;
          return { delta: Number(form.elements.delta.value) || 0, reason: form.elements.reason.value };
        }
      }
    });
    if (!result || !result.delta) return;
    await adjustBalance(result.delta, result.reason);
    EditorApp.#afterMutation();
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
