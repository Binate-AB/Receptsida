// ============================================
// Nisse Engine — Portion computation & scaling
// Pure, deterministic.
// ============================================

// Default portion factors per age category (adjustable per member).
// Single source of truth — routes import this map.
export const DEFAULT_PORTION_FACTOR = {
  BABY: 0.3,
  CHILD: 0.6,
  TEEN: 1.3,
  ADULT: 1.0,
  SENIOR: 0.9,
};

/**
 * Compute the number of portions for the eaters present.
 * Sums member portion factors (child 0.6, teen 1.3, ...),
 * never below 1, rounded UP to the nearest 0.5 so nobody
 * goes hungry.
 *
 * §28: a template may set `childPortionFactor`, which replaces the
 * AGE-DEFAULT factor for BABY/CHILD eaters (e.g. pancakes where kids
 * eat like adults, or a spicy dish where they mostly taste). A member
 * whose factor was EXPLICITLY customized (differs from their age
 * default) always wins over the template.
 *
 * @param {Array<{id: string, portionFactor: number, ageCategory?: string}>} members
 * @param {string[]|null} presentMemberIds — null/empty = everyone with isDefaultPresent
 * @param {{ childPortionFactor?: number|null }} [opts]
 * @returns {number} portions (multiple of 0.5, >= 1)
 */
export function computePortions(members, presentMemberIds = null, opts = {}) {
  const present = presentMemberIds && presentMemberIds.length > 0
    ? members.filter((m) => presentMemberIds.includes(m.id))
    : members.filter((m) => m.isDefaultPresent !== false);

  const factorFor = (m) => {
    const own = Number(m.portionFactor) || 1;
    const tplChildFactor = opts.childPortionFactor;
    if (
      tplChildFactor != null &&
      (m.ageCategory === 'BABY' || m.ageCategory === 'CHILD') &&
      own === (DEFAULT_PORTION_FACTOR[m.ageCategory] ?? own)
    ) {
      return tplChildFactor;
    }
    return own;
  };

  const sum = present.reduce((acc, m) => acc + factorFor(m), 0);
  const rounded = Math.ceil(sum * 2) / 2;
  return Math.max(1, rounded);
}

/**
 * Scale template ingredients to a portion count.
 * Template ingredients declare qtyPerPortion in a canonical unit.
 *
 * §28 scaling rules (per-ingredient `scaling` field):
 *  - 'linear' (default): qty = qtyPerPortion × portions
 *  - 'stepwise': whole units (onions, eggs) — rounded to a whole
 *    number, never below 1. "1 lök blir inte 1,5."
 *  - 'sublinear': seasonings/fat don't scale proportionally —
 *    qty = base amount × (portions/servingsBase)^0.6, anchored at
 *    the author's servingsBase so a 4-portion recipe is unchanged.
 *
 * @param {Array<object>} templateIngredients — [{ name, canonical, qtyPerPortion, unit, scaling?, ... }]
 * @param {number} portions
 * @param {{ servingsBase?: number }} [opts]
 * @returns {Array<object>} ingredients with `qty` (scaled) added
 */
export function scaleIngredients(templateIngredients, portions, opts = {}) {
  if (!Number.isFinite(portions) || portions <= 0) {
    throw new Error(`Invalid portion count: ${portions}`);
  }
  const servingsBase = Number.isFinite(opts.servingsBase) && opts.servingsBase > 0
    ? opts.servingsBase
    : 4;

  return (templateIngredients || []).map((ing) => {
    const per = Number(ing.qtyPerPortion);
    if (!Number.isFinite(per)) return { ...ing, qty: null };

    let qty;
    if (ing.scaling === 'stepwise') {
      qty = Math.max(1, Math.round(per * portions));
    } else if (ing.scaling === 'sublinear') {
      const base = per * servingsBase;
      qty = roundSensible(base * Math.pow(portions / servingsBase, 0.6), ing.unit);
    } else {
      qty = roundSensible(per * portions, ing.unit);
    }
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
