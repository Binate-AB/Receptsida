// ============================================
// Nisse — Household access helper
// JWT only carries {id, email, plan}, so every route
// that needs household data must load it from the DB.
// Access is MEMBERSHIP-based (several adults share one
// household); ownerId remains as the creator and as a
// legacy fallback that self-heals into a membership.
// ============================================

import { AppError } from '../../middleware/errorHandler.js';

/**
 * Load the household the user belongs to (as member or legacy owner),
 * including members. Throws 404 if the user has none yet.
 *
 * MVP invariant: a user belongs to exactly ONE household
 * (HouseholdMembership.userId is unique).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {object} [options] — extra Prisma `include` fields
 * @returns {Promise<object>} household with members
 */
export async function getMemberHousehold(prisma, userId, options = {}) {
  const include = {
    members: { orderBy: { sortOrder: 'asc' } },
    ...(options.include || {}),
  };

  const membership = await prisma.householdMembership.findUnique({
    where: { userId },
    select: { householdId: true },
  });

  if (membership) {
    const household = await prisma.household.findUnique({
      where: { id: membership.householdId },
      include,
    });
    if (household) return household;
  }

  // Legacy fallback: households created before memberships existed.
  // Self-heal by creating the OWNER membership.
  const owned = await prisma.household.findUnique({ where: { ownerId: userId }, include });
  if (owned) {
    await prisma.householdMembership
      .create({ data: { userId, householdId: owned.id, role: 'OWNER' } })
      .catch(() => {}); // race-safe: unique(userId)
    return owned;
  }

  throw new AppError(404, 'no_household', 'Du har inget hushåll ännu. Skapa ett under Hushåll.');
}

/**
 * Back-compat alias — existing routes import this name.
 * Semantics are now membership-based (see getMemberHousehold).
 */
export const getOwnedHousehold = getMemberHousehold;

/**
 * Nullable variant for paths where "no household yet" is fine
 * (e.g. analytics events).
 */
export async function findMemberHousehold(prisma, userId) {
  try {
    return await getMemberHousehold(prisma, userId);
  } catch {
    return null;
  }
}
