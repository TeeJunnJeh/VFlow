/**
 * SmartRepair 自定义 preset 管理器：列出当前工具的全部用户自定义 preset，
 * 支持 ✏️ 编辑（转交给上层打开 SmartRepairUserPresetDialog）和 🗑️ 删除。
 */
import React, { useState } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { AppDialog } from '../../../common/AppDialog';
import { useLanguage } from '../../../../context/LanguageContext';
import type { SmartRepairUserPreset } from '../../../../types/productImages';

interface Props {
  isOpen: boolean;
  presets: SmartRepairUserPreset[];
  onEdit: (preset: SmartRepairUserPreset) => void;
  onDelete: (preset: SmartRepairUserPreset) => Promise<void>;
  onClose: () => void;
}

export const SmartRepairUserPresetManagerDialog: React.FC<Props> = ({ isOpen, presets, onEdit, onDelete, onClose }) => {
  const { language } = useLanguage();
  const isZh = language === 'zh';
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');

  const handleDelete = async (preset: SmartRepairUserPreset) => {
    const confirmMsg = isZh ? `确定删除「${preset.label}」吗？` : `Delete "${preset.label}"?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      setPendingDeleteId(preset.id);
      setError('');
      await onDelete(preset);
    } catch (err) {
      setError(err instanceof Error ? err.message : (isZh ? '删除失败' : 'Failed to delete'));
    } finally {
      setPendingDeleteId(null);
    }
  };

  return (
    <AppDialog
      isOpen={isOpen}
      onClose={onClose}
      title={isZh ? '管理自定义预设' : 'Manage Custom Presets'}
      subtitle={isZh
        ? '内置预设不可改；以下是当前工具下你自己加的预设'
        : 'Built-in presets are read-only. Below are your own presets for this tool'}
      widthClassName="max-w-2xl"
      titleClassName="text-base"
      footer={(
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-white/5"
        >
          {isZh ? '完成' : 'Done'}
        </button>
      )}
    >
      {presets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center text-sm text-zinc-500">
          {isZh ? '当前工具还没有自定义预设。点击工具行右侧的「+」按钮添加。' : 'No custom presets for this tool yet. Click the "+" button on the chip row to add one.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {presets.map((preset) => (
            <li
              key={preset.id}
              className="rounded-xl border border-white/5 bg-black/20 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-zinc-100">{preset.label}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-zinc-400" title={preset.prompt}>{preset.prompt}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(preset)}
                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-200 hover:bg-white/10"
                    aria-label={isZh ? '编辑' : 'Edit'}
                    title={isZh ? '编辑' : 'Edit'}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(preset)}
                    disabled={pendingDeleteId === preset.id}
                    className="rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                    aria-label={isZh ? '删除' : 'Delete'}
                    title={isZh ? '删除' : 'Delete'}
                  >
                    {pendingDeleteId === preset.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>
      ) : null}
    </AppDialog>
  );
};
