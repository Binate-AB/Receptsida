# Nisse — Verifieringschecklista för rätter (§22)

> Varje ny rätt seedas som `DRAFT` och får bli `VERIFIED` först när en människa har gått igenom
> hela checklistan nedan. Verifiering är ett mänskligt beslut: `verificationStatus: "VERIFIED"`
> kräver `verifiedAt` (YYYY-MM-DD) + `verifiedBy` (namn) i seed-JSON — schemat vägrar annars.
> `RETIRED` används när en rätt dras tillbaka; den lämnar kandidatpoolen men pågående
> tillagningssessioner påverkas inte (frusen `recipeData`).

## Så går verifieringen till

1. Granska rätten mot checklistan nedan (seed-JSON + gärna en provlagning eller rimlighetsläsning).
2. Rapportera i chatten eller redigera direkt: brister → rätta i seed-JSON, rätten förblir DRAFT.
3. När allt stämmer: sätt `verificationStatus: "VERIFIED"`, `verifiedAt`, `verifiedBy` i seed-JSON.
4. Kör `npm test` (seed-valideringen + allergen-grindarna måste vara gröna) och seeda om.

## Checklista per rätt

### A. Allergener (hårdast — §13; se även docs/NISSE_ALLERGEN_REVIEW.md)
- [ ] Varje ingrediens och substitution har korrekt fyrstatus (`allergens` /
      `allergensVaryByProduct` / `mayContainTraces` / fri) — aldrig "Fri" för generiska
      industriprodukter (korv, buljong, kryddmixar, havreprodukter, m.fl.).
- [ ] `requiresPackageVerification` satt på alla produkter där märket avgör innehållet.
- [ ] Statiska kostflaggor (`glutenfri`/`laktosfri`) endast när BASVÄGEN är helt fri
      (villkorade utfall beräknas av motorn — flagga inte manuellt).
- [ ] EU-14-koder används; `laktos` ersätter aldrig `mjölkprotein`.

### B. Avgörande ingredienser
- [ ] `critical: true` på ingredienser rätten inte rimligen kan lagas utan.
- [ ] `optional: true` på allt som faktiskt kan utelämnas utan att rätten kollapsar.
- [ ] `pantryStaple` rimligt satt (salt, olja, basvaror de flesta hushåll har).

### C. Substitutioner — kulinarisk hållbarhet
- [ ] Varje substitution ger fortfarande en rätt värd att servera (inte bara "tekniskt möjlig").
- [ ] Substitutionens egen fyrstatus är korrekt (grindas vid valtillfället).
- [ ] `note` förklarar det viktigaste avsteget ("lite lösare konsistens", "välj glutenmärkt fri").

### D. Tider — realistiska för en stressad, ovan kock
- [ ] `totalTimeMin`/`activeTimeMin` håller för en förstagångskock med barn i benen —
      inte kokboksoptimism. Timeline-testet kräver ±40 % mot stegens summa.
- [ ] Steg med väntetid har `timerNeeded` och rimlig `durationMin`/`activeMin`-split.
- [ ] Valfria steg (`optional: true` på steget) är garnityr/finlir — aldrig bärande moment.

### E. Barn/vuxen-gren
- [ ] Om `hasChildAdultBranch`: avstickarpunkten ligger där smakvägarna faktiskt skiljer sig,
      grenarna blir klara samtidigt (testas), och barngrenens krydda är verkligt mild.
- [ ] Om ingen gren: rätten är antingen barnneutral eller ärligt märkt via `childFriendly`.

### F. Ekonomi & metadata
- [ ] `costPerPortionMin/Max` rimliga SEK-spann; `estPriceSek` per köpingrediens.
- [ ] `tags`, `effortScore`, `dishLoad`, `robustness`, `spiceLevel`, `aisle` satta med omsorg —
      de styr ranking och inköpslista.

### G. Språk & ton
- [ ] Alla `text`/`voiceCue` på svenska, trygg och konkret ton, utan skuldbeläggning.
- [ ] `voiceCue` fungerar uppläst (kort, entydig, inga parenteser).

## Grandfather-notering

De 24 rätter som var live 2026-07-29 är grandfathrade `VERIFIED` (`verifiedBy: Jonas`) med stöd av
G0-allergengranskningen (rev 3, sign-off 2026-07-29). Allergendelen (sektion A) är därmed
människoverifierad för samtliga; övriga sektioner granskas retroaktivt vid tillfälle och
avvikelser rättas som vanliga seed-ändringar.
