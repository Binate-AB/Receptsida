# Nisse — MVP-definition (90 dagar)

> Detta dokument styr **vad som får byggas under nuvarande fas**. Produktlöfte och principer:
> `docs/NISSE_PRODUCT_VISION_V2.md`. Arbetsregler: `CLAUDE.md`. Funktioner som exkluderas här
> byggs inte nu, även om visionen beskriver dem.

## 1. Hypotesen som MVP:n ska testa

> "Ett hushåll med begränsad tid, energi och flera viljor accepterar Nisses första middagsförslag
> tillräckligt ofta, lagar det tillräckligt ofta och återkommer tillräckligt ofta för att avlastat
> matansvar ska kunna bli en betalbar produkt."

Allt som inte behövs för att testa denna hypotes senareläggs. **MVP:n är kilen** — inte en mindre
version av hela visionen.

## 2. Målvärden för piloten

| Mått | Mål |
|---|---|
| Median tid till beslut | ≤ 30 sekunder |
| Förstaförslagsacceptans | ≥ 40 % |
| Accepterade planer där tillagning startas | ≥ 60 % |
| Startade sessioner som slutförs | ≥ 70 % |
| Problemsessioner som ändå slutförs | ≥ 60 % |
| Hushåll som använder Nisse ≥3 kvällar/vecka (pilotens sista vecka) | ≥ 40 % |
| Korrigeringsgrad | ska tydligt sjunka per hushåll |

Exakta mätdefinitioner: `docs/NISSE_ANALYTICS_SPEC.md`.

## 3. MVP-omfånget (byggs)

1. **Onboarding** — hushållets namn (valfritt), vuxna, barn + ungefärliga åldrar, allergier
   (obligatorisk aktiv bekräftelse), absoluta kostbegränsningar, smakförankring via kurerat
   snabbval ("Vilka av dessa brukar fungera hemma hos er?", <30 s). Första middagsförslaget nås
   på under 2 minuter. Övrigt lärs in successivt.
2. **Kvällens situation** — primär handling "Nisse, lös middagen": tryck direkt (Nisses
   antaganden), kort fritext, eller snabbval (helt slut / max 20 min / så billigt som möjligt /
   använd det vi har / barnen extra kräsna / laga något ordentligt). Struktureras till validerad
   data (vilka äter, tidsfönster, energi, budget, barnanpassning, portioner, arbetsinsats).
3. **Beslutmotorn** — exakt tre rangordnade alternativ: Nisses rekommendation, enklare reserv,
   billigare/mest robust. Varje kort visar namn, situationskopplad motivering, total/aktiv tid,
   kostnadsnivå, disknivå, avgörande ingredienser, varför den passar vuxna+barn, ev. barnportions-
   avstickare och Nisses antaganden. Acceptera / korrigera antagande / "inget av dessa" → tre nya.
   Avvisning och omgenerering loggas som inlärningssignal. Spec: `NISSE_DECISION_ENGINE_SPEC.md`.
4. **Antagandeekonomi** — nivå 1 verifieras, nivå 2 visas och korrigeras med ett tryck, nivå 3
   antas tyst. Max en verifierande fråga per beslut; annars robustare rätt.
5. **Kurerad rättdatabas** — strukturerade, kurerade rätter (ej fri AI-generering). Mål 60–100
   under MVP-perioden; start med minsta uppsättning för komplett vertikalt flöde. Varje rätt bär
   robusthetsnivå, avgörande/valfria ingredienser, substitutioner, allergener, tider, kostnads-/
   disk-/svårighets-/barnvänlighetsnivå, barnportionsavstickare, strukturerade steg, timers,
   utrustning, förenklingar.
6. **Tillagningsläge (medvetet enkelt)** — förberedelseskärm (utrustning + avgörande ingredienser
   verifieras), ett steg i taget, timers, parallella moment, barnportionsavstickare,
   "jag saknar något" (validerad substitution / förenkling / reservplan), "jag ligger efter"
   (justerad återstående plan + ny realistisk sluttid), avslut klar/avbruten.
   **Ingen fri AI-baserad matlagningsfelsökning i denna fas.**
7. **Inlärningsloop** — events enligt `NISSE_ANALYTICS_SPEC.md`; hushållsmodellen uppdaterar
   preferenser, avvisningar, basvarukonfidens, tids-/portionsantaganden, barnanpassningar.
   Förbättring vecka 1→2 ska vara mätbar.
8. **Hushållsdelning** — flera vuxna delar hushållsprofil, allergier, preferenser, utfall och
   inlärning. Den som initierar kvällens beslut är kvällens beslutsfattare. Inga godkännande-
   kedjor, omröstningar, avancerade notiser, konkurrerande planer eller preferensbalansering.

## 4. Exkluderat scope — byggs INTE utan uttryckligt nytt beslut

- kylskåpsfoto
- bildidentifiering
- kvittoimport
- streckkodsläsning
- fullständig köksinventering
- butiksintegrationer
- matleverans
- automatisk veckoplanering
- flerdagarsoptimering
- avancerad restloop
- röststyrning¹
- social feed
- avancerad fri matlagningsfelsökning
- annonser
- sponsrade recept
- betald ranking
- komplex betalvägg

Lägg inte in framtida funktioner "när du ändå arbetar i området".

¹ *Befintlig TTS/STT (`useVoice.js`) från den tidigare appen finns kvar i kokläget men utökas inte.*

## 5. Status (2026-07-15)

En första MVP-version är live på `www.nisse.io` (Vercel Services + Supabase) med: hushållswizard,
"Lös middagen" (3 slots + motiveringar + alternativ), inköpslista, guidad matlagning med grenar/
timers/SOS-fallbacks, feedback→ranking, analytics-grund, 10 rätter, 124 tester.
Kvarvarande gap mot detta dokument: antagandeekonomins UI/datamodell, robusthetsviktning,
förberedelseskärm med verifiering, strukturerad "saknar något", "ligger efter", smakförankring i
onboarding, multi-vuxna hushåll, events-komplettering, rättdatabas 10→60+.
Aktuell leveransplan: `docs/NISSE_MVP_IMPLEMENTATION_PLAN.md`.
