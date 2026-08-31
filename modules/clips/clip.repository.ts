import { pool } from '../../database/pool.js';
import { v4 as uuidv4 } from 'uuid';
import type { ClipRecord } from './types.js';

export class ClipRepository {
  async findById(id: string): Promise<ClipRecord | null> {
    const result = await pool.query('SELECT * FROM clips WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async findByProjectAndId(projectId: string, clipId: string, userId: string) {
    const result = await pool.query(
      `SELECT c.*, p.user_id
       FROM clips c
       JOIN projects p ON p.id = c.project_id
       WHERE c.id = $1 AND c.project_id = $2 AND p.user_id = $3`,
      [clipId, projectId, userId]
    );
    return result.rows[0] || null;
  }

  async getByProjectId(projectId: string): Promise<ClipRecord[]> {
    const result = await pool.query(
      'SELECT * FROM clips WHERE project_id = $1 ORDER BY index_num',
      [projectId]
    );
    return result.rows;
  }

  async update(id: string, updates: Partial<ClipRecord>): Promise<ClipRecord | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(updates)) {
      setClauses.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }
    if (setClauses.length === 0) return null;
    values.push(id);
    const result = await pool.query(
      `UPDATE clips SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<void> {
    await pool.query('DELETE FROM clips WHERE id = $1', [id]);
  }

  async getOverlays(clipId: string) {
    const result = await pool.query(
      'SELECT * FROM clip_overlays WHERE clip_id = $1 ORDER BY z_index ASC, created_at ASC',
      [clipId]
    );
    return result.rows;
  }

  async getLayoutRegions(clipId: string) {
    const result = await pool.query(
      'SELECT * FROM clip_layout_regions WHERE clip_id = $1 ORDER BY z_index ASC, created_at ASC',
      [clipId]
    );
    return result.rows;
  }

  async getSubtitleSettings(clipId: string) {
    const result = await pool.query('SELECT * FROM clip_subtitle_settings WHERE clip_id = $1', [clipId]);
    return result.rows[0] || null;
  }
}