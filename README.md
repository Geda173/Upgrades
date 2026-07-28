# Upgrades

A FoundryVTT module for running an **upgrade board**: the party banks a shared resource and spends it on
GM-authored upgrades — each with its own art, flavor text, rich description, and optional mechanical effect.

Nothing in the player-facing UI is hard-coded to one fiction. The currency, the host, the window title,
the action verb and the colour theme are all settings, so the same module can be a pearl merchant in one
campaign and a memorial garden in the next.

## Features

- **Player window** — art-forward card grid with availability states: available, too costly, owned, and
  hidden "???" teasers. Click a card for its full description.
- **Shared pool** — one party-wide balance, GM-adjustable with a reason log.
- **Request → approve flow** — players petition; the GM gets an approve/decline dialog; approval deducts the
  cost, marks the upgrade owned, and posts an announcement chat card. (Approval requirement is a setting.)
- **Party-wide or single-character** — each upgrade targets either every member of the party actor, or one
  named character. A memorial garden where only one PC benefits is a first-class case.
- **Effect builder** — pick a bonus from a plain-language list ("All weapon damage", "Spell save DC",
  "Armor Class") and type a value. No UUIDs, no data paths. `1d8[cold]` on *All weapon damage* is exactly
  "every weapon swing deals an extra 1d8 cold".
- **Drag & drop linking** — or drag any existing Effect or Item from a sheet, the sidebar, or a compendium
  onto the upgrade to grant that instead.
- **Clean removal** — everything the module grants is flagged with the upgrade id. Refunding, deleting, or
  editing an upgrade removes or rebuilds what it put on the sheets. Nothing is orphaned.
- **Themes** — sixteen palettes. *Fantasy:* Abyss, Grove, Ember, Arcane, Frost, Ossuary, Bloodmoon, Golden
  Hall, Mycelium, Tempest, Parchment. *Sci-fi:* Holo, Neon, Starship, Rust, Phosphor. A theme is a palette
  swap, not a layout fork — Parchment and Starship are light, the rest dark.
- **Show to players** — GM button that pops the window open on every player's screen for the big NPC moment.

## Install

Manifest URL: `https://github.com/Geda173/Upgrades/releases/latest/download/module.json`

For development, clone into your Foundry data directory as `Data/modules/upgrades` and enable it in your world.
Open it via the gem button in the token scene controls, or with a macro:

```js
game.modules.get("upgrades").api.openShop();   // player window
game.modules.get("upgrades").api.openEditor(); // GM console
```

## Setup checklist

1. **Party actor** (module settings) — point this at your dnd5e Group / PF2e Party actor. Without it the
   module falls back to *every player-owned character*, which in a mature world also means loot holders,
   summons and wildshape copies.
2. **Vocabulary** — set the currency name, icon, window title, action verb, host name and greeting.
3. **Theme** — pick one that matches the fiction.
4. **Grant upgrades as** — "Feature on the sheet" (visible under Features, recommended) or a bare Active Effect.

## How effects persist

An upgrade's payload is one of three modes:

| Mode | What it does |
| --- | --- |
| Cosmetic | Nothing mechanical — just the card, the art and the chat announcement. |
| Build a bonus | Preset rows are assembled into ActiveEffect changes at purchase time. |
| Link | Clones an existing ActiveEffect or Item you dragged in. |

On purchase the payload is embedded on each target actor and flagged `flags.upgrades.upgradeId`.
With the default "Feature" setting on dnd5e, an ActiveEffect payload is wrapped in a `feat` item named after
the upgrade, so players can see what they earned instead of hunting the Effects tab. Refund, delete, or
re-target the upgrade and that flag is how the module finds and removes exactly what it created.

**Re-sync effects** (GM console) re-creates anything missing on the current targets — for late joiners, roster
changes, or an effect someone deleted off a sheet by hand.

## Notes

- All world mutations run on the GM's client, so **purchases require a GM to be logged in**.
- The bonus presets are dnd5e data paths. Other systems get the custom-path row and the drag-and-drop link
  mode; the cosmetic layer works everywhere.
- Art images are referenced by path into your Foundry data folder — upload via any file picker, or use the
  browse button in the upgrade editor.

## Roadmap

Starter effect compendium, categories/tiers with prerequisites, per-character purchasing (each PC buys from a
shared catalog independently), purchase sound/animation, catalog export/import, PF2e rule-element support.
