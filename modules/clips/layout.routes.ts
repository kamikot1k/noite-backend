import { Router } from 'express';
import { LayoutService } from './layout.service.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

export function createLayoutRoutes(service: LayoutService): Router {
  const router = Router();

  router.get('/clips/:id/layout-regions', authMiddleware, async (req, res, next) => {
    try {
      const regions = await service.getRegions(req.userId!, req.params.id);
      res.json(regions);
    } catch (e) { next(e); }
  });

  router.post('/clips/:id/layout-regions', authMiddleware, async (req, res, next) => {
    try {
      const region = await service.addRegion(req.userId!, req.params.id);
      res.status(201).json(region);
    } catch (e) { next(e); }
  });

  router.post('/clips/:id/layout-regions/split', authMiddleware, async (req, res, next) => {
    try {
      const regions = await service.splitToTwo(req.userId!, req.params.id);
      res.status(201).json(regions);
    } catch (e) { next(e); }
  });

  router.patch('/layout-regions/:id', authMiddleware, async (req, res, next) => {
    try {
      const region = await service.updateRegion(req.userId!, req.params.id, req.body);
      res.json(region);
    } catch (e) { next(e); }
  });

  router.delete('/layout-regions/:id', authMiddleware, async (req, res, next) => {
    try {
      await service.deleteRegion(req.userId!, req.params.id);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  router.delete('/clips/:id/layout-regions', authMiddleware, async (req, res, next) => {
    try {
      await service.deleteAllRegions(req.userId!, req.params.id);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  return router;
}