/*
 * Purpose: Apply the saved light/dark theme before first paint (no flash of the wrong theme).
 * Scope: Reads one localStorage key and sets a class on <html>; a classic blocking script so it
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
})();
