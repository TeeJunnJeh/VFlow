export type WorkbenchPreferences = {
  deliveryRegion: string;
  targetLanguage: string;
  videoType: string;
  aspectRatio: '9:16' | '16:9';
  genDuration: number;
  soundSetting: 'on' | 'off';
  creationMode: 'fast' | 'replay';
  selectedModelId: 'kling' | 'sora2' | 'sora2pro' | 'seedance2.0';
  scriptVariantCount: number;
  theme: 'dark' | 'light' | 'dim';
};

const STORAGE_KEY_PREFIX = 'vflow_workbench_preferences_v1';
const LEGACY_STORAGE_KEY = 'vflow_workbench_preferences_v1';
const LEGACY_OWNER_KEY = 'vflow_workbench_preferences_v1_owner';

const ALLOWED_DURATIONS = new Set([5, 10, 15]);

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const normalizeUserKey = (userId?: string | number | null): string => {
  if (userId === null || userId === undefined || userId === '') return 'guest';
  return String(userId);
};

const getStorageKey = (userId?: string | number | null): string => `${STORAGE_KEY_PREFIX}_${normalizeUserKey(userId)}`;

const parsePreferences = (raw: string | null): Partial<WorkbenchPreferences> => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<WorkbenchPreferences> | null;
    if (!parsed || typeof parsed !== 'object') return {};

    const next: Partial<WorkbenchPreferences> = {};

    if (typeof parsed.deliveryRegion === 'string') next.deliveryRegion = parsed.deliveryRegion;
    if (typeof parsed.targetLanguage === 'string') next.targetLanguage = parsed.targetLanguage;
    if (typeof parsed.videoType === 'string') next.videoType = parsed.videoType;
    if (parsed.aspectRatio === '9:16' || parsed.aspectRatio === '16:9') next.aspectRatio = parsed.aspectRatio;
    if (typeof parsed.genDuration === 'number' && Number.isFinite(parsed.genDuration) && ALLOWED_DURATIONS.has(parsed.genDuration)) {
      next.genDuration = parsed.genDuration;
    }
    if (parsed.soundSetting === 'on' || parsed.soundSetting === 'off') next.soundSetting = parsed.soundSetting;

    if (parsed.creationMode === 'fast' || parsed.creationMode === 'replay') next.creationMode = parsed.creationMode;
    if (
      parsed.selectedModelId === 'kling' ||
      parsed.selectedModelId === 'sora2' ||
      parsed.selectedModelId === 'sora2pro' ||
      parsed.selectedModelId === 'seedance2.0'
    ) {
      next.selectedModelId = parsed.selectedModelId;
    }

    if (typeof parsed.scriptVariantCount === 'number' && Number.isFinite(parsed.scriptVariantCount)) {
      next.scriptVariantCount = parsed.scriptVariantCount;
    }

    if (parsed.theme === 'dark' || parsed.theme === 'light' || parsed.theme === 'dim') next.theme = parsed.theme;

    return next;
  } catch {
    return {};
  }
};

export function getWorkbenchPreferences(userId?: string | number | null): Partial<WorkbenchPreferences> {
  if (!isBrowser()) return {};

  const storageKey = getStorageKey(userId);
  const raw = (() => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  })();

  if (raw) return parsePreferences(raw);

  const normalized = normalizeUserKey(userId);
  if (normalized === 'guest') return {};

  try {
    const owner = localStorage.getItem(LEGACY_OWNER_KEY);
    if (owner !== normalized) return {};

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    const legacyParsed = parsePreferences(legacyRaw);
    if (Object.keys(legacyParsed).length === 0) return {};

    localStorage.setItem(storageKey, JSON.stringify(legacyParsed));
    return legacyParsed;
  } catch {
    return {};
  }
}

export function setWorkbenchPreferences(next: Partial<WorkbenchPreferences>, userId?: string | number | null) {
  if (!isBrowser()) return;

  const current = getWorkbenchPreferences(userId);
  const merged: Partial<WorkbenchPreferences> = { ...current, ...next };

  try {
    const storageKey = getStorageKey(userId);
    localStorage.setItem(storageKey, JSON.stringify(merged));

    const normalized = normalizeUserKey(userId);
    if (normalized !== 'guest') localStorage.setItem(LEGACY_OWNER_KEY, normalized);
  } catch {
    void 0;
  }
}