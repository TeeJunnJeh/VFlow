import { VideoTask, Asset } from '../types';

// Mock delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const api = {
  // Generate Video
  generateVideo: async (prompt: string, options: any): Promise<{ taskId: string }> => {
    await delay(1500); // Simulate network
    return { taskId: Math.random().toString(36).substr(2, 9) };
  },

  // Fetch History
  getHistory: async (): Promise<VideoTask[]> => {
    await delay(1000);
    return Array.from({ length: 6 }).map((_, i) => ({
      id: `task-${i}`,
      prompt: `Cinematic shot of a futuristic city with neon lights, cyberpunk style, hyper-realistic...`,
      thumbnailUrl: `https://picsum.photos/seed/${i}/400/225`, // Placeholder
      status: i === 0 ? 'processing' : 'completed',
      createdAt: new Date().toISOString(),
      duration: 5,
      aspectRatio: '16:9'
    }));
  },

  // Fetch Assets
  getAssets: async (type: 'template' | 'media'): Promise<Asset[]> => {
    await delay(800);
    return Array.from({ length: 8 }).map((_, i) => ({
      id: `asset-${i}`,
      name: type === 'template' ? `Promo Template ${i + 1}` : `Stock Footage ${i + 1}`,
      type: type === 'template' ? 'template' : 'video',
      previewUrl: `https://picsum.photos/seed/${i + 100}/300/300`,
      tags: ['Cinematic', 'Nature', 'Business'],
      isFavorite: i % 3 === 0
    }));
  }
};