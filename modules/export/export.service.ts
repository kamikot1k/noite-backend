import { pool } from '../../database/pool.js';
import { AppError } from '../../middlewares/error.middleware.js';
import { config } from '../../config/index.js';
import { SubscriptionService } from '../subscription/subscription.service.js';
import { S3Service } from '../../integrations/s3/s3.service.js';
import { getClipOverlays, getClipLayoutRegions, getClipSubtitleSettings } from '../../utils/helpers.js';

export class ExportService {
  constructor(
    private subscriptionService: SubscriptionService,
    private s3Service: S3Service
  ) {}

  async exportClip(userId: string, clipId: string, body: any) {
    const { format = 'mp4', vertical = true, subtitleOptions = {} } = body;

    const clipResult = await pool.query(
      `SELECT c.*, p.video_path as source_video, p.user_id
       FROM clips c
       JOIN projects p ON p.id = c.project_id
       WHERE c.id = $1`,
      [clipId]
    );
    if (clipResult.rows.length === 0 || clipResult.rows[0].user_id !== userId) {
      throw new AppError(404, 'Клип не найден');
    }

    const clip = clipResult.rows[0];
    const subscription = await this.subscriptionService.getActiveSubscription(userId);
    const limits = this.subscriptionService.getPlanLimits(subscription.plan);

    const overlays = await getClipOverlays(clip.id);
    const layoutRegions = await getClipLayoutRegions(clip.id);
    const subtitleSettings = await getClipSubtitleSettings(clip.id);

    let words: any[] = [];
    try {
      const wordsS3Key = `${userId}/words/${clip.project_id}.json`;
      const data = await this.s3Service['getJsonFromS3'](wordsS3Key);
      words = data.words || [];
    } catch (_) {}

    const fragments =
      typeof clip.fragments === 'string' ? JSON.parse(clip.fragments) : clip.fragments || [];

    try {
      const gpuResponse = await fetch(`${config.gpuWorkerUrl}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sourceS3Key: clip.source_video,
          start: clip.start_time,
          end: clip.end_time,
          format,
          quality: limits.exportQuality,
          vertical,
          watermark: limits.watermark,
          subtitleSettings: subtitleOptions.enabled ? subtitleOptions : null,
          words,
          fragments,
          overlays,
          videoZoom: clip.video_zoom || 1,
          layoutRegions,
          returnFile: true,
        }),
      });

      if (!gpuResponse.ok) {
        const errorData = await gpuResponse.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || String(gpuResponse.status));
      }

      // Возвращаем поток ответа
      const arrayBuffer = await gpuResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (e: any) {
      throw new AppError(500, 'Ошибка экспорта: ' + e.message);
    }
  }

  async subtitlePreview(userId: string, clipId: string, body: any) {
    const { vertical = true } = body;

    const clipResult = await pool.query(
      `SELECT c.*, p.video_path as source_video, p.user_id
       FROM clips c
       JOIN projects p ON p.id = c.project_id
       WHERE c.id = $1`,
      [clipId]
    );
    if (clipResult.rows.length === 0 || clipResult.rows[0].user_id !== userId) {
      throw new AppError(404, 'Клип не найден');
    }

    const clip = clipResult.rows[0];
    const overlays = await getClipOverlays(clip.id);
    const layoutRegions = await getClipLayoutRegions(clip.id);
    const subtitleSettings = await getClipSubtitleSettings(clip.id);

    let words: any[] = [];
    try {
      const wordsS3Key = `${userId}/words/${clip.project_id}.json`;
      const data = await this.s3Service['getJsonFromS3'](wordsS3Key);
      words = data.words || [];
    } catch (_) {}

    const fragments =
      typeof clip.fragments === 'string' ? JSON.parse(clip.fragments) : clip.fragments || [];

    try {
      const gpuResponse = await fetch(`${config.gpuWorkerUrl}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sourceS3Key: clip.source_video,
          start: clip.start_time,
          end: clip.end_time,
          format: 'mp4',
          quality: '1080p',
          vertical,
          watermark: false,
          subtitleSettings: subtitleSettings.enabled ? subtitleSettings : null,
          words,
          fragments,
          overlays,
          videoZoom: clip.video_zoom || 1,
          layoutRegions,
          isPreview: true,
        }),
      });

      if (!gpuResponse.ok) {
        const errorData = await gpuResponse.json().catch(() => ({ error: 'Unknown' }));
        throw new Error(errorData.error || 'Ошибка генерации превью');
      }

      const result = await gpuResponse.json();
      const signedUrl = await this.s3Service.getSignedUrl(result.s3Key, 3600);
      return { previewUrl: signedUrl };
    } catch (e: any) {
      throw new AppError(500, e.message || 'Ошибка генерации превью');
    }
  }
}