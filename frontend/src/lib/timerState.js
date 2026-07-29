// ============================================
// Nisse — endAt-based timer state (§26)
// Pure functions: a timer is an absolute END
// TIMESTAMP, not a tick counter, so backgrounding
// the app or locking the phone never loses time.
// Persisted to storage per session+step and
// restored on mount.
//
// State shape:
//   { durationSec, endAt: number|null, pausedRemainingSec: number|null }
//   running  → endAt set, pausedRemainingSec null
//   paused   → endAt null, pausedRemainingSec set
//   idle     → endAt null, pausedRemainingSec null (full duration left)
// ============================================

export function createTimer(durationSec) {
  return { durationSec, endAt: null, pausedRemainingSec: null };
}

export function startTimer(state, now) {
  const remaining = state.pausedRemainingSec ?? state.durationSec;
  return { ...state, endAt: now + remaining * 1000, pausedRemainingSec: null };
}

export function pauseTimer(state, now) {
  if (state.endAt == null) return state;
  return { ...state, endAt: null, pausedRemainingSec: remainingSec(state, now) };
}

export function resetTimer(state) {
  return { ...state, endAt: null, pausedRemainingSec: null };
}

export function isRunning(state) {
  return state.endAt != null;
}

/** Seconds left, computed from absolute time — background-safe. */
export function remainingSec(state, now) {
  if (state.endAt != null) return Math.max(0, Math.ceil((state.endAt - now) / 1000));
  return state.pausedRemainingSec ?? state.durationSec;
}

// ── Persistence (storage injected for testability) ──

const key = (persistKey, stepIndex) => `nisse:timer:${persistKey}:${stepIndex}`;

export function persistTimer(storage, persistKey, stepIndex, state) {
  try {
    storage.setItem(key(persistKey, stepIndex), JSON.stringify(state));
  } catch {
    // fail-open: a full/blocked storage never breaks cooking
  }
}

/**
 * Restore a timer for this step. A restored RUNNING timer whose endAt
 * already passed comes back as finished (remaining 0) — correct after
 * a long background period. Returns null when nothing was persisted
 * or the payload doesn't match the current duration (recipe changed).
 */
export function restoreTimer(storage, persistKey, stepIndex, durationSec) {
  try {
    const raw = storage.getItem(key(persistKey, stepIndex));
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (state?.durationSec !== durationSec) return null;
    return state;
  } catch {
    return null;
  }
}

export function clearTimer(storage, persistKey, stepIndex) {
  try {
    storage.removeItem(key(persistKey, stepIndex));
  } catch {
    // fail-open
  }
}
