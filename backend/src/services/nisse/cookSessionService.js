// ============================================
// Nisse — Cook session assembly
// Builds the frozen, legacy-CookingMode-compatible
// recipeData + coordinated timeline for a session.
// Deterministic — scaling and scheduling by engine.
// ============================================

import { computePortions, scaleIngredients } from './engine/portions.js';
import { buildTimeline } from './engine/timeline.js';
import { formatAmount, normalizeAmount } from './engine/units.js';
import { matchInventory } from './engine/pantry.js';

const LANE_LABELS = { base: 'Gemensamt', child: 'Barnens', adult: 'Vuxnas' };

/**
 * Build session recipeData + timeline from a template.
 *
 * recipeData is shaped for the existing CookingMode component:
 * { title, ingredients: [{name, amount, have, aisle}],
 *   steps: [{text, voice_cue, duration_seconds, timer_needed,
 *            warning, beginner_tip, lane, laneLabel, startMin}], tips }
 *
 * @param {object} template — RecipeTemplate row
 * @param {object} options — { eaters, inventory, branch: 'base'|'split' }
 * @returns {{ recipeData: object, timeline: object, portions: number, branch: string }}
 */
export function buildSessionData(template, { eaters, inventory, branch }) {
  const mode = branch === 'split' && template.hasChildAdultBranch ? 'split' : 'base';
  const portions = computePortions(eaters, eaters.map((m) => m.id));
  const scaled = scaleIngredients(template.ingredients, portions);
  const match = matchInventory(scaled, inventory || []);
  const atHome = new Set(match.atHome.map((e) => e.ingredient.canonical));

  const timeline = buildTimeline(template.steps, { branch: mode });

  const steps = timeline.steps.map((s) => ({
    id: s.id,
    text: s.text,
    voice_cue: s.voiceCue,
    duration_seconds: s.timerNeeded && s.durationMin ? s.durationMin * 60 : undefined,
    duration_minutes: s.durationMin,
    timer_needed: Boolean(s.timerNeeded),
    warning: s.warning || null,
    beginner_tip: s.beginnerTip || null,
    lane: s.lane,
    laneLabel: LANE_LABELS[s.lane] || s.lane,
    startMin: s.startMin,
    equipment: s.equipment || [],
  }));

  const recipeData = {
    title: template.title,
    slug: template.slug,
    difficulty: template.difficulty,
    servings: portions,
    time_minutes: timeline.totalMin,
    ingredients: scaled.map((i) => ({
      name: i.name,
      amount: i.qty ? formatAmount(normalizeAmount(i.qty, i.unit).qty, normalizeAmount(i.qty, i.unit).unit) : '',
      have: atHome.has(i.canonical) || Boolean(i.pantryStaple),
      aisle: i.aisle,
      group: i.group || 'bas',
      optional: Boolean(i.optional),
    })),
    steps,
    tips: template.description,
    variants: template.variants || null,
    branch: mode,
  };

  return {
    recipeData,
    timeline: {
      lanes: timeline.lanes.map((lane) => ({ id: lane, label: LANE_LABELS[lane] || lane })),
      totalMin: timeline.totalMin,
      activeMin: timeline.activeMin,
    },
    portions,
    branch: mode,
  };
}
