import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
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
  const { language } = useLanguage();
  const isZh = language === 'zh';
  const tr = (zhText: string, enText: string) => (isZh ? zhText : enText);

  const categories = useMemo(
    () => [
      { label: tr('美妆', 'Beauty'), value: 'beauty' },
      { label: tr('个护', 'Personal Care'), value: 'skincare' },
      { label: tr('食品', 'Food'), value: 'food' },
      { label: tr('小家电', 'Small Appliance'), value: 'appliance' },
      { label: tr('其他', 'Other'), value: 'other' },
    ],
    [isZh]
  );

  const personTypes = useMemo(
    () => [
      { label: tr('女性', 'Female'), value: 'female' },
      { label: tr('男性', 'Male'), value: 'male' },
      { label: tr('中性', 'Neutral'), value: 'neutral' },
      { label: tr('不限', 'No Preference'), value: 'no_limit' },
    ],
    [isZh]
  );

  const holdingStyles = useMemo(
    () => [
      { label: tr('单手持握', 'Single Hand'), value: 'single_hand' },
      { label: tr('双手展示', 'Both Hands'), value: 'both_hands' },
      { label: tr('胸前展示', 'Front Chest'), value: 'chest' },
      { label: tr('侧拿展示', 'Side Hold'), value: 'side' },
    ],
    [isZh]
  );

  const aspectRatios = useMemo(
    () => [
      { label: tr('9:16 (竖屏)', '9:16 (Vertical)'), value: '9:16' },
      { label: '4:5', value: '4:5' },
      { label: tr('1:1 (方形)', '1:1 (Square)'), value: '1:1' },
    ],
    [isZh]
  );

  const styles = useMemo(
    () => [
      { label: tr('真实种草', 'Authentic UGC'), value: 'authentic' },
      { label: tr('直播感', 'Live Stream'), value: 'live' },
      { label: tr('棚拍感', 'Studio'), value: 'studio' },
      { label: tr('清爽电商风', 'Clean E-commerce'), value: 'clean' },
    ],
    [isZh]
  );

  const whitespaceOptions = useMemo(
    () => [
      { label: tr('上方留白', 'Top Space'), value: 'top' },
      { label: tr('下方留白', 'Bottom Space'), value: 'bottom' },
      { label: tr('右侧留白', 'Right Space'), value: 'right' },
      { label: tr('无要求', 'No Preference'), value: 'none' },
    ],
    [isZh]
  );

  const outputCounts = useMemo(
    () => [
      { label: tr('1 张', '1 image'), value: 1 as const },
      { label: tr('2 张', '2 images'), value: 2 as const },
      { label: tr('4 张 (推荐)', '4 images (recommended)'), value: 4 as const },
    ],
    [isZh]
  );

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formData, setFormData] = useState<FirstFrameParams>({
    category: 'beauty',
    personType: 'female',
    holdingStyle: 'single_hand',
    aspectRatio: '9:16',
    style: 'authentic',
    textWhitespace: 'top',
    outputCount: 4,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!formData.category) nextErrors.category = tr('请选择品类', 'Please choose a category');
    if (!formData.personType) nextErrors.personType = tr('请选择人物类型', 'Please choose a person type');
    if (!formData.holdingStyle) nextErrors.holdingStyle = tr('请选择出镜方式', 'Please choose a holding style');
    if (!formData.aspectRatio) nextErrors.aspectRatio = tr('请选择画幅比例', 'Please choose an aspect ratio');
    if (!formData.style) nextErrors.style = tr('请选择风格', 'Please choose a style');

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
      style: 'authentic',
      textWhitespace: 'top',
      outputCount: 4,
    });
    setErrors({});
    onReset();
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="space-y-6">
        {images.length > 0 && (
          <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-green-400 text-sm">
              {tr('已上传', 'Uploaded')} {images.length} {tr('张商品图', 'product image(s)')}
            </p>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-white font-medium">{tr('基础设置', 'Basic Settings')}</h3>

          <div>
            <label className="block text-sm text-zinc-300 mb-2 font-medium">
              {tr('品类', 'Category')} <span className="text-orange-500">*</span>
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
            <label className="block text-sm text-zinc-300 mb-2 font-medium">{tr('人物类型', 'Person Type')}</label>
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
            <label className="block text-sm text-zinc-300 mb-2 font-medium">{tr('出镜方式', 'Holding Style')}</label>
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
            <label className="block text-sm text-zinc-300 mb-2 font-medium">{tr('画幅比例', 'Aspect Ratio')}</label>
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
            <label className="block text-sm text-zinc-300 mb-2 font-medium">{tr('风格', 'Style')}</label>
            <DropdownSelect
              value={formData.style || ''}
              options={styles}
              onChange={(value) => setFormData({ ...formData, style: value as any })}
              buttonClassName="w-full bg-zinc-900/70 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800"
              iconClassName="w-4 h-4 text-zinc-500"
              optionClassName="text-sm"
            />
          </div>
        </div>

        <div className="border-t border-zinc-700 pt-6">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="ff-ghost-btn flex items-center gap-2 text-orange-400 hover:text-orange-300 text-sm font-medium transition"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            {tr('高级设置', 'Advanced Settings')}
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4 p-4 bg-zinc-900/40 rounded-lg border border-white/10">
              <div>
                <label className="block text-sm text-zinc-300 mb-2 font-medium">{tr('文案留白', 'Text Whitespace')}</label>
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
                <label className="block text-sm text-zinc-300 mb-2 font-medium">{tr('输出数量', 'Output Count')}</label>
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
            {isSubmitting ? tr('生成中...', 'Generating...') : tr('生成首帧图', 'Generate First Frame')}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={isSubmitting}
            className="px-4 py-3 bg-white/5 border border-white/10 text-zinc-300 rounded-lg hover:bg-white/10 transition disabled:opacity-50 font-medium"
          >
            {tr('重置', 'Reset')}
          </button>
        </div>

        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-blue-400 text-xs leading-relaxed">
            {tr(
              '提示: 生成通常需要 30-60 秒，建议选择清晰、无遮挡的商品图。',
              'Tip: Generation usually takes 30-60 seconds. Use a clear product image for best results.'
            )}
          </p>
        </div>
      </div>
    </form>
  );
};
