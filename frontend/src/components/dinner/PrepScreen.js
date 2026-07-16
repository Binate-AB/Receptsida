// ============================================
// PrepScreen — level 1 verification before cooking
// Equipment + the dish's critical ingredients are
// confirmed BEFORE the stove goes on. Missing items
// get a deterministic substitution/simplify plan.
// ============================================

'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ClipboardCheck, Check, X, ArrowRight } from 'lucide-react';
import { cookSessions } from '../../lib/api';
import { Spinner } from '../Spinner';

const EQUIPMENT_LABELS = {
  ugn: 'Ugn', spis: 'Spis', mikro: 'Mikro', airfryer: 'Airfryer',
  mixer: 'Mixer', ugnsform: 'Ugnsform', stekpanna: 'Stekpanna', kastrull: 'Kastrull',
};

export function PrepScreen({ session, onDone }) {
  const prep = session?.recipeData?.prep;
  const critical = prep?.criticalIngredients || [];
  // canonical → true (have) / false (missing); default assume home
  const [checks, setChecks] = useState(() =>
    Object.fromEntries(critical.map((i) => [i.canonical, true]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [plans, setPlans] = useState(null); // rescue plans for missing items

  const toggle = (canonical) =>
    setChecks((prev) => ({ ...prev, [canonical]: !prev[canonical] }));

  const submit = async () => {
    setSubmitting(true);
    const confirmed = critical.filter((i) => checks[i.canonical]).map((i) => i.canonical);
    const missing = critical.filter((i) => !checks[i.canonical]).map((i) => i.canonical);
    try {
      await cookSessions.prep(session.id, { confirmed, missing });
      if (missing.length === 0) {
        onDone();
        return;
      }
      // Fetch a deterministic plan per missing critical ingredient
      const results = [];
      for (const canonical of missing) {
        try {
          results.push(await cookSessions.missing(session.id, canonical));
        } catch {
          results.push({ resolution: 'fallback_plan', message: 'Kunde inte hämta ett förslag — välj gärna en annan rätt.' });
        }
      }
      setPlans(results);
    } catch {
      // Verification must never trap the cook — proceed anyway
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  const anyFallback = (plans || []).some((p) => p.resolution === 'fallback_plan');

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto" style={{ background: '#1A1A2E' }}>
      <div className="max-w-md mx-auto px-5 py-10 pb-16">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-1">
            <ClipboardCheck size={22} style={{ color: '#FF6B35' }} />
            <h1 className="text-white font-bold text-xl">Innan du börjar</h1>
          </div>
          <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {session?.recipeData?.title} — snabbkoll så inget stoppar dig mitt i.
          </p>

          {!plans && (
            <>
              {(prep?.equipment || []).length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    TAS FRAM
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {prep.equipment.map((e) => (
                      <span
                        key={e}
                        className="px-3 py-1.5 rounded-full text-sm text-white"
                        style={{ background: 'rgba(255,255,255,0.08)' }}
                      >
                        {EQUIPMENT_LABELS[e] || e}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                HAR DU DETTA? (AVGÖRANDE)
              </p>
              <div className="space-y-2 mb-6">
                {critical.map((ing) => {
                  const have = checks[ing.canonical];
                  return (
                    <button
                      key={ing.canonical}
                      onClick={() => toggle(ing.canonical)}
                      className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all"
                      style={{
                        background: have ? 'rgba(90,125,108,0.25)' : 'rgba(255,59,48,0.15)',
                        border: '1px solid ' + (have ? 'rgba(90,125,108,0.5)' : 'rgba(255,59,48,0.35)'),
                      }}
                    >
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: have ? '#5A7D6C' : 'rgba(255,59,48,0.8)', color: '#FFF' }}
                      >
                        {have ? <Check size={15} /> : <X size={15} />}
                      </span>
                      <span className="flex-1 text-white text-sm">
                        {ing.name} {ing.amount && <span style={{ color: 'rgba(255,255,255,0.45)' }}>· {ing.amount}</span>}
                      </span>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        {have ? 'har hemma' : 'saknas'}
                      </span>
                    </button>
                  );
                })}
                {critical.length === 0 && (
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Inga avgörande ingredienser att bekräfta — kör!
                  </p>
                )}
              </div>

              <button
                onClick={submit}
                disabled={submitting}
                className="w-full py-3.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2"
                style={{ background: '#FF6B35' }}
              >
                {submitting ? <Spinner size="sm" /> : <ArrowRight size={18} />}
                {Object.values(checks).every(Boolean) ? 'Allt klart — börja laga' : 'Fortsätt ändå'}
              </button>
            </>
          )}

          {plans && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <p className="text-white/80 text-sm">Ingen fara — så här löser vi det:</p>
              {plans.map((plan, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <p className="text-white text-sm">{plan.message}</p>
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                {anyFallback && (
                  <a
                    href="/middag"
                    className="flex-1 py-3.5 rounded-xl font-semibold text-white text-center text-sm"
                    style={{ background: 'rgba(255,255,255,0.1)' }}
                  >
                    Lös middagen igen
                  </a>
                )}
                <button
                  onClick={onDone}
                  className="flex-1 py-3.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 text-sm"
                  style={{ background: '#FF6B35' }}
                >
                  <ArrowRight size={16} /> Börja laga
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
