import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Star, Trash2, Settings2, Wand2, RefreshCw, X, Download, Check, Sparkles, Video } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { AppDialog } from '../common/AppDialog';
import {
  loadWorkbenchProjectStore,
  WORKBENCH_NEW_PROJECT_TARGET,
  type WorkbenchProjectMeta,
} from '../../utils/workbenchProjectStore';
import { addTransferStationItems } from '../../utils/workbenchTransferStation';
import {
  deleteImageHistoryItem,
  getImageHistoryPage,
  subscribeImageHistory,
  toggleImageHistoryFavorite,
  type ImageHistoryFeatureType,
  type ImageHistoryItem,
} from '../../utils/imageHistory';
import { downloadBlobInBrowser, saveBlobWithPickerFallback } from '../../utils/browserDownload';

interface GallerySettings {
  targetScene: string;
  style: string;
  aspectRatio: string;
  resolution: string;
  productName: string;
  productCategory: string;
  sellingPoints: string[];
  typeSelections: Record<string, { enabled: boolean; count: number }>;
  outputMode?: 'custom' | 'ai';
  outputItems?: Array<{
    id: string;
    enabled: boolean;
    outputType: string;
    aspectRatio: string;
    resolution: string;
    count: number;
    title?: string;
    layout?: string;
    copy?: Record<string, any>;
    notes?: string;
  }>;
  uploadedImagePaths?: string[];
}

interface FirstFrameSettings {
  openingScene?: string;
  aspectRatio?: string;
  resolution?: string;
  model?: string;
  prompt?: string;
}

interface UnifiedImageHistoryItem {
  id: string;
  source: ImageHistoryFeatureType;
  createdAt: string;
  createdAtMs: number;
  images: string[];
  settings?: GallerySettings;
  firstFrameSettings?: FirstFrameSettings;
  metadata?: Record<string, any>;
  isFavorited: boolean;
}

const HISTORY_PAGE_SIZE = 16;

type ApplyModel = 'sora2' | 'sora2pro' | 'seedance2.0';

const FIRST_FRAME_TRANSFER_KEY = 'vflow_apply_first_frame';
const GALLERY_RESTORE_KEY = 'vflow_gallery_restore_settings';

const readFirstFrameSettings = (item: ImageHistoryItem): FirstFrameSettings | undefined => {
  const candidates = [
    item.settings?.params,
    item.settings?.parameters,
    item.settings,
    item.metadata?.params,
    item.metadata?.parameters,
    item.metadata,
  ].filter((value) => value && typeof value === 'object' && !Array.isArray(value)) as Record<string, any>[];

  const readString = (...keys: string[]) => {
    for (const source of candidates) {
      for (const key of keys) {
        const raw = source[key];
        if (raw === undefined || raw === null) continue;
        const value = String(raw).trim();
        if (value) return value;
      }
    }
    return '';
  };

  const settings: FirstFrameSettings = {
    openingScene: readString('openingScene', 'opening_scene'),
    aspectRatio: readString('aspectRatio', 'aspect_ratio', 'ratio'),
    resolution: readString('resolution'),
    model: readString('model', 'generationModel', 'generation_model'),
    prompt: readString('prompt', 'promptOverride', 'prompt_override'),
  };

  return Object.values(settings).some(Boolean) ? settings : undefined;
};

const toUnifiedHistoryItem = (item: ImageHistoryItem): UnifiedImageHistoryItem => ({
  id: item.id,
  source: item.featureType,
  createdAt: item.createdAt,
  createdAtMs: item.createdAtMs,
  images: item.images,
  settings: item.featureType === 'gallery' ? (item.settings as GallerySettings | undefined) : undefined,
  firstFrameSettings: item.featureType === 'first_frame' ? readFirstFrameSettings(item) : undefined,
  metadata: item.metadata,
  isFavorited: item.isFavorited === true,
});

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
};

const formatI18n = (template: string | undefined, vars: Record<string, string | number>) => {
  if (!template) return '';
  return Object.entries(vars).reduce((acc, [key, value]) => {
    return acc.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(value));
  }, template);
};

const formatHistoryTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const SCENE_LABELS: Record<string, string> = {
  detail: '详情页 / Detail',
  xiaohongshu: '小红书 / Xiaohongshu',
  douyin: '抖音 / Douyin',
  poster: '海报 / Poster',
  ads: '广告投流 / Ads',
};

const STYLE_LABELS: Record<string, string> = {
  ecom_clean: '简洁电商 / E-com Clean',
  lifestyle: '生活方式 / Lifestyle',
  premium: '高级质感 / Premium',
  festival: '节日营销 / Festival',
};

const TYPE_LABELS: Record<string, string> = {
  white_bg: '白底图',
  scene: '场景图',
  selling_point: '卖点图',
  cover: '封面图',
  poster: '海报图',
};

const canApplyToWorkbench = (item: UnifiedImageHistoryItem) => item.source === 'first_frame' || item.source === 'gallery';
const canRegenerate = (item: UnifiedImageHistoryItem) => item.source === 'first_frame' || item.source === 'gallery';
const canViewSettings = (item: UnifiedImageHistoryItem) => (
  (item.source === 'gallery' && !!item.settings) ||
  (item.source === 'first_frame' && !!item.firstFrameSettings)
);

interface ImageHistoryPanelProps {
  onNavigateToWorkbench: () => void;
  onNavigateToProductImages: (view: 'product_images_gallery' | 'product_images_first_frame') => void;
}

export const ImageHistoryPanel: React.FC<ImageHistoryPanelProps> = ({ onNavigateToWorkbench, onNavigateToProductImages }) => {
  const { t } = useLanguage();
  const { user } = useAuth();

  const [items, setItems] = useState<UnifiedImageHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [settingsItem, setSettingsItem] = useState<UnifiedImageHistoryItem | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedImageHistoryItem | null>(null);
  const [applyTarget, setApplyTarget] = useState<UnifiedImageHistoryItem | null>(null);
  const [applySelectedImages, setApplySelectedImages] = useState<Set<string>>(new Set());
  const [applyModel, setApplyModel] = useState<ApplyModel>('sora2');
  const [applyProjectOptions, setApplyProjectOptions] = useState<WorkbenchProjectMeta[]>([]);
  const [applyCurrentProjectId, setApplyCurrentProjectId] = useState('');
  const [applyTargetProjectId, setApplyTargetProjectId] = useState('');
  const [applyProjectName, setApplyProjectName] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const getSourceLabel = useCallback((source: ImageHistoryFeatureType) => {
    switch (source) {
      case 'first_frame':
        return t.hist_img_source_first_frame || 'AI首帧图';
      case 'gallery':
        return t.hist_img_source_gallery || '商品套图';
      case 'text_separation':
        return t.hist_img_source_text_separation || '文本分离';
      case 'smart_repair':
        return t.hist_img_source_smart_repair || 'AI智能修复';
      case 'ai_model':
        return t.wb_nav_product_ai_model || 'AI模特';
      default:
        return source;
    }
  }, [t]);

  const getSourceBadgeClass = useCallback((source: ImageHistoryFeatureType) => {
    switch (source) {
      case 'first_frame':
        return 'bg-blue-500/15 text-blue-400 border border-blue-500/20';
      case 'gallery':
        return 'bg-purple-500/15 text-purple-400 border border-purple-500/20';
      case 'text_separation':
        return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
      case 'smart_repair':
        return 'bg-amber-500/15 text-amber-400 border border-amber-500/20';
      case 'ai_model':
        return 'bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/20';
      default:
        return 'bg-zinc-500/15 text-zinc-300 border border-zinc-500/20';
    }
  }, []);

  const getFirstFrameOpeningSceneLabel = useCallback((value?: string) => {
    const key = String(value || '').trim();
    switch (key) {
      case 'person_selling':
        return t.ff_opening_scene_person_selling || key;
      case 'product_showcase':
        return t.ff_opening_scene_product_showcase || key;
      case 'usage_demo':
        return t.ff_opening_scene_usage_demo || key;
      case 'brand_ad':
        return t.ff_opening_scene_brand_ad || key;
      default:
        return key || '-';
    }
  }, [t]);

  const getFirstFrameModelLabel = useCallback((value?: string) => {
    const key = String(value || '').trim();
    switch (key) {
      case 'nano-banana-pro':
        return 'Nano Banana Pro';
      case 'gpt-image-2':
        return 'GPT Image 2';
      case 'gpt-image-1.5':
        return 'GPT Image 1.5';
      case 'flux-2-pro':
        return 'Flux 2 Pro';
      case 'flux-2-flex':
        return 'Flux 2 Flex';
      default:
        return key || '-';
    }
  }, []);

  const formatFirstFrameResolution = useCallback((value?: string) => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized ? normalized.toUpperCase() : '-';
  }, []);

  const loadPage = useCallback(async (requestedPage: number) => {
    if (!user?.id) {
      setItems([]);
      setError(null);
      setIsLoading(false);
      setCurrentPage(1);
      setTotalPages(1);
      setTotalResults(0);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await getImageHistoryPage({
        page: requestedPage,
        pageSize: HISTORY_PAGE_SIZE,
        onlyFavorites: showOnlyFavorites,
      });

      setItems((data.items || []).map(toUnifiedHistoryItem));
      setTotalResults(Number(data.pagination?.total || 0));
      setTotalPages(Math.max(1, Number(data.pagination?.total_pages || 1)));
      if (data.pagination?.page && data.pagination.page !== requestedPage) {
        setCurrentPage(data.pagination.page);
      }
    } catch (e) {
      setError(getErrorMessage(e, t.hist_load_failed || 'Failed to load history'));
      setItems([]);
      setTotalPages(1);
      setTotalResults(0);
    } finally {
      setIsLoading(false);
    }
  }, [showOnlyFavorites, t.hist_load_failed, user?.id]);

  useEffect(() => {
    void loadPage(currentPage);
  }, [currentPage, loadPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [showOnlyFavorites]);

  useEffect(() => {
    return subscribeImageHistory(() => {
      void loadPage(currentPage);
    });
  }, [currentPage, loadPage]);

  const displayed = useMemo(() => {
    return items;
  }, [items]);

  const toggleFavorite = async (id: string) => {
    await toggleImageHistoryFavorite(id);
    await loadPage(currentPage);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteImageHistoryItem(deleteTarget.id);
    setDeleteTarget(null);
    await loadPage(currentPage);
  };

  const openApplyDialog = (item: UnifiedImageHistoryItem) => {
    if (!canApplyToWorkbench(item)) return;

    const store = loadWorkbenchProjectStore();
    const sortedProjects = [...store.projects].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    setApplyTarget(item);
    setApplySelectedImages(new Set(item.images.slice(0, 1)));
    setApplyProjectOptions(sortedProjects);
    setApplyCurrentProjectId(store.currentProjectId || sortedProjects[0]?.id || '');
    setApplyTargetProjectId(store.currentProjectId || sortedProjects[0]?.id || '');

    try {
      const storedModel = localStorage.getItem('vflow_workbench_model');
      if (storedModel === 'sora2' || storedModel === 'sora2pro' || storedModel === 'seedance2.0') {
        setApplyModel(storedModel);
      } else {
        setApplyModel('sora2');
      }
    } catch {
      setApplyModel('sora2');
    }

    const defaultName = `${getSourceLabel(item.source)}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    setApplyProjectName(defaultName);
  };

  const toggleApplyImage = (url: string) => {
    setApplySelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  const confirmApply = () => {
    if (!applyTarget || applySelectedImages.size === 0) return;

    const createNewProject = applyTargetProjectId === WORKBENCH_NEW_PROJECT_TARGET;
    const targetProjectId = createNewProject ? '' : String(applyTargetProjectId || '').trim();

    const transferPayload = {
      imageUrls: [...applySelectedImages],
      model: applyModel,
      targetProjectId: targetProjectId || undefined,
      createNewProject,
      newProjectName: createNewProject ? (applyProjectName || undefined) : undefined,
      timestamp: new Date().toISOString(),
    };

    try {
      localStorage.setItem(FIRST_FRAME_TRANSFER_KEY, JSON.stringify(transferPayload));
    } catch {
      // ignore
    }

    setApplyTarget(null);
    onNavigateToWorkbench();
  };

  const addSelectedToTransferStation = () => {
    if (!applyTarget || applySelectedImages.size === 0) return;

    const images = [...applySelectedImages];
    const baseLabel = getSourceLabel(applyTarget.source);

    const result = addTransferStationItems(
      images.map((url, index) => ({
        name: `${baseLabel} ${index + 1}`,
        fileUrl: url,
        mediaKind: 'image' as const,
        type: 'product' as const,
        source: 'history' as const,
      })),
      user?.id ?? null,
    );

    if (result.addedCount > 0) {
      setFeedbackMessage(t.wb_transfer_station_add_success || '已加入中转站，可在工作台悬浮球中拖拽使用。');
      setApplyTarget(null);
      return;
    }

    setFeedbackMessage(t.wb_transfer_station_add_duplicate || '素材已在中转站中，无需重复添加。');
  };

  const downloadImage = async (url: string, index?: number) => {
    try {
      const response = await fetch(url, { mode: 'cors' });
      const blob = await response.blob();
      const ext = blob.type?.includes('png') ? '.png' : blob.type?.includes('webp') ? '.webp' : '.jpg';
      await saveBlobWithPickerFallback(blob, `image${index != null ? `_${index + 1}` : ''}${ext}`);
    } catch {
      window.open(url, '_blank');
    }
  };

  const downloadAllImages = async (images: string[]) => {
    for (let index = 0; index < images.length; index += 1) {
      const url = images[index];
      try {
        const response = await fetch(url, { mode: 'cors' });
        const blob = await response.blob();
        const ext = blob.type?.includes('png') ? '.png' : blob.type?.includes('webp') ? '.webp' : '.jpg';
        downloadBlobInBrowser(blob, `image_${index + 1}${ext}`);
      } catch {
        window.open(url, '_blank');
      }

      if (index < images.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  };

  const handleRegenerate = (item: UnifiedImageHistoryItem) => {
    if (!canRegenerate(item)) return;

    if (item.source === 'gallery') {
      if (!item.settings) {
        setFeedbackMessage(t.hist_img_regenerate_no_settings);
        return;
      }

      const hasImagePaths = Array.isArray(item.settings.uploadedImagePaths) && item.settings.uploadedImagePaths.length > 0;
      try {
        localStorage.setItem(GALLERY_RESTORE_KEY, JSON.stringify(item.settings));
      } catch {
        // ignore
      }

      if (!hasImagePaths) {
        setFeedbackMessage(t.hist_img_regenerate_no_images);
      }

      onNavigateToProductImages('product_images_gallery');
      return;
    }

    onNavigateToProductImages('product_images_first_frame');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 px-1">
        <button
          type="button"
          onClick={() => setShowOnlyFavorites((value) => !value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            showOnlyFavorites
              ? 'bg-amber-500/10 text-amber-500'
              : 'bg-white/[0.02] text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
          }`}
        >
          <Star className="w-3.5 h-3.5" fill={showOnlyFavorites ? 'currentColor' : 'none'} />
          {showOnlyFavorites ? t.hist_favorites_toggle_only : t.hist_favorites_toggle_view_all}
        </button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
          {t.hist_loading || 'Loading...'}
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-zinc-500 max-w-md px-4">
            <p className="mb-3">{error}</p>
            <button
              type="button"
              onClick={() => void loadPage(currentPage)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
            >
              {t.hist_refresh || 'Refresh'}
            </button>
          </div>
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
          <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>{t.hist_img_empty || t.hist_empty}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scroll">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {displayed.map((item) => (
              <div key={item.id} className="group relative flex flex-col rounded-2xl overflow-hidden bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300 hover:-translate-y-1 shadow-sm hover:shadow-xl">
                <div className="px-5 py-4 pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${getSourceBadgeClass(item.source)}`}>
                      {getSourceLabel(item.source)}
                    </span>
                    <span className="text-[11px] text-zinc-500">{formatHistoryTime(item.createdAt)}</span>
                  </div>
                  <span className="text-[11px] text-zinc-600">{formatI18n(t.hist_img_count, { count: item.images.length })}</span>
                </div>

                <div className="px-5 pt-1 pb-3 grid grid-cols-4 gap-2">
                  {item.images.slice(0, 4).map((url, index) => (
                    <div key={`${item.id}-${index}`} className="relative group/img rounded-xl overflow-hidden bg-black/40 aspect-square shadow-inner">
                      <button
                        type="button"
                        onClick={() => setPreviewImageUrl(url)}
                        className="w-full h-full cursor-pointer"
                      >
                        <img src={url} className="w-full h-full object-cover opacity-90 group-hover/img:opacity-100 transition-opacity" alt="" loading="lazy" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          downloadImage(url, index);
                        }}
                        className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-all hover:scale-110"
                        title={t.hist_img_download}
                      >
                        <Download className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                  {item.images.length > 4 && (
                    <div className="rounded-xl bg-black/40 shadow-inner aspect-square flex items-center justify-center text-zinc-500 text-xs font-bold">
                      +{item.images.length - 4}
                    </div>
                  )}
                </div>

                {item.source === 'gallery' && item.settings && (
                  <div className="px-5 pb-2 flex flex-wrap gap-1.5 mt-auto">
                    <span className="text-[10px] bg-white/5 text-zinc-400 px-2 py-0.5 rounded-md">{SCENE_LABELS[item.settings.targetScene] || item.settings.targetScene}</span>
                    <span className="text-[10px] bg-white/5 text-zinc-400 px-2 py-0.5 rounded-md">{STYLE_LABELS[item.settings.style] || item.settings.style}</span>
                    <span className="text-[10px] bg-white/5 text-zinc-400 px-2 py-0.5 rounded-md">{item.settings.aspectRatio}</span>
                    <span className="text-[10px] bg-white/5 text-zinc-400 px-2 py-0.5 rounded-md">{item.settings.resolution?.toUpperCase()}</span>
                  </div>
                )}

                {item.source === 'first_frame' && item.firstFrameSettings && (
                  <div className="px-5 pb-2 flex flex-wrap gap-1.5 mt-auto">
                    {item.firstFrameSettings.openingScene ? (
                      <span className="text-[10px] bg-white/5 text-zinc-400 px-2 py-0.5 rounded-md">
                        {getFirstFrameOpeningSceneLabel(item.firstFrameSettings.openingScene)}
                      </span>
                    ) : null}
                    {item.firstFrameSettings.aspectRatio ? (
                      <span className="text-[10px] bg-white/5 text-zinc-400 px-2 py-0.5 rounded-md">
                        {item.firstFrameSettings.aspectRatio}
                      </span>
                    ) : null}
                    {item.firstFrameSettings.resolution ? (
                      <span className="text-[10px] bg-white/5 text-zinc-400 px-2 py-0.5 rounded-md">
                        {formatFirstFrameResolution(item.firstFrameSettings.resolution)}
                      </span>
                    ) : null}
                  </div>
                )}

                <div className="px-5 py-4 pt-3 flex items-center justify-between opacity-60 group-hover:opacity-100 transition-opacity mt-auto">
                  <div className="flex items-center gap-2 flex-wrap flex-1">
                    <button
                      type="button"
                      onClick={() => toggleFavorite(item.id)}
                      className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 bg-white/5 hover:bg-white/10 hover:text-zinc-200 transition"
                      title={item.isFavorited ? t.hist_favorite_remove_title : t.hist_favorite_add_title}
                    >
                      <Star className="w-3.5 h-3.5" fill={item.isFavorited ? 'currentColor' : 'none'} strokeWidth={item.isFavorited ? 0 : 2} style={item.isFavorited ? { color: '#f59e0b' } : undefined} />
                    </button>

                    {canViewSettings(item) && (
                      <button
                        type="button"
                        onClick={() => setSettingsItem(item)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-zinc-400 bg-white/5 hover:bg-white/10 hover:text-zinc-200 transition"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{t.hist_img_view_settings}</span>
                      </button>
                    )}

                    {canApplyToWorkbench(item) && (
                      <button
                        type="button"
                        onClick={() => openApplyDialog(item)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 transition"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>{t.hist_img_apply_to_workbench}</span>
                      </button>
                    )}

                    {canRegenerate(item) && (
                      <button
                        type="button"
                        onClick={() => handleRegenerate(item)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 transition"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{t.hist_img_regenerate}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => downloadAllImages(item.images)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{t.hist_img_download_all}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    className="flex shrink-0 items-center justify-center w-7 h-7 rounded-lg text-zinc-500 bg-white/[0.03] hover:bg-red-500/10 hover:text-red-400 transition ml-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && !error && displayed.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-xs text-zinc-500 px-1">
          <span>
            {formatI18n(t.hist_page_total || 'Total {{count}} items', { count: totalResults })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
              className="px-2.5 py-1 rounded border border-white/10 bg-white/5 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t.hist_page_prev || 'Prev'}
            </button>
            <span className="text-zinc-400">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 rounded border border-white/10 bg-white/5 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t.hist_page_next || 'Next'}
            </button>
          </div>
        </div>
      )}

      {previewImageUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-4xl w-full" onClick={(event) => event.stopPropagation()}>
            <button
              onClick={() => setPreviewImageUrl(null)}
              className="absolute -top-10 right-0 w-8 h-8 bg-black/50 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
            <img src={previewImageUrl} alt="" className="w-full max-h-[80vh] object-contain rounded-xl border border-white/10" />
          </div>
        </div>
      )}

      <AppDialog
        isOpen={!!settingsItem}
        title={t.hist_img_settings_title}
        onClose={() => setSettingsItem(null)}
        widthClassName="max-w-lg"
        footer={
          <button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700" onClick={() => setSettingsItem(null)}>
            {t.wf_error_close}
          </button>
        }
      >
        {settingsItem?.source === 'first_frame' && settingsItem.firstFrameSettings ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.ff_opening_scene_label || 'Target Opening Scene'}</div>
                <div className="text-zinc-200">{getFirstFrameOpeningSceneLabel(settingsItem.firstFrameSettings.openingScene)}</div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.hist_img_setting_ratio}</div>
                <div className="text-zinc-200">{settingsItem.firstFrameSettings.aspectRatio || '-'}</div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.hist_img_setting_resolution || t.pg_main_resolution || 'Resolution'}</div>
                <div className="text-zinc-200">{formatFirstFrameResolution(settingsItem.firstFrameSettings.resolution)}</div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.hist_prompt_field_model || 'Model'}</div>
                <div className="text-zinc-200">{getFirstFrameModelLabel(settingsItem.firstFrameSettings.model)}</div>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.ff_detail_prompt_label || t.ff_prompt_label || 'Generation Requirements'}</div>
              <div className="whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3 text-zinc-200">
                {settingsItem.firstFrameSettings.prompt || '-'}
              </div>
            </div>
          </div>
        ) : settingsItem?.settings ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.hist_img_setting_scene}</div>
                <div className="text-zinc-200">{SCENE_LABELS[settingsItem.settings.targetScene] || settingsItem.settings.targetScene}</div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.hist_img_setting_style}</div>
                <div className="text-zinc-200">{STYLE_LABELS[settingsItem.settings.style] || settingsItem.settings.style}</div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.hist_img_setting_ratio}</div>
                <div className="text-zinc-200">{settingsItem.settings.aspectRatio}</div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.hist_img_setting_resolution}</div>
                <div className="text-zinc-200">{settingsItem.settings.resolution?.toUpperCase()}</div>
              </div>
            </div>
            {settingsItem.settings.productName && (
              <div>
                <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.hist_img_setting_product}</div>
                <div className="text-zinc-200">{settingsItem.settings.productName}</div>
              </div>
            )}
            {settingsItem.settings.productCategory && (
              <div>
                <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.hist_img_setting_category}</div>
                <div className="text-zinc-200">{settingsItem.settings.productCategory}</div>
              </div>
            )}
            {settingsItem.settings.sellingPoints && settingsItem.settings.sellingPoints.length > 0 && (
              <div>
                <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.hist_img_setting_selling_points}</div>
                <ul className="list-disc list-inside text-zinc-300 text-xs space-y-0.5">
                  {settingsItem.settings.sellingPoints.map((sellingPoint, index) => <li key={index}>{sellingPoint}</li>)}
                </ul>
              </div>
            )}
            {settingsItem.settings.typeSelections && (
              <div>
                <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.hist_img_setting_types}</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(settingsItem.settings.typeSelections)
                    .filter(([, value]) => value.enabled && value.count > 0)
                    .map(([key, value]) => (
                      <span key={key} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-white/10">
                        {TYPE_LABELS[key] || key} ×{value.count}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-zinc-500 text-sm">{t.hist_img_no_settings}</div>
        )}
      </AppDialog>

      <AppDialog
        isOpen={!!deleteTarget}
        title={t.hist_delete_confirm_title}
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700" onClick={() => setDeleteTarget(null)}>
              {t.assets_move_cancel || 'Cancel'}
            </button>
            <button className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-500" onClick={confirmDelete}>
              {t.assets_delete || 'Delete'}
            </button>
          </>
        }
      >
        <div className="text-zinc-300 text-sm">{t.hist_img_delete_confirm}</div>
      </AppDialog>

      <AppDialog
        isOpen={!!applyTarget}
        title={t.hist_img_apply_title}
        onClose={() => setApplyTarget(null)}
        widthClassName="max-w-lg"
        footer={
          <>
            <button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700" onClick={() => setApplyTarget(null)}>
              {t.assets_move_cancel || 'Cancel'}
            </button>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                applySelectedImages.size > 0
                  ? 'bg-sky-600 text-white hover:bg-sky-500'
                  : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
              }`}
              onClick={addSelectedToTransferStation}
              disabled={applySelectedImages.size === 0}
            >
              {t.wb_transfer_station_add_btn || '加入中转站'} ({applySelectedImages.size})
            </button>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                applySelectedImages.size > 0
                  ? 'bg-orange-600 text-white hover:bg-orange-500'
                  : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
              }`}
              onClick={confirmApply}
              disabled={applySelectedImages.size === 0}
            >
              {t.hist_img_apply_confirm} ({applySelectedImages.size})
            </button>
          </>
        }
      >
        {applyTarget && (
          <div className="space-y-5">
            <div>
              <div className="text-[11px] text-zinc-500 font-bold mb-2">{t.hist_img_apply_select_images}</div>
              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto custom-scroll">
                {applyTarget.images.map((url, index) => {
                  const selected = applySelectedImages.has(url);
                  return (
                    <button
                      key={`${applyTarget.id}-apply-${index}`}
                      type="button"
                      onClick={() => toggleApplyImage(url)}
                      className={`relative rounded-lg overflow-hidden border-2 aspect-square transition ${
                        selected
                          ? 'border-orange-500 ring-1 ring-orange-500/30'
                          : 'border-white/10 hover:border-white/20'
                      }`}
                    >
                      <img src={url} className="w-full h-full object-cover" alt="" loading="lazy" />
                      {selected && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-zinc-500 font-bold mb-2">{t.hist_img_apply_select_model}</div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'sora2' as ApplyModel, title: 'Sora 2', Icon: Sparkles },
                  { id: 'sora2pro' as ApplyModel, title: 'Sora 2 Pro', Icon: Sparkles },
                  { id: 'seedance2.0' as ApplyModel, title: 'Seedance 2.0', Icon: Video },
                ] as const).map((option) => {
                  const active = applyModel === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setApplyModel(option.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition ${
                        active
                          ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
                          : 'border-white/10 bg-white/[0.02] text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      <option.Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{option.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.hist_img_apply_select_workspace || '选择工作台'}</div>
              <select
                value={applyTargetProjectId}
                onChange={(event) => setApplyTargetProjectId(event.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
              >
                {applyProjectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}{project.id === applyCurrentProjectId ? ` (${t.hist_img_apply_current_workspace || '当前'})` : ''}
                  </option>
                ))}
                <option value={WORKBENCH_NEW_PROJECT_TARGET}>{t.hist_img_apply_create_new_workspace || '新建工作台'}</option>
              </select>
            </div>

            {applyTargetProjectId === WORKBENCH_NEW_PROJECT_TARGET && (
              <div>
                <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.hist_img_apply_project_name}</div>
                <input
                  value={applyProjectName}
                  onChange={(event) => setApplyProjectName(event.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                  maxLength={30}
                />
              </div>
            )}

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-300">
              {applyTargetProjectId === WORKBENCH_NEW_PROJECT_TARGET
                ? (t.hist_img_apply_new_project_hint || '将在工作台中创建新工程。')
                : (t.hist_img_apply_existing_project_hint || '将素材应用到选中的工作台工程。')}
            </div>
          </div>
        )}
      </AppDialog>

      <AppDialog
        isOpen={!!feedbackMessage}
        title={t.hist_title}
        onClose={() => setFeedbackMessage(null)}
        footer={
          <button className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-500" onClick={() => setFeedbackMessage(null)}>
            {t.wb_debug_close || 'Close'}
          </button>
        }
      >
        <div className="whitespace-pre-line">{feedbackMessage}</div>
      </AppDialog>
    </div>
  );
};
