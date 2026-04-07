import React, { useMemo, useState } from 'react';
import { ChevronDown, Wand2 } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { DropdownSelect } from '../../../common/DropdownSelect';
import type { FirstFrameParams } from '../../../../types/productImages';

interface FirstFrameFormProps {
  images: File[];
  onSubmit: (params: FirstFrameParams) => Promise<void>;
  isSubmitting?: boolean;
  onReset: () => void;
}

export const FirstFrameForm: React.FC<FirstFrameFormProps> = ({
  images,
  onSubmit,
  isSubmitting = false,
  onReset,
}) => {
  const { t } = useLanguage();

  const categories = useMemo(
    () => [
      { label: t.ff_category_beauty, value: 'beauty' },
      { label: t.ff_category_personal_care, value: 'skincare' },
      { label: t.ff_category_food, value: 'food' },
      { label: t.ff_category_appliance, value: 'appliance' },
      { label: t.ff_category_other, value: 'other' },
    ],
    [t]
  );

  const personTypes = useMemo(
    () => [
      { label: t.ff_person_type_female, value: 'female' },
      { label: t.ff_person_type_male, value: 'male' },
      { label: t.ff_person_type_neutral, value: 'neutral' },
      { label: t.ff_person_type_no_preference, value: 'no_limit' },
    ],
    [t]
  );

  const holdingStyles = useMemo(
    () => [
      { label: t.ff_holding_style_single_hand, value: 'single_hand' },
      { label: t.ff_holding_style_both_hands, value: 'both_hands' },
      { label: t.ff_holding_style_front_chest, value: 'chest' },
      { label: t.ff_holding_style_side_hold, value: 'side' },
    ],
    [t]
  );

  const aspectRatios = useMemo(
    () => [
      { label: t.ff_aspect_ratio_vertical, value: '9:16' },
      { label: '4:5', value: '4:5' },
      { label: t.ff_aspect_ratio_square, value: '1:1' },
    ],
    [t]
  );

  const models = useMemo(
    () => [
      { label: 'Flux 2 Pro', value: 'flux-2-pro' },
      { label: 'Flux 2 Flex', value: 'flux-2-flex' },
      { label: 'GPT Image 1.5', value: 'gpt-image-1.5' },
    ],
    []
  );

  const whitespaceOptions = useMemo(
    () => [
      { label: t.ff_text_whitespace_top, value: 'top' },
      { label: t.ff_text_whitespace_bottom, value: 'bottom' },
      { label: t.ff_text_whitespace_right, value: 'right' },
      { label: t.ff_text_whitespace_none, value: 'none' },
    ],
    [t]
  );

  const outputCounts = useMemo(
    () => [
      { label: t.ff_output_count_1, value: 1 as const },
      { label: t.ff_output_count_2, value: 2 as const },
      { label: t.ff_output_count_4_recommended, value: 4 as const },
    ],
    [t]
  );

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formData, setFormData] = useState<FirstFrameParams>({
    category: 'beauty',
    personType: 'female',
    holdingStyle: 'single_hand',
    aspectRatio: '9:16',
    model: 'flux-2-pro',
    textWhitespace: 'top',
    outputCount: 4,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!formData.category) nextErrors.category = t.ff_validation_choose_category;
    if (!formData.personType) nextErrors.personType = t.ff_validation_choose_person_type;
    if (!formData.holdingStyle) nextErrors.holdingStyle = t.ff_validation_choose_holding_style;
    if (!formData.aspectRatio) nextErrors.aspectRatio = t.ff_validation_choose_aspect_ratio;
    if (!formData.model) nextErrors.model = t.ff_validation_choose_style;

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    await onSubmit(formData);
  };

  const handleReset = () => {
    setFormData({
      category: 'beauty',
      personType: 'female',
      holdingStyle: 'single_hand',
      aspectRatio: '9:16',
      model: 'flux-2-pro',
      textWhitespace: 'top',
      outputCount: 4,
    });
    setErrors({});
    onReset();
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-white font-medium">{t.ff_basic_settings}</h3>

          <div>
            <label className="block text-sm text-zinc-300 mb-2 font-medium">
              {t.ff_category_label}
            </label>
            <DropdownSelect
              value={formData.category || ''}
              options={categories}
              onChange={(value) => setFormData({ ...formData, category: value as any })}
              buttonClassName={`w-full bg-zinc-900/70 border rounded-xl px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 ${errors.category ? 'border-red-500' : 'border-white/10'}`}
              iconClassName="w-4 h-4 text-zinc-500"
              optionClassName="text-sm"
            />
            {errors.category && <p className="text-red-400 text-xs mt-1">{errors.category}</p>}
          </div>

          <div>
            <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.ff_person_type_label}</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {personTypes.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, personType: item.value as any })}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${formData.personType === item.value ? 'border-orange-500/60 bg-orange-500/10 text-orange-200' : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:bg-white/5'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.ff_holding_style_label}</label>
            <div className="grid grid-cols-2 gap-2">
              {holdingStyles.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, holdingStyle: item.value as any })}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${formData.holdingStyle === item.value ? 'border-orange-500/60 bg-orange-500/10 text-orange-200' : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:bg-white/5'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.ff_aspect_ratio_label}</label>
            <div className="grid grid-cols-3 gap-2">
              {aspectRatios.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, aspectRatio: item.value as any })}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${formData.aspectRatio === item.value ? 'border-orange-500/60 bg-orange-500/10 text-orange-200' : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:bg-white/5'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.wb_model_title || t.ff_style_label}</label>
            <DropdownSelect
              value={formData.model || ''}
              options={models}
              onChange={(value) => setFormData({ ...formData, model: value as any })}
              buttonClassName={`w-full bg-zinc-900/70 border rounded-xl px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 ${errors.model ? 'border-red-500' : 'border-white/10'}`}
              iconClassName="w-4 h-4 text-zinc-500"
              optionClassName="text-sm"
            />
            {errors.model && <p className="text-red-400 text-xs mt-1">{errors.model}</p>}
          </div>
        </div>

        <div className="border-t border-zinc-700 pt-6">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="ff-ghost-btn flex items-center gap-2 text-orange-400 hover:text-orange-300 text-sm font-medium transition"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            {t.ff_advanced_settings}
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4 p-4 bg-zinc-900/40 rounded-lg border border-white/10">
              <div>
                <label className="block text-sm text-zinc-300 mb-2 font-medium">{t.ff_text_whitespace_label}</label>
                <div className="grid grid-cols-2 gap-2">
                  {whitespaceOptions.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, textWhitespace: item.value as any })}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border transition ${formData.textWhitespace === item.value ? 'border-orange-500/60 bg-orange-500/10 text-orange-200' : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:bg-white/5'}`}
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
          )}
        </div>

        <div className="flex gap-3 pt-4 border-t border-zinc-700">
          <button
            type="submit"
            disabled={isSubmitting || images.length === 0}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg text-sm font-bold border transition ${isSubmitting || images.length === 0
              ? 'border-white/10 bg-black/20 text-zinc-500 cursor-not-allowed opacity-60'
              : 'border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300'}`}
          >
            <Wand2 className="w-4 h-4" />
            {isSubmitting ? t.ff_generating : t.ff_generate_first_frame}
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

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <p className="text-xs text-blue-300">
            {t.ff_generation_tip_with_prefix}
          </p>
        </div>
      </div>
    </form>
  );
};
