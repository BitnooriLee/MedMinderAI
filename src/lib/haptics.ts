/**
 * Short success haptic using the Vibration API (best-effort; no-op when unsupported).
 */
export function triggerSuccessHaptic(): void {
  if (typeof window === "undefined") return;
  const nav = window.navigator;
  if (!nav || typeof nav.vibrate !== "function") return;
  try {
    nav.vibrate([100, 50, 100]);
  } catch {
    // Unsupported or blocked (e.g. some iOS Safari builds); ignore silently.
  }
}
