import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export function generateAccessToken(userId: string): string {
  return jwt.sign({ userId }, config.jwtAccessSecret, { expiresIn: config.accessTokenExpiry as any });
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId }, config.jwtRefreshSecret, { expiresIn: config.refreshTokenExpiry as any });
}

export function verifyAccessToken(token: string): any {
  return jwt.verify(token, config.jwtAccessSecret);
}

export function verifyRefreshToken(token: string): any {
  return jwt.verify(token, config.jwtRefreshSecret);
}