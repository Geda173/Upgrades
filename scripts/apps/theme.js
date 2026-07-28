/**
 * Shared window helpers.
 *
 * Theming: every window carries `upg-theme-<id>` on its root element, and the stylesheet
 * defines each theme purely as a set of custom-property values. Structural CSS is shared,
 * so adding a theme means adding one colour block — never a second copy of the layout.
 *
 * Fitting: our default sizes assume a roomy screen. On a laptop they can put the footer —
 * and therefore the Save button — below the bottom of the display.
 */
import { THEMES, getTheme } from "../data.js";

const THEME_CLASSES = THEMES.map(t => `upg-theme-${t.id}`);

/** Call from an ApplicationV2's _onRender. */
export function applyTheme(app) {
  const root = app.element;
  if (!root) return;
  root.classList.remove(...THEME_CLASSES);
  root.classList.add(`upg-theme-${getTheme()}`);
}

/**
 * Shrink a window to fit the current viewport, once, on first render.
 * Only ever shrinks: a GM who resizes a window larger is not overruled on later renders.
 */
export function fitToViewport(app, margin = 60) {
  const maxWidth = Math.max(320, window.innerWidth - margin);
  const maxHeight = Math.max(320, window.innerHeight - margin);
  const { width, height } = app.position ?? {};
  const next = {};
  if (typeof width === "number" && width > maxWidth) next.width = maxWidth;
  if (typeof height === "number" && height > maxHeight) next.height = maxHeight;
  if (Object.keys(next).length) app.setPosition(next);
}

/**
 * Remember where the user was before a re-render, and put them back afterwards.
 *
 * These windows rebuild themselves whenever a choice reshapes the form, which otherwise throws
 * the scroll position back to the top and drops focus — unusable once the form is longer than
 * the window. Foundry does not restore either for us.
 */
export function captureViewState(app, scrollSelector) {
  const scroller = app.element?.querySelector(scrollSelector);
  const active = document.activeElement;
  const inApp = active && app.element?.contains(active);
  return {
    scrollTop: scroller?.scrollTop ?? 0,
    name: inApp ? (active.name || null) : null,
    row: inApp ? (active.closest?.(".upg-row")?.dataset?.index ?? null) : null,
    caret: inApp && typeof active.selectionStart === "number" ? active.selectionStart : null
  };
}

export function restoreViewState(app, scrollSelector, state) {
  if (!state || !app.element) return;
  const scroller = app.element.querySelector(scrollSelector);
  if (scroller) scroller.scrollTop = state.scrollTop;
  if (!state.name) return;

  const scope = state.row !== null && state.row !== undefined
    ? app.element.querySelector(`.upg-row[data-index="${state.row}"]`) ?? app.element
    : app.element;
  const field = scope.querySelector(`[name="${state.name}"]`);
  if (!field) return;
  field.focus();
  // Putting the caret back matters most in the value fields, where a re-render lands mid-typing.
  if (state.caret !== null && typeof field.setSelectionRange === "function") {
    try { field.setSelectionRange(state.caret, state.caret); } catch { /* not a text field */ }
  }
}
