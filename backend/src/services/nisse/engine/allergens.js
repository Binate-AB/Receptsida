// ============================================
// Nisse Engine — Allergen taxonomy
// Canonical allergen codes used across household
// members, recipe templates and the allergen gate.
// Deterministic — no AI may alter or bypass this.
// ============================================

/**
 * Canonical allergen codes (Swedish, lowercase), covering ALL 14
 * EU declaration-mandatory allergen groups plus two Swedish extras:
 * - `laktos` is a separate INTOLERANCE marker — it complements but
 *   never replaces `mjölkprotein` (= the EU group "mjölk").
 * - `skaldjur` is a LEGACY umbrella code kept for existing member
 *   selections; the gate expands it to kräftdjur ∪ blötdjur.
 */
export const ALLERGEN_TAXONOMY = [
  { code: 'gluten', label: 'Gluten', description: 'Spannmål som innehåller gluten: vete, råg, korn, havre' },
  { code: 'kräftdjur', label: 'Kräftdjur', description: 'Räkor, kräftor, krabba, hummer' },
  { code: 'ägg', label: 'Ägg', description: 'Ägg och äggprodukter' },
  { code: 'fisk', label: 'Fisk', description: 'All fisk' },
  { code: 'jordnöt', label: 'Jordnöt', description: 'Jordnötter (baljväxt)' },
  { code: 'soja', label: 'Soja', description: 'Sojabönor och sojaprodukter' },
  { code: 'mjölkprotein', label: 'Mjölk (protein)', description: 'EU-gruppen mjölk: kasein/vassle i mejeriprodukter' },
  { code: 'nötter', label: 'Nötter', description: 'Trädnötter: hasselnöt, mandel, valnöt m.fl.' },
  { code: 'selleri', label: 'Selleri', description: 'Rotselleri och stjälkselleri' },
  { code: 'senap', label: 'Senap', description: 'Senap och senapsfrön' },
  { code: 'sesam', label: 'Sesam', description: 'Sesamfrön' },
  { code: 'sulfit', label: 'Svaveldioxid/sulfit', description: 'Konserveringsmedel E220–E228 (>10 mg/kg)' },
  { code: 'lupin', label: 'Lupin', description: 'Lupinfrön och lupinmjöl' },
  { code: 'blötdjur', label: 'Blötdjur', description: 'Musslor, ostron, bläckfisk, sniglar' },
  // Svenska tillägg utanför EU-14:
  { code: 'laktos', label: 'Laktos (intolerans)', description: 'Mjölksocker — intoleransmarkör, ersätter aldrig mjölkprotein' },
  { code: 'skaldjur', label: 'Skaldjur (samlingskod)', description: 'Äldre samlingskod — tolkas som kräftdjur + blötdjur' },
];

export const ALLERGEN_CODES = ALLERGEN_TAXONOMY.map((a) => a.code);

/**
 * Expand legacy umbrella codes to their EU groups. Used by the gate
 * on MEMBER allergies so an old "skaldjur" selection conservatively
 * matches both kräftdjur and blötdjur declarations (and vice versa).
 */
export function expandAllergyCodes(codes) {
  const out = new Set();
  for (const code of codes || []) {
    out.add(code);
    if (code === 'skaldjur') {
      out.add('kräftdjur');
      out.add('blötdjur');
    }
    if (code === 'kräftdjur' || code === 'blötdjur') {
      out.add('skaldjur');
    }
  }
  return [...out];
}

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
  // Kräftdjur / blötdjur (EU-separerade grupper)
  'räkor': ['kräftdjur'], 'kräftstjärtar': ['kräftdjur'], 'krabba': ['kräftdjur'],
  'musslor': ['blötdjur'], 'bläckfisk': ['blötdjur'], 'ostron': ['blötdjur'],
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
