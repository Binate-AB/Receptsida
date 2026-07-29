// ============================================
// Tests — §25 KPI computation against a known
// fixture. Clock start = dinner_solved createdAt.
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeKpis, groupByWeek, meetsTarget } from '../../src/services/nisse/kpi.js';

const t0 = Date.parse('2026-07-20T17:00:00Z');
const at = (offsetSec) => new Date(t0 + offsetSec * 1000).toISOString();
const ev = (name, offsetSec, payload = {}, extra = {}) => ({
  name,
  payload,
  createdAt: at(offsetSec),
  userId: extra.userId ?? 'u1',
  householdId: extra.householdId ?? 'h1',
});

// Fixture: two decisions in household h1, one in h2.
//  r1: solved → NISSE accepted after 20s → cooked to completion (with rescue)
//  r2: solved → regenerate → EASIEST accepted after 60s → cooking abandoned
//  r3 (h2): solved, never accepted, gap logged (A1)
const fixture = [
  ev('dinner_solved', 0, { requestId: 'r1' }),
  ev('recommendation_accepted', 20, { requestId: 'r1', recommendationId: 'rec1', slot: 'NISSE' }),
  ev('cooking_started', 120, { sessionId: 's1', recommendationId: 'rec1' }),
  ev('rescue_used', 600, { sessionId: 's1', source: 'fallback' }),
  ev('cooking_completed', 2400, { sessionId: 's1', templateId: 'tpl1' }),

  ev('dinner_solved', 86400, { requestId: 'r2' }),
  ev('no_option_accepted', 86420, { requestId: 'r2', regeneration_round: 1 }),
  ev('recommendation_accepted', 86460, { requestId: 'r2', recommendationId: 'rec2', slot: 'EASIEST' }),
  ev('cooking_started', 86520, { sessionId: 's2', recommendationId: 'rec2' }),
  ev('cooking_abandoned', 87000, { sessionId: 's2', templateId: 'tpl2' }),

  ev('dinner_solved', 172800, { requestId: 'r3' }, { userId: 'u2', householdId: 'h2' }),
  ev('recommendation_gap', 172801, { requestId: 'r3', cell: 'A1', qualified: 1 }, { userId: 'u2', householdId: 'h2' }),

  // h1 solves a third night (three distinct days total)
  ev('dinner_solved', 259200, { requestId: 'r4' }),

  ev('app_return', 0, { days_since_last: 2 }),
  ev('app_return', 86400, { days_since_last: 1 }),
];

test('KPI-fixturen ger kända värden', () => {
  const k = computeKpis(fixture);

  assert.equal(k.decisions, 4, 'r1–r4');
  // Median av 20s (r1) och 60s (r2) = 40s
  assert.equal(k.timeToDecisionMedianMs, 40_000);
  // Bara r1 är NISSE utan omgenerering → 1/4
  assert.equal(k.firstAcceptRate, 0.25);
  // En no_option_accepted på 4 beslut
  assert.equal(k.regenerationRate, 0.25);
  assert.equal(k.correctionRate, 0.25);
  // Båda accepterade följdes av cooking_started ≤12h
  assert.equal(k.planToCookRate, 1);
  // 1 completed / (1 completed + 1 abandoned)
  assert.equal(k.startToCompleteRate, 0.5);
  // s1 hade rescue och nådde completed → 1/1
  assert.equal(k.errorRecoveryRate, 1);
  // h1 löste middag 3 distinkta dagar, h2 en dag → 1/2 hushåll ≥3 kvällar
  assert.equal(k.threePlusNightsRate, 0.5);
  assert.equal(k.activeHouseholds, 2);
  // Gap-distribution per cell
  assert.deepEqual(k.recommendationGaps, { total: 1, byCell: { A1: 1 } });
});

test('målen jämförs åt rätt håll', () => {
  assert.equal(meetsTarget('timeToDecisionMedianMs', 20_000), true);
  assert.equal(meetsTarget('timeToDecisionMedianMs', 45_000), false);
  assert.equal(meetsTarget('firstAcceptRate', 0.5), true);
  assert.equal(meetsTarget('firstAcceptRate', 0.2), false);
  assert.equal(meetsTarget('firstAcceptRate', null), null, 'ingen data = inget omdöme');
});

test('veckogruppering delar events på ISO-vecka', () => {
  const weeks = groupByWeek([
    { createdAt: '2026-07-20T12:00:00Z' }, // måndag v.30
    { createdAt: '2026-07-26T12:00:00Z' }, // söndag v.30
    { createdAt: '2026-07-27T12:00:00Z' }, // måndag v.31
  ]);
  assert.deepEqual([...weeks.keys()].sort(), ['2026-W30', '2026-W31']);
  assert.equal(weeks.get('2026-W30').length, 2);
});

test('tomma eller partiella event-mängder kraschar aldrig', () => {
  const empty = computeKpis([]);
  assert.equal(empty.decisions, 0);
  assert.equal(empty.timeToDecisionMedianMs, null);
  assert.equal(empty.firstAcceptRate, null);
  const onlySolves = computeKpis([ev('dinner_solved', 0, { requestId: 'rX' })]);
  assert.equal(onlySolves.decisions, 1);
  assert.equal(onlySolves.planToCookRate, null);
});
