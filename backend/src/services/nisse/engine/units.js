// ============================================
// Nisse Engine — Unit normalization & formatting
// Pure, deterministic. Swedish kitchen units.
// ============================================

/**
 * Unit definitions: family + factor to the family's base unit.
 * Families: mass (base g), volume (base ml), count (base st).
 */
const UNITS = {
  // Mass
  g: { family: 'mass', factor: 1 },
  kg: { family: 'mass', factor: 1000 },
  // Volume
  ml: { family: 'volume', factor: 1 },
  cl: { family: 'volume', factor: 10 },
  dl: { family: 'volume', factor: 100 },
  l: { family: 'volume', factor: 1000 },
  msk: { family: 'volume', factor: 15 },
  tsk: { family: 'volume', factor: 5 },
  krm: { family: 'volume', factor: 1 },
  // Count
  st: { family: 'count', factor: 1 },
  förp: { family: 'count', factor: 1 },
  burk: { family: 'count', factor: 1 },
  klyfta: { family: 'count', factor: 1 },
  knippe: { family: 'count', factor: 1 },
};

export const KNOWN_UNITS = Object.keys(UNITS);

/**
 * Normalize an amount to its family base unit.
 * Unknown units pass through unchanged (family null).
 *
 * @param {number} qty
 * @param {string} unit
 * @returns {{ qty: number, unit: string, family: string|null }}
 */
export function normalizeAmount(qty, unit) {
  const def = UNITS[String(unit || '').toLowerCase().trim()];
  if (!def || !Number.isFinite(qty)) {
    return { qty, unit: unit || '', family: def ? def.family : null };
  }
  const baseUnit = def.family === 'mass' ? 'g' : def.family === 'volume' ? 'ml' : 'st';
  return { qty: qty * def.factor, unit: baseUnit, family: def.family };
}

/**
 * True when two units belong to the same family and can be summed.
 */
export function sameUnitFamily(unitA, unitB) {
  const a = UNITS[String(unitA || '').toLowerCase().trim()];
  const b = UNITS[String(unitB || '').toLowerCase().trim()];
  return Boolean(a && b && a.family === b.family);
}

/**
 * Pick a human display unit for a base amount and format in Swedish.
 * 1500 g → "1,5 kg" · 250 ml → "2,5 dl" · 15 ml → "1 msk" · 3 st → "3 st"
 *
 * @param {number} qty — amount in family base unit (g / ml / st)
 * @param {string} unit — base unit ("g" / "ml" / "st") or any known unit
 * @returns {string}
 */
export function formatAmount(qty, unit) {
  if (!Number.isFinite(qty)) return '';
  const norm = normalizeAmount(qty, unit);
  let value = norm.qty;
  let display = norm.unit;

  if (norm.family === 'mass') {
    if (value >= 1000) { value /= 1000; display = 'kg'; }
  } else if (norm.family === 'volume') {
    if (value >= 1000) { value /= 1000; display = 'l'; }
    else if (value >= 100) { value /= 100; display = 'dl'; }
    else if (value >= 15 && value % 15 === 0) { value /= 15; display = 'msk'; }
    else if (value >= 5 && value % 5 === 0) { value /= 5; display = 'tsk'; }
    else if (value < 5) { display = 'krm'; }
  } else if (norm.family === null) {
    display = unit || '';
  }

  // Round to at most 1 decimal, Swedish decimal comma, trim trailing ,0
  const rounded = Math.round(value * 10) / 10;
  const str = String(rounded).replace('.', ',').replace(/,0$/, '');
  return display ? `${str} ${display}` : str;
}
