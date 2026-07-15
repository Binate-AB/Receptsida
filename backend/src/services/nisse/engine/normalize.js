// ============================================
// Nisse Engine — Ingredient normalization
// Pure, deterministic canonicalization of Swedish
// ingredient names. Alias table is hand-curated for
// the MVP seed set (~120 ingredients).
// ============================================

/**
 * Aliases: variant → canonical name.
 * Keep lowercase. Exact match after basic cleanup — never includes().
 */
const ALIASES = {
  // Kyckling
  'kycklingfilé': 'kyckling', 'kycklingfile': 'kyckling', 'kycklingbröst': 'kyckling',
  'kycklinglårfilé': 'kyckling', 'kycklinglår': 'kyckling', 'kycklingbitar': 'kyckling',
  // Färs
  'köttfärs': 'köttfärs', 'nötfärs': 'köttfärs', 'blandfärs': 'köttfärs',
  // Korv
  'falukorv': 'falukorv', 'länkkorv': 'falukorv', 'korv': 'falukorv',
  // Lax/fisk
  'laxfilé': 'lax', 'laxfile': 'lax', 'laxsida': 'lax', 'fryst lax': 'lax',
  'torskfilé': 'torsk', 'torskrygg': 'torsk',
  // Pasta
  'spagetti': 'pasta', 'spaghetti': 'pasta', 'penne': 'pasta', 'fusilli': 'pasta',
  'makaroner': 'pasta', 'tagliatelle': 'pasta',
  'äggnudlar': 'nudlar', 'risnudlar': 'nudlar',
  // Ris/potatis
  'jasminris': 'ris', 'basmatiris': 'ris', 'långkornigt ris': 'ris',
  'fast potatis': 'potatis', 'mjölig potatis': 'potatis', 'färskpotatis': 'potatis',
  // Mejeri
  'vispgrädde': 'grädde', 'matlagningsgrädde': 'grädde', 'mellangrädde': 'grädde',
  'creme fraiche': 'crème fraiche', 'crème fraîche': 'crème fraiche',
  'standardmjölk': 'mjölk', 'mellanmjölk': 'mjölk', 'lättmjölk': 'mjölk',
  'riven ost': 'ost', 'hushållsost': 'ost', 'lagrad ost': 'ost',
  'parmesanost': 'parmesan', 'grana padano': 'parmesan',
  'smör-&rapsolja': 'smör', 'margarin': 'smör',
  // Grönsaker
  'gul lök': 'lök', 'gullök': 'lök', 'rödlök': 'lök', 'schalottenlök': 'lök',
  'vitlöksklyfta': 'vitlök', 'vitlöksklyftor': 'vitlök',
  'morötter': 'morot', 'krossade tomater': 'krossade tomater',
  'körsbärstomater': 'tomat', 'tomater': 'tomat', 'cocktailtomater': 'tomat',
  'paprikor': 'paprika', 'röd paprika': 'paprika', 'grön paprika': 'paprika',
  'broccolibuketter': 'broccoli', 'zucchini': 'zucchini', 'squash': 'zucchini',
  'champinjoner': 'svamp', 'skogssvamp': 'svamp',
  'babyspenat': 'spenat', 'färsk spenat': 'spenat', 'fryst spenat': 'spenat',
  'isbergssallad': 'sallad', 'romansallad': 'sallad', 'salladsmix': 'sallad',
  'gurkor': 'gurka', 'slanggurka': 'gurka',
  'majskorn': 'majs', 'majsburk': 'majs',
  'röda linser': 'linser', 'gröna linser': 'linser',
  // Skafferi
  'olivolja': 'olivolja', 'rapsolja': 'olja', 'matolja': 'olja', 'solrosolja': 'olja',
  'grönsaksbuljongtärning': 'grönsaksbuljong', 'grönsaksfond': 'grönsaksbuljong',
  'kycklingbuljongtärning': 'kycklingbuljong', 'kycklingfond': 'kycklingbuljong',
  'tomatpuré': 'tomatpuré', 'tomatpure': 'tomatpuré',
  'vetemjöl': 'vetemjöl', 'mjöl': 'vetemjöl',
  'strösocker': 'socker', 'råsocker': 'socker',
  'currypulver': 'curry', 'gul curry': 'curry',
  'paprikapulver': 'paprikapulver', 'rökt paprikapulver': 'paprikapulver',
  'chiliflakes': 'chili', 'chilipulver': 'chili', 'röd chili': 'chili', 'färsk chili': 'chili',
  'svartpeppar': 'peppar', 'vitpeppar': 'peppar',
  'tacokrydda': 'tacokrydda', 'tacokryddmix': 'tacokrydda',
  'sojasås': 'sojasås', 'japansk soja': 'sojasås',
  'sweet chilisås': 'sweet chili', 'sötstark chilisås': 'sweet chili',
  'gröna ärtor': 'ärtor', 'frysta ärtor': 'ärtor', 'ärter': 'ärtor',
  'citroner': 'citron', 'citronsaft': 'citron',
  'persiljeblad': 'persilja', 'färsk persilja': 'persilja', 'bladpersilja': 'persilja',
  'färsk dill': 'dill', 'basilikablad': 'basilika', 'färsk basilika': 'basilika',
  'timjankvistar': 'timjan', 'färsk timjan': 'timjan',
  'gräddfil': 'gräddfil', 'lätt gräddfil': 'gräddfil',
  'halloumiost': 'halloumi',
};

/** Trailing descriptors that never change the identity of the ingredient. */
const STRIP_PATTERNS = [
  /,?\s*(färsk|fryst|torkad|riven|hackad|skivad|tärnad|malen|hel|stor|liten|ekologisk)\s*$/i,
  /\s*\(.*\)\s*$/, // parenthetical notes
];

/**
 * Canonicalize an ingredient name.
 * @param {string} name — raw ingredient name ("Kycklingfilé", "2 dl vispgrädde" not allowed — name only)
 * @param {Record<string,string>} [extraAliases] — optional extension map (e.g. from LexiconEntry)
 * @returns {string} canonical lowercase name
 */
export function canonicalIngredient(name, extraAliases = {}) {
  if (!name) return '';
  let clean = String(name).toLowerCase().trim();

  for (const pattern of STRIP_PATTERNS) {
    clean = clean.replace(pattern, '').trim();
  }

  if (extraAliases[clean]) return extraAliases[clean];
  if (ALIASES[clean]) return ALIASES[clean];

  // Simple singularization of common Swedish plural forms when the
  // singular exists in the alias table or is a known canonical
  if (clean.endsWith('ar') || clean.endsWith('er')) {
    const singular = clean.slice(0, -2);
    if (ALIASES[singular]) return ALIASES[singular];
  }

  return clean;
}
