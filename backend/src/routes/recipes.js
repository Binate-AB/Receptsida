// ============================================
// Recipe Routes — Search, History, Favorites, Cooking Assistant
// ============================================

import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { recipeSearchRateLimit } from '../middleware/rateLimit.js';
import { validate, recipeSearchSchema, cookingAskSchema, shoppingAskSchema, shareRecipeSchema } from '../middleware/validate.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { generateCacheKey, estimateApiCost, askCookingAssistant, askShoppingAssistant } from '../services/claude.js';
import { searchVerifiedPool } from '../services/nisse/poolSearch.js';
import { parseIngredients } from '../services/lexicon.js';
import { sendRecipeShareEmail } from '../config/email.js';

const router = Router();

// ──────────────────────────────────────────
// POST /recipes/search — search the VERIFIED candidate pool
//
// DEPRECATED legacy path: this used to be an AI web-search
// (services/claude.js), which (a) bypassed the pool gate and
// (b) 502'd whenever the model id was retired. It now runs a
// deterministic search over the verified pool — no AI, no
// network, no 502, and DRAFT/RETIRED dishes can never surface.
// Nisse is not a web search engine (vision §1); the primary
// flow is "Lös middagen" (/dinner/solve).
// ──────────────────────────────────────────
router.post(
  '/search',
  optionalAuth,
  recipeSearchRateLimit,
  validate(recipeSearchSchema),
  asyncHandler(async (req, res) => {
    const { query, householdSize } = req.validated;
    const effectiveHouseholdSize =
      householdSize || (req.user ? await getUserHouseholdSize(req.user.id) : 2);

    let parsed = { recognized: [], unrecognized: [] };
    try {
      parsed = await parseIngredients(query);
    } catch (err) {
      console.warn('Ingredient parsing failed, continuing with search:', err.message);
    }

    const recipes = await searchVerifiedPool(prisma, query, {
      householdSize: effectiveHouseholdSize,
    });

    const result = { recipes, shopping_list: [], sources: [], cached: false };
    const cacheKey = generateCacheKey(query, effectiveHouseholdSize);

    // Only save to DB and track quota if user is logged in
    if (req.user) {
      saveSearchToDB(req.user.id, query, parsed, effectiveHouseholdSize, cacheKey, result).catch(
        (err) => console.error('Failed to save search:', err.message)
      );

      updateSearchQuota(req.user.id).catch((err) =>
        console.error('Failed to update quota:', err.message)
      );
    }

    res.json({
      recipes: result.recipes,
      shopping_list: result.shopping_list,
      sources: result.sources,
      cached: result.cached,
      parsed_ingredients: parsed,
      meta: {
        query,
        householdSize: effectiveHouseholdSize,
        recipeCount: result.recipes.length,
        source: 'verified_pool',
      },
    });
  })
);

// ──────────────────────────────────────────
// POST /recipes/cooking/ask — Cooking assistant Q&A
// ──────────────────────────────────────────
router.post(
  '/cooking/ask',
  optionalAuth,
  validate(cookingAskSchema),
  asyncHandler(async (req, res) => {
    const { recipe, question, conversationHistory, context } = req.validated;

    const result = await askCookingAssistant(recipe, question, conversationHistory || [], context || {});

    res.json({
      answer: result.answer,
    });
  })
);

// ──────────────────────────────────────────
// POST /recipes/shopping/ask — Shopping assistant Q&A
// ──────────────────────────────────────────
router.post(
  '/shopping/ask',
  optionalAuth,
  validate(shoppingAskSchema),
  asyncHandler(async (req, res) => {
    const { recipe, question, conversationHistory } = req.validated;

    const result = await askShoppingAssistant(recipe, question, conversationHistory || []);

    res.json({
      answer: result.answer,
    });
  })
);

// ──────────────────────────────────────────
// GET /recipes/history — User's search history
// ──────────────────────────────────────────
router.get(
  '/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    const [searches, total] = await Promise.all([
      prisma.recipeSearch.findMany({
        where: { userId: req.user.id },
        include: {
          recipes: {
            select: {
              id: true,
              title: true,
              timeMinutes: true,
              difficulty: true,
              servings: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.recipeSearch.count({ where: { userId: req.user.id } }),
    ]);

    res.json({
      searches,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

// ──────────────────────────────────────────
// GET /recipes/:id — Get a specific recipe
// ──────────────────────────────────────────
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const include = {
      ingredients: { orderBy: { sortOrder: 'asc' } },
      steps: { orderBy: { sortOrder: 'asc' } },
      tools: true,
    };

    // Only check favorites if user is logged in
    if (req.user) {
      include.favorites = {
        where: { userId: req.user.id },
        select: { id: true },
      };
    }

    const recipe = await prisma.recipe.findUnique({
      where: { id: req.params.id },
      include,
    });

    if (!recipe) {
      throw new AppError(404, 'not_found', 'Receptet hittades inte.');
    }

    res.json({
      ...recipe,
      isFavorite: req.user ? (recipe.favorites?.length > 0) : false,
      favorites: undefined,
    });
  })
);

// ──────────────────────────────────────────
// POST /recipes/:id/save — Toggle favorite
// ──────────────────────────────────────────
router.post(
  '/:id/save',
  requireAuth,
  asyncHandler(async (req, res) => {
    const recipeId = req.params.id;
    const userId = req.user.id;

    const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) {
      throw new AppError(404, 'not_found', 'Receptet hittades inte.');
    }

    const existing = await prisma.favorite.findUnique({
      where: { userId_recipeId: { userId, recipeId } },
    });

    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return res.json({ saved: false, message: 'Recept borttaget från favoriter.' });
    }

    await prisma.favorite.create({ data: { userId, recipeId } });
    res.json({ saved: true, message: 'Recept sparat som favorit!' });
  })
);

// ──────────────────────────────────────────
// GET /recipes/favorites/list — Get user favorites
// ──────────────────────────────────────────
router.get(
  '/favorites/list',
  requireAuth,
  asyncHandler(async (req, res) => {
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.user.id },
      include: {
        recipe: {
          include: {
            ingredients: { orderBy: { sortOrder: 'asc' } },
            steps: { orderBy: { sortOrder: 'asc' } },
            tools: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      favorites: favorites.map((f) => ({
        ...f.recipe,
        savedAt: f.createdAt,
      })),
    });
  })
);

// ──────────────────────────────────────────
// POST /recipes/share — Share recipe via email
// ──────────────────────────────────────────
router.post(
  '/share',
  requireAuth,
  validate(shareRecipeSchema),
  asyncHandler(async (req, res) => {
    const { recipeId, toEmail } = req.validated;

    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        ingredients: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!recipe) {
      throw new AppError(404, 'not_found', 'Receptet hittades inte.');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { name: true, email: true },
    });

    await sendRecipeShareEmail(user, toEmail, recipe);

    res.json({ message: `Receptet har skickats till ${toEmail}!` });
  })
);

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

async function getUserHouseholdSize(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { householdSize: true },
  });
  return user?.householdSize || 1;
}

async function saveSearchToDB(userId, query, parsed, householdSize, cacheKey, result) {
  const search = await prisma.recipeSearch.create({
    data: {
      userId,
      query,
      ingredients: parsed.recognized.map((r) => r.canonical),
      householdSize,
      cacheKey,
      resultCount: result.recipes.length,
      apiCostEstimate: result.cached ? 0 : estimateApiCost(),
    },
  });

  for (const recipe of result.recipes) {
    const slug = recipe.title
      .toLowerCase()
      .replace(/[åä]/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    await prisma.recipe.create({
      data: {
        searchId: search.id,
        title: recipe.title,
        slug: `${slug}-${search.id.slice(0, 6)}`,
        sourceName: recipe.source_name || null,
        sourceUrl: recipe.source_url || null,
        timeMinutes: recipe.time_minutes,
        difficulty: recipe.difficulty,
        servings: recipe.servings,
        costEstimate: recipe.cost_estimate || null,
        tips: recipe.tips || null,
        ingredients: {
          create: recipe.ingredients.map((ing, idx) => ({
            name: ing.name,
            amount: ing.amount,
            userHas: ing.have || false,
            sortOrder: idx,
          })),
        },
        steps: {
          create: recipe.steps.map((step, idx) => ({
            sortOrder: idx,
            content: typeof step === 'string' ? step : step.text || step.content || '',
          })),
        },
        tools: {
          create: recipe.tools.map((tool) => ({
            name: typeof tool === 'string' ? tool : tool.name || '',
          })),
        },
      },
    });
  }
}

async function updateSearchQuota(userId) {
  const quota = await prisma.searchQuota.findUnique({
    where: { userId },
  });

  if (!quota) {
    await prisma.searchQuota.create({
      data: { userId, searchesUsed: 1, periodStart: new Date() },
    });
    return;
  }

  const hourAgo = new Date(Date.now() - 3600000);
  if (quota.periodStart < hourAgo) {
    await prisma.searchQuota.update({
      where: { userId },
      data: { searchesUsed: 1, periodStart: new Date() },
    });
  } else {
    await prisma.searchQuota.update({
      where: { userId },
      data: { searchesUsed: { increment: 1 } },
    });
  }
}

export default router;
