import { promisify } from 'util';
import { exec } from 'child_process';
import { pool } from '../database/pool.js';
import { formatSubtitleSettings } from './formatters.js';

export const execAsync = promisify(exec);

export async function getClipOverlays(clipId: string) {
  const result = await pool.query(
    'SELECT * FROM clip_overlays WHERE clip_id = $1 ORDER BY z_index ASC, created_at ASC',
    [clipId]
  );
  return result.rows.map((row: any) => ({
    type: row.type,
    filePath: row.file_path,
    text: row.text_content,
    textStyle: row.text_style || {},
    xPercent: row.x_percent,
    yPercent: row.y_percent,
    widthPercent: row.width_percent,
    heightPercent: row.height_percent,
    rotation: row.rotation,
    opacity: row.opacity,
    zIndex: row.z_index,
    startTime: row.start_time,
    endTime: row.end_time,
  }));
}

export async function getClipLayoutRegions(clipId: string) {
  const result = await pool.query(
    'SELECT * FROM clip_layout_regions WHERE clip_id = $1 ORDER BY z_index ASC, created_at ASC',
    [clipId]
  );
  return result.rows.map((row: any) => ({
    srcXPercent: row.src_x_percent,
    srcYPercent: row.src_y_percent,
    srcWPercent: row.src_w_percent,
    srcHPercent: row.src_h_percent,
    dstXPercent: row.dst_x_percent,
    dstYPercent: row.dst_y_percent,
    dstWPercent: row.dst_w_percent,
    dstHPercent: row.dst_h_percent,
    zIndex: row.z_index,
  }));
}

export async function getClipSubtitleSettings(clipId: string) {
  const result = await pool.query(
    'SELECT * FROM clip_subtitle_settings WHERE clip_id = $1',
    [clipId]
  );
  return formatSubtitleSettings(result.rows[0] || null, clipId);
}