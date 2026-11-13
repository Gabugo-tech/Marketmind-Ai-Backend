import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { prisma } from '../database/client';
import { sendSuccess } from '../utils/response';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

// Update business settings
router.put('/settings', async (req: AuthRequest, res, next) => {
  try {
    const business = await prisma.business.findFirst({ where: { userId: req.user!.id } });
    if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

    const settings = await prisma.businessSettings.upsert({
      where: { businessId: business.id },
      update: req.body,
      create: { businessId: business.id, ...req.body },
    });
    sendSuccess(res, settings, 'Settings updated');
  } catch (e) { next(e); }
});

// Get business profile
router.get('/profile', async (req: AuthRequest, res, next) => {
  try {
    const business = await prisma.business.findFirst({
      where: { userId: req.user!.id },
      include: { settings: true, _count: { select: { products: true, sales: true } } },
    });
    sendSuccess(res, business);
  } catch (e) { next(e); }
});

// Update business profile
router.put('/profile', async (req: AuthRequest, res, next) => {
  try {
    const business = await prisma.business.findFirst({ where: { userId: req.user!.id } });
    if (!business) return res.status(404).json({ success: false, message: 'Not found' });
    const updated = await prisma.business.update({ where: { id: business.id }, data: req.body });
    sendSuccess(res, updated, 'Business updated');
  } catch (e) { next(e); }
});

export default router;
