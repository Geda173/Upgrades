/**
 * Setup window: everything a GM needs to dress the module, with a live preview.
 *
 * Foundry's own settings list can't show what a theme looks like, and asking someone to type
 * "fa-solid fa-seedling" from memory is not a reasonable ask. So the settings live here instead,
 * behind pickers, next to a preview that updates as you type.
 *
 * The preview is patched in place rather than re-rendered — a full render on every keystroke
 * would pull focus out of whatever field the GM is typing in.
 */
import { deleteCurrency, getCurrencies, upsertCurrency } from "../economy.js";
import { MODULE_ID, SETTINGS, THEMES, grantMerchantAccess, isImagePath, merchantNeedsAccess } from "../settings.js";
import { emit, refreshOpenApps } from "../sockets.js";
import { UpgradesWindow, wireDropZone } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Icon picker markup for use inside a DialogV2, where Handlebars is not available. */
function iconPickerHtml(groups, selected) {
  const esc = foundry.utils.escapeHTML;
  return `<div class="upg-icon-picker">` + groups.map(g => `
    <div class="upg-icon-group">
      <span class="upg-icon-group-label">${esc(g.label)}</span>
      <div class="upg-icon-row">
        ${g.icons.map(([cls, name]) => `
          <button type="button" class="upg-icon-choice${cls === selected ? " active" : ""}"
                  data-pick-icon="${esc(cls)}" title="${esc(name)}"><i class="${esc(cls)}"></i></button>`).join("")}
      </div>
    </div>`).join("") + `</div>`;
}

/** Clicking a swatch fills the field, so the typed value stays the single source of truth. */
function wireIconPicker(root, inputName) {
  const input = root?.querySelector(`[name="${inputName}"]`);
  if (!input) return;
  const preview = root.querySelector("[data-icon-preview]");
  const paint = () => {
    for (const b of root.querySelectorAll("[data-pick-icon]")) {
      b.classList.toggle("active", b.dataset.pickIcon === input.value.trim());
    }
    if (preview) {
      const v = input.value.trim();
      preview.innerHTML = isImagePath(v)
        ? `<img class="upg-currency-img" src="${foundry.utils.escapeHTML(v)}" alt="">`
        : `<i class="${foundry.utils.escapeHTML(v || "fa-solid fa-circle")}"></i>`;
    }
  };
  for (const b of root.querySelectorAll("[data-pick-icon]")) {
    b.addEventListener("click", event => {
      event.preventDefault();
      input.value = b.dataset.pickIcon;
      paint();
    });
  }
  input.addEventListener("input", paint);

  const browse = root.querySelector("[data-browse-icon]");
  browse?.addEventListener("click", event => {
    event.preventDefault();
    const FP = foundry.applications.apps.FilePicker?.implementation ?? FilePicker;
    new FP({ type: "image", current: input.value, callback: path => { input.value = path; paint(); } }).browse();
  });
  paint();
}

/** Curated icons, so nobody has to know the Font Awesome catalogue. */
const ICON_GROUPS = [
  { label: "Nature", icons: [
    ["fa-solid fa-seedling", "Seedling"], ["fa-solid fa-leaf", "Leaf"], ["fa-solid fa-tree", "Tree"],
    ["fa-solid fa-clover", "Clover"], ["fa-solid fa-spa", "Blossom"], ["fa-solid fa-feather", "Feather"],
    ["fa-solid fa-droplet", "Droplet"], ["fa-solid fa-fire", "Flame"]
  ]},
  // Verified present in FA6 free solid — fa-crystal-ball and fa-orb do not exist and render blank.
  { label: "Orbs & pearls", icons: [
    ["fa-solid fa-circle", "Pearl"], ["fa-solid fa-circle-dot", "Orb"],
    ["fa-solid fa-egg", "Pearl (oval)"], ["fa-solid fa-hurricane", "Swirling orb"],
    ["fa-solid fa-globe", "Sphere"], ["fa-solid fa-compact-disc", "Disc"]
  ]},
  { label: "Treasure", icons: [
    ["fa-solid fa-gem", "Gem"], ["fa-solid fa-coins", "Coins"], ["fa-solid fa-crown", "Crown"],
    ["fa-solid fa-ring", "Ring"], ["fa-solid fa-key", "Key"], ["fa-solid fa-sack-dollar", "Purse"],
    ["fa-solid fa-star", "Star"], ["fa-solid fa-heart", "Heart"]
  ]},
  { label: "Arcane", icons: [
    ["fa-solid fa-wand-sparkles", "Wand"], ["fa-solid fa-hat-wizard", "Wizard hat"], ["fa-solid fa-scroll", "Scroll"],
    ["fa-solid fa-book", "Book"], ["fa-solid fa-dice-d20", "d20"], ["fa-solid fa-eye", "Eye"],
    ["fa-solid fa-moon", "Moon"], ["fa-solid fa-sun", "Sun"]
  ]},
  { label: "Grim", icons: [
    ["fa-solid fa-skull", "Skull"], ["fa-solid fa-bone", "Bone"], ["fa-solid fa-ghost", "Ghost"],
    ["fa-solid fa-shield-halved", "Shield"], ["fa-solid fa-dragon", "Dragon"], ["fa-solid fa-anchor", "Anchor"]
  ]},
  { label: "Sci-fi", icons: [
    ["fa-solid fa-microchip", "Chip"], ["fa-solid fa-atom", "Atom"], ["fa-solid fa-robot", "Robot"],
    ["fa-solid fa-rocket", "Rocket"], ["fa-solid fa-satellite", "Satellite"], ["fa-solid fa-radiation", "Radiation"],
    ["fa-solid fa-bolt", "Bolt"], ["fa-solid fa-circle-nodes", "Network"]
  ]}
];

/** Portrait icons — people, places and creatures rather than currency symbols. */
const HOST_ICON_GROUPS = [
  { label: "People", icons: [
    ["fa-solid fa-user", "Figure"], ["fa-solid fa-user-tie", "Merchant"], ["fa-solid fa-hat-wizard", "Wizard"],
    ["fa-solid fa-crown", "Monarch"], ["fa-solid fa-mask", "Masked"], ["fa-solid fa-skull", "Skull"],
    ["fa-solid fa-ghost", "Ghost"], ["fa-solid fa-robot", "Android"]
  ]},
  { label: "Places", icons: [
    ["fa-solid fa-tree", "Grove"], ["fa-solid fa-seedling", "Garden"], ["fa-solid fa-mountain", "Mountain"],
    ["fa-solid fa-tent", "Camp"], ["fa-solid fa-dungeon", "Dungeon"], ["fa-solid fa-torii-gate", "Gate"],
    ["fa-solid fa-anchor", "Harbour"], ["fa-solid fa-satellite-dish", "Station"]
  ]},
  { label: "Signs", icons: [
    ["fa-solid fa-gem", "Gem"], ["fa-solid fa-scroll", "Scroll"], ["fa-solid fa-book", "Tome"],
    ["fa-solid fa-fire", "Flame"], ["fa-solid fa-moon", "Moon"], ["fa-solid fa-sun", "Sun"],
    ["fa-solid fa-dragon", "Dragon"], ["fa-solid fa-atom", "Atom"]
  ]}
];

/** Checkbox fields need .checked rather than .value when read back off the form. */
const BOOL_FIELDS = ["requireApproval", "playersCanOpen", "autoDeposit"];

export class SettingsApp extends UpgradesWindow(HandlebarsApplicationMixin(ApplicationV2)) {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "upgrades-settings",
    classes: ["upgrades", "upg-settings-app"],
    tag: "form",
    window: { title: "Upgrades — Setup", icon: "fa-solid fa-sliders", resizable: true },
    position: { width: 900, height: 720 },
    form: { handler: SettingsApp.#onSubmit, closeOnSubmit: false },
    actions: {
      pickTheme: SettingsApp.#onPickTheme,
      pickIcon: SettingsApp.#onPickIcon,
      pickIconImage: SettingsApp.#onPickIconImage,
      pickHostIcon: SettingsApp.#onPickHostIcon,
      pickHostImg: SettingsApp.#onPickHostImg,
      clearHostImg: SettingsApp.#onClearHostImg,
      clearCurrencyItem: SettingsApp.#onClearCurrencyItem,
      clearHostActor: SettingsApp.#onClearHostActor,
      grantMerchantAccess: SettingsApp.#onGrantMerchantAccess,
      addCurrency: SettingsApp.#onAddCurrency,
      editCurrency: SettingsApp.#onEditCurrency,
      removeCurrency: SettingsApp.#onRemoveCurrency,
      cancel: SettingsApp.#onCancel
    }
  };

  static SCROLL_SELECTOR = ".upg-settings-form";

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/settings.hbs` }
  };

  #draft = null;

  static show() {
    if (!game.user.isGM) return;
    SettingsApp.instance ??= new SettingsApp();
    SettingsApp.instance.render({ force: true });
    return SettingsApp.instance;
  }

  constructor(options = {}) {
    super(options);
    this.#draft = SettingsApp.#readSettings();
  }

  static #readSettings() {
    const g = key => game.settings.get(MODULE_ID, key);
    return {
      theme: g(SETTINGS.THEME),
      windowTitle: g(SETTINGS.WINDOW_TITLE),
      hostActor: g(SETTINGS.HOST_ACTOR),
      hostName: g(SETTINGS.HOST_NAME),
      hostImg: g(SETTINGS.HOST_IMG),
      greeting: g(SETTINGS.GREETING),
      currencyName: g(SETTINGS.CURRENCY_NAME),
      currencyIcon: g(SETTINGS.CURRENCY_ICON),
      currencyItem: g(SETTINGS.CURRENCY_ITEM),
      autoDeposit: g(SETTINGS.AUTO_DEPOSIT),
      actionVerb: g(SETTINGS.ACTION_VERB),
      partyActor: g(SETTINGS.PARTY_ACTOR),
      requireApproval: g(SETTINGS.REQUIRE_APPROVAL),
      playersCanOpen: g(SETTINGS.PLAYERS_CAN_OPEN)
    };
  }

  /* ---------- context ---------- */

  async _prepareContext(_options) {
    const d = this.#draft;
    // Resolved here so the template can name the item rather than showing a raw uuid.
    this.currencyItemName = d.currencyItem
      ? (await fromUuid(d.currencyItem).catch(() => null))?.name ?? null
      : null;
    const isImg = isImagePath(d.currencyIcon);

    return {
      draft: d,
      currencyIconIsImg: isImg,
      // The portrait accepts an image path or an icon class, so the template needs both forms.
      hostIsImage: !!d.hostImg && isImagePath(d.hostImg),
      hostIconClass: (d.hostImg && !isImagePath(d.hostImg))
        ? d.hostImg
        : (isImg ? "fa-solid fa-gem" : (d.currencyIcon || "fa-solid fa-gem")),
      iconClassOrDefault: isImg ? "fa-solid fa-gem" : (d.currencyIcon || "fa-solid fa-gem"),

      themeGroups: [...new Set(THEMES.map(t => t.group))].map(group => ({
        label: group,
        themes: THEMES.filter(t => t.group === group)
          .map(t => ({ ...t, isSelected: t.id === d.theme }))
      })),

      iconGroups: ICON_GROUPS.map(g => ({
        label: g.label,
        icons: g.icons.map(([cls, name]) => ({ cls, name, isSelected: cls === d.currencyIcon }))
      })),

      currencyItemName: this.currencyItemName ?? null,
      currencies: getCurrencies().map(c => ({ ...c, isImage: isImagePath(c.icon ?? "") })),
      hasMultipleCurrencies: getCurrencies().length > 1,
      hostActorName: d.hostActor ? (game.actors.get(d.hostActor)?.name ?? "missing actor") : null,
      // Checked against the saved actor, since the warning is about world state, not the draft.
      merchantNeedsAccess: merchantNeedsAccess(),

      hostIconGroups: HOST_ICON_GROUPS.map(g => ({
        label: g.label,
        icons: g.icons.map(([cls, name]) => ({ cls, name, isSelected: cls === d.hostImg }))
      })),

      partyActorChoices: SettingsApp.#partyActorChoices(d.partyActor),
      hasPartyActor: !!d.partyActor,
      partyWarning: SettingsApp.#partyWarning(),

    };
  }

  static #partyActorChoices(selected) {
    const groups = game.actors.filter(a => a.type === "group" || a.type === "party");
    return [
      { id: "", name: "— every player-owned character —", isSelected: !selected },
      ...groups.map(a => ({ id: a.id, name: a.name, isSelected: a.id === selected }))
    ];
  }

  static #partyWarning() {
    const groups = game.actors.filter(a => a.type === "group" || a.type === "party").length;
    const loose = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner).length;
    if (!groups) {
      return `No Group actor exists in this world yet, so party-wide upgrades would apply to all `
           + `${loose} player-owned characters — including chests, item piles and wildshape copies. `
           + `Create a Group actor with just your PCs, then pick it here.`;
    }
    return `Without a party actor, party-wide upgrades apply to all ${loose} player-owned characters, `
         + `which usually includes actors you did not mean.`;
  }

  /* ---------- live preview ---------- */



  _onRender(context, options) {
    super._onRender(context, options);

    // An item is referenced by uuid, an actor by id — that is what a token resolves to.
    for (const [zone, accept, field] of [["currency-item", "Item", "currencyItem"],
                                         ["host-actor", "Actor", "hostActor"]]) {
      wireDropZone(this.element.querySelector(`[data-drop="${zone}"]`), {
        accept: [accept],
        onDrop: (doc, uuid) => {
          this.#syncAll();
          this.#draft[field] = accept === "Actor" ? doc.id : uuid;
          this.render();
        }
      });
    }

    for (const el of this.element.querySelectorAll("input, select")) {
      const event = (el.type === "checkbox" || el.tagName === "SELECT") ? "change" : "input";
      el.addEventListener(event, () => {
        this.#syncField(el);
        this.#patchPreview();
      });
    }
  }

  #syncField(el) {
    const name = el.name;
    if (!name) return;
    if (BOOL_FIELDS.includes(name)) this.#draft[name] = el.checked;
    else this.#draft[name] = el.value;
  }

  /** Read the whole form into the draft (used before save). */
  #syncAll() {
    for (const el of this.element.querySelectorAll("input, select")) this.#syncField(el);
  }

  /**
   * Update the preview without re-rendering, so typing is never interrupted.
   * Every mutable spot in settings.hbs carries a data-bind attribute.
   */
  #patchPreview() {
    const root = this.element.querySelector("[data-preview]");
    if (!root) return;
    const d = this.#draft;

    root.className = `upgrades upg-theme-${d.theme} upg-preview`;

    const setText = (bind, text) => {
      for (const el of root.querySelectorAll(`[data-bind="${bind}"]`)) el.textContent = text;
    };
    setText("windowTitle", d.windowTitle || "Upgrades");
    setText("hostName", d.hostName || "");
    setText("greeting", d.greeting ? `“${d.greeting}”` : "");
    setText("currencyName", d.currencyName || "Points");
    setText("actionVerb", d.actionVerb || "Request");

    const iconHtml = isImagePath(d.currencyIcon)
      ? `<img class="upg-currency-img" src="${foundry.utils.escapeHTML(d.currencyIcon)}" alt="">`
      : `<i class="${foundry.utils.escapeHTML(d.currencyIcon || "fa-solid fa-gem")}"></i>`;
    for (const el of root.querySelectorAll('[data-bind="currency-icon"]')) el.innerHTML = iconHtml;

    const portrait = root.querySelector('[data-bind="host-portrait"]');
    if (portrait) {
      if (!d.hostImg) portrait.innerHTML = iconHtml;
      else if (isImagePath(d.hostImg)) {
        portrait.innerHTML = `<img src="${foundry.utils.escapeHTML(d.hostImg)}" alt="">`;
      } else {
        portrait.innerHTML = `<i class="${foundry.utils.escapeHTML(d.hostImg)}"></i>`;
      }
    }

    for (const el of this.element.querySelectorAll("[data-action='pickHostIcon']")) {
      el.classList.toggle("active", el.dataset.icon === d.hostImg);
    }

    // keep the swatch and icon selections in step with the draft
    for (const el of this.element.querySelectorAll("[data-theme]")) {
      el.classList.toggle("active", el.dataset.theme === d.theme);
    }
    for (const el of this.element.querySelectorAll("[data-icon]")) {
      el.classList.toggle("active", el.dataset.icon === d.currencyIcon);
    }
  }

  /* ---------- actions ---------- */

  static #onPickTheme(_event, target) {
    this.#syncAll();
    this.#draft.theme = target.dataset.theme;
    this.#patchPreview();
  }

  static #onPickIcon(_event, target) {
    this.#syncAll();
    this.#draft.currencyIcon = target.dataset.icon;
    const field = this.element.querySelector('[name="currencyIcon"]');
    if (field) field.value = this.#draft.currencyIcon;
    this.#patchPreview();
  }

  static async #onPickIconImage() {
    this.#syncAll();
    await this.#browse("currencyIcon");
  }

  static #onPickHostIcon(_event, target) {
    this.#syncAll();
    this.#draft.hostImg = target.dataset.icon;
    const field = this.element.querySelector('[name="hostImg"]');
    if (field) field.value = this.#draft.hostImg;
    this.#patchPreview();
  }

  static async #onPickHostImg() {
    this.#syncAll();
    await this.#browse("hostImg");
  }

  static #onClearHostImg() {
    this.#syncAll();
    this.#draft.hostImg = "";
    const field = this.element.querySelector('[name="hostImg"]');
    if (field) field.value = "";
    this.#patchPreview();
  }

  async #browse(field) {
    const FP = foundry.applications.apps.FilePicker?.implementation ?? FilePicker;
    new FP({
      type: "image",
      current: this.#draft[field],
      callback: path => {
        this.#draft[field] = path;
        const input = this.element.querySelector(`[name="${field}"]`);
        if (input) input.value = path;
        this.#patchPreview();
      }
    }).browse();
  }

  /**
   * Resources are edited through a small dialog rather than inline, because the list has to stay
   * legible when a GM defines six of them.
   */
  static async #currencyDialog(existing) {
    const { DialogV2 } = foundry.applications.api;
    const c = existing ?? { name: "", icon: "fa-solid fa-circle" };
    return DialogV2.prompt({
      window: { title: existing ? `Edit ${c.name}` : "New resource" },
      content: `
        <div class="form-group"><label>Name</label>
          <input type="text" name="name" value="${foundry.utils.escapeHTML(c.name)}" placeholder="Sprigs" autofocus></div>
        <div class="form-group">
          <label>Icon</label>
          <span class="upg-icon-preview" data-icon-preview></span>
        </div>
        ${iconPickerHtml(ICON_GROUPS, c.icon)}
        <div class="upg-file upg-icon-custom">
          <input type="text" name="icon" value="${foundry.utils.escapeHTML(c.icon ?? "")}" placeholder="fa-solid fa-seedling">
          <button type="button" data-browse-icon title="Use your own image"><i class="fa-solid fa-folder-open"></i></button>
        </div>
        <p class="upg-hint">Pick one above, or browse for your own image.</p>`,
      render: (_event, dialog) => wireIconPicker(dialog.element ?? dialog, "icon"),
      ok: {
        label: existing ? "Save" : "Create",
        callback: (_e, button) => ({
          name: button.form.elements.name.value.trim(),
          icon: button.form.elements.icon.value.trim() || "fa-solid fa-circle"
        })
      }
    }).catch(() => null);
  }

  static async #onAddCurrency() {
    this.#syncAll();
    const result = await SettingsApp.#currencyDialog(null);
    if (!result?.name) return;
    await upsertCurrency(result);
    this.render();
  }

  static async #onEditCurrency(_event, target) {
    this.#syncAll();
    const current = getCurrencies().find(c => c.id === target.dataset.id);
    const result = await SettingsApp.#currencyDialog(current);
    if (!result?.name) return;
    await upsertCurrency({ id: current.id, ...result });
    this.render();
  }

  static async #onRemoveCurrency(_event, target) {
    this.#syncAll();
    const { DialogV2 } = foundry.applications.api;
    const currencies = getCurrencies();
    if (currencies.length <= 1) {
      return ui.notifications.warn("Upgrades: there has to be at least one resource.");
    }
    const current = currencies.find(c => c.id === target.dataset.id);
    const ok = await DialogV2.confirm({
      window: { title: "Remove resource" },
      content: `<p>Remove <strong>${foundry.utils.escapeHTML(current.name)}</strong>?</p>
        <p>Its balance is discarded, and any upgrade priced in it stops costing it.</p>`
    });
    if (!ok) return;
    await deleteCurrency(current.id);
    this.render();
  }

  static async #onGrantMerchantAccess() {
    this.#syncAll();
    const ok = await grantMerchantAccess();
    if (ok) ui.notifications.info("Upgrades: players can now interact with the merchant's token.");
    this.render();
  }

  static #onClearHostActor() {
    this.#syncAll();
    this.#draft.hostActor = "";
    const field = this.element.querySelector('[name="hostActor"]');
    if (field) field.value = "";
    this.render();
  }

  static #onClearCurrencyItem() {
    this.#syncAll();
    this.#draft.currencyItem = "";
    const field = this.element.querySelector('[name="currencyItem"]');
    if (field) field.value = "";
    this.render();
  }

  static #onCancel() {
    this.close();
  }

  /* ---------- save ---------- */

  static async #onSubmit(_event, _form, _formData) {
    this.#syncAll();
    const d = this.#draft;

    const writes = [
      [SETTINGS.THEME, d.theme],
      [SETTINGS.WINDOW_TITLE, d.windowTitle],
      [SETTINGS.HOST_ACTOR, d.hostActor],
      [SETTINGS.HOST_NAME, d.hostName],
      [SETTINGS.HOST_IMG, d.hostImg],
      [SETTINGS.GREETING, d.greeting],
      [SETTINGS.CURRENCY_NAME, d.currencyName],
      [SETTINGS.CURRENCY_ICON, d.currencyIcon],
      [SETTINGS.CURRENCY_ITEM, d.currencyItem],
      [SETTINGS.AUTO_DEPOSIT, !!d.autoDeposit],
      [SETTINGS.ACTION_VERB, d.actionVerb],
      [SETTINGS.PARTY_ACTOR, d.partyActor],
      [SETTINGS.REQUIRE_APPROVAL, !!d.requireApproval],
      [SETTINGS.PLAYERS_CAN_OPEN, !!d.playersCanOpen]
    ];

    // Only write what actually changed — every set() fires an onChange and a socket refresh.
    let changed = 0;
    for (const [key, value] of writes) {
      if (game.settings.get(MODULE_ID, key) === value) continue;
      await game.settings.set(MODULE_ID, key, value);
      changed++;
    }

    ui.notifications.info(changed ? `Upgrades: ${changed} setting(s) saved.` : "Upgrades: nothing to save.");
    refreshOpenApps();
    emit({ type: "refresh" });
    this.close();
  }

  async _onClose(options) {
    await super._onClose(options);
    if (SettingsApp.instance === this) SettingsApp.instance = null;
  }
}
