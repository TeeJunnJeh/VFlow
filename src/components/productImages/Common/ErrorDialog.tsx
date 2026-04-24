/**
 * 错误对话框组件
 */

import React from 'react';
import { AlertCircle, AlertTriangle, X } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

export type ErrorSeverity = 'warning' | 'error';

export interface ErrorInfo {
  code: string;
  message: string;
  severity?: ErrorSeverity;
  suggestion?: string;
  details?: string[];
}

interface ErrorDialogProps {
  isOpen: boolean;
  error: ErrorInfo | null;
  onRetry: () => void;
  onClose: () => void;
  showRetry?: boolean;
}

export const ErrorDialog: React.FC<ErrorDialogProps> = ({
  isOpen,
  error,
  onRetry,
  onClose,
  showRetry = true,
}) => {
  const { t } = useLanguage();

  if (!isOpen || !error) return null;

  const severity = error.severity || 'error';
  const isWarning = severity === 'warning';

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 bg-black/50 opacity-100 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* 对话框 */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div
          className={`
            bg-zinc-900 border rounded-xl shadow-2xl max-w-md w-full
            ${isWarning ? 'border-yellow-500/30' : 'border-red-500/30'}
          `}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <div
            className={`
              flex items-center gap-3 p-6 border-b
              ${isWarning ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-red-500/20 bg-red-500/5'}
            `}
          >
            {isWarning ? (
              <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
            )}
            <div className="flex-1">
              <h3 className="font-semibold text-white">
                {isWarning ? t.ui_dialog_warning : t.ui_dialog_error}
              </h3>
              <p className={`text-xs ${isWarning ? 'text-yellow-400' : 'text-red-400'}`}>
                {error.code}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-zinc-800 rounded transition"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>

          {/* 内容 */}
          <div className="p-6 space-y-4">
            {/* 错误消息 */}
            <div>
              <p className="text-white font-medium mb-1">{t.ed_error_message_label}</p>
              <p className="text-zinc-300 text-sm leading-relaxed">
                {error.message}
              </p>
            </div>

            {/* 建议 */}
            {error.suggestion && (
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-blue-400 text-sm">
                  <span className="font-medium">{t.ed_suggestion_label}:</span> {error.suggestion}
                </p>
              </div>
            )}

            {/* 详细信息 */}
            {error.details && error.details.length > 0 && (
              <div>
                <p className="text-zinc-400 text-xs font-medium mb-2">{t.ed_more_details_label}</p>
                <ul className="space-y-1">
                  {error.details.map((detail, idx) => (
                    <li
                      key={idx}
                      className="text-zinc-400 text-xs flex items-start gap-2"
                    >
                      <span className="text-zinc-600 mt-0.5">•</span>
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 通用建议 */}
            <div className="space-y-2">
              <p className="text-zinc-400 text-xs font-medium">{t.ed_try_following_label}</p>
              <ul className="text-zinc-400 text-xs space-y-1">
                <li>{t.ed_try_check_network}</li>
                <li>{t.ed_try_valid_image}</li>
                <li>{t.ed_try_try_later}</li>
              </ul>
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="flex gap-3 p-6 border-t border-zinc-800 bg-zinc-800/30">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition font-medium text-sm"
            >
              {t.ed_close}
            </button>
            {showRetry && (
              <button
                onClick={onRetry}
                className={`
                  flex-1 px-4 py-2 rounded-lg transition font-medium text-sm
                  ${
                    isWarning
                      ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                  }
                `}
              >
                {t.ed_retry}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
