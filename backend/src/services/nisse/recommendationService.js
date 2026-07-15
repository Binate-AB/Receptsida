// ============================================
// Nisse — Recommendation assembly service
// Deterministic glue between the pure engine and the
// dinner routes: builds the `computed` snapshot stored
// on every MealRecommendation (reproducible/auditable).
// ============================================

import { computePortions, scaleIngredients } from './engine/portions.js';
import { matchInventory } from './engine/pantry.js';
import { estimateCost } from './engine/cost.js';
import { aggregateShoppingList, shoppingListCost } from './engine/shopping.js';
import { formatAmount } from './engine/units.js';

/**
 * Resolve which members are eating from the parsed request.
 */
export function resolveEaters(members, parsed) {
  if (parsed.eaterIds && parsed.eaterIds.length > 0) {
    const eaters = members.filter((m) => parsed.eaterIds.includes(m.id));
    if (eaters.length > 0) return eaters;
  }
  const present = members.filter((m) => m.isDefaultPresent !== false);
  return present.length > 0 ? present : members;
}

/**
 * Build the deterministic `computed` payload for a slotted template.
 *
 * @param {object} slotResult — { slot, template, score, reasons } from rankCandidates
 * @param {object} ctx — { eaters, inventory }
 * @returns {object} computed snapshot (JSON-safe)
 */
export function buildComputedPayload(slotResult, ctx) {
  const { template, reasons, score } = slotResult;
  const { eaters, inventory } = ctx;

  const portions = computePortions(eaters, eaters.map((m) => m.id));
  const scaled = scaleIngredients(template.ingredients, portions);
  const match = matchInventory(scaled, inventory);
  const cost = estimateCost(template, portions, [...match.toBuy, ...match.uncertain]);
  const shoppingItems = aggregateShoppingList(match);

  const dislikedSet = (member) => new Set(member.dislikedIngredients || []);
  const suitability = eaters.map((m) => {
    const hits = (template.ingredients || [])
      .map((i) => i.canonical)
      .filter((c) => dislikedSet(m).has(c));
    const notes = [];
    if (hits.length > 0) notes.push(`ogillar ${hits.join(', ')}`);
    if (m.spiceTolerance === 'NONE' && template.spiceLevel > 0) {
      notes.push(template.hasChildAdultBranch ? 'får mild variant' : 'kan vara för kryddigt');
    }
    return { memberId: m.id, name: m.name, ok: true, notes };
  });

  return {
    portions,
    totalTimeMin: template.totalTimeMin,
    activeTimeMin: template.activeTimeMin,
    effortScore: template.effortScore,
    dishLoad: template.dishLoad,
    branchPossible: template.hasChildAdultBranch,
    score: Math.round(score),
    reasons,
    cost,
    suitability,
    ingredients: scaled.map((i) => ({
      name: i.name,
      canonical: i.canonical,
      qty: i.qty,
      unit: i.unit,
      displayAmount: i.qty ? formatAmount(i.qty, i.unit) : null,
      group: i.group || 'bas',
      optional: Boolean(i.optional),
      pantryStaple: Boolean(i.pantryStaple),
      aisle: i.aisle,
    })),
    atHome: match.atHome.map((e) => ({ name: e.ingredient.name, canonical: e.ingredient.canonical, reason: e.reason })),
    probablyHome: match.uncertain.map((e) => ({ name: e.ingredient.name, canonical: e.ingredient.canonical, reason: e.reason })),
    toBuy: match.toBuy.map((e) => ({ name: e.ingredient.name, canonical: e.ingredient.canonical, reason: e.reason })),
    shoppingItems,
    shoppingCostSek: shoppingListCost(shoppingItems),
  };
}

/**
 * Aggregate feedback rows into the ranker's feedbackScores map.
 * @param {Array<object>} feedbackRows — MealFeedback rows (templateId, avoid, cookAgain, memberRatings)
 * @returns {Map<string, {avgRating: number, count: number, avoid: boolean, cookAgain: boolean}>}
 */
export function buildFeedbackScores(feedbackRows) {
  const byTemplate = new Map();
  for (const row of feedbackRows || []) {
    if (!row.templateId) continue;
    if (!byTemplate.has(row.templateId)) {
      byTemplate.set(row.templateId, { ratings: [], avoid: false, cookAgain: false });
    }
    const agg = byTemplate.get(row.templateId);
    for (const r of Array.isArray(row.memberRatings) ? row.memberRatings : []) {
      if (Number.isFinite(Number(r?.rating))) agg.ratings.push(Number(r.rating));
    }
    if (row.avoid) agg.avoid = true;
    if (row.cookAgain === true) agg.cookAgain = true;
  }

  const scores = new Map();
  for (const [templateId, agg] of byTemplate) {
    const count = agg.ratings.length;
    const avgRating = count > 0 ? agg.ratings.reduce((a, b) => a + b, 0) / count : 3;
    scores.set(templateId, { avgRating, count, avoid: agg.avoid, cookAgain: agg.cookAgain });
  }
  return scores;
}
