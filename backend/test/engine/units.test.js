// ============================================
// Tests — unit normalization & Swedish formatting
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAmount, sameUnitFamily, formatAmount } from '../../src/services/nisse/engine/units.js';

test('normalizeAmount converts kitchen volumes to ml', () => {
  assert.deepEqual(normalizeAmount(2, 'msk'), { qty: 30, unit: 'ml', family: 'volume' });
  assert.deepEqual(normalizeAmount(1, 'tsk'), { qty: 5, unit: 'ml', family: 'volume' });
  assert.deepEqual(normalizeAmount(2, 'dl'), { qty: 200, unit: 'ml', family: 'volume' });
  assert.deepEqual(normalizeAmount(1.5, 'l'), { qty: 1500, unit: 'ml', family: 'volume' });
});

test('normalizeAmount converts mass to g', () => {
  assert.deepEqual(normalizeAmount(1.2, 'kg'), { qty: 1200, unit: 'g', family: 'mass' });
  assert.deepEqual(normalizeAmount(600, 'g'), { qty: 600, unit: 'g', family: 'mass' });
});

test('unknown units pass through with null family', () => {
  const result = normalizeAmount(2, 'näve');
  assert.equal(result.family, null);
  assert.equal(result.qty, 2);
});

test('sameUnitFamily groups summable units', () => {
  assert.equal(sameUnitFamily('dl', 'msk'), true);
  assert.equal(sameUnitFamily('g', 'kg'), true);
  assert.equal(sameUnitFamily('g', 'dl'), false);
  assert.equal(sameUnitFamily('st', 'g'), false);
  assert.equal(sameUnitFamily('näve', 'g'), false);
});

test('formatAmount uses Swedish decimal comma and sensible display units', () => {
  assert.equal(formatAmount(1500, 'g'), '1,5 kg');
  assert.equal(formatAmount(600, 'g'), '600 g');
  assert.equal(formatAmount(250, 'ml'), '2,5 dl');
  assert.equal(formatAmount(30, 'ml'), '2 msk');
  assert.equal(formatAmount(10, 'ml'), '2 tsk');
  assert.equal(formatAmount(3, 'st'), '3 st');
});
