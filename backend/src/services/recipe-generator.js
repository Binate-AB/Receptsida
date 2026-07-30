// ============================================
// AI Recipe Generator — Generate original recipes
// using our scraped lexicon and recipe patterns
// ============================================
// Uses Claude AI to generate authentic Swedish recipes
// informed by the vocabulary and patterns learned
// from our scraped recipe database.

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';
import { prisma } from '../config/db.js';
import { cacheGet, cacheSet } from '../config/redis.js';
import crypto from 'crypto';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
const MODEL = config.ANTHROPIC_MODEL;

/**
 * Generate an original recipe using AI + our lexicon
 *
 * @param {object} params
 * @param {string[]} params.ingredients - Ingredients the user has
 * @param {number} params.servings - Number of servings
 * @param {string} params.difficulty - Enkel/Medel/Avancerad
 * @param {number} params.maxTimeMinutes - Max cooking time
 * @param {string[]} params.dietary - Dietary restrictions
 * @param {string} params.style - Meal type: frukost/lunch/middag/dessert/mellanmål
 * @returns {object} Generated recipe
 */
export async function generateRecipe(params) {
  const {
    ingredients = [],
    servings = 4,
    difficulty = 'Medel',
    maxTimeMinutes,
    dietary = [],
    style = 'middag',
  } = params;

  // Cache key based on inputs
  const cacheKey = generateCacheKey(params);
  const cached = await cacheGet(cacheKey);
  if (cached) return { ...cached, cached: true, source: 'cache' };

  // Get lexicon context (top ingredients, techniques, popular combinations)
  const lexiconContext = await buildLexiconContext(ingredients);

  // Find similar scraped recipes for inspiration
  const similarRecipes = await findSimilarRecipes(ingredients, style);

  // Build the generation prompt
  const prompt = buildGenerationPrompt({
    ingredients,
    servings,
    difficulty,
    maxTimeMinutes,
    dietary,
    style,
    lexiconContext,
    similarRecipes,
  });

  // Generate with Claude
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  // Parse JSON response
  const recipe = parseGeneratedRecipe(rawText);

  if (!recipe) {
    throw new Error('Kunde inte generera recept. Försök igen.');
  }

  // Mark as AI-generated
  recipe.source = 'ai_generated';
  recipe.generated_from = {
    ingredients,
    lexicon_words_used: lexiconContext.topWords.length,
    similar_recipes_consulted: similarRecipes.length,
  };

  // Cache for 1 hour
  await cacheSet(cacheKey, recipe, 3600);

  return { ...recipe, cached: false };
}

/**
 * Generate multiple recipe suggestions
 */
export async function generateRecipeSuggestions(params) {
  const { ingredients = [], count = 3, style } = params;

  const lexiconContext = await buildLexiconContext(ingredients);
  const similarRecipes = await findSimilarRecipes(ingredients, style);

  const prompt = `Du är Nisse receptgenerator — Sveriges smartaste matassistent.

DITT ORDFÖRRÅD (från vårt recept-lexikon):
${lexiconContext.summary}

ANVÄNDARENS INGREDIENSER: ${ingredients.join(', ')}
${style ? `MÅLTIDSTYP: ${style}` : ''}

LIKNANDE RECEPT I VÅR DATABAS (för inspiration):
${similarRecipes.map((r) => `- ${r.title} (${r.sourceDomain})`).join('\n') || 'Inga liknande recept hittade.'}

Ge ${count} KORTA receptförslag (bara titel + kort beskrivning + ungefärlig tid).
Recepten ska vara ORIGINELLA — inspirerade av men inte kopierade från befintliga recept.
Använd autentiskt svenskt matspråk från lexikonet.

Svara ENBART med giltig JSON:
{
  "suggestions": [
    {
      "title": "Receptnamn",
      "description": "En kort, aptitlig beskrivning (max 2 meningar)",
      "time_minutes": 30,
      "difficulty": "Enkel",
      "match_score": 85,
      "key_ingredients": ["ingrediens1", "ingrediens2"]
    }
  ]
}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return parseJsonResponse(rawText);
}

// ──────────────────────────────────────────
// Prompt building
// ──────────────────────────────────────────

function buildGenerationPrompt({
  ingredients, servings, difficulty, maxTimeMinutes,
  dietary, style, lexiconContext, similarRecipes,
}) {
  const dietaryStr = dietary.length > 0
    ? `\nKOSTRESTRIKTIONER: ${dietary.join(', ')}`
    : '';

  const timeStr = maxTimeMinutes
    ? `\nMAX TID: ${maxTimeMinutes} minuter`
    : '';

  const inspirationStr = similarRecipes.length > 0
    ? `\nLIKNANDE RECEPT (för inspiration, KOPIERA INTE):
${similarRecipes.map((r) => {
  const ings = r.ingredients?.map((i) => i.name).join(', ') || '';
  return `- ${r.title}: ${ings}`;
}).join('\n')}`
    : '';

  return `Du är Nisse receptgenerator — Sveriges smartaste matassistent.
Du skapar ORIGINELLA svenska recept baserat på vårt omfattande recept-lexikon.

DITT RECEPT-LEXIKON (vanligaste orden från ${lexiconContext.totalWords} analyserade recept):
${lexiconContext.summary}

VANLIGASTE TEKNIKER: ${lexiconContext.techniques.join(', ')}
VANLIGASTE VERKTYG: ${lexiconContext.tools.join(', ')}

ANVÄNDARENS INGREDIENSER: ${ingredients.join(', ')}
PORTIONER: ${servings}
SVÅRIGHETSGRAD: ${difficulty}${dietaryStr}${timeStr}
MÅLTIDSTYP: ${style}
${inspirationStr}

UPPGIFT: Skapa ETT komplett, originellt recept.

REGLER:
- Receptet ska vara ORIGINELLT — inte kopierat från någon specifik källa
- Använd autentiskt svenskt matspråk från lexikonet ovan
- Ingrediensmängder ska vara realistiska för svenska mått (dl, msk, tsk, g, etc.)
- Stegen ska vara tydliga, detaljerade och i rätt ordning
- Inkludera alla köksverktyg som behövs
- Uppskatta kostnad i SEK baserat på svenska matpriser 2024
- Tipset ska vara genuint användbart

Svara ENBART med giltig JSON (ingen markdown, inga backticks):
{
  "title": "Receptnamn",
  "description": "Kort, aptitlig beskrivning",
  "time_minutes": 30,
  "prep_time_minutes": 10,
  "cook_time_minutes": 20,
  "difficulty": "${difficulty}",
  "servings": ${servings},
  "cost_estimate": "ca 65 kr",
  "category": "${style}",
  "ingredients": [
    { "name": "Ingrediens", "amount": "2 dl", "have": true }
  ],
  "tools": ["Stekpanna", "Skärbräda"],
  "steps": [
    {
      "text": "Detaljerad instruktion...",
      "duration_minutes": 5
    }
  ],
  "tips": "Ett genuint tips...",
  "nutrition_note": "Kort näringsinformation"
}`;
}

// ──────────────────────────────────────────
// Lexicon context building
// ──────────────────────────────────────────

async function buildLexiconContext(userIngredients) {
  // Get word statistics
  const totalWords = await prisma.recipeWord.count();

  // Get top ingredients
  const topIngredients = await prisma.recipeWord.findMany({
    where: {
      category: { in: ['protein', 'mejeri', 'grönsak', 'frukt', 'kolhydrat', 'krydda', 'övrigt', 'ingredient'] },
    },
    orderBy: { frequency: 'desc' },
    take: 100,
    select: { word: true, category: true, frequency: true, emoji: true },
  });

  // Get top techniques
  const topTechniques = await prisma.recipeWord.findMany({
    where: { category: 'technique' },
    orderBy: { frequency: 'desc' },
    take: 20,
    select: { word: true, frequency: true },
  });

  // Get top tools
  const topTools = await prisma.recipeWord.findMany({
    where: { category: 'tool' },
    orderBy: { frequency: 'desc' },
    take: 15,
    select: { word: true, frequency: true },
  });

  // Build summary grouped by category
  const grouped = {};
  for (const w of topIngredients) {
    if (!grouped[w.category]) grouped[w.category] = [];
    grouped[w.category].push(`${w.emoji || ''} ${w.word}`.trim());
  }

  const summary = Object.entries(grouped)
    .map(([cat, words]) => `${cat}: ${words.slice(0, 15).join(', ')}`)
    .join('\n');

  return {
    totalWords,
    topWords: topIngredients,
    techniques: topTechniques.map((t) => t.word),
    tools: topTools.map((t) => t.word),
    summary,
  };
}

// ──────────────────────────────────────────
// Similar recipe lookup
// ──────────────────────────────────────────

async function findSimilarRecipes(userIngredients, style) {
  if (userIngredients.length === 0) return [];

  // Find scraped recipes containing any of the user's ingredients
  const recipes = await prisma.scrapedRecipe.findMany({
    where: {
      ingredients: {
        some: {
          name: {
            in: userIngredients.map((i) => i.toLowerCase()),
            mode: 'insensitive',
          },
        },
      },
      ...(style ? { category: { contains: style, mode: 'insensitive' } } : {}),
    },
    include: {
      ingredients: {
        select: { name: true },
        take: 10,
      },
    },
    take: 5,
    orderBy: { rating: 'desc' },
  });

  return recipes;
}

// ──────────────────────────────────────────
// Response parsing
// ──────────────────────────────────────────

function parseGeneratedRecipe(rawText) {
  return parseJsonResponse(rawText);
}

function parseJsonResponse(rawText) {
  const cleaned = rawText.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function generateCacheKey(params) {
  const normalized = JSON.stringify({
    ingredients: (params.ingredients || []).sort(),
    servings: params.servings,
    difficulty: params.difficulty,
    maxTimeMinutes: params.maxTimeMinutes,
    dietary: (params.dietary || []).sort(),
    style: params.style,
  });
  const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return `gen:${hash}`;
}
