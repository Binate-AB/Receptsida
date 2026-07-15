// ============================================
// Nisse — Analytics event logging
// Server-side writes are the source of truth for
// funnel metrics; failures never break the request.
// ============================================

export const EVENT_NAMES = [
  'dinner_solved',
  'recommendation_viewed',
  'recommendation_accepted',
  'alternative_requested',
  'shopping_list_created',
  'cooking_started',
  'cooking_completed',
  'cooking_abandoned',
  'rescue_used',
  'feedback_submitted',
];

/**
 * Fire-and-forget event insert. Never throws.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ userId?: string, householdId?: string, name: string, payload?: object }} event
 */
export async function logEvent(prisma, { userId, householdId, name, payload }) {
  try {
    await prisma.analyticsEvent.create({
      data: { userId: userId ?? null, householdId: householdId ?? null, name, payload: payload ?? undefined },
    });
  } catch (err) {
    console.error('Analytics event failed:', name, err.message);
  }
}
