// ============================================
// Real end-to-end smoke test (NO MOCKS)
// Boots the actual Express app against the real
// (local) Postgres and drives the exact HTTP flow
// the frontend uses: register (auto-login) →
// create household + member → Lös middagen →
// assert a recommendation. Also verifies the
// repointed /recipes/search hits the verified pool.
//
// Deterministic: uses chips (no AI needed) so it
// passes with a placeholder Anthropic key — the
// core flow works without an AI key by design.
//
// Run:  node --env-file=.env.smoke scripts/smoke-dinner.mjs
// ============================================

import assert from 'node:assert/strict';

// Importing the app auto-starts the HTTP listener (start() in index.js).
await import('../src/index.js');

const BASE = `http://127.0.0.1:${process.env.PORT || 4000}`;
const API = `${BASE}/api/v1`;

const j = async (res) => {
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: text }; }
};

async function waitForHealth() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      const { body } = await j(r);
      if (body?.checks?.database === 'ok') return body;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server/DB never became healthy');
}

const rnd = Math.random().toString(36).slice(2, 10);

async function main() {
  const health = await waitForHealth();
  console.log('✓ health:', JSON.stringify(health.checks));

  // 1) Register — the frontend auto-logs-in from the register response
  const reg = await j(await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `smoke_${rnd}@example.com`,
      password: 'SmokeTest1!',
      name: 'Smoke',
      householdSize: 2,
    }),
  }));
  assert.equal(reg.status, 201, `register → 201 (got ${reg.status}: ${JSON.stringify(reg.body)})`);
  const token = reg.body.accessToken;
  assert.ok(token, 'register returned an access token');
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log('✓ registered + logged in');

  // 2) Create household + one adult member (the wizard flow)
  const hh = await j(await fetch(`${API}/households`, {
    method: 'POST', headers: auth, body: JSON.stringify({ cookingSkill: 'INTERMEDIATE', equipment: ['spis', 'kastrull', 'stekpanna'] }),
  }));
  assert.equal(hh.status, 201, `create household → 201 (got ${hh.status}: ${JSON.stringify(hh.body)})`);

  const mem = await j(await fetch(`${API}/households/current/members`, {
    method: 'POST', headers: auth, body: JSON.stringify({ name: 'Alex', ageCategory: 'ADULT' }),
  }));
  assert.ok(mem.status === 200 || mem.status === 201, `add member (got ${mem.status}: ${JSON.stringify(mem.body)})`);
  console.log('✓ household + member created');

  // 3) Lös middagen — deterministic chips path (no AI)
  const solve = await j(await fetch(`${API}/dinner/solve`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ chips: { timeBudgetMin: 30, energy: 'normal', budget: 'normal' } }),
  }));
  assert.equal(solve.status, 201, `solve → 201 (got ${solve.status}: ${JSON.stringify(solve.body)})`);
  const recs = solve.body.recommendations || [];
  assert.ok(recs.length >= 1, `at least one recommendation (got ${recs.length})`);
  assert.ok(recs.some((r) => r.slot === 'NISSE'), 'a NISSE (recommended) slot is present');
  assert.equal(solve.body.request.parseSource, 'chips_fallback', 'deterministic parse (no AI)');
  const top = recs.find((r) => r.slot === 'NISSE') || recs[0];
  console.log(`✓ Lös middagen → ${recs.length} rekommendationer; NISSE: "${top.template?.title || top.computed?.title || '(titel via template)'}"`);

  // 4) Repointed search hits the VERIFIED pool (not the retired AI web-search)
  const search = await j(await fetch(`${API}/recipes/search`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ query: 'kyckling', householdSize: 2 }),
  }));
  assert.equal(search.status, 200, `search → 200 (got ${search.status}: ${JSON.stringify(search.body)})`);
  assert.equal(search.body.meta?.source, 'verified_pool', 'search served from verified pool');
  assert.ok((search.body.recipes || []).length >= 1, 'search returned pool recipes');
  console.log(`✓ /recipes/search → ${search.body.recipes.length} recept ur verifierade poolen (inget AI, inget 502)`);

  console.log('\n✅ SMOKE PASS — login → lös middagen → rekommendation (inga mockar, ingen AI)');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ SMOKE FAIL:', err.message);
  process.exit(1);
});
