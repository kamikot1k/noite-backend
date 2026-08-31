import { Router } from 'express';
import { SubtitleService } from './subtitle.service.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

export function createSubtitleRoutes(service: SubtitleService): Router {
  const router = Router();

  router.get('/clips/:id/subtitle-settings', authMiddleware, async (req, res, next) => {
    try {
      const settings = await service.getSettings(req.userId!, req.params.id);
      res.json(settings);
    } catch (e) { next(e); }
  });

  router.patch('/clips/:id/subtitle-settings', authMiddleware, async (req, res, next) => {
    try {
      const settings = await service.updateSettings(req.userId!, req.params.id, req.body);
      res.json(settings);
    } catch (e) { next(e); }
  });

  return router;
}