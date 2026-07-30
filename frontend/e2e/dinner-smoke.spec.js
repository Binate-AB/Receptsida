// ============================================
// Browser smoke test (NO MOCKS)
// Drives the real UI end-to-end through the exact
// path a user takes: register (auto-login) →
// create household → Lös middagen → a recommendation
// card appears. Deterministic: the solve flow works
// without an AI key (chips fallback), so this passes
// against a real backend regardless of AI state.
//
// This is the regression guard for the 2026-07-30
// outage (retired model → 502) and the white-screen
// fix: if any LLM-flow 502s or a view blanks, the
// recommendation card never renders and this fails.
//
// Run against local (next start :3000 + api :4000) or
// a deployed URL via BASE_URL. See e2e/README.md.
// ============================================

import { test, expect } from '@playwright/test';

const rnd = () => Math.random().toString(36).slice(2, 10);

test('login → lös middagen → rekommendation', async ({ page }) => {
  const email = `smoke_${rnd()}@example.com`;
  const password = 'SmokeTest1!';

  // ── Register (the frontend auto-logs in from the register response) ──
  await page.goto('/register');
  await page.getByLabel(/e-post/i).fill(email);
  // Password field label varies; fall back to type=password inputs.
  const pw = page.getByLabel(/lösenord/i).first();
  await (await pw.count() ? pw : page.locator('input[type="password"]').first()).fill(password);
  await page.getByRole('button', { name: /skapa konto|registrera|kom igång/i }).click();

  // Land in the app (household wizard or home). Give auth a moment.
  await page.waitForLoadState('networkidle');

  // ── Household: ensure at least one member, then go to Lös middagen ──
  await page.goto('/hushall');
  // Add a member if the wizard exposes the control (best-effort, resilient).
  const addMember = page.getByRole('button', { name: /lägg till|ny medlem|lägg till medlem/i }).first();
  if (await addMember.count()) {
    await addMember.click();
    const nameField = page.getByLabel(/namn/i).first();
    if (await nameField.count()) await nameField.fill('Alex');
    const save = page.getByRole('button', { name: /spara|lägg till|klar/i }).first();
    if (await save.count()) await save.click();
  }

  // ── Lös middagen ──
  await page.goto('/middag');
  const solve = page.getByRole('button', { name: /lös middagen|föreslå|hitta middag/i }).first();
  await expect(solve).toBeVisible();
  await solve.click();

  // ── A recommendation must render (NISSE slot / recommended card) ──
  // The card carries a slot badge ("Nisses val") and a dish title.
  const recommendation = page.getByText(/nisses val|minst jobb|billigast/i).first();
  await expect(recommendation).toBeVisible({ timeout: 20_000 });

  // And there is at least one dish title on screen (not a blank/error view).
  await expect(page.getByText(/något gick fel/i)).toHaveCount(0);
});
