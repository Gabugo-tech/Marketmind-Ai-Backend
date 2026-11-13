import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../types';
import * as inventoryService from '../services/inventory.service';
import { sendSuccess } from '../utils/response';
import { validate } from '../middleware/validate';
import { getPagination, buildPaginationMeta } from '../utils/pagination';
import { ForbiddenError } from '../utils/errors';
import { MovementType } from '@prisma/client';

function getBusinessId(req: AuthRequest): string {
  if (!req.business) throw new ForbiddenError('No business found');
  return req.business.id;
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function getProducts(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const businessId = getBusinessId(req);
    const { page, limit, skip } = getPagination(req);
    const { search, categoryId, status } = req.query as Record<string, string>;
    const { products, total } = await inventoryService.getProducts(businessId, {
      search, categoryId, status, page, limit, skip,
    });
    sendSuccess(res, products, undefined, 200, buildPaginationMeta(page, limit, total));
  } catch (e) { next(e); }
}

export async function getProduct(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const product = await inventoryService.getProductById(getBusinessId(req), String(req.params.id));
    sendSuccess(res, product);
  } catch (e) { next(e); }
}

export const createProductValidators = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('purchasePrice').isFloat({ min: 0 }).withMessage('Purchase price must be a positive number'),
  body('sellingPrice').isFloat({ min: 0 }).withMessage('Selling price must be a positive number'),
  body('quantity').isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
  body('minStockLevel').optional().isInt({ min: 0 }),
  validate,
];

export async function createProduct(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const product = await inventoryService.createProduct(getBusinessId(req), req.body);
    sendSuccess(res, product, 'Product created successfully', 201);
  } catch (e) { next(e); }
}

export async function updateProduct(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const product = await inventoryService.updateProduct(getBusinessId(req), String(req.params.id), req.body);
    sendSuccess(res, product, 'Product updated successfully');
  } catch (e) { next(e); }
}

export async function deleteProduct(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await inventoryService.deleteProduct(getBusinessId(req), String(req.params.id));
    sendSuccess(res, null, 'Product deleted');
  } catch (e) { next(e); }
}

export async function adjustStock(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { adjustment, type, notes } = req.body;
    const product = await inventoryService.adjustStock(getBusinessId(req), String(req.params.id), {
      adjustment: parseInt(adjustment),
      type: type as MovementType,
      notes,
    });
    sendSuccess(res, product, 'Stock adjusted');
  } catch (e) { next(e); }
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function getCategories(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const categories = await inventoryService.getCategories(getBusinessId(req));
    sendSuccess(res, categories);
  } catch (e) { next(e); }
}

export async function createCategory(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { name, description, color } = req.body;
    const category = await inventoryService.createCategory(getBusinessId(req), name, description, color);
    sendSuccess(res, category, 'Category created', 201);
  } catch (e) { next(e); }
}

// ── Suppliers ─────────────────────────────────────────────────────────────────

export async function getSuppliers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const suppliers = await inventoryService.getSuppliers(getBusinessId(req));
    sendSuccess(res, suppliers);
  } catch (e) { next(e); }
}

export async function createSupplier(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const supplier = await inventoryService.createSupplier(getBusinessId(req), req.body);
    sendSuccess(res, supplier, 'Supplier added', 201);
  } catch (e) { next(e); }
}

export async function updateSupplier(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const supplier = await inventoryService.updateSupplier(getBusinessId(req), String(req.params.id), req.body);
    sendSuccess(res, supplier, 'Supplier updated');
  } catch (e) { next(e); }
}
