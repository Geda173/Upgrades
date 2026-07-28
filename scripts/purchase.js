/**
 * Purchase pipeline: player request → GM approval → commit (deduct, mark, announce).
 * Everything in this file runs on the GM client only (dispatched via sockets.js).
 */
import { MODULE_ID, SETTINGS, getUpgrade, getPearls, adjustPearls, upsertUpgrade, addHistory } from "./data.js";
import { emit, refreshOpenApps } from "./sockets.js";
import { applyUpgradeEffect } from "./systems/adapter.js";

/** Entry point for a player's purchase request (or a GM's direct purchase). */
export async function handlePurchaseRequest({ upgradeId, userId }) {
  const upgrade = getUpgrade(upgradeId);
  const user = game.users.get(userId);
  if (!upgrade || upgrade.purchased || upgrade.hidden) return notifyUser(userId, "That upgrade is no longer available.");

  const pearls = getPearls();
  const currency = game.settings.get(MODULE_ID, SETTINGS.CURRENCY_NAME);
  if (pearls < upgrade.cost) return notifyUser(userId, `The party cannot afford that (${pearls}/${upgrade.cost} ${currency}).`);

  const requireApproval = game.settings.get(MODULE_ID, SETTINGS.REQUIRE_APPROVAL);
  const isGMDirect = user?.isGM;

  if (requireApproval && !isGMDirect) {
    const approved = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Pearl Upgrades — Purchase Request" },
      content: `<p><strong>${user?.name ?? "A player"}</strong> wants to buy
        <strong>${foundry.utils.escapeHTML(upgrade.name)}</strong>
        for <strong>${upgrade.cost}</strong> ${foundry.utils.escapeHTML(currency)}
        (party has ${pearls}).</p><p>Approve the purchase?</p>`,
      modal: false
    });
    if (!approved) {
      await notifyUser(userId, `The merchant declines your offer for "${upgrade.name}".`);
      return;
    }
  }

  await commitPurchase(upgrade, user);
}

async function commitPurchase(upgrade, user) {
  const currency = game.settings.get(MODULE_ID, SETTINGS.CURRENCY_NAME);
  const after = await adjustPearls(-upgrade.cost, `Purchased: ${upgrade.name}`);

  await upsertUpgrade({
    id: upgrade.id,
    purchased: true,
    purchasedBy: user?.name ?? "GM",
    purchasedAt: Date.now()
  });

  await addHistory({ type: "purchase", upgradeId: upgrade.id, name: upgrade.name, cost: upgrade.cost, by: user?.name ?? "GM" });

  // Phase 2: apply mechanical effect to all PCs (no-op if none configured)
  let effectNote = "";
  try {
    const applied = await applyUpgradeEffect(upgrade);
    if (applied?.count) effectNote = `<p class="pu-effect-note">✦ Effect applied to ${applied.count} character(s).</p>`;
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to apply effect`, err);
    ui.notifications.warn("Pearl Upgrades: the upgrade was purchased but its effect could not be applied automatically.");
  }

  await ChatMessage.create({
    content: `
      <div class="pearl-upgrades-chat-card">
        ${upgrade.img ? `<img src="${upgrade.img}" alt="">` : ""}
        <h3>${foundry.utils.escapeHTML(upgrade.name)}</h3>
        <p class="pu-flavor"><em>${foundry.utils.escapeHTML(upgrade.flavor ?? "")}</em></p>
        <p>The party has acquired this upgrade for <strong>${upgrade.cost}</strong> ${foundry.utils.escapeHTML(currency)}.
           Remaining: <strong>${after}</strong>.</p>
        ${effectNote}
      </div>`
  });

  emit({ type: "refresh" });
  refreshOpenApps();
}

async function notifyUser(userId, message) {
  if (userId === game.user.id) ui.notifications.info(message);
  else emit({ type: "notify", userId, message });
}

/** Called from the shop UI on any client. Routes to the GM. */
export function requestPurchase(upgradeId) {
  if (game.user.isGM) return handlePurchaseRequest({ upgradeId, userId: game.user.id });
  emit({ type: "requestPurchase", upgradeId, userId: game.user.id });
  ui.notifications.info("Your offer has been sent to the merchant…");
}
