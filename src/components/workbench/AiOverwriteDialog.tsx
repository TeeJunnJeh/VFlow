import React, { useState, useMemo } from 'react';
import { AppDialog } from '../common/AppDialog';
import { Check } from 'lucide-react';

export interface AiOverwriteField {
  key: string;
  label: string;
  currentValue: string;
  newValue: string;
}

interface AiOverwriteDialogProps {
  isOpen: boolean;
  fields: AiOverwriteField[];
  onConfirm: (selectedKeys: Set<string>) => void;
  onCancel: () => void;
  title?: string;
  applyLabel?: string;
  cancelLabel?: string;
  currentLabel?: string;
  newLabel?: string;
}

export const AiOverwriteDialog: React.FC<AiOverwriteDialogProps> = ({
  isOpen,
  fields,
  onConfirm,
  onCancel,
  title = 'AI Recognition Results',
  applyLabel = 'Apply Selected',
  cancelLabel = 'Cancel',
  currentLabel = 'Current',
  newLabel = 'AI Result',
}) => {
  const changedFields = useMemo(
    () => fields.filter((f) => f.currentValue !== f.newValue),
    [fields]
  );

  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(() => new Set(changedFields.map((f) => f.key)));

  const toggleKey = (key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allChecked = changedFields.length > 0 && changedFields.every((f) => checkedKeys.has(f.key));
  const toggleAll = () => {
    if (allChecked) {
      setCheckedKeys(new Set());
    } else {
      setCheckedKeys(new Set(changedFields.map((f) => f.key)));
    }
  };

  if (!isOpen) return null;

  return (
    <AppDialog
      isOpen={isOpen}
      title={title}
      onClose={onCancel}
      widthClassName="max-w-xl"
      footer={
        <>
          <button
            className="bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-600 transition"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-600 transition"
            onClick={() => onConfirm(new Set(checkedKeys))}
          >
            {applyLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {/* Select all toggle */}
        {changedFields.length > 1 && (
          <label className="flex items-center gap-2 cursor-pointer select-none mb-2 pb-2 border-b border-white/10">
            <span
              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                allChecked ? 'bg-orange-500 border-orange-500' : 'border-zinc-500 bg-zinc-800'
              }`}
              onClick={toggleAll}
            >
              {allChecked && <Check className="w-3 h-3 text-white" />}
            </span>
            <span className="text-xs text-zinc-400 cursor-pointer" onClick={toggleAll}>
              {allChecked ? cancelLabel : applyLabel}
            </span>
          </label>
        )}

        {changedFields.map((field) => {
          const isChecked = checkedKeys.has(field.key);
          return (
            <div
              key={field.key}
              className={`rounded-lg border p-3 transition cursor-pointer ${
                isChecked ? 'border-orange-500/50 bg-orange-500/5' : 'border-white/10 bg-zinc-800/50'
              }`}
              onClick={() => toggleKey(field.key)}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                    isChecked ? 'bg-orange-500 border-orange-500' : 'border-zinc-500 bg-zinc-800'
                  }`}
                >
                  {isChecked && <Check className="w-3 h-3 text-white" />}
                </span>
                <span className="text-sm font-medium text-zinc-200">{field.label}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 ml-6">
                <div>
                  <div className="text-[10px] text-zinc-500 mb-0.5">{currentLabel}</div>
                  <div className="text-xs text-zinc-400 bg-zinc-800 rounded px-2 py-1 min-h-[28px] whitespace-pre-wrap break-words">
                    {field.currentValue || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-orange-400/70 mb-0.5">{newLabel}</div>
                  <div className="text-xs text-orange-300 bg-orange-500/10 rounded px-2 py-1 min-h-[28px] whitespace-pre-wrap break-words">
                    {field.newValue || '—'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AppDialog>
  );
};
