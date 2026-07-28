/**
 * Purchase pipeline: player request → GM approval → commit (deduct, mark, announce).
 * Everything in this file runs on the GM client only (dispatched via sockets.js).
 */
import { MODULE_ID, SETTINGS, getUpgrade, getBalance, adjustBalance, upsertUpgrade, addHistory, getVocabulary } from "./data.js";
import { emit, refreshOpenApps } from "./sockets.js";
import { applyUpgradeEffect, describeTarget } from "./systems/adapter.js";

/** Entry point for a player's purchase request (or a GM's direct purchase). */
export async function handlePurchaseRequest({ upgradeId, userId }) {
  const upgrade = getUpgrade(upgradeId);
  const user = game.users.get(userId);
  const vocab = getVocabulary();
  if (!upgrade || upgrade.purchased || upgrade.hidden) return notifyUser(userId, "That upgrade is no longer available.");

  const balance = getBalance();
  if (balance < upgrade.cost) {
    return notifyUser(userId, `Not enough ${vocab.currencyName} for that (${balance}/${upgrade.cost}).`);
  }

  const requireApproval = game.settings.get(MODULE_ID, SETTINGS.REQUIRE_APPROVAL);
  const isGMDirect = user?.isGM;

  if (requireApproval && !isGMDirect) {
    const approved = await foundry.applications.api.DialogV2.confirm({
      window: { title: `${vocab.windowTitle} — Request` },
      content: `<p><strong>${foundry.utils.escapeHTML(user?.name ?? "A player")}</strong> requests
        <strong>${foundry.utils.escapeHTML(upgrade.name)}</strong>
        for <strong>${upgrade.cost}</strong> ${foundry.utils.escapeHTML(vocab.currencyName)}
        (pool: ${balance}).</p>
        <p>Applies to: <strong>${foundry.utils.escapeHTML(describeTarget(upgrade))}</strong>.</p>
        <p>Approve?</p>`,
      modal: false
    });
    if (!approved) {
      await notifyUser(userId, `Your request for “${upgrade.name}” was declined.`);
      return;
    }
  }

  await commitPurchase(upgrade, user);
}

async function commitPurchase(upgrade, user) {
  const vocab = getVocabulary();
  const after = await adjustBalance(-upgrade.cost, `Acquired: ${upgrade.name}`);

  await upsertUpgrade({
    id: upgrade.id,
    purchased: true,
    purchasedBy: user?.name ?? "GM",
    purchasedAt: Date.now()
  });

  await addHistory({ type: "purchase", upgradeId: upgrade.id, name: upgrade.name, cost: upgrade.cost, by: user?.name ?? "GM" });

  // Apply the mechanical payload, if the upgrade has one (cosmetic upgrades no-op silently).
  let effectNote = "";
  try {
    const applied = await applyUpgradeEffect(upgrade);
    if (applied?.count) {
      effectNote = `<p class="upg-effect-note">✦ Effect applied to ${foundry.utils.escapeHTML(applied.names.join(", "))}.</p>`;
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to apply effect`, err);
    ui.notifications.warn("Upgrades: acquired, but the effect could not be applied automatically.");
  }

  await ChatMessage.create({
    content: `
      <div class="upgrades-chat-card">
        ${upgrade.img ? `<img src="${foundry.utils.escapeHTML(upgrade.img)}" alt="">` : ""}
        <h3>${foundry.utils.escapeHTML(upgrade.name)}</h3>
        <p class="upg-flavor"><em>${foundry.utils.escapeHTML(upgrade.flavor ?? "")}</em></p>
        <p>Acquired for <strong>${upgrade.cost}</strong> ${foundry.utils.escapeHTML(vocab.currencyName)}.
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
  ui.notifications.info("Your request has been sent…");
}
