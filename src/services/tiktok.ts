import { apiRequest, getCookie } from './apiClient';
import { ApiError, parseApiError } from './errors';

const API_BASE_URL = '/api/auth/tiktok';

export type TikTokDirectPostInfo = {
  title: string;
  privacy_level: string;
  disable_duet: boolean;
  disable_comment: boolean;
  disable_stitch: boolean;
  brand_content_toggle: boolean;
  brand_organic_toggle: boolean;
  is_aigc: boolean;
};

export const tiktokApi = {
  completeAuth: async (params: { code: string; state: string; error?: string; error_description?: string }) => {
    console.log('[tiktokApi.completeAuth] Starting with params:', {
      hasCode: !!params.code,
      hasState: !!params.state,
      error: params.error
    });

    if (params.error) {
      throw new Error(params.error_description || params.error);
    }

    if (!params.code || !params.state) {
      throw new Error('Missing required OAuth parameters');
    }

    const queryString = new URLSearchParams({
        code: params.code,
        state: params.state
    }).toString();

    console.log('[tiktokApi.completeAuth] Calling callback API...');

    const result = await apiRequest(`${API_BASE_URL}/callback/?${queryString}`, {
      fallbackMessage: 'TikTok 授权失败',
    });
    console.log('[tiktokApi.completeAuth] Success:', result);
    return result;
  },

  getAuthUrl: async (projectId?: string) => {
    const url = projectId ? `${API_BASE_URL}/authorize/?project_id=${encodeURIComponent(projectId)}` : `${API_BASE_URL}/authorize/`;
    const json = await apiRequest(url, {
      fallbackMessage: '获取 TikTok 授权链接失败',
    });
    return {
      authUrl: json?.data?.auth_url as string | undefined,
      unavailable: Boolean(json?.data?.tiktok_unavailable),
      message: (json?.data?.message || json?.message) as string | undefined,
    };
  },

  getStatus: async () => {
    return apiRequest(`${API_BASE_URL}/status/`, {
      fallbackMessage: '获取授权状态失败',
    });
  },

  getCreatorInfo: async () => {
    return apiRequest(`${API_BASE_URL}/creator-info/`, {
      fallbackMessage: '获取 TikTok 发布选项失败',
    });
  },

  getAnalytics: async () => {
    return apiRequest(`${API_BASE_URL}/analytics/`, {
      fallbackMessage: '获取 TikTok 账号数据失败',
    });
  },

  refreshProjectMetrics: async (projectIds: string[]) => {
    return apiRequest(`${API_BASE_URL}/project-metrics/`, {
      method: 'POST',
      body: { project_ids: projectIds },
      fallbackMessage: '刷新 TikTok 数据失败',
    });
  },

  publishDraft: async (projectId: string) => {
    // publishDraft 需要特殊处理：code === 401 时不抛错而是返回 requiresAuth
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/publish/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ project_id: projectId }),
    });

    const json = await response.json().catch(() => ({}));

    if (json?.code === 401) {
      return {
        requiresAuth: true,
        authUrl: json?.data?.auth_url as string | undefined,
        message: json?.message as string | undefined,
      };
    }

    if (json?.data?.tiktok_unavailable) {
      return {
        requiresAuth: false,
        unavailable: true,
        message: (json?.data?.message || json?.message) as string | undefined,
      };
    }

    if (!response.ok) {
      // response body 已被上方 json() 消费，直接用解析结果构造 ApiError
      throw new ApiError(
        json?.message || '上传 TikTok 草稿失败',
        {
          status: response.status,
          errorCode: json?.error_code || json?.error_type,
          trackingId: json?.tracking_id,
          data: json?.data || null,
        },
      );
    }

    return {
      requiresAuth: false,
      publishId: json?.data?.publish_id as string | undefined,
      message: json?.message as string | undefined,
    };
  },

  publishDirect: async (projectId: string, postInfo: TikTokDirectPostInfo) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/publish-direct/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ project_id: projectId, post_info: postInfo }),
    });

    const json = await response.json().catch(() => ({}));

    if (json?.code === 401) {
      return {
        requiresAuth: true,
        authUrl: json?.data?.auth_url as string | undefined,
        message: json?.message as string | undefined,
      };
    }

    if (json?.data?.tiktok_unavailable) {
      return {
        requiresAuth: false,
        unavailable: true,
        message: (json?.data?.message || json?.message) as string | undefined,
      };
    }

    if (!response.ok) {
      throw new ApiError(
        json?.message || 'TikTok 直接发布失败',
        {
          status: response.status,
          errorCode: json?.error_code || json?.error_type,
          trackingId: json?.tracking_id,
          data: json?.data || null,
        },
      );
    }

    return {
      requiresAuth: false,
      publishId: json?.data?.publish_id as string | undefined,
      message: json?.message as string | undefined,
    };
  },

  revokeAuth: async () => {
    return apiRequest(`${API_BASE_URL}/revoke/`, {
      method: 'POST',
      fallbackMessage: '取消授权失败',
    });
  },
};
