# Nisse — Allergengranskning av kandidatpoolen (G0, rev 3 — path-aware fyrstatus)

> **Syfte:** Människoverifiering av allergenfälten på samtliga 24 live-rätter INNAN övrigt
> §21–§29-arbete tillämpas på innehållet (§13: en språkmodell får aldrig ensam avgöra
> allergisäkerhet). **Granskare:** Jonas · **Källa:** genererad direkt ur seed-data via motorns
> egna funktioner (`computeAllergenUnion`, `dietPathStatus`) — tabellerna visar exakt vad grinden gör.

## Rev 2 → rev 3: samtliga strukturella blockerare åtgärdade

**A1 — Path-aware bedömning (implementerad + testad):**
- Endast **obligatoriska** ingredienser kan blockera en rätt (basvägen).
- **Valfria** ingredienser blockerar aldrig — de ger villkor: *"Säker om osten utelämnas eller
  ersätts med laktosfri ost"*. Grönsakssoppan blockeras inte längre för mjölkallergi.
- **Substitutioner** påverkar bara när de väljs (grindas vid valtillfället i räddningsflödet).
- **Kostflaggor beräknas från aktiv väg**: statisk flagga finns bara när basvägen är helt fri;
  annars visas villkoret (fajitas/vegotacos är nu *villkorat* laktosfria, aldrig statiskt).

**A2 — Två sorters osäkerhet separerade (+ spår):** per ingrediens×allergen finns nu fyra utfall:
| Utfall | Fält | Grindens beteende |
|---|---|---|
| **Innehåller** | `allergens` | Blockerar (obligatorisk) / villkor (valfri) |
| **Varierar per produkt** | `allergensVaryByProduct` | Samma — konservativt; löses med annan produkt |
| **Kan innehålla spår** | `mayContainTraces` | Samma — konservativt; löses med spårfri produkt |
| **Förpackningskoll** | `requiresPackageVerification` | Nisse ber användaren kontrollera förpackningens allergeninformation före start (förberedelseskärmen) |

**A3 — Generiska industriprodukter är aldrig "Fri":** korv, köttbullar, vegoprodukter, fiskpinnar,
fryst pytt, mospulver, buljong, krydd-/curryblandningar, havreprodukter, Quorn och majstortillor
har nu `requiresPackageVerification` + relevanta allergener under Varierar. "Fri" används endast
för kategorier som faktiskt är fria.

**A4 — EU-14 komplett:** taxonomin täcker nu alla 14 deklarationspliktiga grupper (+ sulfit, lupin,
kräftdjur, blötdjur). `skaldjur` är legacy-samlingskod som expanderar till kräftdjur ∪ blötdjur.
`laktos` är separat intoleransmarkör och ersätter aldrig `mjölkprotein` (= EU-gruppen mjölk).

**B — Alla 52 konkreta rättelser applicerade**, bl.a.: havreprodukter gluten→Varierar (9 rätter);
hårdost laktos→Fri med mjölkprotein kvar (carbonara, köttfärssås); generisk riven ost
laktos→Varierar (4 rätter); mospulver laktos/mjölkprotein/sulfit Varierar; fiskpinnar
+mjölkprotein Varierar; all korv/vego aldrig Fri (soja flyttad Innehåller→Varierar — alla
vegoprodukter är inte sojabaserade); pytt +mjölkprotein, "Smör eller olja"→"Smör" med Rapsolja
som fri väg; vetetortilla preciserad + majstortilla kräver verifierat glutenfri.

**Tester:** 229/229 gröna, inkl. de två krävda: *en oanvänd substitution blockerar aldrig
basreceptet* och *en valfri allergen ingrediens ger en säker väg med villkor*.

## Så granskar du (per rätt, tre sektioner)

1. **Basväg** — raderna som kan blockera. Stämmer varje allergen och dess kolumn?
2. **Valfria** — kontrollera att "Om den används"-deltat stämmer (dessa blir villkorstexter).
3. **Substitutioner** — kontrollera "Om den väljs"-deltat (grindas vid val).
4. 🔍 = förpackningskoll krävs. Rimligt satt? Saknas någon produkt?
5. Rättelser rapporteras som förut i chatten: "slug: rad → ändring".

## Status

- [x] **SIGN-OFF: samtliga 24 rätters path-aware fyrstatus granskad och godkänd**
  Namn: **Jonas** Datum: **2026-07-29**
- Rättelser begärda: **Inga — rev 3 godkänd utan ändringar.**
- Godkännandet gavs i chatt 2026-07-29 ("Du kan stämpla dokumentet med mitt namn"). Mergen till
  `main` (PR #78) skedde före stämpeln — denna markering är retroaktiv dokumentation av samma beslut.
  Sign-offen låser upp G1 (verification_status + kandidatpool-grind); de 24 rätterna grandfathras
  som VERIFIED med `verifiedAt=2026-07-29`, `verifiedBy=Jonas`.

---

## Rätt-för-rätt

### Chili sin carne (`chili-sin-carne`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** inga allergener
**Kostflaggor:** vegan · vegetarisk · glutenfri (statisk — basvägen fri) · laktosfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Kidneybönor | — | — | — | — |
| Krossade tomater | — | — | — | — |
| Gul lök | — | — | — | — |
| Vitlök | — | — | — | — |
| Spiskummin | — | — | — | — |
| Chilipulver | — | — | — | — |
| Ris | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Majs | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Kidneybönor | Svarta bönor | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Falukorv i ugn med ost och tomat (`falukorv-i-ugn`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** gluten, laktos, mjölkprotein
**Kostflaggor:** laktosfri VILLKORAD: laktosfri om riven ost byts till laktosfri riven ost

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Falukorv | — | mjölkprotein, gluten | — | 🔍 JA |
| Riven ost | mjölkprotein | laktos | — | — |
| Ketchup eller tomatpuré | — | — | — | — |
| Ris | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Gul lök | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Falukorv | Kycklingkorv | + mjölkprotein (varierar), + gluten (varierar) | — | mjölkprotein, gluten | — | 🔍 JA |
| Falukorv | Vegokorv | + gluten (varierar), + soja (varierar), + ägg (varierar) | — | gluten, soja, ägg | — | 🔍 JA |
| Riven ost | Laktosfri riven ost | + mjölkprotein | mjölkprotein | — | — | — |
| Ris | Pasta | + gluten | gluten | — | — | — |
| Ris | Potatis | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Fiskpinnar med potatismos och ärtor (`fiskpinnar-med-mos`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** fisk, gluten, laktos, mjölkprotein
**Kostflaggor:** inga

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Fiskpinnar | fisk, gluten | mjölkprotein | — | 🔍 JA |
| Potatis | — | — | — | — |
| Gröna ärtor | — | — | — | — |
| Mjölk | laktos, mjölkprotein | — | — | — |
| Smör | laktos, mjölkprotein | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Citron | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Potatis | Färdigt potatismospulver | + laktos (varierar), + mjölkprotein (varierar), + sulfit (varierar) | — | laktos, mjölkprotein, sulfit | — | 🔍 JA |
| Mjölk | Havredryck | + gluten (varierar) | — | gluten | — | 🔍 JA |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Grönsakssoppa med varma mackor (`gronsakssoppa`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** gluten, selleri
**Kostflaggor:** vegetarisk · glutenfri VILLKORAD: glutenfri om bröd byts till glutenfritt bröd · laktosfri VILLKORAD: laktosfri om ost utelämnas; laktosfri om grädde utelämnas

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Blandade grönsaker (morot, potatis, purjo…) | — | — | — | — |
| Grönsaksbuljong | — | selleri | — | 🔍 JA |
| Bröd | gluten | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Ost | + mjölkprotein, + laktos (varierar) | mjölkprotein | laktos | — | — |
| Grädde | + laktos, + mjölkprotein | laktos, mjölkprotein | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Blandade grönsaker (morot, potatis, purjo…) | Fryst grönsaksblandning | ingen förändring | — | — | — | — |
| Bröd | Glutenfritt bröd | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Halloumi- och grönsakswok med nudlar (`halloumiwok`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** gluten, laktos, mjölkprotein, soja, ägg
**Kostflaggor:** vegetarisk

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Halloumi | laktos, mjölkprotein | — | — | — |
| Äggnudlar | gluten, ägg | — | — | — |
| Broccoli | — | — | — | — |
| Paprika | — | — | — | — |
| Morot | — | — | — | — |
| Sojasås | soja, gluten | — | — | — |
| Sweet chilisås | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Sesamfrön | + sesam | sesam | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Äggnudlar | Risnudlar | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Korv stroganoff med ris (`korv-stroganoff`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** gluten, laktos, mjölkprotein
**Kostflaggor:** inga

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Falukorv | — | mjölkprotein, gluten | — | 🔍 JA |
| Gul lök | — | — | — | — |
| Tomatpuré | — | — | — | — |
| Vispgrädde | laktos, mjölkprotein | — | — | — |
| Ris | — | — | — | — |
| Smör | laktos, mjölkprotein | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Falukorv | Vegokorv | + gluten (varierar), + soja (varierar), + ägg (varierar) | — | gluten, soja, ägg | — | 🔍 JA |
| Vispgrädde | Havregrädde | + gluten (varierar) | — | gluten | — | 🔍 JA |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Krämig korvgryta med pasta (`korvgryta-med-pasta`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** gluten, laktos, mjölkprotein
**Kostflaggor:** laktosfri VILLKORAD: laktosfri om matlagningsgrädde byts till havregrädde

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Falukorv eller länkkorv | — | mjölkprotein, gluten | — | 🔍 JA |
| Pasta | gluten | — | — | — |
| Krossade tomater | — | — | — | — |
| Matlagningsgrädde | laktos, mjölkprotein | — | — | — |
| Gul lök | — | — | — | — |
| Paprikapulver | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Falukorv eller länkkorv | Kycklingkorv | + mjölkprotein (varierar), + gluten (varierar) | — | mjölkprotein, gluten | — | 🔍 JA |
| Falukorv eller länkkorv | Vegokorv | + gluten (varierar), + soja (varierar), + ägg (varierar) | — | gluten, soja, ägg | — | 🔍 JA |
| Pasta | Glutenfri pasta | ingen förändring | — | — | — | — |
| Matlagningsgrädde | Havregrädde | + gluten (varierar) | — | gluten | — | 🔍 JA |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Köttbullar med potatismos (`kottbullar-potatismos`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** gluten, laktos, mjölkprotein, ägg
**Kostflaggor:** inga

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Köttbullar | — | gluten, ägg, mjölkprotein | — | 🔍 JA |
| Potatis | — | — | — | — |
| Mjölk | laktos, mjölkprotein | — | — | — |
| Smör | laktos, mjölkprotein | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Gurka eller ärtor | ingen förändring | — | — | — | — |
| Lingonsylt | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Köttbullar | Kycklingköttbullar | + mjölkprotein (varierar), + gluten (varierar) | — | mjölkprotein, gluten | — | 🔍 JA |
| Köttbullar | Vegobullar | + gluten (varierar), + soja (varierar), + ägg (varierar) | — | gluten, soja, ägg | — | 🔍 JA |
| Potatis | Färdigt potatismospulver | + laktos (varierar), + mjölkprotein (varierar), + sulfit (varierar) | — | laktos, mjölkprotein, sulfit | — | 🔍 JA |
| Mjölk | Havredryck | + gluten (varierar) | — | gluten | — | 🔍 JA |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Krämig kycklingpasta (`kramig-kycklingpasta`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** gluten, laktos, mjölkprotein, selleri
**Kostflaggor:** glutenfri VILLKORAD: glutenfri om pasta byts till glutenfri pasta · laktosfri VILLKORAD: laktosfri om matlagningsgrädde byts till havregrädde

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Kycklingfilé | — | — | — | — |
| Pasta | gluten | — | — | — |
| Matlagningsgrädde | laktos, mjölkprotein | — | — | — |
| Vitlök | — | — | — | — |
| Buljongtärning | — | selleri | — | 🔍 JA |
| Rapsolja | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Soltorkade tomater | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Kycklingfilé | Kycklinglårfilé | ingen förändring | — | — | — | — |
| Pasta | Glutenfri pasta | ingen förändring | — | — | — | — |
| Matlagningsgrädde | Havregrädde | + gluten (varierar) | — | gluten | — | 🔍 JA |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Kycklingfajitas (`kyckling-fajitas`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** gluten
**Kostflaggor:** laktosfri VILLKORAD: laktosfri om gräddfil utelämnas

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Kycklingfilé | — | — | — | — |
| Tortillabröd | gluten | — | — | — |
| Paprika | — | — | — | — |
| Gul lök | — | — | — | — |
| Fajitakrydda | — | gluten | — | 🔍 JA |
| Paprikapulver | — | — | — | — |
| Rapsolja | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Gräddfil | + laktos, + mjölkprotein | laktos, mjölkprotein | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Kycklingfilé | Kycklinglårfilé | ingen förändring | — | — | — | — |
| Kycklingfilé | Halloumi | + laktos, + mjölkprotein | laktos, mjölkprotein | — | — | — |
| Tortillabröd | Majstortilla | + gluten (varierar) | — | gluten | — | 🔍 JA |
| Tortillabröd | Ris | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Kyckling och rotfrukter i ugn (`kyckling-rotfrukter-ugn`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** inga allergener
**Kostflaggor:** glutenfri (statisk — basvägen fri) · laktosfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Kycklinglår | — | — | — | — |
| Potatis | — | — | — | — |
| Morot | — | — | — | — |
| Gul lök | — | — | — | — |
| Rapsolja | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Timjan eller rosmarin | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Kycklinglår | Kycklingfilé | ingen förändring | — | — | — | — |
| Potatis | Sötpotatis | ingen förändring | — | — | — | — |
| Morot | Palsternacka | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Krämig kycklinggryta med ris (`kycklinggryta`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** laktos, mjölkprotein, selleri
**Kostflaggor:** inga

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Kycklingfilé | — | — | — | — |
| Ris | — | — | — | — |
| Vispgrädde | laktos, mjölkprotein | — | — | — |
| Gul lök | — | — | — | — |
| Frysta ärtor | — | — | — | — |
| Kycklingbuljong | — | selleri | — | 🔍 JA |
| Currypulver | — | — | — | 🔍 JA |
| Smör | laktos, mjölkprotein | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Kycklingfilé | Quornfilé | + ägg | ägg | — | — | — |
| Vispgrädde | Havregrädde | + gluten (varierar) | — | gluten | — | 🔍 JA |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Laxpasta med citron och dill (`laxpasta`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** fisk, gluten, laktos, mjölkprotein
**Kostflaggor:** glutenfri VILLKORAD: glutenfri om pasta byts till glutenfri pasta · laktosfri VILLKORAD: laktosfri om crème fraiche byts till havrefraiche

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Laxfilé | fisk | — | — | — |
| Pasta | gluten | — | — | — |
| Crème fraiche | laktos, mjölkprotein | — | — | — |
| Citron | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Dill | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Pasta | Glutenfri pasta | ingen förändring | — | — | — | — |
| Crème fraiche | Havrefraiche | + gluten (varierar) | — | gluten | — | 🔍 JA |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Vegetarisk linssoppa med kokos (`linssoppa`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** selleri
**Kostflaggor:** vegan · vegetarisk · glutenfri (statisk — basvägen fri) · laktosfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Röda linser | — | — | — | — |
| Kokosmjölk | — | — | — | — |
| Krossade tomater | — | — | — | — |
| Gul lök | — | — | — | — |
| Morot | — | — | — | — |
| Vitlök | — | — | — | — |
| Grönsaksbuljong | — | selleri | — | 🔍 JA |
| Currypulver | — | — | — | 🔍 JA |
| Olivolja | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Pannkakor med spenatsallad (`pannkakor`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** gluten, laktos, mjölkprotein, ägg
**Kostflaggor:** vegetarisk

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Vetemjöl | gluten | — | — | — |
| Mjölk | laktos, mjölkprotein | — | — | — |
| Ägg | ägg | — | — | — |
| Smör | laktos, mjölkprotein | — | — | — |
| Babyspenat | — | — | — | — |
| Gurka | — | — | — | — |
| Olivolja | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Mjölk | Havredryck | + gluten (varierar) | — | gluten | — | 🔍 JA |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Enkel carbonara (`pasta-carbonara`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** gluten, mjölkprotein, ägg
**Kostflaggor:** glutenfri VILLKORAD: glutenfri om spaghetti byts till glutenfri spaghetti

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Spaghetti | gluten | — | — | — |
| Bacon | — | — | — | — |
| Äggulor | ägg | — | — | — |
| Riven parmesan eller västerbotten | mjölkprotein | — | — | — |
| Svartpeppar | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Spaghetti | Glutenfri spaghetti | ingen förändring | — | — | — | — |
| Bacon | Kalkonbacon | ingen förändring | — | — | — | — |
| Bacon | Rökt tofu | + soja | soja | — | — | — |
| Riven parmesan eller västerbotten | Vanlig riven ost | + mjölkprotein, + laktos (varierar) | mjölkprotein | laktos | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Pasta med köttfärssås (`pasta-kottfarssas`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** gluten
**Kostflaggor:** glutenfri VILLKORAD: glutenfri om pasta byts till glutenfri pasta

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Köttfärs | — | — | — | — |
| Pasta | gluten | — | — | — |
| Krossade tomater | — | — | — | — |
| Gul lök | — | — | — | — |
| Morot | — | — | — | — |
| Tomatpuré | — | — | — | — |
| Olivolja | — | — | — | — |
| Vitlök | — | — | — | — |
| Chiliflakes | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Parmesan | + mjölkprotein | mjölkprotein | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Köttfärs | Vegofärs | + soja (varierar), + gluten (varierar), + ägg (varierar) | — | soja, gluten, ägg | — | 🔍 JA |
| Pasta | Glutenfri pasta | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Pyttipanna med stekt ägg (`pyttipanna`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** gluten, laktos, mjölkprotein, ägg
**Kostflaggor:** laktosfri VILLKORAD: laktosfri om pyttipanna (fryst) byts till kokt potatis + korv + lök (rester); laktosfri om smör byts till rapsolja

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Pyttipanna (fryst) | — | gluten, laktos, mjölkprotein | — | 🔍 JA |
| Ägg | ägg | — | — | — |
| Smör | laktos, mjölkprotein | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Inlagda rödbetor | ingen förändring | — | — | — | — |
| Ketchup | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Pyttipanna (fryst) | Kokt potatis + korv + lök (rester) | + mjölkprotein (varierar), + gluten (varierar) | — | mjölkprotein, gluten | — | 🔍 JA |
| Ägg | Rödbetor | ingen förändring | — | — | — | — |
| Smör | Rapsolja | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Tacogryta med ris (`tacogryta`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** gluten
**Kostflaggor:** laktosfri VILLKORAD: laktosfri om gräddfil utelämnas

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Köttfärs | — | — | — | — |
| Ris | — | — | — | — |
| Krossade tomater | — | — | — | — |
| Majs | — | — | — | — |
| Tacokrydda | — | gluten | — | 🔍 JA |
| Gul lök | — | — | — | — |
| Chiliflakes | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Gräddfil | + laktos, + mjölkprotein | laktos, mjölkprotein | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Köttfärs | Vegofärs | + soja (varierar), + gluten (varierar), + ägg (varierar) | — | soja, gluten, ägg | — | 🔍 JA |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Töm kylen-omelett (`tom-kylen-omelett`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** laktos, mjölkprotein, ägg
**Kostflaggor:** vegetarisk · glutenfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Ägg | ägg | — | — | — |
| Smör | laktos, mjölkprotein | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Mjölk | + laktos, + mjölkprotein | laktos, mjölkprotein | — | — | — |
| Riven ost | + mjölkprotein, + laktos (varierar) | mjölkprotein | laktos | — | — |
| Paprika | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Mjölk | Vatten | ingen förändring | — | — | — | — |
| Paprika | Tomat | ingen förändring | — | — | — | — |
| Paprika | Champinjoner | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Krämig tonfiskpasta (`tonfiskpasta`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** fisk, gluten, laktos, mjölkprotein
**Kostflaggor:** glutenfri VILLKORAD: glutenfri om pasta byts till glutenfri pasta · laktosfri VILLKORAD: laktosfri om crème fraiche byts till havrefraiche

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Pasta | gluten | — | — | — |
| Tonfisk i vatten | fisk | — | — | — |
| Crème fraiche | laktos, mjölkprotein | — | — | — |
| Gul lök | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Majs | ingen förändring | — | — | — | — |
| Citron | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Pasta | Glutenfri pasta | ingen förändring | — | — | — | — |
| Tonfisk i vatten | Kikärtor | ingen förändring | — | — | — | — |
| Crème fraiche | Havrefraiche | + gluten (varierar) | — | gluten | — | 🔍 JA |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Ugnsbakad lax med klyftpotatis och dillsås (`ugnsbakad-lax`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** fisk, laktos, mjölkprotein
**Kostflaggor:** glutenfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Laxfilé | fisk | — | — | — |
| Potatis | — | — | — | — |
| Gräddfil | laktos, mjölkprotein | — | — | — |
| Färsk dill | — | — | — | — |
| Citron | — | — | — | — |
| Olivolja | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Ugnspannkaka med korv (`ugnspannkaka`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** gluten, laktos, mjölkprotein, ägg
**Kostflaggor:** inga

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Vetemjöl | gluten | — | — | — |
| Mjölk | laktos, mjölkprotein | — | — | — |
| Ägg | ägg | — | — | — |
| Smör | laktos, mjölkprotein | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Falukorv | + mjölkprotein (varierar), + gluten (varierar) | — | mjölkprotein, gluten | — | 🔍 JA |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Falukorv | Vegokorv | + gluten (varierar), + soja (varierar), + ägg (varierar) | — | gluten, soja, ägg | — | 🔍 JA |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

### Vegetariska tacos på bönor (`vegetarisk-tacos`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** gluten
**Kostflaggor:** vegetarisk · laktosfri VILLKORAD: laktosfri om riven ost utelämnas

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Svarta bönor | — | — | — | — |
| Vetetortilla eller tacoskal av vete | gluten | — | — | — |
| Tacokrydda | — | gluten | — | 🔍 JA |
| Tomatpuré | — | — | — | — |
| Majs | — | — | — | — |
| Tomat | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Gurka | ingen förändring | — | — | — | — |
| Riven ost | + mjölkprotein, + laktos (varierar) | mjölkprotein | laktos | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Svarta bönor | Kidneybönor | ingen förändring | — | — | — | — |
| Svarta bönor | Linser (kokta) | ingen förändring | — | — | — | — |
| Vetetortilla eller tacoskal av vete | Majstortilla | + gluten (varierar) | — | gluten | — | 🔍 JA |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______
