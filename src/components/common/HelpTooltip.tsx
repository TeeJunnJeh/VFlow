import React from 'react';
import { HelpCircle } from 'lucide-react';

type TooltipAlign = 'left' | 'center' | 'right';

type HelpTooltipProps = {
  text: string;
  align?: TooltipAlign;
  className?: string;
};

const tooltipBaseClass =
  'absolute top-full mt-2 w-[280px] rounded-2xl border border-white/15 bg-zinc-950/90 px-3 py-2.5 text-[11px] leading-relaxed text-white/90 shadow-2xl shadow-black/40 backdrop-blur';

function alignClass(align: TooltipAlign) {
  if (align === 'left') return 'left-0 translate-x-0';
  if (align === 'right') return 'right-0 left-auto translate-x-0';
  return 'left-1/2 -translate-x-1/2';
}

export function HelpTooltip({ text, align = 'center', className }: HelpTooltipProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target && root.contains(event.target as Node)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className={`relative inline-flex items-center ${className || ''}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="inline-flex items-center text-zinc-500 hover:text-zinc-300"
        aria-label="原因说明"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div
          role="tooltip"
          className={[
            tooltipBaseClass,
            alignClass(align),
            "before:content-[''] before:absolute before:-top-1.5 before:h-3 before:w-3 before:rotate-45 before:bg-zinc-950/90 before:border-l before:border-t before:border-white/15",
            align === 'left'
              ? 'before:left-3 before:translate-x-0'
              : align === 'right'
                ? 'before:right-3 before:left-auto before:translate-x-0'
                : 'before:left-1/2 before:-translate-x-1/2',
          ].join(' ')}
        >
          {text}
        </div>
      ) : null}
    </span>
  );
}

