import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/index.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { createAuthRoutes } from './modules/auth/auth.routes.js';
import { createSubscriptionRoutes } from './modules/subscription/subscription.routes.js';
import { createProjectRoutes } from './modules/projects/project.routes.js';
import { createDiarizationRoutes } from './modules/diarization/diarization.routes.js';
import { createClipRoutes } from './modules/clips/clip.routes.js';
import { createExportRoutes } from './modules/export/export.routes.js';
import { createTelegramRoutes } from './modules/telegram/telegram.routes.js';
import { createOverlayRoutes } from './modules/clips/overlay.routes.js';
import { createLayoutRoutes } from './modules/clips/layout.routes.js';
import { createSubtitleRoutes } from './modules/clips/subtitle.routes.js';
import { container } from './container.js';
import { initDB } from './database/migrations.js';

export async function createApp() {
  await initDB();

  const app = express();

  app.use(cors({ origin: config.clientUrl, credentials: true }));
  app.use(express.json({ limit: '50mb' }));
  app.use(cookieParser());

  // Роуты
  app.use('/api/auth', createAuthRoutes(container.get('authController')));
  app.use('/api/subscription', createSubscriptionRoutes(container.get('subscriptionController')));
  app.use('/api/videos', createProjectRoutes(container.get('projectController')));
  app.use('/api/clips', createClipRoutes(container.get('clipController')));
  app.use('/api/clips', createExportRoutes(container.get('exportController'))); // для export и subtitle-preview
  app.use('/api', createOverlayRoutes(container.get('overlayService')));
  app.use('/api', createLayoutRoutes(container.get('layoutService')));
  app.use('/api', createSubtitleRoutes(container.get('subtitleService')));
  app.use('/api/telegram', createTelegramRoutes(container.get('telegramController')));
  app.use('/api/videos', createDiarizationRoutes(container.get('diarizationController')));

  // Обработка ошибок
  app.use(errorHandler);

  return app;
}