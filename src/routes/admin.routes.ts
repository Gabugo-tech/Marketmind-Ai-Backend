import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdmin } from '../middleware/auth';
import { adminBruteForce } from '../middleware/bruteForce';
import * as ctrl from '../controllers/admin.controller';

const router = Router();

// ── Admin login: IP rate-limit (10/15min) + DB brute-force tracking ───────────
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

router.post('/login', adminLoginLimiter, adminBruteForce, ctrl.adminLoginValidators, ctrl.adminLogin);

// All routes below require a valid admin JWT (ADMIN_JWT_SECRET)
router.use(requireAdmin);

router.get('/stats',                          ctrl.getStats);
router.get('/users',                          ctrl.getUsers);
router.patch('/users/:userId/toggle',         ctrl.toggleUser);
router.post('/users/:userId/suspend',         ctrl.suspendValidators, ctrl.suspendUser);
router.post('/users/:userId/unsuspend',       ctrl.unsuspendUser);
router.delete('/users/:userId',               ctrl.deleteUser);
router.get('/businesses',                     ctrl.getBusinesses);
router.get('/revenue-trend',                  ctrl.getRevenueTrend);
router.get('/top-businesses',                 ctrl.getTopBusinesses);

export default router;
