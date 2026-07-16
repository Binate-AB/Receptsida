// ============================================
// Tests — assumption economy: uncertainty,
// robustness weighting and assumption handling.
// Spec: docs/NISSE_DECISION_ENGINE_SPEC.md §3/§5/§8
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  templateUncertainty,
  unconfirmedCritical,
  isCriticalIngredient,
  inventoryConfidenceMap,
  learnedConfidenceMap,
} from '../../src/services/nisse/engine/uncertainty.js';
import { rankCandidates } from '../../src/services/nisse/engine/ranker.js';
import { deterministicParse } from '../../src/services/nisse/engine/chipsParse.js';
import {
  buildAssumptions,
  applyAssumptionCorrection,
} from '../../src/services/nisse/assumptionService.js';

const adult = {
  id: 'a',
  name: 'Jonas',
  ageCategory: 'ADULT',
  allergies: [],
  dietaryRestrictions: [],
  dislikedIngredients: [],
  spiceTolerance: 'MEDIUM',
  portionFactor: 1,
  isDefaultPresent: true,
};

const makeTemplate = (over = {}) => ({
  id: over.slug || 't1',
  slug: over.slug || 't1',
  title: over.title || 'Testrecept',
  tags: [],
  totalTimeMin: 25,
  activeTimeMin: 15,
  effortScore: 2,
  dishLoad: 2,
  childFriendly: 2,
  spiceLevel: 0,
  costPerPortionMin: 20,
  costPerPortionMax: 30,
  allergens: [],
  dietaryFlags: [],
  equipmentRequired: [],
  hasChildAdultBranch: false,
  robustness: 3,
  ingredients: [
    { name: 'Kyckling', canonical: 'kyckling', qtyPerPortion: 125, unit: 'g', allergens: [] },
    { name: 'Ris', canonical: 'ris', qtyPerPortion: 0.75, unit: 'dl', allergens: [] },
  ],
  ...over,
});

// ── Criticality ──────────────────────────────

test('critical derives from required+non-staple, explicit flag overrides', () => {
  assert.equal(isCriticalIngredient({ optional: false, pantryStaple: false }), true);
  assert.equal(isCriticalIngredient({ optional: true, pantryStaple: false }), false);
  assert.equal(isCriticalIngredient({ optional: false, pantryStaple: true }), false);
  // Explicit curation wins over the derivation
  assert.equal(isCriticalIngredient({ optional: false, pantryStaple: true, critical: true }), true);
  assert.equal(isCriticalIngredient({ optional: false, pantryStaple: false, critical: false }), false);
});

// ── Uncertainty measure ──────────────────────

test('no pantry signal at all → uncertainty 1.0', () => {
  const tpl = makeTemplate();
  assert.equal(templateUncertainty(tpl, new Map(), new Map()), 1.0);
});

test('confident inventory lowers uncertainty, floored at 0.15', () => {
  const tpl = makeTemplate();
  const inv = inventoryConfidenceMap([
    { canonical: 'kyckling', confidence: 1.0 },
    { canonical: 'ris', confidence: 1.0 },
  ]);
  assert.equal(templateUncertainty(tpl, inv, new Map()), 0.15);
});

test('learned low confidence raises uncertainty', () => {
  const tpl = makeTemplate();
  const learned = learnedConfidenceMap([
    { canonical: 'kyckling', confidence: 0.05 },
    { canonical: 'ris', confidence: 0.05 },
  ]);
  const u = templateUncertainty(tpl, new Map(), learned);
  assert.ok(u > 0.9, `expected >0.9, got ${u}`);
});

test('unconfirmedCritical lists uncertain hard dependencies, sorted by confidence', () => {
  const tpl = makeTemplate();
  const inv = inventoryConfidenceMap([{ canonical: 'ris', confidence: 0.9 }]);
  const result = unconfirmedCritical(tpl, inv, new Map());
  assert.deepEqual(result.map((e) => e.canonical), ['kyckling']);
});

// ── Ranker: robustness under uncertainty ─────

test('high uncertainty lifts the robust dish over an otherwise identical fragile one', () => {
  const fragile = makeTemplate({ slug: 'fragile', robustness: 1 });
  const robust = makeTemplate({ slug: 'robust', robustness: 5 });

  const { slots } = rankCandidates([fragile, robust], {
    parsed: deterministicParse({}),
    eaters: [adult],
    inventory: [], // no signal → uncertainty 1.0
    equipment: [],
  });

  assert.equal(slots[0].slot, 'NISSE');
  assert.equal(slots[0].template.slug, 'robust');
});

test('with a confident pantry the robustness gap barely matters', () => {
  const fragile = makeTemplate({ slug: 'fragile', robustness: 2 });
  const robust = makeTemplate({ slug: 'robust', robustness: 4 });
  const inventory = [
    { canonical: 'kyckling', confidence: 1.0, name: 'Kyckling' },
    { canonical: 'ris', confidence: 1.0, name: 'Ris' },
  ];

  const withSignal = rankCandidates([fragile, robust], {
    parsed: deterministicParse({}),
    eaters: [adult],
    inventory,
    equipment: [],
  });
  const nisse = withSignal.slots[0];
  const other = withSignal.slots.find((s) => s.template.slug !== nisse.template.slug);
  // Difference at uncertainty floor: 0.15 * (4-2) * 6 ≈ 1.8 points
  assert.ok(Math.abs(nisse.score - other.score) < 5);
});

test('many uncertain critical ingredients are penalized when uncertainty is high', () => {
  const manyCritical = makeTemplate({
    slug: 'many',
    ingredients: ['a', 'b', 'c', 'd', 'e'].map((c) => ({
      name: c,
      canonical: c,
      qtyPerPortion: 1,
      unit: 'st',
      allergens: [],
    })),
  });
  const fewCritical = makeTemplate({
    slug: 'few',
    ingredients: [
      { name: 'x', canonical: 'x', qtyPerPortion: 1, unit: 'st', allergens: [] },
      { name: 'salt', canonical: 'salt', qtyPerPortion: 1, unit: 'krm', allergens: [], pantryStaple: true },
    ],
  });

  const { slots } = rankCandidates([manyCritical, fewCritical], {
    parsed: deterministicParse({}),
    eaters: [adult],
    inventory: [],
    equipment: [],
  });
  assert.equal(slots[0].template.slug, 'few');
});

test('dish preference bonus lifts a household favourite', () => {
  const plain = makeTemplate({ slug: 'plain' });
  const favourite = makeTemplate({ slug: 'favourite' });

  const { slots } = rankCandidates([plain, favourite], {
    parsed: deterministicParse({}),
    eaters: [adult],
    inventory: [],
    equipment: [],
    dishPreferences: new Map([['favourite', 'ONBOARDING']]),
  });
  assert.equal(slots[0].template.slug, 'favourite');
  assert.ok(slots[0].reasons.includes('brukar fungera hos er'));
});

// ── Assumption building ──────────────────────

test('buildAssumptions produces the level 2 chips incl. pantry keys for the top pick', () => {
  const parsed = deterministicParse({ timeBudgetMin: 30, energy: 'slut' });
  const assumptions = buildAssumptions({
    parsed,
    parseSource: 'chips_fallback',
    aiConfidence: null,
    chips: { timeBudgetMin: 30, energy: 'slut' },
    eaters: [adult],
    topTemplate: makeTemplate(),
    inventory: [],
    confidenceRows: [],
  });

  const keys = assumptions.map((a) => a.key);
  assert.ok(keys.includes('portions'));
  assert.ok(keys.includes('time_budget'));
  assert.ok(keys.includes('energy'));
  assert.ok(keys.includes('budget'));
  assert.ok(keys.includes('pantry:kyckling'));
  // Explicit chip choices carry high confidence
  const time = assumptions.find((a) => a.key === 'time_budget');
  assert.equal(time.confidence, 0.95);
  // Every assumption here is level 2 (shown, correctable)
  assert.ok(assumptions.every((a) => a.level === 2));
  // Max 3 pantry chips — chips must never become a form
  assert.ok(assumptions.filter((a) => a.key.startsWith('pantry:')).length <= 3);
});

// ── Assumption corrections ───────────────────

test('portions correction sets portionsOverride without mutating the original', () => {
  const parsed = deterministicParse({});
  const { parsed: next, normalized } = applyAssumptionCorrection(parsed, 'portions', 6);
  assert.equal(normalized, 6);
  assert.equal(next.portionsOverride, 6);
  assert.equal(parsed.portionsOverride, undefined);
});

test('time/energy/budget corrections validate their domains', () => {
  const parsed = deterministicParse({});
  assert.equal(applyAssumptionCorrection(parsed, 'time_budget', 45).parsed.timeBudgetMin, 45);
  assert.equal(applyAssumptionCorrection(parsed, 'time_budget', null).parsed.timeBudgetMin, null);
  assert.equal(applyAssumptionCorrection(parsed, 'energy', 'slut').parsed.energy, 'slut');
  assert.equal(applyAssumptionCorrection(parsed, 'budget', 'snålt').parsed.budget, 'snålt');
  assert.throws(() => applyAssumptionCorrection(parsed, 'energy', 'turbo'));
  assert.throws(() => applyAssumptionCorrection(parsed, 'time_budget', 5));
  assert.throws(() => applyAssumptionCorrection(parsed, 'portions', 0));
  assert.throws(() => applyAssumptionCorrection(parsed, 'okänd', 1));
});

test('pantry correction is flagged for persistence and requires a boolean', () => {
  const parsed = deterministicParse({});
  const result = applyAssumptionCorrection(parsed, 'pantry:pasta', false);
  assert.equal(result.isPantry, true);
  assert.equal(result.canonical, 'pasta');
  assert.equal(result.normalized, false);
  assert.throws(() => applyAssumptionCorrection(parsed, 'pantry:pasta', 'nej'));
});
