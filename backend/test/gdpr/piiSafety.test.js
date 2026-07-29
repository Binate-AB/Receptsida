// ============================================
// Tests — GDPR / PII safety (§24)
// Static source locks:
//  1. No analytics payload may carry free text,
//     member names or allergy details.
//  2. No user-facing error message may name a
//     member or an allergen.
//  3. Household deletion anonymizes events
//     BEFORE the cascade delete.
// These are source-scan tests by design: the
// invariant is "the code cannot even express
// the leak", not "we didn't happen to log it".
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, '../../src');

async function collectJsFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectJsFiles(full)));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** Extract every logEvent({...}) call text (balanced-paren scan). */
function extractLogEventCalls(src) {
  const calls = [];
  let idx = src.indexOf('logEvent(');
  while (idx !== -1) {
    let depth = 0;
    let end = idx;
    for (let i = idx + 'logEvent'.length; i < src.length; i++) {
      if (src[i] === '(') depth += 1;
      else if (src[i] === ')') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    calls.push(src.slice(idx, end + 1));
    idx = src.indexOf('logEvent(', end);
  }
  return calls;
}

const files = await collectJsFiles(SRC_DIR);
const sources = new Map();
for (const f of files) sources.set(f, await readFile(f, 'utf-8'));

test('no analytics payload references free text, member names or allergy details', () => {
  // Forbidden inside a logEvent call: anything that can carry §24-data.
  // Counters like allergies_count / hard_filter_kinds.allergen are fine.
  const FORBIDDEN = [
    /problem\s*:/,            // rescue free text
    /rawText/,                // solve free text
    /memberName/,             // member identity
    /\.allergies\b(?!_)/,     // allergy lists (allergies_count is allowed)
    /dietaryRestrictions/,    // health-adjacent restrictions
    /comment\s*:/,            // feedback free text
    /\bname\s*:\s*m\./,       // member name shorthand
  ];
  const offenders = [];
  for (const [file, src] of sources) {
    for (const call of extractLogEventCalls(src)) {
      for (const pattern of FORBIDDEN) {
        if (pattern.test(call)) {
          offenders.push(`${path.relative(SRC_DIR, file)}: ${pattern}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `PII i event-payload: ${offenders.join(' | ')}`);
});

test('no user-facing error interpolates member name or allergen', () => {
  const offenders = [];
  for (const [file, src] of sources) {
    // AppError messages with template interpolation of violation details
    const errorCalls = src.match(/new AppError\([^;]*?\)/gs) || [];
    for (const call of errorCalls) {
      if (/\$\{[^}]*(memberName|allergen|allergies|restriction)[^}]*\}/.test(call)) {
        offenders.push(path.relative(SRC_DIR, file));
      }
    }
  }
  assert.deepEqual(offenders, [], `PII i felmeddelande: ${offenders.join(', ')}`);
});

test('household deletion anonymizes analytics events before the cascade delete', async () => {
  const src = sources.get(path.join(SRC_DIR, 'routes/households.js'));
  assert.ok(src.includes("router.delete(\n  '/current',"), 'DELETE /households/current saknas');
  const anonIdx = src.indexOf('analyticsEvent.updateMany');
  const deleteIdx = src.indexOf('household.delete');
  assert.ok(anonIdx !== -1, 'anonymisering saknas');
  assert.ok(deleteIdx !== -1, 'raderingen saknas');
  assert.ok(anonIdx < deleteIdx, 'anonymisering ska ske före raderingen (samma transaktion)');
  assert.ok(
    /userId:\s*null,\s*householdId:\s*null/.test(src),
    'events ska tappa både userId och householdId'
  );
});
