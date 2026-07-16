// ============================================
// Zustand Stores — Global state
// ============================================

import { create } from 'zustand';
import { auth as authApi, households as householdApi, dinner as dinnerApi } from '../lib/api';

// ──────────────────────────────────────────
// Recipe Store — selected recipe for cooking
// ──────────────────────────────────────────

export const useRecipeStore = create((set) => ({
  selectedRecipe: null,
  setSelectedRecipe: (recipe) => set({ selectedRecipe: recipe }),
  clearRecipe: () => set({ selectedRecipe: null }),
}));

// ──────────────────────────────────────────
// Auth Store
// ──────────────────────────────────────────

export const useAuthStore = create((set, get) => ({
  user: null,
  loading: true,
  error: null,
  isNewUser: false,

  // Initialize from stored refresh token
  init: async () => {
    set({ loading: true, error: null });
    try {
      const user = await authApi.initFromStorage();
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const user = await authApi.login(email, password);
      set({ user, loading: false });
      return user;
    } catch (err) {
      set({ loading: false, error: err.message });
      throw err;
    }
  },

  register: async (email, password, name, householdSize) => {
    set({ loading: true, error: null });
    try {
      const user = await authApi.register(email, password, name, householdSize);
      set({ user, loading: false, isNewUser: true });
      return user;
    } catch (err) {
      set({ loading: false, error: err.message });
      throw err;
    }
  },

  googleLogin: async (idToken) => {
    set({ loading: true, error: null });
    try {
      const { user, isNewUser } = await authApi.googleLogin(idToken);
      set({ user, loading: false, isNewUser });
      return { user, isNewUser };
    } catch (err) {
      set({ loading: false, error: err.message });
      throw err;
    }
  },

  appleLogin: async (identityToken, authorizationCode, fullName) => {
    set({ loading: true, error: null });
    try {
      const { user, isNewUser } = await authApi.appleLogin(identityToken, authorizationCode, fullName);
      set({ user, loading: false, isNewUser });
      return { user, isNewUser };
    } catch (err) {
      set({ loading: false, error: err.message });
      throw err;
    }
  },

  completeOnboarding: async () => {
    try {
      await authApi.completeOnboarding();
      set((state) => ({
        user: state.user ? { ...state.user, onboardingDone: true } : null,
        isNewUser: false,
      }));
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({ user: null, error: null, isNewUser: false });
    }
  },

  clearError: () => set({ error: null }),

  isLoggedIn: () => !!get().user,
  isPremium: () => {
    const user = get().user;
    return user?.plan === 'PREMIUM' || user?.plan === 'ADMIN';
  },
  needsOnboarding: () => {
    const user = get().user;
    return user && !user.onboardingDone;
  },
}));

// ──────────────────────────────────────────
// Nisse: Household Store
// ──────────────────────────────────────────

export const useHouseholdStore = create((set, get) => ({
  household: null,
  inventory: [],
  meta: null,
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const [{ household }, { items }] = await Promise.all([
        householdApi.current(),
        householdApi.inventory(),
      ]);
      set({ household, inventory: items, loading: false });
      return household;
    } catch (err) {
      // 404 no_household is a normal state for new users
      set({ household: null, inventory: [], loading: false, error: err.code === 'no_household' ? null : err.message });
      return null;
    }
  },

  fetchMeta: async () => {
    if (get().meta) return get().meta;
    const meta = await householdApi.meta();
    set({ meta });
    return meta;
  },

  saveHousehold: async (data) => {
    const { household } = await householdApi.upsert(data);
    set({ household });
    return household;
  },

  addMember: async (member) => {
    const { member: created } = await householdApi.addMember(member);
    set((state) => ({
      household: state.household
        ? { ...state.household, members: [...(state.household.members || []), created] }
        : state.household,
    }));
    return created;
  },

  updateMember: async (id, data) => {
    const { member } = await householdApi.updateMember(id, data);
    set((state) => ({
      household: state.household
        ? {
            ...state.household,
            members: state.household.members.map((m) => (m.id === id ? member : m)),
          }
        : state.household,
    }));
    return member;
  },

  removeMember: async (id) => {
    await householdApi.removeMember(id);
    set((state) => ({
      household: state.household
        ? { ...state.household, members: state.household.members.filter((m) => m.id !== id) }
        : state.household,
    }));
  },

  saveInventory: async (items) => {
    const { items: saved } = await householdApi.saveInventory(items);
    set({ inventory: saved });
    return saved;
  },
}));

// ──────────────────────────────────────────
// Nisse: Dinner Store — "Lös middagen"
// ──────────────────────────────────────────

export const useDinnerStore = create((set, get) => ({
  request: null,
  recommendations: [],
  assumptions: [], // level 2: shown + one-tap correctable
  degraded: null,
  solving: false,
  correcting: false,
  error: null,
  accepted: null, // { recommendation, shoppingList }

  solve: async (rawText, chips) => {
    set({ solving: true, error: null, accepted: null });
    try {
      const data = await dinnerApi.solve(rawText, chips);
      set({
        request: data.request,
        recommendations: data.recommendations,
        assumptions: data.assumptions || [],
        degraded: data.degraded,
        solving: false,
      });
      return data;
    } catch (err) {
      set({ solving: false, error: err.message });
      throw err;
    }
  },

  correctAssumption: async (key, value) => {
    const { request } = get();
    if (!request) return null;
    set({ correcting: true });
    try {
      const data = await dinnerApi.correctAssumption(request.id, key, value);
      set({
        recommendations: data.recommendations,
        assumptions: data.assumptions || [],
        degraded: data.degraded,
        correcting: false,
      });
      return data;
    } catch (err) {
      set({ correcting: false });
      throw err;
    }
  },

  regenerate: async () => {
    const { request } = get();
    if (!request) return null;
    set({ solving: true });
    try {
      const data = await dinnerApi.regenerate(request.id);
      set({
        recommendations: data.recommendations,
        assumptions: data.assumptions || [],
        degraded: data.degraded,
        solving: false,
      });
      return data;
    } catch (err) {
      set({ solving: false });
      throw err;
    }
  },

  requestAlternative: async (direction, replaceId) => {
    const { request, recommendations } = get();
    if (!request) return null;
    const { recommendation } = await dinnerApi.alternative(request.id, direction);
    set({
      recommendations: replaceId
        ? recommendations.map((r) => (r.id === replaceId ? recommendation : r))
        : [...recommendations, recommendation],
    });
    return recommendation;
  },

  accept: async (recommendationId) => {
    const result = await dinnerApi.accept(recommendationId);
    set((state) => ({
      accepted: result,
      recommendations: state.recommendations.map((r) =>
        r.id === recommendationId ? { ...r, status: 'ACCEPTED' } : r
      ),
    }));
    return result;
  },

  reset: () =>
    set({
      request: null,
      recommendations: [],
      assumptions: [],
      degraded: null,
      accepted: null,
      error: null,
    }),
}));
