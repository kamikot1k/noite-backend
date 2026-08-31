import { ProjectRepository } from './project.repository.js';
import { SubscriptionService } from '../subscription/subscription.service.js';
import { S3Service } from '../../integrations/s3/s3.service.js';
import { openai } from '../../integrations/openai/openai.client.js';
import { AppError } from '../../middlewares/error.middleware.js';
import { eventBus } from '../../utils/event-bus.js';
import { pool } from '../../database/pool.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { execAsync } from '../../utils/helpers.js';
import { config } from '../../config/index.js';

export interface ViralClip {
  type: string;
  start: number;
  end: number;
  hook: string;
  description: string;
  virality_score: number;
  category: string;
  platform: string;
  reason: string;
  duration: number;
  fragments: { start: number; end: number; text: string }[];
}

export class ProjectService {
  constructor(
    private projectRepository: ProjectRepository,
    private subscriptionService: SubscriptionService,
    private s3Service: S3Service
  ) {}

  async uploadVideo(userId: string, file: Express.Multer.File, title?: string, userPrompt?: string) {
    if (!file) throw new AppError(400, 'Файл не найден');

    const subscription = await this.subscriptionService.getActiveSubscription(userId);
    const limits = this.subscriptionService.getPlanLimits(subscription.plan);

    if (subscription.videos_used_this_month >= limits.maxVideos) {
      fs.unlinkSync(file.path);
      throw new AppError(429, 'Лимит видео исчерпан');
    }

    let videoDurationMinutes = 0;
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${file.path}"`
      );
      videoDurationMinutes = parseFloat(stdout.trim()) / 60;
    } catch (_) {
      // ignore
    }

    if (videoDurationMinutes > limits.maxDurationPerVideo) {
      fs.unlinkSync(file.path);
      throw new AppError(400, `Максимальная длительность: ${limits.maxDurationPerVideo} мин`);
    }

    const projectId = (file as any).generatedId || uuidv4();
    const s3VideoKey = `${userId}/uploads/${projectId}${path.extname(file.originalname)}`;

    await this.s3Service.uploadFile(file.path, s3VideoKey);
    fs.unlinkSync(file.path);

    const project = await this.projectRepository.create({
      id: projectId,
      userId,
      title: title || file.originalname,
      videoPath: s3VideoKey,
      userPrompt: userPrompt || '',
    });

    await this.subscriptionService['subscriptionRepository'].incrementVideosUsed(userId);

    // Запуск обработки в фоне
    eventBus.emit('project.uploaded', { projectId });

    return this.projectRepository.mapProject(project);
  }

  async listUserProjects(userId: string) {
    const rows = await this.projectRepository.findByUserId(userId);
    return rows.map((row) => this.projectRepository.mapProject(row));
  }

  async getProject(userId: string, projectId: string) {
    const project = await this.projectRepository.findById(projectId, userId);
    if (!project) throw new AppError(404, 'Проект не найден');
    return this.projectRepository.mapProject(project);
  }

  async getProjectClips(userId: string, projectId: string) {
    const project = await this.projectRepository.findById(projectId, userId);
    if (!project) throw new AppError(404, 'Проект не найден');
    const clips = await this.projectRepository.getClips(projectId);
    return clips.map((clip) => this.mapClip(clip));
  }

  async getProjectVideo(userId: string, projectId: string) {
    const project = await this.projectRepository.findById(projectId, userId);
    if (!project) throw new AppError(404, 'Видео не найдено');
    const s3Key = project.video_path;
    try {
      const signedUrl = await this.s3Service.getCachedSignedUrl(s3Key, 3600);
      return { redirectUrl: signedUrl };
    } catch {
      throw new AppError(404, 'Файл не найден в S3');
    }
  }

  async updateProject(userId: string, projectId: string, title: string) {
    if (!title?.trim()) throw new AppError(400, 'Название не может быть пустым');
    const updated = await this.projectRepository.update(projectId, { title: title.trim() } as any);
    if (!updated) throw new AppError(404, 'Проект не найден');
    eventBus.emit('project.updated', this.projectRepository.mapProject(updated));
    return this.projectRepository.mapProject(updated);
  }

  async deleteProject(userId: string, projectId: string) {
    const project = await this.projectRepository.findById(projectId, userId);
    if (!project) throw new AppError(404, 'Проект не найден');

    // Удаление файлов из S3
    await this.s3Service.deleteFile(project.video_path);
    await this.s3Service.deleteFile(`${userId}/transcription/${projectId}.json`);
    await this.s3Service.deleteFile(`${userId}/words/${projectId}.json`);
    await this.s3Service.deleteFile(`${userId}/content_packs/${projectId}.json`);
    await this.s3Service.deleteFile(`${userId}/diarization/${projectId}.json`);

    await this.projectRepository.delete(projectId);
    await this.subscriptionService['subscriptionRepository'].decrementVideosUsed(userId);
  }

  async getSubtitles(userId: string, projectId: string) {
    const project = await this.projectRepository.findById(projectId, userId);
    if (!project) throw new AppError(404, 'Проект не найден');
    const s3Key = `${userId}/words/${projectId}.json`;
    try {
      const data = await this.s3Service.getJsonObject(s3Key);
      return data;
    } catch {
      throw new AppError(404, 'Субтитры не найдены');
    }
  }

  async updateSubtitles(userId: string, projectId: string, words: any[]) {
    const project = await this.projectRepository.findById(projectId, userId);
    if (!project) throw new AppError(404, 'Проект не найден');
    if (!Array.isArray(words)) throw new AppError(400, 'words должен быть массивом');

    const s3Key = `${userId}/words/${projectId}.json`;
    const localPath = `/tmp/noite-upload/${projectId}_words_update.json`;
    fs.writeFileSync(localPath, JSON.stringify({ words, updatedAt: new Date().toISOString() }));
    await this.s3Service.uploadFile(localPath, s3Key);
    fs.unlinkSync(localPath);

    return { success: true, words };
  }

  async resumeIncompleteProjects() {
    const stuckStatuses = ['uploading', 'extracting_audio', 'transcribing', 'analyzing'];
    const stuck = await this.projectRepository.getStuckProjects(stuckStatuses);
    if (stuck.length === 0) return;
    console.log(`🔄 Найдено ${stuck.length} незавершённых проектов`);
    for (const row of stuck) {
      this.processVideo(row.id).catch((e) =>
        console.error(`Ошибка возобновления ${row.id}:`, e)
      );
    }
  }

  // ==================== Обработка видео ====================
  async processVideo(projectId: string) {
    console.log(`🎬 Начало обработки проекта ${projectId}`);
    try {
      const project = await this.projectRepository.findById(projectId);
      if (!project) {
        console.error(`Проект ${projectId} не найден`);
        return;
      }
      if (project.status === 'done') {
        console.log(`Проект уже готов`);
        return;
      }

      const subscription = await this.subscriptionService.getActiveSubscription(project.user_id);
      const limits = this.subscriptionService.getPlanLimits(subscription.plan);
      const maxClips = limits.maxClipsPerVideo;

      // 1. Получаем аудио из S3 через AI сервер
      console.log(`🎧 Запрос на извлечение аудио и транскрипцию...`);
      await this.projectRepository.updateStatus(projectId, 'transcribing');

      const signedVideoUrl = await this.s3Service.getSignedUrl(project.video_path, 3600);

      const FormData = (await import('form-data')).default;
      const fetch = (await import('node-fetch')).default;

      const form = new FormData();
      form.append('audioUrl', signedVideoUrl);
      form.append('language', 'ru');

      const transcribeRes = await fetch(`${config.aiServerUrl}/transcribe`, {
        method: 'POST',
        body: form,
      });

      if (!transcribeRes.ok) {
        throw new Error(`Transcription failed: ${transcribeRes.status}`);
      }

      const transcription = await transcribeRes.json();
      console.log(`✅ Транскрипция завершена: ${transcription.segments?.length || 0} сегментов`);

      // 2. Сохраняем транскрипцию в S3
      const transcriptionS3Key = `${project.user_id}/transcription/${projectId}.json`;
      const transcriptionJson = JSON.stringify(transcription);
      const localTranscriptionPath = `/tmp/noite-upload/${projectId}_transcription.json`;
      fs.writeFileSync(localTranscriptionPath, transcriptionJson);
      await this.s3Service.uploadFile(localTranscriptionPath, transcriptionS3Key);
      fs.unlinkSync(localTranscriptionPath);

      // 3. Сохраняем words в S3
      const wordsS3Key = `${project.user_id}/words/${projectId}.json`;
      const wordsJson = JSON.stringify({
        words: transcription.words || [],
        duration: transcription.duration || 0,
      });
      const localWordsPath = `/tmp/noite-upload/${projectId}_words.json`;
      fs.writeFileSync(localWordsPath, wordsJson);
      await this.s3Service.uploadFile(localWordsPath, wordsS3Key);
      fs.unlinkSync(localWordsPath);

      // 4. Поиск виральных моментов через LLM
      console.log(`🔥 Поиск виральных моментов...`);
      await this.projectRepository.updateStatus(projectId, 'analyzing');

      const clips = await this.findViralMoments(
        transcription.segments || [],
        transcription.duration || 0,
        [],
        project.user_prompt || '',
        maxClips
      );
      console.log(`✅ Найдено ${clips.length} клипов`);

      // 5. Сохраняем клипы в БД
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const clipId = uuidv4();
        await pool.query(
          `INSERT INTO clips (id, project_id, index_num, type, start_time, end_time, duration, hook, description, virality_score, category, platform, reason, fragments)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            clipId,
            projectId,
            i + 1,
            clip.type || 'continuous',
            clip.start,
            clip.end,
            clip.duration || clip.end - clip.start,
            clip.hook,
            clip.description,
            clip.virality_score,
            clip.category,
            clip.platform,
            clip.reason,
            JSON.stringify(clip.fragments || []),
          ]
        );
      }

      // 6. Генерация контент-пакета
      console.log(`📝 Генерация контент-пакета...`);
      try {
        const contentPack = await this.generateVideoContentPack(
          transcription.text || '',
          project.title,
          transcription.duration || 0
        );
        const packS3Key = `${project.user_id}/content_packs/${projectId}.json`;
        const localPackPath = `/tmp/noite-upload/${projectId}_pack.json`;
        fs.writeFileSync(localPackPath, JSON.stringify(contentPack));
        await this.s3Service.uploadFile(localPackPath, packS3Key);
        fs.unlinkSync(localPackPath);
      } catch (e: any) {
        console.error('Ошибка контент-пакета:', e.message);
      }

      await this.projectRepository.update(projectId, {
        status: 'done',
        clips_count: clips.length,
        duration: transcription.duration || 0,
      } as any);
      console.log(`🎉 Проект ${projectId} обработан успешно`);
    } catch (error: any) {
      console.error(`❌ Ошибка проекта ${projectId}:`, error);
      try {
        await this.projectRepository.updateStatus(projectId, 'error');
      } catch (_) {}
    }
  }

  private async findViralMoments(
    segments: any[],
    durationSeconds: number,
    frameDescriptions: any[] = [],
    userPrompt: string = '',
    maxClips: number = 8
  ): Promise<ViralClip[]> {
    const transcriptWithTimestamps = segments
      .map((seg, i) => `[${i}] ${seg.start.toFixed(1)} ${seg.end.toFixed(1)} "${seg.text}"`)
      .join('\n');

    const userBlock = userPrompt
      ? `\nДОПОЛНИТЕЛЬНЫЕ ДАННЫЕ ОТ ПОЛЬЗОВАТЕЛЯ: "${userPrompt}"\nУчти это при выборе клипов.`
      : '';

    const systemPrompt = `Ты — элитный видеомонтажёр. Найди ${maxClips} виральных клипов.
Ровно ${Math.round(maxClips * 0.7)} mashup и ${maxClips - Math.round(maxClips * 0.7)} continuous.
Отвечай ТОЛЬКО JSON в формате:
{
  "clips": [
    {
      "type": "mashup",
      "start": 14.5,
      "end": 59.5,
      "hook": "Заголовок",
      "description": "Описание",
      "virality_score": 8,
      "category": "emotional_peak",
      "reason": "Причина",
      "platform": "tiktok",
      "duration": 45.0,
      "fragments": [{"start": 14.5, "end": 21.0, "text": "..."}]
    }
  ]
}
Бери таймкоды строго из транскрипта. Не обрывай фразы.`;

    const response = await openai.chat.completions.create({
      model: 'openai/gpt-5.6-luna-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Транскрипт:\n\n${transcriptWithTimestamps}${userBlock}\n\nНайди ${maxClips} виральных моментов.`,
        },
      ],
      max_tokens: 8000,
    });

    const raw = response.choices[0].message.content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    const parsed = JSON.parse(raw);
    return parsed.clips || [];
  }

  private async generateVideoContentPack(
    fullTranscript: string,
    videoTitle: string,
    durationSeconds: number
  ) {
    const truncatedTranscript = fullTranscript.substring(0, 20000);

    const systemPrompt = `Ты — SMM-продюсер. Создай 4 варианта постов для каждой платформы.
Отвечай JSON:
{
  "telegram": ["пост1", "пост2", "пост3", "пост4"],
  "twitter": [["твит1","твит2"], ...],
  "vk": ["пост1", "пост2", "пост3", "пост4"],
  "hashtags": {"telegram": ["#тег1"], "twitter": ["#тег1"], "vk": ["#тег1"]}
}`;

    const response = await openai.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Видео: "${videoTitle}"\n\nТранскрипт:\n${truncatedTranscript}`,
        },
      ],
      temperature: 0.8,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content);
  }

  private mapClip(clip: any) {
    return {
      id: clip.id,
      projectId: clip.project_id,
      index: clip.index_num,
      type: clip.type,
      start: clip.start_time,
      end: clip.end_time,
      duration: clip.duration,
      hook: clip.hook,
      description: clip.description,
      viralityScore: clip.virality_score,
      category: clip.category,
      platform: clip.platform,
      reason: clip.reason,
      status: clip.status,
      videoPath: clip.video_path,
      srtPath: clip.srt_path,
      fragments: clip.fragments || [],
      contentPack: clip.content_pack || null,
      panX: clip.pan_x || 0,
      panY: clip.pan_y || 0,
      videoZoom: clip.video_zoom || 1,
    };
  }
}