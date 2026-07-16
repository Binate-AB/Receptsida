// ============================================
// CookAdjustSheets — "Jag saknar något" and
// "Jag ligger efter" during guided cooking.
// Both are deterministic server plans (no AI):
// missing → substitution/simplify/fallback,
// behind → replanned remaining steps + new ETA.
// ============================================

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PackageX, Hourglass, X, ArrowRight } from 'lucide-react';
import { cookSessions } from '../../lib/api';
import { Spinner } from '../Spinner';

function Sheet({ open, onClose, title, icon, children }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80]" style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="fixed bottom-0 left-0 right-0 z-[90] rounded-t-3xl p-5 pb-8"
            style={{ background: '#1E293B', maxHeight: '80vh', overflowY: 'auto' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold flex items-center gap-2">{icon} {title}</h3>
              <button onClick={onClose} aria-label="Stäng" className="text-white/50 p-1">
                <X size={20} />
              </button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Two pill buttons above the SOS button + their sheets.
 * @param {object} props — { session }
 */
export function CookAdjustSheets({ session }) {
  const [openSheet, setOpenSheet] = useState(null); // 'missing' | 'behind' | null
  const [loading, setLoading] = useState(false);
  const [missingPlan, setMissingPlan] = useState(null);
  const [behindPlan, setBehindPlan] = useState(null);

  const ingredients = (session?.recipeData?.ingredients || []).filter((i) => i.canonical);

  const reportMissing = async (canonical) => {
    setLoading(true);
    setMissingPlan(null);
    try {
      setMissingPlan(await cookSessions.missing(session.id, canonical));
    } catch {
      setMissingPlan({ message: 'Kunde inte hämta ett förslag just nu. Ta det lugnt och försök igen.' });
    } finally {
      setLoading(false);
    }
  };

  const reportBehind = async () => {
    setOpenSheet('behind');
    setLoading(true);
    setBehindPlan(null);
    try {
      setBehindPlan(await cookSessions.behind(session.id));
    } catch {
      setBehindPlan({ message: 'Kunde inte räkna om planen. Fokusera på nästa steg — det löser sig.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Pills stacked above the SOS button (bottom-left) */}
      <div className="fixed left-6 z-[60] flex flex-col gap-2" style={{ bottom: 96 }}>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => { setOpenSheet('missing'); setMissingPlan(null); }}
          className="px-3.5 py-2 rounded-full text-xs font-semibold text-white flex items-center gap-1.5"
          style={{ background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          <PackageX size={14} /> Saknar något
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={reportBehind}
          className="px-3.5 py-2 rounded-full text-xs font-semibold text-white flex items-center gap-1.5"
          style={{ background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          <Hourglass size={14} /> Ligger efter
        </motion.button>
      </div>

      {/* ── Missing ingredient ── */}
      <Sheet
        open={openSheet === 'missing'}
        onClose={() => setOpenSheet(null)}
        title="Vad saknas?"
        icon={<PackageX size={18} style={{ color: '#FFB020' }} />}
      >
        {!missingPlan && !loading && (
          <div className="flex flex-wrap gap-2">
            {ingredients.map((ing) => (
              <button
                key={ing.canonical}
                onClick={() => reportMissing(ing.canonical)}
                className="px-3 py-2 rounded-full text-sm text-white"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {ing.name}
              </button>
            ))}
          </div>
        )}
        {loading && <p className="text-white/50 text-sm text-center py-4"><Spinner size="sm" className="inline mr-2" />Nisse löser det…</p>}
        {missingPlan && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div
              className="p-3.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <p className="text-white text-sm">{missingPlan.message}</p>
            </div>
            {missingPlan.resolution === 'fallback_plan' && (
              <a
                href="/middag"
                className="block w-full py-3 rounded-xl text-sm font-semibold text-white text-center"
                style={{ background: 'rgba(255,255,255,0.1)' }}
              >
                Lös middagen igen
              </a>
            )}
            <button
              onClick={() => setOpenSheet(null)}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: '#FF6B35' }}
            >
              <ArrowRight size={16} /> Fortsätt laga
            </button>
          </motion.div>
        )}
      </Sheet>

      {/* ── Behind schedule ── */}
      <Sheet
        open={openSheet === 'behind'}
        onClose={() => setOpenSheet(null)}
        title="Ingen stress"
        icon={<Hourglass size={18} style={{ color: '#5BC0DE' }} />}
      >
        {loading && <p className="text-white/50 text-sm text-center py-4"><Spinner size="sm" className="inline mr-2" />Räknar om planen…</p>}
        {behindPlan && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div
              className="p-3.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <p className="text-white text-sm">{behindPlan.message}</p>
            </div>
            {(behindPlan.skipped || []).length > 0 && (
              <div className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                <p className="font-semibold text-white/80 mb-1">Hoppar över:</p>
                {behindPlan.skipped.map((s) => (
                  <p key={s.id}>· {s.text}</p>
                ))}
              </div>
            )}
            {(behindPlan.remainingSteps || []).length > 0 && (
              <div className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                <p className="font-semibold text-white/80 mb-1">Kvar, i ordning:</p>
                {behindPlan.remainingSteps.map((s, i) => (
                  <p key={s.id}>{i + 1}. {s.text}{s.durationMin ? ` (${s.durationMin} min)` : ''}</p>
                ))}
              </div>
            )}
            <button
              onClick={() => setOpenSheet(null)}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: '#FF6B35' }}
            >
              <ArrowRight size={16} /> Kör vidare
            </button>
          </motion.div>
        )}
      </Sheet>
    </>
  );
}
