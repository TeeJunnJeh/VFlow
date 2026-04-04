import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  FolderPlus, Upload, Loader2, Folder, X, CheckCircle, Circle, ChevronDown, ChevronRight, Pencil, Search, Heart, Download, Library, Globe, Info, Settings, Eye, EyeOff, Layers3, Plus, Sparkles, AlertCircle
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext'
import { assetsApi, type Asset, type AssetFolder, type PlazaAssetItem, type PlazaCollectPolicy } from '../../services/assets';
import { videoApi } from '../../services/video';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { getSubjectGuideContent } from './subjectGuideContent';

type AssetType = 'model' | 'product' | 'scene' | 'motion' | 'audio';
type AssetsNavigationIntent =
  | 'open_assets_for_subject_creation'
  | 'open_assets_for_subject_creation_first_time'
  | null;

interface AssetsViewProps {
  onSelectAsset: (asset: Asset) => void;
  currentFolderId: string | null;
  setCurrentFolderId: (id: string | null) => void;
  navigationIntent?: AssetsNavigationIntent;
  onNavigationIntentHandled?: () => void;
  onSubjectGuideCompleted?: () => void;
}

const ASSET_PLACEHOLDER_DATA_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iNDAwIiB2aWV3Qm94PSIwIDAgMzAwIDQwMCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzFmMjkzNyIvPjx0ZXh0IHg9IjE1MCIgeT0iMjAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiBmaWxsPSIjOWNhM2FmIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjAiPk5vIFByZXZpZXc8L3RleHQ+PC9zdmc+';

const renderAudioArtwork = (name?: string, compact = false, isLightTheme = false) => (
  <div className={`absolute inset-0 overflow-hidden ${compact ? '' : 'rounded-lg'}`}>
    <div className={`absolute inset-0 ${isLightTheme ? 'bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.18),_transparent_46%),linear-gradient(180deg,_rgba(255,247,237,0.98),_rgba(255,255,255,1))]' : 'bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.30),_transparent_45%),linear-gradient(180deg,_rgba(39,39,42,0.95),_rgba(9,9,11,0.98))]'}`} />
    <div className={`absolute inset-x-0 top-0 h-24 ${isLightTheme ? 'bg-gradient-to-b from-orange-300/15 to-transparent' : 'bg-gradient-to-b from-orange-400/10 to-transparent'}`} />
    <div className="absolute inset-0 flex items-center justify-center">
      <div className={`relative flex h-24 w-24 items-center justify-center rounded-full ${isLightTheme ? 'border border-orange-200/70 bg-white/95 shadow-[0_10px_30px_rgba(251,146,60,0.12)]' : 'border border-orange-300/25 bg-black/30 shadow-[0_0_30px_rgba(251,146,60,0.18)]'}`}>
        <div className={`absolute h-28 w-28 rounded-full ${isLightTheme ? 'border border-slate-200/70' : 'border border-white/5'}`} />
        <div className={`text-4xl font-semibold ${isLightTheme ? 'text-orange-300' : 'text-orange-200/95'}`}>{'\u266A'}</div>
      </div>
    </div>
  </div>
);

export const AssetsView: React.FC<AssetsViewProps> = ({ 
  onSelectAsset, 
  currentFolderId, 
  setCurrentFolderId,
  navigationIntent,
  onNavigationIntentHandled,
  onSubjectGuideCompleted,
}) => {
  const { t, language } = useLanguage();
  const { updateUser } = useAuth();
  const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
  const VIDEO_EXTS = ['mp4', 'mov', 'mkv', 'webm', 'avi'];
  const AUDIO_EXTS = ['mp3', 'wav', 'flac'];
  const imageFormats = IMAGE_EXTS.join('/');
  const videoFormats = VIDEO_EXTS.join('/');
  const audioFormats = AUDIO_EXTS.join('/');
  const formatHint = `${t.wb_upload_image}: ${imageFormats}\n${t.wb_upload_video}: ${videoFormats}\n${t.wb_upload_audio}: ${audioFormats}\n${t.wb_upload_max_size}`;

  const validateUploadFile = (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) return `${t.assets_upload_error_too_large}: ${file.name} (>1GB)`;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = file.type.startsWith('image/') || IMAGE_EXTS.includes(ext);
    const isVideo = file.type.startsWith('video/') || VIDEO_EXTS.includes(ext);
    const isAudio = file.type.startsWith('audio/') || AUDIO_EXTS.includes(ext);
    if (!isImage && !isVideo && !isAudio) return `${t.assets_upload_error_unsupported}: ${file.name}`;
    return null;
  };
  const getFileExtension = (name: string) => name.split('.').pop()?.toLowerCase() || '';
  const loadAudioDurationSeconds = (file: File): Promise<number | null> => new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    const cleanup = () => {
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(objectUrl);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const durationSeconds = Number.isFinite(audio.duration) ? audio.duration : NaN;
      cleanup();
      resolve(Number.isFinite(durationSeconds) ? durationSeconds : null);
    };
    audio.onerror = () => {
      cleanup();
      resolve(null);
    };
    audio.src = objectUrl;
  });
  const loadVideoMetadata = (file: File): Promise<{ durationSeconds: number | null; width: number | null; height: number | null }> => new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      const durationSeconds = Number.isFinite(video.duration) ? video.duration : NaN;
      const width = Number.isFinite(video.videoWidth) && video.videoWidth > 0 ? video.videoWidth : NaN;
      const height = Number.isFinite(video.videoHeight) && video.videoHeight > 0 ? video.videoHeight : NaN;
      cleanup();
      resolve({
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
        width: Number.isFinite(width) ? width : null,
        height: Number.isFinite(height) ? height : null,
      });
    };
    video.onerror = () => {
      cleanup();
      resolve({ durationSeconds: null, width: null, height: null });
    };
    video.src = objectUrl;
  });
  const patchUploadedMediaMetadata = useCallback(async (uploadResp: any, file: File, assetType: AssetType) => {
    if (assetType !== 'audio' && assetType !== 'motion') return;
    const assetId = String(uploadResp?.data?.id || uploadResp?.id || '').trim();
    if (!assetId) return;
    const format = getFileExtension(file.name);
    try {
      if (assetType === 'audio') {
        const durationSeconds = await loadAudioDurationSeconds(file);
        if (!durationSeconds || durationSeconds <= 0) return;
        await assetsApi.patchAssetMeta(assetId, {
          duration_seconds: durationSeconds,
          ...(format ? { format } : {}),
        });
        return;
      }
      const metadata = await loadVideoMetadata(file);
      if (!metadata.durationSeconds || metadata.durationSeconds <= 0) return;
      await assetsApi.patchAssetMeta(assetId, {
        duration_seconds: metadata.durationSeconds,
        ...(metadata.width ? { width: metadata.width } : {}),
        ...(metadata.height ? { height: metadata.height } : {}),
        ...(format ? { format } : {}),
      });
    } catch (err) {
      console.warn('Failed to patch uploaded asset metadata', err);
    }
  }, []);

  const assetTabLabel: Record<AssetType, string> = {
    model: t.assets_tab_models,
    product: t.assets_tab_products,
    scene: t.assets_tab_scenes,
    motion: t.assets_tab_motion,
    audio: t.assets_tab_audio || '音频'
  };
  const [themeClassSnapshot, setThemeClassSnapshot] = useState<string>('');
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const sync = () => setThemeClassSnapshot(root.className || '');
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  const isLightTheme = themeClassSnapshot.includes('theme-light');
  const isDimTheme = themeClassSnapshot.includes('theme-dim');

  const [viewMode, setViewMode] = useState<'library' | 'plaza'>('library');
  
  // Data State
  const [assetList, setAssetList] = useState<Asset[]>([]);
  const [folderList, setFolderList] = useState<AssetFolder[]>([]);
  const [allTypeAssets, setAllTypeAssets] = useState<Asset[]>([]);
  const [allTypeFolders, setAllTypeFolders] = useState<AssetFolder[]>([]);
  const [folderBreadcrumb, setFolderBreadcrumb] = useState<AssetFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAssetTab, setActiveAssetTab] = useState<AssetType>('product');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragUploadActive, setIsDragUploadActive] = useState(false);
  const [plazaItems, setPlazaItems] = useState<PlazaAssetItem[]>([]);
  const [plazaLoading, setPlazaLoading] = useState(false);
  const [plazaSearch, setPlazaSearch] = useState('');
  const [plazaSource, setPlazaSource] = useState<'all' | 'official' | 'user'>('all');
  const [plazaCollectPolicy, setPlazaCollectPolicy] = useState<PlazaCollectPolicy>({
    daily_free_limit: 3,
    used_today: 0,
    free_remaining: 3,
    paid_cost_vpoints: 1,
  });
  const [plazaKeywordDraft, setPlazaKeywordDraft] = useState('');
  const [plazaDetailItem, setPlazaDetailItem] = useState<PlazaAssetItem | null>(null);
  const [plazaManageItem, setPlazaManageItem] = useState<PlazaAssetItem | null>(null);
  const [plazaManageName, setPlazaManageName] = useState('');
  const [plazaManageCategory, setPlazaManageCategory] = useState<AssetType>('product');
  const [plazaManageKeywords, setPlazaManageKeywords] = useState('');
  const [isPlazaManaging, setIsPlazaManaging] = useState(false);
  const plazaUploadInputRef = useRef<HTMLInputElement>(null);
  
  // UI State
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [hideReferencedOtherViews, setHideReferencedOtherViews] = useState(false);
  const subjectGuideContent = useMemo(() => getSubjectGuideContent(t, language), [t, language]);
  const [referencedOtherViewIds, setReferencedOtherViewIds] = useState<Set<string>>(new Set());

  // Inline rename (asset)
  const [renamingAssetId, setRenamingAssetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [isSavingRename, setIsSavingRename] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameIgnoreBlurRef = useRef(false);
  const suppressPreviewClickUntilRef = useRef<number>(0);
  const suppressDragUntilRef = useRef<number>(0);
  
  // --- Modal States ---
  
  // 1. Folder Create/Rename
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState<'create' | 'rename'>('create');
  const [folderModalTarget, setFolderModalTarget] = useState<AssetFolder | null>(null);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [isSavingFolder, setIsSavingFolder] = useState(false);
  const folderNameInputRef = useRef<HTMLInputElement>(null);

  // 2. Move Asset
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [moveAssets, setMoveAssets] = useState<Asset[]>([]);
  const [moveFolder, setMoveFolder] = useState<AssetFolder | null>(null);
  const [moveFolders, setMoveFolders] = useState<AssetFolder[]>([]);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [isMoveDropdownOpen, setIsMoveDropdownOpen] = useState(false);
  const [isMovingAsset, setIsMovingAsset] = useState(false);
  const [moveExpandedFolderIds, setMoveExpandedFolderIds] = useState<Set<string>>(new Set());

  // 2.5 Drag & Drop (Move Asset)
  const [draggingAsset, setDraggingAsset] = useState<Asset | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [isDragOverRoot, setIsDragOverRoot] = useState(false);
  const [isDragMoving, setIsDragMoving] = useState(false);

  // 3. Confirm Dialog
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [confirmIsDanger, setConfirmIsDanger] = useState(false);
  const [confirmIsWorking, setConfirmIsWorking] = useState(false);
  const confirmActionRef = useRef<null | (() => Promise<void> | void)>(null);

  // Info dialog state (replace native alert)
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [infoTitle, setInfoTitle] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubjectGuideModalOpen, setIsSubjectGuideModalOpen] = useState(false);
  const [isSubjectGuideSpotlightOpen, setIsSubjectGuideSpotlightOpen] = useState(false);
  const [shouldRunSubjectGuideSpotlight, setShouldRunSubjectGuideSpotlight] = useState(false);
  const [subjectGuideHighlightStyle, setSubjectGuideHighlightStyle] = useState<React.CSSProperties>({});
  const [subjectGuideTooltipStyle, setSubjectGuideTooltipStyle] = useState<React.CSSProperties>({});
  const subjectGuideButtonRef = useRef<HTMLButtonElement>(null);
  const openInfo = (title: string, message: string | null = null) => {
    setInfoTitle(title || '');
    setInfoMessage(message || null);
    setIsInfoOpen(true);
  };
  const openSubjectGuideModal = useCallback((withSpotlight = false) => {
    setShouldRunSubjectGuideSpotlight(withSpotlight);
    setIsSubjectGuideModalOpen(true);
  }, []);
  const updateSubjectGuideSpotlightPosition = useCallback(() => {
    const target = subjectGuideButtonRef.current;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const padding = 8;
    const tooltipWidth = 288;
    const nextLeft = Math.max(24, Math.min(window.innerWidth - tooltipWidth - 24, rect.left + rect.width - 44));

    setSubjectGuideHighlightStyle({
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });
    setSubjectGuideTooltipStyle({
      top: rect.bottom + 20,
      left: nextLeft,
      width: tooltipWidth,
    });
  }, []);
  const closeSubjectGuideSpotlight = useCallback(() => {
    setIsSubjectGuideSpotlightOpen(false);
    onSubjectGuideCompleted?.();
  }, [onSubjectGuideCompleted]);

  const folderSummaryById = useMemo(() => {
    const childFoldersByParent = new Map<string | null, AssetFolder[]>();
    allTypeFolders.forEach((folder) => {
      const list = childFoldersByParent.get(folder.parent_id ?? null) || [];
      list.push(folder);
      childFoldersByParent.set(folder.parent_id ?? null, list);
    });

    const assetsByFolderId = new Map<string, Asset[]>();
    allTypeAssets.forEach((asset) => {
      if (!asset.folder_id) return;
      const list = assetsByFolderId.get(asset.folder_id) || [];
      list.push(asset);
      assetsByFolderId.set(asset.folder_id, list);
    });

    const cache = new Map<string, { assetCount: number; subfolderCount: number; previewAssets: Asset[]; previewFolderNames: string[] }>();
    const collect = (folderId: string): { assetCount: number; subfolderCount: number; previewAssets: Asset[]; previewFolderNames: string[] } => {
      const cached = cache.get(folderId);
      if (cached) return cached;

      const directChildren = childFoldersByParent.get(folderId) || [];
      const directAssets = assetsByFolderId.get(folderId) || [];
      let assetCount = directAssets.length;
      let subfolderCount = directChildren.length;
      let previewAssets = directAssets.slice(0, 3);
      let previewFolderNames = directChildren.slice(0, 3).map((item) => item.name);

      directChildren.forEach((child) => {
        const childSummary = collect(child.id);
        assetCount += childSummary.assetCount;
        subfolderCount += childSummary.subfolderCount;
        if (previewAssets.length < 3) previewAssets = [...previewAssets, ...childSummary.previewAssets].slice(0, 3);
        if (previewFolderNames.length < 3) previewFolderNames = [...previewFolderNames, ...childSummary.previewFolderNames].slice(0, 3);
      });

      const summary = { assetCount, subfolderCount, previewAssets, previewFolderNames };
      cache.set(folderId, summary);
      return summary;
    };

    const summaryMap = new Map<string, { assetCount: number; subfolderCount: number; previewAssets: Asset[]; previewFolderNames: string[] }>();
    allTypeFolders.forEach((folder) => {
      summaryMap.set(folder.id, collect(folder.id));
    });
    return summaryMap;
  }, [allTypeAssets, allTypeFolders]);

  useEffect(() => {
    if (!isSubjectGuideSpotlightOpen) return;

    updateSubjectGuideSpotlightPosition();
    const handleReposition = () => updateSubjectGuideSpotlightPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isSubjectGuideSpotlightOpen, updateSubjectGuideSpotlightPosition]);

  useEffect(() => {
    if (!navigationIntent) return;

    setViewMode('library');
    setCurrentFolderId(null);
    setFolderBreadcrumb([]);
    setIsSelectionMode(false);
    setOpenFolderMenuId(null);

    if (navigationIntent === 'open_assets_for_subject_creation_first_time') {
      openSubjectGuideModal(true);
    }

    onNavigationIntentHandled?.();
  }, [navigationIntent, onNavigationIntentHandled, openSubjectGuideModal, setCurrentFolderId]);

  // 4. Preview
  const [isAssetPreviewOpen, setIsAssetPreviewOpen] = useState(false);
  const [assetPreview, setAssetPreview] = useState<Asset | null>(null);
  const [assetDescriptionDraft, setAssetDescriptionDraft] = useState('');
  const [isAssetDescriptionSaved, setIsAssetDescriptionSaved] = useState(true);
  const [assetDescriptionSavedAt, setAssetDescriptionSavedAt] = useState('');
  const [isGeneratingAssetDescription, setIsGeneratingAssetDescription] = useState(false);
  const [isSavingAssetDescription, setIsSavingAssetDescription] = useState(false);
  const [subjectLibraryAssets, setSubjectLibraryAssets] = useState<Asset[]>([]);
  const [subjectPickerAssetsList, setSubjectPickerAssetsList] = useState<Asset[]>([]);
  const [subjectLibraryFolders, setSubjectLibraryFolders] = useState<AssetFolder[]>([]);
  const [subjectPickerFolderId, setSubjectPickerFolderId] = useState<string | null>(null);
  const [subjectPickerBreadcrumb, setSubjectPickerBreadcrumb] = useState<AssetFolder[]>([]);
  const [subjectPickerSlotIndex, setSubjectPickerSlotIndex] = useState<number | null>(null);
  const [isSubjectPickerOpen, setIsSubjectPickerOpen] = useState(false);
  const [isSubjectPickerLoading, setIsSubjectPickerLoading] = useState(false);
  const [isSubjectGroupEditing, setIsSubjectGroupEditing] = useState(false);
  const [subjectSlotActionIndex, setSubjectSlotActionIndex] = useState<number | null>(null);
  const [subjectPreviewImage, setSubjectPreviewImage] = useState<Asset | null>(null);
  const [isSavingSubjectGroup, setIsSavingSubjectGroup] = useState(false);

  const assetInputRef = useRef<HTMLInputElement>(null);
  const subjectOtherViewUploadRef = useRef<HTMLInputElement>(null);
  const subjectSlotActionRef = useRef<HTMLDivElement>(null);

  const getAssetSubjectMeta = useCallback((asset: Asset | null | undefined) => {
    const raw = asset?.meta_data?.kling_subject;
    return raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  }, []);

  const getAssetSubjectName = useCallback((asset: Asset | null | undefined) => {
    const meta = getAssetSubjectMeta(asset);
    return String(meta.name || asset?.name || '').trim();
  }, [getAssetSubjectMeta]);

  const getAssetSubjectDescription = useCallback((asset: Asset | null | undefined) => {
    const meta = getAssetSubjectMeta(asset);
    return String(meta.description || '').trim();
  }, [getAssetSubjectMeta]);
  const getAssetSubjectStatus = useCallback((asset: Asset | null | undefined) => {
    const meta = getAssetSubjectMeta(asset);
    return String(meta.status || '').trim().toLowerCase();
  }, [getAssetSubjectMeta]);
  const getAssetSubjectOtherViewIds = useCallback((asset: Asset | null | undefined) => {
    const meta = getAssetSubjectMeta(asset);
    const raw = meta.other_view_asset_ids;
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => String(item || '').trim()).filter(Boolean);
  }, [getAssetSubjectMeta]);
  const getAssetParentSubjectId = useCallback((asset: Asset | null | undefined) => {
    const meta = getAssetSubjectMeta(asset);
    const value = String(meta.parent_subject_id || '').trim();
    return value || null;
  }, [getAssetSubjectMeta]);

  useEffect(() => {
    if (subjectSlotActionIndex === null) return;

    const handlePointerDown = (event: MouseEvent) => {
      const container = subjectSlotActionRef.current;
      if (!container) return;
      if (container.contains(event.target as Node)) return;
      setSubjectSlotActionIndex(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSubjectSlotActionIndex(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [subjectSlotActionIndex]);
  const buildInvalidatedSubjectMeta = useCallback((asset: Asset, overrides: Record<string, unknown> = {}) => {
    const currentSubjectMeta = getAssetSubjectMeta(asset);
    return {
      ...currentSubjectMeta,
      name: String(currentSubjectMeta.name || asset.name || '').trim(),
      ...overrides,
      element_id: null,
      create_task_id: null,
      status: '',
      last_error: '',
    };
  }, [getAssetSubjectMeta]);
  const syncAssetMetaBatch = useCallback((updates: Record<string, Record<string, unknown>>) => {
    const nextMap = new Map(Object.entries(updates));
    if (nextMap.size === 0) return;
    setAssetList(prev => prev.map(item => (
      nextMap.has(item.id) ? { ...item, meta_data: nextMap.get(item.id)! } : item
    )));
    setSubjectLibraryAssets(prev => prev.map(item => (
      nextMap.has(item.id) ? { ...item, meta_data: nextMap.get(item.id)! } : item
    )));
    setAssetPreview(prev => (
      prev && nextMap.has(prev.id) ? { ...prev, meta_data: nextMap.get(prev.id)! } : prev
    ));
  }, []);
  const closeSubjectPicker = useCallback(() => {
    setIsSubjectPickerOpen(false);
    setSubjectPickerSlotIndex(null);
    setSubjectSlotActionIndex(null);
    setSubjectPickerFolderId(null);
    setSubjectPickerBreadcrumb([]);
    setSubjectLibraryFolders([]);
    setSubjectPickerAssetsList([]);
  }, []);
  const subjectDescriptionLimit = ({
    zh: 60,
    ja: 60,
    ko: 75,
    en: 140,
    es: 140,
    ms: 140,
    vi: 140,
  } as const)[language] ?? 60;
  const normalizeSubjectDescriptionText = useCallback((value: string) => (
    value
      .replace(/\s+/g, ' ')
      .replace(/([，。！？；：,.!?;:])\1+/g, '$1')
      .replace(/。[,，]/g, '。')
      .replace(/，\s*[，。]/g, '，')
      .trim()
      .slice(0, subjectDescriptionLimit)
  ), [subjectDescriptionLimit]);
  const refreshReferencedOtherViewIds = useCallback(async () => {
    const [products, models] = await Promise.all([
      assetsApi.getAssets({ type: 'product' }),
      assetsApi.getAssets({ type: 'model' }),
    ]);
    const next = new Set<string>();
    [...products, ...models].forEach((asset) => {
      const parentSubjectId = getAssetParentSubjectId(asset);
      if (parentSubjectId) next.add(asset.id);
      getAssetSubjectOtherViewIds(asset).forEach((id) => next.add(id));
    });
    setReferencedOtherViewIds(next);
  }, [getAssetParentSubjectId, getAssetSubjectOtherViewIds]);

  // --- API Loaders ---
  const loadData = useCallback(async () => {
    if (viewMode !== 'library') return;
    setIsLoading(true);
    try {
      const [assets, folderData, allAssets, allFolders] = await Promise.all([
        assetsApi.getAssets({ type: activeAssetTab, folderId: currentFolderId }),
        assetsApi.getFolders({ type: activeAssetTab, parentId: currentFolderId }),
        assetsApi.getAssets({ type: activeAssetTab }),
        assetsApi.getAllFolders(activeAssetTab),
      ]);
      setAssetList(Array.isArray(assets) ? assets : []);
      setFolderList(folderData.folders);
      setFolderBreadcrumb(folderData.breadcrumb);
      setAllTypeAssets(Array.isArray(allAssets) ? allAssets : []);
      setAllTypeFolders(Array.isArray(allFolders) ? allFolders : []);
    } catch (err) {
      console.error("Failed to load assets", err);
    } finally {
      setIsLoading(false);
    }
  }, [activeAssetTab, currentFolderId, viewMode]);

  const loadPlazaData = useCallback(async () => {
    if (viewMode !== 'plaza') return;
    setPlazaLoading(true);
    try {
      const resp = await assetsApi.getPlazaAssets({
        category: activeAssetTab,
        source: plazaSource,
        q: plazaSearch.trim(),
        limit: 120,
        offset: 0,
      });
      setPlazaItems(resp.items || []);
      setPlazaCollectPolicy(resp.collectPolicy);
    } catch (err) {
      console.error('Failed to load plaza assets', err);
      openInfo(t.assets_confirm_title || 'Notice', String(err instanceof Error ? err.message : err));
    } finally {
      setPlazaLoading(false);
    }
  }, [activeAssetTab, plazaSearch, plazaSource, t.assets_confirm_title, viewMode]);

  // --- Effects ---
  useEffect(() => {
    if (viewMode === 'library') {
      void loadData();
      setOpenFolderMenuId(null);
      setIsSelectionMode(false);
      setSelectedAssetIds(new Set());
      return;
    }
    void loadPlazaData();
  }, [loadData, loadPlazaData, viewMode]);

  useEffect(() => {
    if (isFolderModalOpen) {
       setTimeout(() => folderNameInputRef.current?.focus(), 50);
    }
  }, [isFolderModalOpen]);

  useEffect(() => {
    if (!isSelectionMode && selectedAssetIds.size > 0) {
      setSelectedAssetIds(new Set());
    }
  }, [isSelectionMode, selectedAssetIds.size]);

  useEffect(() => {
    if (!renamingAssetId) return;
    const timer = window.setTimeout(() => {
      const el = renameInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [renamingAssetId]);

  useEffect(() => {
    if (!hideReferencedOtherViews) {
      setReferencedOtherViewIds(new Set());
      return;
    }
    let cancelled = false;
    const loadReferencedOtherViewIds = async () => {
      try {
        await refreshReferencedOtherViewIds();
        if (cancelled) return;
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load referenced other-view assets', err);
        setReferencedOtherViewIds(new Set());
      }
    };
    void loadReferencedOtherViewIds();
    return () => {
      cancelled = true;
    };
  }, [hideReferencedOtherViews, refreshReferencedOtherViewIds]);

  useEffect(() => {
    if (!assetPreview || (assetPreview.type !== 'product' && assetPreview.type !== 'model')) {
      setSubjectLibraryAssets([]);
      setIsSubjectGroupEditing(false);
      setSubjectSlotActionIndex(null);
      closeSubjectPicker();
      return;
    }
    let cancelled = false;
    const loadSubjectAssets = async () => {
      try {
        const assets = await assetsApi.getAssets({ type: assetPreview.type });
        if (cancelled) return;
        setSubjectLibraryAssets(Array.isArray(assets) ? assets : []);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load subject library assets', err);
        setSubjectLibraryAssets([]);
      }
    };
    void loadSubjectAssets();
    return () => {
      cancelled = true;
    };
  }, [assetPreview, closeSubjectPicker]);

  useEffect(() => {
    if (!isSubjectPickerOpen || !assetPreview || (assetPreview.type !== 'product' && assetPreview.type !== 'model')) return;
    let cancelled = false;
    const loadSubjectPickerData = async () => {
      setIsSubjectPickerLoading(true);
      try {
        const [assets, folderData] = await Promise.all([
          assetsApi.getAssets({ type: assetPreview.type, folderId: subjectPickerFolderId }),
          assetsApi.getFolders({ type: assetPreview.type, parentId: subjectPickerFolderId }),
        ]);
        if (cancelled) return;
        setSubjectPickerAssetsList(Array.isArray(assets) ? assets : []);
        setSubjectLibraryFolders(folderData.folders);
        setSubjectPickerBreadcrumb(folderData.breadcrumb);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load subject picker assets', err);
        setSubjectPickerAssetsList([]);
        setSubjectLibraryFolders([]);
        setSubjectPickerBreadcrumb([]);
      } finally {
        if (!cancelled) setIsSubjectPickerLoading(false);
      }
    };
    void loadSubjectPickerData();
    return () => {
      cancelled = true;
    };
  }, [assetPreview, isSubjectPickerOpen, subjectPickerFolderId]);

  useEffect(() => {
    if (isAssetPreviewOpen) return;
    setIsSubjectGroupEditing(false);
    setSubjectSlotActionIndex(null);
    setSubjectPreviewImage(null);
    closeSubjectPicker();
  }, [closeSubjectPicker, isAssetPreviewOpen]);

  const uploadFiles = async (files: FileList | File[]) => {
    const errors: string[] = [];
    const validFiles: File[] = [];
    Array.from(files).forEach(file => {
      const err = validateUploadFile(file);
      if (err) errors.push(err);
      else validFiles.push(file);
    });
    if (errors.length > 0) openInfo((t as any).assets_upload_formats_title || 'Upload error', `${errors.join('\n')}\n\n${(t as any).assets_upload_formats_title}:\n${formatHint}`);
    if (validFiles.length === 0) return;
    setIsUploading(true);
    try {
      const uploadTasks = validFiles.map(async (file) => {
        const uploadResp = await assetsApi.uploadAsset(file, activeAssetTab, currentFolderId);
        await patchUploadedMediaMetadata(uploadResp, file, activeAssetTab);
        return uploadResp;
      });
      await Promise.all(uploadTasks);
      await loadData();
      openInfo((t as any).assets_upload_success_title || 'Upload complete', `Successfully uploaded ${validFiles.length} files!`);
    } catch (err) {
      console.error(err);
      openInfo((t as any).assets_upload_failed || 'Upload failed', String(err instanceof Error ? err.message : err));
    } finally {
      setIsUploading(false);
    }
  };

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(files);
    if (assetInputRef.current) assetInputRef.current.value = '';
  };

  const handleUploadDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types?.includes('Files')) return;
    e.preventDefault();
    setIsDragUploadActive(true);
  };

  const handleUploadDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types?.includes('Files')) return;
    e.preventDefault();
    setIsDragUploadActive(false);
  };

  const handleUploadDrop = async (e: React.DragEvent) => {
    if (!e.dataTransfer.types?.includes('Files')) return;
    e.preventDefault();
    setIsDragUploadActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFiles(e.dataTransfer.files);
    }
  };

  const handlePlazaReaction = async (item: PlazaAssetItem, action: 'like' | 'star') => {
    const nextValue = action === 'like' ? !item.is_liked : !item.is_starred;
    setPlazaItems(prev => prev.map((it) => {
      if (it.id !== item.id) return it;
      if (action === 'like') {
        return {
          ...it,
          is_liked: nextValue,
          like_count: Math.max(0, it.like_count + (nextValue ? 1 : -1)),
        };
      }
      return {
        ...it,
        is_starred: nextValue,
        star_count: Math.max(0, it.star_count + (nextValue ? 1 : -1)),
      };
    }));

    try {
      const resp = await assetsApi.setPlazaReaction(item.id, action, nextValue);
      const data = resp?.data || {};
      setPlazaItems(prev => prev.map((it) => (
        it.id === item.id
          ? {
              ...it,
              is_liked: Boolean(data.is_liked),
              is_starred: Boolean(data.is_starred),
              like_count: Number(data.like_count ?? it.like_count),
              star_count: Number(data.star_count ?? it.star_count),
            }
          : it
      )));
    } catch (err) {
      await loadPlazaData();
      openInfo(t.assets_confirm_title || 'Notice', String(err instanceof Error ? err.message : err));
    }
  };

  const handleOpenPlazaDetail = async (item: PlazaAssetItem) => {
    try {
      const resp = await assetsApi.getPlazaAssetDetail(item.id);
      setPlazaDetailItem((resp?.data || item) as PlazaAssetItem);
    } catch (err) {
      openInfo(t.assets_confirm_title || 'Notice', String(err instanceof Error ? err.message : err));
    }
  };

  const openPlazaManage = (item: PlazaAssetItem) => {
    setPlazaManageItem(item);
    setPlazaManageName(item.display_name || '');
    setPlazaManageCategory((item.category || 'product') as AssetType);
    setPlazaManageKeywords(item.keywords || '');
  };

  const savePlazaManage = async () => {
    if (!plazaManageItem) return;
    const nextName = plazaManageName.trim();
    if (!nextName) {
      openInfo(t.assets_confirm_title || 'Notice', t.assets_name_label || 'Name');
      return;
    }
    setIsPlazaManaging(true);
    try {
      await assetsApi.updatePlazaAsset(plazaManageItem.id, {
        display_name: nextName,
        category: plazaManageCategory,
        keywords: plazaManageKeywords.trim(),
      });
      setPlazaManageItem(null);
      await loadPlazaData();
      openInfo(t.assets_confirm_title || 'Notice', t.assets_plaza_manage_saved || 'Saved');
    } catch (err) {
      openInfo(t.assets_confirm_title || 'Notice', String(err instanceof Error ? err.message : err));
    } finally {
      setIsPlazaManaging(false);
    }
  };

  const deletePlazaManagedItem = async () => {
    if (!plazaManageItem) return;
    setIsPlazaManaging(true);
    try {
      await assetsApi.deletePlazaAsset(plazaManageItem.id);
      setPlazaManageItem(null);
      await loadPlazaData();
      openInfo(t.assets_confirm_title || 'Notice', t.assets_plaza_delete_success || 'Deleted');
    } catch (err) {
      openInfo(t.assets_confirm_title || 'Notice', String(err instanceof Error ? err.message : err));
    } finally {
      setIsPlazaManaging(false);
    }
  };

  const handleCollectPlazaItem = async (item: PlazaAssetItem) => {
    try {
      const resp = await assetsApi.collectPlazaAsset(item.id, null);
      const data = resp?.data || {};
      const charged = Number(data.charged_vpoints || 0);
      const freeRemaining = Number(data.free_remaining ?? plazaCollectPolicy.free_remaining);
      const balance = Number(data.balance);

      setPlazaItems(prev => prev.map((it) => (
        it.id === item.id
          ? { ...it, collect_count: Math.max(it.collect_count, Number(data.collect_count || it.collect_count)) }
          : it
      )));
      setPlazaCollectPolicy(prev => ({ ...prev, free_remaining: freeRemaining }));

      if (!Number.isNaN(balance)) {
        updateUser({ credits: balance });
      }

      if (charged > 0) {
        openInfo(t.assets_confirm_title || 'Notice', `${t.assets_plaza_collect_success_paid || 'Collect success, V-points deducted'}: -${charged}`);
      } else {
        openInfo(t.assets_confirm_title || 'Notice', t.assets_plaza_collect_success_free || 'Collect success (free quota used)');
      }
    } catch (err) {
      openInfo(t.assets_confirm_title || 'Notice', String(err instanceof Error ? err.message : err));
    }
  };

  const handleAdminUploadToPlaza = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setPlazaLoading(true);
    try {
      await Promise.all(list.map((file) => assetsApi.uploadPlazaAsset({
        file,
        category: activeAssetTab,
        keywords: plazaKeywordDraft,
      })));
      setPlazaKeywordDraft('');
      await loadPlazaData();
      openInfo(t.assets_confirm_title || 'Notice', t.assets_plaza_upload_success || 'Plaza upload complete');
    } catch (err) {
      openInfo(t.assets_confirm_title || 'Notice', String(err instanceof Error ? err.message : err));
    } finally {
      setPlazaLoading(false);
      if (plazaUploadInputRef.current) plazaUploadInputRef.current.value = '';
    }
  };

  const deleteAssetById = useCallback(async (id: string) => {
    try {
      const targetAsset = assetList.find((item) => item.id === id)
        || subjectLibraryAssets.find((item) => item.id === id)
        || (assetPreview?.id === id ? assetPreview : null);
      const parentSubjectId = getAssetParentSubjectId(targetAsset);
      if (parentSubjectId) {
        const subjectAsset = subjectLibraryAssets.find((item) => item.id === parentSubjectId)
          || assetList.find((item) => item.id === parentSubjectId)
          || (assetPreview?.id === parentSubjectId ? assetPreview : null)
          || (await assetsApi.getAssets({ type: targetAsset?.type === 'model' ? 'model' : 'product' })).find((item) => item.id === parentSubjectId)
          || null;
        if (subjectAsset) {
          const nextChildIds = getAssetSubjectOtherViewIds(subjectAsset).filter((childId) => childId !== id);
          const response = await assetsApi.patchAssetMeta(subjectAsset.id, {
            kling_subject: buildInvalidatedSubjectMeta(subjectAsset, {
              other_view_asset_ids: nextChildIds,
            }),
          });
          const nextMeta = (response?.meta_data || {
            ...(subjectAsset.meta_data || {}),
            kling_subject: buildInvalidatedSubjectMeta(subjectAsset, {
              other_view_asset_ids: nextChildIds,
            }),
          }) as Record<string, unknown>;
          syncAssetMetaBatch({
            [subjectAsset.id]: nextMeta,
          });
        }
      }
      if (targetAsset) {
        const childIds = getAssetSubjectOtherViewIds(targetAsset);
        if (childIds.length > 0) {
          const subjectType = targetAsset.type === 'model' ? 'model' : targetAsset.type === 'product' ? 'product' : null;
          const allTypedAssets = subjectType ? await assetsApi.getAssets({ type: subjectType }) : [];
          const childUpdates: Record<string, Record<string, unknown>> = {};
          for (const childId of childIds) {
            const childAsset = allTypedAssets.find((item) => item.id === childId)
              || subjectLibraryAssets.find((item) => item.id === childId)
              || assetList.find((item) => item.id === childId)
              || null;
            if (!childAsset) continue;
            const childSubjectMeta = getAssetSubjectMeta(childAsset);
            childUpdates[childId] = {
              ...(childAsset.meta_data || {}),
              kling_subject: {
                ...childSubjectMeta,
                parent_subject_id: null,
              },
            };
          }
          await Promise.all(Object.entries(childUpdates).map(async ([assetId, meta]) => {
            await assetsApi.patchAssetMeta(assetId, meta);
          }));
          syncAssetMetaBatch(childUpdates);
        }
      }
      await assetsApi.deleteAsset(id);
      setAssetList(prev => prev.filter(a => a.id !== id));
      setSubjectLibraryAssets(prev => prev.filter((item) => item.id !== id));
      setAssetPreview((prev) => (prev?.id === id ? null : prev));
      if (hideReferencedOtherViews) {
        await refreshReferencedOtherViewIds();
      }
    } catch (err) {
      console.error(err);
      openInfo((t as any).assets_delete_failed || 'Failed to delete asset', String(err instanceof Error ? err.message : err));
    }
  }, [assetList, assetPreview, buildInvalidatedSubjectMeta, getAssetParentSubjectId, getAssetSubjectMeta, getAssetSubjectOtherViewIds, hideReferencedOtherViews, openInfo, refreshReferencedOtherViewIds, subjectLibraryAssets, syncAssetMetaBatch, t]);

  const beginRenameAsset = (asset: Asset) => {
    setRenamingAssetId(asset.id);
    setRenameDraft(asset.name || '');
  };

  const cancelRenameAsset = () => {
    setRenamingAssetId(null);
    setRenameDraft('');
    setIsSavingRename(false);
    renameIgnoreBlurRef.current = false;
  };

  const commitRenameAsset = async (asset: Asset) => {
    if (isSavingRename) return;
    const nextName = renameDraft.trim();
    if (!nextName || nextName === asset.name) {
      cancelRenameAsset();
      return;
    }

    setIsSavingRename(true);
    renameIgnoreBlurRef.current = true;
    try {
      const resp = await assetsApi.renameAsset(asset.id, nextName);
      const serverName = (resp?.display_name || resp?.name || nextName) as string;
      setAssetList(prev => prev.map(a => (a.id === asset.id ? { ...a, name: serverName } : a)));
      cancelRenameAsset();
    } catch (err) {
      console.error(err);
      openInfo((t as any).assets_rename_failed || 'Failed to rename asset', String(err instanceof Error ? err.message : err));
      cancelRenameAsset();
    } finally {
      renameIgnoreBlurRef.current = false;
    }
  };

  const syncPreviewAssetMeta = useCallback((assetId: string, nextMeta: Record<string, unknown>) => {
    setAssetList(prev => prev.map(item => (
      item.id === assetId ? { ...item, meta_data: nextMeta } : item
    )));
    setAssetPreview(prev => (
      prev && prev.id === assetId ? { ...prev, meta_data: nextMeta } : prev
    ));
  }, []);

  const saveAssetDescription = useCallback(async () => {
    if (!assetPreview) return;
    const nextDescription = assetDescriptionDraft.trim();
    setIsSavingAssetDescription(true);
    try {
      const response = await assetsApi.patchAssetMeta(assetPreview.id, {
        kling_subject: buildInvalidatedSubjectMeta(assetPreview, {
          description: nextDescription,
        }),
      });
      const nextMeta = (response?.meta_data || {
        ...(assetPreview.meta_data || {}),
        kling_subject: buildInvalidatedSubjectMeta(assetPreview, {
          description: nextDescription,
        }),
      }) as Record<string, unknown>;
      syncPreviewAssetMeta(assetPreview.id, nextMeta);
      setIsAssetDescriptionSaved(true);
      setAssetDescriptionSavedAt(new Date().toISOString().slice(0, 10));
      openInfo(t.assets_confirm_title || 'Notice', t.assets_save || 'Saved');
    } catch (err) {
      openInfo(t.assets_confirm_title || 'Notice', String(err instanceof Error ? err.message : err));
    } finally {
      setIsSavingAssetDescription(false);
    }
  }, [assetDescriptionDraft, assetPreview, buildInvalidatedSubjectMeta, openInfo, syncPreviewAssetMeta, t.assets_confirm_title, t.assets_save]);

  const persistSubjectOtherViews = useCallback(async (subjectAsset: Asset, nextChildIds: string[]) => {
    const uniqueChildIds = Array.from(new Set(nextChildIds.filter(Boolean))).slice(0, 3);
    const previousChildIds = getAssetSubjectOtherViewIds(subjectAsset);
    const previousChildIdSet = new Set(previousChildIds);
    const nextChildIdSet = new Set(uniqueChildIds);
    const updates: Record<string, Record<string, unknown>> = {};
    const nextSubjectMeta = buildInvalidatedSubjectMeta(subjectAsset, {
      other_view_asset_ids: uniqueChildIds,
    });
    updates[subjectAsset.id] = {
      ...(subjectAsset.meta_data || {}),
      kling_subject: nextSubjectMeta,
    };

    for (const childId of previousChildIds) {
      if (nextChildIdSet.has(childId)) continue;
      const childAsset = subjectLibraryAssets.find((item) => item.id === childId) || assetList.find((item) => item.id === childId);
      if (!childAsset) continue;
      const childSubjectMeta = getAssetSubjectMeta(childAsset);
      updates[childId] = {
        ...(childAsset.meta_data || {}),
        kling_subject: {
          ...childSubjectMeta,
          parent_subject_id: null,
        },
      };
    }

    for (const childId of uniqueChildIds) {
      const childAsset = subjectLibraryAssets.find((item) => item.id === childId) || assetList.find((item) => item.id === childId);
      if (!childAsset) continue;
      const childSubjectMeta = getAssetSubjectMeta(childAsset);
      if (previousChildIdSet.has(childId) && getAssetParentSubjectId(childAsset) === subjectAsset.id) continue;
      updates[childId] = {
        ...(childAsset.meta_data || {}),
        kling_subject: {
          ...childSubjectMeta,
          parent_subject_id: subjectAsset.id,
        },
      };
    }

    setIsSavingSubjectGroup(true);
    try {
      await Promise.all(Object.entries(updates).map(async ([assetId, meta]) => {
        await assetsApi.patchAssetMeta(assetId, meta);
      }));
      syncAssetMetaBatch(updates);
      if (hideReferencedOtherViews) {
        await refreshReferencedOtherViewIds();
      }
    } finally {
      setIsSavingSubjectGroup(false);
    }
  }, [assetList, buildInvalidatedSubjectMeta, getAssetParentSubjectId, getAssetSubjectMeta, getAssetSubjectOtherViewIds, hideReferencedOtherViews, refreshReferencedOtherViewIds, subjectLibraryAssets, syncAssetMetaBatch]);

  const appendSubjectOtherView = useCallback(async (candidate: Asset) => {
    if (!assetPreview) return;
    const currentIds = getAssetSubjectOtherViewIds(assetPreview);
    if (currentIds.includes(candidate.id)) return;
    if (currentIds.length >= 3) {
      openInfo(t.assets_confirm_title || 'Notice', 'Limit reached');
      return;
    }
    const parentSubjectId = getAssetParentSubjectId(candidate);
    if (parentSubjectId && parentSubjectId !== assetPreview.id) {
      openInfo(t.assets_confirm_title || 'Notice', 'This asset is already linked to another subject');
      return;
    }
    await persistSubjectOtherViews(assetPreview, [...currentIds, candidate.id]);
    closeSubjectPicker();
  }, [assetPreview, closeSubjectPicker, getAssetParentSubjectId, getAssetSubjectOtherViewIds, openInfo, persistSubjectOtherViews, t.assets_confirm_title]);

  const removeSubjectOtherView = useCallback(async (childId: string) => {
    if (!assetPreview) return;
    const currentIds = getAssetSubjectOtherViewIds(assetPreview);
    await persistSubjectOtherViews(assetPreview, currentIds.filter((id) => id !== childId));
  }, [assetPreview, getAssetSubjectOtherViewIds, persistSubjectOtherViews]);

  const openSubjectPicker = useCallback((slotIndex: number) => {
    setSubjectPickerSlotIndex(slotIndex);
    setSubjectPickerFolderId(null);
    setIsSubjectPickerOpen(true);
    setSubjectSlotActionIndex(null);
  }, []);

  const handleSubjectOtherViewUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !assetPreview) return;
    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = file.type.startsWith('image/') || IMAGE_EXTS.includes(ext);
    if (!isImage) {
      openInfo(t.assets_confirm_title || 'Notice', 'Image only');
      e.target.value = '';
      return;
    }
    try {
      const uploadResp = await assetsApi.uploadAsset(file, assetPreview.type, assetPreview.folder_id ?? null);
      await loadData();
      const allAssets = await assetsApi.getAssets({ type: assetPreview.type });
      setSubjectLibraryAssets(allAssets);
      const createdId = String(uploadResp?.data?.id || uploadResp?.id || '').trim();
      const uploadedAsset = allAssets.find((item) => item.id === createdId) || allAssets.find((item) => item.name === file.name);
      if (uploadedAsset) {
        await appendSubjectOtherView(uploadedAsset);
      }
    } catch (err) {
      openInfo(t.assets_confirm_title || 'Notice', String(err instanceof Error ? err.message : err));
    } finally {
      e.target.value = '';
      setSubjectSlotActionIndex(null);
    }
  }, [IMAGE_EXTS, appendSubjectOtherView, assetPreview, loadData, openInfo, t.assets_confirm_title]);

  const generateAssetDescription = useCallback(async () => {
    if (!assetPreview?.file_url) return;
    setIsGeneratingAssetDescription(true);
    try {
      const response = assetPreview.type === 'model'
        ? await videoApi.recognizeSubjectInfo({
            image_paths: [assetPreview.file_url],
            output_language: language,
          })
        : await videoApi.recognizeProductInfo({
            image_paths: [assetPreview.file_url],
            output_language: language,
          });
      const data = response?.data || {};
      const nextDescription = assetPreview.type === 'model'
        ? normalizeSubjectDescriptionText(String(data.subject_description || '').trim() || String(data.subject_name || '').trim())
        : [
            String(data.product_name || '').trim(),
            ...(Array.isArray(data.core_selling_points) ? data.core_selling_points.map((item: unknown) => String(item || '').trim()) : []),
          ].filter(Boolean).join('，').slice(0, 100);
      if (!nextDescription) {
        openInfo(t.assets_confirm_title || 'Notice', '当前素材未生成可用描述，请手动编辑。');
        return;
      }
      setAssetDescriptionDraft(nextDescription);
      setIsAssetDescriptionSaved(false);
    } catch (err) {
      openInfo(t.assets_confirm_title || 'Notice', String(err instanceof Error ? err.message : err));
    } finally {
      setIsGeneratingAssetDescription(false);
    }
  }, [assetPreview, getAssetSubjectMeta, language, openInfo, syncPreviewAssetMeta, t.assets_confirm_title]);

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedAssetIds(new Set());
  };


  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const visibleAssets = useMemo(() => (
    assetList.filter((asset) => (
      asset.type === activeAssetTab
      && (!hideReferencedOtherViews || !referencedOtherViewIds.has(asset.id))
    ))
  ), [activeAssetTab, assetList, hideReferencedOtherViews, referencedOtherViewIds]);
  const subjectOtherViewAssets = useMemo(() => {
    if (!assetPreview) return [] as Asset[];
    const ids = getAssetSubjectOtherViewIds(assetPreview);
    if (ids.length === 0) return [] as Asset[];
    const map = new Map<string, Asset>();
    [...subjectLibraryAssets, ...assetList].forEach((item) => {
      map.set(item.id, item);
    });
    return ids.map((id) => map.get(id)).filter((item): item is Asset => Boolean(item));
  }, [assetList, assetPreview, getAssetSubjectOtherViewIds, subjectLibraryAssets]);
  const subjectPickerAssets = useMemo(() => {
    if (!assetPreview) return [] as Asset[];
    const currentIds = new Set(getAssetSubjectOtherViewIds(assetPreview));
    return subjectPickerAssetsList.filter((item) => (
      item.id !== assetPreview.id
      && item.type === assetPreview.type
      && item.media_kind === 'image'
      && !currentIds.has(item.id)
      && (!getAssetParentSubjectId(item) || getAssetParentSubjectId(item) === assetPreview.id)
    ));
  }, [assetPreview, getAssetParentSubjectId, getAssetSubjectOtherViewIds, subjectPickerAssetsList]);

  const selectAllVisibleAssets = () => {
    setSelectedAssetIds(new Set(visibleAssets.map(a => a.id)));
  };

  const deselectAllVisibleAssets = () => {
    setSelectedAssetIds(new Set());
  };

  // --- Folder Handlers ---
  const openCreateFolderModal = () => {
    setFolderModalMode('create');
    setFolderModalTarget(null);
    setFolderNameInput('');
    setIsSavingFolder(false);
    setIsFolderModalOpen(true);
  };

  const handleRenameFolder = (folder: AssetFolder) => {
    setOpenFolderMenuId(null);
    setFolderModalMode('rename');
    setFolderModalTarget(folder);
    setFolderNameInput(folder.name);
    setIsSavingFolder(false);
    setIsFolderModalOpen(true);
  };

  const submitFolderModal = async () => {
    const name = folderNameInput.trim();
    if (!name) return;
    setIsSavingFolder(true);
    try {
      if (folderModalMode === 'create') {
        await assetsApi.createFolder(name, activeAssetTab, currentFolderId);
      } else if (folderModalMode === 'rename' && folderModalTarget) {
        await assetsApi.renameFolder(folderModalTarget.id, name);
      }
      await loadData();
      setIsFolderModalOpen(false);
    } catch (err) {
      console.error(err);
      openInfo((t as any).assets_save_folder_failed || 'Failed to save folder', String(err instanceof Error ? err.message : err));
    } finally {
      setIsSavingFolder(false);
    }
  };

  const handleDeleteFolder = async (folder: AssetFolder) => {
    try {
      await assetsApi.deleteFolder(folder.id);
      if (currentFolderId === folder.id) setCurrentFolderId(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || "Failed to delete folder");
      if (msg.toLowerCase().includes('not empty')) {
        openInfo(t.assets_folder_not_empty_hint || 'Folder not empty', t.assets_folder_not_empty_hint);
      } else {
        openInfo((t as any).assets_delete_failed || 'Failed to delete folder', msg);
      }
    } finally {
        setOpenFolderMenuId(null);
    }
  };

  // --- Move Handlers ---
  const computeExpandedForTarget = (folders: AssetFolder[], targetFolderId: string | null) => {
    if (!targetFolderId) return new Set<string>();
    const parentById = new Map<string, string | null>();
    for (const f of folders) parentById.set(f.id, f.parent_id ?? null);

    const expanded = new Set<string>();
    const visited = new Set<string>();

    let cur = parentById.get(targetFolderId) ?? null;
    while (cur) {
      if (visited.has(cur)) break;
      visited.add(cur);
      expanded.add(cur);
      cur = parentById.get(cur) ?? null;
    }
    return expanded;
  };

  const openMoveDialog = async (assets: Asset[], defaultTargetFolderId?: string | null) => {
    setMoveAssets(assets);
    setMoveFolder(null);
    setMoveTargetFolderId(defaultTargetFolderId ?? null);
    setIsMoveModalOpen(true);
    setIsMoveDropdownOpen(false);
    setMoveExpandedFolderIds(new Set());
    try {
      const folders = await assetsApi.getAllFolders(activeAssetTab);
      setMoveFolders(folders);
      setMoveExpandedFolderIds(computeExpandedForTarget(folders, defaultTargetFolderId ?? null));
    } catch (err) {
      console.error(err);
      openInfo((t as any).assets_load_folders_failed || 'Failed to load folders', String(err instanceof Error ? err.message : err));
    }
  };

  const openSingleMoveDialog = (asset: Asset) => {
    void openMoveDialog([asset], asset.folder_id ?? null);
  };

  const openFolderMoveDialog = async (folder: AssetFolder) => {
    setMoveAssets([]);
    setMoveFolder(folder);
    setMoveTargetFolderId(folder.parent_id ?? null);
    setIsMoveModalOpen(true);
    setIsMoveDropdownOpen(false);
    setMoveExpandedFolderIds(new Set());
    try {
      const folders = await assetsApi.getAllFolders(activeAssetTab);
      setMoveFolders(folders);
      setMoveExpandedFolderIds(computeExpandedForTarget(folders, folder.parent_id ?? null));
    } catch (err) {
      console.error(err);
      openInfo((t as any).assets_load_folders_failed || 'Failed to load folders', String(err instanceof Error ? err.message : err));
    }
  };

  const openBatchMoveDialog = () => {
    const selected = assetList.filter(a => selectedAssetIds.has(a.id));
    if (selected.length === 0) return;
    void openMoveDialog(selected, currentFolderId ?? null);
  };

  const beginDragAsset = (asset: Asset, e: React.DragEvent) => {
    setDraggingAsset(asset);
    setDragOverFolderId(null);
    setIsDragOverRoot(false);
    try {
      e.dataTransfer.setData('text/plain', asset.id);
      e.dataTransfer.effectAllowed = 'move';
    } catch {
      // ignore
    }
  };

  const endDragAsset = () => {
    setDraggingAsset(null);
    setDragOverFolderId(null);
    setIsDragOverRoot(false);
    setIsDragMoving(false);
  };

  const dragOverFolder = (folderId: string, e: React.DragEvent) => {
    if (!draggingAsset || isDragMoving) return;
    e.preventDefault();
    setIsDragOverRoot(false);
    setDragOverFolderId(folderId);
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      // ignore
    }
  };

  const dragOverRoot = (e: React.DragEvent) => {
    if (!draggingAsset || isDragMoving) return;
    e.preventDefault();
    setDragOverFolderId(null);
    setIsDragOverRoot(true);
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      // ignore
    }
  };

  const dropMoveTo = async (folderId: string | null, e: React.DragEvent) => {
    if (!draggingAsset || isDragMoving) return;
    e.preventDefault();

    const targetFolderId = folderId;
    if ((draggingAsset.folder_id ?? null) === targetFolderId) {
      endDragAsset();
      return;
    }

    setIsDragMoving(true);
    try {
      await assetsApi.moveAsset(draggingAsset.id, targetFolderId);
      await loadData();
    } catch (err) {
      console.error(err);
      openInfo((t as any).assets_move_failed || 'Failed to move asset', String(err instanceof Error ? err.message : err));
    } finally {
      endDragAsset();
    }
  };

  const handleConfirmMove = async () => {
    if (moveAssets.length === 0 && !moveFolder) return;
    setIsMovingAsset(true);
    try {
      if (moveFolder) {
        const from = moveFolder.parent_id ?? null;
        const to = moveTargetFolderId ?? null;
        if (from !== to) {
          await assetsApi.moveFolder(moveFolder.id, to);
          await loadData();
        }
        setIsMoveModalOpen(false);
        return;
      }

      const results = await Promise.allSettled(
        moveAssets.map(a => {
          const from = a.folder_id ?? null;
          const to = moveTargetFolderId ?? null;
          if (from === to) return Promise.resolve(null);
          return assetsApi.moveAsset(a.id, moveTargetFolderId);
        })
      );

      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) openInfo((t as any).assets_move_some_failed || 'Failed to move some assets', `Failed to move ${failed.length} assets`);
      await loadData();
      setIsMoveModalOpen(false);
      setSelectedAssetIds(new Set());
      if (isSelectionMode) setIsSelectionMode(false);
    } catch (err) {
      console.error(err);
      openInfo((t as any).assets_move_failed || 'Failed to move asset', String(err instanceof Error ? err.message : err));
    } finally {
      setIsMovingAsset(false);
    }
  };

  const buildFolderTree = (folders: AssetFolder[]) => {
    const byParent = new Map<string | null, AssetFolder[]>();
    for (const f of folders) {
      const key = f.parent_id ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(f);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return byParent;
  };

  // --- Confirm Modal Helpers ---
  const openConfirmModal = (opts: { title: string; message?: string; danger?: boolean; onConfirm: () => Promise<void> | void }) => {
    setConfirmTitle(opts.title);
    setConfirmMessage(opts.message || null);
    setConfirmIsDanger(Boolean(opts.danger));
    setConfirmIsWorking(false);
    confirmActionRef.current = opts.onConfirm;
    setIsConfirmModalOpen(true);
  };

  const runConfirmAction = async () => {
    if (!confirmActionRef.current) return;
    setConfirmIsWorking(true);
    try {
      await confirmActionRef.current();
      setIsConfirmModalOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmIsWorking(false);
    }
  };

  // Helper for display URL
  const getDisplayUrl = (path: string | null) => {
     if (!path) return null;
     if (path.startsWith('http')) return path;
     const mediaBaseUrl = import.meta.env.VITE_MEDIA_BASE_URL || '';
     return mediaBaseUrl ? `${mediaBaseUrl}${path}` : path;
  };

  const selectedCount = selectedAssetIds.size;
  const isAllVisibleSelected = visibleAssets.length > 0 && visibleAssets.every(a => selectedAssetIds.has(a.id));

  const moveSubjectLabel = moveFolder
    ? moveFolder.name
    : (moveAssets.length === 1 ? moveAssets[0]?.name : `${moveAssets.length} ${t.assets_items}`);

  const moveFoldersByParent = buildFolderTree(moveFolders);

  const invalidMoveTargetIds = (() => {
    if (!moveFolder) return new Set<string>();
    const invalid = new Set<string>([moveFolder.id]);
    const stack = [moveFolder.id];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const children = moveFoldersByParent.get(cur) || [];
      for (const child of children) {
        if (invalid.has(child.id)) continue;
        invalid.add(child.id);
        stack.push(child.id);
      }
    }
    return invalid;
  })();

  const toggleMoveExpanded = (folderId: string) => {
    setMoveExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // Returns the full path of the current move target folder, e.g. "FolderA / SubB"
  // const getMoveTargetDisplayPath = () => {
  //   if (!moveTargetFolderId) return t.assets_move_root;
  //   if (moveFolders.length === 0) return '...';
  //   const parentMap = new Map<string, string | null>();
  //   const nameMap = new Map<string, string>();
  //   for (const f of moveFolders) {
  //     parentMap.set(f.id, f.parent_id ?? null);
  //     nameMap.set(f.id, f.name);
  //   }
  //   const parts: string[] = [];
  //   let cur: string | null = moveTargetFolderId;
  //   const visited = new Set<string>();
  //   while (cur && !visited.has(cur)) {
  //     visited.add(cur);
  //     const name = nameMap.get(cur);
  //     if (name) parts.unshift(name);
  //     cur = parentMap.get(cur) ?? null;
  //   }
  //   return parts.length > 0 ? parts.join(' / ') : t.assets_move_root;
  // };

  return (
    <div
      className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300 relative"
      onClick={() => setOpenFolderMenuId(null)}
      onDragOver={handleUploadDragOver}
      onDragEnter={handleUploadDragOver}
      onDragLeave={handleUploadDragLeave}
      onDrop={handleUploadDrop}
    >
       {isDragUploadActive && (
         <div className="absolute inset-0 z-[120] rounded-3xl border-2 border-dashed border-orange-500/60 bg-orange-500/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
           <div className="text-sm font-bold text-orange-200">{t.assets_upload_drop_here}</div>
         </div>
       )}
       {draggingAsset && (
          <div className="fixed inset-0 z-[105] pointer-events-none bg-black/10">
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 glass-panel border border-white/10 rounded-2xl px-4 py-3 shadow-xl max-w-[calc(100vw-2rem)]">
              <div className="text-xs text-zinc-300 truncate">{draggingAsset.name}</div>
              <div className="mt-1 text-sm font-bold text-white flex items-center gap-2">
                {isDragMoving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span className="truncate">
                   {(() => {
                    const dragTitle = t.assets_drag_move_title;
                    if (isDragOverRoot) return `${dragTitle} ${t.assets_move_root}`;
                    if (dragOverFolderId) {
                      const found =
                        folderList.find(f => f.id === dragOverFolderId) ||
                        folderBreadcrumb.find(f => f.id === dragOverFolderId);
                      if (found?.name) return `${dragTitle} ${found.name}`;
                    }
                    return dragTitle;
                  })()}
                </span>
              </div>
            </div>
          </div>
        )}
        {/* Info Dialog (replacement for alert) */}
        {isInfoOpen && (
          <div className="fixed inset-0 z-[116] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => setIsInfoOpen(false)}>
            <div className="w-full max-w-md glass-panel rounded-2xl p-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-zinc-200">{infoTitle || (t as any).assets_info_title || 'Notice'}</h3><button className="text-zinc-400 hover:text-white" onClick={() => setIsInfoOpen(false)}><X className="w-5 h-5"/></button></div>
              {infoMessage && <div className="text-sm text-zinc-300 whitespace-pre-line">{infoMessage}</div>}
              {/* 取消按钮已移除 */}
            </div>
          </div>
        )}
       <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-50">
          <div>
            <h1 className="text-2xl font-bold tracking-tighter flex items-center gap-3 text-zinc-200">{viewMode === 'library' ? t.assets_title : (t.assets_plaza_title || '素材广场')}</h1>
            <p className="text-zinc-500 text-xs mt-1">{viewMode === 'library' ? t.assets_subtitle : (t.assets_plaza_subtitle || '全站可见，收藏后进入个人素材库')}</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode('library')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 ${viewMode === 'library' ? 'border-orange-500/60 bg-orange-500/15 text-orange-200' : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'}`}
              >
                <Library className="w-3.5 h-3.5" />
                {t.assets_title}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('plaza')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 ${viewMode === 'plaza' ? 'border-orange-500/60 bg-orange-500/15 text-orange-200' : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'}`}
              >
                <Globe className="w-3.5 h-3.5" />
                {t.assets_plaza_title || '素材广场'}
              </button>
            </div>
          </div>
          <div className="flex gap-3 items-center">
             {viewMode === 'library' && (
               <button
                 type="button"
                 ref={subjectGuideButtonRef}
                 onClick={() => openSubjectGuideModal(false)}
                 className={`flex items-center gap-1.5 px-2 py-1 rounded border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 transition ${isSubjectGuideSpotlightOpen ? 'relative z-[151]' : ''}`}
                 title={t.assets_subject_guide_button || '主体创建说明'}
               >
                 <Sparkles className="w-3.5 h-3.5" />
                 <span className="text-[10px] font-bold">{t.assets_subject_guide_button || '主体创建说明'}</span>
               </button>
             )}
             <LanguageSwitcher />
             {viewMode === 'library' ? (
               <>
                 <button onClick={openCreateFolderModal} className="bg-zinc-800 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-zinc-700 transition flex items-center gap-2"><FolderPlus className="w-4 h-4" /> {t.assets_btn_new_folder}</button>
                 <div className="relative group">
                   <button onClick={() => assetInputRef.current?.click()} className="bg-orange-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-orange-500 transition flex items-center gap-2 shadow-lg shadow-orange-500/20" disabled={isUploading}>
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {t.assets_btn_upload}
                   </button>
                   <div className="absolute right-0 top-12 z-50 w-max max-w-[360px] rounded-xl border border-white/10 bg-zinc-900/95 px-3 py-2 text-[10px] text-zinc-100 opacity-0 shadow-xl backdrop-blur transition group-hover:opacity-100 hover:opacity-100">
                     <div className="text-[11px] font-bold text-white mb-1">{t.assets_upload_formats_title}</div>
                     <div className="whitespace-pre-line text-zinc-300 leading-relaxed">{formatHint}</div>
                   </div>
                 </div>
                 <input type="file" ref={assetInputRef} className="hidden" multiple accept="image/*,video/*,audio/*" onChange={handleAssetUpload} />
               </>
             ) : (
               <>
                 <div className="text-[11px] px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-zinc-300">
                   {t.assets_plaza_free_hint || '每日前 3 次收集免费，超出后扣 V 点'}: {plazaCollectPolicy.free_remaining}
                 </div>
                 <>
                   <input
                     type="text"
                     value={plazaKeywordDraft}
                     onChange={(e) => setPlazaKeywordDraft(e.target.value)}
                     placeholder={t.assets_plaza_keywords_placeholder || '上传时附带关键词，逗号分隔'}
                     className="w-52 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-orange-500"
                   />
                   <button
                     type="button"
                     onClick={() => plazaUploadInputRef.current?.click()}
                     className="bg-orange-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-orange-500 transition flex items-center gap-2 shadow-lg shadow-orange-500/20"
                     disabled={plazaLoading}
                   >
                     {plazaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                     {t.assets_plaza_upload_btn || '上传到广场'}
                   </button>
                   <input
                     type="file"
                     ref={plazaUploadInputRef}
                     className="hidden"
                     multiple
                     accept={activeAssetTab === 'motion' ? 'video/*' : activeAssetTab === 'audio' ? 'audio/*' : 'image/*'}
                     onChange={(e) => void handleAdminUploadToPlaza(e.target.files)}
                   />
                 </>
               </>
             )}
          </div>
       </header>

       <div className="flex-1 flex flex-col px-10 pt-4 pb-10 overflow-hidden">
         {/* Tabs */}
         <div className="flex gap-4 mb-8 border-b border-white/5 pb-2">
             {(['model', 'product', 'scene', 'motion', 'audio'] as AssetType[]).map(type => (
                <button
                  key={type}
                  onClick={() => {
                    if (type === activeAssetTab) return;
                    setActiveAssetTab(type);
                    setCurrentFolderId(null);
                    setFolderBreadcrumb([]);
                  }}
                  className={`asset-type-tab text-sm font-bold px-6 py-2 rounded-full transition ${activeAssetTab === type ? 'asset-type-tab--active' : 'asset-type-tab--inactive'}`}
                >
                  {assetTabLabel[type] || type.toUpperCase()}
                </button>
             ))}
          </div>

             {viewMode === 'library' ? (
             <>
          
           {/* Breadcrumb */}
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2 text-xs text-zinc-500 min-w-0">
                <button
                  onClick={() => setCurrentFolderId(null)}
                  onDragOver={dragOverRoot}
                  onDragEnter={dragOverRoot}
                  onDragLeave={() => setIsDragOverRoot(false)}
                  onDrop={(e) => dropMoveTo(null, e)}
                  className={`hover:text-white ${currentFolderId === null ? 'text-white' : ''} ${draggingAsset && isDragOverRoot ? 'text-white' : ''}`}
                >
                  {t.assets_root}
                </button>
                {folderBreadcrumb.map(folder => (
                  <div key={folder.id} className="flex items-center gap-2 min-w-0">
                    <span>/</span>
                    <button
                      onClick={() => setCurrentFolderId(folder.id)}
                      onDragOver={(e) => dragOverFolder(folder.id, e)}
                      onDragEnter={(e) => dragOverFolder(folder.id, e)}
                      onDragLeave={() => { if (dragOverFolderId === folder.id) setDragOverFolderId(null); }}
                      onDrop={(e) => dropMoveTo(folder.id, e)}
                      className={`hover:text-white truncate ${currentFolderId === folder.id ? 'text-white' : ''} ${draggingAsset && dragOverFolderId === folder.id ? 'text-white underline decoration-orange-500/80' : ''}`}
                    >
                      {folder.name}
                    </button>
                  </div>
                ))}
              </div>

              {!isSelectionMode && (
                <div className="flex items-center gap-2 shrink-0">
                  {(activeAssetTab === 'product' || activeAssetTab === 'model') && (
                    <button
                      type="button"
                      onClick={() => setHideReferencedOtherViews((prev) => !prev)}
                      title={hideReferencedOtherViews ? t.assets_show_referenced_other_views_tooltip : t.assets_hide_referenced_other_views_tooltip}
                      className={`w-9 h-9 rounded-lg border transition flex items-center justify-center ${hideReferencedOtherViews ? 'border-orange-500/60 bg-orange-500/15 text-orange-200' : 'border-white/10 bg-zinc-800 text-zinc-200 hover:bg-zinc-700'}`}
                    >
                      {hideReferencedOtherViews ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                  <button
                    onClick={() => setIsSelectionMode(true)}
                    className="bg-zinc-800 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-zinc-700 transition flex items-center gap-2 shrink-0"
                  >
                    <CheckCircle className="w-4 h-4" /> {t.assets_select}
                  </button>
                </div>
              )}
            </div>

            {/* Selection Toolbar */}
            {isSelectionMode && (
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] text-zinc-500">
                  <span>
                    {selectedCount} {t.assets_selected}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={isAllVisibleSelected ? deselectAllVisibleAssets : selectAllVisibleAssets}
                    disabled={visibleAssets.length === 0}
                    className="bg-zinc-900 text-zinc-200 px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-zinc-800 transition disabled:opacity-50"
                  >
                    {isAllVisibleSelected ? t.assets_deselect_all : t.assets_select_all}
                  </button>
                  <button
                    onClick={openBatchMoveDialog}
                    disabled={selectedCount === 0}
                    className="bg-orange-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-orange-500 transition disabled:opacity-50"
                  >
                    {t.assets_move_asset}
                  </button>
                  <button
                    onClick={() => {
                      if (selectedCount === 0) return;
                      openConfirmModal({
                        title: t.assets_confirm_delete_asset,
                        message: `${selectedCount} ${t.assets_items}\n\n${t.assets_confirm_body_irreversible}`,
                        danger: true,
                        onConfirm: async () => {
                          const ids = Array.from(selectedAssetIds);
                          const results = await Promise.allSettled(ids.map(id => deleteAssetById(id)));
                          const failed = results.filter(r => r.status === 'rejected');
                          if (failed.length > 0) openInfo((t as any).assets_delete_failed || 'Failed to delete some assets', `Failed to delete ${failed.length} assets`);
                          setSelectedAssetIds(new Set());
                          setIsSelectionMode(false);
                        }
                      });
                    }}
                    disabled={selectedCount === 0}
                    className="bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-red-500 transition disabled:opacity-50"
                  >
                    {t.assets_delete}
                  </button>
                  <button
                    onClick={exitSelectionMode}
                    className="bg-zinc-800 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-zinc-700 transition"
                  >
                    {t.assets_done}
                  </button>
                </div>
              </div>
            )}

           <div className="flex-1 overflow-y-auto custom-scroll">
             {isLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div> : (
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-6">
                   {/* Folders */}
                   {folderList.map(folder => (
                      <div
                        key={folder.id}
                        onClick={() => setCurrentFolderId(folder.id)}
                        onDragOver={(e) => dragOverFolder(folder.id, e)}
                        onDragEnter={(e) => dragOverFolder(folder.id, e)}
                        onDragLeave={() => { if (dragOverFolderId === folder.id) setDragOverFolderId(null); }}
                        onDrop={(e) => dropMoveTo(folder.id, e)}
                        className={`glass-card rounded-2xl aspect-[3/4] border p-3 flex flex-col cursor-pointer transition group relative overflow-hidden ${
                          draggingAsset ? 'border-zinc-700/80' : 'border-zinc-800 hover:border-orange-500/50 hover:bg-zinc-900/50'
                        } ${
                          draggingAsset && dragOverFolderId === folder.id ? 'ring-2 ring-orange-500/70 scale-[1.02] bg-zinc-900/50' : ''
                        }`}
                      >
                         <button onClick={(e) => { e.stopPropagation(); setOpenFolderMenuId(prev => (prev === folder.id ? null : folder.id)); }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-zinc-300 hover:text-white z-20">...</button>
                         {openFolderMenuId === folder.id && (
                             <div onClick={(e) => e.stopPropagation()} className="absolute top-10 right-2 bg-zinc-900/90 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden text-xs z-50 min-w-[140px]">
                                 <button className="w-full text-left px-3 py-2 hover:bg-white/5 text-zinc-200" onClick={() => handleRenameFolder(folder)}>{t.assets_folder_menu_rename}</button>
                                 <button className="w-full text-left px-3 py-2 hover:bg-white/5 text-zinc-200" onClick={() => { setOpenFolderMenuId(null); void openFolderMoveDialog(folder); }}>{t.assets_move_asset}</button>
                                 <button className="w-full text-left px-3 py-2 hover:bg-white/5 text-red-300" onClick={() => { setOpenFolderMenuId(null); openConfirmModal({ title: t.assets_confirm_delete_folder, message: `${folder.name}\n\n${t.assets_confirm_body_irreversible}`, danger: true, onConfirm: () => handleDeleteFolder(folder) }); }}>{t.assets_folder_menu_delete}</button>
                             </div>
                         )}
                         {(() => {
                           const summary = folderSummaryById.get(folder.id) || { assetCount: 0, subfolderCount: 0, previewAssets: [], previewFolderNames: [] };
                           const visualPreviewAssets = summary.previewAssets
                             .filter((asset) => asset.media_kind === 'image' || asset.media_kind === 'video')
                             .slice(0, 3);
                           return (
                             <>
                               <div className="flex-1 rounded-[18px] border border-white/5 bg-black/20 p-3 flex flex-col justify-between overflow-hidden">
                               <div className="flex items-start justify-between gap-2">
                                   <div className="w-11 h-11 rounded-2xl bg-zinc-800 flex items-center justify-center group-hover:scale-105 transition">
                                     <Folder className="w-5 h-5 text-zinc-400 group-hover:text-orange-500" />
                                   </div>
                                 </div>
                                 {visualPreviewAssets.length > 0 ? (
                                   <div className="grid grid-cols-3 gap-2">
                                     {visualPreviewAssets.map((asset) => (
                                       <div key={asset.id} className="aspect-square rounded-xl overflow-hidden bg-zinc-900/80 border border-white/5">
                                         {asset.media_kind === 'video' ? (
                                           <video
                                             src={asset.file_url}
                                             className="w-full h-full object-cover"
                                             muted
                                             playsInline
                                             preload="metadata"
                                           />
                                         ) : (
                                           <img src={asset.thumbnail || asset.file_url} alt={asset.name} className="w-full h-full object-cover" />
                                         )}
                                       </div>
                                     ))}
                                   </div>
                                 ) : summary.previewFolderNames.length > 0 ? (
                                   <div className="flex flex-wrap gap-2">
                                     {summary.previewFolderNames.slice(0, 3).map((name) => (
                                       <span key={name} className="max-w-full truncate rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-zinc-400 border border-white/5">
                                         {name}
                                       </span>
                                     ))}
                                   </div>
                                 ) : (
                                   <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.03] py-4 text-[11px] text-zinc-500">
                                     {(t as any).assets_folder_summary_empty || '空文件夹'}
                                   </div>
                                 )}
                               </div>
                               <div className="pt-3">
                                 <div className="text-base font-bold text-zinc-200 truncate">{folder.name}</div>
                                 <div className="mt-1 text-[11px] text-zinc-500 truncate">
                                   {summary.assetCount} {(t as any).assets_folder_summary_assets || '素材'} · {summary.subfolderCount} {(t as any).assets_folder_summary_subfolders || '子文件夹'}
                                 </div>
                               </div>
                             </>
                           );
                         })()}
                      </div>
                    ))}
                    
                    {/* Assets */}
                    {visibleAssets.map(asset => {
                      const isSelected = selectedAssetIds.has(asset.id);
                      const subjectOtherViewCount = getAssetSubjectOtherViewIds(asset).length;
                      return (
                        <div
                          key={asset.id}
                          className={`glass-card rounded-2xl p-2 group relative aspect-[3/4] ${draggingAsset?.id === asset.id ? 'opacity-60' : ''} ${isSelectionMode && isSelected ? 'ring-2 ring-orange-500/70' : ''}`}
                          draggable={!isSelectionMode && renamingAssetId !== asset.id}
                          onDragStart={isSelectionMode ? undefined : (e) => {
                            if (renamingAssetId || Date.now() < suppressDragUntilRef.current) {
                              e.preventDefault();
                              return;
                            }
                            beginDragAsset(asset, e);
                          }}
                          onDragEnd={isSelectionMode ? undefined : endDragAsset}
                        >
                          {isSelectionMode && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleAssetSelection(asset.id); }}
                              className="absolute top-3 left-3 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition"
                              aria-label="Select asset"
                            >
                              {isSelected ? <CheckCircle className="w-5 h-5 text-orange-400" /> : <Circle className="w-5 h-5 text-white/70" />}
                            </button>
                          )}
                          <div
                            className={`w-full h-full bg-zinc-800 rounded-xl overflow-hidden relative ${isSelectionMode ? 'cursor-pointer' : 'cursor-zoom-in'}`}
                            onClick={() => {
                              if (Date.now() < suppressPreviewClickUntilRef.current) {
                                suppressPreviewClickUntilRef.current = 0;
                                return;
                              }
                              if (renamingAssetId === asset.id) return;
                              if (isSelectionMode) {
                                toggleAssetSelection(asset.id);
                                return;
                              }
                              setAssetPreview(asset);
                              setAssetDescriptionDraft(getAssetSubjectDescription(asset));
                              setIsAssetDescriptionSaved(true);
                              setAssetDescriptionSavedAt(String(asset.created_at || '').slice(0, 10));
                              setIsAssetPreviewOpen(true);
                            }}
                          >
                            {subjectOtherViewCount > 0 && (
                              <div className="absolute top-2 right-2 z-20 rounded-full bg-black/55 border border-white/15 p-1.5 text-white shadow-lg">
                                <Layers3 className="w-3.5 h-3.5" />
                              </div>
                            )}
                            {asset.media_kind === 'audio' ? (
                              renderAudioArtwork(asset.name, true, isLightTheme)
                            ) : asset.file_url && asset.media_kind === 'video' ? (
                              <video
                                src={getDisplayUrl(asset.file_url) || undefined}
                                className="absolute inset-0 w-full h-full object-cover"
                                muted
                                playsInline
                                preload="metadata"
                              />
                            ) : asset.file_url ? (
                              <img
                                src={getDisplayUrl(asset.thumbnail || asset.file_url) || ASSET_PLACEHOLDER_DATA_URL}
                                className="absolute inset-0 w-full h-full object-cover"
                                alt={asset.name}
                                onError={(e) => { (e.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL; }}
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-zinc-600">No Preview</div>
                            )}
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 asset-thumb-fade" />

                            {/* Info bar (always on top) */}
                            <div className="absolute bottom-1 left-2.5 right-2.5 z-30 pointer-events-auto">
                              <div className="flex items-center gap-1.5">
                                {renamingAssetId === asset.id ? (
                                  <input
                                    ref={renameInputRef}
                                    value={renameDraft}
                                    disabled={isSavingRename}
                                    className="min-w-0 flex-1 bg-black/40 text-zinc-100 text-xs font-bold rounded-md border border-white/10 px-2 py-1 focus:outline-none focus:border-orange-500/50"
                                    onChange={(e) => setRenameDraft(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      suppressDragUntilRef.current = Date.now() + 500;
                                    }}
                                    onDragStart={(e) => e.preventDefault()}
                                    onBlur={() => {
                                      if (renameIgnoreBlurRef.current) return;
                                      // Prevent the click that caused blur from also opening preview.
                                      suppressPreviewClickUntilRef.current = Date.now() + 350;
                                      void commitRenameAsset(asset);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        void commitRenameAsset(asset);
                                      }
                                      if (e.key === 'Escape') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        cancelRenameAsset();
                                      }
                                    }}
                                  />
                                ) : (
                                  <div
                                    className="min-w-0 flex items-center gap-1 cursor-text"
                                    title={asset.name}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      suppressDragUntilRef.current = Date.now() + 500;
                                    }}
                                    onClick={(e) => { e.stopPropagation(); beginRenameAsset(asset); }}
                                  >
                                    <span className="min-w-0 truncate text-xs font-bold asset-meta-name hover:underline decoration-white/30">
                                      {asset.name}
                                    </span>
                                    {renamingAssetId !== asset.id && !isSelectionMode && (
                                      <button
                                        type="button"
                                        aria-label={t.assets_folder_menu_rename}
                                        title={t.assets_folder_menu_rename}
                                        className="shrink-0 rounded-md p-1 text-zinc-200/80 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition"
                                        onClick={(e) => { e.stopPropagation(); beginRenameAsset(asset); }}
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="text-[11px] asset-meta-size">
                                {asset.size}
                              </div>
                            </div>

                            {/* Hover actions (under info bar) */}
                            {!isSelectionMode && (
                              <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition rounded-xl flex flex-col items-center justify-center gap-2 py-4 px-2">
                                <button onClick={(e) => { e.stopPropagation(); onSelectAsset(asset); }} className="w-full bg-white text-black py-2 rounded-lg text-xs font-bold hover:bg-orange-500 hover:text-white transition shadow-lg">{t.assets_use_in_workbench}</button>
                                <div className="flex w-full gap-2">
                                  <button onClick={(e) => { e.stopPropagation(); openSingleMoveDialog(asset); }} className="flex-1 bg-zinc-700 text-white py-2 rounded-lg text-xs font-bold hover:bg-zinc-600 transition">{t.assets_move_asset}</button>
                                  <button onClick={(e) => { e.stopPropagation(); openConfirmModal({ title: t.assets_confirm_delete_asset, message: `${asset.name}\n\n${t.assets_confirm_body_irreversible}`, danger: true, onConfirm: () => deleteAssetById(asset.id) }); }} className="flex-1 bg-zinc-800 text-red-400 py-2 rounded-lg text-xs font-bold hover:bg-red-500 hover:text-white transition">{t.assets_delete}</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                 </div>
              )}
           </div>
          </>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-3">
                <div className="relative w-full max-w-md">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={plazaSearch}
                    onChange={(e) => setPlazaSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void loadPlazaData();
                      }
                    }}
                    placeholder={t.assets_plaza_search_placeholder || '检索名称/关键词/作者'}
                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {(['all', 'official', 'user'] as const).map((source) => (
                    <button
                      key={source}
                      type="button"
                      onClick={() => setPlazaSource(source)}
                      className={`px-3 py-2 rounded-lg border text-xs font-bold transition ${plazaSource === source ? 'border-orange-500/60 bg-orange-500/15 text-orange-200' : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10'}`}
                    >
                      {source === 'all'
                        ? (t.assets_plaza_source_all || '全部')
                        : source === 'official'
                          ? (t.assets_plaza_source_official || '官方')
                          : (t.assets_plaza_source_user || '用户')}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void loadPlazaData()}
                  className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-zinc-200 hover:bg-white/10"
                >
                  {t.hist_retry || '重试'}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scroll">
                {plazaLoading ? (
                  <div className="h-56 flex items-center justify-center text-zinc-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t.wb_debug_loading || 'Loading...'}
                  </div>
                ) : plazaItems.length === 0 ? (
                  <div className="h-56 flex items-center justify-center text-zinc-500 text-sm">
                    {t.wb_empty_assets || '暂无素材'}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-6">
                    {plazaItems.map((item) => {
                      const isVideo = item.category === 'motion' || /\.(mp4|mov|mkv|webm|avi)(\?|$)/i.test(item.file_url || '');
                      const keywords = (item.keywords || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 2);
                      return (
                        <div key={item.id} className="glass-card rounded-2xl p-2 group relative aspect-[3/4]">
                          <div className="w-full h-full bg-zinc-800 rounded-xl overflow-hidden relative">
                            {isVideo ? (
                              <video src={item.file_url} className="absolute inset-0 w-full h-full object-cover" muted playsInline preload="metadata" />
                            ) : (
                              <img
                                src={item.file_url || ASSET_PLACEHOLDER_DATA_URL}
                                className="absolute inset-0 w-full h-full object-cover"
                                alt={item.display_name}
                                onError={(e) => { (e.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL; }}
                              />
                            )}

                            <div className="absolute top-2 right-2 flex items-center gap-1 z-20">
                              <span className="px-1.5 py-0.5 rounded bg-black/50 border border-white/15 text-[10px] text-zinc-100 flex items-center gap-1">
                                <Heart className="w-3 h-3" />{item.like_count}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-black/50 border border-white/15 text-[10px] text-zinc-100 flex items-center gap-1">
                                <Download className="w-3 h-3" />{item.collect_count}
                              </span>
                            </div>

                            <div className="absolute bottom-2 left-2 right-2 z-20 pointer-events-none">
                              <div className="text-xs font-bold text-white truncate">{item.display_name}</div>
                              {keywords.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {keywords.map((kw) => (
                                    <span key={kw} className="px-1.5 py-0.5 rounded bg-black/35 border border-white/10 text-[9px] text-zinc-100">{kw}</span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="absolute inset-0 z-10 bg-black/55 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition rounded-xl flex flex-col items-center justify-center gap-2 py-4 px-2">
                              <button
                                type="button"
                                onClick={() => void handleCollectPlazaItem(item)}
                                className="w-full bg-white text-black py-2 rounded-lg text-xs font-bold hover:bg-orange-500 hover:text-white transition shadow-lg"
                              >
                                {t.assets_plaza_collect_btn || '收集到我的素材库'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handlePlazaReaction(item, 'like')}
                                className={`w-full py-2 rounded-lg text-xs font-bold transition shadow-lg ${item.is_liked ? 'bg-red-500/90 text-white hover:bg-red-500' : 'bg-zinc-700 text-white hover:bg-zinc-600'}`}
                              >
                                {item.is_liked ? (t.assets_plaza_liked_btn || '已喜欢') : (t.assets_plaza_like_btn || '喜欢')}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleOpenPlazaDetail(item)}
                                className="w-full bg-zinc-800 text-zinc-100 py-2 rounded-lg text-xs font-bold hover:bg-zinc-700 transition shadow-lg flex items-center justify-center gap-1.5"
                              >
                                <Info className="w-3.5 h-3.5" />
                                {t.assets_plaza_detail_btn || '详细信息'}
                              </button>
                              {item.can_manage && (
                                <button
                                  type="button"
                                  onClick={() => openPlazaManage(item)}
                                  className="w-full bg-zinc-900 text-zinc-100 py-2 rounded-lg text-xs font-bold hover:bg-zinc-700 transition shadow-lg flex items-center justify-center gap-1.5 border border-white/10"
                                >
                                  <Settings className="w-3.5 h-3.5" />
                                  {t.assets_plaza_manage_btn || '管理'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
       </div>

       {/* --- MODALS --- */}

       {isSubjectGuideModalOpen && (
         <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
           <div className={`w-full max-w-4xl rounded-3xl border shadow-2xl ${isLightTheme ? 'border-slate-300 bg-white shadow-black/15' : isDimTheme ? 'border-slate-500/40 bg-slate-900 shadow-black/30' : 'border-white/10 bg-[#120C09] shadow-black/40'}`}>
             <div className={`border-b px-6 py-5 ${isLightTheme ? 'border-slate-200' : isDimTheme ? 'border-slate-500/40' : 'border-white/10'}`}>
               <div className={`text-lg font-bold ${isLightTheme ? 'text-slate-900' : isDimTheme ? 'text-slate-100' : 'text-zinc-100'}`}>{t.assets_subject_guide_modal_title || '主体创建说明'}</div>
              <div className={`mt-1 text-sm ${isLightTheme ? 'text-slate-600' : isDimTheme ? 'text-slate-300' : 'text-zinc-400'}`}>
                <div>{t.assets_subject_guide_intro || '首次使用主体模式前，先了解主体素材应如何创建与管理。'}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-orange-500" />
                  <span>{t.assets_subject_guide_scene_note || '作为“场景”上传的素材暂不支持创建为主体。'}</span>
                </div>
              </div>
              <div className="hidden">
                <div>{t.assets_subject_guide_intro || '首次使用主体模式前，先了解主体素材应如何创建与管理。'}</div>
                <div>{t.assets_subject_guide_scene_note || '作为“场景”标签上传的素材暂不支持创建为主体。'}</div>
              </div>
             </div>
             <div className="custom-scroll max-h-[70vh] overflow-y-auto px-6 py-5 pr-4">
                <div className="space-y-5">
                  {subjectGuideContent.map((item, index) => (
                    <div key={`${item.title}-${index}`} className={`rounded-2xl border p-4 ${isLightTheme ? 'border-slate-200 bg-slate-50' : isDimTheme ? 'border-slate-500/35 bg-slate-800/70' : 'border-white/10 bg-white/5'}`}>
                     {item.illustration}
                     <div className={`mt-4 text-base font-bold ${isLightTheme ? 'text-slate-900' : isDimTheme ? 'text-slate-100' : 'text-zinc-100'}`}>{`${t.wb_guide_step || '步骤'} ${index + 1} · ${item.title}`}</div>
                     <div className={`mt-2 text-sm leading-6 ${isLightTheme ? 'text-slate-700' : isDimTheme ? 'text-slate-300' : 'text-zinc-300'}`}>{item.description}</div>
                   </div>
                 ))}
               </div>
             </div>
             <div className={`flex justify-end border-t px-6 py-4 ${isLightTheme ? 'border-slate-200' : isDimTheme ? 'border-slate-500/40' : 'border-white/10'}`}>
              <button
                 type="button"
                 className="subject-guide-confirm-btn rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600"
                 onClick={() => {
                   setIsSubjectGuideModalOpen(false);
                   if (!shouldRunSubjectGuideSpotlight) return;
                   setShouldRunSubjectGuideSpotlight(false);
                   requestAnimationFrame(() => {
                     updateSubjectGuideSpotlightPosition();
                     setIsSubjectGuideSpotlightOpen(true);
                   });
                 }}
               >
                 {t.assets_subject_guide_confirm || '我知道了'}
               </button>
             </div>
           </div>
         </div>
       )}

       {isSubjectGuideSpotlightOpen && (
         <div className="fixed inset-0 z-[150]">
           <div
             className="absolute rounded-2xl border-2 border-orange-400/90 bg-transparent pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.78),0_0_32px_rgba(249,115,22,0.35)]"
             style={subjectGuideHighlightStyle}
           />
           <div
             className="absolute rounded-2xl border border-orange-500/40 bg-zinc-950/95 px-4 py-4 shadow-2xl shadow-black/40"
             style={subjectGuideTooltipStyle}
           >
             <div className="absolute -top-2 left-10 h-4 w-4 rotate-45 border-l border-t border-orange-500/40 bg-zinc-950/95" />
             <div className="text-sm font-bold text-white">{t.assets_subject_guide_spotlight_title || '主体创建说明在这里'}</div>
             <div className="mt-2 text-xs leading-5 text-zinc-300">{t.assets_subject_guide_spotlight_desc || '以后如果你想再看主体创建方法，随时都可以从这里重新打开。'}</div>
             <div className="mt-4 flex justify-end">
               <button
                 type="button"
                 className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-orange-600"
                 onClick={closeSubjectGuideSpotlight}
               >
                 {t.assets_subject_guide_confirm || '知道了'}
               </button>
             </div>
           </div>
         </div>
       )}

       {/* 1. Preview Modal */}
       {isAssetPreviewOpen && assetPreview && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => setIsAssetPreviewOpen(false)}>
            <div className="glass-panel rounded-2xl p-4 md:p-6 border border-white/10 w-full max-w-4xl max-h-[calc(100vh-3rem)] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-4 mb-4"><div className="min-w-0"><div className="text-xs text-zinc-500 truncate">{assetPreview.name}</div></div><button className="text-zinc-400 hover:text-white" onClick={() => setIsAssetPreviewOpen(false)}><X className="w-5 h-5"/></button></div>
              {(assetPreview.type === 'product' || assetPreview.type === 'model') ? (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)] gap-5">
                <div className="flex items-center justify-center">
                   {assetPreview.media_kind === 'audio' ? (
                     <div className="w-full max-w-xl space-y-4">
                       <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                         {renderAudioArtwork(assetPreview.name, false, isLightTheme)}
                       </div>
                       <audio
                         src={getDisplayUrl(assetPreview.file_url) || undefined}
                         className="w-full"
                         controls
                         autoPlay
                         preload="metadata"
                       />
                     </div>
                   ) : assetPreview.media_kind === 'video' ? (
                     <video
                       src={getDisplayUrl(assetPreview.file_url) || undefined}
                       className="block rounded-lg max-w-full max-h-[calc(100vh-10rem)] object-contain"
                       controls
                       autoPlay
                       loop
                       playsInline
                     />
                   ) : (
                     <img
                       src={getDisplayUrl(assetPreview.file_url) || ASSET_PLACEHOLDER_DATA_URL}
                       alt={assetPreview.name}
                       className="block rounded-lg max-w-full max-h-[calc(100vh-10rem)] object-contain"
                       onError={(e) => { (e.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL; }}
                     />
                   )}
                </div>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-zinc-500 mb-1">{t.assets_subject_name}</div>
                    <div className="text-base font-bold text-zinc-100 break-words">{assetPreview.name}</div>
                    <div className="mt-2 text-[11px] text-zinc-400">
                      {t.assets_subject_status}: {(() => {
                        const status = getAssetSubjectStatus(assetPreview);
                        if (status === 'succeed') return t.assets_subject_status_succeed;
                        if (status === 'processing') return t.assets_subject_status_processing;
                        if (status === 'failed') return t.assets_subject_status_failed;
                        if (status === 'deleted') return t.assets_subject_status_deleted;
                        return t.assets_subject_status_not_created;
                      })()}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="text-xs text-zinc-500">{t.assets_subject_description}</div>
                      {assetPreview.media_kind === 'image' && (
                        <button
                          type="button"
                          disabled={isGeneratingAssetDescription}
                          onClick={() => void generateAssetDescription()}
                          className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-1 text-[11px] font-bold text-orange-200 disabled:opacity-60"
                        >
                          {isGeneratingAssetDescription ? t.wb_generating : t.assets_ai_generate_description}
                        </button>
                      )}
                    </div>
                    <textarea
                      value={assetDescriptionDraft}
                      onChange={(e) => {
                        setAssetDescriptionDraft(e.target.value);
                        setIsAssetDescriptionSaved(false);
                      }}
                      rows={6}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500/50"
                      placeholder={t.assets_description_placeholder}
                    />
                    <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-zinc-500">
                      <span>{assetDescriptionSavedAt ? `${t.assets_updated_at} ${assetDescriptionSavedAt}` : ''}</span>
                      <button
                        type="button"
                        disabled={isSavingAssetDescription}
                        onClick={() => void saveAssetDescription()}
                        className={`rounded-lg px-3 py-1.5 text-[11px] font-bold disabled:opacity-60 ${
                          isAssetDescriptionSaved
                            ? 'bg-zinc-200 text-zinc-600'
                            : 'bg-white text-black'
                        }`}
                      >
                        {isSavingAssetDescription
                          ? t.assets_saving_description
                          : (isAssetDescriptionSaved
                              ? (t.assets_saved_description || '已保存')
                              : t.assets_save_description)}
                      </button>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-zinc-500">{t.assets_other_views}</div>
                        <div className="mt-1 text-[11px] text-zinc-400">{t.assets_other_views_hint}</div>
                      </div>
                      <button
                        type="button"
                        disabled={isSavingSubjectGroup}
                        onClick={() => {
                          setIsSubjectGroupEditing((prev) => !prev);
                          setSubjectSlotActionIndex(null);
                        }}
                        className={`rounded-lg px-3 py-1.5 text-[11px] font-bold disabled:opacity-60 ${
                          isSubjectGroupEditing
                            ? 'border border-orange-400 bg-orange-500 text-white shadow-sm shadow-orange-500/30 hover:bg-orange-400'
                            : 'border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10'
                        }`}
                      >
                        {isSubjectGroupEditing ? t.assets_done : t.assets_edit}
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[0, 1, 2].map((slotIndex) => {
                        const slotAsset = subjectOtherViewAssets[slotIndex] || null;
                        const canOpenAction = !slotAsset && slotIndex === subjectOtherViewAssets.length && subjectOtherViewAssets.length < 3;
                        return (
                          <div
                            key={slotIndex}
                            ref={canOpenAction ? subjectSlotActionRef : null}
                            className="relative aspect-square rounded-2xl border border-white/10 bg-black/20 overflow-hidden"
                          >
                            {slotAsset ? (
                              <>
                                <button
                                  type="button"
                                  className="absolute inset-0"
                                  onClick={() => setSubjectPreviewImage(slotAsset)}
                                >
                                  <img
                                    src={getDisplayUrl(slotAsset.file_url) || ASSET_PLACEHOLDER_DATA_URL}
                                    alt={slotAsset.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { (e.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL; }}
                                  />
                                </button>
                                {isSubjectGroupEditing && (
                                  <button
                                    type="button"
                                    disabled={isSavingSubjectGroup}
                                    onClick={() => void removeSubjectOtherView(slotAsset.id)}
                                    className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg disabled:opacity-60"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            ) : canOpenAction ? (
                              <>
                                <button
                                  type="button"
                                  className="absolute inset-0 flex items-center justify-center bg-white/[0.03] hover:bg-white/[0.06] transition"
                                  onClick={() => setSubjectSlotActionIndex((prev) => prev === slotIndex ? null : slotIndex)}
                                >
                                  <div className="flex items-center justify-center w-16 h-16 rounded-full border border-white/10 bg-white/5 text-zinc-200">
                                    <Plus className="w-8 h-8" />
                                  </div>
                                </button>
                                {subjectSlotActionIndex === slotIndex && (
                                  <div className="absolute inset-x-2 bottom-2 z-10 rounded-xl border border-white/10 bg-zinc-950/95 p-2 shadow-2xl">
                                    <button
                                      type="button"
                                      className="flex w-full h-8 items-center justify-center rounded-lg bg-white px-2.5 text-[11px] font-bold leading-none whitespace-nowrap text-black hover:bg-orange-500 hover:text-white transition"
                                      onClick={() => openSubjectPicker(slotIndex)}
                                    >
                                      {t.assets_from_library}
                                    </button>
                                    <button
                                      type="button"
                                      className="mt-1.5 flex w-full h-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2.5 text-[11px] font-bold leading-none whitespace-nowrap text-zinc-100 hover:bg-white/10 transition"
                                      onClick={() => subjectOtherViewUploadRef.current?.click()}
                                    >
                                      {t.assets_btn_upload}
                                    </button>
                                  </div>
                                )}
                              </>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
              ) : (
                <div className="flex items-center justify-center">
                  {assetPreview.media_kind === 'audio' ? (
                    <div className="w-full max-w-xl space-y-4">
                      <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                        {renderAudioArtwork(assetPreview.name, false, isLightTheme)}
                      </div>
                      <audio
                        src={getDisplayUrl(assetPreview.file_url) || undefined}
                        className="w-full"
                        controls
                        autoPlay
                        preload="metadata"
                      />
                    </div>
                  ) : assetPreview.media_kind === 'video' ? (
                    <video
                      src={getDisplayUrl(assetPreview.file_url) || undefined}
                      className="block rounded-lg max-w-full max-h-[calc(100vh-10rem)] object-contain"
                      controls
                      autoPlay
                      loop
                      playsInline
                    />
                  ) : (
                    <img
                      src={getDisplayUrl(assetPreview.file_url) || ASSET_PLACEHOLDER_DATA_URL}
                      alt={assetPreview.name}
                      className="block rounded-lg max-w-full max-h-[calc(100vh-10rem)] object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL; }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {subjectPreviewImage && (
          <div className="fixed inset-0 z-[111] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6" onClick={() => setSubjectPreviewImage(null)}>
            <div className="glass-panel rounded-2xl p-4 md:p-6 border border-white/10 w-full max-w-4xl max-h-[calc(100vh-3rem)] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-zinc-200">{t.assets_preview_title}</h3>
                  <div className="text-xs text-zinc-500 truncate">{subjectPreviewImage.name}</div>
                </div>
                <button className="text-zinc-400 hover:text-white" onClick={() => setSubjectPreviewImage(null)}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex items-center justify-center">
                <img
                  src={getDisplayUrl(subjectPreviewImage.file_url) || ASSET_PLACEHOLDER_DATA_URL}
                  alt={subjectPreviewImage.name}
                  className="block rounded-lg max-w-full max-h-[calc(100vh-10rem)] object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL; }}
                />
              </div>
            </div>
          </div>
        )}

        {isSubjectPickerOpen && assetPreview && (
          <div className="fixed inset-0 z-[112] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={closeSubjectPicker}>
            <div className="w-full max-w-5xl max-h-[calc(100vh-3rem)] overflow-hidden glass-panel rounded-2xl border border-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/10">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-zinc-100">{t.wb_dialog_choose_from_library || '选择素材'}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500 min-w-0">
                    <button type="button" onClick={() => setSubjectPickerFolderId(null)} className="hover:text-white">
                      {t.assets_root}
                    </button>
                    {subjectPickerBreadcrumb.map((folder) => (
                      <React.Fragment key={folder.id}>
                        <span>/</span>
                        <button type="button" onClick={() => setSubjectPickerFolderId(folder.id)} className="truncate hover:text-white">
                          {folder.name}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <button className="text-zinc-400 hover:text-white" onClick={closeSubjectPicker}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5">
                {isSubjectPickerLoading ? (
                  <div className="h-48 flex items-center justify-center text-zinc-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : (
                  <div className="max-h-[calc(100vh-12rem)] overflow-y-auto custom-scroll">
                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4">
                      {subjectLibraryFolders.map((folder) => (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() => setSubjectPickerFolderId(folder.id)}
                          className="aspect-[3/4] rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition flex flex-col items-center justify-center gap-3 text-zinc-200"
                        >
                          <Folder className="w-8 h-8 text-zinc-400" />
                          <span className="px-3 text-xs font-bold truncate max-w-full">{folder.name}</span>
                        </button>
                      ))}
                      {subjectPickerAssets.map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => void appendSubjectOtherView(asset)}
                          className="group text-left rounded-2xl overflow-hidden border border-white/10 bg-white/5 hover:border-orange-500/50 transition"
                        >
                          <div className="aspect-[3/4] relative bg-zinc-900">
                            <img
                              src={getDisplayUrl(asset.file_url) || ASSET_PLACEHOLDER_DATA_URL}
                              alt={asset.name}
                              className="absolute inset-0 w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL; }}
                            />
                          </div>
                          <div className="px-3 py-2 text-xs font-bold text-zinc-100 truncate">{asset.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <input
          ref={subjectOtherViewUploadRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={handleSubjectOtherViewUpload}
        />

        {/* 1.5 Plaza Detail Dialog */}
        {plazaDetailItem && (
          <div className="fixed inset-0 z-[111] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => setPlazaDetailItem(null)}>
            <div className="w-full max-w-xl glass-panel rounded-2xl p-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-zinc-200">{t.assets_plaza_detail_title || '素材详情'}</h3>
                <button className="text-zinc-400 hover:text-white" onClick={() => setPlazaDetailItem(null)}><X className="w-5 h-5"/></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-zinc-300">
                <div>
                  <div className="text-zinc-500 mb-1">{t.assets_name_label || '名称'}</div>
                  <div className="text-zinc-100 font-bold break-all">{plazaDetailItem.display_name}</div>
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">{t.assets_plaza_author || '作者'}</div>
                  <div className="text-zinc-100">@{plazaDetailItem.author_name || 'admin'}</div>
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">{t.assets_tab_products || '分类'}</div>
                  <div className="text-zinc-100">{assetTabLabel[plazaDetailItem.category as AssetType] || plazaDetailItem.category}</div>
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">{t.assets_plaza_source_label || '来源'}</div>
                  <div className="text-zinc-100">{plazaDetailItem.source_type === 'official' ? (t.assets_plaza_source_official || '官方') : (t.assets_plaza_source_user || '用户')}</div>
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">{t.assets_plaza_like_btn || '喜欢'}</div>
                  <div className="text-zinc-100">{plazaDetailItem.like_count}</div>
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">{t.assets_plaza_collect_btn || '收集'}</div>
                  <div className="text-zinc-100">{plazaDetailItem.collect_count}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-zinc-500 mb-1">{t.assets_plaza_keywords_placeholder || '关键词'}</div>
                  <div className="text-zinc-100 break-all">{plazaDetailItem.keywords || '-'}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-zinc-500 mb-1">{t.assets_plaza_desc_label || '描述'}</div>
                  <div className="text-zinc-100 whitespace-pre-wrap break-words">{plazaDetailItem.description || '-'}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-zinc-500 mb-1">{t.assets_plaza_created_at || '创建时间'}</div>
                  <div className="text-zinc-100">{plazaDetailItem.created_at || '-'}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 1.6 Plaza Manage Dialog */}
        {plazaManageItem && (
          <div className="fixed inset-0 z-[111] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => setPlazaManageItem(null)}>
            <div className="w-full max-w-lg glass-panel rounded-2xl p-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-zinc-200">{t.assets_plaza_manage_btn || '管理'}</h3>
                <button className="text-zinc-400 hover:text-white" onClick={() => setPlazaManageItem(null)}><X className="w-5 h-5"/></button>
              </div>
              <div className="space-y-3">
                <input
                  value={plazaManageName}
                  onChange={(e) => setPlazaManageName(e.target.value)}
                  placeholder={t.assets_name_label || '名称'}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-orange-500"
                />
                <select
                  value={plazaManageCategory}
                  onChange={(e) => setPlazaManageCategory(e.target.value as AssetType)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-orange-500"
                >
                  {(['model', 'product', 'scene', 'motion', 'audio'] as AssetType[]).map((cat) => (
                    <option key={cat} value={cat}>{assetTabLabel[cat] || cat}</option>
                  ))}
                </select>
                <input
                  value={plazaManageKeywords}
                  onChange={(e) => setPlazaManageKeywords(e.target.value)}
                  placeholder={t.assets_plaza_keywords_placeholder || '关键词'}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="flex items-center justify-between mt-5 gap-3">
                <button
                  type="button"
                  disabled={isPlazaManaging}
                  onClick={() => void deletePlazaManagedItem()}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-red-600 text-white hover:bg-red-500 disabled:opacity-60"
                >
                  {t.assets_delete || '删除'}
                </button>
                <button
                  type="button"
                  disabled={isPlazaManaging}
                  onClick={() => void savePlazaManage()}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-60"
                >
                  {t.assets_save || '保存'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Folder Modal (Create / Rename) */}
        {isFolderModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => setIsFolderModalOpen(false)}>
            <div className="w-full max-w-md glass-panel rounded-2xl p-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-zinc-200">{folderModalMode === 'create' ? t.assets_new_folder_title : t.assets_rename_folder_title}</h3><button className="text-zinc-400 hover:text-white" onClick={() => setIsFolderModalOpen(false)}><X className="w-5 h-5"/></button></div>
              <label className="block text-xs text-zinc-500 mb-2">{t.assets_name_label}</label>
              <input ref={folderNameInputRef} className="w-full bg-black/30 text-zinc-200 text-sm rounded-lg border border-white/10 px-3 py-2 focus:outline-none focus:border-orange-500/50" value={folderNameInput} onChange={(e) => setFolderNameInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitFolderModal(); if (e.key === 'Escape') setIsFolderModalOpen(false); }} placeholder={t.assets_new_folder_prompt} />
              <div className="flex justify-end gap-3 mt-5">
                <button className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-500 disabled:opacity-60" onClick={submitFolderModal} disabled={isSavingFolder}>{folderModalMode === 'create' ? t.assets_btn_new_folder : t.assets_save}</button>
              </div>
            </div>
          </div>
        )}

        {/* 3. Move Asset Modal */}
        {isMoveModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => setIsMoveModalOpen(false)}>
            <div className="w-full max-w-sm glass-panel rounded-2xl p-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-zinc-200">{moveFolder ? t.assets_move_folder_title : (moveAssets.length > 1 ? t.assets_move_items_title : t.assets_move_title)}</h3><button className="text-zinc-400 hover:text-white" onClick={() => setIsMoveModalOpen(false)}><X className="w-5 h-5"/></button></div>
              <div className="text-xs text-zinc-500 mb-3 truncate">{moveSubjectLabel}</div>
              <div className="relative">
                <button className={`w-full bg-black/30 text-zinc-200 text-[13px] rounded-lg border px-3 py-2 flex items-center justify-between focus:outline-none transition ${isMoveDropdownOpen ? 'border-orange-500/60' : 'border-white/10 hover:border-white/20'}`} onClick={() => setIsMoveDropdownOpen(v => !v)}>
                  <span className="truncate">{(() => { if (!moveTargetFolderId) return t.assets_move_root; const found = moveFolders.find(f => f.id === moveTargetFolderId); return found?.name || t.assets_move_root; })()}</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition ${isMoveDropdownOpen ? 'rotate-180 text-orange-400' : 'text-zinc-400'}`} />
                </button>
                {isMoveDropdownOpen && (
                  <div className="absolute mt-2 w-full max-h-64 overflow-auto custom-scroll rounded-lg border border-white/10 bg-zinc-950/90 backdrop-blur-sm shadow-xl z-[120] pr-2">
                    <button className={`w-full text-left px-3 py-2 text-[13px] hover:bg-white/5 ${moveTargetFolderId === null ? 'text-white' : 'text-zinc-200'}`} onClick={() => { setMoveTargetFolderId(null); setIsMoveDropdownOpen(false); }}>{t.assets_move_root}</button>
                    {(moveFoldersByParent.get(null) || [])
                      .filter(f => !moveFolder || !invalidMoveTargetIds.has(f.id))
                      .map(f => {
                        const renderNode = (node: AssetFolder, depth: number): React.ReactNode => {
                          if (moveFolder && invalidMoveTargetIds.has(node.id)) return null;
                          const childrenAll = moveFoldersByParent.get(node.id) || [];
                          const children = moveFolder ? childrenAll.filter(c => !invalidMoveTargetIds.has(c.id)) : childrenAll;
                          const hasChildren = children.length > 0;
                          const isExpanded = moveExpandedFolderIds.has(node.id);
                          const isSelected = moveTargetFolderId === node.id;
                          const depthText =
                            depth === 0 ? 'text-zinc-200' : depth === 1 ? 'text-zinc-300' : 'text-zinc-400';

                          return (
                            <div key={node.id}>
                              <button
                                type="button"
                                className={`w-full text-left px-3 py-2 text-[13px] flex items-center justify-between select-none ${
                                  isSelected ? 'bg-orange-500/15 text-white font-medium' : `hover:bg-white/5 ${depthText}`
                                }`}
                                style={{ paddingLeft: 12 + depth * 14 }}
                                onClick={() => { setMoveTargetFolderId(node.id); setIsMoveDropdownOpen(false); }}
                              >
                                <span className="truncate">{node.name}</span>
                                {hasChildren && (
                                  <span
                                    role="button"
                                    className="ml-2 w-6 h-6 rounded-md hover:bg-white/5 text-zinc-400 hover:text-white flex items-center justify-center shrink-0"
                                    onClick={(e) => { e.stopPropagation(); toggleMoveExpanded(node.id); }}
                                    aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
                                  >
                                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                  </span>
                                )}
                              </button>
                              {hasChildren && isExpanded && children.map(c => renderNode(c, depth + 1))}
                            </div>
                          );
                        };

                        return renderNode(f, 0);
                      })}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-5">
                <button className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-500 disabled:opacity-60" onClick={handleConfirmMove} disabled={isMovingAsset}>{t.assets_move_confirm}</button>
              </div>
            </div>
          </div>
        )}

        {/* 4. Confirm Dialog */}
        {isConfirmModalOpen && (
          <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => setIsConfirmModalOpen(false)}>
            <div className="w-full max-w-md glass-panel rounded-2xl p-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-zinc-200">{confirmTitle || t.assets_confirm_title}</h3><button className="text-zinc-400 hover:text-white" onClick={() => setIsConfirmModalOpen(false)}><X className="w-5 h-5"/></button></div>
              {confirmMessage && <div className="text-sm text-zinc-300 whitespace-pre-line">{confirmMessage}</div>}
              <div className="flex justify-end gap-3 mt-5">
                <button className={`px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-60 ${confirmIsDanger ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-orange-600 hover:bg-orange-500 text-white'}`} onClick={runConfirmAction} disabled={confirmIsWorking}>{confirmIsWorking ? '...' : t.assets_delete}</button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};
