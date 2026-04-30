import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

/**
 * 「比例分组」语义——只保留 横屏 / 竖屏 / 正方形 三类（去掉了原 flex「灵活」一类）。
 * - 5:4（w>h）归 landscape
 * - 4:5（h>w）归 vertical
 * 1:1 是 square，但 1:1 永远在 primary chip 行展示，因此 popover 实际只用 vertical 和 landscape。
 */
const RATIO_GROUP: Record<string, 'square' | 'vertical' | 'landscape'> = {
  '1:1': 'square',
  '9:16': 'vertical',
  '4:5': 'vertical',
  '3:4': 'vertical',
  '2:3': 'vertical',
  '5:4': 'landscape',
  '4:3': 'landscape',
  '3:2': 'landscape',
  '16:9': 'landscape',
  '21:9': 'landscape',
};

const GROUP_ORDER: Array<'vertical' | 'landscape'> = ['vertical', 'landscape'];

export interface AspectRatioPickerLabels {
  more: string;       // "更多比例" / "More ratios"
  vertical: string;   // "竖屏"
  landscape: string;  // "横屏"
}

const FALLBACK_LABELS: AspectRatioPickerLabels = {
  more: 'More ratios',
  vertical: 'Vertical',
  landscape: 'Landscape',
};

export interface AspectRatioPickerProps {
  value: string;
  onChange: (value: string) => void;
  primary: string[];
  more?: string[];
  disabled?: boolean;
  labels?: Partial<AspectRatioPickerLabels>;
  /** 每个比例对应的描述文字，仅在 popover 内展示，例如 {'21:9': '超宽'}。chip 行永远只显示数字。 */
  descriptors?: Record<string, string>;
  className?: string;
  /** chip 内边距尺寸：sm 给 ImagesGallery 的紧凑卡片用；md 给独立表单用 */
  size?: 'sm' | 'md';
}

export const AspectRatioPicker: React.FC<AspectRatioPickerProps> = ({
  value,
  onChange,
  primary,
  more = [],
  disabled = false,
  labels: labelsProp,
  descriptors,
  className = '',
  size = 'md',
}) => {
  const labels: AspectRatioPickerLabels = { ...FALLBACK_LABELS, ...labelsProp };
  const moreSet = new Set(more);
  const isInMore = moreSet.has(value);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const triggerEl = triggerRef.current;
      if (!triggerEl) return;
      const rect = triggerEl.getBoundingClientRect();
      const minWidth = 220;
      // 默认让 popover 右对齐到 trigger 的右边；如果会超出窗口左边就 clamp
      const desiredLeft = rect.right - minWidth;
      const left = Math.max(8, Math.min(desiredLeft, window.innerWidth - minWidth - 8));
      setPopoverStyle({
        position: 'fixed',
        left,
        top: rect.bottom + 6,
        minWidth,
        zIndex: 1000,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  const sizeClasses = size === 'sm' ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs';
  const baseChip = `${sizeClasses} rounded-xl font-medium border transition`;
  const inactiveChip = 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:bg-white/5';
  const activeChip = 'border-orange-500/60 bg-orange-500/10 text-orange-200';
  const disabledChip = 'opacity-50 cursor-not-allowed';

  const handleSelectMore = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const grouped: Record<'vertical' | 'landscape', string[]> = {
    vertical: [],
    landscape: [],
  };
  for (const r of more) {
    const g = RATIO_GROUP[r];
    if (g === 'vertical' || g === 'landscape') {
      grouped[g].push(r);
    }
  }
  const groupLabel = {
    vertical: labels.vertical,
    landscape: labels.landscape,
  };

  const popoverNode = (
    <div
      ref={popoverRef}
      style={popoverStyle}
      className="rounded-xl border border-white/10 bg-zinc-950/95 backdrop-blur-sm shadow-2xl py-1 max-h-72 overflow-auto custom-scroll"
      role="listbox"
    >
      {GROUP_ORDER.map((g) => {
        const items = grouped[g];
        if (items.length === 0) return null;
        return (
          <div key={g} className="py-1">
            <div className="px-3 mb-1 text-[11px] uppercase tracking-wide text-zinc-500">
              {groupLabel[g]}
            </div>
            {items.map((r) => {
              const selected = r === value;
              const desc = descriptors?.[r];
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleSelectMore(r)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-xs transition ${
                    selected ? 'bg-orange-500/15 text-orange-200' : 'text-zinc-200 hover:bg-white/5'
                  }`}
                  role="option"
                  aria-selected={selected}
                >
                  <span className="font-medium tabular-nums">{r}</span>
                  {desc ? <span className="text-[11px] text-zinc-400">{desc}</span> : null}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {primary.map((r) => {
        const selected = r === value;
        return (
          <button
            key={r}
            type="button"
            disabled={disabled}
            onClick={() => onChange(r)}
            className={`${baseChip} ${selected ? activeChip : inactiveChip} ${disabled ? disabledChip : ''}`}
            aria-pressed={selected}
          >
            {r}
          </button>
        );
      })}

      {more.length > 0 && (
        <>
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            onClick={() => setOpen((prev) => !prev)}
            className={`${baseChip} inline-flex items-center gap-1 ${isInMore ? activeChip : inactiveChip} ${disabled ? disabledChip : ''}`}
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            {isInMore ? value : labels.more}
            <ChevronDown className={`w-3.5 h-3.5 transition ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && !disabled && createPortal(popoverNode, document.body)}
        </>
      )}
    </div>
  );
};
