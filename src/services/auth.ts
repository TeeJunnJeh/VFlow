// src/services/auth.ts

// Use the proxy path configured in vite.config.ts
const API_BASE_URL = '/api/auth'; 

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
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send code');
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
        const errorData = await response.json();
        throw new Error(errorData.message || 'Invalid code or login failed');
      }
      return await response.json(); 
    } catch (error) {
      throw error;
    }
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
};