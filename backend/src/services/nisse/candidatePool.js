// ============================================
// Nisse — candidate pool gate (§22/§23)
// The ONLY where-clause allowed when selecting
// templates for recommendation, onboarding
// quick-pick or starting a cooking session by
// slug. DRAFT and RETIRED dishes must never
// reach households: DRAFT content has not been
// human-verified against the checklist in
// docs/NISSE_DISH_VERIFICATION_CHECKLIST.md
// (allergen data included — §13).
//
// Sessions already in flight look templates up
// by id and are intentionally NOT gated here:
// retiring a dish must not break an ongoing
// dinner (its recipeData snapshot is frozen).
// ============================================

export const VERIFIED_POOL_WHERE = Object.freeze({
  isActive: true,
  verificationStatus: 'VERIFIED',
});

/** True when a template row may be served to households. */
export function isInCandidatePool(template) {
  return Boolean(template)
    && template.isActive === true
    && template.verificationStatus === 'VERIFIED';
}
