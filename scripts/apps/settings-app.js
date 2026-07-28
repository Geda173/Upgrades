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
import { MODULE_ID, SETTINGS, THEMES } from "../data.js";
import { emit, refreshOpenApps } from "../sockets.js";
import { applyTheme, fitToViewport } from "./theme.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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

const GRANT_AS_CHOICES = [
  { id: "feature", name: "A feature on the character sheet (recommended)" },
  { id: "effect", name: "An Active Effect only" }
];

/** Checkbox fields need .checked rather than .value when read back off the form. */
const BOOL_FIELDS = ["requireApproval", "playersCanOpen"];

export class SettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
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
      cancel: SettingsApp.#onCancel
    }
  };

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
      hostName: g(SETTINGS.HOST_NAME),
      hostImg: g(SETTINGS.HOST_IMG),
      greeting: g(SETTINGS.GREETING),
      currencyName: g(SETTINGS.CURRENCY_NAME),
      currencyIcon: g(SETTINGS.CURRENCY_ICON),
      actionVerb: g(SETTINGS.ACTION_VERB),
      partyActor: g(SETTINGS.PARTY_ACTOR),
      grantAs: g(SETTINGS.GRANT_AS),
      requireApproval: g(SETTINGS.REQUIRE_APPROVAL),
      playersCanOpen: g(SETTINGS.PLAYERS_CAN_OPEN)
    };
  }

  /* ---------- context ---------- */

  async _prepareContext(_options) {
    const d = this.#draft;
    const isImg = SettingsApp.#iconIsImage(d.currencyIcon);

    return {
      draft: d,
      currencyIconIsImg: isImg,
      // The portrait accepts an image path or an icon class, so the template needs both forms.
      hostIsImage: !!d.hostImg && SettingsApp.#iconIsImage(d.hostImg),
      hostIconClass: (d.hostImg && !SettingsApp.#iconIsImage(d.hostImg))
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

      hostIconGroups: HOST_ICON_GROUPS.map(g => ({
        label: g.label,
        icons: g.icons.map(([cls, name]) => ({ cls, name, isSelected: cls === d.hostImg }))
      })),

      partyActorChoices: SettingsApp.#partyActorChoices(d.partyActor),
      hasPartyActor: !!d.partyActor,
      partyWarning: SettingsApp.#partyWarning(),

      grantAsChoices: GRANT_AS_CHOICES.map(c => ({ ...c, isSelected: c.id === d.grantAs }))
    };
  }

  static #iconIsImage(icon) {
    return /[/\\]/.test(icon ?? "") || /\.(webp|png|jpe?g|gif|svg)$/i.test(icon ?? "");
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

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    fitToViewport(this);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    applyTheme(this);

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

    const iconHtml = SettingsApp.#iconIsImage(d.currencyIcon)
      ? `<img class="upg-currency-img" src="${foundry.utils.escapeHTML(d.currencyIcon)}" alt="">`
      : `<i class="${foundry.utils.escapeHTML(d.currencyIcon || "fa-solid fa-gem")}"></i>`;
    for (const el of root.querySelectorAll('[data-bind="currency-icon"]')) el.innerHTML = iconHtml;

    const portrait = root.querySelector('[data-bind="host-portrait"]');
    if (portrait) {
      if (!d.hostImg) portrait.innerHTML = iconHtml;
      else if (SettingsApp.#iconIsImage(d.hostImg)) {
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
      [SETTINGS.HOST_NAME, d.hostName],
      [SETTINGS.HOST_IMG, d.hostImg],
      [SETTINGS.GREETING, d.greeting],
      [SETTINGS.CURRENCY_NAME, d.currencyName],
      [SETTINGS.CURRENCY_ICON, d.currencyIcon],
      [SETTINGS.ACTION_VERB, d.actionVerb],
      [SETTINGS.PARTY_ACTOR, d.partyActor],
      [SETTINGS.GRANT_AS, d.grantAs],
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
