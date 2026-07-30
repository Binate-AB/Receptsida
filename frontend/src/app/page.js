// ============================================
// Home Page — Native-feel with ingredient search flow
// Platform-aware: Web (Hero + marketing) vs App (New design)
// Web: max-width 1280px, 3-col feature cards, staggered entries
// ============================================

'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { isApp } from '../lib/platform';
import { useAuthStore } from '../lib/store';
import { useRecipeSearch, useFavorites } from '../hooks/useRecipes';
import { HeroSearch } from '../components/HeroSearch';
import { AppHome } from '../components/app/AppHome';
import { IngredientSearch } from '../components/app/IngredientSearch';
import { RecipeCard } from '../components/RecipeCard';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RecipeDetail } from '../components/RecipeDetail';
import { ShoppingList } from '../components/ShoppingList';
import { LoadingState } from '../components/LoadingState';
import { SourceBanner } from '../components/SourceBanner';
import { NisseButton } from '../components/NisseButton';
import { PageTransition } from '../components/PageTransition';
import {
  ArrowLeft, Leaf, TrendingDown, Headphones, ChefHat,
  ShoppingBag, Mic, Sparkles,
} from 'lucide-react';
import Link from 'next/link';

const TICKER_ITEMS = [
  { text: 'Kycklingfilé 20% billigare på Willys just nu', tag: 'Erbjudande' },
  { text: 'Laxfilé till bästa pris på Coop denna vecka', tag: 'Veckans fynd' },
  { text: 'Säsongens bästa: Svensk sparris finns nu', tag: 'Säsong' },
  { text: 'Pasta & ris till kampanjpris hos ICA', tag: 'Kampanj' },
  { text: 'Ekologiska grönsaker 30% billigare på Lidl', tag: 'Eko-deal' },
];

export default function HomePage() {
  const { user } = useAuthStore();
  const { results, loading, error, search, reset } = useRecipeSearch();
  const { toggleFavorite } = useFavorites();
  const [lastQuery, setLastQuery] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  // App navigation state
  const [appView, setAppView] = useState('home'); // 'home' | 'search' | 'results'

  async function handleSearch(query, householdSize, preferences) {
    setLastQuery(query);
    if (isApp) setAppView('results');
    try {
      await search(query, householdSize, preferences);
    } catch {
      // Error state is already set in the hook — stay on results view
      // so the user sees the error message
    }
  }

  function handleReset() {
    setSelectedRecipe(null);
    reset();
    if (isApp) setAppView('home');
  }

  function handleBackFromSearch() {
    setAppView('home');
  }

  // ── Results view (both platforms) ──
  if (results) {
    return (
      <PageTransition>
        <div className={`max-w-4xl mx-auto px-4 sm:px-6 ${isApp ? 'pt-4 pb-4' : 'py-8'}`}>
          <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
            <h2 className={`font-display font-bold text-warm-800 tracking-tight ${isApp ? 'text-xl' : 'text-display-sm'}`}>
              Recept for &ldquo;{lastQuery}&rdquo;
            </h2>
            <NisseButton variant="outline" size="sm" onClick={handleReset}>
              <ArrowLeft size={16} /> Ny sökning
            </NisseButton>
          </div>

          {results.cached && <div className="badge-sage mb-4">Cachad sökning</div>}
          <SourceBanner sources={results.sources} />

          {error && (
            <div className="bg-danger-50 border border-danger/20 text-terra-600 px-4 py-3 rounded-xl text-sm mb-4">
              {typeof error === 'string' ? error : error?.message || 'Något gick fel.'}
            </div>
          )}

          <ErrorBoundary>
            <div className={isApp ? 'space-y-4' : 'space-y-6'}>
              {(results.recipes || []).map((recipe, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <RecipeCard
                    recipe={recipe}
                    rank={idx + 1}
                    onToggleFavorite={user ? toggleFavorite : null}
                    onSelect={setSelectedRecipe}
                  />
                </motion.div>
              ))}
            </div>
          </ErrorBoundary>

          {results.shopping_list?.length > 0 && (
            <div className="mt-8">
              <ShoppingList items={results.shopping_list} />
            </div>
          )}

          <AnimatePresence>
            {selectedRecipe && (
              <RecipeDetail
                recipe={selectedRecipe}
                rank={results.recipes.indexOf(selectedRecipe) + 1 || undefined}
                onClose={() => setSelectedRecipe(null)}
              />
            )}
          </AnimatePresence>
        </div>
      </PageTransition>
    );
  }

  if (loading) return <LoadingState />;

  // ── App: error view (when search failed and no results) ──
  if (isApp && error && !results && appView === 'results') {
    const errorMsg = typeof error === 'string' ? error : error?.message || 'Något gick fel.';
    const errorCode = typeof error === 'object' ? error?.code : null;
    const isNetworkError = errorCode === 'network_error';
    const isTimeout = errorCode === 'ai_timeout';

    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
          <span className="text-4xl mb-4">{isNetworkError ? '📡' : isTimeout ? '⏳' : '😔'}</span>
          <h2 className="font-display text-xl font-bold text-warm-800 mb-2">
            {isNetworkError ? 'Ingen anslutning' : isTimeout ? 'Sökningen tog för lång tid' : 'Sökningen misslyckades'}
          </h2>
          <p className="text-sm text-warm-500 mb-6 max-w-xs leading-relaxed">{errorMsg}</p>
          <NisseButton variant="primary" onClick={handleReset}>
            <ArrowLeft size={16} /> Försök igen
          </NisseButton>
        </div>
      </PageTransition>
    );
  }

  // ── App: new design with home + ingredient search flow ──
  if (isApp) {
    return (
      <AnimatePresence mode="wait">
        {appView === 'home' && (
          <motion.div
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="h-full"
          >
            <AppHome
              onSearch={(query) => handleSearch(query)}
              onStartSearch={() => setAppView('search')}
            />
          </motion.div>
        )}

        {appView === 'search' && (
          <motion.div
            key="search"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.25 }}
            className="h-full"
          >
            <IngredientSearch
              onBack={handleBackFromSearch}
              onSearch={handleSearch}
              loading={loading}
            />
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // ── Web: full marketing page (1280px max-width) ──
  return (
    <div className="min-h-screen">
      <section>
        <HeroSearch onSearch={handleSearch} loading={loading} />
      </section>

      {/* Market Insight Ticker */}
      <section className="py-4 bg-cream-200/60 border-y border-warm-200/50 overflow-hidden">
        <div className="ticker-wrap">
          <div className="ticker-content">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 px-8 whitespace-nowrap">
                <span className="badge-terra text-[10px] !py-0.5">{item.tag}</span>
                <span className="text-sm text-warm-600">{item.text}</span>
                <span className="text-warm-300">|</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto px-4 mt-8">
          <div className="bg-danger-50 border border-danger/20 text-terra-600 px-4 py-3 rounded-xl text-sm text-center">
            {error}
          </div>
        </motion.div>
      )}

      {/* How it works — 3-column grid with hover-scale */}
      <section className="py-12 sm:py-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
          <div className="text-center mb-10 sm:mb-14">
            <h2
              className="font-display text-2xl sm:text-display-sm md:text-display-md font-bold tracking-tight mb-2 sm:mb-3"
              style={{ color: '#111111' }}
            >
              Från kylskåp till middagsbord
            </h2>
            <p className="text-warm-500 max-w-md mx-auto text-sm sm:text-base">Tre steg. Noll beslutströtthet.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            <StepCard number="1" icon={<ChefHat size={24} />} title="Sök" text="Skriv vad du har hemma, en maträtt, eller din budget. AI hittar de bästa recepten åt dig." />
            <StepCard number="2" icon={<ShoppingBag size={24} />} title="Handla" text="Röststyrd inköpslista som guidar dig genom butiken, hylla för hylla. Handsfree." />
            <StepCard number="3" icon={<Mic size={24} />} title="Laga" text="Steg-för-steg med timer och AI-kock som svarar på dina frågor. Som en kock i örat." />
          </div>
        </div>
      </section>

      {/* Features — 3-column grid */}
      <section className="py-12 sm:py-20 border-y border-warm-200/20" style={{ background: 'rgba(245,245,247,0.6)' }}>
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            <FeatureCard icon={<Leaf size={22} className="text-forest-400" />} title="Hållbar matlagning" text="Minimera matsvinn genom att laga mat med vad du redan har." />
            <FeatureCard icon={<TrendingDown size={22} className="text-terra-400" />} title="Bästa priset" text="Se pris per portion och jämför ICA, Willys, Coop & Lidl." />
            <FeatureCard icon={<Headphones size={22} className="text-forest-400" />} title="Röststyrt" text="Handla och laga helt handsfree med röstkommandon." />
          </div>
        </div>
      </section>

      {/* CTA */}
      {!user && (
        <section className="py-12 sm:py-20">
          <div className="max-w-xl mx-auto text-center px-5 sm:px-4">
            <div className="card p-6 sm:p-10" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
              <div className="w-14 sm:w-16 h-14 sm:h-16 bg-forest-50 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-5">
                <Sparkles size={24} className="text-forest-400 sm:hidden" />
                <Sparkles size={28} className="text-forest-400 hidden sm:block" />
              </div>
              <h3
                className="font-display text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mb-2 sm:mb-3"
                style={{ color: '#111111' }}
              >
                Börja laga smartare
              </h3>
              <p className="text-warm-500 text-sm sm:text-base mb-6 sm:mb-8 max-w-sm mx-auto leading-relaxed">
                Skapa ett gratis konto för att söka bland tusentals recept, spara favoriter och få röststyrd matlagningshjälp.
              </p>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 text-white px-6 sm:px-8 py-3.5 sm:py-4 rounded-full font-semibold text-sm sm:text-base
                         transition-all hover:-translate-y-0.5 hover:shadow-btn-hover active:scale-[0.97]"
                style={{ background: '#111111', boxShadow: '0 4px 20px rgba(17,17,17,0.2)' }}
              >
                Skapa konto gratis
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function FeatureCard({ icon, title, text }) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="card p-5 sm:p-7 cursor-default"
      style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: '#F5F5F7' }}
      >
        {icon}
      </div>
      <h3 className="font-bold text-warm-800 text-lg mb-1.5">{title}</h3>
      <p className="text-sm text-warm-500 leading-relaxed">{text}</p>
    </motion.div>
  );
}

function StepCard({ number, icon, title, text }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: Number(number) * 0.12 }}
      whileHover={{ y: -4, scale: 1.02 }}
      className="card p-6 sm:p-8 text-center cursor-default"
      style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
        style={{ background: '#5A7D6C', boxShadow: '0 4px 20px rgba(90,125,108,0.3)' }}
      >
        <span className="text-white">{icon}</span>
      </div>
      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#5A7D6C' }}>
        Steg {number}
      </span>
      <h3
        className="font-display text-xl font-bold tracking-tight mt-1.5 mb-2"
        style={{ color: '#111111' }}
      >
        {title}
      </h3>
      <p className="text-sm text-warm-500 leading-relaxed">{text}</p>
    </motion.div>
  );
}
