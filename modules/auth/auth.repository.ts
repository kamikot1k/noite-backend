import { pool } from '../../database/pool.js';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/index.js';
import bcrypt from 'bcryptjs';

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  plan: string;
  created_at: Date;
}

export interface RefreshTokenRecord {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
}

export class AuthRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] || null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async createUser(email: string, passwordHash: string, name: string): Promise<UserRecord> {
    const userId = uuidv4();
    const result = await pool.query(
      'INSERT INTO users (id, email, password_hash, name) VALUES ($1,$2,$3,$4) RETURNING *',
      [userId, email, passwordHash, name]
    );
    return result.rows[0];
  }

  async createRefreshToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await pool.query(
      'INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES ($1,$2,$3,$4)',
      [uuidv4(), userId, token, expiresAt]
    );
  }

  async findRefreshToken(token: string): Promise<RefreshTokenRecord | null> {
    const result = await pool.query('SELECT * FROM refresh_tokens WHERE token = $1', [token]);
    return result.rows[0] || null;
  }

  async deleteRefreshToken(token: string): Promise<void> {
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
  }

  async createSubscription(userId: string, plan: string = 'free'): Promise<void> {
    await pool.query(
      `INSERT INTO subscriptions (id, user_id, plan, status, current_period_start, current_period_end)
       VALUES ($1, $2, $3, 'active', NOW(), NOW() + INTERVAL '100 years')`,
      [uuidv4(), userId, plan]
    );
  }
}