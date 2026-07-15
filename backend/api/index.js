// ============================================
// Vercel serverless entry — Nisse API
// The whole Express app runs as one serverless function.
// Vercel routes every request here (see vercel.json); Express
// then matches its own /api/v1/* and /api/health routes.
// ============================================

import app from '../src/index.js';

export default app;
