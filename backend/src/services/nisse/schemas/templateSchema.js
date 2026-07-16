// ============================================
// Nisse — Recipe template schema (Zod)
// Single source of truth for template structure,
// shared by the seed script, the engine and tests.
// ============================================

import { z } from 'zod';
import { ALLERGEN_CODES, DIETARY_RESTRICTIONS, EQUIPMENT_CODES } from '../engine/allergens.js';
import { KNOWN_UNITS } from '../engine/units.js';

export const AISLES = [
  'Kött & Fisk',
  'Mejeri',
  'Frukt & Grönt',
  'Torrvaror & Pasta',
  'Konserver & Såser',
  'Kryddor & Smaksättare',
  'Oljor & Vinäger',
  'Bröd',
  'Frys',
  'Övrigt',
];

const substitutionSchema = z.object({
  name: z.string().min(1),
  canonical: z.string().min(1),
  note: z.string().optional(),
  allergens: z.array(z.enum(ALLERGEN_CODES)).optional().default([]),
  // Three-state model: allergens whose presence VARIES by brand
  // (e.g. vegetarian sausage: soy declared, gluten varies). The hard
  // gate treats varies as CONTAINS — conservative, never unsafe.
  allergensVary: z.array(z.enum(ALLERGEN_CODES)).optional().default([]),
});

export const templateIngredientSchema = z.object({
  name: z.string().min(1),
  canonical: z.string().min(1),
  qtyPerPortion: z.number().positive(),
  unit: z.enum(KNOWN_UNITS),
  group: z.enum(['bas', 'barn', 'vuxen']).optional().default('bas'),
  optional: z.boolean().optional().default(false),
  // Avgörande ingrediens — dish cannot reasonably be cooked without it.
  // Unset → derived: required and not a pantry staple (see engine/uncertainty.js).
  critical: z.boolean().optional(),
  // Three-state model per allergen: CONTAINS (allergens[]), FREE (absent
  // from both lists) or VARIES BY BRAND (allergensVary[]). Store-bought
  // products like meatballs or spice mixes differ per brand — varies is
  // the honest answer, and the hard gate treats it as contains.
  allergensVary: z.array(z.enum(ALLERGEN_CODES)).optional().default([]),
  allergens: z.array(z.enum(ALLERGEN_CODES)).optional().default([]),
  aisle: z.enum(AISLES).optional().default('Övrigt'),
  // Approximate SEK cost of buying this item once (smallest sensible pack)
  estPriceSek: z.number().int().positive().max(500).optional(),
  // Pantry staples (salt, oil) the household almost certainly has
  pantryStaple: z.boolean().optional().default(false),
  substitutions: z.array(substitutionSchema).optional().default([]),
});

export const templateStepSchema = z.object({
  id: z.string().regex(/^s\d+$/, 'Steg-id ska vara s1, s2, ...'),
  branch: z.enum(['base', 'child', 'adult']).optional().default('base'),
  // Optional steps can be dropped by the behind-schedule replan
  // (garnish, extra polish) — never load-bearing cooking steps.
  optional: z.boolean().optional().default(false),
  text: z.string().min(5),
  voiceCue: z.string().min(5),
  durationMin: z.number().int().min(0).max(240),
  activeMin: z.number().int().min(0).max(240).optional(),
  dependsOn: z.array(z.string()).optional().default([]),
  timerNeeded: z.boolean().optional().default(false),
  equipment: z.array(z.enum(EQUIPMENT_CODES)).optional().default([]),
  warning: z.string().nullable().optional(),
  beginnerTip: z.string().nullable().optional(),
});

export const templateSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(3).max(100),
    description: z.string().min(10).max(500),
    tags: z.array(z.string()).max(10).default([]),
    difficulty: z.enum(['Enkel', 'Medel', 'Avancerad']).default('Enkel'),
    totalTimeMin: z.number().int().min(5).max(240),
    activeTimeMin: z.number().int().min(1).max(240),
    passiveTimeMin: z.number().int().min(0).max(240).default(0),
    servingsBase: z.number().int().min(1).max(12).default(4),
    costPerPortionMin: z.number().int().min(1).max(500),
    costPerPortionMax: z.number().int().min(1).max(500),
    childFriendly: z.number().int().min(0).max(3).default(2),
    effortScore: z.number().int().min(1).max(5).default(2),
    dishLoad: z.number().int().min(1).max(5).default(2),
    dietaryFlags: z.array(z.enum(DIETARY_RESTRICTIONS)).default([]),
    equipmentRequired: z.array(z.enum(EQUIPMENT_CODES)).default([]),
    spiceLevel: z.number().int().min(0).max(3).default(0),
    hasChildAdultBranch: z.boolean().default(false),
    // How well the dish survives uncertain pantry, a missing ingredient,
    // less time than planned, child adaptation and simple substitutions (1-5)
    robustness: z.number().int().min(1).max(5).default(3),
    ingredients: z.array(templateIngredientSchema).min(2),
    steps: z.array(templateStepSchema).min(2),
    variants: z
      .object({
        child: z.object({ label: z.string(), note: z.string().optional() }).optional(),
        adult: z.object({ label: z.string(), note: z.string().optional() }).optional(),
      })
      .nullable()
      .optional(),
    version: z.number().int().min(1).default(1),
  })
  .superRefine((tpl, ctx) => {
    if (tpl.costPerPortionMax < tpl.costPerPortionMin) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'costPerPortionMax < costPerPortionMin' });
    }
    const stepIds = new Set(tpl.steps.map((s) => s.id));
    if (stepIds.size !== tpl.steps.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Dubblerade steg-id' });
    }
    for (const step of tpl.steps) {
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Steg ${step.id} beror på okänt steg ${dep}`,
          });
        }
      }
      if (step.activeMin != null && step.activeMin > step.durationMin) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Steg ${step.id}: activeMin > durationMin`,
        });
      }
    }
    // Conservative consistency: a dietary flag may not contradict the
    // allergen declarations (contains ∪ varies) of any REQUIRED ingredient.
    // "Varies by brand" is not free — the flag must go, or the recipe must
    // require the safe variant explicitly (e.g. "glutenfria köttbullar").
    const FLAG_CONFLICTS = { glutenfri: 'gluten', laktosfri: 'laktos' };
    for (const [flag, allergen] of Object.entries(FLAG_CONFLICTS)) {
      if (!tpl.dietaryFlags.includes(flag)) continue;
      for (const ing of tpl.ingredients) {
        if (ing.optional) continue;
        const declared = new Set([...(ing.allergens || []), ...(ing.allergensVary || [])]);
        if (declared.has(allergen)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `dietaryFlag "${flag}" motsäger ${ing.name} (${allergen} i innehåller/varierar)`,
          });
        }
      }
    }

    const hasChild = tpl.steps.some((s) => s.branch === 'child');
    const hasAdult = tpl.steps.some((s) => s.branch === 'adult');
    if (tpl.hasChildAdultBranch && !(hasChild && hasAdult)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'hasChildAdultBranch kräver steg i både child- och adult-gren',
      });
    }
    if (!tpl.hasChildAdultBranch && (hasChild || hasAdult)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Gren-steg finns men hasChildAdultBranch är false',
      });
    }
  });

/**
 * Compute the denormalized template-level allergen union from
 * ingredient declarations (used by the seed script). CONSERVATIVE:
 * includes allergens that VARY by brand — the union feeds the hard
 * gate, and varies must block just like contains.
 */
export function computeAllergenUnion(ingredients) {
  const union = new Set();
  for (const ing of ingredients) {
    for (const code of ing.allergens || []) union.add(code);
    for (const code of ing.allergensVary || []) union.add(code);
  }
  return [...union].sort();
}
