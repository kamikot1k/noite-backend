import { pool } from '../../database/pool.js';
import { AppError } from '../../middlewares/error.middleware.js';
import { formatSubtitleSettings } from '../../utils/formatters.js';

export class SubtitleService {
  async getSettings(userId: string, clipId: string) {
    await this.ensureClipOwner(userId, clipId);
    const result = await pool.query('SELECT * FROM clip_subtitle_settings WHERE clip_id = $1', [clipId]);
    return formatSubtitleSettings(result.rows[0] || null, clipId);
  }

  async updateSettings(userId: string, clipId: string, settings: any) {
    await this.ensureClipOwner(userId, clipId);

    const result = await pool.query(
      `INSERT INTO clip_subtitle_settings
        (clip_id, enabled, font_size, font_color, highlight_color, outline_color, outline_width,
         background_opacity, x_percent, y_percent, bold, font_family, words_per_group, upper_case)
       VALUES
        ($1, COALESCE($2,true), COALESCE($3,26), COALESCE($4,'#FFFFFF'), COALESCE($5,'#22C55E'),
         COALESCE($6,'#000000'), COALESCE($7,2), COALESCE($8,0), COALESCE($9,50), COALESCE($10,80),
         COALESCE($11,true), COALESCE($12,'Montserrat Black'), COALESCE($13,3), COALESCE($14,false))
       ON CONFLICT (clip_id) DO UPDATE SET
         enabled = COALESCE($2, clip_subtitle_settings.enabled),
         font_size = COALESCE($3, clip_subtitle_settings.font_size),
         font_color = COALESCE($4, clip_subtitle_settings.font_color),
         highlight_color = COALESCE($5, clip_subtitle_settings.highlight_color),
         outline_color = COALESCE($6, clip_subtitle_settings.outline_color),
         outline_width = COALESCE($7, clip_subtitle_settings.outline_width),
         background_opacity = COALESCE($8, clip_subtitle_settings.background_opacity),
         x_percent = COALESCE($9, clip_subtitle_settings.x_percent),
         y_percent = COALESCE($10, clip_subtitle_settings.y_percent),
         bold = COALESCE($11, clip_subtitle_settings.bold),
         font_family = COALESCE($12, clip_subtitle_settings.font_family),
         words_per_group = COALESCE($13, clip_subtitle_settings.words_per_group),
         upper_case = COALESCE($14, clip_subtitle_settings.upper_case),
         updated_at = NOW()
       RETURNING *`,
      [
        clipId,
        settings.enabled,
        settings.fontSize,
        settings.fontColor,
        settings.highlightColor,
        settings.outlineColor,
        settings.outlineWidth,
        settings.backgroundOpacity,
        settings.xPercent,
        settings.yPercent,
        settings.bold,
        settings.fontFamily,
        settings.wordsPerGroup,
        settings.upperCase,
      ]
    );

    return formatSubtitleSettings(result.rows[0], clipId);
  }

  private async ensureClipOwner(userId: string, clipId: string) {
    const check = await pool.query(
      `SELECT c.id
       FROM clips c
       JOIN projects p ON p.id = c.project_id
       WHERE c.id = $1 AND p.user_id = $2`,
      [clipId, userId]
    );
    if (check.rows.length === 0) throw new AppError(404, 'Клип не найден');
  }
}