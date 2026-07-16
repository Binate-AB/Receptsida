# CLAUDE.md

Arbetsregler för Claude Code och andra AI-agenter i Nisse-repot (`Binate-AB/Receptsida`).

## Dokumenthierarki (styr allt arbete)

1. `docs/NISSE_PRODUCT_VISION_V2.md` — produktlöfte, säkerhet, tonalitet, långsiktiga principer
2. `docs/NISSE_MVP_90_DAYS.md` — vad som får byggas i nuvarande fas (exkluderat scope är bindande)
3. `CLAUDE.md` (denna fil) — hur agenten arbetar i repot

När visionen beskriver en framtida funktion som MVP-definitionen exkluderar ska funktionen INTE
implementeras nu. Bygg aldrig framtida scope "när du ändå arbetar i området".

## Vad Nisse är

Hushållets intelligenta matassistent. Operativt löfte: *"Nisse omvandlar kvällens osäkerhet till en
accepterad och genomförbar middagsplan på under 30 sekunder och hjälper hushållet hålla planen tills
maten står på bordet."* Nisse är INTE en receptbank, AI-receptgenerator, inspirationsfeed, sökmotor
eller ett lagerhanteringssystem.

## Repostruktur

```
Receptsida/
├── frontend/     # Next.js 14 App Router (JS), Tailwind, Zustand, Capacitor iOS
├── backend/      # Express 4 (ESM), Prisma 5 → Postgres (Supabase), Redis valfri
├── docs/         # Styrdokument + specar (se hierarkin ovan)
└── vercel.json   # Vercel Services: /api/* → backend, allt annat → frontend
```

Nyckelkataloger i backend:
- `src/services/nisse/engine/` — deterministisk kärna (rena funktioner, ingen Prisma/AI/nätverk)
- `src/services/nisse/ai/` — enda AI-gränsen (`client.js` är ENDA filen som rör Anthropic SDK)
- `src/routes/` — Express-routes; Zod-scheman i `src/middleware/validate.js`
- `prisma/seed-templates/*.json` — kurerad rättdatabas (Zod-validerad vid seed)
- `test/` — node:test (`npm test`), inga externa testberoenden

## Arkitekturinvarianter — får ALDRIG brytas

1. **AI avgör aldrig allergisäkerhet.** Allergifiltrering och absoluta kostbegränsningar är
   deterministisk kod (`engine/allergenGate.js`) med tester. Substitutioner och AI-förslag går
   ALLTID genom allergenGate igen. Mjuka signaler kan aldrig återuppliva en hård-gated rätt.
2. **Deterministisk kärna, AI som förklarare.** AI får: tolka fritext, formulera motiveringar,
   variera språk. Deterministisk kod styr: gates, portioner, normalisering, ranking, robusthet,
   substitutioner, timers, analytics, behörigheter.
3. **All AI-output är strukturerad + validerad** (Zod-schema, timeout, 1 retry, deterministisk
   fallback, fel loggas utan hemligheter). Kärnflödet fungerar helt utan AI-nyckel.
4. **Max 3 rekommendationer**, ett tydligt förstahandsval. Färre än 3 när färre är säkra —
   padda ALDRIG med osäkra alternativ.
5. **Allergier är aldrig preferenser.** Användaren skuldbeläggs aldrig; osäkerhet → robustare rätt.
6. **KPI:er/beslutsdata omberäknas inte i UI-lagret** — läs från serverns beräknade snapshot
   (`MealRecommendation.computed`, `CookingSession.recipeData`).

## Kodkonventioner

- **JS ESM, inte TypeScript.** Följ befintlig stil; inga nya ramverk utan tydligt behov.
- Fel: `AppError(statusCode, code, message)` + `asyncHandler`. Ge alltid fel-toast i frontend.
- Validering: Zod-scheman läggs i `backend/src/middleware/validate.js` och används via `validate()`.
- Prisma: snake_case i DB via `@map`, camelCase i kod. Schemaändringar = migration + uppdaterade
  seeds + tester. Kör aldrig `db push` mot delade miljöer.
- All UI-text på **svenska**; kod, kommentarer och variabelnamn på engelska.
- Tonalitet i UI-copy: trygg, konkret, realistisk, kortfattad, icke-dömande, ingen överdriven
  entusiasm. ("Jag föreslår kycklingpasta. Den passar tiden ni har…" — inte "10 inspirerande rätter!")
- Analytics: server-side `logEvent()` är source of truth; klient-events endast via whitelisten i
  `routes/events.js`. Nya event ska in i `docs/NISSE_ANALYTICS_SPEC.md` FÖRST.
- Mocka aldrig produktionsflöden utan tydlig märkning. Hårdkoda aldrig hemligheter.

## Kommandon

```bash
# Backend (kör från backend/)
npm run dev:local     # node --watch med .env-inläsning
npm test              # node:test — hela sviten ska vara grön före varje leverans
npm run seed:templates

# Frontend (kör från frontend/)
npm run dev
npm run build         # ska vara grön före varje leverans
npm run ios           # Capacitor: build:ios → cap sync ios → cap open ios (Xcode)
```

## Git & deploy

- Arbeta på `claude/*`-branch. **Inga commits eller pushar utan uttrycklig begäran.**
- Deploy: ETT Vercel-projekt ("nisse") med **Vercel Services** — root-`vercel.json` routar
  `/api/(.*)` → backend-servicen (Express, `entrypoint: src/index.js`, kräver `app.listen`),
  allt annat → frontend. Produktion byggs från `main`. Domän: `www.nisse.io` (apex 308:ar till www).
- Databas: Supabase-projektet **Matkompass** (`giiqwwazevbzrcikdwju`, eu-west-1).
  Runtime-`DATABASE_URL` = **transaction pooler port 6543** + `?pgbouncer=true&connection_limit=1`;
  `DIRECT_URL` = session pooler 5432 (migrationer). Direktanslutning (`db.*.supabase.co`) är
  IPv6-only och fungerar INTE från Vercel.
- Obligatoriska env-vars (backend kraschar annars vid boot — se `src/config/env.js`):
  `DATABASE_URL`, `JWT_SECRET`/`JWT_REFRESH_SECRET` (≥16), `ANTHROPIC_API_KEY` (≥10, placeholder ok),
  `RESEND_API_KEY` (≥5), `CORS_ORIGIN`, `NODE_ENV`. `REDIS_URL` tom = fail-open utan cache.

## Kända fallgropar (lärdomar)

1. iOS-appen är ett separat bygge — webbdeploy uppdaterar den inte. Native anropar
   `https://www.nisse.io/api/v1` cross-origin; CORS-listan i `src/index.js` måste innehålla
   Capacitor-origins (`capacitor://localhost` m.fl.).
2. `npm`-kommandon körs i `frontend/` eller `backend/` — repo-roten har ingen package.json.
3. AI-anrop har hårda budgetar (parse 7s, motiveringar 6s, rescue 8s) pga Vercels 10s-timeout
   (Hobby). Lägg aldrig ny AI i kritisk väg utan budget + deterministisk fallback.
4. Gamla receptsökningen (`/recipes/search`, 30–60s webbsök) ryms inte i 10s — degraderad på Hobby.
5. Lexikon/kategori-matchning och canonical-ingredienser: exakt matchning (`===`), aldrig `includes()`.
6. `git pull` kan trigga Vercel-deploy från `main` — verifiera alltid `/api/health` efter deploy:
   `{"status":"healthy","checks":{"database":"ok"}}`.

## Definition of Done (varje leverans)

Kärnflödet fungerar end-to-end utan AI-nyckel · inga exkluderade MVP-funktioner tillagda ·
allergier deterministiska · beslutsmotorn förklarbar · antaganden korrigerbara · tester gröna
(`npm test`) · build grön (`npm run build`) · analytics-events verifierbara i DB · dokumentation
uppdaterad · kända begränsningar dokumenterade. Rapportera befintliga fel separat från
introducerade fel.
