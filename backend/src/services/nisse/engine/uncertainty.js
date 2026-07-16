// ============================================
// Nisse Engine — Uncertainty & criticality
// Pure, deterministic. Implements the assumption
// economy's uncertainty measure (spec §5 in
// docs/NISSE_DECISION_ENGINE_SPEC.md): high
// uncertainty makes the ranker prefer robust
// dishes over asking questions.
// ============================================

/**
 * Transparent initial heuristic for common Swedish staples.
 * NOT a statistical model — deliberately low/moderate confidence,
 * one-tap correctable, and superseded by learned per-household
 * values (HouseholdIngredientConfidence) as outcomes arrive.
 */
export const BASELINE_PANTRY_CONFIDENCE = new Map([
  ['salt', 0.9],
  ['svartpeppar', 0.85],
  ['smör', 0.7],
  ['olja', 0.75],
  ['olivolja', 0.6],
  ['rapsolja', 0.6],
  ['vetemjöl', 0.7],
  ['socker', 0.7],
  ['pasta', 0.65],
  ['ris', 0.6],
  ['gul lök', 0.7],
  ['vitlök', 0.65],
  ['ägg', 0.6],
  ['mjölk', 0.6],
  ['tomatpuré', 0.5],
  ['buljongtärning', 0.55],
  ['ketchup', 0.55],
  ['senap', 0.5],
]);

/**
 * A critical ("avgörande") ingredient is one the dish cannot
 * reasonably be cooked without. Curated per dish via `critical`
 * in the seed JSON; when unset, derived: required and not a
 * pantry staple.
 */
export function isCriticalIngredient(ing) {
  if (typeof ing?.critical === 'boolean') return ing.critical;
  return !ing?.optional && !ing?.pantryStaple;
}

/**
 * Confidence (0..1) that a canonical ingredient is home.
 * Priority: explicit inventory row → learned household confidence
 * → baseline staple heuristic → 0.
 *
 * @param {string} canonical
 * @param {Map<string, number>} inventoryByCanonical — canonical → InventoryItem.confidence
 * @param {Map<string, number>} learnedConfidence — canonical → HouseholdIngredientConfidence.confidence
 */
export function ingredientConfidence(canonical, inventoryByCanonical, learnedConfidence) {
  if (inventoryByCanonical?.has(canonical)) return inventoryByCanonical.get(canonical);
  if (learnedConfidence?.has(canonical)) return learnedConfidence.get(canonical);
  return BASELINE_PANTRY_CONFIDENCE.get(canonical) ?? 0;
}

/** Build canonical → confidence map from InventoryItem rows. */
export function inventoryConfidenceMap(inventory = []) {
  const map = new Map();
  for (const item of inventory) {
    const c = Number.isFinite(item?.confidence) ? item.confidence : 1.0;
    // Keep the highest confidence when duplicates exist
    map.set(item.canonical, Math.max(map.get(item.canonical) ?? 0, c));
  }
  return map;
}

/** Build canonical → confidence map from HouseholdIngredientConfidence rows. */
export function learnedConfidenceMap(rows = []) {
  const map = new Map();
  for (const row of rows) map.set(row.canonical, row.confidence);
  return map;
}

const UNCERTAINTY_FLOOR = 0.15; // inventory is a guess, never bookkeeping

/**
 * Per-template uncertainty (0..1) for tonight's decision:
 * 1.0 when the household has no inventory signal at all; otherwise
 * 1 − mean confidence over the template's critical ingredients,
 * floored at 0.15.
 *
 * @param {object} template — RecipeTemplate row (ingredients JSON)
 * @param {Map<string, number>} inventoryByCanonical
 * @param {Map<string, number>} learnedConfidence
 */
export function templateUncertainty(template, inventoryByCanonical, learnedConfidence) {
  const hasSignal =
    (inventoryByCanonical?.size ?? 0) > 0 || (learnedConfidence?.size ?? 0) > 0;
  if (!hasSignal) return 1.0;

  const critical = (template.ingredients || []).filter(isCriticalIngredient);
  if (critical.length === 0) return UNCERTAINTY_FLOOR;

  const sum = critical.reduce(
    (acc, ing) => acc + ingredientConfidence(ing.canonical, inventoryByCanonical, learnedConfidence),
    0
  );
  return Math.max(UNCERTAINTY_FLOOR, Math.min(1, 1 - sum / critical.length));
}

const CONFIRMED_THRESHOLD = 0.8;

/**
 * Critical ingredients that are NOT confidently home — the dish's
 * uncertain hard dependencies. Fewer wins when uncertainty is high,
 * and these are exactly what the prep screen verifies (level 1).
 *
 * @returns {Array<{name: string, canonical: string, confidence: number}>}
 */
export function unconfirmedCritical(template, inventoryByCanonical, learnedConfidence) {
  return (template.ingredients || [])
    .filter(isCriticalIngredient)
    .map((ing) => ({
      name: ing.name,
      canonical: ing.canonical,
      confidence: ingredientConfidence(ing.canonical, inventoryByCanonical, learnedConfidence),
    }))
    .filter((e) => e.confidence < CONFIRMED_THRESHOLD)
    .sort((a, b) => a.confidence - b.confidence);
}
