// ============================================
// Nisse AI — Output schemas (Zod)
// Every AI response is validated against these before
// the system touches it. Invalid output → retry once →
// deterministic fallback. AI output is NEVER trusted raw.
// ============================================

import { z } from 'zod';

/**
 * Parsed meal situation — MUST stay in sync with the
 * deterministic shape in engine/chipsParse.js.
 */
export const parsedMealRequestSchema = z.object({
  timeBudgetMin: z.number().int().min(10).max(240).nullable(),
  energy: z.enum(['slut', 'låg', 'normal', 'inspirerad']),
  budget: z.enum(['snålt', 'normal', 'flexibelt']),
  eaterIds: z.array(z.string()).nullable(),
  cravings: z.array(z.string().max(50)).max(10),
  avoidIngredients: z.array(z.string().max(50)).max(10),
  occasion: z.enum(['vardag', 'helg', 'gäster', 'matlådor']),
  wantsLeftovers: z.boolean(),
  notes: z.string().max(300).nullable(),
  confidence: z.number().min(0).max(1),
});

/**
 * Slot motivations — short Swedish copy per recommendation card.
 */
export const motivationsSchema = z.object({
  items: z
    .array(
      z.object({
        slot: z.enum(['NISSE', 'EASIEST', 'CHEAPEST']),
        motivation: z.string().min(10).max(300),
      })
    )
    .min(1)
    .max(3),
});

/**
 * Rescue help — practical fixes for a cooking problem.
 */
export const rescueSchema = z.object({
  assessment: z.string().min(5).max(300),
  actions: z
    .array(
      z.object({
        text: z.string().min(5).max(200),
        urgent: z.boolean(),
      })
    )
    .min(1)
    .max(4),
  voiceCue: z.string().min(5).max(300),
});
