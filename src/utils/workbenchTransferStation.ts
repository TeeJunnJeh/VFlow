export type TransferStationMediaKind = 'image' | 'video' | 'audio' | 'file';

export type TransferStationAssetType = 'model' | 'product' | 'scene' | 'motion' | 'audio';

export type TransferStationSource = 'assets' | 'history';

export type TransferStationItem = {
  id: string;
  assetId?: string;
  name: string;
  fileUrl: string;
  mediaKind: TransferStationMediaKind;
  type: TransferStationAssetType;
  source: TransferStationSource;
  createdAt: string;
};

export type AddTransferStationInput = {
  assetId?: string;
  name: string;
  fileUrl: string;
  mediaKind?: TransferStationMediaKind | null;
  type?: TransferStationAssetType | null;
  source: TransferStationSource;
};

const TRANSFER_STATION_KEY_PREFIX = 'vflow_workbench_transfer_station_v1';

const normalizeOwner = (userId?: string | number | null): string => (
  userId === null || userId === undefined || userId === '' ? 'guest' : String(userId)
);

const normalizeUrlForSignature = (raw: string): string => {
  const value = String(raw || '').trim();
  if (!value) return '';
  // Drop query/hash to avoid duplicate entries with cache-busting params.
  return value.split('#', 1)[0].split('?', 1)[0].trim().toLowerCase();
};

const inferMediaKind = (url: string): TransferStationMediaKind => {
  const normalized = normalizeUrlForSignature(url);
  if (/\.(jpg|jpeg|png|webp|gif)$/.test(normalized)) return 'image';
  if (/\.(mp4|mov|mkv|webm|avi|m4v)$/.test(normalized)) return 'video';
  if (/\.(mp3|wav|flac|aac|m4a|ogg)$/.test(normalized)) return 'audio';
  return 'file';
};

const inferTypeByMediaKind = (mediaKind: TransferStationMediaKind): TransferStationAssetType => {
  if (mediaKind === 'video') return 'motion';
  if (mediaKind === 'audio') return 'audio';
  return 'product';
};

const buildSignature = (assetId: string | undefined, fileUrl: string): string => {
  const idPart = String(assetId || '').trim();
  const urlPart = normalizeUrlForSignature(fileUrl);
  return `${idPart}|${urlPart}`;
};

const dispatchTransferStationUpdated = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('vflow-transfer-station-updated'));
};

export const getTransferStationStorageKey = (userId?: string | number | null): string => (
  `${TRANSFER_STATION_KEY_PREFIX}_${normalizeOwner(userId)}`
);

export const loadTransferStationItems = (userId?: string | number | null): TransferStationItem[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(getTransferStationStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const next = item as Partial<TransferStationItem>;
        const fileUrl = String(next.fileUrl || '').trim();
        if (!fileUrl) return null;

        const mediaKind = next.mediaKind || inferMediaKind(fileUrl);
        const normalizedMediaKind: TransferStationMediaKind =
          mediaKind === 'image' || mediaKind === 'video' || mediaKind === 'audio' || mediaKind === 'file'
            ? mediaKind
            : inferMediaKind(fileUrl);

        const normalizedType: TransferStationAssetType =
          next.type === 'model' ||
          next.type === 'product' ||
          next.type === 'scene' ||
          next.type === 'motion' ||
          next.type === 'audio'
            ? next.type
            : inferTypeByMediaKind(normalizedMediaKind);

        const source: TransferStationSource = next.source === 'history' ? 'history' : 'assets';
        const assetId = String(next.assetId || '').trim() || undefined;
        const id = String(next.id || '').trim() || `station_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        return {
          id,
          assetId,
          name: String(next.name || 'Untitled Asset').trim() || 'Untitled Asset',
          fileUrl,
          mediaKind: normalizedMediaKind,
          type: normalizedType,
          source,
          createdAt: String(next.createdAt || new Date().toISOString()),
        } satisfies TransferStationItem;
      })
      .filter(Boolean) as TransferStationItem[];
  } catch {
    return [];
  }
};

export const saveTransferStationItems = (items: TransferStationItem[], userId?: string | number | null) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(getTransferStationStorageKey(userId), JSON.stringify(items));
    dispatchTransferStationUpdated();
  } catch {
    // Ignore localStorage failures to keep UX non-blocking.
  }
};

export const addTransferStationItems = (
  inputs: AddTransferStationInput[],
  userId?: string | number | null,
): { addedCount: number; skippedCount: number; items: TransferStationItem[] } => {
  const current = loadTransferStationItems(userId);
  const signatureSet = new Set(current.map((item) => buildSignature(item.assetId, item.fileUrl)));

  let addedCount = 0;
  let skippedCount = 0;
  const appended: TransferStationItem[] = [];

  for (const rawInput of inputs) {
    const fileUrl = String(rawInput.fileUrl || '').trim();
    if (!fileUrl) {
      skippedCount += 1;
      continue;
    }

    const assetId = String(rawInput.assetId || '').trim() || undefined;
    const signature = buildSignature(assetId, fileUrl);
    if (signatureSet.has(signature)) {
      skippedCount += 1;
      continue;
    }

    const mediaKind = rawInput.mediaKind || inferMediaKind(fileUrl);
    const normalizedMediaKind: TransferStationMediaKind =
      mediaKind === 'image' || mediaKind === 'video' || mediaKind === 'audio' || mediaKind === 'file'
        ? mediaKind
        : inferMediaKind(fileUrl);

    const normalizedType: TransferStationAssetType =
      rawInput.type === 'model' ||
      rawInput.type === 'product' ||
      rawInput.type === 'scene' ||
      rawInput.type === 'motion' ||
      rawInput.type === 'audio'
        ? rawInput.type
        : inferTypeByMediaKind(normalizedMediaKind);

    appended.push({
      id: `station_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      assetId,
      name: String(rawInput.name || 'Untitled Asset').trim() || 'Untitled Asset',
      fileUrl,
      mediaKind: normalizedMediaKind,
      type: normalizedType,
      source: rawInput.source,
      createdAt: new Date().toISOString(),
    });

    signatureSet.add(signature);
    addedCount += 1;
  }

  const nextItems = [...appended, ...current];
  saveTransferStationItems(nextItems, userId);

  return {
    addedCount,
    skippedCount,
    items: nextItems,
  };
};

export const removeTransferStationItem = (id: string, userId?: string | number | null) => {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return;

  const current = loadTransferStationItems(userId);
  const next = current.filter((item) => item.id !== normalizedId);
  if (next.length === current.length) return;
  saveTransferStationItems(next, userId);
};

export const clearTransferStationItems = (userId?: string | number | null) => {
  saveTransferStationItems([], userId);
};
