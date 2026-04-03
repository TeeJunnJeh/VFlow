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

export type GenerateFirstFramePayload = {
  project_id?: string;
  reference_image_path: string;
  aspect_ratio?: string;
  frame_type?: 'first' | 'last' | 'both';
  model?: string;
  prompt_override?: string;
  product_description_override?: string;
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

async function readApiErrorDetail(response: Response, fallbackMessage: string): Promise<ApiError> {
  let message = fallbackMessage;
  let errorCode: string | undefined;
  let trackingId: string | undefined;
  let data: Record<string, unknown> | null = null;
  let actionRequired: ApiActionRequired = null;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const json: unknown = await response.json();
      const rec = asRecord(json);
      if (rec) {
        const msg = rec.message ?? rec.error;
        if (typeof msg === 'string' && msg.trim()) message = msg.trim();
          if (typeof rec.error_code === 'string' && rec.error_code.trim()) errorCode = rec.error_code.trim();
          if (!errorCode && typeof rec.error_type === 'string' && rec.error_type.trim()) errorCode = rec.error_type.trim();
        if (typeof rec.tracking_id === 'string' && rec.tracking_id.trim()) trackingId = rec.tracking_id.trim();
        data = asRecord(rec.data);
        const action = data ? asRecord(data.action_required) : null;
        actionRequired = action as ApiActionRequired;
      }
    } catch {
      // fall back to plain text below
    }
  }

  if (message === fallbackMessage) {
    try {
      const text = await response.text();
      const compact = text.replace(/\s+/g, ' ').trim();
      if (compact) message = compact.slice(0, 300);
    } catch {
      // ignore
    }
  }

  return new ApiError(message, {
    status: response.status,
    errorCode,
    trackingId,
    data,
    actionRequired,
  });
}

async function readApiError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const json: unknown = await response.json();
      const rec = asRecord(json);
      const msg = rec ? (rec.message ?? rec.error) : null;
      if (typeof msg === 'string' && msg.trim()) return msg;
      return 'Request failed';
    } catch (err) {
      void err;
    }
  }

  try {
    const text = await response.text();
    const compact = text.replace(/\s+/g, ' ').trim();
    return compact ? compact.slice(0, 200) : 'Request failed';
  } catch (err) {
    void err;
  }

  return response.statusText || 'Request failed';
}

export const videoApi = {
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
      const fallback = `首尾帧图生成失败: ${response.status} ${response.statusText || ''}`.trim();
      throw await parseApiError(response, fallback);
    }

    return await response.json();
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
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx = buffer.indexOf('\n\n');
      while (idx !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        let eventName = 'message';
        const dataLines: string[] = [];
        for (const line of rawEvent.split('\n')) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim() || 'message';
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }

        let parsedData: Record<string, unknown> = {};
        const joined = dataLines.join('\n');
        if (joined) {
          try {
            parsedData = JSON.parse(joined) as Record<string, unknown>;
          } catch {
            parsedData = { raw: joined };
          }
        }

        const event: ScriptStreamEvent = {
          message: typeof parsedData.message === 'string' ? parsedData.message : undefined,
          data: (parsedData.data as Record<string, unknown>) || parsedData,
        };

        if (eventName === 'start') callbacks.onStart?.(event);
        else if (eventName === 'variant') await callbacks.onVariant?.(event);
        else if (eventName === 'done') callbacks.onDone?.(event);
        else if (eventName === 'error') callbacks.onErrorEvent?.(event);
      }
    }
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

    const response = await fetch(`${API_BASE_URL}/generate-image/`, {
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
        };
      },
    });
  },
};

