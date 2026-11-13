import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../types';
import * as purchasesService from '../services/purchases.service';
import { sendSuccess } from '../utils/response';
import { validate } from '../middleware/validate';
import { getPagination, buildPaginationMeta } from '../utils/pagination';
import { ForbiddenError } from '../utils/errors';

function getBusinessId(req: AuthRequest): string {
  if (!req.business) throw new ForbiddenError('No business found');
  return req.business.id;
}

export const createPurchaseValidators = [
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('items.*.productId').notEmpty().withMessage('Product ID required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.unitCost').isFloat({ min: 0 }).withMessage('Unit cost must be positive'),
  validate,
];

export async function getPurchases(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req);
    const { search, dateFrom, dateTo } = req.query as Record<string, string>;
    const { purchases, total } = await purchasesService.getPurchases(getBusinessId(req), {
      search, dateFrom, dateTo, page, limit, skip,
    });
    sendSuccess(res, purchases, undefined, 200, buildPaginationMeta(page, limit, total));
  } catch (e) { next(e); }
}

export async function getPurchase(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const purchase = await purchasesService.getPurchaseById(getBusinessId(req), String(req.params.id));
    sendSuccess(res, purchase);
  } catch (e) { next(e); }
}

export async function createPurchase(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const purchase = await purchasesService.createPurchase(getBusinessId(req), req.body);
    sendSuccess(res, purchase, 'Purchase recorded and stock updated', 201);
  } catch (e) { next(e); }
}
