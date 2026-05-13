import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Image as ImageIcon, Loader2, Music2, Plus, UploadCloud, UserRound, Video } from 'lucide-react';
import { AppDialog } from '../common/AppDialog';
import { assetsApi, type Asset, type LibraryAssetType } from '../../services/assets';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';

export type CreativeAssetPickerKind = 'product' | 'motion' | 'model' | 'audio';

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
  /** Override AppDialog's max-width. Defaults to the workbench-style
   * `max-w-[min(92vw,980px)]` so the picker matches the main Workbench
   * "从素材库选择" dialog visually. */
  widthClassName?: string;
  onConfirm: (assets: Asset[]) => void;
  onClose: () => void;
}

const KIND_CONFIG: Record<CreativeAssetPickerKind, { type: LibraryAssetType; accept: string; icon: any; title: string; empty: string }> = {
  product: { type: 'product', accept: '.jpg,.jpeg,.png,.webp', icon: ImageIcon, title: '选择商品图片', empty: '素材库里还没有商品图片' },
  motion: { type: 'motion', accept: '.mp4,.mov,.mkv,.webm,.avi', icon: Video, title: '选择参考广告视频', empty: '素材库里还没有视频素材' },
  model: { type: 'model', accept: '.jpg,.jpeg,.png,.webp', icon: UserRound, title: '选择虚拟模特', empty: '当前没有可用于 Seedance 的虚拟模特' },
  audio: { type: 'audio', accept: '.mp3,.wav,.m4a,.flac,.ogg', icon: Music2, title: '选择音频素材', empty: '素材库里还没有音频素材' },
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
  widthClassName = 'max-w-[min(92vw,980px)]',
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
  // Mirror Workbench hover behavior: dark overlay + Plus icon on hover; flips
  // to Check on the just-clicked card so users see the selection register.
  const [hoverAssetId, setHoverAssetId] = useState<string | null>(null);
  const [hoverClickedAssetId, setHoverClickedAssetId] = useState<string | null>(null);

  // Reset internal `selected` only when the dialog flips from closed → open.
  // We intentionally don't depend on `selectedIds`: callers (e.g. UploadResourceNode)
  // commonly omit it, which makes JS create a brand-new `[]` every render. Including
  // it in deps would re-fire the effect after every internal `setSelected`, blowing
  // away the user's just-made click and causing the "选择 N" footer button to flicker
  // between 0 and the picked count.
  useEffect(() => {
    if (isOpen) setSelected(new Set(selectedIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
        if (kind === 'audio')
          return asset.media_kind === 'audio' || /\.(mp3|wav|m4a|flac|ogg)$/i.test(asset.file_url || '');
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
      titleClassName="text-lg"
      subtitle={subtitle || (kind === 'model' && shouldRequireSeedanceId ? '仅显示带 Seedance asset id 的模特素材' : '可先本地上传保存，再从素材库选择')}
      onClose={onClose}
      widthClassName={widthClassName}
      contentClassName="overflow-hidden"
      footer={(
        <>
          <button type="button" onClick={onClose} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-700">
            {(t as any).ui_cancel || '取消'}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedAssets)}
            disabled={selectedAssets.length === 0}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-black text-black hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            选择 {selectedAssets.length > 0 ? selectedAssets.length : ''}
          </button>
        </>
      )}
    >
      {/* Matches Workbench `从素材库选择` dialog: tall flex column, header row,
          notice toast, scrollable 6-col grid with 3:4 thumbnails. */}
      <div className="w-full h-[62vh] max-h-[600px] min-h-[440px] flex flex-col gap-2.5">
        <input ref={inputRef} type="file" accept={config.accept} multiple={multiple} className="hidden" onChange={handleUpload} />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 rounded-full border border-orange-500/70 bg-orange-500/20 px-5 py-2 text-[14px] font-bold text-orange-300">
              {config.title.replace('选择', '')}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                uploading
                  ? 'cursor-not-allowed border-white/10 bg-white/5 text-zinc-200/70'
                  : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {uploading
                ? ((t as any).wb_uploading || '上传中...')
                : ((t as any).wb_btn_upload_to_library || '上传素材')}
            </button>
            <button
              type="button"
              onClick={() => void loadItems()}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-white/10 hover:border-white/20 hover:text-zinc-100"
            >
              刷新
            </button>
          </div>
        </div>

        {notice ? (
          <div className="rounded-md border border-orange-500/20 bg-orange-500/5 px-3 py-2.5 text-xs text-orange-200 whitespace-pre-wrap">
            {notice}
          </div>
        ) : null}

        <div className="flex-1 min-h-0 overflow-y-auto custom-scroll pr-1">
          {loading ? (
            <div className="h-52 flex items-center justify-center text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载中...
            </div>
          ) : items.length === 0 ? (
            <div className="h-52 flex flex-col items-center justify-center gap-3 text-zinc-500 text-sm">
              <Icon className="h-8 w-8" />
              <div>{emptyLabel || config.empty}</div>
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-2">
              {items.map((asset) => {
                const active = selected.has(asset.id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onMouseEnter={() => {
                      setHoverAssetId(asset.id);
                      setHoverClickedAssetId(null);
                    }}
                    onMouseLeave={() => {
                      setHoverAssetId((prev) => (prev === asset.id ? null : prev));
                      setHoverClickedAssetId((prev) => (prev === asset.id ? null : prev));
                    }}
                    onClick={() => {
                      toggle(asset);
                      setHoverClickedAssetId(asset.id);
                    }}
                    className={`group text-left rounded-lg border bg-black/30 p-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 ${active
                      ? 'border-orange-500/70 ring-1 ring-orange-500/40'
                      : 'border-white/10 hover:border-orange-500/50 hover:bg-white/5'
                      }`}
                  >
                    <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-zinc-800 relative">
                      {asset.media_kind === 'video' ? (
                        <video src={asset.file_url} className="w-full h-full object-cover" muted playsInline />
                      ) : asset.media_kind === 'audio' ? (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-zinc-200">
                          <Music2 className="w-5 h-5" />
                        </div>
                      ) : (
                        <img src={asset.thumbnail || asset.file_url} alt={asset.name} className="w-full h-full object-cover" />
                      )}

                      {/* Hover overlay: dark + Plus icon → Check on click (matches Workbench dialog) */}
                      <div
                        className={`pointer-events-none absolute inset-0 bg-black/45 transition-opacity duration-200 ${
                          hoverAssetId === asset.id || active ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <div
                        className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
                          hoverAssetId === asset.id || active ? 'opacity-100' : 'opacity-0'
                        }`}
                      >
                        {active || hoverClickedAssetId === asset.id ? (
                          <Check className="h-7 w-7 text-white" />
                        ) : (
                          <Plus className="h-8 w-8 text-white" />
                        )}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] font-bold text-zinc-200 truncate">{asset.name}</div>
                    {kind === 'model' && shouldRequireSeedanceId ? (
                      <div className="text-[10px] text-orange-300 truncate">asset://{String(asset.meta_data?.seedance_asset_id || '').trim()}</div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppDialog>
  );
};
