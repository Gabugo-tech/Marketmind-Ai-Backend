import { prisma } from '../database/client';
import { PaymentMethod, MovementType, Prisma, PurchaseStatus } from '@prisma/client';
import { NotFoundError, ValidationError } from '../utils/errors';
import { generateReference } from '../utils/response';

interface PurchaseItemInput {
  productId: string;
  quantity: number;
  unitCost: number;
  supplierId?: string;
}

interface CreatePurchaseInput {
  items: PurchaseItemInput[];
  supplierId?: string;
  supplierName?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus?: 'PAID' | 'PARTIAL' | 'PENDING';
  amountPaid?: number;
  notes?: string;
  purchasedAt?: Date;
}

export async function createPurchase(businessId: string, input: CreatePurchaseInput) {
  if (!input.items || input.items.length === 0) {
    throw new ValidationError('Purchase must include at least one item');
  }

  const result = await prisma.$transaction(async (tx) => {
    const productIds = input.items.map((i) => i.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, businessId },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundError('One or more products not found');
    }

    const productMap = new Map(products.map((p) => [p.id, p]));
    let subtotal = 0;

    const purchaseItems = input.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const lineTotal = item.unitCost * item.quantity;
      subtotal += lineTotal;
      return {
        productId: item.productId,
        supplierId: item.supplierId,
        productName: product.name,
        quantity: item.quantity,
        unitCost: new Prisma.Decimal(item.unitCost),
        lineTotal: new Prisma.Decimal(lineTotal),
      };
    });

    const total = subtotal;
    const amountPaid = input.amountPaid ?? total;

    const purchase = await tx.purchase.create({
      data: {
        businessId,
        referenceNumber: generateReference('PUR'),
        supplierId: input.supplierId,
        supplierName: input.supplierName,
        subtotal: new Prisma.Decimal(subtotal),
        taxAmount: new Prisma.Decimal(0),
        total: new Prisma.Decimal(total),
        amountPaid: new Prisma.Decimal(amountPaid),
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentStatus ?? 'PAID',
        notes: input.notes,
        status: PurchaseStatus.RECEIVED,
        purchasedAt: input.purchasedAt ?? new Date(),
        items: { create: purchaseItems },
      },
      include: { items: true },
    });

    // Update stock and record movements
    for (const item of input.items) {
      const product = productMap.get(item.productId)!;
      const newQty = product.quantity + item.quantity;

      await tx.product.update({
        where: { id: item.productId },
        data: {
          quantity: newQty,
          purchasePrice: new Prisma.Decimal(item.unitCost), // Update purchase price
          lastRestockedAt: new Date(),
        },
      });

      await tx.inventoryMovement.create({
        data: {
          businessId,
          productId: item.productId,
          type: MovementType.PURCHASE,
          quantity: item.quantity,
          quantityBefore: product.quantity,
          quantityAfter: newQty,
          referenceId: purchase.id,
          referenceType: 'PURCHASE',
        },
      });
    }

    return purchase;
  });

  return result;
}

export async function getPurchases(businessId: string, filters: {
  search?: string; dateFrom?: string; dateTo?: string;
  page: number; limit: number; skip: number;
}) {
  const where: Prisma.PurchaseWhereInput = {
    businessId,
    ...(filters.search && {
      OR: [
        { referenceNumber: { contains: filters.search, mode: 'insensitive' } },
        { supplierName: { contains: filters.search, mode: 'insensitive' } },
      ],
    }),
    ...(filters.dateFrom || filters.dateTo
      ? {
          purchasedAt: {
            ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
            ...(filters.dateTo && { lte: new Date(filters.dateTo + 'T23:59:59Z') }),
          },
        }
      : {}),
  };

  const [purchases, total] = await prisma.$transaction([
    prisma.purchase.findMany({
      where,
      include: {
        items: { select: { productName: true, quantity: true, lineTotal: true, unitCost: true } },
      },
      orderBy: { purchasedAt: 'desc' },
      skip: filters.skip,
      take: filters.limit,
    }),
    prisma.purchase.count({ where }),
  ]);

  return { purchases, total };
}

export async function getPurchaseById(businessId: string, purchaseId: string) {
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, businessId },
    include: { items: { include: { product: { select: { name: true, unit: true } } } } },
  });
  if (!purchase) throw new NotFoundError('Purchase');
  return purchase;
}
