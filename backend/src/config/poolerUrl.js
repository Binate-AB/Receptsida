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
