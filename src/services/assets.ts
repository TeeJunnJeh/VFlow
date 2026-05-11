import { createClient } from '@supabase/supabase-js';
import { traceApiRequest } from './opsTrace';
import { getCookie } from './apiClient';
import { parseApiError } from './errors';

// --- Supabase 配置 ---
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'your-local-supabase-url';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'your-supabase-anon-key';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Use the proxy path configured in vite.config.ts for API calls
const API_BASE_URL = '/api/assets';

// Optional: override the base URL used for `/media/...` in production.
// In development, keep it empty so Vite's `/media` proxy works.
const MEDIA_BASE_URL = (import.meta as any).env?.VITE_MEDIA_BASE_URL || '';

export type LibraryAssetType = 'model' | 'product' | 'scene' | 'motion' | 'audio' | 'script' | 'multimodal' | 'subject';
export type LibraryMediaKind = 'image' | 'video' | 'audio' | 'document' | 'file';

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
  type: LibraryAssetType;
  file_url: string;
  thumbnail?: string;
  media_kind?: LibraryMediaKind;
  size: string;
  status: 'ready' | 'processing' | 'failed';
  created_at: string;
  folder_id?: string | null;
  meta_data?: Record<string, unknown>;
  is_favorited?: boolean;
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
    width?: number;
    height?: number;
    size_bytes?: number;
    format?: string;
    [key: string]: unknown;
  };
  created_at: string;
}

export interface AssetFolder {
  id: string;
  name: string;
  parent_id: string | null;
  asset_type: LibraryAssetType;
  cover_url?: string | null;
  is_favorited?: boolean;
  created_at?: string;
  bundle_count?: number;
}

export interface PlazaAssetItem {
  id: string;
  display_name: string;
  category: 'model' | 'product' | 'scene' | 'motion' | 'audio';
  source_type: 'official' | 'user';
  keywords: string;
  description: string;
  file_url: string;
  author_name: string;
  like_count: number;
  star_count: number;
  collect_count: number;
  is_liked: boolean;
  is_starred: boolean;
  is_mine: boolean;
  can_manage: boolean;
  created_at: string;
}

export interface PlazaCollectPolicy {
  daily_free_limit: number;
  used_today: number;
  free_remaining: number;
  paid_cost_vpoints: number;
}

export const assetsApi = {
  // 1. GET List
  getAssets: async (params?: { type?: LibraryAssetType; folderId?: string | null; hasSeedanceId?: boolean }): Promise<Asset[]> => {
    try {
      return traceApiRequest({
        metricName: 'assets_list',
        apiPath: '/api/assets/list/',
        method: 'GET',
        fn: async () => {
          const search = new URLSearchParams();
          if (params?.type) search.set('type', params.type.toUpperCase());
          if (params && 'folderId' in params) {
            search.set('folder_id', params.folderId ?? '');
          }
          if (params?.hasSeedanceId) search.set('has_seedance_id', 'true');
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
            throw await parseApiError(response, 'Unauthorized');
          }

          if (!response.ok) throw await parseApiError(response, 'Failed to fetch assets');

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
            const rawThumbnail =
              (item as any).thumbnail_url ||
              (item as any).thumbnail ||
              '';

            const fullUrl = toDisplayUrl(rawUrl);
            const thumbnailUrl = rawThumbnail ? toDisplayUrl(rawThumbnail) : '';

            // Determine media kind so UI chooses <video> vs <img>
            const lowerType = String(item.type || '').toLowerCase();
            const rawPathLower = String(rawUrl).split('?')[0].toLowerCase();
            let mediaKind: Asset['media_kind'] = 'file';
            if (lowerType === 'motion' || /\.(mp4|mov|mkv|webm|avi)$/.test(rawPathLower)) mediaKind = 'video';
            else if (lowerType === 'audio' || /\.(mp3|wav|flac)$/.test(rawPathLower)) mediaKind = 'audio';
            else if (lowerType === 'script' || /\.(txt|md|json|csv)$/.test(rawPathLower)) mediaKind = 'document';
            else if (/\.(jpg|jpeg|png|webp|gif)$/.test(rawPathLower)) mediaKind = 'image';

            return {
              id: item.id.toString(),
              name: item.display_name,
              type: item.type.toLowerCase() as LibraryAssetType,
              file_url: fullUrl,
              thumbnail: thumbnailUrl || undefined,
              media_kind: mediaKind,
              size: (((item.meta_data?.size_bytes || 0) as number) / 1024 / 1024).toFixed(2) + ' MB',
              status: 'ready',
              created_at: item.created_at,
              folder_id: item.folder_id?.toString() ?? null,
              meta_data: item.meta_data || {},
              is_favorited: !!(item as any).is_favorited,
            };
          });
        },
      });

    } catch (error) {
      console.error("Fetch Assets Error:", error);
      throw error;
    }
  },

  // 2. CREATE (Upload) - 双重上传逻辑
  uploadAsset: async (file: File, type: string, folderId?: string | null, options?: { bundleOnly?: boolean }) => {
    // --- 动作 1：可选地静默上传到 Supabase Storage ---
    // const ENABLE_SUPABASE = String((import.meta as any).env?.VITE_ENABLE_SUPABASE || '').toLowerCase();
    // const useSupabase = ENABLE_SUPABASE === '1' || ENABLE_SUPABASE === 'true' || ENABLE_SUPABASE === 'yes';
    const useSupabase = false; // 暂时关闭 Supabase 上传功能，等后端改好再打开

    if (useSupabase) {
      try {
        console.log('🚀 [Supabase] 开始上传到存储桶..');
        const fileExt = file.name.split('.').pop();
        const fileName = `${type.toLowerCase()}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('vFlowuploads') // 你的存储桶名称
            .upload(fileName, file);

        if (uploadError) {
          console.error('❌ [Supabase] 上传失败:', uploadError.message);
        } else {
          const { data: publicUrlData } = supabase.storage.from('vFlowuploads').getPublicUrl(fileName);
          console.log('✅ [Supabase] 上传成功！公开链接是', publicUrlData.publicUrl);
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
    if (options?.bundleOnly) formData.append('bundle_only', '1');

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

      if (!response.ok) throw await parseApiError(response, 'Upload failed');
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

    if (!response.ok) throw await parseApiError(response, 'Request failed');
    return await response.json();
  },

  createAIModelAsset: async (payload: {
    imageUrl: string;
    modelKind: 'virtual' | 'real';
    displayName?: string;
    historyRecordId?: string;
    historyAssetId?: string | number;
  }) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/ai-model-assets/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({
        image_url: payload.imageUrl,
        model_kind: payload.modelKind,
        display_name: payload.displayName || '',
        history_record_id: payload.historyRecordId || '',
        history_asset_id: payload.historyAssetId || '',
      }),
    });

    if (!response.ok) throw await parseApiError(response, 'Failed to add model asset');
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

      if (!response.ok) throw await parseApiError(response, 'Delete failed');
      return true;
    } catch (error) {
      console.error("Delete Error:", error);
      throw error;
    }
  },

  toggleFavorite: async (assetId: string): Promise<boolean> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/${assetId}/toggle-favorite/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });
    if (!response.ok) throw await parseApiError(response, 'Toggle favorite failed');
    const data = await response.json();
    return data.is_favorited;
  },

  toggleFolderFavorite: async (folderId: string): Promise<boolean> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/folders/${folderId}/toggle-favorite/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });
    if (!response.ok) throw await parseApiError(response, 'Toggle folder favorite failed');
    const data = await response.json();
    return data.is_favorited;
  },

  setFolderCover: async (folderId: string, assetId: string | null): Promise<string | null> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/folders/${folderId}/set-cover/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ asset_id: assetId }),
    });
    if (!response.ok) throw await parseApiError(response, 'Set cover failed');
    const data = await response.json();
    return data.cover_url || null;
  },

  // 4. RENAME (Asset)
  renameAsset: async (assetId: string, displayName: string, metaDataPatch?: Record<string, unknown>) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/${assetId}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({
        display_name: displayName,
        ...(metaDataPatch ? { meta_data_patch: metaDataPatch } : {}),
      }),
    });

    if (!response.ok) throw await parseApiError(response, 'Request failed');
    return await response.json();
  },

  patchAssetMeta: async (assetId: string, metaDataPatch: Record<string, unknown>) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/${assetId}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ meta_data_patch: metaDataPatch }),
    });

    if (!response.ok) throw await parseApiError(response, 'Request failed');
    return await response.json();
  },

  // 5. FOLDERS
  getFolders: async (params: { type: LibraryAssetType; parentId: string | null }) => {
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

    if (!response.ok) throw await parseApiError(response, 'Request failed');
    const json = await response.json();
    const data = (json.data || []) as Array<{ id: number; name: string; parent_id: number | null; asset_type: string; cover_url?: string | null; created_at?: string; bundle_count?: number }>;
    const breadcrumb = (json.breadcrumb || []) as Array<{ id: number; name: string; parent_id: number | null; asset_type: string }>;

    return {
      folders: data.map(item => ({
        id: item.id.toString(),
        name: item.name,
        parent_id: item.parent_id ? item.parent_id.toString() : null,
        asset_type: item.asset_type.toLowerCase() as LibraryAssetType,
        cover_url: item.cover_url ? toDisplayUrl(item.cover_url) : null,
        created_at: item.created_at,
        bundle_count: item.bundle_count,
      })),
      breadcrumb: breadcrumb.map(item => ({
        id: item.id.toString(),
        name: item.name,
        parent_id: item.parent_id ? item.parent_id.toString() : null,
        asset_type: item.asset_type.toLowerCase() as LibraryAssetType
      }))
    };
  },

  getAllFolders: async (type: LibraryAssetType) => {
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

    if (!response.ok) throw await parseApiError(response, 'Request failed');
    const json = await response.json();
    const data = (json.data || []) as Array<{ id: number; name: string; parent_id: number | null; asset_type: string; created_at?: string }>;

    return data.map(item => ({
      id: item.id.toString(),
      name: item.name,
      parent_id: item.parent_id ? item.parent_id.toString() : null,
      asset_type: item.asset_type.toLowerCase() as LibraryAssetType,
      created_at: item.created_at
    })) as AssetFolder[];
  },

  createFolder: async (name: string, type: LibraryAssetType, parentId: string | null) => {
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

    if (!response.ok) throw await parseApiError(response, 'Request failed');
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

    if (!response.ok) throw await parseApiError(response, 'Request failed');
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

    if (!response.ok) throw await parseApiError(response, 'Request failed');
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

    if (!response.ok) throw await parseApiError(response, 'Request failed');
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

    if (!response.ok) throw await parseApiError(response, 'Request failed');
    return await response.json();
  },

  getPlazaAssets: async (params?: { category?: 'model' | 'product' | 'scene' | 'motion' | 'audio'; source?: 'all' | 'official' | 'user'; q?: string; limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.category) search.set('category', params.category);
    if (params?.source) search.set('source', params.source);
    if (params?.q) search.set('q', params.q);
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.offset) search.set('offset', String(params.offset));

    const response = await fetch(`${API_BASE_URL}/plaza/list/${search.toString() ? `?${search.toString()}` : ''}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) throw await parseApiError(response, 'Request failed');
    const json = await response.json();
    const data = json?.data || {};
    const items = (data.items || []) as Array<any>;

    return {
      items: items.map((item) => ({
        id: String(item.id),
        display_name: String(item.display_name || ''),
        category: String(item.category || 'product') as PlazaAssetItem['category'],
        source_type: String(item.source_type || 'user') as PlazaAssetItem['source_type'],
        keywords: String(item.keywords || ''),
        description: String(item.description || ''),
        file_url: toDisplayUrl(item.file_url || item.url || ''),
        author_name: String(item.author_name || ''),
        like_count: Number(item.like_count || 0),
        star_count: Number(item.star_count || 0),
        collect_count: Number(item.collect_count || 0),
        is_liked: Boolean(item.is_liked),
        is_starred: Boolean(item.is_starred),
        is_mine: Boolean(item.is_mine),
        can_manage: Boolean(item.can_manage),
        created_at: String(item.created_at || ''),
      })) as PlazaAssetItem[],
      total: Number(data.total || 0),
      collectPolicy: (data.collect_policy || {
        daily_free_limit: 3,
        used_today: 0,
        free_remaining: 3,
        paid_cost_vpoints: 1,
      }) as PlazaCollectPolicy,
      isAdmin: Boolean(data.is_admin),
    };
  },

  uploadPlazaAsset: async (payload: {
    file: File;
    category: 'model' | 'product' | 'scene' | 'motion' | 'audio';
    displayName?: string;
    keywords?: string;
    description?: string;
  }) => {
    const csrftoken = getCookie('csrftoken');
    const formData = new FormData();
    formData.append('file', payload.file);
    formData.append('category', payload.category);
    formData.append('display_name', payload.displayName || payload.file.name);
    if (payload.keywords) formData.append('keywords', payload.keywords);
    if (payload.description) formData.append('description', payload.description);

    const response = await fetch(`${API_BASE_URL}/plaza/list/`, {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) throw await parseApiError(response, 'Request failed');
    return await response.json();
  },

  getPlazaAssetDetail: async (itemId: string) => {
    const response = await fetch(`${API_BASE_URL}/plaza/${itemId}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) throw await parseApiError(response, 'Request failed');
    const json = await response.json();
    const item = json?.data || {};
    return {
      ...json,
      data: {
        id: String(item.id || itemId),
        display_name: String(item.display_name || ''),
        category: String(item.category || 'product') as PlazaAssetItem['category'],
        source_type: String(item.source_type || 'user') as PlazaAssetItem['source_type'],
        keywords: String(item.keywords || ''),
        description: String(item.description || ''),
        file_url: toDisplayUrl(item.file_url || item.url || ''),
        author_name: String(item.author_name || ''),
        like_count: Number(item.like_count || 0),
        star_count: Number(item.star_count || 0),
        collect_count: Number(item.collect_count || 0),
        is_liked: Boolean(item.is_liked),
        is_starred: Boolean(item.is_starred),
        is_mine: Boolean(item.is_mine),
        can_manage: Boolean(item.can_manage),
        created_at: String(item.created_at || ''),
      } as PlazaAssetItem,
    };
  },

  updatePlazaAsset: async (itemId: string, payload: {
    display_name?: string;
    category?: 'model' | 'product' | 'scene' | 'motion' | 'audio';
    keywords?: string;
    description?: string;
    is_active?: boolean;
  }) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/plaza/${itemId}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw await parseApiError(response, 'Request failed');
    return await response.json();
  },

  deletePlazaAsset: async (itemId: string) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/plaza/${itemId}/`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) throw await parseApiError(response, 'Request failed');
    return await response.json();
  },

  setPlazaReaction: async (itemId: string, action: 'like' | 'star', value: boolean) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/plaza/${itemId}/reaction/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ action, value }),
    });

    if (!response.ok) throw await parseApiError(response, 'Request failed');
    return await response.json();
  },

  collectPlazaAsset: async (itemId: string, folderId?: string | null) => {
    const csrftoken = getCookie('csrftoken');
    const formData = new FormData();
    if (folderId !== undefined) formData.append('folder_id', folderId ?? '');

    const response = await fetch(`${API_BASE_URL}/plaza/${itemId}/collect/`, {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) throw await parseApiError(response, 'Request failed');
    return await response.json();
  },
};

// ================================================================
// Seedance Characters (虚拟模特库)
// ================================================================

export interface SeedanceCharacter {
  id: string;
  sid: string;
  asset_id: string;
  gender: 'Male' | 'Female';
  age: number;
  country: string;
  occupation: string;
  temperament: string;
  race: string;
  ethnicity: string;
  cultural_branch: string;
  skin_tone: string;
  score: number;
  title: string;
  image_url: string;
  image_thumb_url?: string;
  image_variant_url?: string;
  similarity?: number;
  similarity_percent?: number;
  image_similarity?: number;
  text_similarity?: number | null;
  semantic_rank?: number;
}

export interface SeedanceCharacterListResponse {
  code: number;
  data: {
    count: number;
    page: number;
    page_size: number;
    results: SeedanceCharacter[];
  };
}

export interface SeedanceCharacterOptionsResponse {
  code: number;
  data: {
    countries: string[];
    temperaments: string[];
    occupations: string[];
    races: string[];
    ethnicities: string[];
    cultural_branches: string[];
    skin_tones: string[];
  };
}

export type SeedanceSearchMode = 'default' | 'fuzzy' | 'smart' | 'combined';

export interface SeedanceCharacterFilters {
  search_mode?: SeedanceSearchMode;
  gender?: 'Male' | 'Female';
  age_min?: number;
  age_max?: number;
  age_exact?: number;
  country?: string;
  temperament?: string;
  occupation?: string;
  race?: string;
  ethnicity?: string;
  cultural_branch?: string;
  skin_tone?: string;
  search_appearance?: string;
  search_scene?: string;
  search_query?: string;
  search_fuzzy?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export const seedanceApi = {
  getCharacters: async (filters?: SeedanceCharacterFilters): Promise<SeedanceCharacterListResponse> => {
    const params = new URLSearchParams();
    if (filters?.search_mode) params.set('search_mode', filters.search_mode);
    if (filters?.gender) params.set('gender', filters.gender);
    if (filters?.age_min !== undefined) params.set('age_min', String(filters.age_min));
    if (filters?.age_max !== undefined) params.set('age_max', String(filters.age_max));
    if (filters?.age_exact !== undefined) params.set('age_exact', String(filters.age_exact));
    if (filters?.country) params.set('country', filters.country);
    if (filters?.temperament) params.set('temperament', filters.temperament);
    if (filters?.occupation) params.set('occupation', filters.occupation);
    if (filters?.race) params.set('race', filters.race);
    if (filters?.ethnicity) params.set('ethnicity', filters.ethnicity);
    if (filters?.cultural_branch) params.set('cultural_branch', filters.cultural_branch);
    if (filters?.skin_tone) params.set('skin_tone', filters.skin_tone);
    if (filters?.search_appearance) params.set('search_appearance', filters.search_appearance);
    if (filters?.search_scene) params.set('search_scene', filters.search_scene);
    if (filters?.search_query) params.set('search_query', filters.search_query);
    if (filters?.search_fuzzy) params.set('search_fuzzy', filters.search_fuzzy);
    if (filters?.ordering) params.set('ordering', filters.ordering);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.page_size) params.set('page_size', String(filters.page_size));

    const url = `${API_BASE_URL}/seedance-characters/?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
    let json: SeedanceCharacterListResponse;
    try {
      json = await response.json();
    } catch {
      return { code: 0, data: { count: 0, page: 1, page_size: 20, results: [] } };
    }
    // Normalize image URLs
    if (json?.data?.results) {
      json.data.results = json.data.results.map((c: any) => ({
        ...c,
        id: String(c.id),
        image_url: toDisplayUrl(c.image_url),
        image_thumb_url: c.image_thumb_url ? toDisplayUrl(c.image_thumb_url) : '',
        image_variant_url: c.image_variant_url ? toDisplayUrl(c.image_variant_url) : '',
      }));
    }
    return json;
  },

  getOptions: async (): Promise<SeedanceCharacterOptionsResponse> => {
    const url = `${API_BASE_URL}/seedance-characters/options/`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
    try {
      return await response.json();
    } catch {
      return { code: 0, data: { countries: [], temperaments: [], occupations: [], races: [], ethnicities: [], cultural_branches: [], skin_tones: [] } };
    }
  },

  collectCharacter: async (characterId: string, folderId?: string | null): Promise<any> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/seedance-characters/collect/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ character_id: Number(characterId), folder_id: folderId ? Number(folderId) : null }),
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
    return await response.json();
  },
};


// ================================================================
// Multimodal Projects (多模态项目)
// ================================================================

export interface MultimodalProject {
  id: string;
  name: string;
  folder_id: string | null;
  model_used: string;
  aspect_ratio: string;
  duration: number | null;
  preview_url: string;
  created_at: string;
  updated_at: string;
  workspace_snapshot?: Record<string, any>;
}

export const multimodalApi = {
  list: async (folderId?: string | null): Promise<MultimodalProject[]> => {
    const params = new URLSearchParams();
    if (folderId) params.set('folder_id', folderId);
    const url = `${API_BASE_URL}/multimodal-projects/?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
    const json = await response.json();
    return (json?.data || []).map((p: any) => ({
      ...p,
      id: String(p.id),
      preview_url: toDisplayUrl(p.preview_url),
    }));
  },

  create: async (payload: {
    name: string;
    folder_id?: string | null;
    workspace_snapshot: Record<string, any>;
    model_used?: string;
    aspect_ratio?: string;
    duration?: number;
  }): Promise<any> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/multimodal-projects/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
    return await response.json();
  },

  getDetail: async (projectId: string): Promise<MultimodalProject> => {
    const response = await fetch(`${API_BASE_URL}/multimodal-projects/${projectId}/`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
    const json = await response.json();
    const p = json?.data || {};
    return { ...p, id: String(p.id), preview_url: toDisplayUrl(p.preview_url) };
  },

  update: async (projectId: string, payload: { name?: string; folder_id?: string | null }): Promise<any> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/multimodal-projects/${projectId}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
    return await response.json();
  },

  delete: async (projectId: string): Promise<any> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/multimodal-projects/${projectId}/`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
    return await response.json();
  },
};


// ============================
// Multimodal Bundle (结构体) API
// ============================

export interface BundleAssetSlot {
  id: string;
  name: string;
  file_url: string;
  thumbnail?: string;
  media_kind: 'image' | 'video' | 'audio' | 'document';
  size: string;
}

export interface MultimodalBundle {
  id: string;
  name: string;
  folder_id: string | null;
  image_assets: BundleAssetSlot[];
  video_assets: BundleAssetSlot[];
  audio_assets: BundleAssetSlot[];
  text_assets: BundleAssetSlot[];
  model_assets: BundleAssetSlot[];
  notes: string;
  created_at: string;
  updated_at: string;
}

const _mapSlotArray = (arr: any[] | null | undefined): BundleAssetSlot[] =>
  (arr || []).map((a: any) => ({
    ...a,
    id: String(a.id),
    file_url: toDisplayUrl(a.file_url),
    thumbnail: toDisplayUrl(a.thumbnail),
  }));

export const multimodalBundleApi = {
  list: async (folderId?: string | null): Promise<MultimodalBundle[]> => {
    const params = new URLSearchParams();
    if (folderId) params.set('folder_id', folderId);
    const url = `${API_BASE_URL}/multimodal-bundles/?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
    const json = await response.json();
    return (json?.data || []).map((b: any) => ({
      ...b,
      id: String(b.id),
      image_assets: _mapSlotArray(b.image_assets),
      video_assets: _mapSlotArray(b.video_assets),
      audio_assets: _mapSlotArray(b.audio_assets),
      text_assets: _mapSlotArray(b.text_assets),
      model_assets: _mapSlotArray(b.model_assets),
    }));
  },

  create: async (payload: {
    name: string;
    folder_id?: string | null;
    notes?: string;
    image_asset_ids?: string[];
    video_asset_ids?: string[];
    audio_asset_ids?: string[];
    text_asset_ids?: string[];
    model_asset_ids?: string[];
  }): Promise<MultimodalBundle> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/multimodal-bundles/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken || '', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
    const json = await response.json();
    return json.data;
  },

  update: async (bundleId: string, payload: {
    name?: string;
    folder_id?: string | null;
    notes?: string;
    image_asset_ids?: string[];
    video_asset_ids?: string[];
    audio_asset_ids?: string[];
    text_asset_ids?: string[];
    model_asset_ids?: string[];
    add_image_asset_ids?: string[];
    add_video_asset_ids?: string[];
    add_audio_asset_ids?: string[];
    add_text_asset_ids?: string[];
    add_model_asset_ids?: string[];
    remove_image_asset_id?: string;
    remove_video_asset_id?: string;
    remove_audio_asset_id?: string;
    remove_text_asset_id?: string;
    remove_model_asset_id?: string;
  }): Promise<MultimodalBundle> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/multimodal-bundles/${bundleId}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken || '', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
    const json = await response.json();
    return json.data;
  },

  delete: async (bundleId: string): Promise<void> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/multimodal-bundles/${bundleId}/`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken || '', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
  },
};


// ============================
// Subject Group (主体组) API
// ============================

export interface SubjectGroupAsset {
  id: string;
  name: string;
  file_url: string;
  thumbnail?: string;
}

export interface SubjectGroup {
  id: string;
  name: string;
  primary_asset: SubjectGroupAsset | null;
  other_assets: SubjectGroupAsset[];
  description: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

const _mapSubjectAsset = (a: any): SubjectGroupAsset | null => {
  if (!a) return null;
  return {
    id: String(a.id),
    name: a.name || '',
    file_url: toDisplayUrl(a.file_url),
    thumbnail: toDisplayUrl(a.thumbnail),
  };
};

export const subjectGroupApi = {
  list: async (): Promise<SubjectGroup[]> => {
    const url = `${API_BASE_URL}/subjects/`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
    const json = await response.json();
    return (json?.data || []).map((sg: any) => ({
      ...sg,
      id: String(sg.id),
      primary_asset: _mapSubjectAsset(sg.primary_asset),
      other_assets: (sg.other_assets || []).map((a: any) => _mapSubjectAsset(a)).filter(Boolean),
    }));
  },

  create: async (payload: {
    name: string;
    primary_asset_id?: string;
    other_asset_ids?: string[];
    description?: string;
    notes?: string;
  }): Promise<SubjectGroup> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/subjects/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken || '', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
    const json = await response.json();
    return json.data;
  },

  update: async (subjectId: string, payload: {
    name?: string;
    description?: string;
    notes?: string;
    primary_asset_id?: string;
    other_asset_ids?: string[];
    add_other_asset_ids?: string[];
    remove_other_asset_id?: string;
  }): Promise<SubjectGroup> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/subjects/${subjectId}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken || '', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
    const json = await response.json();
    return json.data;
  },

  delete: async (subjectId: string): Promise<void> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/subjects/${subjectId}/`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken || '', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    });
    if (!response.ok) throw await parseApiError(response, 'Request failed');
  },
};
