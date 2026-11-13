import { Router } from 'express';
import { authenticate, injectBusiness } from '../middleware/auth';
import * as ctrl from '../controllers/analytics.controller';

const router = Router();
router.use(authenticate, injectBusiness);

router.get('/dashboard', ctrl.getDashboard);
router.get('/sales-trend', ctrl.getSalesTrend);
router.get('/top-products', ctrl.getTopProducts);
router.get('/slow-moving', ctrl.getSlowMoving);
router.get('/inventory-distribution', ctrl.getInventoryDistribution);
router.get('/monthly-comparison', ctrl.getMonthlyComparison);

export default router;
