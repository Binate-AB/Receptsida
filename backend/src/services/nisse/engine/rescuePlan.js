// ============================================
// Nisse Engine — Deterministic cooking rescue plans
// "Jag saknar något" and "Jag ligger efter".
// Pure functions, no AI, no I/O. Substitutions are
// validated against member allergies — they can
// NEVER bypass the allergen gate.
// ============================================

import { buildTimeline } from './timeline.js';

/**
 * Resolve a missing ingredient deterministically, in priority order:
 * 1. a curated substitution that is safe for every member
 * 2. simplification — the ingredient is optional, skip it
 * 3. fallback plan — the dish can't safely proceed without it
 *
 * Conservative safety: substitutions are gated against ALL given
 * members' allergies (not just tonight's eaters) — never unsafe.
 *
 * @param {object} template — RecipeTemplate row (ingredients JSON with substitutions)
 * @param {string} canonical — the missing ingredient
 * @param {Array<object>} members — household members ({ allergies: string[] })
 * @returns {{ resolution: 'substitution'|'simplify'|'fallback_plan',
 *             ingredient: {name, canonical}|null,
 *             substitute: {name, canonical, note}|null,
 *             message: string }}
 */
export function resolveMissingIngredient(template, canonical, members) {
  const ingredient = (template.ingredients || []).find((i) => i.canonical === canonical);

  if (!ingredient) {
    return {
      resolution: 'simplify',
      ingredient: null,
      substitute: null,
      message: 'Den varan är inte avgörande för receptet — fortsätt utan den.',
    };
  }

  const allergySet = new Set((members || []).flatMap((m) => m.allergies || []));

  // 1. Safe curated substitution
  const safeSub = (ingredient.substitutions || []).find(
    (sub) => !(sub.allergens || []).some((a) => allergySet.has(a))
  );
  if (safeSub) {
    return {
      resolution: 'substitution',
      ingredient: { name: ingredient.name, canonical },
      substitute: { name: safeSub.name, canonical: safeSub.canonical, note: safeSub.note || null },
      message: `Använd ${safeSub.name} i stället för ${ingredient.name.toLowerCase()}${
        safeSub.note ? ` — ${safeSub.note.toLowerCase()}` : ''
      }. Ingen fara, det funkar.`,
    };
  }

  // 2. Optional ingredient → skip it
  if (ingredient.optional) {
    return {
      resolution: 'simplify',
      ingredient: { name: ingredient.name, canonical },
      substitute: null,
      message: `${ingredient.name} är valfri — hoppa över den. Rätten blir bra ändå.`,
    };
  }

  // 3. No safe path with this dish
  return {
    resolution: 'fallback_plan',
    ingredient: { name: ingredient.name, canonical },
    substitute: null,
    message: `${ingredient.name} är avgörande och saknar säkert byte här. Ingen fara — be Nisse lösa middagen igen så föreslår jag något som funkar med det ni har.`,
  };
}

/**
 * Deterministically replan the REMAINING steps when the cook is
 * behind schedule: drop optional steps, re-pack what's left with
 * the same DAG scheduler (parallelizing where possible) and return
 * a new realistic finish time.
 *
 * @param {Array<object>} templateSteps — template step JSON (DAG with dependsOn)
 * @param {Set<string>} completedIds — step ids already done
 * @param {object} options — { branch: 'base'|'split' }
 * @returns {{ steps: Array<object>, newEtaMin: number, skipped: Array<{id, text}> }}
 */
export function replanRemaining(templateSteps, completedIds, options = {}) {
  const remaining = (templateSteps || []).filter((s) => !completedIds.has(s.id));

  const kept = remaining.filter((s) => !s.optional);
  const skipped = remaining
    .filter((s) => s.optional)
    .map((s) => ({ id: s.id, text: s.text }));

  const keptIds = new Set(kept.map((s) => s.id));
  // Completed and skipped dependencies are satisfied — keep only
  // dependencies that still exist in the remaining plan.
  const adjusted = kept.map((s) => ({
    ...s,
    dependsOn: (s.dependsOn || []).filter((d) => keptIds.has(d)),
  }));

  if (adjusted.length === 0) {
    return { steps: [], newEtaMin: 0, skipped };
  }

  const timeline = buildTimeline(adjusted, { branch: options.branch || 'base' });
  return { steps: timeline.steps, newEtaMin: timeline.totalMin, skipped };
}
