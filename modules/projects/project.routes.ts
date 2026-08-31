import { Router } from 'express';
import { ProjectController } from './project.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { uploadMiddleware } from '../../middlewares/upload.middleware.js';

export function createProjectRoutes(controller: ProjectController): Router {
  const router = Router();

  router.post('/upload', authMiddleware, uploadMiddleware.single('video'), controller.upload);
  router.get('/', authMiddleware, controller.list);
  router.get('/:id', authMiddleware, controller.getOne);
  router.get('/:id/clips', authMiddleware, controller.getClips);
  router.get('/:id/video', authMiddleware, controller.getVideo);
  router.get('/:id/subtitles', authMiddleware, controller.getSubtitles);
  router.put('/:id/subtitles', authMiddleware, controller.updateSubtitles);
  router.delete('/:id', authMiddleware, controller.delete);
  router.patch('/:id', authMiddleware, controller.update);

  return router;
}