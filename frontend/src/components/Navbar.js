// ============================================
// Navbar — Floating Island header with scroll-aware behavior
// Transparent → white with blur on scroll, shrinks on scroll
// ============================================

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '../lib/store';
import { Menu, X, User, LogOut, Heart, Clock, MapPin, Settings, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function Navbar() {
  const { user, loading, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    function close(e) {
      if (!e.target.closest('[data-profile-menu]')) setProfileOpen(false);
    }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [profileOpen]);

  return (
    <nav
      className="sticky top-0 z-50 safe-top transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(255,255,255,0.85)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
        boxShadow: scrolled ? '0 4px 30px rgba(0,0,0,0.04)' : 'none',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className="flex justify-between items-center transition-all duration-300"
          style={{ height: scrolled ? '52px' : '60px' }}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="w-9 h-9 bg-forest-400 rounded-2xl flex items-center justify-center shadow-md"
            >
              <Sparkles size={17} className="text-white" />
            </motion.div>
            <span className="font-display text-xl text-warm-800 font-semibold">Nisse</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            <NavLink href="/">Recept</NavLink>
            <NavLink href="/middag">Lös middagen</NavLink>
            <NavLink href="/butiker">Butiker</NavLink>
            {user && (
              <>
                <NavLink href="/favoriter">Favoriter</NavLink>
                <NavLink href="/historik">Historik</NavLink>
              </>
            )}

            <div className="w-px h-6 bg-warm-200 mx-3" />

            {loading ? (
              <div className="w-9 h-9 rounded-full bg-cream-300 animate-pulse" />
            ) : user ? (
              <div className="relative" data-profile-menu>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2.5 text-sm font-medium text-warm-600
                           px-3 py-2 rounded-xl hover:bg-warm-50 transition-all"
                >
                  <div className="w-8 h-8 bg-forest-50 text-forest-500 rounded-full flex items-center justify-center">
                    <User size={15} />
                  </div>
                  <span className="hidden lg:inline text-warm-700">
                    {user.name || user.email.split('@')[0]}
                  </span>
                </motion.button>

                <AnimatePresence>
                  {profileOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      className="absolute right-0 mt-2 w-56 bg-white/95 backdrop-blur-xl
                                border border-warm-100 rounded-2xl shadow-elevated overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-warm-100">
                        <p className="text-sm font-medium text-warm-800 truncate">{user.email}</p>
                        <p className="text-xs text-warm-400 mt-0.5">
                          {user.plan === 'FREE' ? 'Gratisplan' : 'Premium'}
                          {user.authProvider !== 'EMAIL' && ` · ${user.authProvider === 'GOOGLE' ? 'Google' : 'Apple'}`}
                        </p>
                      </div>
                      <DropdownLink href="/favoriter" icon={Heart} onClick={() => setProfileOpen(false)}>Favoriter</DropdownLink>
                      <DropdownLink href="/historik" icon={Clock} onClick={() => setProfileOpen(false)}>Historik</DropdownLink>
                      <DropdownLink href="/butiker" icon={MapPin} onClick={() => setProfileOpen(false)}>Hitta butiker</DropdownLink>
                      <DropdownLink href="/installningar" icon={Settings} onClick={() => setProfileOpen(false)} border>Inställningar</DropdownLink>
                      <button
                        onClick={() => { logout(); setProfileOpen(false); }}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-terra-500 hover:bg-terra-50
                                 transition-colors w-full border-t border-warm-100"
                      >
                        <LogOut size={15} /> Logga ut
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <Link
                  href="/login"
                  className="text-sm font-medium text-warm-600 hover:text-warm-800 px-4 py-2 rounded-xl
                           hover:bg-warm-50 transition-all"
                >
                  Logga in
                </Link>
                <Link
                  href="/register"
                  className="text-sm font-semibold text-white px-5 py-2.5 rounded-full
                           transition-all hover:-translate-y-0.5 hover:shadow-btn-hover active:scale-[0.97]"
                  style={{ background: '#111111', boxShadow: '0 4px 12px rgba(17,17,17,0.18)' }}
                >
                  Kom igång
                </Link>
              </div>
            )}
          </div>

          {/* Mobile toggle */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-warm-500 hover:text-warm-800 rounded-xl
                     hover:bg-warm-100 transition-colors"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </motion.button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="md:hidden overflow-hidden border-t border-warm-200/50"
            >
              <div className="flex flex-col gap-1 py-3">
                <MobileLink href="/" onClick={() => setMobileOpen(false)}>Recept</MobileLink>
                <MobileLink href="/middag" onClick={() => setMobileOpen(false)}>Lös middagen</MobileLink>
                <MobileLink href="/butiker" onClick={() => setMobileOpen(false)}>
                  <MapPin size={15} className="text-forest-400" /> Butiker
                </MobileLink>
                {user ? (
                  <>
                    <MobileLink href="/favoriter" onClick={() => setMobileOpen(false)}>
                      <Heart size={15} className="text-terra-400" /> Favoriter
                    </MobileLink>
                    <MobileLink href="/historik" onClick={() => setMobileOpen(false)}>
                      <Clock size={15} className="text-sage-400" /> Historik
                    </MobileLink>
                    <MobileLink href="/installningar" onClick={() => setMobileOpen(false)}>
                      <Settings size={15} className="text-warm-400" /> Inställningar
                    </MobileLink>
                    <button
                      onClick={() => { logout(); setMobileOpen(false); }}
                      className="px-4 py-3 text-sm font-medium text-terra-500 hover:bg-terra-50 rounded-xl text-left"
                    >
                      <LogOut size={15} className="inline mr-2" /> Logga ut
                    </button>
                  </>
                ) : (
                  <div className="flex gap-2.5 px-4 pt-3 pb-1">
                    <Link href="/login"
                          className="btn-outline flex-1 text-center text-sm py-3"
                          onClick={() => setMobileOpen(false)}>
                      Logga in
                    </Link>
                    <Link href="/register"
                          className="btn-primary flex-1 text-center text-sm py-3"
                          onClick={() => setMobileOpen(false)}>
                      Kom igång
                    </Link>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}

function NavLink({ href, children }) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-warm-500 hover:text-forest-500
                px-3.5 py-2 rounded-xl hover:bg-forest-50 transition-all"
    >
      {children}
    </Link>
  );
}

function DropdownLink({ href, icon: Icon, children, onClick, border }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-2.5 text-sm text-warm-600 hover:bg-forest-50 hover:text-forest-600 transition-colors ${border ? 'border-t border-warm-100' : ''}`}
      onClick={onClick}
    >
      <Icon size={15} /> {children}
    </Link>
  );
}

function MobileLink({ href, onClick, children }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-warm-600 hover:bg-forest-50 rounded-xl"
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
