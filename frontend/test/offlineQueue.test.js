// ============================================
// Tests — §26 offline queue
// Buffered entries flush exactly once: retries
// keep the same clientEventId, 409 counts as
// delivered, network failure keeps the entry.
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, pending, flush, makeClientEventId } from '../src/lib/offlineQueue.js';

const memStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

test('enqueue stamps a stable clientEventId and dedupes within the queue', () => {
  const storage = memStorage();
  const id = enqueue(storage, { kind: 'event', body: { name: 'voice_used' } });
  assert.ok(id.length >= 8);
  // Samma id en gång till (retry-race) → ingen dubblett i kön
  enqueue(storage, { kind: 'event', body: { name: 'voice_used' }, clientEventId: id });
  assert.equal(pending(storage).length, 1);
});

test('flush sends everything once and empties the queue', async () => {
  const storage = memStorage();
  enqueue(storage, { kind: 'event', body: { name: 'voice_used' } });
  enqueue(storage, { kind: 'feedback', body: { sessionId: 's1', data: { cooked: true } } });

  const sent = [];
  const result = await flush(storage, async (entry) => sent.push(entry.clientEventId));
  assert.equal(result.sent, 2);
  assert.equal(result.kept, 0);
  assert.equal(pending(storage).length, 0);
  assert.equal(new Set(sent).size, 2, 'unika clientEventId');
});

test('network failure keeps the entry; a later flush retries with the SAME id', async () => {
  const storage = memStorage();
  const id = enqueue(storage, { kind: 'event', body: { name: 'voice_used' } });

  const offline = Object.assign(new Error('nätverk'), { status: 0 });
  await flush(storage, async () => { throw offline; });
  assert.equal(pending(storage).length, 1, 'kvar i kön efter nätverksfel');

  const seen = [];
  await flush(storage, async (e) => seen.push(e.clientEventId));
  assert.deepEqual(seen, [id], 'retry använder samma clientEventId → server-dedup fungerar');
  assert.equal(pending(storage).length, 0);
});

test('409 (server already has it) counts as delivered — no double-count, no poison', async () => {
  const storage = memStorage();
  enqueue(storage, { kind: 'feedback', body: { sessionId: 's1', data: {} } });
  const dup = Object.assign(new Error('finns redan'), { status: 409 });
  const result = await flush(storage, async () => { throw dup; });
  assert.equal(result.sent, 1);
  assert.equal(pending(storage).length, 0);
});

test('permanent 4xx drops the entry instead of poisoning the queue', async () => {
  const storage = memStorage();
  enqueue(storage, { kind: 'event', body: { name: 'ogiltig' } });
  const bad = Object.assign(new Error('valideringsfel'), { status: 422 });
  const result = await flush(storage, async () => { throw bad; });
  assert.equal(result.sent, 0);
  assert.equal(pending(storage).length, 0);
});

test('makeClientEventId is uuid-shaped and unique enough', () => {
  const ids = new Set(Array.from({ length: 100 }, makeClientEventId));
  assert.equal(ids.size, 100);
  for (const id of ids) assert.match(id, /^[0-9a-f-]{36}$/);
});
