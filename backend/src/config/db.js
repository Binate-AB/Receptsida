// ============================================
// Prisma Client — Database connection
// ============================================

import { PrismaClient } from '@prisma/client';
import { isDev } from './env.js';
import { poolerSafeUrl, assertRuntimeHostReachable } from './poolerUrl.js';

// Fail fast (on Vercel) with a self-explaining message if DATABASE_URL points
// at the IPv6-only direct host instead of the pooler — see poolerUrl.js.
assertRuntimeHostReachable(process.env.DATABASE_URL);

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
