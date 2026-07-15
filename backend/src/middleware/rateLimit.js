// ============================================
// Rate Limiting Middleware
// ============================================

import { checkRateLimit } from '../config/redis.js';
import { config } from '../config/env.js';

/**
 * General API rate limiter (per IP)
 */
export function generalRateLimit(req, res, next) {
  return rateLimitByKey(
    `rl:general:${req.ip}`,
    config.RATE_LIMIT_MAX_REQUESTS,
    config.RATE_LIMIT_WINDOW_MS / 1000
  )(req, res, next);
}

/**
 * Recipe search rate limiter (per user or per IP for anonymous)
 * Logged in — FREE: 10/hour, PREMIUM: 100/hour
 * Anonymous — 5/hour (IP-based)
 */
export function recipeSearchRateLimit(req, res, next) {
  if (req.user) {
    const limit =
      req.user.plan === 'PREMIUM' || req.user.plan === 'ADMIN'
        ? config.RECIPE_SEARCH_LIMIT_PER_HOUR_PREMIUM
        : config.RECIPE_SEARCH_LIMIT_PER_HOUR;

    return rateLimitByKey(
      `rl:recipe:${req.user.id}`,
      limit,
      3600
    )(req, res, next);
  }

  // Anonymous users: IP-based rate limit (5/hour)
  return rateLimitByKey(
    `rl:recipe:anon:${req.ip}`,
    5,
    3600
  )(req, res, next);
}

/**
 * Nisse dinner solver: generous but bounded (solve can make
 * up to two small AI calls). Per-user, 30/h (premium 100/h).
 */
export function dinnerSolveRateLimit(req, res, next) {
  const limit =
    req.user?.plan === 'PREMIUM' || req.user?.plan === 'ADMIN' ? 100 : 30;
  return rateLimitByKey(`rl:dinner:${req.user.id}`, limit, 3600)(req, res, next);
}

/**
 * Generic rate limiter factory
 */
function rateLimitByKey(key, maxRequests, windowSeconds) {
  return async (req, res, next) => {
    try {
      const result = await checkRateLimit(key, maxRequests, windowSeconds);

      // Set headers
      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': Math.ceil(Date.now() / 1000) + result.resetIn,
      });

      if (!result.allowed) {
        return res.status(429).json({
          error: 'rate_limited',
          message: 'För många förfrågningar. Försök igen senare.',
          retryAfter: result.resetIn,
          remaining: 0,
        });
      }

      next();
    } catch (err) {
      // If Redis is down, allow request but log warning
      console.warn('Rate limit check failed, allowing request:', err.message);
      next();
    }
  };
}
