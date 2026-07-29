# Nisse — Täckningsmatris för rättdatabasen (§21)

> Matrisen definierar den minsta rättuppsättning som krävs för att "Lös middagen" ska kunna
> hålla max-3-löftet i vardagens vanligaste situationer, även för hushåll med allergier eller
> vegetarisk kost. Uppfyllnad mäts av ren motorkod (`engine/coverage.js`) och testas i CI
> (`test/templates/coverage.test.js`) — filterresiliens mäts genom de RIKTIGA hårda grindarna
> med syntetiska hushåll, aldrig genom taggar.

## Celldefinition

| | Insats 1 (minimal, `effortScore ≤ 1`) | Insats 2 (normal, `effortScore ≥ 2`) |
|---|---|---|
| **A** ≤ 15 min | A1 (min 4 rätter) | A2 (min 3) |
| **B** 16–30 min | B1 (min 6) | B2 (min 6) |
| **C** 31+ min | C1 (min 3) | C2 (min 4) |

- Cellen härleds ur `totalTimeMin` + `effortScore`. En rätt kan ärligt göra anspråk på extra
  celler via `coverageCells` i seed-JSON ("räkna generöst, verifiera ärligt") — anspråk unionas
  in, den härledda cellen kan aldrig ersättas.
- **Filterresiliens:** per cell ska minst **2** rätter överleva vart och ett av filtren
  gluten (allergi, hård grind), laktos (allergi, hård grind) och vego (kostrestriktion).
  Fyrstatusmodellen räknas konservativt: varierar/spår fäller också.
- **Proteinspridning:** celler med min ≥ 4 (A1, B1, B2, C2) ska ha minst **3** proteinbaser
  (kyckling/fisk/kött/vego).

## Status 2026-07-29 — hela seed-uppsättningen (36 rätter)

Uppmätt genom grindarna (`coverageReport`), efter leveransen av 12 nya rätter:

| Cell | Rätter | Gluten | Laktos | Vego | Baser | Status |
|---|---|---|---|---|---|---|
| A1 | 4/4 | 4 ✓ | 3 ✓ | 2 ✓ | fisk/kyckling/vego ✓ | **OK** |
| A2 | 3/3 | 3 ✓ | 3 ✓ | 2 ✓ | — | **OK** |
| B1 | 8/6 | 2 ✓ | 3 ✓ | 2 ✓ | fisk/kött/vego ✓ | **OK** |
| B2 | 12/6 | 2 ✓ | 7 ✓ | 3 ✓ | fisk/kyckling/kött/vego ✓ | **OK** |
| C1 | 5/3 | 3 ✓ | 3 ✓ | 2 ✓ | — | **OK** |
| C2 | 4/4 | 4 ✓ | 2 ✓ | 2 ✓ | fisk/kyckling/vego ✓ | **OK** |

> Notering: den ursprungliga handbokföringen (2026-07-15) undermätte gluten-hålen — den
> path-aware fyrstatusmodellen visade att kryddmixar, havreprodukter och charkprodukter
> (varierar per produkt) fäller gluten-/laktosfiltret i långt fler celler än taggarna antydde.
> Den maskinmätta listan ovan är facit; bokföringen görs aldrig för hand igen.

## Levererad beställning (2026-07-29, efterfrågestyrd ur den uppmätta gap-listan)

12 nya rätter, seedade som **DRAFT** (§22 — går INTE ut till hushåll förrän verifierade):

| Cell | Rätt | Fyller |
|---|---|---|
| A1 | `snabb-kycklingris` | A1-antal, gluten+laktos, kycklingbas |
| A1 | `tonfisksallad-med-bonor` | A1-antal, gluten+laktos, fiskbas |
| A1 | `snabb-aggpytt` | A1-antal, laktos+vego (ägg/vego-bas) |
| A2 | `laxwok-med-ris` | A2-antal, gluten+laktos, fisk |
| A2 | `kikartscurry` | A2-antal, alla tre filter (vegan) |
| A2 | `tomatsoppa-med-vita-bonor` | A2-antal, alla tre filter (vegan) |
| B1 | `stekt-lax-med-potatis` | B1-gluten, fisk |
| B2 | `kycklingbowl-med-ris` | B2-gluten, barnvänlig |
| B2 | `torskgryta-med-tomat` | B2-gluten, fisk |
| C1 | `ugnsbakad-sotpotatis-med-bonrora` | C1-vego+gluten+laktos (vegan, ugn/passiv) |
| C1 | `ugnsrostade-gronsaker-med-kikartor` | C1-vego+gluten+laktos (vegan, ugn/passiv) |
| C2 | `dahl-med-ris` | C2-antal, laktos+vego (vegan) |

## Verified-poolens täckning — BLOCKERANDE FR.O.M. 2026-08-01

Två CI-tester (`test/templates/coverage.test.js`):

1. **Seed-uppsättningen** (alla icke-retired, inkl. DRAFT) — **blockerande sedan 2026-07-29**.
   Repo-innehållet får aldrig regrediera under matrisen.
2. **Verified-poolen** (endast `VERIFIED` — det hushållen faktiskt kan få) — rapporterande
   t.o.m. 2026-07-31, **blockerande fr.o.m. 2026-08-01** (datum hårdkodat i testet;
   beslut Jonas 2026-07-15). I dag fäller poolen matrisen i A1/A2/B1/B2/C1/C2 eftersom de
   12 nya rätterna är DRAFT: **de behöver verifieras enligt
   `docs/NISSE_DISH_VERIFICATION_CHECKLIST.md` före 2026-08-01**, annars blir CI röd — avsiktligt.

## Gap-mätning i drift

När rankingen ger färre än 3 kvalificerade slots loggas `recommendation_gap`
(server-side, `createRecommendations`): situationens cell + räknare per filterslag
(`{allergen, dietary, equipment, time, other}`) + antal kvalificerade. Payloaden innehåller
per §24 **aldrig** vilka allergener, kostkrav eller medlemmar som låg bakom. Eventet styr
nästa innehållsbeställning — innehåll växer efterfrågestyrt, aldrig på känsla.
Spec: `docs/NISSE_ANALYTICS_SPEC.md`.
