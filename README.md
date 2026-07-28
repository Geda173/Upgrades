# Upgrades

A FoundryVTT module for running an **upgrade board**: the party banks a shared resource and spends it on
GM-authored upgrades — each with its own art, flavour, description, and optional mechanical effect.

Nothing the players read is hard-coded to one fiction. The currency, the merchant, the window title, the
action verb and the colour theme are all settings, so the same module is a pearl merchant in one campaign,
a memorial garden in the next, and a ship's requisitions console in a third.

Supports **PF2e** and **dnd5e** for mechanical effects. The cosmetic layer works in any system.

---

## What it does

### The board

- **Art-forward card grid** with availability states: available, too costly, owned, locked, and hidden
  "???" teasers. Each card carries a description excerpt so the board can be read without expanding
  anything, and the full text on click.
- **Sections** — group upgrades into GM-defined headings ("Lighthouse", "Runes and Enchanting"),
  reorderable from the console. Deleting a section keeps its upgrades.
- **Upgrade paths** — an upgrade can require others. Until they are owned it stays visible but locked,
  *naming what unlocks it* rather than merely refusing. Cards on a path are ordered so a prerequisite
  always appears before what needs it, and are marked as linked. Cycles cannot be authored.
- **Sixteen themes.** *Fantasy:* Abyss, Grove, Ember, Arcane, Frost, Ossuary, Bloodmoon, Golden Hall,
  Mycelium, Tempest, Parchment. *Sci-fi:* Holo, Neon, Starship, Rust, Phosphor. A theme is a palette
  swap, not a layout fork; Parchment and Starship are light, the rest dark.

### Buying

- **One resource or several** — most tables want one. Define more and every upgrade can be priced in
  any combination of them: an upgrade might cost *3 Sprigs and 1 Pearl of Power*. With a single
  resource the UI is exactly as simple as it was before.
- **Request → approve** — players petition, the GM gets an approve/decline dialog, approval deducts the
  cost and posts an announcement. Approval can be turned off. A GM buying directly is never asked to
  approve themselves.
- **Who it lands on** — each upgrade targets *the whole party*, *whoever buys it* (resolved at purchase
  time from the buyer's character, so the GM needn't know in advance), or *one named character*.
- **Repeat buying** — mark an upgrade repeatable and it can be bought again; the card shows a tally
  instead of an Owned stamp. Each acquisition is tracked separately and refunds one at a time.
- **Ask the buyer a question** — an upgrade can open a prompt on the buyer's own client before payment.
  They drag in a document, and it names the grant: *Temporary Scroll* becomes *Temporary Scroll
  (Fireball)*, linked in the description. Cancelling buys nothing.

### Effects

Three modes per upgrade:

| Mode | What it does |
| --- | --- |
| **Cosmetic** | Nothing mechanical — the card, the art, the announcement. Plenty of upgrades want exactly this. |
| **Build a bonus** | Pick from a plain-language list and type a value. No data paths, no UUIDs. |
| **Link** | Drag any existing Effect or Item in and grant a copy of that. |

The bonus builder is system-aware:

- **PF2e** — produces rule elements. `FlatModifier` for flat bonuses, `DamageDice` for extra dice.
  Selectors are semantic (`attack`, `ac`, `fortitude`, all sixteen skills, spell attack and DC, class DC,
  speeds). Bonus type is a first-class choice, because in PF2e the type is what decides stacking — and
  each option explains when to use it and what it will refuse to stack with.
- **dnd5e** — produces ActiveEffect changes across the usual paths, with the melee/ranged fan-out handled
  for you and a damage-type dropdown so nobody types `[cold]` by hand.

Other systems get the custom-target row plus link mode.

### Where it lives in the world

- **Merchant actor** — bind an actor and double-clicking their token opens the window. Pair that with
  turning off "players can open the window themselves" and visiting them is the only way in.
- **Physical currency** — nominate an Item worth one unit, place stacks into a chest or a body from the
  console, and let the party loot it. They hand it in from the window, or it credits automatically on
  pickup if you prefer.

### Housekeeping

- **Clean removal** — everything granted is flagged with the upgrade *and* purchase id. Refunding,
  deleting, or editing an upgrade removes or rebuilds exactly what it created. Nothing is orphaned.
- **Re-sync** — re-creates anything missing on current targets, for late joiners, roster changes, or an
  effect someone deleted off a sheet by hand.
- **History** — every purchase and adjustment logged with a reason.

---

## Install

Manifest URL:

```
https://github.com/Geda173/Upgrades/releases/latest/download/module.json
```

Paste it into **Add-on Modules → Install Module**, in the *Manifest URL* field below the search results.
The module is not in Foundry's package registry, so searching for it will not find it.

For development, clone into your Foundry data directory as `Data/modules/upgrades`.

Open it via the gem button in the token scene controls, the merchant's token, or a macro:

```js
game.modules.get("upgrades").api.openShop();     // player window
game.modules.get("upgrades").api.openEditor();   // GM console
game.modules.get("upgrades").api.openSettings(); // setup
```

## Setup

Everything is configured **inside the module** — the gem button, then **Setup**. Foundry's own settings
list holds a single button that opens the same window, because a theme cannot be chosen from a dropdown
of names. The setup window carries a live preview that updates as you type.

1. **Party actor** — point this at your PF2e Party or dnd5e Group actor. Without it, party-wide upgrades
   fall back to *every player-owned character*, which in a mature world also means chests, item piles,
   summons and wildshape copies. This is the one setting that will bite you if skipped.
2. **Resources** — one exists by default; add more only if you want a compound economy.
3. **Vocabulary** — currency name, icon, window title, action verb, merchant name, greeting.
4. **Theme** — pick by looking at it, not by name.
5. Optionally: a **merchant actor**, a **currency item**, and whether pickups credit automatically.

## Notes

- All world mutations run on the GM's client, so **purchases require a GM to be logged in**.
- Physical currency is matched by **item name**, so that copies a GM makes by hand still count. Pick a
  name you will not reuse.
- Art is referenced by path into your Foundry data folder — use the browse button in the editor.

## Development

```bash
npm install   # only handlebars, for the template tests
npm test      # or: node tests/run.mjs [name-fragment]
```

No framework and no build step. Each suite is a standalone ES module that prints PASS/FAIL; the runner
spawns them and totals up. Every suite exists because something broke — see `CLAUDE.md` for which bug
each one guards. Tests are excluded from the release zip.

## Roadmap

Starter effect compendium, predicates on PF2e bonuses (conditional "only against undead" style bonuses),
catalogue export/import, purchase sound, localisation.
