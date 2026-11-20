import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/client';
import { config } from '../config';
import { AppError } from '../utils/errors';

/**
 * Brute-force protection for the admin login endpoint.
 *
 * Rules (all configurable via env vars):
 *   - Max 5 failed attempts from the same IP within 15 minutes
 *   - Lockout lasts 30 minutes from the last failed attempt
 *   - Successful login clears the IP's attempt counter
 *
 * We store attempts in the database (LoginAttempt model) so they survive
 * process restarts and work across multiple server instances.
 */
export async function adminBruteForce(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ip = (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown'
    );

    const { maxAttempts, windowMs, lockoutMs } = config.adminBruteForce;
    const windowStart = new Date(Date.now() - windowMs);
    const lockoutStart = new Date(Date.now() - lockoutMs);

    // Count recent failures from this IP within the lockout window
    const recentFailures = await prisma.loginAttempt.count({
      where: {
        ip,
        success: false,
        createdAt: { gte: lockoutStart },
      },
    });

    if (recentFailures >= maxAttempts) {
      // Find the most recent failure to calculate time remaining
      const lastFailure = await prisma.loginAttempt.findFirst({
        where: { ip, success: false },
        orderBy: { createdAt: 'desc' },
      });

      const retryAfterMs = lastFailure
        ? lockoutMs - (Date.now() - lastFailure.createdAt.getTime())
        : lockoutMs;

      const retryAfterSec = Math.ceil(Math.max(retryAfterMs, 0) / 1000);

      throw new AppError(
        `Too many failed login attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
        429
      );
    }

    // Also check rapid-fire attempts within short window (anti-automation)
    const rapidAttempts = await prisma.loginAttempt.count({
      where: {
        ip,
        createdAt: { gte: windowStart },
      },
    });

    if (rapidAttempts >= maxAttempts * 2) {
      throw new AppError('Too many requests. Please slow down.', 429);
    }

    // Attach helpers to request so the controller can record the outcome
    (req as any)._bruteForceIp = ip;
    next();
  } catch (error) {
    next(error);
  }
}

/** Call after a failed admin login attempt to record it */
export async function recordFailedAttempt(
  ip: string,
  email: string,
  userAgent?: string
): Promise<void> {
  await prisma.loginAttempt.create({
    data: { ip, email, success: false, userAgent },
  });
}

/** Call after a successful admin login to clear failures for this IP */
export async function recordSuccessAndClear(
  ip: string,
  email: string,
  userAgent?: string
): Promise<void> {
  await prisma.loginAttempt.create({
    data: { ip, email, success: true, userAgent },
  });
  // Delete old failure records for this IP so it starts fresh
  await prisma.loginAttempt.deleteMany({
    where: { ip, success: false },
  });
}
