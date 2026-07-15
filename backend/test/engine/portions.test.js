// ============================================
// Tests — portion computation & ingredient scaling
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePortions, scaleIngredients } from '../../src/services/nisse/engine/portions.js';

const members = [
  { id: 'a', name: 'Jonas', portionFactor: 1.0, isDefaultPresent: true },
  { id: 'b', name: 'Sara', portionFactor: 1.0, isDefaultPresent: true },
  { id: 'c', name: 'Liv', portionFactor: 0.6, isDefaultPresent: true },
  { id: 'd', name: 'Måns', portionFactor: 0.3, isDefaultPresent: false },
];

test('computePortions sums portion factors of default-present members', () => {
  // 1.0 + 1.0 + 0.6 = 2.6 → rounds UP to 3.0
  assert.equal(computePortions(members), 3);
});

test('computePortions respects explicit eater selection', () => {
  assert.equal(computePortions(members, ['a', 'c']), 2); // 1.6 → 2
  assert.equal(computePortions(members, ['a', 'b', 'c', 'd']), 3); // 2.9 → 3
});

test('computePortions never returns less than 1', () => {
  assert.equal(computePortions(members, ['d']), 1); // 0.3 → 1
  assert.equal(computePortions([], []), 1);
});

test('scaleIngredients multiplies qtyPerPortion by portions', () => {
  const scaled = scaleIngredients(
    [
      { name: 'Kyckling', canonical: 'kyckling', qtyPerPortion: 125, unit: 'g' },
      { name: 'Ris', canonical: 'ris', qtyPerPortion: 0.75, unit: 'dl' },
    ],
    2.5
  );
  assert.equal(scaled[0].qty, 313); // 312.5 → 313 g
  assert.equal(scaled[1].qty, 2); // 1.875 → 2 dl (halves)
});

test('scaleIngredients rounds counts to kitchen-realistic halves', () => {
  const scaled = scaleIngredients(
    [{ name: 'Lök', canonical: 'lök', qtyPerPortion: 0.25, unit: 'st' }],
    3
  );
  assert.equal(scaled[0].qty, 1); // 0.75 → 1 (never 0.75 of an onion)
});

test('scaleIngredients never returns negative or NaN and rejects invalid portions', () => {
  const scaled = scaleIngredients(
    [{ name: 'Grädde', canonical: 'grädde', qtyPerPortion: 0.75, unit: 'dl' }],
    4
  );
  assert.ok(scaled[0].qty > 0);
  assert.ok(Number.isFinite(scaled[0].qty));
  assert.throws(() => scaleIngredients([], 0));
  assert.throws(() => scaleIngredients([], NaN));
});
