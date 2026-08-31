import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  maxFileSizeMb: 15,
  targetBitrate: '32k',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'noite-access-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'noite-refresh-secret-change-me',
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  refreshTokenCookieMaxAge: 7 * 24 * 60 * 60 * 1000,
  gpuWorkerUrl: process.env.GPU_WORKER_URL || 'http://localhost:3002',
  aiServerUrl: process.env.AI_SERVER_URL || 'http://localhost:8765',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  db: {
    user: process.env.PG_USER || 'postgres',
    host: process.env.PG_HOST || 'localhost',
    database: process.env.PG_DATABASE || 'noite',
    password: process.env.PG_PASSWORD || '123456',
    port: parseInt(process.env.PG_PORT || '5432', 10),
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'https://s3.ru1.storage.beget.cloud',
    region: 'ru-1',
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
    bucket: process.env.S3_BUCKET || '1fbd2026a312-syncue-mate',
  },
  openai: {
    apiKey: process.env.POLZA_API_KEY || 'pza_GfBsXku2i89KS03eBPdYKtTfV_yi_z7E',
    baseURL: 'https://polza.ai/api/v1',
  },
  telegram: {
    botGateApiKey: process.env.BOT_GATE_API_KEY,
    botPublicId: process.env.BOT_PUBLIC_ID,
    botGateApiUrl: 'https://bot-gate.ru/api/v1/bots',
  },
};