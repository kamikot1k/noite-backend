import { ClipRepository } from './clip.repository.js';
import { AppError } from '../../middlewares/error.middleware.js';
import { eventBus } from '../../utils/event-bus.js';
import { formatOverlay, formatLayoutRegion, formatSubtitleSettings } from '../../utils/formatters.js';
import { pool } from '../../database/pool.js';

export class ClipService {
  constructor(private clipRepository: ClipRepository) {}

  async getClip(userId: string, clipId: string) {
    // Получение клипа с проверкой владельца
    const result = await pool.query(
      `SELECT c.*
       FROM clips c
       JOIN projects p ON p.id = c.project_id
       WHERE c.id = $1 AND p.user_id = $2`,
      [clipId, userId]
    );
    if (!result.rows[0]) throw new AppError(404, 'Клип не найден');
    return this.mapClip(result.rows[0]);
  }

  async updateClip(userId: string, clipId: string, updates: any) {
    const clip = await this.getClip(userId, clipId);
    // Валидация и формирование обновлений
    const allowedUpdates: any = {};
    if (updates.status !== undefined) {
      if (!['draft', 'approved', 'rejected'].includes(updates.status)) {
        throw new AppError(400, 'Недопустимый статус');
      }
      allowedUpdates.status = updates.status;
    }
    if (updates.hook !== undefined) {
      if (typeof updates.hook !== 'string' || !updates.hook.trim()) {
        throw new AppError(400, 'hook не может быть пустым');
      }
      allowedUpdates.hook = updates.hook.trim();
    }
    if (updates.description !== undefined) {
      allowedUpdates.description =
        typeof updates.description === 'string' ? updates.description.trim() : '';
    }
    if (updates.fragments !== undefined) {
      if (!Array.isArray(updates.fragments) || updates.fragments.length === 0) {
        throw new AppError(400, 'fragments должен быть непустым массивом');
      }
      allowedUpdates.fragments = JSON.stringify(updates.fragments);
      allowedUpdates.duration = updates.fragments.reduce(
        (s: number, f: any) => s + (f.end - f.start),
        0
      );
    }
    if (updates.start !== undefined && updates.end !== undefined) {
      allowedUpdates.start_time = updates.start;
      allowedUpdates.end_time = updates.end;
      if (updates.fragments === undefined) {
        allowedUpdates.duration = updates.end - updates.start;
      }
    }
    if (updates.panX !== undefined) allowedUpdates.pan_x = updates.panX;
    if (updates.panY !== undefined) allowedUpdates.pan_y = updates.panY;
    if (updates.videoZoom !== undefined) allowedUpdates.video_zoom = updates.videoZoom;

    if (Object.keys(allowedUpdates).length === 0) {
      throw new AppError(400, 'Нечего обновлять');
    }

    const updated = await this.clipRepository.update(clipId, allowedUpdates);
    if (!updated) throw new AppError(404, 'Клип не найден');

    const formatted = this.mapClip(updated);
    eventBus.emit('clip.updated', formatted);
    return formatted;
  }

  async deleteClip(userId: string, clipId: string) {
    const clip = await this.getClip(userId, clipId);
    await this.clipRepository.delete(clipId);
    // Обновляем clips_count проекта
    const countResult = await pool.query('SELECT COUNT(*) as count FROM clips WHERE project_id = $1', [
      clip.projectId,
    ]);
    await pool.query('UPDATE projects SET clips_count = $1 WHERE id = $2', [
      countResult.rows[0].count,
      clip.projectId,
    ]);
  }

  private mapClip(row: any) {
    return {
      id: row.id,
      projectId: row.project_id,
      index: row.index_num,
      type: row.type,
      start: row.start_time,
      end: row.end_time,
      duration: row.duration,
      hook: row.hook,
      description: row.description,
      viralityScore: row.virality_score,
      category: row.category,
      platform: row.platform,
      reason: row.reason,
      status: row.status,
      videoPath: row.video_path,
      srtPath: row.srt_path,
      fragments: row.fragments || [],
      contentPack: row.content_pack || null,
      panX: row.pan_x || 0,
      panY: row.pan_y || 0,
      videoZoom: row.video_zoom || 1,
    };
  }
}