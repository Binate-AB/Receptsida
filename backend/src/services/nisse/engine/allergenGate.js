// ============================================
// Nisse Engine — Allergen & dietary gates
// HARD, deterministic, PATH-AWARE safety rules.
//
// INVARIANT: These gates are the ONLY authority on
// whether a meal is safe for a household member.
// AI output NEVER bypasses them — any AI-suggested
// substitution or adaptation must re-pass this gate.
// Soft signals (ratings, preferences) must never be
// consulted here.
//
// PATH-AWARE MODEL (G0c):
// - A REQUIRED ingredient can block the dish.
// - An OPTIONAL ingredient never blocks — it yields a
//   CONDITION ("laktosfri om osten utelämnas").
// - A substitution affects safety ONLY when chosen
//   (checked at choice time in rescuePlan/cook start).
// - Four statuses per ingredient×allergen, all three
//   non-free lists block conservatively but explain
//   differently: contains / varies-by-product /
//   may-contain-traces (+ requiresPackageVerification).
// ============================================

import { ingredientAllergens, expandAllergyCodes } from './allergens.js';

/**
 * All allergen codes an ingredient row carries, per status.
 * The fallback ingredient→allergen map is a SAFETY NET for rows with
 * no declaration at all (free-text/rescue ingredients) — it never
 * overrides an explicit four-state declaration (e.g. hard cheese
 * declared mjölkprotein-only must not get laktos re-added).
 */
export function ingredientStatuses(ing) {
  const declaredContains = ing.allergens || [];
  const declaredVaries = ing.allergensVaryByProduct || [];
  const declaredTraces = ing.mayContainTraces || [];
  const undeclared =
    declaredContains.length === 0 && declaredVaries.length === 0 && declaredTraces.length === 0
      && !ing.requiresPackageVerification;
  return {
    contains: new Set(
      undeclared
        ? [...declaredContains, ...ingredientAllergens(ing.canonical)]
        : declaredContains
    ),
    varies: new Set(declaredVaries),
    traces: new Set(declaredTraces),
  };
}

const STATUS_LABEL = {
  contains: 'innehåller',
  varies: 'varierar mellan produkter',
  traces: 'kan innehålla spår',
};

/**
 * Collect the BASE-PATH allergen map: required ingredients only,
 * across all three status lists (conservative). Optional ingredients
 * and substitutions are excluded — they produce conditions, not blocks.
 *
 * @param {object} template — { allergens?, ingredients: [...] }
 * @returns {Map<string, Array<{canonical, status}>>} allergen → sources
 */
export function collectTemplateAllergens(template) {
  const found = new Map();
  const add = (code, canonical, status) => {
    if (!found.has(code)) found.set(code, []);
    const list = found.get(code);
    if (canonical && !list.some((e) => e.canonical === canonical)) {
      list.push({ canonical, status });
    }
  };

  const hasIngredients = (template.ingredients || []).length > 0;
  // The denormalized DB union is itself base-path (computeAllergenUnion);
  // only trust it when ingredient rows are absent from the object.
  if (!hasIngredients) {
    for (const code of template.allergens || []) add(code, null, 'contains');
  }

  for (const ing of template.ingredients || []) {
    if (ing.optional) continue; // optional → condition, never a block
    const st = ingredientStatuses(ing);
    for (const code of st.contains) add(code, ing.canonical, 'contains');
    for (const code of st.varies) add(code, ing.canonical, 'varies');
    for (const code of st.traces) add(code, ing.canonical, 'traces');
  }

  return found;
}

/**
 * Conditions contributed by OPTIONAL ingredients that carry a
 * member-relevant allergen: the dish stays recommendable, with a
 * clear safe path ("utelämna X eller ersätt med säkert alternativ").
 *
 * @returns {Array<{allergen, ingredient, canonical, action, text}>}
 */
export function collectConditions(template, members) {
  const memberAllergens = new Set(
    (members || []).flatMap((m) => expandAllergyCodes(m.allergies || []))
  );
  const conditions = [];

  for (const ing of template.ingredients || []) {
    if (!ing.optional) continue;
    const st = ingredientStatuses(ing);
    for (const [status, codes] of Object.entries(st)) {
      for (const code of codes) {
        if (!memberAllergens.has(code) && !(code === 'skaldjur' && (memberAllergens.has('kräftdjur') || memberAllergens.has('blötdjur')))) continue;
        // A safe substitution on the optional ingredient upgrades the
        // condition from "utelämna" to "utelämna eller ersätt".
        const safeSub = (ing.substitutions || []).find((sub) => {
          const subCodes = new Set([
            ...(sub.allergens || []),
            ...(sub.allergensVaryByProduct || []),
            ...(sub.mayContainTraces || []),
          ]);
          return ![...memberAllergens].some((a) => subCodes.has(a));
        });
        conditions.push({
          allergen: code,
          ingredient: ing.name,
          canonical: ing.canonical,
          action: safeSub ? 'ersätt' : 'utelämna',
          status,
          text: safeSub
            ? `Säker om ${ing.name.toLowerCase()} utelämnas eller ersätts med ${safeSub.name.toLowerCase()} (${code} ${STATUS_LABEL[status]})`
            : `Säker om ${ing.name.toLowerCase()} utelämnas (${code} ${STATUS_LABEL[status]})`,
        });
      }
    }
  }

  return conditions;
}

/**
 * HARD GATE: is the BASE PATH of this template safe for every
 * eater's allergies? Optional ingredients never block — they are
 * returned as conditions.
 *
 * @param {object} template
 * @param {Array<object>} members — eaters: [{ id, name, allergies: [] }]
 * @returns {{ safe: boolean,
 *             violations: Array<{memberId, memberName, allergen, ingredients: string[], statuses: string[]}>,
 *             conditions: Array<object> }}
 */
export function allergenGate(template, members) {
  const templateAllergens = collectTemplateAllergens(template);
  const violations = [];

  for (const member of members || []) {
    for (const allergen of expandAllergyCodes(member.allergies || [])) {
      if (templateAllergens.has(allergen)) {
        const sources = templateAllergens.get(allergen);
        violations.push({
          memberId: member.id,
          memberName: member.name,
          allergen,
          ingredients: sources.map((s) => s.canonical).filter(Boolean),
          statuses: [...new Set(sources.map((s) => s.status))],
        });
      }
    }
  }

  return {
    safe: violations.length === 0,
    violations,
    conditions: collectConditions(template, members),
  };
}

/**
 * Path-aware dietary status for the allergen-derived restrictions.
 * Computed from the ACTIVE recipe path, never from a static flag:
 * - 'safe'        — no required ingredient carries the allergen (any list)
 * - 'conditional' — every offending ingredient is optional (utelämna) or
 *                   required with a free substitution (byt)
 * - 'unsafe'      — a required ingredient offends with no safe way out
 *
 * @param {object} template
 * @param {'glutenfri'|'laktosfri'} restriction
 * @returns {{ status: 'safe'|'conditional'|'unsafe', conditions: string[] }}
 */
export function dietPathStatus(template, restriction) {
  const allergen = restriction === 'glutenfri' ? 'gluten' : 'laktos';
  const conditions = [];
  let unsafe = false;

  const subIsFree = (sub) => {
    const codes = new Set([
      ...(sub.allergens || []),
      ...(sub.allergensVaryByProduct || []),
      ...(sub.mayContainTraces || []),
    ]);
    return !codes.has(allergen);
  };

  for (const ing of template.ingredients || []) {
    const st = ingredientStatuses(ing);
    const offendingStatus = st.contains.has(allergen)
      ? 'contains'
      : st.varies.has(allergen)
        ? 'varies'
        : st.traces.has(allergen)
          ? 'traces'
          : null;
    if (!offendingStatus) continue;

    const freeSub = (ing.substitutions || []).find(subIsFree);
    if (ing.optional) {
      conditions.push(
        freeSub
          ? `${restriction} om ${ing.name.toLowerCase()} utelämnas eller ersätts med ${freeSub.name.toLowerCase()}`
          : `${restriction} om ${ing.name.toLowerCase()} utelämnas`
      );
    } else if (freeSub) {
      conditions.push(`${restriction} om ${ing.name.toLowerCase()} byts till ${freeSub.name.toLowerCase()}`);
    } else {
      unsafe = true;
    }
  }

  if (unsafe) return { status: 'unsafe', conditions: [] };
  if (conditions.length > 0) return { status: 'conditional', conditions };
  return { status: 'safe', conditions: [] };
}

/**
 * HARD GATE: dietary restrictions (vegetarisk, vegan, fläskfritt,
 * glutenfri, laktosfri).
 *
 * vegetarisk/vegan/fläskfritt: curated static flags (unchanged).
 * glutenfri/laktosfri: PATH-AWARE — 'unsafe' blocks; 'conditional'
 * passes and surfaces its condition text; 'safe' passes silently.
 *
 * @returns {{ safe: boolean, violations: [...], conditions: string[] }}
 */
export function dietaryGate(template, members) {
  const flags = new Set(template.dietaryFlags || []);
  const violations = [];
  const conditions = [];

  const check = (member, restriction) => {
    if (restriction === 'glutenfri' || restriction === 'laktosfri') {
      if (flags.has(restriction)) return true; // statically free base path
      const path = dietPathStatus(template, restriction);
      if (path.status === 'unsafe') return false;
      if (path.status === 'conditional') {
        for (const c of path.conditions) if (!conditions.includes(c)) conditions.push(c);
      }
      return true;
    }
    if (flags.has(restriction)) return true;
    if (restriction === 'vegetarisk' && flags.has('vegan')) return true;
    return false;
  };

  for (const member of members || []) {
    for (const restriction of member.dietaryRestrictions || []) {
      if (!check(member, restriction)) {
        violations.push({ memberId: member.id, memberName: member.name, restriction });
      }
    }
  }

  return { safe: violations.length === 0, violations, conditions };
}

/**
 * Package-verification checks relevant for the given members:
 * generic industrial products (requiresPackageVerification) whose
 * possible allergens intersect the members' allergies. Surfaced on
 * the prep screen — "kontrollera förpackningens allergeninformation".
 *
 * @returns {Array<{ingredient, canonical, allergens: string[], optional: boolean}>}
 */
export function collectPackageChecks(template, members) {
  const memberAllergens = new Set(
    (members || []).flatMap((m) => expandAllergyCodes(m.allergies || []))
  );
  const checks = [];

  for (const ing of template.ingredients || []) {
    if (!ing.requiresPackageVerification) continue;
    const st = ingredientStatuses(ing);
    const all = [...st.contains, ...st.varies, ...st.traces];
    const relevant = memberAllergens.size > 0 ? all.filter((c) => memberAllergens.has(c)) : all;
    checks.push({
      ingredient: ing.name,
      canonical: ing.canonical,
      allergens: [...new Set(relevant)],
      optional: Boolean(ing.optional),
    });
  }

  return checks;
}

/**
 * Convenience: run both hard gates.
 * @returns {{ safe: boolean, allergen: object, dietary: object, conditions: Array<object> }}
 */
export function hardGates(template, members) {
  const allergen = allergenGate(template, members);
  const dietary = dietaryGate(template, members);
  return {
    safe: allergen.safe && dietary.safe,
    allergen,
    dietary,
    conditions: [
      ...allergen.conditions.map((c) => c.text),
      ...dietary.conditions,
    ],
  };
}
