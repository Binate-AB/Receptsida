// ============================================
// Global error boundary (App Router)
// Last-resort boundary that also catches errors in
// the root layout. Must render its own <html>/<body>.
// ============================================

'use client';

export default function GlobalError({ error, reset }) {
  return (
    <html lang="sv">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', background: '#FBF9F6' }}>
        <div style={{ maxWidth: 360, textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 22, color: '#3F3A34', marginBottom: 8 }}>Något gick fel</h1>
          <p style={{ fontSize: 14, color: '#8A8178', marginBottom: 24 }}>
            Appen kunde inte laddas just nu. Ladda om sidan eller försök igen om en stund.
          </p>
          <button
            onClick={() => reset()}
            style={{ background: '#FF6B35', color: '#fff', border: 'none', borderRadius: 999, padding: '12px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Försök igen
          </button>
        </div>
      </body>
    </html>
  );
}
