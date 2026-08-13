// ============================================
// G0 CHECKLIST generator — the 12 DRAFT dishes
// ============================================
// A review-friendly VIEW of the same data as NISSE_ALLERGEN_REVIEW_DRAFT12.md:
// same seed source, same engine functions (ingredientStatuses, ALLERGEN_TAXONOMY,
// formatAmount) — no parallel truth. Written for a human with food knowledge but
// NO knowledge of the codebase: plain Swedish, no code terms, no slugs.
//
// Emits:
//   docs/NISSE_ALLERGEN_CHECKLIST_DRAFT12.md   (committed artifact)
//   <scratchdir>/checklist-draft12.html        (print view → PDF via LibreOffice)
//
// Run from backend/:  node scripts/gen-g0-checklist-draft12.mjs [htmlOutPath]

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { templateSchema } from '../src/services/nisse/schemas/templateSchema.js';
import { ingredientStatuses } from '../src/services/nisse/engine/allergenGate.js';
import { ALLERGEN_TAXONOMY } from '../src/services/nisse/engine/allergens.js';
import { formatAmount } from '../src/services/nisse/engine/units.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(__dirname, '..', 'prisma', 'seed-templates');
const MD_OUT = path.join(__dirname, '..', '..', 'docs', 'NISSE_ALLERGEN_CHECKLIST_DRAFT12.md');
const HTML_OUT = process.argv[2] || path.join(__dirname, 'checklist-draft12.html');

const DRAFT_SLUGS = [
  'dahl-med-ris', 'kikartscurry', 'kycklingbowl-med-ris', 'laxwok-med-ris',
  'snabb-aggpytt', 'snabb-kycklingris', 'stekt-lax-med-potatis',
  'tomatsoppa-med-vita-bonor', 'tonfisksallad-med-bonor', 'torskgryta-med-tomat',
  'ugnsbakad-sotpotatis-med-bonrora', 'ugnsrostade-gronsaker-med-kikartor',
];

let COMMIT = 'okänd';
try { COMMIT = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim(); } catch { /* not a repo */ }

// The 14 EU declaration groups (in plain Swedish). laktos/skaldjur are NOT
// among them — laktos is a Swedish intolerance marker, skaldjur an umbrella.
const EU14 = new Set(['gluten', 'kräftdjur', 'ägg', 'fisk', 'jordnöt', 'soja', 'mjölkprotein', 'nötter', 'selleri', 'senap', 'sesam', 'sulfit', 'lupin', 'blötdjur']);
const EU14_LABEL = {
  gluten: 'Gluten (spannmål)', kräftdjur: 'Kräftdjur', ägg: 'Ägg', fisk: 'Fisk',
  jordnöt: 'Jordnötter', soja: 'Soja', mjölkprotein: 'Mjölk', nötter: 'Nötter (trädnötter)',
  selleri: 'Selleri', senap: 'Senap', sesam: 'Sesam', sulfit: 'Svaveldioxid/sulfit',
  lupin: 'Lupin', blötdjur: 'Blötdjur',
};
const LABEL = Object.fromEntries(ALLERGEN_TAXONOMY.map((a) => [a.code, a.label || a.code]));

// Map a set of internal allergen codes → the EU-14 group names they concern.
function euGroups(codes) {
  const out = [];
  for (const c of codes) {
    if (c === 'skaldjur') { out.push('Kräftdjur', 'Blötdjur'); continue; }
    if (c === 'laktos') { out.push('Laktos (ej bland de 14 — intolerans)'); continue; }
    if (EU14.has(c)) out.push(EU14_LABEL[c] || c);
    else out.push(LABEL[c] || c);
  }
  return [...new Set(out)];
}

// Plain-language assessment of one ingredient, straight from the engine.
function assess(ing) {
  const st = ingredientStatuses(ing);
  const contains = [...st.contains];
  const varies = [...st.varies];
  const traces = [...st.traces];
  const free = contains.length === 0 && varies.length === 0 && traces.length === 0;
  const parts = [];
  if (contains.length) parts.push(`Innehåller: ${contains.map((c) => LABEL[c]).join(', ')}`);
  if (varies.length) parts.push(`Varierar mellan fabrikat: ${varies.map((c) => LABEL[c]).join(', ')}`);
  if (traces.length) parts.push(`Kan innehålla spår: ${traces.map((c) => LABEL[c]).join(', ')}`);
  const groups = euGroups([...contains, ...varies, ...traces]);
  return {
    free,
    text: free ? 'Fri' : parts.join(' · '),
    groups: free ? 'Inga — påstås fri från alla 14' : groups.join(', '),
  };
}

// Auto-detect prepared/industrial products for Fråga C, primarily from the
// ingredient's shelf (aisle), with a small word-token keyword net for items
// that live on other shelves (a bouillon cube among the spices, etc.).
const PREPARED_AISLES = { 'Mejeri': 'mejeriprodukt', 'Konserver & Såser': 'konserv/sås', 'Frys': 'fryst/beredd' };
const KEYWORD_CAT = [
  [/^buljong|buljong$/, 'buljong'], [/fond/, 'fond'], [/tärning/, 'tärning/koncentrat'],
  [/krydd/, 'kryddblandning'], [/curry/, 'currypasta/-blandning'], [/kokos/, 'kokosprodukt (burk)'],
  [/sojas|soja/, 'sojaprodukt'], [/puré|pure|mos|pulver/, 'beredd puré/pulver'],
  [/korv|bullar|färs/, 'chark/färsprodukt'], [/sås|ketchup|senap|majonnäs|pesto/, 'färdig sås'],
  [/tortilla|taco/, 'bröd/tex-mex-produkt'], [/grädde|yoghurt|crème|creme|fraiche/, 'mejeriprodukt'],
];
function preparedCategory(ing) {
  if (PREPARED_AISLES[ing.aisle]) return PREPARED_AISLES[ing.aisle];
  const hay = `${ing.name} ${ing.canonical}`.toLowerCase();
  for (const [re, cat] of KEYWORD_CAT) if (re.test(hay)) return cat;
  return null;
}

const amount = (ing, servings) => formatAmount((ing.qtyPerPortion || 0) * servings, ing.unit) || '(mängd saknas)';

function loadTemplate(slug) {
  const raw = JSON.parse(readFileSync(path.join(SEED_DIR, `${slug}.json`), 'utf8'));
  const parsed = templateSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`${slug}: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
  return parsed.data;
}

// ── Shared content model per dish (rendered to both MD and HTML) ──
function dishModel(tpl) {
  const req = tpl.ingredients.filter((i) => !i.optional);
  const opt = tpl.ingredients.filter((i) => i.optional);
  const subs = [];
  for (const ing of tpl.ingredients) for (const s of ing.substitutions || []) subs.push({ from: ing.name, s });

  // Fråga B rows: every ingredient (required + optional), Fri first (▲).
  const bRows = tpl.ingredients.map((i) => ({ name: i.name, optional: !!i.optional, ...assess(i) }));
  bRows.sort((a, b) => (a.free === b.free ? 0 : a.free ? -1 : 1));

  // Fråga C rows: prepared products.
  const cRows = tpl.ingredients
    .map((i) => ({ name: i.name, cat: preparedCategory(i) }))
    .filter((r) => r.cat);

  return { tpl, req, opt, subs, bRows, cRows };
}

// ── Markdown rendering ──
const ingLine = (i, s) => `- ${i.name} — ${amount(i, s)}`;
function dishMd(m) {
  const s = m.tpl.servingsBase;
  const L = [];
  L.push(`## ${m.tpl.title}`);
  L.push('');
  L.push(`**Recept för ${s} portioner.**`);
  L.push('');
  L.push('**Obligatoriska ingredienser**');
  L.push(...m.req.map((i) => ingLine(i, s)));
  L.push('');
  L.push('**Valfria ingredienser**');
  L.push(m.opt.length ? m.opt.map((i) => ingLine(i, s)).join('\n') : '- (inga)');
  L.push('');
  L.push('**Substitutionsalternativ**');
  L.push(m.subs.length ? m.subs.map(({ from, s: sub }) => `- Istället för ${from}: ${sub.name}${sub.note ? ` (${sub.note})` : ''}`).join('\n') : '- (inga)');
  L.push('');
  L.push('### Fråga A — är listan komplett?');
  L.push('> Saknas ingredienser som en normal tillagning av denna rätt innehåller? Tänk på: buljong/fond, matfett (smör/olja), kryddblandningar, spad/vätska.');
  L.push('');
  L.push('Svar: _______________________________________________________________________');
  L.push('');
  L.push('_______________________________________________________________________________');
  L.push('');
  L.push('### Fråga B — stämmer vår allergenbedömning per ingrediens?');
  L.push('_▲ = vi bedömer ingrediensen som helt fri. Det är granskningens viktigaste rader: en felaktig "Fri" är det vi måste hitta._');
  L.push('');
  L.push('| Ingrediens | Vår bedömning | Avser EU-14-grupp(er) | Stämmer | Fel — rätt vore |');
  L.push('|---|---|---|:---:|---|');
  for (const r of m.bRows) {
    const nm = `${r.free ? '▲ ' : ''}${r.name}${r.optional ? ' *(valfri)*' : ''}`;
    L.push(`| ${nm} | ${r.text} | ${r.groups} | ☐ | ☐ __________ |`);
  }
  L.push('');
  L.push('### Fråga C — industriprodukter (kräver förpackningskoll?)');
  if (!m.cRows.length) {
    L.push('Inga uppenbart industriberedda ingredienser identifierades automatiskt. Kontrollera ändå själv om någon rå ingrediens i praktiken köps som beredd produkt.');
  } else {
    L.push('_Auto-listade beredda produkter (burk/tärning/pasta/blandning/mejeri/frys). Bör raden märkas "kräver förpackningskoll" eller "varierar mellan fabrikat"?_');
    L.push('');
    L.push('| Industriprodukt | Varför listad | Bör kräva förpackningskoll / varierar? |');
    L.push('|---|---|---|');
    for (const r of m.cRows) L.push(`| ${r.name} | ${r.cat} | ☐ Ja ☐ Nej ☐ Osäker |`);
  }
  L.push('');
  L.push('**Beslut för denna rätt:**');
  L.push('- ☐ Godkänd utan anmärkning');
  L.push('- ☐ Godkänd efter rättelser ovan');
  L.push('- ☐ Underkänd');
  L.push('');
  L.push('Kommentar: ____________________________________________________________________');
  L.push('');
  return L.join('\n');
}

const MD_HEADER = `# Nisse — Allergengranskning (checklista) · 12 nya rätter

> **Till dig som granskar:** Du behöver bara din livsmedelskunskap — ingen datorvana. För varje rätt:
> läs ingredienslistan, svara på Fråga A (saknas något?), gå igenom Fråga B rad för rad (stämmer vår
> bedömning?), och Fråga C (bör en beredd produkt kräva förpackningskoll?). Sätt till sist ett beslut.
>
> **Det här jagar vi:** en ingrediens vi felaktigt kallat **Fri** (▲-raderna) som i själva verket kan
> innehålla ett allergen. Att fela åt det **försiktiga** hållet (säga "innehåller" om något osäkert) är
> helt ok. **Är du osäker — markera Osäker, gissa aldrig till Fri.** Villkorliga/valfria ingredienser är
> märkta *(valfri)*.
>
> **EU:s 14 allergengrupper (referens):** Gluten · Kräftdjur · Ägg · Fisk · Jordnötter · Soja · Mjölk ·
> Nötter · Selleri · Senap · Sesam · Svaveldioxid/sulfit · Lupin · Blötdjur.
> (Laktos räknas inte hit — det är en intoleransmarkör, skild från mjölkprotein.)

---

`;

const MD_FOOTER = (n) => `---

## Sign-off — hela granskningen (${n} rätter)

| | Namn | Datum | Roll (granskare / expertstöd) |
|---|---|---|---|
| Person 1 | __________________ | __________ | __________________ |
| Person 2 | __________________ | __________ | __________________ |

**Sammanfattande beslut:** ☐ Alla ${n} godkända ☐ Godkända med rättelser (se per rätt) ☐ Vissa underkända

Granskad mot commit: \`${COMMIT}\`
`;

const templates = DRAFT_SLUGS.map(loadTemplate);
const models = templates.map(dishModel);
const md = MD_HEADER + models.map(dishMd).join('\n---\n\n') + '\n' + MD_FOOTER(models.length);
writeFileSync(MD_OUT, md);
console.log(`✓ Skrev ${MD_OUT} (${models.length} rätter, commit ${COMMIT})`);

// ── Machine-readable model (single source of truth for the fillable-PDF
// builder, so the PDF never re-derives allergen data — same engine truth). ──
const MODEL_OUT = process.argv[3];
if (MODEL_OUT) {
  const s = (m) => m.tpl.servingsBase;
  const dump = {
    commit: COMMIT,
    dishes: models.map((m) => ({
      title: m.tpl.title,
      servings: m.tpl.servingsBase,
      required: m.req.map((i) => ({ name: i.name, amount: amount(i, s(m)) })),
      optional: m.opt.map((i) => ({ name: i.name, amount: amount(i, s(m)) })),
      subs: m.subs.map(({ from, s: sub }) => ({ from, name: sub.name })),
      bRows: m.bRows.map((r) => ({ name: r.name, optional: r.optional, free: r.free, text: r.text, groups: r.groups })),
      cRows: m.cRows.map((r) => ({ name: r.name, cat: r.cat })),
    })),
  };
  writeFileSync(MODEL_OUT, JSON.stringify(dump, null, 2));
  console.log(`✓ Skrev ${MODEL_OUT} (modell för ifyllbar PDF)`);
}

// ── HTML print view (same model) for PDF export ──
const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function dishHtml(m) {
  const s = m.tpl.servingsBase;
  const li = (arr, fn) => (arr.length ? `<ul>${arr.map(fn).join('')}</ul>` : '<ul><li>(inga)</li></ul>');
  const bBody = m.bRows.map((r) => {
    const nm = `${r.free ? '▲ ' : ''}${esc(r.name)}${r.optional ? ' <em>(valfri)</em>' : ''}`;
    return `<tr class="${r.free ? 'free' : ''}"><td>${nm}</td><td>${esc(r.text)}</td><td>${esc(r.groups)}</td><td class="c">☐</td><td>☐ __________</td></tr>`;
  }).join('');
  const cBlock = m.cRows.length
    ? `<table><thead><tr><th>Industriprodukt</th><th>Varför listad</th><th>Bör kräva förpackningskoll / varierar?</th></tr></thead><tbody>${m.cRows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.cat)}</td><td>☐ Ja&nbsp;&nbsp;☐ Nej&nbsp;&nbsp;☐ Osäker</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">Inga uppenbart industriberedda ingredienser identifierades automatiskt. Kontrollera ändå själv.</p>';
  return `<section class="dish">
    <h2>${esc(m.tpl.title)}</h2>
    <p class="serv">Recept för ${s} portioner.</p>
    <div class="cols">
      <div><h4>Obligatoriska</h4>${li(m.req, (i) => `<li>${esc(i.name)} — ${esc(amount(i, s))}</li>`)}</div>
      <div><h4>Valfria</h4>${li(m.opt, (i) => `<li>${esc(i.name)} — ${esc(amount(i, s))}</li>`)}</div>
      <div><h4>Substitutionsalternativ</h4>${li(m.subs, ({ from, s: sub }) => `<li>Istället för ${esc(from)}: ${esc(sub.name)}</li>`)}</div>
    </div>
    <h3>Fråga A — är listan komplett?</h3>
    <p class="q">Saknas ingredienser som en normal tillagning innehåller? (buljong/fond, matfett, kryddblandningar, spad/vätska)</p>
    <div class="write"></div><div class="write"></div>
    <h3>Fråga B — stämmer allergenbedömningen per ingrediens?</h3>
    <p class="hint">▲ = bedömd helt fri — granskningens viktigaste rader (en felaktig "Fri" är det vi jagar).</p>
    <table><thead><tr><th>Ingrediens</th><th>Vår bedömning</th><th>Avser EU-14-grupp(er)</th><th class="c">Stämmer</th><th>Fel — rätt vore</th></tr></thead><tbody>${bBody}</tbody></table>
    <h3>Fråga C — industriprodukter</h3>${cBlock}
    <h3>Beslut för denna rätt</h3>
    <p class="decide">☐ Godkänd utan anmärkning&nbsp;&nbsp;&nbsp;☐ Godkänd efter rättelser&nbsp;&nbsp;&nbsp;☐ Underkänd</p>
    <p>Kommentar:</p><div class="write"></div>
  </section>`;
}
const HTML = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>Nisse — Allergenchecklista (12 nya rätter)</title>
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;font-size:11pt;line-height:1.4;margin:24px;}
  h1{font-size:19pt;margin:0 0 6px;} h2{font-size:15pt;margin:0 0 4px;color:#0b5;} h3{font-size:12pt;margin:14px 0 4px;}
  h4{font-size:10pt;margin:0 0 3px;color:#555;text-transform:uppercase;letter-spacing:.03em;}
  .intro{background:#f2f8f4;border:1px solid #cfe6d8;border-radius:8px;padding:12px 16px;font-size:10pt;}
  .intro b{color:#0a6;} ul{margin:2px 0 8px;padding-left:18px;} li{margin:1px 0;}
  .cols{display:flex;gap:20px;} .cols>div{flex:1;} .serv{font-weight:bold;margin:2px 0 8px;}
  table{border-collapse:collapse;width:100%;margin:6px 0 4px;font-size:9.5pt;} th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top;}
  th{background:#eef3f0;} td.c,th.c{text-align:center;} tr.free td{background:#fff7e6;font-weight:600;}
  .hint,.q,.muted{font-size:9.5pt;color:#555;} .q{font-style:italic;}
  .write{border-bottom:1px solid #999;height:20px;margin:6px 0;} .decide{font-size:11pt;}
  .dish{page-break-inside:avoid;page-break-after:always;padding-bottom:8px;} .dish:last-of-type{page-break-after:auto;}
  .foot{margin-top:18px;border-top:2px solid #0b5;padding-top:10px;}
  @page{margin:16mm;}
</style></head><body>
<h1>Nisse — Allergengranskning (checklista) · 12 nya rätter</h1>
<div class="intro">
<b>Till dig som granskar:</b> Du behöver bara din livsmedelskunskap. Per rätt: läs ingredienslistan, svara på
Fråga A (saknas något?), gå igenom Fråga B rad för rad, och Fråga C (bör en beredd produkt kräva förpackningskoll?).
Sätt sist ett beslut.<br>
<b>Det vi jagar:</b> en ingrediens vi felaktigt kallat <b>Fri</b> (▲) som kan innehålla ett allergen. Att fela åt det
försiktiga hållet är ok. <b>Är du osäker — markera Osäker, gissa aldrig till Fri.</b><br>
<b>EU:s 14 allergengrupper:</b> Gluten · Kräftdjur · Ägg · Fisk · Jordnötter · Soja · Mjölk · Nötter · Selleri · Senap ·
Sesam · Svaveldioxid/sulfit · Lupin · Blötdjur. (Laktos hör inte hit — intoleransmarkör, skild från mjölkprotein.)
</div>
${models.map(dishHtml).join('\n')}
<div class="foot">
<h3>Sign-off — hela granskningen (${models.length} rätter)</h3>
<table><thead><tr><th></th><th>Namn</th><th>Datum</th><th>Roll (granskare / expertstöd)</th></tr></thead>
<tbody><tr><td>Person 1</td><td></td><td></td><td></td></tr><tr><td>Person 2</td><td></td><td></td><td></td></tr></tbody></table>
<p>Sammanfattande beslut: ☐ Alla ${models.length} godkända&nbsp;&nbsp;☐ Godkända med rättelser&nbsp;&nbsp;☐ Vissa underkända</p>
<p>Granskad mot commit: <code>${COMMIT}</code></p>
</div>
</body></html>`;
writeFileSync(HTML_OUT, HTML);
console.log(`✓ Skrev ${HTML_OUT} (HTML för PDF-export)`);
