import React, { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Wand2 } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { DropdownSelect } from '../../../common/DropdownSelect';
import { billingApi } from '../../../../services/billing';
import { productImagesApi } from '../../../../services/productImagesApi';
import type { FirstFrameAspectRatio, FirstFrameModel, FirstFrameOpeningScene, FirstFrameParams } from '../../../../types/productImages';
import { formatCreditAmount, roundCreditTenths } from '../../../../utils/credits';
import { AspectRatioPicker, firstFrameRatiosForModel, ratioDescriptorsForLanguage } from '../../Common';

interface FirstFrameFormProps {
  images: File[];
  onSubmit: (params: FirstFrameParams) => Promise<void>;
  isSubmitting?: boolean;
  onReset: () => void;
  defaultParams?: Partial<FirstFrameParams>;
  applyVersion?: number;
  onChange?: (params: FirstFrameParams) => void;
  workspaceId?: string;
}

const buildStorageKey = (workspaceId?: string) => {
  const normalized = String(workspaceId || '').trim();
  return normalized ? `firstFrameParams:${normalized}` : 'firstFrameParams';
};

const FALLBACK_PARAMS: FirstFrameParams = {
  prompt: '',
  openingScene: 'person_selling',
  aspectRatio: '9:16',
  model: 'nano-banana-pro',
  outputCount: 4,
};

const NANO_BANANA_FIRST_FRAME_MODEL: FirstFrameModel = 'nano-banana-pro';
const GPT_FIRST_FRAME_MODELS: FirstFrameModel[] = ['gpt-image-2', 'gpt-image-1.5'];
const VISIBLE_FIRST_FRAME_MODELS: FirstFrameModel[] = [
  NANO_BANANA_FIRST_FRAME_MODEL,
  'gpt-image-2',
  'gpt-image-1.5',
];

const isGptFirstFrameModel = (model?: FirstFrameModel) => (
  GPT_FIRST_FRAME_MODELS.includes(model as FirstFrameModel)
);

const normalizeFirstFrameModel = (model?: FirstFrameParams['model']): FirstFrameModel => (
  VISIBLE_FIRST_FRAME_MODELS.includes(model as FirstFrameModel)
    ? model as FirstFrameModel
    : NANO_BANANA_FIRST_FRAME_MODEL
);

const getFirstFrameAspectRatioValues = (model?: FirstFrameModel): FirstFrameAspectRatio[] => {
  const allRatios: FirstFrameAspectRatio[] = ['1:1', '9:16', '4:5', '3:4', '2:3', '16:9', '4:3', '3:2', '5:4', '21:9'];
  const gptRatios: FirstFrameAspectRatio[] = ['1:1', '2:3', '3:2'];
  return isGptFirstFrameModel(model) ? gptRatios : allRatios;
};

const normalizeFirstFrameAspectRatio = (
  value: FirstFrameParams['aspectRatio'],
  model: FirstFrameParams['model']
): FirstFrameAspectRatio => {
  const options = getFirstFrameAspectRatioValues(normalizeFirstFrameModel(model));
  return options.includes(value as FirstFrameAspectRatio) ? value as FirstFrameAspectRatio : options[0];
};

const normalizeFirstFrameOutputCount = (value: unknown): NonNullable<FirstFrameParams['outputCount']> => {
  const count = Math.round(Number(value || 1));
  if (!Number.isFinite(count)) return 1;
  return Math.max(1, Math.min(4, count)) as NonNullable<FirstFrameParams['outputCount']>;
};

const normalizeFirstFrameOpeningScene = (value?: FirstFrameParams['openingScene']): FirstFrameOpeningScene => {
  const allowed: FirstFrameOpeningScene[] = ['person_selling', 'product_showcase', 'usage_demo', 'brand_ad'];
  return allowed.includes(value as FirstFrameOpeningScene) ? value as FirstFrameOpeningScene : 'person_selling';
};

const normalizeFirstFrameParams = (params: FirstFrameParams): FirstFrameParams => {
  const model = NANO_BANANA_FIRST_FRAME_MODEL;
  return {
    ...params,
    model,
    openingScene: normalizeFirstFrameOpeningScene(params.openingScene),
    aspectRatio: normalizeFirstFrameAspectRatio(params.aspectRatio, model),
    outputCount: normalizeFirstFrameOutputCount(params.outputCount),
  };
};

const pricingModelKeyForFirstFrame = (model?: FirstFrameModel): string => (
  model === NANO_BANANA_FIRST_FRAME_MODEL ? 'gemini-3-pro-image-preview' : String(model || '')
);

export const FirstFrameForm: React.FC<FirstFrameFormProps> = ({
  images,
  onSubmit,
  isSubmitting = false,
  onReset,
  defaultParams,
  applyVersion = 0,
  onChange,
  workspaceId,
}) => {
  const { t, language } = useLanguage();
  const storageKey = useMemo(() => buildStorageKey(workspaceId), [workspaceId]);

  const mergedDefaultParams = useMemo<FirstFrameParams>(
    () => ({
      ...FALLBACK_PARAMS,
      ...(defaultParams || {}),
    }),
    [defaultParams]
  );

  const models = useMemo(
    () => [
      { label: 'Nano Banana Pro', value: 'nano-banana-pro' },
      { label: 'GPT Image 2', value: 'gpt-image-2' },
      { label: 'GPT Image 1.5', value: 'gpt-image-1.5' },
    ],
    []
  );

  const openingSceneOptions = useMemo(
    () => [
      { label: t.ff_opening_scene_person_selling, value: 'person_selling' },
      { label: t.ff_opening_scene_product_showcase, value: 'product_showcase' },
      { label: t.ff_opening_scene_usage_demo, value: 'usage_demo' },
      { label: t.ff_opening_scene_brand_ad, value: 'brand_ad' },
    ],
    [t]
  );

  const [isPolishingPrompt, setIsPolishingPrompt] = useState(false);
  const [imageModelRates, setImageModelRates] = useState<Record<string, number>>({});
  const [formData, setFormData] = useState<FirstFrameParams>(() => {
    const baseDefaults: FirstFrameParams = normalizeFirstFrameParams({ ...mergedDefaultParams });
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<FirstFrameParams>;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return normalizeFirstFrameParams({ ...baseDefaults, ...parsed });
        }
      }
    } catch {
      // Ignore corrupted local cache and fallback to defaults.
    }
    return baseDefaults;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const firstFrameRatioConfig = useMemo(
    () => firstFrameRatiosForModel(formData.model),
    [formData.model],
  );

  useEffect(() => {
    setFormData((prev) => {
      const normalized = normalizeFirstFrameParams(prev);
      if (normalized.model === prev.model && normalized.aspectRatio === prev.aspectRatio) return prev;
      return normalized;
    });
  }, [formData.aspectRatio, formData.model]);

  useEffect(() => {
    if (applyVersion > 0) {
      setFormData(normalizeFirstFrameParams({ ...mergedDefaultParams }));
      setErrors({});
      return;
    }

    let nextFormData: FirstFrameParams = normalizeFirstFrameParams({ ...mergedDefaultParams });
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<FirstFrameParams>;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          nextFormData = normalizeFirstFrameParams({ ...mergedDefaultParams, ...parsed });
        }
      }
    } catch {
      // Ignore corrupted local cache and fallback to defaults.
    }
    setFormData(nextFormData);
    setErrors({});
  }, [applyVersion, mergedDefaultParams, storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(formData));
    } catch {
      // Ignore localStorage write failures.
    }
    onChange?.(formData);
  }, [formData, onChange, storageKey]);

  useEffect(() => {
    let alive = true;
    void billingApi.getOverview()
      .then((res) => {
        if (!alive) return;
        const models = (res?.data?.pricing?.image?.models || {}) as Record<string, any>;
        const nextRates: Record<string, number> = {};
        Object.entries(models).forEach(([key, value]) => {
          const rate = Number((value as any)?.rate || 0);
          if (Number.isFinite(rate) && rate > 0) nextRates[String(key)] = rate;
        });
        setImageModelRates(nextRates);
      })
      .catch(() => {
        if (alive) setImageModelRates({});
      });
    return () => {
      alive = false;
    };
  }, []);

  const estimatedCost = useMemo(() => {
    const modelKey = pricingModelKeyForFirstFrame(formData.model);
    const rate = Number(imageModelRates[modelKey] || 0);
    const units = Math.max(1, Number(formData.outputCount || 1));
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return Math.max(0, roundCreditTenths(rate * units));
  }, [formData.model, formData.outputCount, imageModelRates]);

  const validateForm = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!String(formData.prompt || '').trim()) nextErrors.prompt = '请先填写生成要求';
    if (!formData.aspectRatio) nextErrors.aspectRatio = t.ff_validation_choose_aspect_ratio;
    if (!formData.model) nextErrors.model = t.ff_validation_choose_style;

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    await onSubmit({
      ...formData,
      prompt: String(formData.prompt || '').trim(),
    });
  };

  const handlePolishPrompt = async () => {
    const rawPrompt = String(formData.prompt || '').trim();
    if (!rawPrompt) {
      setErrors((prev) => ({ ...prev, prompt: '请先填写生成要求' }));
      return;
    }

    setIsPolishingPrompt(true);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.prompt;
      return next;
    });

    try {
      const polished = await productImagesApi.polishFirstFramePrompt(rawPrompt, language);
      setFormData((prev) => ({
        ...prev,
        prompt: polished,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '提示词润色失败，请稍后重试';
      setErrors((prev) => ({ ...prev, prompt: message }));
    } finally {
      setIsPolishingPrompt(false);
    }
  };

  const handleReset = () => {
    setFormData(mergedDefaultParams);
    setErrors({});
    onReset();
  };

  const updateOutputCount = (delta: number) => {
    setFormData((prev) => ({
      ...prev,
      outputCount: normalizeFirstFrameOutputCount(Number(prev.outputCount || 1) + delta),
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="space-y-6">
        <div>
          <div className="mb-4">
            <label className="block text-sm text-zinc-300 mb-2 font-medium">
              {t.ff_opening_scene_label}
            </label>
            <DropdownSelect
              value={formData.openingScene || 'person_selling'}
              options={openingSceneOptions}
              onChange={(value) => setFormData({ ...formData, openingScene: normalizeFirstFrameOpeningScene(value as FirstFrameOpeningScene) })}
              buttonClassName="w-full bg-zinc-900/70 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800"
              iconClassName="w-4 h-4 text-zinc-500"
              optionClassName="text-sm"
            />
          </div>

          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="block text-sm text-zinc-300 font-medium">
              {t.ff_prompt_label || '填写生成要求'}
            </label>
            <button
              type="button"
              onClick={() => void handlePolishPrompt()}
              disabled={isPolishingPrompt || isSubmitting}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition ${isPolishingPrompt || isSubmitting ? 'border-orange-500/30 bg-orange-500/5 text-orange-200/70 cursor-not-allowed' : 'border-orange-500/60 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20'}`}
            >
              <Wand2 className="h-3.5 w-3.5 shrink-0" />
              {isPolishingPrompt
                ? (t.wb_ai_opt_prompt_generating || '润色中...')
                : (t.ff_prompt_optimize_btn || 'AI优化文案')}
            </button>
          </div>
          <textarea
            value={formData.prompt || ''}
            onChange={(e) => {
              const nextPrompt = e.target.value;
              setFormData({ ...formData, prompt: nextPrompt });
              if (errors.prompt) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.prompt;
                  return next;
                });
              }
            }}
            rows={5}
            placeholder={t.ff_prompt_placeholder || '请输入你想生成的首帧画面内容，例如主体、场景、构图、风格'}
            className={`h-38 w-full resize-none overflow-y-auto rounded-xl border bg-zinc-900/70 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500/30 ${errors.prompt ? 'border-red-500' : 'border-white/10'}`}
          />
          {errors.prompt ? <p className="text-red-400 text-xs mt-1">{errors.prompt}</p> : null}
        </div>

        <div className="space-y-6">
          <div className="hidden">
            <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.wb_model_title || t.ff_style_label}</label>
            <DropdownSelect
              value={formData.model || ''}
              options={models}
              onChange={(value) => {
                const nextModel = value as FirstFrameModel;
                setFormData({
                  ...formData,
                  model: nextModel,
                  aspectRatio: normalizeFirstFrameAspectRatio(formData.aspectRatio, nextModel),
                });
              }}
              buttonClassName={`w-full bg-zinc-900/70 border rounded-xl px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 ${errors.model ? 'border-red-500' : 'border-white/10'}`}
              iconClassName="w-4 h-4 text-zinc-500"
              optionClassName="text-sm"
            />
            {errors.model && <p className="text-red-400 text-xs mt-1">{errors.model}</p>}
          </div>

          <div className="space-y-4">
            {/* Row 1: 比例选择独占整行 */}
            <div>
              <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.ff_aspect_ratio_label}</label>
              <AspectRatioPicker
                value={String(formData.aspectRatio || '1:1')}
                onChange={(value) => setFormData({ ...formData, aspectRatio: value as FirstFrameAspectRatio })}
                primary={firstFrameRatioConfig.primary}
                more={firstFrameRatioConfig.more}
                labels={{
                  more: language === 'zh' ? '更多比例' : 'More ratios',
                  vertical: t.pi_gallery_ratio_group_vertical,
                  landscape: t.pi_gallery_ratio_group_landscape,
                }}
                descriptors={ratioDescriptorsForLanguage(language)}
              />
              {errors.aspectRatio && <p className="text-red-400 text-xs mt-1">{errors.aspectRatio}</p>}
            </div>

            {/* Row 2: 输出数量靠右 */}
            <div className="flex justify-end">
              <div className="w-32">
                <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.ff_output_count_label}</label>
                <div className="flex h-10 w-full items-center">
                  <button
                    type="button"
                    onClick={() => updateOutputCount(-1)}
                    disabled={isSubmitting || Number(formData.outputCount || 1) <= 1}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-l-xl border border-white/10 bg-white/5 text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="flex h-10 min-w-0 flex-1 items-center justify-center border-y border-white/10 bg-black/30 text-sm font-medium tabular-nums text-zinc-100">
                    {normalizeFirstFrameOutputCount(formData.outputCount)}
                  </div>
                  <button
                    type="button"
                    onClick={() => updateOutputCount(1)}
                    disabled={isSubmitting || Number(formData.outputCount || 1) >= 4}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-r-xl border border-white/10 bg-white/5 text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-zinc-700">
          <button
            type="submit"
            disabled={isSubmitting || images.length === 0}
            className={`flex-1 grid w-full grid-cols-[1fr_auto_1fr] items-center px-4 py-3 rounded-lg text-sm font-bold border transition ${isSubmitting || images.length === 0
              ? 'border-white/10 bg-black/20 text-zinc-500 cursor-not-allowed opacity-60'
              : 'border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300'}`}
          >
            <span aria-hidden="true" className="min-w-0" />
            <span className="inline-flex min-w-0 items-center justify-center gap-1.5 justify-self-center text-center">
              <Wand2 className="h-4 w-4 shrink-0" />
              {isSubmitting ? t.ff_generating : t.ff_generate_first_frame}
            </span>
            <span className="justify-self-end self-center text-right">
              {estimatedCost > 0 ? (
                <span className="ff-generate-cost whitespace-nowrap text-[10px] font-semibold tabular-nums text-orange-100/80">
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
