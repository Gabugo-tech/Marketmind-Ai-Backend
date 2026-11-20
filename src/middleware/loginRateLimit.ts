/**
 * Trader login brute-force protection.
 *
 * Uses express-rate-limit (in-memory, per-IP) — simpler than the DB-backed
 * admin approach since trader accounts are less sensitive than the admin panel,
 * but still blocks automated attacks.
 *
 * Rules:
 *   - Max 10 attempts per IP per 15 minutes
 *   - On 11th attempt returns 429 with a clear message
 *   - Successful requests do NOT count toward the limit
 */
import rateLimit from 'express-rate-limit';

export const traderLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true, // only count failures
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many failed login attempts from this device. Please wait 15 minutes before trying again.',
  },
  keyGenerator: (req) => {
    // Use forwarded IP if behind a proxy (Railway / Vercel)
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.socket.remoteAddress ?? 'unknown';
    return ip;
  },
});
