import React, { useEffect, useMemo, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { DropdownSelect } from '../../../common/DropdownSelect';
import { billingApi } from '../../../../services/billing';
import { productImagesApi } from '../../../../services/productImagesApi';
import type { FirstFrameAspectRatio, FirstFrameModel, FirstFrameParams } from '../../../../types/productImages';
import { formatCreditAmount, roundCreditTenths } from '../../../../utils/credits';

interface FirstFrameFormProps {
  images: File[];
  onSubmit: (params: FirstFrameParams) => Promise<void>;
  isSubmitting?: boolean;
  onReset: () => void;
  defaultParams?: Partial<FirstFrameParams>;
  workspaceId?: string;
}

const buildStorageKey = (workspaceId?: string) => {
  const normalized = String(workspaceId || '').trim();
  return normalized ? `firstFrameParams:${normalized}` : 'firstFrameParams';
};

const FALLBACK_PARAMS: FirstFrameParams = {
  prompt: '',
  aspectRatio: '9:16',
  model: 'flux-2-pro',
  outputCount: 4,
};

const GPT_FIRST_FRAME_MODELS: FirstFrameModel[] = ['gpt-image-2', 'gpt-image-1.5'];

const isGptFirstFrameModel = (model?: FirstFrameModel) => (
  GPT_FIRST_FRAME_MODELS.includes(model as FirstFrameModel)
);

const getFirstFrameAspectRatios = (model?: FirstFrameModel): Array<{ label: string; value: FirstFrameAspectRatio }> => {
  const base: Array<{ label: string; value: FirstFrameAspectRatio }> = [
    { label: '1:1', value: '1:1' },
    { label: '3:2', value: '3:2' },
    { label: '2:3', value: '2:3' },
  ];
  if (isGptFirstFrameModel(model)) return base;
  return [...base, { label: '9:16', value: '9:16' }];
};

const normalizeFirstFrameAspectRatio = (
  value: FirstFrameParams['aspectRatio'],
  model: FirstFrameParams['model']
): FirstFrameAspectRatio => {
  const options = getFirstFrameAspectRatios(model);
  return options.some((item) => item.value === value) ? value as FirstFrameAspectRatio : options[0].value;
};

export const FirstFrameForm: React.FC<FirstFrameFormProps> = ({
  images,
  onSubmit,
  isSubmitting = false,
  onReset,
  defaultParams,
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
      { label: 'Flux 2 Pro', value: 'flux-2-pro' },
      { label: 'Flux 2 Flex', value: 'flux-2-flex' },
      { label: 'GPT Image 2', value: 'gpt-image-2' },
      { label: 'GPT Image 1.5', value: 'gpt-image-1.5' },
    ],
    []
  );

  const outputCounts = useMemo(
    () => [
      { label: t.ff_output_count_1, value: 1 as const },
      { label: t.ff_output_count_2, value: 2 as const },
      { label: t.ff_output_count_4, value: 4 as const },
    ],
    [t]
  );

  const [isPolishingPrompt, setIsPolishingPrompt] = useState(false);
  const [imageModelRates, setImageModelRates] = useState<Record<string, number>>({});
  const [formData, setFormData] = useState<FirstFrameParams>(() => {
    const baseDefaults: FirstFrameParams = { ...mergedDefaultParams };
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<FirstFrameParams>;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { ...baseDefaults, ...parsed };
        }
      }
    } catch {
      // Ignore corrupted local cache and fallback to defaults.
    }
    return baseDefaults;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const aspectRatios = useMemo(
    () => getFirstFrameAspectRatios(formData.model),
    [formData.model]
  );

  useEffect(() => {
    setFormData((prev) => {
      const normalized = normalizeFirstFrameAspectRatio(prev.aspectRatio, prev.model);
      if (normalized === prev.aspectRatio) return prev;
      return { ...prev, aspectRatio: normalized };
    });
  }, [formData.aspectRatio, formData.model]);

  useEffect(() => {
    let nextFormData: FirstFrameParams = { ...mergedDefaultParams };
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<FirstFrameParams>;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          nextFormData = { ...mergedDefaultParams, ...parsed };
        }
      }
    } catch {
      // Ignore corrupted local cache and fallback to defaults.
    }
    setFormData(nextFormData);
    setErrors({});
  }, [mergedDefaultParams, storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(formData));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [formData, storageKey]);

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
    const modelKey = String(formData.model || '').trim();
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

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="space-y-6">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="block text-sm text-zinc-300 font-medium">
              {t.ff_prompt_label || '填写生成要求'}
            </label>
            <button
              type="button"
              onClick={() => void handlePolishPrompt()}
              disabled={isPolishingPrompt || isSubmitting}
              className={`text-xs px-2.5 py-1 rounded border transition ${isPolishingPrompt || isSubmitting ? 'border-orange-500/30 bg-orange-500/5 text-orange-200/70 cursor-not-allowed' : 'border-orange-500/60 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20'}`}
            >
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
          <div>
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

          <div>
            <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.ff_aspect_ratio_label}</label>
            <div className={`grid gap-2 ${aspectRatios.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
              {aspectRatios.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, aspectRatio: item.value })}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${formData.aspectRatio === item.value ? 'border-orange-500/60 bg-orange-500/10 text-orange-200' : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:bg-white/5'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.ff_output_count_label}</label>
            <div className="grid grid-cols-3 gap-2">
              {outputCounts.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, outputCount: item.value as any })}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${formData.outputCount === item.value ? 'border-orange-500/60 bg-orange-500/10 text-orange-200' : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:bg-white/5'}`}
                >
                  {item.label}
                </button>
              ))}
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
