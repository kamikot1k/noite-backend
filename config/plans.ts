export interface PlanLimits {
  name: string;
  maxVideos: number;
  maxDurationPerVideo: number;
  maxClipsPerVideo: number;
  exportQuality: string;
  watermark: boolean;
  editableSubtitles: boolean;
  customWidgets: boolean;
  widgetLogo: boolean;
  apiAccess: boolean;
  prioritySupport: boolean;
  clientTags: boolean;
}

export const PLANS: Record<string, PlanLimits> = {
  free: {
    name: 'Free',
    maxVideos: 2,
    maxDurationPerVideo: 30,
    maxClipsPerVideo: 10,
    exportQuality: '720p',
    watermark: true,
    editableSubtitles: false,
    customWidgets: false,
    widgetLogo: false,
    apiAccess: false,
    prioritySupport: false,
    clientTags: false,
  },
  premium: {
    name: 'Premium',
    maxVideos: 15,
    maxDurationPerVideo: 60,
    maxClipsPerVideo: 10,
    exportQuality: '4K',
    watermark: false,
    editableSubtitles: false,
    customWidgets: false,
    widgetLogo: false,
    apiAccess: false,
    prioritySupport: false,
    clientTags: false,
  },
  premium_plus: {
    name: 'Premium+',
    maxVideos: 25,
    maxDurationPerVideo: 120,
    maxClipsPerVideo: 15,
    exportQuality: '4K',
    watermark: false,
    editableSubtitles: false,
    customWidgets: false,
    widgetLogo: true,
    apiAccess: false,
    prioritySupport: true,
    clientTags: false,
  },
  enterprise: {
    name: 'Enterprise',
    maxVideos: 50,
    maxDurationPerVideo: 180,
    maxClipsPerVideo: 20,
    exportQuality: '4K',
    watermark: false,
    editableSubtitles: true,
    customWidgets: true,
    widgetLogo: true,
    apiAccess: true,
    prioritySupport: true,
    clientTags: true,
  },
};

export function getPlanLimits(planName: string): PlanLimits {
  return PLANS[planName] || PLANS.free;
}