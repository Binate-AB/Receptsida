// ============================================
// Tests — seed template content quality gate
// Every template in prisma/seed-templates/ must
// pass the schema and build a valid timeline.
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { templateSchema, computeAllergenUnion } from '../../src/services/nisse/schemas/templateSchema.js';
import { buildTimeline } from '../../src/services/nisse/engine/timeline.js';
import { ingredientAllergens } from '../../src/services/nisse/engine/allergens.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, '../../prisma/seed-templates');

const files = (await readdir(TEMPLATE_DIR)).filter((f) => f.endsWith('.json'));

test('there are at least 10 seed templates', () => {
  assert.ok(files.length >= 10, `found only ${files.length}`);
});

for (const file of files) {
  const raw = JSON.parse(await readFile(path.join(TEMPLATE_DIR, file), 'utf-8'));

  test(`${file}: validates against templateSchema`, () => {
    const parsed = templateSchema.safeParse(raw);
    assert.ok(
      parsed.success,
      parsed.success ? '' : JSON.stringify(parsed.error.flatten(), null, 2)
    );
  });

  test(`${file}: builds a cycle-free timeline`, () => {
    const tpl = templateSchema.parse(raw);
    const base = buildTimeline(tpl.steps, { branch: 'base' });
    assert.ok(base.totalMin > 0);
    if (tpl.hasChildAdultBranch) {
      const split = buildTimeline(tpl.steps, { branch: 'split' });
      assert.ok(split.lanes.includes('child') && split.lanes.includes('adult'));
      const laneEnd = (lane) =>
        Math.max(...split.steps.filter((s) => s.lane === lane).map((s) => s.endMin));
      assert.equal(laneEnd('child'), laneEnd('adult'), 'lanes must finish together');
    }
  });

  test(`${file}: declared timing is consistent with the timeline`, () => {
    const tpl = templateSchema.parse(raw);
    const mode = tpl.hasChildAdultBranch ? 'split' : 'base';
    const tl = buildTimeline(tpl.steps, { branch: mode });
    // totalTimeMin should be within ±40% of the computed timeline
    assert.ok(
      Math.abs(tl.totalMin - tpl.totalTimeMin) <= tpl.totalTimeMin * 0.4,
      `computed ${tl.totalMin} vs declared ${tpl.totalTimeMin}`
    );
  });

  test(`${file}: no ingredient with known allergens is missing declarations`, () => {
    const tpl = templateSchema.parse(raw);
    for (const ing of tpl.ingredients) {
      const fallback = ingredientAllergens(ing.canonical);
      for (const code of fallback) {
        assert.ok(
          (ing.allergens || []).includes(code),
          `${ing.canonical} should declare allergen "${code}"`
        );
      }
    }
  });

  test(`${file}: allergen union is computable`, () => {
    const tpl = templateSchema.parse(raw);
    const union = computeAllergenUnion(tpl.ingredients);
    assert.ok(Array.isArray(union));
  });
}
