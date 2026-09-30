const storageKey = 'axis-frame-limit';
const listeners = new Set<() => void>();
export const DEFAULT_FRAME_LIMIT = 60;

function readLimit() {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === null || stored.trim() === '') return DEFAULT_FRAME_LIMIT;
    const value = Number(stored);
    return Number.isSafeInteger(value) && value >= 0 ? value : DEFAULT_FRAME_LIMIT;
  } catch {
    return DEFAULT_FRAME_LIMIT;
  }
}

// Zero means unrestricted; every viewport uses the same preference.
let limit = readLimit();
export const getFrameLimit = () => limit;
export function subscribeToFrameLimit(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setFrameLimit(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value === limit) return;
  limit = value;
  try {
    localStorage.setItem(storageKey, String(value));
  } catch {
    // The active preference still works when persistence is unavailable.
  }
  listeners.forEach((listener) => listener());
}
