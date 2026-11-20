import { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../utils/response';
import { AuthRequest } from '../types';
import * as adminService from '../services/admin.service';

// ── Validators ────────────────────────────────────────────────────────────────
export const adminLoginValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
  validate,
];

export const suspendValidators = [
  body('reason').trim().notEmpty().withMessage('Suspension reason is required'),
  validate,
];

// ── Admin login ───────────────────────────────────────────────────────────────
export async function adminLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const ip: string = (req as any)._bruteForceIp ?? req.socket.remoteAddress ?? 'unknown';
    const userAgent = req.headers['user-agent'];
    const result = await adminService.adminLogin(req.body.email, req.body.password, ip, userAgent);
    sendSuccess(res, result, 'Admin login successful');
  } catch (error) { next(error); }
}

// ── Platform stats ────────────────────────────────────────────────────────────
export async function getStats(_req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await adminService.getPlatformStats());
  } catch (error) { next(error); }
}

// ── Users ─────────────────────────────────────────────────────────────────────
export async function getUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = (req.query.search as string) || '';
    sendSuccess(res, await adminService.getAllUsers(page, limit, search));
  } catch (error) { next(error); }
}

export async function toggleUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await adminService.toggleUserActive(String(req.params.userId), req.user!.id);
    sendSuccess(res, result, `User ${result.isActive ? 'activated' : 'deactivated'}`);
  } catch (error) { next(error); }
}

export async function suspendUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await adminService.suspendUser(
      String(req.params.userId),
      req.user!.id,
      req.body.reason
    );
    sendSuccess(res, result, 'User suspended');
  } catch (error) { next(error); }
}

export async function unsuspendUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await adminService.unsuspendUser(String(req.params.userId), req.user!.id);
    sendSuccess(res, result, 'User unsuspended');
  } catch (error) { next(error); }
}

export async function deleteUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await adminService.deleteUser(String(req.params.userId), req.user!.id);
    sendSuccess(res, result, 'User deleted');
  } catch (error) { next(error); }
}

// ── Businesses ────────────────────────────────────────────────────────────────
export async function getBusinesses(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = (req.query.search as string) || '';
    sendSuccess(res, await adminService.getAllBusinesses(page, limit, search));
  } catch (error) { next(error); }
}

// ── Revenue trend ─────────────────────────────────────────────────────────────
export async function getRevenueTrend(req: Request, res: Response, next: NextFunction) {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);
    sendSuccess(res, await adminService.getPlatformRevenueTrend(days));
  } catch (error) { next(error); }
}

// ── Top businesses ────────────────────────────────────────────────────────────
export async function getTopBusinesses(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    sendSuccess(res, await adminService.getTopBusinesses(limit));
  } catch (error) { next(error); }
}
