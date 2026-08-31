import { Request, Response, NextFunction } from 'express';
import { ProjectService } from './project.service.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { eventBus } from '../../utils/event-bus.js';

export class ProjectController {
  constructor(private projectService: ProjectService) {}

  upload = asyncHandler(async (req: Request, res: Response) => {
    const project = await this.projectService.uploadVideo(
      req.userId!,
      req.file!,
      req.body.title,
      req.body.userPrompt
    );
    res.status(201).json(project);
  });

  list = asyncHandler(async (req: Request, res: Response) => {
    const projects = await this.projectService.listUserProjects(req.userId!);
    res.json(projects);
  });

  getOne = asyncHandler(async (req: Request, res: Response) => {
    const project = await this.projectService.getProject(req.userId!, req.params.id);
    res.json(project);
  });

  getClips = asyncHandler(async (req: Request, res: Response) => {
    const clips = await this.projectService.getProjectClips(req.userId!, req.params.id);
    res.json(clips);
  });

  getVideo = asyncHandler(async (req: Request, res: Response) => {
    const { redirectUrl } = await this.projectService.getProjectVideo(req.userId!, req.params.id);
    res.redirect(redirectUrl);
  });

  getSubtitles = asyncHandler(async (req: Request, res: Response) => {
    const subtitles = await this.projectService.getSubtitles(req.userId!, req.params.id);
    res.json(subtitles);
  });

  updateSubtitles = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.projectService.updateSubtitles(req.userId!, req.params.id, req.body.words);
    res.json(result);
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    await this.projectService.deleteProject(req.userId!, req.params.id);
    res.json({ success: true });
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const updated = await this.projectService.updateProject(req.userId!, req.params.id, req.body.title);
    res.json(updated);
  });
}