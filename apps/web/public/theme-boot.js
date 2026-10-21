/*
 * Purpose: Apply the saved light/dark theme and contrast before first paint (no flash of the wrong theme).
 * Scope: Reads two localStorage keys and sets classes on <html>; a classic blocking script so it
 *   runs before CSS paints. Kept as a static file because the CSP forbids inline scripts.
 * Does NOT belong: Theme switching UI (src/lib/theme.ts).
 */
(function () {
  var stored = null;
  try {
    stored = window.localStorage.getItem('ltts.theme');
  } catch (e) {
    stored = null;
  }
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var dark = stored === 'dark' || ((stored === null || stored === 'system') && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
  var contrast = null;
  try {
    contrast = window.localStorage.getItem('ltts.contrast');
  } catch (e) {
    contrast = null;
  }
  var askedForMore = window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches;
  document.documentElement.classList.toggle('contrast-more', contrast === 'more' || !!askedForMore);
})();
