// ============================================
// Tests — coverage matrix gate (§21)
// (a) The SEED SET (all non-retired templates,
//     DRAFT included) must satisfy the matrix —
//     blocking immediately: the repo may not
//     regress below the published coverage.
// (b) The VERIFIED POOL must satisfy the matrix —
//     reporting until 2026-07-31, BLOCKING from
//     2026-08-01 (decision: Jonas, 2026-07-15).
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { templateSchema } from '../../src/services/nisse/schemas/templateSchema.js';
import {
  coverageReport,
  templateCells,
  requestCell,
  countFilterKinds,
} from '../../src/services/nisse/engine/coverage.js';

// Hardcoded strictness date — documented in docs/NISSE_DISH_COVERAGE_MATRIX.md.
const VERIFIED_POOL_STRICT_FROM = '2026-08-01';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, '../../prisma/seed-templates');

const files = (await readdir(TEMPLATE_DIR)).filter((f) => f.endsWith('.json'));
const templates = [];
for (const file of files) {
  templates.push(templateSchema.parse(JSON.parse(await readFile(path.join(TEMPLATE_DIR, file), 'utf-8'))));
}
const active = templates.filter((t) => t.verificationStatus !== 'RETIRED');
const verified = templates.filter((t) => t.verificationStatus === 'VERIFIED');

test('cell classification: derived + honestly claimed cells', () => {
  assert.deepEqual(templateCells({ totalTimeMin: 12, effortScore: 1 }), ['A1']);
  assert.deepEqual(templateCells({ totalTimeMin: 25, effortScore: 3 }), ['B2']);
  assert.deepEqual(templateCells({ totalTimeMin: 40, effortScore: 1 }), ['C1']);
  // Claimed extra cell is unioned in, junk claims are dropped
  assert.deepEqual(
    templateCells({ totalTimeMin: 20, effortScore: 1, coverageCells: ['A1', 'X9'] }),
    ['B1', 'A1']
  );
});

test('requestCell maps the parsed situation to a cell', () => {
  assert.equal(requestCell({ timeBudgetMin: 15, energy: 'slut' }), 'A1');
  assert.equal(requestCell({ timeBudgetMin: 45, energy: 'normal' }), 'C2');
  assert.equal(requestCell({}), 'B2'); // no budget → default 30 min, normal energy
});

test('countFilterKinds never leaks which allergen or member', () => {
  const kinds = countFilterKinds([
    { reason: 'allergi: gluten (Liv)' },
    { reason: 'allergi: mjölkprotein (Liv)' },
    { reason: 'kost: vegetarisk (Sam)' },
    { reason: 'saknar utrustning: ugn' },
    { reason: 'för lång tid (45 min)' },
    { reason: 'markerad_undvik' },
  ]);
  assert.deepEqual(kinds, { allergen: 2, dietary: 1, equipment: 1, time: 1, other: 1 });
  // The profile is counters only — statically assert the shape has no strings
  assert.ok(Object.values(kinds).every((v) => typeof v === 'number'));
});

test('SEED SET satisfies the coverage matrix (blocking)', () => {
  const report = coverageReport(active);
  assert.deepEqual(
    report.failures,
    [],
    'Täckningsmatrisen håller inte:\n  - ' + report.failures.join('\n  - ')
  );
});

test(`VERIFIED POOL satisfies the matrix (blocking from ${VERIFIED_POOL_STRICT_FROM})`, () => {
  const report = coverageReport(verified);
  const strict = new Date().toISOString().slice(0, 10) >= VERIFIED_POOL_STRICT_FROM;
  if (report.failures.length > 0 && !strict) {
    console.warn(
      `⚠️ Verified-pool-täckning (rapporterande t.o.m. 2026-07-31, blockerande fr.o.m. ${VERIFIED_POOL_STRICT_FROM}):\n  - ` +
        report.failures.join('\n  - ')
    );
    return;
  }
  assert.deepEqual(
    report.failures,
    [],
    'Verified-poolens täckning håller inte (blockerande sedan ' +
      `${VERIFIED_POOL_STRICT_FROM}):\n  - ` +
      report.failures.join('\n  - ')
  );
});
