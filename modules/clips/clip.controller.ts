import { Request, Response, NextFunction } from 'express';
import { ClipService } from './clip.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export class ClipController {
  constructor(private clipService: ClipService) {}

  update = asyncHandler(async (req: Request, res: Response) => {
    const clip = await this.clipService.updateClip(req.userId!, req.params.id, req.body);
    res.json(clip);
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    await this.clipService.deleteClip(req.userId!, req.params.id);
    res.json({ success: true });
  });
}