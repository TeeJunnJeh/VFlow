// src/services/video.ts

const API_BASE_URL = '/api/projects';

// Helper to get CSRF token from cookies (Django requirement)
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

export const videoApi = {
  // 1. Generate Video (The missing function)
  generate: async (payload: any) => {
    const csrftoken = getCookie('csrftoken');
    
    const response = await fetch(`${API_BASE_URL}/generate_video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest', // Important for some backends
      },
      credentials: 'include', // Important for session cookies
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // Try to parse error message from backend
      let errorMsg = 'Video generation failed';
      try {
        const errData = await response.json();
        errorMsg = errData.message || JSON.stringify(errData);
      } catch (e) {
        errorMsg = await response.text(); 
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  },

  // 2. Generate Script (The new function)
  generateScript: async (userId: string | number, payload: any) => {
    const csrftoken = getCookie('csrftoken');
    
    // Note: ensure no trailing slash if your backend dislikes it
    const response = await fetch(`${API_BASE_URL}/users/${userId}/generate-script`, { 
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
        let errorMsg = 'Script generation failed';
        try {
            const errData = await response.json();
            errorMsg = errData.message || JSON.stringify(errData);
        } catch (e) {
            errorMsg = await response.text();
        }
        throw new Error(errorMsg);
    }
    
    return await response.json();
  }
};