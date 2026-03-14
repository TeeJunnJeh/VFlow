import { createClient } from '@supabase/supabase-js';

// --- Supabase 配置 ---
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'your-local-supabase-url';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'your-supabase-anon-key';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Use the proxy path configured in vite.config.ts for API calls
const API_BASE_URL = '/api/assets';

// Optional: override the base URL used for `/media/...` in production.
// In development, keep it empty so Vite's `/media` proxy works.
const MEDIA_BASE_URL = (import.meta as any).env?.VITE_MEDIA_BASE_URL || '';

function toDisplayUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return '';
  const raw = String(pathOrUrl).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;

  // Normalize relative paths like "media/..." -> "/media/..." so Vite proxy works.
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;

  // If a base URL is configured (prod), prepend it for media paths.
  if (MEDIA_BASE_URL && normalized.startsWith('/media/')) {
    return `${MEDIA_BASE_URL}${normalized}`;
  }
  return normalized;
}

// Frontend Interface
export interface Asset {
  id: string;
  name: string;
  type: 'model' | 'product' | 'scene' | 'motion';
  file_url: string;
  thumbnail?: string;
  media_kind?: 'image' | 'video' | 'audio' | 'file';
  size: string;
  status: 'ready' | 'processing' | 'failed';
  created_at: string;
  folder_id?: string | null;
}

// Backend Interface (Internal use)
interface BackendAsset {
  id: number;
  display_name: string;
  type: string;
  type_display: string;
  url: string;
  folder_id?: number | null;
  meta_data: {
    width: number;
    height: number;
    size_bytes: number;
    format: string;
  };
  created_at: string;
}

export interface AssetFolder {
  id: string;
  name: string;
  parent_id: string | null;
  asset_type: 'model' | 'product' | 'scene' | 'motion';
  created_at?: string;
}

// --- Helper: Read CSRF Token from Browser Cookies ---
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

async function readApiError(response: Response): Promise<string> {
  try {
    const json = await response.json();
    return (json?.error || json?.message || 'Request failed') as string;
  } catch {
    return response.statusText || 'Request failed';
  }
}

export const assetsApi = {
  // 1. GET List
  getAssets: async (params?: { type?: 'model' | 'product' | 'scene' | 'motion'; folderId?: string | null }): Promise<Asset[]> => {
    try {
      const search = new URLSearchParams();
      if (params?.type) search.set('type', params.type.toUpperCase());
      if (params && 'folderId' in params) {
        search.set('folder_id', params.folderId ?? '');
      }
      const query = search.toString();
      const response = await fetch(`${API_BASE_URL}/list/${query ? `?${query}` : ''}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
      });

      if (response.status === 401 || response.status === 403) {
        console.error("Auth Failed: Cookies invalid or expired");
        throw new Error('Unauthorized');
      }

      if (!response.ok) throw new Error('Failed to fetch assets');

      const json = await response.json();
      // Be robust across backend variants (some deployments wrap in `data`, some may return `assets`).
      const backendData: BackendAsset[] = (json.data || json.assets || json.results || []) as BackendAsset[];

      // Map Backend Data -> Frontend Data
      return backendData.map(item => {
        // Some backends may return `url`, `file_url`, or `path` for the file location.
        // Prefer explicit `file_url` (backend-hosted path). Some backends may also
        // expose `url` pointing to external storage (e.g. Supabase). Prefer the
        // backend-served `file_url` when available to avoid using unreachable
        // external hosts in development.
        const rawUrl =
          (item as any).file_url ||
          (item as any).fileUrl ||
          (item as any).url ||
          (item as any).path ||
          '';

        const fullUrl = toDisplayUrl(rawUrl);

        // Determine media kind so UI chooses <video> vs <img>
        const lowerType = String(item.type || '').toLowerCase();
        const rawPathLower = String(rawUrl).split('?')[0].toLowerCase();
        let mediaKind: Asset['media_kind'] = 'file';
        if (lowerType === 'motion' || /\.(mp4|mov|mkv|webm|avi)$/.test(rawPathLower)) mediaKind = 'video';
        else if (/\.(jpg|jpeg|png|webp|gif)$/.test(rawPathLower)) mediaKind = 'image';
        else if (/\.(mp3|wav|flac)$/.test(rawPathLower)) mediaKind = 'audio';

        return {
          id: item.id.toString(),
          name: item.display_name,
          type: item.type.toLowerCase() as 'model' | 'product' | 'scene' | 'motion',
          file_url: fullUrl,
          media_kind: mediaKind,
          size: (item.meta_data.size_bytes / 1024 / 1024).toFixed(2) + ' MB',
          status: 'ready',
          created_at: item.created_at,
          folder_id: item.folder_id?.toString() ?? null
        };
      });

    } catch (error) {
      console.error("Fetch Assets Error:", error);
      throw error;
    }
  },

  // 2. CREATE (Upload) - 双重上传逻辑
  uploadAsset: async (file: File, type: string, folderId?: string | null) => {
    // --- 动作 1：可选地静默上传到 Supabase Storage ---
    // const ENABLE_SUPABASE = String((import.meta as any).env?.VITE_ENABLE_SUPABASE || '').toLowerCase();
    // const useSupabase = ENABLE_SUPABASE === '1' || ENABLE_SUPABASE === 'true' || ENABLE_SUPABASE === 'yes';
    const useSupabase = false; // 暂时关闭 Supabase 上传功能，等后端改好再打开

    if (useSupabase) {
      try {
        console.log('🚀 [Supabase] 开始上传到存储桶...');
        const fileExt = file.name.split('.').pop();
        const fileName = `${type.toLowerCase()}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('vFlowuploads') // 你的存储桶名称
            .upload(fileName, file);

        if (uploadError) {
          console.error('❌ [Supabase] 上传失败:', uploadError.message);
        } else {
          const { data: publicUrlData } = supabase.storage.from('vFlowuploads').getPublicUrl(fileName);
          console.log('✅ [Supabase] 上传成功！公开链接是:', publicUrlData.publicUrl);
          // 注意：因为后端不改，这里拿到的 publicUrl 只是在前端打印验证，不会存入数据库
        }
      } catch (err) {
        console.error('⚠️ [Supabase] 流程出错:', err);
      }
    } else {
      console.log('ℹ️ Supabase upload disabled by VITE_ENABLE_SUPABASE flag');
    }

    // --- 动作 2：发送真实文件给 Django 后端 ---
    console.log('🚀 [Django] 开始发送物理文件给后端...');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type.toUpperCase());
    formData.append('display_name', file.name);
    if (folderId !== undefined) formData.append('folder_id', folderId ?? '');

    const csrftoken = getCookie('csrftoken');

    try {
      const response = await fetch(`${API_BASE_URL}/list/`, {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrftoken || '',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');
      const json = await response.json();

      // Normalize common backend shapes so callers can reliably use `resp.data`.
      // Backend currently returns: { assets: [{ id, name, url }], ... }
      // Some other deployments may return: { data: { ... } }
      const data = (json?.data || (Array.isArray(json?.assets) ? json.assets[0] : null) || json?.asset || null) as any;
      return data ? { ...json, data } : json;
    } catch (error) {
      console.error("Upload Error:", error);
      throw error;
    }
  },

  // 2.1 TEMP UPLOAD (non-library): upload file and return media path without creating DigitalAsset records.
  uploadTempAsset: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/temp-upload/`, {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) throw new Error(await readApiError(response));
    return await response.json();
  },

  // 3. DELETE
  deleteAsset: async (assetId: string) => {
    const csrftoken = getCookie('csrftoken');

    try {
      const response = await fetch(`${API_BASE_URL}/${assetId}/`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrftoken || '',
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
  },

  // 4. RENAME (Asset)
  renameAsset: async (assetId: string, displayName: string) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/${assetId}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ display_name: displayName }),
    });

    if (!response.ok) throw new Error(await readApiError(response));
    return await response.json();
  },

  // 5. FOLDERS
  getFolders: async (params: { type: 'model' | 'product' | 'scene' | 'motion'; parentId: string | null }) => {
    const search = new URLSearchParams();
    search.set('type', params.type.toUpperCase());
    search.set('parent_id', params.parentId ?? '');
    const response = await fetch(`${API_BASE_URL}/folders/?${search.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) throw new Error(await readApiError(response));
    const json = await response.json();
    const data = (json.data || []) as Array<{ id: number; name: string; parent_id: number | null; asset_type: string; created_at?: string }>;
    const breadcrumb = (json.breadcrumb || []) as Array<{ id: number; name: string; parent_id: number | null; asset_type: string }>;

    return {
      folders: data.map(item => ({
        id: item.id.toString(),
        name: item.name,
        parent_id: item.parent_id ? item.parent_id.toString() : null,
        asset_type: item.asset_type.toLowerCase() as 'model' | 'product' | 'scene' | 'motion',
        created_at: item.created_at
      })),
      breadcrumb: breadcrumb.map(item => ({
        id: item.id.toString(),
        name: item.name,
        parent_id: item.parent_id ? item.parent_id.toString() : null,
        asset_type: item.asset_type.toLowerCase() as 'model' | 'product' | 'scene' | 'motion'
      }))
    };
  },

  getAllFolders: async (type: 'model' | 'product' | 'scene' | 'motion') => {
    const search = new URLSearchParams();
    search.set('type', type.toUpperCase());
    search.set('all', '1');
    const response = await fetch(`${API_BASE_URL}/folders/?${search.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) throw new Error(await readApiError(response));
    const json = await response.json();
    const data = (json.data || []) as Array<{ id: number; name: string; parent_id: number | null; asset_type: string; created_at?: string }>;

    return data.map(item => ({
      id: item.id.toString(),
      name: item.name,
      parent_id: item.parent_id ? item.parent_id.toString() : null,
      asset_type: item.asset_type.toLowerCase() as 'model' | 'product' | 'scene' | 'motion',
      created_at: item.created_at
    })) as AssetFolder[];
  },

  createFolder: async (name: string, type: 'model' | 'product' | 'scene' | 'motion', parentId: string | null) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/folders/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({
        name,
        asset_type: type.toUpperCase(),
        parent_id: parentId
      })
    });

    if (!response.ok) throw new Error(await readApiError(response));
    return await response.json();
  },

  renameFolder: async (folderId: string, name: string) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/folders/${folderId}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ name })
    });

    if (!response.ok) throw new Error(await readApiError(response));
    return await response.json();
  },

  deleteFolder: async (folderId: string) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/folders/${folderId}/`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) throw new Error(await readApiError(response));
    return true;
  },

  moveAsset: async (assetId: string, folderId: string | null) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/${assetId}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ folder_id: folderId }),
    });

    if (!response.ok) throw new Error(await readApiError(response));
    return await response.json();
  },

  moveFolder: async (folderId: string, parentId: string | null) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/folders/${folderId}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ parent_id: parentId }),
    });

    if (!response.ok) throw new Error(await readApiError(response));
    return await response.json();
  },
};