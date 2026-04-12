// src/services/video.ts

import { traceApiRequest } from './opsTrace';
import { apiRequest, getCookie } from './apiClient';
import { ApiError, parseApiError, type ApiActionRequired } from './errors';

const API_BASE_URL = '/api/projects';

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
}

export interface HistoryProject {
  id: string;
  title: string;
  status: HistoryProjectStatus;
  cover_url: string | null;
  video_url: string | null;
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
  suggestedCategory: string;
  suggestedSellingPoints: string;
  sampled_keyframes?: Array<{
    frame_index: number;
    timestamp_sec: number;
    timestamp: string;
  }>;
  metrics?: Record<string, unknown>;
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

export type ScriptEstimateParams = {
  script_count: number;
  duration: number;
  has_reference_assets: boolean;
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

  return {
    event,
    data: dataLines.join('\n'),
  };
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
  getPromptTemplates: async () => {
    const response = await fetch(`${API_BASE_URL}/prompt-templates/`, {
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

  generateFirstFrame: async (payload: {
    project_id: string;
    reference_image_path: string;
    aspect_ratio?: string;
    frame_type?: 'first' | 'last' | 'both';
    model?: string;
    prompt_override?: string;
    product_description_override?: string;
  }) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/generate_first_frame`, {
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
      const fallback = `首帧生成失败: ${response.status} ${response.statusText || ''}`.trim();
      throw await parseApiError(response, fallback);
    }

    return await response.json();
  },

  generateProductGallery: async (payload: {
    client_history_id?: string;
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
    type_selections?: Record<string, { enabled?: boolean; count?: number }>;
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

  // 2. Generate Script
  generateScript: async (
    userId: string | number,
    payload: unknown,
    options?: { signal?: AbortSignal }
  ) => {
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
      signal: options?.signal,
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Script generation failed');
    }

    return await response.json();
  },

  generateScriptStream: async (
    userId: string | number,
    payload: unknown,
    handlers?: ScriptStreamHandlers,
    options?: { signal?: AbortSignal }
  ) => {
    const csrftoken = getCookie('csrftoken');
    const body = JSON.stringify(payload);
    if (!body) {
      throw new Error('Script generation payload is empty');
    }

    const response = await fetch(`${API_BASE_URL}/users/${userId}/generate-script-stream`, {
      method: 'POST',
      headers: {
        'Accept': 'text/event-stream',
        'Content-Type': 'application/json; charset=utf-8',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body,
      signal: options?.signal,
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Script generation failed');
    }
    if (!response.body) {
      throw new Error('Script generation stream is unavailable');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const dispatchPayload = async (eventName: string, payloadText: string) => {
      if (!payloadText) return;
      let parsed: ScriptStreamEnvelope;
      try {
        parsed = JSON.parse(payloadText) as ScriptStreamEnvelope;
      } catch {
        return;
      }
      if (eventName === 'start') await handlers?.onStart?.(parsed);
      else if (eventName === 'variant') await handlers?.onVariant?.(parsed);
      else if (eventName === 'done') await handlers?.onDone?.(parsed);
      else if (eventName === 'cancelled') await handlers?.onCancelled?.(parsed);
      else if (eventName === 'error') await handlers?.onErrorEvent?.(parsed);
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

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

  reverseScriptFromVideo: async (
    userId: string | number,
    payload: { video_url?: string; user_language?: string } | FormData,
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

  recognizeProductInfo: async (payload: { image_paths: string[]; output_language?: string; mode?: 'product' | 'subject' }) => {
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

    const response = await fetch(`${API_BASE_URL}/generate_optimized_image`, {
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
  getHistory: async (params?: HistoryQueryParams): Promise<HistoryProject[]> => {
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

        const json = (await response.json()) as ApiEnvelope<{ items?: HistoryProject[] }>;
        if (json?.code !== undefined && json.code !== 0) {
          throw new Error((json?.message || 'Failed to fetch history') as string);
        }
        const items = (json?.data as { items?: unknown } | undefined)?.items;
        return Array.isArray(items) ? (items as HistoryProject[]) : [];
      }
    });
  },

  // 4.1 History detail (lazy-load heavy fields: request_payload, model_request)
  getHistoryDetail: async (projectId: string): Promise<{
    id: string;
    request_payload: Record<string, unknown> | null;
    model_request: Record<string, unknown> | null;
  }> => {
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
          throw await parseApiError(response, 'Failed to fetch project detail');
        }

        const json = (await response.json()) as ApiEnvelope<{
          id: string;
          request_payload: Record<string, unknown> | null;
          model_request: Record<string, unknown> | null;
        }>;

        if (json?.code !== undefined && json.code !== 0) {
          throw new Error((json?.message || 'Failed to fetch project detail') as string);
        }

        return {
          id: String(json?.data?.id ?? projectId),
          request_payload: json?.data?.request_payload ?? null,
          model_request: json?.data?.model_request ?? null,
        };
      },
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
  getFavorites: async (params?: HistoryQueryParams): Promise<HistoryProject[]> => {
    return traceApiRequest({
      metricName: 'favorite_list',
      apiPath: '/api/projects/favorites/',
      method: 'GET',
      fn: async () => {
        const query = new URLSearchParams();
        if (params?.keyword && params.keyword.trim()) {
          query.set('keyword', params.keyword.trim());
        }
        if (params?.sort) {
          query.set('sort', params.sort);
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

        const json = (await response.json()) as ApiEnvelope<{ items?: HistoryProject[] }>;
        if (json?.code !== undefined && json.code !== 0) {
          throw new Error((json?.message || 'Failed to fetch favorites') as string);
        }
        const items = (json?.data as { items?: unknown } | undefined)?.items;
        return Array.isArray(items) ? (items as HistoryProject[]) : [];
      }
    });
  },
};
