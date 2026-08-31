import { pool } from '../../database/pool.js';
import { v4 as uuidv4 } from 'uuid';

export interface SubscriptionRecord {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  videos_used_this_month: number;
  minutes_used_this_month: number;
  current_period_start: Date;
  current_period_end: Date;
  auto_renew: boolean;
  created_at: Date;
  updated_at: Date;
}

export class SubscriptionRepository {
  async findActiveByUserId(userId: string): Promise<SubscriptionRecord | null> {
    const result = await pool.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 AND status = $2',
      [userId, 'active']
    );
    return result.rows[0] || null;
  }

  async createDefault(userId: string, plan: string = 'free'): Promise<SubscriptionRecord> {
    const subId = uuidv4();
    const result = await pool.query(
      `INSERT INTO subscriptions (id, user_id, plan, status, current_period_start, current_period_end)
       VALUES ($1, $2, $3, 'active', NOW(), NOW() + INTERVAL '100 years')
       RETURNING *`,
      [subId, userId, plan]
    );
    return result.rows[0];
  }

  async updatePlan(userId: string, plan: string): Promise<void> {
    // Отменяем старые активные подписки
    await pool.query(
      "UPDATE subscriptions SET status = 'cancelled', updated_at = NOW() WHERE user_id = $1 AND status = 'active'",
      [userId]
    );
    // Создаём новую
    await this.createDefault(userId, plan);
    // Обновляем план пользователя
    await pool.query('UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2', [plan, userId]);
  }

  async incrementVideosUsed(userId: string): Promise<void> {
    await pool.query(
      `UPDATE subscriptions SET videos_used_this_month = videos_used_this_month + 1
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );
  }

  async decrementVideosUsed(userId: string): Promise<void> {
    await pool.query(
      `UPDATE subscriptions SET videos_used_this_month = GREATEST(videos_used_this_month - 1, 0)
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );
  }

  async resetExpiredCounters(): Promise<void> {
    await pool.query(
      `UPDATE subscriptions
       SET videos_used_this_month = 0, minutes_used_this_month = 0,
           current_period_start = NOW(), current_period_end = NOW() + INTERVAL '30 days'
       WHERE current_period_end < NOW() AND status = 'active' AND plan != 'free'`
    );
    await pool.query(
      `UPDATE subscriptions
       SET videos_used_this_month = 0, minutes_used_this_month = 0
       WHERE plan = 'free' AND status = 'active'
         AND EXTRACT(MONTH FROM current_period_start) != EXTRACT(MONTH FROM NOW())`
    );
  }
}