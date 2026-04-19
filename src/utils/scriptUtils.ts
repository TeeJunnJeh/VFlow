import { useCallback, useEffect, type MutableRefObject } from 'react';

export type ScriptItem = {
  id: number;
  shot: string;
  type: string;
  dur: string;
  visual: string;
  audio: string;
  audioTranslation: string;
};

export type ScriptCreativeCard = {
  style?: string;
  environment?: string;
  tonePacing?: string;
  camera?: string;
  lighting?: string;
  actions?: string[];
  backgroundSound?: string;
  transitionEditing?: string;
  callToAction?: string;
};

export type ScriptPage = {
  id: string;
  name: string;
  scripts: ScriptItem[];
  fullScript?: string;
  sourceLabel?: string;
  continuityAnchor?: {
    subject?: string;
    scene?: string;
    style?: string;
  };
  scriptStructure?: {
    hook?: string;
    development?: string;
    payoff?: string;
  };
  sellingPoints?: string[];
  sceneSuggestions?: string[];
  styleTags?: string[];
  creativeCard?: ScriptCreativeCard;
  creativeCardText?: string;
};

export type ScriptItemLike = ScriptItem;
export type ScriptCreativeCardLike = ScriptCreativeCard;

const WB_SCRIPT_PAGE_DEFAULT_PREFIXES = new Set(['脚本', 'Script', 'Skrip', 'Kịch bản', '스크립트']);

export function formatScriptPageDisplayName(name: string | undefined, zeroBasedIndex: number, prefix: string): string {
  const trimmed = String(name || '').trim();
  if (!trimmed) return `${prefix} ${zeroBasedIndex + 1}`;
  const m = trimmed.match(/^(.+?)\s+(\d+)\s*$/);
  if (!m) return trimmed;
  const n = parseInt(m[2], 10);
  if (n !== zeroBasedIndex + 1) return trimmed;
  if (!WB_SCRIPT_PAGE_DEFAULT_PREFIXES.has(m[1])) return trimmed;
  return `${prefix} ${n}`;
}

export function normalizeScriptText(value: any): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function parseScriptStringList(value: any, maxLen = 5): string[] {
  if (!Array.isArray(value)) return [];
  const next: string[] = [];
  for (const item of value) {
    const text = normalizeScriptText(item);
    if (!text) continue;
    if (next.includes(text)) continue;
    next.push(text);
    if (next.length >= maxLen) break;
  }
  return next;
}

export function buildScriptsFromShots(shots: any[]): ScriptItemLike[] {
  return shots.map((shot: any) => ({
    id: shot.shot_index,
    shot: String(shot.shot_index),
    type: shot.type || 'Medium',
    dur: `${shot.duration_sec}s`,
    visual: shot.visual,
    audio: shot.audio || shot.voiceover || '',
    audioTranslation: shot.voiceover_translation || '',
  }));
}

export function buildFullScriptFallback(scriptsList: Array<{ visual?: any }>): string {
  return scriptsList
    .map((item) => normalizeScriptText(item.visual))
    .filter((text) => !!text)
    .join(' ');
}

export function buildCreativeCardPrompt(card?: ScriptCreativeCardLike): string {
  if (!card) return '';
  const sections: string[] = [];
  if (card.style) sections.push(`[风格]: ${card.style}`);
  if (card.environment) sections.push(`[环境]: ${card.environment}`);
  if (card.tonePacing) sections.push(`[语调与节奏]: ${card.tonePacing}`);
  if (card.camera) sections.push(`[镜头]: ${card.camera}`);
  if (card.lighting) sections.push(`[光线]: ${card.lighting}`);
  if (Array.isArray(card.actions) && card.actions.length > 0) {
    const actions = card.actions.map((item, idx) => `- ${idx + 1}. ${item}`).join('\n');
    sections.push(`[动作]:\n${actions}`);
  }
  if (card.backgroundSound) sections.push(`[背景音]: ${card.backgroundSound}`);
  if (card.transitionEditing) sections.push(`[转场 / 剪辑]: ${card.transitionEditing}`);
  if (card.callToAction) sections.push(`[行动号召]: ${card.callToAction}`);
  return sections.join('\n');
}

export function buildCreativeCardEditorText(card?: ScriptCreativeCardLike): string {
  return buildCreativeCardPrompt(card).trim();
}

export function hasCreativeCardContent(card?: ScriptCreativeCardLike): boolean {
  if (!card) return false;
  if ((card.style || '').trim()) return true;
  if ((card.environment || '').trim()) return true;
  if ((card.tonePacing || '').trim()) return true;
  if ((card.camera || '').trim()) return true;
  if ((card.lighting || '').trim()) return true;
  if ((card.backgroundSound || '').trim()) return true;
  if ((card.transitionEditing || '').trim()) return true;
  if ((card.callToAction || '').trim()) return true;
  if ((card.actions || []).some((item) => String(item || '').trim().length > 0)) return true;
  return false;
}

type ScriptEstimateCacheEntry = {
  avgSeconds: number;
  sampleCount: number;
};

const SCRIPT_ESTIMATE_STORAGE_KEY_PREFIX = 'vflow_script_eta_v1';

export function buildScriptEstimateStorageKey(
  userId: string | number | null | undefined,
  params: { script_count: number; duration: number; has_reference_assets: boolean; with_shots?: boolean }
): string {
  const userPart = userId ?? 'guest';
  return [
    SCRIPT_ESTIMATE_STORAGE_KEY_PREFIX,
    userPart,
    params.script_count,
    params.duration,
    params.has_reference_assets ? 1 : 0,
    params.with_shots === false ? 'noshots' : 'shots',
  ].join('_');
}

export function readLocalScriptEstimate(storageKey: string): ScriptEstimateCacheEntry | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ScriptEstimateCacheEntry>;
    const avgSeconds = Number(parsed.avgSeconds);
    const sampleCount = Number(parsed.sampleCount);
    if (!Number.isFinite(avgSeconds) || avgSeconds <= 0) return null;
    if (!Number.isFinite(sampleCount) || sampleCount < 1) return null;
    return {
      avgSeconds,
      sampleCount: Math.max(1, Math.round(sampleCount)),
    };
  } catch {
    return null;
  }
}

export function writeLocalScriptEstimate(storageKey: string, elapsedSeconds: number): void {
  const seconds = Math.max(1, Math.round(elapsedSeconds));
  const prev = readLocalScriptEstimate(storageKey);
  const nextCount = (prev?.sampleCount || 0) + 1;
  const nextAvg = prev
    ? ((prev.avgSeconds * prev.sampleCount) + seconds) / nextCount
    : seconds;
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      avgSeconds: nextAvg,
      sampleCount: nextCount,
    }));
  } catch {
  }
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { name?: string }).name === 'AbortError';
}

const SCRIPT_GENERATION_CANCEL_WINDOW_MS = 60_000;
const SCRIPT_GENERATION_CANCEL_LIMIT = 3;
const SCRIPT_GENERATION_CANCEL_STORAGE_KEY_PREFIX = 'vflow_script_generation_cancels_v1';

const buildScriptGenerationCancelStorageKey = (userId?: string | number | null) => {
  const normalized = userId === null || userId === undefined || userId === '' ? 'guest' : String(userId);
  return `${SCRIPT_GENERATION_CANCEL_STORAGE_KEY_PREFIX}_${normalized}`;
};

const readRecentScriptGenerationCancelTimestamps = (userId?: string | number | null): number[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(buildScriptGenerationCancelStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const next = Array.isArray(parsed)
      ? parsed
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && now - value < SCRIPT_GENERATION_CANCEL_WINDOW_MS)
      : [];

    if (next.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
      window.localStorage.setItem(buildScriptGenerationCancelStorageKey(userId), JSON.stringify(next));
    }

    return next;
  } catch {
    return [];
  }
};

export const recordScriptGenerationCancelTimestamp = (userId?: string | number | null): number[] => {
  if (typeof window === 'undefined') return [];

  const next = [
    ...readRecentScriptGenerationCancelTimestamps(userId),
    Date.now(),
  ];

  try {
    window.localStorage.setItem(buildScriptGenerationCancelStorageKey(userId), JSON.stringify(next));
  } catch {
  }

  return next;
};

export const getScriptGenerationCooldownRemainingMs = (userId?: string | number | null): number => {
  const timestamps = readRecentScriptGenerationCancelTimestamps(userId);
  if (timestamps.length < SCRIPT_GENERATION_CANCEL_LIMIT) return 0;

  const oldestRelevant = timestamps[timestamps.length - SCRIPT_GENERATION_CANCEL_LIMIT];
  if (!Number.isFinite(oldestRelevant)) return 0;

  return Math.max(0, oldestRelevant + SCRIPT_GENERATION_CANCEL_WINDOW_MS - Date.now());
};

type Params = {
  isGenerating: boolean;
  estimatedSeconds: number;
  progress: number;
  setProgress: (value: number) => void;
  startedAtRef: MutableRefObject<number | null>;
  finishingRef: MutableRefObject<boolean>;
  maxBeforeHold: number;
  holdMax: number;
};

export function useScriptGenerationProgress(params: Params) {
  const {
    isGenerating,
    estimatedSeconds,
    progress,
    setProgress,
    startedAtRef,
    finishingRef,
    maxBeforeHold,
    holdMax,
  } = params;

  const finishScriptGenerationProgress = useCallback(async () => {
    finishingRef.current = true;
    const from = Math.max(0, Math.min(100, progress));
    if (from < 100) {
      await new Promise<void>((resolve) => {
        const startedAt = performance.now();
        const durationMs = 380;
        const animate = (now: number) => {
          const ratio = Math.min(1, (now - startedAt) / durationMs);
          const eased = 1 - Math.pow(1 - ratio, 3);
          setProgress(from + (100 - from) * eased);
          if (ratio < 1) {
            window.requestAnimationFrame(animate);
            return;
          }
          setProgress(100);
          resolve();
        };
        window.requestAnimationFrame(animate);
      });
    } else {
      setProgress(100);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }, [finishingRef, progress, setProgress]);

  useEffect(() => {
    if (!isGenerating || !startedAtRef.current) return;

    const tick = () => {
      if (finishingRef.current) return;
      const startedAt = startedAtRef.current;
      if (!startedAt) return;
      const elapsed = Math.max(0, (Date.now() - startedAt) / 1000);
      const estimated = Math.max(1, estimatedSeconds || 45);

      let nextProgress = 0;
      if (elapsed <= estimated) {
        const ratio = Math.min(1, elapsed / estimated);
        nextProgress = Math.pow(ratio, 0.85) * maxBeforeHold;
      } else {
        const overflow = elapsed - estimated;
        nextProgress = Math.min(
          holdMax,
          maxBeforeHold + Math.log1p(overflow) * 3
        );
      }

      setProgress(Math.max(0, Math.min(100, nextProgress)));
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [estimatedSeconds, finishingRef, holdMax, isGenerating, maxBeforeHold, setProgress, startedAtRef]);

  return { finishScriptGenerationProgress };
}