import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../database/client';
import { AuthRequest } from '../types';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

interface JwtPayload {
  userId: string;
  email: string;
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7);
    let payload: JwtPayload;

    try {
      payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId, isActive: true },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

// Middleware to verify the trader owns the requested business
export async function requireBusiness(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const businessId = req.params.businessId || req.body.businessId;
    if (!businessId) {
      throw new ForbiddenError('Business ID required');
    }

    const business = await prisma.business.findFirst({
      where: { id: businessId, userId: req.user!.id },
    });

    if (!business) {
      throw new ForbiddenError('Access denied to this business');
    }

    req.business = business;
    next();
  } catch (error) {
    next(error);
  }
}

// Middleware to inject business from JWT for single-business routes
export async function injectBusiness(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const business = await prisma.business.findFirst({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'asc' },
    });

    if (business) {
      req.business = business;
    }
    next();
  } catch (error) {
    next(error);
  }
}
