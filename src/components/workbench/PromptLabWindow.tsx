import { FileJson, Loader2, Send, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratePreviewData } from '../../services/video';

type PromptStepId = 'script_generation' | 'video_description' | 'translation';

export type PromptStepTemplate = {
  id: PromptStepId;
  title: string;
  system_prompt?: string;
  user_prompt?: string;
};

export type PromptTemplatesResponse = {
  code?: number;
  message?: string;
  data?: {
    steps?: PromptStepTemplate[];
  };
};

export type PromptOverrides = Partial<Record<PromptStepId, {
  system_prompt?: string;
  user_prompt?: string;
}>>;

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type DebugProps = {
  isPreparing: boolean;
  isSending: boolean;
  payloadText: string;
  onChangePayloadText: (next: string) => void;
  preview: GeneratePreviewData | null;
  onPrepare: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onSend: () => Promise<void>;
};

type Props = {
  templates: PromptStepTemplate[];
  loading?: boolean;
  error?: string | null;
  onReload?: () => void;
  overrides: PromptOverrides;
  onChangeOverrides: (next: PromptOverrides) => void;
  debug?: DebugProps;
  onClose: () => void;
};

type DraftByStep = Partial<Record<PromptStepId, { system: string; user: string }>>;

const STORAGE_KEY = 'vflow_prompt_lab_overrides_v1';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function loadPromptOverrides(): PromptOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as PromptOverrides;
  } catch {
    return {};
  }
}

function persistPromptOverrides(overrides: PromptOverrides) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore
  }
}

export function buildBackendPromptOverrides(overrides: PromptOverrides): Record<string, unknown> | null {
  const out: Record<string, any> = {};
  const steps: PromptStepId[] = ['script_generation', 'video_description', 'translation'];
  for (const stepId of steps) {
    const step = overrides[stepId];
    if (!step) continue;
    const payload: Record<string, string> = {};
    if (typeof step.system_prompt === 'string' && step.system_prompt.trim()) payload.system_prompt = step.system_prompt;
    if (stepId !== 'translation' && typeof step.user_prompt === 'string' && step.user_prompt.trim()) payload.user_prompt = step.user_prompt;
    if (Object.keys(payload).length) out[stepId] = payload;
  }
  return Object.keys(out).length ? out : null;
}

function getDefaultDraft(step: PromptStepTemplate): { system: string; user: string } {
  return {
    system: step.system_prompt ?? '',
    user: step.user_prompt ?? '',
  };
}

export function PromptLabWindow({
  templates,
  loading,
  error,
  onReload,
  overrides,
  onChangeOverrides,
  debug,
  onClose,
}: Props) {
  const [size, setSize] = useState(() => {
    if (typeof window === 'undefined') return { w: 760, h: 560 };
    const w = clamp(760, 640, Math.max(640, window.innerWidth - 32));
    const h = clamp(560, 420, Math.max(420, window.innerHeight - 160));
    return { w, h };
  });
  const [pos, setPos] = useState(() => {
    if (typeof window === 'undefined') return { x: 24, y: 88 };
    return { x: 24, y: 88 };
  });
  const [view, setView] = useState<'script_prompt' | 'generate_json' | 'translation_prompt'>('script_prompt');

  const dragRef = useRef<{ dragging: boolean; ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{
    resizing: boolean;
    dir: ResizeDir;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    sl: number;
    st: number;
  } | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);

  const ordered = useMemo(() => {
    const map = new Map(templates.map(s => [s.id, s]));
    const ids: PromptStepId[] = ['script_generation', 'video_description', 'translation'];
    return ids.map(id => map.get(id)).filter(Boolean) as PromptStepTemplate[];
  }, [templates]);

  const stepScript = useMemo(() => ordered.find(s => s.id === 'script_generation') ?? null, [ordered]);
  const stepTranslation = useMemo(() => ordered.find(s => s.id === 'translation') ?? null, [ordered]);

  const [draftByStep, setDraftByStep] = useState<DraftByStep>({});

  useEffect(() => {
    if (!ordered.length) return;
    setDraftByStep((prev) => {
      const next: DraftByStep = { ...prev };
      for (const step of ordered) {
        if (next[step.id]) continue;
        const ov = overrides[step.id];
        next[step.id] = {
          system: typeof ov?.system_prompt === 'string' ? ov.system_prompt : (step.system_prompt ?? ''),
          user: typeof ov?.user_prompt === 'string' ? ov.user_prompt : (step.user_prompt ?? ''),
        };
      }
      return next;
    });
  }, [ordered, overrides]);

  useEffect(() => {
    // Ensure the window doesn't cover the whole page on first mount (fit into viewport).
    const fitOnce = () => {
      setSize((s) => {
        const maxW = Math.max(640, window.innerWidth - 32);
        const maxH = Math.max(420, window.innerHeight - 160);
        return {
          w: clamp(s.w, 640, maxW),
          h: clamp(s.h, 420, maxH),
        };
      });
      setPos((p) => {
        const maxX = Math.max(8, window.innerWidth - size.w - 8);
        const maxY = Math.max(8, window.innerHeight - size.h - 8);
        return { x: clamp(p.x, 8, maxX), y: clamp(p.y, 8, maxY) };
      });
    };
    if (typeof window !== 'undefined') fitOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const st = dragRef.current;
      if (!st?.dragging) return;
      const nextX = e.clientX - st.ox;
      const nextY = e.clientY - st.oy;
      const maxX = window.innerWidth - size.w - 8;
      const maxY = window.innerHeight - size.h - 8;
      setPos({ x: clamp(nextX, 8, Math.max(8, maxX)), y: clamp(nextY, 8, Math.max(8, maxY)) });
    };

    const onResizeMove = (e: MouseEvent) => {
      const rs = resizeRef.current;
      if (!rs?.resizing) return;

      const dx = e.clientX - rs.sx;
      const dy = e.clientY - rs.sy;

      const minW = 640;
      const minH = 420;
      const maxW = Math.max(minW, window.innerWidth - 16);
      const maxH = Math.max(minH, window.innerHeight - 16);

      let nextW = rs.sw;
      let nextH = rs.sh;
      let nextL = rs.sl;
      let nextT = rs.st;

      const hasN = rs.dir.includes('n');
      const hasS = rs.dir.includes('s');
      const hasW = rs.dir.includes('w');
      const hasE = rs.dir.includes('e');

      if (hasE) nextW = rs.sw + dx;
      if (hasS) nextH = rs.sh + dy;
      if (hasW) {
        nextW = rs.sw - dx;
        nextL = rs.sl + dx;
      }
      if (hasN) {
        nextH = rs.sh - dy;
        nextT = rs.st + dy;
      }

      nextW = clamp(nextW, minW, maxW);
      nextH = clamp(nextH, minH, maxH);

      if (hasW) nextL = rs.sl + (rs.sw - nextW);
      if (hasN) nextT = rs.st + (rs.sh - nextH);

      nextL = clamp(nextL, 8, Math.max(8, window.innerWidth - nextW - 8));
      nextT = clamp(nextT, 8, Math.max(8, window.innerHeight - nextH - 8));

      setPos({ x: nextL, y: nextT });
      setSize({ w: nextW, h: nextH });
    };

    const onUp = () => {
      if (dragRef.current) dragRef.current.dragging = false;
      if (resizeRef.current) resizeRef.current.resizing = false;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousemove', onResizeMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [size.w, size.h]);

  const setDraft = (id: PromptStepId, patch: Partial<{ system: string; user: string }>) => {
    setDraftByStep((prev) => ({
      ...prev,
      [id]: { system: prev[id]?.system ?? '', user: prev[id]?.user ?? '', ...patch },
    }));
  };

  const saveOverride = (id: PromptStepId) => {
    const draft = draftByStep[id];
    if (!draft) return;
    const next: PromptOverrides = { ...overrides };
    next[id] = {
      system_prompt: draft.system,
      ...(id === 'translation' ? {} : { user_prompt: draft.user }),
    };
    onChangeOverrides(next);
    persistPromptOverrides(next);
  };

  const restoreDefault = (id: PromptStepId) => {
    const step = templates.find(s => s.id === id);
    if (!step) return;
    const next: PromptOverrides = { ...overrides };
    delete next[id];
    onChangeOverrides(next);
    persistPromptOverrides(next);
    setDraftByStep((prev) => ({ ...prev, [id]: getDefaultDraft(step) }));
  };

  const isOverridden = (id: PromptStepId) => !!overrides[id];

  const showEmpty = ordered.length === 0 && !error;

  const renderEditor = () => {
    if (view === 'script_prompt') {
      const step = stepScript;
      if (!step) return null;
      const draft = draftByStep.script_generation ?? getDefaultDraft(step);
      return (
        <div className="rounded-xl border border-white/15 bg-black/30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <div className="text-sm font-black text-white">分镜脚本生成</div>
              {isOverridden('script_generation') && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-200">
                  已保存修改
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="text-[11px] px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-white transition border border-white/10"
                onClick={() => saveOverride('script_generation')}
              >
                保存修改
              </button>
              <button
                className="text-[11px] px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-white transition border border-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => restoreDefault('script_generation')}
                disabled={!isOverridden('script_generation')}
              >
                恢复默认
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <div className="text-[11px] text-orange-400 font-bold mb-2">System Prompt</div>
              <textarea
                className="w-full h-[220px] resize-y bg-black/50 text-zinc-100 text-xs rounded-xl border border-white/20 px-3 py-2 focus:outline-none focus:border-orange-500/60 custom-scroll"
                value={draft.system}
                onChange={(e) => setDraft('script_generation', { system: e.target.value })}
              />
            </div>
            <div>
              <div className="text-[11px] text-orange-400 font-bold mb-2">User Prompt</div>
              <textarea
                className="w-full h-[220px] resize-y bg-black/50 text-zinc-100 text-xs rounded-xl border border-white/20 px-3 py-2 focus:outline-none focus:border-orange-500/60 custom-scroll"
                value={draft.user}
                onChange={(e) => setDraft('script_generation', { user: e.target.value })}
              />
            </div>
          </div>
        </div>
      );
    }

    if (view === 'translation_prompt') {
      const step = stepTranslation;
      if (!step) return null;
      const draft = draftByStep.translation ?? getDefaultDraft(step);
      return (
        <div className="rounded-xl border border-white/15 bg-black/30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <div className="text-sm font-black text-white">视频翻译 Prompt </div>
              {isOverridden('translation') && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-200">
                  已保存修改
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="text-[11px] px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-white transition border border-white/10"
                onClick={() => saveOverride('translation')}
              >
                保存修改
              </button>
              <button
                className="text-[11px] px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-white transition border border-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => restoreDefault('translation')}
                disabled={!isOverridden('translation')}
              >
                恢复默认
              </button>
            </div>
          </div>

          <div className="p-4 space-y-3">
            <div className="text-[11px] text-orange-400 font-bold">System Prompt</div>
            <textarea
              className="w-full h-[520px] resize-y bg-black/50 text-zinc-100 text-xs rounded-xl border border-white/20 px-3 py-2 focus:outline-none focus:border-orange-500/60 custom-scroll"
              value={draft.system}
              onChange={(e) => setDraft('translation', { system: e.target.value })}
            />
          </div>
        </div>
      );
    }

    // generate_json
    return (
      <div className="rounded-xl border border-white/15 bg-black/30 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3 bg-white/[0.03]">
          <div className="text-xs text-zinc-300">
            先预览并修改本次请求，确认后再发送生成；不点「发送生成」不会消耗 token。
          </div>
          {debug ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => void debug.onPrepare()}
                disabled={debug.isPreparing || debug.isSending}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition border border-white/15 ${debug.isPreparing || debug.isSending ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-white/10 text-white hover:bg-white/15'}`}
              >
                {debug.isPreparing ? '生成中…' : '生成预览'}
              </button>
              <button
                onClick={() => void debug.onRefresh()}
                disabled={debug.isPreparing || debug.isSending}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition border border-white/15 ${debug.isPreparing || debug.isSending ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-white/10 text-white hover:bg-white/15'}`}
              >
                刷新预览
              </button>
              <button
                onClick={() => void debug.onSend()}
                disabled={debug.isPreparing || debug.isSending}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-2 ${debug.isPreparing || debug.isSending ? 'bg-zinc-700 text-zinc-300 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-orange-500 hover:brightness-110 text-white'}`}
              >
                {debug.isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                发送生成
              </button>
            </div>
          ) : (
            <div className="text-xs text-zinc-500">当前页面未接入生成调试能力。</div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-0">
          <div className="p-4 border-b xl:border-b-0 xl:border-r border-white/10 flex flex-col min-h-[320px]">
            <div className="text-[11px] font-bold tracking-widest uppercase text-orange-400 mb-3">请求 JSON</div>
            <textarea
              value={debug?.payloadText ?? ''}
              onChange={(e) => debug?.onChangePayloadText(e.target.value)}
              spellCheck={false}
              className="flex-1 min-h-[320px] w-full rounded-2xl border border-white/20 bg-black/40 p-4 text-xs text-zinc-100 font-mono leading-6 resize-none focus:outline-none focus:border-orange-500/60 custom-scroll"
            />
          </div>

          <div className="p-4 flex flex-col min-h-[320px]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-bold tracking-widest uppercase text-orange-400">最终模型输入</div>
              {debug?.preview && (
                <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                  <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5">{debug.preview.task_type}</span>
                  <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5">{debug.preview.api_method}</span>
                </div>
              )}
            </div>
            <pre className="flex-1 min-h-[320px] rounded-2xl border border-white/20 bg-black/40 p-4 text-xs text-zinc-200 font-mono leading-6 overflow-auto custom-scroll whitespace-pre-wrap break-all">
              {debug?.isPreparing && !debug?.preview
                ? '加载中…'
                : JSON.stringify(debug?.preview?.model_request || {}, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      className="fixed z-[9999] flex flex-col bg-zinc-950/85 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/10"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: 'calc(100vh - 16px)',
        overflow: 'hidden',
      }}
    >
      {/* Resize handles (edges + corners) */}
      {([
        { dir: 'n', cls: 'top-0 left-4 right-4 h-2 cursor-ns-resize' },
        { dir: 's', cls: 'bottom-0 left-4 right-4 h-2 cursor-ns-resize' },
        { dir: 'w', cls: 'left-0 top-4 bottom-4 w-2 cursor-ew-resize' },
        { dir: 'e', cls: 'right-0 top-4 bottom-4 w-2 cursor-ew-resize' },
        { dir: 'nw', cls: 'top-0 left-0 w-3 h-3 cursor-nwse-resize' },
        { dir: 'ne', cls: 'top-0 right-0 w-3 h-3 cursor-nesw-resize' },
        { dir: 'sw', cls: 'bottom-0 left-0 w-3 h-3 cursor-nesw-resize' },
        { dir: 'se', cls: 'bottom-0 right-0 w-3 h-3 cursor-nwse-resize' },
      ] as Array<{ dir: ResizeDir; cls: string }>).map((h) => (
        <div
          key={h.dir}
          className={`absolute z-[2] ${h.cls}`}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            resizeRef.current = {
              resizing: true,
              dir: h.dir,
              sx: e.clientX,
              sy: e.clientY,
              sw: size.w,
              sh: size.h,
              sl: pos.x,
              st: pos.y,
            };
          }}
        />
      ))}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/15 cursor-move select-none bg-black/20"
        onMouseDown={(e) => {
          const rect = (e.currentTarget.parentElement as HTMLDivElement | null)?.getBoundingClientRect();
          const ox = rect ? e.clientX - rect.left : 0;
          const oy = rect ? e.clientY - rect.top : 0;
          dragRef.current = { dragging: true, ox, oy };
        }}
      >
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <FileJson className="w-4 h-4 text-orange-400" />
          Prompt 调试（临时）
          <span className="ml-2 text-[11px] text-zinc-400">可拖动 · 可缩放 · 可关闭</span>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Top tabs (3 editable sections) */}
      <div className="px-4 py-3 border-b border-white/10 bg-black/10">
        <div className="flex items-center gap-3 overflow-x-auto custom-scroll pb-1">
          <button
            type="button"
            onClick={() => setView('script_prompt')}
            aria-pressed={view === 'script_prompt'}
            className={`shrink-0 px-4 py-2 rounded-2xl border text-xs font-black whitespace-nowrap transition-all duration-200 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 ${view === 'script_prompt'
              ? 'bg-white text-zinc-950 border-white/50 shadow-lg shadow-black/20'
              : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10 hover:border-white/20 hover:shadow-lg hover:shadow-orange-500/10'
            }`}
            title="分镜脚本生成 prompt"
          >
            分镜脚本生成 prompt
          </button>

          <button
            type="button"
            onClick={() => setView('generate_json')}
            aria-pressed={view === 'generate_json'}
            className={`shrink-0 px-4 py-2 rounded-2xl border text-xs font-black whitespace-nowrap transition-all duration-200 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 ${view === 'generate_json'
              ? 'bg-white text-zinc-950 border-white/50 shadow-lg shadow-black/20'
              : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10 hover:border-white/20 hover:shadow-lg hover:shadow-orange-500/10'
            }`}
            title="生成视频请求 JSON"
          >
            生成视频请求 JSON
          </button>

          <button
            type="button"
            onClick={() => setView('translation_prompt')}
            aria-pressed={view === 'translation_prompt'}
            className={`shrink-0 px-4 py-2 rounded-2xl border text-xs font-black whitespace-nowrap transition-all duration-200 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 ${view === 'translation_prompt'
              ? 'bg-white text-zinc-950 border-white/50 shadow-lg shadow-black/20'
              : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10 hover:border-white/20 hover:shadow-lg hover:shadow-orange-500/10'
            }`}
            title="目标语言翻译 prompt"
          >
            目标语言翻译 prompt
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 p-4 overflow-auto custom-scroll space-y-4">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            加载失败：{error}
            {onReload && (
              <button
                className="ml-3 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-white transition"
                onClick={onReload}
              >
                重试
              </button>
            )}
          </div>
        )}

        {showEmpty && !error && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-400">
            {loading ? '正在加载 prompt 模板…' : '如果一直为空，请检查后端 `GET /api/projects/prompt-templates/` 是否可访问。'}
          </div>
        )}

        {ordered.length > 0 && renderEditor()}

      </div>
    </div>
  );
}
