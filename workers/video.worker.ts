import { eventBus } from '../utils/event-bus.js';
import { logger } from '../utils/logger.js';
import { container } from '../container.js';

class VideoWorker {
  private queue: string[] = [];
  private isProcessing = false;

  init() {
    eventBus.on('project.uploaded', ({ projectId }: { projectId: string }) => {
      this.enqueue(projectId);
    });
    console.log('🔄 Video worker инициализирован');
  }

  enqueue(projectId: string) {
    this.queue.push(projectId);
    this.processQueue();
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    const projectId = this.queue.shift()!;
    try {
      const projectService = container.get('projectService');
      await projectService.processVideo(projectId);
    } catch (error) {
      logger.error(`Ошибка обработки проекта ${projectId}`, error);
      try {
        const projectRepository = container.get('projectRepository');
        await projectRepository.updateStatus(projectId, 'error');
      } catch (_) {}
    } finally {
      this.isProcessing = false;
      this.processQueue();
    }
  }
}

export const videoWorker = new VideoWorker();