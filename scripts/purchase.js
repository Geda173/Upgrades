/**
 * Purchase pipeline: player request → GM approval → commit (deduct, mark, announce).
 * Everything in this file runs on the GM client only (dispatched via sockets.js).
 */
import {
  MODULE_ID, SETTINGS, TARGET, getUpgrade, getBalance, adjustBalance,
  addHistory, getVocabulary, isAvailable, addPurchase, unmetRequirements,
  getCosts, describeCosts, canAfford
} from "./data.js";
import { emit, refreshOpenApps } from "./sockets.js";
import { applyUpgradeEffect, describeTarget, getPartyActors } from "./systems/adapter.js";

/** Entry point for a player's purchase request (or a GM's direct purchase). */
export async function handlePurchaseRequest({ upgradeId, userId, choice = null }) {
  const upgrade = getUpgrade(upgradeId);
  const user = game.users.get(userId);
  const vocab = getVocabulary();
  if (!upgrade || upgrade.hidden || !isAvailable(upgrade)) {
    return notifyUser(userId, "That upgrade is no longer available.");
  }

  // Checked here as well as in the UI: the socket request is the real entry point.
  const unmet = unmetRequirements(upgrade);
  if (unmet.length) {
    return notifyUser(userId, `“${upgrade.name}” needs ${unmet.map(u => u.name).join(" and ")} first.`);
  }

  if (!canAfford(upgrade)) {
    const short = describeCosts(upgrade)
      .filter(c => getBalance(c.currencyId) < c.amount)
      .map(c => `${getBalance(c.currencyId)}/${c.amount} ${c.currency.name}`)
      .join(", ");
    return notifyUser(userId, `Not enough for that (${short}).`);
  }

  const requireApproval = game.settings.get(MODULE_ID, SETTINGS.REQUIRE_APPROVAL);
  const isGMDirect = user?.isGM;

  if (requireApproval && !isGMDirect) {
    const approved = await foundry.applications.api.DialogV2.confirm({
      window: { title: `${vocab.windowTitle} — Request` },
      content: `<p><strong>${foundry.utils.escapeHTML(user?.name ?? "A player")}</strong> requests
        <strong>${foundry.utils.escapeHTML(upgrade.name)}</strong>
        for <strong>${foundry.utils.escapeHTML(priceLabel(upgrade))}</strong>.</p>
        <p>Applies to: <strong>${foundry.utils.escapeHTML(describeTarget(upgrade))}</strong>.</p>
        <p>Approve?</p>`,
      modal: false
    });
    if (!approved) {
      await notifyUser(userId, `Your request for “${upgrade.name}” was declined.`);
      return;
    }
  }

  // Resolve who it lands on before spending anything, so a failure here costs nothing.
  let buyerActor = null;
  if (upgrade.target === TARGET.BUYER) {
    buyerActor = await resolveBuyer(user);
    if (!buyerActor) {
      return notifyUser(userId, user?.isGM
        ? "No character chosen — nothing was purchased."
        : "You have no assigned character, so this cannot be granted. Ask your GM.");
    }
  }

  await commitPurchase(upgrade, user, buyerActor, choice);
}

/**
 * Which character is buying.
 *
 * A player's assigned character is the obvious answer. A GM usually has none, so rather than
 * failing we ask — that is also how a GM buys something on a player's behalf.
 */
async function resolveBuyer(user) {
  if (user?.character) return user.character;
  if (!user?.isGM) return null;

  const candidates = getPartyActors();
  if (!candidates.length) {
    ui.notifications.warn("Upgrades: no party members to grant this to — set a Party actor in Setup.");
    return null;
  }
  const options = candidates
    .map(a => `<option value="${a.id}">${foundry.utils.escapeHTML(a.name)}</option>`).join("");
  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Who is this for?" },
    content: `<div class="form-group"><label>Character</label>
      <select name="actorId" autofocus>${options}</select></div>`,
    ok: { label: "Grant", callback: (_e, button) => button.form.elements.actorId.value }
  }).catch(() => null);
  return chosen ? game.actors.get(chosen) : null;
}

/** "3 Sprigs and 1 Pearl of Power" */
function priceLabel(upgrade) {
  const parts = describeCosts(upgrade).map(c => `${c.amount} ${c.currency.name}`);
  if (parts.length <= 1) return parts[0] ?? "nothing";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

async function commitPurchase(upgrade, user, buyerActor = null, choice = null) {
  for (const cost of getCosts(upgrade)) {
    await adjustBalance(cost.currencyId, -cost.amount, `Acquired: ${upgrade.name}`);
  }

  const purchase = await addPurchase(upgrade.id, {
    actorId: buyerActor?.id ?? (upgrade.target === TARGET.ACTOR ? upgrade.targetActorId : null),
    actorName: buyerActor?.name ?? null,
    by: user?.name ?? "GM",
    choice
  });

  await addHistory({
    type: "purchase", upgradeId: upgrade.id, name: upgrade.name, price: priceLabel(upgrade),
    by: user?.name ?? "GM", forActor: buyerActor?.name ?? null
  });

  // Apply the mechanical payload, if the upgrade has one (cosmetic upgrades no-op silently).
  let effectNote = "";
  try {
    const applied = await applyUpgradeEffect(upgrade, { buyerActor, purchaseId: purchase?.id, choice });
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
        <h3>${foundry.utils.escapeHTML(upgrade.name)}${choice ? ` (${foundry.utils.escapeHTML(choice.name)})` : ""}</h3>
        <p class="upg-flavor"><em>${foundry.utils.escapeHTML(upgrade.flavor ?? "")}</em></p>
        <p>Acquired for <strong>${foundry.utils.escapeHTML(priceLabel(upgrade))}</strong>.
           </p>
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
export async function requestPurchase(upgradeId) {
  const upgrade = getUpgrade(upgradeId);

  // Asked here, on the buyer's own client, so the answer can travel with the request instead of
  // the GM having to ask back over the socket.
  let choice = null;
  if (upgrade?.choice?.enabled) {
    const { promptForDocument } = await import("./apps/choice-dialog.js");
    choice = await promptForDocument({
      label: upgrade.choice.label || "Choose",
      hint: upgrade.choice.hint || ""
    });
    if (!choice) return;   // cancelled: nothing spent, nothing sent
  }

  if (game.user.isGM) return handlePurchaseRequest({ upgradeId, userId: game.user.id, choice });
  emit({ type: "requestPurchase", upgradeId, userId: game.user.id, choice });
  ui.notifications.info("Your request has been sent…");
}
