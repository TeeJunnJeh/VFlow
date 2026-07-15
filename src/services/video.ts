// src/services/video.ts

import { traceApiRequest } from './opsTrace';
import { apiRequest, getCookie } from './apiClient';
import { ApiError, parseApiError, type ApiActionRequired } from './errors';

const API_BASE_URL = '/api/projects';

const isApiDebugEnabled = () => {
  const isDev = Boolean((import.meta as any)?.env?.DEV);
  if (isDev) return true;
  if (typeof window === 'undefined') return false;
  const flag = String(window.localStorage.getItem('vflow_api_debug') || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
};

const debugApiLog = (label: string, payload: Record<string, unknown>) => {
  if (!isApiDebugEnabled()) return;
  // Structured browser logs for request/response inspection.
  console.log(`[API DEBUG] ${label}`, payload);
};

// ——— 向后兼容：VideoApiError 现在是 ApiError 的别名 ———
// 外部代码如果 import 了 VideoApiError 或 instanceof 检查，都无缝过渡
export { ApiError as VideoApiError };
export type { ApiActionRequired };

export type HistoryProjectStatus = 'DRAFT' | 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export type HistorySort = 'updated_at_desc' | 'updated_at_asc' | 'created_at_desc' | 'created_at_asc';

export interface HistoryQueryParams {
  status?: 'ALL' | HistoryProjectStatus;
  keyword?: string;
  sort?: HistorySort;
  page?: number;
  page_size?: number;
}

export interface HistoryPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface HistoryListResponse {
  items: HistoryProject[];
  pagination: HistoryPagination;
}

export interface HistoryProject {
  id: string;
  title: string;
  status: HistoryProjectStatus;
  cover_url: string | null;
  video_url: string | null;
  generation_model?: string | null;
  duration: number;
  created_at: string;
  updated_at: string;
  is_favorited?: boolean;
  platform_stats?: Record<string, unknown>;
  request_payload?: Record<string, unknown> | null;
  model_request?: Record<string, unknown> | null;
  config_snapshot?: {
    category: string;
    style: string;
    ratio: string;
  };
}

export interface HistoryDetailResponse {
  id: string;
  request_payload: Record<string, unknown> | null;
  model_request: Record<string, unknown> | null;
  script_content?: Record<string, unknown> | null;
}

type ScriptStreamEvent = {
  message?: string;
  data?: Record<string, unknown>;
};

type ScriptStreamCallbacks = {
  onStart?: (event: ScriptStreamEvent) => void;
  onVariant?: (event: ScriptStreamEvent) => void | Promise<void>;
  onDone?: (event: ScriptStreamEvent) => void;
  onErrorEvent?: (event: ScriptStreamEvent) => void;
};

type ApiEnvelope<T> = {
  code?: number;
  message?: string;
  error?: string;
  data?: T;
} & Record<string, unknown>;

export type GeneratePreviewData = {
  request_payload: Record<string, unknown>;
  model_request: Record<string, unknown>;
  task_type: string;
  api_method: string;
  project_id?: string | null;
  resolved_assets?: Record<string, unknown>;
};

export type GenerateFusionImagePayload = {
  project_id: string;
  image_paths: string[];
  prompt: string;
  aspect_ratio?: '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  resolution?: '1K' | '2K' | '4K';
};

export type ReplayReverseScriptData = {
  summary: string;
  styleTags: string[];
  styleReferenceText?: string;
  suggestedPrompt: string;
  scriptBrief?: string;
  shotOutline?: string[];
  userFacingScript?: string;
  user_facing_script?: string;
  scriptArchitecture?: Record<string, unknown>;
  script_architecture?: Record<string, unknown>;
  overallFeatures?: Record<string, unknown>;
  overall_features?: Record<string, unknown>;
  storyboardSegments?: Array<Record<string, unknown>>;
  storyboard_segments?: Array<Record<string, unknown>>;
  seedanceMotionPrompt?: string;
  seedance_motion_prompt?: string;
  seedancePrompt?: string;
  seedance_prompt?: string;
  analysisMode?: string;
  directVideoUsed?: boolean;
  fallbackReason?: string;
  debug_trace?: Array<Record<string, unknown>>;
  suggestedCategory: string;
  suggestedSellingPoints: string;
  sampled_keyframes?: Array<{
    frame_index: number;
    timestamp_sec: number;
    timestamp: string;
  }>;
  metrics?: Record<string, unknown>;
};

export type GenerateFirstFramePayload = {
  project_id?: string;
  reference_image_path: string;
  aspect_ratio?: string;
  frame_type?: 'first' | 'last' | 'both';
  model?: string;
  prompt_override?: string;
  product_description_override?: string;
};

export type SeedSkillWorkflowAsset = {
  path: string;
  kind: 'image' | 'video' | 'audio' | 'text' | 'file';
  original_name?: string;
  public_url?: string;
};

export type SeedSkillWorkflowPayload = {
  assets: SeedSkillWorkflowAsset[];
  selling_point: string;
  video_type: string;
  skill_number?: string;
  skill_token?: string;
  language?: string;
  aspect_ratio?: string;
  duration?: number;
};

export type SeedSkillPreview = {
  token: string;
  title: string;
  text: string;
  recipe: Record<string, unknown>;
};

export type SeedSkillWorkflow = {
  id: string;
  agent_recipe_id?: string;
  status:
    | 'created'
    | 'needs_script_review'
    | 'prompt_ready'
    | 'video_submitting'
    | 'video_submitted'
    | 'video_processing'
    | 'video_succeeded'
    | 'video_failed'
    | 'video_cancelled';
  creative_number?: string;
  selling_point: string;
  video_type: string;
  language: string;
  aspect_ratio: string;
  duration: number;
  assets: SeedSkillWorkflowAsset[];
  recipe: Record<string, unknown>;
  skill?: SeedSkillPreview;
  skill_markdown: string;
  stage1: Record<string, unknown>;
  stage2: Record<string, unknown>;
  final_prompt: string;
  video_task?: {
    id?: string | number;
    project_id?: string;
    status?: string;
    submitted_at?: string;
    result?: Record<string, unknown>;
  };
  video_result?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type SeedSkillWorkflowResponse = {
  workflow: SeedSkillWorkflow;
  skill_asset?: Record<string, unknown>;
  task?: Record<string, unknown>;
  task_id?: string | number;
  status?: Record<string, unknown>;
};

export type SeedSkillPromptRefinePayload = {
  assets: SeedSkillWorkflowAsset[];
  initial_script: string;
  prompt_format: 'short' | 'storyboard' | 'one_shot';
  language?: string;
  aspect_ratio?: string;
  duration?: number;
};

export type SeedSkillPromptRefineResponse = {
  prompt_format: 'short' | 'storyboard' | 'one_shot';
  subject_definitions: Array<Record<string, unknown>>;
  subject_statement: string;
  final_prompt: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

const toPositiveInt = (value: unknown, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i > 0 ? i : fallback;
};

const toNonNegativeInt = (value: unknown, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i >= 0 ? i : fallback;
};

const parseHistoryListResponse = (data: unknown): HistoryListResponse => {
  if (Array.isArray(data)) {
    const count = data.length;
    return {
      items: data as HistoryProject[],
      pagination: {
        page: 1,
        page_size: count || 1,
        total: count,
        total_pages: 1,
      },
    };
  }

  const rec = asRecord(data);
  const itemsRaw = rec ? rec.items : undefined;
  const items = Array.isArray(itemsRaw) ? (itemsRaw as HistoryProject[]) : [];

  const paginationRaw = rec ? asRecord(rec.pagination) : null;
  const total = toNonNegativeInt(paginationRaw?.total ?? items.length, items.length);
  const pageSize = toPositiveInt(paginationRaw?.page_size ?? items.length ?? 1, items.length || 1);
  const totalPages = toPositiveInt(
    paginationRaw?.total_pages ?? Math.max(1, Math.ceil(total / Math.max(1, pageSize))),
    1,
  );
  const page = Math.min(toPositiveInt(paginationRaw?.page ?? 1, 1), totalPages);

  return {
    items,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
    },
  };
};

export type TextSeparationBlockPayload = {
  id: string;
  text: string;
  bbox: [number, number, number, number];
  font_size?: number;
  color?: [number, number, number];
  bold?: boolean;
  outline?: boolean | { color?: [number, number, number]; width?: number };
  shadow?: boolean | { color?: [number, number, number]; blur?: number; offsetX?: number; offsetY?: number };
};

export type TextSeparationResponse = {
  sample_id?: string;
  history_record_id?: string;
  original_image_url: string;
  clean_image_url: string;
  text_blocks: TextSeparationBlockPayload[];
};

export type TextSeparationSecondaryElementPayload = {
  id: string;
  text: string;
  bbox: [number, number, number, number];
  prompt?: string;
};

export type TextSeparationSecondaryCreatePayload = {
  sample_title?: string;
  background_image_url: string;
  original_image_url?: string;
  reference_image_data_url: string;
  canvas_aspect_ratio?: number;
  global_prompt?: string;
  elements: TextSeparationSecondaryElementPayload[];
  elements_snapshot?: unknown[];
};

export type TextSeparationSecondaryTask = {
  history_id?: string;
  request_id: string;
  status: string;
  created_at?: string;
  sample_title?: string;
  background_image_url?: string;
  original_image_url?: string;
  global_prompt?: string;
  elements?: TextSeparationSecondaryElementPayload[];
  elements_snapshot?: unknown[];
  canvas_aspect_ratio?: number;
  preview_url?: string;
  error?: string;
  get_url?: string | null;
};

export type TextSeparationSecondaryResult = {
  request_id: string;
  status: string;
  outputs: string[];
  error?: string;
};

export type TextSeparationSecondaryHistoryItem = {
  history_id: string;
  request_id: string;
  status: string;
  created_at: string;
  updated_at?: string;
  sample_title?: string;
  background_image_url?: string;
  original_image_url?: string;
  global_prompt?: string;
  elements?: TextSeparationSecondaryElementPayload[];
  elements_snapshot?: unknown[];
  canvas_aspect_ratio?: number;
  preview_url?: string;
  error?: string;
};

export type ScriptEstimateParams = {
  script_count: number;
  duration: number;
  has_reference_assets: boolean;
  with_shots?: boolean;
};

type ScriptStreamEnvelope = {
  code?: number;
  message?: string;
  data?: Record<string, unknown>;
} & Record<string, unknown>;

type ScriptStreamHandlers = {
  onStart?: (payload: ScriptStreamEnvelope) => void;
  onVariant?: (payload: ScriptStreamEnvelope) => void;
  onDone?: (payload: ScriptStreamEnvelope) => void;
  onErrorEvent?: (payload: ScriptStreamEnvelope) => void;
  onCancelled?: (payload: ScriptStreamEnvelope) => void;
};

const parseSseChunk = (chunk: string): { event: string; data: string } | null => {
  const lines = chunk
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return null;

  let event = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message';
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }
  const data = dataLines.join('\n');
  return { event, data };
};

const findSseBoundary = (buffer: string): { index: number; separatorLength: number } | null => {
  const crlfIndex = buffer.indexOf('\r\n\r\n');
  const lfIndex = buffer.indexOf('\n\n');
  if (crlfIndex >= 0 && (lfIndex < 0 || crlfIndex < lfIndex)) {
    return { index: crlfIndex, separatorLength: 4 };
  }
  if (lfIndex >= 0) {
    return { index: lfIndex, separatorLength: 2 };
  }
  return null;
};

export const videoApi = {
  estimateVideoTime: async (params: { model: string; duration: number; sound?: string; aspect_ratio?: string; resolution?: string }) => {
    const query = new URLSearchParams();
    query.set('model', String(params.model || ''));
    query.set('duration', String(params.duration ?? ''));
    if (params.sound) query.set('sound', String(params.sound));
    if (params.aspect_ratio) query.set('aspect_ratio', String(params.aspect_ratio));
    if (params.resolution) query.set('resolution', String(params.resolution));

    const response = await fetch(`/api/tasks/estimate/?${query.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Request failed');
    }

    return await response.json();
  },

  resetVideoTimeEstimates: async () => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch('/api/tasks/estimate/reset/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ confirm: true }),
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Request failed');
    }

    return await response.json();
  },

  estimateScriptTime: async (params: ScriptEstimateParams) => {
    const query = new URLSearchParams();
    query.set('script_count', String(params.script_count ?? ''));
    query.set('duration', String(params.duration ?? ''));
    query.set('has_reference_assets', params.has_reference_assets ? 'true' : 'false');
    if (params.with_shots !== undefined) {
      query.set('with_shots', params.with_shots ? 'true' : 'false');
    }

    const response = await fetch(`/api/tasks/script-estimate/?${query.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Request failed');
    }

    return await response.json();
  },

  reportScriptTime: async (payload: ScriptEstimateParams & { elapsed_seconds: number }) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch('/api/tasks/script-estimate/report/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Request failed');
    }

    return await response.json();
  },

  // Debug: fetch backend prompt templates (for prompt tuning UI)
  getPromptTemplates: async (params?: { category?: string }) => {
    const category = typeof params?.category === 'string' ? params.category.trim() : '';
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const response = await fetch(`${API_BASE_URL}/prompt-templates/${query}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Request failed');
    }

    return await response.json();
  },

  generateFusionImage: async (payload: GenerateFusionImagePayload) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/generate_fusion_image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const fallback = `生图失败: ${response.status} ${response.statusText || ''}`.trim();
      throw await parseApiError(response, fallback);
    }

    return await response.json();
  },

  // Backward-compatible entry used by WorkbenchView (Kling first/last frame generation).
  generateFirstFrame: async (payload: GenerateFirstFramePayload) => {
    const csrftoken = getCookie('csrftoken');
    const endpoint = `${API_BASE_URL}/generate_first_frame`;

    debugApiLog('request generate_first_frame', {
      endpoint,
      method: 'POST',
      payload,
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const responseClone = response.clone();

    let debugResponseBody: unknown = null;
    try {
      debugResponseBody = await responseClone.json();
    } catch {
      debugResponseBody = { nonJson: true };
    }
    debugApiLog('response generate_first_frame', {
      endpoint,
      status: response.status,
      ok: response.ok,
      body: debugResponseBody,
    });

    if (!response.ok) {
      const fallback = `首帧生成失败: ${response.status} ${response.statusText || ''}`.trim();
      throw await parseApiError(response, fallback);
    }

    return await response.json();
  },

  generateProductGallery: async (payload: {
    imageModel?: string;
    client_history_id?: string;
    skip_history?: boolean;
    prompt?: string;
    image_paths: string[];
    aspect_ratio?: string;
    count?: number;
    resolution?: '1k' | '2k' | '4k';
    product_name?: string;
    product_category?: string;
    core_selling_points?: string[];
    target_scene?: string;
    scene_config?: {
      sceneTheme?: string;
      sceneDescription?: string;
      sceneProps?: string;
      lighting?: string;
      mood?: string;
    };
    style?: string;
    target_language?: string;
    hot_style?: { name: string; tones: string[]; description: string };
    model_cards?: Array<{
      id?: string;
      name?: string;
      imagePath?: string;
      image_path?: string;
      modelInfo?: string;
      model_info?: string;
    }>;
    scene_cards?: Array<{
      id?: string;
      name?: string;
      sourceMode?: 'preset' | 'custom';
      source_mode?: 'preset' | 'custom';
      presetId?: string;
      preset_id?: string;
      sceneConfig?: {
        sceneTheme?: string;
        sceneDescription?: string;
        sceneProps?: string;
        lighting?: string;
        mood?: string;
      };
      scene_config?: {
        sceneTheme?: string;
        sceneDescription?: string;
        sceneProps?: string;
        lighting?: string;
        mood?: string;
      };
    }>;
    type_selections?: Record<string, { enabled?: boolean; count?: number }>;
    output_mode?: 'custom' | 'ai';
    output_items?: Array<{
      id?: string;
      enabled?: boolean;
      output_type?: string;
      aspect_ratio?: string;
      resolution?: '1k' | '2k' | '4k';
      count?: number;
      title?: string;
      model_card_id?: string;
      scene_card_id?: string;
      model_binding?: {
        id?: string;
        name?: string;
        image_path?: string;
        model_info?: string;
      };
      scene_binding?: {
        id?: string;
        name?: string;
        source_mode?: 'preset' | 'custom';
        preset_id?: string;
        scene_config?: {
          sceneTheme?: string;
          sceneDescription?: string;
          sceneProps?: string;
          lighting?: string;
          mood?: string;
        };
      };
      layout?: string;
      copy?: {
        headline?: string;
        subheadline?: string;
        body?: string;
        bulletPoints?: string[];
      };
      notes?: string;
      prompt?: string;
      card_config?: {
        visualFocus?: string;
        compositionHint?: string;
        copyTone?: string;
        negativeHints?: string;
        sellingPointText?: string;
        headlineFocus?: string;
        heroStyle?: string;
        campaignAngle?: string;
        promotionTone?: string;
        copyBlockDensity?: string;
        backgroundStyle?: string;
        displayAngle?: string;
      };
    }>;
    model_image_path?: string;
    model_info?: string;
  }) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/generate_product_gallery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const fallback = `商品套图生成失败: ${response.status} ${response.statusText || ''}`.trim();
      throw await parseApiError(response, fallback);
    }

    return await response.json();
  },

  optimizeProductGalleryItem: async (payload: {
    image_paths: string[];
    product_name?: string;
    product_category?: string;
    core_selling_points?: string[];
    target_scene?: string;
    style?: string;
    target_language?: string;
    hot_style?: { name: string; tones: string[]; description: string };
    output_item: {
      id?: string;
      enabled?: boolean;
      output_type?: string;
      aspect_ratio?: string;
      resolution?: '1k' | '2k' | '4k';
      count?: number;
      title?: string;
      model_card_id?: string;
      scene_card_id?: string;
      model_binding?: {
        id?: string;
        name?: string;
        image_path?: string;
        model_info?: string;
      };
      scene_binding?: {
        id?: string;
        name?: string;
        source_mode?: 'preset' | 'custom';
        preset_id?: string;
        scene_config?: {
          sceneTheme?: string;
          sceneDescription?: string;
          sceneProps?: string;
          lighting?: string;
          mood?: string;
        };
      };
      layout?: string;
      copy?: {
        headline?: string;
        subheadline?: string;
        body?: string;
        bulletPoints?: string[];
      };
      notes?: string;
      prompt?: string;
      card_config?: {
        visualFocus?: string;
        compositionHint?: string;
        copyTone?: string;
        negativeHints?: string;
        sellingPointText?: string;
        headlineFocus?: string;
        heroStyle?: string;
        campaignAngle?: string;
        promotionTone?: string;
        copyBlockDensity?: string;
        backgroundStyle?: string;
        displayAngle?: string;
      };
    };
  }) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/gallery/optimize-item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const fallback = `套图单卡优化失败: ${response.status} ${response.statusText || ''}`.trim();
      throw await parseApiError(response, fallback);
    }

    return await response.json();
  },

  generateGalleryBoardCopy: async (payload: {
    product_name?: string;
    target_language?: string;
    core_selling_points?: string[];
    board_items: Array<{
      image_layer_id?: string;
      image_path?: string;
      current_text_layer_id?: string;
      current_text?: string;
      index?: number;
      rect?: {
        id?: string;
        x?: number;
        y?: number;
        w?: number;
        h?: number;
      };
    }>;
  }) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/gallery/board-copy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const fallback = `套图文案生成失败: ${response.status} ${response.statusText || ''}`.trim();
      throw await parseApiError(response, fallback);
    }

    return await response.json();
  },

  generateProductGalleryPlan: async (payload: {
    prompt?: string;
    image_paths?: string[];
    product_name?: string;
    product_category?: string;
    core_selling_points?: string[];
    target_scene?: string;
    scene_config?: {
      sceneTheme?: string;
      sceneDescription?: string;
      sceneProps?: string;
      lighting?: string;
      mood?: string;
    };
    style?: string;
    target_language?: string;
    model_image_path?: string;
    model_info?: string;
  }) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/generate_product_gallery_plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const fallback = `商品套图方案生成失败: ${response.status} ${response.statusText || ''}`.trim();
      throw await parseApiError(response, fallback);
    }

    return await response.json();
  },

  getProductGalleryResult: async (requestId: string) => {
    const id = String(requestId || '').trim();
    if (!id) throw new Error('requestId is required');

    const response = await fetch(`${API_BASE_URL}/generate_product_gallery_result?request_id=${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const fallback = `查询商品套图状态失败: ${response.status} ${response.statusText || ''}`.trim();
      throw await parseApiError(response, fallback);
    }

    return await response.json();
  },

  hotStyleAnalysis: async (payload: {
    image_paths: string[];
    product_name?: string;
    product_category?: string;
    selling_points: string[];
    output_language?: 'zh' | 'en';
  }) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/hot_style_analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const fallback = `Hot style analysis failed: ${response.status} ${response.statusText || ''}`.trim();
      throw await parseApiError(response, fallback);
    }

    return await response.json();
  },

  textSeparation: async (payload?: { sample_id?: string; sample_title?: string; image_path?: string }): Promise<TextSeparationResponse> => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/text-separation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload || {}),
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Text separation request failed');
    }

    const json = (await response.json()) as ApiEnvelope<TextSeparationResponse>;
    if (json?.code !== undefined && json.code !== 0) {
      throw new Error((json?.message || 'Text separation request failed') as string);
    }

    const data = json?.data;
    if (!data?.clean_image_url || !data?.original_image_url || !Array.isArray(data?.text_blocks)) {
      throw new Error('Invalid text separation response');
    }

    return data;
  },

  textSeparationSecondaryCreate: async (payload: TextSeparationSecondaryCreatePayload): Promise<TextSeparationSecondaryTask> => {
    const csrftoken = getCookie('csrftoken');
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/text-separation-secondary-create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrftoken || '',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch';
      throw new Error(`Secondary creation request failed: ${message}. This is usually a network error or the request body is too large.`);
    }

    if (!response.ok) {
      throw await parseApiError(response, 'Secondary creation request failed');
    }

    const json = (await response.json()) as ApiEnvelope<TextSeparationSecondaryTask>;
    if (json?.code !== undefined && json.code !== 0) {
      throw new Error((json?.message || 'Secondary creation request failed') as string);
    }

    const data = json?.data;
    if (!data?.request_id) {
      throw new Error('Invalid secondary creation response');
    }

    return data;
  },

  textSeparationSecondaryResult: async (requestId: string): Promise<TextSeparationSecondaryResult> => {
    const query = new URLSearchParams({ request_id: requestId });
    const response = await fetch(`${API_BASE_URL}/text-separation-secondary-result?${query.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Secondary creation result request failed');
    }

    const json = (await response.json()) as ApiEnvelope<TextSeparationSecondaryResult>;
    if (json?.code !== undefined && json.code !== 0) {
      throw new Error((json?.message || 'Secondary creation result request failed') as string);
    }

    const data = json?.data;
    if (!data?.request_id) {
      throw new Error('Invalid secondary creation result');
    }
    return data;
  },

  textSeparationSecondaryHistory: async (): Promise<TextSeparationSecondaryHistoryItem[]> => {
    const response = await fetch(`${API_BASE_URL}/text-separation-secondary-history`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Secondary creation history request failed');
    }

    const json = (await response.json()) as ApiEnvelope<{ items?: TextSeparationSecondaryHistoryItem[] }>;
    if (json?.code !== undefined && json.code !== 0) {
      throw new Error((json?.message || 'Secondary creation history request failed') as string);
    }

    return Array.isArray(json?.data?.items) ? json.data.items : [];
  },

  // 0. Create Project (non-template)
  createProject: async (userId: string | number, payload: unknown) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/users/${userId}/project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await parseApiError(response, '创建项目失败');
    }

    return await response.json();
  },

  // 0. Clone Project (for reuse batch generation)
  cloneProject: async (projectId: string) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/${projectId}/clone/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw await parseApiError(response, '克隆项目失败');
    }

    return await response.json();
  },

  // Canvas: concatenate multiple completed VideoNode outputs via backend ffmpeg.
  // Synchronous round-trip; returns final video_url + duration. Backend rejects
  // (400 FORMAT_MISMATCH) when inputs differ in resolution/aspect — frontend
  // is expected to surface the error with the offending indices.
  concatVideos: async (videoUrls: string[]): Promise<{
    video_url: string;
    duration: number;
    width: number;
    height: number;
    input_count: number;
  }> => {
    const resp = await apiRequest<{ code: number; data: { video_url: string; duration: number; width: number; height: number; input_count: number } }>(
      `${API_BASE_URL}/concat-videos/`,
      {
        method: 'POST',
        body: { video_urls: videoUrls },
        fallbackMessage: 'Failed to concatenate videos',
      },
    );
    return resp.data;
  },

  // 1. Generate Video
  generate: async (payload: unknown) => {
    const csrftoken = getCookie('csrftoken');

    // FIX: Added trailing slash '/' at the end
    // WAS: `${API_BASE_URL}/generate_video`
    // NOW: `${API_BASE_URL}/generate_video/`
    const response = await fetch(`${API_BASE_URL}/generate_video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const fallback = `Server Error: ${response.status} ${response.statusText || 'Video generation failed'}`;
      throw await parseApiError(response, fallback);
    }

    return await response.json();
  },

  previewGenerate: async (payload: unknown): Promise<ApiEnvelope<GeneratePreviewData>> => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/generate_video/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Preview generation request failed');
    }

    return await response.json();
  },

  previewSeedSkill: async (payload: unknown): Promise<ApiEnvelope<{ seed_skill: Record<string, unknown> }>> => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/seed-skill/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await parseApiError(response, '创意卡预览失败');
    }

    return await response.json();
  },

  rollSeedSkill: async (
    payload: Pick<SeedSkillWorkflowPayload, 'video_type' | 'language' | 'aspect_ratio' | 'duration'>,
  ): Promise<ApiEnvelope<{ skill: SeedSkillPreview }>> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/seed-skill/skills/roll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await parseApiError(response, 'skill 生成失败');
    }

    return await response.json();
  },

  refineSeedancePrompt: async (
    payload: SeedSkillPromptRefinePayload,
  ): Promise<ApiEnvelope<SeedSkillPromptRefineResponse>> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/seed-skill/prompt-refine`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Prompt 精修失败');
    }

    return await response.json();
  },

  createSeedSkillWorkflow: async (payload: SeedSkillWorkflowPayload): Promise<ApiEnvelope<SeedSkillWorkflowResponse>> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/seed-skill/workflows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await parseApiError(response, '创意工作流创建失败');
    }

    return await response.json();
  },

  createSeedSkillExampleWorkflow: async (payload?: Partial<SeedSkillWorkflowPayload>): Promise<ApiEnvelope<SeedSkillWorkflowResponse>> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/seed-skill/workflows/example`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload || {}),
    });

    if (!response.ok) {
      throw await parseApiError(response, '示例创意工作流创建失败');
    }

    return await response.json();
  },

  finalizeSeedSkillWorkflow: async (
    workflowId: string,
    payload: { edited_script: string; aspect_ratio?: string; duration?: number; language?: string },
  ): Promise<ApiEnvelope<SeedSkillWorkflowResponse>> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/seed-skill/workflows/${workflowId}/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await parseApiError(response, '创意工作流确认失败');
    }

    return await response.json();
  },

  submitSeedSkillWorkflowVideo: async (
    workflowId: string,
    payload?: { final_prompt?: string },
  ): Promise<ApiEnvelope<SeedSkillWorkflowResponse>> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/seed-skill/workflows/${workflowId}/seedance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload || {}),
    });

    if (!response.ok) {
      throw await parseApiError(response, '创意视频生成提交失败');
    }

    return await response.json();
  },

  pollSeedSkillWorkflowVideo: async (workflowId: string): Promise<ApiEnvelope<SeedSkillWorkflowResponse>> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/seed-skill/workflows/${workflowId}/poll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw await parseApiError(response, '创意视频状态读取失败');
    }

    return await response.json();
  },

  getSeedSkillHistory: async (): Promise<ApiEnvelope<{ items: SeedSkillWorkflow[] }>> => {
    const response = await fetch(`${API_BASE_URL}/seed-skill/history`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw await parseApiError(response, '创意工作流历史读取失败');
    }

    return await response.json();
  },

  // 2. Generate Script
  generateScript: async (userId: string | number, payload: unknown) => {
    const csrftoken = getCookie('csrftoken');

    const body = JSON.stringify(payload);
    if (!body) {
      throw new Error('Script generation payload is empty');
    }

    const response = await fetch(`${API_BASE_URL}/users/${userId}/generate-script`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body,
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Script generation failed');
    }

    return await response.json();
  },

  // 2.1 Generate Script (stream-compatible wrapper)
  generateScriptStream: async (
    userId: string | number,
    payload: unknown,
    callbacks: ScriptStreamCallbacks = {},
    options?: { signal?: AbortSignal },
  ) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/users/${userId}/generate-script-stream`, {
      method: 'POST',
      headers: {
        'Accept': 'text/event-stream, application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Script generation failed');
    }

    const contentType = response.headers.get('content-type') || '';
    const isSse = contentType.includes('text/event-stream');

    if (!isSse) {
      const json = (await response.json()) as ApiEnvelope<{ script_contents?: unknown[] }>;
      if (json?.code !== undefined && json.code !== 0) {
        throw new Error(String(json?.message || 'Script generation failed'));
      }

      const scriptContents = Array.isArray((json?.data as Record<string, unknown> | undefined)?.script_contents)
        ? ((json?.data as Record<string, unknown>).script_contents as unknown[])
        : [];

      callbacks.onStart?.({ data: { total: scriptContents.length, completed: 0 } });
      for (let i = 0; i < scriptContents.length; i++) {
        await callbacks.onVariant?.({
          data: {
            index: i + 1,
            total: scriptContents.length,
            completed: i + 1,
            script_content: scriptContents[i],
          },
        });
      }
      callbacks.onDone?.({ data: { completed: scriptContents.length, total: scriptContents.length } });
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    const dispatchPayload = async (event: string, data: string) => {
      let payload: any = {};
      if (data) {
        try {
          payload = JSON.parse(data);
        } catch (e) {
          payload = { message: data };
        }
      }

      switch (event) {
        case 'start':
        case 'onStart':
          await callbacks.onStart?.(payload as ScriptStreamEnvelope);
          break;
        case 'variant':
        case 'message':
        case 'update':
          await callbacks.onVariant?.(payload as ScriptStreamEnvelope);
          break;
        case 'done':
        case 'complete':
          await callbacks.onDone?.(payload as ScriptStreamEnvelope);
          break;
        case 'error':
          await callbacks.onErrorEvent?.(payload as ScriptStreamEnvelope);
          break;
        default:
          await callbacks.onVariant?.(payload as ScriptStreamEnvelope);
      }
    };

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = findSseBoundary(buffer);
      while (boundary) {
        const rawEvent = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.separatorLength);
        const parsedChunk = parseSseChunk(rawEvent);
        if (parsedChunk) {
          await dispatchPayload(parsedChunk.event, parsedChunk.data);
        }
        boundary = findSseBoundary(buffer);
      }

      if (done) {
        const trailing = buffer.trim();
        if (trailing) {
          const parsedChunk = parseSseChunk(trailing);
          if (parsedChunk) {
            await dispatchPayload(parsedChunk.event, parsedChunk.data);
          }
        }
        break;
      }
    }
  },

  // 补生成分镜：跳过 Stage 1，复用已有整片方案只跑 Stage 2。
  // 场景：用户之前关着分镜结构生成了脚本，后来打开开关想看分镜。
  generateShots: async (
    userId: string | number,
    payload: unknown,
    options?: { signal?: AbortSignal },
  ) => apiRequest<any>(`${API_BASE_URL}/users/${userId}/generate-shots`, {
    method: 'POST',
    body: payload as any,
    fallbackMessage: 'Shots generation failed',
    fetchOptions: options?.signal ? { signal: options.signal } : undefined,
  }),

  reverseScriptFromVideo: async (
    userId: string | number,
    payload: {
      video_url?: string;
      video_path?: string;
      user_language?: string;
      product_name?: string;
      product_category?: string;
      product_focus?: string;
      core_selling_points?: string;
      target_audience?: string;
      debug_trace_id?: string;
      debug?: boolean;
    } | FormData,
  ): Promise<ApiEnvelope<ReplayReverseScriptData>> => {
    return apiRequest<ApiEnvelope<ReplayReverseScriptData>>(
      `${API_BASE_URL}/users/${userId}/replay-reverse-script`,
      {
        method: 'POST',
        body: payload,
        fallbackMessage: 'Replay analysis failed',
      }
    );
  },

  // 台词翻译（直接翻译 / 创意翻译）
  translateAudioText: async (userId: string | number, payload: {
    text: string;
    target_language: string;
    mode: 'direct' | 'creative';
    visual_description?: string;
    product_category?: string;
    product_selling_points?: string;
  }) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/users/${userId}/translate-audio`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await parseApiError(response, '翻译请求失败');
    }

    return await response.json();
  },

  recognizeProductInfo: async (payload: {
    image_paths: string[];
    output_language?: string;
    mode?: 'product' | 'subject';
    existing_info?: {
      product_name?: string;
      product_category?: string;
      core_selling_points?: string;
      target_audience?: string;
    };
  }) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/recognize-product/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const fallback = `商品识别失败: ${response.status} ${response.statusText || ''}`.trim();
      throw await parseApiError(response, fallback);
    }

    return await response.json();
  },

  recognizeSubjectInfo: async (payload: { image_paths: string[]; output_language?: string }) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/recognize-subject/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const fallback = `主体描述识别失败: ${response.status} ${response.statusText || ''}`.trim();
      throw await parseApiError(response, fallback);
    }

    return await response.json();
  },

  generateOptimizedImage: async (payload: {
    prompt: string;
    aspect_ratio: '9:16' | '16:9' | '1:1';
    resolution: 'sd' | 'hd' | 'uhd';
    style_strength: number;
    generate_count: number;
    product_category?: string;
    keyword_tags?: string[];
    reference_image_url?: string;
    reference_image_path?: string;
    output_language?: string;
  }) => {
    const csrftoken = getCookie('csrftoken');
    const endpoint = `${API_BASE_URL}/generate_optimized_image`;

    debugApiLog('request generate_optimized_image', {
      endpoint,
      method: 'POST',
      payload,
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const responseClone = response.clone();

    let debugResponseBody: unknown = null;
    try {
      debugResponseBody = await responseClone.json();
    } catch {
      debugResponseBody = { nonJson: true };
    }
    debugApiLog('response generate_optimized_image', {
      endpoint,
      status: response.status,
      ok: response.ok,
      body: debugResponseBody,
    });

    if (!response.ok) {
      const fallback = `Image optimization failed: ${response.status} ${response.statusText || ''}`.trim();
      throw await parseApiError(response, fallback);
    }

    return await response.json();
  },

  generateOptimizedPromptScript: async (payload: {
    raw_prompt?: string;
    reference_name?: string;
    product_name?: string;
    product_category?: string;
    core_selling_points?: string;
    keyword_tags?: string[];
    output_language?: string;
    sound?: 'on' | 'off';
  }) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/generate_prompt_script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload || {}),
    });

    if (!response.ok) {
      const fallback = `Prompt script generation failed: ${response.status} ${response.statusText || ''}`.trim();
      throw await parseApiError(response, fallback);
    }

    return await response.json();
  },

  // 3. Workbench Draft (cross-refresh/cross-device state)
  getDraft: async () => {
    const response = await fetch(`${API_BASE_URL}/draft/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    // Allow "no draft" / unauthenticated without throwing
    if (!response.ok) return null;

    return await response.json();
  },

  saveDraft: async (snapshot: unknown) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/draft/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ snapshot }),
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Failed to save draft');
    }

    return await response.json();
  },

  clearDraft: async (options?: { keepalive?: boolean }) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/draft/`, {
      method: 'DELETE',
      headers: {
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      keepalive: options?.keepalive === true,
    });

    if (!response.ok && response.status !== 401 && response.status !== 403) {
      throw await parseApiError(response, 'Failed to clear draft');
    }

    if (!response.ok) return null;
    return await response.json();
  },

  // 4. History list
  getHistory: async (params?: HistoryQueryParams): Promise<HistoryListResponse> => {
    return traceApiRequest({
      metricName: 'history_list',
      apiPath: '/api/projects/history/',
      method: 'GET',
      fn: async () => {
        const query = new URLSearchParams();
        if (params?.status && params.status !== 'ALL') {
          query.set('status', params.status);
        }
        if (params?.keyword && params.keyword.trim()) {
          query.set('keyword', params.keyword.trim());
        }
        if (params?.sort) {
          query.set('sort', params.sort);
        }
        if (params?.page && params.page > 0) {
          query.set('page', String(Math.floor(params.page)));
        }
        if (params?.page_size && params.page_size > 0) {
          query.set('page_size', String(Math.floor(params.page_size)));
        }

        const queryString = query.toString();
        const url = `${API_BASE_URL}/history/${queryString ? `?${queryString}` : ''}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'include',
        });

        if (!response.ok) {
          throw await parseApiError(response, 'Request failed');
        }

        // If session is invalid, Django may redirect to /accounts/login (HTML).
        if (response.redirected) throw new Error('Unauthorized');
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) throw new Error('Unexpected response');

        const json = (await response.json()) as ApiEnvelope<HistoryProject[] | { items?: HistoryProject[]; pagination?: HistoryPagination }>;
        if (json?.code !== undefined && json.code !== 0) {
          throw new Error((json?.message || 'Failed to fetch history') as string);
        }
        return parseHistoryListResponse(json?.data);
      }
    });
  },



  // 5. Delete project (physical delete)
  deleteProject: async (projectId: string): Promise<boolean> => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/${projectId}/`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Request failed');
    }

    if (response.redirected) throw new Error('Unauthorized');
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return true;

    const json = (await response.json()) as ApiEnvelope<unknown>;
    if (json?.code !== undefined && json.code !== 0) {
      throw new Error((json?.message || 'Failed to delete project') as string);
    }

    return true;
  },

  // 6. Bulk delete projects
  deleteProjects: async (projectIds: string[]): Promise<{ deleted_count: number; missing_ids: string[] }> => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/bulk-delete/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ project_ids: projectIds }),
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Request failed');
    }

    if (response.redirected) throw new Error('Unauthorized');
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { deleted_count: 0, missing_ids: [] };
    }

    const json = (await response.json()) as ApiEnvelope<{ deleted_count?: number; missing_ids?: string[] }>;
    if (json?.code !== undefined && json.code !== 0) {
      throw new Error((json?.message || 'Failed to bulk delete projects') as string);
    }

    const data = json?.data || {};
    return {
      deleted_count: Number(data.deleted_count || 0),
      missing_ids: Array.isArray(data.missing_ids) ? data.missing_ids : [],
    };
  },

  // 7. Toggle favorite status for a project
  toggleFavorite: async (projectId: string): Promise<{ is_favorited: boolean }> => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/${projectId}/favorite/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Request failed');
    }

    if (response.redirected) throw new Error('Unauthorized');
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { is_favorited: false };
    }

    const json = (await response.json()) as ApiEnvelope<{ is_favorited?: boolean }>;
    if (json?.code !== undefined && json.code !== 0) {
      throw new Error((json?.message || 'Failed to toggle favorite') as string);
    }

    const data = json?.data || {};
    return {
      is_favorited: Boolean(data.is_favorited),
    };
  },

  // 8. Get favorites list
  getFavorites: async (params?: HistoryQueryParams): Promise<HistoryListResponse> => {
    return traceApiRequest({
      metricName: 'favorite_list',
      apiPath: '/api/projects/favorites/',
      method: 'GET',
      fn: async () => {
        const query = new URLSearchParams();
        if (params?.status && params.status !== 'ALL') {
          query.set('status', params.status);
        }
        if (params?.keyword && params.keyword.trim()) {
          query.set('keyword', params.keyword.trim());
        }
        if (params?.sort) {
          query.set('sort', params.sort);
        }
        if (params?.page && params.page > 0) {
          query.set('page', String(Math.floor(params.page)));
        }
        if (params?.page_size && params.page_size > 0) {
          query.set('page_size', String(Math.floor(params.page_size)));
        }

        const queryString = query.toString();
        const url = `${API_BASE_URL}/favorites/${queryString ? `?${queryString}` : ''}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'include',
        });

        if (!response.ok) {
          throw await parseApiError(response, 'Request failed');
        }

        if (response.redirected) throw new Error('Unauthorized');
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) throw new Error('Unexpected response');

        const json = (await response.json()) as ApiEnvelope<HistoryProject[] | { items?: HistoryProject[]; pagination?: HistoryPagination }>;
        if (json?.code !== undefined && json.code !== 0) {
          throw new Error((json?.message || 'Failed to fetch favorites') as string);
        }
        return parseHistoryListResponse(json?.data);
      }
    });
  },

  // 9. Get history detail (heavy fields loaded on demand)
  getHistoryDetail: async (projectId: string): Promise<HistoryDetailResponse> => {
    return traceApiRequest({
      metricName: 'history_detail',
      apiPath: `/api/projects/${projectId}/history-detail/`,
      method: 'GET',
      fn: async () => {
        const response = await fetch(`${API_BASE_URL}/${projectId}/history-detail/`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'include',
        });

        if (!response.ok) {
          throw await parseApiError(response, 'Request failed');
        }

        if (response.redirected) throw new Error('Unauthorized');
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) throw new Error('Unexpected response');

        const json = (await response.json()) as ApiEnvelope<HistoryDetailResponse>;
        if (json?.code !== undefined && json.code !== 0) {
          throw new Error((json?.message || 'Failed to fetch history detail') as string);
        }

        const data = asRecord(json?.data);
        return {
          id: String(data?.id || projectId),
          request_payload: asRecord(data?.request_payload),
          model_request: asRecord(data?.model_request),
          script_content: asRecord(data?.script_content),
        };
      },
    });
  },
};
