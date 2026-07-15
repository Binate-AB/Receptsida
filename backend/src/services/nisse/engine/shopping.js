// ============================================
// Nisse Engine — Shopping list aggregation
// Merges ingredients by canonical name + unit family,
// sums quantities in base units, groups by store aisle.
// Pure, deterministic.
// ============================================

import { normalizeAmount, sameUnitFamily, formatAmount } from './units.js';

/** Store walking order — must match frontend AISLE_MAP in src/data/recipes.js */
const AISLE_ORDER = {
  'Kött & Fisk': 1,
  'Mejeri': 2,
  'Frukt & Grönt': 3,
  'Torrvaror & Pasta': 4,
  'Konserver & Såser': 5,
  'Kryddor & Smaksättare': 6,
  'Oljor & Vinäger': 7,
  'Bröd': 8,
  'Frys': 9,
  'Övrigt': 99,
};

/**
 * Build shopping list items from inventory-matched ingredients.
 *
 * Input entries come from matchInventory(): toBuy → necessary items,
 * uncertain → probablyHome items (user double-checks at home).
 * atHome entries are excluded entirely.
 *
 * Merging: same canonical + same unit family → one item with summed
 * quantity (in the family's base unit). Different families for the
 * same canonical stay separate (e.g. "2 st citron" vs "1 dl citronsaft").
 *
 * @param {{ toBuy: object[], uncertain: object[] }} inventoryMatch
 * @returns {Array<object>} ShoppingListItem inputs, aisle-sorted
 */
export function aggregateShoppingList(inventoryMatch) {
  const merged = new Map(); // key: canonical|family

  const addEntry = (entry, probablyHome) => {
    const ing = entry.ingredient;
    const norm = normalizeAmount(ing.qty ?? 0, ing.unit);
    const familyKey = norm.family || `raw:${ing.unit || ''}`;
    const key = `${ing.canonical}|${familyKey}`;

    if (merged.has(key)) {
      const existing = merged.get(key);
      if (norm.family && sameUnitFamily(existing.unit, norm.unit)) {
        existing.quantity = (existing.quantity || 0) + norm.qty;
      }
      // Any necessary occurrence makes the merged item necessary;
      // any confident to-buy occurrence clears probablyHome
      existing.necessary = existing.necessary || !ing.optional;
      existing.probablyHome = existing.probablyHome && probablyHome;
      existing.estPrice = Math.max(existing.estPrice || 0, Number(ing.estPriceSek) || 0) || null;
    } else {
      merged.set(key, {
        name: ing.name,
        canonical: ing.canonical,
        quantity: norm.family ? norm.qty : ing.qty ?? null,
        unit: norm.family ? norm.unit : ing.unit || null,
        aisle: ing.aisle || 'Övrigt',
        necessary: !ing.optional,
        probablyHome,
        estPrice: Number(ing.estPriceSek) || null,
      });
    }
  };

  for (const entry of inventoryMatch.toBuy || []) addEntry(entry, false);
  for (const entry of inventoryMatch.uncertain || []) addEntry(entry, true);

  const items = [...merged.values()].sort(
    (a, b) =>
      (AISLE_ORDER[a.aisle] || 99) - (AISLE_ORDER[b.aisle] || 99) ||
      a.name.localeCompare(b.name, 'sv')
  );

  return items.map((item, index) => ({
    ...item,
    displayAmount: item.quantity ? formatAmount(item.quantity, item.unit) : null,
    sortOrder: index,
  }));
}

/**
 * Sum the approximate cost of the necessary items on a list.
 */
export function shoppingListCost(items) {
  const sum = (items || [])
    .filter((i) => i.necessary && !i.probablyHome)
    .reduce((acc, i) => acc + (Number(i.estPrice) || 0), 0);
  return sum;
}
