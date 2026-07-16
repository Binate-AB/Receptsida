# Nisse — Current State Audit (post-MVP, 2026-07-15)

> Nulägesrevision efter att första MVP-versionen driftsatts på www.nisse.io. Ersätter INTE den
> historiska pre-MVP-revisionen (`NISSE_PRODUCT_AND_TECH_AUDIT.md`) — den behålls som historik.
> Gap och leveranser: `NISSE_MVP_IMPLEMENTATION_PLAN.md`.

## 1. Befintlig arkitektur

**Monorepo** med två appar, deployade som ETT Vercel-projekt via **Vercel Services**
(root-`vercel.json`: `/api/(.*)` → backend-service, allt annat → frontend-service; domän
`www.nisse.io`, apex 308→www).

**Frontend** (`frontend/`): Next.js 14.2 App Router, ren JS, Tailwind 3.4, Zustand,
framer-motion, lucide-react. Dubbel-target: webb + Capacitor iOS (statisk export, native anropar
`https://www.nisse.io/api/v1` cross-origin). Routes: `/` (AppHome), `/middag`, `/hushall`,
`/inkop`, `/cooking`, `/ny` (legacy veckoplan), `/favoriter`, `/historik`, `/butiker`, auth-sidor.
Botten-tabbar: Hem · Middag · (ny-knapp) · Favoriter · Profil.

**Backend** (`backend/`): Express 4.21 ESM, Node 20, bas `/api/v1`, JWT access+refresh,
Zod-validering i `middleware/validate.js`, `AppError`/`asyncHandler`, morgan, helmet, rate limit.
Prisma 5.20 → Supabase Postgres ("Matkompass", eu-west-1). Redis valfri (fail-open). Kör som
Vercel Services-service med `app.listen` (entrypoint `src/index.js`); DB via transaction pooler
6543 + pgbouncer-läge; `DIRECT_URL` = session pooler 5432.

**Deterministisk motor** (`backend/src/services/nisse/engine/`, rena funktioner utan I/O):
`allergens.js` (kanonisk taxonomi), `allergenGate.js` (allergen+dietary hard gates),
`normalize.js` (~120 alias → canonical), `units.js`, `portions.js` (åldersfaktorer),
`pantry.js` (confidence-baserad atHome/toBuy/uncertain), `cost.js`, `shopping.js`
(hyllaggregering), `timeline.js` (DAG-topologisk sort, parallell-packning, koordinerade
barn/vuxen-lanes), `ranker.js` (hard gates → soft scoring → 3 slots), `chipsParse.js`
(deterministisk situationstolkning), `rescueFallbacks.js` (7 canned räddningar).

**AI-gräns** (`backend/src/services/nisse/ai/`): `client.js` (ENDA Anthropic-filen; timeout 8s,
0 SDK-retries, Zod-validering + 1 omprompt-retry), `prompts.js` (versionerade), `schemas.js`,
`nisseAi.js` (parse 7s-budget → chips-fallback; motiveringar 6s → null; rescue 8s → canned).
Kärnflödet fungerar helt utan API-nyckel.

**Datamodell** (29 Prisma-modeller): Nisse-domänen = Household, HouseholdMember (allergier
String[] = absoluta), InventoryItem (confidence), RecipeTemplate (ingredients/steps/variants som
Zod-validerad JSON; kostnads-/effort-/disk-/barnvänlighetsfält), MealRequest (rawText/chips/
parsed/parseSource), MealRecommendation (slot NISSE|EASIEST|CHEAPEST, computed-snapshot, status),
ShoppingList(+Item), CookingSession (fruset recipeData + timeline, branchState, status),
MealFeedback (betyg per medlem, cookAgain/avoid), AnalyticsEvent. Legacy: User, Recipe/
Ingredient/Step (gammal receptsök), MealPlan, Scraped*, LexiconEntry, ConsentRecord m.fl.

**Tester**: 124 gröna (node:test, inga externa beroenden) — gates, portioner, units, shopping,
pantry, timeline, ranker, AI-schemafixturer, seed-validering. **Analytics**: server-side
`logEvent()` (source of truth) + klient-whitelist (3 events).

## 2. Funktioner som redan finns (live)

Registrering/inloggning (JWT; Google/Apple-stubbar) · hushållswizard 3 steg (medlemmar+allergier,
utrustning+nivå, pantry-gissning) · "Nisse, lös middagen" (fritext + snabbvals-chips → exakt 3
kort med slot-badges, motivering, tid/kostnad/effort/disk, passar-vilka, hemma-vs-köpa; Enklare/
Billigare/Barnvänligare; accept → inköpslista) · hyllsorterad inköpslista med avbockning ·
guidad matlagning (persisterad session, steg, timers, parallella lanes, barn/vuxen-gren-växlare,
SOS-rescue, feedback-sheet) · feedback påverkar nästa ranking (avoid = hård grind) · analytics-
funnel (dinner_solved → … → cooking_completed) · legacy: receptsök (AI-webbsök), veckoplanerare,
favoriter, butiker.

## 3. Återanvändbart för V2-deltat

- `ranker.js`-strukturen (gates→scoring→slots) tar emot robusthetsviktning utan omskrivning
- `MealRecommendation.computed` + `reasons[]` = färdig bärare för synliga antaganden per kort
- `MealRequest.parsed/chips` = källa för DinnerAssumption-generering
- `InventoryItem.confidence` fanns förberett → HouseholdIngredientConfidence kan bygga på mönstret
- `timeline.js` (`buildTimeline`) återanvänds för "jag ligger efter"-ompackning av kvarvarande steg
- `RecipeTemplate.variants` (substitutioner) = datakälla för strukturerad "jag saknar något"
- Seed-valideringen (Zod + buildTimeline-körning per rätt) = kvalitetsgrind för 10→60+ rätter
- `logEvent()`-mönstret + events-whitelist för nya event
- Wizard-UI:t i `/hushall` tar emot smakförankringssteget utan strukturbyte

## 4. Gap mot MVP-definitionen

Se `NISSE_MVP_90_DAYS.md` §5 och implementeringsplanen. Kort: antagandeekonomin (datamodell +
korrigerings-UI + max-1-fråga), robusthet/critical-ingredienser + osäkerhetsviktning,
förberedelseskärm med nivå 1-verifiering, strukturerad "saknar något", "ligger efter",
smakförankring (DishPreference), HouseholdMembership (multi-vuxen; idag `ownerId @unique`),
events-komplettering + mätdefinitioner, rättdatabas 10→60–100.

## 5. Tekniska risker

1. **`ownerId @unique`-antagandet** genomsyrar alla hushållsroutes (`getOwnedHousehold`) —
   membership-migrationen måste backfylla och vara bakåtkompatibel med live-data.
2. **Vercel Hobby 10s-timeout** — alla nya flöden måste förbli deterministiska eller AI-budgeterade.
3. **Vercel Services är experimentellt** — beteendeändringar hos Vercel kan kräva snabb åtgärd;
   `/api/health` är kanariefågeln.
4. **Liten rättdatabas** (10) → "exakt tre" degraderar oftare för allergihushåll tills basen växer.
5. **Migrationer mot live-DB** — `decision`-tabellerna är i produktion; endast additiva/
   bakåtkompatibla migrationer, testade mot skugg-DB först.

## 6. Produktmässiga risker

1. Hypotesen kräver **mätbarhet från dag 1** — saknade events går inte att efterkonstruera.
2. Antagande-chips som stör mer än de hjälper → korrigering måste vara ETT tryck, aldrig formulär.
3. För få rätter → upprepningar → sjunkande acceptans oavsett motorkvalitet.
4. Barnfamiljs-löftet står och faller med gren-rätternas kvalitet (3 av 10 har grenar i dag).
5. Scope-krypning: V2-listan §8 (exkluderat) måste hållas hårt.

## 7. Säkerhetsrisker (befintliga, ur pre-MVP-revisionen — fortfarande öppna)

1. Apple Sign-In verifierar inte JWT-signaturen (stub).
2. `src/utils/seed-user.js` innehåller klartextlösenord (endast dev, men bör saneras).
3. `backend/Dockerfile` CMD kör stub — irrelevant på Vercel men vilseledande.
4. DB-lösenordet exponerades i supportflöden under deploy-arbetet → **ska roteras** (Supabase →
   Reset database password → uppdatera Vercel-env).
5. RLS är aktiverat i Supabase, men API-lagret är auktoritetsgränsen — behörighetstester krävs
   för membership-flödet (hushåll A får aldrig läsa hushåll B).

## 8. Rekommenderad målarkitektur (denna fas)

Behåll exakt nuvarande topologi (ett Services-projekt, deterministisk kärna, AI-gräns).
Deltat är additivt: 3 nya tabeller (DinnerAssumption, DishPreference, HouseholdIngredientConfidence)
+ 1 relationstabell (HouseholdMembership) + 2 fält (RecipeTemplate.robustness; ingredient.critical
i JSON) + nya endpoints under befintliga routers. Inga nya ramverk, ingen ny infrastruktur.

## 9. Kod som behålls / eventuellt avvecklas

**Behålls:** hela Nisse-domänen, legacy receptsök/veckoplan/favoriter (fungerande, används).
**Avvecklas ej men fryses:** `Scraped*`-pipeline och `ScrapeJob` (ingen aktiv användning i kilen).
**Kandidater för senare sanering (ej nu):** Dockerfile-stubben, seed-user-scriptet,
`routes/scraper.js` om skrapning inte återupptas. Ingen borttagning i denna fas — inget i
kärnflödet beror på dem, och borttagning är inte hypotestestande arbete.

## 10. Byggs uttryckligen INTE nu

Hela exkluderingslistan i `NISSE_MVP_90_DAYS.md` §4 (kylskåpsfoto, kvitton, streckkoder,
butiksintegration, veckooptimering, röststyrning, social feed, fri AI-felsökning, annonser,
betalvägg m.m.).
