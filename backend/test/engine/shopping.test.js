// ============================================
// Tests — shopping list aggregation
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateShoppingList, shoppingListCost } from '../../src/services/nisse/engine/shopping.js';

const entry = (canonical, qty, unit, over = {}) => ({
  ingredient: { name: canonical, canonical, qty, unit, aisle: 'Övrigt', ...over },
});

test('same ingredient in the same unit family merges into one item', () => {
  // 2 dl grädde + 3 msk grädde = 200 + 45 = 245 ml
  const items = aggregateShoppingList({
    toBuy: [
      entry('grädde', 2, 'dl', { aisle: 'Mejeri' }),
      entry('grädde', 3, 'msk', { aisle: 'Mejeri' }),
    ],
    uncertain: [],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 245);
  assert.equal(items[0].unit, 'ml');
  assert.equal(items[0].displayAmount, '2,5 dl'); // 245 ml ≈ 2,5 dl display
});

test('different unit families for the same canonical stay separate', () => {
  const items = aggregateShoppingList({
    toBuy: [entry('citron', 1, 'st'), entry('citron', 50, 'ml')],
    uncertain: [],
  });
  assert.equal(items.length, 2);
});

test('items are sorted by store aisle order', () => {
  const items = aggregateShoppingList({
    toBuy: [
      entry('socker', 1, 'dl', { aisle: 'Kryddor & Smaksättare' }),
      entry('kyckling', 500, 'g', { aisle: 'Kött & Fisk' }),
      entry('mjölk', 1, 'l', { aisle: 'Mejeri' }),
    ],
    uncertain: [],
  });
  assert.deepEqual(items.map((i) => i.canonical), ['kyckling', 'mjölk', 'socker']);
  assert.deepEqual(items.map((i) => i.sortOrder), [0, 1, 2]);
});

test('uncertain entries become probablyHome items; toBuy entries do not', () => {
  const items = aggregateShoppingList({
    toBuy: [entry('pasta', 400, 'g')],
    uncertain: [entry('lök', 1, 'st')],
  });
  const pasta = items.find((i) => i.canonical === 'pasta');
  const lok = items.find((i) => i.canonical === 'lök');
  assert.equal(pasta.probablyHome, false);
  assert.equal(lok.probablyHome, true);
});

test('optional ingredients are marked not necessary', () => {
  const items = aggregateShoppingList({
    toBuy: [entry('parmesan', 40, 'g', { optional: true })],
    uncertain: [],
  });
  assert.equal(items[0].necessary, false);
});

test('a necessary occurrence outranks an optional one after merge', () => {
  const items = aggregateShoppingList({
    toBuy: [
      entry('grädde', 1, 'dl', { optional: true }),
      entry('grädde', 1, 'dl', { optional: false }),
    ],
    uncertain: [],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].necessary, true);
});

test('shoppingListCost sums only necessary non-probablyHome items', () => {
  const cost = shoppingListCost([
    { necessary: true, probablyHome: false, estPrice: 30 },
    { necessary: true, probablyHome: true, estPrice: 20 },
    { necessary: false, probablyHome: false, estPrice: 40 },
  ]);
  assert.equal(cost, 30);
});
