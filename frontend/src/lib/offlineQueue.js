// ============================================
// Nisse — offline queue (§26)
// Buffers outcome/feedback/analytics calls in
// storage when the network is away and flushes
// them exactly once when it returns. Every entry
// carries a clientEventId; the server dedupes on
// it, so a flush that races a retry can never
// double-count.
//
// Storage and sender are injected → node-testable.
// ============================================

const QUEUE_KEY = 'nisse:offline-queue';
const MAX_ENTRIES = 200;

export function makeClientEventId() {
  // uuid-v4-shaped without depending on crypto.randomUUID availability
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function read(storage) {
  try {
    return JSON.parse(storage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function write(storage, entries) {
  try {
    storage.setItem(QUEUE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // fail-open: cooking never breaks on a full storage
  }
}

/**
 * Queue an entry: { kind: 'event'|'feedback', body: object }.
 * A clientEventId is stamped on first enqueue and survives retries.
 */
export function enqueue(storage, entry) {
  const entries = read(storage);
  const stamped = {
    ...entry,
    clientEventId: entry.clientEventId || makeClientEventId(),
    queuedAt: Date.now(),
  };
  // Dedup within the queue itself
  if (!entries.some((e) => e.clientEventId === stamped.clientEventId)) {
    entries.push(stamped);
    write(storage, entries);
  }
  return stamped.clientEventId;
}

export function pending(storage) {
  return read(storage);
}

/**
 * Flush the queue through `sender(entry)` (async). An entry leaves the
 * queue on success OR on a 409/duplicate response (server already has
 * it); it STAYS queued on network failure so the next flush retries.
 * Returns { sent, kept }.
 */
export async function flush(storage, sender) {
  const entries = read(storage);
  const kept = [];
  let sent = 0;
  for (const entry of entries) {
    try {
      await sender(entry);
      sent += 1;
    } catch (err) {
      const status = err?.status ?? err?.statusCode;
      if (status === 409) {
        sent += 1; // server already has it — dedup achieved
      } else if (status >= 400 && status < 500) {
        // permanently rejected (bad payload) — drop, never poison the queue
      } else {
        kept.push(entry); // network/5xx → retry later
      }
    }
  }
  write(storage, kept);
  return { sent, kept: kept.length };
}

/**
 * Browser wiring: flush on app start and whenever the network returns.
 * Safe to call in non-browser contexts (no-op).
 */
export function initOfflineQueue(sender, storage = globalThis.localStorage) {
  if (!storage || typeof window === 'undefined') return;
  const run = () => flush(storage, sender).catch(() => {});
  window.addEventListener('online', run);
  run();
}
