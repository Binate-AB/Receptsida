// ============================================
// Validation Middleware — Zod schemas
// ============================================

import { z } from 'zod';

/**
 * Validates request body against a Zod schema
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.flatten();
      return res.status(400).json({
        error: 'validation_error',
        message: 'Ogiltiga uppgifter skickade.',
        details: errors.fieldErrors,
      });
    }

    req.validated = result.data;
    next();
  };
}

// ──────────────────────────────────────────
// Auth schemas
// ──────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email('Ogiltig e-postadress'),
  password: z
    .string()
    .min(8, 'Lösenordet måste vara minst 8 tecken')
    .max(128, 'Lösenordet får vara max 128 tecken')
    .regex(/[A-Z]/, 'Lösenordet måste innehålla minst en stor bokstav')
    .regex(/[a-z]/, 'Lösenordet måste innehålla minst en liten bokstav')
    .regex(/[0-9]/, 'Lösenordet måste innehålla minst en siffra')
    .regex(/[^A-Za-z0-9]/, 'Lösenordet måste innehålla minst ett specialtecken'),
  name: z.string().min(1).max(100).optional(),
  householdSize: z.number().int().min(1).max(20).optional().default(1),
});

export const loginSchema = z.object({
  email: z.string().email('Ogiltig e-postadress'),
  password: z.string().min(1, 'Lösenord krävs'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token krävs'),
});

// ──────────────────────────────────────────
// Recipe search schemas
// ──────────────────────────────────────────

export const recipeSearchSchema = z.object({
  query: z
    .string()
    .min(2, 'Sökningen måste vara minst 2 tecken')
    .max(500, 'Sökningen får vara max 500 tecken'),
  householdSize: z.number().int().min(1).max(20).optional(),
  preferences: z
    .object({
      maxTimeMinutes: z.number().int().min(5).max(180).optional(),
      difficulty: z.enum(['Enkel', 'Medel', 'Avancerad']).optional(),
      dietary: z
        .array(z.enum(['vegetarisk', 'vegan', 'glutenfri', 'laktosfri', 'lchf']))
        .optional(),
      maxBudget: z.number().int().min(10).max(2000).optional(),
      occasion: z
        .enum(['vardag', 'fest', 'romantisk', 'barnkalas', 'brunch', 'meal-prep'])
        .optional(),
    })
    .optional(),
});

// ──────────────────────────────────────────
// Cooking assistant schemas
// ──────────────────────────────────────────

const recipePayload = z.object({
  title: z.string().min(1),
  ingredients: z.array(z.object({
    name: z.string(),
    amount: z.string(),
    have: z.boolean().optional(),
    aisle: z.string().optional(),
    est_price: z.string().nullable().optional(),
  })).optional().default([]),
  steps: z.array(z.union([
    z.string(),
    z.object({ text: z.string() }).passthrough(),
    z.object({ content: z.string() }).passthrough(),
  ])).optional().default([]),
  tips: z.string().optional(),
});

const conversationHistoryArray = z.array(z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})).optional().default([]);

export const cookingAskSchema = z.object({
  recipe: recipePayload,
  question: z.string().min(1, 'Ställ en fråga').max(500),
  conversationHistory: conversationHistoryArray,
  context: z.object({
    currentStep: z.number().int().min(0).optional(),
    totalSteps: z.number().int().min(1).optional(),
    activeTimers: z.array(z.object({
      label: z.string(),
      remaining_seconds: z.number(),
    })).optional(),
    inputMode: z.enum(['voice', 'text']).optional(),
  }).optional().default({}),
});

export const shoppingAskSchema = z.object({
  recipe: recipePayload,
  question: z.string().min(1, 'Ställ en fråga').max(500),
  conversationHistory: conversationHistoryArray,
});

// ──────────────────────────────────────────
// Recipe generation schemas
// ──────────────────────────────────────────

export const generateRecipeSchema = z.object({
  ingredients: z
    .array(z.string().min(1).max(100))
    .min(1, 'Ange minst en ingrediens')
    .max(20, 'Max 20 ingredienser'),
  servings: z.number().int().min(1).max(20).optional().default(4),
  difficulty: z.enum(['Enkel', 'Medel', 'Avancerad']).optional().default('Medel'),
  maxTimeMinutes: z.number().int().min(5).max(180).optional(),
  dietary: z
    .array(z.enum(['vegetarisk', 'vegan', 'glutenfri', 'laktosfri', 'lchf']))
    .optional()
    .default([]),
  style: z
    .enum(['frukost', 'lunch', 'middag', 'dessert', 'mellanmål'])
    .optional()
    .default('middag'),
});

// ──────────────────────────────────────────
// Password reset schemas
// ──────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: z.string().email('Ogiltig e-postadress'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token krävs'),
  password: z
    .string()
    .min(8, 'Lösenordet måste vara minst 8 tecken')
    .max(128, 'Lösenordet får vara max 128 tecken'),
});

// ──────────────────────────────────────────
// Recipe sharing schema
// ──────────────────────────────────────────

export const shareRecipeSchema = z.object({
  recipeId: z.string().min(1, 'Recept-ID krävs'),
  toEmail: z.string().email('Ogiltig mottagaradress'),
});

// ──────────────────────────────────────────
// Meal plan schemas
// ──────────────────────────────────────────

export const generateMealPlanSchema = z.object({
  weekStart: z.string().min(1, 'Veckostart krävs'), // ISO date string
  householdSize: z.number().int().min(1).max(20).optional(),
  preferences: z
    .object({
      dietary: z
        .array(z.enum(['vegetarisk', 'vegan', 'glutenfri', 'laktosfri', 'lchf']))
        .optional(),
      maxBudget: z.number().int().min(10).max(5000).optional(),
      mealsPerDay: z.enum(['lunch', 'dinner', 'both']).optional().default('dinner'),
    })
    .optional(),
});

export const swapMealSchema = z.object({
  dayIndex: z.number().int().min(0).max(6),
  mealType: z.enum(['LUNCH', 'DINNER']),
});

export const lockMealSchema = z.object({
  locked: z.boolean(),
});

export const suggestRecipesSchema = z.object({
  ingredients: z
    .array(z.string().min(1).max(100))
    .min(1, 'Ange minst en ingrediens')
    .max(20),
  count: z.number().int().min(1).max(5).optional().default(3),
  style: z
    .enum(['frukost', 'lunch', 'middag', 'dessert', 'mellanmål'])
    .optional(),
});

// ──────────────────────────────────────────
// Nisse — Household schemas
// ──────────────────────────────────────────

import { ALLERGEN_CODES, DIETARY_RESTRICTIONS, EQUIPMENT_CODES } from '../services/nisse/engine/allergens.js';

export const upsertHouseholdSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  cookingSkill: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
  equipment: z.array(z.enum(EQUIPMENT_CODES)).max(20).optional(),
  // Smakförankring: template slugs from the onboarding quick-pick
  dishPreferences: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(30).optional(),
  // Set by the wizard on final save (first completion logs onboarding_completed)
  onboardingCompleted: z.boolean().optional(),
  onboardingDurationMs: z.number().int().min(0).max(3_600_000).optional(),
});

export const householdMemberSchema = z.object({
  name: z.string().min(1, 'Namn krävs').max(100),
  ageCategory: z.enum(['BABY', 'CHILD', 'TEEN', 'ADULT', 'SENIOR']).optional().default('ADULT'),
  allergies: z.array(z.enum(ALLERGEN_CODES)).max(12).optional().default([]),
  dietaryRestrictions: z.array(z.enum(DIETARY_RESTRICTIONS)).max(5).optional().default([]),
  dislikedIngredients: z.array(z.string().min(1).max(50)).max(30).optional().default([]),
  spiceTolerance: z.enum(['NONE', 'MILD', 'MEDIUM', 'HOT']).optional().default('MEDIUM'),
  portionFactor: z.number().min(0.25).max(3).optional(),
  isDefaultPresent: z.boolean().optional().default(true),
});

export const updateHouseholdMemberSchema = householdMemberSchema.partial();

export const inventoryBulkSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1, 'Varunamn krävs').max(100),
        quantity: z.number().positive().max(100000).optional(),
        unit: z.string().max(20).optional(),
        expiresAt: z.string().datetime().optional(),
      })
    )
    .max(200, 'Max 200 varor'),
});

// ──────────────────────────────────────────
// Nisse — Dinner solver schemas
// ──────────────────────────────────────────

const dinnerChipsSchema = z.object({
  timeBudgetMin: z.number().int().min(10).max(240).optional(),
  energy: z.enum(['slut', 'låg', 'normal', 'inspirerad']).optional(),
  budget: z.enum(['snålt', 'normal', 'flexibelt']).optional(),
  eaterIds: z.array(z.string().min(1)).max(20).optional(),
  occasion: z.enum(['vardag', 'helg', 'gäster', 'matlådor']).optional(),
  wantsLeftovers: z.boolean().optional(),
});

export const solveDinnerSchema = z
  .object({
    rawText: z.string().min(3).max(500).optional(),
    chips: dinnerChipsSchema.optional(),
  })
  .refine((data) => data.rawText || data.chips, {
    message: 'Beskriv kvällen eller använd snabbvalen.',
  });

export const alternativeSchema = z.object({
  direction: z.enum(['enklare', 'billigare', 'barnvänligare']),
  excludeTemplateIds: z.array(z.string()).max(20).optional().default([]),
});

// Join an existing household with a short invite code
export const joinHouseholdSchema = z.object({
  inviteCode: z.string().min(4).max(16),
});

// Prep screen: level 1 verification of critical ingredients before cooking
export const prepVerifySchema = z.object({
  confirmed: z.array(z.string().max(60)).max(30).default([]),
  missing: z.array(z.string().max(60)).max(30).default([]),
});

// "Jag saknar något" — structured missing-ingredient report
export const missingIngredientSchema = z.object({
  canonical: z.string().min(1).max(60),
});

// "Jag ligger efter" — behind-schedule replan
export const behindScheduleSchema = z.object({
  minutesBehind: z.number().int().min(0).max(240).optional(),
});

// One-tap assumption correction (assumption economy).
// Value semantics per key are validated in assumptionService.
export const assumptionCorrectionSchema = z.object({
  key: z
    .string()
    .regex(
      /^(portions|time_budget|energy|budget|pantry:[a-zåäöé0-9 _-]{1,60})$/,
      'Ogiltig antagande-nyckel'
    ),
  value: z.union([z.string().max(60), z.number(), z.boolean(), z.null()]),
});

// ──────────────────────────────────────────
// Nisse — Shopping list schemas
// ──────────────────────────────────────────

export const updateListItemSchema = z.object({
  checked: z.boolean().optional(),
  necessary: z.boolean().optional(),
});

export const updateListStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DONE']),
});

// ──────────────────────────────────────────
// Nisse — Cook session schemas
// ──────────────────────────────────────────

export const startCookSessionSchema = z
  .object({
    recommendationId: z.string().min(1).optional(),
    templateSlug: z.string().min(1).optional(),
    branch: z.enum(['base', 'split']).optional().default('base'),
    eaterIds: z.array(z.string()).max(20).optional(),
  })
  .refine((d) => d.recommendationId || d.templateSlug, {
    message: 'recommendationId eller templateSlug krävs.',
  });

export const updateCookSessionSchema = z.object({
  currentStepIndex: z.number().int().min(0).max(200).optional(),
  branchState: z.record(z.number().int().min(0).max(200)).optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ABANDONED']).optional(),
});

export const rescueRequestSchema = z.object({
  problem: z.string().min(3, 'Beskriv problemet').max(300),
});

export const sessionAskSchema = z.object({
  question: z.string().min(1, 'Ställ en fråga').max(500),
  context: z.object({
    currentStep: z.number().int().min(0).optional(),
    activeTimers: z.array(z.object({
      label: z.string(),
      remaining_seconds: z.number(),
    })).optional(),
    inputMode: z.enum(['voice', 'text']).optional(),
  }).optional().default({}),
});

export const mealFeedbackSchema = z.object({
  cooked: z.boolean().optional().default(true),
  actualTimeMin: z.number().int().min(1).max(600).optional(),
  cookAgain: z.boolean().optional(),
  avoid: z.boolean().optional().default(false),
  comment: z.string().max(500).optional(),
  memberRatings: z
    .array(z.object({ memberId: z.string().min(1), rating: z.number().int().min(1).max(5) }))
    .max(20)
    .optional()
    .default([]),
});

export const analyticsEventSchema = z.object({
  name: z.enum([
    'recommendation_viewed',
    'cooking_step_viewed',
    'voice_used',
  ]),
  payload: z.record(z.any()).optional(),
});
