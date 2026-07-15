// ============================================
// Tests — pantry matching with uncertain inventory
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchInventory, pantryOverlapScore } from '../../src/services/nisse/engine/pantry.js';

const ing = (canonical, qty, unit, over = {}) => ({
  name: canonical, canonical, qty, unit, ...over,
});

test('missing ingredient goes to toBuy', () => {
  const result = matchInventory([ing('kyckling', 500, 'g')], []);
  assert.equal(result.toBuy.length, 1);
  assert.equal(result.atHome.length, 0);
});

test('confident match with sufficient quantity goes to atHome', () => {
  const result = matchInventory(
    [ing('kyckling', 500, 'g')],
    [{ canonical: 'kyckling', quantity: 600, unit: 'g', confidence: 1.0 }]
  );
  assert.equal(result.atHome.length, 1);
});

test('LOW CONFIDENCE never lands in atHome — probability model invariant', () => {
  const result = matchInventory(
    [ing('kyckling', 500, 'g')],
    [{ canonical: 'kyckling', quantity: 600, unit: 'g', confidence: 0.4 }]
  );
  assert.equal(result.atHome.length, 0);
  assert.equal(result.uncertain.length, 1);
  assert.equal(result.uncertain[0].reason, 'osäker_inventering');
});

test('unknown quantity is uncertain, not atHome', () => {
  const result = matchInventory(
    [ing('grädde', 200, 'ml')],
    [{ canonical: 'grädde', quantity: null, unit: null, confidence: 1.0 }]
  );
  assert.equal(result.uncertain.length, 1);
  assert.equal(result.uncertain[0].reason, 'okänd_mängd');
});

test('cross-family units cannot be compared → uncertain', () => {
  const result = matchInventory(
    [ing('citron', 1, 'st')],
    [{ canonical: 'citron', quantity: 50, unit: 'ml', confidence: 1.0 }]
  );
  assert.equal(result.uncertain.length, 1);
});

test('clearly insufficient quantity goes to toBuy', () => {
  const result = matchInventory(
    [ing('pasta', 400, 'g')],
    [{ canonical: 'pasta', quantity: 100, unit: 'g', confidence: 1.0 }]
  );
  assert.equal(result.toBuy.length, 1);
  assert.equal(result.toBuy[0].reason, 'otillräcklig_mängd');
});

test('nearly sufficient (>=75%) is uncertain — user double-checks', () => {
  const result = matchInventory(
    [ing('pasta', 400, 'g')],
    [{ canonical: 'pasta', quantity: 350, unit: 'g', confidence: 1.0 }]
  );
  assert.equal(result.uncertain.length, 1);
  assert.equal(result.uncertain[0].reason, 'knappt_tillräckligt');
});

test('pantry staples count as atHome without inventory', () => {
  const result = matchInventory([ing('smör', 25, 'g', { pantryStaple: true })], []);
  assert.equal(result.atHome.length, 1);
  assert.equal(result.atHome[0].reason, 'basvara');
});

test('unit conversion inside family: 2 dl inventory covers 150 ml need', () => {
  const result = matchInventory(
    [ing('grädde', 150, 'ml')],
    [{ canonical: 'grädde', quantity: 2, unit: 'dl', confidence: 1.0 }]
  );
  assert.equal(result.atHome.length, 1);
});

test('pantryOverlapScore excludes staples from the denominator', () => {
  const score = pantryOverlapScore(
    [
      ing('kyckling', 500, 'g'),
      ing('ris', 300, 'g'),
      ing('smör', 25, 'g', { pantryStaple: true }),
    ],
    [{ canonical: 'kyckling', quantity: 600, unit: 'g', confidence: 1.0 }]
  );
  assert.equal(score, 0.5); // 1 of 2 non-staples
});
