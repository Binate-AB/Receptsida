// ============================================
// Connection-string normalization for the Supabase pooler
// ============================================
// Pure, dependency-free helper (safe to unit-test in isolation — no Prisma).

// Supabase's transaction pooler (PgBouncer, port 6543) multiplexes many
// client connections onto a small set of Postgres backends. Prisma names its
// prepared statements per connection (s0, s1, …); when PgBouncer hands a
// backend that already prepared "s0" to another client, Postgres rejects it
// with `prepared statement "s0" already exists` and then EVERY query throws —
// a total DB outage (this took prod down after PR #79). The Prisma fix is to
// run in pgbouncer mode (no named prepared statements) via ?pgbouncer=true.
// We enforce the flag here so a pooler URL supplied without it can never take
// prod down again; connection_limit=1 keeps each serverless invocation to a
// single pooled connection. Only the transaction pooler (:6543) needs this —
// the session pooler (:5432) and direct connections handle prepared
// statements fine, so those URLs are returned untouched.
export function poolerSafeUrl(raw) {
  if (!raw || !raw.includes(':6543')) return raw;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has('pgbouncer')) u.searchParams.set('pgbouncer', 'true');
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '1');
    return u.toString();
  } catch {
    // Fall back to a plain string append if the URL can't be parsed.
    if (raw.includes('pgbouncer=')) return raw;
    return raw + (raw.includes('?') ? '&' : '?') + 'pgbouncer=true&connection_limit=1';
  }
}

// Supabase's DIRECT connection host (db.<ref>.supabase.co) is IPv6-only and
// therefore unreachable from Vercel — using it as the runtime DATABASE_URL
// yields "Can't reach database server" on every request (this was the second
// wave of the 2026-07-30 outage: the env var was edited to the direct host by
// mistake). This guard turns that silent 503 loop into a self-explaining boot
// error that names the exact fix. It only THROWS on Vercel (process.env.VERCEL),
// so a developer pointing at the direct host locally — where IPv6 works — is
// merely warned, not blocked.
const DIRECT_HOST_RE = /@db\.[a-z0-9-]+\.supabase\.co[:/]/i;

export function assertRuntimeHostReachable(raw, { onVercel = !!process.env.VERCEL } = {}) {
  if (!raw || !DIRECT_HOST_RE.test(raw)) return;
  const fix =
    'DATABASE_URL points at the Supabase DIRECT host (db.<ref>.supabase.co), which is IPv6-only ' +
    'and unreachable from Vercel. Use the transaction pooler instead: ' +
    'postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres' +
    '?pgbouncer=true&connection_limit=1 (copy it from Supabase → Connect → Transaction pooler).';
  console.error(`[db] FATAL CONFIG: ${fix}`);
  if (onVercel) throw new Error(`Invalid DATABASE_URL host — ${fix}`);
}
