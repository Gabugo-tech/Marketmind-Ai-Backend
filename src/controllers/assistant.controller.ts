import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../types';
import * as assistantService from '../services/assistant.service';
import { sendSuccess, sendError } from '../utils/response';
import { validate } from '../middleware/validate';
import { ForbiddenError } from '../utils/errors';

function getBusinessId(req: AuthRequest): string {
  if (!req.business) throw new ForbiddenError('No business found');
  return req.business.id;
}

export const chatValidators = [
  body('message').trim().notEmpty().withMessage('Message is required')
    .isLength({ max: 2000 }).withMessage('Message too long'),
  validate,
];

export async function sendMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { message, conversationId } = req.body;
    const result = await assistantService.chat(getBusinessId(req), conversationId ?? null, message);
    sendSuccess(res, result);
  } catch (e) { next(e); }
}

export async function getConversations(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const conversations = await assistantService.getConversations(getBusinessId(req));
    sendSuccess(res, conversations);
  } catch (e) { next(e); }
}

export async function getMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const messages = await assistantService.getConversationMessages(
      getBusinessId(req),
      String(req.params.conversationId)
    );
    if (!messages) return sendError(res, 'Conversation not found', 404);
    sendSuccess(res, messages);
  } catch (e) { next(e); }
}
