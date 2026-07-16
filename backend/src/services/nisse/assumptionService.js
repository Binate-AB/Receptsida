// ============================================
// Nisse — Assumption economy service
// Builds the DinnerAssumption rows for a decision
// (level 2 = shown + one-tap correctable) and applies
// corrections to the parsed request. Pure logic here;
// DB side-effects stay in the routes.
// Spec: docs/NISSE_DECISION_ENGINE_SPEC.md §8
// ============================================

import { computePortions } from './engine/portions.js';
import {
  unconfirmedCritical,
  inventoryConfidenceMap,
  learnedConfidenceMap,
  ingredientConfidence,
} from './engine/uncertainty.js';

const ENERGY_VALUES = ['slut', 'låg', 'normal', 'inspirerad'];
const BUDGET_VALUES = ['snålt', 'normal', 'flexibelt'];

/**
 * Build the assumptions Nisse made for tonight's decision.
 * Request-level assumptions come from the parsed situation; pantry
 * assumptions come from the TOP recommendation's uncertain critical
 * ingredients (max 3 — chips must never become a form).
 *
 * @param {object} args
 * @param {object} args.parsed — parsed meal request
 * @param {string} args.parseSource — 'ai' | 'chips_fallback'
 * @param {number|null} args.aiConfidence
 * @param {object|null} args.chips — raw quick-select input (explicit user choices)
 * @param {Array<object>} args.eaters
 * @param {object|null} args.topTemplate — NISSE-slot template (or null)
 * @param {Array<object>} args.inventory — InventoryItem rows
 * @param {Array<object>} args.confidenceRows — HouseholdIngredientConfidence rows
 * @returns {Array<{key: string, level: number, value: any, confidence: number}>}
 */
export function buildAssumptions({
  parsed,
  parseSource,
  aiConfidence,
  chips,
  eaters,
  topTemplate,
  inventory = [],
  confidenceRows = [],
}) {
  const assumptions = [];

  // Explicit chip choices are user statements (high confidence);
  // AI-inferred values inherit the parse confidence; defaults are guesses.
  const sourceConfidence = (chipKey, fallback = 0.5) => {
    if (chips && chips[chipKey] != null) return 0.95;
    if (parseSource === 'ai') return aiConfidence ?? 0.7;
    return fallback;
  };

  const portions = parsed.portionsOverride ?? computePortions(eaters, eaters.map((m) => m.id));
  assumptions.push({
    key: 'portions',
    level: 2,
    value: portions,
    confidence: parsed.portionsOverride != null ? 0.95 : 0.7,
  });

  assumptions.push({
    key: 'time_budget',
    level: 2,
    value: parsed.timeBudgetMin, // null = no limit assumed
    confidence: sourceConfidence('timeBudgetMin'),
  });

  assumptions.push({
    key: 'energy',
    level: 2,
    value: parsed.energy,
    confidence: sourceConfidence('energy'),
  });

  assumptions.push({
    key: 'budget',
    level: 2,
    value: parsed.budget,
    confidence: sourceConfidence('budget'),
  });

  // Pantry assumptions: the top pick's uncertain critical dependencies.
  if (topTemplate) {
    const invMap = inventoryConfidenceMap(inventory);
    const learnedMap = learnedConfidenceMap(confidenceRows);
    const uncertain = unconfirmedCritical(topTemplate, invMap, learnedMap).slice(0, 3);
    for (const entry of uncertain) {
      assumptions.push({
        key: `pantry:${entry.canonical}`,
        level: 2,
        value: {
          name: entry.name,
          assumedHome:
            ingredientConfidence(entry.canonical, invMap, learnedMap) >= 0.5,
        },
        confidence: entry.confidence,
      });
    }
  }

  return assumptions;
}

/**
 * Apply a correction to the parsed request. Returns a NEW parsed
 * object (never mutates) plus a normalized corrected value, or
 * throws a descriptive Error for invalid input.
 *
 * Pantry corrections don't live in `parsed` — the route persists
 * them to InventoryItem/HouseholdIngredientConfidence; this
 * function only validates and normalizes them.
 *
 * @param {object} parsed
 * @param {string} key
 * @param {*} value
 * @returns {{ parsed: object, normalized: any, isPantry: boolean, canonical: string|null }}
 */
export function applyAssumptionCorrection(parsed, key, value) {
  const next = { ...parsed };

  if (key === 'portions') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1 || n > 20) {
      throw new Error('Portioner måste vara 1–20.');
    }
    next.portionsOverride = Math.round(n * 2) / 2; // allow halves
    return { parsed: next, normalized: next.portionsOverride, isPantry: false, canonical: null };
  }

  if (key === 'time_budget') {
    if (value === null) {
      next.timeBudgetMin = null;
      return { parsed: next, normalized: null, isPantry: false, canonical: null };
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 10 || n > 240) {
      throw new Error('Tidsbudget måste vara 10–240 minuter (eller null).');
    }
    next.timeBudgetMin = Math.round(n);
    return { parsed: next, normalized: next.timeBudgetMin, isPantry: false, canonical: null };
  }

  if (key === 'energy') {
    if (!ENERGY_VALUES.includes(value)) {
      throw new Error(`Energi måste vara en av: ${ENERGY_VALUES.join(', ')}.`);
    }
    next.energy = value;
    return { parsed: next, normalized: value, isPantry: false, canonical: null };
  }

  if (key === 'budget') {
    if (!BUDGET_VALUES.includes(value)) {
      throw new Error(`Budget måste vara en av: ${BUDGET_VALUES.join(', ')}.`);
    }
    next.budget = value;
    return { parsed: next, normalized: value, isPantry: false, canonical: null };
  }

  if (key.startsWith('pantry:')) {
    const canonical = key.slice('pantry:'.length);
    if (!canonical) throw new Error('Ogiltig pantry-nyckel.');
    if (typeof value !== 'boolean') {
      throw new Error('Skafferi-korrigering måste vara true (har hemma) eller false (har inte).');
    }
    return { parsed: next, normalized: value, isPantry: true, canonical };
  }

  throw new Error(`Okänt antagande: ${key}.`);
}
