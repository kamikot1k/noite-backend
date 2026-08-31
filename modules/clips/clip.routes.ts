import { Router } from 'express';
import { ClipController } from './clip.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

export function createClipRoutes(controller: ClipController): Router {
  const router = Router();

  router.patch('/:id', authMiddleware, controller.update);
  router.delete('/:id', authMiddleware, controller.delete);

  return router;
}