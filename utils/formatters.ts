export interface OverlayRow {
  id: string;
  clip_id: string;
  type: string;
  file_path: string | null;
  text_content: string | null;
  text_style: Record<string, any>;
  x_percent: number;
  y_percent: number;
  width_percent: number;
  height_percent: number;
  rotation: number;
  opacity: number;
  z_index: number;
  start_time: number | null;
  end_time: number | null;
}

export interface LayoutRegionRow {
  id: string;
  clip_id: string;
  src_x_percent: number;
  src_y_percent: number;
  src_w_percent: number;
  src_h_percent: number;
  dst_x_percent: number;
  dst_y_percent: number;
  dst_w_percent: number;
  dst_h_percent: number;
  z_index: number;
}

export interface SubtitleSettingsRow {
  clip_id: string;
  enabled: boolean;
  font_size: number;
  font_color: string;
  highlight_color: string;
  outline_color: string;
  outline_width: number;
  background_opacity: number;
  x_percent: number;
  y_percent: number;
  bold: boolean;
  font_family: string;
  words_per_group: number;
  upper_case: boolean;
}

export function formatOverlay(row: OverlayRow) {
  return {
    id: row.id,
    clipId: row.clip_id,
    type: row.type,
    fileUrl: row.file_path ? row.file_path : null,
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
  };
}

export function formatLayoutRegion(row: LayoutRegionRow) {
  return {
    id: row.id,
    clipId: row.clip_id,
    srcXPercent: row.src_x_percent,
    srcYPercent: row.src_y_percent,
    srcWPercent: row.src_w_percent,
    srcHPercent: row.src_h_percent,
    dstXPercent: row.dst_x_percent,
    dstYPercent: row.dst_y_percent,
    dstWPercent: row.dst_w_percent,
    dstHPercent: row.dst_h_percent,
    zIndex: row.z_index,
  };
}

const DEFAULT_SUBTITLE_STYLE = {
  fontSize: 26,
  fontColor: '#FFFFFF',
  highlightColor: '#22C55E',
  outlineColor: '#000000',
  outlineWidth: 2,
  backgroundOpacity: 0,
  xPercent: 50,
  yPercent: 80,
  bold: true,
  fontFamily: 'Montserrat Black',
  wordsPerGroup: 3,
};

export function formatSubtitleSettings(row: SubtitleSettingsRow | null, clipId: string) {
  const d = DEFAULT_SUBTITLE_STYLE;
  if (!row) {
    return { clipId, enabled: true, ...d };
  }
  return {
    clipId,
    enabled: row.enabled,
    fontSize: row.font_size,
    fontColor: row.font_color,
    highlightColor: row.highlight_color,
    outlineColor: row.outline_color,
    outlineWidth: row.outline_width,
    backgroundOpacity: row.background_opacity,
    xPercent: row.x_percent,
    yPercent: row.y_percent,
    bold: row.bold,
    fontFamily: row.font_family,
    wordsPerGroup: row.words_per_group,
    upperCase: row.upper_case,
  };
}