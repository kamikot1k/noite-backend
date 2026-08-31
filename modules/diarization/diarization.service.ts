import { pool } from '../../database/pool.js';
import { AppError } from '../../middlewares/error.middleware.js';
import { S3Service } from '../../integrations/s3/s3.service.js';
import { config } from '../../config/index.js';
import { eventBus } from '../../utils/event-bus.js';

export class DiarizationService {
  constructor(private s3Service: S3Service) {}

  async getDiarization(userId: string, projectId: string) {
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (projectCheck.rows.length === 0) throw new AppError(404, 'Проект не найден');

    const s3Key = `${userId}/diarization/${projectId}.json`;
    try {
      const data = await this.s3Service.getJsonObject(s3Key);
      return data;
    } catch {
      throw new AppError(404, 'Диаризация не найдена');
    }
  }

  async startDiarization(userId: string, projectId: string) {
    const projectCheck = await pool.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (projectCheck.rows.length === 0) throw new AppError(404, 'Проект не найден');
    const project = projectCheck.rows[0];

    const diarizationS3Key = `${userId}/diarization/${projectId}.json`;
    if (await this.s3Service.fileExists(diarizationS3Key)) {
      return await this.s3Service.getJsonObject(diarizationS3Key);
    }

    // Получаем существующую транскрипцию, если есть
    const transcriptionS3Key = `${userId}/transcription/${projectId}.json`;
    let existingSegments: any[] | null = null;
    if (await this.s3Service.fileExists(transcriptionS3Key)) {
      const transcriptionData = await this.s3Service.getJsonObject(transcriptionS3Key);
      existingSegments = transcriptionData.segments || null;
    }

    await pool.query('UPDATE projects SET status = $1 WHERE id = $2', ['diarizing', projectId]);

    const FormData = (await import('form-data')).default;
    const fetch = (await import('node-fetch')).default;

    const signedVideoUrl = await this.s3Service.getSignedUrl(project.video_path, 3600);
    const form = new FormData();
    form.append('audioUrl', signedVideoUrl);
    form.append('language', 'ru');
    if (existingSegments) {
      form.append('segments', JSON.stringify(existingSegments));
    }

    const aiResponse = await fetch(`${config.aiServerUrl}/diarize`, {
      method: 'POST',
      body: form,
    });

    if (!aiResponse.ok) {
      const errorData = await aiResponse.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Diarization API error: ${errorData.error || aiResponse.status}`);
    }

    const diarizationData = await aiResponse.json();

    // Сохраняем в S3
    const localPath = `/tmp/noite-upload/${projectId}_diarization.json`;
    const fs = await import('fs');
    fs.writeFileSync(localPath, JSON.stringify(diarizationData));
    await this.s3Service.uploadFile(localPath, diarizationS3Key);
    fs.unlinkSync(localPath);

    await pool.query('UPDATE projects SET diarized = true, status = $1 WHERE id = $2', ['done', projectId]);

    eventBus.emit('project.updated', {
      id: projectId,
      status: 'done',
      diarized: true,
    });

    return diarizationData;
  }
}