import { createServer } from 'http';
import { createApp } from './app.js';
import { container } from './container.js';
import { WebSocketManager } from './websocket/websocket.manager.js';
import { videoWorker } from './workers/video.worker.js';
import { config } from './config/index.js';
import { eventBus } from './utils/event-bus.js';

async function start() {
  const app = await createApp();
  const server = createServer(app);

  // WebSocket
  const wsManager = new WebSocketManager();
  wsManager.attach(server);
  container.register('websocketManager', () => wsManager);

  // Подписка на события для WebSocket
  eventBus.on('project.updated', (project) => wsManager.broadcastProjectUpdate(project));
  eventBus.on('project.uploaded', ({ projectId }) => {
    // обработка в воркере
  });
  eventBus.on('clip.updated', (clip) => wsManager.broadcastClipUpdate(clip));

  // Инициализация воркера
  videoWorker.init();

  server.listen(config.port, () => {
    console.log(`🚀 Сервер запущен на порту ${config.port}`);
  });

  // Восстановление незавершённых проектов
  const projectService = container.get('projectService');
  await projectService.resumeIncompleteProjects();

  // Периодический сброс счётчиков
  setInterval(() => {
    container.get('subscriptionService').resetExpiredCounters();
  }, 60 * 60 * 1000);
}

start().catch(console.error);