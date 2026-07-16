# Nisse — Allergengranskning av kandidatpoolen (G0, rev 2 — trestatus)

> **Syfte:** Människoverifiering av allergenfälten på samtliga 24 live-rätter INNAN övrigt
> §21–§29-arbete tillämpas på innehållet. Icke förhandlingsbart per §13: en språkmodell får aldrig
> ensam avgöra allergisäkerhet — denna granskning är den mänskliga grinden.
> **Granskare:** Jonas · **Uppskattad tid:** 1–2 h · **Källa:** genererad direkt ur
> `backend/prisma/seed-templates/*.json` efter trestatus-uppdateringen (ingen manuell avskrift).

## Nytt sedan rev 1: trestatus-modellen (implementerad och testad)

Varje ingrediens × allergen har nu **tre möjliga utfall**:

| Utfall | Datafält | Grindens beteende |
|---|---|---|
| **Innehåller** | `allergens[]` | Blockeras för berörd allergiker |
| **Fri** | (saknas i båda listorna) | Ingen blockering |
| **Varierar (märkesberoende)** | `allergensVary[]` | **Blockeras — konservativ regel.** "Troligen fri" är aldrig ett godkännande. |

Den konservativa regeln är kodad i motorn (grind, mall-union, substitutioner) och testad.
Vill man att en varierar-rätt ska nå allergikern är vägen att **villkora receptet** — t.ex. byta
ingrediensraden till "Glutenfria köttbullar" (då blir utfallet Fri) — aldrig att avmarkera.

**Din uppgift per rad:** avgör att varje allergen står i **rätt kolumn** av de tre. Du kan flytta
åt båda hållen: skärp (Varierar → Innehåller), lätta (Varierar → Fri, om förekomsten inte är
märkesberoende i praktiken), eller lägg till det som saknas helt. Rättelser: säg bara vad som ska
flyttas, så uppdaterar jag seed-JSON:en.

En konsistensgrind är också aktiv: en rätt kan inte längre flaggas `glutenfri`/`laktosfri` om någon
obligatorisk ingrediens har allergenet i Innehåller eller Varierar — bygget falerar.

## Rev 1-fynden — nu kodade som Varierar (bekräfta eller skärp)

1. **Köttbullar** (`kottbullar-potatismos`): gluten/ägg/mjölkprotein → **Varierar**;
   `glutenfri`-flaggan **borttagen** (grinden tvingade fram det).
2. **Falukorv** (4 rätter): mjölkprotein → **Varierar**.
3. **Buljonger** (4 rätter): selleri → **Varierar**.
4. **Taco-/fajitakrydda** (3 rätter): gluten → **Varierar**.
5. **Vegokorv/vegobullar** (substitutioner, 5 rätter): gluten → **Varierar** (soja fortsatt Innehåller).
6. **Fryst pyttipanna**: gluten/laktos → **Varierar**; `glutenfri`+`laktosfri`-flaggorna **borttagna**.
7. **Fiskpinnar**: fisk+gluten i Innehåller (bedömdes stabilt över märken — flytta till Varierar om du
   inte håller med).

Konsekvens att känna till: dessa rätter filtreras nu bort för berörda allergiker tills receptet
villkoras (t.ex. egen rad "glutenfri tacokrydda"). Det är avsett — hellre färre förslag än ett osäkert.

## Status

- [ ] **SIGN-OFF: samtliga 24 rätters trestatus-utfall granskade och godkända**
  Namn: ________________ Datum: ________________
- Rättelser begärda (lista slugs + flytt): ________________________________________

---

## Rätt-för-rätt

### Chili sin carne (`chili-sin-carne`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Kidneybönor | — | — | Svarta bönor → fri |
| Krossade tomater | — | — | — |
| Gul lök | — | — | — |
| Vitlök | — | — | — |
| Spiskummin | — | — | — |
| Chilipulver | — | — | — |
| Ris | — | — | — |
| Majs *(valfri)* | — | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** inga · **Kostflaggor:** vegan, vegetarisk, glutenfri, laktosfri

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Falukorv i ugn med ost och tomat (`falukorv-i-ugn`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Falukorv | — | mjölkprotein | Kycklingkorv → fri<br>Vegokorv → soja · *varierar: gluten* |
| Riven ost | laktos, mjölkprotein | — | Laktosfri riven ost → mjölkprotein |
| Ketchup eller tomatpuré | — | — | — |
| Ris | — | — | Pasta → gluten<br>Potatis → fri |
| Gul lök *(valfri)* | — | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** laktos, mjölkprotein · **Kostflaggor:** glutenfri

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Fiskpinnar med potatismos och ärtor (`fiskpinnar-med-mos`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Fiskpinnar | fisk, gluten | — | — |
| Potatis | — | — | Färdigt potatismospulver → laktos |
| Gröna ärtor | — | — | — |
| Mjölk | laktos, mjölkprotein | — | Havredryck → gluten |
| Smör | laktos, mjölkprotein | — | — |
| Citron *(valfri)* | — | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** fisk, gluten, laktos, mjölkprotein · **Kostflaggor:** inga

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Grönsakssoppa med varma mackor (`gronsakssoppa`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Blandade grönsaker (morot, potatis, purjo…) | — | — | Fryst grönsaksblandning → fri |
| Grönsaksbuljong | — | selleri | — |
| Bröd | gluten | — | Glutenfritt bröd → fri |
| Ost *(valfri)* | laktos, mjölkprotein | — | — |
| Grädde *(valfri)* | laktos, mjölkprotein | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** gluten, laktos, mjölkprotein, selleri · **Kostflaggor:** vegetarisk

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Halloumi- och grönsakswok med nudlar (`halloumiwok`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Halloumi | laktos, mjölkprotein | — | — |
| Äggnudlar | gluten, ägg | — | Risnudlar → fri |
| Broccoli | — | — | — |
| Paprika | — | — | — |
| Morot | — | — | — |
| Sojasås | soja, gluten | — | — |
| Sweet chilisås | — | — | — |
| Sesamfrön *(valfri)* | sesam | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** gluten, laktos, mjölkprotein, sesam, soja, ägg · **Kostflaggor:** vegetarisk

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Korv stroganoff med ris (`korv-stroganoff`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Falukorv | — | mjölkprotein | Vegokorv → *varierar: gluten* |
| Gul lök | — | — | — |
| Tomatpuré | — | — | — |
| Vispgrädde | laktos, mjölkprotein | — | Havregrädde → fri |
| Ris | — | — | — |
| Smör | laktos, mjölkprotein | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** laktos, mjölkprotein · **Kostflaggor:** inga

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Krämig korvgryta med pasta (`korvgryta-med-pasta`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Falukorv eller länkkorv | — | mjölkprotein | Kycklingkorv → fri<br>Vegokorv → soja · *varierar: gluten* |
| Pasta | gluten | — | Glutenfri pasta → fri |
| Krossade tomater | — | — | — |
| Matlagningsgrädde | laktos, mjölkprotein | — | Havregrädde → gluten |
| Gul lök | — | — | — |
| Paprikapulver | — | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** gluten, laktos, mjölkprotein · **Kostflaggor:** inga

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Köttbullar med potatismos (`kottbullar-potatismos`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Köttbullar | — | gluten, ägg, mjölkprotein | Kycklingköttbullar → fri<br>Vegobullar → soja · *varierar: gluten* |
| Potatis | — | — | Färdigt potatismospulver → laktos |
| Mjölk | laktos, mjölkprotein | — | Havredryck → gluten |
| Smör | laktos, mjölkprotein | — | — |
| Gurka eller ärtor *(valfri)* | — | — | — |
| Lingonsylt *(valfri)* | — | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** gluten, laktos, mjölkprotein, ägg · **Kostflaggor:** inga

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Krämig kycklingpasta (`kramig-kycklingpasta`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Kycklingfilé | — | — | Kycklinglårfilé → fri |
| Pasta | gluten | — | Glutenfri pasta → fri |
| Matlagningsgrädde | laktos, mjölkprotein | — | Havregrädde → gluten |
| Vitlök | — | — | — |
| Soltorkade tomater *(valfri)* | — | — | — |
| Buljongtärning | — | selleri | — |
| Rapsolja | — | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** gluten, laktos, mjölkprotein, selleri · **Kostflaggor:** inga

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Kycklingfajitas (`kyckling-fajitas`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Kycklingfilé | — | — | Kycklinglårfilé → fri<br>Halloumi → laktos, mjölkprotein |
| Tortillabröd | gluten | — | Majstortilla → fri<br>Ris → fri |
| Paprika | — | — | — |
| Gul lök | — | — | — |
| Fajitakrydda | — | gluten | — |
| Paprikapulver | — | — | — |
| Rapsolja | — | — | — |
| Gräddfil *(valfri)* | laktos, mjölkprotein | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** gluten, laktos, mjölkprotein · **Kostflaggor:** laktosfri

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Kyckling och rotfrukter i ugn (`kyckling-rotfrukter-ugn`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Kycklinglår | — | — | Kycklingfilé → fri |
| Potatis | — | — | Sötpotatis → fri |
| Morot | — | — | Palsternacka → fri |
| Gul lök | — | — | — |
| Rapsolja | — | — | — |
| Timjan eller rosmarin *(valfri)* | — | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** inga · **Kostflaggor:** glutenfri, laktosfri

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Krämig kycklinggryta med ris (`kycklinggryta`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Kycklingfilé | — | — | Quornfilé → ägg |
| Ris | — | — | — |
| Vispgrädde | laktos, mjölkprotein | — | Havregrädde → fri |
| Gul lök | — | — | — |
| Frysta ärtor | — | — | — |
| Kycklingbuljong | — | selleri | — |
| Currypulver | — | — | — |
| Smör | laktos, mjölkprotein | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** laktos, mjölkprotein, selleri · **Kostflaggor:** inga

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Laxpasta med citron och dill (`laxpasta`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Laxfilé | fisk | — | — |
| Pasta | gluten | — | Glutenfri pasta → fri |
| Crème fraiche | laktos, mjölkprotein | — | Havrefraiche → gluten |
| Citron | — | — | — |
| Dill *(valfri)* | — | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** fisk, gluten, laktos, mjölkprotein · **Kostflaggor:** inga

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Vegetarisk linssoppa med kokos (`linssoppa`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Röda linser | — | — | — |
| Kokosmjölk | — | — | — |
| Krossade tomater | — | — | — |
| Gul lök | — | — | — |
| Morot | — | — | — |
| Vitlök | — | — | — |
| Grönsaksbuljong | — | selleri | — |
| Currypulver | — | — | — |
| Olivolja | — | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** selleri · **Kostflaggor:** vegan, vegetarisk, glutenfri, laktosfri

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Pannkakor med spenatsallad (`pannkakor`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Vetemjöl | gluten | — | — |
| Mjölk | laktos, mjölkprotein | — | Havredryck → fri |
| Ägg | ägg | — | — |
| Smör | laktos, mjölkprotein | — | — |
| Babyspenat | — | — | — |
| Gurka | — | — | — |
| Olivolja | — | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** gluten, laktos, mjölkprotein, ägg · **Kostflaggor:** vegetarisk

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Enkel carbonara (`pasta-carbonara`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Spaghetti | gluten | — | Glutenfri spaghetti → fri |
| Bacon | — | — | Kalkonbacon → fri<br>Rökt tofu → soja |
| Äggulor | ägg | — | — |
| Riven parmesan eller västerbotten | laktos, mjölkprotein | — | Vanlig riven ost → laktos, mjölkprotein |
| Svartpeppar | — | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** gluten, laktos, mjölkprotein, ägg · **Kostflaggor:** inga

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Pasta med köttfärssås (`pasta-kottfarssas`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Köttfärs | — | — | Vegofärs → soja |
| Pasta | gluten | — | Glutenfri pasta → fri |
| Krossade tomater | — | — | — |
| Gul lök | — | — | — |
| Morot | — | — | — |
| Tomatpuré | — | — | — |
| Olivolja | — | — | — |
| Vitlök | — | — | — |
| Chiliflakes | — | — | — |
| Parmesan *(valfri)* | laktos, mjölkprotein | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** gluten, laktos, mjölkprotein · **Kostflaggor:** inga

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Pyttipanna med stekt ägg (`pyttipanna`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Pyttipanna (fryst) | — | gluten, laktos | Kokt potatis + korv + lök (rester) → fri |
| Ägg | ägg | — | Rödbetor → fri |
| Smör eller olja | laktos, mjölkprotein | — | Rapsolja → fri |
| Inlagda rödbetor *(valfri)* | — | — | — |
| Ketchup *(valfri)* | — | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** gluten, laktos, mjölkprotein, ägg · **Kostflaggor:** inga

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Tacogryta med ris (`tacogryta`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Köttfärs | — | — | Vegofärs → soja |
| Ris | — | — | — |
| Krossade tomater | — | — | — |
| Majs | — | — | — |
| Tacokrydda | — | gluten | — |
| Gul lök | — | — | — |
| Gräddfil *(valfri)* | laktos, mjölkprotein | — | — |
| Chiliflakes | — | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** gluten, laktos, mjölkprotein · **Kostflaggor:** inga

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Töm kylen-omelett (`tom-kylen-omelett`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Ägg | ägg | — | — |
| Mjölk *(valfri)* | laktos, mjölkprotein | — | Vatten → fri |
| Riven ost *(valfri)* | laktos, mjölkprotein | — | — |
| Paprika *(valfri)* | — | — | Tomat → fri<br>Champinjoner → fri |
| Smör | laktos, mjölkprotein | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** laktos, mjölkprotein, ägg · **Kostflaggor:** vegetarisk, glutenfri

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Krämig tonfiskpasta (`tonfiskpasta`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Pasta | gluten | — | Glutenfri pasta → fri |
| Tonfisk i vatten | fisk | — | Kikärtor → fri |
| Crème fraiche | laktos, mjölkprotein | — | Havrefraiche → gluten |
| Gul lök | — | — | — |
| Majs *(valfri)* | — | — | — |
| Citron *(valfri)* | — | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** fisk, gluten, laktos, mjölkprotein · **Kostflaggor:** inga

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Ugnsbakad lax med klyftpotatis och dillsås (`ugnsbakad-lax`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Laxfilé | fisk | — | — |
| Potatis | — | — | — |
| Gräddfil | laktos, mjölkprotein | — | — |
| Färsk dill | — | — | — |
| Citron | — | — | — |
| Olivolja | — | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** fisk, laktos, mjölkprotein · **Kostflaggor:** glutenfri

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Ugnspannkaka med korv (`ugnspannkaka`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Vetemjöl | gluten | — | — |
| Mjölk | laktos, mjölkprotein | — | — |
| Ägg | ägg | — | — |
| Falukorv *(valfri)* | — | mjölkprotein | Vegokorv → *varierar: gluten* |
| Smör | laktos, mjölkprotein | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** gluten, laktos, mjölkprotein, ägg · **Kostflaggor:** inga

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______

### Vegetariska tacos på bönor (`vegetarisk-tacos`)

| Ingrediens | Innehåller | Varierar (märkesberoende) | Substitutioner (→ innehåller / *varierar*) |
|---|---|---|---|
| Svarta bönor | — | — | Kidneybönor → fri<br>Linser (kokta) → fri |
| Tortillabröd eller tacoskal | gluten | — | Majstortilla → fri |
| Tacokrydda | — | gluten | — |
| Tomatpuré | — | — | — |
| Majs | — | — | — |
| Tomat | — | — | — |
| Gurka *(valfri)* | — | — | — |
| Riven ost *(valfri)* | laktos, mjölkprotein | — | — |

**Konservativ mall-union (innehåller ∪ varierar):** gluten, laktos, mjölkprotein · **Kostflaggor:** vegetarisk, laktosfri

- [ ] Trestatus-utfallen verifierade (rätt allergen i rätt kolumn) &nbsp;&nbsp; Sign: ______ Datum: ______
