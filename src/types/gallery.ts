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

export interface GalleryAiLayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GalleryAiLayoutImageLayer {
  id: string;
  type: 'image';
  role?: string;
  name?: string;
  editable?: boolean;
  visible?: boolean;
  z_index?: number;
  rect: GalleryAiLayoutRect;
  source?: {
    mode?: string;
    asset_index?: number;
  };
  style?: {
    fit?: 'cover' | 'contain';
    radius?: number;
    opacity?: number;
  };
}

export interface GalleryAiLayoutTextLayer {
  id: string;
  type: 'text';
  role?: string;
  name?: string;
  editable?: boolean;
  visible?: boolean;
  z_index?: number;
  rect: GalleryAiLayoutRect;
  text_content?: string;
  style?: {
    font_size?: number;
    font_weight?: number;
    color?: string;
    align?: 'left' | 'center' | 'right';
    background?: string;
  };
}

export interface GalleryAiLayoutProposal {
  id: string;
  name: string;
  reason?: string;
  canvas: {
    width: number;
    height: number;
    aspect_ratio: string;
  };
  background?: {
    color?: string;
  };
  design_tokens?: {
    palette?: string[];
    font_family?: string;
    tone?: string;
  };
  layers: Array<GalleryAiLayoutImageLayer | GalleryAiLayoutTextLayer>;
}

export interface GalleryGenerateLayoutsData {
  proposals: GalleryAiLayoutProposal[];
  fallback_used?: boolean;
  model?: string;
  warning?: string;
}
