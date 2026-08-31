import { Request, Response, NextFunction } from 'express';
import { ExportService } from './export.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export class ExportController {
  constructor(private exportService: ExportService) {}

  exportClip = asyncHandler(async (req: Request, res: Response) => {
    const buffer = await this.exportService.exportClip(req.userId!, req.params.id, req.body);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="noite_${req.params.id}.mp4"`);
    res.send(buffer);
  });

  subtitlePreview = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.exportService.subtitlePreview(req.userId!, req.params.id, req.body);
    res.json(result);
  });
}