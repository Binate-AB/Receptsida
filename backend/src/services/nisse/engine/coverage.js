// ============================================
// Nisse Engine — dish coverage matrix (§21)
// Pure functions. Classifies dishes into the
// 6 core cells (time window × effort band),
// measures REAL filter resilience by running
// the hard gates with synthetic households,
// and checks protein-base spread.
//
// "Räkna generöst, verifiera ärligt": a dish
// may claim extra cells via coverageCells in
// seed JSON, but filter resilience is always
// measured through the actual gates — never
// through tags.
//
// Matrix doc: docs/NISSE_DISH_COVERAGE_MATRIX.md
// ============================================

import { hardGates, dietaryGate } from './allergenGate.js';

// Time windows: A ≤15 min, B 16–30 min, C 31+ min (total time).
// Effort bands: 1 = minimal (effortScore ≤ 1), 2 = normal (effortScore ≥ 2).
export const CELLS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// Minimum verified dishes per cell (matrix §21).
export const CELL_MINIMUMS = { A1: 4, A2: 3, B1: 6, B2: 6, C1: 3, C2: 4 };

// Per cell, at least MIN_FILTER_SURVIVORS dishes must survive each of
// these synthetic households (measured through the real hard gates).
export const MIN_FILTER_SURVIVORS = 2;
const SYNTHETIC_MEMBERS = {
  gluten: { id: 'syn-g', name: 'Syntetisk', allergies: ['gluten'], dietaryRestrictions: [] },
  laktos: { id: 'syn-l', name: 'Syntetisk', allergies: ['laktos'], dietaryRestrictions: [] },
  vego: { id: 'syn-v', name: 'Syntetisk', allergies: [], dietaryRestrictions: ['vegetarisk'] },
};

// Protein spread: cells with min ≥ 4 need at least 3 distinct bases.
export const MIN_PROTEIN_BASES = 3;
const PROTEIN_BASES = [
  { base: 'kyckling', canonicals: ['kyckling', 'kycklingfilé', 'kycklinglårfilé', 'kycklingkorv', 'kycklingköttbullar'] },
  { base: 'fisk', canonicals: ['lax', 'tonfisk', 'fiskpinnar', 'torsk', 'fisk', 'räkor'] },
  { base: 'kött', canonicals: ['köttfärs', 'falukorv', 'korv', 'köttbullar', 'bacon', 'kassler', 'fläskfilé', 'pyttipanna'] },
  { base: 'vego', canonicals: ['linser', 'svarta bönor', 'kikärtor', 'vita bönor', 'kidneybönor', 'halloumi', 'ägg', 'quorn', 'tofu', 'vegofärs', 'sojafärs'] },
];

/** Time window for a total cooking time. */
export function timeWindow(totalTimeMin) {
  if (totalTimeMin <= 15) return 'A';
  if (totalTimeMin <= 30) return 'B';
  return 'C';
}

/**
 * Cells a template counts toward. Primary cell is derived from
 * totalTimeMin + effortScore; seed JSON may claim extra cells via
 * `coverageCells` (e.g. a 20-min dish that is honestly cookable in
 * 15 by skipping optional steps) — claims are unioned in, never
 * replacing the derived cell.
 */
export function templateCells(tpl) {
  const derived = timeWindow(tpl.totalTimeMin) + (tpl.effortScore <= 1 ? '1' : '2');
  const claimed = (tpl.coverageCells || []).filter((c) => CELLS.includes(c));
  return [...new Set([derived, ...claimed])];
}

/** Cell of a parsed meal request (for the recommendation_gap event). */
export function requestCell(parsed = {}) {
  const t = Number.isFinite(parsed.timeBudgetMin) ? parsed.timeBudgetMin : 30;
  const minimalEffort = parsed.energy === 'slut' || parsed.energy === 'låg';
  return timeWindow(t) + (minimalEffort ? '1' : '2');
}

/**
 * GDPR-safe rejection profile (§24): counts per hard-filter KIND,
 * derived from ranker rejection reasons. NEVER contains which
 * allergen, which member or any free text.
 */
export function countFilterKinds(rejected = []) {
  const kinds = { allergen: 0, dietary: 0, equipment: 0, time: 0, other: 0 };
  for (const r of rejected) {
    const reason = r?.reason || '';
    if (reason.startsWith('allergi')) kinds.allergen += 1;
    else if (reason.startsWith('kost')) kinds.dietary += 1;
    else if (reason.startsWith('saknar utrustning')) kinds.equipment += 1;
    else if (reason.startsWith('för lång tid')) kinds.time += 1;
    else kinds.other += 1;
  }
  return kinds;
}

/** True when the dish survives the given synthetic filter through the REAL gates. */
function survivesFilter(tpl, filterKey) {
  const member = SYNTHETIC_MEMBERS[filterKey];
  if (filterKey === 'vego') {
    // Vegetarian is a dietary path question, not an allergen one
    return dietaryGate(tpl, [member]).safe;
  }
  return hardGates(tpl, [member]).safe;
}

/** Protein base(s) of a dish, from required-ingredient canonicals. */
export function proteinBases(tpl) {
  const canonicals = new Set(
    (tpl.ingredients || []).filter((i) => !i.optional).map((i) => i.canonical)
  );
  const bases = PROTEIN_BASES.filter((p) => p.canonicals.some((c) => canonicals.has(c))).map(
    (p) => p.base
  );
  return bases.length ? bases : ['övrigt'];
}

/**
 * Full coverage report for a set of templates.
 * Returns { cells, failures } where failures is a flat list of
 * human-readable Swedish strings — empty means the matrix holds.
 */
export function coverageReport(templates) {
  const cells = Object.fromEntries(
    CELLS.map((c) => [
      c,
      { dishes: [], filters: { gluten: 0, laktos: 0, vego: 0 }, bases: new Set() },
    ])
  );

  for (const tpl of templates) {
    for (const cell of templateCells(tpl)) {
      const entry = cells[cell];
      entry.dishes.push(tpl.slug);
      for (const key of Object.keys(entry.filters)) {
        if (survivesFilter(tpl, key)) entry.filters[key] += 1;
      }
      for (const base of proteinBases(tpl)) entry.bases.add(base);
    }
  }

  const failures = [];
  for (const cell of CELLS) {
    const entry = cells[cell];
    const min = CELL_MINIMUMS[cell];
    if (entry.dishes.length < min) {
      failures.push(`${cell}: ${entry.dishes.length}/${min} rätter`);
    }
    for (const [key, count] of Object.entries(entry.filters)) {
      if (count < MIN_FILTER_SURVIVORS) {
        failures.push(`${cell}: bara ${count}/${MIN_FILTER_SURVIVORS} rätter överlever ${key}-filtret`);
      }
    }
    if (min >= 4 && entry.bases.size < MIN_PROTEIN_BASES) {
      failures.push(
        `${cell}: ${entry.bases.size}/${MIN_PROTEIN_BASES} proteinbaser (${[...entry.bases].join(', ')})`
      );
    }
  }

  return {
    cells: Object.fromEntries(
      CELLS.map((c) => [
        c,
        {
          dishes: cells[c].dishes,
          filters: cells[c].filters,
          bases: [...cells[c].bases].sort(),
        },
      ])
    ),
    failures,
  };
}
