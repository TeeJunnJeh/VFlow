import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { billingApi } from '../../../../services/billing';
import type {
  ClothingSwapAspectRatio,
  ClothingSwapBackground,
  ClothingSwapCategory,
  ClothingSwapColor,
  ClothingSwapOutputCount,
  ClothingSwapParams,
} from '../../../../types/productImages';
import { formatCreditAmount, roundCreditTenths } from '../../../../utils/credits';

interface ClothingSwapFormProps {
  modelImage: File | null;
  garmentImage: File | null;
  workspaceId?: string;
  isSubmitting?: boolean;
  onSubmit: (params: Required<Pick<ClothingSwapParams, 'category' | 'targetColor' | 'background' | 'aspectRatio' | 'outputCount'>>) => Promise<void> | void;
  onReset: () => void;
  defaultParams?: Partial<ClothingSwapParams>;
}

const CATEGORIES: ClothingSwapCategory[] = ['Top', 'Bottom', 'Full Body'];
const BACKGROUNDS: ClothingSwapBackground[] = ['model', 'runway', 'street', 'white_wall'];
const ASPECT_RATIOS: ClothingSwapAspectRatio[] = [
  '1:1', '2:3', '3:2', '3:4', '4:3',
  '4:5', '5:4', '9:16', '16:9', '21:9',
];
const OUTPUT_COUNTS: ClothingSwapOutputCount[] = [1, 2, 3, 4];

interface ColorChoice {
  key: ClothingSwapColor;
  hex: string;
}
const COLOR_CHOICES: ColorChoice[] = [
  { key: 'Original', hex: '#d4d4d8' },
  { key: 'Red', hex: '#ef4444' },
  { key: 'Orange', hex: '#f97316' },
  { key: 'Yellow', hex: '#eab308' },
  { key: 'Green', hex: '#22c55e' },
  { key: 'Blue', hex: '#3b82f6' },
  { key: 'Purple', hex: '#a855f7' },
  { key: 'Pink', hex: '#ec4899' },
  { key: 'Black', hex: '#09090b' },
  { key: 'White', hex: '#fafafa' },
];

const PRICING_MODEL_SLUG = 'gemini-2.5-flash-image';

const FALLBACK: Required<Pick<ClothingSwapParams, 'category' | 'targetColor' | 'background' | 'aspectRatio' | 'outputCount'>> = {
  category: 'Top',
  targetColor: 'Original',
  background: 'model',
  aspectRatio: '1:1',
  outputCount: 1,
};

const buildStorageKey = (workspaceId?: string) => {
  const normalized = String(workspaceId || '').trim();
  return normalized ? `clothingSwapParams:${normalized}` : 'clothingSwapParams';
};

export const ClothingSwapForm: React.FC<ClothingSwapFormProps> = ({
  modelImage,
  garmentImage,
  workspaceId,
  isSubmitting = false,
  onSubmit,
  onReset,
  defaultParams,
}) => {
  const { t } = useLanguage();
  const storageKey = useMemo(() => buildStorageKey(workspaceId), [workspaceId]);

  const mergedDefaults = useMemo(() => ({
    ...FALLBACK,
    ...(defaultParams || {}),
  }) as typeof FALLBACK, [defaultParams]);

  const [formData, setFormData] = useState<typeof FALLBACK>(() => {
    const base = { ...mergedDefaults };
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { ...base, ...parsed };
        }
      }
    } catch {
      /* ignore */
    }
    return base;
  });

  useEffect(() => {
    let next = { ...mergedDefaults };
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          next = { ...next, ...parsed };
        }
      }
    } catch {
      /* ignore */
    }
    setFormData(next);
  }, [mergedDefaults, storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(formData));
    } catch {
      /* ignore */
    }
  }, [formData, storageKey]);

  const [modelRate, setModelRate] = useState<number>(0);
  useEffect(() => {
    let alive = true;
    void billingApi.getOverview()
      .then((res) => {
        if (!alive) return;
        const rate = Number(res?.data?.pricing?.image?.models?.[PRICING_MODEL_SLUG]?.rate || 0);
        setModelRate(Number.isFinite(rate) && rate > 0 ? rate : 0);
      })
      .catch(() => { if (alive) setModelRate(0); });
    return () => { alive = false; };
  }, []);

  const estimatedCost = useMemo(() => {
    const units = Math.max(1, Number(formData.outputCount || 1));
    if (!Number.isFinite(modelRate) || modelRate <= 0) return 0;
    return Math.max(0, roundCreditTenths(modelRate * units));
  }, [modelRate, formData.outputCount]);

  const categoryLabel = useCallback((key: ClothingSwapCategory) => {
    if (key === 'Top') return t.cs_category_top;
    if (key === 'Bottom') return t.cs_category_bottom;
    return t.cs_category_full;
  }, [t]);

  const backgroundLabel = useCallback((key: ClothingSwapBackground) => {
    if (key === 'model') return t.cs_bg_model;
    if (key === 'runway') return t.cs_bg_runway;
    if (key === 'street') return t.cs_bg_street;
    return t.cs_bg_white_wall;
  }, [t]);

  const colorLabel = useCallback((key: ClothingSwapColor): string => {
    const map: Record<ClothingSwapColor, string> = {
      Original: t.cs_color_original,
      Red: t.cs_color_red,
      Orange: t.cs_color_orange,
      Yellow: t.cs_color_yellow,
      Green: t.cs_color_green,
      Blue: t.cs_color_blue,
      Purple: t.cs_color_purple,
      Pink: t.cs_color_pink,
      Black: t.cs_color_black,
      White: t.cs_color_white,
    };
    return map[key] || key;
  }, [t]);

  const canSubmit = !!modelImage && !!garmentImage && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await onSubmit({ ...formData });
  };

  const handleReset = () => {
    setFormData(mergedDefaults);
    onReset();
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="space-y-6">
        {/* Category */}
        <div>
          <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.cs_category_label}</label>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFormData({ ...formData, category: item })}
                className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${
                  formData.category === item
                    ? 'border-orange-500/60 bg-orange-500/10 text-orange-200'
                    : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:bg-white/5'
                }`}
              >
                {categoryLabel(item)}
              </button>
            ))}
          </div>
        </div>

        {/* Background */}
        <div>
          <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.cs_background_label}</label>
          <div className="grid grid-cols-2 gap-2">
            {BACKGROUNDS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFormData({ ...formData, background: item })}
                className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${
                  formData.background === item
                    ? 'border-orange-500/60 bg-orange-500/10 text-orange-200'
                    : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:bg-white/5'
                }`}
              >
                {backgroundLabel(item)}
              </button>
            ))}
          </div>
        </div>

        {/* Aspect ratio */}
        <div>
          <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.cs_aspect_ratio_label}</label>
          <div className="grid grid-cols-5 gap-2">
            {ASPECT_RATIOS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFormData({ ...formData, aspectRatio: item })}
                className={`px-2 py-2 rounded-xl text-xs font-medium border transition ${
                  formData.aspectRatio === item
                    ? 'border-orange-500/60 bg-orange-500/10 text-orange-200'
                    : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:bg-white/5'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div>
          <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.cs_color_label}</label>
          <div className="flex flex-wrap gap-2">
            {COLOR_CHOICES.map((c) => {
              const selected = formData.targetColor === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  title={colorLabel(c.key)}
                  onClick={() => setFormData({ ...formData, targetColor: c.key })}
                  className={`w-8 h-8 rounded-full border-2 transition ${
                    selected ? 'border-orange-400 ring-2 ring-orange-400/40' : 'border-white/20 hover:border-white/40'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              );
            })}
          </div>
        </div>

        {/* Output count */}
        <div>
          <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.cs_output_count_label}</label>
          <div className="grid grid-cols-4 gap-2">
            {OUTPUT_COUNTS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFormData({ ...formData, outputCount: item })}
                className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${
                  formData.outputCount === item
                    ? 'border-orange-500/60 bg-orange-500/10 text-orange-200'
                    : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:bg-white/5'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-zinc-700">
          <button
            type="submit"
            disabled={!canSubmit}
            className={`flex-1 grid w-full grid-cols-[1fr_auto_1fr] items-center px-4 py-3 rounded-lg text-sm font-bold border transition ${
              !canSubmit
                ? 'border-white/10 bg-black/20 text-zinc-500 cursor-not-allowed opacity-60'
                : 'border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300'
            }`}
          >
            <span aria-hidden="true" className="min-w-0" />
            <span className="inline-flex min-w-0 items-center justify-center gap-1.5 justify-self-center text-center">
              <Wand2 className="h-4 w-4 shrink-0" />
              {isSubmitting ? t.cs_btn_generating : t.cs_btn_generate}
            </span>
            <span className="justify-self-end self-center text-right">
              {estimatedCost > 0 ? (
                <span className="whitespace-nowrap text-[10px] font-semibold tabular-nums text-orange-100/80">
                  {`-${formatCreditAmount(estimatedCost)} ${t.v_points || 'V点'}`}
                </span>
              ) : null}
            </span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={isSubmitting}
            className="px-4 py-3 bg-white/5 border border-white/10 text-zinc-300 rounded-lg hover:bg-white/10 transition disabled:opacity-50 font-medium"
          >
            {t.ff_reset}
          </button>
        </div>
      </div>
    </form>
  );
};
