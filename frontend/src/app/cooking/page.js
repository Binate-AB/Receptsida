'use client';

// ============================================
// Cooking Page — hosts CookingMode
// Two modes:
// 1. Legacy: recipe from useRecipeStore (search flow) — unchanged
// 2. Nisse session (?session= / ?rec=): DB-persisted progress,
//    branch lanes (Gemensamt/Barnens/Vuxnas), rescue mode and
//    post-meal feedback.
// ============================================

import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChefHat, ArrowLeft, Mic, MicOff } from 'lucide-react';
import { useRecipeStore, useHouseholdStore } from '../../lib/store';
import { CookingMode } from '../../components/CookingMode';
import { BranchSwitcher } from '../../components/dinner/BranchSwitcher';
import { RescueSheet } from '../../components/dinner/RescueSheet';
import { FeedbackSheet } from '../../components/dinner/FeedbackSheet';
import { PrepScreen } from '../../components/dinner/PrepScreen';
import { CookAdjustSheets } from '../../components/dinner/CookAdjustSheets';
import { useVoiceInput, useSpeech } from '../../hooks/useVoice';
import { cooking, cookSessions } from '../../lib/api';
import { Spinner } from '../../components/Spinner';

function CookingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get('session');
  const recParam = searchParams.get('rec');

  const { selectedRecipe, clearRecipe } = useRecipeStore();
  const { household, fetch: fetchHousehold } = useHouseholdStore();
  const { isListening, transcript, supported, startListening, stopListening, resetTranscript } = useVoiceInput();
  const [voiceText, setVoiceText] = useState('');
  const [nisseReply, setNisseReply] = useState('');
  const [nisseLoading, setNisseLoading] = useState(false);
  const { speak } = useSpeech();
  const cookingRef = useRef(null);

  // ── Nisse session state ──
  const [session, setSession] = useState(null);
  const [prepDone, setPrepDone] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(Boolean(sessionParam || recParam));
  const [sessionError, setSessionError] = useState(null);
  const [activeLane, setActiveLane] = useState('base');
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    if (!sessionParam && !recParam) return;
    let cancelled = false;
    (async () => {
      try {
        let s;
        if (sessionParam) {
          ({ session: s } = await cookSessions.get(sessionParam));
        } else {
          ({ session: s } = await cookSessions.start({ recommendationId: recParam }));
          // Put the session id in the URL so a reload resumes it
          router.replace(`/cooking?session=${s.id}`);
        }
        if (!cancelled) {
          setSession(s);
          fetchHousehold().catch(() => {});
        }
      } catch (err) {
        if (!cancelled) setSessionError(err.message);
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionParam, recParam]);

  // Lane-filtered recipe for CookingMode: Gemensamt = full timeline;
  // Barnens/Vuxnas = shared base + that branch only.
  const sessionRecipe = useMemo(() => {
    if (!session) return null;
    const rd = session.recipeData;
    const steps = (rd.steps || []).filter((s) =>
      activeLane === 'base' ? true : s.lane === 'base' || s.lane === activeLane
    ).map((s) => ({
      ...s,
      text: s.lane !== 'base' ? `[${s.laneLabel}] ${s.text}` : s.text,
    }));
    return { ...rd, steps };
  }, [session, activeLane]);

  const lanes = session?.timeline?.lanes || [];
  const isSplit = lanes.length > 1;

  const initialStep = useMemo(() => {
    if (!session) return 0;
    if (isSplit && session.branchState && session.branchState[activeLane] != null) {
      return session.branchState[activeLane];
    }
    return session.currentStepIndex || 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, activeLane]);

  const handleStepChange = useCallback(
    (index) => {
      if (!session) return;
      const data = isSplit
        ? { currentStepIndex: index, branchState: { ...(session.branchState || {}), [activeLane]: index } }
        : { currentStepIndex: index };
      cookSessions.update(session.id, data).catch(() => {});
    },
    [session, isSplit, activeLane]
  );

  const activeRecipe = sessionRecipe || selectedRecipe;

  useEffect(() => {
    if (!activeRecipe) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [activeRecipe]);

  const handleVoiceResult = useCallback(async (finalText) => {
    setVoiceText(finalText);
    setNisseReply('');
    setNisseLoading(true);
    try {
      const data = await cooking.speak(finalText, activeRecipe);
      const reply = data.reply ?? data.answer ?? '';
      setNisseReply(reply);
      if (reply) speak(reply);
      if (data.action === 'next_step') {
        cookingRef.current?.goNext();
      }
    } catch {
      setNisseReply('Nisse kunde inte svara just nu. Försök igen.');
    } finally {
      setNisseLoading(false);
    }
  }, [activeRecipe, speak]);

  function toggleMic() {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      setVoiceText('');
      setNisseReply('');
      startListening(handleVoiceResult);
    }
  }

  function handleClose() {
    if (session && session.status === 'ACTIVE' && !session.hasFeedback) {
      setShowFeedback(true);
      return;
    }
    clearRecipe();
    router.push(session ? '/middag' : '/');
  }

  const completeAndExit = useCallback(async () => {
    try {
      await cookSessions.update(session.id, { status: 'COMPLETED' });
    } catch {}
    clearRecipe();
    router.push('/middag');
  }, [session, clearRecipe, router]);

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#1A1A2E' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (!activeRecipe) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ background: '#1A1A2E', color: '#FFFFFF' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-5"
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <ChefHat size={28} style={{ color: 'rgba(255,255,255,0.3)' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold mb-2">{sessionError ? 'Kunde inte starta' : 'Inget recept valt'}</h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {sessionError || 'Sök efter ett recept och tryck på "Börja laga" för att starta kokläget.'}
            </p>
          </div>
          <button
            onClick={() => router.push(sessionError ? '/middag' : '/')}
            className="flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#FFF' }}
          >
            <ArrowLeft size={16} />
            Tillbaka
          </button>
        </motion.div>
      </div>
    );
  }

  const bubbleStyle = {
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  };

  return (
    <div className="relative">
      <CookingMode
        key={session ? `${session.id}-${activeLane}` : 'legacy'}
        ref={cookingRef}
        recipe={activeRecipe}
        onClose={handleClose}
        initialStep={session ? initialStep : 0}
        onStepChange={session ? handleStepChange : undefined}
      />

      {/* Nisse session overlays */}
      {session && isSplit && (
        <BranchSwitcher lanes={lanes} activeLane={activeLane} onSwitch={setActiveLane} />
      )}
      {session && <RescueSheet sessionId={session.id} onSpeak={speak} />}
      {session && <CookAdjustSheets session={session} />}

      {/* Level 1 verification before the first step (fresh sessions only) */}
      {session &&
        !prepDone &&
        session.status === 'ACTIVE' &&
        (session.currentStepIndex || 0) === 0 &&
        session.recipeData?.prep && (
          <PrepScreen session={session} onDone={() => setPrepDone(true)} />
        )}

      {showFeedback && (
        <FeedbackSheet
          sessionId={session.id}
          members={household?.members || []}
          onDone={completeAndExit}
          onSkip={completeAndExit}
        />
      )}

      {/* Voice conversation bubbles */}
      <AnimatePresence>
        {(isListening || transcript || voiceText || nisseReply || nisseLoading) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed left-4 right-4 bottom-28 z-[60] flex flex-col items-center gap-3 pointer-events-none"
          >
            {/* User bubble */}
            <div
              className="px-5 py-3 rounded-2xl text-sm text-white max-w-md text-center"
              style={{ background: 'rgba(30,41,59,0.95)', ...bubbleStyle }}
            >
              {transcript || voiceText || (
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Lyssnar...
                </span>
              )}
            </div>

            {/* Nisse reply bubble */}
            {(nisseLoading || nisseReply) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-5 py-3 rounded-2xl text-sm text-white max-w-md text-center"
                style={{ background: 'rgba(255,107,53,0.85)', ...bubbleStyle }}
              >
                {nisseLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <motion.span
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
                    >.</motion.span>
                    <motion.span
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
                    >.</motion.span>
                    <motion.span
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
                    >.</motion.span>
                  </span>
                ) : nisseReply}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating mic button */}
      {supported && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={toggleMic}
          className="fixed bottom-6 right-6 z-[60] rounded-full flex items-center justify-center"
          style={{
            width: 56,
            height: 56,
            background: isListening ? '#FF6B35' : 'rgba(255,255,255,0.1)',
            border: isListening ? '2px solid #FF6B35' : '2px solid rgba(255,255,255,0.15)',
            boxShadow: isListening ? '0 0 24px rgba(255,107,53,0.4)' : '0 4px 16px rgba(0,0,0,0.3)',
            color: '#FFF',
          }}
        >
          {isListening ? <MicOff size={22} /> : <Mic size={22} />}
          {isListening && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ border: '2px solid #FF6B35' }}
              animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </motion.button>
      )}
    </div>
  );
}

export default function CookingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: '#1A1A2E' }}>
          <Spinner size="lg" />
        </div>
      }
    >
      <CookingContent />
    </Suspense>
  );
}
