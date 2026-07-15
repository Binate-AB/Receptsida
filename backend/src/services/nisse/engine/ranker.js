// ============================================
// Nisse Engine — Candidate ranking
// HARD GATES FIRST (allergen → dietary → avoid-feedback
// → equipment → time → spice), then weighted soft scoring.
// Soft signals can never resurrect a hard-gated template.
// Pure, deterministic.
// ============================================

import { hardGates } from './allergenGate.js';
import { pantryOverlapScore } from './pantry.js';

/**
 * Rank recipe templates for a meal situation and pick 3 slots:
 * NISSE (best overall), EASIEST (least effort), CHEAPEST
 * (cheapest / best pantry usage). Returns fewer when fewer
 * safe candidates exist — never pads with unsafe options.
 *
 * @param {Array<object>} templates — RecipeTemplate rows (ingredients/steps as JSON)
 * @param {object} ctx
 * @param {object} ctx.parsed — parsed meal request (see chipsParse.js)
 * @param {Array<object>} ctx.eaters — household members eating tonight
 * @param {Array<object>} ctx.inventory — InventoryItem rows
 * @param {string[]} ctx.equipment — household equipment slugs ([] = unknown, gate skipped)
 * @param {Map<string, object>} [ctx.feedbackScores] — templateId → { avgRating, count, avoid, cookAgain }
 * @param {string[]} [ctx.recentTemplateIds] — recently cooked (variation penalty)
 * @param {string[]} [ctx.excludeTemplateIds] — explicitly excluded (alternative flow)
 * @returns {{ slots: Array<{slot: string, template: object, score: number, reasons: string[]}>, rejected: Array<{templateId, slug, reason}> }}
 */
export function rankCandidates(templates, ctx) {
  const {
    parsed,
    eaters = [],
    inventory = [],
    equipment = [],
    feedbackScores = new Map(),
    recentTemplateIds = [],
    excludeTemplateIds = [],
  } = ctx;

  const rejected = [];
  const candidates = [];

  const hasChildEater = eaters.some((m) => m.ageCategory === 'BABY' || m.ageCategory === 'CHILD');
  const hasAdultEater = eaters.some((m) => m.ageCategory !== 'BABY' && m.ageCategory !== 'CHILD');
  const dislikedSet = new Set(eaters.flatMap((m) => m.dislikedIngredients || []));
  const minSpiceTolerance = eaters.reduce((min, m) => {
    const order = { NONE: 0, MILD: 1, MEDIUM: 2, HOT: 3 };
    return Math.min(min, order[m.spiceTolerance] ?? 2);
  }, 3);

  for (const tpl of templates) {
    // ── HARD GATES ──────────────────────────
    if (excludeTemplateIds.includes(tpl.id)) {
      rejected.push({ templateId: tpl.id, slug: tpl.slug, reason: 'exkluderad' });
      continue;
    }

    const gates = hardGates(tpl, eaters);
    if (!gates.safe) {
      const detail = gates.allergen.violations[0] || gates.dietary.violations[0];
      rejected.push({
        templateId: tpl.id,
        slug: tpl.slug,
        reason: gates.allergen.violations.length > 0
          ? `allergi: ${detail.allergen} (${detail.memberName})`
          : `kost: ${detail.restriction} (${detail.memberName})`,
      });
      continue;
    }

    const feedback = feedbackScores.get(tpl.id);
    if (feedback?.avoid) {
      rejected.push({ templateId: tpl.id, slug: tpl.slug, reason: 'markerad_undvik' });
      continue;
    }

    if (equipment.length > 0) {
      const missing = (tpl.equipmentRequired || []).filter((e) => !equipment.includes(e));
      if (missing.length > 0) {
        rejected.push({ templateId: tpl.id, slug: tpl.slug, reason: `saknar utrustning: ${missing.join(', ')}` });
        continue;
      }
    }

    if (parsed.timeBudgetMin && tpl.totalTimeMin > parsed.timeBudgetMin + 5) {
      rejected.push({ templateId: tpl.id, slug: tpl.slug, reason: `för lång tid (${tpl.totalTimeMin} min)` });
      continue;
    }

    // Spice: NONE-tolerance eater + spicy base without a mild branch = hard stop
    if (minSpiceTolerance === 0 && tpl.spiceLevel >= 2 && !tpl.hasChildAdultBranch) {
      rejected.push({ templateId: tpl.id, slug: tpl.slug, reason: 'för stark utan mild variant' });
      continue;
    }

    // Tonight-only avoids from free text ("inte pasta ikväll")
    const canonicals = new Set((tpl.ingredients || []).map((i) => i.canonical));
    const avoidHit = (parsed.avoidIngredients || []).find((a) => canonicals.has(a));
    if (avoidHit) {
      rejected.push({ templateId: tpl.id, slug: tpl.slug, reason: `undviker ikväll: ${avoidHit}` });
      continue;
    }

    // ── SOFT SCORING ────────────────────────
    let score = 50;
    const reasons = [];

    // Pantry overlap (0..25) — "använd det som finns hemma"
    const overlap = pantryOverlapScore(
      (tpl.ingredients || []).map((i) => ({ ...i, qty: i.qtyPerPortion })),
      inventory
    );
    score += overlap * 25;
    if (overlap >= 0.5) reasons.push('använder mycket av det ni har hemma');

    // Budget fit (−10..+12)
    if (parsed.budget === 'snålt') {
      score += (30 - Math.min(30, tpl.costPerPortionMin)) * 0.4;
      if (tpl.costPerPortionMin <= 15) reasons.push('billig');
    } else if (parsed.budget === 'flexibelt') {
      score += 2;
    }

    // Energy vs effort (−12..+12)
    if (parsed.energy === 'slut' || parsed.energy === 'låg') {
      score += (3 - tpl.effortScore) * 6;
      if (tpl.effortScore <= 1) reasons.push('minimal ansträngning');
      score += (3 - tpl.dishLoad) * 2;
    } else if (parsed.energy === 'inspirerad') {
      score += (tpl.effortScore - 2) * 3;
    }

    // Child friendliness (0..15) + branch bonus
    if (hasChildEater) {
      score += tpl.childFriendly * 5;
      if (tpl.childFriendly >= 3) reasons.push('barnfavorit');
      if (tpl.hasChildAdultBranch && hasAdultEater) {
        score += 8;
        reasons.push('kan delas i barn- och vuxenvariant');
      }
    }

    // Disliked ingredients (soft, −10 per hit)
    const dislikeHits = [...canonicals].filter((c) => dislikedSet.has(c));
    score -= dislikeHits.length * 10;

    // Mild spice mismatch without branch (soft)
    if (minSpiceTolerance === 0 && tpl.spiceLevel === 1 && !tpl.hasChildAdultBranch) {
      score -= 10;
    }

    // Feedback learning (−16..+20)
    if (feedback?.count > 0) {
      score += (feedback.avgRating - 3) * 8;
      if (feedback.cookAgain) { score += 4; reasons.push('uppskattad förra gången'); }
    }

    // Time fit (0..6): closer to the budget = fresher use of available time
    if (parsed.timeBudgetMin) {
      const slack = parsed.timeBudgetMin - tpl.totalTimeMin;
      if (slack >= 0) score += Math.max(0, 6 - slack * 0.2);
      if (tpl.totalTimeMin <= parsed.timeBudgetMin) reasons.push(`klar på ${tpl.totalTimeMin} min`);
    }

    // Cravings match (+10 per hit against tags/title/ingredients)
    for (const craving of parsed.cravings || []) {
      const c = craving.toLowerCase();
      if (
        tpl.title.toLowerCase().includes(c) ||
        (tpl.tags || []).some((t) => t.toLowerCase() === c) ||
        canonicals.has(c)
      ) {
        score += 10;
        reasons.push(`matchar "${craving}"`);
      }
    }

    // Variation: recently cooked → penalty
    if (recentTemplateIds.includes(tpl.id)) score -= 15;

    candidates.push({ template: tpl, score, overlap, reasons });
  }

  // ── SLOT SELECTION ────────────────────────
  candidates.sort((a, b) => b.score - a.score);
  const slots = [];
  const used = new Set();

  if (candidates.length > 0) {
    const nisse = candidates[0];
    slots.push({ slot: 'NISSE', ...nisse });
    used.add(nisse.template.id);
  }

  const easiest = [...candidates]
    .filter((c) => !used.has(c.template.id))
    .sort(
      (a, b) =>
        a.template.effortScore - b.template.effortScore ||
        a.template.activeTimeMin - b.template.activeTimeMin ||
        b.score - a.score
    )[0];
  if (easiest) {
    slots.push({ slot: 'EASIEST', ...easiest });
    used.add(easiest.template.id);
  }

  const cheapest = [...candidates]
    .filter((c) => !used.has(c.template.id))
    .sort(
      (a, b) =>
        b.overlap - a.overlap ||
        a.template.costPerPortionMin - b.template.costPerPortionMin ||
        b.score - a.score
    )[0];
  if (cheapest) {
    slots.push({ slot: 'CHEAPEST', ...cheapest });
    used.add(cheapest.template.id);
  }

  return { slots, rejected };
}
