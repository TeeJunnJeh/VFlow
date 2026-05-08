/**
 * SmartRepair 自定义 preset 编辑模态：同时支持「添加」和「编辑」两种用途。
 * 调用方传 initial 为 undefined 时是添加，传现有 preset 时是编辑。
 * 单语：用户在当前 UI 语言下填一份就好，切语言展示同一份。
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AppDialog } from '../../../common/AppDialog';
import { useLanguage } from '../../../../context/LanguageContext';

const LABEL_MAX = 60;
const PROMPT_MAX = 2000;

export interface SmartRepairUserPresetDialogInitial {
  id?: string;
  label: string;
  prompt: string;
}

interface Props {
  isOpen: boolean;
  initial?: SmartRepairUserPresetDialogInitial;
  /** Submit handler — should resolve when create/update API returns. Caller closes dialog after success. */
  onSubmit: (values: { label: string; prompt: string }) => Promise<void>;
  onClose: () => void;
}

export const SmartRepairUserPresetDialog: React.FC<Props> = ({ isOpen, initial, onSubmit, onClose }) => {
  const { language } = useLanguage();
  const isZh = language === 'zh';
  const isEdit = !!initial?.id;

  const [label, setLabel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const labelRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLabel(initial?.label || '');
    setPrompt(initial?.prompt || '');
    setError('');
    // Focus label input shortly after mount.
    const timer = window.setTimeout(() => labelRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [isOpen, initial?.id, initial?.label, initial?.prompt]);

  const handleSubmit = async () => {
    const trimmedLabel = label.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedLabel) {
      setError(isZh ? '请填写标签' : 'Label is required');
      return;
    }
    if (trimmedLabel.length > LABEL_MAX) {
      setError(isZh ? `标签不能超过 ${LABEL_MAX} 个字符` : `Label must be ≤ ${LABEL_MAX} characters`);
      return;
    }
    if (!trimmedPrompt) {
      setError(isZh ? '请填写提示词' : 'Prompt is required');
      return;
    }
    if (trimmedPrompt.length > PROMPT_MAX) {
      setError(isZh ? `提示词不能超过 ${PROMPT_MAX} 个字符` : `Prompt must be ≤ ${PROMPT_MAX} characters`);
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      await onSubmit({ label: trimmedLabel, prompt: trimmedPrompt });
    } catch (err) {
      setError(err instanceof Error ? err.message : (isZh ? '保存失败' : 'Failed to save'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppDialog
      isOpen={isOpen}
      onClose={submitting ? () => {} : onClose}
      title={isEdit
        ? (isZh ? '编辑自定义预设' : 'Edit Custom Preset')
        : (isZh ? '新建自定义预设' : 'New Custom Preset')}
      subtitle={isZh
        ? '提示词将以全文替换的方式注入到「你想怎么改」编辑框'
        : 'The prompt will fully replace the textarea content when activated'}
      widthClassName="max-w-xl"
      titleClassName="text-base"
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-white/5 disabled:opacity-50"
          >
            {isZh ? '取消' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-black text-black hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isEdit ? (isZh ? '保存' : 'Save') : (isZh ? '添加' : 'Add')}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-zinc-400">{isZh ? '标签（chip 上展示）' : 'Label (shown on chip)'}</span>
            <span className="text-zinc-500">{label.length}/{LABEL_MAX}</span>
          </div>
          <input
            ref={labelRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={LABEL_MAX}
            placeholder={isZh ? '如：去除水印 / 模特换肤色' : 'e.g. Remove watermark'}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-400/60"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-zinc-400">{isZh ? '完整提示词' : 'Full prompt'}</span>
            <span className="text-zinc-500">{prompt.length}/{PROMPT_MAX}</span>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={PROMPT_MAX}
            rows={8}
            placeholder={isZh ? '例如：去除背景里的所有文字水印，保持商品高光与材质不变' : 'e.g. Remove all watermarks while preserving the product highlights'}
            className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-relaxed text-zinc-100 outline-none focus:border-orange-400/60"
          />
        </div>

        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>
        ) : null}
      </div>
    </AppDialog>
  );
};
