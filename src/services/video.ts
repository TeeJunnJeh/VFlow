// src/services/video.ts
const API_BASE_URL = '/api/projects';

// Helper to get CSRF token (Same as in assets.ts)
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

export interface GenerateVideoPayload {
  prompt: string;
  negative_prompt?: string;
  project_id: string; // UUID
  duration: number;
  image_path: string; // Path on server
  sound: 'on' | 'off';
}

export const videoApi = {
  generate: async (payload: GenerateVideoPayload) => {
    const csrftoken = getCookie('csrftoken');

    // CHANGE THIS LINE: Remove the trailing slash after 'generate_video'
    // OLD: `${API_BASE_URL}/generate_video/`
    // NEW: `${API_BASE_URL}/generate_video`
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
        const errorText = await response.text();
        throw new Error(`Generation failed: ${response.status} ${errorText}`);
    }
    
    return await response.json();
  }
};