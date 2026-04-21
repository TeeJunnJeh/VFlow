import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScriptItem } from '../../utils/scriptUtils';
import { translations } from '../../i18n/translations';

type Translation = typeof translations['en'];

interface ShotTimelineBarProps {
  scripts: ScriptItem[];
  onUpdateScripts: (next: ScriptItem[]) => void;
  t: Translation;
}

const SEGMENT_LABEL_MIN_PX = 56;
const MIN_SHOT_DUR = 0.1;

const parseDur = (s: string): number => {
  const n = parseFloat(String(s).replace('s', ''));
  return Number.isFinite(n) ? n : 0;
};

const roundTenths = (n: number): number => Math.round(n * 10) / 10;

const truncateVisual = (visual: string): string => {
  const v = String(visual || '').trim();
  if (!v) return '';
  return v.length > 8 ? `${v.slice(0, 8)}...` : v;
};

const ShotTimelineBar = ({ scripts, onUpdateScripts, t }: ShotTimelineBarProps) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [barWidthPx, setBarWidthPx] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [menuIdx, setMenuIdx] = useState<number | null>(null);

  const draggingRef = useRef<{
    index: number;
    startX: number;
    startA: number;
    startB: number;
    totalPx: number;
    totalDur: number;
  } | null>(null);
  const scriptsRef = useRef(scripts);
  const onUpdateScriptsRef = useRef(onUpdateScripts);

  useEffect(() => {
    scriptsRef.current = scripts;
  }, [scripts]);

  useEffect(() => {
    onUpdateScriptsRef.current = onUpdateScripts;
  }, [onUpdateScripts]);

  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setBarWidthPx(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { segments, totalDur, cumulative } = useMemo(() => {
    const durs = scripts.map((s) => parseDur(s.dur));
    const total = durs.reduce((a, d) => a + d, 0);
    const cum: number[] = [];
    let acc = 0;
    for (const d of durs) {
      acc += d;
      cum.push(acc);
    }
    return { segments: durs, totalDur: total, cumulative: cum };
  }, [scripts]);

  const handleJumpToCard = useCallback((scriptId: number) => {
    const el = document.getElementById(`shot-card-${scriptId}`);
    if (!el) return;
    const wrap = wrapRef.current;
    const offset = wrap ? wrap.getBoundingClientRect().height + 8 : 72;
    el.style.scrollMarginTop = `${offset}px`;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const renumber = (list: ScriptItem[]): ScriptItem[] =>
    list.map((s, i) => ({ ...s, shot: (i + 1).toString() }));

  const makeNewShot = (list: ScriptItem[]): ScriptItem => {
    const newId = list.length > 0 ? Math.max(...list.map((s) => s.id)) + 1 : 1;
    return {
      id: newId,
      shot: '',
      type: 'Medium',
      dur: '2s',
      visual: '',
      audio: '',
      audioTranslation: '',
    };
  };

  const handleInsertAt = useCallback((index: number) => {
    const current = scriptsRef.current;
    const next = [...current];
    next.splice(index, 0, makeNewShot(current));
    onUpdateScriptsRef.current(renumber(next));
    setMenuIdx(null);
  }, []);

  const handleDeleteAt = useCallback((index: number) => {
    const current = scriptsRef.current;
    if (index < 0 || index >= current.length) return;
    const next = current.filter((_, i) => i !== index);
    onUpdateScriptsRef.current(renumber(next));
    setMenuIdx(null);
  }, []);

  useEffect(() => {
    if (menuIdx === null) return;
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-shot-timeline-menu="1"]')) return;
      setMenuIdx(null);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [menuIdx]);

  useEffect(() => {
    if (menuIdx !== null && menuIdx >= scripts.length) setMenuIdx(null);
  }, [scripts.length, menuIdx]);

  const handleMove = useCallback((e: MouseEvent) => {
    const d = draggingRef.current;
    if (!d || d.totalDur <= 0 || d.totalPx <= 0) return;
    const deltaPx = e.clientX - d.startX;
    const deltaSec = (deltaPx / d.totalPx) * d.totalDur;
    let a = d.startA + deltaSec;
    let b = d.startB - deltaSec;
    if (a < MIN_SHOT_DUR) {
      b += a - MIN_SHOT_DUR;
      a = MIN_SHOT_DUR;
    }
    if (b < MIN_SHOT_DUR) {
      a += b - MIN_SHOT_DUR;
      b = MIN_SHOT_DUR;
    }
    const ra = roundTenths(a);
    const rb = roundTenths(b);
    const current = scriptsRef.current;
    const next = current.map((s, i) => {
      if (i === d.index) return { ...s, dur: `${ra}s` };
      if (i === d.index + 1) return { ...s, dur: `${rb}s` };
      return s;
    });
    onUpdateScriptsRef.current(next);
  }, []);

  const handleUp = useCallback(() => {
    draggingRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('mouseup', handleUp);
  }, [handleMove]);

  useEffect(() => {
    return () => {
      if (draggingRef.current) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [handleMove, handleUp]);

  const startDragSeparator = useCallback((index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const bar = barRef.current;
    const current = scriptsRef.current;
    if (!bar || index < 0 || index >= current.length - 1) return;
    const totalPx = bar.getBoundingClientRect().width;
    const durs = current.map((s) => parseDur(s.dur));
    const totalDurLocal = durs.reduce((a, d) => a + d, 0);
    draggingRef.current = {
      index,
      startX: e.clientX,
      startA: durs[index],
      startB: durs[index + 1],
      totalPx,
      totalDur: totalDurLocal,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [handleMove, handleUp]);

  if (scripts.length === 0 || totalDur <= 0) return null;

  const shotLabel = t.wb_shot || 'Shot';
  const dragTip = t.wb_shot_timeline_drag_tip || 'Drag to adjust adjacent shot durations';

  return (
    <div ref={wrapRef} className="sticky top-0 z-20 -mx-1 px-1 pt-6 pb-2 bg-zinc-950/90 backdrop-blur-xl border-b border-white/5">
      <div
        ref={barRef}
        className="relative flex items-stretch rounded-md overflow-visible select-none"
      >
        <span className="absolute -top-4 left-0 text-[9px] text-zinc-400 select-none pointer-events-none whitespace-nowrap">
          0s
        </span>
        {scripts.map((s, i) => {
          const dur = segments[i] || 0;
          const ratio = dur / totalDur;
          const segmentPx = ratio * barWidthPx;
          const showFullLabel = segmentPx >= SEGMENT_LABEL_MIN_PX;
          const bgClass = i % 2 === 0
            ? 'bg-purple-500/70 hover:bg-purple-500/90'
            : 'bg-orange-500/70 hover:bg-orange-500/90';
          const tipText = truncateVisual(s.visual);
          return (
            <Fragment key={s.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleJumpToCard(s.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuIdx((prev) => (prev === i ? null : i));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleJumpToCard(s.id);
                  }
                }}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx((prev) => (prev === i ? null : prev))}
                className={`relative h-7 flex items-center justify-center text-[10px] text-white font-semibold cursor-pointer transition ${bgClass} ${i === 0 ? 'rounded-l-md' : ''} ${i === scripts.length - 1 ? 'rounded-r-md' : ''}`}
                style={{ flex: `${ratio} 0 0%`, minWidth: 0 }}
                title={tipText || undefined}
              >
                <span className="truncate px-1 leading-none">
                  {showFullLabel ? `${shotLabel} ${s.shot}` : s.shot}
                </span>
                {hoverIdx === i && menuIdx !== i && tipText && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md border border-white/10 bg-zinc-900/95 px-2 py-1 text-[10px] text-zinc-100 shadow-xl z-30">
                    {tipText}
                  </div>
                )}
                {menuIdx === i && (
                  <div
                    data-shot-timeline-menu="1"
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-40 flex items-center gap-1 rounded-md border border-white/10 bg-zinc-900/95 px-1.5 py-1 shadow-xl"
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleInsertAt(i); }}
                      className="px-2 py-1 rounded text-[10px] text-zinc-200 hover:bg-white/10 hover:text-orange-300 transition whitespace-nowrap"
                    >
                      {t.wb_shot_timeline_insert_before || 'Insert before'}
                    </button>
                    <span className="w-px h-3 bg-white/10" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleInsertAt(i + 1); }}
                      className="px-2 py-1 rounded text-[10px] text-zinc-200 hover:bg-white/10 hover:text-orange-300 transition whitespace-nowrap"
                    >
                      {t.wb_shot_timeline_insert_after || 'Insert after'}
                    </button>
                    <span className="w-px h-3 bg-white/10" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteAt(i); }}
                      className="px-2 py-1 rounded text-[10px] font-semibold bg-red-500/25 text-red-400 hover:bg-red-500/40 hover:text-red-300 transition whitespace-nowrap"
                    >
                      {t.wb_shot_timeline_delete || 'Delete'}
                    </button>
                  </div>
                )}
              </div>
              {i < scripts.length - 1 && (
                <div
                  role="separator"
                  aria-label={dragTip}
                  title={dragTip}
                  onMouseDown={(e) => startDragSeparator(i, e)}
                  className="relative w-[4px] shrink-0 bg-white/20 hover:bg-orange-400 cursor-col-resize transition"
                >
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-zinc-400 select-none pointer-events-none whitespace-nowrap">
                    {cumulative[i].toFixed(1)}s
                  </span>
                </div>
              )}
            </Fragment>
          );
        })}
        <span className="absolute -top-4 right-0 text-[9px] text-zinc-400 select-none pointer-events-none whitespace-nowrap">
          {totalDur.toFixed(1)}s
        </span>
      </div>
    </div>
  );
};

export default ShotTimelineBar;
