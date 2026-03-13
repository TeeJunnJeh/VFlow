// src/services/auth.ts

// Use the proxy path configured in vite.config.ts
const API_BASE_URL = '/api/auth'; 

const extractErrorMessage = async (response: Response, fallback: string) => {
  try {
    const errorData = await response.json();
    return errorData?.message || errorData?.error || fallback;
  } catch (e) {
    return fallback;
  }
};

export const authApi = {
  // 1. Send Verification Code
  sendCode: async (phoneNumber: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/send-code/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber }), 
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response, 'Failed to send code'));
      }
      return await response.json();
    } catch (error) {
      throw error;
    }
  },

  // 2. Verify Code & Login
  loginWithPhone: async (phoneNumber: string, code: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // CRITICAL: This tells the browser to SAVE the cookie the server sends back
        credentials: 'include', 
        body: JSON.stringify({ 
          phone: phoneNumber,
          code: code 
        }),
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response, 'Invalid code or login failed'));
      }
      return await response.json(); 
    } catch (error) {
      throw error;
    }
  },

  loginWithPassword: async (identifier: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/password-login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identifier, password }),
    });

    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, 'Login failed'));
    }
    return await response.json();
  },

  registerWithPassword: async (payload: {
    identifier: string;
    password: string;
    confirmPassword?: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/password-register/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        identifier: payload.identifier,
        password: payload.password,
        confirm_password: payload.confirmPassword || '',
      }),
    });

    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, 'Register failed'));
    }
    return await response.json();
  },

  // NEW: Get Current User Info
  getMe: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/me/`, {
        method: 'GET',
        headers: { 
            'Content-Type': 'application/json',
            // Add AJAX header for better compatibility with Django
            'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
      });
      
      // If 401 Unauthorized or 403 Forbidden, session is invalid
      if (!response.ok) {
          throw new Error('Session invalid or expired');
      }
      
      return await response.json(); // Expected: { is_logged_in: true, data: { ... } }
    } catch (error) {
      throw error;
    }
  },

  changePassword: async (payload: {
    currentPassword?: string;
    newPassword: string;
    confirmPassword?: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/change-password/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'include',
      body: JSON.stringify({
        current_password: payload.currentPassword || '',
        new_password: payload.newPassword,
        confirm_password: payload.confirmPassword || '',
      }),
    });

    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, 'Failed to change password'));
    }
    return await response.json();
  },

  // 4. Update Profile (Avatar/Name/Theme/Tier/Credits)
  updateProfile: async (data: { avatar?: File; name?: string; theme?: string; tier?: string; credits?: number }) => {
    try {
      const formData = new FormData();
      if (data.avatar) formData.append('avatar', data.avatar);
      if (data.name) formData.append('name', data.name);
      if (data.theme) formData.append('theme', data.theme);
      if (data.tier) formData.append('tier', data.tier);
      if (data.credits !== undefined) formData.append('credits', data.credits.toString());

      const response = await fetch(`${API_BASE_URL}/update-profile/`, {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  },
};
