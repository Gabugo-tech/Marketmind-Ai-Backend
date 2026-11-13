import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { sendSuccess } from '../utils/response';
import { prisma } from '../database/client';
import { ForbiddenError } from '../utils/errors';

function getBusinessId(req: AuthRequest): string {
  if (!req.business) throw new ForbiddenError('No business found');
  return req.business.id;
}

export async function getNotifications(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const businessId = getBusinessId(req);
    const unreadOnly = req.query.unread === 'true';

    const notifications = await prisma.notification.findMany({
      where: { businessId, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });

    const unreadCount = await prisma.notification.count({
      where: { businessId, isRead: false },
    });

    sendSuccess(res, { notifications, unreadCount });
  } catch (e) { next(e); }
}

export async function markAsRead(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const businessId = getBusinessId(req);
    const { ids } = req.body; // Array of notification IDs or 'all'

    if (ids === 'all') {
      await prisma.notification.updateMany({
        where: { businessId, isRead: false },
        data: { isRead: true },
      });
    } else if (Array.isArray(ids) && ids.length > 0) {
      await prisma.notification.updateMany({
        where: { id: { in: ids }, businessId },
        data: { isRead: true },
      });
    }

    sendSuccess(res, null, 'Notifications marked as read');
  } catch (e) { next(e); }
}
