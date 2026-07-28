/**
 * The economy: what resources exist, what is in the pot, what things cost, and the ledger.
 *
 * Depends on the catalogue only to keep it honest — removing a resource has to strip it from the
 * upgrades priced in it. The catalogue does not depend on this, and must not start to.
 */
import { MODULE_ID, SETTINGS } from "./settings.js";
import { getUpgrades, setUpgrades } from "./catalog.js";

/**
 * The resources upgrades are bought with.
 *
 * A world that never defines any still gets one, synthesised from the single-currency settings,
 * so nothing needs configuring to keep working and the UI stays exactly as simple as before.
 */
export function getCurrencies() {
  const stored = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.CURRENCIES)) ?? [];
  if (stored.length) {
    return stored
      .map(c => ({ item: "", sort: 0, ...c }))
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  }
  return [{
    id: DEFAULT_CURRENCY,
    name: game.settings.get(MODULE_ID, SETTINGS.CURRENCY_NAME) || "Points",
    icon: game.settings.get(MODULE_ID, SETTINGS.CURRENCY_ICON) || "fa-solid fa-gem",
    item: game.settings.get(MODULE_ID, SETTINGS.CURRENCY_ITEM) || "",
    sort: 0
  }];
}

export const DEFAULT_CURRENCY = "default";

/**
 * Strict on purpose: falling back to the first resource would make a cost naming a deleted one
 * display as — and appear to be payable in — a resource it was never priced in.
 */
export function getCurrency(id) {
  return getCurrencies().find(c => c.id === id) ?? null;
}

/** The resource used when nothing specifies one. */
export function primaryCurrency() {
  return getCurrencies()[0] ?? null;
}

/** True once the GM has gone beyond a single resource; the UI leans on this to stay quiet. */
export function hasMultipleCurrencies() {
  return getCurrencies().length > 1;
}

export async function setCurrencies(currencies) {
  return game.settings.set(MODULE_ID, SETTINGS.CURRENCIES, currencies);
}

export async function upsertCurrency(data) {
  // Writing the list for the first time must capture the synthesised one, or the existing
  // balance would be stranded against a currency that no longer appears.
  const currencies = getCurrencies();
  const idx = currencies.findIndex(c => c.id === data.id);
  if (idx >= 0) currencies[idx] = { ...currencies[idx], ...data };
  else currencies.push({
    id: data.id ?? foundry.utils.randomID(),
    name: "New resource", icon: "fa-solid fa-circle", item: "", sort: currencies.length,
    ...data
  });
  return setCurrencies(currencies);
}

/** Removing a resource leaves any upgrade priced in it costing nothing in that resource. */
export async function deleteCurrency(id) {
  const remaining = getCurrencies().filter(c => c.id !== id);
  if (!remaining.length) return;                       // never leave a world with none
  await setCurrencies(remaining);
  const upgrades = getUpgrades();
  let touched = false;
  for (const u of upgrades) {
    const kept = (u.costs ?? []).filter(c => c.currencyId !== id);
    if (kept.length !== (u.costs ?? []).length) { u.costs = kept; touched = true; }
  }
  if (touched) await setUpgrades(upgrades);
}

/* ---------- Vocabulary helpers ---------- */

/**
 * What an upgrade costs, as a list of {currencyId, amount}.
 * Upgrades priced before multiple resources existed carry a bare `cost` number.
 */
export function getCosts(upgrade) {
  const listed = (upgrade?.costs ?? []).filter(c => c && c.amount > 0);
  if (listed.length) return listed;
  const amount = Number(upgrade?.cost ?? 0);
  if (!amount) return [];
  return [{ currencyId: getCurrencies()[0]?.id ?? DEFAULT_CURRENCY, amount }];
}

/** Costs paired with their currency, ready to display. */
export function describeCosts(upgrade) {
  return getCosts(upgrade).map(c => ({ ...c, currency: getCurrency(c.currencyId) }))
    .filter(c => c.currency);
}

export function canAfford(upgrade) {
  const balances = getBalances();
  return getCosts(upgrade).every(c => (balances[c.currencyId] ?? 0) >= c.amount);
}

/**
 * Every balance, keyed by currency id.
 * Worlds from before multiple resources stored a single number; it becomes the first currency's.
 */
export function getBalances() {
  const stored = game.settings.get(MODULE_ID, SETTINGS.BALANCES);
  const balances = (stored && typeof stored === "object") ? { ...stored } : {};
  if (!Object.keys(balances).length) {
    const legacy = game.settings.get(MODULE_ID, SETTINGS.BALANCE) ?? 0;
    balances[getCurrencies()[0]?.id ?? DEFAULT_CURRENCY] = legacy;
  }
  return balances;
}

export function getBalance(currencyId = null) {
  const id = currencyId ?? getCurrencies()[0]?.id ?? DEFAULT_CURRENCY;
  return getBalances()[id] ?? 0;
}

export async function adjustBalance(currencyId, delta, reason = "") {
  // Called as adjustBalance(delta, reason) before multiple currencies existed.
  if (typeof currencyId === "number") {
    [currencyId, delta, reason] = [null, currencyId, delta ?? ""];
  }
  const id = currencyId ?? getCurrencies()[0]?.id ?? DEFAULT_CURRENCY;
  const balances = getBalances();
  const before = balances[id] ?? 0;
  const after = Math.max(0, before + delta);
  balances[id] = after;
  await game.settings.set(MODULE_ID, SETTINGS.BALANCES, balances);
  await addHistory({ type: "adjust", currencyId: id, delta, before, after, reason });
  return after;
}

/* ---------- History ---------- */

export async function addHistory(entry) {
  const history = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.HISTORY)) ?? [];
  history.push({ ts: Date.now(), user: game.user?.name ?? "GM", ...entry });
  return game.settings.set(MODULE_ID, SETTINGS.HISTORY, history);
}

export function getHistory() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.HISTORY)) ?? [];
}
