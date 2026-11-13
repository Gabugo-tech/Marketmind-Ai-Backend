import { prisma } from '../database/client';
import { startOfDay, endOfDay, startOfWeek, startOfMonth, endOfMonth, subDays, format, eachDayOfInterval } from 'date-fns';
import { SaleStatus } from '@prisma/client';

export async function getDashboardStats(businessId: string) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [
    todaySales,
    weekSales,
    monthSales,
    productStats,
    inventoryData,
  ] = await Promise.all([
    // Today's sales
    prisma.sale.aggregate({
      where: { businessId, status: SaleStatus.COMPLETED, soldAt: { gte: todayStart, lte: todayEnd } },
      _sum: { total: true, grossProfit: true },
      _count: { id: true },
    }),
    // This week
    prisma.sale.aggregate({
      where: { businessId, status: SaleStatus.COMPLETED, soldAt: { gte: weekStart } },
      _sum: { total: true, grossProfit: true },
      _count: { id: true },
    }),
    // This month
    prisma.sale.aggregate({
      where: { businessId, status: SaleStatus.COMPLETED, soldAt: { gte: monthStart, lte: monthEnd } },
      _sum: { total: true, grossProfit: true },
      _count: { id: true },
    }),
    // Product stats
    prisma.product.aggregate({
      where: { businessId, isActive: true },
      _count: { id: true },
      _sum: { quantity: true },
    }),
    // Inventory value
    prisma.product.findMany({
      where: { businessId, isActive: true },
      select: { quantity: true, purchasePrice: true, sellingPrice: true, minStockLevel: true },
    }),
  ]);

  let totalInventoryValue = 0;
  let totalInventorySellingValue = 0;
  let lowStockCount = 0;
  let criticalStockCount = 0;
  let outOfStockCount = 0;

  for (const p of inventoryData) {
    const qty = p.quantity;
    const cost = Number(p.purchasePrice);
    const sell = Number(p.sellingPrice);
    const min = p.minStockLevel;

    totalInventoryValue += cost * qty;
    totalInventorySellingValue += sell * qty;

    if (qty <= 0) outOfStockCount++;
    else if (qty <= Math.floor(min * 0.5)) criticalStockCount++;
    else if (qty <= min) lowStockCount++;
  }

  return {
    salesToday: Number(todaySales._sum.total ?? 0),
    profitToday: Number(todaySales._sum.grossProfit ?? 0),
    transactionsToday: todaySales._count.id,
    salesThisWeek: Number(weekSales._sum.total ?? 0),
    profitThisWeek: Number(weekSales._sum.grossProfit ?? 0),
    transactionsThisWeek: weekSales._count.id,
    salesThisMonth: Number(monthSales._sum.total ?? 0),
    profitThisMonth: Number(monthSales._sum.grossProfit ?? 0),
    transactionsThisMonth: monthSales._count.id,
    totalInventoryValue,
    totalInventorySellingValue,
    potentialInventoryProfit: totalInventorySellingValue - totalInventoryValue,
    totalProducts: productStats._count.id,
    lowStockCount,
    criticalStockCount,
    outOfStockCount,
  };
}

export async function getSalesTrend(businessId: string, days = 30) {
  const endDate = new Date();
  const startDate = subDays(endDate, days - 1);

  const sales = await prisma.sale.findMany({
    where: {
      businessId,
      status: SaleStatus.COMPLETED,
      soldAt: { gte: startOfDay(startDate), lte: endOfDay(endDate) },
    },
    select: { soldAt: true, total: true, grossProfit: true },
    orderBy: { soldAt: 'asc' },
  });

  // Build daily aggregation
  const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
  const dailyMap = new Map<string, { revenue: number; profit: number; transactions: number }>();

  for (const d of dateRange) {
    dailyMap.set(format(d, 'yyyy-MM-dd'), { revenue: 0, profit: 0, transactions: 0 });
  }

  for (const sale of sales) {
    const key = format(sale.soldAt, 'yyyy-MM-dd');
    const existing = dailyMap.get(key);
    if (existing) {
      existing.revenue += Number(sale.total);
      existing.profit += Number(sale.grossProfit);
      existing.transactions += 1;
    }
  }

  return Array.from(dailyMap.entries()).map(([date, data]) => ({
    date,
    ...data,
  }));
}

export async function getTopProducts(businessId: string, limit = 10, days = 30) {
  const since = subDays(new Date(), days);

  const topSelling = await prisma.saleItem.groupBy({
    by: ['productId', 'productName'],
    where: {
      sale: { businessId, status: SaleStatus.COMPLETED, soldAt: { gte: since } },
    },
    _sum: { quantity: true, lineTotal: true, profit: true },
    orderBy: { _sum: { lineTotal: 'desc' } },
    take: limit,
  });

  return topSelling.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    totalQuantity: item._sum.quantity ?? 0,
    totalRevenue: Number(item._sum.lineTotal ?? 0),
    totalProfit: Number(item._sum.profit ?? 0),
  }));
}

export async function getSlowMovingProducts(businessId: string, days = 30) {
  const since = subDays(new Date(), days);

  // Get all active products
  const allProducts = await prisma.product.findMany({
    where: { businessId, isActive: true },
    select: { id: true, name: true, quantity: true, purchasePrice: true },
  });

  // Get products that had sales in the period
  const soldProducts = await prisma.saleItem.groupBy({
    by: ['productId'],
    where: { sale: { businessId, status: SaleStatus.COMPLETED, soldAt: { gte: since } } },
    _sum: { quantity: true },
  });

  const soldMap = new Map(soldProducts.map((s) => [s.productId, s._sum.quantity ?? 0]));

  // Products with no or very few sales
  return allProducts
    .filter((p) => {
      const sold = soldMap.get(p.id) ?? 0;
      return sold < 3; // Less than 3 units in the period
    })
    .map((p) => ({
      productId: p.id,
      productName: p.name,
      currentStock: p.quantity,
      unitsSoldInPeriod: soldMap.get(p.id) ?? 0,
      inventoryValue: Number(p.purchasePrice) * p.quantity,
    }))
    .sort((a, b) => a.unitsSoldInPeriod - b.unitsSoldInPeriod)
    .slice(0, 10);
}

export async function getInventoryDistribution(businessId: string) {
  const categories = await prisma.productCategory.findMany({
    where: { businessId },
    include: {
      products: {
        where: { isActive: true },
        select: { quantity: true, purchasePrice: true },
      },
    },
  });

  return categories.map((cat) => ({
    categoryName: cat.name,
    productCount: cat.products.length,
    totalValue: cat.products.reduce(
      (sum, p) => sum + Number(p.purchasePrice) * p.quantity, 0
    ),
    totalUnits: cat.products.reduce((sum, p) => sum + p.quantity, 0),
  }));
}

export async function getMonthlyComparison(businessId: string, months = 6) {
  const results = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = startOfMonth(date);
    const end = endOfMonth(date);

    const data = await prisma.sale.aggregate({
      where: { businessId, status: SaleStatus.COMPLETED, soldAt: { gte: start, lte: end } },
      _sum: { total: true, grossProfit: true },
      _count: { id: true },
    });

    results.push({
      month: format(date, 'MMM yyyy'),
      monthKey: format(date, 'yyyy-MM'),
      revenue: Number(data._sum.total ?? 0),
      profit: Number(data._sum.grossProfit ?? 0),
      transactions: data._count.id,
    });
  }

  return results;
}
