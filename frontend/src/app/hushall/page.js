// ============================================
// Hushåll — Nisse household profile wizard
// 3 steps: members (allergies = absolute rules) →
// equipment/skill → what's at home. Short by design;
// Nisse learns the rest from actual use.
// ============================================

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, ChefHat, Refrigerator, Plus, X, Check, ArrowRight, ArrowLeft, Trash2 } from 'lucide-react';
import { useAuthStore, useHouseholdStore } from '../../lib/store';
import { useToast } from '../../components/Toast';
import { AppPageHeader } from '../../components/app/AppPageHeader';
import { Spinner } from '../../components/Spinner';

const AGE_LABELS = { BABY: 'Bebis', CHILD: 'Barn', TEEN: 'Tonåring', ADULT: 'Vuxen', SENIOR: 'Senior' };
const SPICE_LABELS = { NONE: 'Ingen stark mat', MILD: 'Mild', MEDIUM: 'Medel', HOT: 'Gillar starkt' };
const SKILL_LABELS = { BEGINNER: 'Nybörjare', INTERMEDIATE: 'Van hemmakock', ADVANCED: 'Erfaren' };

// ── Small shared chip button ──
function Chip({ active, onClick, children, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 rounded-full text-sm font-medium transition-all"
      style={{
        background: active ? (danger ? '#FF3B30' : '#1A1A2E') : '#FFFFFF',
        color: active ? '#FFFFFF' : '#1A1A2E',
        border: '1px solid ' + (active ? 'transparent' : '#E5E5EA'),
        minHeight: '40px',
      }}
    >
      {children}
    </button>
  );
}

// ── Member form (add/edit) ──
function MemberForm({ meta, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [ageCategory, setAgeCategory] = useState('ADULT');
  const [allergies, setAllergies] = useState([]);
  const [dietary, setDietary] = useState([]);
  const [spice, setSpice] = useState('MEDIUM');
  const [disliked, setDisliked] = useState([]);
  const [dislikeInput, setDislikeInput] = useState('');
  const [saving, setSaving] = useState(false);

  const toggle = (list, setList, value) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const addDislike = () => {
    const clean = dislikeInput.trim().toLowerCase();
    if (clean && !disliked.includes(clean)) setDisliked([...disliked, clean]);
    setDislikeInput('');
  };

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        ageCategory,
        allergies,
        dietaryRestrictions: dietary,
        dislikedIngredients: disliked,
        spiceTolerance: spice,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-5 space-y-4"
      style={{ background: '#FFFFFF', borderRadius: 16 }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Namn"
        className="input-field w-full"
        autoFocus
      />

      <div>
        <p className="text-sm font-medium text-warm-800 mb-2">Ålder</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(AGE_LABELS).map(([key, label]) => (
            <Chip key={key} active={ageCategory === key} onClick={() => setAgeCategory(key)}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-warm-800 mb-1">Allergier</p>
        <p className="text-xs text-warm-500 mb-2">
          Absoluta regler — Nisse föreslår aldrig något med dessa.
        </p>
        <div className="flex flex-wrap gap-2">
          {(meta?.allergens || []).map((a) => (
            <Chip
              key={a.code}
              danger
              active={allergies.includes(a.code)}
              onClick={() => toggle(allergies, setAllergies, a.code)}
            >
              {a.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-warm-800 mb-2">Kost</p>
        <div className="flex flex-wrap gap-2">
          {(meta?.dietaryRestrictions || []).map((d) => (
            <Chip key={d} active={dietary.includes(d)} onClick={() => toggle(dietary, setDietary, d)}>
              {d}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-warm-800 mb-2">Stark mat</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(SPICE_LABELS).map(([key, label]) => (
            <Chip key={key} active={spice === key} onClick={() => setSpice(key)}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-warm-800 mb-2">Äter helst inte</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {disliked.map((d) => (
            <span key={d} className="px-3 py-1.5 rounded-full text-sm bg-cream-200 text-warm-700 flex items-center gap-1">
              {d}
              <button onClick={() => setDisliked(disliked.filter((x) => x !== d))} aria-label={`Ta bort ${d}`}>
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
        <input
          value={dislikeInput}
          onChange={(e) => setDislikeInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDislike(); } }}
          onBlur={addDislike}
          placeholder="T.ex. svamp, lök — tryck Enter"
          className="input-field w-full"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={submit} disabled={!name.trim() || saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
          {saving ? <Spinner size="sm" /> : <Check size={16} />} Spara
        </button>
        <button onClick={onCancel} className="btn-secondary">Avbryt</button>
      </div>
    </motion.div>
  );
}

export default function HouseholdPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, loading: authLoading } = useAuthStore();
  const {
    household, inventory, meta, loading,
    fetch, fetchMeta, saveHousehold, addMember, removeMember, saveInventory,
  } = useHouseholdStore();

  const [step, setStep] = useState(0);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [equipment, setEquipment] = useState([]);
  const [skill, setSkill] = useState('INTERMEDIATE');
  const [invItems, setInvItems] = useState([]);
  const [invInput, setInvInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchMeta().catch(() => {});
    fetch().then((hh) => {
      if (hh) {
        setEquipment(hh.equipment || []);
        setSkill(hh.cookingSkill || 'INTERMEDIATE');
      }
    });
  }, [user, fetch, fetchMeta]);

  useEffect(() => {
    setInvItems(inventory.map((i) => i.name));
  }, [inventory]);

  const ensureHousehold = useCallback(async () => {
    if (household) return household;
    return saveHousehold({});
  }, [household, saveHousehold]);

  const handleAddMember = async (member) => {
    try {
      await ensureHousehold();
      await addMember(member);
      setShowMemberForm(false);
      toast.success(`${member.name} tillagd`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const addInvItem = () => {
    const clean = invInput.trim();
    if (clean && !invItems.some((i) => i.toLowerCase() === clean.toLowerCase())) {
      setInvItems([...invItems, clean]);
    }
    setInvInput('');
  };

  const finish = async () => {
    setSaving(true);
    try {
      await ensureHousehold();
      await saveHousehold({ cookingSkill: skill, equipment });
      await saveInventory(invItems.map((name) => ({ name })));
      toast.success('Hushållet sparat!');
      router.push('/middag');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <Spinner size="lg" className="mx-auto" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <Users size={48} className="text-warm-300 mx-auto mb-4" />
        <h2 className="font-display text-2xl text-warm-800 mb-2">Logga in först</h2>
        <p className="text-warm-500 mb-6">Hushållsprofilen kräver ett konto.</p>
        <Link href="/login?redirect=/hushall" className="btn-primary inline-block">Logga in</Link>
      </div>
    );
  }

  const steps = [
    { icon: Users, title: 'Vilka är ni?', sub: 'Allergier är absoluta regler — allt annat lär sig Nisse längs vägen.' },
    { icon: ChefHat, title: 'Ert kök', sub: 'Utrustning och hur van kocken är.' },
    { icon: Refrigerator, title: 'Vad finns hemma?', sub: 'Grovt räcker — det här är en gissning, inte bokföring.' },
  ];
  const StepIcon = steps[step].icon;

  return (
    <>
      <AppPageHeader title="Hushåll" />
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-6 pb-32">
        {/* Progress */}
        <div className="flex gap-2 mb-6" role="progressbar" aria-valuenow={step + 1} aria-valuemax={3}>
          {steps.map((_, i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full" style={{ background: i <= step ? '#FF6B35' : '#E5E5EA' }} />
          ))}
        </div>

        <div className="flex items-center gap-3 mb-1">
          <StepIcon size={22} className="text-warm-800" />
          <h1 className="font-display text-2xl text-warm-800">{steps[step].title}</h1>
        </div>
        <p className="text-warm-500 text-sm mb-6">{steps[step].sub}</p>

        <AnimatePresence mode="wait">
          {/* ── Step 1: Members ── */}
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {(household?.members || []).map((m) => (
                <div key={m.id} className="card p-4 flex items-center gap-3" style={{ borderRadius: 14 }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold" style={{ background: '#5A7D6C' }}>
                    {m.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-warm-800">{m.name} <span className="text-warm-400 text-sm">· {AGE_LABELS[m.ageCategory]}</span></p>
                    <p className="text-xs text-warm-500 truncate">
                      {[
                        m.allergies?.length ? `Allergi: ${m.allergies.join(', ')}` : null,
                        m.dietaryRestrictions?.length ? m.dietaryRestrictions.join(', ') : null,
                        SPICE_LABELS[m.spiceTolerance],
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button onClick={() => removeMember(m.id).catch((e) => toast.error(e.message))} aria-label={`Ta bort ${m.name}`} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#FFF0EB', color: '#FF7A50' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              {showMemberForm ? (
                <MemberForm meta={meta} onSave={handleAddMember} onCancel={() => setShowMemberForm(false)} />
              ) : (
                <button onClick={() => setShowMemberForm(true)} className="w-full card p-4 flex items-center justify-center gap-2 text-warm-600 hover:text-warm-800" style={{ borderRadius: 14, border: '2px dashed #E5E5EA', background: 'transparent', boxShadow: 'none' }}>
                  <Plus size={18} /> Lägg till medlem
                </button>
              )}
            </motion.div>
          )}

          {/* ── Step 2: Equipment + skill ── */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <div>
                <p className="text-sm font-medium text-warm-800 mb-2">Utrustning</p>
                <div className="flex flex-wrap gap-2">
                  {(meta?.equipment || []).map((e) => (
                    <Chip key={e.code} active={equipment.includes(e.code)} onClick={() => setEquipment(equipment.includes(e.code) ? equipment.filter((x) => x !== e.code) : [...equipment, e.code])}>
                      {e.label}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-warm-800 mb-2">Matlagningsnivå</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SKILL_LABELS).map(([key, label]) => (
                    <Chip key={key} active={skill === key} onClick={() => setSkill(key)}>{label}</Chip>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Inventory ── */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {invItems.map((item) => (
                  <span key={item} className="px-3 py-1.5 rounded-full text-sm bg-white text-warm-700 flex items-center gap-1.5" style={{ border: '1px solid #E5E5EA' }}>
                    {item}
                    <button onClick={() => setInvItems(invItems.filter((x) => x !== item))} aria-label={`Ta bort ${item}`}>
                      <X size={14} className="text-warm-400" />
                    </button>
                  </span>
                ))}
              </div>
              <input
                value={invInput}
                onChange={(e) => { const v = e.target.value; if (v.endsWith(',')) { setInvInput(v.slice(0, -1)); addInvItem(); } else setInvInput(v); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addInvItem(); } }}
                placeholder="T.ex. kycklingfilé, pasta, grädde…"
                className="input-field w-full"
              />
              <p className="text-xs text-warm-400">Skriv en vara och tryck Enter. Hoppa över det du är osäker på.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Nav buttons */}
        <div className="flex gap-3 mt-8">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="btn-secondary flex items-center gap-1">
              <ArrowLeft size={16} /> Tillbaka
            </button>
          )}
          {step < 2 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 0 && (household?.members || []).length === 0}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
            >
              Nästa <ArrowRight size={16} />
            </button>
          ) : (
            <button onClick={finish} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {saving ? <Spinner size="sm" /> : <Check size={16} />} Klart — lös middagen
            </button>
          )}
        </div>
      </div>
    </>
  );
}
