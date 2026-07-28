/**
 * GM config window: upgrade CRUD, pearl ledger, history. (ApplicationV2 + Handlebars)
 */
import { MODULE_ID, getUpgrades, getUpgrade, upsertUpgrade, deleteUpgrade, getPearls, adjustPearls, getHistory } from "../data.js";
import { emit, refreshOpenApps } from "../sockets.js";
import { resyncUpgrades, removeUpgradeEffect } from "../systems/adapter.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class EditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "pearl-upgrades-editor",
    classes: ["pearl-upgrades", "pu-editor"],
    window: { title: "Pearl Upgrades — GM Console", icon: "fa-solid fa-scale-balanced", resizable: true },
    position: { width: 720, height: 640 },
    actions: {
      addUpgrade: EditorApp.#onAddUpgrade,
      editUpgrade: EditorApp.#onEditUpgrade,
      deleteUpgrade: EditorApp.#onDeleteUpgrade,
      toggleHidden: EditorApp.#onToggleHidden,
      refund: EditorApp.#onRefund,
      addPearls: EditorApp.#onAdjustPearls,
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
    return {
      pearls: getPearls(),
      upgrades: getUpgrades().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)),
      history: getHistory().slice(-25).reverse().map(h => ({
        ...h,
        when: new Date(h.ts).toLocaleString(),
        isPurchase: h.type === "purchase",
        deltaStr: (h.delta > 0 ? "+" : "") + h.delta
      }))
    };
  }

  /* ---------- actions ---------- */

  static async #onAddUpgrade() {
    await EditorApp.#upgradeDialog(null);
  }

  static async #onEditUpgrade(_event, target) {
    await EditorApp.#upgradeDialog(getUpgrade(target.dataset.id));
  }

  static async #onDeleteUpgrade(_event, target) {
    const u = getUpgrade(target.dataset.id);
    const ok = await DialogV2.confirm({
      window: { title: "Delete upgrade" },
      content: `<p>Delete <strong>${foundry.utils.escapeHTML(u?.name ?? "?")}</strong>? This cannot be undone.</p>`
    });
    if (!ok) return;
    await deleteUpgrade(target.dataset.id);
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
    const ok = await DialogV2.confirm({
      window: { title: "Refund upgrade" },
      content: `<p>Refund <strong>${foundry.utils.escapeHTML(u.name)}</strong> (${u.cost} pearls back, effect removed from all characters)?</p>`
    });
    if (!ok) return;
    await adjustPearls(u.cost, `Refund: ${u.name}`);
    await upsertUpgrade({ id: u.id, purchased: false, purchasedBy: null, purchasedAt: null });
    await removeUpgradeEffect(u.id);
    EditorApp.#afterMutation();
  }

  static async #onAdjustPearls() {
    const result = await DialogV2.prompt({
      window: { title: "Adjust pearl pool" },
      content: `
        <div class="form-group"><label>Amount (use negatives to remove)</label>
          <input type="number" name="delta" value="1" step="1" autofocus></div>
        <div class="form-group"><label>Reason (shown in history)</label>
          <input type="text" name="reason" placeholder="Defeated the kraken cult"></div>`,
      ok: {
        label: "Apply",
        callback: (_event, button) => {
          const form = button.form;
          return { delta: Number(form.elements.delta.value) || 0, reason: form.elements.reason.value };
        }
      }
    });
    if (!result || !result.delta) return;
    await adjustPearls(result.delta, result.reason);
    EditorApp.#afterMutation();
  }

  static async #onResync() {
    const { created } = await resyncUpgrades();
    ui.notifications.info(`Pearl Upgrades: re-sync complete (${created} effect(s) created).`);
  }

  /* ---------- upgrade edit dialog ---------- */

  static async #upgradeDialog(existing) {
    const u = existing ?? { name: "", cost: 1, img: "", flavor: "", description: "", effectUuid: "", hidden: false };
    const result = await DialogV2.prompt({
      window: { title: existing ? `Edit: ${u.name}` : "New upgrade" },
      position: { width: 480 },
      content: `
        <div class="form-group"><label>Name</label>
          <input type="text" name="name" value="${foundry.utils.escapeHTML(u.name)}" autofocus></div>
        <div class="form-group"><label>Cost (pearls)</label>
          <input type="number" name="cost" value="${u.cost}" min="0" step="1"></div>
        <div class="form-group"><label>Art image path</label>
          <input type="text" name="img" value="${foundry.utils.escapeHTML(u.img ?? "")}" placeholder="e.g. worlds/mycampaign/art/upgrade.webp"></div>
        <div class="form-group"><label>Flavor line (card text)</label>
          <input type="text" name="flavor" value="${foundry.utils.escapeHTML(u.flavor ?? "")}"></div>
        <div class="form-group"><label>Description / tooltip (HTML allowed)</label>
          <textarea name="description" rows="4">${u.description ?? ""}</textarea></div>
        <div class="form-group"><label>Effect UUID (optional, Phase 2)</label>
          <input type="text" name="effectUuid" value="${foundry.utils.escapeHTML(u.effectUuid ?? "")}" placeholder="Right-click an Effect item → Copy UUID">
          <p class="hint">Drag-and-drop coming soon: paste the UUID of a PF2e Effect item to auto-apply it to all PCs on purchase.</p></div>
        <div class="form-group"><label class="checkbox"><input type="checkbox" name="hidden" ${u.hidden ? "checked" : ""}> Hidden (shows as “???” teaser)</label></div>`,
      ok: {
        label: existing ? "Save" : "Create",
        callback: (_event, button) => {
          const f = button.form.elements;
          return {
            name: f.name.value || "Unnamed upgrade",
            cost: Math.max(0, Number(f.cost.value) || 0),
            img: f.img.value.trim(),
            flavor: f.flavor.value,
            description: f.description.value,
            effectUuid: f.effectUuid.value.trim() || null,
            hidden: f.hidden.checked
          };
        }
      }
    });
    if (!result) return;
    await upsertUpgrade(existing ? { id: existing.id, ...result } : result);
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
