// ============================================
// Tests — three-state allergen model
// CONTAINS / FREE / VARIES BY BRAND.
// Conservative invariant: VARIES is treated as
// CONTAINS by every safety path — the gate, the
// template union and substitutions. "Probably
// fine" is never an approval.
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allergenGate, collectTemplateAllergens, hardGates } from '../../src/services/nisse/engine/allergenGate.js';
import { resolveMissingIngredient } from '../../src/services/nisse/engine/rescuePlan.js';
import { computeAllergenUnion, templateSchema } from '../../src/services/nisse/schemas/templateSchema.js';

const glutenAllergic = { id: 'm1', name: 'Liv', allergies: ['gluten'], dietaryRestrictions: [] };

const meatballTemplate = {
  allergens: [],
  ingredients: [
    // Store-bought meatballs: gluten varies by brand — declared as varies
    { name: 'Köttbullar', canonical: 'köttbullar', allergens: [], allergensVary: ['gluten', 'ägg'] },
    { name: 'Potatis', canonical: 'potatis', allergens: [] },
  ],
};

test('gate blocks a varies-by-brand allergen exactly like contains', () => {
  const result = allergenGate(meatballTemplate, [glutenAllergic]);
  assert.equal(result.safe, false);
  assert.equal(result.violations[0].allergen, 'gluten');
  assert.deepEqual(result.violations[0].ingredients, ['köttbullar']);
});

test('hardGates (full chain) rejects varies for the allergic household', () => {
  const gates = hardGates(meatballTemplate, [glutenAllergic]);
  assert.equal(gates.safe, false);
});

test('collectTemplateAllergens includes varies with source attribution', () => {
  const found = collectTemplateAllergens(meatballTemplate);
  assert.ok(found.has('gluten'));
  assert.ok(found.get('gluten').includes('köttbullar'));
  assert.ok(found.has('ägg'));
});

test('computeAllergenUnion (DB denormalization) is conservative — includes varies', () => {
  const union = computeAllergenUnion(meatballTemplate.ingredients);
  assert.deepEqual(union, ['gluten', 'ägg']);
});

test('substitution with a varies-allergen is disqualified for the allergic member', () => {
  const tpl = {
    ingredients: [
      {
        name: 'Falukorv',
        canonical: 'falukorv',
        allergens: [],
        substitutions: [
          // Veggie sausage: soy declared, gluten varies — must be skipped for gluten allergy
          { name: 'Vegokorv', canonical: 'vegokorv', allergens: ['soja'], allergensVary: ['gluten'] },
          { name: 'Kycklingkorv', canonical: 'kycklingkorv', allergens: [], allergensVary: [] },
        ],
      },
    ],
  };
  const plan = resolveMissingIngredient(tpl, 'falukorv', [glutenAllergic]);
  assert.equal(plan.resolution, 'substitution');
  assert.equal(plan.substitute.canonical, 'kycklingkorv');
});

test('dietary flag that contradicts a varies-declaration fails schema validation', () => {
  const raw = {
    slug: 'motsagelse',
    title: 'Motsägelserätt',
    description: 'En rätt som påstår sig vara glutenfri med varierande köttbullar.',
    totalTimeMin: 20,
    activeTimeMin: 10,
    costPerPortionMin: 10,
    costPerPortionMax: 20,
    dietaryFlags: ['glutenfri'],
    ingredients: [
      { name: 'Köttbullar', canonical: 'köttbullar', qtyPerPortion: 100, unit: 'g', allergensVary: ['gluten'] },
      { name: 'Ris', canonical: 'ris', qtyPerPortion: 0.75, unit: 'dl' },
    ],
    steps: [
      { id: 's1', text: 'Stek köttbullarna gyllene.', voiceCue: 'Stek köttbullarna.', durationMin: 8 },
      { id: 's2', text: 'Koka riset enligt paketet.', voiceCue: 'Koka riset.', durationMin: 12 },
    ],
  };
  const result = templateSchema.safeParse(raw);
  assert.equal(result.success, false);
  const messages = JSON.stringify(result.error.issues);
  assert.ok(messages.includes('glutenfri'), messages);

  // Same dish is valid once the contradicting flag is removed
  const fixed = templateSchema.safeParse({ ...raw, dietaryFlags: [] });
  assert.equal(fixed.success, true);
  // Optional ingredients do not trigger the conflict
  const optionalOk = templateSchema.safeParse({
    ...raw,
    ingredients: raw.ingredients.map((i) =>
      i.canonical === 'köttbullar' ? { ...i, optional: true } : i
    ),
  });
  assert.equal(optionalOk.success, true);
});
