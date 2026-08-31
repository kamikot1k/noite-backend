import { Router } from 'express';
import { OverlayService } from './overlay.service.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

export function createOverlayRoutes(service: OverlayService): Router {
  const router = Router();

  router.get('/clips/:id/overlays', authMiddleware, async (req, res, next) => {
    try {
      const overlays = await service.getOverlays(req.userId!, req.params.id);
      res.json(overlays);
    } catch (e) { next(e); }
  });

  router.post('/clips/:id/overlays/text', authMiddleware, async (req, res, next) => {
    try {
      const overlay = await service.addTextOverlay(req.userId!, req.params.id, req.body.text);
      res.status(201).json(overlay);
    } catch (e) { next(e); }
  });

  router.patch('/overlays/:id', authMiddleware, async (req, res, next) => {
    try {
      const overlay = await service.updateOverlay(req.userId!, req.params.id, req.body);
      res.json(overlay);
    } catch (e) { next(e); }
  });

  router.delete('/overlays/:id', authMiddleware, async (req, res, next) => {
    try {
      await service.deleteOverlay(req.userId!, req.params.id);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  return router;
}