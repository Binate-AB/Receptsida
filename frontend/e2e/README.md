# E2E-röktest (Playwright)

`dinner-smoke.spec.js` kör det riktiga användarflödet genom fronten utan mockar:
**registrera → skapa hushåll → Lös middagen → en rekommendation visas.**

Det är regressionsvakten för driftstörningen 2026-07-30 (pensionerad modellsträng →
502 i LLM-flöden) + vit-sida-fixen: 502:ar något LLM-flöde eller blankar en vy, renderas
aldrig rekommendationskortet och testet faller.

## Kör mot lokal stack

```bash
# 1. Backend + DB (från backend/)
docker compose up -d postgres           # eller lokal Postgres
DATABASE_URL=... npx prisma migrate deploy
DATABASE_URL=... npm run seed:templates
DATABASE_URL=... node src/index.js       # :4000  (ANTHROPIC_API_KEY får vara placeholder)

# 2. Frontend (från frontend/)
npm run build && npm start               # :3000

# 3. E2E (från frontend/)
npm run test:e2e                         # BASE_URL=http://localhost:3000
```

## Kör mot deployad miljö

```bash
BASE_URL=https://www.nisse.io npm run test:e2e
```

Flödet är **deterministiskt**: "Lös middagen" fungerar utan AI-nyckel (chips-fallback),
så testet passerar mot en riktig backend oavsett AI-läge.

## Not om selektorer

Selektorerna är textbaserade och tåliga, men svensk UI-copy kan justeras — om en väljare
inte matchar efter en UI-ändring, uppdatera motsvarande `getByRole/getByText` i specen.

## Rent motor-/DB-röktest (utan browser)

När en browser inte kan köras (t.ex. sandbox utan ihållande listeners) bevisar
`backend/scripts/smoke-solve-db.mjs` samma kärna mot riktig DB + riktig motor, utan mockar:
verifierad pool → Lös middagen → rekommendation, allergigrind och poolsök. Kör:

```bash
# från backend/, med DATABASE_URL i miljön (eller --env-file)
node scripts/smoke-solve-db.mjs
```
