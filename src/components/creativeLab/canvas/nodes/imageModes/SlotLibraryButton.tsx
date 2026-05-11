/**
 * Small top-right "open library" affordance for canvas image slots.
 * Renders a single icon button + manages the CreativeAssetPickerDialog state
 * inline so callers stay tiny.
 *
 * On confirm, calls `onPick(url)` with the first asset's file_url (or the
 * caller-mapped value). Multi-select callers can pass `multiple` + use
 * `onPickMany` to get all picked URLs.
 */
import React, { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import {
  CreativeAssetPickerDialog,
  type CreativeAssetPickerKind,
} from '../../../CreativeAssetPickerDialog';
import type { Asset } from '../../../../../services/assets';

interface SlotLibraryButtonProps {
  kind: CreativeAssetPickerKind;
  /** Position the icon over the slot. Default `top-1 right-1`. */
  className?: string;
  /** Optional dialog title override. */
  title?: string;
  /** Single-pick handler (called with first asset's file_url). */
  onPick?: (url: string, asset: Asset) => void;
  /** Multi-pick handler (called with all URLs in pick order). */
  onPickMany?: (urls: string[], assets: Asset[]) => void;
  multiple?: boolean;
}

export const SlotLibraryButton: React.FC<SlotLibraryButtonProps> = ({
  kind,
  className = 'absolute top-1 right-1 z-10',
  title,
  onPick,
  onPickMany,
  multiple = false,
}) => {
  const [open, setOpen] = useState(false);

  const handleConfirm = (assets: Asset[]) => {
    if (multiple && onPickMany) {
      const urls = assets.map((a) => String(a.file_url || '')).filter(Boolean);
      onPickMany(urls, assets);
    } else if (onPick && assets[0]) {
      const url = String(assets[0].file_url || '');
      if (url) onPick(url, assets[0]);
    }
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={title || 'Pick from library'}
        className={`${className} p-1 rounded-md bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-white/10 transition-colors`}
      >
        <LayoutGrid className="w-3 h-3" />
      </button>

      <CreativeAssetPickerDialog
        isOpen={open}
        kind={kind}
        multiple={multiple}
        title={title}
        onConfirm={handleConfirm}
        onClose={() => setOpen(false)}
      />
    </>
  );
};
