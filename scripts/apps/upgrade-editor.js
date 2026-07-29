/**
 * Single-upgrade authoring window.
 *
 * Deliberately not a DialogV2: it needs drag & drop, a variable number of bonus rows,
 * and a form that reshapes itself as the GM picks a target or an effect mode.
 */
import { TARGET, eligibleExclusions, eligiblePrerequisites, exclusiveSiblings, getCategories,
         getUpgrades } from "../catalog.js";
import { getCosts, getCurrencies } from "../economy.js";
import { MODULE_ID, SETTINGS, getVocabulary, isImagePath } from "../settings.js";
import { EFFECT_MODE, getPresetGroups, getPreset, systemSupportsBuilder,
         getDamageTypes, getResistanceTypes, splitDamageValue, isPf2e, PF2E_BONUS_TYPES } from "../effects.js";
import { getPartyActors } from "../systems/adapter.js";
import { UpgradesWindow, wireDropZone } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** How many candidates a picker needs before a filter box earns its place. */
const FILTER_FROM = 8;

const MODE_CHOICES = [
  { value: CONST.ACTIVE_EFFECT_MODES.ADD, label: "Add" },
  { value: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, label: "Override" },
  { value: CONST.ACTIVE_EFFECT_MODES.UPGRADE, label: "Upgrade (raise to)" },
  { value: CONST.ACTIVE_EFFECT_MODES.DOWNGRADE, label: "Downgrade (lower to)" },
  { value: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, label: "Multiply" }
];

export class UpgradeEditor extends UpgradesWindow(HandlebarsApplicationMixin(ApplicationV2)) {
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

  static SCROLL_SELECTOR = ".upg-form-body";

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/upgrade-editor.hbs` }
  };

  /**
   * Where each picker was scrolled to, and what was ticked when the window opened.
   *
   * Both exist because ticking a box re-renders the form. Without the first you are thrown back
   * to the top of a long list after every tick; without the second the row you just ticked jumps
   * out from under the cursor, which makes ticking several in a row a game of chase.
   */
  #pickerScroll = {};
  #pinned = { requires: new Set(), excludes: new Set() };

  /** @param {object|null} upgrade  @param {(data:object)=>Promise<void>} onSave */
  constructor(upgrade, onSave, options = {}) {
    super(options);
    this.isNew = !upgrade;
    this.onSave = onSave;
    this.draft = UpgradeEditor.#toDraft(upgrade);
    this.#pinned = {
      requires: new Set(this.draft.requires),
      excludes: new Set(this.draft.excludes)
    };
  }

  get title() {
    return this.isNew ? "New upgrade" : `Edit: ${this.draft.name || "upgrade"}`;
  }

  static #toDraft(upgrade) {
    const u = upgrade ?? {};
    return {
      id: u.id ?? null,
      name: u.name ?? "",
      costs: Object.fromEntries(getCurrencies().map(c => [
        c.id, getCosts(u).find(x => x.currencyId === c.id)?.amount ?? 0
      ])),
      img: u.img ?? "",
      flavor: u.flavor ?? "",
      description: u.description ?? "",
      hidden: !!u.hidden,
      hideEffect: !!u.hideEffect,
      repeatable: !!u.repeatable,
      showInEffectsBar: !!u.showInEffectsBar,
      requires: [...(u.requires ?? [])],
      excludes: [...(u.excludes ?? [])],
      // Filtering happens in the DOM, but the text has to survive the re-render that ticking a
      // box triggers — so it lives in the draft like every other field.
      requiresFilter: "",
      excludesFilter: "",
      choiceEnabled: !!u.choice?.enabled,
      choiceLabel: u.choice?.label ?? "",
      choiceHint: u.choice?.hint ?? "",
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
    const all = getUpgrades();
    // What this upgrade is exclusive with decides which prerequisites are legal, so both pickers
    // are rebuilt from the live draft rather than from what was last saved.
    const live = { id: draft.id, requires: draft.requires, excludes: draft.excludes };
    const candidates = eligiblePrerequisites(live, all);
    const rivals = exclusiveSiblings(live, all);
    const sections = getCategories();
    const prereqEntries = UpgradeEditor.#pickerEntries(
      candidates, draft.requires, this.#pinned.requires, sections);
    const exclusionEntries = UpgradeEditor.#pickerEntries(
      eligibleExclusions(live, all), draft.excludes, this.#pinned.excludes, sections);

    return {
      upgrade: draft,
      vocab,
      saveLabel: this.isNew ? "Create" : "Save",
      costRows: getCurrencies().map(c => ({
        id: c.id, name: c.name, icon: c.icon,
        isImage: isImagePath(c.icon ?? ""),
        amount: draft.costs[c.id] ?? 0
      })),
      categories: getCategories().map(c => ({ ...c, isSelected: c.id === draft.categoryId })),
      // Anything that already depends on this upgrade is withheld — picking it would close a loop
      // and leave every upgrade in that loop permanently unbuyable.
      prerequisites: prereqEntries,
      hasPrerequisiteCandidates: prereqEntries.length > 0,
      requiresFilter: draft.requiresFilter,
      showRequiresFilter: prereqEntries.length > FILTER_FROM,
      requiresCount: draft.requires.length,
      exclusions: exclusionEntries,
      hasExclusionCandidates: exclusionEntries.length > 0,
      excludesFilter: draft.excludesFilter,
      showExcludesFilter: exclusionEntries.length > FILTER_FROM,
      excludesCount: draft.excludes.length,
      exclusiveNote: this.#exclusiveNote(rivals),
      hasCategories: getCategories().length > 0,
      systemId: game.system.id,
      builderSupported: systemSupportsBuilder(),
      isPf2e: isPf2e(),
      bonusTypeLegend: isPf2e() ? PF2E_BONUS_TYPES.filter(b => !b.label.includes("rarely")) : [],

      targetOptions: [
        { value: TARGET.PARTY, label: "The whole party", isSelected: draft.target === TARGET.PARTY },
        { value: TARGET.BUYER, label: "Whoever buys it", isSelected: draft.target === TARGET.BUYER },
        { value: TARGET.ACTOR, label: "One specific character", isSelected: draft.target === TARGET.ACTOR }
      ],
      isBuyerTarget: draft.target === TARGET.BUYER,
      choiceEnabled: draft.choiceEnabled,
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

  /**
   * One row per upgrade for the two pickers — "comes after" and "cannot be taken with".
   *
   * Rows ticked *when the window opened* float to the top. Past a couple of dozen upgrades a flat
   * alphabetical list makes the current state the one thing you cannot see without scrolling, and
   * it is the first thing the GM looks for. Ordering on the pinned set rather than the live one is
   * deliberate: sorting on every tick would pull each row you click out from under the cursor.
   *
   * The section name rides along so two similarly-named upgrades are tellable apart, and `search`
   * is what the filter box matches against.
   */
  static #pickerEntries(upgrades, selected, pinned, sections) {
    const sectionNames = new Map(sections.map(c => [c.id, c.name]));
    return upgrades
      .map(u => {
        const name = u.name || "Unnamed upgrade";
        const section = sectionNames.get(u.categoryId) ?? "";
        return {
          id: u.id, name, section,
          isSelected: selected.includes(u.id),
          wasSelected: pinned.has(u.id),
          search: `${name} ${section}`.toLowerCase()
        };
      })
      .sort((a, b) => (Number(b.wasSelected) - Number(a.wasSelected)) || a.name.localeCompare(b.name));
  }

  #rowContext(row, index, presetGroups) {
    const preset = getPreset(row.preset);
    // Damage rows edit the amount and the type separately, but older rows stored "1d8[cold]"
    // in one field — split it so an upgrade authored before this still opens correctly.
    const parsed = splitDamageValue(row.value);
    const damageType = row.damageType ?? parsed.damageType ?? "";
    // A resistance row asks for a *kind*, not a bonus: sometimes with an amount (PF2e's
    // Resistance and Weakness), sometimes as the whole payload (an immunity, and every dnd5e
    // trait — those are sets of damage types with no number to give).
    const isIwr = !!preset?.iwr;
    const valueIsType = !!preset?.valueIsType;
    const kinds = isIwr ? getResistanceTypes() : getDamageTypes();

    return {
      index,
      preset: row.preset,
      value: preset?.damage ? parsed.amount : (row.value ?? ""),
      isDamage: !!preset?.damage,
      isIwr,
      valueIsType,
      // When the type *is* the value it rides in rowValue, so the row keeps one field either way.
      kinds: kinds.map(t => ({ ...t, isSelected: t.id === (valueIsType ? (row.value ?? "") : damageType) })),
      damageTypes: getDamageTypes().map(t => ({ ...t, isSelected: t.id === damageType })),
      key: row.key ?? "",
      mode: Number(row.mode ?? CONST.ACTIVE_EFFECT_MODES.ADD),
      isCustom: row.preset === "custom",
      isPf2e: isPf2e(),
      bonusTypeLegend: isPf2e() ? PF2E_BONUS_TYPES.filter(b => !b.label.includes("rarely")) : [],
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

  /**
   * Names the whole set, not merely what was ticked. Exclusivity is closed transitively, so
   * ticking one upgrade can pull in whatever *it* was already exclusive with — said here, while
   * authoring, rather than discovered later on the board.
   */
  #exclusiveNote(rivals) {
    if (!rivals.length) return "";
    const ticked = new Set(this.draft.excludes);
    const pulled = rivals.filter(u => !ticked.has(u.id)).map(u => u.name);
    const base = `Only one of this and ${rivals.map(u => u.name).join(", ")} can ever be taken.`;
    if (!pulled.length) return base;
    return `${base} ${pulled.join(", ")} ${pulled.length === 1 ? "joins" : "join"} the set because `
         + `${pulled.length === 1 ? "it is" : "they are"} already exclusive with something ticked here.`;
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
    for (const el of form.querySelectorAll('[name^="cost:"]')) {
      this.draft.costs[el.name.slice(5)] = Math.max(0, Number(el.value) || 0);
    }
    this.draft.img = val("img").trim();
    this.draft.flavor = val("flavor");
    this.draft.description = val("description");
    this.draft.hidden = !!get("hidden")?.checked;
    this.draft.hideEffect = !!get("hideEffect")?.checked;
    this.draft.repeatable = !!get("repeatable")?.checked;
    this.draft.showInEffectsBar = !!get("showInEffectsBar")?.checked;
    this.draft.requires = [...form.querySelectorAll('[name="requires"]:checked')].map(el => el.value);
    this.draft.excludes = [...form.querySelectorAll('[name="excludes"]:checked')].map(el => el.value);
    this.draft.requiresFilter = val("requiresFilter");
    this.draft.excludesFilter = val("excludesFilter");
    this.draft.choiceEnabled = !!get("choiceEnabled")?.checked;
    this.draft.choiceLabel = val("choiceLabel");
    this.draft.choiceHint = val("choiceHint");
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



  _onRender(context, options) {
    super._onRender(context, options);

    // Controls marked data-action="rerender" reshape the form rather than doing anything themselves.
    for (const el of this.element.querySelectorAll('[data-action="rerender"]')) {
      el.addEventListener("change", () => {
        this.#syncDraft();
        this.render();
      });
    }

    // Narrowing a long picker happens here in the DOM rather than by re-rendering: typing must
    // not rebuild the form on every keystroke. The text itself is kept in the draft, so the
    // re-render that ticking a box *does* trigger comes back with the filter still applied.
    for (const box of this.element.querySelectorAll(".upg-picker")) {
      // The list scrolls inside itself, so the mixin's form-body restore does not reach it.
      const key = box.dataset.picker;
      const list = box.querySelector(".upg-picker-list");
      if (list && key) {
        list.scrollTop = this.#pickerScroll[key] ?? 0;
        list.addEventListener("scroll", () => { this.#pickerScroll[key] = list.scrollTop; });
      }

      const input = box.querySelector(".upg-picker-filter");
      if (!input) continue;
      const rows = [...box.querySelectorAll("label.checkbox")];
      const empty = box.querySelector(".upg-picker-empty");
      const apply = () => {
        const needle = input.value.trim().toLowerCase();
        let shown = 0;
        for (const row of rows) {
          const hit = !needle || (row.dataset.search ?? "").includes(needle);
          row.classList.toggle("filtered-out", !hit);
          if (hit) shown++;
        }
        empty?.classList.toggle("filtered-out", shown > 0);
      };
      input.addEventListener("input", apply);
      apply();
    }

    // A dice value becomes a DamageDice rule, which has no bonus type, so the selector is
    // hidden rather than left there inviting a choice that is quietly discarded.
    for (const row of this.element.querySelectorAll(".upg-row")) {
      const value = row.querySelector('[name="rowValue"]');
      const bonusType = row.querySelector('[name="rowBonusType"]');
      if (!value || !bonusType) continue;
      const sync = () => {
        const isDice = /\d*\s*d\s*\d+/i.test(value.value);
        bonusType.classList.toggle("hidden", isDice);
        bonusType.disabled = isDice;
      };
      value.addEventListener("input", sync);
      sync();
    }

    // Either kind can be granted, so both are accepted here.
    wireDropZone(this.element.querySelector('[data-drop="effect"]'), {
      accept: ["ActiveEffect", "Item"],
      onDrop: (doc, uuid) => {
        this.#syncDraft();
        this.draft.effectUuid = uuid;
        this.draft.effectMode = EFFECT_MODE.LINK;
        if (!this.draft.name) this.draft.name = doc.name;
        if (!this.draft.img) this.draft.img = doc.img ?? "";
        this.render();
      }
    });
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
      costs: Object.entries(d.costs)
        .filter(([, amount]) => amount > 0)
        .map(([currencyId, amount]) => ({ currencyId, amount })),
      img: d.img,
      flavor: d.flavor,
      description: d.description,
      hidden: d.hidden,
      hideEffect: d.hideEffect,
      repeatable: d.repeatable,
      showInEffectsBar: d.showInEffectsBar,
      requires: d.requires,
      excludes: d.excludes,
      choice: { enabled: d.choiceEnabled, label: d.choiceLabel, hint: d.choiceHint },
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
