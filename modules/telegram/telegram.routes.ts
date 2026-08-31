import { Router } from 'express';
import { TelegramController } from './telegram.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

export function createTelegramRoutes(controller: TelegramController): Router {
  const router = Router();

  router.post('/generate-code', authMiddleware, controller.generateCode);
  router.get('/status', authMiddleware, controller.status);
  router.delete('/disconnect', authMiddleware, controller.disconnect);
  router.post('/webhook', controller.webhook);

  return router;
}