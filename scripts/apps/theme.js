/**
 * Theming: every window carries `upg-theme-<id>` on its root element, and the stylesheet
 * defines each theme purely as a set of custom-property values. Structural CSS is shared,
 * so adding a theme means adding one colour block — never a second copy of the layout.
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
