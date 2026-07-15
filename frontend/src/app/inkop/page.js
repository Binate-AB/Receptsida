// ============================================
// Inköp — Nisse shopping lists
// Aisle-grouped, necessary vs optional, "probably
// home — double-check", cost estimate, check-off
// persisted via PATCH.
// ============================================

'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ShoppingBag, Check, ChevronRight, ArrowLeft, Home, UtensilsCrossed } from 'lucide-react';
import { useAuthStore } from '../../lib/store';
import { shoppingLists as listApi } from '../../lib/api';
import { groupByAisle } from '../../data/recipes';
import { useToast } from '../../components/Toast';
import { AppPageHeader } from '../../components/app/AppPageHeader';
import { Spinner } from '../../components/Spinner';

function formatQty(item) {
  if (!item.quantity) return '';
  const q = item.quantity;
  const u = item.unit || '';
  if (u === 'ml' && q >= 100) return `${String(Math.round(q / 10) / 10).replace('.', ',')} dl`;
  if (u === 'g' && q >= 1000) return `${String(Math.round(q / 100) / 10).replace('.', ',')} kg`;
  const qs = String(q % 1 === 0 ? q : q.toFixed(1)).replace('.', ',');
  return `${qs} ${u}`.trim();
}

function ListDetail({ list, onToggle, onDone }) {
  const buyItems = list.items.filter((i) => !i.probablyHome);
  const homeItems = list.items.filter((i) => i.probablyHome);
  const groups = groupByAisle(buyItems.map((i) => ({ ...i, aisle: i.aisle })));
  const checkedCount = buyItems.filter((i) => i.checked).length;
  const necessaryCost = buyItems
    .filter((i) => i.necessary && !i.checked)
    .reduce((acc, i) => acc + (i.estPrice || 0), 0);

  return (
    <div className="space-y-5">
      <div className="card p-4" style={{ borderRadius: 16 }}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-lg text-warm-800">{list.title}</h2>
          <span className="text-sm text-warm-500">{checkedCount}/{buyItems.length}</span>
        </div>
        <div className="h-1.5 rounded-full bg-cream-200 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: '#5A7D6C' }}
            animate={{ width: `${buyItems.length ? (checkedCount / buyItems.length) * 100 : 0}%` }}
          />
        </div>
        {necessaryCost > 0 && (
          <p className="text-xs text-warm-500 mt-2">Kvar att köpa: ca {necessaryCost} kr</p>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.name}>
          <p className="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-2 px-1">
            {group.icon} {group.name}
          </p>
          <div className="space-y-2">
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => onToggle(item)}
                className="w-full card p-3.5 flex items-center gap-3 text-left"
                style={{ borderRadius: 12, opacity: item.checked ? 0.55 : 1 }}
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all"
                  style={{
                    background: item.checked ? '#5A7D6C' : 'transparent',
                    border: item.checked ? 'none' : '2px solid #C7C7CC',
                  }}
                >
                  {item.checked && <Check size={14} className="text-white" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-warm-800 ${item.checked ? 'line-through' : ''}`}>
                    {item.name} {formatQty(item) && <span className="text-warm-400 text-sm">· {formatQty(item)}</span>}
                  </span>
                  {!item.necessary && <span className="text-xs text-warm-400">valfri</span>}
                </span>
                {item.estPrice ? <span className="text-sm text-warm-400 shrink-0">{item.estPrice} kr</span> : null}
              </button>
            ))}
          </div>
        </div>
      ))}

      {homeItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-1 px-1 flex items-center gap-1">
            <Home size={12} /> Har du troligen hemma — dubbelkolla
          </p>
          <div className="space-y-2">
            {homeItems.map((item) => (
              <div key={item.id} className="card p-3.5 flex items-center gap-3" style={{ borderRadius: 12, background: '#F8F8F5' }}>
                <span className="flex-1 text-warm-600 text-sm">
                  {item.name} {formatQty(item) && <span className="text-warm-400">· {formatQty(item)}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {onDone && (
        <button onClick={onDone} className="btn-primary w-full flex items-center justify-center gap-2">
          <UtensilsCrossed size={18} /> Klart — börja laga
        </button>
      )}
    </div>
  );
}

function InkopContent() {
  const searchParams = useSearchParams();
  const listId = searchParams.get('list');
  const recId = searchParams.get('rec');
  const toast = useToast();
  const { user, loading: authLoading } = useAuthStore();

  const [lists, setLists] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (listId) {
        const { list } = await listApi.get(listId);
        setCurrent(list);
      } else {
        const { lists: all } = await listApi.list('ACTIVE');
        setLists(all);
        if (all.length === 1) setCurrent(all[0]);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [listId, toast]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const handleToggle = async (item) => {
    if (!current) return;
    // Optimistic update
    setCurrent({
      ...current,
      items: current.items.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)),
    });
    try {
      await listApi.updateItem(current.id, item.id, { checked: !item.checked });
    } catch (err) {
      setCurrent(current); // rollback
      toast.error('Kunde inte spara — försök igen.');
    }
  };

  if (authLoading || loading) {
    return <div className="py-20 text-center"><Spinner size="lg" className="mx-auto" /></div>;
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <ShoppingBag size={48} className="text-warm-300 mx-auto mb-4" />
        <h2 className="font-display text-2xl text-warm-800 mb-2">Logga in först</h2>
        <Link href="/login?redirect=/inkop" className="btn-primary inline-block mt-4">Logga in</Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-6 pb-32">
      {current ? (
        <>
          {!listId && lists.length > 1 && (
            <button onClick={() => setCurrent(null)} className="text-sm text-warm-500 flex items-center gap-1 mb-4">
              <ArrowLeft size={14} /> Alla listor
            </button>
          )}
          <ListDetail
            list={current}
            onToggle={handleToggle}
            onDone={null}
          />
          {(recId || current.recommendationId) && (
            <Link
              href={`/cooking?rec=${recId || current.recommendationId}`}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-5"
            >
              <UtensilsCrossed size={18} /> Börja laga med Nisse
            </Link>
          )}
        </>
      ) : lists.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingBag size={48} className="text-warm-300 mx-auto mb-4" />
          <h2 className="font-display text-xl text-warm-800 mb-2">Inga aktiva listor</h2>
          <p className="text-warm-500 text-sm mb-6">Välj en middag så skapar Nisse listan åt dig.</p>
          <Link href="/middag" className="btn-primary inline-block">Lös middagen</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {lists.map((l) => (
            <button key={l.id} onClick={() => setCurrent(l)} className="w-full card p-4 flex items-center gap-3 text-left" style={{ borderRadius: 14 }}>
              <ShoppingBag size={20} className="text-warm-600 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-warm-800 truncate">{l.title}</span>
                <span className="text-xs text-warm-500">
                  {l.items.filter((i) => i.checked).length}/{l.items.length} avbockade
                </span>
              </span>
              <ChevronRight size={18} className="text-warm-300" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InkopPage() {
  return (
    <>
      <AppPageHeader title="Inköpslista" />
      <Suspense fallback={<div className="py-20 text-center"><Spinner size="lg" className="mx-auto" /></div>}>
        <InkopContent />
      </Suspense>
    </>
  );
}
