/**
 * "Which one?" — asks the buyer to nominate a document as part of a purchase.
 *
 * Deliberately runs on the buyer's own client, before the request is sent to the GM. Prompting
 * from the GM-side pipeline would need a request/response round trip over the socket; asking
 * first and sending the answer along with the request needs none.
 */
const { DialogV2 } = foundry.applications.api;

/**
 * @returns {Promise<{uuid: string, name: string, img: string}|null>}
 *   null when the buyer cancels, which aborts the purchase before anything is spent.
 */
export async function promptForDocument({ label, hint } = {}) {
  let picked = null;

  const content = `
    <p class="upg-hint">${foundry.utils.escapeHTML(hint ?? "")}</p>
    <div class="upg-drop" data-drop="choice">
      <i class="fa-solid fa-hand-pointer"></i>
      <div class="upg-drop-text">
        <strong>Drag it here</strong>
        <span>from your character sheet</span>
      </div>
    </div>`;

  const result = await DialogV2.wait({
    window: { title: label || "Choose" },
    classes: ["upgrades"],
    content,
    buttons: [
      { action: "ok", label: "Confirm", default: true, callback: () => picked },
      { action: "cancel", label: "Cancel", callback: () => null }
    ],
    render: (_event, dialog) => {
      const root = dialog.element ?? dialog;
      const zone = root.querySelector('[data-drop="choice"]');
      const ok = root.querySelector('[data-action="ok"]');
      if (ok) ok.disabled = true;   // nothing to confirm until something is dropped

      zone?.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("hover"); });
      zone?.addEventListener("dragleave", () => zone.classList.remove("hover"));
      zone?.addEventListener("drop", async event => {
        event.preventDefault();
        zone.classList.remove("hover");

        let data;
        try { data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event); }
        catch { data = null; }
        const doc = data?.uuid ? await fromUuid(data.uuid).catch(() => null) : null;
        if (!doc) return ui.notifications.warn("Upgrades: that drop had nothing in it.");

        picked = { uuid: data.uuid, name: doc.name, img: doc.img ?? "" };
        zone.classList.add("filled");
        zone.innerHTML = `
          ${doc.img ? `<img src="${foundry.utils.escapeHTML(doc.img)}" alt="">` : ""}
          <div class="upg-drop-text">
            <strong>${foundry.utils.escapeHTML(doc.name)}</strong>
            <span>${foundry.utils.escapeHTML(doc.type ?? doc.documentName ?? "")}</span>
          </div>`;
        if (ok) ok.disabled = false;
      });
    },
    rejectClose: false
  }).catch(() => null);

  return result ?? null;
}
