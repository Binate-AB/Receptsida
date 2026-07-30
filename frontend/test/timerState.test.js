// ============================================
// Tests — §26 endAt-based timer state
// The timer survives backgrounding: remaining is
// computed from an absolute end timestamp.
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTimer, startTimer, pauseTimer, resetTimer,
  remainingSec, isRunning, persistTimer, restoreTimer, clearTimer,
} from '../src/lib/timerState.js';

const t0 = 1_000_000_000_000;

const memStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

test('remaining is computed from endAt — backgrounding loses no time', () => {
  let timer = startTimer(createTimer(600), t0);
  assert.equal(isRunning(timer), true);
  assert.equal(remainingSec(timer, t0), 600);
  // App i bakgrunden i 4 minuter — inget tickande skedde
  assert.equal(remainingSec(timer, t0 + 240_000), 360);
  // Långt efter slutet: klampas till 0, aldrig negativt
  assert.equal(remainingSec(timer, t0 + 900_000), 0);
});

test('pause freezes remaining; resume continues from the frozen value', () => {
  let timer = startTimer(createTimer(300), t0);
  timer = pauseTimer(timer, t0 + 60_000); // 240 s kvar
  assert.equal(isRunning(timer), false);
  // Tid som passerar under paus räknas inte
  assert.equal(remainingSec(timer, t0 + 999_000), 240);
  timer = startTimer(timer, t0 + 999_000);
  assert.equal(remainingSec(timer, t0 + 999_000 + 100_000), 140);
});

test('reset returns to full duration, idle', () => {
  let timer = startTimer(createTimer(120), t0);
  timer = resetTimer(pauseTimer(timer, t0 + 30_000));
  assert.equal(isRunning(timer), false);
  assert.equal(remainingSec(timer, t0 + 500_000), 120);
});

test('persist + restore round-trips per session and step', () => {
  const storage = memStorage();
  const timer = startTimer(createTimer(600), t0);
  persistTimer(storage, 'cs_1-base', 3, timer);

  const restored = restoreTimer(storage, 'cs_1-base', 3, 600);
  assert.deepEqual(restored, timer);
  // En körande timer som återställs efter lås/bakgrund visar rätt kvarvarande tid
  assert.equal(remainingSec(restored, t0 + 120_000), 480);

  // Fel steg, annan session eller ändrad duration → ingen felaktig återställning
  assert.equal(restoreTimer(storage, 'cs_1-base', 4, 600), null);
  assert.equal(restoreTimer(storage, 'cs_2-base', 3, 600), null);
  assert.equal(restoreTimer(storage, 'cs_1-base', 3, 300), null);

  clearTimer(storage, 'cs_1-base', 3);
  assert.equal(restoreTimer(storage, 'cs_1-base', 3, 600), null);
});

test('storage failures are fail-open — cooking never breaks', () => {
  const broken = {
    getItem: () => { throw new Error('kaputt'); },
    setItem: () => { throw new Error('kaputt'); },
    removeItem: () => { throw new Error('kaputt'); },
  };
  const timer = createTimer(60);
  assert.doesNotThrow(() => persistTimer(broken, 'x', 0, timer));
  assert.equal(restoreTimer(broken, 'x', 0, 60), null);
  assert.doesNotThrow(() => clearTimer(broken, 'x', 0));
});
