/**
 * 商品图片生成功能的类型定义
 */

// ==================== 基础类型 ====================

export type GenerationType = 
  | 'product_gallery'
  | 'first_frame_image'
  | 'clothing_swap';

export type GenerationStatus = 
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ImageCategory = 
  | 'white_bg'
  | 'scene'
  | 'selling_point'
  | 'cover'
  | 'poster'
  | 'frame';

// ==================== 首帧图相关类型 ====================

export type FirstFrameCategory = 
  | 'beauty'
  | 'skincare'
  | 'food'
  | 'appliance'
  | 'other';

export type FirstFramePersonType = 
  | 'female'
  | 'male'
  | 'neutral'
  | 'no_limit';

export type FirstFrameHoldingStyle = 
  | 'single_hand'
  | 'both_hands'
  | 'chest'
  | 'side';

export type FirstFrameAspectRatio = 
  | '9:16'
  | '4:5'
  | '1:1';

export type FirstFrameStyle = 
  | 'authentic'
  | 'live'
  | 'studio'
  | 'clean';

export type FirstFrameWhitespace = 
  | 'top'
  | 'bottom'
  | 'right'
  | 'none';

export interface FirstFrameParams {
  category?: FirstFrameCategory;
  personType?: FirstFramePersonType;
  holdingStyle?: FirstFrameHoldingStyle;
  aspectRatio?: FirstFrameAspectRatio;
  style?: FirstFrameStyle;
  textWhitespace?: FirstFrameWhitespace;
  outputCount?: 1 | 2 | 4;
}

// ==================== 生成任务相关类型 ====================

export interface ProductImageGenerationRequest {
  generationType: GenerationType;
  images: File[];
  parameters: FirstFrameParams | any; // 根据type变化
  projectId?: string;
}

export interface ProductImageGenerationTask {
  id: string;
  generationType: GenerationType;
  status: GenerationStatus;
  progress: number; // 0-100
  inputImages: string[];
  outputImages: ProductImageResult[];
  parameters: Record<string, any>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ProductImageResult {
  id: string;
  imageUrl: string;
  downloadUrl: string;
  category?: ImageCategory;
  format?: string;
  metadata?: Record<string, any>;
  size?: number; // bytes
}

// ==================== UI相关类型 ====================

export interface ImageUploadState {
  files: File[];
  previews: string[];
  errors: Record<string, string>;
  isUploading: boolean;
}

export interface GenerationPhase = 
  | 'form'
  | 'generating'
  | 'result'
  | 'error';

export interface GenerationError {
  code: string;
  message: string;
  errorType: 'validation' | 'network' | 'external_api' | 'timeout' | 'unknown';
  suggestion?: string;
  timestamp: string;
}

// ==================== 响应类型 ====================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface GenerationCreateResponse {
  taskId: string;
  status: GenerationStatus;
  progress: number;
  createdAt: string;
}

export interface GenerationStatusResponse {
  id: string;
  status: GenerationStatus;
  progress: number;
  outputImages?: ProductImageResult[];
  errorMessage?: string;
  completedAt?: string;
}
