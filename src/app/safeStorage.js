// Safe localStorage helpers shared by every game's saved data.
//
// localStorage can be missing (private mode, blocked) or throw (full), and
// what comes back can be corrupted or tampered with. These helpers never
// throw and turn anything odd into a safe default.

/** window.localStorage, or null when it is unavailable. */
export function safeLocalStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** A whole number ≥ 0, or 0 for anything else (NaN, negative, text, huge). */
export function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** The parsed JSON stored under `key`, or null if missing, unreadable or broken. */
export function readJson(backend, key) {
  try {
    return JSON.parse(backend?.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

/** Store `value` as JSON; if storage is full or blocked, quietly skip it. */
export function writeJson(backend, key, value) {
  try {
    backend?.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked: keep playing without saving.
  }
}
