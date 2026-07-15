# Nisse — Deploy på Vercel + Supabase (utan Railway)

Nisse körs på samma stack som övriga projekt: **frontend + backend på Vercel, databas på
Supabase**. Ingen Railway. Två Vercel-projekt (som Truevi): ett för webben, ett för API:t.

```
nisse.io            → Vercel-projekt: frontend  (Next.js, rot: frontend/)
api.nisse.io        → Vercel-projekt: backend   (Express serverless, rot: backend/)
Supabase "Matkompass" → Postgres (redan migrerad + seedad)
```

## Backend som Vercel serverless

Express-appen exporteras som en serverless-funktion:
- `backend/src/index.js` — `export default app`; `start()` (app.listen) körs bara när
  `process.env.VERCEL` INTE är satt (lokalt/Railway/valfri Node-host).
- `backend/api/index.js` — serverless-entry: `import app from '../src/index.js'; export default app;`
- `backend/vercel.json` — routar alla requests till funktionen, `maxDuration: 10`.
- `backend/package.json` — `postinstall`/`vercel-build` kör `prisma generate`.
- `prisma/schema.prisma` — `binaryTargets = ["native", "rhel-openssl-3.0.x"]` (Vercels runtime).

Prisma ansluter lazily på första query; Redis är valfritt (tom `REDIS_URL` → fail-open, ingen cache).

### Skapa backend-projektet i Vercel
1. Vercel → **Add New… → Project** → importera `Binate-AB/Receptsida`.
2. **Root Directory: `backend`**. Framework Preset: **Other**.
3. **Environment Variables** (Production + Preview):
   - `DATABASE_URL` = Supabase **session pooler**-URI (port 5432), inkl. lösenord
   - `DIRECT_URL` = samma som DATABASE_URL
   - `JWT_SECRET`, `JWT_REFRESH_SECRET` = långa slumpsträngar (≥16 tecken)
   - `ANTHROPIC_API_KEY` = riktig nyckel (utan nyckel funkar Nisse ändå via chips-fallback)
   - `RESEND_API_KEY` = riktig nyckel (eller placeholder om mejl inte behövs)
   - `CORS_ORIGIN` = `https://nisse.io,https://www.nisse.io`
   - `NODE_ENV` = `production`
4. Deploy. Verifiera: `curl https://<projekt>.vercel.app/api/health` → `{"status":"healthy","checks":{"database":"ok"}}`.
5. **Domains** → lägg till `api.nisse.io` (CNAME enligt Vercels instruktion hos din DNS).

### Peka frontenden mot backenden
I **frontend-projektet** (nisse.io) → Settings → Environment Variables:
- `BACKEND_URL` = `https://api.nisse.io`  (används av `next.config.js` rewrite `/api/v1/*`)

Redeploy frontend-projektet efter att variabeln lagts till.

## Timeout-noten (viktig)
Vercel **Hobby** har 10s hård funktions-timeout. Nisses kärna (hushåll, "Lös middagen" med
snabbval, inköp, matlagning, feedback) är deterministisk och svarar <1s — helt OK. AI-anropen är
best-effort och strypta (parse 7s, motiveringar 6s, rescue 8s) så `dinner/solve` faller tillbaka
till chips-parsning i stället för att slå i taket.

**Undantag:** den *gamla* receptsökningen (`/api/v1/recipes/search`, webbsök 30–60s) ryms inte i
10s. På Hobby blir den degraderad (504). Vill du behålla den: uppgradera backend-projektet till
**Vercel Pro** och höj `maxDuration` i `vercel.json` till t.ex. `300`. Nisse-MVP:n påverkas inte.

## Databas
Redan klar i Supabase-projektet **Matkompass** (`giiqwwazevbzrcikdwju`): alla tabeller migrerade,
10 receptmallar seedade, RLS påslaget. Inga databassteg behövs vid deploy.

## iOS-appen (Capacitor)
`frontend/src/lib/api.js`, `capacitor.config.ts` och `build:ios`-scriptet pekar nu på
`https://api.nisse.io`. Bygg med `npm run ios` i `frontend/` efter att api.nisse.io är live.
