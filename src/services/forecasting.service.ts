/**
 * MarketMind AI — Sales Forecasting Engine
 *
 * Implements two proper time-series methods:
 *   1. Simple Moving Average (SMA) — good baseline
 *   2. Double Exponential Smoothing (Holt's Method) — handles trend
 *
 * Falls back gracefully when insufficient data exists.
 * Calculates MAPE and MAE on held-out test period for honest accuracy reporting.
 */

import { prisma } from '../database/client';
import { ForecastMethod, Prisma } from '@prisma/client';
import { subDays, addDays, format, eachDayOfInterval, startOfDay } from 'date-fns';
import { ForecastPoint, ForecastResult } from '../types';
import { NotFoundError } from '../utils/errors';

const MIN_DATA_POINTS = 7;    // Minimum days of history needed
const TEST_PERIOD_DAYS = 7;   // Days held out for backtesting accuracy

// ── Main forecast entry point ─────────────────────────────────────────────────

export async function forecastProduct(
  businessId: string,
  productId: string,
  forecastDays: 7 | 14 | 30
): Promise<ForecastResult> {
  const product = await prisma.product.findFirst({
    where: { id: productId, businessId },
    select: { id: true, name: true },
  });
  if (!product) throw new NotFoundError('Product');

  // Fetch daily sales history (last 90 days)
  const historyDays = 90;
  const historyStart = subDays(new Date(), historyDays);

  const salesData = await prisma.saleItem.findMany({
    where: {
      productId,
      sale: {
        businessId,
        status: 'COMPLETED',
        soldAt: { gte: startOfDay(historyStart) },
      },
    },
    include: { sale: { select: { soldAt: true } } },
  });

  // Aggregate into daily totals
  const dailyMap = new Map<string, number>();
  const historyInterval = eachDayOfInterval({ start: historyStart, end: new Date() });
  for (const d of historyInterval) {
    dailyMap.set(format(d, 'yyyy-MM-dd'), 0);
  }
  for (const item of salesData) {
    const key = format(item.sale.soldAt, 'yyyy-MM-dd');
    if (dailyMap.has(key)) {
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + item.quantity);
    }
  }

  const historicalValues = Array.from(dailyMap.values());
  const historicalDates = Array.from(dailyMap.keys());
  const dataPoints = historicalValues.filter((v) => v > 0).length;

  // Not enough real data
  if (dataPoints < MIN_DATA_POINTS) {
    const avgFromAll = historicalValues.length > 0
      ? historicalValues.reduce((s, v) => s + v, 0) / historicalValues.length
      : 0;

    const forecastPoints: ForecastPoint[] = [];
    // Show what little history we have
    for (let i = 0; i < historicalValues.length; i++) {
      forecastPoints.push({
        date: historicalDates[i],
        predicted: historicalValues[i],
        actual: historicalValues[i],
        isForecasted: false,
      });
    }
    // Simple projection
    for (let i = 1; i <= forecastDays; i++) {
      const d = addDays(new Date(), i);
      forecastPoints.push({
        date: format(d, 'yyyy-MM-dd'),
        predicted: Math.round(avgFromAll * 10) / 10,
        isForecasted: true,
      });
    }

    return {
      productId,
      productName: product.name,
      method: ForecastMethod.INSUFFICIENT_DATA,
      dataPointsUsed: dataPoints,
      forecastPoints,
      dailyAverage: Math.round(avgFromAll * 10) / 10,
      predictedTotal: Math.round(avgFromAll * forecastDays * 10) / 10,
      insufficientData: true,
      message: `Only ${dataPoints} days with recorded sales. Forecasts improve with more data. At least ${MIN_DATA_POINTS} days with sales are needed for reliable predictions.`,
    };
  }

  // Choose method: use Holt's if we have enough data to detect trend (21+ days)
  const method = historicalValues.length >= 21
    ? ForecastMethod.DOUBLE_EXPONENTIAL_SMOOTHING
    : ForecastMethod.MOVING_AVERAGE;

  let trainValues: number[];
  let testValues: number[];
  let testDates: string[];

  if (historicalValues.length > TEST_PERIOD_DAYS + MIN_DATA_POINTS) {
    // Hold out the last TEST_PERIOD_DAYS for accuracy evaluation
    const splitIdx = historicalValues.length - TEST_PERIOD_DAYS;
    trainValues = historicalValues.slice(0, splitIdx);
    testValues = historicalValues.slice(splitIdx);
    testDates = historicalDates.slice(splitIdx);
  } else {
    trainValues = historicalValues;
    testValues = [];
    testDates = [];
  }

  // Run forecast on training data
  let forecastedTest: number[] = [];
  let forecastedFuture: number[] = [];

  if (method === ForecastMethod.DOUBLE_EXPONENTIAL_SMOOTHING) {
    const { fitted, forecast } = holtsDoubleSmoothing(trainValues, testValues.length + forecastDays);
    forecastedTest = forecast.slice(0, testValues.length);
    forecastedFuture = forecast.slice(testValues.length);
    void fitted; // fitted values available for diagnostics
  } else {
    const window = Math.min(7, Math.floor(trainValues.length / 2));
    forecastedTest = movingAverageForecast(trainValues, testValues.length, window);
    forecastedFuture = movingAverageForecast(trainValues.concat(testValues), forecastDays, window);
  }

  // Calculate accuracy on test period
  let mape: number | undefined;
  let mae: number | undefined;

  if (testValues.length > 0) {
    const { mape: m, mae: a } = calculateAccuracy(testValues, forecastedTest);
    mape = m;
    mae = a;
  }

  // Build output: historical points + test-period + future
  const forecastPoints: ForecastPoint[] = [];

  // Historical (training period) — show last 30 days max for readability
  const displayHistoryStart = Math.max(0, historicalDates.length - 30);
  for (let i = displayHistoryStart; i < trainValues.length; i++) {
    forecastPoints.push({
      date: historicalDates[i],
      predicted: Math.round(trainValues[i] * 10) / 10,
      actual: trainValues[i],
      isForecasted: false,
    });
  }

  // Test period — both actual and predicted
  for (let i = 0; i < testValues.length; i++) {
    forecastPoints.push({
      date: testDates[i],
      predicted: Math.max(0, Math.round(forecastedTest[i] * 10) / 10),
      actual: testValues[i],
      isForecasted: false,
    });
  }

  // Future forecast
  const dailyForecastAvg = forecastedFuture.length > 0
    ? forecastedFuture.reduce((s, v) => s + Math.max(0, v), 0) / forecastedFuture.length
    : 0;

  for (let i = 0; i < forecastDays; i++) {
    const d = addDays(new Date(), i + 1);
    const predicted = Math.max(0, Math.round(forecastedFuture[i] * 10) / 10);
    // Confidence interval: ±20% if accurate model, wider otherwise
    const spread = mape !== undefined ? Math.min(0.5, mape / 100) : 0.25;

    forecastPoints.push({
      date: format(d, 'yyyy-MM-dd'),
      predicted,
      confidenceLow: Math.max(0, Math.round(predicted * (1 - spread) * 10) / 10),
      confidenceHigh: Math.round(predicted * (1 + spread) * 10) / 10,
      isForecasted: true,
    });
  }

  const predictedTotal = forecastedFuture.reduce((s, v) => s + Math.max(0, v), 0);

  // Persist forecast
  await upsertForecast(businessId, productId, {
    method,
    periodDays: forecastDays,
    predictedUnits: predictedTotal,
    mape,
    mae,
    dataPointsUsed: dataPoints,
    forecastData: forecastPoints,
  });

  return {
    productId,
    productName: product.name,
    method,
    dataPointsUsed: dataPoints,
    forecastPoints,
    dailyAverage: Math.round(dailyForecastAvg * 10) / 10,
    predictedTotal: Math.round(predictedTotal * 10) / 10,
    mape,
    mae,
    insufficientData: false,
  };
}

// ── Forecast all products for a business ─────────────────────────────────────

export async function forecastAllProducts(businessId: string, forecastDays: 7 | 14 | 30 = 14) {
  const products = await prisma.product.findMany({
    where: { businessId, isActive: true },
    select: { id: true, name: true },
    take: 50, // Safety cap
  });

  const results = await Promise.allSettled(
    products.map((p) => forecastProduct(businessId, p.id, forecastDays))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ForecastResult> => r.status === 'fulfilled')
    .map((r) => r.value);
}

// ── Algorithms ────────────────────────────────────────────────────────────────

/**
 * Holt's Double Exponential Smoothing
 * Handles both level and trend components.
 * alpha: level smoothing (0–1)
 * beta: trend smoothing (0–1)
 */
function holtsDoubleSmoothing(
  data: number[],
  forecastSteps: number,
  alpha = 0.3,
  beta = 0.1
): { fitted: number[]; forecast: number[] } {
  if (data.length < 2) return { fitted: data.slice(), forecast: Array(forecastSteps).fill(data[0] ?? 0) };

  let level = data[0];
  let trend = data[1] - data[0];
  const fitted: number[] = [];

  for (let i = 0; i < data.length; i++) {
    const prevLevel = level;
    const prevTrend = trend;
    level = alpha * data[i] + (1 - alpha) * (prevLevel + prevTrend);
    trend = beta * (level - prevLevel) + (1 - beta) * prevTrend;
    fitted.push(prevLevel + prevTrend);
  }

  const forecast: number[] = [];
  for (let h = 1; h <= forecastSteps; h++) {
    forecast.push(Math.max(0, level + h * trend));
  }

  return { fitted, forecast };
}

/**
 * Simple Moving Average forecast
 */
function movingAverageForecast(data: number[], steps: number, window: number): number[] {
  if (data.length === 0) return Array(steps).fill(0);
  const slice = data.slice(-window);
  const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
  return Array(steps).fill(Math.max(0, avg));
}

/**
 * Calculate MAPE and MAE
 */
function calculateAccuracy(actual: number[], predicted: number[]): { mape: number; mae: number } {
  const n = Math.min(actual.length, predicted.length);
  if (n === 0) return { mape: 0, mae: 0 };

  let mapeSum = 0;
  let maeSum = 0;
  let mapeCount = 0;

  for (let i = 0; i < n; i++) {
    const diff = Math.abs(actual[i] - predicted[i]);
    maeSum += diff;
    if (actual[i] > 0) {
      mapeSum += diff / actual[i];
      mapeCount++;
    }
  }

  const mae = maeSum / n;
  const mape = mapeCount > 0 ? (mapeSum / mapeCount) * 100 : 0;

  return {
    mape: Math.round(mape * 100) / 100,
    mae: Math.round(mae * 100) / 100,
  };
}

// ── Persistence ───────────────────────────────────────────────────────────────

async function upsertForecast(
  businessId: string,
  productId: string,
  data: {
    method: ForecastMethod;
    periodDays: number;
    predictedUnits: number;
    mape?: number;
    mae?: number;
    dataPointsUsed: number;
    forecastData: ForecastPoint[];
  }
) {
  const validUntil = addDays(new Date(), 1); // Forecasts expire daily

  // Delete old forecast for same product+period
  await prisma.forecast.deleteMany({
    where: { businessId, productId, periodDays: data.periodDays },
  });

  await prisma.forecast.create({
    data: {
      businessId,
      productId,
      method: data.method,
      periodDays: data.periodDays,
      predictedUnits: new Prisma.Decimal(data.predictedUnits),
      mape: data.mape !== undefined ? new Prisma.Decimal(data.mape) : null,
      mae: data.mae !== undefined ? new Prisma.Decimal(data.mae) : null,
      dataPointsUsed: data.dataPointsUsed,
      forecastData: data.forecastData as unknown as Prisma.InputJsonValue,
      validUntil,
    },
  });
}
