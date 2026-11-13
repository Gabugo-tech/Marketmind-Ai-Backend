/**
 * MarketMind AI — Intelligent Restocking Recommendation Engine
 *
 * For each product, calculates:
 *   - Average daily sales velocity (last 14 days)
 *   - Days of stock remaining
 *   - Reorder point = (avg_daily_sales × lead_time) + safety_stock
 *   - Recommended order quantity
 *   - Urgency level
 */

import { prisma } from '../database/client';
import { subDays } from 'date-fns';
import { RestockRecommendation } from '../types';

const DEFAULT_LEAD_DAYS = 3;
const SAFETY_STOCK_MULTIPLIER = 1.5; // 1.5× daily demand as safety buffer

export async function getRestockRecommendations(businessId: string): Promise<RestockRecommendation[]> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { settings: true },
  });

  const since14 = subDays(new Date(), 14);
  const since30 = subDays(new Date(), 30);

  const products = await prisma.product.findMany({
    where: { businessId, isActive: true },
    include: {
      supplier: { select: { id: true, name: true, leadTimeDays: true } },
    },
  });

  // Get sales velocity for last 14 days
  const salesData = await prisma.saleItem.groupBy({
    by: ['productId'],
    where: {
      sale: { businessId, status: 'COMPLETED', soldAt: { gte: since14 } },
    },
    _sum: { quantity: true },
  });

  const sales30Data = await prisma.saleItem.groupBy({
    by: ['productId'],
    where: {
      sale: { businessId, status: 'COMPLETED', soldAt: { gte: since30 } },
    },
    _sum: { quantity: true },
  });

  const sales14Map = new Map(salesData.map((s) => [s.productId, s._sum.quantity ?? 0]));
  const sales30Map = new Map(sales30Data.map((s) => [s.productId, s._sum.quantity ?? 0]));

  const recommendations: RestockRecommendation[] = [];

  for (const product of products) {
    const sold14 = sales14Map.get(product.id) ?? 0;
    const sold30 = sales30Map.get(product.id) ?? 0;

    // Use 14-day average for recency, weighted with 30-day for stability
    const avgDaily14 = sold14 / 14;
    const avgDaily30 = sold30 / 30;
    // Weighted: 70% recent, 30% longer-term
    const avgDailySales = avgDaily14 * 0.7 + avgDaily30 * 0.3;

    const leadDays = product.supplier?.leadTimeDays
      ?? business?.settings?.defaultSupplierLeadDays
      ?? DEFAULT_LEAD_DAYS;

    const safetyStock = Math.ceil(avgDailySales * SAFETY_STOCK_MULTIPLIER);
    const reorderPoint = Math.ceil(avgDailySales * leadDays) + safetyStock;
    const currentStock = product.quantity;

    // Days until stockout at current velocity
    let daysUntilStockout: number | null = null;
    if (avgDailySales > 0) {
      daysUntilStockout = Math.floor(currentStock / avgDailySales);
    }

    // Recommended order quantity: enough for 30 days + safety stock
    const targetStock = Math.ceil(avgDailySales * 30) + safetyStock;
    const recommendedQuantity = Math.max(0, targetStock - currentStock);

    // Determine urgency
    let urgency: 'IMMEDIATE' | 'SOON' | 'SUFFICIENT';
    let reason: string;

    if (currentStock <= 0) {
      urgency = 'IMMEDIATE';
      reason = `Out of stock. Product is unavailable for sale.`;
    } else if (daysUntilStockout !== null && daysUntilStockout <= leadDays) {
      urgency = 'IMMEDIATE';
      reason = `Stock will run out in ~${daysUntilStockout} day${daysUntilStockout === 1 ? '' : 's'}, before your supplier can deliver (${leadDays}-day lead time).`;
    } else if (currentStock <= reorderPoint) {
      urgency = 'SOON';
      reason = `Stock (${currentStock} units) has fallen below the reorder point (${reorderPoint} units). ${
        daysUntilStockout !== null ? `Estimated ${daysUntilStockout} days of stock remaining.` : ''
      }`;
    } else if (currentStock <= product.minStockLevel) {
      urgency = 'SOON';
      reason = `Stock is at or below your set minimum level (${product.minStockLevel} units).`;
    } else {
      urgency = 'SUFFICIENT';
      reason = `Stock is adequate. ${
        daysUntilStockout !== null
          ? `Estimated ${daysUntilStockout} days of stock at current sales rate.`
          : 'No recent sales data to estimate depletion.'
      }`;
    }

    recommendations.push({
      productId: product.id,
      productName: product.name,
      currentStock,
      minStockLevel: product.minStockLevel,
      avgDailySales: Math.round(avgDailySales * 100) / 100,
      daysUntilStockout,
      recommendedQuantity,
      urgency,
      reason,
      estimatedCost: Math.round(recommendedQuantity * Number(product.purchasePrice) * 100) / 100,
      supplierName: product.supplier?.name,
      supplierLeadDays: leadDays,
    });
  }

  // Sort: IMMEDIATE first, then SOON, then SUFFICIENT; within each, by daysUntilStockout asc
  const urgencyOrder = { IMMEDIATE: 0, SOON: 1, SUFFICIENT: 2 };
  recommendations.sort((a, b) => {
    const uo = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (uo !== 0) return uo;
    if (a.daysUntilStockout === null && b.daysUntilStockout === null) return 0;
    if (a.daysUntilStockout === null) return 1;
    if (b.daysUntilStockout === null) return -1;
    return a.daysUntilStockout - b.daysUntilStockout;
  });

  return recommendations;
}
