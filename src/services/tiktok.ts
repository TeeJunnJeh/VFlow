import { apiRequest, getCookie } from './apiClient';
import { ApiError, parseApiError } from './errors';

const API_BASE_URL = '/api/auth/tiktok';

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
    return json?.data?.auth_url as string;
  },

  getStatus: async () => {
    return apiRequest(`${API_BASE_URL}/status/`, {
      fallbackMessage: '获取授权状态失败',
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

    if (!response.ok) {
      throw await parseApiError(response, '上传 TikTok 草稿失败');
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
