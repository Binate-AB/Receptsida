// ============================================
// Middag — "Nisse, lös middagen"
// Free text + quick chips → max 3 recommendations
// with one clearly recommended → accept → shopping
// list → guided cooking.
// ============================================

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Clock, BatteryLow, Wallet, Users, ArrowRight, Check,
  UtensilsCrossed, Zap, PiggyBank, Baby, ShoppingBag, Timer, Soup,
} from 'lucide-react';
import { useAuthStore, useHouseholdStore, useDinnerStore } from '../../lib/store';
import { useToast } from '../../components/Toast';
import { AppPageHeader } from '../../components/app/AppPageHeader';
import { Spinner } from '../../components/Spinner';

const TIME_CHIPS = [20, 30, 45, 60];
const ENERGY_CHIPS = [
  { value: 'slut', label: 'Helt slut' },
  { value: 'låg', label: 'Låg' },
  { value: 'normal', label: 'Normal' },
  { value: 'inspirerad', label: 'Vill laga ordentligt' },
];
const BUDGET_CHIPS = [
  { value: 'snålt', label: 'Så billigt som möjligt' },
  { value: 'normal', label: 'Normalt' },
  { value: 'flexibelt', label: 'Spelar mindre roll' },
];

const SLOT_META = {
  NISSE: { label: 'Nisses val', color: '#FF6B35', bg: '#FFF0EB' },
  EASIEST: { label: 'Minst jobb', color: '#5A7D6C', bg: '#EDF3EF' },
  CHEAPEST: { label: 'Billigast', color: '#B8860B', bg: '#FFF9E0' },
};

// ── Nisse's visible assumptions (level 2) ──
// One tap corrects an assumption and deterministically re-ranks.
const ENERGY_LABELS = { slut: 'helt slut', låg: 'låg ork', normal: 'normal ork', inspirerad: 'vill laga ordentligt' };
const BUDGET_LABELS = { snålt: 'billigt', normal: 'normal budget', flexibelt: 'flexibel budget' };

function AssumptionChips({ assumptions, onCorrect, correcting }) {
  const visible = (assumptions || []).filter((a) => a.level === 2);
  if (visible.length === 0) return null;

  const pantryName = (a) =>
    (a.value && typeof a.value === 'object' && a.value.name) || a.key.slice('pantry:'.length);

  const chipFor = (a) => {
    if (a.key === 'portions') {
      const n = Number(a.value) || 4;
      return {
        label: `${n} portioner`,
        actions: [
          { symbol: '−', next: Math.max(1, n - 1) },
          { symbol: '+', next: Math.min(20, n + 1) },
        ],
      };
    }
    if (a.key === 'time_budget') {
      const order = [20, 30, 45, 60, null];
      const idx = order.indexOf(a.value);
      return {
        label: a.value ? `max ${a.value} min` : 'ingen tidsgräns',
        next: order[(idx + 1) % order.length],
      };
    }
    if (a.key === 'energy') {
      const order = ['slut', 'låg', 'normal', 'inspirerad'];
      return {
        label: ENERGY_LABELS[a.value] || a.value,
        next: order[(order.indexOf(a.value) + 1) % order.length],
      };
    }
    if (a.key === 'budget') {
      const order = ['snålt', 'normal', 'flexibelt'];
      return {
        label: BUDGET_LABELS[a.value] || a.value,
        next: order[(order.indexOf(a.value) + 1) % order.length],
      };
    }
    if (a.key.startsWith('pantry:')) {
      const home = typeof a.value === 'boolean' ? a.value : a.value?.assumedHome !== false;
      return {
        label: home ? `${pantryName(a)} hemma` : `${pantryName(a)} köps`,
        next: !home,
      };
    }
    return null;
  };

  return (
    <div className="card p-4 mt-4" style={{ borderRadius: 14 }}>
      <p className="text-xs font-medium text-warm-500 mb-2">
        NISSE ANTAR — tryck för att rätta
      </p>
      <div className="flex flex-wrap gap-2">
        {visible.map((a) => {
          const chip = chipFor(a);
          if (!chip) return null;
          const style = {
            background: a.corrected ? '#EDF3EF' : '#FFFFFF',
            color: '#1A1A2E',
            border: '1px dashed #C9C9D1',
            minHeight: '36px',
          };
          if (chip.actions) {
            return (
              <span
                key={a.key}
                className="px-2 py-1.5 rounded-full text-sm font-medium inline-flex items-center gap-1"
                style={style}
              >
                <button
                  type="button"
                  disabled={correcting}
                  onClick={() => onCorrect(a.key, chip.actions[0].next)}
                  className="w-6 h-6 rounded-full font-bold"
                  style={{ background: '#F2F2F5' }}
                  aria-label="Färre portioner"
                >
                  −
                </button>
                {chip.label}
                {a.corrected && <Check size={13} className="text-warm-500" />}
                <button
                  type="button"
                  disabled={correcting}
                  onClick={() => onCorrect(a.key, chip.actions[1].next)}
                  className="w-6 h-6 rounded-full font-bold"
                  style={{ background: '#F2F2F5' }}
                  aria-label="Fler portioner"
                >
                  +
                </button>
              </span>
            );
          }
          return (
            <button
              key={a.key}
              type="button"
              disabled={correcting}
              onClick={() => onCorrect(a.key, chip.next)}
              className="px-3 py-1.5 rounded-full text-sm font-medium inline-flex items-center gap-1.5 transition-all"
              style={style}
            >
              {chip.label}
              {a.corrected && <Check size={13} className="text-warm-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChipBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 rounded-full text-sm font-medium transition-all"
      style={{
        background: active ? '#1A1A2E' : '#FFFFFF',
        color: active ? '#FFFFFF' : '#1A1A2E',
        border: '1px solid ' + (active ? 'transparent' : '#E5E5EA'),
        minHeight: '40px',
      }}
    >
      {children}
    </button>
  );
}

// ── One recommendation card ──
function RecommendationCard({ rec, onAccept, onAlternative, accepting }) {
  const slot = SLOT_META[rec.slot] || SLOT_META.NISSE;
  const c = rec.computed;
  const [expanded, setExpanded] = useState(rec.recommended);

  const okFor = c.suitability.filter((s) => s.notes.length === 0).map((s) => s.name);
  const withNotes = c.suitability.filter((s) => s.notes.length > 0);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden"
      style={{
        borderRadius: 20,
        border: rec.recommended ? '2px solid #FF6B35' : '1px solid transparent',
      }}
    >
      <button className="w-full text-left p-5" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: slot.bg, color: slot.color }}>
            {slot.label}
          </span>
          {c.branchPossible && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: '#EDF3EF', color: '#5A7D6C' }}>
              Barn- & vuxenvariant
            </span>
          )}
        </div>
        <h3 className="font-display text-xl text-warm-800 mb-1">{rec.template.title}</h3>
        <p className="text-sm text-warm-500 mb-3">{rec.motivation || rec.template.description}</p>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-warm-600">
          <span className="flex items-center gap-1"><Clock size={14} /> {c.totalTimeMin} min ({c.activeTimeMin} aktiv)</span>
          <span className="flex items-center gap-1"><Wallet size={14} /> {c.cost.totalLabel}</span>
          <span className="flex items-center gap-1"><Soup size={14} /> disk {c.dishLoad}/5</span>
          <span className="flex items-center gap-1"><Users size={14} /> {c.portions} port.</span>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-5 pb-5 space-y-3">
              <div className="text-sm">
                <p className="text-warm-500">
                  <span className="font-medium text-warm-700">Hemma:</span>{' '}
                  {c.atHome.length > 0 ? c.atHome.map((a) => a.name).join(', ') : 'inget av detta'}
                </p>
                <p className="text-warm-500">
                  <span className="font-medium text-warm-700">Att köpa:</span>{' '}
                  {c.toBuy.length > 0 ? `${c.toBuy.length} varor (ca ${c.shoppingCostSek} kr)` : 'inget!'}
                </p>
                <p className="text-warm-500">
                  <span className="font-medium text-warm-700">Passar:</span>{' '}
                  {okFor.length === c.suitability.length ? 'alla' : okFor.join(', ')}
                  {withNotes.map((s) => ` · ${s.name}: ${s.notes.join(', ')}`).join('')}
                </p>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); onAccept(rec); }}
                disabled={accepting}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {accepting ? <Spinner size="sm" /> : <Check size={18} />}
                Laga ikväll
              </button>

              <div className="flex gap-2">
                {[
                  { dir: 'enklare', label: 'Enklare', Icon: Zap },
                  { dir: 'billigare', label: 'Billigare', Icon: PiggyBank },
                  { dir: 'barnvänligare', label: 'Barnvänligare', Icon: Baby },
                ].map(({ dir, label, Icon }) => (
                  <button
                    key={dir}
                    onClick={(e) => { e.stopPropagation(); onAlternative(dir, rec.id); }}
                    className="btn-secondary flex-1 flex items-center justify-center gap-1 text-sm"
                  >
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function DinnerPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, loading: authLoading } = useAuthStore();
  const { household, fetch: fetchHousehold } = useHouseholdStore();
  const {
    recommendations, assumptions, degraded, solving, correcting,
    solve, requestAlternative, accept, accepted, correctAssumption, regenerate,
  } = useDinnerStore();

  const [freeText, setFreeText] = useState('');
  const [timeBudget, setTimeBudget] = useState(null);
  const [energy, setEnergy] = useState(null);
  const [budget, setBudget] = useState(null);
  const [eaterIds, setEaterIds] = useState(null); // null = alla
  const [acceptingId, setAcceptingId] = useState(null);

  useEffect(() => {
    if (user) fetchHousehold();
  }, [user, fetchHousehold]);

  const handleSolve = async () => {
    const chips = {};
    if (timeBudget) chips.timeBudgetMin = timeBudget;
    if (energy) chips.energy = energy;
    if (budget) chips.budget = budget;
    if (eaterIds?.length) chips.eaterIds = eaterIds;
    try {
      await solve(freeText.trim() || undefined, Object.keys(chips).length ? chips : undefined);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAccept = async (rec) => {
    setAcceptingId(rec.id);
    try {
      const result = await accept(rec.id);
      toast.success('Middagen är vald!');
      if (result.shoppingList) {
        router.push(`/inkop?list=${result.shoppingList.id}&rec=${rec.id}`);
      } else {
        router.push(`/inkop?rec=${rec.id}`);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAcceptingId(null);
    }
  };

  const handleAlternative = async (direction, replaceId) => {
    try {
      await requestAlternative(direction, replaceId);
      toast.success('Nytt förslag framme');
    } catch (err) {
      toast.error(err.code === 'no_alternative' ? err.message : 'Kunde inte hämta alternativ.');
    }
  };

  const handleCorrect = async (key, value) => {
    try {
      await correctAssumption(key, value);
      toast.success('Rättat — nya förslag framme');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRegenerate = async () => {
    try {
      await regenerate();
      toast.success('Tre nya förslag');
    } catch (err) {
      toast.error(err.code === 'no_more_options' ? err.message : 'Kunde inte hämta nya förslag.');
    }
  };

  if (authLoading) {
    return <div className="max-w-md mx-auto px-4 py-20 text-center"><Spinner size="lg" className="mx-auto" /></div>;
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <UtensilsCrossed size={48} className="text-warm-300 mx-auto mb-4" />
        <h2 className="font-display text-2xl text-warm-800 mb-2">Logga in först</h2>
        <p className="text-warm-500 mb-6">Nisse behöver ditt hushåll för att lösa middagen.</p>
        <Link href="/login?redirect=/middag" className="btn-primary inline-block">Logga in</Link>
      </div>
    );
  }

  const members = household?.members || [];
  const noHousehold = household === null || members.length === 0;

  return (
    <>
      <AppPageHeader title="Lös middagen" />
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-6 pb-32">
        {noHousehold && (
          <div className="card p-4 mb-4 flex items-center gap-3" style={{ borderRadius: 14, background: '#FFF9E0' }}>
            <Users size={20} className="text-warm-700 shrink-0" />
            <p className="text-sm text-warm-700 flex-1">
              Nisse blir mycket bättre med ert hushåll (allergier, barn, utrustning).
            </p>
            <Link href="/hushall" className="text-sm font-semibold whitespace-nowrap" style={{ color: '#FF6B35' }}>
              Skapa →
            </Link>
          </div>
        )}

        {/* Situationsinmatning */}
        <div className="card p-5 space-y-4" style={{ borderRadius: 20 }}>
          <div>
            <h1 className="font-display text-2xl text-warm-800 mb-1">Hur ser kvällen ut?</h1>
            <p className="text-sm text-warm-500">Berätta med egna ord — Nisse löser resten.</p>
          </div>

          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder={'T.ex. "Vi är två vuxna och två barn, jag är trött och vill vara klar på 25 minuter. Barnen vill inte ha starkt."'}
            rows={3}
            className="input-field w-full resize-none"
          />

          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-warm-500 mb-1.5 flex items-center gap-1"><Timer size={12} /> TID</p>
              <div className="flex flex-wrap gap-2">
                {TIME_CHIPS.map((t) => (
                  <ChipBtn key={t} active={timeBudget === t} onClick={() => setTimeBudget(timeBudget === t ? null : t)}>
                    Max {t} min
                  </ChipBtn>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-warm-500 mb-1.5 flex items-center gap-1"><BatteryLow size={12} /> ORK</p>
              <div className="flex flex-wrap gap-2">
                {ENERGY_CHIPS.map((e) => (
                  <ChipBtn key={e.value} active={energy === e.value} onClick={() => setEnergy(energy === e.value ? null : e.value)}>
                    {e.label}
                  </ChipBtn>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-warm-500 mb-1.5 flex items-center gap-1"><Wallet size={12} /> BUDGET</p>
              <div className="flex flex-wrap gap-2">
                {BUDGET_CHIPS.map((b) => (
                  <ChipBtn key={b.value} active={budget === b.value} onClick={() => setBudget(budget === b.value ? null : b.value)}>
                    {b.label}
                  </ChipBtn>
                ))}
              </div>
            </div>
            {members.length > 1 && (
              <div>
                <p className="text-xs font-medium text-warm-500 mb-1.5 flex items-center gap-1"><Users size={12} /> VILKA ÄTER?</p>
                <div className="flex flex-wrap gap-2">
                  <ChipBtn active={eaterIds === null} onClick={() => setEaterIds(null)}>Alla</ChipBtn>
                  {members.map((m) => (
                    <ChipBtn
                      key={m.id}
                      active={eaterIds?.includes(m.id) || false}
                      onClick={() => {
                        const current = eaterIds || [];
                        const next = current.includes(m.id) ? current.filter((x) => x !== m.id) : [...current, m.id];
                        setEaterIds(next.length ? next : null);
                      }}
                    >
                      {m.name}
                    </ChipBtn>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleSolve}
            disabled={solving || (!freeText.trim() && !timeBudget && !energy && !budget)}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {solving ? <Spinner size="sm" /> : <Sparkles size={18} />}
            {solving ? 'Nisse tänker…' : 'Nisse, lös middagen'}
          </button>
        </div>

        {/* Resultat */}
        {degraded && (
          <p className="text-sm text-warm-500 mt-4 text-center">{degraded}</p>
        )}

        {recommendations.length > 0 && (
          <AssumptionChips
            assumptions={assumptions}
            onCorrect={handleCorrect}
            correcting={correcting}
          />
        )}

        <div className="space-y-4 mt-6" style={{ opacity: correcting ? 0.5 : 1, transition: 'opacity 150ms' }}>
          <AnimatePresence>
            {recommendations.map((rec) => (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                onAccept={handleAccept}
                onAlternative={handleAlternative}
                accepting={acceptingId === rec.id}
              />
            ))}
          </AnimatePresence>
        </div>

        {recommendations.length > 0 && !accepted && (
          <button
            onClick={handleRegenerate}
            disabled={solving || correcting}
            className="btn-secondary w-full mt-4 flex items-center justify-center gap-2"
          >
            {solving ? <Spinner size="sm" /> : <UtensilsCrossed size={16} />}
            Inget av dessa — visa tre nya
          </button>
        )}

        {accepted?.shoppingList && (
          <div className="card p-4 mt-4 flex items-center gap-3" style={{ borderRadius: 14 }}>
            <ShoppingBag size={20} className="text-warm-700" />
            <p className="text-sm text-warm-700 flex-1">Inköpslistan är klar.</p>
            <Link href={`/inkop?list=${accepted.shoppingList.id}`} className="text-sm font-semibold flex items-center gap-1" style={{ color: '#FF6B35' }}>
              Öppna <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
