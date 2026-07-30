// ============================================
// Prisma Client — Database connection
// ============================================

import { PrismaClient } from '@prisma/client';
import { isDev } from './env.js';
import { poolerSafeUrl } from './poolerUrl.js';

const globalForPrisma = globalThis;

// datasourceUrl overrides the schema's `url` for the Client only; `directUrl`
// (migrations/introspection) is unaffected.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: poolerSafeUrl(process.env.DATABASE_URL),
    log: isDev ? ['query', 'warn', 'error'] : ['error'],
  });

if (isDev) globalForPrisma.prisma = prisma;
