// ============================================
// RescueSheet — Nisse SOS mode during cooking
// Problem chips + free text → contextual fixes
// (AI when available, canned deterministic
// fallback otherwise — always answers).
// ============================================

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LifeBuoy, X, AlertTriangle, Send } from 'lucide-react';
import { cookSessions } from '../../lib/api';
import { Spinner } from '../Spinner';

const PROBLEM_CHIPS = [
  'Det bränns!',
  'För salt',
  'Såsen är för tunn',
  'Såsen är för tjock',
  'Det fastnar i pannan',
  'Hur vet jag att det är klart?',
];

export function RescueSheet({ sessionId, onSpeak }) {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const ask = async (text) => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await cookSessions.rescue(sessionId, text.trim());
      setResult(data);
      if (data.voiceCue) onSpeak?.(data.voiceCue);
    } catch {
      setResult({
        assessment: 'Kunde inte nå Nisse — men ta det lugnt:',
        actions: [{ text: 'Ta kärlet från värmen så inget förvärras, och försök igen.', urgent: true }],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* SOS button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => { setOpen(true); setResult(null); setProblem(''); }}
        className="fixed bottom-6 left-6 z-[60] rounded-full flex items-center justify-center"
        aria-label="Räddningsläge"
        style={{
          width: 56,
          height: 56,
          background: 'rgba(255,59,48,0.9)',
          boxShadow: '0 4px 20px rgba(255,59,48,0.4)',
          color: '#FFF',
        }}
      >
        <LifeBuoy size={24} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80]" style={{ background: 'rgba(0,0,0,0.5)' }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-[90] rounded-t-3xl p-5 pb-8"
              style={{ background: '#1E293B', maxHeight: '80vh', overflowY: 'auto' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <LifeBuoy size={18} style={{ color: '#FF6B6B' }} /> Vad har hänt?
                </h3>
                <button onClick={() => setOpen(false)} aria-label="Stäng" className="text-white/50 p-1">
                  <X size={20} />
                </button>
              </div>

              {!result && (
                <>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {PROBLEM_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        onClick={() => { setProblem(chip); ask(chip); }}
                        disabled={loading}
                        className="px-3 py-2 rounded-full text-sm text-white"
                        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={problem}
                      onChange={(e) => setProblem(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') ask(problem); }}
                      placeholder="Eller beskriv med egna ord…"
                      className="flex-1 px-4 py-3 rounded-xl text-sm text-white placeholder-white/30"
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                    <button
                      onClick={() => ask(problem)}
                      disabled={!problem.trim() || loading}
                      className="w-12 rounded-xl flex items-center justify-center"
                      style={{ background: '#FF6B35', color: '#FFF' }}
                      aria-label="Skicka"
                    >
                      {loading ? <Spinner size="sm" /> : <Send size={18} />}
                    </button>
                  </div>
                </>
              )}

              {loading && !result && (
                <p className="text-white/50 text-sm mt-4 text-center">Nisse tänker…</p>
              )}

              {result && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <p className="text-white/80 text-sm">{result.assessment}</p>
                  {(result.actions || []).map((action, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3.5 rounded-xl"
                      style={{
                        background: action.urgent ? 'rgba(255,59,48,0.15)' : 'rgba(255,255,255,0.06)',
                        border: '1px solid ' + (action.urgent ? 'rgba(255,59,48,0.3)' : 'rgba(255,255,255,0.08)'),
                      }}
                    >
                      {action.urgent && <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: '#FF6B6B' }} />}
                      <p className="text-white text-sm">{action.text}</p>
                    </div>
                  ))}
                  <button
                    onClick={() => { setResult(null); setProblem(''); }}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                    style={{ background: 'rgba(255,255,255,0.1)' }}
                  >
                    Fråga något mer
                  </button>
                </motion.div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
