// ============================================
// Nisse Engine — Allergen taxonomy
// Canonical allergen codes used across household
// members, recipe templates and the allergen gate.
// Deterministic — no AI may alter or bypass this.
// ============================================

/**
 * Canonical allergen codes (Swedish, lowercase).
 * Based on the 14 EU-regulated allergens, adapted to
 * what the MVP recipe set actually contains.
 */
export const ALLERGEN_TAXONOMY = [
  { code: 'gluten', label: 'Gluten', description: 'Vete, råg, korn, havre' },
  { code: 'laktos', label: 'Laktos', description: 'Mjölksocker i mejeriprodukter' },
  { code: 'mjölkprotein', label: 'Mjölkprotein', description: 'Kasein/vassle i mejeriprodukter' },
  { code: 'ägg', label: 'Ägg', description: 'Ägg och äggprodukter' },
  { code: 'fisk', label: 'Fisk', description: 'All fisk' },
  { code: 'skaldjur', label: 'Skaldjur', description: 'Räkor, kräftor, musslor m.m.' },
  { code: 'nötter', label: 'Nötter', description: 'Trädnötter: hasselnöt, mandel, valnöt m.fl.' },
  { code: 'jordnöt', label: 'Jordnöt', description: 'Jordnötter (baljväxt)' },
  { code: 'soja', label: 'Soja', description: 'Sojabönor och sojaprodukter' },
  { code: 'sesam', label: 'Sesam', description: 'Sesamfrön' },
  { code: 'selleri', label: 'Selleri', description: 'Rotselleri och stjälkselleri' },
  { code: 'senap', label: 'Senap', description: 'Senap och senapsfrön' },
];

export const ALLERGEN_CODES = ALLERGEN_TAXONOMY.map((a) => a.code);

/**
 * Dietary restrictions treated as HARD gates (like allergies,
 * these are absolute — ethical/religious/medical).
 */
export const DIETARY_RESTRICTIONS = [
  'vegetarisk',
  'vegan',
  'fläskfritt',
  'glutenfri',
  'laktosfri',
];

/**
 * Canonical kitchen equipment slugs.
 */
export const EQUIPMENT = [
  { code: 'spis', label: 'Spis' },
  { code: 'ugn', label: 'Ugn' },
  { code: 'mikro', label: 'Mikrovågsugn' },
  { code: 'stekpanna', label: 'Stekpanna' },
  { code: 'kastrull', label: 'Kastrull' },
  { code: 'ugnsform', label: 'Ugnsform' },
  { code: 'mixer', label: 'Mixer/stavmixer' },
  { code: 'airfryer', label: 'Airfryer' },
  { code: 'tryckkokare', label: 'Tryckkokare' },
];

export const EQUIPMENT_CODES = EQUIPMENT.map((e) => e.code);

/**
 * Fallback map: canonical ingredient name → allergens.
 * Primary source of truth is the per-ingredient `allergens[]`
 * in each recipe template; this map is a safety net used by the
 * gate for substitutions/free-text ingredients that lack tags.
 */
const INGREDIENT_ALLERGEN_MAP = {
  // Gluten
  'pasta': ['gluten'], 'spagetti': ['gluten'], 'nudlar': ['gluten'],
  'vetemjöl': ['gluten'], 'mjöl': ['gluten'], 'bröd': ['gluten'],
  'ströbröd': ['gluten'], 'couscous': ['gluten'], 'bulgur': ['gluten'],
  'lasagneplattor': ['gluten'], 'tortilla': ['gluten'],
  // Laktos + mjölkprotein
  'mjölk': ['laktos', 'mjölkprotein'], 'grädde': ['laktos', 'mjölkprotein'],
  'vispgrädde': ['laktos', 'mjölkprotein'], 'matlagningsgrädde': ['laktos', 'mjölkprotein'],
  'crème fraiche': ['laktos', 'mjölkprotein'], 'gräddfil': ['laktos', 'mjölkprotein'],
  'smör': ['laktos', 'mjölkprotein'], 'ost': ['laktos', 'mjölkprotein'],
  'parmesan': ['laktos', 'mjölkprotein'], 'halloumi': ['laktos', 'mjölkprotein'],
  'fetaost': ['laktos', 'mjölkprotein'], 'yoghurt': ['laktos', 'mjölkprotein'],
  'mozzarella': ['laktos', 'mjölkprotein'],
  // Ägg
  'ägg': ['ägg'], 'majonnäs': ['ägg'],
  // Fisk
  'lax': ['fisk'], 'torsk': ['fisk'], 'fiskbuljong': ['fisk'], 'sardeller': ['fisk'],
  'tonfisk': ['fisk'],
  // Skaldjur
  'räkor': ['skaldjur'], 'musslor': ['skaldjur'], 'kräftstjärtar': ['skaldjur'],
  // Nötter / jordnöt
  'hasselnötter': ['nötter'], 'mandel': ['nötter'], 'valnötter': ['nötter'],
  'cashewnötter': ['nötter'], 'pinjenötter': ['nötter'],
  'jordnötter': ['jordnöt'], 'jordnötssmör': ['jordnöt'],
  // Soja
  'sojasås': ['soja', 'gluten'], 'tofu': ['soja'], 'edamame': ['soja'],
  // Sesam
  'sesamfrön': ['sesam'], 'tahini': ['sesam'], 'sesamolja': ['sesam'],
  // Selleri
  'selleri': ['selleri'], 'rotselleri': ['selleri'],
  // Senap
  'senap': ['senap'], 'dijonsenap': ['senap'],
};

/**
 * Look up allergens for a canonical ingredient name.
 * Exact match only (never includes()) to avoid false positives;
 * template data is the authoritative source.
 *
 * @param {string} canonicalName
 * @returns {string[]} allergen codes (empty if unknown)
 */
export function ingredientAllergens(canonicalName) {
  if (!canonicalName) return [];
  return INGREDIENT_ALLERGEN_MAP[String(canonicalName).toLowerCase().trim()] || [];
}
