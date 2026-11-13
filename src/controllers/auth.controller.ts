import { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import * as authService from '../services/auth.service';
import { validate } from '../middleware/validate';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types';
import { prisma } from '../database/client';

export const registerValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').trim().notEmpty().withMessage('First name required'),
  body('lastName').trim().notEmpty().withMessage('Last name required'),
  body('businessName').trim().notEmpty().withMessage('Business name required'),
  body('businessCategory').notEmpty().withMessage('Business category required'),
  body('businessLocation').trim().notEmpty().withMessage('Business location required'),
  validate,
];

export const loginValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
  validate,
];

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.registerUser(req.body);
    sendSuccess(res, result, 'Account created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.loginUser(req.body);
    sendSuccess(res, result, 'Login successful');
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return sendError(res, 'Refresh token required', 400);
    const tokens = await authService.refreshUserToken(refreshToken);
    sendSuccess(res, tokens, 'Token refreshed');
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    await authService.logoutUser(refreshToken);
    sendSuccess(res, null, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, isEmailVerified: true, createdAt: true,
        businesses: {
          select: {
            id: true, name: true, category: true, location: true,
            address: true, phone: true, currency: true, isDemo: true,
            settings: true,
          },
        },
      },
    });
    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
}
