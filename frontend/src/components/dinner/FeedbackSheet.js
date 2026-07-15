// ============================================
// FeedbackSheet — quick post-meal feedback
// Ratings per member, actual time, cook again /
// avoid. Feeds the recommendation learning loop.
// ============================================

'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Star, Check, ThumbsDown, RotateCcw } from 'lucide-react';
import { cookSessions } from '../../lib/api';
import { Spinner } from '../Spinner';

const TIME_OPTIONS = [15, 20, 30, 45, 60];

export function FeedbackSheet({ sessionId, members, onDone, onSkip }) {
  const [ratings, setRatings] = useState({});
  const [actualTime, setActualTime] = useState(null);
  const [verdict, setVerdict] = useState(null); // 'again' | 'avoid' | null
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await cookSessions.feedback(sessionId, {
        cooked: true,
        actualTimeMin: actualTime || undefined,
        cookAgain: verdict === 'again' ? true : verdict === 'avoid' ? false : undefined,
        avoid: verdict === 'avoid',
        memberRatings: Object.entries(ratings).map(([memberId, rating]) => ({ memberId, rating })),
      });
      onDone?.();
    } catch {
      onDone?.(); // never trap the user in the sheet
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      <motion.div
        initial={{ y: 80 }} animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 pb-8"
        style={{ background: '#FFFFFF' }}
      >
        <h3 className="font-display text-xl text-warm-800 mb-1">Hur blev det?</h3>
        <p className="text-sm text-warm-500 mb-5">Tar tio sekunder — och gör Nisse smartare.</p>

        {members?.length > 0 && (
          <div className="space-y-3 mb-5">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between">
                <span className="text-sm font-medium text-warm-700">{m.name}</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRatings({ ...ratings, [m.id]: star })}
                      aria-label={`${star} stjärnor för ${m.name}`}
                    >
                      <Star
                        size={22}
                        fill={(ratings[m.id] || 0) >= star ? '#FFD60A' : 'none'}
                        style={{ color: (ratings[m.id] || 0) >= star ? '#FFD60A' : '#C7C7CC' }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs font-medium text-warm-500 mb-2">FAKTISK TID</p>
        <div className="flex flex-wrap gap-2 mb-5">
          {TIME_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => setActualTime(actualTime === t ? null : t)}
              className="px-3 py-1.5 rounded-full text-sm font-medium"
              style={{
                background: actualTime === t ? '#1A1A2E' : '#F5F5F7',
                color: actualTime === t ? '#FFF' : '#1A1A2E',
              }}
            >
              ~{t} min
            </button>
          ))}
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setVerdict(verdict === 'again' ? null : 'again')}
            className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{
              background: verdict === 'again' ? '#EDF3EF' : '#F5F5F7',
              color: verdict === 'again' ? '#5A7D6C' : '#8E8E93',
              border: verdict === 'again' ? '1.5px solid #5A7D6C' : '1.5px solid transparent',
            }}
          >
            <RotateCcw size={16} /> Laga igen
          </button>
          <button
            onClick={() => setVerdict(verdict === 'avoid' ? null : 'avoid')}
            className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{
              background: verdict === 'avoid' ? '#FFF0EB' : '#F5F5F7',
              color: verdict === 'avoid' ? '#FF7A50' : '#8E8E93',
              border: verdict === 'avoid' ? '1.5px solid #FF7A50' : '1.5px solid transparent',
            }}
          >
            <ThumbsDown size={16} /> Undvik
          </button>
        </div>

        <div className="flex gap-2">
          <button onClick={onSkip} className="btn-secondary">Hoppa över</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {saving ? <Spinner size="sm" /> : <Check size={18} />} Skicka
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
