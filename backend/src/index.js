// ============================================
// Nisse Backend — Entry Point
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config, isDev } from './config/env.js';
import { redis } from './config/redis.js';
import { prisma } from './config/db.js';
import { generalRateLimit } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';

// Routes
import authRoutes from './routes/auth.js';
import socialAuthRoutes from './routes/social-auth.js';
import recipeRoutes from './routes/recipes.js';
import lexiconRoutes from './routes/lexicon.js';
import scraperRoutes from './routes/scraper.js';
import gdprRoutes from './routes/gdpr.js';
import locationRoutes from './routes/locations.js';
import mealPlanRoutes from './routes/meal-plans.js';
import cookingRoutes from './routes/cooking.js';
import householdRoutes from './routes/households.js';
import dinnerRoutes from './routes/dinner.js';
import shoppingListRoutes from './routes/shopping-lists.js';
import cookSessionRoutes from './routes/cook-sessions.js';
import eventRoutes from './routes/events.js';

const app = express();

// ──────────────────────────────────────────
// Global Middleware
// ──────────────────────────────────────────

// Security headers
app.use(helmet());

// CORS — allow explicit origins + all Vercel preview deployments
const allowedOrigins = config.CORS_ORIGIN.split(',').map((o) => o.trim());
const vercelPreviewRegex = /^https:\/\/receptsida(-[a-z0-9]+-promoe88)?\.vercel\.app$/;

app.use(
  cors({
    origin(origin, cb) {
      // Allow server-to-server (no origin) and allowed list
      if (!origin || allowedOrigins.includes(origin) || vercelPreviewRegex.test(origin)) {
        return cb(null, true);
      }
      cb(new Error('Blocked by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parsing
app.use(express.json({ limit: '1mb' }));

// Logging
app.use(morgan(isDev ? 'dev' : 'combined'));

// Trust proxy (for rate limiting behind Vercel/Railway)
app.set('trust proxy', 1);

// Rate limiting
app.use('/api/', generalRateLimit);

// ──────────────────────────────────────────
// API Routes
// ──────────────────────────────────────────

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/auth', socialAuthRoutes);
app.use('/api/v1/recipes', recipeRoutes);
app.use('/api/v1/lexicon', lexiconRoutes);
app.use('/api/v1/scraper', scraperRoutes);
app.use('/api/v1/gdpr', gdprRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/meal-plans', mealPlanRoutes);
app.use('/api/v1/cooking', cookingRoutes);
app.use('/api/v1/households', householdRoutes);
app.use('/api/v1/dinner', dinnerRoutes);
app.use('/api/v1/shopping-lists', shoppingListRoutes);
app.use('/api/v1/cook-sessions', cookSessionRoutes);
app.use('/api/v1/events', eventRoutes);

// Health check
app.get('/api/health', async (req, res) => {
  const checks = {};

  // DB check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  // Redis check (optional)
  if (redis) {
    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'unavailable';
    }
  } else {
    checks.redis = 'not_configured';
  }

  // Claude API check (only when ?deep=true to avoid cost on every ping)
  if (req.query.deep === 'true') {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 10_000 });
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Svara med OK' }],
      });
      const text = response.content?.[0]?.text || '';
      checks.claude_api = text.length > 0 ? 'ok' : 'empty_response';
    } catch (err) {
      checks.claude_api = `error: ${err.status || err.code || err.message}`;
    }
  }

  const healthy = checks.database === 'ok';

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: `Endpoint ${req.method} ${req.path} finns inte.`,
  });
});

// Error handler
app.use(errorHandler);

// ──────────────────────────────────────────
// Start Server
// ──────────────────────────────────────────

async function start() {
  try {
    // Connect Redis (optional)
    if (redis) {
      try {
        await redis.connect();
        console.log('✅ Redis connected');
      } catch (err) {
        console.warn('⚠️ Redis connection failed, continuing without cache:', err.message);
      }
    }

    // Verify DB connection
    await prisma.$connect();
    console.log('✅ Database connected');

    // Start Express
    app.listen(config.PORT, '0.0.0.0', () => {
      console.log(`\n🍳 Nisse API running on port ${config.PORT}`);
      console.log(`   Environment: ${config.NODE_ENV}`);
      console.log(`   Health:      http://localhost:${config.PORT}/api/health`);
      console.log(`   CORS origin: ${config.CORS_ORIGIN}\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await prisma.$disconnect();
  if (redis) redis.disconnect();
  process.exit(0);
});
