// ============================================
// Seed — Nisse recipe templates
// Validates every template against templateSchema,
// verifies the step DAG builds a timeline (both base
// and split mode), computes the allergen union, and
// upserts by slug.
//
// Run: npm run seed:templates
// ============================================

import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { templateSchema, computeAllergenUnion } from '../services/nisse/schemas/templateSchema.js';
import { buildTimeline } from '../services/nisse/engine/timeline.js';

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, '../../prisma/seed-templates');

async function main() {
  const files = (await readdir(TEMPLATE_DIR)).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    throw new Error(`No template files found in ${TEMPLATE_DIR}`);
  }

  let seeded = 0;
  const errors = [];

  for (const file of files.sort()) {
    const raw = JSON.parse(await readFile(path.join(TEMPLATE_DIR, file), 'utf-8'));

    // 1. Schema validation
    const parsed = templateSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`${file}: ${JSON.stringify(parsed.error.flatten().formErrors)} ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
      continue;
    }
    const tpl = parsed.data;

    // 2. Timeline must build without cycles — base mode always,
    //    split mode when the template has branches
    try {
      buildTimeline(tpl.steps, { branch: 'base' });
      if (tpl.hasChildAdultBranch) {
        const split = buildTimeline(tpl.steps, { branch: 'split' });
        if (!split.lanes.includes('child') || !split.lanes.includes('adult')) {
          throw new Error('split timeline saknar child/adult-lane');
        }
      }
    } catch (err) {
      errors.push(`${file}: timeline — ${err.message}`);
      continue;
    }

    // 3. Denormalized allergen union from ingredient declarations
    const allergens = computeAllergenUnion(tpl.ingredients);

    await prisma.recipeTemplate.upsert({
      where: { slug: tpl.slug },
      create: {
        slug: tpl.slug,
        title: tpl.title,
        description: tpl.description,
        tags: tpl.tags,
        difficulty: tpl.difficulty,
        totalTimeMin: tpl.totalTimeMin,
        activeTimeMin: tpl.activeTimeMin,
        passiveTimeMin: tpl.passiveTimeMin,
        servingsBase: tpl.servingsBase,
        costPerPortionMin: tpl.costPerPortionMin,
        costPerPortionMax: tpl.costPerPortionMax,
        childFriendly: tpl.childFriendly,
        effortScore: tpl.effortScore,
        dishLoad: tpl.dishLoad,
        allergens,
        dietaryFlags: tpl.dietaryFlags,
        equipmentRequired: tpl.equipmentRequired,
        spiceLevel: tpl.spiceLevel,
        hasChildAdultBranch: tpl.hasChildAdultBranch,
        ingredients: tpl.ingredients,
        steps: tpl.steps,
        variants: tpl.variants ?? undefined,
        version: tpl.version,
      },
      update: {
        title: tpl.title,
        description: tpl.description,
        tags: tpl.tags,
        difficulty: tpl.difficulty,
        totalTimeMin: tpl.totalTimeMin,
        activeTimeMin: tpl.activeTimeMin,
        passiveTimeMin: tpl.passiveTimeMin,
        servingsBase: tpl.servingsBase,
        costPerPortionMin: tpl.costPerPortionMin,
        costPerPortionMax: tpl.costPerPortionMax,
        childFriendly: tpl.childFriendly,
        effortScore: tpl.effortScore,
        dishLoad: tpl.dishLoad,
        allergens,
        dietaryFlags: tpl.dietaryFlags,
        equipmentRequired: tpl.equipmentRequired,
        spiceLevel: tpl.spiceLevel,
        hasChildAdultBranch: tpl.hasChildAdultBranch,
        ingredients: tpl.ingredients,
        steps: tpl.steps,
        variants: tpl.variants ?? undefined,
        version: tpl.version,
        isActive: true,
      },
    });

    console.log(`✅ ${tpl.slug} (${allergens.length ? allergens.join(', ') : 'inga allergener'})`);
    seeded++;
  }

  if (errors.length > 0) {
    console.error('\n❌ Valideringsfel:');
    for (const e of errors) console.error('  -', e);
    process.exit(1);
  }

  console.log(`\n${seeded} receptmallar seedade.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
