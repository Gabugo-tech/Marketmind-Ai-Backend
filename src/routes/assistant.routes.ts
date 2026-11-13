import { Router } from 'express';
import { authenticate, injectBusiness } from '../middleware/auth';
import * as ctrl from '../controllers/assistant.controller';

const router = Router();
router.use(authenticate, injectBusiness);

router.post('/chat', ctrl.chatValidators, ctrl.sendMessage);
router.get('/conversations', ctrl.getConversations);
router.get('/conversations/:conversationId/messages', ctrl.getMessages);

export default router;
