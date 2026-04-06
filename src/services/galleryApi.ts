import { apiRequest } from './apiClient';
import type {
  GalleryAnalyzeProductData,
  GalleryApiEnvelope,
  GalleryCreateJobData,
  GalleryGenerateLayoutsData,
  GalleryJobDetailData,
  GalleryTemplatesData,
} from '../types/gallery';

const API_BASE_URL = '/api/projects/gallery';

export const galleryApi = {
  analyzeProduct: async (body: { image_paths: string[]; output_language?: string }) => {
    return apiRequest<GalleryApiEnvelope<GalleryAnalyzeProductData>>(`${API_BASE_URL}/analyze-product`, {
      method: 'POST',
      body,
      fallbackMessage: '商品分析失败',
    });
  },

  getTemplates: async (query?: { output_type?: string; aspect_ratio?: string; style?: string }) => {
    const params = new URLSearchParams();
    if (query?.output_type) params.set('output_type', query.output_type);
    if (query?.aspect_ratio) params.set('aspect_ratio', query.aspect_ratio);
    if (query?.style) params.set('style', query.style);
    const queryString = params.toString();
    return apiRequest<GalleryApiEnvelope<GalleryTemplatesData>>(
      `${API_BASE_URL}/templates${queryString ? `?${queryString}` : ''}`,
      {
        fallbackMessage: '获取模板失败',
      }
    );
  },

  createJob: async (body: {
    image_paths: string[];
    product_name?: string;
    product_category?: string;
    core_selling_points?: string[];
    aspect_ratio?: string;
    resolution?: '1k' | '2k' | '4k';
    target_scene?: string;
    style?: string;
    hot_style?: { name: string; tones: string[]; description: string };
    requested_items: Array<{ output_type: string; template_id?: string; count?: number }>;
  }) => {
    return apiRequest<GalleryApiEnvelope<GalleryCreateJobData>>(`${API_BASE_URL}/jobs`, {
      method: 'POST',
      body,
      fallbackMessage: '创建商品套图任务失败',
    });
  },

  generateLayouts: async (body: {
    product_name?: string;
    product_category?: string;
    core_selling_points?: string[];
    aspect_ratio?: string;
    count?: number;
    selected_assets: Array<{
      local_id: string;
      name?: string;
      image_url?: string;
    }>;
  }) => {
    return apiRequest<GalleryApiEnvelope<GalleryGenerateLayoutsData>>(`${API_BASE_URL}/layouts/generate`, {
      method: 'POST',
      body,
      fallbackMessage: '生成画板排版方案失败',
    });
  },

  getJob: async (jobId: string) => {
    const id = String(jobId || '').trim();
    if (!id) throw new Error('jobId is required');
    return apiRequest<GalleryApiEnvelope<GalleryJobDetailData>>(`${API_BASE_URL}/jobs/${encodeURIComponent(id)}`, {
      fallbackMessage: '查询商品套图任务失败',
    });
  },
};
