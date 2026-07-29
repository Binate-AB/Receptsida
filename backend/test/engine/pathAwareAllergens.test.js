// ============================================
// Tests — path-aware four-state allergen model (G0c)
// Invariants:
//  - REQUIRED ingredients can block (all three lists,
//    conservatively — contains/varies/traces)
//  - OPTIONAL ingredients NEVER block — they yield
//    safe conditions instead
//  - a substitution affects safety ONLY when chosen
//  - dietary flags are computed from the active path
//  - EU-14 enum complete; legacy skaldjur expands
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allergenGate,
  hardGates,
  dietPathStatus,
  dietaryGate,
  collectTemplateAllergens,
  collectPackageChecks,
} from '../../src/services/nisse/engine/allergenGate.js';
import { resolveMissingIngredient } from '../../src/services/nisse/engine/rescuePlan.js';
import { ALLERGEN_CODES, expandAllergyCodes } from '../../src/services/nisse/engine/allergens.js';
import { computeAllergenUnion, templateSchema } from '../../src/services/nisse/schemas/templateSchema.js';

const milkAllergic = { id: 'm1', name: 'Liv', allergies: ['mjölkprotein'], dietaryRestrictions: [] };
const glutenAllergic = { id: 'm2', name: 'Alex', allergies: ['gluten'], dietaryRestrictions: [] };

// Grönsakssoppa-shaped: dairy only in OPTIONAL ingredients
const soupTemplate = {
  ingredients: [
    { name: 'Grönsaker', canonical: 'grönsaker', allergens: [] },
    { name: 'Grönsaksbuljong', canonical: 'grönsaksbuljong', allergensVaryByProduct: ['selleri'], requiresPackageVerification: true },
    { name: 'Ost', canonical: 'ost', allergens: ['mjölkprotein'], allergensVaryByProduct: ['laktos'], optional: true },
    { name: 'Grädde', canonical: 'grädde', allergens: ['laktos', 'mjölkprotein'], optional: true },
  ],
};

// ── A1: path-aware gate ──────────────────────

test('optional dairy does NOT block a milk-allergic household — it yields conditions', () => {
  const result = allergenGate(soupTemplate, [milkAllergic]);
  assert.equal(result.safe, true, JSON.stringify(result.violations));
  assert.ok(result.conditions.length >= 2, 'expected conditions for ost + grädde');
  assert.ok(result.conditions.every((c) => c.action === 'utelämna' || c.action === 'ersätt'));
  assert.ok(result.conditions.some((c) => c.canonical === 'ost'));
});

test('a REQUIRED ingredient with the allergen still blocks (any status list)', () => {
  const tpl = {
    ingredients: [
      { name: 'Grädde', canonical: 'grädde', allergens: ['mjölkprotein'] }, // required
    ],
  };
  assert.equal(allergenGate(tpl, [milkAllergic]).safe, false);

  const varies = { ingredients: [{ name: 'Korv', canonical: 'falukorv', allergensVaryByProduct: ['mjölkprotein'], requiresPackageVerification: true }] };
  assert.equal(allergenGate(varies, [milkAllergic]).safe, false, 'varies blocks conservatively');

  const traces = { ingredients: [{ name: 'Choklad', canonical: 'choklad', mayContainTraces: ['mjölkprotein'] }] };
  assert.equal(allergenGate(traces, [milkAllergic]).safe, false, 'traces block conservatively');
});

test('an UNCHOSEN substitution never blocks the base recipe', () => {
  const tpl = {
    ingredients: [
      {
        name: 'Mjölk',
        canonical: 'mjölk',
        allergens: ['laktos', 'mjölkprotein'],
        substitutions: [
          { name: 'Havredryck', canonical: 'havredryck', allergensVaryByProduct: ['gluten'], requiresPackageVerification: true },
        ],
      },
    ],
  };
  // Gluten-allergic household: the oat substitution carries gluten-varies,
  // but it is NOT part of the base path — the dish must pass.
  const result = allergenGate(tpl, [glutenAllergic]);
  assert.equal(result.safe, true, JSON.stringify(result.violations));
  // ...and at CHOICE time the oat substitute is disqualified:
  const plan = resolveMissingIngredient(tpl, 'mjölk', [glutenAllergic]);
  assert.notEqual(plan.substitute?.canonical, 'havredryck');
});

test('base-path union (DB column) excludes optional ingredients but includes varies+traces', () => {
  const union = computeAllergenUnion(soupTemplate.ingredients);
  assert.ok(!union.includes('mjölkprotein'), 'optional dairy must not enter the base union');
  assert.ok(union.includes('selleri'), 'required varies must enter the union');
});

// ── A1: conditional dietary flags ────────────

test('dietPathStatus: optional offender → conditional with condition text', () => {
  const path = dietPathStatus(soupTemplate, 'laktosfri');
  assert.equal(path.status, 'conditional');
  assert.ok(path.conditions.some((c) => c.includes('utelämnas')), path.conditions.join(' | '));
});

test('dietPathStatus: required offender with free substitution → conditional (byt)', () => {
  const tpl = {
    ingredients: [
      {
        name: 'Pasta', canonical: 'pasta', allergens: ['gluten'],
        substitutions: [{ name: 'Glutenfri pasta', canonical: 'glutenfri pasta' }],
      },
    ],
  };
  const path = dietPathStatus(tpl, 'glutenfri');
  assert.equal(path.status, 'conditional');
  assert.ok(path.conditions[0].includes('byts'));
});

test('dietPathStatus: required offender without safe path → unsafe → dietaryGate blocks', () => {
  const tpl = { ingredients: [{ name: 'Vetemjöl', canonical: 'vetemjöl', allergens: ['gluten'] }], dietaryFlags: [] };
  assert.equal(dietPathStatus(tpl, 'glutenfri').status, 'unsafe');
  const member = { id: 'g', name: 'G', allergies: [], dietaryRestrictions: ['glutenfri'] };
  assert.equal(dietaryGate(tpl, [member]).safe, false);
});

test('dietaryGate passes a conditional dish and surfaces the condition', () => {
  const member = { id: 'l', name: 'L', allergies: [], dietaryRestrictions: ['laktosfri'] };
  const result = dietaryGate(soupTemplate, [member]);
  assert.equal(result.safe, true);
  assert.ok(result.conditions.length > 0);
});

test('full hardGates carries condition texts through', () => {
  const gates = hardGates(soupTemplate, [milkAllergic]);
  assert.equal(gates.safe, true);
  assert.ok(gates.conditions.some((t) => typeof t === 'string' && t.includes('utelämnas')));
});

// ── A2: statuses stay separate ───────────────

test('collectTemplateAllergens attributes status per source', () => {
  const map = collectTemplateAllergens(soupTemplate);
  const selleri = map.get('selleri');
  assert.equal(selleri[0].status, 'varies');
  assert.ok(!map.has('mjölkprotein'), 'optional-only allergens stay out of the base map');
});

test('explicit four-state declaration overrides the fallback map (hard cheese case)', () => {
  // Parmesan declared mjölkprotein-only: the fallback map must NOT re-add laktos
  const tpl = { ingredients: [{ name: 'Parmesan', canonical: 'parmesan', allergens: ['mjölkprotein'] }] };
  const map = collectTemplateAllergens(tpl);
  assert.ok(map.has('mjölkprotein'));
  assert.ok(!map.has('laktos'), 'declared status must win over the fallback safety net');
  // ...while a fully untagged row still gets the conservative fallback
  const untagged = { ingredients: [{ name: 'Parmesan', canonical: 'parmesan' }] };
  assert.ok(collectTemplateAllergens(untagged).has('laktos'));
});

// ── A3: package verification ─────────────────

test('collectPackageChecks surfaces generic industrial products for the household', () => {
  const checks = collectPackageChecks(soupTemplate, [milkAllergic]);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].canonical, 'grönsaksbuljong');
});

// ── A4: EU-14 taxonomy ───────────────────────

test('taxonomy covers all 14 EU allergen groups', () => {
  const eu14 = ['gluten', 'kräftdjur', 'ägg', 'fisk', 'jordnöt', 'soja', 'mjölkprotein', 'nötter', 'selleri', 'senap', 'sesam', 'sulfit', 'lupin', 'blötdjur'];
  for (const code of eu14) {
    assert.ok(ALLERGEN_CODES.includes(code), `saknar EU-grupp: ${code}`);
  }
  // laktos stays as a separate intolerance marker
  assert.ok(ALLERGEN_CODES.includes('laktos'));
});

test('legacy skaldjur expands to kräftdjur + blötdjur (both directions)', () => {
  assert.deepEqual(expandAllergyCodes(['skaldjur']).sort(), ['blötdjur', 'kräftdjur', 'skaldjur']);
  const tpl = { ingredients: [{ name: 'Räkor', canonical: 'räkor', allergens: ['kräftdjur'] }] };
  const legacyMember = { id: 's', name: 'S', allergies: ['skaldjur'] };
  assert.equal(allergenGate(tpl, [legacyMember]).safe, false, 'legacy selection must still protect');
});

// ── Schema: static flags only for a fully free base path ──

test('static laktosfri flag is invalid when a required ingredient has laktos in traces', () => {
  const raw = {
    slug: 'sparflagg',
    title: 'Spårflaggsrätt',
    description: 'Rätt med spår av laktos i obligatorisk ingrediens.',
    totalTimeMin: 20, activeTimeMin: 10, costPerPortionMin: 10, costPerPortionMax: 20,
    dietaryFlags: ['laktosfri'],
    ingredients: [
      { name: 'Buljong', canonical: 'grönsaksbuljong', qtyPerPortion: 0.5, unit: 'st', mayContainTraces: ['laktos'] },
      { name: 'Ris', canonical: 'ris', qtyPerPortion: 0.75, unit: 'dl' },
    ],
    steps: [
      { id: 's1', text: 'Koka riset i buljongen.', voiceCue: 'Koka riset.', durationMin: 15 },
      { id: 's2', text: 'Servera riset direkt.', voiceCue: 'Servera.', durationMin: 2 },
    ],
  };
  assert.equal(templateSchema.safeParse(raw).success, false);
  assert.equal(templateSchema.safeParse({ ...raw, dietaryFlags: [] }).success, true);
});
