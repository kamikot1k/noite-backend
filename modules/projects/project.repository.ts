import { pool } from '../../database/pool.js';
import { v4 as uuidv4 } from 'uuid';

export interface ProjectRecord {
  id: string;
  user_id: string;
  title: string;
  status: string;
  date: Date;
  clips_count: number;
  preview_url: string;
  duration: number;
  video_path: string;
  user_prompt: string;
  diarized: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectWithClips extends ProjectRecord {}

export class ProjectRepository {
  async create(data: {
    id?: string;
    userId: string;
    title: string;
    videoPath: string;
    userPrompt?: string;
  }): Promise<ProjectRecord> {
    const id = data.id || uuidv4();
    const result = await pool.query(
      `INSERT INTO projects (id, user_id, title, status, video_path, user_prompt)
       VALUES ($1, $2, $3, 'uploading', $4, $5)
       RETURNING *`,
      [id, data.userId, data.title, data.videoPath, data.userPrompt || '']
    );
    return result.rows[0];
  }

  async findById(id: string, userId?: string): Promise<ProjectRecord | null> {
    let query = 'SELECT * FROM projects WHERE id = $1';
    const params: any[] = [id];
    if (userId) {
      query += ' AND user_id = $2';
      params.push(userId);
    }
    const result = await pool.query(query, params);
    return result.rows[0] || null;
  }

  async findByUserId(userId: string): Promise<ProjectRecord[]> {
    const result = await pool.query(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async update(id: string, updates: Partial<ProjectRecord>): Promise<ProjectRecord | null> {
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
      `UPDATE projects SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async updateStatus(id: string, status: string): Promise<ProjectRecord | null> {
    return this.update(id, { status } as any);
  }

  async delete(id: string): Promise<void> {
    await pool.query('DELETE FROM projects WHERE id = $1', [id]);
  }

  async getClips(projectId: string): Promise<any[]> {
    const result = await pool.query(
      'SELECT * FROM clips WHERE project_id = $1 ORDER BY index_num',
      [projectId]
    );
    return result.rows;
  }

  async getStuckProjects(statuses: string[]): Promise<ProjectRecord[]> {
    const result = await pool.query(
      'SELECT * FROM projects WHERE status = ANY($1)',
      [statuses]
    );
    return result.rows;
  }

  mapProject(row: ProjectRecord) {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      status: row.status,
      date: row.date,
      clipsCount: row.clips_count,
      previewUrl: row.preview_url,
      duration: row.duration,
      videoPath: row.video_path,
      userPrompt: row.user_prompt,
      diarized: row.diarized,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}