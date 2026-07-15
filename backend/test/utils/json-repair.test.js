// ============================================
// Tests — utils/json-repair.js
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repairJSON, parseJsonLoose } from '../../src/utils/json-repair.js';

test('repairJSON strips trailing commas', () => {
  const fixed = repairJSON('{"a": 1, "b": [1, 2,],}');
  assert.deepEqual(JSON.parse(fixed), { a: 1, b: [1, 2] });
});

test('repairJSON closes truncated brackets', () => {
  const fixed = repairJSON('{"recipes": [{"title": "Lax"');
  const parsed = JSON.parse(fixed);
  assert.equal(parsed.recipes[0].title, 'Lax');
});

test('parseJsonLoose strips markdown fences', () => {
  const parsed = parseJsonLoose('```json\n{"ok": true}\n```');
  assert.deepEqual(parsed, { ok: true });
});

test('parseJsonLoose extracts object from surrounding prose', () => {
  const parsed = parseJsonLoose('Här är resultatet:\n{"x": 5}\nHoppas det hjälper!');
  assert.deepEqual(parsed, { x: 5 });
});

test('parseJsonLoose throws on unrecoverable garbage', () => {
  assert.throws(() => parseJsonLoose('inte json alls'));
});
