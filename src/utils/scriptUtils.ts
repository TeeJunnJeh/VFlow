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
  content?: string;
  // 兼容旧数据：历史项目仍把这一字段存为字符串列表（带「第一幕」等前缀）。
  actions?: string[];
  backgroundSound?: string;
  transitionEditing?: string;
  callToAction?: string;
  // 趣味剧本专用：屏幕字幕 / 文字弹出 / 旁白字幕 / 片尾标语序列
  subtitles?: string[];
};

export type ScriptPage = {
  id: string;
  name: string;
  scripts: ScriptItem[];
  fullScript?: string;
  sourceLabel?: string;
  seedSkill?: any;
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

export const parseDurSeconds = (dur: string | number | null | undefined): number => {
  if (dur == null) return 0;
  const n = parseFloat(String(dur).replace('s', ''));
  return Number.isFinite(n) ? n : 0;
};

export const durToTenths = (dur: string | number | null | undefined): number =>
  Math.round(parseDurSeconds(dur) * 10);

export const tenthsToDur = (n: number): string => `${n / 10}s`;

export function formatScriptDurationLabel(value: string | number | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '');
  const secondsMatch = compact.match(/^([0-9]+(?:\.[0-9]+)?)(?:s|秒)*$/i);
  if (secondsMatch) return `${secondsMatch[1]}s`;
  return /s$/i.test(compact) ? compact : `${compact}s`;
}

/**
 * 将 `total`（整数十分位）按 `weights` 的比例分配给 N 个桶，每个桶至少 `minEach` 十分位。
 * 使用「最大剩余法」保证 Σresult == max(total, minEach * N)。
 * 所有权重为 0 时按均分；weights 与 total 不同号或不合法时按均分兜底。
 */
export function distributeTenthsProportional(
  weights: number[],
  total: number,
  minEach = 1
): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const minSum = minEach * n;
  const effectiveTotal = Math.max(total, minSum);
  const extra = effectiveTotal - minSum;
  const weightSum = weights.reduce((acc, w) => acc + (w > 0 ? w : 0), 0);
  const raw = weightSum > 0
    ? weights.map((w) => ((w > 0 ? w : 0) / weightSum) * extra)
    : new Array(n).fill(extra / n);
  const floored = raw.map((x) => Math.floor(x));
  let allocated = floored.reduce((a, b) => a + b, 0);
  const remainder = extra - allocated;
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder && k < n; k++) {
    floored[order[k].i] += 1;
  }
  return floored.map((x) => x + minEach);
}

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
  // 内容：新数据为单段连贯叙述字符串；旧数据无 content 时回退拼接旧 actions 列表。
  const cardContent = (card.content || '').trim()
    || (Array.isArray(card.actions) ? card.actions.map((item) => String(item || '').trim()).filter(Boolean).join(' ') : '');
  if (cardContent) sections.push(`[内容]: ${cardContent}`);
  if (card.backgroundSound) sections.push(`[背景音]: ${card.backgroundSound}`);
  if (card.transitionEditing) sections.push(`[转场 / 剪辑]: ${card.transitionEditing}`);
  if (card.callToAction) sections.push(`[行动号召]: ${card.callToAction}`);
  if (Array.isArray(card.subtitles) && card.subtitles.length > 0) {
    const subtitles = card.subtitles.map((item, idx) => `- ${idx + 1}. ${item}`).join('\n');
    sections.push(`[字幕]:\n${subtitles}`);
  }
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
  if ((card.content || '').trim()) return true;
  if ((card.actions || []).some((item) => String(item || '').trim().length > 0)) return true;
  if ((card.subtitles || []).some((item) => String(item || '').trim().length > 0)) return true;
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
