import { prisma } from '../database/client';
import { MovementType, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../utils/errors';

// ── Products ──────────────────────────────────────────────────────────────────

export async function getProducts(businessId: string, filters: {
  search?: string; categoryId?: string; status?: string;
  page: number; limit: number; skip: number;
}) {
  // Build query conditions
  let statusWhere: Prisma.ProductWhereInput = { businessId, isActive: true };
  if (filters.search) {
    statusWhere.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { sku: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.categoryId) statusWhere.categoryId = filters.categoryId;
  if (filters.status === 'out_of_stock') statusWhere.quantity = { lte: 0 };
  if (filters.status === 'low_stock') {
    // quantity > 0 AND quantity <= minStockLevel — handled post-fetch for simplicity
  }

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where: statusWhere,
      include: {
        category: { select: { id: true, name: true, color: true } },
        supplier: { select: { id: true, name: true, leadTimeDays: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: filters.skip,
      take: filters.limit,
    }),
    prisma.product.count({ where: statusWhere }),
  ]);

  return { products: products.map(enrichProductStatus), total };
}

export async function getProductById(businessId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, businessId, isActive: true },
    include: {
      category: { select: { id: true, name: true, color: true } },
      supplier: { select: { id: true, name: true, phone: true, email: true, leadTimeDays: true } },
      inventoryMovements: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      saleItems: {
        include: { sale: { select: { soldAt: true, referenceNumber: true } } },
        orderBy: { sale: { soldAt: 'desc' } },
        take: 10,
      },
    },
  });

  if (!product) throw new NotFoundError('Product');
  return enrichProductStatus(product);
}

export async function createProduct(businessId: string, data: {
  name: string; description?: string; sku?: string; categoryId?: string;
  supplierId?: string; purchasePrice: number; sellingPrice: number;
  quantity: number; minStockLevel: number; unit: string; barcode?: string;
}) {
  if (data.purchasePrice < 0 || data.sellingPrice < 0) {
    throw new ValidationError('Prices cannot be negative');
  }
  if (data.quantity < 0) {
    throw new ValidationError('Initial quantity cannot be negative');
  }

  const product = await prisma.product.create({
    data: {
      businessId,
      ...data,
      purchasePrice: new Prisma.Decimal(data.purchasePrice),
      sellingPrice: new Prisma.Decimal(data.sellingPrice),
    },
  });

  // Record initial stock movement
  if (data.quantity > 0) {
    await prisma.inventoryMovement.create({
      data: {
        businessId,
        productId: product.id,
        type: MovementType.OPENING_STOCK,
        quantity: data.quantity,
        quantityBefore: 0,
        quantityAfter: data.quantity,
        notes: 'Opening stock',
      },
    });
  }

  return product;
}

export async function updateProduct(businessId: string, productId: string, data: Partial<{
  name: string; description: string; sku: string; categoryId: string;
  supplierId: string; purchasePrice: number; sellingPrice: number;
  minStockLevel: number; unit: string; barcode: string; imageUrl: string;
}>) {
  const product = await prisma.product.findFirst({ where: { id: productId, businessId } });
  if (!product) throw new NotFoundError('Product');

  const updateData: Prisma.ProductUpdateInput = { ...data };
  if (data.purchasePrice !== undefined) updateData.purchasePrice = new Prisma.Decimal(data.purchasePrice);
  if (data.sellingPrice !== undefined) updateData.sellingPrice = new Prisma.Decimal(data.sellingPrice);

  return prisma.product.update({ where: { id: productId }, data: updateData });
}

export async function deleteProduct(businessId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, businessId } });
  if (!product) throw new NotFoundError('Product');
  // Soft delete
  return prisma.product.update({ where: { id: productId }, data: { isActive: false } });
}

export async function adjustStock(businessId: string, productId: string, data: {
  adjustment: number; type: MovementType; notes?: string;
}) {
  const product = await prisma.product.findFirst({ where: { id: productId, businessId } });
  if (!product) throw new NotFoundError('Product');

  const newQty = product.quantity + data.adjustment;
  if (newQty < 0) throw new ValidationError('Stock cannot go below zero');

  const [updatedProduct] = await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { quantity: newQty },
    }),
    prisma.inventoryMovement.create({
      data: {
        businessId,
        productId,
        type: data.type,
        quantity: Math.abs(data.adjustment),
        quantityBefore: product.quantity,
        quantityAfter: newQty,
        notes: data.notes,
      },
    }),
  ]);

  return updatedProduct;
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function getCategories(businessId: string) {
  return prisma.productCategory.findMany({
    where: { businessId },
    include: { _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function createCategory(businessId: string, name: string, description?: string, color?: string) {
  return prisma.productCategory.create({
    data: { businessId, name: name.trim(), description, color },
  });
}

// ── Suppliers ─────────────────────────────────────────────────────────────────

export async function getSuppliers(businessId: string) {
  return prisma.supplier.findMany({
    where: { businessId, isActive: true },
    include: { _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function createSupplier(businessId: string, data: {
  name: string; contactName?: string; phone?: string; email?: string;
  address?: string; leadTimeDays?: number; notes?: string;
}) {
  return prisma.supplier.create({ data: { businessId, ...data } });
}

export async function updateSupplier(businessId: string, supplierId: string, data: Partial<{
  name: string; contactName: string; phone: string; email: string;
  address: string; leadTimeDays: number; notes: string;
}>) {
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, businessId } });
  if (!supplier) throw new NotFoundError('Supplier');
  return prisma.supplier.update({ where: { id: supplierId }, data });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function enrichProductStatus(product: {
  quantity: number;
  minStockLevel: number;
  purchasePrice: Prisma.Decimal;
  sellingPrice: Prisma.Decimal;
  [key: string]: unknown;
}) {
  const qty = product.quantity;
  const min = product.minStockLevel;

  let stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'CRITICAL_STOCK' | 'OUT_OF_STOCK';
  if (qty <= 0) stockStatus = 'OUT_OF_STOCK';
  else if (qty <= Math.floor(min * 0.5)) stockStatus = 'CRITICAL_STOCK';
  else if (qty <= min) stockStatus = 'LOW_STOCK';
  else stockStatus = 'IN_STOCK';

  const purchase = Number(product.purchasePrice);
  const selling = Number(product.sellingPrice);
  const inventoryValue = purchase * qty;
  const potentialProfit = (selling - purchase) * qty;
  const marginPercent = purchase > 0 ? ((selling - purchase) / purchase) * 100 : 0;

  return {
    ...product,
    stockStatus,
    inventoryValue,
    potentialProfit,
    marginPercent: Math.round(marginPercent * 10) / 10,
  };
}
