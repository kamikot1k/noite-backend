import { pool } from '../../database/pool.js';
import { AppError } from '../../middlewares/error.middleware.js';
import { formatLayoutRegion } from '../../utils/formatters.js';
import { v4 as uuidv4 } from 'uuid';

export class LayoutService {
  async getRegions(userId: string, clipId: string) {
    await this.ensureClipOwner(userId, clipId);
    const result = await pool.query(
      'SELECT * FROM clip_layout_regions WHERE clip_id = $1 ORDER BY z_index ASC, created_at ASC',
      [clipId]
    );
    return result.rows.map(formatLayoutRegion);
  }

  async addRegion(userId: string, clipId: string) {
    await this.ensureClipOwner(userId, clipId);
    const countResult = await pool.query('SELECT COUNT(*)::int as count FROM clip_layout_regions WHERE clip_id = $1', [clipId]);
    const regionId = uuidv4();
    const result = await pool.query(
      `INSERT INTO clip_layout_regions (id, clip_id, src_x_percent, src_y_percent, src_w_percent, src_h_percent, dst_x_percent, dst_y_percent, dst_w_percent, dst_h_percent, z_index)
       VALUES ($1,$2,0,0,100,100,0,0,100,100,$3) RETURNING *`,
      [regionId, clipId, countResult.rows[0].count]
    );
    return formatLayoutRegion(result.rows[0]);
  }

  async splitToTwo(userId: string, clipId: string) {
    await this.ensureClipOwner(userId, clipId);
    await pool.query('DELETE FROM clip_layout_regions WHERE clip_id = $1', [clipId]);

    const region1 = await pool.query(
      `INSERT INTO clip_layout_regions (id, clip_id, src_x_percent, src_y_percent, src_w_percent, src_h_percent, dst_x_percent, dst_y_percent, dst_w_percent, dst_h_percent, z_index)
       VALUES ($1,$2,0,0,50,100,0,0,100,50,0) RETURNING *`,
      [uuidv4(), clipId]
    );
    const region2 = await pool.query(
      `INSERT INTO clip_layout_regions (id, clip_id, src_x_percent, src_y_percent, src_w_percent, src_h_percent, dst_x_percent, dst_y_percent, dst_w_percent, dst_h_percent, z_index)
       VALUES ($1,$2,50,0,50,100,0,50,100,50,1) RETURNING *`,
      [uuidv4(), clipId]
    );

    return [formatLayoutRegion(region1.rows[0]), formatLayoutRegion(region2.rows[0])];
  }

  async updateRegion(userId: string, regionId: string, updates: any) {
    const ownerCheck = await pool.query(
      `SELECT r.id
       FROM clip_layout_regions r
       JOIN clips c ON c.id = r.clip_id
       JOIN projects p ON p.id = c.project_id
       WHERE r.id = $1 AND p.user_id = $2`,
      [regionId, userId]
    );
    if (ownerCheck.rows.length === 0) throw new AppError(404, 'Область не найдена');

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const map: Record<string, string> = {
      srcXPercent: 'src_x_percent',
      srcYPercent: 'src_y_percent',
      srcWPercent: 'src_w_percent',
      srcHPercent: 'src_h_percent',
      dstXPercent: 'dst_x_percent',
      dstYPercent: 'dst_y_percent',
      dstWPercent: 'dst_w_percent',
      dstHPercent: 'dst_h_percent',
      zIndex: 'z_index',
    };

    for (const [key, col] of Object.entries(map)) {
      if (updates[key] !== undefined) {
        setClauses.push(`${col} = $${idx}`);
        values.push(updates[key]);
        idx++;
      }
    }
    if (setClauses.length === 0) throw new AppError(400, 'Нечего обновлять');

    setClauses.push('updated_at = NOW()');
    values.push(regionId);

    const result = await pool.query(
      `UPDATE clip_layout_regions SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return formatLayoutRegion(result.rows[0]);
  }

  async deleteRegion(userId: string, regionId: string) {
    const ownerCheck = await pool.query(
      `SELECT r.id
       FROM clip_layout_regions r
       JOIN clips c ON c.id = r.clip_id
       JOIN projects p ON p.id = c.project_id
       WHERE r.id = $1 AND p.user_id = $2`,
      [regionId, userId]
    );
    if (ownerCheck.rows.length === 0) throw new AppError(404, 'Область не найдена');
    await pool.query('DELETE FROM clip_layout_regions WHERE id = $1', [regionId]);
  }

  async deleteAllRegions(userId: string, clipId: string) {
    await this.ensureClipOwner(userId, clipId);
    await pool.query('DELETE FROM clip_layout_regions WHERE clip_id = $1', [clipId]);
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