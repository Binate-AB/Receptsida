// ============================================
// CookingMode — "Private Chef" Experience
// Mobile-first, voice-first, Nisse as a cooking companion
// Bottom-sheet chat, contextual quick-questions,
// prominent mic button, step-aware AI context
// ============================================

'use client';

import { useState, useEffect, useCallback, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronLeft, ChevronRight, Play, Pause,
  RotateCcw, Check, Mic, MicOff, Volume2, VolumeX,
  Send, ChefHat, Sparkles, AlertTriangle,
  GraduationCap, Wrench,
} from 'lucide-react';
import { getStepText, getStepDuration, getStepVoiceCue } from '../data/recipes';
import { useSpeech, useVoiceInput } from '../hooks/useVoice';
import { useCookingAssistant } from '../hooks/useRecipes';
import { Spinner } from './Spinner';

// ── Design tokens ──
const DARK_CARD = 'rgba(255,255,255,0.06)';
const DARK_BORDER = 'rgba(255,255,255,0.08)';
const CORAL = '#FF6B35';
const TEAL = '#2ABFBF';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Contextual quick-question suggestions per step ──
function getQuickQuestions(step) {
  const text = getStepText(step).toLowerCase();
  const questions = [];

  questions.push('Kan du förklara det här steget enklare?');

  if (text.includes('stek') || text.includes('fräs'))
    questions.push('Hur vet jag att pannan är tillräckligt varm?');
  if (text.includes('kok') || text.includes('sjud'))
    questions.push('Vad är skillnaden mellan koka och sjuda?');
  if (text.includes('ugn'))
    questions.push('Varmluft eller över-/undervärme?');
  if (text.includes('skär') || text.includes('hacka'))
    questions.push('Visa mig rätt skärteknik');
  if (text.includes('krydda') || text.includes('salt') || text.includes('peppar'))
    questions.push('Hur mycket krydda ska jag ta?');
  if (text.includes('grädde') || text.includes('sås'))
    questions.push('Hur gör jag såsen tjockare?');
  if (text.includes('kyckling') || text.includes('fläsk') || text.includes('kött'))
    questions.push('Vilken innertemperatur ska det vara?');

  if (questions.length < 3) {
    questions.push('Vad kan jag göra under tiden?');
  }

  return questions.slice(0, 3);
}

// ═══════════════════════════════════════════
// Countdown Timer (ring style)
// ═══════════════════════════════════════════

function CountdownTimer({ duration, onComplete }) {
  const [remaining, setRemaining] = useState(duration);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => { setRemaining(duration); setIsRunning(false); }, [duration]);

  useEffect(() => {
    if (isRunning && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) { clearInterval(intervalRef.current); setIsRunning(false); onComplete?.(); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, remaining, onComplete]);

  const progress = duration > 0 ? ((duration - remaining) / duration) * 100 : 0;
  const circumference = 2 * Math.PI * 46;
  const isPulsing = remaining > 0 && remaining <= 30 && isRunning;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: 104, height: 104 }}>
        <svg className="-rotate-90" width="104" height="104" viewBox="0 0 104 104">
          <circle cx="52" cy="52" r="46" fill="none" stroke={DARK_BORDER} strokeWidth="3" />
          <circle cx="52" cy="52" r="46" fill="none" stroke={CORAL} strokeWidth="3"
            strokeLinecap="round"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: circumference - (progress / 100) * circumference,
              transition: 'stroke-dashoffset 0.3s ease',
            }}
          />
        </svg>
        <div className={`absolute inset-0 flex items-center justify-center ${isPulsing ? 'animate-pulse' : ''}`}>
          {remaining === 0 ? (
            <Check size={28} style={{ color: CORAL }} />
          ) : (
            <span style={{ fontSize: 32, fontWeight: 700, color: '#FFF', fontFamily: 'monospace' }}>
              {formatTime(remaining)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => { setRemaining(duration); setIsRunning(false); }}
          className="p-2 rounded-full" style={{ background: DARK_CARD, color: 'rgba(255,255,255,0.5)' }}>
          <RotateCcw size={14} />
        </button>
        <button onClick={() => setIsRunning(!isRunning)}
          className="p-3 rounded-full text-white" style={{ background: CORAL, boxShadow: `0 4px 20px ${CORAL}40` }}>
          {isRunning ? <Pause size={16} /> : <Play size={16} />}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Nisse Chat Bottom Sheet (mobile-first)
// ═══════════════════════════════════════════

function NisseChat({
  isOpen, onClose, messages, loading, onSend,
  chatInput, setChatInput, quickQuestions, onQuickQuestion,
}) {
  const chatEndRef = useRef(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={onClose}
          />

          {/* Bottom sheet */}
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 35 }}
            className="absolute bottom-0 left-0 right-0 z-50 flex flex-col"
            style={{
              maxHeight: '70dvh',
              borderRadius: '24px 24px 0 0',
              background: '#1E293B',
              border: `1px solid ${DARK_BORDER}`,
              borderBottom: 'none',
            }}
          >
            {/* Handle + header */}
            <div className="flex flex-col items-center pt-3 pb-2 px-5">
              <div className="w-10 h-1 rounded-full mb-3" style={{ background: 'rgba(255,255,255,0.15)' }} />
              <div className="flex items-center gap-2 w-full">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${CORAL}20` }}>
                  <Sparkles size={14} style={{ color: CORAL }} />
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-bold text-white">Nisse — Din kockassistent</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Fråga mig vad som helst om receptet
                  </p>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Quick question chips */}
            {messages.length === 0 && quickQuestions.length > 0 && (
              <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-none">
                {quickQuestions.map((q, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    onClick={() => onQuickQuestion(q)}
                    className="flex-shrink-0 px-3.5 py-2 rounded-xl text-[12px] font-medium whitespace-nowrap"
                    style={{
                      background: `${CORAL}15`,
                      color: CORAL,
                      border: `1px solid ${CORAL}25`,
                    }}
                  >
                    {q}
                  </motion.button>
                ))}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 min-h-[120px]">
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <ChefHat size={28} style={{ color: 'rgba(255,255,255,0.12)' }} className="mx-auto mb-2" />
                  <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Ställ en fråga eller tryck på en snabbfråga ovan
                  </p>
                </div>
              )}
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div style={{
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    fontSize: 14,
                    lineHeight: 1.5,
                    background: msg.role === 'user' ? `${CORAL}25` : DARK_CARD,
                    color: '#FFF',
                  }}>
                    {msg.content}
                  </div>
                </motion.div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl"
                    style={{ background: DARK_CARD, color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                    <Spinner size="sm" />
                    Nisse tänker...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => { e.preventDefault(); onSend(); }}
              className="px-4 py-3"
              style={{ borderTop: `1px solid ${DARK_BORDER}`, paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Fråga Nisse..."
                  disabled={loading}
                  className="flex-1 focus:outline-none"
                  style={{
                    padding: '10px 14px',
                    borderRadius: 14,
                    background: DARK_CARD,
                    border: `1px solid ${DARK_BORDER}`,
                    color: '#FFF',
                    fontSize: 14,
                  }}
                />
                <button
                  type="submit"
                  disabled={loading || !chatInput.trim()}
                  className="rounded-xl disabled:opacity-30 transition-opacity"
                  style={{ padding: 10, background: CORAL, color: '#FFF' }}
                >
                  <Send size={16} />
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════
// Main CookingMode Component
// ═══════════════════════════════════════════

export const CookingMode = forwardRef(function CookingMode({ recipe, onClose, initialStep = 0, onStepChange }, ref) {
  const [currentStep, setCurrentStep] = useState(initialStep);

  // Report step changes to parent (Nisse cook sessions persist progress)
  useEffect(() => {
    onStepChange?.(currentStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const { speak, stop: stopSpeech } = useSpeech();
  const { isListening, supported: voiceSupported, startListening, stopListening } = useVoiceInput();
  const { messages, loading: chatLoading, ask } = useCookingAssistant(recipe);

  const steps = recipe.steps || [];
  const step = steps[currentStep];
  const totalSteps = steps.length;
  const progress = totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0;
  const stepText = getStepText(step);
  const stepDuration = getStepDuration(step);
  const voiceCue = getStepVoiceCue(step);

  const quickQuestions = useMemo(() => getQuickQuestions(step), [step]);

  const stepWarning = typeof step === 'object' ? step?.warning : null;
  const beginnerTip = typeof step === 'object' ? step?.beginner_tip : null;

  useEffect(() => {
    if (voiceEnabled && voiceCue) {
      speak(`Steg ${currentStep + 1}. ${voiceCue}`);
    }
  }, [currentStep, voiceEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const goNext = useCallback(() => {
    setCompletedSteps((prev) => new Set([...prev, currentStep]));
    if (currentStep < totalSteps - 1) setCurrentStep((s) => s + 1);
  }, [currentStep, totalSteps]);

  useImperativeHandle(ref, () => ({ goNext }), [goNext]);

  const goPrev = useCallback(() => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  useEffect(() => {
    function handleKey(e) {
      if (showChat && e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev, onClose, showChat]);

  const handleVoiceCommand = useCallback((transcript) => {
    const lower = transcript.toLowerCase();
    if (lower.includes('nästa') || lower.includes('next')) goNext();
    else if (lower.includes('tillbaka') || lower.includes('föregående')) goPrev();
    else {
      const ctx = { currentStep, totalSteps, inputMode: 'voice' };
      ask(transcript, ctx).then((answer) => { if (answer && voiceEnabled) speak(answer); });
      setShowChat(true);
    }
  }, [goNext, goPrev, ask, voiceEnabled, speak, currentStep, totalSteps]);

  function toggleVoiceListening() {
    if (isListening) stopListening();
    else startListening(handleVoiceCommand);
  }

  async function handleSendChat() {
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput;
    setChatInput('');
    const ctx = { currentStep, totalSteps, inputMode: voiceEnabled ? 'voice' : 'text' };
    const answer = await ask(question, ctx);
    if (answer && voiceEnabled) speak(answer);
  }

  async function handleQuickQuestion(question) {
    const ctx = { currentStep, totalSteps, inputMode: voiceEnabled ? 'voice' : 'text' };
    const answer = await ask(question, ctx);
    if (answer && voiceEnabled) speak(answer);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="hud-mode flex flex-col relative"
    >
      {/* ── Progress bar ── */}
      <div style={{ height: 3, background: DARK_CARD }}>
        <motion.div
          style={{ height: '100%', background: CORAL, borderRadius: 2 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${DARK_BORDER}` }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${CORAL}15` }}>
            <ChefHat size={16} style={{ color: CORAL }} />
          </div>
          <div>
            <h2 className="text-[14px] font-bold text-white leading-tight">{recipe.title}</h2>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Steg {currentStep + 1} av {totalSteps}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setVoiceEnabled(!voiceEnabled); if (voiceEnabled) stopSpeech(); }}
            className="p-2 rounded-xl transition-all"
            style={{
              background: voiceEnabled ? `${CORAL}15` : 'transparent',
              color: voiceEnabled ? CORAL : 'rgba(255,255,255,0.4)',
            }}
          >
            {voiceEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button onClick={onClose} className="p-2 rounded-xl" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto">
        {/* Step dots — pill style for active */}
        <div className="flex items-center gap-1.5 mb-6">
          {steps.map((_, idx) => (
            <button key={idx} onClick={() => setCurrentStep(idx)}
              className="rounded-full transition-all"
              style={{
                width: idx === currentStep ? 24 : 8,
                height: 8,
                background: idx === currentStep ? CORAL
                  : completedSteps.has(idx) ? `${CORAL}60`
                  : 'rgba(255,255,255,0.15)',
                boxShadow: idx === currentStep ? `0 0 10px ${CORAL}50` : 'none',
              }}
            />
          ))}
        </div>

        {/* Step text — animated transition */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
            transition={{ duration: 0.3 }}
            className="text-center max-w-md mb-6"
          >
            <p className="text-[22px] sm:text-[26px] font-bold text-white leading-snug">
              {stepText}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Step warnings & tips inline */}
        {(stepWarning || beginnerTip) && (
          <div className="flex flex-col gap-2 mb-6 max-w-sm w-full">
            {stepWarning && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-2.5 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(255,107,53,0.1)', border: `1px solid ${CORAL}25` }}
              >
                <AlertTriangle size={14} style={{ color: CORAL }} className="flex-shrink-0 mt-0.5" />
                <p className="text-[12px] leading-relaxed" style={{ color: '#FFAA85' }}>{stepWarning}</p>
              </motion.div>
            )}
            {beginnerTip && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 }}
                className="flex items-start gap-2.5 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(42,191,191,0.08)', border: `1px solid ${TEAL}20` }}
              >
                <GraduationCap size={14} style={{ color: TEAL }} className="flex-shrink-0 mt-0.5" />
                <p className="text-[12px] leading-relaxed" style={{ color: '#7DD3D3' }}>{beginnerTip}</p>
              </motion.div>
            )}
          </div>
        )}

        {/* Timer */}
        {stepDuration && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mb-6">
            <CountdownTimer
              key={currentStep}
              duration={stepDuration}
              onComplete={() => { if (voiceEnabled) speak('Tiden är ute! Gå vidare till nästa steg.'); }}
            />
          </motion.div>
        )}

        {/* Equipment list on first step */}
        {recipe.tools?.length > 0 && currentStep === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap gap-2 justify-center mb-4 max-w-sm"
          >
            {recipe.tools.map((tool, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium"
                style={{ background: DARK_CARD, color: 'rgba(255,255,255,0.5)', border: `1px solid ${DARK_BORDER}` }}>
                <Wrench size={10} />
                {typeof tool === 'string' ? tool : tool.name}
              </span>
            ))}
          </motion.div>
        )}
      </div>

      {/* ── Bottom control bar ── */}
      <div className="px-5 py-4 flex flex-col gap-3" style={{ borderTop: `1px solid ${DARK_BORDER}` }}>
        {/* Voice + Chat row */}
        <div className="flex items-center justify-center gap-4">
          {/* Previous */}
          <button onClick={goPrev} disabled={currentStep === 0}
            className="p-3 rounded-xl disabled:opacity-20 transition-opacity"
            style={{ color: 'rgba(255,255,255,0.5)' }}>
            <ChevronLeft size={22} />
          </button>

          {/* Mic button — the HERO interaction */}
          {voiceSupported && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={toggleVoiceListening}
              className="relative rounded-full transition-all"
              style={{
                width: 64,
                height: 64,
                background: isListening ? CORAL : DARK_CARD,
                border: isListening ? `2px solid ${CORAL}` : '2px solid rgba(255,255,255,0.15)',
                boxShadow: isListening ? `0 0 30px ${CORAL}50` : 'none',
                color: isListening ? '#FFF' : 'rgba(255,255,255,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isListening ? <MicOff size={24} /> : <Mic size={24} />}
              {isListening && (
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ border: `2px solid ${CORAL}` }}
                  animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
            </motion.button>
          )}

          {/* Chat toggle — "Fråga Nisse" */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowChat(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl text-[13px] font-semibold transition-all"
            style={{
              background: `${CORAL}15`,
              color: CORAL,
              border: `1px solid ${CORAL}25`,
            }}
          >
            <Sparkles size={14} />
            Fråga Nisse
            {messages.length > 0 && (
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: CORAL }}>
                {messages.filter((m) => m.role === 'assistant').length}
              </span>
            )}
          </motion.button>

          {/* Next / Done */}
          {currentStep === totalSteps - 1 ? (
            <button onClick={onClose}
              className="px-5 py-3 rounded-xl font-semibold text-[13px] text-white transition-all"
              style={{ background: CORAL, boxShadow: `0 4px 16px ${CORAL}40` }}>
              Klar!
            </button>
          ) : (
            <button onClick={goNext}
              className="p-3 rounded-xl transition-opacity"
              style={{ color: 'rgba(255,255,255,0.5)' }}>
              <ChevronRight size={22} />
            </button>
          )}
        </div>

        {/* Hint text */}
        <p className="text-center text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
          {isListening ? 'Lyssnar — säg "nästa", "tillbaka", eller ställ en fråga'
            : voiceSupported ? 'Tryck på mikrofonen för att prata med Nisse'
            : 'Piltangenter för att navigera'}
        </p>
      </div>

      {/* ── Nisse Chat Bottom Sheet ── */}
      <NisseChat
        isOpen={showChat}
        onClose={() => setShowChat(false)}
        messages={messages}
        loading={chatLoading}
        onSend={handleSendChat}
        chatInput={chatInput}
        setChatInput={setChatInput}
        quickQuestions={quickQuestions}
        onQuickQuestion={handleQuickQuestion}
      />
    </motion.div>
  );
});
