import { getCookie } from './apiClient';
import { parseApiError } from './errors';

const API_BASE_URL = '/api/community';
const MEDIA_BASE_URL = (import.meta as any).env?.VITE_MEDIA_BASE_URL || '';

export type CommunityPostType = 'material_share' | 'experience';
export type CommunityReactionAction = 'like' | 'favorite';
export type CommunityInteractionTab = 'followers' | 'following' | 'likes';
export type CommunityMediaKind = 'video' | 'image' | 'audio';
export type CommunityMaterialType = 'model' | 'product' | 'scene' | 'motion' | 'audio' | 'script' | 'skill';

export interface CommunityAuthor {
  id: string;
  name: string;
  avatar_url?: string;
  post_count?: number;
  works_count?: number;
  follower_count?: number;
  fans_count?: number;
  following_count?: number;
  like_count?: number;
  is_following?: boolean;
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

export interface CommunitySharedSkill {
  seed?: string | number;
  name?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  recipe?: Record<string, unknown>;
  [key: string]: unknown;
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
  shared_skill?: CommunitySharedSkill | null;
  like_count: number;
  favorite_count: number;
  collect_count: number;
  comment_count: number;
  view_count?: number;
  is_liked: boolean;
  is_favorited: boolean;
  is_collected: boolean;
  created_at: string;
  edited_at?: string;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  parent_id?: string | null;
  content: string;
  author: CommunityAuthor;
  reply_to_user?: CommunityAuthor | null;
  reply_count: number;
  like_count: number;
  is_liked: boolean;
  can_delete?: boolean;
  heat_score: number;
  created_at: string;
  replies: CommunityComment[];
}

export interface CommunityCommentListResponse {
  items: CommunityComment[];
  total: number;
}

export interface CommunityCommentDraft {
  content: string;
  parentId?: string | null;
}

export interface CommunityListParams {
  type?: CommunityPostType | 'all';
  feed?: 'recommended' | 'following';
  ordering?: 'hot' | 'latest';
  q?: string;
  authorId?: string;
  cursor?: string;
  limit?: number;
}

export interface CommunityListResponse {
  items: CommunityPost[];
  nextCursor: string | null;
  total?: number;
}

export interface CommunityAuthorListResponse {
  items: CommunityAuthor[];
  nextCursor: string | null;
  total?: number;
}

export interface CommunityInteractionItem {
  id: string;
  author: CommunityAuthor;
  post?: {
    id: string;
    title: string;
    cover_url?: string;
    preview?: {
      kind: CommunityMediaKind;
      url: string;
      thumbnail_url?: string;
    };
  };
  created_at?: string;
}

export interface CommunityInteractionListResponse {
  items: CommunityInteractionItem[];
  nextCursor: string | null;
  total?: number;
}

export interface CommunityMediaRef {
  kind: CommunityMediaKind;
  url: string;
  name?: string;
  thumbnail_url?: string;
  source_asset_id?: string;
  source_project_id?: string;
}

export interface CommunityCreateDraft {
  title: string;
  body: string;
  // 空字符串或省略 = 由后端按“是否分享 skill”自动决定帖子类型
  postType?: CommunityPostType | '';
  // 帖子展示媒体：仅来自素材库/生成历史的引用（不再本地上传）
  media?: CommunityMediaRef[];
  // 可被他人收集的素材（素材库 DigitalAsset id）
  materialAssetIds?: string[];
  // 同时分享的创作 skill（seed_skill）
  sharedSkill?: CommunitySharedSkill | null;
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

const toAvatarDisplayUrl = (pathOrUrl: string | null | undefined): string => {
  if (!pathOrUrl) return '';
  const raw = String(pathOrUrl).trim();
  if (!raw || raw === 'null' || raw === 'undefined') return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  if (!raw.startsWith('/') && !raw.includes('/') && !raw.includes('.')) return '';
  return toDisplayUrl(raw);
};

const normalizePostType = (value: unknown): CommunityPostType => (
  value === 'experience' ? 'experience' : 'material_share'
);

const normalizeMediaKind = (value: unknown): CommunityMediaKind => {
  if (value === 'video' || value === 'audio') return value;
  return 'image';
};

const normalizeCommunityAuthor = (item: any): CommunityAuthor => ({
  id: String(item?.id || item?.author_id || ''),
  name: String(item?.name || item?.author_name || ''),
  avatar_url: toAvatarDisplayUrl(item?.avatar_url || item?.author_avatar_url || ''),
  post_count: item?.post_count === undefined ? undefined : Number(item.post_count || 0),
  works_count: item?.works_count === undefined ? undefined : Number(item.works_count || 0),
  follower_count: item?.follower_count === undefined ? undefined : Number(item.follower_count || 0),
  fans_count: item?.fans_count === undefined ? undefined : Number(item.fans_count || 0),
  following_count: item?.following_count === undefined ? undefined : Number(item.following_count || 0),
  like_count: item?.like_count === undefined ? undefined : Number(item.like_count || 0),
  is_following: Boolean(item?.is_following),
});

export const normalizeCommunityPost = (item: any): CommunityPost => ({
  id: String(item.id || ''),
  title: String(item.title || ''),
  body: String(item.body || item.content || ''),
  post_type: normalizePostType(item.post_type || item.type),
  author: normalizeCommunityAuthor(item.author || item),
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
  shared_skill: (item.shared_skill && typeof item.shared_skill === 'object') ? (item.shared_skill as CommunitySharedSkill) : null,
  like_count: Number(item.like_count || 0),
  favorite_count: Number(item.favorite_count || item.star_count || 0),
  collect_count: Number(item.collect_count || 0),
  comment_count: Number(item.comment_count || 0),
  view_count: Number(item.view_count || 0),
  is_liked: Boolean(item.is_liked),
  is_favorited: Boolean(item.is_favorited || item.is_starred),
  is_collected: Boolean(item.is_collected || item.has_collected || item.already_collected),
  created_at: String(item.created_at || ''),
  edited_at: String(item.edited_at || ''),
});

export const normalizeCommunityComment = (item: any): CommunityComment => ({
  id: String(item.id || ''),
  post_id: String(item.post_id || item.postId || ''),
  parent_id: item.parent_id || item.parentId ? String(item.parent_id || item.parentId) : null,
  content: String(item.content || item.body || ''),
  author: normalizeCommunityAuthor(item.author || item),
  reply_to_user: item.reply_to_user ? normalizeCommunityAuthor(item.reply_to_user) : null,
  reply_count: Number(item.reply_count || 0),
  like_count: Number(item.like_count || 0),
  is_liked: Boolean(item.is_liked),
  can_delete: Boolean(item.can_delete),
  heat_score: Number(item.heat_score || item.hot_score || 0),
  created_at: String(item.created_at || ''),
  replies: ((item.replies || []) as any[]).map(normalizeCommunityComment),
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
    if (params?.feed) search.set('feed', params.feed);
    if (params?.ordering) search.set('ordering', params.ordering);
    if (params?.q) search.set('q', params.q);
    if (params?.authorId) search.set('author_id', params.authorId);
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
    const payload: Record<string, unknown> = {
      title: draft.title || '',
      body: draft.body || '',
      media: (draft.media || []).map((m) => ({
        kind: m.kind,
        url: m.url,
        name: m.name || '',
        thumbnail_url: m.thumbnail_url || '',
        source_asset_id: m.source_asset_id,
        source_project_id: m.source_project_id,
      })),
      material_asset_ids: draft.materialAssetIds || [],
    };
    if (draft.postType) payload.post_type = draft.postType;
    if (draft.sharedSkill && typeof draft.sharedSkill === 'object') payload.shared_skill = draft.sharedSkill;

    const response = await fetch(`${API_BASE_URL}/posts/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) await throwCommunityApiError(response, 'Request failed');
    const data = unwrapData(await response.json());
    return normalizeCommunityPost(data.post || data.item || data);
  },

  updatePost: async (postId: string, draft: CommunityCreateDraft): Promise<CommunityPost> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/posts/${postId}/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ title: draft.title, body: draft.body, post_type: draft.postType }),
    });
    if (!response.ok) await throwCommunityApiError(response, 'Update failed');
    const data = unwrapData(await response.json());
    return normalizeCommunityPost(data.post || data.item || data);
  },

  deletePost: async (postId: string): Promise<void> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/posts/${postId}/`, {
      method: 'DELETE',
      headers: { 'X-CSRFToken': csrftoken || '', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    });
    if (!response.ok) await throwCommunityApiError(response, 'Delete failed');
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

  listComments: async (postId: string): Promise<CommunityCommentListResponse> => {
    const response = await fetch(`${API_BASE_URL}/posts/${postId}/comments/`, {
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
      items: ((data.items || data.results || []) as any[]).map(normalizeCommunityComment),
      total: Number(data.total || 0),
    };
  },

  createComment: async (postId: string, draft: CommunityCommentDraft) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/posts/${postId}/comments/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({
        content: draft.content || '',
        parent_id: draft.parentId || null,
      }),
    });

    if (!response.ok) await throwCommunityApiError(response, 'Request failed');
    const data = unwrapData(await response.json());
    return {
      comment: normalizeCommunityComment(data.comment || data.item || data),
      total: Number(data.total || 0),
    };
  },

  deleteComment: async (postId: string, commentId: string) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/posts/${postId}/comments/${commentId}/`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) await throwCommunityApiError(response, 'Request failed');
    const data = unwrapData(await response.json());
    return {
      commentId: String(data.comment_id || commentId),
      total: Number(data.total || 0),
    };
  },

  setCommentReaction: async (postId: string, commentId: string, action: 'like', value: boolean) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/posts/${postId}/comments/${commentId}/reaction/`, {
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

  listAuthorInteractions: async (authorId: string, tab: CommunityInteractionTab, cursor?: string, limit = 60): Promise<CommunityInteractionListResponse> => {
    const search = new URLSearchParams();
    search.set('tab', tab);
    if (cursor) search.set('cursor', cursor);
    if (limit) search.set('limit', String(limit));
    const response = await fetch(`${API_BASE_URL}/authors/${authorId}/interactions/?${search.toString()}`, {
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
      items: ((data.items || data.results || []) as any[]).map((item) => {
        if (tab === 'likes') {
          return {
            id: String(item?.id || ''),
            author: normalizeCommunityAuthor(item?.author || {}),
            post: item?.post ? {
              id: String(item.post.id || ''),
              title: String(item.post.title || ''),
              cover_url: toDisplayUrl(item.post.cover_url || ''),
              preview: item.post.preview ? {
                kind: normalizeMediaKind(item.post.preview.kind),
                url: toDisplayUrl(item.post.preview.url || ''),
                thumbnail_url: toDisplayUrl(item.post.preview.thumbnail_url || ''),
              } : undefined,
            } : undefined,
            created_at: String(item?.created_at || ''),
          };
        }
        const author = normalizeCommunityAuthor(item);
        return { id: author.id, author };
      }),
      nextCursor: data.next_cursor || data.nextCursor || null,
      total: Number(data.total || 0),
    };
  },
  setAuthorFollow: async (authorId: string, value: boolean): Promise<CommunityAuthor> => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(`${API_BASE_URL}/authors/${authorId}/follow/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({ value }),
    });

    if (!response.ok) await throwCommunityApiError(response, 'Request failed');
    const data = unwrapData(await response.json());
    return normalizeCommunityAuthor(data.author || data.item || data);
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
