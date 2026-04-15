import { apiRequest } from '../services/apiClient';

export type ImageHistoryFeatureType = 'first_frame' | 'gallery' | 'text_separation' | 'smart_repair';
export type ImageHistoryStatus = 'succeeded' | 'processing' | 'failed';

export interface ImageHistoryItem {
  id: string;
  featureType: ImageHistoryFeatureType;
  createdAt: string;
  createdAtMs: number;
  status: ImageHistoryStatus;
  images: string[];
  settings?: Record<string, any>;
  metadata?: Record<string, any>;
  workspaceId?: string;
  workspaceOrder?: number;
  legacySource?: 'first_frame_v1' | 'gallery_v1' | 'text_separation_v1' | 'image_history_v2';
  version: 2;
}

interface CachedImageHistoryItem extends ImageHistoryItem {
  isFavorited: boolean;
}

interface BackendImageHistoryItem {
  id?: string;
  feature_type?: string;
  created_at?: string;
  updated_at?: string;
  status?: string;
  images?: unknown;
  settings?: unknown;
  metadata?: unknown;
  workspace_id?: string;
  workspace_order?: number | null;
  is_favorited?: boolean;
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const IMAGE_HISTORY_API_BASE = `${API_BASE}/projects/image-history`;

const IMAGE_HISTORY_KEY = 'vflow_image_history_v2';
const IMAGE_FAVORITES_KEY = 'vflow_image_history_favorites_v1';
const FIRST_FRAME_HISTORY_KEY = 'vflow_first_frame_history_v1';
const GALLERY_HISTORY_KEY = 'vflow_product_gallery_history';
const TEXT_SEPARATION_HISTORY_KEY = 'vflow_text_separation_history_v1';
const BACKEND_MIGRATION_FLAG = 'vflow_image_history_backend_migrated_v1';
export const IMAGE_HISTORY_UPDATED_EVENT = 'vflow:image-history-updated';
const MAX_IMAGE_HISTORY_ITEMS = 200;

let cachedItems: CachedImageHistoryItem[] = [];
let cacheLoaded = false;
let loadingPromise: Promise<CachedImageHistoryItem[]> | null = null;
let migrationPromise: Promise<void> | null = null;

const isBrowser = () => typeof window !== 'undefined' && !!window.localStorage;

const normalizeUrlList = (value: any): string[] => (
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : []
);

const toIsoString = (value: any): string => {
  const raw = String(value || '').trim();
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
};

const toTimestamp = (value: any, fallbackIso?: string): number => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
  const iso = String(fallbackIso || '').trim();
  const parsed = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const normalizeObject = (value: any): Record<string, any> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : undefined
);

const normalizeFeatureType = (value: any): ImageHistoryFeatureType | null => {
  const raw = String(value || '').trim();
  if (raw === 'first_frame' || raw === 'gallery' || raw === 'text_separation' || raw === 'smart_repair') {
    return raw;
  }
  return null;
};

const normalizeStatus = (value: any): ImageHistoryStatus => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'processing') return 'processing';
  if (raw === 'failed') return 'failed';
  return 'succeeded';
};

const normalizeHistoryItem = (item: any, isFavorited = false): CachedImageHistoryItem | null => {
  const id = String(item?.id || '').trim();
  const featureType = normalizeFeatureType(item?.featureType);
  const createdAt = toIsoString(item?.createdAt);
  const images = normalizeUrlList(item?.images);

  if (!id || !featureType || images.length === 0) return null;

  const workspaceId = String(item?.workspaceId || '').trim() || undefined;
  const workspaceOrderRaw = Number(item?.workspaceOrder);
  const workspaceOrder = Number.isFinite(workspaceOrderRaw) && workspaceOrderRaw > 0
    ? Math.floor(workspaceOrderRaw)
    : undefined;
  const legacySource =
    item?.legacySource === 'first_frame_v1' ||
    item?.legacySource === 'gallery_v1' ||
    item?.legacySource === 'text_separation_v1' ||
    item?.legacySource === 'image_history_v2'
      ? item.legacySource
      : undefined;

  return {
    id,
    featureType,
    createdAt,
    createdAtMs: toTimestamp(item?.createdAtMs, createdAt),
    status: normalizeStatus(item?.status),
    images,
    settings: normalizeObject(item?.settings),
    metadata: normalizeObject(item?.metadata),
    workspaceId,
    workspaceOrder,
    legacySource,
    version: 2,
    isFavorited,
  };
};

const dedupeAndSort = (items: CachedImageHistoryItem[]): CachedImageHistoryItem[] => {
  const seen = new Set<string>();
  const deduped: CachedImageHistoryItem[] = [];
  const sorted = [...items].sort((a, b) => {
    if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  for (const item of sorted) {
    const key = `${item.featureType}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= MAX_IMAGE_HISTORY_ITEMS) break;
  }
  return deduped;
};

const emitHistoryUpdated = () => {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(IMAGE_HISTORY_UPDATED_EVENT));
};

const readJsonArray = (key: string): any[] => {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readLocalFavorites = (): Set<string> => {
  if (!isBrowser()) return new Set<string>();
  try {
    const raw = window.localStorage.getItem(IMAGE_FAVORITES_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.map((item) => String(item || '').trim()).filter(Boolean));
  } catch {
    return new Set<string>();
  }
};

const readUnifiedHistoryFromStorage = (): CachedImageHistoryItem[] => {
  const favorites = readLocalFavorites();
  return dedupeAndSort(
    readJsonArray(IMAGE_HISTORY_KEY)
      .map((item) => normalizeHistoryItem(item, favorites.has(String(item?.id || '').trim())))
      .filter(Boolean) as CachedImageHistoryItem[]
  );
};

const readLegacyFirstFrameHistory = (): CachedImageHistoryItem[] => {
  const favorites = readLocalFavorites();
  return readJsonArray(FIRST_FRAME_HISTORY_KEY)
    .map((item: any) => {
      const id = String(item?.id || '').trim();
      const createdAt = toIsoString(item?.createdAt);
      const workspaceId = String(item?.workspaceId || '').trim() || undefined;
      const workspaceOrderRaw = Number(item?.workspaceOrder);
      const workspaceOrder = Number.isFinite(workspaceOrderRaw) && workspaceOrderRaw > 0
        ? Math.floor(workspaceOrderRaw)
        : undefined;
      const outputImages = Array.isArray(item?.outputImages) ? item.outputImages : [];
      const images = outputImages
        .map((img: any) => String(img?.imageUrl || img?.downloadUrl || '').trim())
        .filter(Boolean);

      if (!id || images.length === 0) return null;
      return normalizeHistoryItem({
        id,
        featureType: 'first_frame',
        createdAt,
        createdAtMs: toTimestamp(item?.createdAtMs, createdAt),
        status: 'succeeded',
        images,
        workspaceId,
        workspaceOrder,
        metadata: {
          outputImages: outputImages
            .map((img: any, index: number) => {
              const imageUrl = String(img?.imageUrl || img?.downloadUrl || '').trim();
              if (!imageUrl) return null;
              return {
                id: String(img?.id || `first-frame-history-${id}-${index}`),
                imageUrl,
                downloadUrl: String(img?.downloadUrl || imageUrl),
                format: String(img?.format || 'jpg'),
                category: img?.category,
                metadata: normalizeObject(img?.metadata),
                size: typeof img?.size === 'number' ? img.size : undefined,
              };
            })
            .filter(Boolean),
        },
        legacySource: 'first_frame_v1',
      }, favorites.has(id));
    })
    .filter(Boolean) as CachedImageHistoryItem[];
};

const readLegacyGalleryHistory = (): CachedImageHistoryItem[] => {
  const favorites = readLocalFavorites();
  return readJsonArray(GALLERY_HISTORY_KEY)
    .map((item: any) => {
      const id = String(item?.id || '').trim();
      const createdAt = toIsoString(item?.createdAt);
      const images = normalizeUrlList(item?.images);
      if (!id || images.length === 0) return null;
      return normalizeHistoryItem({
        id,
        featureType: 'gallery',
        createdAt,
        createdAtMs: toTimestamp(item?.createdAtMs, createdAt),
        status: 'succeeded',
        images,
        settings: normalizeObject(item?.settings),
        legacySource: 'gallery_v1',
      }, favorites.has(id));
    })
    .filter(Boolean) as CachedImageHistoryItem[];
};

const readLegacyTextSeparationHistory = (): CachedImageHistoryItem[] => {
  const favorites = readLocalFavorites();
  return readJsonArray(TEXT_SEPARATION_HISTORY_KEY)
    .map((item: any) => {
      const id = String(item?.id || '').trim();
      const createdAt = toIsoString(item?.createdAt);
      const backgroundImageUrl = String(item?.backgroundImageUrl || '').trim();
      if (!id || !backgroundImageUrl) return null;
      return normalizeHistoryItem({
        id,
        featureType: 'text_separation',
        createdAt,
        createdAtMs: toTimestamp(item?.createdAtMs, createdAt),
        status: 'succeeded',
        images: [backgroundImageUrl],
        metadata: {
          sampleTitle: item?.sampleTitle,
          originalImageUrl: item?.originalImageUrl,
          backgroundImageUrl,
          textBlocks: Array.isArray(item?.textBlocks) ? item.textBlocks : [],
        },
        legacySource: 'text_separation_v1',
      }, favorites.has(id));
    })
    .filter(Boolean) as CachedImageHistoryItem[];
};

const collectLocalHistoryForMigration = (): CachedImageHistoryItem[] => dedupeAndSort([
  ...readUnifiedHistoryFromStorage(),
  ...readLegacyFirstFrameHistory(),
  ...readLegacyGalleryHistory(),
  ...readLegacyTextSeparationHistory(),
]);

const toBackendItem = (item: CachedImageHistoryItem) => ({
  id: item.id,
  featureType: item.featureType,
  createdAt: item.createdAt,
  status: item.status,
  images: item.images,
  settings: item.settings || {},
  metadata: item.metadata || {},
  workspaceId: item.workspaceId || '',
  workspaceOrder: item.workspaceOrder ?? null,
  legacySource: item.legacySource,
});

const normalizeBackendItem = (item: BackendImageHistoryItem): CachedImageHistoryItem | null => {
  const id = String(item?.id || '').trim();
  const featureType = normalizeFeatureType(item?.feature_type);
  const createdAt = toIsoString(item?.created_at || item?.updated_at);
  const images = normalizeUrlList(item?.images);

  if (!id || !featureType || images.length === 0) return null;

  return {
    id,
    featureType,
    createdAt,
    createdAtMs: toTimestamp(undefined, createdAt),
    status: normalizeStatus(item?.status),
    images,
    settings: normalizeObject(item?.settings),
    metadata: normalizeObject(item?.metadata),
    workspaceId: String(item?.workspace_id || '').trim() || undefined,
    workspaceOrder: Number.isFinite(Number(item?.workspace_order)) ? Number(item?.workspace_order) : undefined,
    version: 2,
    isFavorited: Boolean(item?.is_favorited),
  };
};

const fetchHistoryList = async (params?: {
  featureType?: ImageHistoryFeatureType;
  onlyFavorites?: boolean;
}): Promise<CachedImageHistoryItem[]> => {
  const query = new URLSearchParams();
  if (params?.featureType) query.set('feature_type', params.featureType);
  if (params?.onlyFavorites) query.set('only_favorites', '1');
  const url = `${IMAGE_HISTORY_API_BASE}/${query.toString() ? `?${query.toString()}` : ''}`;
  const json = await apiRequest<any>(url);
  const items = (json?.data?.items || []).map((item: BackendImageHistoryItem) => normalizeBackendItem(item)).filter(Boolean) as CachedImageHistoryItem[];
  return dedupeAndSort(items);
};

const ensureBackendMigration = async (): Promise<void> => {
  if (!isBrowser()) return;
  if (window.localStorage.getItem(BACKEND_MIGRATION_FLAG) === '1') return;
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const items = collectLocalHistoryForMigration();
    const favoriteIds = [...readLocalFavorites()];
    if (items.length === 0 && favoriteIds.length === 0) {
      window.localStorage.setItem(BACKEND_MIGRATION_FLAG, '1');
      return;
    }

    try {
      await apiRequest(`${IMAGE_HISTORY_API_BASE}/import-local/`, {
        method: 'POST',
        body: {
          items: items.map(toBackendItem),
          favorite_ids: favoriteIds,
        },
        fallbackMessage: 'Failed to import local image history',
      });
      window.localStorage.setItem(BACKEND_MIGRATION_FLAG, '1');
    } catch {
      // Keep local data and retry on next load.
    }
  })().finally(() => {
    migrationPromise = null;
  });

  return migrationPromise;
};

const updateCache = (items: CachedImageHistoryItem[]) => {
  cachedItems = dedupeAndSort(items);
  cacheLoaded = true;
};

export const refreshImageHistory = async (): Promise<ImageHistoryItem[]> => {
  try {
    await ensureBackendMigration();
    const items = await fetchHistoryList();
    updateCache(items);
  } catch {
    // Keep current cache when backend request fails.
  }
  return cachedItems.map(({ isFavorited: _ignored, ...rest }) => rest);
};

export const ensureImageHistoryLoaded = async (): Promise<ImageHistoryItem[]> => {
  if (cacheLoaded) {
    return cachedItems.map(({ isFavorited: _ignored, ...rest }) => rest);
  }
  if (!loadingPromise) {
    loadingPromise = (async () => {
      try {
        await ensureBackendMigration();
      } catch {
        // ignore migration errors and keep trying to load server state
      }
      return fetchHistoryList();
    })()
      .then((items) => {
        updateCache(items);
        return items;
      })
      .finally(() => {
        loadingPromise = null;
      });
  }
  const items = await loadingPromise.catch(() => cachedItems);
  return items.map(({ isFavorited: _ignored, ...rest }) => rest);
};

export const readAllImageHistory = (): ImageHistoryItem[] =>
  cachedItems.map(({ isFavorited: _ignored, ...rest }) => rest);

export const readImageHistoryByFeature = (featureType: ImageHistoryFeatureType): ImageHistoryItem[] =>
  readAllImageHistory().filter((item) => item.featureType === featureType);

export const readImageHistoryFavorites = (): Set<string> =>
  new Set(cachedItems.filter((item) => item.isFavorited).map((item) => item.id));

export const toggleImageHistoryFavorite = async (id: string): Promise<Set<string>> => {
  const targetId = String(id || '').trim();
  if (!targetId) return readImageHistoryFavorites();
  const json = await apiRequest<any>(`${IMAGE_HISTORY_API_BASE}/${targetId}/favorite/`, {
    method: 'POST',
    fallbackMessage: 'Failed to toggle image history favorite',
  });
  const isFavorited = Boolean(json?.data?.is_favorited);
  cachedItems = cachedItems.map((item) => (item.id === targetId ? { ...item, isFavorited } : item));
  emitHistoryUpdated();
  return readImageHistoryFavorites();
};

export const deleteImageHistoryItem = async (id: string): Promise<ImageHistoryItem[]> => {
  const targetId = String(id || '').trim();
  if (!targetId) return readAllImageHistory();
  await apiRequest(`${IMAGE_HISTORY_API_BASE}/${targetId}/`, {
    method: 'DELETE',
    fallbackMessage: 'Failed to delete image history item',
  });
  cachedItems = cachedItems.filter((item) => item.id !== targetId);
  emitHistoryUpdated();
  return readAllImageHistory();
};

export const deleteImageHistoryItems = async (ids: string[]): Promise<ImageHistoryItem[]> => {
  const normalized = ids.map((item) => String(item || '').trim()).filter(Boolean);
  if (normalized.length === 0) return readAllImageHistory();
  await apiRequest(`${IMAGE_HISTORY_API_BASE}/bulk-delete/`, {
    method: 'POST',
    body: { record_ids: normalized },
    fallbackMessage: 'Failed to bulk delete image history items',
  });
  const idSet = new Set(normalized);
  cachedItems = cachedItems.filter((item) => !idSet.has(item.id));
  emitHistoryUpdated();
  return readAllImageHistory();
};

export const replaceImageHistoryAsset = async (recordId: string, index: number, imageUrl: string): Promise<ImageHistoryItem | null> => {
  const targetId = String(recordId || '').trim();
  if (!targetId || !Number.isInteger(index) || index < 0) return null;
  const json = await apiRequest<any>(`${IMAGE_HISTORY_API_BASE}/${targetId}/replace-asset/`, {
    method: 'POST',
    body: { index, image_url: imageUrl },
    fallbackMessage: 'Failed to replace image history asset',
  });
  const next = normalizeBackendItem(json?.data || {});
  if (!next) return null;
  cachedItems = dedupeAndSort([
    ...cachedItems.filter((item) => item.id !== next.id),
    next,
  ]);
  emitHistoryUpdated();
  const { isFavorited: _ignored, ...rest } = next;
  return rest;
};

export const removeImageHistoryAssets = async (recordId: string, indices: number[]): Promise<ImageHistoryItem | null> => {
  const targetId = String(recordId || '').trim();
  const normalized = indices.filter((item) => Number.isInteger(item) && item >= 0);
  if (!targetId || normalized.length === 0) return null;
  const json = await apiRequest<any>(`${IMAGE_HISTORY_API_BASE}/${targetId}/remove-assets/`, {
    method: 'POST',
    body: { indices: normalized },
    fallbackMessage: 'Failed to remove image history assets',
  });

  if (json?.data?.deleted) {
    cachedItems = cachedItems.filter((item) => item.id !== targetId);
    emitHistoryUpdated();
    return null;
  }

  const next = normalizeBackendItem(json?.data || {});
  if (!next) {
    cachedItems = cachedItems.filter((item) => item.id !== targetId);
    emitHistoryUpdated();
    return null;
  }
  cachedItems = dedupeAndSort([
    ...cachedItems.filter((item) => item.id !== next.id),
    next,
  ]);
  emitHistoryUpdated();
  const { isFavorited: _ignored, ...rest } = next;
  return rest;
};

export const getImageHistoryDetail = async (id: string): Promise<any> => {
  const targetId = String(id || '').trim();
  if (!targetId) return null;
  const json = await apiRequest<any>(`${IMAGE_HISTORY_API_BASE}/${targetId}/detail/`, {
    method: 'GET',
    fallbackMessage: 'Failed to fetch image history detail',
  });
  return json?.data || null;
};

export const notifyImageHistoryUpdated = () => {
  emitHistoryUpdated();
};

export const subscribeImageHistory = (listener: () => void): (() => void) => {
  if (!isBrowser()) return () => {};
  const wrapped = () => {
    listener();
  };
  window.addEventListener(IMAGE_HISTORY_UPDATED_EVENT, wrapped);
  return () => window.removeEventListener(IMAGE_HISTORY_UPDATED_EVENT, wrapped);
};
