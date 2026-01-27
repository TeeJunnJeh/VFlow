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
  // GET List
  getAssets: async (): Promise<Asset[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/list/`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest', // Should stop redirects, but sometimes doesn't
        },
        credentials: 'include', 
      });

      // 1. Check if the URL changed (Browser followed a redirect)
      if (response.url.includes('/accounts/login')) {
        console.error("Authentication Failed: Redirected to Login Page.");
        throw new Error('Unauthorized'); // Force catch block
      }

      // 2. Read text first (Safety Check)
      const text = await response.text();
      
      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        // This is where we catch your specific error!
        console.error("CRITICAL: Received HTML instead of JSON. See below:");
        console.log(text.substring(0, 500)); // Print first 500 chars of HTML
        throw new Error('Server returned HTML (likely a login page or error page)');
      }

      const backendData = json.data || [];

      return backendData.map((item: any) => ({
        id: item.id.toString(),
        name: item.display_name,
        type: item.type.toLowerCase(),
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