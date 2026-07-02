import { Plus, X } from 'lucide-react';

export interface CommunitySelectedAsset {
  id: string;
  name: string;
}

interface CommunityAssetPickerProps {
  selectedAssets: CommunitySelectedAsset[];
  addLabel?: string;
  disabled?: boolean;
  onAdd?: () => void;
  onRemove?: (assetId: string) => void;
}

export const CommunityAssetPicker = ({
  selectedAssets,
  addLabel = 'Assets',
  disabled = false,
  onAdd,
  onRemove,
}: CommunityAssetPickerProps) => (
  <div className="flex flex-wrap items-center gap-2">
    {selectedAssets.map((asset) => (
      <span key={asset.id} className="inline-flex h-8 max-w-56 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs font-bold text-zinc-300">
        <span className="truncate">{asset.name || asset.id}</span>
        <button type="button" disabled={disabled} onClick={() => onRemove?.(asset.id)} className="shrink-0 text-zinc-500 hover:text-white disabled:opacity-40">
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    ))}
    <button
      type="button"
      disabled={disabled}
      onClick={onAdd}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-zinc-300 hover:bg-white/10 disabled:opacity-40"
    >
      <Plus className="h-3.5 w-3.5" />
      {addLabel}
    </button>
  </div>
);