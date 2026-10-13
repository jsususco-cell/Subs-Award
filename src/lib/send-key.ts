/**
 * The send key, remembered in this browser.
 *
 * Every route that writes to Quickbase is gated by it, so without somewhere to
 * keep it each screen asks again — and the same key was being typed into the
 * award panel, the billing panel and the advance panel in turn. It is set up
 * once from the bar at the top and every screen reads it from here.
 *
 * Per browser, deliberately. It is not a password and it identifies nobody;
 * it is the shared key that separates this app's writes from anything else
 * that can reach the API, so it belongs beside the session rather than on it.
 */

const KEY_STORE = "subs-award:send-key";

/** Storage is unavailable in some browsers and private windows; never throw. */
export function storedKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
}

export function rememberKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(KEY_STORE, trimmed);
    notify();
  } catch {
    /* Nothing to do: the key still works for this request. */
  }
}

export function forgetKey(): void {
  try {
    localStorage.removeItem(KEY_STORE);
    notify();
  } catch {
    /* As above. */
  }
}

/**
 * The header a write carries, from an explicitly typed key or the stored one.
 *
 * Typing one anywhere also remembers it, so a key entered because a screen
 * asked is the last time any screen asks.
 */
export function sendKeyHeaders(typed?: string): Record<string, string> {
  const key = typed?.trim() || storedKey();
  if (!key) return {};
  if (typed?.trim()) rememberKey(typed);
  return { "x-send-key": key };
}

/*
 * So the bar can show whether a key is set without polling. localStorage
 * fires `storage` only in other tabs, so changes made here are announced
 * directly.
 */
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function subscribeToKey(onChange: () => void): () => void {
  listeners.add(onChange);
  const fromAnotherTab = (e: StorageEvent) => {
    if (e.key === KEY_STORE || e.key === null) onChange();
  };
  window.addEventListener("storage", fromAnotherTab);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", fromAnotherTab);
  };
}
