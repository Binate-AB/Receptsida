# Nisse MVP — Genomförandeplan

> Status: levande dokument under bygget på branch `claude/nisse-kitchen-assistant-t7nz31`.
> Bakgrund och risker: se `docs/NISSE_PRODUCT_AND_TECH_AUDIT.md`.

## Mål

En användare ska kunna: skapa hushåll med medlemmar (allergier = absoluta regler) →
beskriva kvällen i fritext/snabbval → få max tre förslag med ett tydligt rekommenderat →
välja måltid med gemensam grund + barn/vuxen-varianter → få inköpslista → guidas genom
matlagningen med timers, grenar och räddningsläge → lämna feedback som påverkar nästa
rekommendation. (Masterprompt §28, Definition of Done.)

## Arkitekturprinciper

1. **Deterministisk kod för säkerhet och beräkning** — allergigrind, portionsskalning,
   enhetskonvertering, aggregering, tidslinje och rankning är rena JS-funktioner med tester.
   En språkmodell får aldrig ensam avgöra att en måltid är säker för en allergiker.
2. **AI för tolkning och formulering** — fritext → strukturerad `MealRequest` (Zod-validerad,
   retry + deterministisk chips-fallback) samt korta motiveringar/räddningsråd.
3. **Additivt** — legacy-sök, veckoplanerare och gamla cooking-flödet lämnas orörda.
4. **Små verifierbara leveranser** — varje steg nedan lämnar appen körbar.

## Arbetsområden och leveranssteg

| # | Steg | Innehåll | Acceptanskriterier | Status |
|---|------|----------|--------------------|--------|
| 0 | Hygien | AppError-fix i `routes/cooking.js`; `repairJSON` → `utils/json-repair.js` (+stack-korrekt stängning); `node --test`-setup; revisionsrapport + denna plan | `npm test` grönt; docs finns | ✅ |
| 1 | Migrations-reconciliering | Drift-migration via `prisma migrate diff`; prod-runbook (nedan) | `prisma migrate deploy` bygger komplett schema på färsk DB | ✅ |
| 2 | Hushållsdomän | Modeller `Household`/`HouseholdMember`/`InventoryItem` + migration; `routes/households.js`; Zod-scheman; `getOwnedHousehold`-helper | CRUD fungerar; gamla endpoints opåverkade | ✅ |
| 3 | Receptmallar + motor-kärna | `RecipeTemplate` + migration; delad `templateSchema` (Zod); 10 seed-JSON + seed-script; motor: `allergens/units/portions/normalize/timeline` + tester | Seed validerar (DAG-bygge körs per mall); motortester gröna | ✅ |
| 4 | Rekommendationsmotor | Motor: `pantry/cost/shopping/ranker` + tester; `MealRequest`/`MealRecommendation`/`ShoppingList(+Item)` + migration; `POST /dinner/solve` (chips-only, utan AI); accept → auto-inköpslista | 3 kort utan allergiöverträdelser; lista aggregerad per hylla | ⬜ |
| 5 | AI-gräns | `services/nisse/ai/` (client/prompts v1/schemas/nisseAi); parse + motiveringar in i solve; `POST /dinner/requests/:id/alternative` | Fritext tolkas med confidence; utan `ANTHROPIC_API_KEY` fungerar solve ändå (`chips_fallback`, motivering null) | ⬜ |
| 6 | Frontend: Hushåll | `/hushall`-wizard (medlemmar → utrustning/nivå → hemma-varor); api- + store-tillägg; tab | Hushåll med 2 vuxna + 1 barn (allergi) persisterar | ⬜ |
| 7 | Frontend: Lös middagen | `/middag`: solver (fritext + chips) → max 3 kort ("Nisses val" markerat) → Enklare/Billigare/Barnvänligare → acceptera | Hela flödet med toast + länk till inköpslista | ⬜ |
| 8 | Frontend: Inköpslista | `/inkop`: hyllgrupper, nödvändigt/valfritt, "har troligen hemma", kostnad, avbockning | Checks persisterar via PATCH | ⬜ |
| 9 | Guidad matlagning v2 | `CookingSession` + migration; `routes/cook-sessions.js` (start/get/patch/ask/rescue); `templateToLegacyRecipe`-adapter; `CookingMode` session-prop + `BranchSwitcher` + `RescueSheet`; `/cooking?session=` | Gren-recept visar Gemensamt/Barnens/Vuxnas; "det bränns" ger kontextuell fix (canned utan AI); stegposition överlever reload | ⬜ |
| 10 | Feedback + analys | `MealFeedback` + `AnalyticsEvent` + migration; feedback-endpoint + `FeedbackSheet`; `/events`; feedback-signaler in i rankern | Betyg lyfter mall vid nästa solve; `avoid` utesluter; funnel-events i DB | ⬜ |
| 11 | Härdning | Rate limit på solve; Redis-cache för AI-parse; full testkörning; manuell regression av legacy-flöden; docs färdiga | DoD §28 passerar end-to-end | ⬜ |

## Beroenden

- Steg 2–4 kräver steg 1 (fungerande migrate-kedja).
- Steg 5 kräver steg 4 (deterministisk solve att montera AI på).
- Steg 7 kräver steg 5 + 6; steg 8 kräver steg 4; steg 9 kräver steg 3 + 7; steg 10 kräver steg 9.

## Migrations-runbook (drift-reconciliering)

Utveckling har skett med `prisma db push`, så modeller efter init-migrationen saknar
migrationsfiler. Åtgärd:

1. **Denna branch** innehåller `prisma/migrations/20260714000001_reconcile_drift/` som
   skapar alla tabeller/enums/kolumner som tillkommit efter init (genererad med
   `prisma migrate diff --from-migrations ... --to-schema-datamodel ...`).
2. **Färsk miljö** (CI, ny utvecklare): `npx prisma migrate deploy` — klart.
3. **Befintlig miljö där tabellerna redan finns** (prod/staging som kört `db push`):
   verifiera först att driften stämmer med
   `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma`
   (ska vara tom eller endast Nisse-nyheter), och markera sedan reconcile-migrationen som
   redan applicerad: `npx prisma migrate resolve --applied 20260714000001_reconcile_drift`.
4. Därefter används alltid `prisma migrate dev` för nya ändringar — aldrig mer `db push`.

## Teststrategi

- **Motorinvarianter** (`backend/test/engine/`): allergigrinden släpper aldrig igenom en
  allergen oavsett mjuka poäng (inkl. via substitution); dietaryGate; portionsskalning med
  portionsfaktorer; enhetskonvertering + svensk formatering; inköpsaggregering
  (2 dl + 3 msk grädde → en post); skafferimatchning med osäker inventering
  (confidence < tröskel ⇒ aldrig "har hemma"); tidslinje (beroendeordning, parallella
  passiva steg, barn/vuxen-lanes slutar samtidigt, cykel kastar); rankning (hårda grindar
  vinner alltid; `avoid`-feedback utesluter; ≤3 kort med ärlig degradering).
- **AI-kontrakt** (`backend/test/ai/`): fixtures med giltig/trasig/trunkerad JSON mot
  Zod-schemana; chips-fallback producerar giltig parsed request.
- **Innehållsgrind** (`backend/test/templates/`): varje seed-mall validerar mot
  `templateSchema` och bygger en cykelfri tidslinje.
- Kör: `cd backend && npm test` (node:test, ingen DB, inget nätverk).

## Tekniska risker och hantering

| Risk | Hantering |
|---|---|
| Reconcile-migrationen matchar inte prod-driften exakt | Runbook-steget med `migrate diff --from-url` före `resolve --applied` |
| < 3 säkra kandidater för restriktiva hushåll | Motorn degraderar ärligt (1–2 kort + förklaring) i stället för att fylla på med osäkra |
| AI-latens/kostnad på hot path | Parse ≤ 700 tokens, motiveringar ≤ 900; Redis-cache på parse; deterministisk fallback håller p99 nere |
| `CookingMode` (614 rader) destabiliseras | Gren-växlare och räddningsläge som separata komponenter; session-prop additiv; legacy-flödet regressionstestas |
| Kanonisering av ingredienser | Handkuraterad aliastabell avgränsad till seed-uppsättningens ~120 ingredienser |

## Antaganden

- Ett hushåll per användarkonto (ägaren); medlemmar är profilrader utan egna logins.
- Allergier och kostrestriktioner är hårda grindar; ogillade ingredienser och stark
  mat-tolerans är mjuka straff (stark mat blir hård grind vid tolerans NONE utan mild gren).
- Kostnadsuppskattningar är statiska SEK-spann från seed-data ("ca X–Y kr").
- Modell `claude-sonnet-4-20250514`; leverantörsbyte isolerat till `services/nisse/ai/client.js`.
- Analytics i Postgres räcker för MVP (ingen extern analysplattform).
