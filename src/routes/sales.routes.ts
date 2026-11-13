import { Router } from 'express';
import { authenticate, injectBusiness } from '../middleware/auth';
import * as ctrl from '../controllers/sales.controller';

const router = Router();
router.use(authenticate, injectBusiness);

router.get('/', ctrl.getSales);
router.post('/', ctrl.createSaleValidators, ctrl.createSale);
router.get('/:id', ctrl.getSale);
router.post('/:id/cancel', ctrl.cancelSale);

export default router;
