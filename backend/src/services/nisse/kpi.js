// ============================================
// Nisse — KPI computation (§25 / §12 targets)
// Pure functions over an AnalyticsEvent array:
// [{ name, userId, householdId, payload, createdAt }]
// No Prisma, no clock — fully fixture-testable.
//
// CLOCK START (documented decision): "tid till
// beslut" starts at the dinner_solved event's
// createdAt (solve completion) and stops at the
// matching recommendation_accepted (same
// requestId). Regenerations don't reset the clock.
// ============================================

const ts = (e) => new Date(e.createdAt).getTime();
const rid = (e) => e.payload?.requestId ?? null;
const sid = (e) => e.payload?.sessionId ?? null;
const dayOf = (e) => new Date(e.createdAt).toISOString().slice(0, 10);

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compute all §12 KPIs from an event array (typically one week's events).
 * Returns numbers or null when a measure has no data — never throws on
 * missing event kinds.
 */
export function computeKpis(events) {
  const byName = new Map();
  for (const e of events) {
    if (!byName.has(e.name)) byName.set(e.name, []);
    byName.get(e.name).push(e);
  }
  const get = (name) => byName.get(name) || [];

  // ── Decisions: unique requestIds with a dinner_solved ──
  const solvedByRequest = new Map();
  for (const e of get('dinner_solved')) {
    const r = rid(e);
    if (r && !solvedByRequest.has(r)) solvedByRequest.set(r, e);
  }
  const decisions = solvedByRequest.size;

  // ── Tid till beslut (clock start = dinner_solved createdAt) ──
  const acceptedByRequest = new Map();
  for (const e of get('recommendation_accepted')) {
    const r = rid(e);
    if (r && !acceptedByRequest.has(r)) acceptedByRequest.set(r, e);
  }
  const decisionTimesMs = [];
  for (const [r, acc] of acceptedByRequest) {
    const solved = solvedByRequest.get(r);
    if (solved) decisionTimesMs.push(ts(acc) - ts(solved));
  }

  // ── Förstaförslagsacceptans: NISSE accepted with no regeneration ──
  const regeneratedRequests = new Set(get('no_option_accepted').map(rid).filter(Boolean));
  let firstAccepts = 0;
  for (const [r, acc] of acceptedByRequest) {
    if (acc.payload?.slot === 'NISSE' && !regeneratedRequests.has(r)) firstAccepts += 1;
  }

  // ── Korrigeringar / omgenereringar ──
  const corrections =
    get('assumption_corrected').length +
    get('alternative_requested').length +
    get('no_option_accepted').length;

  // ── Plan → tillagning (samma recommendationId, ≤ 12 h) ──
  const startsByRecommendation = new Map();
  for (const e of get('cooking_started')) {
    const rec = e.payload?.recommendationId;
    if (rec && !startsByRecommendation.has(rec)) startsByRecommendation.set(rec, e);
  }
  let planToCookHits = 0;
  for (const [, acc] of acceptedByRequest) {
    const rec = acc.payload?.recommendationId;
    const start = rec ? startsByRecommendation.get(rec) : null;
    if (start && ts(start) - ts(acc) <= 12 * 60 * 60 * 1000) planToCookHits += 1;
  }

  // ── Start → slutförd ──
  const completed = get('cooking_completed').length;
  const abandoned = get('cooking_abandoned').length;

  // ── Felåterhämtning ──
  const troubleSessions = new Set([
    ...get('missing_ingredient_reported').map(sid),
    ...get('time_problem_reported').map(sid),
    ...get('rescue_used').map(sid),
  ].filter(Boolean));
  const completedSessions = new Set(get('cooking_completed').map(sid).filter(Boolean));
  const recovered = [...troubleSessions].filter((s) => completedSessions.has(s)).length;

  // ── Återkomst + ≥3 kvällar/vecka ──
  const returnDaysByUser = new Map();
  for (const e of get('app_return')) {
    if (!e.userId) continue;
    if (!returnDaysByUser.has(e.userId)) returnDaysByUser.set(e.userId, new Set());
    returnDaysByUser.get(e.userId).add(dayOf(e));
  }
  const solveDaysByHousehold = new Map();
  for (const e of get('dinner_solved')) {
    if (!e.householdId) continue;
    if (!solveDaysByHousehold.has(e.householdId)) solveDaysByHousehold.set(e.householdId, new Set());
    solveDaysByHousehold.get(e.householdId).add(dayOf(e));
  }
  const activeHouseholds = solveDaysByHousehold.size;
  const threePlusNightHouseholds = [...solveDaysByHousehold.values()].filter(
    (days) => days.size >= 3
  ).length;

  // ── Rekommendationsgap per cell ──
  const gapsByCell = {};
  for (const e of get('recommendation_gap')) {
    const cell = e.payload?.cell || 'okänd';
    gapsByCell[cell] = (gapsByCell[cell] || 0) + 1;
  }

  const ratio = (num, den) => (den > 0 ? num / den : null);

  return {
    decisions,
    timeToDecisionMedianMs: median(decisionTimesMs),
    firstAcceptRate: ratio(firstAccepts, decisions),
    regenerationRate: ratio(get('no_option_accepted').length, decisions),
    correctionRate: ratio(corrections, decisions),
    planToCookRate: ratio(planToCookHits, acceptedByRequest.size),
    startToCompleteRate: ratio(completed, completed + abandoned),
    errorRecoveryRate: ratio(recovered, troubleSessions.size),
    returnDaysPerUser: returnDaysByUser.size
      ? [...returnDaysByUser.values()].reduce((a, s) => a + s.size, 0) / returnDaysByUser.size
      : null,
    threePlusNightsRate: ratio(threePlusNightHouseholds, activeHouseholds),
    activeHouseholds,
    recommendationGaps: {
      total: get('recommendation_gap').length,
      byCell: gapsByCell,
    },
  };
}

/** §12 targets — compared (never enforced) by the report. */
export const KPI_TARGETS = {
  timeToDecisionMedianMs: { target: 30_000, direction: '<=' },
  firstAcceptRate: { target: 0.4, direction: '>=' },
  planToCookRate: { target: 0.6, direction: '>=' },
  startToCompleteRate: { target: 0.7, direction: '>=' },
  errorRecoveryRate: { target: 0.6, direction: '>=' },
  threePlusNightsRate: { target: 0.4, direction: '>=' },
};

/** True when a value meets its §12 target (null = no data → null). */
export function meetsTarget(key, value) {
  const t = KPI_TARGETS[key];
  if (!t || value == null) return null;
  return t.direction === '<=' ? value <= t.target : value >= t.target;
}

/** Group events into ISO-week buckets: 'YYYY-Wnn' → events[]. */
export function groupByWeek(events) {
  const weeks = new Map();
  for (const e of events) {
    const d = new Date(e.createdAt);
    // ISO week number
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
    const week =
      1 + Math.round(((target - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    const key = `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(e);
  }
  return weeks;
}
