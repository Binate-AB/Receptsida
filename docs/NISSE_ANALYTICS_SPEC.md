# Nisse — Analytics-specifikation

> Definierar alla analytics-events och exakta mätdefinitioner för pilotens målvärden.
> **Regel:** nya event läggs in HÄR först, sedan i kod. Server-side `logEvent()`
> (`backend/src/services/nisse/analytics.js` → tabell `AnalyticsEvent`) är source of truth för
> funnel-mått; klient-events (whitelist i `routes/events.js`) är komplement för UI-beteende.
> Status: **[LIVE]** finns i produktion; **[PLAN]** införs i denna fas.

## 1. Gemensamt kuvert

Varje event lagras med: `id`, `name`, `userId`, `householdId`, `payload` (JSON), `createdAt`
(timestamp). Sessionskopplade events bär `sessionId`/`requestId` i payload.

**Personuppgiftsregler:** payload får ALDRIG innehålla fritext från användaren (kan innehålla
hälso-/allergiuppgifter), namn, e-post eller medlemsnamn. Tillåtet: id:n, enum-värden, tal,
booleans, canonical-ingrediensnycklar. Allergier loggas aldrig i events — de finns endast i
hushållsmodellen. `rawText` i MealRequest sparas i domäntabellen (för funktion), inte i events.

## 2. Eventkatalog

### Beslutsflödet

| Event | Status | Trigger | Obligatoriska properties | Frivilliga |
|---|---|---|---|---|
| `onboarding_completed` | PLAN | Wizard klar (första gången) | `householdId`, `members`, `children`, `allergies_count`, `dish_prefs_count`, `duration_ms` | `skipped_steps[]` |
| `dinner_solved` | LIVE | `POST /dinner/solve` klar | `requestId`, `slots` (antal), `parseSource` (`ai`\|`chips_fallback`) | `duration_ms`, `uncertainty` [PLAN] |
| `recommendation_viewed` | LIVE (klient) | Kort renderat | `requestId`, `slot` | |
| `recommendation_accepted` | LIVE | `POST /recommendations/:id/accept` | `requestId`, `recommendationId`, `slot`, `templateId` | `ms_since_solve` [PLAN] |
| `alternative_requested` | LIVE | Riktat alternativ (enklare/billigare/barnvänligare) | `requestId`, `direction` | |
| `no_option_accepted` | PLAN | "Inget av dessa" | `requestId`, `regeneration_round` | |
| `assumption_corrected` | PLAN | `PATCH /dinner/requests/:id/assumptions` | `requestId`, `key`, `level` | `from`, `to` (enum/tal, ej fritext) |
| `shopping_list_created` | LIVE | Accept skapar lista | `listId`, `recommendationId`, `items` | |
| `recommendation_gap` | LIVE | Ranking gav <3 kvalificerade, meningsfullt olika slots (solve/korrigering/regenerate/alternativ) | `requestId`, `cell` (A1–C2 ur parsed tid+energi), `qualified` (antal slots), `hard_filter_kinds` (`{allergen, dietary, equipment, time, other}` — **endast räknare per filterslag; ALDRIG vilka allergener, kostkrav eller medlemmar**, §24) | `excluded` (antal exkluderade vid regenerate) |

### Tillagningsflödet

| Event | Status | Trigger | Obligatoriska | Frivilliga |
|---|---|---|---|---|
| `cooking_started` | LIVE | `POST /cook-sessions` | `sessionId`, `templateId`, `branch` | `recommendationId` |
| `prep_verified` | PLAN | Förberedelseskärm bekräftad | `sessionId`, `critical_confirmed`, `critical_missing` | |
| `cooking_step_viewed` | LIVE (klient) | Stegbyte | `sessionId`, `stepIndex` | |
| `missing_ingredient_reported` | PLAN | "Jag saknar något" | `sessionId`, `canonical`, `resolution` (`substitution`\|`simplify`\|`fallback_plan`) | `substitute_canonical` |
| `time_problem_reported` | PLAN | "Jag ligger efter" | `sessionId`, `stepIndex`, `minutes_behind`, `new_eta_min` | `steps_simplified` |
| `rescue_used` | LIVE | SOS-läge | `sessionId`, `source` (`ai`\|`fallback`) | |
| `voice_used` | LIVE (klient) | TTS/STT använt | `sessionId`, `kind` | |
| `cooking_completed` | LIVE | PATCH status COMPLETED | `sessionId`, `templateId` | `actual_time_min` |
| `cooking_abandoned` | LIVE | PATCH status ABANDONED | `sessionId`, `templateId` | `stepIndex` |
| `feedback_submitted` | LIVE | `POST /:id/feedback` | `sessionId`, `templateId`, `cookAgain`, `avoid` | `avgRating` |

### Återkomst

| Event | Status | Trigger | Obligatoriska |
|---|---|---|---|
| `app_return` | PLAN | Första auktoriserade anropet per användare+dygn (server-side, dedup på `userId`+datum) | `days_since_last` |

**Exempel-payload** (`missing_ingredient_reported`):
```json
{ "sessionId": "cs_123", "canonical": "tortilla", "resolution": "substitution",
  "substitute_canonical": "vetetortilla_glutenfri" }
```

**Idempotens:** server-side events skrivs i samma request-hantering som domänändringen (en gång
per statusövergång — COMPLETED/ABANDONED kan inte dubbelloggas eftersom PATCH till samma status
är no-op [PLAN: guard]); klient-events dedupas inte och används därför aldrig för målvärden.

## 3. Mätdefinitioner (pilotens målvärden)

Alla mått per hushåll och vecka om inget annat sägs. "Beslut" = en `dinner_solved`-kedja
(requestId) inklusive dess omgenereringar.

| Mått | Definition | Mål |
|---|---|---|
| **Tid till beslut** | median(`recommendation_accepted.ms_since_solve`) över alla accepterade beslut | ≤ 30 s |
| **Förstaförslagsacceptans** | andel beslut där accepterad slot = `NISSE` **och** `regeneration_round = 0` / alla beslut med ≥1 visning | ≥ 40 % |
| **Plan → tillagning** | andel `recommendation_accepted` som följs av `cooking_started` (samma recommendationId, ≤12 h) | ≥ 60 % |
| **Start → slutförd** | `cooking_completed` / (`cooking_completed` + `cooking_abandoned`) | ≥ 70 % |
| **Felåterhämtning** | andel sessioner med `missing_ingredient_reported` **eller** `time_problem_reported` **eller** `rescue_used` som ändå når `cooking_completed` | ≥ 60 % |
| **Korrigeringsgrad** | (`assumption_corrected` + `alternative_requested` + `no_option_accepted`) / beslut | tydligt sjunkande per hushåll |
| **Omgenereringsgrad** | `no_option_accepted` / beslut | sjunkande |
| **Återkomstfrekvens** | dagar med `app_return` / vecka | — |
| **≥3 kvällar/vecka** | andel aktiva hushåll med ≥3 distinkta dagar med `dinner_solved` under pilotens sista vecka | ≥ 40 % |

## 4. Inlärningsmått (vecka 1 → vecka 2, per hushåll)

Inlärningen anses observerbar om minst två av följande förbättras vecka 2 mot vecka 1:

1. Korrigeringsgrad ↓
2. Upprepade avvisningar av samma templateId ↓
3. Förstaförslagsacceptans ↑
4. Omgenereringsgrad ↓
5. Median tid till beslut ↓

**Exempel-SQL (förstaförslagsacceptans per hushåll/vecka):**
```sql
SELECT household_id, date_trunc('week', created_at) AS week,
  count(*) FILTER (WHERE name = 'recommendation_accepted'
                   AND payload->>'slot' = 'NISSE'
                   AND coalesce((payload->>'regeneration_round')::int, 0) = 0)::float
  / nullif(count(DISTINCT payload->>'requestId')
           FILTER (WHERE name = 'dinner_solved'), 0) AS first_accept_rate
FROM analytics_events
GROUP BY 1, 2;
```

Inga påståenden om personalisering görs i produkt eller kommunikation som inte kan härledas ur
dessa mått.

## 5. PII-regler, rättslig grund och lagring (§24)

### Vad som ALDRIG får förekomma i en event-payload

- Allergier, kostrestriktioner eller andra hälsorelaterade uppgifter (varken koder eller text)
- Medlemsnamn/smeknamn eller annan medlemsidentitet
- Fritext från användaren (`rawText`, rescue-`problem`, feedback-`comment`)

Tillåtet: id:n (request/session/template), enum-värden, **räknare** (`allergies_count`,
`hard_filter_kinds.allergen` = antal bortfiltrerade rätter — aldrig vilket allergen).
Detta är låst med statisk källkodsanalys i `backend/test/gdpr/piiSafety.test.js` — ett
logEvent-anrop som ens refererar `.allergies`, `memberName`, `problem:`, `rawText` eller
`comment:` fäller CI. Samma test låser att användarriktade felmeddelanden aldrig interpolerar
medlemsnamn/allergen.

### Rättslig grund

| Data | Grund |
|---|---|
| Allergier + kostrestriktioner (`household_members.allergies/dietary_restrictions`) | **Uttryckligt samtycke, art. 9.2 a** (hälsodata). Inhämtas i hushållswizarden; uppgiften är frivillig och kan ändras/raderas när som helst. Används ENBART för säkerhetsgrindar — aldrig analys, aldrig events. |
| Hushållsprofil i övrigt (medlemmar som smeknamn + ålderskategori, utrustning, skafferi) | Avtal (art. 6.1 b) — krävs för att leverera tjänsten. Dataminimering: smeknamn räcker, inga personnummer/efternamn efterfrågas. |
| Analytics-events (funnel, §12-mått) | Berättigat intresse (art. 6.1 f) — driftsäkring och produktmått, möjligt endast för att payloads är PII-fria per ovan. |

### Lagring och radering

- **Events:** 24 månader, därefter gallring. Vid hushållsradering anonymiseras hushållets
  events omedelbart (`user_id`/`household_id` → null) — aggregatvärden bevaras, kopplingen bryts.
- **Hushållsdata:** tills användaren raderar. `DELETE /households/current` (endast OWNER)
  raderar hushållet med samtliga kaskader (medlemmar inkl. allergier, skafferi, förfrågningar,
  antaganden, rekommendationer, inköpslistor, tillagningssessioner, feedback, confidence,
  preferenser, medlemskap) i samma transaktion som event-anonymiseringen. UI-bekräftelse med
  konsekvensbeskrivning finns på Hushåll-sidan.
- **Konto:** raderas separat via befintlig `/gdpr/delete-account`.
