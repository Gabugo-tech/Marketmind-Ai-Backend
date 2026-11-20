import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { traderLoginLimiter } from '../middleware/loginRateLimit';

const router = Router();

router.post('/register', ctrl.registerValidators, ctrl.register);
// Trader login: rate-limited to 10 attempts / 15 min per IP
router.post('/login', traderLoginLimiter, ctrl.loginValidators, ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);
router.get('/me', authenticate, ctrl.getMe);

export default router;
