import { Router } from 'express';
import { ExportController } from './export.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

export function createExportRoutes(controller: ExportController): Router {
  const router = Router();

  router.post('/:id/export', authMiddleware, controller.exportClip);
  router.post('/:id/subtitle-preview', authMiddleware, controller.subtitlePreview);

  return router;
}