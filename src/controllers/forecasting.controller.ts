import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import * as forecastingService from '../services/forecasting.service';
import * as restockingService from '../services/restocking.service';
import { sendSuccess } from '../utils/response';
import { ForbiddenError, ValidationError } from '../utils/errors';

function getBusinessId(req: AuthRequest): string {
  if (!req.business) throw new ForbiddenError('No business found');
  return req.business.id;
}

export async function forecastProduct(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const days = parseInt(req.query.days as string) || 14;
    if (![7, 14, 30].includes(days)) throw new ValidationError('Days must be 7, 14, or 30');
    const result = await forecastingService.forecastProduct(
      getBusinessId(req),
      String(req.params.productId),
      days as 7 | 14 | 30
    );
    sendSuccess(res, result);
  } catch (e) { next(e); }
}

export async function forecastAll(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const days = parseInt(req.query.days as string) || 14;
    if (![7, 14, 30].includes(days)) throw new ValidationError('Days must be 7, 14, or 30');
    const results = await forecastingService.forecastAllProducts(
      getBusinessId(req),
      days as 7 | 14 | 30
    );
    sendSuccess(res, results);
  } catch (e) { next(e); }
}

export async function getRestockRecommendations(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const recommendations = await restockingService.getRestockRecommendations(getBusinessId(req));
    sendSuccess(res, recommendations);
  } catch (e) { next(e); }
}
