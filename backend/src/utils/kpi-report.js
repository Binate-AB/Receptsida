// ============================================
// Nisse — KPI report (§25)
// Reads AnalyticsEvent from the DB, computes the
// §12 measures per ISO week and prints them next
// to their targets.
//
// Run: npm run kpi        (from backend/)
// Exit code != 0 ONLY on data/connection errors —
// a missed target is information, not a failure.
// ============================================

import { PrismaClient } from '@prisma/client';
import { computeKpis, groupByWeek, KPI_TARGETS, meetsTarget } from '../services/nisse/kpi.js';

const prisma = new PrismaClient();

const fmt = (key, value) => {
  if (value == null) return '—';
  if (key === 'timeToDecisionMedianMs') return `${Math.round(value / 100) / 10}s`;
  if (key.endsWith('Rate')) return `${Math.round(value * 1000) / 10}%`;
  return String(Math.round(value * 100) / 100);
};

async function main() {
  const events = await prisma.analyticsEvent.findMany({
    orderBy: { createdAt: 'asc' },
    select: { name: true, userId: true, householdId: true, payload: true, createdAt: true },
  });

  if (events.length === 0) {
    console.log('Inga events i databasen ännu — inget att mäta.');
    return;
  }

  const weeks = groupByWeek(events);
  console.log(`Nisse KPI-rapport — ${events.length} events över ${weeks.size} veckor\n`);
  console.log('Klockstart för "tid till beslut" = dinner_solved-eventets skapande (solve klar).\n');

  for (const [week, weekEvents] of [...weeks.entries()].sort()) {
    const k = computeKpis(weekEvents);
    console.log(`━━ ${week} — ${k.decisions} beslut, ${k.activeHouseholds} aktiva hushåll ━━`);
    const rows = [
      ['Tid till beslut (median)', 'timeToDecisionMedianMs', k.timeToDecisionMedianMs],
      ['Förstaförslagsacceptans', 'firstAcceptRate', k.firstAcceptRate],
      ['Omgenereringsgrad', 'regenerationRate', k.regenerationRate],
      ['Korrigeringsgrad', 'correctionRate', k.correctionRate],
      ['Plan → tillagning', 'planToCookRate', k.planToCookRate],
      ['Start → slutförd', 'startToCompleteRate', k.startToCompleteRate],
      ['Felåterhämtning', 'errorRecoveryRate', k.errorRecoveryRate],
      ['Återkomstdagar/användare', 'returnDaysPerUser', k.returnDaysPerUser],
      ['≥3 kvällar/vecka', 'threePlusNightsRate', k.threePlusNightsRate],
    ];
    for (const [label, key, value] of rows) {
      const t = KPI_TARGETS[key];
      const ok = meetsTarget(key, value);
      const mark = ok == null ? ' ' : ok ? '✓' : '✗';
      const targetStr = t ? ` (mål ${t.direction} ${fmt(key, t.target)})` : '';
      console.log(`  ${mark} ${label}: ${fmt(key, value)}${targetStr}`);
    }
    if (k.recommendationGaps.total > 0) {
      const cells = Object.entries(k.recommendationGaps.byCell)
        .map(([c, n]) => `${c}:${n}`)
        .join(' ');
      console.log(`  ⚠ recommendation_gap: ${k.recommendationGaps.total} (${cells})`);
    }
    console.log('');
  }
}

main()
  .catch((err) => {
    console.error('KPI-rapporten kunde inte köras:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
