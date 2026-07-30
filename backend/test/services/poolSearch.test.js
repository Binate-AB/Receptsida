// ============================================
// Tests — deterministic verified-pool search
// The legacy /recipes/search replacement must
// (a) only ever surface VERIFIED dishes,
// (b) rank by textual relevance,
// (c) map to the legacy recipe shape RecipeCard reads.
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchVerifiedPool, templateToLegacyRecipe } from '../../src/services/nisse/poolSearch.js';
import { VERIFIED_POOL_WHERE } from '../../src/services/nisse/candidatePool.js';

const tpl = (over = {}) => ({
  slug: 'x', title: 'Rätt', description: 'En rätt att laga.', tags: [],
  totalTimeMin: 20, activeTimeMin: 10, passiveTimeMin: 0, servingsBase: 4,
  costPerPortionMin: 10, costPerPortionMax: 20, childFriendly: 2, effortScore: 2,
  dishLoad: 2, robustness: 3, difficulty: 'Enkel', equipmentRequired: ['spis'],
  dietaryFlags: [], spiceLevel: 0, hasChildAdultBranch: false,
  ingredients: [{ name: 'Ris', canonical: 'ris', qtyPerPortion: 0.75, unit: 'dl' }],
  steps: [{ id: 's1', branch: 'base', text: 'Koka riset.', voiceCue: 'Koka.', durationMin: 10 }],
  ...over,
});

// Fake prisma that records the where-clause and returns a fixed pool.
function fakePrisma(pool) {
  const state = { _lastWhere: null };
  state.recipeTemplate = {
    findMany(args) {
      state._lastWhere = args?.where;
      // Honour the gate the way the DB would: only rows matching the where.
      return Promise.resolve(pool.filter((t) =>
        (args.where.isActive === undefined || t.isActive === args.where.isActive) &&
        (args.where.verificationStatus === undefined || t.verificationStatus === args.where.verificationStatus)
      ));
    },
  };
  return state;
}

const POOL = [
  tpl({ slug: 'kycklinggryta', title: 'Krämig kycklinggryta', tags: ['barnfavorit'],
        ingredients: [{ name: 'Kyckling', canonical: 'kyckling', qtyPerPortion: 125, unit: 'g' }],
        verificationStatus: 'VERIFIED', isActive: true, childFriendly: 3 }),
  tpl({ slug: 'laxpasta', title: 'Laxpasta', tags: ['fisk', 'pasta'],
        ingredients: [{ name: 'Lax', canonical: 'lax', qtyPerPortion: 100, unit: 'g' }],
        verificationStatus: 'VERIFIED', isActive: true, childFriendly: 2 }),
  tpl({ slug: 'draft-dish', title: 'Kycklingbowl', tags: ['barnvänligt'],
        ingredients: [{ name: 'Kyckling', canonical: 'kyckling', qtyPerPortion: 125, unit: 'g' }],
        verificationStatus: 'DRAFT', isActive: true, childFriendly: 3 }),
  tpl({ slug: 'retired-dish', title: 'Gammal kyckling', verificationStatus: 'RETIRED', isActive: true }),
];

test('search queries with the VERIFIED_POOL_WHERE gate', async () => {
  const prisma = fakePrisma(POOL);
  await searchVerifiedPool(prisma, 'kyckling');
  assert.deepEqual(prisma._lastWhere, VERIFIED_POOL_WHERE);
});

test('DRAFT and RETIRED dishes never surface, even on a matching query', async () => {
  const prisma = fakePrisma(POOL);
  const results = await searchVerifiedPool(prisma, 'kyckling');
  const slugs = results.map((r) => r.id);
  assert.ok(slugs.includes('kycklinggryta'), 'verified kyckling dish present');
  assert.ok(!slugs.includes('draft-dish'), 'DRAFT kycklingbowl must be hidden');
  assert.ok(!slugs.includes('retired-dish'), 'RETIRED dish must be hidden');
});

test('ranks textual matches above non-matches', async () => {
  const prisma = fakePrisma(POOL);
  const results = await searchVerifiedPool(prisma, 'lax pasta');
  assert.equal(results[0].id, 'laxpasta', 'best title/tag match ranks first');
});

test('a query with no textual hit still returns a non-empty spread', async () => {
  const prisma = fakePrisma(POOL);
  const results = await searchVerifiedPool(prisma, 'vad ska vi äta ikväll');
  assert.ok(results.length > 0, 'never blank');
  // Only verified dishes, ordered by child-friendliness
  assert.ok(results.every((r) => r.id !== 'draft-dish' && r.id !== 'retired-dish'));
});

test('maps to the legacy recipe shape RecipeCard reads', () => {
  const recipe = templateToLegacyRecipe(tpl({ title: 'Testrätt' }), 4);
  assert.equal(recipe.title, 'Testrätt');
  assert.equal(recipe.time_minutes, 20);
  assert.equal(recipe.servings, 4);
  assert.match(recipe.cost_estimate, /kr\/port$/);
  assert.equal(recipe.source_name, 'Nisses verifierade recept');
  assert.ok(Array.isArray(recipe.ingredients) && recipe.ingredients[0].name === 'Ris');
  assert.ok(Array.isArray(recipe.steps) && typeof recipe.steps[0].text === 'string');
  assert.ok(Array.isArray(recipe.tools));
});

test('ingredient amounts scale to household size (Swedish decimal comma)', () => {
  // 0.75 dl/portion × 8 → 6 dl
  const recipe = templateToLegacyRecipe(tpl(), 8);
  assert.equal(recipe.ingredients[0].amount, '6 dl');
});
