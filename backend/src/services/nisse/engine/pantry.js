// ============================================
// Nisse Engine — Pantry/inventory matching
// The inventory is a PROBABILITY model, not an exact
// ledger: items carry a confidence score, and low
// confidence must never be presented as "has at home".
// Pure, deterministic.
// ============================================

import { normalizeAmount, sameUnitFamily } from './units.js';

/**
 * Match scaled recipe ingredients against household inventory.
 *
 * Classification per ingredient:
 * - atHome:    confident match with sufficient (or unknown) quantity,
 *              or a pantry staple (salt/oil-class assumption)
 * - uncertain: match exists but confidence < threshold, or quantity
 *              is close but not clearly sufficient → "har du troligen
 *              hemma — dubbelkolla"
 * - toBuy:     no match, or clearly insufficient quantity
 *
 * @param {Array<object>} scaledIngredients — [{ name, canonical, qty, unit, pantryStaple?, optional? }]
 * @param {Array<object>} inventoryItems — [{ canonical, quantity, unit, confidence }]
 * @param {object} [options]
 * @param {number} [options.confidenceThreshold=0.6]
 * @returns {{ atHome: object[], uncertain: object[], toBuy: object[] }}
 */
export function matchInventory(scaledIngredients, inventoryItems, options = {}) {
  const threshold = options.confidenceThreshold ?? 0.6;
  const byCanonical = new Map((inventoryItems || []).map((i) => [i.canonical, i]));

  const atHome = [];
  const uncertain = [];
  const toBuy = [];

  for (const ing of scaledIngredients || []) {
    if (ing.pantryStaple) {
      atHome.push({ ingredient: ing, reason: 'basvara' });
      continue;
    }

    const match = byCanonical.get(ing.canonical);
    if (!match) {
      toBuy.push({ ingredient: ing, reason: 'saknas' });
      continue;
    }

    if ((match.confidence ?? 1) < threshold) {
      uncertain.push({ ingredient: ing, matchedItem: match, reason: 'osäker_inventering' });
      continue;
    }

    // Confident match — check quantity when units are comparable
    if (match.quantity == null || !ing.qty || !sameUnitFamily(match.unit, ing.unit)) {
      // Quantity unknown or incomparable: probably home, but flag it
      uncertain.push({ ingredient: ing, matchedItem: match, reason: 'okänd_mängd' });
      continue;
    }

    const have = normalizeAmount(match.quantity, match.unit).qty;
    const need = normalizeAmount(ing.qty, ing.unit).qty;

    if (have >= need) {
      atHome.push({ ingredient: ing, matchedItem: match, reason: 'finns_hemma' });
    } else if (have >= need * 0.75) {
      uncertain.push({ ingredient: ing, matchedItem: match, reason: 'knappt_tillräckligt' });
    } else {
      toBuy.push({ ingredient: ing, matchedItem: match, reason: 'otillräcklig_mängd' });
    }
  }

  return { atHome, uncertain, toBuy };
}

/**
 * Pantry overlap score 0..1: share of non-staple ingredients
 * that are confidently at home. Used by the ranker
 * ("använd det som finns hemma").
 */
export function pantryOverlapScore(scaledIngredients, inventoryItems, options = {}) {
  const relevant = (scaledIngredients || []).filter((i) => !i.pantryStaple);
  if (relevant.length === 0) return 0;
  const { atHome } = matchInventory(relevant, inventoryItems, options);
  return atHome.length / relevant.length;
}
