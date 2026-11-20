import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../database/client';
import { config } from '../config';
import { ConflictError, UnauthorizedError } from '../utils/errors';
import { BusinessCategory } from '@prisma/client';

interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  businessName: string;
  businessCategory: BusinessCategory;
  businessLocation: string;
  businessAddress?: string;
  businessPhone?: string;
}

interface LoginInput {
  email: string;
  password: string;
}

function generateTokens(userId: string, email: string, role: 'USER' | 'ADMIN' = 'USER') {
  const accessToken = jwt.sign(
    { userId, email, role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
  );
  const refreshToken = jwt.sign(
    { userId, email, role },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'] }
  );
  return { accessToken, refreshToken };
}

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase().trim(),
      passwordHash,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone,
      businesses: {
        create: {
          name: input.businessName.trim(),
          category: input.businessCategory,
          location: input.businessLocation.trim(),
          address: input.businessAddress,
          phone: input.businessPhone,
          currency: 'NGN',
          timezone: 'Africa/Lagos',
          settings: {
            create: {
              lowStockThreshold: 10,
              criticalStockThreshold: 5,
              defaultSupplierLeadDays: 3,
            },
          },
        },
      },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      createdAt: true,
      businesses: {
        select: {
          id: true,
          name: true,
          category: true,
          location: true,
        },
      },
    },
  });

  const tokens = generateTokens(user.id, user.email, user.role);

  // Store refresh token
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  await prisma.refreshToken.create({
    data: { token: tokens.refreshToken, userId: user.id, expiresAt },
  });

  return { user, ...tokens };
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase().trim() },
    include: {
      businesses: {
        select: { id: true, name: true, category: true, location: true },
      },
    },
  });

  if (!user || !user.isActive) throw new UnauthorizedError('Invalid email or password');

  // Block suspended accounts with a clear message
  if (user.isSuspended) {
    throw new UnauthorizedError(
      user.suspendedReason
        ? `Your account has been suspended: ${user.suspendedReason}`
        : 'Your account has been suspended. Contact support.'
    );
  }

  const passwordMatch = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatch) throw new UnauthorizedError('Invalid email or password');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const tokens = generateTokens(user.id, user.email, user.role);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  await prisma.refreshToken.create({
    data: { token: tokens.refreshToken, userId: user.id, expiresAt },
  });

  const { passwordHash: _, ...safeUser } = user;

  return { user: safeUser, ...tokens };
}

export async function refreshUserToken(refreshToken: string) {
  let payload: { userId: string; email: string };
  try {
    payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as typeof payload;
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });

  if (!stored || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token expired');
  }

  // Rotate refresh token
  await prisma.refreshToken.delete({ where: { token: refreshToken } });

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  });

  const tokens = generateTokens(payload.userId, payload.email, user?.role ?? 'USER');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  await prisma.refreshToken.create({
    data: { token: tokens.refreshToken, userId: payload.userId, expiresAt },
  });

  return tokens;
}

export async function logoutUser(refreshToken?: string) {
  if (refreshToken) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } }).catch(() => {});
  }
}
