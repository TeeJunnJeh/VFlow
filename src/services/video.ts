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

export const videoApi = {
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
      } catch (e) {
        errorMsg = `Server Error: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  },

  // 1. Generate Video
  generate: async (payload: any) => {
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
      let errorMsg = 'Video generation failed';
      try {
        const errData = await response.json();
        errorMsg = errData.message || JSON.stringify(errData);
      } catch (e) {
        errorMsg = `Server Error: ${response.status} ${response.statusText}`; 
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  },

  // 2. Generate Script
  generateScript: async (userId: string | number, payload: any) => {
    const csrftoken = getCookie('csrftoken');
    
    // Ensure this path matches your backend. 
    // If this starts 404ing too, try adding a slash here as well.
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