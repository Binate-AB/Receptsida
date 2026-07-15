// ============================================
// Tests — AI output contracts
// AI output is never trusted raw: these fixtures
// lock the validation behavior, and the deterministic
// chips fallback must always produce valid output.
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsedMealRequestSchema,
  motivationsSchema,
  rescueSchema,
} from '../../src/services/nisse/ai/schemas.js';
import { deterministicParse } from '../../src/services/nisse/engine/chipsParse.js';
import { rescueFallback } from '../../src/services/nisse/engine/rescueFallbacks.js';
import { parseJsonLoose } from '../../src/utils/json-repair.js';

const validParse = {
  timeBudgetMin: 25,
  energy: 'låg',
  budget: 'normal',
  eaterIds: null,
  cravings: ['pasta'],
  avoidIngredients: ['fisk'],
  occasion: 'vardag',
  wantsLeftovers: false,
  notes: 'Trött tisdag',
  confidence: 0.9,
};

test('valid AI parse output passes the schema', () => {
  assert.ok(parsedMealRequestSchema.safeParse(validParse).success);
});

test('missing required field is rejected', () => {
  const { energy, ...missing } = validParse;
  assert.equal(parsedMealRequestSchema.safeParse(missing).success, false);
});

test('wrong enum value is rejected', () => {
  assert.equal(
    parsedMealRequestSchema.safeParse({ ...validParse, energy: 'sömnig' }).success,
    false
  );
});

test('out-of-range confidence is rejected', () => {
  assert.equal(
    parsedMealRequestSchema.safeParse({ ...validParse, confidence: 1.5 }).success,
    false
  );
});

test('truncated AI JSON is repaired by parseJsonLoose then validated', () => {
  // Simulates max_tokens truncation mid-object
  const truncated = '{"timeBudgetMin": 25, "energy": "låg", "budget": "normal", "eaterIds": null, "cravings": [], "avoidIngredients": [], "occasion": "vardag", "wantsLeftovers": false, "notes": null, "confidence": 0.8';
  const parsed = parseJsonLoose(truncated);
  assert.ok(parsedMealRequestSchema.safeParse(parsed).success);
});

test('deterministic chips fallback ALWAYS produces schema-valid output', () => {
  const cases = [
    {},
    { timeBudgetMin: 30, energy: 'slut', budget: 'snålt' },
    { timeBudgetMin: 5 }, // below min → clamped
    { timeBudgetMin: 999 }, // above max → clamped
    { energy: 'ogiltig', budget: 'ogiltig', occasion: 'ogiltig' }, // junk → defaults
    { eaterIds: ['a', 'b'], wantsLeftovers: true, occasion: 'matlådor' },
  ];
  for (const chips of cases) {
    const parsed = deterministicParse(chips);
    const result = parsedMealRequestSchema
      .omit({ confidence: true })
      .safeParse(parsed);
    assert.ok(result.success, `${JSON.stringify(chips)} → ${JSON.stringify(parsed)}`);
  }
});

test('motivations schema accepts valid and rejects junk', () => {
  assert.ok(
    motivationsSchema.safeParse({
      items: [{ slot: 'NISSE', motivation: 'Använder det ni har hemma och tar 20 minuter.' }],
    }).success
  );
  assert.equal(motivationsSchema.safeParse({ items: [] }).success, false);
  assert.equal(
    motivationsSchema.safeParse({ items: [{ slot: 'BÄST', motivation: 'hej hej hej hej' }] }).success,
    false
  );
});

test('rescue schema accepts valid output', () => {
  assert.ok(
    rescueSchema.safeParse({
      assessment: 'Ingen fara, det löser vi.',
      actions: [{ text: 'Dra av kastrullen från värmen.', urgent: true }],
      voiceCue: 'Dra av kastrullen från värmen direkt.',
    }).success
  );
});

test('rescue fallback always answers and matches the rescue shape', () => {
  for (const problem of ['det bränns!', 'för salt', 'såsen är för tunn', 'helt okänt problem']) {
    const result = rescueFallback(problem);
    assert.equal(result.source, 'fallback');
    const { source, ...shape } = result;
    assert.ok(rescueSchema.safeParse(shape).success, problem);
  }
});

test('rescue fallback picks the matching canned fix', () => {
  assert.match(rescueFallback('hjälp det bränns i kastrullen').actions[0].text, /värmen/i);
  assert.match(rescueFallback('soppan blev för salt').actions.map((a) => a.text).join(' '), /potatis|Späd/i);
});
