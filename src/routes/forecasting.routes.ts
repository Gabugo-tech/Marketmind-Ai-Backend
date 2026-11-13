import { Router } from 'express';
import { authenticate, injectBusiness } from '../middleware/auth';
import * as ctrl from '../controllers/forecasting.controller';

const router = Router();
router.use(authenticate, injectBusiness);

router.get('/products/:productId', ctrl.forecastProduct);
router.get('/all', ctrl.forecastAll);
router.get('/restock-recommendations', ctrl.getRestockRecommendations);

export default router;
