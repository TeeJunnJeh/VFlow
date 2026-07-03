export type TransferStationMediaKind = 'image' | 'video' | 'audio' | 'file' | 'script';

export type TransferStationAssetType = 'model' | 'product' | 'scene' | 'motion' | 'audio' | 'script' | 'skill';

export type TransferStationSource = 'assets' | 'history' | 'replay';

export type TransferStationItem = {
  id: string;
  assetId?: string;
  name: string;
  fileUrl: string;
  mediaKind: TransferStationMediaKind;
  type: TransferStationAssetType;
  source: TransferStationSource;
  createdAt: string;
  scriptContent?: string;
  scriptLanguage?: string;
};

export type AddTransferStationInput = {
  assetId?: string;
  name: string;
  fileUrl: string;
  mediaKind?: TransferStationMediaKind | null;
  type?: TransferStationAssetType | null;
  source: TransferStationSource;
  scriptContent?: string | null;
  scriptLanguage?: string | null;
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

const normalizeScriptForSignature = (raw: string): string => String(raw || '').trim().toLowerCase();

const inferMediaKind = (url: string): TransferStationMediaKind => {
  const normalized = normalizeUrlForSignature(url);
  if (normalized.startsWith('script://')) return 'script';
  if (/\.(jpg|jpeg|png|webp|gif)$/.test(normalized)) return 'image';
  if (/\.(mp4|mov|mkv|webm|avi|m4v)$/.test(normalized)) return 'video';
  if (/\.(mp3|wav|flac|aac|m4a|ogg)$/.test(normalized)) return 'audio';
  return 'file';
};

const inferTypeByMediaKind = (mediaKind: TransferStationMediaKind): TransferStationAssetType => {
  if (mediaKind === 'script') return 'script';
  if (mediaKind === 'video') return 'motion';
  if (mediaKind === 'audio') return 'audio';
  return 'product';
};

const buildSignature = (
  assetId: string | undefined,
  fileUrl: string,
  mediaKind?: TransferStationMediaKind,
  scriptContent?: string,
): string => {
  if (mediaKind === 'script') {
    return `script|${normalizeScriptForSignature(scriptContent || '')}`;
  }
  const idPart = String(assetId || '').trim();
  const urlPart = normalizeUrlForSignature(fileUrl);
  return `${idPart}|${urlPart}`;
};

const buildSyntheticScriptUrl = (id: string): string => `script://${id}`;

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
        const scriptContent = String(next.scriptContent || '').trim();
        const fallbackId = `station_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const rawMediaKind = next.mediaKind || (scriptContent ? 'script' : inferMediaKind(fileUrl));
        const normalizedMediaKind: TransferStationMediaKind =
          rawMediaKind === 'image' || rawMediaKind === 'video' || rawMediaKind === 'audio' || rawMediaKind === 'file' || rawMediaKind === 'script'
            ? rawMediaKind
            : inferMediaKind(fileUrl);

        if (!fileUrl && normalizedMediaKind !== 'script') return null;
        if (normalizedMediaKind === 'script' && !scriptContent) return null;

        const id = String(next.id || '').trim() || fallbackId;
        const normalizedFileUrl = fileUrl || buildSyntheticScriptUrl(id);

        const normalizedType: TransferStationAssetType =
          next.type === 'model' ||
          next.type === 'product' ||
          next.type === 'scene' ||
          next.type === 'motion' ||
          next.type === 'audio' ||
          next.type === 'script' ||
          next.type === 'skill'
            ? next.type
            : inferTypeByMediaKind(normalizedMediaKind);

        const source: TransferStationSource =
          next.source === 'history'
            ? 'history'
            : next.source === 'replay'
              ? 'replay'
              : 'assets';
        const assetId = String(next.assetId || '').trim() || undefined;

        return {
          id,
          assetId,
          name: String(next.name || (normalizedMediaKind === 'script' ? 'Untitled Script' : 'Untitled Asset')).trim() || (normalizedMediaKind === 'script' ? 'Untitled Script' : 'Untitled Asset'),
          fileUrl: normalizedFileUrl,
          mediaKind: normalizedMediaKind,
          type: normalizedType,
          source,
          createdAt: String(next.createdAt || new Date().toISOString()),
          scriptContent: normalizedMediaKind === 'script' ? scriptContent : undefined,
          scriptLanguage: String(next.scriptLanguage || '').trim() || undefined,
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
  const signatureSet = new Set(
    current.map((item) => buildSignature(item.assetId, item.fileUrl, item.mediaKind, item.scriptContent))
  );

  let addedCount = 0;
  let skippedCount = 0;
  const appended: TransferStationItem[] = [];

  for (const rawInput of inputs) {
    const fileUrl = String(rawInput.fileUrl || '').trim();
    const scriptContent = String(rawInput.scriptContent || '').trim();

    const requestedMediaKind = rawInput.mediaKind || (scriptContent ? 'script' : inferMediaKind(fileUrl));
    const normalizedMediaKind: TransferStationMediaKind =
      requestedMediaKind === 'image' ||
      requestedMediaKind === 'video' ||
      requestedMediaKind === 'audio' ||
      requestedMediaKind === 'file' ||
      requestedMediaKind === 'script'
        ? requestedMediaKind
        : inferMediaKind(fileUrl);

    if (!fileUrl && normalizedMediaKind !== 'script') {
      skippedCount += 1;
      continue;
    }

    if (normalizedMediaKind === 'script' && !scriptContent) {
      skippedCount += 1;
      continue;
    }

    const assetId = String(rawInput.assetId || '').trim() || undefined;
    const signature = buildSignature(assetId, fileUrl, normalizedMediaKind, scriptContent);
    if (signatureSet.has(signature)) {
      skippedCount += 1;
      continue;
    }

    const id = `station_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const normalizedFileUrl = fileUrl || buildSyntheticScriptUrl(id);

    const normalizedType: TransferStationAssetType =
      rawInput.type === 'model' ||
      rawInput.type === 'product' ||
      rawInput.type === 'scene' ||
      rawInput.type === 'motion' ||
      rawInput.type === 'audio' ||
      rawInput.type === 'script' ||
      rawInput.type === 'skill'
        ? rawInput.type
        : inferTypeByMediaKind(normalizedMediaKind);

    appended.push({
      id,
      assetId,
      name: String(rawInput.name || (normalizedMediaKind === 'script' ? 'Untitled Script' : 'Untitled Asset')).trim() || (normalizedMediaKind === 'script' ? 'Untitled Script' : 'Untitled Asset'),
      fileUrl: normalizedFileUrl,
      mediaKind: normalizedMediaKind,
      type: normalizedType,
      source: rawInput.source,
      createdAt: new Date().toISOString(),
      scriptContent: normalizedMediaKind === 'script' ? scriptContent : undefined,
      scriptLanguage: String(rawInput.scriptLanguage || '').trim() || undefined,
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
