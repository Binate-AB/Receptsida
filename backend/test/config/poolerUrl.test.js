// Regression guard for the 2026-07-30 outage (PR #79): Prisma on the Supabase
// transaction pooler (:6543) without ?pgbouncer=true → "prepared statement s0
// already exists" → total DB outage. poolerSafeUrl must always enforce the flag.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poolerSafeUrl, assertRuntimeHostReachable } from '../../src/config/poolerUrl.js';

test('adds pgbouncer=true and connection_limit=1 to a bare transaction-pooler URL', () => {
  const out = poolerSafeUrl(
    'postgres://postgres.ref:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres'
  );
  const u = new URL(out);
  assert.equal(u.searchParams.get('pgbouncer'), 'true');
  assert.equal(u.searchParams.get('connection_limit'), '1');
});

test('preserves an already-correct transaction-pooler URL (idempotent, no override)', () => {
  const raw =
    'postgres://postgres.ref:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5';
  const u = new URL(poolerSafeUrl(raw));
  assert.equal(u.searchParams.get('pgbouncer'), 'true');
  // does not clobber an explicit connection_limit
  assert.equal(u.searchParams.get('connection_limit'), '5');
});

test('leaves the session pooler (:5432) untouched — prepared statements work there', () => {
  const raw = 'postgres://postgres.ref:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
  assert.equal(poolerSafeUrl(raw), raw);
});

test('leaves a direct connection untouched', () => {
  const raw = 'postgres://postgres:pw@db.ref.supabase.co:5432/postgres';
  assert.equal(poolerSafeUrl(raw), raw);
});

test('keeps an existing query param when appending the flag', () => {
  const u = new URL(
    poolerSafeUrl(
      'postgres://postgres.ref:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require'
    )
  );
  assert.equal(u.searchParams.get('sslmode'), 'require');
  assert.equal(u.searchParams.get('pgbouncer'), 'true');
});

test('is safe on empty/undefined input', () => {
  assert.equal(poolerSafeUrl(undefined), undefined);
  assert.equal(poolerSafeUrl(''), '');
});

// assertRuntimeHostReachable — the IPv6-only direct-host guard (2nd wave, 2026-07-30).
const DIRECT = 'postgresql://postgres:pw@db.giiqwwazevbzrcikdwju.supabase.co:6543/postgres?pgbouncer=true';
const POOLER = 'postgresql://postgres.ref:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

test('guard throws on the direct host when running on Vercel', () => {
  assert.throws(
    () => assertRuntimeHostReachable(DIRECT, { onVercel: true }),
    /direct host|db\.<ref>/i
  );
});

test('guard does NOT throw on the direct host off Vercel (local dev is IPv6-capable)', () => {
  assert.doesNotThrow(() => assertRuntimeHostReachable(DIRECT, { onVercel: false }));
});

test('guard never fires for the correct pooler host, even on Vercel', () => {
  assert.doesNotThrow(() => assertRuntimeHostReachable(POOLER, { onVercel: true }));
});

test('guard is safe on empty/undefined input', () => {
  assert.doesNotThrow(() => assertRuntimeHostReachable(undefined, { onVercel: true }));
  assert.doesNotThrow(() => assertRuntimeHostReachable('', { onVercel: true }));
});
