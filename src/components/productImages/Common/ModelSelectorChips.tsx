/**
 * 商品图片生成 - 通用「生成模型」chip 选择器（NanoBanana / Flux / GPT）
 * 抽取自 ImagesGalleryView 内联实现，供 FirstFrame / SmartRepair / Gallery 共用。
 *
 * 视觉：
 *  - vertical（默认）：3 个 chip 上下堆叠（Gallery + FirstFrame 用）
 *  - horizontal：3 个 chip 水平排列、padding 压缩（SmartRepair 用，作为表单第一行）
 *
 * 注意：图标资源沿用 /product-gallery-examples/ 目录（已有，跨功能复用合理）
 */
import React from 'react';
import { Check, HelpCircle } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

export type ModelSelectorValue = 'nano-banana-pro' | 'flux-2-pro' | 'gpt-image-1.5';

export interface ModelSelectorOption {
  id: ModelSelectorValue;
  title: string;
  iconSrc: string;
  hintZh?: string;
  hintEn?: string;
}

export const DEFAULT_MODEL_SELECTOR_OPTIONS: ModelSelectorOption[] = [
  { id: 'nano-banana-pro', title: 'NanoBanana Pro', iconSrc: '/product-gallery-examples/nanobanana.svg' },
  { id: 'flux-2-pro', title: 'Flux 2 Pro', iconSrc: '/product-gallery-examples/flux.svg' },
  {
    id: 'gpt-image-1.5',
    title: 'GPT image 1.5',
    iconSrc: '/product-gallery-examples/gpt.svg',
    hintZh: '此模型生成等待时间略长',
    hintEn: 'This model takes a bit longer to generate',
  },
];

interface ModelSelectorChipsProps {
  value: ModelSelectorValue;
  onChange: (next: ModelSelectorValue) => void;
  options?: ModelSelectorOption[];
  label?: string;
  orientation?: 'vertical' | 'horizontal';
  disabled?: boolean;
  className?: string;
}

export const ModelSelectorChips: React.FC<ModelSelectorChipsProps> = ({
  value,
  onChange,
  options = DEFAULT_MODEL_SELECTOR_OPTIONS,
  label,
  orientation = 'vertical',
  disabled = false,
  className = '',
}) => {
  const { language } = useLanguage();
  const isZh = language === 'zh';
  const labelText = label || (isZh ? '生成模型' : 'Model');

  const containerClass =
    orientation === 'horizontal' ? 'flex flex-row flex-wrap gap-2' : 'flex flex-col gap-3';

  const chipBaseClass =
    orientation === 'horizontal'
      ? 'flex-1 min-w-[140px] rounded-xl border px-3 py-2 transition flex items-center gap-2.5'
      : 'w-full text-left rounded-2xl border p-3 transition flex items-center gap-4';

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">
        {labelText}
      </div>

      <div className={containerClass}>
        {options.map((opt) => {
          const active = value === opt.id;
          const hint = isZh ? opt.hintZh : opt.hintEn;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.id)}
              className={[
                chipBaseClass,
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
                'disabled:cursor-not-allowed disabled:opacity-60',
                active
                  ? 'border-orange-500/70 bg-orange-500/10 shadow-lg shadow-orange-500/10'
                  : 'border-white/10 bg-black/20 hover:bg-white/5',
              ].join(' ')}
              aria-pressed={active}
            >
              <img
                src={opt.iconSrc}
                alt=""
                className={orientation === 'horizontal' ? 'w-4 h-4 shrink-0' : 'w-5 h-5 shrink-0'}
              />

              <div className="flex-1 min-w-0">
                <div
                  className={[
                    orientation === 'horizontal' ? 'text-[12px]' : 'text-[14px]',
                    'font-black tracking-wide text-zinc-200 truncate flex items-center gap-1.5',
                  ].join(' ')}
                >
                  {opt.title}
                  {hint ? (
                    <span className="relative shrink-0">
                      <HelpCircle
                        className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-help"
                        onMouseEnter={(e: any) => {
                          const tip = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (!tip) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          tip.style.left = `${rect.left + rect.width / 2}px`;
                          tip.style.top = `${rect.top}px`;
                          tip.style.display = 'block';
                        }}
                        onMouseLeave={(e: any) => {
                          const tip = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (tip) tip.style.display = 'none';
                        }}
                      />
                      <span
                        className="fixed -translate-x-1/2 -translate-y-full -mt-2 w-72 px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-[11px] leading-relaxed text-zinc-200 shadow-xl text-center whitespace-normal break-words pointer-events-none"
                        style={{ display: 'none', zIndex: 9999 }}
                      >
                        {hint}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>

              <div
                className={[
                  orientation === 'horizontal' ? 'flex shrink-0' : 'flex w-14 shrink-0 flex-col items-center',
                ].join(' ')}
              >
                <div
                  className={[
                    'w-4 h-4 rounded-full border flex items-center justify-center',
                    active ? 'border-orange-500 bg-orange-500' : 'border-white/25 bg-transparent',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {active ? <Check className="w-2.5 h-2.5 text-white" /> : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
