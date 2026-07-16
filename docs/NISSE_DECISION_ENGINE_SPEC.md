# Nisse — Beslutmotorspecifikation

> Spec för den deterministiska beslutsmotorn (`backend/src/services/nisse/engine/ranker.js` m.fl.).
> Motorn är ingen svart låda: varje faktor nedan är kod, viktningen står här, och varje kandidat
> bär `reasons[]` som förklarar sitt score. Ändringar i motorn ska uppdatera denna spec i samma
> leverans. Status per faktor: **[LIVE]** = i produktion; **[PLAN]** = beslutad i denna fas,
> implementeras enligt `NISSE_MVP_IMPLEMENTATION_PLAN.md`.

## 1. Pipeline

```
MealRequest (chips + ev. AI-tolkad fritext, AI-fel → chips-fallback)
  → HÅRDA FILTER (diskvalificerar; mjuka signaler kan aldrig återuppliva)
  → MJUK SCORING (bas 50 + faktorer nedan; reasons[] per kandidat)
  → SLOT-VAL (3 olika rätter: NISSE / EASIEST / CHEAPEST)
  → Antaganden sparas och visas (nivå 2), max 1 verifierande fråga (nivå 1)
```

## 2. Hårda filter (ordning; första träff diskvalificerar) [LIVE]

1. **Explicit exkluderad** (omgenerering/"inget av dessa")
2. **Allergen-grind** — någon ätande medlems allergi finns i rättens allergener (inkl. varianter;
   substitutioner bypassar aldrig grinden)
3. **Kostbegränsnings-grind** — absolut restriktion (t.ex. vegetariskt) ej uppfylld
4. **Avoid-feedback** — hushållet har markerat "undvik" efter tidigare tillagning
5. **Utrustning** — krävd utrustning saknas (grind hoppar över om utrustning är okänd = `[]`)
6. **Tid** — `totalTimeMin > tidsbudget + 5`
7. **Styrka** — ätare med NONE-tolerans + `spiceLevel ≥ 2` utan mild gren
8. **Ikväll-undantag** — fritextens `avoidIngredients` träffar rättens canonicals

Avvisade kandidater returneras med maskinläsbar `reason` (loggas, används i förklaringar).

## 3. Mjuk scoring (bas 50) [LIVE]

| Faktor | Vikt/intervall | Kommentar |
|---|---|---|
| Pantry-överlapp | +0…25 (`overlap × 25`) | "använd det som finns hemma" |
| Budget "snålt" | +0…12 (`(30 − min(30, kost/portion)) × 0.4`) | billigast gynnas |
| Budget "flexibelt" | +2 | neutral knuff |
| Energi "slut/låg" | `(3 − effort) × 6` + `(3 − disk) × 2` (−12…+12) | låg insats gynnas |
| Energi "inspirerad" | `(effort − 2) × 3` | mer ambitiöst gynnas |
| Barnvänlighet (barn ätare) | `childFriendly × 5` (0…15) | |
| Barn/vuxen-gren (barn+vuxen) | +8 | gemensam grund, två varianter |
| Ogillad ingrediens | −10 per träff | mjukt (allergi är hård) |
| Styrka-mismatch utan gren | −10 | NONE-tolerans + spiceLevel 1 |
| Feedback-betyg | `(avgRating − 3) × 8` (−16…+16) | inlärning |
| "Laga igen" | +4 | |
| Tidspassform | +0…6 (`6 − slack × 0.2`) | nära budgeten = bäst tidsutnyttjande |
| Cravings-träff | +10 per träff | fritext ("tacos") mot titel/taggar/ingrediens |
| Nyligen lagad | −15 | variation |

### Nya faktorer [PLAN]

| Faktor | Vikt | Motiv |
|---|---|---|
| Robusthet vid osäkerhet | `osäkerhet × (robustness − 3) × 6` | osäkerhet ∈ [0,1]; se §5 |
| Critical-beroenden vid osäkerhet | `−osäkerhet × max(0, antalCriticalEjBekräftade − 2) × 4` | färre osäkra beroenden vinner |
| DishPreference (smakförankring) | +8 (onboarding), +4 (learned) | "brukar funka hos er" |

## 4. Slot-val och diversifiering [LIVE]

- **NISSE** = högsta totalscore (förstahandsvalet har alltid högst score — testat).
- **EASIEST** = av återstående: lägst `effortScore`, sedan lägst `activeTimeMin`, sedan score.
- **CHEAPEST/ROBUST** = av återstående: högst pantry-överlapp, sedan lägst kostnad, sedan score.
- Tre **olika** rätter (used-set). Slots är per definition diversifierade i dimension
  (bäst totalt / minst jobb / billigast-mest robust), inte tre snarlika toppkandidater.

**"Exakt tre" vs säkerhet:** motorn returnerar exakt tre när ≥3 rätter klarar de hårda filtren.
Finns färre säkra kandidater returneras färre, med ärligt meddelande — **osäkra alternativ paddas
aldrig in** (visionens säkerhetsregler > antalskrav). Växande rättdatabas minskar förekomsten.

## 5. Osäkerhet, robusthet och confidence [PLAN]

**Osäkerhetsmått** (0…1) per beslut: 1.0 utan inventeringsdata; annars
`1 − medelConfidence(HouseholdIngredientConfidence för rättens critical-ingredienser)`,
golv 0.15 (inventering är alltid en gissning, aldrig bokföring).

**Robusthet** (`RecipeTemplate.robustness` 1–5) beskriver hur väl rätten klarar: osäker
inventering, saknad ingrediens, kortare tid än planerat, barnanpassning, enkla substitutioner.
Sätts redaktionellt per rätt vid kurering (fler substitutioner + färre critical + tål förenkling
= högre).

**Basvaru-confidence**: initialt en *transparent initial heuristik för vanligt förekommande
svenska basvaror* (låg/måttlig confidence, t.ex. 0.6 för salt/peppar/smör/pasta/ris/lök).
Uppdateras av utfall: "saknad ingrediens rapporterad" sänker, "bekräftad vid förberedelse" höjer,
inköpslista slutförd höjer köpta varor. Aldrig beskriven som statistisk modell.

**Max en fråga-regeln**: om toppkandidaten kräver >1 nivå 1-verifiering utöver allergier väljs i
stället närmaste robustare kandidat (färre osäkra critical-beroenden). Motorn frågar inte mer —
den väljer säkrare.

## 6. Nya hushåll (cold start)

Utan feedback/inventering: osäkerhet = 1.0 → robusthet väger tungt; smakförankringens
DishPreferences (+8) är den huvudsakliga personliga signalen; barnvänlighet + gren-bonus styr
barnfamiljer rätt. Motorn är fullt funktionell från första beslutet — inlärningen skärper, den
möjliggör inte.

## 7. Avvisningar och omgenerering [LIVE, kompletteras]

- "Inget av dessa" → alla tre exkluderas i omgenereringen (`excludeTemplateIds`), event loggas
  [PLAN: `no_option_accepted`], och avvisningen räknas i inlärningsmåtten.
- Riktade alternativ (Enklare/Billigare/Barnvänligare) re-rankar med styrd parsed-justering och
  exkluderar redan visade.
- Upprepade avvisningar av samma rätt över tid sänker dess feedback-signal [PLAN: persistent
  avvisningsräknare per template].

## 8. Antaganden (nivå 1/2/3) [PLAN]

Varje beslut sparar `DinnerAssumption`-rader: `key` (t.ex. `portions`, `time_budget`, `energy`,
`pantry:pasta`), `level` (1|2|3), `value`, `confidence`, `correctedValue?`. Nivå 2 visas som
chips på beslutsskärmen ("Nisse antar: 4 portioner · 30 min · pasta hemma") och korrigeras med
ett tryck → re-rank + event `assumption_corrected`. Nivå 1 (allergier, critical-ingredienser)
verifieras — allergier i onboarding, critical på förberedelseskärmen före tillagning.

## 9. Exempel

**A. Trött tisdag, barnfamilj.** 2 vuxna + 2 barn (3 & 6 år, ett glutenfritt), chips: "helt slut",
"max 20 min". Hårda filter tar bort alla rätter med gluten utan säker variant + allt >25 min.
Energi "slut" ger `(3−effort)×6`: ugnspannkaka (effort 1) +12, tacogryta (effort 2) +6.
Barnvänlighet + gren: tacogryta +15+8. NISSE = tacogryta (gren, 20 min), EASIEST = ugnspannkaka,
CHEAPEST = linssoppa (hög pantry-överlapp). Antaganden visade: "3,2 portioner · barnen äter ·
tortillas hemma (osäker)". Tortillas är critical + osäker → verifieras på förberedelseskärmen.

**B. "Inget av dessa" ×1.** Alla tre exkluderas; nästa rank utan dem. Loggas → korrigeringsgrad.
Väljer hushållet aldrig fisk trots hög score lär avvisningarna ner fiskrätterna utan att någon
markerat "undvik".

**C. Nytt hushåll utan inventering, en jordnötsallergi.** Osäkerhet 1.0 → robusthet dominerar
mjukscoren; alla rätter med jordnöt (inkl. varianter) är bortfiltrerade före scoring; motorn
föredrar rätter med ≤2 critical-ingredienser; en (1) verifierande fråga tillåts — annars väljs
robustare rätt. Exakt tre visas bara om tre säkra finns.

## 10. Testkrav (kopplade till spec:en)

Allergen-mall blockeras även med maximal mjukscore · substitution med allergen blockeras ·
förstahandsvalet har högst score · tre olika slots med rätt dimensioner · hög osäkerhet lyfter
robusta rätter · avvisningar påverkar nästa ranking · omgenerering exkluderar visade ·
korrigerat antagande ändrar re-rank · cold start ger giltigt beslut · ärlig degradering <3 säkra.
