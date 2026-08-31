import { pool } from '../../database/pool.js';
import { v4 as uuidv4 } from 'uuid';

export class TelegramRepository {
  async generateLinkCode(userId: string): Promise<string> {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    await pool.query(
      'INSERT INTO telegram_link_codes (code, user_id) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING',
      [code, userId]
    );
    return code;
  }

  async findLinkCode(code: string) {
    const result = await pool.query(
      'SELECT * FROM telegram_link_codes WHERE code = $1 AND expires_at > NOW()',
      [code]
    );
    return result.rows[0] || null;
  }

  async deleteLinkCode(code: string) {
    await pool.query('DELETE FROM telegram_link_codes WHERE code = $1', [code]);
  }

  async upsertIntegration(userId: string, chatId: number, username: string) {
    await pool.query(
      `INSERT INTO telegram_integrations (id, user_id, telegram_chat_id, telegram_username)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id) DO UPDATE SET telegram_chat_id = $3, telegram_username = $4, connected_at = NOW()`,
      [uuidv4(), userId, chatId, username]
    );
  }

  async getIntegration(userId: string) {
    const result = await pool.query('SELECT * FROM telegram_integrations WHERE user_id = $1', [userId]);
    return result.rows[0] || null;
  }

  async deleteIntegration(userId: string) {
    await pool.query('DELETE FROM telegram_integrations WHERE user_id = $1', [userId]);
  }
}