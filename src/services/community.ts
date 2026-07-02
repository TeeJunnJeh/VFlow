import { getCookie } from './apiClient';
import { parseApiError } from './errors';

const API_BASE_URL = '/api/community';
const MEDIA_BASE_URL = (import.meta as any).env?.VITE_MEDIA_BASE_URL || '';

export type CommunityPostType = 'material_share' | 'experience';
export type CommunityReactionAction = 'like' | 'favorite';
export type CommunityMediaKind = 'video' | 'image' | 'audio';
export type CommunityMaterialType = 'model' | 'product' | 'scene' | 'motion' | 'audio' | 'script' | 'skill';

export interface CommunityAuthor {
  id: string;
  name: string;
  avatar_url?: string;
}

export interface CommunityMedia {
  id: string;
  kind: CommunityMediaKind;
  url: string;
  thumbnail_url?: string;
  duration_seconds?: number | null;
}

export interface CommunityMaterial {
  id: string;
  name: string;
  type: CommunityMaterialType;
  file_url?: string;
  preview_url?: string;
  can_collect?: boolean;
}

export interface CommunityPost {
  id: string;
  is_placeholder?: boolean;
  title: string;
  body: string;
  post_type: CommunityPostType;
  author: CommunityAuthor;
  cover_url?: string;
  media: CommunityMedia[];
  materials: CommunityMaterial[];
  like_count: number;
  favorite_count: number;
  collect_count: number;
  is_liked: boolean;
  is_favorited: boolean;
  is_collected: boolean;
  created_at: string;
}

export interface CommunityListParams {
  type?: CommunityPostType | 'all';
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface CommunityListResponse {
  items: CommunityPost[];
  nextCursor: string | null;
  total?: number;
}

export interface CommunityCreateDraft {
  title: string;
  body: string;
  postType: CommunityPostType;
  video: File;
  images?: File[];
  audio?: File | null;
  materialAssetIds?: string[];
}

const toDisplayUrl = (pathOrUrl: string | null | undefined): string => {
  if (!pathOrUrl) return '';
  const raw = String(pathOrUrl).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  if (MEDIA_BASE_URL && normalized.startsWith('/media/')) return `${MEDIA_BASE_URL}${normalized}`;
  return normalized;
};

const normalizePostType = (value: unknown): CommunityPostType => (
  value === 'experience' ? 'experience' : 'material_share'
);

const normalizeMediaKind = (value: unknown): CommunityMediaKind => {
  if (value === 'video' || value === 'audio') return value;
  return 'image';
};

export const normalizeCommunityPost = (item: any): CommunityPost => ({
  id: String(item.id || ''),
  title: String(item.title || ''),
  body: String(item.body || item.content || ''),
  post_type: normalizePostType(item.post_type || item.type),
  author: {
    id: String(item.author?.id || item.author_id || ''),
    name: String(item.author?.name || item.author_name || ''),
    avatar_url: toDisplayUrl(item.author?.avatar_url || item.author_avatar_url || ''),
  },
  cover_url: toDisplayUrl(item.cover_url || item.thumbnail_url || ''),
  media: ((item.media || []) as any[]).map((media) => ({
    id: String(media.id || ''),
    kind: normalizeMediaKind(media.kind || media.media_kind),
    url: toDisplayUrl(media.url || media.file_url || ''),
    thumbnail_url: toDisplayUrl(media.thumbnail_url || media.thumbnail || ''),
    duration_seconds: media.duration_seconds ?? null,
  })),
  materials: ((item.materials || item.assets || []) as any[]).map((material) => ({
    id: String(material.id || ''),
    name: String(material.name || material.display_name || ''),
    type: String(material.type || material.asset_type || 'product').toLowerCase() as CommunityMaterialType,
    file_url: toDisplayUrl(material.file_url || material.url || ''),
    preview_url: toDisplayUrl(material.preview_url || material.thumbnail || material.file_url || material.url || ''),
    can_collect: material.can_collect !== false,
  })),
  like_count: Number(item.like_count || 0),
  favorite_count: Number(item.favorite_count || item.star_count || 0),
  collect_count: Number(item.collect_count || 0),
  is_liked: Boolean(item.is_liked),
  is_favorited: Boolean(item.is_favorited || item.is_starred),
  is_collected: Boolean(item.is_collected || item.has_collected || item.already_collected),
  created_at: String(item.created_at || ''),
});

const unwrapData = (json: any) => json?.data || json || {};

export const COMMUNITY_API_UNAVAILABLE_MESSAGE = '当前后端分支还没有提供创作者社区接口（/api/community/*），请等后端同学合并社区后端接口后再联调。';

export const isCommunityApiUnavailableError = (err: unknown) => (
  err instanceof Error && err.message === COMMUNITY_API_UNAVAILABLE_MESSAGE
);

const throwCommunityApiError = async (response: Response, fallbackMessage: string): Promise<never> => {
  const contentType = response.headers.get('content-type') || '';
  if ((response.status === 404 || response.status === 405) && !contentType.includes('application/json')) {
    throw new Error(COMMUNITY_API_UNAVAILABLE_MESSAGE);
  }
  throw await parseApiError(response, fallbackMessage);
};

export const communityApi = {
  listPosts: async (params?: CommunityListParams): Promise<CommunityListResponse> => {
    const search = new URLSearchParams();
    if (params?.type && params.type !== 'all') search.set('type', params.type);
    if (params?.q) search.set('q', params.q);
    if (params?.cursor) search.set('cursor', params.cursor);
    if (params?.limit) search.set('limit', String(params.limit));

    const response = await fetch(`${API_BASE_URL}/posts/${search.toString() ? `?${search.toString()}` : ''}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) await throwCommunityApiError(response, 'Request failed');
    const data = unwrapData(await response.json());
    return {
      items: ((data.items || data.results || []) as any[]).map(normalizeCommunityPost),
      nextCursor: data.next_cursor || data.nextCursor || null,
      total: Number(data.total || 0),
    };
  },

  createPost: async (draft: CommunityCreateDraft): Promise<CommunityPost> => {
    const csrftoken = getCookie('csrftoken');
    const formData = new FormData();
    formData.append('title', draft.title);
    formData.append('body', draft.body);
    formData.append('post_type', draft.postType);
    formData.append('video', draft.video);
    (draft.images || []).forEach((file) => formData.append('images', file));
    if (draft.audio) formData.append('audio', draft.audio);
    (draft.materialAssetIds || []).forEach((id) => formData.append('material_asset_ids', id));

    const response = await fetch(`${API_BASE_URL}/posts/`, {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) await throwCommunityApiError(response, 'Request failed');
    const data = unwrapData(await response.json());
    return normalizeCommunityPost(data.post || data.item || data);
  },

  getPostDetail: async (postId: string): Promise<CommunityPost> => {
    const response = await fetch(`${API_BASE_URL}/posts/${postId}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) await throwCommunityApiError(response, 'Request failed');
    const data = unwrapData(await response.json());
    return normalizeCommunityPost(data.post || data.item || data);
  },

  setReaction: async (postId: string, action: CommunityReactionAction, value: boolean) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/posts/${postId}/reaction/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ action, value }),
    });

    if (!response.ok) await throwCommunityApiError(response, 'Request failed');
    return await response.json();
  },

  reportPost: async (postId: string, reason: string) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/posts/${postId}/report/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ reason }),
    });

    if (!response.ok) await throwCommunityApiError(response, 'Request failed');
    return await response.json();
  },

  collectMaterial: async (postId: string, materialId: string, value = true, folderId?: string | null) => {
    const csrftoken = getCookie('csrftoken');
    const formData = new FormData();
    formData.append('value', value ? 'true' : 'false');
    if (folderId !== undefined) formData.append('folder_id', folderId ?? '');

    const response = await fetch(`${API_BASE_URL}/posts/${postId}/materials/${materialId}/collect/`, {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) await throwCommunityApiError(response, 'Request failed');
    return await response.json();
  },
};
