import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  FolderPlus, Upload, Loader2, Folder, X, CheckCircle, Circle, ChevronDown, ChevronRight, Pencil, Search, Heart, Download, Library, Globe, Info, Settings, Eye, EyeOff, Layers3, Plus, Sparkles, AlertCircle, FileText, LayoutGrid, List, Music, ImageIcon, Video, Type, ArrowUpRight, Check
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext'
import { assetsApi, type Asset, type AssetFolder, type PlazaAssetItem, type PlazaCollectPolicy, seedanceApi, subjectGroupApi, type SeedanceCharacter, type SeedanceCharacterFilters, type SeedanceSearchMode, type SubjectGroup } from '../../services/assets';
import { videoApi } from '../../services/video';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { getSubjectGuideContent } from './subjectGuideContent';
import { addTransferStationItems } from '../../utils/workbenchTransferStation';

type AssetType = 'model' | 'product' | 'scene' | 'motion' | 'audio' | 'script' | 'subject';
type PlazaCategory = 'model' | 'product' | 'scene' | 'motion' | 'audio';
type AssetsNavigationIntent =
  | 'open_assets_for_subject_creation'
  | 'open_assets_for_subject_creation_first_time'
  | null;

interface AssetsViewProps {
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
  currentFolderId, 
  setCurrentFolderId,
  navigationIntent,
  onNavigationIntentHandled,
  onSubjectGuideCompleted,
}) => {
  console.log('[AssetsView] render start');
  const { t, language } = useLanguage();
  const { updateUser, user } = useAuth();
  const _MB = 1024 * 1024;
  const IMAGE_MAX_BYTES = 30 * _MB;   // 30 MB
  const VIDEO_MAX_BYTES = 50 * _MB;   // 50 MB
  const AUDIO_MAX_BYTES = 15 * _MB;   // 15 MB
  const DOC_MAX_BYTES   = 10 * _MB;   // 10 MB
  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
  const VIDEO_EXTS = ['mp4', 'mov', 'mkv', 'webm', 'avi'];
  const AUDIO_EXTS = ['mp3', 'wav', 'flac'];
  const DOC_EXTS = ['txt', 'md', 'json'];
  const imageFormats = IMAGE_EXTS.join('/');
  const videoFormats = VIDEO_EXTS.join('/');
  const audioFormats = AUDIO_EXTS.join('/');
  const docFormats = DOC_EXTS.join('/');
  const formatHint = `${t.wb_upload_image}: ${imageFormats} (≤30MB)\n${t.wb_upload_video}: ${videoFormats} (≤50MB)\n${t.wb_upload_audio}: ${audioFormats} (≤15MB)\n${t.assets_tab_scripts || '脚本'}: ${docFormats} (≤10MB)`;

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
    model: t.assets_tab_virtual_models || '虚拟模特',
    product: t.assets_tab_images || '图片',
    scene: t.assets_tab_scenes || '场景',
    motion: t.assets_tab_videos || '视频',
    audio: t.assets_tab_audio || '音频',
    script: t.assets_tab_scripts || '脚本/Prompt',
    subject: t.assets_tab_subjects || 'Subjects',
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

  useEffect(() => {
    if (viewMode === 'plaza' && (activeAssetTab === 'script' || activeAssetTab === 'subject')) {
      setActiveAssetTab('product');
    }
  }, [activeAssetTab, viewMode]);

  // Per-tab upload validation (must be after activeAssetTab declaration)
  const validateUploadFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = file.type.startsWith('image/') || IMAGE_EXTS.includes(ext);
    const isVideo = file.type.startsWith('video/') || VIDEO_EXTS.includes(ext);
    const isAudio = file.type.startsWith('audio/') || AUDIO_EXTS.includes(ext);
    const isDocument = file.type.startsWith('text/') || file.type === 'application/json' || DOC_EXTS.includes(ext);
    // Per-type format check
    if (activeAssetTab === 'product' && !isImage) return `${t.assets_upload_error_unsupported}: ${file.name}`;
    if (activeAssetTab === 'motion' && !isVideo) return `${t.assets_upload_error_unsupported}: ${file.name}`;
    if (activeAssetTab === 'audio' && !isAudio) return `${t.assets_upload_error_unsupported}: ${file.name}`;
    if (activeAssetTab === 'script' && !isDocument) return `${t.assets_upload_error_unsupported}: ${file.name}`;
    if (activeAssetTab === 'model') return `${t.assets_upload_error_unsupported}: ${file.name}`;
    // Per-type size check
    if (isImage && file.size > IMAGE_MAX_BYTES) return `${t.assets_upload_error_too_large}: ${file.name} (>30MB)`;
    if (isVideo && file.size > VIDEO_MAX_BYTES) return `${t.assets_upload_error_too_large}: ${file.name} (>50MB)`;
    if (isAudio && file.size > AUDIO_MAX_BYTES) return `${t.assets_upload_error_too_large}: ${file.name} (>15MB)`;
    if (isDocument && file.size > DOC_MAX_BYTES) return `${t.assets_upload_error_too_large}: ${file.name} (>10MB)`;
    return null;
  };

  const activeTabAccept = useMemo(() => {
    switch (activeAssetTab) {
      case 'product': return '.jpg,.jpeg,.png,.webp,image/*';
      case 'motion': return '.mp4,.mov,.mkv,.webm,.avi,video/*';
      case 'audio': return '.mp3,.wav,.flac,audio/*';
      case 'script': return '.txt,.md,.json,text/plain,application/json';
      default: return '';
    }
  }, [activeAssetTab]);

  const activeTabFormatHint = useMemo(() => {
    switch (activeAssetTab) {
      case 'product': return `${t.wb_upload_image}: ${imageFormats} (≤30MB)`;
      case 'motion': return `${t.wb_upload_video}: ${videoFormats} (≤50MB)`;
      case 'audio': return `${t.wb_upload_audio}: ${audioFormats} (≤15MB)`;
      case 'script': return `${t.assets_tab_scripts || '脚本'}: ${docFormats} (≤10MB)`;
      default: return '';
    }
  }, [activeAssetTab, imageFormats, videoFormats, audioFormats, docFormats, formatHint, t]);

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
  const [plazaManageCategory, setPlazaManageCategory] = useState<PlazaCategory>('product');
  const [plazaManageKeywords, setPlazaManageKeywords] = useState('');
  const [isPlazaManaging, setIsPlazaManaging] = useState(false);
  const plazaUploadInputRef = useRef<HTMLInputElement>(null);

  // Subject Group State
  const [subjects, setSubjects] = useState<SubjectGroup[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [expandedSubjectId, setExpandedSubjectId] = useState<string | null>(null);
  const [isSubjectCreateOpen, setIsSubjectCreateOpen] = useState(false);
  const [subjectNameDraft, setSubjectNameDraft] = useState('');
  const [subjectSlotPicking, setSubjectSlotPicking] = useState<{ subjectId: string; slot: 'primary' | 'other' } | null>(null);
  const [renamingSubjectId, setRenamingSubjectId] = useState<string | null>(null);
  const [subjectRenameDraft, setSubjectRenameDraft] = useState('');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set());

  // Seedance Virtual Models State
  const [seedanceCharacters, setSeedanceCharacters] = useState<SeedanceCharacter[]>([]);
  const [seedanceLoading, setSeedanceLoading] = useState(false);
  const [seedancePage, setSeedancePage] = useState(1);
  const [seedanceTotalCount, setSeedanceTotalCount] = useState(0);
  const [seedanceCountries, setSeedanceCountries] = useState<string[]>([]);
  const [seedanceTemperaments, setSeedanceTemperaments] = useState<string[]>([]);
  const [seedanceOccupations, setSeedanceOccupations] = useState<string[]>([]);
  const [seedanceRaces, setSeedanceRaces] = useState<string[]>([]);
  const [seedanceEthnicities, setSeedanceEthnicities] = useState<string[]>([]);
  const [seedanceCulturalBranches, setSeedanceCulturalBranches] = useState<string[]>([]);
  const [seedanceSkinTones, setSeedanceSkinTones] = useState<string[]>([]);
  const [seedanceSearchMode, setSeedanceSearchMode] = useState<SeedanceSearchMode>('default');
  const [seedanceFilters, setSeedanceFilters] = useState<SeedanceCharacterFilters>({ page_size: 24, search_mode: 'default' });
  const [seedanceAdvancedOpen, setSeedanceAdvancedOpen] = useState(false);
  const [showSeedanceBrowser, setShowSeedanceBrowser] = useState(false);
  const [seedanceOptionsLoaded, setSeedanceOptionsLoaded] = useState(false);
  const [seedanceHasMore, setSeedanceHasMore] = useState(false);
  const seedanceSentinelRef = useRef<HTMLDivElement | null>(null);
  const seedanceScrollRef = useRef<HTMLDivElement | null>(null);

  // New script dialog
  const [isNewScriptDialogOpen, setIsNewScriptDialogOpen] = useState(false);
  const [newScriptName, setNewScriptName] = useState('');
  const [newScriptContent, setNewScriptContent] = useState('');
  const [isSavingScript, setIsSavingScript] = useState(false);

  // View mode: grid vs list
  const [assetViewLayout, setAssetViewLayout] = useState<'grid' | 'list'>('grid');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  
  // Auto-dismiss toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, duration = 2500) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), duration);
  }, []);

  // UI State
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
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

  const addAssetDirectlyToTransferStation = useCallback((asset: Asset) => {
    const mediaKind = asset.media_kind || 'image';
    const transferMediaKind = mediaKind === 'document' ? 'file' : mediaKind;
    const mappedType: Asset['type'] =
      asset.type === 'model' || asset.type === 'product' || asset.type === 'scene' || asset.type === 'motion' || asset.type === 'audio'
        ? asset.type
        : (transferMediaKind === 'video' ? 'motion' : transferMediaKind === 'audio' ? 'audio' : 'product');

    const result = addTransferStationItems([{
      assetId: asset.id,
      name: asset.name,
      fileUrl: asset.file_url,
      mediaKind: transferMediaKind,
      type: mappedType,
      source: 'assets',
    }], user?.id ?? null);

    openInfo(
      t.assets_confirm_title || 'Notice',
      result.addedCount > 0
        ? (t.wb_transfer_station_add_success || '已加入中转站，可在工作台悬浮球中拖拽使用。')
        : (t.wb_transfer_station_add_duplicate || '素材已在中转站中，无需重复添加。'),
    );
  }, [openInfo, t.assets_confirm_title, t.wb_transfer_station_add_duplicate, t.wb_transfer_station_add_success, user?.id]);

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

    const cache = new Map<string, { assetCount: number; subfolderCount: number; directSubfolderCount: number; previewAssets: Asset[]; previewFolderNames: string[] }>();
    const collect = (folderId: string): { assetCount: number; subfolderCount: number; directSubfolderCount: number; previewAssets: Asset[]; previewFolderNames: string[] } => {
      const cached = cache.get(folderId);
      if (cached) return cached;

      const directChildren = childFoldersByParent.get(folderId) || [];
      const directAssets = assetsByFolderId.get(folderId) || [];
      let assetCount = directAssets.length;
      const directSubfolderCount = directChildren.length;
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

      const summary = { assetCount, subfolderCount, directSubfolderCount, previewAssets, previewFolderNames };
      cache.set(folderId, summary);
      return summary;
    };

    const summaryMap = new Map<string, { assetCount: number; subfolderCount: number; directSubfolderCount: number; previewAssets: Asset[]; previewFolderNames: string[] }>();
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

    if (
      navigationIntent === 'open_assets_for_subject_creation' ||
      navigationIntent === 'open_assets_for_subject_creation_first_time'
    ) {
      setActiveAssetTab('subject');
    }

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
  const [textPreviewContent, setTextPreviewContent] = useState<string | null>(null);
  const [textPreviewLoading, setTextPreviewLoading] = useState(false);

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
        category: activeAssetTab === 'script' || activeAssetTab === 'subject' ? 'product' : activeAssetTab,
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

  const loadSubjects = useCallback(async () => {
    if (activeAssetTab !== 'subject' || viewMode !== 'library') return;
    setSubjectsLoading(true);
    try {
      const list = await subjectGroupApi.list();
      setSubjects(list);
    } catch (err) {
      console.error('Failed to load subjects', err);
    } finally {
      setSubjectsLoading(false);
    }
  }, [activeAssetTab, viewMode]);

  const loadSeedanceCharacters = useCallback(async (filters?: SeedanceCharacterFilters) => {
    setSeedanceLoading(true);
    try {
      const resp = await seedanceApi.getCharacters(filters || seedanceFilters);
      setSeedanceCharacters(resp.data.results);
      setSeedanceTotalCount(resp.data.count);
      setSeedancePage(resp.data.page);
      const ps = (filters || seedanceFilters).page_size || 24;
      setSeedanceHasMore(resp.data.page * ps < resp.data.count);
    } catch (err) {
      console.error('Failed to load seedance characters', err);
    } finally {
      setSeedanceLoading(false);
    }
  }, [seedanceFilters]);

  const loadSeedanceCharactersAppend = useCallback(async (filters: SeedanceCharacterFilters) => {
    setSeedanceLoading(true);
    try {
      const resp = await seedanceApi.getCharacters(filters);
      setSeedanceCharacters(prev => [...prev, ...resp.data.results]);
      setSeedanceTotalCount(resp.data.count);
      setSeedancePage(resp.data.page);
      const ps = filters.page_size || 24;
      setSeedanceHasMore(resp.data.page * ps < resp.data.count);
    } catch (err) {
      console.error('Failed to load seedance characters (append)', err);
    } finally {
      setSeedanceLoading(false);
    }
  }, []);

  const loadSeedanceOptions = useCallback(async () => {
    if (seedanceOptionsLoaded) return;
    try {
      const resp = await seedanceApi.getOptions();
      if (resp.data.countries?.length) setSeedanceCountries(resp.data.countries);
      if (resp.data.temperaments?.length) setSeedanceTemperaments(resp.data.temperaments);
      if (resp.data.occupations?.length) setSeedanceOccupations(resp.data.occupations);
      if (resp.data.races?.length) setSeedanceRaces(resp.data.races);
      if (resp.data.ethnicities?.length) setSeedanceEthnicities(resp.data.ethnicities);
      if (resp.data.cultural_branches?.length) setSeedanceCulturalBranches(resp.data.cultural_branches);
      if (resp.data.skin_tones?.length) setSeedanceSkinTones(resp.data.skin_tones);
      setSeedanceOptionsLoaded(true);
    } catch (err) {
      console.error('Failed to load seedance options', err);
    }
  }, [seedanceOptionsLoaded]);

  // --- Effects ---

  // Auto-load seedance data when entering plaza model tab
  useEffect(() => {
    if (viewMode === 'plaza' && activeAssetTab === 'model') {
      void loadSeedanceOptions();
      const fresh: SeedanceCharacterFilters = { page_size: 24, search_mode: seedanceSearchMode, page: 1 };
      setSeedanceFilters(fresh);
      setSeedanceCharacters([]);
      void loadSeedanceCharacters(fresh);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, activeAssetTab]);

  // IntersectionObserver for seedance infinite scroll in plaza model tab
  useEffect(() => {
    if (viewMode !== 'plaza' || activeAssetTab !== 'model') return;
    const sentinel = seedanceSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && seedanceHasMore && !seedanceLoading) {
          const nextPage = seedancePage + 1;
          const nextFilters = { ...seedanceFilters, page: nextPage };
          setSeedanceFilters(nextFilters);
          void loadSeedanceCharactersAppend(nextFilters);
        }
      },
      { root: seedanceScrollRef.current, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [viewMode, activeAssetTab, seedanceHasMore, seedanceLoading, seedancePage, seedanceFilters, loadSeedanceCharactersAppend]);

  useEffect(() => {
    if (viewMode === 'library') {
      if (!user) {
        // Guest: restore temp assets from session cache
        try {
          const cached: Asset[] = JSON.parse(sessionStorage.getItem('vflow_guest_assets') || '[]');
          setAssetList(cached.filter(a => a.type === activeAssetTab));
          setAllTypeAssets(cached);
        } catch { setAssetList([]); setAllTypeAssets([]); }
        setFolderList([]);
        setAllTypeFolders([]);
        return;
      }
      if (activeAssetTab === 'subject') {
        void loadSubjects();
      } else {
        void loadData();
      }
      setOpenFolderMenuId(null);
      setIsSelectionMode(false);
      setSelectedAssetIds(new Set());
      return;
    }
    void loadPlazaData();
  }, [loadData, loadPlazaData, loadSubjects, viewMode, activeAssetTab, user]);

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

  // Auto-fetch text content for document previews
  useEffect(() => {
    const target = assetPreview;
    if (!target || target.media_kind !== 'document') {
      setTextPreviewContent(null);
      return;
    }
    let cancelled = false;
    const fetchText = async () => {
      setTextPreviewLoading(true);
      setTextPreviewContent(null);
      try {
        const url = getDisplayUrl(target.file_url);
        if (!url) return;
        const resp = await fetch(url);
        if (cancelled) return;
        const text = await resp.text();
        if (cancelled) return;
        setTextPreviewContent(text);
      } catch {
        if (!cancelled) setTextPreviewContent(null);
      } finally {
        if (!cancelled) setTextPreviewLoading(false);
      }
    };
    void fetchText();
    return () => { cancelled = true; };
  }, [assetPreview]);

  /** Probe width/height/duration from a local File using browser APIs */
  const probeMediaMeta = (file: File): Promise<{ width: number | null; height: number | null; duration: number | null; kind: string }> =>
    new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      if (file.type.startsWith('video/')) {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => { resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration, kind: 'video' }); URL.revokeObjectURL(objectUrl); };
        v.onerror = () => { resolve({ width: null, height: null, duration: null, kind: 'video' }); URL.revokeObjectURL(objectUrl); };
        v.src = objectUrl;
      } else if (file.type.startsWith('image/')) {
        const img = new Image();
        img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight, duration: null, kind: 'image' }); URL.revokeObjectURL(objectUrl); };
        img.onerror = () => { resolve({ width: null, height: null, duration: null, kind: 'image' }); URL.revokeObjectURL(objectUrl); };
        img.src = objectUrl;
      } else if (file.type.startsWith('audio/')) {
        const a = document.createElement('audio');
        a.preload = 'metadata';
        a.onloadedmetadata = () => { resolve({ width: null, height: null, duration: a.duration, kind: 'audio' }); URL.revokeObjectURL(objectUrl); };
        a.onerror = () => { resolve({ width: null, height: null, duration: null, kind: 'audio' }); URL.revokeObjectURL(objectUrl); };
        a.src = objectUrl;
      } else {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: null, height: null, duration: null, kind: 'unknown' });
      }
    });

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
      if (!user) {
        // Guest: upload via temp endpoint, store results in local state
        const tempAssets: Asset[] = [];
        for (const file of validFiles) {
          const resp = await assetsApi.uploadTempAsset(file);
          const url = resp?.data?.url || resp?.url || '';
          // Probe media dimensions/duration from the local file
          const mediaMeta = await probeMediaMeta(file);
          tempAssets.push({
            id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            type: activeAssetTab,
            file_url: url,
            thumbnail: url,
            media_kind: mediaMeta.kind as Asset['media_kind'],
            size: String(file.size),
            status: 'ready',
            created_at: new Date().toISOString(),
            folder_id: null,
            meta_data: {
              width: mediaMeta.width,
              height: mediaMeta.height,
              video_width: mediaMeta.width,
              video_height: mediaMeta.height,
              size_bytes: file.size,
              duration_seconds: mediaMeta.duration,
              format: file.type || null,
            },
          });
        }
        setAssetList(prev => [...tempAssets, ...prev]);
        setAllTypeAssets(prev => [...tempAssets, ...prev]);
        // Persist to session cache
        try {
          const existing: Asset[] = JSON.parse(sessionStorage.getItem('vflow_guest_assets') || '[]');
          sessionStorage.setItem('vflow_guest_assets', JSON.stringify([...tempAssets, ...existing]));
        } catch { /* ignore */ }
      } else {
        const uploadTasks = validFiles.map(async (file) => {
          const uploadResp = await assetsApi.uploadAsset(file, activeAssetTab, currentFolderId);
          await patchUploadedMediaMetadata(uploadResp, file, activeAssetTab);
          return uploadResp;
        });
        await Promise.all(uploadTasks);
        await loadData();
      }
      showToast((t as any).assets_upload_success_title || `Successfully uploaded ${validFiles.length} files!`);
    } catch (err) {
      console.error(err);
      openInfo((t as any).assets_upload_failed || 'Upload failed', String(err instanceof Error ? err.message : err));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveNewScript = async () => {
    const name = (newScriptName || '').trim();
    const content = (newScriptContent || '').trim();
    if (!name || !content) return;
    setIsSavingScript(true);
    try {
      const blob = new Blob([content], { type: 'text/plain' });
      const file = new File([blob], name.endsWith('.txt') ? name : `${name}.txt`, { type: 'text/plain' });
      await assetsApi.uploadAsset(file, 'script', currentFolderId);
      await loadData();
      setIsNewScriptDialogOpen(false);
      setNewScriptName('');
      setNewScriptContent('');
    } catch (err) {
      console.error(err);
      openInfo('Error', String(err instanceof Error ? err.message : err));
    } finally {
      setIsSavingScript(false);
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
    setPlazaManageCategory((item.category || 'product') as PlazaCategory);
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
        category: activeAssetTab === 'script' || activeAssetTab === 'subject' ? 'product' : activeAssetTab,
        keywords: plazaKeywordDraft,
      })));
      setPlazaKeywordDraft('');
      await loadPlazaData();
      showToast(t.assets_plaza_upload_success || 'Plaza upload complete');
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

  const handleToggleFavorite = async (asset: Asset) => {
    try {
      const newValue = await assetsApi.toggleFavorite(asset.id);
      setAssetList(prev => prev.map(a => a.id === asset.id ? { ...a, is_favorited: newValue } : a));
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleFolderFavorite = async (folder: AssetFolder) => {
    try {
      const newValue = await assetsApi.toggleFolderFavorite(folder.id);
      setFolderList(prev => prev.map(f => f.id === folder.id ? { ...f, is_favorited: newValue } : f));
    } catch (err) {
      console.error(err);
    }
  };

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
    setSelectedFolderIds(new Set());
  };


  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const visibleAssets = useMemo(() => (
    assetList.filter((asset) => (
      asset.type === activeAssetTab
      && (!hideReferencedOtherViews || !referencedOtherViewIds.has(asset.id))
      && (!showOnlyFavorites || asset.is_favorited)
    ))
  ), [activeAssetTab, assetList, hideReferencedOtherViews, referencedOtherViewIds, showOnlyFavorites]);

  const visibleFolders = useMemo(() => (
    showOnlyFavorites ? folderList.filter(f => f.is_favorited) : folderList
  ), [folderList, showOnlyFavorites]);

  // Force list view for audio / script tabs
  const isListOnlyTab = activeAssetTab === 'audio' || activeAssetTab === 'script';
  useEffect(() => {
    if (isListOnlyTab) setAssetViewLayout('list');
  }, [isListOnlyTab]);

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

  const selectAllVisible = () => {
    setSelectedAssetIds(new Set(visibleAssets.map(a => a.id)));
    setSelectedFolderIds(new Set(visibleFolders.map(f => f.id)));
    if (activeAssetTab === 'subject') {
      setSelectedSubjectIds(new Set(subjects.map(s => s.id)));
    }
  };

  const deselectAllVisible = () => {
    setSelectedAssetIds(new Set());
    setSelectedFolderIds(new Set());
    setSelectedSubjectIds(new Set());
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

  // --- Bundle Handlers ---
  const [slotPickerAssets, setSlotPickerAssets] = useState<Asset[]>([]);
  const [slotPickerFolders, setSlotPickerFolders] = useState<AssetFolder[]>([]);
  const [slotPickerFolderId, setSlotPickerFolderId] = useState<string | null>(null);
  const [slotPickerBreadcrumb, setSlotPickerBreadcrumb] = useState<AssetFolder[]>([]);
  const [slotPickerLoading, setSlotPickerLoading] = useState(false);
  const [selectedPickerIds, setSelectedPickerIds] = useState<Set<string>>(new Set());

  const togglePickerAsset = (assetId: string) => {
    setSelectedPickerIds(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId); else next.add(assetId);
      return next;
    });
  };

  // --- Subject Group handlers ---
  const handleCreateSubject = async () => {
    const name = subjectNameDraft.trim();
    if (!name) return;
    try {
      await subjectGroupApi.create({ name });
      setIsSubjectCreateOpen(false);
      setSubjectNameDraft('');
      void loadSubjects();
    } catch (err) {
      console.error('Failed to create subject', err);
    }
  };

  const handleDeleteSubject = async (subjectId: string) => {
    try {
      await subjectGroupApi.delete(subjectId);
      if (expandedSubjectId === subjectId) setExpandedSubjectId(null);
      void loadSubjects();
    } catch (err) {
      console.error('Failed to delete subject', err);
    }
  };

  const beginRenameSubject = (sg: SubjectGroup) => {
    setRenamingSubjectId(sg.id);
    setSubjectRenameDraft(sg.name);
  };

  const commitRenameSubject = async (subjectId: string) => {
    const name = subjectRenameDraft.trim();
    setRenamingSubjectId(null);
    if (!name) return;
    try {
      await subjectGroupApi.update(subjectId, { name });
      void loadSubjects();
    } catch (err) {
      console.error('Failed to rename subject', err);
    }
  };

  const handleOpenSubjectSlotPicker = async (subjectId: string, slot: 'primary' | 'other') => {
    setSubjectSlotPicking({ subjectId, slot });
    setSlotPickerFolderId(null);
    setSlotPickerBreadcrumb([]);
    setSelectedPickerIds(new Set());
    // Subject picker shows product (images) + model assets
    await loadSlotPickerData('image', null);
  };

  const handleConfirmSubjectPickerSelection = async () => {
    if (!subjectSlotPicking || selectedPickerIds.size === 0) return;
    const { subjectId, slot } = subjectSlotPicking;
    try {
      const selectedArray = Array.from(selectedPickerIds);
      if (slot === 'primary') {
        await subjectGroupApi.update(subjectId, { primary_asset_id: selectedArray[0] });
      } else {
        await subjectGroupApi.update(subjectId, { add_other_asset_ids: selectedArray });
      }
      setSubjectSlotPicking(null);
      setSlotPickerAssets([]);
      setSlotPickerFolders([]);
      setSelectedPickerIds(new Set());
      void loadSubjects();
    } catch (err) {
      console.error('Failed to link asset to subject', err);
    }
  };

  const handleRemoveSubjectAsset = async (subjectId: string, slot: 'primary' | 'other', assetId: string) => {
    try {
      if (slot === 'primary') {
        await subjectGroupApi.update(subjectId, { primary_asset_id: '' });
      } else {
        await subjectGroupApi.update(subjectId, { remove_other_asset_id: assetId });
      }
      void loadSubjects();
    } catch (err) {
      console.error('Failed to remove asset from subject', err);
    }
  };

  const toggleSubjectSelection = (subjectId: string) => {
    setSelectedSubjectIds(prev => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId); else next.add(subjectId);
      return next;
    });
  };

  const handleBatchDeleteSubjects = async () => {
    const ids = Array.from(selectedSubjectIds);
    for (const id of ids) {
      try { await subjectGroupApi.delete(id); } catch {}
    }
    setSelectedSubjectIds(new Set());
    setIsSelectionMode(false);
    void loadSubjects();
  };

  const slotTypeMap: Record<string, 'product' | 'motion' | 'audio' | 'script' | 'model'> = { image: 'product', video: 'motion', audio: 'audio', text: 'script', model: 'model' };

  const loadSlotPickerData = async (slot: 'image' | 'video' | 'audio' | 'text' | 'model', folderId: string | null) => {
    setSlotPickerLoading(true);
    try {
      const assetType = slotTypeMap[slot];
      const [assetsResult, folderResult] = await Promise.all([
        assetsApi.getAssets({ type: assetType, folderId }),
        assetsApi.getFolders({ type: assetType, parentId: folderId }),
      ]);
      setSlotPickerAssets(assetsResult);
      setSlotPickerFolders(folderResult.folders);
      setSlotPickerBreadcrumb(folderResult.breadcrumb);
      setSlotPickerFolderId(folderId);
    } catch {
      setSlotPickerAssets([]);
      setSlotPickerFolders([]);
    } finally {
      setSlotPickerLoading(false);
    }
  };

  const handleDownloadAsset = (asset: Asset) => {
    const url = getDisplayUrl(asset.file_url);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = asset.name || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
    const selectedAssets = assetList.filter(a => selectedAssetIds.has(a.id));
    if (selectedAssets.length === 0 && selectedFolderIds.size === 0) return;
    void openMoveDialog(selectedAssets, currentFolderId ?? null);
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
    if (moveAssets.length === 0 && !moveFolder && moveBatchFolderIds.length === 0) return;
    setIsMovingAsset(true);
    try {
      // Single folder move
      if (moveFolder && moveBatchFolderIds.length === 0) {
        const from = moveFolder.parent_id ?? null;
        const to = moveTargetFolderId ?? null;
        if (from !== to) {
          await assetsApi.moveFolder(moveFolder.id, to);
          await loadData();
        }
        setIsMoveModalOpen(false);
        return;
      }

      // Batch folder moves
      if (moveBatchFolderIds.length > 0) {
        const folderResults = await Promise.allSettled(
          moveBatchFolderIds.map(fid => {
            const folder = folderList.find(f => f.id === fid);
            const from = folder?.parent_id ?? null;
            const to = moveTargetFolderId ?? null;
            if (from === to) return Promise.resolve(null);
            return assetsApi.moveFolder(fid, to);
          })
        );
        const folderFailed = folderResults.filter(r => r.status === 'rejected');
        if (folderFailed.length > 0) openInfo('移动失败', `${folderFailed.length} 个文件夹移动失败`);
      }

      // Asset moves
      if (moveAssets.length > 0) {
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
      }

      await loadData();
      setIsMoveModalOpen(false);
      exitSelectionMode();
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
  const getDisplayUrl = (path: string | null | undefined): string => {
     if (!path) return '';
     if (path.startsWith('http')) return path;
     const mediaBaseUrl = import.meta.env.VITE_MEDIA_BASE_URL || '';
     return mediaBaseUrl ? `${mediaBaseUrl}${path}` : path;
  };

  const selectedCount = selectedAssetIds.size + selectedFolderIds.size + selectedSubjectIds.size;
  const isAllVisibleSelected = (visibleAssets.length > 0 || visibleFolders.length > 0 || (activeAssetTab === 'subject' && subjects.length > 0))
    && visibleAssets.every(a => selectedAssetIds.has(a.id))
    && visibleFolders.every(f => selectedFolderIds.has(f.id))
    && (activeAssetTab !== 'subject' || subjects.every(s => selectedSubjectIds.has(s.id)));

  const moveBatchFolderIds = [...selectedFolderIds];

  const moveSubjectLabel = moveFolder
    ? moveFolder.name
    : moveBatchFolderIds.length > 0 && moveAssets.length > 0
    ? `${moveBatchFolderIds.length} 文件夹 + ${moveAssets.length} 素材`
    : moveBatchFolderIds.length > 0
    ? `${moveBatchFolderIds.length} 文件夹`
    : (moveAssets.length === 1 ? moveAssets[0]?.name : `${moveAssets.length} ${t.assets_items}`);

  const moveFoldersByParent = buildFolderTree(moveFolders);

  const invalidMoveTargetIds = (() => {
    const invalid = new Set<string>();
    // Single folder move: exclude it and its subtree
    if (moveFolder) {
      invalid.add(moveFolder.id);
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
    }
    // Batch folder move: exclude each selected folder and its subtree
    for (const fid of moveBatchFolderIds) {
      invalid.add(fid);
      const stack = [fid];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        const children = moveFoldersByParent.get(cur) || [];
        for (const child of children) {
          if (invalid.has(child.id)) continue;
          invalid.add(child.id);
          stack.push(child.id);
        }
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
        {/* Auto-dismiss toast */}
        {toastMessage && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 bg-zinc-800/95 backdrop-blur-sm border border-white/10 rounded-xl shadow-2xl text-sm text-zinc-100 font-medium animate-fade-in-up pointer-events-none">
            {toastMessage}
          </div>
        )}
        {/* New Script Dialog */}
        {isNewScriptDialogOpen && (
          <div className="fixed inset-0 z-[116] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => { setIsNewScriptDialogOpen(false); setNewScriptName(''); setNewScriptContent(''); }}>
            <div className="w-full max-w-lg glass-panel rounded-2xl p-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-zinc-200">{(t as any).assets_new_script_title || '新建脚本'}</h3>
                <button className="text-zinc-400 hover:text-white" onClick={() => { setIsNewScriptDialogOpen(false); setNewScriptName(''); setNewScriptContent(''); }}><X className="w-5 h-5"/></button>
              </div>
              <input
                type="text"
                placeholder={(t as any).assets_new_script_name_placeholder || '脚本名称'}
                value={newScriptName}
                onChange={(e) => setNewScriptName(e.target.value)}
                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500 mb-3"
              />
              <textarea
                placeholder={(t as any).assets_new_script_content_placeholder || '在此输入脚本内容...'}
                value={newScriptContent}
                onChange={(e) => setNewScriptContent(e.target.value)}
                rows={10}
                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-y mb-4"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => { setIsNewScriptDialogOpen(false); setNewScriptName(''); setNewScriptContent(''); }} className="px-4 py-2 text-sm text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition">{(t as any).assets_cancel || '取消'}</button>
                <button
                  onClick={handleSaveNewScript}
                  disabled={isSavingScript || !newScriptName.trim() || !newScriptContent.trim()}
                  className="px-4 py-2 text-sm font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >{isSavingScript ? ((t as any).assets_saving || '保存中...') : ((t as any).assets_save || '保存')}</button>
              </div>
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
                className={`px-3.5 py-2 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 ${viewMode === 'library' ? 'border-orange-500/60 bg-orange-500/15 text-orange-200' : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'}`}
              >
                <Library className="w-4 h-4 shrink-0" />
                {t.assets_title}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('plaza')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 ${viewMode === 'plaza' ? 'border-orange-500/60 bg-orange-500/15 text-orange-200' : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'}`}
              >
                <Globe className="w-4 h-4 shrink-0" />
                {t.assets_plaza_title || '素材广场'}
              </button>
            </div>
          </div>
          <div className="flex gap-3 items-center">
             <LanguageSwitcher />
             {viewMode === 'library' ? (
               <>
                 {activeAssetTab !== 'subject' && activeAssetTab !== 'model' && (
                   <button onClick={openCreateFolderModal} className="bg-zinc-800 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-zinc-700 transition flex items-center gap-2"><FolderPlus className="w-4 h-4" /> {t.assets_btn_new_folder}</button>
                 )}
                 {activeAssetTab !== 'model' && activeAssetTab !== 'subject' && (
                 <div className="relative group">
                   <button onClick={() => assetInputRef.current?.click()} className="bg-orange-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-orange-500 transition flex items-center gap-2 shadow-lg shadow-orange-500/20" disabled={isUploading}>
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {t.assets_btn_upload}
                   </button>
                   <div className="absolute right-0 top-12 z-50 w-max max-w-[360px] rounded-xl border border-white/10 bg-zinc-900/95 px-3 py-2 text-[10px] text-zinc-100 opacity-0 shadow-xl backdrop-blur transition group-hover:opacity-100 hover:opacity-100">
                     <div className="text-[11px] font-bold text-white mb-1">{t.assets_upload_formats_title}</div>
                     <div className="whitespace-pre-line text-zinc-300 leading-relaxed">{activeTabFormatHint}</div>
                   </div>
                 </div>
                 )}
                <input type="file" ref={assetInputRef} className="hidden" multiple accept={activeTabAccept} onChange={handleAssetUpload} />
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
         <div className="flex items-center gap-1 mb-8 border-b border-white/5 pb-2">
             {((['product', 'motion', 'audio', 'model', 'script'] as AssetType[]).map(type => (
                <button
                  key={type}
                  onClick={() => {
                    if (type === activeAssetTab) return;
                    setActiveAssetTab(type);
                    setCurrentFolderId(null);
                    setFolderBreadcrumb([]);
                  }}
                  className={`asset-type-tab text-sm font-bold px-5 py-2 rounded-full transition ${activeAssetTab === type ? 'asset-type-tab--active' : 'asset-type-tab--inactive'}`}
                >
                  {assetTabLabel[type] || type.toUpperCase()}
                </button>
             )))}
             {viewMode === 'library' && (
               <>
                 <div className="h-5 w-px bg-white/10 mx-2 self-center shrink-0" />
                 {(['subject'] as AssetType[]).map(type => (
                   <button
                     key={type}
                     onClick={() => {
                       if (type === activeAssetTab) return;
                       setActiveAssetTab(type);
                       setCurrentFolderId(null);
                       setFolderBreadcrumb([]);
                     }}
                     className={`asset-type-tab text-sm font-bold px-5 py-2 rounded-full transition ${activeAssetTab === type ? 'asset-type-tab--active' : 'asset-type-tab--inactive'}`}
                   >
                     {assetTabLabel[type] || type.toUpperCase()}
                   </button>
                 ))}
               </>
             )}
          </div>

             {viewMode === 'library' ? (
             <>

          {activeAssetTab === 'subject' ? (
            /* ==================== Subject Groups Tab ==================== */
            <div className="flex-1 overflow-y-auto">
              {/* Subject toolbar */}
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2 text-xs text-zinc-500" />
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    ref={subjectGuideButtonRef}
                    onClick={() => openSubjectGuideModal(false)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 transition text-xs font-bold ${isSubjectGuideSpotlightOpen ? 'relative z-[151]' : ''}`}
                    title={t.assets_subject_guide_button || '主体创建说明'}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t.assets_subject_guide_button || '主体创建说明'}</span>
                  </button>
                  {!isSelectionMode && (
                    <button
                      onClick={() => setIsSelectionMode(true)}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> {'选择'}
                    </button>
                  )}
                  <button
                    onClick={() => setIsSubjectCreateOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 transition shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> 新建主体
                  </button>
                </div>
              </div>
              {/* Selection mode toolbar */}
              {isSelectionMode && (
                <div className="flex items-center gap-3 mb-4 px-2">
                  <button onClick={() => { setIsSelectionMode(false); setSelectedSubjectIds(new Set()); }} className="text-xs text-zinc-400 hover:text-white transition">取消</button>
                  <span className="text-xs text-zinc-500">已选 {selectedSubjectIds.size} 项</span>
                  {selectedSubjectIds.size > 0 && (
                    <button onClick={() => openConfirmModal({ title: '批量删除主体', message: `确定删除 ${selectedSubjectIds.size} 个主体？\n\n此操作不可逆`, danger: true, onConfirm: handleBatchDeleteSubjects })} className="text-xs text-red-400 hover:text-red-300 transition">
                      删除所选
                    </button>
                  )}
                </div>
              )}

              {subjectsLoading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>
              ) : subjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                  <Layers3 className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm font-bold">暂无主体</p>
                  <p className="text-xs mt-1 opacity-70">点击上方按钮创建主体</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {subjects.map((sg) => {
                    const isExpanded = expandedSubjectId === sg.id;
                    const isSgSel = selectedSubjectIds.has(sg.id);
                    return (
                      <div key={`sg-${sg.id}`} className={`bg-zinc-900/80 rounded-xl border transition overflow-hidden group/subject ${
                        isSelectionMode && isSgSel ? 'border-blue-500 bg-blue-500/10' : 'border-white/5 hover:border-orange-500/30'
                      }`}>
                        {/* Subject card header */}
                        <div
                          className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                          onClick={() => isSelectionMode ? toggleSubjectSelection(sg.id) : setExpandedSubjectId(isExpanded ? null : sg.id)}
                        >
                          {isSelectionMode && (
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isSgSel ? 'bg-blue-500 border-blue-500' : 'border-zinc-500'}`}>
                              {isSgSel && <Check className="w-3 h-3 text-white" />}
                            </div>
                          )}
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />}
                          {/* Primary asset thumbnail */}
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                            {sg.primary_asset ? (
                              <img src={sg.primary_asset.thumbnail || sg.primary_asset.file_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-4 h-4 text-zinc-600" /></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {renamingSubjectId === sg.id ? (
                              <input
                                value={subjectRenameDraft}
                                autoFocus
                                className="w-full bg-black/40 text-zinc-100 text-sm font-bold rounded-md border border-white/10 px-2 py-0.5 focus:outline-none focus:border-orange-500/50"
                                onChange={(e) => setSubjectRenameDraft(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={() => void commitRenameSubject(sg.id)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void commitRenameSubject(sg.id); } if (e.key === 'Escape') { e.preventDefault(); setRenamingSubjectId(null); } }}
                              />
                            ) : (
                              <div className="text-sm font-bold text-zinc-200 truncate">{sg.name}</div>
                            )}
                            <div className="text-[10px] text-zinc-500 mt-0.5">
                              {sg.primary_asset ? '1 主图' : '无主图'}{sg.other_assets.length > 0 ? ` · ${sg.other_assets.length} 副图` : ''}
                            </div>
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/subject:opacity-100 transition">
                            <button onClick={(e) => { e.stopPropagation(); beginRenameSubject(sg); }} className="w-7 h-7 rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 flex items-center justify-center" title="重命名"><Pencil className="w-3.5 h-3.5" /></button>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); openConfirmModal({ title: '删除主体', message: `${sg.name}\n\n此操作不可逆`, danger: true, onConfirm: () => handleDeleteSubject(sg.id) }); }}
                            className="w-7 h-7 rounded-full bg-zinc-800 text-zinc-500 hover:text-red-400 hover:bg-zinc-700 flex items-center justify-center transition shrink-0 ml-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="border-t border-white/5 px-4 py-4 space-y-4">
                            {/* Primary asset slot */}
                            <div className="rounded-xl border border-orange-500/20 bg-zinc-950/50 p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <ImageIcon className="w-4 h-4 text-orange-400" />
                                <span className="text-xs font-bold text-orange-300">主图</span>
                              </div>
                              {sg.primary_asset ? (
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                                    <img src={sg.primary_asset.thumbnail || sg.primary_asset.file_url} alt="" className="w-full h-full object-cover" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-zinc-300 truncate">{sg.primary_asset.name}</div>
                                  </div>
                                  <button onClick={() => handleRemoveSubjectAsset(sg.id, 'primary', sg.primary_asset!.id)} className="text-zinc-500 hover:text-red-400 transition shrink-0"><X className="w-4 h-4" /></button>
                                </div>
                              ) : null}
                              <button onClick={() => handleOpenSubjectSlotPicker(sg.id, 'primary')} className="w-full py-3 border border-dashed border-orange-500/20 rounded-lg text-xs text-zinc-500 hover:text-orange-400 hover:border-orange-500/40 transition flex items-center justify-center gap-1.5">
                                <Plus className="w-3.5 h-3.5" /> {sg.primary_asset ? '更换主图' : '设置主图'}
                              </button>
                            </div>

                            {/* Other assets slot */}
                            <div className="rounded-xl border border-blue-500/20 bg-zinc-950/50 p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Layers3 className="w-4 h-4 text-blue-400" />
                                <span className="text-xs font-bold text-blue-300">副图</span>
                                <span className="text-[10px] text-zinc-500 ml-auto">{sg.other_assets.length}/3</span>
                              </div>
                              {sg.other_assets.length > 0 && (
                                <div className="space-y-2 mb-2 max-h-48 overflow-y-auto">
                                  {sg.other_assets.map((asset) => (
                                    <div key={asset.id} className="flex items-center gap-3">
                                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                                        <img src={asset.thumbnail || asset.file_url} alt="" className="w-full h-full object-cover" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs text-zinc-300 truncate">{asset.name}</div>
                                      </div>
                                      <button onClick={() => handleRemoveSubjectAsset(sg.id, 'other', asset.id)} className="text-zinc-500 hover:text-red-400 transition shrink-0"><X className="w-4 h-4" /></button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {sg.other_assets.length < 3 && (
                                <button onClick={() => handleOpenSubjectSlotPicker(sg.id, 'other')} className="w-full py-3 border border-dashed border-blue-500/20 rounded-lg text-xs text-zinc-500 hover:text-blue-400 hover:border-blue-500/40 transition flex items-center justify-center gap-1.5">
                                  <Plus className="w-3.5 h-3.5" /> 添加副图
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Create subject modal */}
              {isSubjectCreateOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setIsSubjectCreateOpen(false)}>
                  <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-base font-bold text-white mb-4">新建主体</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-zinc-400 mb-1 block">名称</label>
                        <input
                          type="text"
                          className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500/50"
                          placeholder="主体名称..."
                          value={subjectNameDraft}
                          onChange={(e) => setSubjectNameDraft(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateSubject(); }}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-5">
                      <button onClick={() => setIsSubjectCreateOpen(false)} className="px-4 py-2 text-xs text-zinc-400 hover:text-white transition">取消</button>
                      <button onClick={() => void handleCreateSubject()} disabled={!subjectNameDraft.trim()} className="px-4 py-2 text-xs font-bold bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition disabled:opacity-40 disabled:cursor-not-allowed">创建</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Subject slot picker overlay (reuses same picker pattern) */}
              {subjectSlotPicking && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setSubjectSlotPicking(null); setSlotPickerAssets([]); setSlotPickerFolders([]); setSelectedPickerIds(new Set()); }}>
                  <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-2xl mx-4 shadow-2xl max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-base font-bold text-white">
                        选择{subjectSlotPicking.slot === 'primary' ? '主图' : '副图'}
                      </h3>
                      <button onClick={() => { setSubjectSlotPicking(null); setSlotPickerAssets([]); setSlotPickerFolders([]); setSelectedPickerIds(new Set()); }} className="text-zinc-500 hover:text-white transition"><X className="w-5 h-5" /></button>
                    </div>
                    {/* Picker breadcrumb */}
                    <div className="flex items-center gap-1.5 text-sm text-zinc-500 mb-3 pb-2 border-b border-white/5">
                      <button type="button" onClick={() => { void loadSlotPickerData('image', null); }} className={`wb-asset-library-crumb hover:text-white transition ${slotPickerFolderId === null ? 'text-white' : ''}`}>{t.assets_root}</button>
                      {slotPickerBreadcrumb.map(f => (
                        <div key={f.id} className="flex items-center gap-1.5">
                          <span>/</span>
                          <button type="button" onClick={() => { void loadSlotPickerData('image', f.id); }} className={`wb-asset-library-crumb hover:text-white transition truncate max-w-[120px] ${slotPickerFolderId === f.id ? 'text-white' : ''}`}>{f.name}</button>
                        </div>
                      ))}
                    </div>
                    {slotPickerLoading ? (
                      <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>
                    ) : slotPickerFolders.length === 0 && slotPickerAssets.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                        <p className="text-sm">当前目录为空</p>
                        <p className="text-xs mt-1 opacity-70">请在图片/虚拟模特分类中上传素材</p>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto space-y-2">
                        {slotPickerFolders.map((pf) => (
                          <button
                            key={`pf-${pf.id}`}
                            onClick={() => void loadSlotPickerData('image', pf.id)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 border border-white/5 hover:border-orange-500/30 transition text-left"
                          >
                            <div className="w-7 h-7 rounded bg-orange-500/15 flex items-center justify-center shrink-0">
                              <Folder className="w-3.5 h-3.5 text-orange-400" />
                            </div>
                            <span className="text-xs font-bold text-zinc-300 truncate flex-1">{pf.name}</span>
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                          </button>
                        ))}
                        {slotPickerAssets.length > 0 && (
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 pt-1">
                            {slotPickerAssets.map((asset) => {
                              const isSelected = selectedPickerIds.has(asset.id);
                              return (
                                <button
                                  key={asset.id}
                                  onClick={() => {
                                    if (subjectSlotPicking.slot === 'primary') {
                                      // single select for primary
                                      setSelectedPickerIds(new Set([asset.id]));
                                    } else {
                                      togglePickerAsset(asset.id);
                                    }
                                  }}
                                  className={`group relative bg-zinc-800 rounded-lg overflow-hidden border-2 transition text-left ${isSelected ? 'border-orange-500 ring-1 ring-orange-500/30' : 'border-transparent hover:border-orange-500/40'}`}
                                >
                                  <div className={`absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full flex items-center justify-center transition ${isSelected ? 'bg-orange-500 text-white' : 'bg-black/40 text-transparent group-hover:text-zinc-400'}`}>
                                    <CheckCircle className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="aspect-square bg-zinc-900 flex items-center justify-center">
                                    {asset.thumbnail || asset.file_url ? (
                                      <img src={asset.thumbnail || asset.file_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <Layers3 className="w-6 h-6 text-zinc-600" />
                                    )}
                                  </div>
                                  <div className="p-1.5">
                                    <div className="text-[10px] text-zinc-300 truncate">{asset.name}</div>
                                    <div className="text-[9px] text-zinc-500">{asset.size}</div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {selectedPickerIds.size > 0 && (
                      <div className="flex items-center justify-between pt-4 mt-3 border-t border-white/5">
                        <span className="text-xs text-zinc-400">已选 {selectedPickerIds.size} 项</span>
                        <button
                          onClick={() => void handleConfirmSubjectPickerSelection()}
                          className="px-5 py-2 text-xs font-bold bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
                        >
                          确认选择
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
          <>

           {/* Breadcrumb */}
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2 text-sm text-zinc-500 min-w-0">
                <button
                  onClick={() => setCurrentFolderId(null)}
                  onDragOver={dragOverRoot}
                  onDragEnter={dragOverRoot}
                  onDragLeave={() => setIsDragOverRoot(false)}
                  onDrop={(e) => dropMoveTo(null, e)}
                  className={`wb-asset-library-crumb hover:text-white ${currentFolderId === null ? 'text-white' : ''} ${draggingAsset && isDragOverRoot ? 'text-white' : ''}`}
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
                      className={`wb-asset-library-crumb hover:text-white truncate ${currentFolderId === folder.id ? 'text-white' : ''} ${draggingAsset && dragOverFolderId === folder.id ? 'text-white underline decoration-orange-500/80' : ''}`}
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
                    type="button"
                    onClick={() => setShowOnlyFavorites((prev) => !prev)}
                    title={showOnlyFavorites ? ((t as any).assets_show_all || '显示全部') : ((t as any).assets_show_favorites_only || '只看收藏')}
                    className={`w-9 h-9 rounded-lg border transition flex items-center justify-center ${showOnlyFavorites ? 'border-yellow-500/60 bg-yellow-500/15 text-yellow-200' : 'border-white/10 bg-zinc-800 text-zinc-200 hover:bg-zinc-700'}`}
                  >
                    <Heart className={`w-4 h-4 ${showOnlyFavorites ? 'fill-current' : ''}`} />
                  </button>
                  {!isListOnlyTab && (
                  <div className="flex rounded-lg border border-white/10 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setAssetViewLayout('grid')}
                      title={(t as any).assets_view_grid || '网格视图'}
                      className={`w-9 h-9 flex items-center justify-center transition ${assetViewLayout === 'grid' ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssetViewLayout('list')}
                      title={(t as any).assets_view_list || '列表视图'}
                      className={`w-9 h-9 flex items-center justify-center transition ${assetViewLayout === 'list' ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                  )}
                  <button
                    onClick={() => setIsSelectionMode(true)}
                    className="bg-zinc-800 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-zinc-700 transition flex items-center gap-2 shrink-0"
                  >
                    <CheckCircle className="w-4 h-4" /> {t.assets_select}
                  </button>
                  {activeAssetTab === 'script' && (
                    <button
                      onClick={() => setIsNewScriptDialogOpen(true)}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 transition shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t.assets_btn_new_script || '新建脚本'}
                    </button>
                  )}
                  {activeAssetTab === 'model' && (
                    <button
                      onClick={() => { setShowSeedanceBrowser(true); void loadSeedanceOptions(); void loadSeedanceCharacters(); }}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t.assets_add_from_model_library || '从模特库添加'}
                    </button>
                  )}
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
                    onClick={isAllVisibleSelected ? deselectAllVisible : selectAllVisible}
                    disabled={visibleAssets.length === 0 && visibleFolders.length === 0}
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
                  {showOnlyFavorites ? (
                    <button
                      onClick={async () => {
                        if (selectedCount === 0) return;
                        const assetIds = Array.from(selectedAssetIds);
                        const folderIds = Array.from(selectedFolderIds);
                        await Promise.allSettled([
                          ...assetIds.map(id => assetsApi.toggleFavorite(id)),
                          ...folderIds.map(id => assetsApi.toggleFolderFavorite(id)),
                        ]);
                        await loadData();
                        exitSelectionMode();
                      }}
                      disabled={selectedCount === 0}
                      className="bg-yellow-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-yellow-500 transition disabled:opacity-50"
                    >
                      {'移除收藏'}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (selectedCount === 0) return;
                        openConfirmModal({
                          title: t.assets_confirm_delete_asset,
                          message: `${selectedCount} ${t.assets_items}\n\n${t.assets_confirm_body_irreversible}`,
                          danger: true,
                          onConfirm: async () => {
                            const assetIds = Array.from(selectedAssetIds);
                            const folderIds = Array.from(selectedFolderIds);
                            const results = await Promise.allSettled([
                              ...folderIds.map(id => assetsApi.deleteFolder(id)),
                              ...assetIds.map(id => deleteAssetById(id)),
                            ]);
                            const failed = results.filter(r => r.status === 'rejected');
                            if (failed.length > 0) openInfo((t as any).assets_delete_failed || 'Failed to delete some assets', `Failed to delete ${failed.length} items`);
                            await loadData();
                            exitSelectionMode();
                          }
                        });
                      }}
                      disabled={selectedCount === 0}
                      className="bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-red-500 transition disabled:opacity-50"
                    >
                      {t.assets_delete}
                    </button>
                  )}
                  <button
                    onClick={exitSelectionMode}
                    className="bg-zinc-800 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-zinc-700 transition"
                  >
                    {t.assets_done}
                  </button>
                </div>
              </div>
            )}

           <div className="flex-1 overflow-y-auto custom-scroll pt-3 pb-2 px-0.5">
             {isLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div> : (
                <div className={assetViewLayout === 'list' ? 'flex flex-col gap-2' : 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-5'}>
                   {/* Folders */}
                   {visibleFolders.map(folder => {
                      const summary = folderSummaryById.get(folder.id) || { assetCount: 0, subfolderCount: 0, previewAssets: [], previewFolderNames: [] };
                      const firstVisualAsset = summary.previewAssets.find((a) => a.media_kind === 'image' || a.media_kind === 'video');
                      const coverSrc = folder.cover_url
                        ? getDisplayUrl(folder.cover_url)
                        : firstVisualAsset
                          ? (firstVisualAsset.media_kind === 'video' ? getDisplayUrl(firstVisualAsset.file_url) : getDisplayUrl(firstVisualAsset.thumbnail || firstVisualAsset.file_url))
                          : '';

                      /* ---- LIST VIEW folder row ---- */
                      if (assetViewLayout === 'list') {
                        const isFolderSelected = selectedFolderIds.has(folder.id);
                        return (
                          <div
                            key={folder.id}
                            onClick={() => isSelectionMode ? toggleFolderSelection(folder.id) : setCurrentFolderId(folder.id)}
                            onDragOver={(e) => !isSelectionMode && dragOverFolder(folder.id, e)}
                            onDragEnter={(e) => !isSelectionMode && dragOverFolder(folder.id, e)}
                            onDragLeave={() => { if (dragOverFolderId === folder.id) setDragOverFolderId(null); }}
                            onDrop={(e) => !isSelectionMode && dropMoveTo(folder.id, e)}
                            className={`glass-card rounded-xl p-2 group relative flex items-center gap-3 h-16 cursor-pointer hover:bg-zinc-800/50 transition border-l-4 ${
                              isSelectionMode && isFolderSelected ? 'border-l-blue-500 bg-blue-500/10' : 'border-l-orange-500/60'
                            } ${
                              draggingAsset ? 'border-zinc-700/80' : ''
                            } ${draggingAsset && dragOverFolderId === folder.id ? 'ring-2 ring-orange-500/70' : ''}`}
                          >
                            {isSelectionMode && (
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isFolderSelected ? 'bg-blue-500 border-blue-500' : 'border-zinc-500'}`}>
                                {isFolderSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                            )}
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0 flex items-center justify-center relative">
                              {coverSrc ? (
                                <>
                                  <img src={coverSrc} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                  <div className="absolute bottom-0 right-0 w-4 h-4 rounded-tl bg-black/60 flex items-center justify-center"><Folder className="w-2.5 h-2.5 text-orange-400" /></div>
                                </>
                              ) : (
                                <Folder className="w-5 h-5 text-orange-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-zinc-200 truncate">{folder.name}</div>
                              <div className="text-[11px] text-zinc-500">
                                {summary.assetCount} {(t as any).assets_folder_summary_assets || '素材'} · {summary.subfolderCount} {(t as any).assets_folder_summary_subfolders || '子文件夹'}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                              <button onClick={(e) => { e.stopPropagation(); void handleToggleFolderFavorite(folder); }} className={`w-7 h-7 rounded-full flex items-center justify-center ${folder.is_favorited ? 'bg-yellow-500/80 text-white' : 'bg-zinc-700 text-zinc-400 hover:text-white'}`}><Heart className={`w-3.5 h-3.5 ${folder.is_favorited ? 'fill-current' : ''}`} /></button>
                              <button onClick={(e) => { e.stopPropagation(); handleRenameFolder(folder); }} className="w-7 h-7 rounded-full bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={(e) => { e.stopPropagation(); openConfirmModal({ title: t.assets_confirm_delete_folder, message: `${folder.name}\n\n${t.assets_confirm_body_irreversible}`, danger: true, onConfirm: () => handleDeleteFolder(folder) }); }} className="w-7 h-7 rounded-full bg-zinc-700 text-red-400 hover:text-red-300 flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
                            </div>
                            <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
                          </div>
                        );
                      }

                      /* ---- GRID VIEW folder card ---- */
                      const isFolderSelectedGrid = selectedFolderIds.has(folder.id);
                      return (
                      <div
                        key={folder.id}
                        onClick={() => isSelectionMode ? toggleFolderSelection(folder.id) : setCurrentFolderId(folder.id)}
                        onDragOver={(e) => !isSelectionMode && dragOverFolder(folder.id, e)}
                        onDragEnter={(e) => !isSelectionMode && dragOverFolder(folder.id, e)}
                        onDragLeave={() => { if (dragOverFolderId === folder.id) setDragOverFolderId(null); }}
                        onDrop={(e) => !isSelectionMode && dropMoveTo(folder.id, e)}
                        className={`glass-card rounded-2xl aspect-[3/4] border-2 cursor-pointer transition group relative overflow-hidden ${
                          isSelectionMode && isFolderSelectedGrid ? 'border-blue-500 bg-blue-500/10' : (
                          draggingAsset ? 'border-zinc-700/80' : 'border-orange-500/30 hover:border-orange-500/60 hover:bg-zinc-900/50')
                        } ${
                          draggingAsset && dragOverFolderId === folder.id ? 'ring-2 ring-orange-500/70 scale-[1.02] bg-zinc-900/50' : ''
                        }`}
                      >
                         {/* Selection checkbox */}
                         {isSelectionMode && (
                           <div className="absolute top-2 left-2 z-30">
                             <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isFolderSelectedGrid ? 'bg-blue-500 border-blue-500' : 'border-zinc-400 bg-black/30'}`}>
                               {isFolderSelectedGrid && <Check className="w-3 h-3 text-white" />}
                             </div>
                           </div>
                         )}
                         {/* Folder badge */}
                         <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-lg px-2 py-1">
                           <Folder className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                           <span className="text-[11px] leading-tight text-orange-300 font-bold">{(t as any).assets_folder_badge || '文件夹'}</span>
                         </div>
                         {/* Top-right actions */}
                         <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
                           <button onClick={(e) => { e.stopPropagation(); void handleToggleFolderFavorite(folder); }} className={`w-7 h-7 rounded-full flex items-center justify-center transition ${folder.is_favorited ? 'bg-yellow-500/80 text-white' : 'bg-black/30 text-zinc-300 opacity-0 group-hover:opacity-100 hover:bg-black/50'}`}><Heart className={`w-3.5 h-3.5 ${folder.is_favorited ? 'fill-current' : ''}`} /></button>
                           <button onClick={(e) => { e.stopPropagation(); setOpenFolderMenuId(prev => (prev === folder.id ? null : folder.id)); }} className="w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-zinc-300 hover:text-white opacity-0 group-hover:opacity-100 transition">...</button>
                         </div>
                         {openFolderMenuId === folder.id && (
                             <div onClick={(e) => e.stopPropagation()} className="absolute top-10 right-2 bg-zinc-900/90 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden text-xs z-50 min-w-[140px]">
                                 <button className="w-full text-left px-3 py-2 hover:bg-white/5 text-zinc-200" onClick={() => handleRenameFolder(folder)}>{t.assets_folder_menu_rename}</button>
                                 <button className="w-full text-left px-3 py-2 hover:bg-white/5 text-zinc-200" onClick={() => { setOpenFolderMenuId(null); void openFolderMoveDialog(folder); }}>{t.assets_move_asset}</button>
                                 <button className="w-full text-left px-3 py-2 hover:bg-white/5 text-red-300" onClick={() => { setOpenFolderMenuId(null); openConfirmModal({ title: t.assets_confirm_delete_folder, message: `${folder.name}\n\n${t.assets_confirm_body_irreversible}`, danger: true, onConfirm: () => handleDeleteFolder(folder) }); }}>{t.assets_folder_menu_delete}</button>
                             </div>
                         )}
                         {/* Full-bleed cover / preview image */}
                         {coverSrc ? (
                           <div className="absolute inset-0">
                             {(firstVisualAsset?.media_kind === 'video' && !folder.cover_url) ? (
                               <video src={coverSrc} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                             ) : (
                               <img src={coverSrc} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                             )}
                             <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                           </div>
                         ) : (
                           <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/60">
                             <Folder className="w-12 h-12 text-zinc-700 group-hover:text-orange-500/50 transition" />
                           </div>
                         )}
                         {/* Bottom info overlay */}
                         <div className="absolute bottom-0 inset-x-0 p-2.5 z-10">
                           <div className="text-sm font-bold text-white truncate drop-shadow-lg">{folder.name}</div>
                           <div className="mt-0.5 text-[10px] text-zinc-300/80 truncate">
                             {summary.assetCount} {(t as any).assets_folder_summary_assets || '素材'} · {summary.subfolderCount} {(t as any).assets_folder_summary_subfolders || '子文件夹'}
                           </div>
                         </div>
                      </div>
                      );
                    })}
                    
                    {/* Assets */}
                    {visibleAssets.map(asset => {
                      const isSelected = selectedAssetIds.has(asset.id);
                      const subjectOtherViewCount = getAssetSubjectOtherViewIds(asset).length;
                      if (assetViewLayout === 'list') {
                        return (
                          <div
                            key={asset.id}
                            className={`glass-card rounded-xl p-2 group relative flex items-center gap-3 h-16 ${draggingAsset?.id === asset.id ? 'opacity-60' : ''} ${isSelectionMode && isSelected ? 'ring-2 ring-orange-500/70' : ''} cursor-pointer hover:bg-zinc-800/50 transition`}
                            draggable={!isSelectionMode && renamingAssetId !== asset.id}
                            onDragStart={isSelectionMode ? undefined : (e) => { if (renamingAssetId || Date.now() < suppressDragUntilRef.current) { e.preventDefault(); return; } beginDragAsset(asset, e); }}
                            onDragEnd={isSelectionMode ? undefined : endDragAsset}
                            onClick={() => {
                              if (isSelectionMode) { toggleAssetSelection(asset.id); return; }
                              setAssetPreview(asset);
                              setAssetDescriptionDraft(getAssetSubjectDescription(asset));
                              setIsAssetDescriptionSaved(true);
                              setAssetDescriptionSavedAt(String(asset.created_at || '').slice(0, 10));
                              setIsAssetPreviewOpen(true);
                            }}
                          >
                            {isSelectionMode && (
                              <button onClick={(e) => { e.stopPropagation(); toggleAssetSelection(asset.id); }} className="shrink-0 w-7 h-7 rounded-full bg-black/30 flex items-center justify-center">
                                {isSelected ? <CheckCircle className="w-4 h-4 text-orange-400" /> : <Circle className="w-4 h-4 text-white/60" />}
                              </button>
                            )}
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0 relative">
                              {asset.media_kind === 'audio' ? <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-500/20 to-zinc-900"><Music className="w-5 h-5 text-orange-400" /></div> :
                               asset.media_kind === 'document' ? <div className="w-full h-full flex items-center justify-center"><FileText className="w-5 h-5 text-sky-300" /></div> :
                               asset.media_kind === 'video' && asset.file_url ? <video src={getDisplayUrl(asset.file_url) || undefined} className="w-full h-full object-cover" muted preload="metadata" /> :
                               asset.file_url ? <img src={getDisplayUrl(asset.thumbnail || asset.file_url) || ASSET_PLACEHOLDER_DATA_URL} className="w-full h-full object-cover" alt={asset.name} onError={(e) => { (e.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL; }} /> :
                               <div className="w-full h-full flex items-center justify-center text-zinc-600 text-[10px]">N/A</div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              {renamingAssetId === asset.id ? (
                                <input
                                  ref={renameInputRef}
                                  value={renameDraft}
                                  disabled={isSavingRename}
                                  className="w-full bg-black/40 text-zinc-100 text-xs font-bold rounded-md border border-white/10 px-2 py-1 focus:outline-none focus:border-orange-500/50"
                                  onChange={(e) => setRenameDraft(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  onBlur={() => { if (!renameIgnoreBlurRef.current) void commitRenameAsset(asset); }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void commitRenameAsset(asset); } if (e.key === 'Escape') { e.preventDefault(); cancelRenameAsset(); } }}
                                />
                              ) : (
                                <div className="text-xs font-bold text-zinc-200 truncate">{asset.name}</div>
                              )}
                              <div className="text-[11px] text-zinc-500">{asset.size} · {asset.created_at}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                              <button onClick={(e) => { e.stopPropagation(); void handleToggleFavorite(asset); }} className={`w-7 h-7 rounded-full flex items-center justify-center ${asset.is_favorited ? 'bg-yellow-500/80 text-white' : 'bg-zinc-700 text-zinc-400 hover:text-white'}`} title={asset.is_favorited ? '取消收藏' : '收藏'}><Heart className={`w-3.5 h-3.5 ${asset.is_favorited ? 'fill-current' : ''}`} /></button>
                              <button onClick={(e) => { e.stopPropagation(); beginRenameAsset(asset); }} className="w-7 h-7 rounded-full bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center" title={t.assets_folder_menu_rename}><Pencil className="w-3.5 h-3.5" /></button>
                              {asset.media_kind === 'image' && <button onClick={(e) => { e.stopPropagation(); addAssetDirectlyToTransferStation(asset); }} className="w-7 h-7 rounded-full bg-sky-700 text-sky-300 hover:text-white flex items-center justify-center" title={t.wb_transfer_station_add_btn || '加入中转站'}><ArrowUpRight className="w-3.5 h-3.5" /></button>}
                              <button onClick={(e) => { e.stopPropagation(); handleDownloadAsset(asset); }} className="w-7 h-7 rounded-full bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center" title="下载"><Download className="w-3.5 h-3.5" /></button>
                              <button onClick={(e) => { e.stopPropagation(); openSingleMoveDialog(asset); }} className="w-7 h-7 rounded-full bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center" title={t.assets_move_asset || '移动'}><Folder className="w-3.5 h-3.5" /></button>
                              {currentFolderId && (asset.media_kind === 'image' || asset.media_kind === 'video') && <button onClick={(e) => { e.stopPropagation(); void assetsApi.setFolderCover(currentFolderId, asset.id).then(() => loadData()); }} className="w-7 h-7 rounded-full bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center" title={(t as any).assets_set_as_cover || '设为文件夹封面'}><ImageIcon className="w-3.5 h-3.5" /></button>}
                              <button onClick={(e) => { e.stopPropagation(); openConfirmModal({ title: t.assets_confirm_delete_asset, message: `${asset.name}\n\n${t.assets_confirm_body_irreversible}`, danger: true, onConfirm: () => deleteAssetById(asset.id) }); }} className="w-7 h-7 rounded-full bg-zinc-700 text-red-400 hover:text-red-300 flex items-center justify-center" title={t.assets_delete || '删除'}><X className="w-3.5 h-3.5" /></button>
                            </div>
                            {!isSelectionMode && asset.is_favorited && <Heart className="w-3 h-3 text-yellow-400 fill-current shrink-0" />}
                          </div>
                        );
                      }
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
                          {!isSelectionMode && (
                            <button
                              onClick={(e) => { e.stopPropagation(); void handleToggleFavorite(asset); }}
                              className={`absolute top-2 right-2 z-20 w-7 h-7 rounded-full flex items-center justify-center transition ${asset.is_favorited ? 'bg-yellow-500/80 text-white' : 'bg-black/40 text-white/70 opacity-0 group-hover:opacity-100 hover:bg-black/60'}`}
                              aria-label="Toggle favorite"
                            >
                              <Heart className={`w-3.5 h-3.5 ${asset.is_favorited ? 'fill-current' : ''}`} />
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
                            ) : asset.media_kind === 'document' ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-900/90 text-zinc-200 px-3 text-center">
                                <FileText className="w-7 h-7 text-sky-300" />
                                <div className="text-[11px] font-bold truncate w-full">{asset.name}</div>
                              </div>
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
                                {asset.media_kind === 'image' && <button onClick={(e) => { e.stopPropagation(); addAssetDirectlyToTransferStation(asset); }} className="w-full bg-sky-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-sky-500 transition shadow-lg">{t.wb_transfer_station_add_btn || '加入中转站'}</button>}
                                <button onClick={(e) => { e.stopPropagation(); handleDownloadAsset(asset); }} className="w-full bg-zinc-700 text-white py-1.5 rounded-lg text-xs font-bold hover:bg-zinc-600 transition">下载</button>
                                <div className="flex w-full gap-2">
                                  <button onClick={(e) => { e.stopPropagation(); openSingleMoveDialog(asset); }} className="flex-1 bg-zinc-700 text-white py-2 rounded-lg text-xs font-bold hover:bg-zinc-600 transition">{t.assets_move_asset}</button>
                                  <button onClick={(e) => { e.stopPropagation(); openConfirmModal({ title: t.assets_confirm_delete_asset, message: `${asset.name}\n\n${t.assets_confirm_body_irreversible}`, danger: true, onConfirm: () => deleteAssetById(asset.id) }); }} className="flex-1 bg-zinc-800 text-red-400 py-2 rounded-lg text-xs font-bold hover:bg-red-500 hover:text-white transition">{t.assets_delete}</button>
                                </div>
                                {currentFolderId && (asset.media_kind === 'image' || asset.media_kind === 'video') && (
                                  <button onClick={(e) => { e.stopPropagation(); void assetsApi.setFolderCover(currentFolderId, asset.id).then(() => loadData()); }} className="w-full bg-zinc-800 text-zinc-300 py-1.5 rounded-lg text-[11px] hover:bg-zinc-700 transition">{(t as any).assets_set_as_cover || '设为文件夹封面'}</button>
                                )}
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
          )}
          </>
          ) : activeAssetTab === 'model' ? (
            /* ==================== Plaza → Virtual Models (Seedance full-page) ==================== */
            <>
              {/* Single scrollable container: filters + grid */}
              <div ref={seedanceScrollRef} className="flex-1 overflow-y-auto custom-scroll">
              {/* Search Mode Tabs */}
              <div className="flex items-center gap-1 mb-3">
                {(['default', 'fuzzy'] as SeedanceSearchMode[]).map((mode) => {
                  const labels: Record<SeedanceSearchMode, string> = {
                    default: t.assets_seedance_tab_default || '条件查询',
                    fuzzy: t.assets_seedance_tab_fuzzy || '模糊查询',
                  };
                  return (
                    <button
                      key={mode}
                      onClick={() => {
                        setSeedanceSearchMode(mode);
                        const fresh: SeedanceCharacterFilters = { page_size: 24, search_mode: mode, page: 1 };
                        setSeedanceFilters(fresh);
                        setSeedanceAdvancedOpen(false);
                        setSeedanceCharacters([]);
                        setSeedanceTotalCount(0);
                        setSeedanceHasMore(false);
                        if (mode === 'default') {
                          void loadSeedanceCharacters(fresh);
                        }
                      }}
                      className={`px-3 py-1.5 text-xs rounded-t-lg border border-b-0 transition ${
                        seedanceSearchMode === mode
                          ? 'bg-zinc-800 text-orange-400 border-white/10 font-bold'
                          : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
                      }`}
                    >
                      {labels[mode]}
                    </button>
                  );
                })}
                <span className="text-[10px] text-zinc-500 ml-auto">{seedanceTotalCount} {t.assets_seedance_total || '位模特'}</span>
              </div>

              {/* Filters */}
              <div className="border-b border-white/5 mb-4">
                {seedanceSearchMode === 'fuzzy' ? (
                  <div className="pb-3 space-y-3">
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1 font-medium">{t.assets_seedance_fuzzy_appearance_label || '外貌特征'}</label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          value={seedanceFilters.search_appearance || ''}
                          onChange={(e) => setSeedanceFilters((prev) => ({ ...prev, search_appearance: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { setSeedanceCharacters([]); void loadSeedanceCharacters(seedanceFilters); } }}
                          placeholder={t.assets_seedance_fuzzy_appearance_placeholder || '如 "大眼 双眼皮" 或 "厚唇 暖白皮 卷发"'}
                          className="w-full bg-zinc-800 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-orange-500/50"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-600 mt-1 leading-relaxed">
                        {t.assets_seedance_fuzzy_appearance_hint || '空格分隔，取交集。请输入数据库中的精确标签词。'}
                      </p>
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        <span className="text-[10px] text-zinc-500">{t.assets_seedance_fuzzy_try || '试试：'}</span>
                        {(t.assets_seedance_fuzzy_appearance_chips || '大眼,双眼皮,厚唇,暖白皮,卷发,络腮胡,高大魁梧,圆形脸').split(',').map((chip) => (
                          <button
                            key={chip}
                            onClick={() => {
                              const prev = seedanceFilters.search_appearance || '';
                              const next = prev ? `${prev} ${chip}` : chip;
                              const f = { ...seedanceFilters, search_appearance: next, page: 1 };
                              setSeedanceFilters(f);
                              setSeedanceCharacters([]);
                              void loadSeedanceCharacters(f);
                            }}
                            className="px-1.5 py-0.5 text-[10px] bg-orange-500/10 text-orange-400 rounded hover:bg-orange-500/25 transition"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1 font-medium">{t.assets_seedance_fuzzy_scene_label || '经历 / 场景'}</label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          value={seedanceFilters.search_scene || ''}
                          onChange={(e) => setSeedanceFilters((prev) => ({ ...prev, search_scene: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { setSeedanceCharacters([]); void loadSeedanceCharacters(seedanceFilters); } }}
                          placeholder={t.assets_seedance_fuzzy_scene_placeholder || '如 "美甲师" 或 "外卖 夜市"'}
                          className="w-full bg-zinc-800 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-orange-500/50"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-600 mt-1 leading-relaxed">
                        {t.assets_seedance_fuzzy_scene_hint || '搜索人物故事描述。不支持：明星名字、抽象比喻。'}
                      </p>
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        <span className="text-[10px] text-zinc-500">{t.assets_seedance_fuzzy_try || '试试：'}</span>
                        {(t.assets_seedance_fuzzy_scene_chips || '美甲师,歌手,外卖,夜市,咖啡馆,录音棚,追剧,露营').split(',').map((chip) => (
                          <button
                            key={chip}
                            onClick={() => {
                              const prev = seedanceFilters.search_scene || '';
                              const next = prev ? `${prev} ${chip}` : chip;
                              const f = { ...seedanceFilters, search_scene: next, page: 1 };
                              setSeedanceFilters(f);
                              setSeedanceCharacters([]);
                              void loadSeedanceCharacters(f);
                            }}
                            className="px-1.5 py-0.5 text-[10px] bg-purple-500/10 text-purple-400 rounded hover:bg-purple-500/25 transition"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="pb-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        value={seedanceFilters.gender || ''}
                        onChange={(e) => {
                          const f = { ...seedanceFilters, gender: e.target.value as any || undefined, page: 1 };
                          setSeedanceFilters(f);
                          setSeedanceCharacters([]);
                          void loadSeedanceCharacters(f);
                        }}
                        className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                      >
                        <option value="">{t.assets_seedance_filter_all_gender || '全部性别'}</option>
                        <option value="Male">{t.assets_seedance_filter_male || '男'}</option>
                        <option value="Female">{t.assets_seedance_filter_female || '女'}</option>
                      </select>
                      <div className="flex items-center gap-1 text-xs text-zinc-400">
                        <span>{t.assets_seedance_filter_age || '年龄'}:</span>
                        <input
                          type="number" min={0} max={100}
                          value={seedanceFilters.age_min ?? ''}
                          onChange={(e) => {
                            const f = { ...seedanceFilters, age_min: e.target.value ? Number(e.target.value) : undefined, page: 1 };
                            setSeedanceFilters(f);
                          }}
                          onBlur={() => { setSeedanceCharacters([]); void loadSeedanceCharacters(seedanceFilters); }}
                          className="w-14 bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none"
                          placeholder="min"
                        />
                        <span>-</span>
                        <input
                          type="number" min={0} max={100}
                          value={seedanceFilters.age_max ?? ''}
                          onChange={(e) => {
                            const f = { ...seedanceFilters, age_max: e.target.value ? Number(e.target.value) : undefined, page: 1 };
                            setSeedanceFilters(f);
                          }}
                          onBlur={() => { setSeedanceCharacters([]); void loadSeedanceCharacters(seedanceFilters); }}
                          className="w-14 bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none"
                          placeholder="max"
                        />
                      </div>
                      <select
                        value={seedanceFilters.race || ''}
                        onChange={(e) => {
                          const f = { ...seedanceFilters, race: e.target.value || undefined, page: 1 };
                          setSeedanceFilters(f);
                          setSeedanceCharacters([]);
                          void loadSeedanceCharacters(f);
                        }}
                        className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                      >
                        <option value="">{t.assets_seedance_filter_all_race || '全部人种'}</option>
                        {seedanceRaces.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <select
                        value={seedanceFilters.temperament || ''}
                        onChange={(e) => {
                          const f = { ...seedanceFilters, temperament: e.target.value || undefined, page: 1 };
                          setSeedanceFilters(f);
                          setSeedanceCharacters([]);
                          void loadSeedanceCharacters(f);
                        }}
                        className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                      >
                        <option value="">{t.assets_seedance_filter_all_temperament || '全部气质'}</option>
                        {seedanceTemperaments.map((tm) => <option key={tm} value={tm}>{tm}</option>)}
                      </select>
                    </div>
                    <button
                      onClick={() => setSeedanceAdvancedOpen(!seedanceAdvancedOpen)}
                      className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 mt-2 transition"
                    >
                      {seedanceAdvancedOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {t.assets_seedance_toggle_advanced || '高级筛选'}
                    </button>
                    {seedanceAdvancedOpen && (
                      <div className="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t border-white/5">
                        <select
                          value={seedanceFilters.country || ''}
                          onChange={(e) => {
                            const f = { ...seedanceFilters, country: e.target.value || undefined, page: 1 };
                            setSeedanceFilters(f);
                            setSeedanceCharacters([]);
                            void loadSeedanceCharacters(f);
                          }}
                          className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                        >
                          <option value="">{t.assets_seedance_filter_all_country || '全部国家'}</option>
                          {seedanceCountries.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select
                          value={seedanceFilters.ethnicity || ''}
                          onChange={(e) => {
                            const f = { ...seedanceFilters, ethnicity: e.target.value || undefined, page: 1 };
                            setSeedanceFilters(f);
                            setSeedanceCharacters([]);
                            void loadSeedanceCharacters(f);
                          }}
                          className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                        >
                          <option value="">{t.assets_seedance_filter_all_ethnicity || '全部民族'}</option>
                          {seedanceEthnicities.map((e) => <option key={e} value={e}>{e}</option>)}
                        </select>
                        <select
                          value={seedanceFilters.cultural_branch || ''}
                          onChange={(e) => {
                            const f = { ...seedanceFilters, cultural_branch: e.target.value || undefined, page: 1 };
                            setSeedanceFilters(f);
                            setSeedanceCharacters([]);
                            void loadSeedanceCharacters(f);
                          }}
                          className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                        >
                          <option value="">{t.assets_seedance_filter_all_cultural_branch || '全部文化分支'}</option>
                          {seedanceCulturalBranches.map((cb) => <option key={cb} value={cb}>{cb}</option>)}
                        </select>
                        <select
                          value={seedanceFilters.skin_tone || ''}
                          onChange={(e) => {
                            const f = { ...seedanceFilters, skin_tone: e.target.value || undefined, page: 1 };
                            setSeedanceFilters(f);
                            setSeedanceCharacters([]);
                            void loadSeedanceCharacters(f);
                          }}
                          className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                        >
                          <option value="">{t.assets_seedance_filter_all_skin_tone || '全部肤色'}</option>
                          {seedanceSkinTones.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                        <select
                          value={seedanceFilters.occupation || ''}
                          onChange={(e) => {
                            const f = { ...seedanceFilters, occupation: e.target.value || undefined, page: 1 };
                            setSeedanceFilters(f);
                            setSeedanceCharacters([]);
                            void loadSeedanceCharacters(f);
                          }}
                          className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                        >
                          <option value="">{t.assets_seedance_filter_all_occupation || '全部职业'}</option>
                          {seedanceOccupations.map((oc) => <option key={oc} value={oc}>{oc}</option>)}
                        </select>
                        <div className="flex items-center gap-1 text-xs text-zinc-400">
                          <span>{t.assets_seedance_filter_age_exact || '精确年龄'}:</span>
                          <input
                            type="number" min={0} max={100}
                            value={seedanceFilters.age_exact ?? ''}
                            onChange={(e) => {
                              const f = { ...seedanceFilters, age_exact: e.target.value ? Number(e.target.value) : undefined, page: 1 };
                              setSeedanceFilters(f);
                            }}
                            onBlur={() => { setSeedanceCharacters([]); void loadSeedanceCharacters(seedanceFilters); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { setSeedanceCharacters([]); void loadSeedanceCharacters(seedanceFilters); } }}
                            className="w-14 bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none"
                            placeholder="e.g. 25"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Seedance Grid with infinite scroll */}
              <div>
                {seedanceCharacters.length === 0 && seedanceLoading ? (
                  <div className="h-56 flex items-center justify-center text-zinc-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t.wb_debug_loading || 'Loading...'}
                  </div>
                ) : seedanceCharacters.length === 0 ? (
                  <div className="h-56 flex flex-col items-center justify-center text-zinc-500">
                    <p className="text-sm">{t.assets_seedance_empty || '未找到匹配的模特'}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                    {seedanceCharacters.map((char) => (
                      <div
                        key={char.id}
                        className="group relative bg-zinc-900 rounded-xl overflow-hidden border border-white/5 hover:border-purple-500/40 transition cursor-pointer"
                        onClick={async () => {
                          try {
                            await seedanceApi.collectCharacter(char.id, currentFolderId);
                            void loadData();
                            openInfo(t.assets_confirm_title || 'OK', t.assets_seedance_collected || `已添加「${char.title}」到虚拟模特`);
                          } catch (err) {
                            openInfo(t.assets_confirm_title || 'Error', String(err instanceof Error ? err.message : err));
                          }
                        }}
                      >
                        <div className="aspect-[3/4] bg-zinc-800 overflow-hidden">
                          <img
                            src={char.image_url}
                            alt={char.title}
                            className="w-full h-full object-cover transition-opacity duration-300"
                            loading="lazy"
                            style={{ opacity: 0 }}
                            onLoad={(e) => { (e.target as HTMLImageElement).style.opacity = '1'; }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                        <div className="p-1.5">
                          <div className="text-[10px] font-bold text-zinc-200 truncate">{char.title || `${char.country} ${char.gender}`}</div>
                          <div className="text-[9px] text-zinc-500 truncate">{char.gender === 'Male' ? '男' : '女'} · {char.age}{t.assets_seedance_age_unit || '岁'} · {char.country}</div>
                          {char.occupation && <div className="text-[9px] text-zinc-600 truncate">{char.occupation}</div>}
                          {char.temperament && <div className="text-[9px] text-zinc-600 truncate">{char.temperament}</div>}
                        </div>
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <span className="bg-purple-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg">
                            <Plus className="w-3 h-3 inline mr-1" />{t.assets_seedance_add || '添加'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Infinite scroll sentinel */}
                {seedanceHasMore && (
                  <div ref={seedanceSentinelRef} className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                  </div>
                )}
                {!seedanceHasMore && seedanceCharacters.length > 0 && (
                  <div className="text-center text-zinc-600 text-xs py-4">
                    {t.assets_seedance_no_more || '已加载全部模特'}
                  </div>
                )}
              </div>
              </div>
            </>
          ) : (
            /* ==================== Plaza → Other tabs (product/motion/audio/script) ==================== */
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
                  ) : assetPreview.media_kind === 'document' ? (
                    <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-black/20 p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <FileText className="w-6 h-6 text-green-400 shrink-0" />
                        <div className="text-sm text-zinc-200 break-words truncate">{assetPreview.name}</div>
                        <a
                          href={getDisplayUrl(assetPreview.file_url) || undefined}
                          download={assetPreview.name}
                          className="ml-auto inline-flex items-center rounded-lg border border-sky-500/50 bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-500/20 shrink-0"
                        >
                          <Download className="w-3.5 h-3.5 mr-1" /> 下载
                        </a>
                      </div>
                      {textPreviewLoading ? (
                        <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
                      ) : textPreviewContent != null ? (
                        <pre className="w-full max-h-[60vh] overflow-auto rounded-lg bg-zinc-950/80 border border-white/5 p-4 text-xs text-zinc-300 whitespace-pre-wrap break-words font-mono">{textPreviewContent}</pre>
                      ) : (
                        <div className="text-center text-xs text-zinc-500 py-6">无法加载文件内容</div>
                      )}
                    </div>
                  ) : (
                    <img
                      src={getDisplayUrl(assetPreview.file_url) || ASSET_PLACEHOLDER_DATA_URL}
                      alt={assetPreview.name}
                      className="block rounded-lg max-w-full max-h-[calc(100vh-10rem)] object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL; }}
                    />
                  )}
                </div>
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
                  <div className="mt-1 flex items-center gap-2 text-sm text-zinc-500 min-w-0">
                    <button type="button" onClick={() => setSubjectPickerFolderId(null)} className="wb-asset-library-crumb hover:text-white">
                      {t.assets_root}
                    </button>
                    {subjectPickerBreadcrumb.map((folder) => (
                      <React.Fragment key={folder.id}>
                        <span>/</span>
                        <button type="button" onClick={() => setSubjectPickerFolderId(folder.id)} className="wb-asset-library-crumb truncate hover:text-white">
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
                  onChange={(e) => setPlazaManageCategory(e.target.value as PlazaCategory)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-orange-500"
                >
                  {(['model', 'product', 'scene', 'motion', 'audio'] as PlazaCategory[]).map((cat) => (
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

        {/* 5. Seedance Virtual Model Browser Dialog */}
        {showSeedanceBrowser && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => setShowSeedanceBrowser(false)}>
            <div className="w-full max-w-5xl max-h-[85vh] glass-panel rounded-2xl border border-white/10 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <h3 className="text-base font-bold text-zinc-100">{t.assets_seedance_browser_title || '虚拟模特库'}</h3>
                <button className="text-zinc-400 hover:text-white" onClick={() => setShowSeedanceBrowser(false)}><X className="w-5 h-5" /></button>
              </div>

              {/* Search Mode Tabs: 默认查询 | 模糊查询 */}
              <div className="flex items-center gap-1 px-6 pt-3 pb-0">
                {(['default', 'fuzzy'] as SeedanceSearchMode[]).map((mode) => {
                  const labels: Record<SeedanceSearchMode, string> = {
                    default: t.assets_seedance_tab_default || '条件查询',
                    fuzzy: t.assets_seedance_tab_fuzzy || '模糊查询',
                  };
                  return (
                    <button
                      key={mode}
                      onClick={() => {
                        setSeedanceSearchMode(mode);
                        const fresh: SeedanceCharacterFilters = { page_size: 24, search_mode: mode, page: 1 };
                        setSeedanceFilters(fresh);
                        setSeedanceAdvancedOpen(false);
                        if (mode === 'default') {
                          void loadSeedanceCharacters(fresh);
                        } else {
                          // fuzzy tab: don't load until user enters search terms
                          setSeedanceCharacters([]);
                          setSeedanceTotalCount(0);
                        }
                      }}
                      className={`px-3 py-1.5 text-xs rounded-t-lg border border-b-0 transition ${
                        seedanceSearchMode === mode
                          ? 'bg-zinc-800 text-orange-400 border-white/10 font-bold'
                          : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
                      }`}
                    >
                      {labels[mode]}
                    </button>
                  );
                })}
                <span className="text-[10px] text-zinc-500 ml-auto">{seedanceTotalCount} {t.assets_seedance_total || '位模特'}</span>
              </div>

              {/* Filters */}
              <div className="border-b border-white/5">
                {seedanceSearchMode === 'fuzzy' ? (
                  /* ── Fuzzy mode: dual search boxes (appearance + scene) ── */
                  <div className="px-6 py-3 space-y-3">
                    {/* 外貌输入框 */}
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1 font-medium">{t.assets_seedance_fuzzy_appearance_label || '外貌特征'}</label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          value={seedanceFilters.search_appearance || ''}
                          onChange={(e) => setSeedanceFilters((prev) => ({ ...prev, search_appearance: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') void loadSeedanceCharacters(seedanceFilters); }}
                          placeholder={t.assets_seedance_fuzzy_appearance_placeholder || '如 "大眼 双眼皮" 或 "厚唇 暖白皮 卷发"'}
                          className="w-full bg-zinc-800 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-orange-500/50"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-600 mt-1 leading-relaxed">
                        {t.assets_seedance_fuzzy_appearance_hint || '空格分隔，取交集。请输入数据库中的精确标签词。'}
                      </p>
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        <span className="text-[10px] text-zinc-500">{t.assets_seedance_fuzzy_try || '试试：'}</span>
                        {(t.assets_seedance_fuzzy_appearance_chips || '大眼,双眼皮,厚唇,暖白皮,卷发,络腮胡,高大魁梧,圆形脸').split(',').map((chip) => (
                          <button
                            key={chip}
                            onClick={() => {
                              const prev = seedanceFilters.search_appearance || '';
                              const next = prev ? `${prev} ${chip}` : chip;
                              const f = { ...seedanceFilters, search_appearance: next };
                              setSeedanceFilters(f);
                              void loadSeedanceCharacters(f);
                            }}
                            className="px-1.5 py-0.5 text-[10px] bg-orange-500/10 text-orange-400 rounded hover:bg-orange-500/25 transition"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* 经历/场景输入框 */}
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1 font-medium">{t.assets_seedance_fuzzy_scene_label || '经历 / 场景'}</label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          value={seedanceFilters.search_scene || ''}
                          onChange={(e) => setSeedanceFilters((prev) => ({ ...prev, search_scene: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') void loadSeedanceCharacters(seedanceFilters); }}
                          placeholder={t.assets_seedance_fuzzy_scene_placeholder || '如 "美甲师" 或 "外卖 夜市"'}
                          className="w-full bg-zinc-800 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-orange-500/50"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-600 mt-1 leading-relaxed">
                        {t.assets_seedance_fuzzy_scene_hint || '搜索人物故事描述。不支持：明星名字、抽象比喻。'}
                      </p>
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        <span className="text-[10px] text-zinc-500">{t.assets_seedance_fuzzy_try || '试试：'}</span>
                        {(t.assets_seedance_fuzzy_scene_chips || '美甲师,歌手,外卖,夜市,咖啡馆,录音棚,追剧,露营').split(',').map((chip) => (
                          <button
                            key={chip}
                            onClick={() => {
                              const prev = seedanceFilters.search_scene || '';
                              const next = prev ? `${prev} ${chip}` : chip;
                              const f = { ...seedanceFilters, search_scene: next };
                              setSeedanceFilters(f);
                              void loadSeedanceCharacters(f);
                            }}
                            className="px-1.5 py-0.5 text-[10px] bg-purple-500/10 text-purple-400 rounded hover:bg-purple-500/25 transition"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Default mode: basic filters + collapsible advanced ── */
                  <div className="px-6 py-3">
                    {/* Basic filters row */}
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Gender */}
                      <select
                        value={seedanceFilters.gender || ''}
                        onChange={(e) => {
                          const f = { ...seedanceFilters, gender: e.target.value as any || undefined, page: 1 };
                          setSeedanceFilters(f);
                          void loadSeedanceCharacters(f);
                        }}
                        className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                      >
                        <option value="">{t.assets_seedance_filter_all_gender || '全部性别'}</option>
                        <option value="Male">{t.assets_seedance_filter_male || '男'}</option>
                        <option value="Female">{t.assets_seedance_filter_female || '女'}</option>
                      </select>

                      {/* Age range */}
                      <div className="flex items-center gap-1 text-xs text-zinc-400">
                        <span>{t.assets_seedance_filter_age || '年龄'}:</span>
                        <input
                          type="number" min={0} max={100}
                          value={seedanceFilters.age_min ?? ''}
                          onChange={(e) => {
                            const f = { ...seedanceFilters, age_min: e.target.value ? Number(e.target.value) : undefined, page: 1 };
                            setSeedanceFilters(f);
                          }}
                          onBlur={() => void loadSeedanceCharacters(seedanceFilters)}
                          className="w-14 bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none"
                          placeholder="min"
                        />
                        <span>-</span>
                        <input
                          type="number" min={0} max={100}
                          value={seedanceFilters.age_max ?? ''}
                          onChange={(e) => {
                            const f = { ...seedanceFilters, age_max: e.target.value ? Number(e.target.value) : undefined, page: 1 };
                            setSeedanceFilters(f);
                          }}
                          onBlur={() => void loadSeedanceCharacters(seedanceFilters)}
                          className="w-14 bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none"
                          placeholder="max"
                        />
                      </div>

                      {/* Race */}
                      <select
                        value={seedanceFilters.race || ''}
                        onChange={(e) => {
                          const f = { ...seedanceFilters, race: e.target.value || undefined, page: 1 };
                          setSeedanceFilters(f);
                          void loadSeedanceCharacters(f);
                        }}
                        className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                      >
                        <option value="">{t.assets_seedance_filter_all_race || '全部人种'}</option>
                        {seedanceRaces.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>

                      {/* Temperament */}
                      <select
                        value={seedanceFilters.temperament || ''}
                        onChange={(e) => {
                          const f = { ...seedanceFilters, temperament: e.target.value || undefined, page: 1 };
                          setSeedanceFilters(f);
                          void loadSeedanceCharacters(f);
                        }}
                        className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                      >
                        <option value="">{t.assets_seedance_filter_all_temperament || '全部气质'}</option>
                        {seedanceTemperaments.map((tm) => <option key={tm} value={tm}>{tm}</option>)}
                      </select>
                    </div>

                    {/* Expandable advanced section */}
                    <button
                      onClick={() => setSeedanceAdvancedOpen(!seedanceAdvancedOpen)}
                      className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 mt-2 transition"
                    >
                      {seedanceAdvancedOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {t.assets_seedance_toggle_advanced || '高级筛选'}
                    </button>

                    {seedanceAdvancedOpen && (
                      <div className="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t border-white/5">
                        {/* Country */}
                        <select
                          value={seedanceFilters.country || ''}
                          onChange={(e) => {
                            const f = { ...seedanceFilters, country: e.target.value || undefined, page: 1 };
                            setSeedanceFilters(f);
                            void loadSeedanceCharacters(f);
                          }}
                          className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                        >
                          <option value="">{t.assets_seedance_filter_all_country || '全部国家'}</option>
                          {seedanceCountries.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>

                        {/* Ethnicity */}
                        <select
                          value={seedanceFilters.ethnicity || ''}
                          onChange={(e) => {
                            const f = { ...seedanceFilters, ethnicity: e.target.value || undefined, page: 1 };
                            setSeedanceFilters(f);
                            void loadSeedanceCharacters(f);
                          }}
                          className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                        >
                          <option value="">{t.assets_seedance_filter_all_ethnicity || '全部民族'}</option>
                          {seedanceEthnicities.map((e) => <option key={e} value={e}>{e}</option>)}
                        </select>

                        {/* Cultural Branch */}
                        <select
                          value={seedanceFilters.cultural_branch || ''}
                          onChange={(e) => {
                            const f = { ...seedanceFilters, cultural_branch: e.target.value || undefined, page: 1 };
                            setSeedanceFilters(f);
                            void loadSeedanceCharacters(f);
                          }}
                          className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                        >
                          <option value="">{t.assets_seedance_filter_all_cultural_branch || '全部文化分支'}</option>
                          {seedanceCulturalBranches.map((cb) => <option key={cb} value={cb}>{cb}</option>)}
                        </select>

                        {/* Skin Tone */}
                        <select
                          value={seedanceFilters.skin_tone || ''}
                          onChange={(e) => {
                            const f = { ...seedanceFilters, skin_tone: e.target.value || undefined, page: 1 };
                            setSeedanceFilters(f);
                            void loadSeedanceCharacters(f);
                          }}
                          className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                        >
                          <option value="">{t.assets_seedance_filter_all_skin_tone || '全部肤色'}</option>
                          {seedanceSkinTones.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>

                        {/* Occupation */}
                        <select
                          value={seedanceFilters.occupation || ''}
                          onChange={(e) => {
                            const f = { ...seedanceFilters, occupation: e.target.value || undefined, page: 1 };
                            setSeedanceFilters(f);
                            void loadSeedanceCharacters(f);
                          }}
                          className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/50"
                        >
                          <option value="">{t.assets_seedance_filter_all_occupation || '全部职业'}</option>
                          {seedanceOccupations.map((oc) => <option key={oc} value={oc}>{oc}</option>)}
                        </select>

                        {/* Exact age */}
                        <div className="flex items-center gap-1 text-xs text-zinc-400">
                          <span>{t.assets_seedance_filter_age_exact || '精确年龄'}:</span>
                          <input
                            type="number" min={0} max={100}
                            value={seedanceFilters.age_exact ?? ''}
                            onChange={(e) => {
                              const f = { ...seedanceFilters, age_exact: e.target.value ? Number(e.target.value) : undefined, page: 1 };
                              setSeedanceFilters(f);
                            }}
                            onBlur={() => void loadSeedanceCharacters(seedanceFilters)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void loadSeedanceCharacters(seedanceFilters); }}
                            className="w-14 bg-zinc-800 border border-white/10 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none"
                            placeholder="e.g. 25"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Grid */}
              <div className="flex-1 overflow-y-auto px-6 py-4 custom-scroll">
                {seedanceLoading ? (
                  <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>
                ) : seedanceCharacters.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                    <p className="text-sm">{t.assets_seedance_empty || '未找到匹配的模特'}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                    {seedanceCharacters.map((char) => (
                      <div
                        key={char.id}
                        className="group relative bg-zinc-900 rounded-xl overflow-hidden border border-white/5 hover:border-purple-500/40 transition cursor-pointer"
                        onClick={async () => {
                          try {
                            await seedanceApi.collectCharacter(char.id, currentFolderId);
                            void loadData();
                            openInfo(t.assets_confirm_title || 'OK', t.assets_seedance_collected || `已添加「${char.title}」到虚拟模特`);
                          } catch (err) {
                            openInfo(t.assets_confirm_title || 'Error', String(err instanceof Error ? err.message : err));
                          }
                        }}
                      >
                        <div className="aspect-[3/4] bg-zinc-800 overflow-hidden">
                          <img
                            src={char.image_url}
                            alt={char.title}
                            className="w-full h-full object-cover transition-opacity duration-300"
                            loading="lazy"
                            style={{ opacity: 0 }}
                            onLoad={(e) => { (e.target as HTMLImageElement).style.opacity = '1'; }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                        <div className="p-1.5">
                          <div className="text-[10px] font-bold text-zinc-200 truncate">{char.title || `${char.country} ${char.gender}`}</div>
                          <div className="text-[9px] text-zinc-500 truncate">{char.gender === 'Male' ? '男' : '女'} · {char.age}{t.assets_seedance_age_unit || '岁'} · {char.country}</div>
                          {char.occupation && <div className="text-[9px] text-zinc-600 truncate">{char.occupation}</div>}
                          {char.temperament && <div className="text-[9px] text-zinc-600 truncate">{char.temperament}</div>}
                        </div>
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <span className="bg-purple-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg">
                            <Plus className="w-3 h-3 inline mr-1" />{t.assets_seedance_add || '添加'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {seedanceTotalCount > (seedanceFilters.page_size || 40) && (
                <div className="flex items-center justify-center gap-3 px-6 py-3 border-t border-white/5">
                  <button
                    disabled={seedancePage <= 1}
                    onClick={() => { const f = { ...seedanceFilters, page: seedancePage - 1 }; setSeedanceFilters(f); void loadSeedanceCharacters(f); }}
                    className="px-3 py-1 text-xs rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
                  >
                    {t.assets_seedance_prev || '上一页'}
                  </button>
                  <span className="text-xs text-zinc-400">{seedancePage} / {Math.ceil(seedanceTotalCount / (seedanceFilters.page_size || 40))}</span>
                  <button
                    disabled={seedancePage >= Math.ceil(seedanceTotalCount / (seedanceFilters.page_size || 40))}
                    onClick={() => { const f = { ...seedanceFilters, page: seedancePage + 1 }; setSeedanceFilters(f); void loadSeedanceCharacters(f); }}
                    className="px-3 py-1 text-xs rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
                  >
                    {t.assets_seedance_next || '下一页'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
};
