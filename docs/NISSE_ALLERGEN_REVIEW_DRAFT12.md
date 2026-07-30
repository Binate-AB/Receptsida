# Nisse — Allergengranskning av de 12 DRAFT-rätterna (G0, rev 3-format)

> **Syfte:** Människoverifiering (§13) av allergenfälten på de 12 rätter som seedades som **DRAFT**
> och därför INTE ännu ingår i den verifierade kandidatpoolen. Sign-off flippar dem till VERIFIED
> och låser upp verified-pool-täckningen som blir **blockerande i CI från 2026-08-01**.
> **Granskare:** Jonas · **Källa:** genererad direkt ur seed-data via motorns egna funktioner
> (`collectTemplateAllergens`, `dietPathStatus`) — tabellerna visar exakt vad grinden gör.
> **Modell:** path-aware fyrstatus (identisk med de 24 redan godkända rätterna, rev 3).

## Så granskar du (per rätt)

1. **Basväg** — de obligatoriska raderna är de enda som kan blockera. Stämmer varje allergen + kolumn?
2. **Valfria** — "Om den används"-deltat blir villkorstext; blockerar aldrig basreceptet.
3. **Substitutioner** — "Om den väljs"-deltat grindas först vid val (räddningsflödet).
4. 🔍 = förpackningskoll krävs (generisk industriprodukt — aldrig "Fri"). Rimligt satt?
5. **Fyra utfall** per allergen: Innehåller / Varierar per produkt / Kan innehålla spår / Förpackningskoll —
   alla tre icke-fria blockerar konservativt berörd allergiker, men förklaras/löses olika.
6. Rättelser rapporteras i chatt som förut: `slug: rad → ändring` (t.ex. `laxwok-med-ris: Sojasås → gluten Varierar→Innehåller`).

## Status

- [ ] **SIGN-OFF: samtliga 12 DRAFT-rätters path-aware fyrstatus granskad och godkänd**
  Namn: ______________ Datum: ______________
- Rättelser begärda: ______________
- Vid godkänt: rätterna flippas `DRAFT → VERIFIED` (`verified_by='Jonas'`) och verified-pool-täckningen
  aktiveras. Ingen seed- eller DB-ändring görs innan sign-off.

**Antal rätter:** 12 · **varav med förpackningskoll-ingrediens:** 0

---

### Dahl med ris (`dahl-med-ris`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** inga allergener
**Kostflaggor:** vegan · vegetarisk · glutenfri (statisk — basvägen fri) · laktosfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Röda linser | — | — | — | — |
| Kokosmjölk | — | — | — | — |
| Passerade tomater | — | — | — | — |
| Ris | — | — | — | — |
| Gul lök | — | — | — | — |
| Vitlök | — | — | — | — |
| Gurkmeja | — | — | — | — |
| Spiskummin | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Ingefära | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Röda linser | Gula ärtor (kokta) | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

---

### Snabb kikärtscurry (`kikartscurry`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** inga allergener
**Kostflaggor:** vegan · vegetarisk · glutenfri (statisk — basvägen fri) · laktosfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Kikärtor | — | — | — | — |
| Kokosmjölk | — | — | — | — |
| Ris | — | — | — | — |
| Gul lök | — | — | — | — |
| Vitlök | — | — | — | — |
| Gurkmeja | — | — | — | — |
| Spiskummin | — | — | — | — |

**Valfria ingredienser:** inga

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Kikärtor | Vita bönor | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

---

### Kycklingbowl med ris (`kycklingbowl-med-ris`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** inga allergener
**Kostflaggor:** glutenfri (statisk — basvägen fri) · laktosfri (villkorad: laktosfri om matyoghurt utelämnas eller ersätts med laktosfri matyoghurt)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Kycklingfilé | — | — | — | — |
| Ris | — | — | — | — |
| Majs | — | — | — | — |
| Gurka | — | — | — | — |
| Morot | — | — | — | — |
| Rapsolja | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Matyoghurt | + Laktos (intolerans), Mjölk (protein) om den används | Laktos (intolerans), Mjölk (protein) | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Kycklingfilé | Kikärtor | ingen förändring | — | — | — | — |
| Matyoghurt | Laktosfri matyoghurt | + Mjölk (protein) om den väljs | Mjölk (protein) | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

---

### Laxwok med ris (`laxwok-med-ris`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** Fisk
**Kostflaggor:** glutenfri (statisk — basvägen fri) · laktosfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Laxfilé | Fisk | — | — | — |
| Frysta wokgrönsaker | — | — | — | — |
| Färdigkokt ris | — | — | — | — |
| Vitlök | — | — | — | — |
| Rapsolja | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Citron | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Laxfilé | Torskfilé | + Fisk om den väljs | Fisk | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

---

### Snabb äggpytt med ärtor (`snabb-aggpytt`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** Ägg
**Kostflaggor:** vegetarisk · glutenfri (statisk — basvägen fri) · laktosfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Färdigkokt potatis | — | — | — | — |
| Ägg | Ägg | — | — | — |
| Gul lök | — | — | — | — |
| Frysta ärtor | — | — | — | — |
| Rapsolja | — | — | — | — |

**Valfria ingredienser:** inga

**Substitutioner:** inga

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

---

### Snabb kycklingris (`snabb-kycklingris`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** inga allergener
**Kostflaggor:** glutenfri (statisk — basvägen fri) · laktosfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Kycklingfilé | — | — | — | — |
| Färdigkokt ris | — | — | — | — |
| Majs | — | — | — | — |
| Paprika | — | — | — | — |
| Paprikapulver | — | — | — | — |
| Rapsolja | — | — | — | — |

**Valfria ingredienser:** inga

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Kycklingfilé | Kycklinglårfilé | ingen förändring | — | — | — | — |
| Kycklingfilé | Kikärtor | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

---

### Stekt lax med kokt potatis (`stekt-lax-med-potatis`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** Fisk
**Kostflaggor:** glutenfri (statisk — basvägen fri) · laktosfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Laxfilé | Fisk | — | — | — |
| Potatis | — | — | — | — |
| Frysta ärtor | — | — | — | — |
| Citron | — | — | — | — |
| Rapsolja | — | — | — | — |

**Valfria ingredienser:** inga

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Laxfilé | Torskfilé | + Fisk om den väljs | Fisk | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

---

### Tomatsoppa med vita bönor (`tomatsoppa-med-vita-bonor`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** inga allergener
**Kostflaggor:** vegan · vegetarisk · glutenfri (statisk — basvägen fri) · laktosfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Passerade tomater | — | — | — | — |
| Vita bönor | — | — | — | — |
| Kokosgrädde | — | — | — | — |
| Gul lök | — | — | — | — |
| Vitlök | — | — | — | — |
| Olivolja | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Basilika | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Vita bönor | Kikärtor | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

---

### Tonfisksallad med vita bönor (`tonfisksallad-med-bonor`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** Fisk
**Kostflaggor:** glutenfri (statisk — basvägen fri) · laktosfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Tonfisk i vatten | Fisk | — | — | — |
| Vita bönor | — | — | — | — |
| Tomat | — | — | — | — |
| Citron | — | — | — | — |
| Olivolja | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Gurka | ingen förändring | — | — | — | — |
| Rödlök | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Tonfisk i vatten | Kikärtor | ingen förändring | — | — | — | — |
| Vita bönor | Kidneybönor | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

---

### Torskgryta med tomat och potatis (`torskgryta-med-tomat`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** Fisk
**Kostflaggor:** glutenfri (statisk — basvägen fri) · laktosfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Torskfilé | Fisk | — | — | — |
| Passerade tomater | — | — | — | — |
| Potatis | — | — | — | — |
| Gul lök | — | — | — | — |
| Vitlök | — | — | — | — |
| Olivolja | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Oliver | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Torskfilé | Laxfilé | + Fisk om den väljs | Fisk | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

---

### Ugnsbakad sötpotatis med bönröra (`ugnsbakad-sotpotatis-med-bonrora`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** inga allergener
**Kostflaggor:** vegan · vegetarisk · glutenfri (statisk — basvägen fri) · laktosfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Sötpotatis | — | — | — | — |
| Svarta bönor | — | — | — | — |
| Majs | — | — | — | — |
| Lime | — | — | — | — |
| Olivolja | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Rödlök | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Sötpotatis | Potatis | ingen förändring | — | — | — | — |
| Svarta bönor | Kidneybönor | ingen förändring | — | — | — | — |
| Lime | Citron | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

---

### Ugnsrostade grönsaker med kikärtor (`ugnsrostade-gronsaker-med-kikartor`)

**Basväg (obligatoriska ingredienser) — det som kan blockera:** inga allergener
**Kostflaggor:** vegan · vegetarisk · glutenfri (statisk — basvägen fri) · laktosfri (statisk — basvägen fri)

**Obligatoriska ingredienser**

| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|
| Morot | — | — | — | — |
| Potatis | — | — | — | — |
| Paprika | — | — | — | — |
| Kikärtor | — | — | — | — |
| Citron | — | — | — | — |
| Olivolja | — | — | — | — |

**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*

| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|
| Rödlök | ingen förändring | — | — | — | — |

**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*

| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |
|---|---|---|---|---|---|---|
| Morot | Palsternacka | ingen förändring | — | — | — | — |
| Kikärtor | Vita bönor | ingen förändring | — | — | — | — |

- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______

