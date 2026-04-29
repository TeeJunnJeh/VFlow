/**
 * 商品图片生成功能的类型定义
 */

// ==================== 基础类型 ====================

export type GenerationType = 
  | 'product_gallery'
  | 'first_frame_image'
  | 'smart_repair'
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
  | '16:9'
  | '1:1'
  | '3:2'
  | '2:3'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '21:9';

export type FirstFrameStyle = 
  | 'authentic'
  | 'live'
  | 'studio'
  | 'clean';

export type FirstFrameModel =
  | 'nano-banana-pro'
  | 'flux-2-pro'
  | 'flux-2-flex'
  | 'gpt-image-2'
  | 'gpt-image-1.5';

export type FirstFrameWhitespace = 
  | 'top'
  | 'bottom'
  | 'right'
  | 'none';

export interface FirstFrameParams {
  prompt?: string;
  category?: FirstFrameCategory;
  personType?: FirstFramePersonType;
  holdingStyle?: FirstFrameHoldingStyle;
  aspectRatio?: FirstFrameAspectRatio;
  model?: FirstFrameModel;
  style?: FirstFrameStyle;
  textWhitespace?: FirstFrameWhitespace;
  outputCount?: 1 | 2 | 4;
}

// ==================== 智能修复相关类型 ====================

export type SmartRepairAspectRatio =
  | '1:1'
  | '4:5'
  | '9:16'
  | '16:9';

export type SmartRepairStrength = 'light' | 'medium' | 'strong';

export type SmartRepairSubpage = 'fashion_model' | 'product_object' | 'other';

export type SmartRepairToolCode =
  | 'mannequin_to_model'
  | 'anime_ip'
  | 'fashion_3d_showcase'
  | 'flat_lay_with_accessories'
  | 'body_reshape'
  | 'accessory_try_on'
  | 'product_defect_fix'
  | 'background_replace'
  | 'stain_remove'
  | 'detail_enhance'
  | 'old_photo_restore'
  | 'logo_cleanup'
  | 'text_replace'
  | 'custom_retouch';

export interface SmartRepairParams {
  prompt: string;
  aspectRatio?: SmartRepairAspectRatio;
  strength?: SmartRepairStrength;
  outputCount?: 1 | 2 | 4;
  subpage?: SmartRepairSubpage;
  toolCode?: SmartRepairToolCode;
}

export type SmartRepairPollStatus = 'created' | 'processing' | 'succeeded' | 'failed';

export interface SmartRepairSubmissionItem {
  requestId: string;
  status: SmartRepairPollStatus;
  sortOrder: number;
  role: string;
}

export interface SmartRepairSubmission {
  requests: SmartRepairSubmissionItem[];
  historyRecordId: string;
  cost: number;
  balance: number;
  model: string;
}

export interface SmartRepairPollResult {
  requestId: string;
  status: SmartRepairPollStatus;
  imageUrl: string;
  outputs: string[];
  error: string;
  historyRecordId: string;
  assetId: number;
  sortOrder: number;
}

export interface SmartRepairPendingItem {
  requestId: string;
  historyRecordId: string;
  assetId: number;
  sortOrder: number;
  role: string;
  submittedAt: number;
  settings: SmartRepairParams & {
    sourceImagePath?: string;
    referenceImagePath?: string;
    model?: string;
  };
}

// ==================== AI 换装 (ClothingSwap) 相关类型 ====================

export type ClothingSwapCategory = 'Top' | 'Bottom' | 'Full Body';

export type ClothingSwapColor =
  | 'Original'
  | 'Red'
  | 'Orange'
  | 'Yellow'
  | 'Green'
  | 'Blue'
  | 'Purple'
  | 'Pink'
  | 'Black'
  | 'White';

export type ClothingSwapBackground = 'model' | 'runway' | 'street' | 'white_wall';

export type ClothingSwapAspectRatio =
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9';

export type ClothingSwapOutputCount = 1 | 2 | 3 | 4;

export interface ClothingSwapParams {
  category: ClothingSwapCategory;
  targetColor?: ClothingSwapColor;
  background?: ClothingSwapBackground;
  aspectRatio?: ClothingSwapAspectRatio;
  outputCount?: ClothingSwapOutputCount;
}

export interface ClothingSwapResult {
  imageUrl: string;
  imageUrls: string[];
  downloadUrl: string;
  feedback?: string;
  taskId?: number | string;
  projectId?: string;
  cost?: number;
  balance?: number;
  model?: string;
  outputImages: ProductImageResult[];
}

export interface ClothingSwapVideoResult {
  videoUrl: string;
  background: ClothingSwapBackground;
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
  generationStatus?: 'pending' | 'processing' | 'succeeded' | 'failed';
  errorMessage?: string;
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

export type GenerationPhase = 
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
  isAsync?: boolean;
  requests?: Array<{
    requestId: string;
    status: string;
    outputIndex?: number;
    sortOrder?: number;
    frameRole?: string;
    role?: string;
  }>;
  projectId?: string;
  historyRecordId?: string;
  outputImages?: ProductImageResult[];
  errorMessage?: string;
  completedAt?: string;
}
