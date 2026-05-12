import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Folder, Loader2, Plus, UploadCloud } from 'lucide-react';
import { AppDialog } from '../../common/AppDialog';
import { assetsApi, type Asset, type AssetFolder } from '../../../services/assets';
import type { LibraryAssetType } from '../../../services/assets';
import { useLanguage } from '../../../context/LanguageContext';

type TranslationMap = Record<string, string | undefined>;
type UnknownRecord = Record<string, unknown>;

export interface AssetLibraryPickerTabConfig<TabKey extends string = string> {
  key: TabKey;
  label?: string;
  labelKey?: string;
  fallbackLabel?: string;
  assetType: LibraryAssetType;
}

export interface AssetLibraryPickedAsset<TabKey extends string = string> {
  id: string;
  tab: TabKey;
  assetType: LibraryAssetType;
  name: string;
  fileUrl: string;
  thumbnail?: string;
}

interface AssetLibraryPickerDialogProps<TabKey extends string = string> {
  isOpen: boolean;
  tabs: AssetLibraryPickerTabConfig<TabKey>[];
  maxCount: number;
  appliedCount: number;
  maxFileSize?: number;
  acceptedFormats?: string[];
  uploadAccept?: string;
  title?: React.ReactNode;
  limitReachedMessage?: string;
  formatErrorMessage?: string;
  tooLargeErrorPrefix?: string;
  loadErrorMessage?: string;
  uploadErrorMessage?: string;
  onConfirm: (assets: AssetLibraryPickedAsset<TabKey>[]) => void;
  onClose: () => void;
}

const DEFAULT_ACCEPTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;

const toDisplayUrl = (pathOrUrl: string) => {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  return raw.startsWith('/') ? raw : `/${raw}`;
};

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const readString = (source: UnknownRecord | null | undefined, key: string) => {
  const value = source?.[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
};

const errorMessage = (err: unknown) => (
  err instanceof Error ? err.message : String(err || '')
);

const normalizeUploadedAsset = <TabKey extends string>(
  raw: unknown,
  file: File,
  tab: TabKey,
  assetType: LibraryAssetType,
): AssetLibraryPickedAsset<TabKey> | null => {
  const record = isRecord(raw) ? raw : {};
  const fileUrl = toDisplayUrl(readString(record, 'file_url') || readString(record, 'url') || readString(record, 'path'));
  if (!fileUrl) return null;
  const thumbnail = toDisplayUrl(
    readString(record, 'thumbnail')
    || readString(record, 'thumbnail_url')
    || readString(record, 'file_url')
    || readString(record, 'url')
    || readString(record, 'path')
  );
  return {
    id: readString(record, 'id') || `${assetType}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    tab,
    assetType,
    name: readString(record, 'display_name') || readString(record, 'name') || file.name,
    fileUrl,
    thumbnail: thumbnail || undefined,
  };
};

const uploadFilesToAssetLibrary = async <TabKey extends string>(
  files: File[],
  tab: TabKey,
  assetType: LibraryAssetType,
  folderId: string | null,
) => {
  const uploaded: AssetLibraryPickedAsset<TabKey>[] = [];
  for (const file of files) {
    const response: unknown = await assetsApi.uploadAsset(file, assetType, folderId);
    const responseRecord = isRecord(response) ? response : {};
    const raw = responseRecord.data || response;
    const normalized = normalizeUploadedAsset(raw, file, tab, assetType);
    if (normalized) uploaded.push(normalized);
  }
  return uploaded;
};

export function AssetLibraryPickerDialog<TabKey extends string = string>({
  isOpen,
  tabs,
  maxCount,
  appliedCount,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  acceptedFormats = DEFAULT_ACCEPTED_FORMATS,
  uploadAccept = '.jpg,.jpeg,.png,.webp',
  title,
  limitReachedMessage,
  formatErrorMessage,
  tooLargeErrorPrefix,
  loadErrorMessage,
  uploadErrorMessage,
  onConfirm,
  onClose,
}: AssetLibraryPickerDialogProps<TabKey>) {
  const { t } = useLanguage();
  const translations = t as unknown as TranslationMap;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const loadSeqRef = useRef(0);
  const firstTabKey = tabs[0]?.key;
  const [activeTab, setActiveTab] = useState<TabKey | undefined>(firstTabKey);
  const [itemsByTab, setItemsByTab] = useState<Record<string, AssetLibraryPickedAsset<TabKey>[]>>({});
  const [foldersByTab, setFoldersByTab] = useState<Record<string, AssetFolder[]>>({});
  const [breadcrumbByTab, setBreadcrumbByTab] = useState<Record<string, AssetFolder[]>>({});
  const [currentFolderIdByTab, setCurrentFolderIdByTab] = useState<Record<string, string | null>>({});
  const [selected, setSelected] = useState<Map<string, AssetLibraryPickedAsset<TabKey>>>(new Map());
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [limitNotice, setLimitNotice] = useState('');

  const activeConfig = useMemo(
    () => tabs.find((tab) => tab.key === activeTab) || tabs[0],
    [activeTab, tabs],
  );

  const activeKey = activeConfig?.key;
  const activeKeyString = String(activeKey || '');
  const remainingSlots = Math.max(0, maxCount - appliedCount);
  const selectedAssets = useMemo(() => Array.from(selected.values()), [selected]);
  const activeItems = itemsByTab[activeKeyString] || [];
  const activeFolders = foldersByTab[activeKeyString] || [];
  const activeBreadcrumb = breadcrumbByTab[activeKeyString] || [];
  const activeFolderId = currentFolderIdByTab[activeKeyString] ?? null;

  const resolvedLimitReachedMessage = limitReachedMessage || t.ff_asset_picker_limit_reached || 'Selection limit reached';
  const assetKey = (asset: AssetLibraryPickedAsset<TabKey>) => `${asset.tab}:${asset.id}`;

  const labelForTab = (tab: AssetLibraryPickerTabConfig<TabKey>) => {
    if (tab.label) return tab.label;
    if (tab.labelKey) return translations[tab.labelKey] || tab.fallbackLabel || tab.key;
    return tab.fallbackLabel || tab.key;
  };

  const loadItems = useCallback(async () => {
    if (!activeConfig) return;
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    setLoading(true);
    setNotice('');
    try {
      const [apiItems, folderData] = await Promise.all([
        assetsApi.getAssets({ type: activeConfig.assetType, folderId: activeFolderId }),
        assetsApi.getFolders({ type: activeConfig.assetType, parentId: activeFolderId }),
      ]);
      if (loadSeqRef.current !== seq) return;
      const next = apiItems.map((asset: Asset) => ({
        id: asset.id,
        tab: activeConfig.key,
        assetType: activeConfig.assetType,
        name: asset.name,
        fileUrl: asset.file_url,
        thumbnail: asset.thumbnail,
      }));
      const key = String(activeConfig.key);
      setItemsByTab((prev) => ({ ...prev, [key]: next }));
      setFoldersByTab((prev) => ({ ...prev, [key]: Array.isArray(folderData.folders) ? folderData.folders : [] }));
      setBreadcrumbByTab((prev) => ({ ...prev, [key]: Array.isArray(folderData.breadcrumb) ? folderData.breadcrumb : [] }));
    } catch (err: unknown) {
      if (loadSeqRef.current !== seq) return;
      const key = String(activeConfig.key);
      setNotice(errorMessage(err) || loadErrorMessage || t.pg_board_library_load_failed || t.assets_seedance_load_failed || 'Failed to load assets');
      setItemsByTab((prev) => ({ ...prev, [key]: [] }));
      setFoldersByTab((prev) => ({ ...prev, [key]: [] }));
      setBreadcrumbByTab((prev) => ({ ...prev, [key]: [] }));
    } finally {
      if (loadSeqRef.current === seq) setLoading(false);
    }
  }, [activeConfig, activeFolderId, loadErrorMessage, t.assets_seedance_load_failed, t.pg_board_library_load_failed]);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Map());
    setNotice('');
    setLimitNotice('');
    setActiveTab(firstTabKey);
    setCurrentFolderIdByTab(firstTabKey ? { [String(firstTabKey)]: null } : {});
  }, [firstTabKey, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    void loadItems();
  }, [isOpen, loadItems]);

  const validateFiles = (files: File[]): string | null => {
    if (files.length === 0) return null;
    if (files.length + selected.size > remainingSlots) return resolvedLimitReachedMessage;
    for (const file of files) {
      if (!acceptedFormats.includes(file.type)) {
        return `${file.name}: ${formatErrorMessage || t.ff_upload_error_format || 'Unsupported format. Only JPG/PNG/WebP are allowed'}`;
      }
      if (file.size > maxFileSize) {
        return `${file.name}: ${tooLargeErrorPrefix || t.ff_upload_error_too_large || 'File is too large, max'} ${Math.ceil(maxFileSize / 1024 / 1024)}MB`;
      }
    }
    return null;
  };

  const toggleAsset = (asset: AssetLibraryPickedAsset<TabKey>) => {
    const key = assetKey(asset);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
        setLimitNotice('');
        return next;
      }
      if (next.size >= remainingSlots) {
        setLimitNotice(resolvedLimitReachedMessage);
        return prev;
      }
      next.set(key, asset);
      setLimitNotice('');
      return next;
    });
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeConfig) return;
    const files = Array.from(event.target.files || []);
    const validationError = validateFiles(files);
    if (validationError) {
      if (validationError === resolvedLimitReachedMessage) setLimitNotice(validationError);
      else setNotice(validationError);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setUploading(true);
    setNotice('');
    setLimitNotice('');
    try {
      const uploaded = await uploadFilesToAssetLibrary(files, activeConfig.key, activeConfig.assetType, activeFolderId);

      if (uploaded.length > 0) {
        const key = String(activeConfig.key);
        setItemsByTab((prev) => ({ ...prev, [key]: [...uploaded, ...(prev[key] || [])] }));
        setSelected((prev) => {
          const next = new Map(prev);
          uploaded.forEach((asset) => {
            if (next.size < remainingSlots) next.set(assetKey(asset), asset);
          });
          return next;
        });
      }
      void loadItems();
    } catch (err: unknown) {
      setNotice(errorMessage(err) || uploadErrorMessage || t.pg_main_toast_image_upload_failed_retry || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  if (!activeConfig) return null;

  return (
    <AppDialog
      isOpen={isOpen}
      title={title || t.wb_dialog_choose_from_library || 'Choose From Asset Library'}
      onClose={onClose}
      widthClassName="max-w-[min(92vw,980px)]"
      titleClassName="text-lg"
      contentClassName="overflow-hidden"
      footer={(
        <>
          {selectedAssets.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setSelected(new Map());
                setLimitNotice('');
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-5 py-2 text-sm font-bold text-zinc-200 transition hover:bg-white/10"
            >
              {t.ui_dialog_cancel || 'Cancel'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onConfirm(selectedAssets)}
            disabled={selectedAssets.length === 0}
            className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-black text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {t.ui_dialog_ok || 'OK'}{selectedAssets.length > 0 ? `（${selectedAssets.length}）` : ''}
          </button>
        </>
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={uploadAccept}
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      <div className="flex h-[62vh] max-h-[600px] min-h-[440px] flex-col gap-2.5">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveTab(tab.key);
                  setCurrentFolderIdByTab((prev) => ({ ...prev, [String(tab.key)]: null }));
                }}
                className={`shrink-0 rounded-full border px-5 py-2 text-[14px] font-bold transition ${
                  activeTab === tab.key
                    ? 'border-orange-500/70 bg-orange-500/20 text-orange-300'
                    : 'border-white/10 bg-black/30 text-zinc-300 hover:bg-white/5'
                }`}
              >
                {labelForTab(tab)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || remainingSlots <= 0}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 transition hover:bg-white/10 hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {t.wb_btn_upload_to_library || 'Upload Local & Save'}
          </button>
        </div>

        <div className="min-h-[18px] shrink-0 text-xs font-semibold text-red-400">
          {limitNotice}
        </div>

        {notice ? (
          <div className="mb-3 shrink-0 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300">
            {notice}
          </div>
        ) : null}

        <div className="flex shrink-0 items-center gap-2 text-sm text-zinc-500 min-w-0">
          <button
            type="button"
            onClick={() => setCurrentFolderIdByTab((prev) => ({ ...prev, [activeKeyString]: null }))}
            className={`wb-asset-library-crumb hover:text-white ${activeFolderId === null ? 'text-white' : ''}`}
          >
            {t.assets_root || 'Root'}
          </button>
          {activeBreadcrumb.map((folder) => (
            <div key={folder.id} className="flex items-center gap-2 min-w-0">
              <span>/</span>
              <button
                type="button"
                onClick={() => setCurrentFolderIdByTab((prev) => ({ ...prev, [activeKeyString]: folder.id }))}
                className={`wb-asset-library-crumb hover:text-white truncate ${activeFolderId === folder.id ? 'text-white' : ''}`}
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scroll pr-1">
          {loading ? (
            <div className="flex h-60 items-center justify-center text-zinc-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t.wb_debug_loading || 'Loading...'}
            </div>
          ) : activeItems.length === 0 && activeFolders.length === 0 ? (
            <div className="flex h-52 items-center justify-center text-zinc-500 text-sm">
              {t.wb_empty_assets || 'No assets'}
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-2">
              {activeFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => setCurrentFolderIdByTab((prev) => ({ ...prev, [activeKeyString]: folder.id }))}
                  className="text-left rounded-lg border border-white/10 bg-black/30 p-1 hover:border-orange-500/50 hover:bg-white/5 transition"
                >
                  <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-zinc-900/60 relative flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                      <Folder className="w-5 h-5 text-zinc-300" />
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] font-bold text-zinc-200 truncate">{folder.name}</div>
                </button>
              ))}
              {activeItems.map((asset) => {
                const key = assetKey(asset);
                const active = selected.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleAsset(asset)}
                    className={`group text-left rounded-lg border bg-black/30 p-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 ${
                      active ? 'border-emerald-400/70 ring-1 ring-emerald-400/35' : 'border-white/10 hover:border-orange-500/50 hover:bg-white/5'
                    }`}
                  >
                    <div className="relative w-full aspect-[3/4] overflow-hidden rounded-lg bg-zinc-800">
                      <img
                        src={asset.thumbnail || asset.fileUrl}
                        alt={asset.name}
                        className="h-full w-full object-cover"
                      />
                      <div className={`pointer-events-none absolute inset-0 bg-black/45 transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                      <div className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        {active ? (
                          <Check className="h-7 w-7 text-white" />
                        ) : (
                          <Plus className="h-8 w-8 text-white" />
                        )}
                      </div>
                    </div>
                    <div className="mt-1 truncate text-[11px] font-bold text-zinc-200">
                      {asset.name}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppDialog>
  );
}
