// ============================================
// Tests — verification gate (§22/§23)
// DRAFT/RETIRED dishes must never reach the
// candidate pool: schema rules, grandfather
// stamping of the signed-off 24, and a source
// lock on every pool query site.
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { templateSchema } from '../../src/services/nisse/schemas/templateSchema.js';
import { VERIFIED_POOL_WHERE, isInCandidatePool } from '../../src/services/nisse/candidatePool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, '../../prisma/seed-templates');
const SRC_DIR = path.join(__dirname, '../../src');

// ── Schema rules ─────────────────────────────

const minimalTemplate = (over = {}) => ({
  slug: 'testratt',
  title: 'Testrätt',
  description: 'En rätt som bara finns i tester.',
  totalTimeMin: 20,
  activeTimeMin: 10,
  costPerPortionMin: 10,
  costPerPortionMax: 20,
  ingredients: [
    { name: 'Ris', canonical: 'ris', qtyPerPortion: 0.75, unit: 'dl' },
    { name: 'Morot', canonical: 'morot', qtyPerPortion: 1, unit: 'st' },
  ],
  steps: [
    { id: 's1', text: 'Koka riset enligt paketet.', voiceCue: 'Koka riset.', durationMin: 15 },
    { id: 's2', text: 'Riv moroten och servera.', voiceCue: 'Riv moroten.', durationMin: 3 },
  ],
  ...over,
});

test('a template without verification fields defaults to DRAFT', () => {
  const parsed = templateSchema.parse(minimalTemplate());
  assert.equal(parsed.verificationStatus, 'DRAFT');
});

test('VERIFIED without a named reviewer + date is rejected', () => {
  assert.equal(
    templateSchema.safeParse(minimalTemplate({ verificationStatus: 'VERIFIED' })).success,
    false
  );
  assert.equal(
    templateSchema.safeParse(
      minimalTemplate({ verificationStatus: 'VERIFIED', verifiedAt: '2026-07-29' })
    ).success,
    false,
    'verifiedBy saknas'
  );
  assert.equal(
    templateSchema.safeParse(
      minimalTemplate({ verificationStatus: 'VERIFIED', verifiedAt: '2026-07-29', verifiedBy: 'Jonas' })
    ).success,
    true
  );
});

// ── Grandfather: the signed-off 24 ───────────

// The 24 dishes covered by the G0 allergen-review sign-off (Jonas, 2026-07-29).
const GRANDFATHERED = new Set([
  'chili-sin-carne', 'falukorv-i-ugn', 'fiskpinnar-med-mos', 'gronsakssoppa',
  'halloumiwok', 'korv-stroganoff', 'korvgryta-med-pasta', 'kottbullar-potatismos',
  'kramig-kycklingpasta', 'kyckling-fajitas', 'kyckling-rotfrukter-ugn', 'kycklinggryta',
  'laxpasta', 'linssoppa', 'pannkakor', 'pasta-carbonara', 'pasta-kottfarssas',
  'pyttipanna', 'tacogryta', 'tom-kylen-omelett', 'tonfiskpasta', 'ugnsbakad-lax',
  'ugnspannkaka', 'vegetarisk-tacos',
]);

test('grandfathered dishes are VERIFIED; dishes added later must be human-verified first', async () => {
  const files = (await readdir(TEMPLATE_DIR)).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 24, `found only ${files.length}`);
  const seenGrandfathered = new Set();
  for (const file of files) {
    const tpl = templateSchema.parse(
      JSON.parse(await readFile(path.join(TEMPLATE_DIR, file), 'utf-8'))
    );
    if (GRANDFATHERED.has(tpl.slug)) {
      seenGrandfathered.add(tpl.slug);
      assert.equal(tpl.verificationStatus, 'VERIFIED', `${file} är inte VERIFIED`);
      assert.ok(tpl.verifiedAt && tpl.verifiedBy, `${file} saknar verifiedAt/verifiedBy`);
    } else if (tpl.verificationStatus === 'VERIFIED') {
      // A later dish may only be VERIFIED with an explicit human stamp
      assert.ok(
        tpl.verifiedAt && tpl.verifiedBy,
        `${file}: VERIFIED utan mänsklig granskare/datum`
      );
    }
  }
  assert.equal(seenGrandfathered.size, GRANDFATHERED.size, 'en grandfathrad rätt saknas i seeds');
});

// ── Pool gate semantics ──────────────────────

test('isInCandidatePool admits only active VERIFIED templates', () => {
  assert.equal(isInCandidatePool({ isActive: true, verificationStatus: 'VERIFIED' }), true);
  assert.equal(isInCandidatePool({ isActive: true, verificationStatus: 'DRAFT' }), false);
  assert.equal(isInCandidatePool({ isActive: true, verificationStatus: 'RETIRED' }), false);
  assert.equal(isInCandidatePool({ isActive: false, verificationStatus: 'VERIFIED' }), false);
  assert.equal(isInCandidatePool(null), false);
});

test('VERIFIED_POOL_WHERE is frozen and filters on both isActive and verificationStatus', () => {
  assert.deepEqual(VERIFIED_POOL_WHERE, { isActive: true, verificationStatus: 'VERIFIED' });
  assert.ok(Object.isFrozen(VERIFIED_POOL_WHERE));
});

// ── Source lock: every pool query site uses the gate ──
// recipeTemplate.findMany with a bare { isActive: true } filter would let
// DRAFT/RETIRED dishes into recommendations/onboarding. Lock the call sites.

test('no route selects templates without the verification gate', async () => {
  const offenders = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const src = await readFile(full, 'utf-8');
      // Every findMany on recipeTemplate must reference the shared gate.
      const findManyCalls = src.match(/recipeTemplate\.findMany\(/g) || [];
      if (findManyCalls.length > 0 && !src.includes('VERIFIED_POOL_WHERE')) {
        offenders.push(full);
      }
      // findUnique by slug (user-facing start) must be gated by isInCandidatePool.
      if (src.includes("findUnique({ where: { slug:") && !src.includes('isInCandidatePool')) {
        offenders.push(full + ' (slug lookup)');
      }
    }
  }
  await walk(path.join(SRC_DIR, 'routes'));
  assert.deepEqual(offenders, [], `pool-grinden saknas i: ${offenders.join(', ')}`);
});
