import { Router } from 'express';
import { DiarizationController } from './diarization.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

export function createDiarizationRoutes(controller: DiarizationController): Router {
  const router = Router();

  router.get('/:id/diarization', authMiddleware, controller.get);
  router.post('/:id/diarization', authMiddleware, controller.start);

  return router;
}