import { Pool } from 'pg';
import { config } from './config/index.js';
import { S3Service } from './integrations/s3/s3.service.js';
import { TelegramClient } from './integrations/telegram/telegram.client.js';
import { AuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { SubscriptionRepository } from './modules/subscription/subscription.repository.js';
import { SubscriptionService } from './modules/subscription/subscription.service.js';
import { ProjectRepository } from './modules/projects/project.repository.js';
import { ProjectService } from './modules/projects/project.service.js';
import { ClipRepository } from './modules/clips/clip.repository.js';
import { ClipService } from './modules/clips/clip.service.js';
import { OverlayService } from './modules/clips/overlay.service.js';
import { LayoutService } from './modules/clips/layout.service.js';
import { SubtitleService } from './modules/clips/subtitle.service.js';
import { ExportService } from './modules/export/export.service.js';
import { TelegramRepository } from './modules/telegram/telegram.repository.js';
import { TelegramService } from './modules/telegram/telegram.service.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { SubscriptionController } from './modules/subscription/subscription.controller.js';
import { ProjectController } from './modules/projects/project.controller.js';
import { ClipController } from './modules/clips/clip.controller.js';
import { ExportController } from './modules/export/export.controller.js';
import { TelegramController } from './modules/telegram/telegram.controller.js';
import { WebSocketManager } from './websocket/websocket.manager.js';
import { DiarizationService } from './modules/diarization/diarization.service.js';
import { DiarizationController } from './modules/diarization/diarization.controller.js';

class Container {
  private services = new Map<string, any>();

  register<T>(name: string, factory: (c: Container) => T): void {
    this.services.set(name, factory);
  }

  get<T>(name: string): T {
    const factory = this.services.get(name);
    if (!factory) throw new Error(`Service ${name} not registered`);
    return factory(this) as T;
  }
}

export const container = new Container();

// Регистрация зависимостей
container.register('pool', () => new Pool(config.db));

container.register('s3Service', () => new S3Service(config.s3.bucket));
container.register('telegramClient', () => new TelegramClient());

container.register('authRepository', () => new AuthRepository());
container.register('subscriptionRepository', () => new SubscriptionRepository());

container.register('subscriptionService', (c) => new SubscriptionService(c.get('subscriptionRepository')));
container.register('authService', (c) => new AuthService(c.get('authRepository'), c.get('subscriptionService')));

container.register('projectRepository', () => new ProjectRepository());
container.register('projectService', (c) => new ProjectService(
  c.get('projectRepository'),
  c.get('subscriptionService'),
  c.get('s3Service')
));

container.register('clipRepository', () => new ClipRepository());
container.register('clipService', (c) => new ClipService(c.get('clipRepository')));
container.register('overlayService', () => new OverlayService());
container.register('layoutService', () => new LayoutService());
container.register('subtitleService', () => new SubtitleService());

container.register('exportService', (c) => new ExportService(c.get('subscriptionService'), c.get('s3Service')));

container.register('telegramRepository', () => new TelegramRepository());
container.register('telegramService', (c) => new TelegramService(c.get('telegramRepository'), c.get('telegramClient')));

container.register('diarizationService', (c) => new DiarizationService(c.get('s3Service')));
container.register('diarizationController', (c) => new DiarizationController(c.get('diarizationService')));

// Контроллеры
container.register('authController', (c) => new AuthController(c.get('authService')));
container.register('subscriptionController', (c) => new SubscriptionController(c.get('subscriptionService')));
container.register('projectController', (c) => new ProjectController(c.get('projectService')));
container.register('clipController', (c) => new ClipController(c.get('clipService')));
container.register('exportController', (c) => new ExportController(c.get('exportService')));
container.register('telegramController', (c) => new TelegramController(c.get('telegramService')));