import { pool } from './pool.js';

export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT DEFAULT '',
      plan TEXT DEFAULT 'free',
      plan_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'active',
      videos_used_this_month INTEGER DEFAULT 0,
      minutes_used_this_month REAL DEFAULT 0,
      current_period_start TIMESTAMPTZ DEFAULT NOW(),
      current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
      auto_renew BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'uploading',
      date TIMESTAMPTZ DEFAULT NOW(),
      clips_count INTEGER DEFAULT 0,
      preview_url TEXT DEFAULT '',
      duration REAL DEFAULT 0,
      video_path TEXT NOT NULL,
      user_prompt TEXT DEFAULT '',
      diarized BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS clips (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      index_num INTEGER NOT NULL,
      type TEXT DEFAULT 'continuous',
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      duration REAL NOT NULL,
      hook TEXT,
      description TEXT,
      virality_score INTEGER DEFAULT 0,
      category TEXT,
      platform TEXT,
      reason TEXT,
      status TEXT DEFAULT 'draft',
      video_path TEXT DEFAULT '',
      srt_path TEXT DEFAULT '',
      fragments JSONB DEFAULT '[]',
      content_pack JSONB DEFAULT NULL,
      pan_x REAL DEFAULT 0,
      pan_y REAL DEFAULT 0,
      video_zoom REAL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS telegram_integrations (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      telegram_chat_id BIGINT NOT NULL,
      telegram_username TEXT,
      connected_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id)
    );
    CREATE TABLE IF NOT EXISTS telegram_link_codes (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes')
    );
    CREATE TABLE IF NOT EXISTS clip_overlays (
      id TEXT PRIMARY KEY,
      clip_id TEXT REFERENCES clips(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'text',
      file_path TEXT,
      text_content TEXT,
      text_style JSONB DEFAULT '{}',
      x_percent REAL DEFAULT 50,
      y_percent REAL DEFAULT 50,
      width_percent REAL DEFAULT 25,
      height_percent REAL DEFAULT 12,
      rotation REAL DEFAULT 0,
      opacity REAL DEFAULT 1,
      z_index INTEGER DEFAULT 0,
      start_time REAL DEFAULT NULL,
      end_time REAL DEFAULT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS clip_layout_regions (
      id TEXT PRIMARY KEY,
      clip_id TEXT REFERENCES clips(id) ON DELETE CASCADE,
      src_x_percent REAL DEFAULT 0,
      src_y_percent REAL DEFAULT 0,
      src_w_percent REAL DEFAULT 100,
      src_h_percent REAL DEFAULT 100,
      dst_x_percent REAL DEFAULT 0,
      dst_y_percent REAL DEFAULT 0,
      dst_w_percent REAL DEFAULT 100,
      dst_h_percent REAL DEFAULT 100,
      z_index INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS clip_subtitle_settings (
      clip_id TEXT PRIMARY KEY REFERENCES clips(id) ON DELETE CASCADE,
      enabled BOOLEAN DEFAULT true,
      font_size REAL DEFAULT 26,
      font_color TEXT DEFAULT '#FFFFFF',
      highlight_color TEXT DEFAULT '#22C55E',
      outline_color TEXT DEFAULT '#000000',
      outline_width REAL DEFAULT 2,
      background_opacity REAL DEFAULT 0,
      x_percent REAL DEFAULT 50,
      y_percent REAL DEFAULT 80,
      bold BOOLEAN DEFAULT true,
      font_family TEXT DEFAULT 'Montserrat Black',
      words_per_group INTEGER DEFAULT 3,
      upper_case BOOLEAN DEFAULT false,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_clips_project_id ON clips(project_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_clip_overlays_clip_id ON clip_overlays(clip_id);
    CREATE INDEX IF NOT EXISTS idx_clip_layout_regions_clip_id ON clip_layout_regions(clip_id);
  `);

  console.log('✅ База данных готова');
}