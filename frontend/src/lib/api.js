// ============================================
// API Client — Typed HTTP client for backend
// ============================================

// Browser: use Next.js rewrite proxy (/api/v1/...) — avoids CORS entirely.
// Capacitor (native): call the production API directly (localhost is unreachable from device).
// Server (SSR): use full backend URL.
function getApiUrl() {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
  }
  if (window.Capacitor?.isNativePlatform?.()) {
    // Native apps cannot reach localhost — always use production backend.
    // NEXT_PUBLIC_NATIVE_API_URL allows override, but never fall back to localhost.
    const nativeUrl = process.env.NEXT_PUBLIC_NATIVE_API_URL
      || process.env.NEXT_PUBLIC_API_URL
      || '';
    if (nativeUrl && !nativeUrl.includes('localhost')) {
      return nativeUrl;
    }
    // Production backend — same Vercel project as the web app (Vercel Services).
    // Use the canonical www host directly so the native app avoids the
    // apex→www 308 redirect. Override per-build with NEXT_PUBLIC_NATIVE_API_URL.
    return 'https://www.nisse.io/api/v1';
  }
  return '/api/v1';
}

const API_URL = getApiUrl();

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ── Token management ──

let accessToken = null;
let refreshToken = null;

export function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  if (typeof window !== 'undefined') {
    localStorage.setItem('mk_refresh', refresh);
  }
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('mk_refresh');
  }
}

export function getStoredRefreshToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('mk_refresh');
  }
  return null;
}

// ── Core fetch wrapper with auto-refresh ──

async function apiFetch(path, options = {}) {
  const url = `${API_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // AI search calls can take 30-60s (two sequential Claude API calls)
  const timeoutMs = options.timeout || 90_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, { ...options, headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new ApiError(0, 'ai_timeout', 'Sökningen tog för lång tid. Försök igen.');
    }
    throw new ApiError(0, 'network_error', 'Kunde inte nå servern. Kontrollera din internetanslutning och försök igen.');
  }
  clearTimeout(timer);

  // Auto-refresh on 401
  if (response.status === 401 && refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      try {
        response = await fetch(url, { ...options, headers });
      } catch {
        throw new ApiError(0, 'network_error', 'Kunde inte nå servern. Kontrollera din internetanslutning och försök igen.');
      }
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      body.error || 'unknown',
      body.message || 'Något gick fel'
    );
  }

  return response.json();
}

async function tryRefresh() {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return false;
    }

    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

// ── Auth API ──

export const auth = {
  async register(email, password, name, householdSize) {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, householdSize }),
    });
    setTokens(data.accessToken, data.refreshToken);
    return data.user;
  },

  async login(email, password) {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setTokens(data.accessToken, data.refreshToken);
    return data.user;
  },

  async logout() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      clearTokens();
    }
  },

  async me() {
    return apiFetch('/auth/me');
  },

  async verify(token) {
    return apiFetch('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  async resendVerification() {
    return apiFetch('/auth/resend-verification', { method: 'POST' });
  },

  async forgotPassword(email) {
    return apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token, password) {
    return apiFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  },

  async googleLogin(idToken) {
    const data = await apiFetch('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
    setTokens(data.accessToken, data.refreshToken);
    return { user: data.user, isNewUser: data.isNewUser };
  },

  async appleLogin(identityToken, authorizationCode, fullName) {
    const data = await apiFetch('/auth/apple', {
      method: 'POST',
      body: JSON.stringify({ identityToken, authorizationCode, fullName }),
    });
    setTokens(data.accessToken, data.refreshToken);
    return { user: data.user, isNewUser: data.isNewUser };
  },

  async completeOnboarding() {
    return apiFetch('/auth/complete-onboarding', { method: 'POST' });
  },

  async initFromStorage() {
    const stored = getStoredRefreshToken();
    if (!stored) return null;

    refreshToken = stored;
    const refreshed = await tryRefresh();
    if (!refreshed) return null;

    return auth.me();
  },
};

// ── GDPR API ──

export const gdpr = {
  async recordConsent(type, granted) {
    return apiFetch('/gdpr/consent', {
      method: 'POST',
      body: JSON.stringify({ type, granted }),
    });
  },

  async getConsent() {
    return apiFetch('/gdpr/consent');
  },

  async exportData() {
    return apiFetch('/gdpr/export');
  },

  async deleteAccount(confirmEmail) {
    return apiFetch('/gdpr/delete-account', {
      method: 'POST',
      body: JSON.stringify({ confirmEmail }),
    });
  },
};

// ── Locations API ──

export const locations = {
  async nearby(lat, lng, radius) {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    if (radius) params.set('radius', String(radius));
    return apiFetch(`/locations/nearby?${params.toString()}`);
  },

  async directions(fromLat, fromLng, toLat, toLng, mode = 'driving') {
    const params = new URLSearchParams({
      fromLat: String(fromLat),
      fromLng: String(fromLng),
      toLat: String(toLat),
      toLng: String(toLng),
      mode,
    });
    return apiFetch(`/locations/directions?${params.toString()}`);
  },
};

// ── Recipe API ──

export const recipes = {
  async search(query, householdSize, preferences) {
    return apiFetch('/recipes/search', {
      method: 'POST',
      body: JSON.stringify({ query, householdSize, preferences }),
    });
  },

  async askCookingAssistant(recipe, question, conversationHistory, context) {
    return apiFetch('/recipes/cooking/ask', {
      method: 'POST',
      body: JSON.stringify({ recipe, question, conversationHistory, context }),
    });
  },

  async askShoppingAssistant(recipe, question, conversationHistory) {
    return apiFetch('/recipes/shopping/ask', {
      method: 'POST',
      body: JSON.stringify({ recipe, question, conversationHistory }),
    });
  },

  async get(id) {
    return apiFetch(`/recipes/${id}`);
  },

  async history(page = 1, limit = 20) {
    return apiFetch(`/recipes/history?page=${page}&limit=${limit}`);
  },

  async toggleFavorite(id) {
    return apiFetch(`/recipes/${id}/save`, { method: 'POST' });
  },

  async favorites() {
    return apiFetch('/recipes/favorites/list');
  },

  async share(recipeId, toEmail) {
    return apiFetch('/recipes/share', {
      method: 'POST',
      body: JSON.stringify({ recipeId, toEmail }),
    });
  },
};

// ── Meal Plan API ──

export const mealPlans = {
  async generate(weekStart, householdSize, preferences) {
    return apiFetch('/meal-plans/generate', {
      method: 'POST',
      body: JSON.stringify({ weekStart, householdSize, preferences }),
    });
  },

  async list() {
    return apiFetch('/meal-plans');
  },

  async get(id) {
    return apiFetch(`/meal-plans/${id}`);
  },

  async swap(planId, dayIndex, mealType) {
    return apiFetch(`/meal-plans/${planId}/swap`, {
      method: 'POST',
      body: JSON.stringify({ dayIndex, mealType }),
    });
  },

  async lockMeal(planId, mealId, locked) {
    return apiFetch(`/meal-plans/${planId}/meals/${mealId}/lock`, {
      method: 'PATCH',
      body: JSON.stringify({ locked }),
    });
  },

  async remove(id) {
    return apiFetch(`/meal-plans/${id}`, { method: 'DELETE' });
  },
};

// ── Cooking API ──

export const cooking = {
  async speak(text, recipe) {
    return apiFetch('/cooking/speak', {
      method: 'POST',
      body: JSON.stringify({ text, recipe }),
    });
  },
};

// ── Lexicon API ──

export const lexicon = {
  async suggest(query) {
    return apiFetch(`/lexicon/suggest?q=${encodeURIComponent(query)}`);
  },
};


// ── Nisse: Household API ──

export const households = {
  async meta() {
    return apiFetch('/households/meta');
  },

  async upsert(data) {
    return apiFetch('/households', { method: 'POST', body: JSON.stringify(data) });
  },

  async current() {
    return apiFetch('/households/current');
  },

  async update(data) {
    return apiFetch('/households/current', { method: 'PATCH', body: JSON.stringify(data) });
  },

  async addMember(member) {
    return apiFetch('/households/current/members', {
      method: 'POST',
      body: JSON.stringify(member),
    });
  },

  async updateMember(id, data) {
    return apiFetch(`/households/current/members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async removeMember(id) {
    return apiFetch(`/households/current/members/${id}`, { method: 'DELETE' });
  },

  async inventory() {
    return apiFetch('/households/current/inventory');
  },

  async saveInventory(items) {
    return apiFetch('/households/current/inventory', {
      method: 'PUT',
      body: JSON.stringify({ items }),
    });
  },
};

// ── Nisse: Dinner solver API ──

export const dinner = {
  async solve(rawText, chips) {
    return apiFetch('/dinner/solve', {
      method: 'POST',
      body: JSON.stringify({ rawText: rawText || undefined, chips: chips || undefined }),
      timeout: 60_000, // AI parse + motivations can take a while
    });
  },

  async alternative(requestId, direction, excludeTemplateIds = []) {
    return apiFetch(`/dinner/requests/${requestId}/alternative`, {
      method: 'POST',
      body: JSON.stringify({ direction, excludeTemplateIds }),
      timeout: 60_000,
    });
  },

  async accept(recommendationId) {
    return apiFetch(`/dinner/recommendations/${recommendationId}/accept`, { method: 'POST' });
  },
};

// ── Nisse: Shopping list API ──

export const shoppingLists = {
  async list(status = 'ACTIVE') {
    return apiFetch(`/shopping-lists?status=${status}`);
  },

  async get(id) {
    return apiFetch(`/shopping-lists/${id}`);
  },

  async updateItem(listId, itemId, data) {
    return apiFetch(`/shopping-lists/${listId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async setStatus(listId, status) {
    return apiFetch(`/shopping-lists/${listId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
};

// ── Nisse: Cook session API ──

export const cookSessions = {
  async start(payload) {
    return apiFetch('/cook-sessions', { method: 'POST', body: JSON.stringify(payload) });
  },

  async get(id) {
    return apiFetch(`/cook-sessions/${id}`);
  },

  async update(id, data) {
    return apiFetch(`/cook-sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },

  async rescue(id, problem) {
    return apiFetch(`/cook-sessions/${id}/rescue`, {
      method: 'POST',
      body: JSON.stringify({ problem }),
      timeout: 45_000,
    });
  },

  async ask(id, question, context) {
    return apiFetch(`/cook-sessions/${id}/ask`, {
      method: 'POST',
      body: JSON.stringify({ question, context }),
      timeout: 60_000,
    });
  },

  async feedback(id, data) {
    return apiFetch(`/cook-sessions/${id}/feedback`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

export default { auth, recipes, lexicon, gdpr, locations, mealPlans, cooking, households, dinner, shoppingLists, cookSessions };
