export type ImageHistoryFeatureType = 'first_frame' | 'gallery' | 'text_separation' | 'smart_repair';
export type ImageHistoryStatus = 'succeeded';

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
  legacySource?: 'first_frame_v1' | 'gallery_v1' | 'text_separation_v1';
  version: 2;
}

export interface ImageHistoryAppendInput {
  id?: string;
  featureType: ImageHistoryFeatureType;
  createdAt?: string;
  status?: ImageHistoryStatus;
  images: string[];
  settings?: Record<string, any>;
  metadata?: Record<string, any>;
  workspaceId?: string;
  workspaceOrder?: number;
  legacySource?: ImageHistoryItem['legacySource'];
}

const IMAGE_HISTORY_KEY = 'vflow_image_history_v2';
const IMAGE_FAVORITES_KEY = 'vflow_image_history_favorites_v1';
const FIRST_FRAME_HISTORY_KEY = 'vflow_first_frame_history_v1';
const GALLERY_HISTORY_KEY = 'vflow_product_gallery_history';
const TEXT_SEPARATION_HISTORY_KEY = 'vflow_text_separation_history_v1';
export const IMAGE_HISTORY_UPDATED_EVENT = 'vflow:image-history-updated';
const MAX_IMAGE_HISTORY_ITEMS = 200;

let migrationAttempted = false;

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

const normalizeHistoryItem = (item: any): ImageHistoryItem | null => {
  const id = String(item?.id || '').trim();
  const featureType = normalizeFeatureType(item?.featureType);
  const createdAt = toIsoString(item?.createdAt);
  const images = normalizeUrlList(item?.images);
  const status = String(item?.status || 'succeeded').trim() === 'succeeded' ? 'succeeded' : null;

  if (!id || !featureType || !status || images.length === 0) return null;

  const workspaceId = String(item?.workspaceId || '').trim() || undefined;
  const workspaceOrderRaw = Number(item?.workspaceOrder);
  const workspaceOrder = Number.isFinite(workspaceOrderRaw) && workspaceOrderRaw > 0
    ? Math.floor(workspaceOrderRaw)
    : undefined;
  const legacySource = item?.legacySource === 'first_frame_v1' || item?.legacySource === 'gallery_v1' || item?.legacySource === 'text_separation_v1'
    ? item.legacySource
    : undefined;

  return {
    id,
    featureType,
    createdAt,
    createdAtMs: toTimestamp(item?.createdAtMs, createdAt),
    status,
    images,
    settings: normalizeObject(item?.settings),
    metadata: normalizeObject(item?.metadata),
    workspaceId,
    workspaceOrder,
    legacySource,
    version: 2,
  };
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

const writeHistoryItems = (items: ImageHistoryItem[]) => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(IMAGE_HISTORY_KEY, JSON.stringify(items));
  } catch {
    // Ignore localStorage write failures.
  }
};

const emitHistoryUpdated = () => {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(IMAGE_HISTORY_UPDATED_EVENT));
};

const dedupeAndSort = (items: ImageHistoryItem[]): ImageHistoryItem[] => {
  const seen = new Set<string>();
  const deduped: ImageHistoryItem[] = [];

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

const readUnifiedHistoryFromStorage = (): ImageHistoryItem[] => {
  return dedupeAndSort(
    readJsonArray(IMAGE_HISTORY_KEY)
      .map((item) => normalizeHistoryItem(item))
      .filter(Boolean) as ImageHistoryItem[]
  );
};

const readLegacyFirstFrameHistory = (): ImageHistoryItem[] => {
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
      });
    })
    .filter(Boolean) as ImageHistoryItem[];
};

const readLegacyGalleryHistory = (): ImageHistoryItem[] => {
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
      });
    })
    .filter(Boolean) as ImageHistoryItem[];
};

const readLegacyTextSeparationHistory = (): ImageHistoryItem[] => {
  return readJsonArray(TEXT_SEPARATION_HISTORY_KEY)
    .map((item: any) => {
      const id = String(item?.id || '').trim();
      const createdAt = toIsoString(item?.createdAt);
      const backgroundImageUrl = String(item?.backgroundImageUrl || '').trim();
      const originalImageUrl = String(item?.originalImageUrl || '').trim();
      const sampleTitle = String(item?.sampleTitle || '').trim();
      if (!id || !backgroundImageUrl) return null;
      return normalizeHistoryItem({
        id,
        featureType: 'text_separation',
        createdAt,
        createdAtMs: toTimestamp(item?.createdAtMs, createdAt),
        status: 'succeeded',
        images: [backgroundImageUrl],
        metadata: {
          sampleTitle,
          originalImageUrl,
          backgroundImageUrl,
          textBlocks: Array.isArray(item?.textBlocks) ? item.textBlocks : [],
        },
        legacySource: 'text_separation_v1',
      });
    })
    .filter(Boolean) as ImageHistoryItem[];
};

export const migrateLegacyImageHistory = (): ImageHistoryItem[] => {
  if (!isBrowser()) return [];

  const current = readUnifiedHistoryFromStorage();
  const merged = dedupeAndSort([
    ...current,
    ...readLegacyFirstFrameHistory(),
    ...readLegacyGalleryHistory(),
    ...readLegacyTextSeparationHistory(),
  ]);

  if (JSON.stringify(merged) !== JSON.stringify(current)) {
    writeHistoryItems(merged);
  }

  migrationAttempted = true;
  return merged;
};

export const readAllImageHistory = (): ImageHistoryItem[] => {
  if (!migrationAttempted) {
    return migrateLegacyImageHistory();
  }
  return readUnifiedHistoryFromStorage();
};

export const readImageHistoryByFeature = (featureType: ImageHistoryFeatureType): ImageHistoryItem[] => {
  return readAllImageHistory().filter((item) => item.featureType === featureType);
};

export const appendImageHistoryItem = (input: ImageHistoryAppendInput): ImageHistoryItem | null => {
  const createdAt = toIsoString(input.createdAt);
  const normalized = normalizeHistoryItem({
    ...input,
    id: String(input.id || `${input.featureType}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    createdAt,
    createdAtMs: toTimestamp(undefined, createdAt),
    status: input.status || 'succeeded',
    version: 2,
  });

  if (!normalized) return null;

  const next = dedupeAndSort([normalized, ...readAllImageHistory()]);
  writeHistoryItems(next);
  emitHistoryUpdated();
  return normalized;
};

export const updateImageHistoryItem = (
  id: string,
  updater: (item: ImageHistoryItem) => ImageHistoryItem | null
): ImageHistoryItem[] => {
  const targetId = String(id || '').trim();
  if (!targetId) return readAllImageHistory();

  let changed = false;
  const next = dedupeAndSort(
    readAllImageHistory()
      .map((item) => {
        if (item.id !== targetId) return item;
        changed = true;
        const updated = updater(item);
        return updated ? normalizeHistoryItem(updated) : null;
      })
      .filter(Boolean) as ImageHistoryItem[]
  );

  if (changed) {
    writeHistoryItems(next);
    emitHistoryUpdated();
  }

  return next;
};

export const deleteImageHistoryItem = (id: string): ImageHistoryItem[] => {
  const targetId = String(id || '').trim();
  if (!targetId) return readAllImageHistory();

  const next = readAllImageHistory().filter((item) => item.id !== targetId);
  writeHistoryItems(next);

  const favorites = readImageHistoryFavorites();
  if (favorites.has(targetId)) {
    favorites.delete(targetId);
    writeImageHistoryFavorites(favorites);
  }

  emitHistoryUpdated();
  return next;
};

export const readImageHistoryFavorites = (): Set<string> => {
  if (!isBrowser()) return new Set();
  try {
    const raw = window.localStorage.getItem(IMAGE_FAVORITES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : []);
  } catch {
    return new Set();
  }
};

export const writeImageHistoryFavorites = (favorites: Set<string>) => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(IMAGE_FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {
    // Ignore localStorage write failures.
  }
};

export const toggleImageHistoryFavorite = (id: string): Set<string> => {
  const targetId = String(id || '').trim();
  const favorites = readImageHistoryFavorites();
  if (!targetId) return favorites;

  if (favorites.has(targetId)) {
    favorites.delete(targetId);
  } else {
    favorites.add(targetId);
  }

  writeImageHistoryFavorites(favorites);
  emitHistoryUpdated();
  return favorites;
};

export const subscribeImageHistory = (listener: () => void): (() => void) => {
  if (!isBrowser()) return () => undefined;

  const handleCustom = () => listener();
  const handleStorage = (event: StorageEvent) => {
    if (!event.key || [IMAGE_HISTORY_KEY, IMAGE_FAVORITES_KEY].includes(event.key)) {
      listener();
    }
  };

  window.addEventListener(IMAGE_HISTORY_UPDATED_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(IMAGE_HISTORY_UPDATED_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
};
