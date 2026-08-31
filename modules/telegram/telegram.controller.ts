import { Request, Response, NextFunction } from 'express';
import { TelegramService } from './telegram.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export class TelegramController {
  constructor(private telegramService: TelegramService) {}

  generateCode = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.telegramService.generateCode(req.userId!);
    res.json(result);
  });

  status = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.telegramService.getStatus(req.userId!);
    res.json(result);
  });

  disconnect = asyncHandler(async (req: Request, res: Response) => {
    await this.telegramService.disconnect(req.userId!);
    res.json({ success: true });
  });

  webhook = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.telegramService.handleWebhook(req.body?.message);
    res.json(result);
  });
}