import { prisma } from '../database/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from '../utils/errors';
import { recordFailedAttempt, recordSuccessAndClear } from '../middleware/bruteForce';

// ── Admin login — issues a SHORT-LIVED token signed with the ADMIN_JWT_SECRET ─
export async function adminLogin(
  email: string,
  password: string,
  ip: string,
  userAgent?: string
) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  // Generic message — never reveal whether the email exists
  if (!user || !user.isActive || user.role !== 'ADMIN') {
    await recordFailedAttempt(ip, email, userAgent);
    throw new UnauthorizedError('Invalid credentials');
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    await recordFailedAttempt(ip, email, userAgent);
    throw new UnauthorizedError('Invalid credentials');
  }

  await recordSuccessAndClear(ip, email, userAgent);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  // Admin token is signed with a separate secret and expires in 2 hours
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: 'ADMIN' },
    config.adminJwt.secret,
    { expiresIn: config.adminJwt.expiresIn as jwt.SignOptions['expiresIn'] }
  );

  return {
    token,
    admin: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
  };
}

// ── Platform-wide stats ────────────────────────────────────────────────────────
export async function getPlatformStats() {
  const [totalUsers, totalBusinesses, salesAgg, activeUsers] = await Promise.all([
    prisma.user.count(),
    prisma.business.count(),
    prisma.sale.aggregate({
      _sum: { total: true, grossProfit: true },
      _count: { id: true },
    }),
    prisma.user.count({ where: { isActive: true } }),
  ]);

  // New users in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const newUsersThisMonth = await prisma.user.count({
    where: { createdAt: { gte: thirtyDaysAgo } },
  });

  return {
    totalUsers,
    activeUsers,
    newUsersThisMonth,
    totalBusinesses,
    totalRevenue: Number(salesAgg._sum.total ?? 0),
    totalProfit: Number(salesAgg._sum.grossProfit ?? 0),
    totalSalesCount: salesAgg._count.id,
  };
}

// ── All users (paginated) ──────────────────────────────────────────────────────
export async function getAllUsers(page = 1, limit = 20, search = '') {
  const skip = (page - 1) * limit;
  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { businesses: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ── Toggle user active/inactive ───────────────────────────────────────────────
export async function toggleUserActive(userId: string, adminId: string) {
  if (userId === adminId) throw new Error('Cannot deactivate your own account');

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, role: true } });
  if (!user) throw new Error('User not found');
  if (user.role === 'ADMIN') throw new Error('Cannot deactivate another admin');

  return prisma.user.update({
    where: { id: userId },
    data: { isActive: !user.isActive },
    select: { id: true, isActive: true },
  });
}

// ── All businesses (paginated) ────────────────────────────────────────────────
export async function getAllBusinesses(page = 1, limit = 20, search = '') {
  const skip = (page - 1) * limit;
  const where = search
    ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { location: { contains: search, mode: 'insensitive' as const } }] }
    : {};

  const [businesses, total] = await Promise.all([
    prisma.business.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        category: true,
        location: true,
        createdAt: true,
        isDemo: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        _count: { select: { products: true, sales: true } },
        sales: {
          select: { total: true, grossProfit: true },
          where: { status: 'COMPLETED' },
        },
      },
    }),
    prisma.business.count({ where }),
  ]);

  const enriched = businesses.map((b) => ({
    id: b.id,
    name: b.name,
    category: b.category,
    location: b.location,
    isDemo: b.isDemo,
    createdAt: b.createdAt,
    owner: b.user,
    productCount: b._count.products,
    salesCount: b._count.sales,
    totalRevenue: b.sales.reduce((s, x) => s + Number(x.total), 0),
    totalProfit: b.sales.reduce((s, x) => s + Number(x.grossProfit), 0),
  }));

  return { businesses: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ── Platform revenue trend (daily totals, last N days) ─────────────────────────
export async function getPlatformRevenueTrend(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const sales = await prisma.sale.findMany({
    where: { soldAt: { gte: since }, status: 'COMPLETED' },
    select: { soldAt: true, total: true, grossProfit: true },
    orderBy: { soldAt: 'asc' },
  });

  // Aggregate by date string
  const map: Record<string, { revenue: number; profit: number; transactions: number }> = {};
  for (const s of sales) {
    const d = s.soldAt.toISOString().slice(0, 10);
    if (!map[d]) map[d] = { revenue: 0, profit: 0, transactions: 0 };
    map[d].revenue += Number(s.total);
    map[d].profit += Number(s.grossProfit);
    map[d].transactions += 1;
  }

  // Fill gaps
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    result.push({ date: d, ...(map[d] ?? { revenue: 0, profit: 0, transactions: 0 }) });
  }
  return result;
}

// ── Top businesses by revenue ─────────────────────────────────────────────────
export async function getTopBusinesses(limit = 10) {
  const businesses = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      location: true,
      user: { select: { firstName: true, lastName: true } },
      sales: { where: { status: 'COMPLETED' }, select: { total: true, grossProfit: true } },
      _count: { select: { products: true } },
    },
  });

  return businesses
    .map((b) => ({
      id: b.id,
      name: b.name,
      category: b.category,
      location: b.location,
      owner: `${b.user.firstName} ${b.user.lastName}`,
      totalRevenue: b.sales.reduce((s, x) => s + Number(x.total), 0),
      totalProfit: b.sales.reduce((s, x) => s + Number(x.grossProfit), 0),
      productCount: b._count.products,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit);
}
