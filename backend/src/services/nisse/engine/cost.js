// ============================================
// Nisse Engine — Cost estimation
// Static SEK ranges from template data (store price
// integration is fas 3). Pure, deterministic.
// ============================================

/**
 * Estimate meal cost.
 *
 * @param {object} template — { costPerPortionMin, costPerPortionMax }
 * @param {number} portions
 * @param {Array<object>} toBuyEntries — entries from matchInventory().toBuy/uncertain
 *                                        ([{ ingredient: { estPriceSek } }])
 * @returns {{ totalMin: number, totalMax: number, toBuySek: number, perPortionLabel: string, totalLabel: string }}
 */
export function estimateCost(template, portions, toBuyEntries = []) {
  const totalMin = Math.round(template.costPerPortionMin * portions);
  const totalMax = Math.round(template.costPerPortionMax * portions);

  const toBuySek = (toBuyEntries || []).reduce(
    (acc, entry) => acc + (Number(entry?.ingredient?.estPriceSek) || 0),
    0
  );

  return {
    totalMin,
    totalMax,
    toBuySek,
    perPortionLabel: `ca ${template.costPerPortionMin}–${template.costPerPortionMax} kr/portion`,
    totalLabel: `ca ${totalMin}–${totalMax} kr`,
  };
}
