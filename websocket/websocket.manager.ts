import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { pool } from '../database/pool.js';
import { config } from '../config/index.js';

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, Set<WebSocket>>();

  attach(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
  }

  private handleConnection(ws: WebSocket, req: any) {
    const url = new URL(req.url, `http://localhost:${config.port}`);
    const projectId = url.searchParams.get('projectId');

    if (projectId) {
      if (!this.clients.has(projectId)) this.clients.set(projectId, new Set());
      this.clients.get(projectId)!.add(ws);

      // Отправляем текущий статус
      this.sendCurrentProjectStatus(projectId, ws);
    }

    ws.on('close', () => {
      if (projectId && this.clients.has(projectId)) {
        this.clients.get(projectId)!.delete(ws);
        if (this.clients.get(projectId)!.size === 0) {
          this.clients.delete(projectId);
        }
      }
    });
  }

  private async sendCurrentProjectStatus(projectId: string, ws: WebSocket) {
    try {
      const result = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
      if (result.rows.length > 0 && ws.readyState === WebSocket.OPEN) {
        const row = result.rows[0];
        ws.send(
          JSON.stringify({
            type: 'project_update',
            project: {
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
            },
          })
        );
      }
    } catch (error) {
      console.error('Ошибка отправки статуса проекта:', error);
    }
  }

  broadcast(projectId: string, data: any) {
    const clients = this.clients.get(projectId);
    if (clients) {
      const message = JSON.stringify(data);
      clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(message);
      });
    }
  }

  broadcastProjectUpdate(project: any) {
    this.broadcast(project.id, {
      type: 'project_update',
      project: {
        id: project.id,
        userId: project.userId || project.user_id,
        title: project.title,
        status: project.status,
        date: project.date,
        clipsCount: project.clipsCount ?? project.clips_count,
        previewUrl: project.previewUrl ?? project.preview_url,
        duration: project.duration,
        videoPath: project.videoPath ?? project.video_path,
        userPrompt: project.userPrompt ?? project.user_prompt,
        diarized: project.diarized,
        createdAt: project.createdAt ?? project.created_at,
        updatedAt: project.updatedAt ?? project.updated_at,
      },
    });
  }

  broadcastClipUpdate(clip: any) {
    this.broadcast(clip.projectId, {
      type: 'clip_update',
      clip,
    });
  }
}