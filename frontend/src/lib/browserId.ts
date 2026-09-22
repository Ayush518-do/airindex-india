// Anonymous per-browser identity for saved routes (no login). Stored in localStorage.
const KEY = 'airindex_browser_id';

export function getBrowserId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const id = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 24)
      : Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return 'ephemeral-' + Math.random().toString(16).slice(2, 14);
  }
}
