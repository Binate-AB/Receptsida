// ============================================
// Tests — §28 portion scaling rules + §27 units
//  - linear default
//  - stepwise: whole units ("1 lök blir inte 1,5")
//  - sublinear: seasonings/fat scale ^0.6
//  - template childPortionFactor vs member-explicit
//  - Swedish decimal comma in formatAmount
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePortions,
  scaleIngredients,
  DEFAULT_PORTION_FACTOR,
} from '../../src/services/nisse/engine/portions.js';
import { formatAmount } from '../../src/services/nisse/engine/units.js';

test('linear scaling is the default', () => {
  const [pasta] = scaleIngredients(
    [{ name: 'Pasta', canonical: 'pasta', qtyPerPortion: 90, unit: 'g' }],
    6
  );
  assert.equal(pasta.qty, 540);
});

test('stepwise: 1 lök blir inte 1,5 — whole units, never below 1', () => {
  const onion = { name: 'Gul lök', canonical: 'lök', qtyPerPortion: 0.25, unit: 'st', scaling: 'stepwise' };
  assert.equal(scaleIngredients([onion], 6)[0].qty, 2, '1.5 rundas till hel enhet');
  assert.equal(scaleIngredients([onion], 4)[0].qty, 1);
  assert.equal(scaleIngredients([onion], 1)[0].qty, 1, 'aldrig under 1 hel enhet');
  const egg = { name: 'Ägg', canonical: 'ägg', qtyPerPortion: 1, unit: 'st', scaling: 'stepwise' };
  assert.equal(scaleIngredients([egg], 2.5)[0].qty, 3, 'ägg avrundas till heltal');
});

test('sublinear: spices/fat grow slower than portions (^0.6, anchored at servingsBase)', () => {
  const oil = { name: 'Rapsolja', canonical: 'rapsolja', qtyPerPortion: 0.5, unit: 'msk', scaling: 'sublinear' };
  // At the author's base (4 portions) the amount is unchanged
  assert.equal(scaleIngredients([oil], 4, { servingsBase: 4 })[0].qty, 2);
  // Doubling portions must NOT double the fat: 2 × 2^0.6 ≈ 3.03 → 3
  const at8 = scaleIngredients([oil], 8, { servingsBase: 4 })[0].qty;
  assert.ok(at8 < 4, `sublinear ska vara < linjärt (fick ${at8})`);
  assert.equal(at8, 3);
});

test('template childPortionFactor overrides the AGE-DEFAULT for children only', () => {
  const members = [
    { id: 'a', portionFactor: 1.0, ageCategory: 'ADULT' },
    { id: 'c', portionFactor: DEFAULT_PORTION_FACTOR.CHILD, ageCategory: 'CHILD' },
  ];
  const ids = ['a', 'c'];
  // Without override: 1.0 + 0.6 = 1.6 → ceil to 2.0
  assert.equal(computePortions(members, ids), 2);
  // Pancake-style dish where kids eat like adults: 1.0 + 1.0 = 2.0
  assert.equal(computePortions(members, ids, { childPortionFactor: 1.0 }), 2);
  // Tasting-only dish: 1.0 + 0.3 = 1.3 → 1.5
  assert.equal(computePortions(members, ids, { childPortionFactor: 0.3 }), 1.5);
});

test('a member-EXPLICIT factor always beats the template child factor', () => {
  const members = [
    { id: 'c', portionFactor: 1.2, ageCategory: 'CHILD' }, // hungry kid, customized
  ];
  assert.equal(
    computePortions(members, ['c'], { childPortionFactor: 0.3 }),
    1.5,
    '1.2 (explicit) ska användas, inte 0.3 → ceil(1.2*2)/2 = 1.5'
  );
});

test('formatAmount uses Swedish decimal comma', () => {
  assert.equal(formatAmount(1.5, 'dl'), '1,5 dl');
  assert.equal(formatAmount(2, 'dl'), '2 dl');
  assert.ok(!formatAmount(2.5, 'st').includes('.'), 'aldrig punkt som decimaltecken');
});
