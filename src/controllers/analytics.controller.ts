import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import * as analyticsService from '../services/analytics.service';
import { sendSuccess } from '../utils/response';
import { ForbiddenError } from '../utils/errors';

function getBusinessId(req: AuthRequest): string {
  if (!req.business) throw new ForbiddenError('No business found');
  return req.business.id;
}

export async function getDashboard(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const stats = await analyticsService.getDashboardStats(getBusinessId(req));
    sendSuccess(res, stats);
  } catch (e) { next(e); }
}

export async function getSalesTrend(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const trend = await analyticsService.getSalesTrend(getBusinessId(req), days);
    sendSuccess(res, trend);
  } catch (e) { next(e); }
}

export async function getTopProducts(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const days = parseInt(req.query.days as string) || 30;
    const products = await analyticsService.getTopProducts(getBusinessId(req), limit, days);
    sendSuccess(res, products);
  } catch (e) { next(e); }
}

export async function getSlowMoving(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const products = await analyticsService.getSlowMovingProducts(getBusinessId(req), days);
    sendSuccess(res, products);
  } catch (e) { next(e); }
}

export async function getInventoryDistribution(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const dist = await analyticsService.getInventoryDistribution(getBusinessId(req));
    sendSuccess(res, dist);
  } catch (e) { next(e); }
}

export async function getMonthlyComparison(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const months = parseInt(req.query.months as string) || 6;
    const data = await analyticsService.getMonthlyComparison(getBusinessId(req), months);
    sendSuccess(res, data);
  } catch (e) { next(e); }
}
