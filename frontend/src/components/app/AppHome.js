// ============================================
// AppHome — Decision Engine / Command Center
// "OpenAI for Food" — minimal, tool-like,
// ingredient-first with Nisse AI presence
// ============================================

'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, ArrowRight, Sparkles, Zap, Trash2, Flame, Package, List, Type, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '../../lib/store';
import { NisseLogo } from '../NisseLogo';

// ── Scenario quick-action chips (Lucide icons, no emojis) ──

const SCENARIOS = [
  { id: 'snabbt', label: 'Snabbt & Billigt', Icon: Zap },
  { id: 'tom-kylen', label: 'Töm kylen', Icon: Trash2 },
  { id: 'middag', label: 'Middag för två', Icon: Flame },
  { id: 'matlador', label: 'Perfekt för matlådor', Icon: Package },
];

// ── Animation variants (spring-based) ──

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 30 },
  },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};

// ── Component ──

export function AppHome({ onSearch, onStartSearch }) {
  const { user } = useAuthStore();
  const [inputMode, setInputMode] = useState('ingredients'); // 'ingredients' | 'freetext'
  const [ingredients, setIngredients] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [freeText, setFreeText] = useState('');
  const [activeScenario, setActiveScenario] = useState(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const inputRef = useRef(null);
  const freeTextRef = useRef(null);

  const firstName = user?.name ? user.name.split(' ')[0] : 'där';

  // ── Ingredient management ──

  const addIngredient = useCallback((text) => {
    const cleaned = text.trim().toLowerCase();
    if (cleaned && !ingredients.includes(cleaned)) {
      setIngredients((prev) => [...prev, cleaned]);
    }
  }, [ingredients]);

  const removeIngredient = useCallback((ingredient) => {
    setIngredients((prev) => prev.filter((i) => i !== ingredient));
  }, []);

  const handleInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) {
        addIngredient(inputValue);
        setInputValue('');
      }
    }
    if (e.key === 'Backspace' && !inputValue && ingredients.length > 0) {
      removeIngredient(ingredients[ingredients.length - 1]);
    }
  }, [inputValue, ingredients, addIngredient, removeIngredient]);

  // Comma-to-tag: when user types comma, convert text to a tag
  // (space no longer triggers tag — allows multi-word ingredients like "krossade tomater")
  const handleInputChange = useCallback((e) => {
    const val = e.target.value;
    if (val.endsWith(',')) {
      const cleaned = val.slice(0, -1).trim();
      if (cleaned) {
        addIngredient(cleaned);
        setInputValue('');
      }
    } else {
      setInputValue(val);
    }
  }, [addIngredient]);

  // ── Scenario chips ──

  const handleScenarioTap = useCallback((scenario) => {
    import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => {
      Haptics.impact({ style: ImpactStyle.Light });
    }).catch(() => {});

    setActiveScenario((prev) => (prev === scenario.id ? null : scenario.id));
  }, []);

  // ── Mode toggle ──

  const handleModeSwitch = useCallback((mode) => {
    import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => {
      Haptics.impact({ style: ImpactStyle.Light });
    }).catch(() => {});
    setInputMode(mode);
  }, []);

  // ── Execute search ──

  const handleExecute = useCallback(() => {
    import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => {
      Haptics.impact({ style: ImpactStyle.Medium });
    }).catch(() => {});

    if (inputMode === 'freetext' && freeText.trim()) {
      onSearch?.(freeText.trim());
    } else if (ingredients.length > 0) {
      onSearch?.(ingredients.join(', '));
    } else if (activeScenario) {
      const scenario = SCENARIOS.find((s) => s.id === activeScenario);
      onSearch?.(scenario?.label || '');
    }
  }, [inputMode, freeText, ingredients, activeScenario, onSearch]);

  const canExecute =
    (inputMode === 'freetext' && freeText.trim().length > 0) ||
    (inputMode === 'ingredients' && ingredients.length > 0) ||
    activeScenario;

  return (
    <div className="h-full flex flex-col" style={{ background: '#EBEDF0' }}>
      <motion.div
        className="flex-1 flex flex-col justify-center px-6 pb-12"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        {/* ═══ NISSE AVATAR — glowing circle with breathing animation ═══ */}
        <motion.div variants={fadeUp} className="flex justify-center mb-5">
          <motion.div
            className="relative rounded-full flex items-center justify-center"
            style={{
              width: 80,
              height: 80,
              background: 'radial-gradient(circle, rgba(255,107,53,0.12) 0%, rgba(255,107,53,0.04) 60%, transparent 100%)',
              boxShadow: '0 0 32px rgba(255,107,53,0.15), 0 0 64px rgba(255,107,53,0.08)',
            }}
            animate={{
              boxShadow: [
                '0 0 32px rgba(255,107,53,0.15), 0 0 64px rgba(255,107,53,0.08)',
                '0 0 40px rgba(255,107,53,0.25), 0 0 80px rgba(255,107,53,0.12)',
                '0 0 32px rgba(255,107,53,0.15), 0 0 64px rgba(255,107,53,0.08)',
              ],
              scale: [1, 1.04, 1],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <NisseLogo variant="icon" size={52} animated />
          </motion.div>
        </motion.div>

        {/* ═══ HEADLINE ═══ */}
        <motion.div variants={fadeUp} className="text-center mb-8">
          <h1
            className="font-display text-[32px] font-bold leading-tight tracking-tight mb-2"
            style={{ color: '#1A1A1A' }}
          >
            {firstName ? `Köket är ditt, ${firstName}.` : 'Köket är ditt.'}
          </h1>
          <p className="font-body text-[14px] text-warm-400 max-w-[280px] mx-auto leading-relaxed">
            Jag är din personliga kock. Berätta vad du har hemma, så fixar vi resten.
          </p>
        </motion.div>

        {/* ═══ LÖS MIDDAGEN — primary CTA banner ═══ */}
        <motion.div variants={fadeUp} className="mb-4">
          <Link
            href="/middag"
            className="flex items-center gap-3 p-4 rounded-2xl"
            style={{
              background: '#1A1A2E',
              boxShadow: '0 10px 30px rgba(26,26,46,0.25)',
            }}
          >
            <span
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: '#FF6B35' }}
            >
              <UtensilsCrossed size={20} className="text-white" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-white font-semibold text-[15px]">Vad ska ni äta ikväll?</span>
              <span className="block text-white/60 text-[12px]">Berätta hur kvällen ser ut — Nisse löser resten.</span>
            </span>
            <ArrowRight size={18} className="text-white/70 shrink-0" />
          </Link>
        </motion.div>

        {/* ═══ MODE TOGGLE — Switch between ingredients and free text ═══ */}
        <motion.div variants={fadeUp} className="mb-3">
          <div
            className="flex mx-auto p-1 rounded-full"
            style={{
              background: '#E0E2E6',
              width: 'fit-content',
            }}
          >
            <button
              onClick={() => handleModeSwitch('ingredients')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full
                       text-[13px] font-medium transition-all duration-200"
              style={{
                background: inputMode === 'ingredients' ? '#FFFFFF' : 'transparent',
                color: inputMode === 'ingredients' ? '#1A1A1A' : '#8E8E93',
                boxShadow: inputMode === 'ingredients'
                  ? '0 1px 3px rgba(0,0,0,0.1)'
                  : 'none',
              }}
            >
              <List size={14} strokeWidth={1.5} />
              Ingredienser
            </button>
            <button
              onClick={() => handleModeSwitch('freetext')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full
                       text-[13px] font-medium transition-all duration-200"
              style={{
                background: inputMode === 'freetext' ? '#FFFFFF' : 'transparent',
                color: inputMode === 'freetext' ? '#1A1A1A' : '#8E8E93',
                boxShadow: inputMode === 'freetext'
                  ? '0 1px 3px rgba(0,0,0,0.1)'
                  : 'none',
              }}
            >
              <Type size={14} strokeWidth={1.5} />
              Beskriv rätt
            </button>
          </div>
        </motion.div>

        {/* ═══ MASTER PROMPT — Input area ═══ */}
        <motion.div variants={fadeUp} className="mb-6">
          <AnimatePresence mode="wait">
            {inputMode === 'ingredients' ? (
              <motion.div
                key="ingredients-input"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="bg-white w-full min-h-[80px] flex flex-wrap items-center gap-2 cursor-text"
                style={{
                  borderRadius: '20px',
                  padding: '16px 20px',
                  boxShadow: '0 30px 60px -12px rgba(50,50,93,0.12), 0 18px 36px -18px rgba(0,0,0,0.15)',
                  border: isInputFocused
                    ? '2px solid rgba(255,107,53,0.5)'
                    : '1.5px solid rgba(255,107,53,0.25)',
                }}
                onClick={() => inputRef.current?.focus()}
              >
                {/* Ingredient tags — accent color when active */}
                <AnimatePresence mode="popLayout">
                  {ingredients.map((ingredient) => (
                    <motion.span
                      key={ingredient}
                      layout
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                               text-[13px] font-medium select-none"
                      style={{
                        background: '#FFF0E8',
                        color: '#FF6B35',
                      }}
                    >
                      {ingredient}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeIngredient(ingredient);
                        }}
                        className="flex items-center justify-center w-4 h-4 rounded-full
                                 transition-colors"
                        style={{ background: 'rgba(255,107,53,0.15)' }}
                      >
                        <X size={10} strokeWidth={2.5} style={{ color: '#FF6B35' }} />
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>

                {/* Text input with custom two-line placeholder */}
                <div className="flex-1 min-w-[120px] relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleInputKeyDown}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    placeholder={ingredients.length > 0 ? 'Lägg till fler...' : ''}
                    className="w-full bg-transparent border-none outline-none relative z-10
                             text-warm-800 placeholder:text-warm-400 font-body text-[17px]"
                    style={{ caretColor: '#FF6B35' }}
                  />
                  {/* Custom two-line placeholder when empty */}
                  {!inputValue && ingredients.length === 0 && (
                    <div
                      className="absolute inset-0 flex items-center pointer-events-none font-body text-[15px] leading-snug"
                      style={{ color: '#9CA3AF' }}
                    >
                      <span>
                        Skriv en ingrediens,
                        <br />
                        tryck Enter eller komma...
                      </span>
                    </div>
                  )}
                  {!inputValue && !isInputFocused && ingredients.length === 0 && (
                    <span className="blink-caret" />
                  )}
                </div>

                {/* Mic icon */}
                <button
                  className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                           transition-colors"
                  style={{ background: '#F0F1F3' }}
                  aria-label="Röstinmatning"
                >
                  <Mic size={16} className="text-warm-400" strokeWidth={1.5} />
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="freetext-input"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="bg-white w-full"
                style={{
                  borderRadius: '20px',
                  padding: '14px 16px',
                  boxShadow: '0 30px 60px -12px rgba(50,50,93,0.12), 0 18px 36px -18px rgba(0,0,0,0.15)',
                  border: '1px solid #D1D5DB',
                }}
                onClick={() => freeTextRef.current?.focus()}
              >
                <textarea
                  ref={freeTextRef}
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder={'Beskriv vad du vill laga, t.ex. "Jag vill göra en krämig pasta med kyckling och svamp"'}
                  rows={3}
                  className="w-full bg-transparent border-none outline-none resize-none
                           text-warm-800 placeholder:text-warm-300 font-body text-[15px] leading-relaxed"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ═══ SCENARIO CHIPS (Lucide icons, no emojis) ═══ */}
        <motion.div variants={fadeUp} className="mb-8">
          <div className="flex flex-wrap gap-2.5 justify-center">
            {SCENARIOS.map((scenario) => {
              const active = activeScenario === scenario.id;
              const ScenarioIcon = scenario.Icon;
              return (
                <motion.button
                  key={scenario.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleScenarioTap(scenario)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full
                           text-[13px] font-medium whitespace-nowrap
                           transition-all duration-200"
                  style={{
                    background: active ? '#FF6B35' : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#48484A',
                    boxShadow: active
                      ? '0 8px 24px rgba(255,107,53,0.3)'
                      : '0 30px 60px -12px rgba(50,50,93,0.08), 0 18px 36px -18px rgba(0,0,0,0.1)',
                    border: active ? '1px solid transparent' : '1px solid #D1D5DB',
                  }}
                >
                  <ScenarioIcon
                    size={15}
                    strokeWidth={1.5}
                    style={{ color: active ? '#FFFFFF' : '#8E8E93' }}
                  />
                  {scenario.label}
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* ═══ EXECUTE BUTTON — Vibrant accent ═══ */}
        <motion.div variants={fadeUp} className="flex justify-center">
          <AnimatePresence>
            {canExecute && (
              <motion.button
                initial={{ scale: 0.9, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 10 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                onClick={handleExecute}
                className="execute-glow inline-flex items-center gap-2.5 px-8 py-4 rounded-full
                         font-body font-semibold text-[15px] text-white"
                style={{
                  background: '#FF6B35',
                  boxShadow: '0 8px 32px rgba(255,107,53,0.35)',
                }}
              >
                <Sparkles size={18} strokeWidth={2} />
                Hitta recept
                <ArrowRight size={16} strokeWidth={2.5} />
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  );
}

