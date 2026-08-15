import React, { useRef, useState } from 'react';
import { FolderOpen, MessageSquare, Sparkles, Upload, X } from 'lucide-react';
import { AppDialog } from '../../components/common/AppDialog';
import { CreativeAssetPickerDialog, type CreativeAssetPickerKind } from '../../components/creativeLab/CreativeAssetPickerDialog';
import type { AgentAssetRef } from '../../services/agentRuntime';
import { assetsApi, type Asset } from '../../services/assets';
import { getAgentProductImagesCopy } from './i18n';
import type { AgentConversationImage } from './types';

interface AgentProductImageAssetSelectorProps {
  label: string;
  hint?: string;
  language: string;
  assets: AgentAssetRef[];
  conversationImages: AgentConversationImage[];
  role: string;
  libraryKind: CreativeAssetPickerKind;
  maxItems?: number;
  disabled?: boolean;
  onChange: (assets: AgentAssetRef[]) => void;
  onBusyChange?: (busy: boolean) => void;
}

export const AgentProductImageAssetSelector: React.FC<AgentProductImageAssetSelectorProps> = ({
  label,
  hint,
  language,
  assets,
  conversationImages,
  role,
  libraryKind,
  maxItems = 1,
  disabled = false,
  onChange,
  onBusyChange,
}) => {
  const copy = getAgentProductImagesCopy(language);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const multiple = maxItems > 1;

  const normalized = (items: AgentAssetRef[]) => items.slice(0, maxItems).map((item) => ({ ...item, role }));
  const selectedUrls = new Set(assets.map((asset) => asset.url));

  const handleLibrarySelection = (selected: Asset[]) => {
    onChange(normalized(selected.map((asset) => ({
      source: 'library',
      asset_id: asset.id,
      url: asset.file_url,
      name: asset.name,
      role,
    }))));
    setLibraryOpen(false);
    setError('');
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    onBusyChange?.(true);
    setError('');
    try {
      const capacity = multiple ? Math.max(0, maxItems - assets.length) : 1;
      const uploaded: AgentAssetRef[] = [];
      for (const file of files.slice(0, capacity)) {
        const response = await assetsApi.uploadTempAsset(file);
        const data = response?.data || response;
        const url = String(data?.url || data?.path || response?.url || '').trim();
        if (!url) throw new Error(copy.uploadFailed);
        uploaded.push({ source: 'temp_upload', url, name: file.name, role });
      }
      onChange(normalized(multiple ? [...assets, ...uploaded] : uploaded));
    } catch {
      setError(copy.uploadFailed);
    } finally {
      setUploading(false);
      onBusyChange?.(false);
    }
  };

  return (
    <section className="border-b border-white/10 pb-4 last:border-b-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-zinc-300">{label}</div>
          {hint && <div className="mt-0.5 text-[11px] text-zinc-500">{hint}</div>}
        </div>
        {assets.length > 0 && <span className="text-[11px] font-medium text-emerald-400">{copy.selected} {assets.length}</span>}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        className="hidden"
        onChange={handleUpload}
      />

      {assets.length > 0 && (
        <div className={`mb-2 grid gap-2 ${multiple ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-1'}`}>
          {assets.map((asset, index) => (
            <div key={`${asset.source}_${asset.asset_id || asset.url}_${index}`} className="group relative min-w-0 overflow-hidden rounded-md border border-white/10 bg-black">
              <img src={asset.url} alt={asset.name || label} className={`block w-full object-cover ${multiple ? 'aspect-square' : 'h-28'}`} />
              <button
                type="button"
                title={copy.remove}
                disabled={disabled || uploading}
                onClick={() => onChange(assets.filter((_, itemIndex) => itemIndex !== index))}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-black/75 text-zinc-200 opacity-100 transition hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="truncate px-2 py-1 text-[10px] text-zinc-400">{asset.name || asset.role || label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={disabled || uploading} onClick={() => setConversationOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-50">
          <MessageSquare className="h-3.5 w-3.5" />{copy.chooseConversation}
        </button>
        <button type="button" disabled={disabled || uploading} onClick={() => setLibraryOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-50">
          <FolderOpen className="h-3.5 w-3.5" />{copy.chooseLibrary}
        </button>
        <button type="button" disabled={disabled || uploading || (multiple && assets.length >= maxItems)} onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-50">
          <Upload className={`h-3.5 w-3.5 ${uploading ? 'animate-pulse' : ''}`} />{copy.upload}
        </button>
      </div>
      {error && <div className="mt-2 text-[11px] text-red-300">{error}</div>}

      {conversationOpen && (
        <AppDialog
          isOpen
          title={copy.selectImages}
          onClose={() => setConversationOpen(false)}
          widthClassName="max-w-3xl"
          footer={<button type="button" onClick={() => setConversationOpen(false)} className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700">{copy.close}</button>}
        >
          {conversationImages.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-500">{copy.noConversationImages}</div>
          ) : (
            <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-4">
              {conversationImages.map((asset) => {
                const selected = selectedUrls.has(asset.url);
                return (
                  <button
                    key={`${asset.message_id}_${asset.url}`}
                    type="button"
                    onClick={() => {
                      if (!multiple) {
                        onChange(normalized([{ ...asset, role }]));
                        setConversationOpen(false);
                        return;
                      }
                      const next = selected
                        ? assets.filter((item) => item.url !== asset.url)
                        : [...assets, { ...asset, role }];
                      onChange(normalized(next));
                    }}
                    className={`relative overflow-hidden rounded-md border bg-black text-left transition ${selected ? 'border-orange-400 ring-2 ring-orange-400/20' : 'border-white/10 hover:border-white/30'}`}
                  >
                    <img src={asset.url} alt={asset.name || label} className="aspect-square w-full object-cover" />
                    <div className="truncate px-2 py-1.5 text-[11px] text-zinc-400">{asset.name || asset.role || label}</div>
                    {selected && <Sparkles className="absolute right-2 top-2 h-5 w-5 rounded bg-orange-500 p-1 text-white" />}
                  </button>
                );
              })}
            </div>
          )}
        </AppDialog>
      )}

      {libraryOpen && (
        <CreativeAssetPickerDialog
          isOpen
          kind={libraryKind}
          multiple={multiple}
          selectedIds={assets.map((asset) => asset.asset_id || '').filter(Boolean)}
          requireSeedanceId={false}
          imageOnly
          onConfirm={handleLibrarySelection}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </section>
  );
};
