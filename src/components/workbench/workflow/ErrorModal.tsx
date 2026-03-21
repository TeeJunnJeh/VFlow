import React from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

export interface ErrorModalProps {
  isOpen: boolean;
  title: string;
  code?: string;
  message: string;
  details?: string;
  suggestions?: string[];
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
  }>;
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
  onClose,
}) => {
  const { t } = useLanguage();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-red-500/60 rounded-2xl max-w-md w-full p-6 animate-in fade-in scale-95 duration-200"
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
        {suggestions && suggestions.length > 0 && (
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

        {/* Actions */}
        <div className="flex gap-3">
          {actions?.map((action, idx) => (
            <button
              key={idx}
              onClick={() => {
                action.onClick();
                onClose();
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
