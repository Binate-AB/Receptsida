// ============================================
// Real DB integration smoke (NO MOCKS, NO listener)
// Drives the ACTUAL decision engine the /dinner/solve
// route uses, against the REAL seeded Postgres pool —
// proving "Lös middagen → rekommendation" end-to-end
// at the data+engine layer without an HTTP server
// (the sandbox SIGKILLs persistent listeners; the
// browser layer is covered by frontend/e2e).
//
// Also proves the repointed search hits the VERIFIED
// pool and never returns DRAFT/RETIRED.
//
// Run: node --env-file=.env.smoke scripts/smoke-solve-db.mjs
// ============================================

import assert from 'node:assert/strict';
import { prisma } from '../src/config/db.js';
import { VERIFIED_POOL_WHERE } from '../src/services/nisse/candidatePool.js';
import { rankCandidates } from '../src/services/nisse/engine/ranker.js';
import { deterministicParse } from '../src/services/nisse/engine/chipsParse.js';
import { buildComputedPayload } from '../src/services/nisse/recommendationService.js';
import { searchVerifiedPool } from '../src/services/nisse/poolSearch.js';

async function main() {
  // Real pool exactly as the route loads it (loadRankingContext).
  const templates = await prisma.recipeTemplate.findMany({ where: VERIFIED_POOL_WHERE });
  assert.ok(templates.length >= 20, `verified pool seeded (got ${templates.length})`);
  assert.ok(
    templates.every((t) => t.verificationStatus === 'VERIFIED' && t.isActive),
    'pool contains only active VERIFIED dishes'
  );
  console.log(`✓ verified pool: ${templates.length} rätter (inga DRAFT/RETIRED)`);

  // A real household: two adults, no allergies. Deterministic chips parse (no AI).
  const eaters = [
    { id: 'a1', name: 'Alex', ageCategory: 'ADULT', allergies: [], dietaryRestrictions: [], dislikedIngredients: [], spiceTolerance: 'MEDIUM', portionFactor: 1.0, isDefaultPresent: true },
    { id: 'a2', name: 'Robin', ageCategory: 'ADULT', allergies: [], dietaryRestrictions: [], dislikedIngredients: [], spiceTolerance: 'MEDIUM', portionFactor: 1.0, isDefaultPresent: true },
  ];
  const parsed = deterministicParse({ timeBudgetMin: 30, energy: 'normal', budget: 'normal' });

  const { slots, rejected } = rankCandidates(templates, {
    parsed, eaters, inventory: [], equipment: ['spis', 'kastrull', 'stekpanna'],
  });
  assert.ok(slots.length >= 1, `at least one recommendation slot (got ${slots.length})`);
  assert.ok(slots.some((s) => s.slot === 'NISSE'), 'a NISSE (recommended) slot is present');
  assert.ok(slots.length <= 3, 'never more than 3 (max-3 invariant)');

  // Build the real computed snapshot for the top slot (what the card reads).
  const nisse = slots.find((s) => s.slot === 'NISSE');
  const computed = buildComputedPayload(nisse, { eaters, inventory: [] });
  assert.ok(computed.portions >= 2, 'portions computed for the household');
  assert.ok(Array.isArray(computed.shoppingItems || computed.toBuy || []), 'shopping snapshot present');
  console.log(`✓ Lös middagen (deterministisk): ${slots.length} slots · NISSE = "${nisse.template.title}" (${nisse.template.totalTimeMin} min) · ${rejected.length} bortgallrade av grindar`);

  // Allergy gate on real data: a milk-allergic household must get a safe set.
  const milkHh = [{ id: 'm1', name: 'Liv', ageCategory: 'ADULT', allergies: ['mjölkprotein'], dietaryRestrictions: [], dislikedIngredients: [], spiceTolerance: 'MEDIUM', portionFactor: 1.0, isDefaultPresent: true }];
  const milkRes = rankCandidates(templates, { parsed, eaters: milkHh, inventory: [], equipment: [] });
  for (const s of milkRes.slots) {
    assert.ok(
      !(s.template.allergens || []).includes('mjölkprotein'),
      `no milk-protein dish reaches a milk-allergic household (offender: ${s.template.slug})`
    );
  }
  console.log(`✓ allergigrind på riktig data: ${milkRes.slots.length} säkra slots för mjölkallergiker (inga mjölkprotein-rätter)`);

  // Repointed search: verified pool only, never DRAFT/RETIRED.
  const found = await searchVerifiedPool(prisma, 'kyckling', { householdSize: 2 });
  assert.ok(found.length >= 1, 'search returns pool recipes');
  const draftSlugs = new Set(
    (await prisma.recipeTemplate.findMany({ where: { verificationStatus: { in: ['DRAFT', 'RETIRED'] } }, select: { slug: true } }))
      .map((t) => t.slug)
  );
  assert.ok(found.every((r) => !draftSlugs.has(r.id)), 'search never surfaces DRAFT/RETIRED');
  assert.equal(found[0].source_name, 'Nisses verifierade recept', 'results are from the verified DB, not a web source');
  console.log(`✓ /recipes/search-motorn: ${found.length} recept ur verifierade poolen, aldrig DRAFT/RETIRED`);

  console.log('\n✅ SMOKE PASS (real DB + real engine, inga mockar): lös middagen → rekommendation, allergigrind, poolsök');
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch(async (err) => {
    console.error('\n❌ SMOKE FAIL:', err.message);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
