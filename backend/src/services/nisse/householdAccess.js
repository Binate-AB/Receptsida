// ============================================
// Nisse — Household access helper
// JWT only carries {id, email, plan}, so every route
// that needs household data must load it from the DB.
// ============================================

import { AppError } from '../../middleware/errorHandler.js';

/**
 * Load the household owned by a user, including members.
 * Throws 404 if the user hasn't created one yet.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {object} [options] — extra Prisma `include` fields
 * @returns {Promise<object>} household with members
 */
export async function getOwnedHousehold(prisma, userId, options = {}) {
  const household = await prisma.household.findUnique({
    where: { ownerId: userId },
    include: {
      members: { orderBy: { sortOrder: 'asc' } },
      ...(options.include || {}),
    },
  });

  if (!household) {
    throw new AppError(404, 'no_household', 'Du har inget hushåll ännu. Skapa ett under Hushåll.');
  }

  return household;
}
