// ============================================
// G0 review generator — the 12 DRAFT dishes
// ============================================
// Emits docs/NISSE_ALLERGEN_REVIEW_DRAFT12.md in the same rev-3 path-aware
// four-status format as the signed-off 24-dish review, generated DIRECTLY
// from the seed JSON via the engine's own functions so the tables show
// exactly what the hard gate does. No AI, no guessing.
//
// Run from backend/:  node scripts/gen-g0-draft12.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { templateSchema } from '../src/services/nisse/schemas/templateSchema.js';
import { collectTemplateAllergens, dietPathStatus } from '../src/services/nisse/engine/allergenGate.js';
import { ALLERGEN_TAXONOMY } from '../src/services/nisse/engine/allergens.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(__dirname, '..', 'prisma', 'seed-templates');
const OUT = path.join(__dirname, '..', '..', 'docs', 'NISSE_ALLERGEN_REVIEW_DRAFT12.md');

// The 12 dishes currently verification_status = DRAFT in prod (2026-07-30).
const DRAFT_SLUGS = [
  'dahl-med-ris', 'kikartscurry', 'kycklingbowl-med-ris', 'laxwok-med-ris',
  'snabb-aggpytt', 'snabb-kycklingris', 'stekt-lax-med-potatis',
  'tomatsoppa-med-vita-bonor', 'tonfisksallad-med-bonor', 'torskgryta-med-tomat',
  'ugnsbakad-sotpotatis-med-bonrora', 'ugnsrostade-gronsaker-med-kikartor',
];

const LABEL = Object.fromEntries(ALLERGEN_TAXONOMY.map((a) => [a.code, a.label || a.code]));
const codeList = (codes) =>
  codes && codes.length ? [...new Set(codes)].map((c) => LABEL[c] || c).join(', ') : '—';
const pkg = (ing) => (ing.requiresPackageVerification ? '🔍 ja' : '—');

function loadTemplate(slug) {
  const raw = JSON.parse(readFileSync(path.join(SEED_DIR, `${slug}.json`), 'utf8'));
  const parsed = templateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${slug}: schema invalid — ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
  }
  return parsed.data;
}

function dietFlagLine(tpl) {
  const parts = [];
  for (const f of tpl.dietaryFlags || []) {
    if (f !== 'glutenfri' && f !== 'laktosfri') parts.push(f);
  }
  for (const r of ['glutenfri', 'laktosfri']) {
    const st = dietPathStatus(tpl, r);
    const isStatic = (tpl.dietaryFlags || []).includes(r);
    if (st.status === 'safe' && isStatic) parts.push(`${r} (statisk — basvägen fri)`);
    else if (st.status === 'safe') parts.push(`${r} (basvägen fri)`);
    else if (st.status === 'conditional') parts.push(`${r} (villkorad: ${st.conditions.join('; ')})`);
    // unsafe → not free, omit
  }
  return parts.length ? parts.join(' · ') : '—';
}

function requiredRows(tpl) {
  const rows = tpl.ingredients.filter((i) => !i.optional);
  const body = rows
    .map((i) => `| ${i.name} | ${codeList(i.allergens)} | ${codeList(i.allergensVaryByProduct)} | ${codeList(i.mayContainTraces)} | ${pkg(i)} |`)
    .join('\n');
  return `**Obligatoriska ingredienser**\n\n| Ingrediens | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |\n|---|---|---|---|---|\n${body}`;
}

function optionalRows(tpl) {
  const rows = tpl.ingredients.filter((i) => i.optional);
  if (!rows.length) return '**Valfria ingredienser:** inga';
  const delta = (i) => {
    const codes = [...(i.allergens || []), ...(i.allergensVaryByProduct || []), ...(i.mayContainTraces || [])];
    return codes.length ? `+ ${codeList(codes)} om den används` : 'ingen förändring';
  };
  const body = rows
    .map((i) => `| ${i.name} | ${delta(i)} | ${codeList(i.allergens)} | ${codeList(i.allergensVaryByProduct)} | ${codeList(i.mayContainTraces)} | ${pkg(i)} |`)
    .join('\n');
  return `**Valfria ingredienser** *(blockerar aldrig basreceptet — ger villkor)*\n\n| Ingrediens | Om den används | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |\n|---|---|---|---|---|---|\n${body}`;
}

function subRows(tpl) {
  const rows = [];
  for (const ing of tpl.ingredients) {
    for (const s of ing.substitutions || []) rows.push({ from: ing.name, s });
  }
  if (!rows.length) return '**Substitutioner:** inga';
  const delta = (s) => {
    const codes = [...(s.allergens || []), ...(s.allergensVaryByProduct || []), ...(s.mayContainTraces || [])];
    return codes.length ? `+ ${codeList(codes)} om den väljs` : 'ingen förändring';
  };
  const body = rows
    .map(({ from, s }) => `| ${from} | ${s.name} | ${delta(s)} | ${codeList(s.allergens)} | ${codeList(s.allergensVaryByProduct)} | ${codeList(s.mayContainTraces)} | ${pkg(s)} |`)
    .join('\n');
  return `**Substitutioner** *(påverkar bara när de väljs — grindas vid valtillfället)*\n\n| Ersätter | Substitution | Om den väljs | Innehåller | Varierar per produkt | Kan innehålla spår | Förpackningskoll |\n|---|---|---|---|---|---|---|\n${body}`;
}

function dishBlock(tpl) {
  const base = collectTemplateAllergens(tpl);
  const baseLine = base.size
    ? [...base.keys()].map((c) => LABEL[c] || c).join(', ')
    : 'inga allergener';
  return [
    `### ${tpl.title} (\`${tpl.slug}\`)`,
    '',
    `**Basväg (obligatoriska ingredienser) — det som kan blockera:** ${baseLine}`,
    `**Kostflaggor:** ${dietFlagLine(tpl)}`,
    '',
    requiredRows(tpl),
    '',
    optionalRows(tpl),
    '',
    subRows(tpl),
    '',
    '- [ ] Fyrstatus + väguppdelning verifierad &nbsp;&nbsp; Sign: ______ Datum: ______',
    '',
  ].join('\n');
}

const templates = DRAFT_SLUGS.map(loadTemplate);

// Sanity: make sure we didn't accidentally pull a VERIFIED dish.
const pkgCount = templates.filter((t) =>
  t.ingredients.some((i) => i.requiresPackageVerification || (i.substitutions || []).some((s) => s.requiresPackageVerification))
).length;

const header = `# Nisse — Allergengranskning av de 12 DRAFT-rätterna (G0, rev 3-format)

> **Syfte:** Människoverifiering (§13) av allergenfälten på de 12 rätter som seedades som **DRAFT**
> och därför INTE ännu ingår i den verifierade kandidatpoolen. Sign-off flippar dem till VERIFIED
> och låser upp verified-pool-täckningen som blir **blockerande i CI från 2026-08-01**.
> **Granskare:** Jonas · **Källa:** genererad direkt ur seed-data via motorns egna funktioner
> (\`collectTemplateAllergens\`, \`dietPathStatus\`) — tabellerna visar exakt vad grinden gör.
> **Modell:** path-aware fyrstatus (identisk med de 24 redan godkända rätterna, rev 3).

## Så granskar du (per rätt)

1. **Basväg** — de obligatoriska raderna är de enda som kan blockera. Stämmer varje allergen + kolumn?
2. **Valfria** — "Om den används"-deltat blir villkorstext; blockerar aldrig basreceptet.
3. **Substitutioner** — "Om den väljs"-deltat grindas först vid val (räddningsflödet).
4. 🔍 = förpackningskoll krävs (generisk industriprodukt — aldrig "Fri"). Rimligt satt?
5. **Fyra utfall** per allergen: Innehåller / Varierar per produkt / Kan innehålla spår / Förpackningskoll —
   alla tre icke-fria blockerar konservativt berörd allergiker, men förklaras/löses olika.
6. Rättelser rapporteras i chatt som förut: \`slug: rad → ändring\` (t.ex. \`laxwok-med-ris: Sojasås → gluten Varierar→Innehåller\`).

## Status

- [ ] **SIGN-OFF: samtliga 12 DRAFT-rätters path-aware fyrstatus granskad och godkänd**
  Namn: ______________ Datum: ______________
- Rättelser begärda: ______________
- Vid godkänt: rätterna flippas \`DRAFT → VERIFIED\` (\`verified_by='Jonas'\`) och verified-pool-täckningen
  aktiveras. Ingen seed- eller DB-ändring görs innan sign-off.

**Antal rätter:** ${templates.length} · **varav med förpackningskoll-ingrediens:** ${pkgCount}

---

`;

writeFileSync(OUT, header + templates.map(dishBlock).join('\n---\n\n') + '\n');
console.log(`✓ Skrev ${OUT} (${templates.length} rätter)`);
