import bcrypt from 'bcryptjs';
import { AuthRepository } from './auth.repository.js';
import { SubscriptionService } from '../subscription/subscription.service.js';
import { AppError } from '../../middlewares/error.middleware.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt.js';
import { config } from '../../config/index.js';

export class AuthService {
  constructor(
    private authRepository: AuthRepository,
    private subscriptionService: SubscriptionService
  ) {}

  async register(email: string, password: string, name: string) {
    if (!email || !password) throw new AppError(400, 'Email и пароль обязательны');
    if (password.length < 6) throw new AppError(400, 'Пароль минимум 6 символов');

    const existing = await this.authRepository.findByEmail(email);
    if (existing) throw new AppError(409, 'Email уже используется');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.authRepository.createUser(email, passwordHash, name || '');
    await this.authRepository.createSubscription(user.id, 'free');

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    await this.authRepository.createRefreshToken(
      user.id,
      refreshToken,
      new Date(Date.now() + config.refreshTokenCookieMaxAge)
    );

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, plan: 'free' },
    };
  }

  async login(email: string, password: string) {
    if (!email || !password) throw new AppError(400, 'Email и пароль обязательны');

    const user = await this.authRepository.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AppError(401, 'Неверный email или пароль');
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    await this.authRepository.createRefreshToken(
      user.id,
      refreshToken,
      new Date(Date.now() + config.refreshTokenCookieMaxAge)
    );

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
    };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new AppError(401, 'Refresh token отсутствует');

    let decoded: any;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError(401, 'Refresh token недействителен');
    }

    const tokenRecord = await this.authRepository.findRefreshToken(refreshToken);
    if (!tokenRecord || tokenRecord.expires_at <= new Date()) {
      throw new AppError(401, 'Refresh token недействителен');
    }

    await this.authRepository.deleteRefreshToken(refreshToken);

    const newAccessToken = generateAccessToken(decoded.userId);
    const newRefreshToken = generateRefreshToken(decoded.userId);
    await this.authRepository.createRefreshToken(
      decoded.userId,
      newRefreshToken,
      new Date(Date.now() + config.refreshTokenCookieMaxAge)
    );

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) {
      await this.authRepository.deleteRefreshToken(refreshToken);
    }
  }

  async getMe(userId: string) {
    const user = await this.authRepository.findById(userId);
    if (!user) throw new AppError(404, 'Пользователь не найден');

    const subscription = await this.subscriptionService.getActiveSubscription(userId);
    const limits = this.subscriptionService.getPlanLimits(subscription.plan);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        created_at: user.created_at,
        subscription: {
          plan: subscription.plan,
          status: subscription.status,
          current_period_end: subscription.current_period_end,
          usage: {
            videosUsed: subscription.videos_used_this_month,
            videosLimit: limits.maxVideos,
            minutesUsed: subscription.minutes_used_this_month,
          },
          limits,
        },
      },
    };
  }
}