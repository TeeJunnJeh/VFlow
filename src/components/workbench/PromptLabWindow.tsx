import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, FileJson } from 'lucide-react';

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
  enabledSystem?: boolean;
  enabledUser?: boolean;
  system_prompt?: string;
  user_prompt?: string;
}>>;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const STORAGE_KEY = 'vflow_prompt_lab_overrides_v1';

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

export function savePromptOverrides(overrides: PromptOverrides) {
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
    if (step.enabledSystem && typeof step.system_prompt === 'string' && step.system_prompt.trim()) {
      payload.system_prompt = step.system_prompt;
    }
    if (stepId !== 'translation' && step.enabledUser && typeof step.user_prompt === 'string' && step.user_prompt.trim()) {
      payload.user_prompt = step.user_prompt;
    }
    if (Object.keys(payload).length) out[stepId] = payload;
  }
  return Object.keys(out).length ? out : null;
}

type Props = {
  templates: PromptStepTemplate[];
  loading?: boolean;
  error?: string | null;
  onReload?: () => void;
  overrides: PromptOverrides;
  onChangeOverrides: (next: PromptOverrides) => void;
  onClose: () => void;
};

export function PromptLabWindow({ templates, loading, error, onReload, overrides, onChangeOverrides, onClose }: Props) {
  const [pos, setPos] = useState({ x: 24, y: 88 });
  const dragRef = useRef<{ dragging: boolean; ox: number; oy: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const ordered = useMemo(() => {
    const map = new Map(templates.map(s => [s.id, s]));
    const ids: PromptStepId[] = ['script_generation', 'video_description', 'translation'];
    return ids.map(id => map.get(id)).filter(Boolean) as PromptStepTemplate[];
  }, [templates]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const st = dragRef.current;
      if (!st?.dragging) return;
      const nextX = e.clientX - st.ox;
      const nextY = e.clientY - st.oy;

      const el = rootRef.current;
      const w = el?.offsetWidth ?? 520;
      const h = el?.offsetHeight ?? 420;
      const maxX = window.innerWidth - w - 8;
      const maxY = window.innerHeight - h - 8;
      setPos({ x: clamp(nextX, 8, Math.max(8, maxX)), y: clamp(nextY, 8, Math.max(8, maxY)) });
    };
    const onUp = () => {
      if (dragRef.current) dragRef.current.dragging = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const setStep = (id: PromptStepId, patch: Partial<NonNullable<PromptOverrides[PromptStepId]>>) => {
    const prev = overrides[id] || {};
    const next = { ...overrides, [id]: { ...prev, ...patch } };
    onChangeOverrides(next);
    savePromptOverrides(next);
  };

  const fillFromDefaults = (id: PromptStepId) => {
    const t = templates.find(s => s.id === id);
    if (!t) return;
    setStep(id, {
      system_prompt: t.system_prompt ?? '',
      user_prompt: t.user_prompt ?? '',
    });
  };

  const clearStep = (id: PromptStepId) => {
    const next = { ...overrides };
    delete next[id];
    onChangeOverrides(next);
    savePromptOverrides(next);
  };

  return (
    <div
      ref={rootRef}
      className="fixed z-[9999] w-[560px] max-w-[92vw] bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl shadow-black/40"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/10 cursor-move select-none"
        onMouseDown={(e) => {
          const rect = (e.currentTarget.parentElement as HTMLDivElement | null)?.getBoundingClientRect();
          const ox = rect ? e.clientX - rect.left : 0;
          const oy = rect ? e.clientY - rect.top : 0;
          dragRef.current = { dragging: true, ox, oy };
        }}
      >
        <div className="flex items-center gap-2 text-white">
          <FileJson className="w-4 h-4 text-orange-400" />
          <div className="text-sm font-bold">Prompt 调试（临时）</div>
          <div className="text-[10px] text-zinc-400">可拖动 · 可关闭</div>
        </div>
        <button
          className="p-1 rounded hover:bg-white/10 text-zinc-300 hover:text-white transition"
          onClick={onClose}
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4 max-h-[70vh] overflow-auto">
        <div className="text-[12px] text-zinc-400 leading-relaxed">
          这里展示后端当前内置的 prompts（按调用顺序）。你可以勾选“覆盖”并编辑；后续生成请求会携带覆盖内容。
        </div>

        {typeof error === 'string' && error.trim() && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200 space-y-2">
            <div className="font-bold">加载失败</div>
            <div className="whitespace-pre-wrap break-words text-red-100/90">{error}</div>
            {onReload && (
              <button
                className="text-[11px] px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-white transition"
                onClick={onReload}
              >
                重试加载
              </button>
            )}
          </div>
        )}

        {ordered.length === 0 && !error && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-400">
            {loading ? '正在加载 prompt 模板…' : '暂无模板（检查后端 `GET /api/projects/prompt-templates/` 是否可访问）'}
          </div>
        )}

        {ordered.map((step) => {
          const st = overrides[step.id] || {};
          const showUser = step.id !== 'translation';
          return (
            <div key={step.id} className="rounded-xl border border-white/10 bg-black/30">
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                <div className="text-xs font-bold text-zinc-200">{step.title}</div>
                <div className="flex items-center gap-2">
                  <button
                    className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 transition"
                    onClick={() => fillFromDefaults(step.id)}
                    title="把默认内容填入编辑框"
                  >
                    填入默认
                  </button>
                  <button
                    className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 transition"
                    onClick={() => clearStep(step.id)}
                    title="清除本步骤覆盖（回到后端默认）"
                  >
                    清除覆盖
                  </button>
                </div>
              </div>

              <div className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-zinc-400">System Prompt</label>
                  <label className="text-[11px] text-zinc-400 flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-orange-500"
                      checked={!!st.enabledSystem}
                      onChange={(e) => setStep(step.id, { enabledSystem: e.target.checked })}
                    />
                    覆盖
                  </label>
                </div>
                <textarea
                  className="w-full h-[140px] resize-y bg-black/40 text-zinc-200 text-xs rounded-lg border border-white/10 px-3 py-2 focus:outline-none focus:border-orange-500/50"
                  value={typeof st.system_prompt === 'string' ? st.system_prompt : (step.system_prompt ?? '')}
                  onChange={(e) => setStep(step.id, { system_prompt: e.target.value })}
                />

                {showUser && (
                  <>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-zinc-400">User Prompt</label>
                      <label className="text-[11px] text-zinc-400 flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="accent-orange-500"
                          checked={!!st.enabledUser}
                          onChange={(e) => setStep(step.id, { enabledUser: e.target.checked })}
                        />
                        覆盖
                      </label>
                    </div>
                    <textarea
                      className="w-full h-[140px] resize-y bg-black/40 text-zinc-200 text-xs rounded-lg border border-white/10 px-3 py-2 focus:outline-none focus:border-orange-500/50"
                      value={typeof st.user_prompt === 'string' ? st.user_prompt : (step.user_prompt ?? '')}
                      onChange={(e) => setStep(step.id, { user_prompt: e.target.value })}
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}

        <div className="text-[11px] text-zinc-500">
          提示：覆盖内容会保存在本地（localStorage），刷新页面后仍然保留。关闭该临时功能时可直接删除本窗口组件与相关 payload 字段。
        </div>
      </div>
    </div>
  );
}
