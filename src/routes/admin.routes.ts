import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdmin } from '../middleware/auth';
import { adminBruteForce } from '../middleware/bruteForce';
import * as ctrl from '../controllers/admin.controller';

const router = Router();

// ── Strict rate-limit for admin login: 10 req / 15 min per IP ─────────────────
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// POST /api/admin/login
// Protected by: IP rate-limit → brute-force DB tracking → validators
router.post(
  '/login',
  adminLoginLimiter,
  adminBruteForce,
  ctrl.adminLoginValidators,
  ctrl.adminLogin
);

// All routes below require a valid admin JWT (signed with ADMIN_JWT_SECRET)
router.use(requireAdmin);

router.get('/stats',           ctrl.getStats);
router.get('/users',           ctrl.getUsers);
router.patch('/users/:userId/toggle', ctrl.toggleUser);
router.get('/businesses',      ctrl.getBusinesses);
router.get('/revenue-trend',   ctrl.getRevenueTrend);
router.get('/top-businesses',  ctrl.getTopBusinesses);

export default router;
