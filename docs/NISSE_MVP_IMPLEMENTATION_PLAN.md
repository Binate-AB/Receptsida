# Nisse MVP — Implementeringsplan (V2-delta)

> **Version 2 (2026-07-15).** V1-planen (12 steg) är slutförd och live på www.nisse.io —
> DoD verifierad end-to-end: hushåll med 2 vuxna + 2 barn (glutenallergi) → fritext-solve →
> 3 förslag utan allergiöverträdelser → gren-recept → inköpslista → guidad session med lanes,
> timers och rescue → feedback → nästa solve rankar rätten högre. Denna plan beskriver **deltat**
> mot den skärpta MVP-definitionen. Styrande: `NISSE_PRODUCT_VISION_V2.md` → `NISSE_MVP_90_DAYS.md`
> → `CLAUDE.md`. Nuläge/risker: `NISSE_CURRENT_STATE_AUDIT.md`. Motor: `NISSE_DECISION_ENGINE_SPEC.md`.
> Mätning: `NISSE_ANALYTICS_SPEC.md`.

## Principer

1. Deterministisk kod för säkerhet/beräkning; AI endast tolkning/formulering (budget + fallback).
2. Additivt — inget i live-flödet rivs; varje leverans lämnar appen körbar och testbar.
3. End-to-end före bredd: leverans B–D fullbordar den vertikala kilen; F skalar innehållet.
4. Events specas i `NISSE_ANALYTICS_SPEC.md` INNAN de implementeras.
5. Inga commits/pushar utan uttrycklig begäran.

---

## Leverans B — Antagandeekonomi + robusthet (kilens kärna)

**Användarvärde:** användaren ser vad Nisse antagit ("4 portioner · 30 min · pasta hemma") och
rättar med ett tryck i stället för att misstro förslaget eller få fel middag.
**Hypotes:** synliga+korrigerbara antaganden höjer förstaförslagsacceptansen och sänker
korrigeringsgraden över tid (mätbar inlärning).

- **Datamodell:** `DinnerAssumption` (requestId FK, key, level 1|2|3, value Json, confidence
  Float, correctedValue Json?, correctedAt?); `HouseholdIngredientConfidence` (householdId,
  canonical, confidence, updatedAt, `@@unique([householdId, canonical])`);
  `RecipeTemplate.robustness Int @default(3)`; ingredient-JSON får `critical: boolean`
  (templateSchema + alla 10 seeds). Migration additiv.
- **API:** `POST /dinner/solve` sparar assumptions och returnerar dem per beslut;
  `PATCH /dinner/requests/:id/assumptions` (body: `{key, value}`) → uppdatera + re-rank →
  nya rekommendationer + event. "Inget av dessa": `POST /dinner/requests/:id/regenerate`
  (exkluderar visade) → event `no_option_accepted`.
- **Motor (`ranker.js`):** osäkerhetsmått + robusthetsviktning + critical-straff enligt
  `NISSE_DECISION_ENGINE_SPEC.md` §3 [PLAN]-tabellen och §5; max-1-fråga-regeln (välj robustare
  i stället för att fråga). Basvaru-heuristik (initial confidence-lista) i `engine/pantry.js`.
- **Frontend (`/middag`):** AssumptionChips-komponent under korten (nivå 2-antaganden, ett-trycks-
  korrigering: portioner ±, tid-chips, "har inte hemma"-toggle); "Inget av dessa"-knapp.
- **Events:** `assumption_corrected`, `no_option_accepted`; `dinner_solved` får `uncertainty`;
  `recommendation_accepted` får `ms_since_solve`, `regeneration_round`.
- **Tester:** hög osäkerhet lyfter robust rätt; korrigerat antagande ändrar re-rank; regenerate
  exkluderar alla visade; critical-flaggan valideras i seeds; assumptions persisteras.
- **Acceptans:** beslut visar ≥2 korrigerbara antaganden; korrigering ger nya kort <1 s
  (deterministiskt, ingen AI); events verifierbara i DB.
- **Beroenden:** inga. **Risker:** chip-UI får inte skymma korten (mobil); re-rank måste
  återanvända sparad parsed-data (ingen ny AI-tolkning).

## Leverans C — Onboarding-smakförankring

**Användarvärde:** "Vilka av dessa brukar fungera hemma hos er?" — hushållet förankrar smak på
<30 s i stället för formulär. **Hypotes:** DishPreferences höjer förstaförslagsacceptansen från
första beslutet (cold start).

- **Datamodell:** `DishPreference` (householdId, templateId, source `ONBOARDING`|`LEARNED`,
  `@@unique([householdId, templateId])`).
- **API:** wizard-upsert tar emot `dishPreferences: string[]` (template-slugs); `GET /households/
  meta` returnerar kurerat urval (title + emoji/bild + slug) ur aktiva templates.
- **Frontend:** nytt wizard-steg (multi-select-chips, hoppbart); progress 3→4 steg; händelsen
  `onboarding_completed` med `duration_ms` (wizard-start → klar).
- **Motor:** +8 (onboarding) / +4 (learned) i scoring.
- **Tester:** preferens lyfter score; unikhet per hushåll+template; onboarding utan val fungerar.
- **Acceptans:** ny användare når första förslaget <2 min inkl. smaksteg; event loggat en gång.
- **Beroenden:** B (scoringfaktorn). **Risker:** urvalet måste spegla seed-basen (annars tom
  signal) — kureras om i F när basen växer.

## Leverans D — Tillagningsdelta (verifiering, saknad ingrediens, ligger efter)

**Användarvärde:** rätt förutsättningar innan spisen är på; konkret räddning utan skuld när något
saknas eller tiden spricker. **Hypotes:** felåterhämtade sessioner slutförs ≥60 %; start→slutförd
≥70 %.

- **Förberedelseskärm (D1):** före steg 1 visas utrustning + critical-ingredienser som bekräftas
  ("har du: tortillas, köttfärs?"). Bekräftelse/saknad uppdaterar HouseholdIngredientConfidence;
  event `prep_verified`. Saknad critical HÄR → direkt till substitutionsflödet (D2) innan start.
- **"Jag saknar något" (D2):** knapp i kokläget → välj ingrediens ur sessionens lista →
  deterministisk lösning i prioritetsordning: validerad substitution ur template-variants
  (går ALLTID genom allergenGate för kvällens ätare) → förenkling (steg med `optional`/
  `simplification`-flagga) → reservplan (närmaste robusta rätt som redan är gate-säker).
  Event `missing_ingredient_reported`; confidence sänks.
- **"Jag ligger efter" (D3):** knapp → deterministisk ompackning av återstående steg
  (återanvänd `buildTimeline` på ej slutförda steg; hoppa `optional`-steg; parallellisera det
  som går) → ny realistisk sluttid + prioriterade moment. Event `time_problem_reported`.
  Ingen AI i någon av D-vägarna.
- **API:** `POST /cook-sessions/:id/missing` (`{canonical}`), `POST /cook-sessions/:id/behind`
  (`{minutesBehind?}`); svaren är strukturerade planer (inte prosa).
- **Frontend:** PrepScreen-vy i cooking-flödet; MissingIngredientSheet; BehindScheduleSheet;
  befintlig RescueSheet (fritext-SOS) behålls som komplement.
- **Tester:** substitution med allergen blockeras; critical-verifiering krävs före start;
  behind-planen är kortare och topologiskt giltig; fallback-kedjan substitution→förenkling→
  reservplan; events exakt en gång.
- **Acceptans:** §17-flödets punkt 10–16 fungerar utan AI-nyckel.
- **Beroenden:** B (critical-flaggan, confidence). **Risker:** steg-JSON i befintliga seeds
  behöver `optional`/`simplification`-flaggor — uppdateras i samma leverans (seed-validering
  skyddar).

## Leverans E — Hushållsdelning + events-komplettering

**Användarvärde:** båda vuxna delar hushållet — den som löser kvällen är kvällens beslutsfattare;
inlärningen är gemensam. **Hypotes:** delat ansvar ökar ≥3-kvällar/vecka-andelen.

- **Datamodell:** `HouseholdMembership` (userId, householdId, role `OWNER`|`ADULT`, joinedAt,
  `@@unique([userId, householdId])`); `Household.inviteCode` (kort, roterbar). Backfyllnad:
  befintliga ägare får OWNER-membership i migrationen. `ownerId` behålls (bakåtkompatibelt).
- **API:** `POST /households/join` (`{inviteCode}`); `GET /households/current/invite` (OWNER);
  helper `getOwnedHousehold()` → `getMemberHousehold()` överallt (behörighet = membership).
- **Frontend:** invite-kod visas i hushållsvyn; join-fält vid onboarding ("har ni redan ett
  hushåll? ange kod").
- **Events:** `app_return` (server-side dedup per användare+dygn) + kompletteringar från
  analytics-spec:en (payload-fält på befintliga events).
- **Tester:** användare utan membership får 403 på annat hushålls data; join är idempotent;
  två vuxna ser samma inlärning; app_return dedupas.
- **Acceptans:** två konton delar ett hushåll end-to-end; inga godkännandekedjor/omröstningar.
- **Beroenden:** inga hårda (parallelliserbar med C/D). **Risker:** rör auth-vägen för ALLA
  hushållsanrop — kräver regressionstest av hela kilen; migrationen testas mot skugg-DB före prod.

## Leverans F — Rättdatabas 10 → 24–30 (därefter mot 60–100)

**Användarvärde:** variation utan upprepning; "exakt tre" håller även för allergihushåll.
**Hypotes:** större säker kandidatmängd höjer acceptans och återkomst.

- **Innehåll:** +14–20 kurerade svenska vardagsrätter (JSON-seeds) med full V2-modell: robustness,
  critical/valfria ingredienser, substitutioner, allergener, tider, kostnads-/disk-/svårighets-/
  barnvänlighetsnivå, gren där rimligt (mål: ≥40 % av basen har barn/vuxen-gren), förenklings-
  flaggor på steg, timers, utrustning.
- **Kvalitetsgrind:** befintlig seed-validering (Zod + buildTimeline per rätt) utökad med
  robustness/critical-krav; ingen rätt utan minst en substitution på varje critical-ingrediens
  eller explicit `no_substitute: true`.
- **Tester:** seed-sviten validerar hela basen; spridningskrav (tid/kostnad/effort/diet) assertas.
- **Acceptans:** `npm run seed:templates` grönt mot prod-schema; motorn ger 3 säkra alternativ
  för testhushållen (inkl. gluten-, laktos- och nötallergi) utan degradering.
- **Beroenden:** B (nya fält i templateSchema). **Risker:** innehållskvalitet — kurering tar tid;
  hellre 24 riktiga än 60 tunna.

---

## Status (2026-07-15)

Leverans **B–F implementerade** i arbetsträdet (ej committade — inga commits/pushar utan uttrycklig
begäran): antagandeekonomin (DinnerAssumption + chips + PATCH + regenerate), robusthet/critical +
osäkerhetsviktning, smakförankring (DishPreference + wizard-steg 4), förberedelseskärm + strukturerad
"saknar något" + "ligger efter" (deterministiska), HouseholdMembership + invite-kod + app_return,
rättdatabas **10 → 24** (7 med barn/vuxen-gren). 214 tester gröna; `next build` grön.
**Kvar före produktion:** commit/push + merge (på begäran), tre migrationer mot Supabase
(`20260716000000/1/2`), `npm run seed:templates` mot prod, §17-flödet verifierat på www.nisse.io.
**Kvar i MVP-perioden:** rättdatabas 24 → 60–100, DB-baserade behörighetstester (membership-403),
gren-täckning mot ≥40 %.

## Ordning och verifiering

Ordning: **B → C → D → E → F** (B är kilens kärna; C/D/E kan delvis parallelliseras efter B).

Per leverans: `cd backend && npm test` grönt · `cd frontend && npm run build` grönt · migrationer
rena mot skugg-DB · §17-checklistan för berörda punkter körd manuellt (utan AI-nyckel) · events
verifierade med SQL mot AnalyticsEvent · legacy-flöden regressionstestade · docs uppdaterade.
Full DoD: `NISSE_MVP_90_DAYS.md` + `CLAUDE.md`. Befintliga fel rapporteras separat från
introducerade.

## Kända begränsningar (medvetna, dokumenterade)

- "Exakt tre" degraderar ärligt när <3 säkra kandidater finns (säkerhet > antal) — minskar med F.
- Gamla receptsökningen är degraderad på Vercel Hobby (10s-timeout) — utanför kilen.
- Röststyrning utökas inte (exkluderat scope); befintlig TTS/STT ligger kvar orörd.
- Basvaru-confidence är en transparent initial heuristik tills utfallsdata finns.
