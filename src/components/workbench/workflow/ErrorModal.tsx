import React, { useState } from 'react';
import { X, AlertCircle, Copy, Check, Mail } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

const FEEDBACK_EMAIL = 'huzj23@mails.tsinghua.edu.cn';

export interface ErrorModalAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface ErrorModalProps {
  isOpen: boolean;
  title: string;
  code?: string;
  message: string;
  details?: string;
  suggestions?: string[];
  actions?: ErrorModalAction[];
  /** 传入 trackingId，反馈面板会自动展示给用户作为"错误 UUID" */
  trackingId?: string;
  onClose: () => void;
}

export const ErrorModal: React.FC<ErrorModalProps> = ({
  isOpen,
  title,
  code,
  message,
  details,
  suggestions,
  actions,
  trackingId,
  onClose,
}) => {
  const { t } = useLanguage();
  const [showFeedback, setShowFeedback] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async (text: string, type: 'email' | 'id') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'email') { setCopiedEmail(true); setTimeout(() => setCopiedEmail(false), 2000); }
      else { setCopiedId(true); setTimeout(() => setCopiedId(false), 2000); }
    } catch {
      // fallback: 选中文本
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      if (type === 'email') { setCopiedEmail(true); setTimeout(() => setCopiedEmail(false), 2000); }
      else { setCopiedId(true); setTimeout(() => setCopiedId(false), 2000); }
    }
  };

  // 将 actions 中标记为 _feedback 的按钮替换为展开反馈面板
  const resolvedActions = actions?.map((action) => {
    if ((action as any)._feedback) {
      return { ...action, onClick: () => setShowFeedback(true) };
    }
    return action;
  });

  const errorUuid = trackingId || code || '-';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-red-500/60 rounded-2xl max-w-md w-full p-6 animate-in fade-in scale-95 duration-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3 flex-1">
            <AlertCircle size={24} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
              {code && (
                <p className="text-xs text-red-400 mt-1">
                  {(t.wf_error_code_label || 'Error code')}: {code}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-300">
            <X size={20} />
          </button>
        </div>

        {/* Message */}
        <p className="text-sm text-zinc-300 mb-4">{message}</p>

        {/* Details */}
        {details && (
          <details className="mb-4 text-xs text-zinc-400 bg-zinc-800/40 p-3 rounded-lg">
            <summary className="cursor-pointer font-semibold text-zinc-300 mb-2">
              {t.wf_error_tech_details || 'Technical details'}
            </summary>
            <pre className="text-[10px] overflow-auto max-h-32 p-2 bg-zinc-900 rounded">
              {details}
            </pre>
          </details>
        )}

        {/* Suggestions */}
        {suggestions && suggestions.length > 0 && !showFeedback && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-zinc-300 mb-2">{t.wf_error_suggestions || 'Suggestions'}</h3>
            <ul className="text-xs text-zinc-400 space-y-1">
              {suggestions.map((suggestion, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-orange-400 flex-shrink-0">{idx + 1}.</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ─── 反馈引导面板 ─── */}
        {showFeedback && (
          <div className="mb-4 bg-zinc-800/60 border border-zinc-700 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Mail size={16} className="text-orange-400" />
              {t.err_feedback_title || '问题反馈'}
            </h3>

            <p className="text-xs text-zinc-400">
              {t.err_feedback_desc || '请将以下信息通过邮件发送给我们，我们会尽快处理：'}
            </p>

            {/* 邮箱地址 —— 可一键复制 */}
            <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-2">
              <span className="text-xs text-zinc-400 flex-shrink-0">{t.err_feedback_email_label || '收件邮箱'}:</span>
              <code className="text-xs text-orange-300 font-mono flex-1 select-all">{FEEDBACK_EMAIL}</code>
              <button
                onClick={() => handleCopy(FEEDBACK_EMAIL, 'email')}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-orange-400 transition flex-shrink-0"
                title={t.err_feedback_copy || '复制'}
              >
                {copiedEmail ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                <span>{copiedEmail ? (t.err_feedback_copied || '已复制') : (t.err_feedback_copy || '复制')}</span>
              </button>
            </div>

            {/* 错误 UUID —— 可一键复制 */}
            <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-2">
              <span className="text-xs text-zinc-400 flex-shrink-0">{t.err_feedback_uuid_label || '错误 ID'}:</span>
              <code className="text-xs text-orange-300 font-mono flex-1 truncate select-all">{errorUuid}</code>
              <button
                onClick={() => handleCopy(errorUuid, 'id')}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-orange-400 transition flex-shrink-0"
                title={t.err_feedback_copy || '复制'}
              >
                {copiedId ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                <span>{copiedId ? (t.err_feedback_copied || '已复制') : (t.err_feedback_copy || '复制')}</span>
              </button>
            </div>

            {/* 报错时请包含的字段 */}
            <div className="text-xs text-zinc-400 space-y-1.5">
              <p className="text-zinc-300 font-semibold">{t.err_feedback_include_title || '邮件中请包含以下信息：'}</p>
              <ul className="space-y-1 pl-1">
                <li className="flex gap-2">
                  <span className="text-orange-400 flex-shrink-0">1.</span>
                  <span>{t.err_feedback_field_uuid || '错误 ID（已显示在上方，请复制粘贴）'}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-orange-400 flex-shrink-0">2.</span>
                  <span>{t.err_feedback_field_action || '产生报错时，您正在进行什么操作'}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-orange-400 flex-shrink-0">3.</span>
                  <span>{t.err_feedback_field_expect || '您希望得到什么样的解决或帮助'}</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {resolvedActions?.map((action, idx) => (
            <button
              key={idx}
              onClick={() => {
                action.onClick();
                // 反馈按钮不关闭弹窗（展开面板后用户需要看到内容）
                if (!(action as any)._feedback) {
                  onClose();
                }
              }}
              className={`
                flex-1 px-4 py-2 rounded-lg text-sm font-medium transition
                ${
                  action.variant === 'danger'
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : action.variant === 'primary'
                      ? 'bg-orange-500 text-black hover:bg-orange-400'
                      : 'bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10'
                }
              `}
            >
              {action.label}
            </button>
          ))}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10 transition"
          >
            {t.wf_error_close || t.wb_debug_close || 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
