// ============================================
// Route-segment error boundary (App Router)
// Catches render/throw errors anywhere under the
// root segment so an API failure never blanks the
// screen. Client component per Next.js contract.
// ============================================

'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function Error({ error, reset }) {
  useEffect(() => {
    // Log for diagnostics; never surface stack traces to the user.
    console.error('Route error boundary caught:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div
          className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
          style={{ background: 'rgba(255,107,53,0.12)' }}
        >
          <AlertTriangle size={26} style={{ color: '#FF6B35' }} />
        </div>
        <h1 className="font-display text-2xl text-warm-800 mb-2">Något gick fel</h1>
        <p className="text-warm-500 text-sm mb-6">
          Tjänsten svarade inte som väntat just nu. Det är inte ditt fel — försök igen om en stund.
        </p>
        <button
          onClick={() => reset()}
          className="btn-primary inline-flex items-center gap-2"
        >
          <RotateCcw size={16} /> Försök igen
        </button>
      </div>
    </div>
  );
}
