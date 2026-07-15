// ============================================
// BottomTabBar — Floating Glassmorphism Island
// Detached pill, blurred glass, vibrant center
// ============================================

'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Home, UtensilsCrossed, CalendarDays, Heart, User } from 'lucide-react';

const TABS = [
  { href: '/', label: 'Hem', icon: Home },
  { href: '/middag', label: 'Middag', icon: UtensilsCrossed },
  { href: '/ny', label: '', icon: CalendarDays, isCenter: true },
  { href: '/favoriter', label: 'Favoriter', icon: Heart },
  { href: '/installningar', label: 'Profil', icon: User },
];

export function BottomTabBar() {
  const pathname = usePathname();

  const handleTap = async () => {
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  };

  return (
    <nav
      className="z-50"
      aria-label="Huvudnavigering"
      style={{
        position: 'absolute',
        bottom: 'calc(12px + env(safe-area-inset-bottom))',
        left: '20px',
        right: '20px',
      }}
    >
      <div
        className="flex items-center justify-around"
        style={{
          height: '64px',
          borderRadius: '9999px',
          background: 'rgba(255, 255, 255, 0.70)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          boxShadow: '0 30px 60px -12px rgba(50,50,93,0.12), 0 18px 36px -18px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.5)',
          padding: '0 8px',
        }}
      >
        {TABS.map((tab, i) => {
          const Icon = tab.icon;
          const active = tab.href === '/'
            ? pathname === '/'
            : pathname.startsWith(tab.href);

          // ── Center "plus" button — vibrant accent, floating ──
          if (tab.isCenter) {
            return (
              <Link
                key={`tab-${i}`}
                href={tab.href}
                onClick={handleTap}
                aria-label="Veckomeny"
                className="flex items-center justify-center flex-1"
              >
                <motion.div
                  whileTap={{ scale: 0.85 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="flex items-center justify-center"
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '9999px',
                    background: '#FF6B35',
                    boxShadow: '0 8px 24px rgba(255,107,53,0.35)',
                    marginTop: '-16px',
                  }}
                >
                  <Icon size={22} strokeWidth={2} className="text-white" />
                </motion.div>
              </Link>
            );
          }

          // ── Regular tabs ──
          return (
            <Link
              key={`tab-${i}`}
              href={tab.href}
              onClick={handleTap}
              aria-label={tab.label}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 relative"
            >
              <motion.div
                whileTap={{ scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                <Icon
                  size={21}
                  strokeWidth={active ? 2 : 1.5}
                  style={{ color: active ? '#1A1A1A' : '#A0A0A5' }}
                />
              </motion.div>

              <span
                className="text-[9px] leading-tight font-body"
                style={{
                  color: active ? '#1A1A1A' : '#A0A0A5',
                  fontWeight: active ? '600' : '400',
                  letterSpacing: '0.3px',
                }}
              >
                {tab.label}
              </span>

              {/* Active indicator dot */}
              {active && (
                <motion.div
                  layoutId="tab-dot"
                  className="absolute rounded-full"
                  style={{
                    bottom: '2px',
                    width: '4px',
                    height: '4px',
                    background: '#FF6B35',
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
