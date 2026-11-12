/** Room Figma needs around the plugin window (title bar, margins, toolbar). */
const SCREEN_MARGIN = 160;

/**
 * The tallest the window may be. Figma clips a window that is taller than its
 * own viewport, which hides the bottom of the list, the bulk actions and the
 * resize handle; keeping the height within the screen avoids that.
 */
export function maxWindowHeight(): number {
  const available = window.screen.availHeight;
  return available > 0 ? available - SCREEN_MARGIN : Infinity;
}
