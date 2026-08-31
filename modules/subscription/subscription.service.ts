import { SubscriptionRepository } from './subscription.repository.js';
import { getPlanLimits, PlanLimits } from '../../config/plans.js';
import { AppError } from '../../middlewares/error.middleware.js';

export class SubscriptionService {
  constructor(private subscriptionRepository: SubscriptionRepository) {}

  async getActiveSubscription(userId: string) {
    let sub = await this.subscriptionRepository.findActiveByUserId(userId);
    if (!sub) {
      sub = await this.subscriptionRepository.createDefault(userId, 'free');
    }
    return sub;
  }

  getPlanLimits(planName: string): PlanLimits {
    return getPlanLimits(planName);
  }

  async canUpload(userId: string, durationMinutes?: number) {
    const subscription = await this.getActiveSubscription(userId);
    const limits = this.getPlanLimits(subscription.plan);

    if (subscription.videos_used_this_month >= limits.maxVideos) {
      throw new AppError(429, 'Лимит видео исчерпан');
    }
    if (durationMinutes && durationMinutes > limits.maxDurationPerVideo) {
      throw new AppError(
        400,
        `Максимальная длительность: ${limits.maxDurationPerVideo} мин`
      );
    }

    return {
      allowed: true,
      limits: {
        maxVideos: limits.maxVideos,
        maxDurationPerVideo: limits.maxDurationPerVideo,
        videosUsed: subscription.videos_used_this_month,
      },
    };
  }

  async upgrade(userId: string, plan: string) {
    if (!getPlanLimits(plan)) throw new AppError(400, 'Неверный тариф');
    await this.subscriptionRepository.updatePlan(userId, plan);
    return {
      success: true,
      plan,
      limits: getPlanLimits(plan),
      message: `Тариф обновлён до ${getPlanLimits(plan).name}`,
    };
  }

  async getUsage(userId: string) {
    const subscription = await this.getActiveSubscription(userId);
    const limits = this.getPlanLimits(subscription.plan);
    return {
      subscription: {
        ...subscription,
        limits,
        usage: {
          videosUsed: subscription.videos_used_this_month,
          videosLimit: limits.maxVideos,
          minutesUsed: subscription.minutes_used_this_month,
          minutesLimit: limits.maxDurationPerVideo * limits.maxVideos,
        },
      },
    };
  }

  async resetExpiredCounters() {
    await this.subscriptionRepository.resetExpiredCounters();
  }
}