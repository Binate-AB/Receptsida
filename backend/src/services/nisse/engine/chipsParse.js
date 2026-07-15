// ============================================
// Nisse Engine — Deterministic chips parser
// Fallback path when AI is unavailable (or the user
// only used quick-select chips). Always produces a
// valid parsed meal request. Pure, deterministic.
// ============================================

/**
 * The canonical parsed meal request shape (also enforced by the
 * AI boundary's Zod schema — keep in sync with ai/schemas.js):
 * {
 *   timeBudgetMin: number|null,
 *   energy: 'slut'|'låg'|'normal'|'inspirerad',
 *   budget: 'snålt'|'normal'|'flexibelt',
 *   eaterIds: string[]|null,   // null = default present members
 *   cravings: string[],        // free-text wishes ("krämigt", "pasta")
 *   avoidIngredients: string[],// tonight-only avoids (canonical names)
 *   occasion: 'vardag'|'helg'|'gäster'|'matlådor',
 *   wantsLeftovers: boolean,
 *   notes: string|null
 * }
 */

/**
 * Build a parsed meal request deterministically from quick-select chips.
 *
 * @param {object} chips — { timeBudgetMin?, energy?, budget?, eaterIds?, occasion?, wantsLeftovers? }
 * @returns {object} parsed request (always valid)
 */
export function deterministicParse(chips = {}) {
  const energy = ['slut', 'låg', 'normal', 'inspirerad'].includes(chips.energy)
    ? chips.energy
    : 'normal';
  const budget = ['snålt', 'normal', 'flexibelt'].includes(chips.budget)
    ? chips.budget
    : 'normal';
  const occasion = ['vardag', 'helg', 'gäster', 'matlådor'].includes(chips.occasion)
    ? chips.occasion
    : 'vardag';

  return {
    timeBudgetMin: Number.isFinite(Number(chips.timeBudgetMin))
      ? Math.max(10, Math.min(240, Number(chips.timeBudgetMin)))
      : null,
    energy,
    budget,
    eaterIds: Array.isArray(chips.eaterIds) && chips.eaterIds.length > 0 ? chips.eaterIds : null,
    cravings: [],
    avoidIngredients: [],
    occasion,
    wantsLeftovers: Boolean(chips.wantsLeftovers),
    notes: null,
  };
}
