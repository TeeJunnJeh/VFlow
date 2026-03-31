/**
 * AI首帧图生成 - 参数表单组件
 */

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FirstFrameParams } from '../../types/productImages';

interface FirstFrameFormProps {
  images: File[];
  onSubmit: (params: FirstFrameParams) => Promise<void>;
  isSubmitting?: boolean;
  onReset: () => void;
}

const CATEGORIES = [
  { label: '美妆', value: 'beauty' },
  { label: '个护', value: 'skincare' },
  { label: '食品', value: 'food' },
  { label: '小家电', value: 'appliance' },
  { label: '其他', value: 'other' },
];

const PERSON_TYPES = [
  { label: '女性', value: 'female' },
  { label: '男性', value: 'male' },
  { label: '中性', value: 'neutral' },
  { label: '不限', value: 'no_limit' },
];

const HOLDING_STYLES = [
  { label: '单手持握', value: 'single_hand' },
  { label: '双手展示', value: 'both_hands' },
  { label: '胸前展示', value: 'chest' },
  { label: '侧拿展示', value: 'side' },
];

const ASPECT_RATIOS = [
  { label: '9:16 (竖屏)', value: '9:16' },
  { label: '4:5', value: '4:5' },
  { label: '1:1 (方形)', value: '1:1' },
];

const STYLES = [
  { label: '真实种草', value: 'authentic' },
  { label: '直播感', value: 'live' },
  { label: '棚拍感', value: 'studio' },
  { label: '清爽电商风', value: 'clean' },
];

const WHITESPACE_OPTIONS = [
  { label: '上方留白', value: 'top' },
  { label: '下方留白', value: 'bottom' },
  { label: '右侧留白', value: 'right' },
  { label: '无要求', value: 'none' },
];

const OUTPUT_COUNTS = [
  { label: '1 张', value: 1 },
  { label: '2 张', value: 2 },
  { label: '4 张 (推荐)', value: 4 },
];

export const FirstFrameForm: React.FC<FirstFrameFormProps> = ({
  images,
  onSubmit,
  isSubmitting = false,
  onReset,
}) => {
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

  /**
   * 表单验证
   */
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.category) {
      newErrors.category = '请选择品类';
    }
    if (!formData.personType) {
      newErrors.personType = '请选择人物类型';
    }
    if (!formData.holdingStyle) {
      newErrors.holdingStyle = '请选择出镜方式';
    }
    if (!formData.aspectRatio) {
      newErrors.aspectRatio = '请选择画幅比例';
    }
    if (!formData.style) {
      newErrors.style = '请选择风格';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * 处理提交
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    await onSubmit(formData);
  };

  /**
   * 处理重置
   */
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
        {/* 已上传图片提示 */}
        {images.length > 0 && (
          <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-green-400 text-sm">
              ✓ 已上传 {images.length} 张商品图
            </p>
          </div>
        )}

        {/* 基础参数 */}
        <div className="space-y-4">
          <h3 className="text-white font-medium">基础设置</h3>

          {/* 品类 */}
          <div>
            <label className="block text-sm text-zinc-300 mb-2 font-medium">
              品类 <span className="text-orange-500">*</span>
            </label>
            <select
              value={formData.category || ''}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value as any })
              }
              className={`
                w-full px-3 py-2.5 bg-zinc-900 border rounded-lg
                text-white text-sm placeholder-zinc-500
                transition-all focus:outline-none focus:ring-2 focus:ring-orange-500
                ${errors.category ? 'border-red-500' : 'border-zinc-700'}
              `}
            >
              <option value="">-- 请选择 --</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
            {errors.category && (
              <p className="text-red-400 text-xs mt-1">{errors.category}</p>
            )}
          </div>

          {/* 人物类型 */}
          <div>
            <label className="block text-sm text-zinc-300 mb-2 font-medium">
              人物类型
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PERSON_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      personType: type.value as any,
                    })
                  }
                  className={`
                    px-3 py-2 rounded-lg text-sm font-medium transition
                    ${
                      formData.personType === type.value
                        ? 'bg-orange-600 text-white'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }
                  `}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* 出镜方式 */}
          <div>
            <label className="block text-sm text-zinc-300 mb-2 font-medium">
              出镜方式
            </label>
            <div className="grid grid-cols-2 gap-2">
              {HOLDING_STYLES.map((style) => (
                <button
                  key={style.value}
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      holdingStyle: style.value as any,
                    })
                  }
                  className={`
                    px-3 py-2 rounded-lg text-sm font-medium transition
                    ${
                      formData.holdingStyle === style.value
                        ? 'bg-orange-600 text-white'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }
                  `}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          {/* 画幅比例 */}
          <div>
            <label className="block text-sm text-zinc-300 mb-2 font-medium">
              画幅比例
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio.value}
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      aspectRatio: ratio.value as any,
                    })
                  }
                  className={`
                    px-3 py-2 rounded-lg text-sm font-medium transition
                    ${
                      formData.aspectRatio === ratio.value
                        ? 'bg-orange-600 text-white'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }
                  `}
                >
                  {ratio.label}
                </button>
              ))}
            </div>
          </div>

          {/* 风格 */}
          <div>
            <label className="block text-sm text-zinc-300 mb-2 font-medium">
              风格
            </label>
            <select
              value={formData.style || ''}
              onChange={(e) =>
                setFormData({ ...formData, style: e.target.value as any })
              }
              className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
            >
              {STYLES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 高级设置 */}
        <div className="border-t border-zinc-700 pt-6">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-orange-500 hover:text-orange-400 text-sm font-medium transition"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                showAdvanced ? 'rotate-180' : ''
              }`}
            />
            ⚙️ 高级设置
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4 p-4 bg-zinc-800/30 rounded-lg border border-zinc-700">
              {/* 文案留白 */}
              <div>
                <label className="block text-sm text-zinc-300 mb-2 font-medium">
                  文案留白
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {WHITESPACE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          textWhitespace: opt.value as any,
                        })
                      }
                      className={`
                        px-3 py-2 rounded-lg text-xs font-medium transition
                        ${
                          formData.textWhitespace === opt.value
                            ? 'bg-orange-600 text-white'
                            : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                        }
                      `}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 输出数量 */}
              <div>
                <label className="block text-sm text-zinc-300 mb-2 font-medium">
                  输出数量
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {OUTPUT_COUNTS.map((count) => (
                    <button
                      key={count.value}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          outputCount: count.value as any,
                        })
                      }
                      className={`
                        px-3 py-2 rounded-lg text-sm font-medium transition
                        ${
                          formData.outputCount === count.value
                            ? 'bg-orange-600 text-white'
                            : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                        }
                      `}
                    >
                      {count.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-4 border-t border-zinc-700">
          <button
            type="submit"
            disabled={isSubmitting || images.length === 0}
            className={`
              flex-1 px-4 py-3 rounded-lg font-medium transition
              ${
                isSubmitting || images.length === 0
                  ? 'bg-orange-600/50 text-white cursor-not-allowed opacity-50'
                  : 'bg-orange-600 text-white hover:bg-orange-700 active:scale-95'
              }
            `}
          >
            {isSubmitting ? '生成中...' : '🎨 生成首帧图'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={isSubmitting}
            className="px-4 py-3 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition disabled:opacity-50 font-medium"
          >
            重置
          </button>
        </div>

        {/* 提示信息 */}
        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-blue-400 text-xs leading-relaxed">
            <span className="font-medium">💡 提示:</span> 生成时间通常为 30-60 秒。
            首帧图将采用竖屏友好的构图，商品和人物位于视觉中心。
          </p>
        </div>
      </div>
    </form>
  );
};
