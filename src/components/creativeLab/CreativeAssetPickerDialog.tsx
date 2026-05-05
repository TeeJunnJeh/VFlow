import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Image as ImageIcon, Loader2, UploadCloud, UserRound, Video, X } from 'lucide-react';
import { AppDialog } from '../common/AppDialog';
import { assetsApi, type Asset, type LibraryAssetType } from '../../services/assets';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';

export type CreativeAssetPickerKind = 'product' | 'motion' | 'model';

interface CreativeAssetPickerDialogProps {
  isOpen: boolean;
  kind: CreativeAssetPickerKind;
  multiple?: boolean;
  selectedIds?: string[];
  title?: string;
  subtitle?: string;
  emptyLabel?: string;
  requireSeedanceId?: boolean;
  imageOnly?: boolean;
  autoSelectUploaded?: boolean;
  /** Override AppDialog's max-width (default 'max-w-5xl'). Use 'max-w-7xl' for wider. */
  widthClassName?: string;
  onConfirm: (assets: Asset[]) => void;
  onClose: () => void;
}

const KIND_CONFIG: Record<CreativeAssetPickerKind, { type: LibraryAssetType; accept: string; icon: any; title: string; empty: string }> = {
  product: { type: 'product', accept: '.jpg,.jpeg,.png,.webp', icon: ImageIcon, title: '选择商品图片', empty: '素材库里还没有商品图片' },
  motion: { type: 'motion', accept: '.mp4,.mov,.mkv,.webm,.avi', icon: Video, title: '选择参考广告视频', empty: '素材库里还没有视频素材' },
  model: { type: 'model', accept: '.jpg,.jpeg,.png,.webp', icon: UserRound, title: '选择虚拟模特', empty: '当前没有可用于 Seedance 的虚拟模特' },
};

const hasSeedanceId = (asset: Asset) => Boolean(String(asset.meta_data?.seedance_asset_id || '').trim());

const readGuestAssets = (): Asset[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem('vflow_guest_assets') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeGuestAsset = (asset: Asset) => {
  if (typeof window === 'undefined') return;
  try {
    const existing = readGuestAssets();
    window.sessionStorage.setItem('vflow_guest_assets', JSON.stringify([asset, ...existing]));
  } catch {
    // ignore session cache failures
  }
};

const inferMediaKind = (file: File): Asset['media_kind'] => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (/\.(txt|md|json|csv)$/i.test(file.name)) return 'document';
  return 'file';
};

export const CreativeAssetPickerDialog: React.FC<CreativeAssetPickerDialogProps> = ({
  isOpen,
  kind,
  multiple = false,
  selectedIds = [],
  title,
  subtitle,
  emptyLabel,
  requireSeedanceId,
  imageOnly = false,
  autoSelectUploaded = false,
  widthClassName = 'max-w-5xl',
  onConfirm,
  onClose,
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const config = KIND_CONFIG[kind];
  const Icon = config.icon;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (isOpen) setSelected(new Set(selectedIds));
  }, [isOpen, selectedIds]);

  const shouldRequireSeedanceId = requireSeedanceId ?? kind === 'model';

  const loadItems = useCallback(async (): Promise<Asset[]> => {
    setLoading(true);
    setNotice('');
    try {
      const apiItems = user
        ? await assetsApi.getAssets({ type: config.type, folderId: null, hasSeedanceId: shouldRequireSeedanceId })
        : [];
      const guestItems = readGuestAssets().filter((asset) => asset.type === config.type);
      const next = [...guestItems, ...apiItems];
      const filtered = next.filter((asset) => {
        if (imageOnly) return asset.media_kind === 'image' || /\.(jpg|jpeg|png|webp|gif)$/i.test(asset.file_url || '');
        if (kind === 'product') return asset.media_kind === 'image' || asset.type === 'product';
        if (kind === 'motion') return asset.media_kind === 'video';
        return asset.type === 'model' && (!shouldRequireSeedanceId || hasSeedanceId(asset));
      });
      setItems(filtered);
      return filtered;
    } catch (err: any) {
      setNotice(String(err?.message || '加载素材失败'));
      setItems([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [config.type, imageOnly, kind, shouldRequireSeedanceId, user]);

  useEffect(() => {
    if (!isOpen) return;
    void loadItems();
  }, [isOpen, loadItems]);

  const selectedAssets = useMemo(() => items.filter((item) => selected.has(item.id)), [items, selected]);

  const toggle = (asset: Asset) => {
    setSelected((prev) => {
      const next = multiple ? new Set(prev) : new Set<string>();
      if (next.has(asset.id)) next.delete(asset.id);
      else next.add(asset.id);
      return next;
    });
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setNotice('');
    let success = 0;
    const failures: string[] = [];
    const uploadedAssets: Asset[] = [];
    try {
      for (const file of files) {
        try {
          if (user) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await assetsApi.uploadAsset(file, config.type);
            const raw = (resp as any)?.data || resp;
            if (raw?.id != null) {
              uploadedAssets.push({
                id: String(raw.id),
                name: String(raw.display_name || raw.name || file.name),
                type: config.type,
                file_url: String(raw.file_url || raw.url || raw.path || ''),
                thumbnail: String(raw.thumbnail || raw.thumbnail_url || raw.file_url || raw.url || raw.path || '') || undefined,
                media_kind: inferMediaKind(file),
                size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
                status: 'ready',
                created_at: new Date().toISOString(),
                folder_id: null,
                meta_data: raw.meta_data || { size_bytes: file.size, format: file.type || null },
              });
            }
          } else {
            // Guest path must mirror the workbench asset modal: temp upload + session cache.
            // eslint-disable-next-line no-await-in-loop
            const resp = await assetsApi.uploadTempAsset(file);
            const url = String(resp?.data?.url || resp?.data?.path || resp?.url || '').trim();
            const tempAsset: Asset = {
              id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              name: file.name,
              type: config.type,
              file_url: url,
              thumbnail: url,
              media_kind: inferMediaKind(file),
              size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
              status: 'ready',
              created_at: new Date().toISOString(),
              folder_id: null,
              meta_data: { size_bytes: file.size, format: file.type || null },
            };
            writeGuestAsset(tempAsset);
            uploadedAssets.push(tempAsset);
          }
          success += 1;
        } catch (err: any) {
          failures.push(`${file.name}: ${String(err?.message || '上传失败')}`);
        }
      }
      const latestItems = await loadItems();
      const uploadedIds = new Set(uploadedAssets.map((asset) => asset.id));
      const selectableUploadedAssets = latestItems.filter((asset) => uploadedIds.has(asset.id));
      if (autoSelectUploaded && selectableUploadedAssets.length > 0) {
        onConfirm(multiple ? selectableUploadedAssets : [selectableUploadedAssets[0]]);
        return;
      }
      if (kind === 'model' && shouldRequireSeedanceId && success > 0) {
        setNotice('上传成功；由于 Seedance 的人像审查和 asset id 限制，未获得 Seedance asset id 的模特不会在此处显示。');
      } else if (success > 0) {
        setNotice(`已上传 ${success} 个素材，请从列表中选择。`);
      }
      if (failures.length > 0) setNotice(failures.join('\n'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <AppDialog
      isOpen={isOpen}
      title={title || config.title}
      subtitle={subtitle || (kind === 'model' && shouldRequireSeedanceId ? '仅显示带 Seedance asset id 的模特素材' : '可先本地上传保存，再从素材库选择')}
      onClose={onClose}
      widthClassName={widthClassName}
      contentClassName="overflow-y-auto pr-1"
      footer={(
        <>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-white/5">
            {(t as any).ui_cancel || '取消'}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedAssets)}
            disabled={selectedAssets.length === 0}
            className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-black text-black hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            选择 {selectedAssets.length > 0 ? selectedAssets.length : ''}
          </button>
        </>
      )}
    >
      <input ref={inputRef} type="file" accept={config.accept} multiple={multiple} className="hidden" onChange={handleUpload} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {(t as any).wb_btn_upload_to_library || '本地上传并保存'}
        </button>
        <button type="button" onClick={() => void loadItems()} className="rounded-xl px-3 py-2 text-xs font-bold text-zinc-400 hover:bg-white/5 hover:text-zinc-200">
          刷新
        </button>
      </div>

      {notice ? <div className="mb-4 whitespace-pre-wrap rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">{notice}</div> : null}

      {loading ? (
        <div className="flex h-60 items-center justify-center text-zinc-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中</div>
      ) : items.length === 0 ? (
        <div className="flex h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 text-zinc-500">
          <Icon className="mb-3 h-8 w-8" />
          <div className="text-sm font-bold">{emptyLabel || config.empty}</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {items.map((asset) => {
            const active = selected.has(asset.id);
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => toggle(asset)}
                className={`group relative overflow-hidden rounded-2xl border bg-black/30 text-left transition ${active ? 'border-orange-500 ring-2 ring-orange-500/25' : 'border-white/10 hover:border-white/25'}`}
              >
                <div className="aspect-video bg-zinc-950">
                  {asset.media_kind === 'video' ? (
                    <video src={asset.file_url} className="h-full w-full object-cover" muted preload="metadata" />
                  ) : (
                    <img src={asset.thumbnail || asset.file_url} alt={asset.name} className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="p-3">
                  <div className="truncate text-xs font-bold text-zinc-200">{asset.name}</div>
                  {kind === 'model' && shouldRequireSeedanceId ? <div className="mt-1 truncate text-[10px] text-orange-300">asset://{String(asset.meta_data?.seedance_asset_id || '').trim()}</div> : null}
                </div>
                {active ? <span className="absolute right-2 top-2 rounded-full bg-orange-500 p-1 text-black"><Check className="h-3.5 w-3.5" /></span> : null}
                {active ? <span className="absolute left-2 top-2 rounded-full bg-black/60 p-1 text-zinc-200"><X className="h-3.5 w-3.5" /></span> : null}
              </button>
            );
          })}
        </div>
      )}
    </AppDialog>
  );
};
