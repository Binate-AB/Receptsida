# Nisse — Deploy på Vercel + Supabase (ett projekt, Vercel Services)

Nisse körs på **ett** Vercel-projekt med **Vercel Services**: både webben (Next.js) och API:t
(Express) byggs som separata services i samma projekt, på **en** domän. Databasen ligger på Supabase.
Ingen Railway, ingen separat `api.nisse.io`, ingen CORS (allt är same-origin).

```
nisse.io               → Vercel-projekt (Services):
   /                    → service "frontend" (Next.js, rot: frontend/)
   /api/*               → service "backend"  (Express,  rot: backend/)
Supabase "Matkompass"  → Postgres (redan migrerad + seedad)
```

## Så fungerar Services
Vercel bygger varje service separat och routar per request enligt top-level `rewrites` i
`vercel.json` i repo-roten. En service är intern tills en rewrite pekar på den. Backend-routes ligger
under `/api/*` (`/api/v1/...` + `/api/health`) och webb-klienten anropar redan same-origin `/api/v1`
(`frontend/src/lib/api.js`), så inget CORS eller separat API-domän behövs.

Root-`vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "services": {
    "frontend": { "root": "frontend" },
    "backend": { "root": "backend" }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "backend" } },
    { "source": "/(.*)", "destination": { "service": "frontend" } }
  ]
}
```
`/api/v1/...` och `/api/health` routas till backend-servicen; allt annat till frontend-servicen.
Prisma ansluter lazily på första query; Redis är valfritt (tom `REDIS_URL` → fail-open, ingen cache).
`backend/package.json` kör `prisma generate` via `postinstall`/`vercel-build`.

## Skapa projektet i Vercel
1. Vercel → **Add New… → Project** → importera `Binate-AB/Receptsida` (branch `main`).
2. **Application Preset: Services** (Vercel auto-detekterar `frontend/` + `backend/`). Root Directory `./`.
   Root-`vercel.json` finns redan i repot — klicka **Refresh** om Vercel inte läst services-blocket.
3. **Environment Variables** (Production + Preview — delas av projektet; backend-servicen läser dem).
   ⚠️ Backendens env-validering (`backend/src/config/env.js`) **kraschar servicen vid start** om någon
   av dessa saknas eller är för kort:
   - `DATABASE_URL` = Supabase **session pooler**-URI (port 5432, inkl. lösenord)
   - `DIRECT_URL` = samma som `DATABASE_URL`
   - `JWT_SECRET`, `JWT_REFRESH_SECRET` = slumpsträngar **≥16 tecken**
   - `ANTHROPIC_API_KEY` = riktig nyckel, **eller** platshållare ≥10 tecken (utan riktig nyckel funkar
     Nisse ändå via chips-fallback — men variabeln måste finnas och vara ≥10 tecken)
   - `RESEND_API_KEY` = riktig nyckel **eller** platshållare ≥5 tecken
   - `CORS_ORIGIN` = `https://nisse.io,https://www.nisse.io`
   - `NODE_ENV` = `production`
   - `REDIS_URL` = lämna tom (fail-open)

   (Ingen `BACKEND_URL` behövs — routingen sker i root-`vercel.json`, inte via next.config-proxy.)
4. **Deploy.** Verifiera: `curl https://<projekt>.vercel.app/api/health` →
   `{"status":"healthy","checks":{"database":"ok"}}`.
5. **Domains** → lägg till `nisse.io` (+ `www.nisse.io`). Ingen `api.nisse.io`.

## Timeout-noten (viktig)
Vercel **Hobby** har 10s hård funktions-timeout. Nisses kärna (hushåll, "Lös middagen" med snabbval,
inköp, matlagning, feedback) är deterministisk och svarar <1s — helt OK. AI-anropen är best-effort och
strypta (parse 7s, motiveringar 6s, rescue 8s) så `dinner/solve` faller tillbaka till chips-parsning i
stället för att slå i taket.

**Undantag:** den *gamla* receptsökningen (`/api/v1/recipes/search`, webbsök 30–60s) ryms inte i 10s.
På Hobby blir den degraderad (504). Vill du behålla den: uppgradera projektet till **Vercel Pro** och
höj funktionstimeouten. Nisse-MVP:n påverkas inte.

## Backend-boot (verifieringsgrind)
`backend/src/index.js` exporterar Express-appen (`export default app`) och startar `app.listen` bara
när `process.env.VERCEL` är osatt. Om health-checken i steg 4 svarar `healthy` är allt bra. **Skulle**
backend-servicen i stället 502:a för att den inte lyssnar på en port, ändra `index.js` så att `start()`
(app.listen) alltid körs och redeploya.

## Databas
Redan klar i Supabase-projektet **Matkompass** (`giiqwwazevbzrcikdwju`): alla tabeller migrerade,
10 receptmallar seedade, RLS påslaget. Inga databassteg behövs vid deploy.

## iOS-appen (Capacitor)
`frontend/src/lib/api.js`, `capacitor.config.ts` och `build:ios`-scriptet pekar nu på
`https://nisse.io` (samma domän som webben). Bygg med `npm run ios` i `frontend/` efter att nisse.io
är live.
