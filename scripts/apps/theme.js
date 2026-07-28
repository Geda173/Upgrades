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
