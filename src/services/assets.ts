// src/services/assets.ts

// Use the proxy path configured in vite.config.ts
const API_BASE_URL = '/api/assets';

// Frontend Interface
export interface Asset {
  id: string;
  name: string;
  type: 'model' | 'product' | 'scene'; 
  file_url: string;    
  thumbnail?: string;  
  size: string;
  status: 'ready' | 'processing' | 'failed';
  created_at: string;
}

// Backend Interface (Internal use)
interface BackendAsset {
  id: number;
  display_name: string;
  type: string;
  type_display: string;
  url: string;
  meta_data: {
    width: number;
    height: number;
    size_bytes: number;
    format: string;
  };
  created_at: string;
}

// --- Helper: Read CSRF Token from Browser Cookies ---
function getCookie(name: string) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      // Does this cookie string begin with the name we want?
      if (cookie.substring(0, name.length + 1) === (name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

export const assetsApi = {
  // 1. GET List
  getAssets: async (): Promise<Asset[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/list/`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          // CRITICAL: Tells Django "I am an API, don't give me HTML redirects"
          'X-Requested-With': 'XMLHttpRequest', 
        },
        // CRITICAL: Sends the 'sessionid' cookie
        credentials: 'include', 
      });

      // Handle Auth Errors gracefully
      if (response.status === 401 || response.status === 403) {
        console.error("Auth Failed: Cookies invalid or expired");
        throw new Error('Unauthorized');
      }

      if (!response.ok) throw new Error('Failed to fetch assets');
      
      const json = await response.json();
      const backendData: BackendAsset[] = json.data || [];

      // Map Backend Data -> Frontend Data
      return backendData.map(item => ({
        id: item.id.toString(),
        name: item.display_name,
        // Ensure lowercase types for frontend logic
        type: item.type.toLowerCase() as 'model' | 'product' | 'scene',
        file_url: item.url, 
        size: (item.meta_data.size_bytes / 1024 / 1024).toFixed(2) + ' MB',
        status: 'ready',
        created_at: item.created_at
      }));

    } catch (error) {
      console.error("Fetch Assets Error:", error);
      throw error;
    }
  },

  // 2. CREATE (Upload)
  uploadAsset: async (file: File, type: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type.toUpperCase()); 
    formData.append('display_name', file.name);

    // Get CSRF Token for Write Operations
    const csrftoken = getCookie('csrftoken');

    try {
      const response = await fetch(`${API_BASE_URL}/list/`, {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrftoken || '', // CRITICAL for Django POST
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include', // Sends cookies
        body: formData, 
      });

      if (!response.ok) throw new Error('Upload failed');
      return await response.json();
    } catch (error) {
      console.error("Upload Error:", error);
      throw error;
    }
  },

  // 3. DELETE
  deleteAsset: async (assetId: string) => {
    const csrftoken = getCookie('csrftoken');

    try {
      const response = await fetch(`${API_BASE_URL}/${assetId}/`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrftoken || '', // CRITICAL for Django DELETE
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Delete failed');
      return true;
    } catch (error) {
      console.error("Delete Error:", error);
      throw error;
    }
  }
};