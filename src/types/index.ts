import { Request } from 'express';
import { User, Business } from '@prisma/client';

// Extended Express Request with authenticated user
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'USER' | 'ADMIN';
  };
  business?: Business;
}

// API Response envelope
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Analytics
export interface DashboardStats {
  salesToday: number;
  salesThisWeek: number;
  salesThisMonth: number;
  profitToday: number;
  profitThisMonth: number;
  totalInventoryValue: number;
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  criticalStockCount: number;
  totalSalesToday: number;
  totalTransactionsToday: number;
}

export interface SalesTrendPoint {
  date: string;
  revenue: number;
  profit: number;
  transactions: number;
}

export interface ProductPerformance {
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
  totalProfit: number;
  averageDailySales: number;
}

// Forecasting
export interface ForecastPoint {
  date: string;
  predicted: number;
  actual?: number;
  confidenceLow?: number;
  confidenceHigh?: number;
  isForecasted: boolean;
}

export interface ForecastResult {
  productId: string;
  productName: string;
  method: string;
  dataPointsUsed: number;
  forecastPoints: ForecastPoint[];
  dailyAverage: number;
  predictedTotal: number;
  mape?: number;
  mae?: number;
  insufficientData: boolean;
  message?: string;
}

// Restocking
export interface RestockRecommendation {
  productId: string;
  productName: string;
  currentStock: number;
  minStockLevel: number;
  avgDailySales: number;
  daysUntilStockout: number | null;
  recommendedQuantity: number;
  urgency: 'IMMEDIATE' | 'SOON' | 'SUFFICIENT';
  reason: string;
  estimatedCost: number;
  supplierName?: string;
  supplierLeadDays?: number;
}
