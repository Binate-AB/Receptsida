// ============================================
// Auth Routes — Register, Login, Verify, Reset
// ============================================

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../config/db.js';
import { config } from '../config/env.js';
import {
  validate,
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../middleware/validate.js';
import { generateAccessToken, generateRefreshToken, requireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
} from '../config/email.js';

const router = Router();

// ──────────────────────────────────────────
// POST /auth/register
// ──────────────────────────────────────────
router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, name, householdSize } = req.validated;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Allow re-registration if the previous account was never verified
      if (!existing.emailVerified && existing.authProvider === 'EMAIL') {
        await prisma.user.delete({ where: { id: existing.id } });
      } else {
        throw new AppError(409, 'email_taken', 'E-postadressen är redan registrerad.');
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        householdSize,
        verifyToken,
        verifyExpires,
        searchQuota: {
          create: { searchesUsed: 0 },
        },
      },
    });

    // Send verification email (non-blocking)
    sendVerificationEmail(user, verifyToken).catch((err) =>
      console.error('Failed to send verification email:', err.message)
    );

    // Still generate tokens so user can use the app immediately
    const accessToken = generateAccessToken(user);
    const refreshTokenValue = await generateRefreshToken(user);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        householdSize: user.householdSize,
        plan: user.plan,
        emailVerified: user.emailVerified,
        authProvider: user.authProvider,
        onboardingDone: user.onboardingDone,
      },
      accessToken,
      refreshToken: refreshTokenValue,
      isNewUser: true,
    });
  })
);

// ──────────────────────────────────────────
// POST /auth/verify — Verify email with token
// ──────────────────────────────────────────
router.post(
  '/verify',
  asyncHandler(async (req, res) => {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      throw new AppError(400, 'invalid_token', 'Verifieringstoken saknas.');
    }

    const user = await prisma.user.findUnique({
      where: { verifyToken: token },
    });

    if (!user) {
      throw new AppError(400, 'invalid_token', 'Ogiltig eller redan använd verifieringslänk.');
    }

    if (user.verifyExpires && user.verifyExpires < new Date()) {
      throw new AppError(400, 'token_expired', 'Verifieringslänken har gått ut. Begär en ny.');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verifyToken: null,
        verifyExpires: null,
      },
    });

    // Send welcome email after verification (non-blocking)
    if (!user.welcomeMailSent) {
      sendWelcomeEmail(user).catch((err) =>
        console.error('Failed to send welcome email:', err.message)
      );
      prisma.user
        .update({ where: { id: user.id }, data: { welcomeMailSent: true } })
        .catch(() => {});
    }

    res.json({ message: 'E-postadressen är verifierad!' });
  })
);

// ──────────────────────────────────────────
// POST /auth/resend-verification
// ──────────────────────────────────────────
router.post(
  '/resend-verification',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (!user) {
      throw new AppError(404, 'user_not_found', 'Användaren hittades inte.');
    }

    if (user.emailVerified) {
      return res.json({ message: 'E-postadressen är redan verifierad.' });
    }

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { verifyToken, verifyExpires },
    });

    await sendVerificationEmail(user, verifyToken);

    res.json({ message: 'Ny verifieringslänk skickad till din e-post.' });
  })
);

// ──────────────────────────────────────────
// POST /auth/forgot-password
// ──────────────────────────────────────────
router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.validated;

    // Always respond success to prevent email enumeration
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1h

      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken, resetExpires },
      });

      sendPasswordResetEmail(user, resetToken).catch((err) =>
        console.error('Failed to send reset email:', err.message)
      );
    }

    res.json({
      message: 'Om e-postadressen finns i vårt system har vi skickat en återställningslänk.',
    });
  })
);

// ──────────────────────────────────────────
// POST /auth/reset-password
// ──────────────────────────────────────────
router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = req.validated;

    const user = await prisma.user.findUnique({
      where: { resetToken: token },
    });

    if (!user) {
      throw new AppError(400, 'invalid_token', 'Ogiltig eller redan använd återställningslänk.');
    }

    if (user.resetExpires && user.resetExpires < new Date()) {
      throw new AppError(400, 'token_expired', 'Återställningslänken har gått ut. Begär en ny.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetExpires: null,
      },
    });

    // Invalidate all refresh tokens (force re-login)
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    res.json({ message: 'Lösenordet har uppdaterats. Logga in med ditt nya lösenord.' });
  })
);

// ──────────────────────────────────────────
// POST /auth/login
// ──────────────────────────────────────────
router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.validated;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError(401, 'invalid_credentials', 'Fel e-post eller lösenord.');
    }

    // Social auth users without password should use their provider to log in
    if (!user.passwordHash) {
      throw new AppError(401, 'social_auth_user', `Detta konto använder ${user.authProvider}-inloggning. Logga in med ${user.authProvider === 'GOOGLE' ? 'Google' : 'Apple'} istället.`);
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      throw new AppError(401, 'invalid_credentials', 'Fel e-post eller lösenord.');
    }

    const accessToken = generateAccessToken(user);
    const refreshTokenValue = await generateRefreshToken(user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        householdSize: user.householdSize,
        plan: user.plan,
        emailVerified: user.emailVerified,
        authProvider: user.authProvider,
        onboardingDone: user.onboardingDone,
      },
      accessToken,
      refreshToken: refreshTokenValue,
    });
  })
);

// ──────────────────────────────────────────
// POST /auth/refresh
// ──────────────────────────────────────────
router.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.validated;

    let payload;
    try {
      payload = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET);
    } catch {
      throw new AppError(401, 'invalid_refresh_token', 'Ogiltig refresh-token.');
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      if (storedToken) {
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      }
      throw new AppError(401, 'expired_refresh_token', 'Refresh-token har gått ut.');
    }

    await prisma.refreshToken.delete({ where: { id: storedToken.id } });

    const newAccessToken = generateAccessToken(storedToken.user);
    const newRefreshToken = await generateRefreshToken(storedToken.user);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  })
);

// ──────────────────────────────────────────
// POST /auth/logout
// ──────────────────────────────────────────
router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.refreshToken.deleteMany({
      where: { userId: req.user.id },
    });

    res.json({ message: 'Utloggad.' });
  })
);

// ──────────────────────────────────────────
// GET /auth/me
// ──────────────────────────────────────────
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        searchQuota: true,
        membership: { select: { householdId: true } },
        _count: { select: { favorites: true, searches: true } },
      },
    });

    if (!user) {
      throw new AppError(404, 'user_not_found', 'Användaren hittades inte.');
    }

    // app_return: /auth/me runs once per app open — dedup to one event
    // per user and calendar day (return-frequency metric). Fail-open.
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todays = await prisma.analyticsEvent.findFirst({
        where: { userId: user.id, name: 'app_return', createdAt: { gte: startOfDay } },
        select: { id: true },
      });
      if (!todays) {
        const last = await prisma.analyticsEvent.findFirst({
          where: { userId: user.id, name: 'app_return' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        const daysSinceLast = last
          ? Math.round((Date.now() - last.createdAt.getTime()) / 86_400_000)
          : null;
        await prisma.analyticsEvent.create({
          data: {
            userId: user.id,
            householdId: user.membership?.householdId || null,
            name: 'app_return',
            payload: { days_since_last: daysSinceLast },
          },
        });
      }
    } catch {
      // analytics must never break auth
    }

    const limit =
      user.plan === 'FREE'
        ? config.RECIPE_SEARCH_LIMIT_PER_HOUR
        : config.RECIPE_SEARCH_LIMIT_PER_HOUR_PREMIUM;

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      householdSize: user.householdSize,
      plan: user.plan,
      emailVerified: user.emailVerified,
      authProvider: user.authProvider,
      onboardingDone: user.onboardingDone,
      locationConsent: user.locationConsent,
      gdprConsentAt: user.gdprConsentAt,
      stats: {
        totalSearches: user._count.searches,
        totalFavorites: user._count.favorites,
        searchesUsedThisPeriod: user.searchQuota?.searchesUsed || 0,
        searchLimit: limit,
      },
      createdAt: user.createdAt,
    });
  })
);

// ──────────────────────────────────────────
// POST /auth/complete-onboarding
// ──────────────────────────────────────────
router.post(
  '/complete-onboarding',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { onboardingDone: true },
    });

    res.json({ message: 'Onboarding klar!' });
  })
);

export default router;
