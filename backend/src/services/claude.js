// ============================================
// Claude AI Service — Nisse recipe engine
// Three-phase assistant: Recipe → Shopping → Cooking
// ============================================

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';
import { cacheGet, cacheSet } from '../config/redis.js';
import { AppError } from '../middleware/errorHandler.js';
import crypto from 'crypto';
import { repairJSON } from '../utils/json-repair.js';

const client = new Anthropic({
  apiKey: config.ANTHROPIC_API_KEY,
  timeout: 120_000, // 2 min — web search can be slow
  maxRetries: 1,
});

// ──────────────────────────────────────────
// Nisse System Identity
// ──────────────────────────────────────────

const NISSE_IDENTITY = `Du är Nisse — en professionell kockassistent som guidar användaren genom hela matlagningsprocessen, från idé till färdig rätt. Du kombinerar expertis från professionella kök med en varm, pedagogisk approach anpassad efter varje individ.

Kärnprinciper:
- Känn av användarens erfarenhet från hur de uttrycker sig
- Nybörjare: Förklara varje steg, förklara termer ("sjud = när det bubblar svagt"), ge tidsuppskattningar, varna för vanliga misstag
- Erfarna: Var koncis, föreslå variationer, nämn professionella tekniker
- Fråga ALDRIG "vilken nivå är du?" — känn av det naturligt
- Förstå fritext oavsett formulering
- Hantera vaga önskemål genom att tolka stämning, tillfälle och ambitionsnivå
- Föreslå alltid saker användaren inte tänkt på (tillbehör, dryck, alternativ)
- Svara alltid på svenska`;

// ──────────────────────────────────────────
// Cache key generation
// ──────────────────────────────────────────

export function generateCacheKey(query, householdSize) {
  const normalized = query
    .toLowerCase()
    .split(/[,\s]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .sort()
    .join('|');
  const raw = `${normalized}::${householdSize}`;
  return 'recipe:' + crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

// ──────────────────────────────────────────
// Main search function — universal entry point
// ──────────────────────────────────────────

export async function searchRecipes(query, householdSize = 1, preferences = {}) {
  const cacheKey = generateCacheKey(query, householdSize);

  const cached = await cacheGet(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  let searchResult;
  try {
    searchResult = await searchWebForRecipes(query, householdSize, preferences);
  } catch (err) {
    // Re-throw if already an AppError (from nested calls)
    if (err instanceof AppError) throw err;

    console.error('Web search failed:', err.message, err.status || '', err.error?.message || '');
    if (err.status === 401 || err.error?.type === 'authentication_error') {
      throw new AppError(502, 'ai_auth_error', 'AI-tjänsten kunde inte autentiseras. Kontakta support.');
    }
    if (err.status === 429) {
      throw new AppError(429, 'ai_rate_limit', 'Receptsökningen är tillfälligt överbelastad. Försök igen om en stund.');
    }
    if (err.name === 'APIConnectionTimeoutError' || err.code === 'ETIMEDOUT') {
      throw new AppError(504, 'ai_timeout', 'Receptsökningen tog för lång tid. Försök igen.');
    }
    throw new AppError(502, 'ai_search_failed', 'Kunde inte söka efter recept just nu. Försök igen om en stund.');
  }

  if (!searchResult.text || searchResult.text.trim().length === 0) {
    throw new AppError(404, 'no_recipes_found', 'Inga recept hittades. Prova att söka med andra ingredienser.');
  }

  let structured;
  try {
    structured = await structureRecipes(
      searchResult.text,
      searchResult.sources,
      query,
      householdSize,
      preferences
    );
  } catch (err) {
    console.error('Recipe structuring failed:', err.message);
    throw new AppError(502, 'ai_parse_failed', 'Kunde inte bearbeta recepten. Försök igen.');
  }

  const result = {
    recipes: structured.recipes || [],
    shopping_list: structured.shopping_list || [],
    sources: searchResult.sources,
    cached: false,
  };

  await cacheSet(cacheKey, result, 86400);

  return result;
}

// ──────────────────────────────────────────
// Fas 1: Receptrådgivaren — Web search
// ──────────────────────────────────────────

async function searchWebForRecipes(query, householdSize, preferences) {
  const constraints = [];
  if (preferences.dietary?.length)
    constraints.push(`Kostpreferenser: ${preferences.dietary.join(', ')}.`);
  if (preferences.maxTimeMinutes)
    constraints.push(`Max tillagningstid: ${preferences.maxTimeMinutes} minuter.`);
  if (preferences.maxBudget)
    constraints.push(`Maxbudget: ${preferences.maxBudget} kr.`);
  if (preferences.occasion)
    constraints.push(`Tillfälle: ${preferences.occasion}.`);
  if (preferences.difficulty)
    constraints.push(`Svårighetsgrad: ${preferences.difficulty}.`);

  const constraintBlock = constraints.length > 0
    ? `\nBEGRÄNSNINGAR:\n${constraints.join('\n')}`
    : '';

  const householdLabel = getHouseholdLabel(householdSize);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: `${NISSE_IDENTITY}

Du agerar nu som RECEPTRÅDGIVAREN — du förstår vad användaren vill och hittar de bästa recepten.`,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [
      {
        role: 'user',
        content: `ANVÄNDARENS FRÅGA: "${query}"
HUSHÅLL: ${householdLabel} (${householdSize} portioner)
${constraintBlock}

TOLKA FRÅGAN INTELLIGENT:
- Ingredienser (t.ex. "kyckling, ris, grädde") → recept som använder dessa
- Specifik rätt (t.ex. "lasagne") → bästa receptet
- Huvudråvara (t.ex. "lax") → 2-3 varianter
- Budget/pris (t.ex. "billig middag under 50kr") → prisvänliga alternativ
- Tillfälle (t.ex. "festmiddag", "romantisk middag", "barnkalas") → passande recept
- Tid (t.ex. "snabb lunch", "20 min") → snabba alternativ
- Öppen fråga (t.ex. "vad ska jag laga?") → kreativa förslag
- Diet (t.ex. "veganskt", "glutenfritt") → anpassade recept
- Stämning (t.ex. "jag vill impa på min dejt") → tolka ambitionsnivå
- Meal prep / veckomenyer → planera flera måltider

Sök på nätet efter 2-3 riktiga recept. Prioritera svenska receptsajter men inkludera internationella om de är relevanta.

För varje recept, samla in:
- Receptnamn och källa (sajt + URL)
- Fullständig ingredienslista med exakta mängder
- Detaljerat tillvägagångssätt steg för steg (nybörjarvänligt)
- Köksverktyg som behövs
- Ungefärlig tid (förberedelse + tillagning)
- Tips, varianter och ersättningar

Ge en utförlig sammanställning.`,
      },
    ],
  });

  let text = '';
  const sources = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      text += block.text + '\n';
    }
    if (block.type === 'web_search_tool_result') {
      for (const sr of block.content || []) {
        if (sr.type === 'web_search_result') {
          sources.push({
            title: sr.title,
            url: sr.url,
            snippet: sr.encrypted_content ? '[encrypted]' : '',
          });
        }
      }
    }
  }

  const uniqueSources = [
    ...new Map(sources.map((s) => [s.url, s])).values(),
  ].slice(0, 8);

  return { text, sources: uniqueSources };
}

// ──────────────────────────────────────────
// Fas 1: Structure as rich JSON
// ──────────────────────────────────────────

async function structureRecipes(searchText, sources, query, householdSize, preferences) {
  const householdLabel = getHouseholdLabel(householdSize);
  const sourcesStr = sources.map((s) => `- ${s.title}: ${s.url}`).join('\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 12000,
    system: NISSE_IDENTITY,
    messages: [
      {
        role: 'user',
        content: `Baserat på följande receptdata, skapa strukturerade recept i Nisse-format.

RECEPTDATA:
${searchText}

KÄLLOR:
${sourcesStr}

SÖKNING: ${query}
HUSHÅLL: ${householdLabel} (${householdSize} portioner)

REGLER:
- Anpassa ALLA portioner till ${householdSize} portioner
- Markera ingredienser användaren sannolikt redan har (have: true) — salt, peppar, olja, smör
- Inkludera ALLA köksverktyg med alternativ om möjligt
- Stegen ska vara MYCKET detaljerade — nybörjarvänliga
- Varje steg = EN tydlig instruktion
- Inkludera beginner_tip (för nybörjare) och pro_tip (för erfarna) på varje steg
- Inkludera voice_cue — en version av steget optimerad för att lyssna på (naturligt tal, inga siffror/symboler)
- Om ett steg har en väntetid (t.ex. "stek i 5 min"), inkludera duration_seconds och timer_needed: true
- Ge warning på steg där något kan gå fel
- Kostnadsuppskattningar i SEK (aktuella svenska priser)
- Kategorisera varje ingrediens efter butikshylla (aisle)
- Ge substitutes (ersättningar) för ingredienser där det är relevant
- Inkludera drink_pairing, leftover_tips och scaling_notes

Svara ENBART med giltig JSON (ingen markdown, inga backticks):
{
  "recipes": [
    {
      "title": "Receptnamn",
      "description": "2-3 meningar som säljer rätten — hur den smakar, varför den passar",
      "source_name": "ICA",
      "source_url": "https://...",
      "time_minutes": 45,
      "difficulty": "Enkel",
      "servings": ${householdSize},
      "cost_estimate": "ca 80-120 kr",
      "occasion": "vardag",
      "ingredients": [
        {
          "name": "Kycklingfilé",
          "amount": "600g",
          "have": true,
          "aisle": "Kött & Fisk",
          "est_price": null,
          "substitutes": ["Kalkonfilé", "Tofu (vegetariskt alternativ)"],
          "tip": "Ta ut ur kylen 20 min innan tillagning"
        }
      ],
      "equipment_needed": [
        {
          "item": "Stekpanna",
          "essential": true,
          "alternative": "Kan använda ugn istället, 200° i 25 min"
        }
      ],
      "tools": ["Stekpanna", "Skärbräda", "Kniv"],
      "steps": [
        {
          "text": "Skär kycklingen i bitar.",
          "duration_seconds": null,
          "timer_needed": false,
          "beginner_tip": "Använd en vass kniv och skär med bestämda tag.",
          "pro_tip": "Fjärilsöppna tjockare bitar för jämnare tillagning.",
          "warning": null,
          "voice_cue": "Börja med att ta fram kycklingen och en skärbräda. Skär filéerna i ungefär 2 centimeters tjocka skivor."
        },
        {
          "text": "Stek kycklingen i 5 minuter per sida.",
          "duration_seconds": 300,
          "timer_needed": true,
          "beginner_tip": "Rör inte i pannan de första minuterna! Låt kycklingen få färg.",
          "pro_tip": "Använd en köttermometer — 74°C i centrum.",
          "warning": "Undvik att lägga i för många bitar samtidigt — pannan tappar värme.",
          "voice_cue": "Hetta upp pannan med lite olja. Lägg i kycklingen och rör den inte på 4 till 5 minuter."
        }
      ],
      "tips": "Tips och varianter här.",
      "drink_pairing": "Ett kylt glas Sauvignon Blanc eller citronvatten med mynta",
      "leftover_tips": "Kycklingen håller 2 dagar i kylen. Skiva tunt och använd i sallad eller wraps.",
      "scaling_notes": "Dubblera ingredienserna rakt av. Använd två pannor eller stek i omgångar."
    }
  ],
  "shopping_list": [
    { "name": "Grädde", "amount": "2 dl", "est_price": "15 kr", "aisle": "Mejeri", "tip": "Välj minst 15% fetthalt för krämig sås" }
  ]
}`,
      },
    ],
  });

  const rawText = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const cleanJSON = rawText.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleanJSON);
  } catch (firstErr) {
    // Try to extract the JSON object and repair common issues
    const match = cleanJSON.match(/\{[\s\S]*\}/);
    const candidate = match ? match[0] : cleanJSON;

    try {
      return JSON.parse(repairJSON(candidate));
    } catch (secondErr) {
      console.error('JSON parse failed after repair attempt:', secondErr.message);
      console.error('Raw text length:', rawText.length, '| stop_reason:', response.stop_reason);
      throw new Error('Failed to parse recipe JSON from AI response');
    }
  }
}

// ──────────────────────────────────────────
// Fas 2: Inköpsguiden — Shopping assistant
// ──────────────────────────────────────────

export async function askShoppingAssistant(recipe, question, conversationHistory = []) {
  const ingredientList = (recipe.ingredients || [])
    .map((i) => `${i.amount} ${i.name}${i.aisle ? ` (${i.aisle})` : ''}${i.have ? ' [har hemma]' : ''}`)
    .join('\n');

  const shoppingItems = (recipe.ingredients || [])
    .filter((i) => !i.have)
    .map((i) => `- ${i.amount} ${i.name}${i.aisle ? ` → ${i.aisle}` : ''}${i.est_price ? ` (${i.est_price})` : ''}`)
    .join('\n');

  const messages = [
    {
      role: 'user',
      content: `${NISSE_IDENTITY}

Du agerar nu som INKÖPSGUIDEN — du hjälper användaren i butiken.

RECEPT: ${recipe.title}
ALLA INGREDIENSER:
${ingredientList}

INKÖPSLISTA (det som behöver handlas):
${shoppingItems}

BETEENDE:
- Organisera efter butikens avdelningar (frukt & grönt → mejeri → kött → torrvaror → kryddor)
- Ge smart substitutionsråd: "De har inte dragon? Köp basilika istället, funkar nästan lika bra"
- Ge budgettips: "ICA Basic-versionen av krossade tomater funkar perfekt här"
- Håll koll på vad användaren bockat av och påminn om glömda varor
- Håll svar korta och tydliga — användaren är i rörelse i butiken
- Säg "fyra till fem minuter" istället för "4-5 min"
- Bekräfta alltid att du förstått: "Absolut! Jag hjälper dig med det."`,
    },
    ...conversationHistory.slice(-6).map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: 'user',
      content: question,
    },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages,
  });

  const answer = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return { answer };
}

// ──────────────────────────────────────────
// Fas 3: Kökscoachen — Cooking assistant
// ──────────────────────────────────────────

export async function askCookingAssistant(recipe, question, conversationHistory = [], context = {}) {
  const ingredientList = (recipe.ingredients || [])
    .map((i) => `${i.amount} ${i.name}`)
    .join(', ');

  const stepList = (recipe.steps || [])
    .map((s, i) => {
      const text = typeof s === 'string' ? s : s.text || s.content || '';
      const duration = s.duration_seconds ? ` [${Math.ceil(s.duration_seconds / 60)} min]` : '';
      return `${i + 1}. ${text}${duration}`;
    })
    .join('\n');

  const currentStepInfo = context.currentStep !== undefined
    ? `\nANVÄNDAREN ÄR PÅ STEG: ${context.currentStep + 1} av ${context.totalSteps || recipe.steps?.length || '?'}`
    : '';

  const timerInfo = context.activeTimers?.length
    ? `\nAKTIVA TIMERS: ${context.activeTimers.map((t) => `${t.label}: ${Math.ceil(t.remaining_seconds / 60)} min kvar`).join(', ')}`
    : '';

  const inputMode = context.inputMode || 'text';

  const voiceGuidelines = inputMode === 'voice'
    ? `\nRÖSTLÄGE AKTIVT — Följ dessa regler:
- Håll svar under 30 sekunder att lyssna på (max 2-3 meningar)
- Använd naturligt talspråk, inte skriftspråk
- Undvik parenteser, förkortningar, symboler
- Säg "fyra till fem minuter" istället för "4-5 min"
- Bekräfta alltid att du förstått: "Absolut!"
- Avsluta med en tydlig signal: "Säg till när du är redo för nästa steg."`
    : '';

  const messages = [
    {
      role: 'user',
      content: `${NISSE_IDENTITY}

Du agerar nu som KÖKSCOACHEN — du guidar användaren steg-för-steg under matlagningen. Du är som en varm, professionell kompis i köket.

RECEPT: ${recipe.title}
INGREDIENSER: ${ingredientList}
STEG:
${stepList}
${recipe.tips ? `TIPS: ${recipe.tips}` : ''}
${currentStepInfo}
${timerInfo}
${voiceGuidelines}

REGLER FÖR KÖKSCOACHEN:
- Var kortfattad men tydlig
- Ge exakta svar för timing/temperatur
- Varna proaktivt om något kan gå fel
- Ge alternativ om användaren saknar något
- Var uppmuntrande och personlig (du/dig)
- Om frågan inte handlar om matlagning, styr tillbaka vänligt
- Fira framgångar: "Perfekt stekyta! Nu har du koll på det."

SÄKERHET & HÄLSA:
- Påminn om livsmedelssäkerhet vid riskmoment (kyckling, fläsk, ägg, fisk)
- Ge exakta innertemperaturer för kött (kyckling 74°C, fläsk 68°C, nötkött 55-70°C)
- Varna för allergener om relevant
- Nämn korscontamination vid behov
- Ge räddningstips om något gått fel: "Ingen fara! Skrapa bort den brända vitlöken, ta en ny klyfta och börja om. Det händer alla."`,
    },
    ...conversationHistory.slice(-6).map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: 'user',
      content: question,
    },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages,
  });

  const answer = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return { answer };
}

// ──────────────────────────────────────────
// Meal Plan Generation
// ──────────────────────────────────────────

const DAY_NAMES = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];

export async function generateMealPlan(householdSize = 2, preferences = {}, lockedMeals = []) {
  const householdLabel = getHouseholdLabel(householdSize);

  const dietaryStr = preferences.dietary?.length
    ? `\nKostpreferenser: ${preferences.dietary.join(', ')}.`
    : '';
  const budgetStr = preferences.maxBudget
    ? `\nMaxbudget för hela veckan: ${preferences.maxBudget} kr.`
    : '';

  const mealsPerDay = preferences.mealsPerDay || 'dinner';
  const mealTypes = mealsPerDay === 'both'
    ? ['lunch', 'middag']
    : mealsPerDay === 'lunch'
      ? ['lunch']
      : ['middag'];

  const mealTypesStr = mealTypes.join(' och ');

  const lockedStr = lockedMeals.length > 0
    ? `\n\nDESSA MÅLTIDER ÄR LÅSTA (behåll exakt som de är):\n${lockedMeals.map((m) => `- ${DAY_NAMES[m.dayIndex]} ${m.mealType}: ${m.title}`).join('\n')}`
    : '';

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 12000,
    system: `${NISSE_IDENTITY}\n\nDu agerar nu som MENYPLANERAREN — du skapar varierade, realistiska veckomenyer som svenska familjer faktiskt vill laga.`,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [
      {
        role: 'user',
        content: `Skapa en veckomeny (${mealTypesStr}) för ${householdLabel} (${householdSize} portioner).
${dietaryStr}${budgetStr}${lockedStr}

REGLER:
- Variation: minst 3 olika proteinkällor under veckan
- Realistiskt: rätter som tar max 45 min på vardagar, mer ambitiöst på helg
- Säsong: anpassa efter svensk säsong
- Budget: om inte annat anges, sikta på 40-80 kr per måltid
- Smart: återanvänd ingredienser mellan dagar (t.ex. kyckling mån → kycklingwrap tis)
- Fredagsmys: fredag ska kännas lite extra
- Söndag: gärna något som ger bra matlådor till måndag

Sök på nätet efter riktiga recept. Använd svenska receptkällor (ICA, Coop, köket.se).

Svara ENBART med giltig JSON (ingen markdown, inga backticks):
{
  "meals": [
    {
      "dayIndex": 0,
      "dayName": "Måndag",
      "mealType": "DINNER",
      "title": "Receptnamn",
      "description": "Kort beskrivning (1 mening)",
      "time_minutes": 30,
      "difficulty": "Enkel",
      "servings": ${householdSize},
      "cost_estimate": "ca 60 kr",
      "source_name": "ICA",
      "source_url": "https://...",
      "ingredients": [
        { "name": "Kycklingfilé", "amount": "400g", "have": false, "aisle": "Kött & Fisk" }
      ],
      "steps": [
        { "text": "Steg 1...", "voice_cue": "Börja med att..." }
      ],
      "tools": ["Stekpanna", "Kniv"]
    }
  ],
  "shopping_list": [
    { "name": "Kycklingfilé", "amount": "800g", "est_price": "90 kr", "aisle": "Kött & Fisk", "forDays": [0, 2] }
  ],
  "total_estimated_cost": "ca 450-600 kr",
  "weekly_tip": "Tips för veckan..."
}`,
      },
    ],
  });

  let text = '';
  for (const block of response.content) {
    if (block.type === 'text') text += block.text + '\n';
  }

  const cleanJSON = text.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleanJSON);
  } catch {
    const match = cleanJSON.match(/\{[\s\S]*\}/);
    const candidate = match ? match[0] : cleanJSON;
    try {
      return JSON.parse(repairJSON(candidate));
    } catch (err) {
      console.error('Meal plan JSON parse failed:', err.message);
      console.error('Raw text length:', text.length, '| stop_reason:', response.stop_reason);
      throw new Error('Failed to parse meal plan JSON from AI response');
    }
  }
}

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function getHouseholdLabel(size) {
  if (size === 1) return '1 person (singel)';
  if (size === 2) return '2 personer (par)';
  if (size <= 4) return `${size} personer (familj)`;
  return `${size} personer (stor familj)`;
}

export function estimateApiCost() {
  return 0.07;
}
