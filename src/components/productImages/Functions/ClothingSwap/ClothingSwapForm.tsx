import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Wand2 } from 'lucide-react';
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
import { DropdownSelect } from '../../../common/DropdownSelect';
import { AspectRatioPicker, CLOTHING_SWAP_RATIOS, ratioDescriptorsForLanguage } from '../../Common';

interface ClothingSwapFormProps {
  modelImage: File | null;
  garmentImage: File | null;
  modelReady?: boolean;
  garmentReady?: boolean;
  workspaceId?: string;
  isSubmitting?: boolean;
  backgroundImageReady?: boolean;
  onBackgroundChange?: (background: ClothingSwapBackground) => void;
  onSubmit: (params: ClothingSwapFormData) => Promise<void> | void;
  onReset: () => void;
  defaultParams?: Partial<ClothingSwapParams>;
  presetToken?: number;
}

type ClothingSwapFormData = Required<Pick<ClothingSwapParams, 'category' | 'targetColor' | 'background' | 'aspectRatio' | 'outputCount'>> & Pick<ClothingSwapParams, 'customBackgroundPrompt'>;

const CATEGORIES: ClothingSwapCategory[] = ['Top', 'Bottom', 'Full Body'];
const BACKGROUNDS: ClothingSwapBackground[] = ['model', 'runway', 'street', 'white_wall', 'custom', 'background_image'];
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

const colorSwatchStyle = (hex: string): React.CSSProperties => ({
  backgroundColor: hex,
  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.38), 0 0 0 1px rgba(255,255,255,0.18)',
});

const PRICING_MODEL_SLUG = 'gemini-2.5-flash-image';

const FALLBACK: ClothingSwapFormData = {
  category: 'Top',
  targetColor: 'Original',
  background: 'model',
  aspectRatio: '16:9',
  outputCount: 1,
  customBackgroundPrompt: '',
};

const VIDEO_NATIVE_RATIOS = new Set<string>(['16:9', '9:16']);

const buildStorageKey = (workspaceId?: string) => {
  const normalized = String(workspaceId || '').trim();
  return normalized ? `clothingSwapParams:${normalized}` : 'clothingSwapParams';
};

export const ClothingSwapForm: React.FC<ClothingSwapFormProps> = ({
  modelImage,
  garmentImage,
  modelReady,
  garmentReady,
  workspaceId,
  isSubmitting = false,
  backgroundImageReady = false,
  onBackgroundChange,
  onSubmit,
  onReset,
  defaultParams,
  presetToken = 0,
}) => {
  const { t, language } = useLanguage();
  const storageKey = useMemo(() => buildStorageKey(workspaceId), [workspaceId]);

  const mergedDefaults = useMemo(() => ({
    ...FALLBACK,
    ...(defaultParams || {}),
    customBackgroundPrompt: defaultParams?.customBackgroundPrompt || '',
  }) as ClothingSwapFormData, [defaultParams]);

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
    if (!presetToken) return;
    setFormData({ ...mergedDefaults });
  }, [mergedDefaults, presetToken]);

  useEffect(() => {
    onBackgroundChange?.(formData.background);
  }, [formData.background, onBackgroundChange]);

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
    if (key === 'white_wall') return t.cs_bg_white_wall;
    if (key === 'custom') return (t as any).cs_bg_custom || 'Custom';
    return (t as any).cs_bg_background_image || 'Add background image';
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

  const customBackgroundReady = formData.background !== 'custom' || String(formData.customBackgroundPrompt || '').trim().length > 0;
  const selectedBackgroundImageReady = formData.background !== 'background_image' || backgroundImageReady;
  const canSubmit = (modelReady ?? !!modelImage) && (garmentReady ?? !!garmentImage) && customBackgroundReady && selectedBackgroundImageReady && !isSubmitting;

  const ratioOptionHints = useMemo(() => {
    const hint = (t as any).cs_ratio_video_crop_warning || 'Video may be cropped';
    return CLOTHING_SWAP_RATIOS.more.reduce<Record<string, string>>((acc, ratio) => {
      if (!VIDEO_NATIVE_RATIOS.has(ratio)) acc[ratio] = hint;
      return acc;
    }, {});
  }, [t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await onSubmit({ ...formData });
  };

  const handleReset = () => {
    setFormData(mergedDefaults);
    onReset();
  };

  const colorOptions = COLOR_CHOICES.map((choice) => ({
    value: choice.key,
    label: (
      <span className="flex min-w-0 items-center gap-2">
        <span
          className="h-4 w-4 shrink-0 rounded-full border border-white/30"
          style={colorSwatchStyle(choice.hex)}
          aria-hidden="true"
        />
        <span className="truncate">{colorLabel(choice.key)}</span>
      </span>
    ),
  }));

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
                onClick={() => setFormData({ ...formData, background: item, customBackgroundPrompt: item === 'custom' ? formData.customBackgroundPrompt : '' })}
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
          {formData.background === 'custom' && (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                {(t as any).cs_custom_background_label || 'Custom background'}
              </label>
              <textarea
                value={formData.customBackgroundPrompt || ''}
                onChange={(e) => setFormData({ ...formData, customBackgroundPrompt: e.target.value })}
                maxLength={240}
                rows={3}
                className="w-full resize-none rounded-lg border border-white/10 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/10"
                placeholder={(t as any).cs_custom_background_placeholder || 'Describe the background you want'}
              />
              {!customBackgroundReady ? (
                <p className="mt-2 text-xs text-amber-300">{(t as any).cs_custom_background_required || 'Please enter a custom background.'}</p>
              ) : null}
            </div>
          )}
          {formData.background === 'background_image' && (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-zinc-400">
              {backgroundImageReady
                ? ((t as any).cs_background_image_ready || 'Background image selected.')
                : ((t as any).cs_background_image_required || 'Please add a background image in the materials panel.')}
            </div>
          )}
        </div>

        {/* Aspect ratio */}
        <div>
          <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.cs_aspect_ratio_label}</label>
          <AspectRatioPicker
            value={String(formData.aspectRatio || '16:9')}
            onChange={(next) => setFormData({ ...formData, aspectRatio: next as ClothingSwapAspectRatio })}
            primary={CLOTHING_SWAP_RATIOS.primary}
            more={CLOTHING_SWAP_RATIOS.more}
            labels={{
              more: language === 'zh' ? '更多比例' : 'More ratios',
              square: t.pi_gallery_ratio_group_square,
              vertical: t.pi_gallery_ratio_group_vertical,
              landscape: t.pi_gallery_ratio_group_landscape,
            }}
            descriptors={ratioDescriptorsForLanguage(language)}
            optionHints={ratioOptionHints}
          />
        </div>

        {/* Color */}
        <div>
          <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.cs_color_label}</label>
          <DropdownSelect
            value={formData.targetColor}
            options={colorOptions}
            onChange={(nextValue) => {
              const nextColor = COLOR_CHOICES.find((choice) => choice.key === nextValue)?.key ?? 'Original';
              setFormData({ ...formData, targetColor: nextColor });
            }}
            buttonClassName="h-10 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-white/20 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-orange-500/50"
            labelClassName="font-medium text-zinc-200"
            iconClassName="h-4 w-4 text-zinc-500"
            menuClassName="max-h-72 bg-zinc-950/95"
            renderInPortal
            renderOption={({ option, isSelected, onSelect }) => {
              const colorChoice = COLOR_CHOICES.find((choice) => choice.key === option.value) ?? COLOR_CHOICES[0];
              return (
                <button
                  type="button"
                  onClick={onSelect}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                    isSelected ? 'bg-orange-500/10 text-orange-200' : 'text-zinc-200 hover:bg-white/5'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-white/30"
                      style={colorSwatchStyle(colorChoice.hex)}
                      aria-hidden="true"
                    />
                    <span className="truncate">{colorLabel(colorChoice.key)}</span>
                  </span>
                  {isSelected ? <Check className="h-4 w-4 shrink-0 text-orange-300" /> : null}
                </button>
              );
            }}
          />
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
