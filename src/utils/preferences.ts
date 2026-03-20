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

const STORAGE_KEY = 'vflow_workbench_preferences_v1';

const ALLOWED_DURATIONS = new Set([5, 10, 15]);

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

export function getWorkbenchPreferences(): Partial<WorkbenchPreferences> {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
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
}

export function setWorkbenchPreferences(next: Partial<WorkbenchPreferences>) {
  if (!isBrowser()) return;

  const current = getWorkbenchPreferences();
  const merged: Partial<WorkbenchPreferences> = { ...current, ...next };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    void 0;
  }
}