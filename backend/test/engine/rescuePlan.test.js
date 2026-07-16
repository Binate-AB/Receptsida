// ============================================
// Tests — deterministic rescue plans
// Invariant: a substitution can NEVER bypass the
// allergen gate; behind-replan output is a valid,
// shorter plan.
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMissingIngredient,
  replanRemaining,
} from '../../src/services/nisse/engine/rescuePlan.js';

const template = {
  ingredients: [
    {
      name: 'Grädde',
      canonical: 'grädde',
      allergens: ['laktos'],
      substitutions: [
        { name: 'Havregrädde', canonical: 'havregrädde', allergens: ['gluten'], note: 'samma mängd' },
        { name: 'Kokosmjölk', canonical: 'kokosmjölk', allergens: [], note: 'ger lite sötma' },
      ],
    },
    { name: 'Persilja', canonical: 'persilja', optional: true, substitutions: [] },
    { name: 'Kycklingfilé', canonical: 'kycklingfilé', substitutions: [] },
  ],
};

const glutenMember = { id: 'm1', name: 'Liv', allergies: ['gluten'] };
const noAllergyMember = { id: 'm2', name: 'Jonas', allergies: [] };

test('substitution skips options with a member allergen — never bypasses the gate', () => {
  const plan = resolveMissingIngredient(template, 'grädde', [glutenMember, noAllergyMember]);
  assert.equal(plan.resolution, 'substitution');
  // Havregrädde (gluten) must be skipped for the gluten-allergic member
  assert.equal(plan.substitute.canonical, 'kokosmjölk');
});

test('without allergies the first curated substitution is offered', () => {
  const plan = resolveMissingIngredient(template, 'grädde', [noAllergyMember]);
  assert.equal(plan.substitute.canonical, 'havregrädde');
});

test('optional ingredient resolves to simplify', () => {
  const plan = resolveMissingIngredient(template, 'persilja', [glutenMember]);
  assert.equal(plan.resolution, 'simplify');
});

test('critical ingredient without safe substitute resolves to fallback plan', () => {
  const plan = resolveMissingIngredient(template, 'kycklingfilé', [glutenMember]);
  assert.equal(plan.resolution, 'fallback_plan');
  assert.ok(plan.message.length > 10);
});

test('unknown ingredient resolves to simplify (never blocks the cook)', () => {
  const plan = resolveMissingIngredient(template, 'saffran', [glutenMember]);
  assert.equal(plan.resolution, 'simplify');
});

// ── Behind-schedule replan ───────────────────

const steps = [
  { id: 's1', text: 'Koka pastan enligt paketet', voiceCue: 'Koka pastan', durationMin: 10, dependsOn: [] },
  { id: 's2', text: 'Stek köttfärsen tills genomstekt', voiceCue: 'Stek färsen', durationMin: 8, dependsOn: [] },
  { id: 's3', text: 'Blanda såsen med färsen', voiceCue: 'Blanda såsen', durationMin: 5, dependsOn: ['s2'] },
  { id: 's4', text: 'Toppa med färska örter och riven ost', voiceCue: 'Toppa', durationMin: 3, dependsOn: ['s3'], optional: true },
  { id: 's5', text: 'Servera pastan med såsen', voiceCue: 'Servera', durationMin: 2, dependsOn: ['s1', 's3'] },
];

test('replan drops optional steps and yields a shorter valid plan', () => {
  const full = replanRemaining(steps, new Set(), { branch: 'base' });
  const replan = replanRemaining(steps, new Set(['s1', 's2']), { branch: 'base' });

  assert.ok(replan.newEtaMin < full.newEtaMin, 'remaining plan must be shorter than the full plan');
  assert.deepEqual(replan.skipped.map((s) => s.id), ['s4']);
  const ids = replan.steps.map((s) => s.id);
  assert.deepEqual([...ids].sort(), ['s3', 's5']);
  // Dependency order still holds: s3 before s5
  assert.ok(ids.indexOf('s3') < ids.indexOf('s5'));
});

test('replan with everything done returns an empty plan', () => {
  const replan = replanRemaining(steps, new Set(['s1', 's2', 's3', 's4', 's5']), { branch: 'base' });
  assert.equal(replan.newEtaMin, 0);
  assert.equal(replan.steps.length, 0);
});
