export type GenerationStatus = 'processing' | 'completed' | 'failed';

export interface VideoTask {
  id: string;
  prompt: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  status: GenerationStatus;
  createdAt: string;
  duration: number; // seconds
  aspectRatio: string;
}

export interface Asset {
  id: string;
  name: string;
  type: 'template' | 'video' | 'image' | 'audio';
  previewUrl: string;
  tags: string[];
  isFavorite: boolean;
}