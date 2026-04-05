import type { GalleryLayout } from './galleryEditor';
import type { GalleryOutputType, GalleryTemplateDefinition } from './galleryTemplate';

export interface GalleryApiEnvelope<T> {
  code?: number;
  message?: string;
  data?: T;
}

export interface GalleryAnalyzeProductData {
  product_name?: string;
  product_category?: string;
  core_selling_points: string[];
  target_audience?: string;
  reference_image_paths?: string[];
  subject_info?: {
    subject_box?: {
      x: number;
      y: number;
      w: number;
      h: number;
    };
    mask_url?: string;
    cutout_url?: string;
    confidence?: number;
  };
}

export interface GalleryCopywriting {
  title?: string;
  subtitle?: string;
  selling_points?: string[];
  badges?: string[];
  tone?: string;
}

export interface GalleryResultItem {
  id: string;
  request_id: string;
  template_id: string;
  template_name?: string;
  output_type: GalleryOutputType;
  output_index: number;
  status: 'created' | 'processing' | 'succeeded' | 'failed';
  preview_url?: string;
  layout_json?: GalleryLayout | null;
  copywriting_json?: GalleryCopywriting | null;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface GalleryJobSummary {
  id: string;
  status: 'queued' | 'processing' | 'partial_success' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  total_results: number;
  completed_results: number;
  failed_results: number;
  created_at: string;
  updated_at: string;
}

export interface GalleryCreateJobData {
  job: GalleryJobSummary;
  results: GalleryResultItem[];
}

export interface GalleryJobDetailData {
  job: GalleryJobSummary;
  results: GalleryResultItem[];
}

export interface GalleryTemplatesData {
  templates: GalleryTemplateDefinition[];
}

