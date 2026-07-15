// ============================================
// Nisse Engine — Portion computation & scaling
// Pure, deterministic.
// ============================================

/**
 * Compute the number of portions for the eaters present.
 * Sums member portion factors (child 0.6, teen 1.3, ...),
 * never below 1, rounded UP to the nearest 0.5 so nobody
 * goes hungry.
 *
 * @param {Array<{id: string, portionFactor: number}>} members
 * @param {string[]|null} presentMemberIds — null/empty = everyone with isDefaultPresent
 * @returns {number} portions (multiple of 0.5, >= 1)
 */
export function computePortions(members, presentMemberIds = null) {
  const present = presentMemberIds && presentMemberIds.length > 0
    ? members.filter((m) => presentMemberIds.includes(m.id))
    : members.filter((m) => m.isDefaultPresent !== false);

  const sum = present.reduce((acc, m) => acc + (Number(m.portionFactor) || 1), 0);
  const rounded = Math.ceil(sum * 2) / 2;
  return Math.max(1, rounded);
}

/**
 * Scale template ingredients to a portion count.
 * Template ingredients declare qtyPerPortion in a canonical unit.
 *
 * @param {Array<object>} templateIngredients — [{ name, canonical, qtyPerPortion, unit, ... }]
 * @param {number} portions
 * @returns {Array<object>} ingredients with `qty` (scaled) added
 */
export function scaleIngredients(templateIngredients, portions) {
  if (!Number.isFinite(portions) || portions <= 0) {
    throw new Error(`Invalid portion count: ${portions}`);
  }

  return (templateIngredients || []).map((ing) => {
    const per = Number(ing.qtyPerPortion);
    const qty = Number.isFinite(per) ? roundSensible(per * portions, ing.unit) : null;
    return { ...ing, qty };
  });
}

/**
 * Round scaled quantities to kitchen-realistic values:
 * counts to halves, small volumes to halves, larger amounts to integers.
 */
function roundSensible(value, unit) {
  const u = String(unit || '').toLowerCase();
  if (u === 'st' || u === 'förp' || u === 'burk' || u === 'klyfta' || u === 'knippe') {
    return Math.max(0.5, Math.round(value * 2) / 2);
  }
  if (u === 'msk' || u === 'tsk' || u === 'krm' || u === 'dl') {
    return Math.round(value * 2) / 2;
  }
  // g / ml / kg / l — integers
  return Math.round(value);
}
