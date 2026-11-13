import { Router } from 'express';
import { authenticate, injectBusiness } from '../middleware/auth';
import * as ctrl from '../controllers/notifications.controller';

const router = Router();
router.use(authenticate, injectBusiness);

router.get('/', ctrl.getNotifications);
router.post('/mark-read', ctrl.markAsRead);

export default router;
