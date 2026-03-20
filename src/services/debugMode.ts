const DEBUG_MODE_STORAGE_KEY = 'vflow_debug_mode_enabled';

const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage;

export const getDebugModeEnabled = (): boolean => {
  if (!canUseStorage()) return false;
  return window.localStorage.getItem(DEBUG_MODE_STORAGE_KEY) === 'true';
};

export const setDebugModeEnabled = (enabled: boolean) => {
  if (!canUseStorage()) return;
  if (enabled) {
    window.localStorage.setItem(DEBUG_MODE_STORAGE_KEY, 'true');
  } else {
    window.localStorage.removeItem(DEBUG_MODE_STORAGE_KEY);
  }
};

export const clearDebugModeEnabled = () => setDebugModeEnabled(false);

export const debugLog = (...args: unknown[]) => {
  if (getDebugModeEnabled()) {
    console.log(...args);
  }
};

export const debugWarn = (...args: unknown[]) => {
  if (getDebugModeEnabled()) {
    console.warn(...args);
  }
};

export const debugError = (...args: unknown[]) => {
  if (getDebugModeEnabled()) {
    console.error(...args);
  }
};