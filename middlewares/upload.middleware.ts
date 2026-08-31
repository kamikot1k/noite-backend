import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';

const uploadDir = '/tmp/noite-upload';
fs.mkdirSync(uploadDir, { recursive: true });

export const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const id = uuidv4();
      (req as any).generatedId = id;
      const ext = path.extname(file.originalname);
      const safeName = path.basename(file.originalname, ext)
        .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]/g, '_')
        .substring(0, 80);
      cb(null, `${id}_${safeName}${ext}`);
    },
  }),
  limits: { fileSize: config.maxFileSizeMb * 1024 * 1024 * 10000 },
});