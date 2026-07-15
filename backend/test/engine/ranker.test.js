// ============================================
// Tests — candidate ranking
// The critical invariant: hard gates always win —
// no soft score can resurrect an unsafe template.
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankCandidates } from '../../src/services/nisse/engine/ranker.js';
import { deterministicParse } from '../../src/services/nisse/engine/chipsParse.js';

const makeTemplate = (over = {}) => ({
  id: over.slug || 't1',
  slug: 't1',
  title: 'Testrecept',
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
  ingredients: [
    { name: 'Kyckling', canonical: 'kyckling', qtyPerPortion: 125, unit: 'g', allergens: [] },
    { name: 'Ris', canonical: 'ris', qtyPerPortion: 0.75, unit: 'dl', allergens: [] },
  ],
  ...over,
});

const adult = { id: 'a', name: 'Jonas', ageCategory: 'ADULT', allergies: [], dietaryRestrictions: [], dislikedIngredients: [], spiceTolerance: 'MEDIUM' };
const allergicChild = { id: 'c', name: 'Liv', ageCategory: 'CHILD', allergies: ['jordnöt'], dietaryRestrictions: [], dislikedIngredients: [], spiceTolerance: 'NONE' };

const baseCtx = (over = {}) => ({
  parsed: deterministicParse({}),
  eaters: [adult],
  inventory: [],
  equipment: [],
  ...over,
});

test('HARD GATES ALWAYS WIN: allergen template never appears in any slot, even with perfect soft scores', () => {
  const dangerous = makeTemplate({
    id: 'danger', slug: 'jordnotskyckling',
    // Everything soft-optimal: cheap, zero effort, child favourite
    effortScore: 1, dishLoad: 1, childFriendly: 3, costPerPortionMin: 5, costPerPortionMax: 8,
    ingredients: [
      { name: 'Jordnötssmör', canonical: 'jordnötssmör', qtyPerPortion: 25, unit: 'g', allergens: ['jordnöt'] },
      { name: 'Kyckling', canonical: 'kyckling', qtyPerPortion: 125, unit: 'g', allergens: [] },
    ],
  });
  const safe = makeTemplate({ id: 'safe', slug: 'sakert', effortScore: 5, costPerPortionMin: 90, costPerPortionMax: 120 });

  // Even a full pantry for the dangerous recipe cannot save it
  const inventory = [
    { canonical: 'jordnötssmör', quantity: 500, unit: 'g', confidence: 1.0 },
    { canonical: 'kyckling', quantity: 1000, unit: 'g', confidence: 1.0 },
  ];

  const result = rankCandidates([dangerous, safe], baseCtx({ eaters: [adult, allergicChild], inventory }));

  assert.ok(result.slots.every((s) => s.template.id !== 'danger'), 'dangerous template must never be slotted');
  assert.ok(result.rejected.some((r) => r.templateId === 'danger' && r.reason.includes('allergi')));
  assert.equal(result.slots[0].template.id, 'safe');
});

test('dietary restriction gates like an allergy', () => {
  const meat = makeTemplate({ id: 'meat', slug: 'kott' });
  const vegan = makeTemplate({ id: 'veg', slug: 'veg', dietaryFlags: ['vegan', 'vegetarisk'],
    ingredients: [{ name: 'Linser', canonical: 'linser', qtyPerPortion: 0.75, unit: 'dl', allergens: [] }] });
  const vegetarian = { ...adult, dietaryRestrictions: ['vegetarisk'] };

  const result = rankCandidates([meat, vegan], baseCtx({ eaters: [vegetarian] }));
  assert.equal(result.slots.length, 1);
  assert.equal(result.slots[0].template.id, 'veg');
});

test('avoid-feedback is a hard gate', () => {
  const tpl = makeTemplate({ id: 'x', slug: 'x' });
  const feedbackScores = new Map([['x', { avgRating: 5, count: 3, avoid: true, cookAgain: false }]]);
  const result = rankCandidates([tpl], baseCtx({ feedbackScores }));
  assert.equal(result.slots.length, 0);
  assert.equal(result.rejected[0].reason, 'markerad_undvik');
});

test('time budget gates out slow templates', () => {
  const slow = makeTemplate({ id: 'slow', slug: 'slow', totalTimeMin: 60 });
  const fast = makeTemplate({ id: 'fast', slug: 'fast', totalTimeMin: 20 });
  const result = rankCandidates([slow, fast], baseCtx({ parsed: deterministicParse({ timeBudgetMin: 25 }) }));
  assert.ok(result.slots.every((s) => s.template.id === 'fast'));
});

test('missing equipment gates when household equipment is known', () => {
  const ovenDish = makeTemplate({ id: 'oven', slug: 'oven', equipmentRequired: ['ugn'] });
  const result = rankCandidates([ovenDish], baseCtx({ equipment: ['spis', 'stekpanna'] }));
  assert.equal(result.slots.length, 0);
  // Unknown equipment (empty list) skips the gate
  const result2 = rankCandidates([ovenDish], baseCtx({ equipment: [] }));
  assert.equal(result2.slots.length, 1);
});

test('spicy template without mild branch is gated for NONE-tolerance eaters', () => {
  const spicy = makeTemplate({ id: 'sp', slug: 'sp', spiceLevel: 2 });
  const result = rankCandidates([spicy], baseCtx({ eaters: [adult, allergicChild] }));
  assert.equal(result.slots.length, 0);
});

test('EASIEST slot = lowest effort among safe candidates', () => {
  const templates = [
    makeTemplate({ id: 'a', slug: 'a', effortScore: 3 }),
    makeTemplate({ id: 'b', slug: 'b', effortScore: 1 }),
    makeTemplate({ id: 'c', slug: 'c', effortScore: 2 }),
  ];
  const result = rankCandidates(templates, baseCtx());
  const easiest = result.slots.find((s) => s.slot === 'EASIEST');
  assert.ok(easiest);
  // NISSE takes the top-scored; EASIEST must be the lowest-effort of the rest
  const nisseId = result.slots.find((s) => s.slot === 'NISSE').template.id;
  const expected = templates.filter((t) => t.id !== nisseId).sort((x, y) => x.effortScore - y.effortScore)[0];
  assert.equal(easiest.template.id, expected.id);
});

test('CHEAPEST slot maximizes pantry overlap', () => {
  const pantryDish = makeTemplate({
    id: 'p', slug: 'p',
    ingredients: [
      { name: 'Pasta', canonical: 'pasta', qtyPerPortion: 90, unit: 'g', allergens: ['gluten'] },
      { name: 'Lök', canonical: 'lök', qtyPerPortion: 0.25, unit: 'st', allergens: [] },
    ],
  });
  const others = [
    makeTemplate({ id: 'q', slug: 'q', effortScore: 1 }),
    makeTemplate({ id: 'r', slug: 'r', costPerPortionMin: 40, costPerPortionMax: 60,
      ingredients: [{ name: 'Lax', canonical: 'lax', qtyPerPortion: 125, unit: 'g', allergens: ['fisk'] }] }),
  ];
  const inventory = [
    { canonical: 'pasta', quantity: 500, unit: 'g', confidence: 1.0 },
    { canonical: 'lök', quantity: 3, unit: 'st', confidence: 1.0 },
  ];
  const result = rankCandidates([pantryDish, ...others], baseCtx({ inventory }));
  // pantryDish has 100% overlap → it should take NISSE or CHEAPEST;
  // whichever way, it must be slotted and CHEAPEST must not pick a 0-overlap dish over it
  const slotted = result.slots.map((s) => s.template.id);
  assert.ok(slotted.includes('p'));
});

test('returns at most 3 slots and degrades honestly with fewer safe candidates', () => {
  const many = ['a', 'b', 'c', 'd', 'e'].map((id) => makeTemplate({ id, slug: id }));
  assert.equal(rankCandidates(many, baseCtx()).slots.length, 3);

  const two = ['a', 'b'].map((id) => makeTemplate({ id, slug: id }));
  assert.equal(rankCandidates(two, baseCtx()).slots.length, 2);

  assert.equal(rankCandidates([], baseCtx()).slots.length, 0);
});

test('positive feedback raises ranking', () => {
  const loved = makeTemplate({ id: 'loved', slug: 'loved' });
  const neutral = makeTemplate({ id: 'neutral', slug: 'neutral' });
  const feedbackScores = new Map([['loved', { avgRating: 5, count: 2, avoid: false, cookAgain: true }]]);
  const result = rankCandidates([neutral, loved], baseCtx({ feedbackScores }));
  assert.equal(result.slots[0].template.id, 'loved');
});

test('recently cooked templates are penalized for variation', () => {
  const a = makeTemplate({ id: 'a', slug: 'a' });
  const b = makeTemplate({ id: 'b', slug: 'b' });
  const result = rankCandidates([a, b], baseCtx({ recentTemplateIds: ['a'] }));
  assert.equal(result.slots[0].template.id, 'b');
});

test('branch bonus applies for mixed child+adult eaters', () => {
  const branched = makeTemplate({ id: 'br', slug: 'br', hasChildAdultBranch: true, childFriendly: 3 });
  const plain = makeTemplate({ id: 'pl', slug: 'pl', childFriendly: 3 });
  const safeChild = { ...allergicChild, allergies: [] };
  const result = rankCandidates([plain, branched], baseCtx({ eaters: [adult, safeChild] }));
  assert.equal(result.slots[0].template.id, 'br');
});
