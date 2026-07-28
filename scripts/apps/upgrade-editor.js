/**
 * Single-upgrade authoring window.
 *
 * Deliberately not a DialogV2: it needs drag & drop, a variable number of bonus rows,
 * and a form that reshapes itself as the GM picks a target or an effect mode.
 */
import { MODULE_ID, SETTINGS, TARGET, getVocabulary, getCategories } from "../data.js";
import { EFFECT_MODE, getPresetGroups, getPreset, systemSupportsBuilder,
         getDamageTypes, splitDamageValue, isPf2e, PF2E_BONUS_TYPES } from "../effects.js";
import { getPartyActors } from "../systems/adapter.js";
import { applyTheme, fitToViewport } from "./theme.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODE_CHOICES = [
  { value: CONST.ACTIVE_EFFECT_MODES.ADD, label: "Add" },
  { value: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, label: "Override" },
  { value: CONST.ACTIVE_EFFECT_MODES.UPGRADE, label: "Upgrade (raise to)" },
  { value: CONST.ACTIVE_EFFECT_MODES.DOWNGRADE, label: "Downgrade (lower to)" },
  { value: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, label: "Multiply" }
];

export class UpgradeEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "upgrades-upgrade-editor",
    classes: ["upgrades", "upg-upgrade-editor"],
    tag: "form",
    window: { title: "Edit upgrade", icon: "fa-solid fa-wand-sparkles", resizable: true },
    position: { width: 560, height: "auto" },
    // Closed by hand in the submit handler, so validation failures can keep the window open.
    form: { handler: UpgradeEditor.#onSubmit, closeOnSubmit: false },
    actions: {
      // Radios and selects that only reshape the form; the change listener does the work.
      rerender: () => {},
      addRow: UpgradeEditor.#onAddRow,
      removeRow: UpgradeEditor.#onRemoveRow,
      clearLink: UpgradeEditor.#onClearLink,
      pickImage: UpgradeEditor.#onPickImage,
      cancel: UpgradeEditor.#onCancel
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/upgrade-editor.hbs` }
  };

  /** @param {object|null} upgrade  @param {(data:object)=>Promise<void>} onSave */
  constructor(upgrade, onSave, options = {}) {
    super(options);
    this.isNew = !upgrade;
    this.onSave = onSave;
    this.draft = UpgradeEditor.#toDraft(upgrade);
  }

  get title() {
    return this.isNew ? "New upgrade" : `Edit: ${this.draft.name || "upgrade"}`;
  }

  static #toDraft(upgrade) {
    const u = upgrade ?? {};
    return {
      id: u.id ?? null,
      name: u.name ?? "",
      cost: u.cost ?? 1,
      img: u.img ?? "",
      flavor: u.flavor ?? "",
      description: u.description ?? "",
      hidden: !!u.hidden,
      hideEffect: !!u.hideEffect,
      repeatable: !!u.repeatable,
      showInEffectsBar: !!u.showInEffectsBar,
      categoryId: u.categoryId ?? "",
      purchased: !!u.purchased,
      target: u.target ?? TARGET.PARTY,
      targetActorId: u.targetActorId ?? "",
      effectMode: u.effectMode ?? (u.effectUuid ? EFFECT_MODE.LINK : EFFECT_MODE.NONE),
      effectUuid: u.effectUuid ?? "",
      rows: foundry.utils.deepClone(u.effectBuild?.rows ?? [])
    };
  }

  /* ---------- context ---------- */

  async _prepareContext(_options) {
    const draft = this.draft;
    const vocab = getVocabulary();
    const linked = draft.effectUuid ? await fromUuid(draft.effectUuid).catch(() => null) : null;
    const presetGroups = getPresetGroups();

    return {
      upgrade: draft,
      vocab,
      saveLabel: this.isNew ? "Create" : "Save",
      categories: getCategories().map(c => ({ ...c, isSelected: c.id === draft.categoryId })),
      hasCategories: getCategories().length > 0,
      systemId: game.system.id,
      builderSupported: systemSupportsBuilder(),
      isPf2e: isPf2e(),

      targetOptions: [
        { value: TARGET.PARTY, label: "The whole party", isSelected: draft.target === TARGET.PARTY },
        { value: TARGET.BUYER, label: "Whoever buys it", isSelected: draft.target === TARGET.BUYER },
        { value: TARGET.ACTOR, label: "One specific character", isSelected: draft.target === TARGET.ACTOR }
      ],
      isBuyerTarget: draft.target === TARGET.BUYER,
      isActorTarget: draft.target === TARGET.ACTOR,
      hasTargetActor: !!draft.targetActorId,
      actorGroups: this.#actorGroups(),
      partyNote: this.#partyNote(),

      effectModeOptions: [
        { value: EFFECT_MODE.NONE, label: "Nothing mechanical (cosmetic)", isSelected: draft.effectMode === EFFECT_MODE.NONE },
        { value: EFFECT_MODE.BUILD, label: "Build a bonus", isSelected: draft.effectMode === EFFECT_MODE.BUILD },
        { value: EFFECT_MODE.LINK, label: "Use an existing effect or item", isSelected: draft.effectMode === EFFECT_MODE.LINK }
      ],
      isBuild: draft.effectMode === EFFECT_MODE.BUILD,
      isLink: draft.effectMode === EFFECT_MODE.LINK,

      rows: draft.rows.map((row, index) => this.#rowContext(row, index, presetGroups)),

      linkedName: linked?.name ?? null,
      linkedImg: linked?.img ?? null,
      linkedType: linked ? `${linked.documentName}${linked.type ? ` · ${linked.type}` : ""}` : null,
      linkMissing: !!draft.effectUuid && !linked,

      showsGrantNote: draft.effectMode !== EFFECT_MODE.NONE,
      grantNote: this.#grantNote()
    };
  }

  #rowContext(row, index, presetGroups) {
    const preset = getPreset(row.preset);
    // Damage rows edit the amount and the type separately, but older rows stored "1d8[cold]"
    // in one field — split it so an upgrade authored before this still opens correctly.
    const parsed = splitDamageValue(row.value);
    const damageType = row.damageType ?? parsed.damageType ?? "";
    return {
      index,
      preset: row.preset,
      value: preset?.damage ? parsed.amount : (row.value ?? ""),
      isDamage: !!preset?.damage,
      damageTypes: getDamageTypes().map(t => ({ ...t, isSelected: t.id === damageType })),
      key: row.key ?? "",
      mode: Number(row.mode ?? CONST.ACTIVE_EFFECT_MODES.ADD),
      isCustom: row.preset === "custom",
      isPf2e: isPf2e(),
      bonusTypes: PF2E_BONUS_TYPES.map(b => ({
        ...b, isSelected: b.id === (row.bonusType ?? "circumstance")
      })),
      placeholder: preset?.placeholder ?? "+1",
      presetGroups: presetGroups.map(group => ({
        label: group.label,
        presets: group.presets.map(p => ({ id: p.id, label: p.label, isSelected: p.id === row.preset }))
      })),
      modeChoices: MODE_CHOICES.map(m => ({ ...m, isSelected: m.value === Number(row.mode ?? CONST.ACTIVE_EFFECT_MODES.ADD) }))
    };
  }

  /** Party members first — in a busy world the flat character list is unusable. */
  #actorGroups() {
    const party = getPartyActors();
    const partyIds = new Set(party.map(a => a.id));
    const others = game.actors
      .filter(a => a.type === "character" && !partyIds.has(a.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    const toEntry = a => ({ id: a.id, name: a.name, isSelected: a.id === this.draft.targetActorId });
    const groups = [];
    if (party.length) groups.push({ label: "Party", actors: party.map(toEntry) });
    if (others.length) groups.push({ label: "Other characters", actors: others.map(toEntry) });
    return groups;
  }

  #partyNote() {
    const configuredId = game.settings.get(MODULE_ID, SETTINGS.PARTY_ACTOR);
    const configured = configuredId ? game.actors.get(configuredId) : null;
    const count = getPartyActors().length;
    if (configured) return `Party membership comes from “${configured.name}” (${count} member(s)), set in module settings.`;
    return `No party actor is configured in module settings, so this falls back to all `
         + `${count} player-owned character(s) — worth setting properly before using party-wide upgrades.`;
  }

  #grantNote() {
    const how = this.draft.showInEffectsBar
      ? (game.system.id === "pf2e"
          ? "Granted as an Effect, so it sits in the effects bar"
          : "Granted as an Active Effect, so it sits on the Effects tab")
      : "Granted as a quiet, permanent feature on the sheet";
    const owned = this.draft.purchased ? " This upgrade is already owned — saving re-applies it to its targets." : "";
    return `${how}; removing or refunding the upgrade deletes it again.${owned}`;
  }

  /* ---------- keeping the draft in step with the DOM ---------- */

  /**
   * Copy the live form back into the draft.
   * Every re-render is triggered by the GM changing something, so unsaved typing must survive it.
   */
  #syncDraft() {
    const form = this.element;
    if (!form) return;
    const get = name => form.querySelector(`[name="${name}"]`);
    const val = name => get(name)?.value ?? "";

    this.draft.name = val("name");
    this.draft.cost = Math.max(0, Number(val("cost")) || 0);
    this.draft.img = val("img").trim();
    this.draft.flavor = val("flavor");
    this.draft.description = val("description");
    this.draft.hidden = !!get("hidden")?.checked;
    this.draft.hideEffect = !!get("hideEffect")?.checked;
    this.draft.repeatable = !!get("repeatable")?.checked;
    this.draft.showInEffectsBar = !!get("showInEffectsBar")?.checked;
    this.draft.categoryId = val("categoryId");
    this.draft.target = val("target") || TARGET.PARTY;
    this.draft.targetActorId = val("targetActorId");
    this.draft.effectUuid = val("effectUuid").trim();

    const checkedMode = form.querySelector('[name="effectMode"]:checked');
    if (checkedMode) this.draft.effectMode = checkedMode.value;

    this.draft.rows = [...form.querySelectorAll(".upg-row")].map(el => ({
      preset: el.querySelector('[name="rowPreset"]')?.value ?? "custom",
      value: el.querySelector('[name="rowValue"]')?.value ?? "",
      damageType: el.querySelector('[name="rowDamageType"]')?.value ?? "",
      bonusType: el.querySelector('[name="rowBonusType"]')?.value ?? "",
      key: el.querySelector('[name="rowKey"]')?.value ?? "",
      mode: Number(el.querySelector('[name="rowMode"]')?.value ?? CONST.ACTIVE_EFFECT_MODES.ADD)
    }));
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    fitToViewport(this);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    applyTheme(this);

    // Controls marked data-action="rerender" reshape the form rather than doing anything themselves.
    for (const el of this.element.querySelectorAll('[data-action="rerender"]')) {
      el.addEventListener("change", () => {
        this.#syncDraft();
        this.render();
      });
    }

    const drop = this.element.querySelector('[data-drop="effect"]');
    if (drop) {
      drop.addEventListener("dragover", event => {
        event.preventDefault();
        drop.classList.add("hover");
      });
      drop.addEventListener("dragleave", () => drop.classList.remove("hover"));
      drop.addEventListener("drop", event => this.#onDrop(event, drop));
    }
  }

  async #onDrop(event, drop) {
    event.preventDefault();
    drop.classList.remove("hover");

    let data;
    try {
      data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    } catch {
      try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch { data = null; }
    }
    if (!data?.uuid) return ui.notifications.warn("Upgrades: that drop had no document in it.");

    const doc = await fromUuid(data.uuid).catch(() => null);
    if (!doc) return ui.notifications.warn("Upgrades: could not resolve the dropped document.");
    if (!["ActiveEffect", "Item"].includes(doc.documentName)) {
      return ui.notifications.warn(`Upgrades: drop an Effect or an Item — ${doc.documentName} can't be granted.`);
    }

    this.#syncDraft();
    this.draft.effectUuid = data.uuid;
    this.draft.effectMode = EFFECT_MODE.LINK;
    if (!this.draft.name) this.draft.name = doc.name;
    if (!this.draft.img) this.draft.img = doc.img ?? "";
    this.render();
  }

  /* ---------- actions ---------- */

  static #onAddRow() {
    this.#syncDraft();
    const first = getPresetGroups()[0]?.presets[0]?.id ?? "custom";
    this.draft.rows.push({
      preset: first, value: "", damageType: "", bonusType: "circumstance",
      key: "", mode: CONST.ACTIVE_EFFECT_MODES.ADD
    });
    this.render();
  }

  static #onRemoveRow(_event, target) {
    this.#syncDraft();
    this.draft.rows.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static #onClearLink() {
    this.#syncDraft();
    this.draft.effectUuid = "";
    this.render();
  }

  static async #onPickImage() {
    this.#syncDraft();
    const FP = foundry.applications.apps.FilePicker?.implementation ?? FilePicker;
    new FP({
      type: "image",
      current: this.draft.img,
      callback: path => {
        this.draft.img = path;
        this.render();
      }
    }).browse();
  }

  static #onCancel() {
    this.close();
  }

  static async #onSubmit(_event, _form, _formData) {
    this.#syncDraft();
    const d = this.draft;

    if (d.target === TARGET.ACTOR && !d.targetActorId) {
      ui.notifications.warn("Upgrades: pick a character for a single-character upgrade.");
      return;   // window stays open so the GM can fix it
    }

    await this.onSave({
      ...(d.id ? { id: d.id } : {}),
      name: d.name || "Unnamed upgrade",
      cost: d.cost,
      img: d.img,
      flavor: d.flavor,
      description: d.description,
      hidden: d.hidden,
      hideEffect: d.hideEffect,
      repeatable: d.repeatable,
      showInEffectsBar: d.showInEffectsBar,
      categoryId: d.categoryId || null,
      target: d.target,
      targetActorId: d.target === TARGET.ACTOR ? d.targetActorId : null,
      effectMode: d.effectMode,
      effectUuid: d.effectMode === EFFECT_MODE.LINK ? (d.effectUuid || null) : null,
      effectBuild: { rows: d.effectMode === EFFECT_MODE.BUILD ? d.rows : [] }
    });
    this.close();
  }
}
