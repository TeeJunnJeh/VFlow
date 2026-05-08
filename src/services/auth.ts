// src/services/auth.ts

import { apiRequest } from './apiClient';

// Use the proxy path configured in vite.config.ts
const API_BASE_URL = '/api/auth'; 

type OpenClawKeyStatusResponse = {
  code: number;
  message: string;
  data: {
    phone: string | null;
    enabled: boolean;
    has_key: boolean;
    masked_key: string;
    updated_at: string | null;
  };
};

type OpenClawKeyRevealResponse = {
  code: number;
  message: string;
  data: {
    key: string;
    enabled: boolean;
    updated_at: string | null;
  };
};

type DebugModeResponse = {
  message?: string;
  error?: string;
  data?: {
    enabled?: boolean;
  };
};

export type InviteSummary = {
  invite_code: string;
  invited_count: number;
  cap: number;
  reward_per_invite: number;
  invitee_reward: number;
  is_capped: boolean;
  total_reward_earned: number;
};

export type InviterPreview = {
  id: number;
  nickname: string;
  invite_code: string;
};

type InviteSummaryResponse = {
  data: InviteSummary;
};

type InviteCodeValidateResponse = {
  data: {
    valid: boolean;
    inviter: InviterPreview | null;
  };
};

type InviteApplicationResponse = {
  data: {
    application_id: string;
    status: string;
    inviter: InviterPreview | null;
  };
};


export const authApi = {
  // 1. Send Verification Code
  sendCode: async (phoneNumber: string) => {
    return apiRequest(`${API_BASE_URL}/send-code/`, {
      method: 'POST',
      body: { phone: phoneNumber },
      fallbackMessage: 'Failed to send code',
    });
  },

  // 2. Verify Code & Login
  // 裂变：可选 inviteCode，若存在会原样带给后端
  loginWithPhone: async (phoneNumber: string, code: string, inviteCode?: string) => {
    const body: Record<string, string> = { phone: phoneNumber, code };
    if (inviteCode) body.invite_code = inviteCode;
    return apiRequest(`${API_BASE_URL}/login/`, {
      method: 'POST',
      body,
      fallbackMessage: 'Invalid code or login failed',
    });
  },

  loginWithPassword: async (identifier: string, password: string) => {
    return apiRequest(`${API_BASE_URL}/password-login/`, {
      method: 'POST',
      body: { identifier, password },
      fallbackMessage: 'Login failed',
    });
  },

  registerWithPassword: async (payload: {
    identifier: string;
    password: string;
    confirmPassword?: string;
    inviteCode?: string;
  }) => {
    const body: Record<string, string> = {
      identifier: payload.identifier,
      password: payload.password,
      confirm_password: payload.confirmPassword || '',
    };
    if (payload.inviteCode) body.invite_code = payload.inviteCode;
    return apiRequest(`${API_BASE_URL}/password-register/`, {
      method: 'POST',
      body,
      fallbackMessage: 'Register failed',
    });
  },

  // NEW: Get Current User Info
  getMe: async () => {
    return apiRequest(`${API_BASE_URL}/me/`, {
      fallbackMessage: 'Session invalid or expired',
    });
  },

  changePassword: async (payload: {
    currentPassword?: string;
    newPassword: string;
    confirmPassword?: string;
  }) => {
    return apiRequest(`${API_BASE_URL}/change-password/`, {
      method: 'POST',
      body: {
        current_password: payload.currentPassword || '',
        new_password: payload.newPassword,
        confirm_password: payload.confirmPassword || '',
      },
      fallbackMessage: 'Failed to change password',
    });
  },

  // 4. Update Profile (Avatar/Name/Theme/Tier/Credits)
  updateProfile: async (data: { avatar?: File; avatarClear?: boolean; name?: string; theme?: string; tier?: string; credits?: number }) => {
    const formData = new FormData();
    if (data.avatarClear) formData.append('avatar_clear', '1');
    if (data.avatar) formData.append('avatar', data.avatar);
    if (data.name) formData.append('name', data.name);
    if (data.theme) formData.append('theme', data.theme);
    if (data.tier) formData.append('tier', data.tier);
    if (data.credits !== undefined) formData.append('credits', data.credits.toString());

    return apiRequest(`${API_BASE_URL}/update-profile/`, {
      method: 'POST',
      body: formData,
      fallbackMessage: 'Failed to update profile',
    });
  },

  getOpenClawKeyStatus: async (): Promise<OpenClawKeyStatusResponse> => {
    return apiRequest<OpenClawKeyStatusResponse>(`${API_BASE_URL}/openclaw/key/`, {
      fallbackMessage: 'Failed to load OpenClaw key status',
    });
  },

  regenerateOpenClawKey: async (): Promise<OpenClawKeyRevealResponse> => {
    return apiRequest<OpenClawKeyRevealResponse>(`${API_BASE_URL}/openclaw/key/regenerate/`, {
      method: 'POST',
      fallbackMessage: 'Failed to regenerate OpenClaw key',
    });
  },

  toggleOpenClawKey: async (enabled: boolean) => {
    return apiRequest(`${API_BASE_URL}/openclaw/key/toggle/`, {
      method: 'POST',
      body: { enabled },
      fallbackMessage: 'Failed to toggle OpenClaw key',
    });
  },

  revealOpenClawKey: async (): Promise<OpenClawKeyRevealResponse> => {
    return apiRequest<OpenClawKeyRevealResponse>(`${API_BASE_URL}/openclaw/key/reveal/`, {
      fallbackMessage: 'Failed to fetch OpenClaw key',
    });
  },

  getDebugModeStatus: async (): Promise<boolean> => {
    const json = await apiRequest<DebugModeResponse>(`${API_BASE_URL}/debug-mode/`, {
      fallbackMessage: 'Failed to load debug mode status',
    });
    return json?.data?.enabled === true;
  },

  setDebugMode: async (payload: { enabled: boolean; password?: string }): Promise<boolean> => {
    const json = await apiRequest<DebugModeResponse>(`${API_BASE_URL}/debug-mode/`, {
      method: 'POST',
      body: {
        enabled: payload.enabled,
        password: payload.password || '',
      },
      fallbackMessage: 'Failed to update debug mode',
    });
    return json?.data?.enabled === true;
  },

  // 裂变：登录后弹窗数据
  getInviteSummary: async (): Promise<InviteSummary> => {
    const json = await apiRequest<InviteSummaryResponse>(`${API_BASE_URL}/invite-summary/`, {
      fallbackMessage: 'Failed to load invite summary',
    });
    return json.data;
  },

  // 裂变：实时校验邀请码
  validateInviteCode: async (code: string): Promise<{ valid: boolean; inviter: InviterPreview | null }> => {
    const json = await apiRequest<InviteCodeValidateResponse>(
      `${API_BASE_URL}/invite-code/validate/?code=${encodeURIComponent(code)}`,
      { fallbackMessage: 'Failed to validate invite code' },
    );
    return json.data;
  },

  // 裂变：提交内测申请
  submitInviteApplication: async (payload: {
    phoneNumber: string;
    usageScenario?: string;
    usageFrequency?: string;
    inviteCode?: string;
  }): Promise<InviteApplicationResponse['data']> => {
    const json = await apiRequest<InviteApplicationResponse>(`${API_BASE_URL}/invite-application/`, {
      method: 'POST',
      body: {
        phone_number: payload.phoneNumber,
        usage_scenario: payload.usageScenario || '',
        usage_frequency: payload.usageFrequency || '',
        invite_code: payload.inviteCode || '',
      },
      fallbackMessage: 'Failed to submit application',
    });
    return json.data;
  },


  /**
   * 游客->登录瞬间，前端把 localStorage 工作台数据搬到 user-keyed 后调用一次。
   * 仅做监督性记录（OpsLog），失败静默——不影响业务流程。
   */
  reportGuestToAuthPromote: async (payload: {
    migrated: boolean;
    reason?: string;
    stats?: {
      workspaceCount?: number;
      projectCount?: number;
      uploadedFileCount?: number;
      totalScriptCount?: number;
      totalAssetQueueCount?: number;
    };
    guestSessionStartedAt?: string;
  }): Promise<void> => {
    try {
      await apiRequest(`${API_BASE_URL}/guest-to-auth-promote/`, {
        method: 'POST',
        body: {
          migrated: payload.migrated,
          reason: payload.reason || '',
          stats: payload.stats || {},
          guest_session_started_at: payload.guestSessionStartedAt || '',
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        },
        fallbackMessage: 'guest_to_auth_promote_report_failed',
      });
    } catch {
      // Best-effort logging — never block the UI on this.
    }
  },
};
