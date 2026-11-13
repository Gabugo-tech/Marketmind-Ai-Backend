import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../types';
import * as salesService from '../services/sales.service';
import { sendSuccess } from '../utils/response';
import { validate } from '../middleware/validate';
import { getPagination, buildPaginationMeta } from '../utils/pagination';
import { ForbiddenError } from '../utils/errors';
import { PaymentMethod } from '@prisma/client';

function getBusinessId(req: AuthRequest): string {
  if (!req.business) throw new ForbiddenError('No business found');
  return req.business.id;
}

export const createSaleValidators = [
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('items.*.productId').notEmpty().withMessage('Product ID required for each item'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('paymentMethod')
    .isIn(Object.values(PaymentMethod))
    .withMessage('Valid payment method required'),
  validate,
];

export async function getSales(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req);
    const { search, paymentMethod, dateFrom, dateTo } = req.query as Record<string, string>;
    const { sales, total } = await salesService.getSales(getBusinessId(req), {
      search, paymentMethod, dateFrom, dateTo, page, limit, skip,
    });
    sendSuccess(res, sales, undefined, 200, buildPaginationMeta(page, limit, total));
  } catch (e) { next(e); }
}

export async function getSale(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const sale = await salesService.getSaleById(getBusinessId(req), String(req.params.id));
    sendSuccess(res, sale);
  } catch (e) { next(e); }
}

export async function createSale(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const sale = await salesService.createSale(getBusinessId(req), req.body);
    sendSuccess(res, sale, 'Sale recorded successfully', 201);
  } catch (e) { next(e); }
}

export async function cancelSale(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await salesService.cancelSale(getBusinessId(req), String(req.params.id));
    sendSuccess(res, null, 'Sale cancelled and stock restored');
  } catch (e) { next(e); }
}
