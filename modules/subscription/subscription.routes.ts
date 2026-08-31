import { Router } from 'express';
import { SubscriptionController } from './subscription.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

export function createSubscriptionRoutes(controller: SubscriptionController): Router {
  const router = Router();

  router.get('/', authMiddleware, controller.get);
  router.post('/can-upload', authMiddleware, controller.canUpload);
  router.post('/upgrade', authMiddleware, controller.upgrade);

  return router;
}