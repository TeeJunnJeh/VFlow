/**
 * Canvas-internal model chip selector.
 *
 * Visual style mirrors productImages/Common/ModelSelectorChips (horizontal mode)
 * but takes a plain `string` value so it can host video / image / script model ids.
 *
 * Used in:
 *   - SelectionActionBar (video / image generation step)
 *   - VideoNode / ImageNode in-node model picker
 *
 * The image-gen flow keeps using productImages/Common/ModelSelectorChips because
 * its iconSrc-based UI is paid for elsewhere; canvas uses the lighter text-only
 * variant since the node area is tighter.
 */
import React from 'react';

export type CanvasModelChipColor = 'orange' | 'purple' | 'blue' | 'emerald' | 'pink';

export interface CanvasModelChipOption {
  value: string;
  label: string;
  color?: CanvasModelChipColor;
}

interface CanvasModelChipsProps {
  value: string;
  onChange: (next: string) => void;
  options: CanvasModelChipOption[];
  size?: 'sm' | 'xs';
  className?: string;
}

const COLOR_ACTIVE: Record<CanvasModelChipColor, string> = {
  orange: 'border-orange-500/70 bg-orange-500/10 text-orange-200',
  purple: 'border-purple-500/70 bg-purple-500/10 text-purple-200',
  blue: 'border-blue-500/70 bg-blue-500/10 text-blue-200',
  emerald: 'border-emerald-500/70 bg-emerald-500/10 text-emerald-200',
  pink: 'border-pink-500/70 bg-pink-500/10 text-pink-200',
};

const INACTIVE =
  'border-white/10 bg-zinc-800/60 text-zinc-400 hover:border-white/25 hover:text-zinc-200';

export const CanvasModelChips: React.FC<CanvasModelChipsProps> = ({
  value,
  onChange,
  options,
  size = 'sm',
  className = '',
}) => {
  const padding = size === 'sm' ? 'px-2.5 py-1' : 'px-2 py-0.5';
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-[10px]';

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        const colorClass = active ? COLOR_ACTIVE[opt.color || 'orange'] : INACTIVE;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`${padding} ${textSize} font-medium rounded-md border transition-colors ${colorClass}`}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
