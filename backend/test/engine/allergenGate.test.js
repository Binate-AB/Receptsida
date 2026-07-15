// ============================================
// Tests — the allergen/dietary HARD GATES
// These are the safety-critical invariants:
// no soft signal may ever bypass them.
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allergenGate, dietaryGate, hardGates, collectTemplateAllergens } from '../../src/services/nisse/engine/allergenGate.js';

const member = (over = {}) => ({
  id: 'm1', name: 'Liv', allergies: [], dietaryRestrictions: [], ...over,
});

const template = (over = {}) => ({
  slug: 'test',
  allergens: [],
  dietaryFlags: [],
  ingredients: [
    { name: 'Kyckling', canonical: 'kyckling', allergens: [] },
    { name: 'Ris', canonical: 'ris', allergens: [] },
  ],
  ...over,
});

test('allergen present in ingredient blocks the meal for an allergic member', () => {
  const tpl = template({
    ingredients: [
      { name: 'Jordnötter', canonical: 'jordnötter', allergens: ['jordnöt'] },
      { name: 'Ris', canonical: 'ris', allergens: [] },
    ],
  });
  const result = allergenGate(tpl, [member({ allergies: ['jordnöt'] })]);
  assert.equal(result.safe, false);
  assert.equal(result.violations[0].allergen, 'jordnöt');
  assert.deepEqual(result.violations[0].ingredients, ['jordnötter']);
});

test('fallback map catches undeclared allergens on known ingredients', () => {
  // Template author forgot to tag grädde — the fallback map must catch it
  const tpl = template({
    ingredients: [{ name: 'Vispgrädde', canonical: 'grädde', allergens: [] }],
  });
  const result = allergenGate(tpl, [member({ allergies: ['laktos'] })]);
  assert.equal(result.safe, false);
});

test('substitution carrying an allergen is caught when gated as variant ingredients', () => {
  // A vegan sausage substitution containing soja must fail for a soy-allergic member
  const variantIngredients = [{ name: 'Vegokorv', canonical: 'vegokorv', allergens: ['soja'] }];
  const result = allergenGate(template({ ingredients: variantIngredients }), [
    member({ allergies: ['soja'] }),
  ]);
  assert.equal(result.safe, false);
});

test('multi-member: one allergic member is enough to block', () => {
  const tpl = template({
    ingredients: [{ name: 'Lax', canonical: 'lax', allergens: ['fisk'] }],
  });
  const eaters = [
    member({ id: 'a', name: 'Jonas' }),
    member({ id: 'b', name: 'Sara' }),
    member({ id: 'c', name: 'Liv', allergies: ['fisk'] }),
  ];
  const result = allergenGate(tpl, eaters);
  assert.equal(result.safe, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].memberName, 'Liv');
});

test('no allergies → safe', () => {
  const result = allergenGate(template(), [member(), member({ id: 'm2' })]);
  assert.equal(result.safe, true);
  assert.equal(result.violations.length, 0);
});

test('dietaryGate: vegetarian member blocks meat template', () => {
  const tpl = template({ dietaryFlags: [] }); // köttfärssås has no flags
  const result = dietaryGate(tpl, [member({ dietaryRestrictions: ['vegetarisk'] })]);
  assert.equal(result.safe, false);
  assert.equal(result.violations[0].restriction, 'vegetarisk');
});

test('dietaryGate: vegan flag satisfies vegetarisk restriction', () => {
  const tpl = template({ dietaryFlags: ['vegan'] });
  const result = dietaryGate(tpl, [member({ dietaryRestrictions: ['vegetarisk'] })]);
  assert.equal(result.safe, true);
});

test('dietaryGate: glutenfri restriction passes when template carries no gluten', () => {
  const tpl = template(); // kyckling + ris, no gluten anywhere
  const result = dietaryGate(tpl, [member({ dietaryRestrictions: ['glutenfri'] })]);
  assert.equal(result.safe, true);
});

test('dietaryGate: glutenfri restriction fails when an ingredient carries gluten', () => {
  const tpl = template({
    ingredients: [{ name: 'Pasta', canonical: 'pasta', allergens: ['gluten'] }],
  });
  const result = dietaryGate(tpl, [member({ dietaryRestrictions: ['glutenfri'] })]);
  assert.equal(result.safe, false);
});

test('hard gates cannot be bypassed by any soft signal (no such parameter exists)', () => {
  // The gate API takes only template + members: there is no way to pass
  // ratings/preferences. This test locks the signature.
  const tpl = template({
    ingredients: [{ name: 'Jordnötssmör', canonical: 'jordnötssmör', allergens: ['jordnöt'] }],
  });
  const eater = member({ allergies: ['jordnöt'] });
  // Even with extra junk arguments, the verdict must be unchanged
  const result = hardGates(tpl, [eater], { rating: 5, boost: 9999 });
  assert.equal(result.safe, false);
});

test('collectTemplateAllergens merges template-level, declared and fallback sources', () => {
  const tpl = template({
    allergens: ['sesam'],
    ingredients: [
      { name: 'Pasta', canonical: 'pasta', allergens: ['gluten'] },
      { name: 'Grädde', canonical: 'grädde', allergens: [] }, // fallback → laktos
    ],
  });
  const map = collectTemplateAllergens(tpl);
  assert.ok(map.has('sesam'));
  assert.ok(map.has('gluten'));
  assert.ok(map.has('laktos'));
});
