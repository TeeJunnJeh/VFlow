import React, { useState } from 'react';
import { AppDialog } from '../common/AppDialog';
import { useLanguage } from '../../context/LanguageContext';
import { authApi, type SourceSurveyCode } from '../../services/auth';

interface SourceSurveyDialogProps {
  isOpen: boolean;
  onSubmitted: () => void;
  onSkipped: () => void;
}

interface SourceOption {
  code: SourceSurveyCode;
  labelZh: string;
  labelEn: string;
}

const SOURCE_OPTIONS: SourceOption[] = [
  { code: 'WEIXIN_OFFICIAL', labelZh: '微信订阅号', labelEn: 'WeChat Official Account' },
  { code: 'XIAOHONGSHU', labelZh: '小红书', labelEn: 'Xiaohongshu' },
  { code: 'DOUYIN', labelZh: '抖音', labelEn: 'Douyin / TikTok' },
  { code: 'WEIBO', labelZh: '微博', labelEn: 'Weibo' },
  { code: 'FRIEND', labelZh: '朋友介绍', labelEn: 'Friend referral' },
  { code: 'OTHER', labelZh: '其他', labelEn: 'Other' },
];

const OTHER_MAX_LEN = 80;

export const SourceSurveyDialog: React.FC<SourceSurveyDialogProps> = ({ isOpen, onSubmitted, onSkipped }) => {
  const { language } = useLanguage();
  const isZh = language === 'zh';

  const [selected, setSelected] = useState<SourceSurveyCode | null>(null);
  const [otherText, setOtherText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = isZh ? '您是怎么了解到 VFlow 的?' : 'How did you hear about VFlow?';
  const subtitle = isZh ? '一道选择题,帮助我们做出更好的产品' : 'One quick question — it helps us improve.';
  const skipLabel = isZh ? '跳过填写' : 'Skip';
  const submitLabel = isZh ? '提交' : 'Submit';
  const otherPlaceholder = isZh ? '请简单说明' : 'Please specify';

  const canSubmit = (() => {
    if (!selected) return false;
    if (selected === 'OTHER') {
      const trimmed = otherText.trim();
      return trimmed.length > 0 && trimmed.length <= OTHER_MAX_LEN;
    }
    return true;
  })();

  const handleSkip = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await authApi.skipSourceSurvey();
      onSkipped();
    } catch (e: any) {
      // Skip 失败不阻塞用户 —— 标记为已问过,本次会话内不再弹
      onSkipped();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting || !selected) return;
    setError(null);
    setSubmitting(true);
    try {
      await authApi.submitSourceSurvey({
        source: selected,
        otherText: selected === 'OTHER' ? otherText.trim() : undefined,
      });
      onSubmitted();
    } catch (e: any) {
      setError(e?.message || (isZh ? '提交失败,请稍后再试' : 'Submit failed, please try again'));
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-between gap-3 pt-4 shrink-0">
      <button
        type="button"
        onClick={handleSkip}
        disabled={submitting}
        className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition disabled:opacity-50"
      >
        {skipLabel}
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className="px-5 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 transition disabled:opacity-40 disabled:cursor-not-allowed shadow"
      >
        {submitting ? (isZh ? '提交中…' : 'Submitting…') : submitLabel}
      </button>
    </div>
  );

  return (
    <AppDialog
      isOpen={isOpen}
      title={title}
      subtitle={subtitle}
      onClose={handleSkip}
      footer={footer}
      widthClassName="max-w-lg"
      titleClassName="text-base"
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SOURCE_OPTIONS.map((opt) => {
            const active = selected === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => setSelected(opt.code)}
                className={
                  'px-3 py-2 rounded-lg text-xs font-semibold border transition ' +
                  (active
                    ? 'border-orange-400 bg-orange-500/15 text-orange-200 shadow-inner'
                    : 'border-white/10 bg-white/5 text-zinc-300 hover:border-white/25 hover:text-zinc-100')
                }
              >
                {isZh ? opt.labelZh : opt.labelEn}
              </button>
            );
          })}
        </div>

        {selected === 'OTHER' && (
          <div className="flex flex-col gap-1">
            <textarea
              value={otherText}
              onChange={(e) => setOtherText(e.target.value.slice(0, OTHER_MAX_LEN))}
              placeholder={otherPlaceholder}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900/80 border border-white/10 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-orange-400/60 resize-none"
            />
            <div className="text-[10px] text-zinc-500 text-right">
              {otherText.trim().length} / {OTHER_MAX_LEN}
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </AppDialog>
  );
};

export default SourceSurveyDialog;
