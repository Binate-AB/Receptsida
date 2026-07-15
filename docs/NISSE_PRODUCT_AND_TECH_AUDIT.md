# Nisse — Produkt- och teknikrevision

> Revisionsdatum: 2026-07-14 · Branch: `claude/nisse-kitchen-assistant-t7nz31`
> Underlag för MVP-bygget av "hushållets intelligenta köksassistent".

## Sammanfattning

Nisse är i dag **inte** en traditionell receptbank — det är redan en AI-driven receptsöktjänst
med röstguidad matlagning. Det som saknas för produktvisionen är **beslutslagret**:
hushållsprofil med absoluta allergiregler, en rekommendationsmotor som ger max tre förslag,
strukturerade recept med barn/vuxen-grenar, persistenta inköpslistor/matlagningssessioner
samt en feedback-loop. Kodbasen är välorganiserad men saknar helt tester, och det finns
allvarlig migrations-drift i databasen.

**Slutsats: bygg additivt.** Befintlig sökning, veckoplanerare och cooking-läge behålls;
Nisse-MVP:n läggs till som nya domänmodeller, en deterministisk motor, en tydlig AI-gräns
och nya sidor.

---

## 1. Vad som finns

### Backend (`backend/`)
- **Express 4.21** (JS ESM, Node 20), bas `/api/v1`, port 4000. Middleware: helmet, CORS,
  morgan, Redis-baserad rate limit (fail-open).
- **Prisma 5.20 + PostgreSQL 16**; **Redis 7** som valfri cache (appen degraderar utan).
- **Auth**: JWT access (15 min) + roterande refresh tokens i DB; e-post/lösenord + Google +
  Apple; e-postverifiering och lösenordsåterställning via Resend. `req.user` innehåller
  endast `{id, email, plan}` — allt annat måste hämtas ur DB.
- **AI**: Anthropic SDK (`claude-sonnet-4-20250514`) med `web_search`-verktyg.
  Tvåstegs-pipeline: webbsök → strukturering till rik JSON (steg med `voice_cue`,
  `beginner_tip`, `timer_seconds` m.m.). Redis-cache 24 h. JSON-reparation för trunkerad
  output (nu extraherad till `src/utils/json-repair.js`).
- **Funktioner**: receptsök, favoriter, historik, delning via e-post, AI-veckoplanerare
  (`/meal-plans`), matlagningsassistent (stateless + stateful in-memory-sessioner),
  inköpsassistent, butiksfinnare (Google Places), lexikon-autocomplete, GDPR-export/-radering,
  recept-skrapare (ADMIN) + AI-generator ur skrapat lexikon.
- **Validering**: Zod centralt i `src/middleware/validate.js`. Felkontrakt:
  `AppError(statusCode, code, message)` + global errorHandler.

### Frontend (`frontend/`)
- **Next.js 14.2 App Router** (JS), Tailwind 3.4, Zustand, framer-motion, lucide-react.
- **Dubbel-target**: webb (Vercel) + native iOS via Capacitor 8; plattformsfork i
  `src/lib/platform.js` med separata skal (`WebShell`/`AppShell` + flytande tabbar).
- **Röst**: Web Speech API (TTS + STT, sv-SE) i `src/hooks/useVoice.js`.
- **Nyckel-UI**: `AppHome` (command center med ingrediens-taggar + scenario-chips),
  `CookingMode` (mörk HUD, steg, timers, mik, NisseChat-bottensheet), `RecipeDetail`
  (portionsskalning, "har hemma"), `GroceryMode` (hyllvis avbockning + röst),
  veckoplaneraren `/ny` (komplett), `groupByAisle` i `src/data/recipes.js`.
- All UI-text på svenska; ingen i18n-infrastruktur (medvetet).

---

## 2. Vad som kan återanvändas i MVP:n

| Tillgång | Återanvändning |
|---|---|
| `src/lib/api.js` (fetch-wrapper m. auto-refresh) | Nya namespaces `households/dinner/shoppingLists/cookSessions/events` |
| `CookingMode.js` + `useVoice.js` + NisseChat | Hela guidade matlagningen — sessioner matas in via adapter till befintlig recept-shape |
| `groupByAisle` + steg-normalizers (`data/recipes.js`) | Inköpslistans gruppering; timeline-stegen |
| Zod-mönstret i `validate.js`, `AppError`/`asyncHandler`, route-stilen i `meal-plans.js` | Alla nya endpoints |
| `cacheGet/cacheSet` (Redis) + rateLimit-mönstret | Cache av AI-parse; skydd av `dinner/solve` |
| `askCookingAssistant` + `cookingPrompt.js` | Frågor under session (`/cook-sessions/:id/ask`) |
| Toast-systemet (byggt, hittills oanvänt) | Bekräftelser i nya flöden |
| Scenario-chip-mönstret i `AppHome` | Snabbval i "Lös middagen" |

## 3. Vad som saknas (byggs i MVP)

- **Hushåll som central enhet**: `Household`, `HouseholdMember` (allergier = absoluta regler,
  kostrestriktioner, ogillade ingredienser, stark mat-tolerans, portionsfaktor).
- **Kvalitetssäkrade receptstrukturer**: `RecipeTemplate` med normaliserade ingredienser,
  steg-DAG (beroenden, parallellism), barn/vuxen-grenar, substitutioner, allergener,
  kostnadsspann — seedade JSON-filer, inte skrapade recept.
- **Middagsmotorn**: deterministisk rankning (hårda grindar → mjuk viktning) + AI endast för
  tolkning av fritext och formulering av motiveringar. Max 3 förslag.
- **Persistens**: inköpslistor, matlagningssessioner (dagens är in-memory), feedback,
  inventering (enkel manuell med confidence-fält reserverat för fas 2-foto).
- **Lärande**: feedback per hushållsmedlem som påverkar framtida rankning.
- **Tester**: repo saknade helt testsvit; `node --test` är nu etablerad (noll nya beroenden).

## 4. Största riskerna / teknisk skuld

| # | Risk | Allvar | Status |
|---|---|---|---|
| 1 | **Migrations-drift**: endast init-migrationen finns; `meal_plans`, `scraped_*`, `consent_records`, `recipe_words`, `scrape_jobs`, enums och många `users`-kolumner saknar migration (utveckling har skett med `db push`). Ren `migrate deploy` ger trasig DB. | 🔴 | Åtgärdas i MVP steg 1 (reconcile-migration + runbook) |
| 2 | `routes/cooking.js` använde omvänd `AppError`-signatur → alla 400/404 blev 500 | 🔴 | **Fixad** i denna branch |
| 3 | `backend/Dockerfile` `CMD` kör diagnos-stubben `src/test-start.js` (server utan routes); endast docker-compose-override räddar lokal körning | 🔴 | Dokumenterad — bör fixas före Railway-deploy från Dockerfile |
| 4 | Apple Sign-In verifierar **inte** JWT-signaturen (endast iss/aud/exp) — förfalskad token med rätta claims skulle autentisera | 🔴 | Dokumenterad — kräver JWKS-verifiering (utanför MVP-scope) |
| 5 | `src/utils/seed-user.js` innehåller e-post + klartextlösenord för ett riktigt konto | 🔴 | Dokumenterad — ta bort filen och rotera lösenordet |
| 6 | Rikt AI-recept-JSON (voice_cue, tips, substitutes) tappas när recept persisteras (platta `Step`/`Ingredient`-tabeller) | 🟡 | MVP:ns `CookingSession.recipeData` (Json) undviker problemet för nya flödet |
| 7 | In-memory cooking-sessioner (Map, LRU 500, TTL 2h) överlever inte omstart/skalning; två parallella cooking-vägar | 🟡 | Nya `cook-sessions` persisteras i DB; legacy-vägen behålls orörd |
| 8 | Ingen testsvit, ingen CI | 🟡 | `node --test` + motor-tester införs i MVP |
| 9 | Designsystem-drift: koden använder coral `#FF6B35` + Playfair (serif) inline, medan `DESIGN_SYSTEM.md` föreskriver teal `#2ABFBF` + Inter; Toast oanvänd; primitives (`Button/Card/Input`) aldrig byggda | 🟡 | Nya vyer följer befintlig faktisk stil; konsolidering är separat arbete |
| 10 | `estimateApiCost()` är hårdkodad (0,07 USD); `deletionRequestedAt` utan flöde; kvarvarande "matkompass"-namn | 🟢 | Dokumenterad |

## 5. Rekommenderad MVP-arkitektur

- **Deterministisk kärna** (`backend/src/services/nisse/engine/`): rena funktioner utan
  Prisma/AI — allergigrind, enhetsnormalisering, portionsskalning, skafferimatchning,
  kostnad, inköpsaggregering, tidslinje (topologisk sort + koordinerade grenar), rankning.
  Allt testbart med `node --test` utan DB.
- **AI-gräns** (`backend/src/services/nisse/ai/`): enda stället som rör Anthropic-SDK;
  versionerade prompter; all utdata valideras med Zod (retry en gång, därefter deterministisk
  fallback). **AI får aldrig avgöra allergisäkerhet** — varje AI-föreslagen ändring passerar
  allergigrinden igen.
- **Nya domänmodeller** (Prisma): Household, HouseholdMember, RecipeTemplate, MealRequest,
  MealRecommendation, InventoryItem, ShoppingList(+Item), CookingSession, MealFeedback,
  AnalyticsEvent. Steg/grenar lagras som Zod-validerad JSON (DAG läses alltid som helhet).
- **Nya API-ytor**: `/households`, `/dinner`, `/shopping-lists`, `/cook-sessions`, `/events` —
  samtliga `requireAuth`, Zod-validerade, samma felkontrakt.
- **Frontend**: nya sidor `/hushall`, `/middag`, `/inkop`; guidad matlagning återanvänder
  `CookingMode` via adapter + additiva props (gren-växlare, räddningsläge, feedback-sheet).

## 6. Vad som INTE bör byggas ännu

Per masterprompt fas 2/3 — arkitekturen reserverar utrymme men inget av detta implementeras nu:

- Fotoanalys av kyl/frys/skafferi (confidence-fältet på `InventoryItem` är förberett)
- Kvitto-/streckkodsregistrering
- Butiksspecifika priser, produktmatchning, digital beställning
- Kalenderintegration, automatiska veckoplaner, proaktiva notiser
- Röststyrd veckoplanering; realtidsdelad inköpslista
- Näringsmål/kaloriräkning som produktfokus
- Social feed, receptmarknadsplats, separata barnprofiler med egna val

Se `docs/NISSE_MVP_IMPLEMENTATION_PLAN.md` för genomförandeplanen.
