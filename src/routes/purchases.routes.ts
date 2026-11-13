import { Router } from 'express';
import { authenticate, injectBusiness } from '../middleware/auth';
import * as ctrl from '../controllers/purchases.controller';

const router = Router();
router.use(authenticate, injectBusiness);

router.get('/', ctrl.getPurchases);
router.post('/', ctrl.createPurchaseValidators, ctrl.createPurchase);
router.get('/:id', ctrl.getPurchase);

export default router;
