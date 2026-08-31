import { Request, Response } from 'express';
import { DiarizationService } from './diarization.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export class DiarizationController {
  constructor(private diarizationService: DiarizationService) {}

  get = asyncHandler(async (req: Request, res: Response) => {
    const data = await this.diarizationService.getDiarization(req.userId!, req.params.id);
    res.json(data);
  });

  start = asyncHandler(async (req: Request, res: Response) => {
    const data = await this.diarizationService.startDiarization(req.userId!, req.params.id);
    res.json(data);
  });
}