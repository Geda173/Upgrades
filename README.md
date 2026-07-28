# Pearl Upgrades

A FoundryVTT (v13) module for running a **party upgrade shop**: players collect a shared resource (Pearls of Power by default) and spend it at an NPC merchant on GM-authored upgrades — each with its own art, flavor text, and rich tooltip. Optionally, an upgrade can carry a PF2e Effect that is automatically applied to every party member on purchase.

## Features (v0.1 — Phase 1 + early Phase 2)

- **Player shop window** — art-forward card grid with availability states: available, too costly, owned, pending, and hidden "???" teasers. Click a card for its full description.
- **Shared pearl pool** — one party-wide balance, GM-adjustable with a reason log.
- **Request → approve flow** — players petition the merchant; the GM gets an approve/decline dialog; approval deducts pearls, marks the upgrade owned, and posts an announcement chat card. (Approval requirement is a setting.)
- **GM console** — create/edit/hide/delete upgrades, adjust pearls, refund purchases, view history.
- **Effects (PF2e)** — give an upgrade the UUID of an Effect item and purchasing it creates that effect on every party member (PF2e Party actor members, or all player-owned characters). Includes refund cleanup and a re-sync button for late joiners.
- **Show to players** — GM button that pops the shop open on every player's screen for the big NPC moment.

## Install (development)

Clone or copy this folder into your Foundry data directory as `Data/modules/pearl-upgrades`, then enable it in your world. Open the shop via the gem button in the token scene controls, or with a macro:

```js
game.modules.get("pearl-upgrades").api.openShop();   // player shop
game.modules.get("pearl-upgrades").api.openEditor(); // GM console
```

## Notes

- All world mutations run on the GM's client (players can't modify world data), so **purchases require a GM to be logged in**.
- Art images are referenced by path into your Foundry data folder — upload via any file picker and paste the path.
- System-agnostic by design; the PF2e-specific behavior lives in `scripts/systems/`.

## Roadmap

Drag-and-drop effect slot, starter effect compendium, categories/tiers with prerequisites, 5e ActiveEffect adapter, purchase sound/animation, catalog export/import.
