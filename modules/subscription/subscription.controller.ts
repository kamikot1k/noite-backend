import { Request, Response, NextFunction } from 'express';
import { SubscriptionService } from './subscription.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export class SubscriptionController {
  constructor(private subscriptionService: SubscriptionService) {}

  get = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;
    const result = await this.subscriptionService.getUsage(userId);
    res.json(result);
  });

  canUpload = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { durationMinutes } = req.body;
    const result = await this.subscriptionService.canUpload(userId, durationMinutes);
    res.json(result);
  });

  upgrade = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { plan } = req.body;
    const result = await this.subscriptionService.upgrade(userId, plan);
    res.json(result);
  });
}