const API_BASE_URL = '/api/auth/tiktok';

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

    const response = await fetch(`${API_BASE_URL}/callback/?${queryString}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    console.log('[tiktokApi.completeAuth] Response status:', response.status);

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('[tiktokApi.completeAuth] Error response:', err);
        throw new Error(err.message || 'TikTok 授权失败');
    }
    const result = await response.json();
    console.log('[tiktokApi.completeAuth] Success:', result);
    return result;
  },

  getAuthUrl: async (projectId?: string) => {
    const url = projectId ? `${API_BASE_URL}/authorize/?project_id=${encodeURIComponent(projectId)}` : `${API_BASE_URL}/authorize/`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || '获取 TikTok 授权链接失败');
    }

    const json = await response.json();
    return json?.data?.auth_url as string;
  },

  getStatus: async () => {
    const response = await fetch(`${API_BASE_URL}/status/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || '获取授权状态失败');
    }

    return await response.json();
  },

  publishDraft: async (projectId: string) => {
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
      throw new Error(json?.message || '上传 TikTok 草稿失败');
    }

    return {
      requiresAuth: false,
      publishId: json?.data?.publish_id as string | undefined,
      message: json?.message as string | undefined,
    };
  },

  revokeAuth: async () => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/revoke/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.message || '取消授权失败');
    }

    return await response.json();
  },
};
