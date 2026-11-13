import { prisma } from '../database/client';
import { PaymentMethod, MovementType, Prisma, SaleStatus } from '@prisma/client';
import { NotFoundError, ValidationError } from '../utils/errors';
import { generateReference } from '../utils/response';

interface SaleItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number; // override if different from product price
  discountAmount?: number;
}

interface CreateSaleInput {
  items: SaleItemInput[];
  paymentMethod: PaymentMethod;
  discountAmount?: number;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  soldAt?: Date;
}

export async function createSale(businessId: string, input: CreateSaleInput) {
  if (!input.items || input.items.length === 0) {
    throw new ValidationError('Sale must include at least one item');
  }

  // Validate products and stock within a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Fetch all products
    const productIds = input.items.map((i) => i.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, businessId, isActive: true },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundError('One or more products not found');
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Check stock and build sale items
    let subtotal = 0;
    let costOfGoods = 0;
    const saleItems: {
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      purchasePrice: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
      profit: Prisma.Decimal;
    }[] = [];

    for (const item of input.items) {
      const product = productMap.get(item.productId)!;

      if (product.quantity < item.quantity) {
        throw new ValidationError(
          `Insufficient stock for "${product.name}". Available: ${product.quantity}, Requested: ${item.quantity}`
        );
      }

      const unitPrice = item.unitPrice ?? Number(product.sellingPrice);
      const purchasePrice = Number(product.purchasePrice);
      const discount = item.discountAmount ?? 0;
      const lineTotal = unitPrice * item.quantity - discount;
      const profit = (unitPrice - purchasePrice) * item.quantity - discount;

      subtotal += lineTotal;
      costOfGoods += purchasePrice * item.quantity;

      saleItems.push({
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: new Prisma.Decimal(unitPrice),
        purchasePrice: new Prisma.Decimal(purchasePrice),
        discountAmount: new Prisma.Decimal(discount),
        lineTotal: new Prisma.Decimal(lineTotal),
        profit: new Prisma.Decimal(profit),
      });
    }

    const saleDiscount = input.discountAmount ?? 0;
    const total = subtotal - saleDiscount;
    const grossProfit = subtotal - costOfGoods - saleDiscount;

    // Create the sale record
    const sale = await tx.sale.create({
      data: {
        businessId,
        referenceNumber: generateReference('SAL'),
        subtotal: new Prisma.Decimal(subtotal),
        discountAmount: new Prisma.Decimal(saleDiscount),
        taxAmount: new Prisma.Decimal(0),
        total: new Prisma.Decimal(total),
        costOfGoods: new Prisma.Decimal(costOfGoods),
        grossProfit: new Prisma.Decimal(grossProfit),
        paymentMethod: input.paymentMethod,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        notes: input.notes,
        soldAt: input.soldAt ?? new Date(),
        items: { create: saleItems },
      },
      include: { items: true },
    });

    // Deduct stock and record inventory movements
    for (const item of input.items) {
      const product = productMap.get(item.productId)!;
      const newQty = product.quantity - item.quantity;

      await tx.product.update({
        where: { id: item.productId },
        data: { quantity: newQty },
      });

      await tx.inventoryMovement.create({
        data: {
          businessId,
          productId: item.productId,
          type: MovementType.SALE,
          quantity: item.quantity,
          quantityBefore: product.quantity,
          quantityAfter: newQty,
          referenceId: sale.id,
          referenceType: 'SALE',
        },
      });
    }

    return sale;
  });

  // After transaction: generate stock alerts if needed
  await checkAndCreateStockAlerts(businessId, input.items.map((i) => i.productId));

  return result;
}

export async function getSales(businessId: string, filters: {
  search?: string; paymentMethod?: string; dateFrom?: string; dateTo?: string;
  page: number; limit: number; skip: number;
}) {
  const where: Prisma.SaleWhereInput = {
    businessId,
    status: SaleStatus.COMPLETED,
    ...(filters.search && {
      OR: [
        { referenceNumber: { contains: filters.search, mode: 'insensitive' } },
        { customerName: { contains: filters.search, mode: 'insensitive' } },
      ],
    }),
    ...(filters.paymentMethod && { paymentMethod: filters.paymentMethod as PaymentMethod }),
    ...(filters.dateFrom || filters.dateTo
      ? {
          soldAt: {
            ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
            ...(filters.dateTo && { lte: new Date(filters.dateTo + 'T23:59:59Z') }),
          },
        }
      : {}),
  };

  const [sales, total] = await prisma.$transaction([
    prisma.sale.findMany({
      where,
      include: {
        items: { select: { productName: true, quantity: true, lineTotal: true, unitPrice: true } },
      },
      orderBy: { soldAt: 'desc' },
      skip: filters.skip,
      take: filters.limit,
    }),
    prisma.sale.count({ where }),
  ]);

  return { sales, total };
}

export async function getSaleById(businessId: string, saleId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, businessId },
    include: {
      items: {
        include: { product: { select: { name: true, imageUrl: true, unit: true } } },
      },
    },
  });
  if (!sale) throw new NotFoundError('Sale');
  return sale;
}

export async function cancelSale(businessId: string, saleId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, businessId },
    include: { items: true },
  });
  if (!sale) throw new NotFoundError('Sale');
  if (sale.status !== SaleStatus.COMPLETED) {
    throw new ValidationError('Sale is already cancelled or refunded');
  }

  await prisma.$transaction(async (tx) => {
    await tx.sale.update({ where: { id: saleId }, data: { status: SaleStatus.CANCELLED } });

    // Restore stock
    for (const item of sale.items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (product) {
        const newQty = product.quantity + item.quantity;
        await tx.product.update({ where: { id: item.productId }, data: { quantity: newQty } });
        await tx.inventoryMovement.create({
          data: {
            businessId,
            productId: item.productId,
            type: MovementType.RETURN_IN,
            quantity: item.quantity,
            quantityBefore: product.quantity,
            quantityAfter: newQty,
            referenceId: saleId,
            referenceType: 'SALE_CANCEL',
          },
        });
      }
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function checkAndCreateStockAlerts(businessId: string, productIds: string[]) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { settings: true },
  });
  const critical = business?.settings?.criticalStockThreshold ?? 5;

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, businessId },
  });

  for (const product of products) {
    if (product.quantity <= 0) {
      // Check if there's a recent unread notification
      const existing = await prisma.notification.findFirst({
        where: { businessId, data: { path: ['productId'], equals: product.id }, isRead: false, type: 'OUT_OF_STOCK' },
      });
      if (!existing) {
        await prisma.notification.create({
          data: {
            businessId,
            type: 'OUT_OF_STOCK',
            title: 'Out of Stock',
            message: `${product.name} is out of stock. Restock immediately to avoid lost sales.`,
            priority: 'URGENT',
            data: { productId: product.id, productName: product.name },
          },
        });
      }
    } else if (product.quantity <= critical) {
      const existing = await prisma.notification.findFirst({
        where: { businessId, data: { path: ['productId'], equals: product.id }, isRead: false, type: 'CRITICAL_STOCK' },
      });
      if (!existing) {
        await prisma.notification.create({
          data: {
            businessId,
            type: 'CRITICAL_STOCK',
            title: 'Critical Stock Level',
            message: `${product.name} has only ${product.quantity} units remaining.`,
            priority: 'HIGH',
            data: { productId: product.id, productName: product.name, quantity: product.quantity },
          },
        });
      }
    } else if (product.quantity <= product.minStockLevel) {
      const existing = await prisma.notification.findFirst({
        where: { businessId, data: { path: ['productId'], equals: product.id }, isRead: false, type: 'LOW_STOCK' },
      });
      if (!existing) {
        await prisma.notification.create({
          data: {
            businessId,
            type: 'LOW_STOCK',
            title: 'Low Stock Warning',
            message: `${product.name} is running low (${product.quantity} units). Consider restocking.`,
            priority: 'MEDIUM',
            data: { productId: product.id, productName: product.name, quantity: product.quantity },
          },
        });
      }
    }
  }
}
