// src/services/templates.ts

const API_BASE_URL = '/api/projects/users';

// ... (Interfaces and Mappers remain the same) ...
interface ApiTemplate {
  id: string;
  title: string;
  product_category: string;
  visual_style: string;
  aspect_ratio: string;
  script_content: {
    icon: number;
    custom: string;
    duration: number;
    shot_number: number;
  };
  created_at: string;
}

export interface Template {
  id?: string;
  name: string;
  icon: string;
  product_category: string;
  visual_style: string;
  aspect_ratio: string;
  duration: number;
  shot_number: number;
  custom_config?: string;
}

const ICON_MAP: Record<string, number> = { 'flame': 1, 'gem': 2, 'zap': 3 };
const ICON_REVERSE_MAP: Record<number, string> = { 1: 'flame', 2: 'gem', 3: 'zap' };

const mapApiToFrontend = (item: ApiTemplate): Template => ({
  id: item.id,
  name: item.title,
  icon: ICON_REVERSE_MAP[item.script_content.icon] || 'flame',
  product_category: item.product_category,
  visual_style: item.visual_style,
  aspect_ratio: item.aspect_ratio,
  duration: item.script_content.duration,
  shot_number: item.script_content.shot_number,
  custom_config: item.script_content.custom
});

const mapFrontendToApi = (tpl: Template) => ({
  title: tpl.name,
  product_category: tpl.product_category,
  visual_style: tpl.visual_style,
  aspect_ratio: tpl.aspect_ratio,
  script_content: {
    icon: ICON_MAP[tpl.icon] || 1,
    custom: tpl.custom_config || '',
    duration: tpl.duration,
    shot_number: tpl.shot_number
  }
});

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

export const templatesApi = {
  // 1. GET
  getTemplates: async (userId: string | number): Promise<Template[]> => {
    const response = await fetch(`${API_BASE_URL}/${userId}/templates`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch templates');
    const json = await response.json();
    const list = json.data || []; 
    return list.map(mapApiToFrontend);
  },

  // 2. ADD
  addTemplate: async (userId: string | number, data: Template) => {
    const csrftoken = getCookie('csrftoken');
    const payload = mapFrontendToApi(data);
    
    const response = await fetch(`${API_BASE_URL}/${userId}/template`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to create template');
    return await response.json();
  },

  // 3. UPDATE
  updateTemplate: async (userId: string | number, templateId: string, data: Template) => {
    const csrftoken = getCookie('csrftoken');
    const payload = mapFrontendToApi(data);

    const response = await fetch(`${API_BASE_URL}/${userId}/template/${templateId}/update`, {
      method: 'POST', 
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to update template');
    return await response.json();
  },

  // 4. DELETE (FIXED)
  deleteTemplate: async (userId: string | number, templateId: string) => {
    const csrftoken = getCookie('csrftoken');
    
    // FIX: REMOVED trailing slash here
    // WAS: `${API_BASE_URL}/${userId}/template/${templateId}/`
    // NOW: `${API_BASE_URL}/${userId}/template/${templateId}`
    const response = await fetch(`${API_BASE_URL}/${userId}/template/${templateId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
      },
      credentials: 'include',
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Delete failed: ${response.status} ${text}`);
    }
    return true;
  }
};