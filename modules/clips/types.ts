export interface ClipRecord {
  id: string;
  project_id: string;
  index_num: number;
  type: string;
  start_time: number;
  end_time: number;
  duration: number;
  hook: string | null;
  description: string | null;
  virality_score: number;
  category: string | null;
  platform: string | null;
  reason: string | null;
  status: string;
  video_path: string;
  srt_path: string;
  fragments: any[];
  content_pack: any;
  pan_x: number;
  pan_y: number;
  video_zoom: number;
}