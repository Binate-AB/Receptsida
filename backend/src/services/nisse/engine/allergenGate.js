// ============================================
// Nisse Engine — Allergen & dietary gates
// HARD, deterministic safety rules.
//
// INVARIANT: These gates are the ONLY authority on
// whether a meal is safe for a household member.
// AI output NEVER bypasses them — any AI-suggested
// substitution or adaptation must re-pass this gate.
// Soft signals (ratings, preferences) must never be
// consulted here.
// ============================================

import { ingredientAllergens } from './allergens.js';

/**
 * Collect the full allergen set for a template, from:
 * 1. the template-level denormalized `allergens[]`
 * 2. every ingredient's declared `allergens[]`
 * 3. the fallback ingredient→allergen map (safety net)
 *
 * @param {object} template — { allergens?, ingredients: [{canonical, allergens?}] }
 * @returns {Map<string, string[]>} allergen code → ingredient canonical names carrying it
 */
export function collectTemplateAllergens(template) {
  const found = new Map();
  const add = (code, source) => {
    if (!found.has(code)) found.set(code, []);
    if (source && !found.get(code).includes(source)) found.get(code).push(source);
  };

  for (const code of template.allergens || []) add(code, null);

  for (const ing of template.ingredients || []) {
    const declared = ing.allergens || [];
    const fallback = ingredientAllergens(ing.canonical);
    for (const code of new Set([...declared, ...fallback])) {
      add(code, ing.canonical);
    }
  }

  return found;
}

/**
 * HARD GATE: is this template safe for every eater's allergies?
 *
 * @param {object} template
 * @param {Array<object>} members — eaters: [{ id, name, allergies: [] }]
 * @returns {{ safe: boolean, violations: Array<{memberId, memberName, allergen, ingredients: string[]}> }}
 */
export function allergenGate(template, members) {
  const templateAllergens = collectTemplateAllergens(template);
  const violations = [];

  for (const member of members || []) {
    for (const allergen of member.allergies || []) {
      if (templateAllergens.has(allergen)) {
        violations.push({
          memberId: member.id,
          memberName: member.name,
          allergen,
          ingredients: templateAllergens.get(allergen).filter(Boolean),
        });
      }
    }
  }

  return { safe: violations.length === 0, violations };
}

/**
 * HARD GATE: dietary restrictions (vegetarisk, vegan, fläskfritt,
 * glutenfri, laktosfri). A template passes only if it declares a
 * matching dietaryFlag for every restriction among the eaters.
 *
 * glutenfri/laktosfri restrictions are also satisfied when the
 * allergen scan shows the template carries no gluten/laktos.
 *
 * @param {object} template — { dietaryFlags: [] }
 * @param {Array<object>} members — [{ id, name, dietaryRestrictions: [] }]
 * @returns {{ safe: boolean, violations: Array<{memberId, memberName, restriction}> }}
 */
export function dietaryGate(template, members) {
  const flags = new Set(template.dietaryFlags || []);
  const templateAllergens = collectTemplateAllergens(template);
  const violations = [];

  const satisfies = (restriction) => {
    if (flags.has(restriction)) return true;
    // vegan satisfies vegetarisk
    if (restriction === 'vegetarisk' && flags.has('vegan')) return true;
    // allergen-free templates satisfy the matching -fri restriction
    if (restriction === 'glutenfri' && !templateAllergens.has('gluten')) return true;
    if (restriction === 'laktosfri' && !templateAllergens.has('laktos')) return true;
    return false;
  };

  for (const member of members || []) {
    for (const restriction of member.dietaryRestrictions || []) {
      if (!satisfies(restriction)) {
        violations.push({ memberId: member.id, memberName: member.name, restriction });
      }
    }
  }

  return { safe: violations.length === 0, violations };
}

/**
 * Convenience: run both hard gates.
 * @returns {{ safe: boolean, allergen: object, dietary: object }}
 */
export function hardGates(template, members) {
  const allergen = allergenGate(template, members);
  const dietary = dietaryGate(template, members);
  return { safe: allergen.safe && dietary.safe, allergen, dietary };
}
