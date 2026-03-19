// src/services/video.ts

const API_BASE_URL = '/api/projects';

// Helper to get CSRF token
function getCookie(name: string) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === (name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

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

type ApiActionRequired = {
  type?: string;
  prompt?: string;
  request_flag?: string | null;
} | null;

export class VideoApiError extends Error {
  status: number;
  code?: number;
  errorType?: string;
  data?: Record<string, unknown> | null;
  actionRequired?: ApiActionRequired;

  constructor(message: string, opts: {
    status: number;
    code?: number;
    errorType?: string;
    data?: Record<string, unknown> | null;
    actionRequired?: ApiActionRequired;
  }) {
    super(message);
    this.name = 'VideoApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.errorType = opts.errorType;
    this.data = opts.data;
    this.actionRequired = opts.actionRequired;
  }
}

export type GeneratePreviewData = {
  request_payload: Record<string, unknown>;
  model_request: Record<string, unknown>;
  task_type: string;
  api_method: string;
  project_id?: string | null;
  resolved_assets?: Record<string, unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

async function readApiErrorDetail(response: Response, fallbackMessage: string): Promise<VideoApiError> {
  let message = fallbackMessage;
  let code: number | undefined;
  let errorType: string | undefined;
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
        if (typeof rec.code === 'number') code = rec.code;
        if (typeof rec.error_type === 'string' && rec.error_type.trim()) errorType = rec.error_type.trim();
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

  return new VideoApiError(message, {
    status: response.status,
    code,
    errorType,
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
      const msg = await readApiError(response);
      throw new Error(msg);
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
      let errorMsg = '创建项目失败';
      try {
        const errData = await response.json();
        errorMsg = errData.message || JSON.stringify(errData);
      } catch {
        errorMsg = `Server Error: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMsg);
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
      let errorMsg = '克隆项目失败';
      try {
        const errData = await response.json();
        errorMsg = errData.message || JSON.stringify(errData);
      } catch {
        errorMsg = `Server Error: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMsg);
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
      throw await readApiErrorDetail(response, fallback);
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
      let errorMsg = 'Preview generation request failed';
      try {
        const errData = await response.json();
        errorMsg = errData.message || JSON.stringify(errData);
      } catch {
        errorMsg = `Server Error: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMsg);
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
      let errorMsg = 'Script generation failed';
      try {
        const errData = await response.json();
        errorMsg = errData.message || JSON.stringify(errData);
      } catch {
        errorMsg = await response.text();
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  },

  translateShotAudio: async (
    userId: string | number,
    payload: {
      source_text: string;
      target_language: string;
      mode: 'direct' | 'creative';
      product_category?: string;
      visual_description?: string;
    }
  ) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/users/${userId}/translate-audio`, {
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
      let errorMsg = 'Translation failed';
      try {
        const errData = await response.json();
        errorMsg = errData.message || JSON.stringify(errData);
      } catch {
        errorMsg = await response.text();
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  },

  recognizeProductInfo: async (payload: { image_paths: string[]; output_language?: string }) => {
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
      throw await readApiErrorDetail(response, fallback);
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
      let errorMsg = 'Failed to save draft';
      try {
        const errData = await response.json();
        errorMsg = errData.message || JSON.stringify(errData);
      } catch {
        errorMsg = `Server Error: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  },

  // 4. History list
  getHistory: async (params?: HistoryQueryParams): Promise<HistoryProject[]> => {
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
      throw new Error(await readApiError(response));
    }

    // If session is invalid, Django may redirect to /accounts/login (HTML).
    if (response.redirected) throw new Error('Unauthorized');
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error('Unexpected response');

    const json = (await response.json()) as ApiEnvelope<HistoryProject[]>;
    if (json?.code !== undefined && json.code !== 0) {
      throw new Error((json?.message || 'Failed to fetch history') as string);
    }
    const data = json?.data;
    return Array.isArray(data) ? data : [];
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
      throw new Error(await readApiError(response));
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
      throw new Error(await readApiError(response));
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
};

