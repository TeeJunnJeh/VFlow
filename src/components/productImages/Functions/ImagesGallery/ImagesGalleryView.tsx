import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Eye, Image as ImageIcon, LayoutGrid, Minus, Plus, RotateCw, Sparkles, Upload, Wand2, X } from 'lucide-react';
import { DropdownSelect } from '../../../common/DropdownSelect';
import type { ViewType } from '../../../workbench/types';
import type { LoadingTheme } from '../../../../utils/loadingTheme';
import ResizableSplitter from '../../../common/ResizableSplitter';
import { AppDialog } from '../../../common/AppDialog';

const GALLERY_PANEL_MIN_WIDTH = 300;
const GALLERY_PANEL_MAX_WIDTH = 500;
const GALLERY_PANEL_DEFAULT_WIDTH = 320;

type GalleryOutputItemConfig = {
  id: string;
  enabled: boolean;
  outputType: 'white_bg' | 'scene' | 'selling_point' | 'cover' | 'poster';
  aspectRatio: string;
  resolution: '1k' | '2k' | '4k';
  count: number;
  title?: string;
  modelCardId?: string;
  sceneCardId?: string;
  /** @deprecated kept for backward compat; read/write goes through `layouts[layoutIndex]`. */
  layout?: string;
  layouts?: string[];
  layoutIndex?: number;
  copy?: {
    headline?: string;
    subheadline?: string;
    body?: string;
    bulletPoints?: string[];
  };
  notes?: string;
  prompt?: string;
  cardConfig?: {
    visualFocus?: string;
    compositionHint?: string;
    copyTone?: string;
    negativeHints?: string;
    sellingPointText?: string;
    headlineFocus?: string;
    heroStyle?: string;
    campaignAngle?: string;
    promotionTone?: string;
    copyBlockDensity?: string;
    backgroundStyle?: string;
    displayAngle?: string;
  };
};

type GalleryModelCardConfig = {
  id: string;
  name: string;
  imagePath?: string;
  modelInfo?: string;
  imageFile?: File | null;
  imagePreviewUrl?: string | null;
};

type GallerySceneCardConfig = {
  id: string;
  name: string;
  sourceMode: 'preset' | 'custom';
  presetId?: string;
  sceneConfig: {
    sceneTheme: string;
    sceneDescription: string;
    sceneProps: string;
    lighting: string;
    mood: string;
  };
};

type GalleryBulkRatioStrategy = 'recommended' | '1:1' | '4:5' | '9:16';
type GalleryBulkBindingStrategy = 'none' | 'auto_primary';
type GalleryBulkConfig = {
  ratioStrategy: GalleryBulkRatioStrategy;
  resolution: '1k' | '2k' | '4k';
  bindingStrategy: GalleryBulkBindingStrategy;
  typeSelections: Record<GalleryOutputItemConfig['outputType'], { enabled: boolean; count: number }>;
};

const cloneGalleryBulkConfig = (value: GalleryBulkConfig): GalleryBulkConfig => ({
  ratioStrategy: value.ratioStrategy,
  resolution: value.resolution,
  bindingStrategy: value.bindingStrategy,
  typeSelections: {
    white_bg: { ...value.typeSelections.white_bg },
    scene: { ...value.typeSelections.scene },
    selling_point: { ...value.typeSelections.selling_point },
    cover: { ...value.typeSelections.cover },
    poster: { ...value.typeSelections.poster },
  },
});

export type ImagesGalleryViewProps = {
  panelClassName: (view: ViewType) => string;
  t: any;
  tr: (zh: string, en: string) => string;

  galleryFileInputRef: React.RefObject<HTMLInputElement | null>;
  galleryImages: File[];
  galleryPreviewUrls: string[];
  galleryRestoredImagePaths: string[];
  isGalleryDragActive: boolean;
  setIsGalleryDragActive: React.Dispatch<React.SetStateAction<boolean>>;
  setGalleryRestoredImagePaths: React.Dispatch<React.SetStateAction<string[]>>;
  appendGalleryFiles: (picked: File[]) => void;
  setGalleryImages: React.Dispatch<React.SetStateAction<File[]>>;

  handleGalleryAiAnalyze: () => void;
  isGalleryAnalyzing: boolean;

  galleryProductName: string;
  setGalleryProductName: (v: string) => void;
  galleryCategory: string;
  setGalleryCategory: (v: string) => void;
  gallerySellingPoints: string[];
  setGallerySellingPoints: React.Dispatch<React.SetStateAction<string[]>>;

  hotStyleLoading: boolean;
  hotStyleItems: Array<{ name: string; tones: string[]; description: string }>;
  hotStyleSelectedIndex: number | null;
  setHotStyleSelectedIndex: React.Dispatch<React.SetStateAction<number | null>>;
  hotStyleError: string | null;
  handleHotStyleAnalyze: () => void;

  galleryModelCards: GalleryModelCardConfig[];
  setGalleryModelCards: React.Dispatch<React.SetStateAction<GalleryModelCardConfig[]>>;
  addGalleryModelCard: () => void;
  removeGalleryModelCard: (cardId: string) => void;
  clearGalleryModelCardImage: (cardId: string) => void;
  handleGalleryModelCardFileSelection: (cardId: string, picked: File[]) => void;

  galleryTargetScene: 'detail' | 'xiaohongshu' | 'douyin' | 'poster' | 'ads';
  setGalleryTargetScene: React.Dispatch<React.SetStateAction<'detail' | 'xiaohongshu' | 'douyin' | 'poster' | 'ads'>>;
  galleryStyle: 'ecom_clean' | 'lifestyle' | 'premium' | 'festival';
  setGalleryStyle: React.Dispatch<React.SetStateAction<'ecom_clean' | 'lifestyle' | 'premium' | 'festival'>>;
  galleryCopyLanguage: string;
  setGalleryCopyLanguage: (v: string) => void;
  GALLERY_COPY_LANGUAGE_OPTIONS: Array<{ value: string; labelKey: string }>;

  GALLERY_SCENE_PRESETS: Array<{ id: string; name: string }>;
  gallerySceneCards: GallerySceneCardConfig[];
  setGallerySceneCards: React.Dispatch<React.SetStateAction<GallerySceneCardConfig[]>>;
  addGallerySceneCard: () => void;
  removeGallerySceneCard: (cardId: string) => void;
  applyGalleryScenePresetToCard: (id: string) => GallerySceneCardConfig['sceneConfig'];
  galleryResourceGuide: { target: 'model' | 'scene' | null; token: number };
  guideGalleryResourceSection: (target: 'model' | 'scene') => void;

  galleryBulkConfig: GalleryBulkConfig;
  setGalleryBulkConfig: React.Dispatch<React.SetStateAction<GalleryBulkConfig>>;
  handleApplyGalleryBulkConfig: (nextConfig?: GalleryBulkConfig) => boolean | Promise<boolean>;
  galleryAdvancedDirty: boolean;
  isGalleryAdvancedEditingCollapsed: boolean;
  setIsGalleryAdvancedEditingCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  markGalleryAdvancedDirty: () => void;
  galleryOutputMode: 'custom' | 'ai';
  galleryOutputItems: GalleryOutputItemConfig[];
  setGalleryOutputItems: React.Dispatch<React.SetStateAction<GalleryOutputItemConfig[]>>;
  galleryPreviewAspectRatio: string;
  openGalleryAiOutputPlanner: () => void;
  handleGalleryAiLayoutSuggestions: () => void | Promise<void>;
  openGalleryAiLayoutPromptDialog: () => void;
  isGalleryAiLayoutDesigning: boolean;

  handleGalleryGenerate: () => void;
  isGalleryGenerating: boolean;
  galleryEstimatedCost: number;

  galleryRightPanel: 'preview' | 'history';
  setGalleryRightPanel: React.Dispatch<React.SetStateAction<'preview' | 'history'>>;
  setIsGalleryHistoryManaging: (v: boolean) => void;
  setGalleryHistorySelectedKeys: React.Dispatch<React.SetStateAction<string[]>>;
  openGalleryBoardEditor: () => void;

  galleryPreviewItems: Array<{
    localId: string;
    requestId: string;
    status: 'created' | 'processing' | 'succeeded' | 'failed';
    imageUrl?: string;
    error?: string;
    outputType?: string;
    createdAt?: string;
    layout?: any;
  }>;
  openGalleryImagePreview: (url: string, source?: any) => void;
  galleryHistoryItems: Array<{
    id: string;
    createdAt: string;
    images: string[];
    settings?: any;
    metadata?: any;
  }>;

  galleryLoadingTheme: LoadingTheme;
  galleryLoadingBackgroundSrc: string;

  preventDragDefaults: (e: React.DragEvent) => void;
};


const hexToRgba = (hex: string, alpha: number) => {
  const cleaned = String(hex || '').trim().replace('#', '');
  const normalized = cleaned.length === 3 ? cleaned.split('').map((char) => char + char).join('') : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(255,255,255,${alpha})`;
  }
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const hashGallerySeed = (value: string) => {
  let hash = 0;
  const raw = String(value || '');
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const GalleryLoadingCard: React.FC<{
  theme: LoadingTheme;
  seed: string;
  label: string;
  backgroundImageSrc?: string;
}> = ({ theme, seed, label, backgroundImageSrc }) => {
  const hash = hashGallerySeed(seed);
  const durationBase = 5.4 + (hash % 5) * 0.7;

  const blobs = [
    {
      size: `${98 + (hash % 8)}%`,
      top: '-16%',
      left: `${-12 + (hash % 5)}%`,
      duration: `${durationBase}s`,
      delay: `-${(hash % 4) * 0.6}s`,
      gradient: `radial-gradient(circle, ${hexToRgba(theme.primary, 0.92)} 0%, transparent 78%)`,
    },
    {
      size: `${88 + ((hash >> 2) % 8)}%`,
      bottom: '-6%',
      right: `${-7 + ((hash >> 4) % 5)}%`,
      duration: `${durationBase + 1.25}s`,
      delay: `-${((hash >> 1) % 5) * 0.45}s`,
      direction: 'reverse' as const,
      gradient: `radial-gradient(circle, ${hexToRgba(theme.secondary, 0.9)} 0%, transparent 78%)`,
    },
    {
      size: `${106 + ((hash >> 6) % 8)}%`,
      top: `${18 + ((hash >> 7) % 6)}%`,
      right: '-15%',
      duration: `${durationBase + 2.1}s`,
      delay: `-${((hash >> 2) % 4) * 0.55}s`,
      gradient: `radial-gradient(circle, ${hexToRgba(theme.accent, 0.9)} 0%, transparent 78%)`,
    },
    {
      size: `${82 + ((hash >> 8) % 6)}%`,
      bottom: '13%',
      left: `${4 + ((hash >> 10) % 6)}%`,
      duration: `${durationBase + 0.6}s`,
      delay: `-${((hash >> 4) % 4) * 0.35}s`,
      gradient: `radial-gradient(circle, ${hexToRgba(theme.quaternary || theme.accent, 0.9)} 0%, transparent 78%)`,
    },
  ];

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${hexToRgba(theme.primary, 0.08)} 0%, ${hexToRgba(theme.surface, 0.98)} 18%, rgba(255,255,255,0.98) 100%)`,
      }}
    >
      {backgroundImageSrc ? (
        <div
          className="absolute inset-[-10%] opacity-[0.09] blur-[1200px]"
          style={{
            backgroundImage: `url("${backgroundImageSrc}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'saturate(0.7) contrast(0.26) brightness(1.14)',
          }}
        />
      ) : null}

      <style>{`
        @keyframes gallery-card-blob-shift {
          0% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          33% { transform: translate3d(15%, 20%, 0) rotate(120deg) scale(1.2); }
          66% { transform: translate3d(-15%, 15%, 0) rotate(240deg) scale(0.85); }
          100% { transform: translate3d(0, 0, 0) rotate(360deg) scale(1); }
        }
      `}</style>

      <div className={`absolute inset-0 blur-[45px] [transform:scale(1.3)] ${theme.mode === 'mono' ? 'saturate-[0.96]' : 'saturate-[1.02]'}`}>
        {blobs.map((blob, index) => (
          <div
            key={`${seed}-${index}`}
            className="absolute rounded-full"
            style={{
              width: blob.size,
              height: blob.size,
              top: (blob as any).top,
              left: (blob as any).left,
              right: (blob as any).right,
              bottom: (blob as any).bottom,
              background: (blob as any).gradient,
              animationName: 'gallery-card-blob-shift',
              animationDuration: (blob as any).duration,
              animationDelay: (blob as any).delay,
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
              animationDirection: (blob as any).direction || 'normal',
            }}
          />
        ))}
      </div>

      <div className="absolute inset-x-5 bottom-5">
        <div className="rounded-2xl border border-black/5 bg-white/45 px-4 py-3 backdrop-blur-md shadow-[0_10px_30px_rgba(255,255,255,0.18)]">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-2.5 w-2.5 rounded-full animate-pulse"
              style={{
                backgroundColor: theme.accent,
                boxShadow: `0 0 18px ${hexToRgba(theme.accent, 0.5)}`,
              }}
            />
            <div className="text-xs font-bold text-zinc-900/85">{label}</div>
          </div>
          <div className="mt-1 text-[11px] text-zinc-700/60">Rendering preview...</div>
        </div>
      </div>
    </div>
  );
};

const ImagesGalleryView: React.FC<ImagesGalleryViewProps> = (props) => {
  const [leftWidth, setLeftWidth] = useState<number>(GALLERY_PANEL_DEFAULT_WIDTH);
  const [middleWidth, setMiddleWidth] = useState<number>(GALLERY_PANEL_DEFAULT_WIDTH);
  const [isBasicsCollapsed, setIsBasicsCollapsed] = useState(false);
  const [isQuickBatchDialogOpen, setIsQuickBatchDialogOpen] = useState(false);
  const [galleryBulkDialogDraft, setGalleryBulkDialogDraft] = useState<GalleryBulkConfig>(() => cloneGalleryBulkConfig(props.galleryBulkConfig));
  const [resourceHighlight, setResourceHighlight] = useState<'model' | 'scene' | null>(null);
  const modelSectionRef = useRef<HTMLDivElement | null>(null);
  const sceneSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const savedLeftWidth = localStorage.getItem('gallery_left_width');
    const savedMiddleWidth = localStorage.getItem('gallery_middle_width');

    if (savedLeftWidth) {
      const width = parseInt(savedLeftWidth, 10);
      if (!isNaN(width) && width >= GALLERY_PANEL_MIN_WIDTH && width <= GALLERY_PANEL_MAX_WIDTH) {
        setLeftWidth(width);
      }
    }

    if (savedMiddleWidth) {
      const width = parseInt(savedMiddleWidth, 10);
      if (!isNaN(width) && width >= GALLERY_PANEL_MIN_WIDTH && width <= GALLERY_PANEL_MAX_WIDTH) {
        setMiddleWidth(width);
      }
    }
  }, []);

  const handleLeftResize = (width: number) => {
    const container = document.getElementById('gallery-container');
    const requestedWidth = Math.min(Math.max(width, GALLERY_PANEL_MIN_WIDTH), GALLERY_PANEL_MAX_WIDTH);

    if (container) {
      const containerWidth = container.clientWidth;
      const maxLeftWidth = containerWidth - Math.max(middleWidth, GALLERY_PANEL_MIN_WIDTH) - GALLERY_PANEL_MIN_WIDTH;
      const limitedWidth = Math.max(GALLERY_PANEL_MIN_WIDTH, Math.min(requestedWidth, maxLeftWidth));

      setLeftWidth(limitedWidth);
      localStorage.setItem('gallery_left_width', limitedWidth.toString());
      return;
    }

    setLeftWidth(requestedWidth);
    localStorage.setItem('gallery_left_width', requestedWidth.toString());
  };

  const handleMiddleResize = (width: number) => {
    const container = document.getElementById('gallery-container');
    const requestedWidth = Math.min(Math.max(width, GALLERY_PANEL_MIN_WIDTH), GALLERY_PANEL_MAX_WIDTH);

    if (container) {
      const containerWidth = container.clientWidth;
      const safeLeftWidth = Math.max(leftWidth, GALLERY_PANEL_MIN_WIDTH);
      const maxMiddleWidth = containerWidth - safeLeftWidth - GALLERY_PANEL_MIN_WIDTH;
      const limitedWidth = Math.max(GALLERY_PANEL_MIN_WIDTH, Math.min(requestedWidth, maxMiddleWidth));

      setMiddleWidth(limitedWidth);
      localStorage.setItem('gallery_middle_width', limitedWidth.toString());
      return;
    }

    setMiddleWidth(requestedWidth);
    localStorage.setItem('gallery_middle_width', requestedWidth.toString());
  };

  const handleResetWidths = () => {
    setLeftWidth(GALLERY_PANEL_DEFAULT_WIDTH);
    setMiddleWidth(GALLERY_PANEL_DEFAULT_WIDTH);
    localStorage.removeItem('gallery_left_width');
    localStorage.removeItem('gallery_middle_width');
  };

  const {
    panelClassName,
    t,
    tr,

    galleryFileInputRef,
    galleryImages,
    galleryPreviewUrls,
    galleryRestoredImagePaths,
    isGalleryDragActive,
    setIsGalleryDragActive,
    setGalleryRestoredImagePaths,
    appendGalleryFiles,
    setGalleryImages,

    handleGalleryAiAnalyze,
    isGalleryAnalyzing,

    galleryProductName,
    setGalleryProductName,
    galleryCategory,
    setGalleryCategory,
    gallerySellingPoints,
    setGallerySellingPoints,

    hotStyleLoading,
    hotStyleItems,
    hotStyleSelectedIndex,
    setHotStyleSelectedIndex,
    hotStyleError,
    handleHotStyleAnalyze,

    galleryModelCards,
    setGalleryModelCards,
    addGalleryModelCard,
    removeGalleryModelCard,
    clearGalleryModelCardImage,
    handleGalleryModelCardFileSelection,

    galleryTargetScene,
    setGalleryTargetScene,
    galleryStyle,
    setGalleryStyle,
    galleryCopyLanguage,
    setGalleryCopyLanguage,
    GALLERY_COPY_LANGUAGE_OPTIONS,

    GALLERY_SCENE_PRESETS,
    gallerySceneCards,
    setGallerySceneCards,
    addGallerySceneCard,
    removeGallerySceneCard,
    applyGalleryScenePresetToCard,
    galleryResourceGuide,
    guideGalleryResourceSection,

    galleryBulkConfig,
    setGalleryBulkConfig,
    handleApplyGalleryBulkConfig,
    galleryAdvancedDirty,
    isGalleryAdvancedEditingCollapsed,
    setIsGalleryAdvancedEditingCollapsed,
    markGalleryAdvancedDirty,
    galleryOutputMode,
    galleryOutputItems,
    setGalleryOutputItems,
    openGalleryAiOutputPlanner,
    handleGalleryAiLayoutSuggestions,
    openGalleryAiLayoutPromptDialog,
    isGalleryAiLayoutDesigning,

    handleGalleryGenerate,
    isGalleryGenerating,
    galleryEstimatedCost,

    galleryRightPanel,
    setGalleryRightPanel,
    setIsGalleryHistoryManaging,
    setGalleryHistorySelectedKeys,
    openGalleryBoardEditor,

    galleryPreviewItems,
    openGalleryImagePreview,
    galleryHistoryItems,

    galleryLoadingTheme,
    galleryLoadingBackgroundSrc,

    preventDragDefaults,
  } = props;

  useEffect(() => {
    const target = galleryResourceGuide.target;
    if (!target) return;
    const targetRef = target === 'model' ? modelSectionRef : sceneSectionRef;
    targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setResourceHighlight(target);
    const timer = window.setTimeout(() => setResourceHighlight((current) => (current === target ? null : current)), 2200);
    return () => window.clearTimeout(timer);
  }, [galleryResourceGuide.target, galleryResourceGuide.token]);

  const mutateAdvancedOutputItems = (
    updater: (items: GalleryOutputItemConfig[]) => GalleryOutputItemConfig[]
  ) => {
    markGalleryAdvancedDirty();
    setGalleryOutputItems(updater);
  };

  const updateOutputItem = (itemId: string, updater: (item: GalleryOutputItemConfig) => GalleryOutputItemConfig) => {
    mutateAdvancedOutputItems((prev) => prev.map((item) => (item.id === itemId ? updater(item) : item)));
  };

  const galleryOptimizingItemIds: Record<string, boolean> = {};
  const galleryAdvancedItemCount = galleryOutputItems.filter((item) => item.enabled && item.count > 0).length;
  const bulkTypeCards: Array<{
    outputType: GalleryOutputItemConfig['outputType'];
    title: string;
    description: string;
    accentClass: string;
  }> = [
    {
      outputType: 'white_bg',
      title: tr('白底图', 'White Background'),
      description: tr('适合主图、标准化电商展示。', 'Best for clean hero shots and catalog use.'),
      accentClass: 'border-sky-400/30 bg-sky-500/8',
    },
    {
      outputType: 'scene',
      title: tr('场景图', 'Scene'),
      description: tr('适合带入使用环境与生活方式氛围。', 'Places the product into a contextual lifestyle scene.'),
      accentClass: 'border-emerald-400/30 bg-emerald-500/8',
    },
    {
      outputType: 'selling_point',
      title: tr('卖点图', 'Selling Point'),
      description: tr('一张图聚焦一个核心卖点。', 'Keeps each image focused on one key benefit.'),
      accentClass: 'border-amber-400/30 bg-amber-500/10',
    },
    {
      outputType: 'cover',
      title: tr('封面图', 'Cover'),
      description: tr('适合详情页首屏或合集封面。', 'Good for collection covers and top-of-page visuals.'),
      accentClass: 'border-fuchsia-400/30 bg-fuchsia-500/10',
    },
    {
      outputType: 'poster',
      title: tr('海报图', 'Poster'),
      description: tr('适合促销、活动和长画幅传播。', 'Built for campaign posters and long-form promo placements.'),
      accentClass: 'border-orange-400/30 bg-orange-500/10',
    },
  ];

  const getModelCardName = (cardId?: string) => {
    const id = String(cardId || '').trim();
    if (!id) return '';
    return String(galleryModelCards.find((card) => card.id === id)?.name || '').trim();
  };

  const getSceneCardName = (cardId?: string) => {
    const id = String(cardId || '').trim();
    if (!id) return '';
    return String(gallerySceneCards.find((card) => card.id === id)?.name || '').trim();
  };

  const openQuickBatchDialog = () => {
    setGalleryBulkDialogDraft(cloneGalleryBulkConfig(galleryBulkConfig));
    setIsQuickBatchDialogOpen(true);
  };

  const closeQuickBatchDialog = () => {
    setIsQuickBatchDialogOpen(false);
  };

  const galleryBulkDialogPlannedCount = Object.values(galleryBulkDialogDraft.typeSelections).reduce(
    (sum, item) => sum + (item.enabled ? Math.max(0, Math.round(Number(item.count || 0))) : 0),
    0
  );
  const galleryBulkSummaryItems = bulkTypeCards
    .map((card) => {
      const selection = galleryBulkConfig.typeSelections[card.outputType];
      const count = selection?.enabled ? Math.max(0, Math.round(Number(selection.count || 0))) : 0;
      if (count <= 0) return null;
      return tr(`${card.title} ${count} 张`, `${card.title} ${count}`);
    })
    .filter(Boolean) as string[];
  const galleryBulkSummaryPrimary = galleryBulkSummaryItems.length > 0
    ? galleryBulkSummaryItems.join(' · ')
    : tr('未启用任何批量出图类型', 'No batch output types enabled');

  const handleQuickBatchDialogApply = async () => {
    const applied = await handleApplyGalleryBulkConfig(cloneGalleryBulkConfig(galleryBulkDialogDraft));
    if (applied) {
      setIsQuickBatchDialogOpen(false);
    }
  };

  const buildCardConfigFields = (outputType: GalleryOutputItemConfig['outputType']) => {
    const common = [
      {
        key: 'visualFocus',
        label: tr('视觉重点', 'Visual Focus'),
        placeholder: tr('例如：突出材质、肤感、包装细节', 'e.g. emphasize texture, skin feel, packaging details'),
      },
      {
        key: 'compositionHint',
        label: tr('构图补充', 'Composition Hint'),
        placeholder: tr('例如：低机位、近景、留白偏右', 'e.g. low angle, close-up, whitespace on the right'),
      },
      {
        key: 'copyTone',
        label: tr('文案语气', 'Copy Tone'),
        placeholder: tr('例如：专业、温柔、种草感', 'e.g. professional, warm, social-proof tone'),
      },
      {
        key: 'negativeHints',
        label: tr('避坑提示', 'Negative Hints'),
        placeholder: tr('例如：不要悬浮道具、不要强烈镜面反射', 'e.g. avoid floating props, avoid strong mirror reflection'),
      },
    ];

    const typeSpecific =
      outputType === 'selling_point'
        ? [
            {
              key: 'sellingPointText',
              label: tr('聚焦卖点', 'Focused Selling Point'),
              placeholder: tr('例如：72h 持妆、防水不假面', 'e.g. 72h long-wear, waterproof, no cakey finish'),
            },
            {
              key: 'headlineFocus',
              label: tr('标题焦点', 'Headline Focus'),
              placeholder: tr('例如：更适合放大的利益点短句', 'e.g. short benefit statement for headline area'),
            },
          ]
        : outputType === 'scene'
          ? [
              {
                key: 'backgroundStyle',
                label: tr('场景风格', 'Background Style'),
                placeholder: tr('例如：厨房台面、露营草地、浴室石材', 'e.g. kitchen counter, picnic lawn, bathroom stone'),
              },
              {
                key: 'displayAngle',
                label: tr('展示角度', 'Display Angle'),
                placeholder: tr('例如：45 度半俯视、平视近景', 'e.g. 45-degree top angle, eye-level close shot'),
              },
            ]
          : outputType === 'cover'
            ? [
                {
                  key: 'heroStyle',
                  label: tr('主视觉风格', 'Hero Style'),
                  placeholder: tr('例如：高质感、极简、品牌首图感', 'e.g. premium, minimal, hero-cover feel'),
                },
                {
                  key: 'headlineFocus',
                  label: tr('标题焦点', 'Headline Focus'),
                  placeholder: tr('例如：适合封面第一眼识别的信息', 'e.g. first-glance message for cover image'),
                },
              ]
            : outputType === 'poster'
              ? [
                  {
                    key: 'campaignAngle',
                    label: tr('活动角度', 'Campaign Angle'),
                    placeholder: tr('例如：节日促销、礼赠、明星单品', 'e.g. festival promo, gifting, hero product'),
                  },
                  {
                    key: 'promotionTone',
                    label: tr('海报调性', 'Promotion Tone'),
                    placeholder: tr('例如：强促销、轻奢、高端品牌感', 'e.g. hard sale, premium, luxury feel'),
                  },
                  {
                    key: 'copyBlockDensity',
                    label: tr('文案区密度', 'Copy Block Density'),
                    placeholder: tr('例如：大标题+副标题，或多块信息位', 'e.g. large headline + subheadline, or multi-block text zones'),
                  },
                ]
              : [
                  {
                    key: 'displayAngle',
                    label: tr('展示角度', 'Display Angle'),
                    placeholder: tr('例如：正面、45 度、俯拍', 'e.g. front, 45-degree, top shot'),
                  },
                  {
                    key: 'backgroundStyle',
                    label: tr('背景处理', 'Background Treatment'),
                    placeholder: tr('例如：纯白、浅灰渐变、柔和阴影', 'e.g. pure white, light gray gradient, soft shadow'),
                  },
                ];

    return [...common, ...typeSpecific] as Array<{ key: string; label: string; placeholder: string }>;
  };

  return (
    <>
    <div className={`${panelClassName('product_images_gallery')} h-full min-h-0 flex flex-col px-10 py-6`}>
      <div className="flex-1 min-h-0 flex overflow-hidden relative" id="gallery-container">
        <div
          className="flex flex-col gap-3 min-h-0 overflow-y-auto custom-scroll pr-2 shrink-0 transition-colors duration-150 rounded-2xl border border-white/5 bg-white/2 hover:border-orange-500/20"
          style={{ width: `${leftWidth}px`, minWidth: `${GALLERY_PANEL_MIN_WIDTH}px` }}
          data-testid="left-panel"
        >
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-zinc-200">
                {t.wb_product_images_gallery_upload_title || 'Upload Product Images'}
              </div>
              <button
                type="button"
                onClick={handleGalleryAiAnalyze}
                disabled={isGalleryAnalyzing}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 disabled:opacity-60 disabled:hover:bg-zinc-900/70 transition"
              >
                {isGalleryAnalyzing ? tr('填写中...', 'Filling...') : tr('AI帮我填', 'AI Fill')}
              </button>
            </div>

            <div className="mt-3">
              <input
                ref={galleryFileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  appendGalleryFiles(Array.from(e.target.files || []));
                  e.target.value = '';
                }}
              />
              <div
                className="transition-colors"
                onDragEnter={(e) => {
                  preventDragDefaults(e);
                  setIsGalleryDragActive(true);
                }}
                onDragOver={(e) => {
                  preventDragDefaults(e);
                  setIsGalleryDragActive(true);
                }}
                onDragLeave={(e) => {
                  preventDragDefaults(e);
                  setIsGalleryDragActive(false);
                }}
                onDrop={(e) => {
                  preventDragDefaults(e);
                  setIsGalleryDragActive(false);
                  appendGalleryFiles(Array.from(e.dataTransfer.files || []));
                }}
              >
                {galleryImages.length === 0 && galleryRestoredImagePaths.length > 0 ? (
                  <>
                    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300 flex items-center justify-between gap-2">
                      <span>
                        {tr(
                          `已从历史记录恢复 ${galleryRestoredImagePaths.length} 张原始商品图`,
                          `${galleryRestoredImagePaths.length} image(s) restored from history`
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setGalleryRestoredImagePaths([])}
                        className="text-emerald-400 hover:text-emerald-200 shrink-0"
                        title={tr('清除', 'Clear')}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {galleryRestoredImagePaths.map((p: string, idx: number) => (
                        <div key={p} className="relative rounded-xl overflow-hidden border border-emerald-500/20 bg-black/30 aspect-square">
                          <img src={p} className="w-full h-full object-cover" alt={`restored-${idx}`} />
                          <button
                            type="button"
                            onClick={() => setGalleryRestoredImagePaths((prev: string[]) => prev.filter((_, i) => i !== idx))}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 border border-white/10 text-zinc-200 hover:text-white hover:bg-black/80 transition flex items-center justify-center"
                            title={tr('移除', 'Remove')}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {galleryRestoredImagePaths.length < 3 && (
                        <button
                          type="button"
                          onClick={() => galleryFileInputRef.current?.click()}
                          className="group relative rounded-xl border border-dashed border-white/10 bg-black/20 text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition flex items-center justify-center aspect-square"
                          title={tr('上传新图片替换', 'Upload new images to replace')}
                        >
                          <Plus className="w-6 h-6 transition-opacity duration-150 group-hover:opacity-0" />
                          <Upload className="absolute w-6 h-6 opacity-0 transition-opacity duration-150 group-hover:opacity-80" />
                        </button>
                      )}
                    </div>
                  </>
                ) : galleryImages.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => galleryFileInputRef.current?.click()}
                    className={`group mt-3 w-full rounded-2xl border border-dashed px-4 py-10 text-center transition ${isGalleryDragActive
                      ? 'border-orange-500/70 bg-orange-500/10 text-orange-100'
                      : 'border-white/10 bg-black/20 text-zinc-500 hover:text-zinc-300 hover:border-white/20'
                      }`}
                  >
                    <div className="relative w-10 h-10 mx-auto mb-2">
                      <ImageIcon className="w-10 h-10 opacity-50 transition-opacity duration-150 group-hover:opacity-0" />
                      <Upload className="absolute inset-0 w-10 h-10 opacity-0 transition-opacity duration-150 group-hover:opacity-60" />
                    </div>
                    <div className="text-sm font-semibold">{t.pi_gallery_upload_title}</div>
                    <div className="text-[11px] mt-1">
                      {tr('支持拖拽或点击上传，最多 3 张图片', 'Drag and drop or click to upload, up to 3 images')}
                    </div>
                  </button>
                ) : (
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {galleryPreviewUrls.map((url: string, idx: number) => (
                      <div key={url} className="relative rounded-xl overflow-hidden border border-white/10 bg-black/30 aspect-square">
                        <img src={url} className="w-full h-full object-cover" alt={`product-${idx}`} />
                        <button
                          type="button"
                          onClick={() => setGalleryImages((prev: File[]) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 border border-white/10 text-zinc-200 hover:text-white hover:bg-black/80 transition flex items-center justify-center"
                          title="移除"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {galleryImages.length < 3 && (
                      <button
                        type="button"
                        onClick={() => galleryFileInputRef.current?.click()}
                        className="group relative rounded-xl border border-dashed border-white/10 bg-black/20 text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition flex items-center justify-center aspect-square"
                        title="添加图片"
                      >
                        <Plus className="w-6 h-6 transition-opacity duration-150 group-hover:opacity-0" />
                        <Upload className="absolute w-6 h-6 opacity-0 transition-opacity duration-150 group-hover:opacity-80" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-zinc-200">{tr('商品信息', 'Product Info')}</div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <div className="space-y-2">
                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.hist_img_setting_product}</div>
                <input
                  value={galleryProductName}
                  onChange={(e) => setGalleryProductName(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                  placeholder={t.pi_gallery_placeholder_product_name}
                />
              </div>

              <div className="space-y-2">
                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.hist_img_setting_category}</div>
                <input
                  value={galleryCategory}
                  onChange={(e) => setGalleryCategory(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                  placeholder={t.pi_gallery_placeholder_category}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pi_gallery_selling_points_label}</div>
                  <button
                    type="button"
                    onClick={() => setGallerySellingPoints((prev: string[]) => (prev.length >= 5 ? prev : [...prev, '']))}
                    className="px-2 py-1 rounded-lg text-[11px] font-bold border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-60"
                    disabled={gallerySellingPoints.length >= 5}
                  >
                    {t.ui_add}
                  </button>
                </div>
                {gallerySellingPoints.length === 0 ? (
                  <div className="text-xs text-zinc-600">{t.ui_not_filled}</div>
                ) : (
                  <div className="space-y-2">
                    {gallerySellingPoints.map((val: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          value={val}
                          onChange={(e) => setGallerySellingPoints((prev: string[]) => prev.map((p, i) => (i === idx ? e.target.value : p)))}
                          className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                          placeholder={`卖点 ${idx + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => setGallerySellingPoints((prev: string[]) => prev.filter((_, i) => i !== idx))}
                          className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 flex items-center justify-center"
                          title="移除"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>

          <div className="p-5">
            <div className="text-sm font-bold text-zinc-200">{tr('爆款风格分析', 'Hot Style Analysis')}</div>

            {hotStyleLoading ? (
              <div className="mt-3 h-28 rounded-xl border border-white/10 bg-white/5 flex flex-col items-center justify-center gap-3 text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-zinc-400/70 animate-pulse" />
                  <span className="w-2 h-2 rounded-full bg-zinc-400/70 animate-pulse [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-zinc-400/70 animate-pulse [animation-delay:300ms]" />
                </div>
                <div className="text-xs">{tr('爆款风格生成中...', 'Analyzing styles...')}</div>
              </div>
            ) : hotStyleItems.length === 0 ? (
              <>
                <button
                  type="button"
                  onClick={handleHotStyleAnalyze}
                  disabled={!(galleryImages.length > 0 && gallerySellingPoints.some((p: string) => String(p || '').trim()))}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-zinc-300 hover:bg-white/10 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />{tr('爆款风格分析', 'Analyze Hot Styles')}
                </button>
                {!(galleryImages.length > 0 && gallerySellingPoints.some((p: string) => String(p || '').trim())) && (
                  <div className="mt-2 text-[11px] text-zinc-500">{tr('需上传图片并填写核心卖点', 'Upload images and fill selling points first')}</div>
                )}
                {hotStyleError ? <div className="mt-2 text-[11px] text-red-400">{hotStyleError}</div> : null}
              </>
            ) : (
              <>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('风格建议', 'Style Ideas')}</div>
                  <button
                    type="button"
                    onClick={handleHotStyleAnalyze}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
                  >
                    <RotateCw className="w-4 h-4" />{tr('换一批风格', 'Regenerate')}
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {hotStyleItems.map((s: any, idx: number) => {
                    const isSelected = hotStyleSelectedIndex === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setHotStyleSelectedIndex((prev: number | null) => (prev === idx ? null : idx))}
                        className={`relative text-left rounded-xl border bg-black/20 p-3 transition ${isSelected
                          ? 'border-orange-500'
                          : 'border-white/10 hover:border-white/20'
                          }`}
                        title={isSelected ? tr('已选择，再次点击取消', 'Selected. Click again to unselect') : tr('点击选择', 'Click to select')}
                      >
                        <div className="flex items-center gap-1 mb-2">
                          {s.tones.slice(0, 4).map((c: string, i: number) => (
                            <span key={i} className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <div className="text-sm font-bold text-zinc-200">{s.name}</div>
                        <div className="mt-1 text-xs text-zinc-400">{s.description}</div>
                        <div
                          className={`absolute top-2 right-2 w-5 h-5 rounded-md border flex items-center justify-center text-[11px] font-bold ${isSelected
                            ? 'bg-orange-500 border-orange-500 text-black'
                            : 'bg-black/40 border-white/20 text-transparent'
                            }`}
                        >
                          ✓
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div
            ref={modelSectionRef}
            className={`rounded-2xl p-5 transition ${resourceHighlight === 'model' ? 'bg-orange-500/5 ring-1 ring-orange-500/30' : ''}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-zinc-200">{tr('模特资源', 'Model Resources')}</div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  {tr('每张模特卡保留姓名、照片和可选描述，供不同出图卡绑定。', 'Each model card stores a name, photo, and optional notes for output cards to bind.')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  guideGalleryResourceSection('model');
                  addGalleryModelCard();
                }}
                className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800"
              >
                {tr('新增模特', 'Add Model')}
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {galleryModelCards.length === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    guideGalleryResourceSection('model');
                    addGalleryModelCard();
                  }}
                  className="w-full rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-left text-zinc-400 hover:border-orange-500/40 hover:text-zinc-200 transition"
                >
                  <div className="text-sm font-bold">{tr('暂无模特卡片，点击去创建', 'No model cards yet. Click to create one')}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {tr('模特照片为必填，信息描述可选。', 'Model photo is required and the info field is optional.')}
                  </div>
                </button>
              ) : (
                galleryModelCards.map((card) => {
                  const uploadInputId = `gallery-model-upload-${card.id}`;
                  const previewSrc = String(card.imagePreviewUrl || card.imagePath || '').trim();
                  return (
                    <div key={card.id} className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
                      <div className="flex items-center gap-3">
                        <input
                          value={String(card.name || '')}
                          onChange={(e) =>
                            setGalleryModelCards((prev) =>
                              prev.map((item) => (item.id === card.id ? { ...item, name: e.target.value } : item))
                            )
                          }
                          className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                          placeholder={tr('例如：模特1', 'e.g. Model 1')}
                        />
                        <button
                          type="button"
                          onClick={() => removeGalleryModelCard(card.id)}
                          className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 flex items-center justify-center"
                          title={tr('删除模特卡', 'Delete model card')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10 bg-black/30 shrink-0">
                          {previewSrc ? (
                            <img src={previewSrc} className="w-full h-full object-cover" alt={String(card.name || 'model')} />
                          ) : (
                            <label htmlFor={uploadInputId} className="w-full h-full flex items-center justify-center text-zinc-500 hover:text-zinc-300 cursor-pointer">
                              <Upload className="w-5 h-5" />
                            </label>
                          )}
                          {previewSrc ? (
                            <button
                              type="button"
                              onClick={() => clearGalleryModelCardImage(card.id)}
                              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 border border-white/10 text-zinc-200 hover:text-white hover:bg-black/80 transition flex items-center justify-center"
                              aria-label={tr('移除', 'Remove')}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          ) : null}
                        </div>

                        <div className="flex-1 min-w-0">
                          <label
                            htmlFor={uploadInputId}
                            className="inline-flex px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                          >
                            {previewSrc ? tr('更换照片', 'Replace Photo') : tr('上传照片', 'Upload Photo')}
                          </label>
                          <div className="mt-2 text-[11px] text-zinc-500">
                            {tr('模特照片必填，用于商品出镜参考。', 'A model photo is required when the output needs a model reference.')}
                          </div>
                          <input
                            id={uploadInputId}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleGalleryModelCardFileSelection(card.id, Array.from(e.target.files || []))}
                          />
                        </div>
                      </div>

                      <textarea
                        value={String(card.modelInfo || '')}
                        onChange={(e) =>
                          setGalleryModelCards((prev) =>
                            prev.map((item) => (item.id === card.id ? { ...item, modelInfo: e.target.value } : item))
                          )
                        }
                        rows={3}
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
                        placeholder={tr('可选：例如年龄、妆容、发型、服装风格、动作气质等。', 'Optional: e.g. age, makeup, hairstyle, outfit style, pose and mood.')}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div
            ref={sceneSectionRef}
            className={`rounded-2xl p-5 transition ${resourceHighlight === 'scene' ? 'bg-orange-500/5 ring-1 ring-orange-500/30' : ''}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-zinc-200">{tr('场景资源', 'Scene Resources')}</div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  {tr('支持自定义场景，也支持从预设快速创建，再由出图卡按卡片名映射选择。', 'Create scenes from presets or customize them, then bind output cards by scene card name.')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  guideGalleryResourceSection('scene');
                  addGallerySceneCard();
                }}
                className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800"
              >
                {tr('新增场景', 'Add Scene')}
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {gallerySceneCards.length === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    guideGalleryResourceSection('scene');
                    addGallerySceneCard();
                  }}
                  className="w-full rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-left text-zinc-400 hover:border-orange-500/40 hover:text-zinc-200 transition"
                >
                  <div className="text-sm font-bold">{tr('暂无场景卡片，点击去创建', 'No scene cards yet. Click to create one')}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {tr('可从预设开始，也可直接填写自己的主题、氛围和道具。', 'Start from a preset or directly fill your own theme, mood, and props.')}
                  </div>
                </button>
              ) : (
                gallerySceneCards.map((card) => (
                  <div key={card.id} className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <input
                        value={String(card.name || '')}
                        onChange={(e) =>
                          setGallerySceneCards((prev) =>
                            prev.map((item) => (item.id === card.id ? { ...item, name: e.target.value } : item))
                          )
                        }
                        className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                        placeholder={tr('例如：场景1', 'e.g. Scene 1')}
                      />
                      <button
                        type="button"
                        onClick={() => removeGallerySceneCard(card.id)}
                        className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 flex items-center justify-center"
                        title={tr('删除场景卡', 'Delete scene card')}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('预设场景', 'Preset Scene')}</div>
                      <DropdownSelect
                        value={String(card.presetId || 'custom')}
                        options={[
                          { value: 'custom', label: tr('自定义', 'Custom') },
                          ...GALLERY_SCENE_PRESETS.map((item: any) => ({ value: item.id, label: item.name })),
                        ]}
                        onChange={(value) => {
                          const presetId = String(value || 'custom');
                          setGallerySceneCards((prev) =>
                            prev.map((item) => {
                              if (item.id !== card.id) return item;
                              if (presetId === 'custom') {
                                return { ...item, sourceMode: 'custom', presetId: '' };
                              }
                              return {
                                ...item,
                                sourceMode: 'preset',
                                presetId,
                                sceneConfig: applyGalleryScenePresetToCard(presetId),
                              };
                            })
                          );
                        }}
                        buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                        iconClassName="w-4 h-4 text-zinc-500"
                        optionClassName="text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('场景主题', 'Scene Theme')}</div>
                        <input
                          type="text"
                          value={String(card.sceneConfig?.sceneTheme || '')}
                          onChange={(e) =>
                            setGallerySceneCards((prev) =>
                              prev.map((item) => (
                                item.id === card.id ? { ...item, sceneConfig: { ...item.sceneConfig, sceneTheme: e.target.value } } : item
                              ))
                            )
                          }
                          className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
                          placeholder={tr('例如：现代厨房台面', 'e.g. modern kitchen counter')}
                        />
                      </label>
                      <label className="space-y-1">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('氛围', 'Mood')}</div>
                        <input
                          type="text"
                          value={String(card.sceneConfig?.mood || '')}
                          onChange={(e) =>
                            setGallerySceneCards((prev) =>
                              prev.map((item) => (
                                item.id === card.id ? { ...item, sceneConfig: { ...item.sceneConfig, mood: e.target.value } } : item
                              ))
                            )
                          }
                          className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
                          placeholder={tr('例如：清新、日常、轻奢', 'e.g. fresh, everyday, premium')}
                        />
                      </label>
                    </div>

                    <label className="space-y-1">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('场景描述', 'Scene Description')}</div>
                      <textarea
                        value={String(card.sceneConfig?.sceneDescription || '')}
                        onChange={(e) =>
                          setGallerySceneCards((prev) =>
                            prev.map((item) => (
                              item.id === card.id ? { ...item, sceneConfig: { ...item.sceneConfig, sceneDescription: e.target.value } } : item
                            ))
                          )
                        }
                        rows={2}
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
                        placeholder={tr('描述环境、背景和商品所在位置。', 'Describe the environment, background, and where the product sits.')}
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('道具', 'Props')}</div>
                        <input
                          type="text"
                          value={String(card.sceneConfig?.sceneProps || '')}
                          onChange={(e) =>
                            setGallerySceneCards((prev) =>
                              prev.map((item) => (
                                item.id === card.id ? { ...item, sceneConfig: { ...item.sceneConfig, sceneProps: e.target.value } } : item
                              ))
                            )
                          }
                          className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
                          placeholder={tr('例如：玻璃杯、花束、毛巾', 'e.g. glass cup, flowers, towel')}
                        />
                      </label>
                      <label className="space-y-1">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('光线', 'Lighting')}</div>
                        <input
                          type="text"
                          value={String(card.sceneConfig?.lighting || '')}
                          onChange={(e) =>
                            setGallerySceneCards((prev) =>
                              prev.map((item) => (
                                item.id === card.id ? { ...item, sceneConfig: { ...item.sceneConfig, lighting: e.target.value } } : item
                              ))
                            )
                          }
                          className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
                          placeholder={tr('例如：侧前方柔光', 'e.g. soft side-front light')}
                        />
                      </label>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <ResizableSplitter
          position={leftWidth}
          minSize={GALLERY_PANEL_MIN_WIDTH}
          onResize={handleLeftResize}
          orientation="vertical"
          className="hover:bg-orange-500/20"
        />

        <div
          className="flex flex-col gap-4 min-h-0 overflow-y-auto custom-scroll pr-2 shrink-0 transition-[width] duration-100 border border-transparent hover:border-orange-500/20"
          style={{ width: `${middleWidth}px`, minWidth: `${GALLERY_PANEL_MIN_WIDTH}px` }}
          data-testid="middle-panel"
        >
          <div className="rounded-2xl border border-white/5 bg-white/2 p-5 flex flex-col flex-1">
            <div className="text-sm font-bold text-zinc-200 shrink-0">{t.hist_img_settings_title}</div>

            <div className="mt-4 p-4 rounded-xl border border-white/10 bg-black/20 space-y-6 flex-1">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-bold text-zinc-200">{t.pi_gallery_settings_section_basics}</div>
                  <button
                    type="button"
                    onClick={() => setIsBasicsCollapsed((prev) => !prev)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"
                    aria-label={isBasicsCollapsed ? tr('展开基础配置', 'Expand Basics') : tr('收起基础配置', 'Collapse Basics')}
                    title={isBasicsCollapsed ? tr('展开基础配置', 'Expand Basics') : tr('收起基础配置', 'Collapse Basics')}
                  >
                    <ChevronLeft className={`h-4 w-4 transition-transform ${isBasicsCollapsed ? '-rotate-90' : 'rotate-90'}`} />
                  </button>
                </div>
                {!isBasicsCollapsed ? (
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.hist_img_setting_scene}</div>
                    <DropdownSelect
                      value={galleryTargetScene}
                      options={[
                        { value: 'detail', label: t.pi_gallery_target_scene_detail },
                        { value: 'xiaohongshu', label: t.pi_gallery_target_scene_xiaohongshu },
                        { value: 'douyin', label: t.pi_gallery_target_scene_douyin },
                        { value: 'poster', label: t.pi_gallery_target_scene_poster },
                        { value: 'ads', label: t.pi_gallery_target_scene_ads },
                      ]}
                      onChange={(v) => setGalleryTargetScene(v as any)}
                      buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                      iconClassName="w-4 h-4 text-zinc-500"
                      optionClassName="text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.hist_img_setting_style}</div>
                    <DropdownSelect
                      value={galleryStyle}
                      options={[
                        { value: 'ecom_clean', label: t.pi_gallery_style_ecom_clean },
                        { value: 'lifestyle', label: t.pi_gallery_style_lifestyle },
                        { value: 'premium', label: t.pi_gallery_style_premium },
                        { value: 'festival', label: t.pi_gallery_style_festival },
                      ]}
                      onChange={(v) => setGalleryStyle(v as any)}
                      buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                      iconClassName="w-4 h-4 text-zinc-500"
                      optionClassName="text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pi_gallery_copy_language_label}</div>
                    <DropdownSelect
                      value={galleryCopyLanguage}
                      options={GALLERY_COPY_LANGUAGE_OPTIONS.map((opt: any) => ({ value: opt.value, label: t[opt.labelKey] }))}
                      onChange={(v) => setGalleryCopyLanguage(String(v || 'en'))}
                      buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                      iconClassName="w-4 h-4 text-zinc-500"
                      optionClassName="text-xs"
                    />
                  </div>
                </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={openQuickBatchDialog}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm font-bold text-orange-200 transition hover:bg-orange-500/15"
              >
                <Sparkles className="h-4 w-4" />
                {tr('快速批量', 'Quick Batch')}
              </button>

              <div className="hidden">
                {tr('模特和场景统一在左侧资源区维护。这里的出图卡只负责选择映射关系，并补充当前卡片的辅助生成信息。', 'Model and scene resources are managed on the left. Output cards here only choose bindings and provide card-specific generation hints.')}
              </div>

              <div className="rounded-2xl border border-orange-500/20 bg-[linear-gradient(180deg,rgba(249,115,22,0.06),rgba(17,24,39,0.1))] p-4">
                <div className="text-xs font-bold text-zinc-100">{tr('快速批量摘要', 'Quick Batch Summary')}</div>
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                  <div className="text-sm font-bold text-zinc-100">
                    {galleryBulkSummaryPrimary}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openGalleryAiOutputPlanner}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition ${
                    galleryOutputMode === 'ai'
                      ? 'border-orange-400/50 bg-orange-500/15 text-orange-100 shadow-[0_0_20px_rgba(249,115,22,0.14)]'
                      : 'border-orange-500/30 bg-orange-500/10 text-orange-200 hover:bg-orange-500/15'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {tr('AI 推荐组合', 'AI Recommended Mix')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleGalleryAiLayoutSuggestions();
                  }}
                  disabled={isGalleryAiLayoutDesigning || galleryAdvancedItemCount <= 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-zinc-100 transition hover:bg-white/10 disabled:opacity-50"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  {isGalleryAiLayoutDesigning ? tr('设计中...', 'Designing...') : tr('AI帮我设计', 'AI Design For Me')}
                </button>
                <button
                  type="button"
                  onClick={openGalleryAiLayoutPromptDialog}
                  disabled={isGalleryAiLayoutDesigning || galleryAdvancedItemCount <= 0}
                  className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] font-bold text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
                >
                  {tr('高级设置', 'Advanced Settings')}
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-zinc-200">{tr('高级编辑', 'Advanced Editing')}</div>
                    <div className="mt-1 text-[11px] leading-5 text-zinc-500">
                      {galleryAdvancedDirty
                        ? tr('当前列表已经手动微调，以下设置会直接影响最终逐张出图。', 'This list has been manually tuned. Changes below directly affect each final output card.')
                        : tr('当前列表来自快速批量或 AI 推荐，需要时再按张微调。', 'This list currently comes from Quick Batch or AI recommendations. Fine-tune only when needed.')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {galleryAdvancedDirty ? (
                      <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-200">
                        {tr('已微调', 'Adjusted')}
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                        {galleryOutputMode === 'ai' ? tr('AI推荐', 'AI Mix') : tr('批量默认', 'Batch Default')}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsGalleryAdvancedEditingCollapsed((prev) => !prev)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"
                      aria-label={isGalleryAdvancedEditingCollapsed ? tr('展开高级编辑', 'Expand Advanced Editing') : tr('收起高级编辑', 'Collapse Advanced Editing')}
                      title={isGalleryAdvancedEditingCollapsed ? tr('展开高级编辑', 'Expand Advanced Editing') : tr('收起高级编辑', 'Collapse Advanced Editing')}
                    >
                      <ChevronLeft className={`h-4 w-4 transition-transform ${isGalleryAdvancedEditingCollapsed ? '-rotate-90' : 'rotate-90'}`} />
                    </button>
                  </div>
                </div>

                {isGalleryAdvancedEditingCollapsed ? (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-[11px] text-zinc-500">
                    {galleryAdvancedItemCount > 0
                      ? tr(`已配置 ${galleryAdvancedItemCount} 条出图条目，展开后可按张调整。`, `${galleryAdvancedItemCount} output items configured. Expand to edit per card.`)
                      : tr('当前还没有逐张出图条目。先用快速批量生成一组，再进入高级编辑。', 'No per-card output items yet. Generate a batch first, then open Advanced Editing.')}
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {galleryOutputItems.map((item) => {
                      const supportsResourceBinding = item.outputType !== 'white_bg';
                      const selectedModelName = getModelCardName(item.modelCardId);
                      const selectedSceneName = getSceneCardName(item.sceneCardId);
                      const extraConfigFields = buildCardConfigFields(item.outputType);
                      return (
                      <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-xs text-zinc-200">
                            <input
                              type="checkbox"
                              checked={Boolean(item.enabled)}
                              onChange={(e) => updateOutputItem(item.id, (current) => ({ ...current, enabled: e.target.checked }))}
                              className="accent-orange-500"
                            />
                            <span className="font-bold">{tr('启用', 'Enabled')}</span>
                          </label>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => undefined}
                              className="hidden"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              {galleryOptimizingItemIds[item.id] ? tr('优化中...', 'Optimizing...') : tr('AI优化', 'AI Optimize')}
                            </button>

                            <button
                              type="button"
                              onClick={() => mutateAdvancedOutputItems((prev) => prev.filter((it) => it.id !== item.id))}
                              className="w-8 h-8 rounded-lg border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 flex items-center justify-center"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <DropdownSelect
                            value={String(item.outputType || 'white_bg')}
                            options={[
                              { value: 'white_bg', label: t.pi_gallery_output_white_bg },
                              { value: 'scene', label: t.pi_gallery_output_scene },
                              { value: 'selling_point', label: t.pi_gallery_output_selling_point },
                              { value: 'cover', label: t.pi_gallery_output_cover },
                              { value: 'poster', label: t.pi_gallery_output_poster },
                            ]}
                            onChange={(v) =>
                              mutateAdvancedOutputItems((prev) =>
                                prev.map((it) => {
                                  if (it.id !== item.id) return it;
                                  const raw = String(v || 'white_bg');
                                  const next =
                                    raw === 'scene' || raw === 'selling_point' || raw === 'cover' || raw === 'poster'
                                      ? raw
                                      : 'white_bg';
                                  return {
                                    ...it,
                                    outputType: next as any,
                                    modelCardId: next === 'white_bg' ? undefined : it.modelCardId,
                                    sceneCardId: next === 'white_bg' ? undefined : it.sceneCardId,
                                  };
                                })
                              )
                            }
                            buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                            iconClassName="w-4 h-4 text-zinc-500"
                            optionClassName="text-xs"
                          />
                          <DropdownSelect
                            value={String(item.aspectRatio || '1:1')}
                            options={[
                              { value: '21:9', label: `${t.pi_gallery_ratio_group_landscape} · ${t.pi_gallery_ratio_21_9}` },
                              { value: '16:9', label: `${t.pi_gallery_ratio_group_landscape} · ${t.pi_gallery_ratio_16_9}` },
                              { value: '4:3', label: `${t.pi_gallery_ratio_group_landscape} · ${t.pi_gallery_ratio_4_3}` },
                              { value: '3:2', label: `${t.pi_gallery_ratio_group_landscape} · ${t.pi_gallery_ratio_3_2}` },
                              { value: '1:1', label: `${t.pi_gallery_ratio_group_square} · ${t.pi_gallery_ratio_1_1}` },
                              { value: '9:16', label: `${t.pi_gallery_ratio_group_vertical} · ${t.pi_gallery_ratio_9_16}` },
                              { value: '3:4', label: `${t.pi_gallery_ratio_group_vertical} · ${t.pi_gallery_ratio_3_4}` },
                              { value: '2:3', label: `${t.pi_gallery_ratio_group_vertical} · ${t.pi_gallery_ratio_2_3}` },
                              { value: '5:4', label: `${t.pi_gallery_ratio_group_flexible} · ${t.pi_gallery_ratio_5_4}` },
                              { value: '4:5', label: `${t.pi_gallery_ratio_group_flexible} · ${t.pi_gallery_ratio_4_5}` },
                            ]}
                            onChange={(v) => updateOutputItem(item.id, (current) => ({ ...current, aspectRatio: String(v || '1:1') }))}
                            buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                            iconClassName="w-4 h-4 text-zinc-500"
                            optionClassName="text-xs"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <DropdownSelect
                            value={String(item.resolution || '1k')}
                            options={[
                              { value: '1k', label: '1K' },
                              { value: '2k', label: '2K' },
                              { value: '4k', label: '4K' },
                            ]}
                            onChange={(v) =>
                              updateOutputItem(item.id, (current) => {
                                const raw = String(v || '1k').toLowerCase();
                                const resolution = raw === '2k' || raw === '4k' ? raw : '1k';
                                return { ...current, resolution: resolution as any };
                              })
                            }
                            buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                            iconClassName="w-4 h-4 text-zinc-500"
                            optionClassName="text-xs"
                          />

                          <div className="flex items-center justify-end">
                            <div className="flex items-center">
                              <button
                                type="button"
                                onClick={() => updateOutputItem(item.id, (current) => ({ ...current, count: Math.max(1, Number(current.count || 1) - 1) }))}
                                disabled={!item.enabled || Number(item.count || 1) <= 1}
                                className="w-8 h-8 rounded-l-lg border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 disabled:opacity-50 flex items-center justify-center"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <div className="w-10 h-8 flex items-center justify-center border-t border-b border-white/10 bg-black/30 text-xs text-zinc-200">
                                {Number(item.count || 1)}
                              </div>
                              <button
                                type="button"
                                onClick={() => updateOutputItem(item.id, (current) => ({ ...current, count: Math.min(8, Number(current.count || 1) + 1) }))}
                                disabled={!item.enabled || Number(item.count || 1) >= 8}
                                className="w-8 h-8 rounded-r-lg border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 disabled:opacity-50 flex items-center justify-center"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {supportsResourceBinding ? (
                          <div className="w-full">
                            <div className="hidden">{tr('资源映射', 'Resource Binding')}</div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('模特', 'Model')}</div>
                                {galleryModelCards.length > 0 ? (
                                  <>
                                    <DropdownSelect
                                      value={String(item.modelCardId || '')}
                                      options={[
                                        { value: '', label: tr('不使用模特', 'No Model') },
                                        ...galleryModelCards.map((card) => ({ value: card.id, label: card.name || card.id })),
                                      ]}
                                      onChange={(value) => updateOutputItem(item.id, (current) => ({ ...current, modelCardId: String(value || '') || undefined }))}
                                      buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                                      iconClassName="w-4 h-4 text-zinc-500"
                                      optionClassName="text-xs"
                                    />
                                    <div className="hidden">
                                      {item.modelCardId && !selectedModelName
                                        ? tr('已绑定的模特卡不存在，请重新选择。', 'The bound model card no longer exists. Please reselect it.')
                                        : selectedModelName
                                          ? tr(`当前映射：${selectedModelName}`, `Current binding: ${selectedModelName}`)
                                          : tr('未绑定模特卡', 'No model card bound')}
                                    </div>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      guideGalleryResourceSection('model');
                                      addGalleryModelCard();
                                    }}
                                    className="w-full rounded-xl border border-dashed border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs font-bold text-orange-200 hover:bg-orange-500/10 transition"
                                  >
                                    {tr('暂无模特卡，去创建', 'No model cards. Create one')}
                                  </button>
                                )}
                              </div>

                              <div className="space-y-1">
                                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('场景', 'Scene')}</div>
                                {gallerySceneCards.length > 0 ? (
                                  <>
                                    <DropdownSelect
                                      value={String(item.sceneCardId || '')}
                                      options={[
                                        { value: '', label: tr('不使用场景', 'No Scene') },
                                        ...gallerySceneCards.map((card) => ({ value: card.id, label: card.name || card.id })),
                                      ]}
                                      onChange={(value) => updateOutputItem(item.id, (current) => ({ ...current, sceneCardId: String(value || '') || undefined }))}
                                      buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                                      iconClassName="w-4 h-4 text-zinc-500"
                                      optionClassName="text-xs"
                                    />
                                    <div className="hidden">
                                      {item.sceneCardId && !selectedSceneName
                                        ? tr('已绑定的场景卡不存在，请重新选择。', 'The bound scene card no longer exists. Please reselect it.')
                                        : selectedSceneName
                                          ? tr(`当前映射：${selectedSceneName}`, `Current binding: ${selectedSceneName}`)
                                          : tr('未绑定场景卡', 'No scene card bound')}
                                    </div>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      guideGalleryResourceSection('scene');
                                      addGallerySceneCard();
                                    }}
                                    className="w-full rounded-xl border border-dashed border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs font-bold text-orange-200 hover:bg-orange-500/10 transition"
                                  >
                                    {tr('暂无场景卡，去创建', 'No scene cards. Create one')}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {(() => {
                          const layoutsArr = Array.isArray(item.layouts) ? item.layouts : [];
                          const totalVariants = layoutsArr.length;
                          const clampedIndex = totalVariants > 0
                            ? Math.min(Math.max(0, Number(item.layoutIndex ?? 0)), totalVariants - 1)
                            : 0;
                          const currentLayout = totalVariants > 0
                            ? String(layoutsArr[clampedIndex] ?? '')
                            : String(item.layout || '');
                          const handleLayoutChange = (nextText: string) => {
                            updateOutputItem(item.id, (current) => {
                              const prevLayouts = Array.isArray(current.layouts) ? current.layouts : [];
                              const prevIdx = prevLayouts.length > 0
                                ? Math.min(Math.max(0, Number(current.layoutIndex ?? 0)), prevLayouts.length - 1)
                                : 0;
                              let nextLayouts: string[];
                              if (prevLayouts.length > 0) {
                                nextLayouts = prevLayouts.map((txt, idx) => (idx === prevIdx ? nextText : txt));
                              } else {
                                nextLayouts = nextText ? [nextText] : [];
                              }
                              return {
                                ...current,
                                layout: nextText,
                                layouts: nextLayouts,
                                layoutIndex: nextLayouts.length > 0 ? Math.min(prevIdx, nextLayouts.length - 1) : 0,
                              };
                            });
                          };
                          const goVariant = (delta: number) => {
                            updateOutputItem(item.id, (current) => {
                              const prevLayouts = Array.isArray(current.layouts) ? current.layouts : [];
                              if (prevLayouts.length <= 1) return current;
                              const prevIdx = Math.min(Math.max(0, Number(current.layoutIndex ?? 0)), prevLayouts.length - 1);
                              const nextIdx = Math.min(prevLayouts.length - 1, Math.max(0, prevIdx + delta));
                              return {
                                ...current,
                                layoutIndex: nextIdx,
                                layout: prevLayouts[nextIdx] ?? current.layout,
                              };
                            });
                          };
                          return (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">
                                  {tr('构图描述', 'Layout')}
                                </div>
                                {totalVariants > 1 ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => goVariant(-1)}
                                      disabled={clampedIndex <= 0}
                                      className="h-6 w-6 rounded-md border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 flex items-center justify-center disabled:opacity-40"
                                      aria-label={tr('上一份构图', 'Previous layout')}
                                      title={tr('上一份构图', 'Previous layout')}
                                    >
                                      <ChevronLeft className="h-3.5 w-3.5" />
                                    </button>
                                    <span className="min-w-[2.5rem] text-center text-[11px] font-bold tabular-nums text-zinc-300">
                                      {`${clampedIndex + 1}/${totalVariants}`}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => goVariant(1)}
                                      disabled={clampedIndex >= totalVariants - 1}
                                      className="h-6 w-6 rounded-md border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 flex items-center justify-center disabled:opacity-40"
                                      aria-label={tr('下一份构图', 'Next layout')}
                                      title={tr('下一份构图', 'Next layout')}
                                    >
                                      <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                              <textarea
                                value={currentLayout}
                                onChange={(e) => handleLayoutChange(e.target.value)}
                                rows={3}
                                className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
                                placeholder={tr(
                                  '例如：商品居中偏下，顶部留白放主标题；右侧留白放 3 条卖点 bullet；底部留白放品牌/规格信息（不要生成可读文字）。',
                                  'E.g. Product centered lower; top whitespace for headline; right whitespace for bullet points; bottom whitespace for brand/specs (no readable text).'
                                )}
                              />
                            </div>
                          );
                        })()}

                        <div className="hidden">
                          {extraConfigFields.map((field) => (
                            <label key={`${item.id}-${field.key}`} className="space-y-1">
                              <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{field.label}</div>
                              <input
                                type="text"
                                value={String((item.cardConfig as any)?.[field.key] || '')}
                                onChange={(e) =>
                                  updateOutputItem(item.id, (current) => ({
                                    ...current,
                                    cardConfig: {
                                      ...(current.cardConfig || {}),
                                      [field.key]: e.target.value,
                                    },
                                  }))
                                }
                                className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
                                placeholder={field.placeholder}
                              />
                            </label>
                          ))}
                        </div>

                        {false ? (
                          <div className="text-[11px] text-zinc-500 space-y-1">
                            {item.title ? <div>{`${tr('方案', 'Title')}: ${String(item.title)}`}</div> : null}
                            {item.copy?.headline ? <div>{`${tr('文案', 'Copy')}: ${String(item.copy?.headline)}`}</div> : null}
                            {item.notes ? <div>{`${tr('备注', 'Notes')}: ${String(item.notes)}`}</div> : null}
                          </div>
                        ) : null}
                      </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() =>
                        mutateAdvancedOutputItems((prev) => [
                          ...prev,
                          { id: `pg-out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, enabled: true, outputType: 'white_bg', aspectRatio: '1:1', resolution: '1k', count: 1, layout: '', layouts: [], layoutIndex: 0 },
                        ])
                      }
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10 transition"
                    >
                      {tr('添加条目', 'Add Item')}
                    </button>
                  </div>
                )}
              </div>

            </div>

            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={handleGalleryGenerate}
                disabled={isGalleryGenerating}
                className="grid w-full grid-cols-[1fr_auto_1fr] items-center rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-black transition hover:bg-orange-400 disabled:opacity-60 disabled:hover:bg-orange-500"
              >
                <span aria-hidden="true" className="min-w-0" />
                <span className="inline-flex min-w-0 items-center justify-center gap-2 justify-self-center text-center">
                  <Wand2 className="h-4 w-4 shrink-0" />
                  {isGalleryGenerating ? tr('生成中...', 'Generating...') : tr('开始生成', 'Generate')}
                </span>
                <span className="justify-self-end self-center pr-0.5 text-right">
                  {!isGalleryGenerating && galleryEstimatedCost > 0 ? (
                    <span className="whitespace-nowrap text-[10px] font-semibold tabular-nums text-black/75">
                      {`-${galleryEstimatedCost} ${tr('V点', 'V-points')}`}
                    </span>
                  ) : null}
                </span>
              </button>
            </div>
          </div>
        </div>

        <ResizableSplitter
          position={middleWidth}
          minSize={GALLERY_PANEL_MIN_WIDTH}
          onResize={handleMiddleResize}
          orientation="vertical"
          className="hover:bg-orange-500/20"
        />

        <div
          className="flex-1 rounded-2xl border border-white/5 bg-white/2 p-5 flex flex-col min-h-0 overflow-hidden border border-transparent hover:border-orange-500/20"
          style={{ minWidth: `${GALLERY_PANEL_MIN_WIDTH}px` }}
          data-testid="right-panel"
        >
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-zinc-200">
              {galleryRightPanel === 'preview' ? tr('预览区', 'Preview') : tr('历史记录', 'History')}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openGalleryBoardEditor}
                className="px-3 py-2 rounded-xl text-xs font-bold transition border border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/15 inline-flex items-center gap-2"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                {tr('画板编辑', 'Board')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setGalleryRightPanel('preview');
                  setIsGalleryHistoryManaging(false);
                  setGalleryHistorySelectedKeys([]);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition border ${galleryRightPanel === 'preview'
                  ? 'bg-orange-500/10 border-orange-500 text-orange-300'
                  : 'bg-zinc-900/70 border-white/10 text-zinc-200 hover:bg-zinc-800'
                  }`}
              >
                {tr('预览区', 'Preview')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setGalleryRightPanel('history');
                  setIsGalleryHistoryManaging(false);
                  setGalleryHistorySelectedKeys([]);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition border ${galleryRightPanel === 'history'
                  ? 'bg-orange-500/10 border-orange-500 text-orange-300'
                  : 'bg-zinc-900/70 border-white/10 text-zinc-200 hover:bg-zinc-800'
                  }`}
              >
                {tr('历史记录', 'History')}
              </button>
            </div>
          </div>

          {galleryRightPanel === 'preview' ? (
            <div className="flex-1 min-h-0 mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 overflow-y-auto custom-scroll">
              {galleryPreviewItems.length === 0 ? (
                <div className="h-full flex items-center justify-center p-6">
                  <div className="w-full max-w-[560px] aspect-square rounded-2xl border border-white/10 bg-black/20 flex flex-col items-center justify-center text-zinc-500 gap-3">
                    <ImageIcon className="w-10 h-10 opacity-60" />
                    <div className="text-sm font-semibold text-zinc-400">
                      {tr('等待生成...', 'Waiting for generation...')}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 grid grid-cols-2 gap-3">
                  {galleryPreviewItems.map((item: any) => {
                    const outputType = String(item.outputType || '').trim();
                    const outputTypeLabel =
                      outputType === 'white_bg'
                        ? t.pi_gallery_output_white_bg
                        : outputType === 'scene'
                          ? t.pi_gallery_output_scene
                          : outputType === 'selling_point'
                            ? t.pi_gallery_output_selling_point
                            : outputType === 'cover'
                              ? t.pi_gallery_output_cover
                              : outputType === 'poster'
                                ? t.pi_gallery_output_poster
                                : '';
                    const rightLabel = String(outputTypeLabel || '').trim() || (outputType ? outputType : item.requestId.slice(0, 8));
                    const statusLabel =
                      item.status === 'succeeded'
                        ? tr('已完成', 'Done')
                        : item.status === 'failed'
                          ? tr('失败', 'Failed')
                          : tr('生成中', 'Generating');
                    const badgeTone =
                      item.status === 'succeeded'
                        ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
                        : item.status === 'failed'
                          ? 'bg-red-500/15 text-red-200 border-red-500/30'
                          : 'bg-orange-500/15 text-orange-200 border-orange-500/30';

                    return (
                      <div
                        key={item.localId}
                        className="group rounded-xl border border-white/10 bg-black/20 overflow-hidden shadow-sm transition-all duration-200 ease-out hover:-translate-y-1 hover:border-indigo-500 hover:ring-1 hover:ring-indigo-500/50 hover:shadow-xl"
                      >
                        <div className="relative w-full aspect-square border-b border-white/10 bg-black/30">
                          {item.imageUrl ? (
                            <button
                              type="button"
                              onClick={() => openGalleryImagePreview(item.imageUrl as string, { kind: 'preview_item', localId: item.localId })}
                              className="absolute inset-0 relative"
                              title={tr('点击预览', 'Click to preview')}
                            >
                              <img src={item.imageUrl} className="w-full h-full object-cover" alt={item.requestId} />
                              <div className="absolute inset-0 opacity-0 transition-opacity duration-200 bg-black/40 flex items-center justify-center group-hover:opacity-100">
                                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs font-bold text-white">
                                  <Eye className="w-4 h-4" />
                                  {tr('预览', 'Preview')}
                                </div>
                              </div>
                            </button>
                          ) : item.status !== 'failed' ? (
                            <GalleryLoadingCard
                              theme={galleryLoadingTheme}
                              seed={`${item.localId}-${item.requestId}-${rightLabel}`}
                              label={rightLabel}
                              backgroundImageSrc={galleryLoadingBackgroundSrc}
                            />
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 gap-2">
                              <ImageIcon className={`w-8 h-8 ${item.status === 'failed' ? 'opacity-50' : 'opacity-60 animate-pulse'}`} />
                              <div className="text-xs text-zinc-500 px-4 text-center">
                                {item.error || (item.status === 'failed' ? tr('生成失败', 'Failed') : tr('等待生成...', 'Waiting...'))}
                              </div>
                            </div>
                          )}

                          <div className={`absolute top-2 left-2 px-2 py-1 rounded-lg text-[11px] font-bold border ${badgeTone}`}>{statusLabel}</div>
                          <div className="absolute top-2 right-2 px-2 py-1 rounded-lg text-[11px] font-bold border border-white/10 bg-black/50 text-zinc-200">
                            {rightLabel}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 overflow-y-auto custom-scroll">
              {galleryHistoryItems.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                  {tr('暂无历史记录', 'No history yet')}
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {galleryHistoryItems
                    .slice()
                    .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1))
                    .map((item: any) => (
                      <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                        <div className="px-3 py-2 text-[11px] text-zinc-400 border-b border-white/10 bg-black/30 flex items-center justify-between">
                          <span>{item.createdAt}</span>
                          <span className="text-zinc-500">{item.images.length} {tr('张', 'imgs')}</span>
                        </div>
                        <div className="p-3 grid grid-cols-4 gap-2">
                          {item.images.slice(0, 4).map((url: string, idx: number) => {
                            const outputType = (() => {
                              const imageUrl = String(url || '').trim();
                              const metadata = (item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata))
                                ? item.metadata
                                : {};

                              const outputTypesByUrl = (metadata as any).outputTypesByUrl;
                              if (outputTypesByUrl && typeof outputTypesByUrl === 'object') {
                                const mapped = String((outputTypesByUrl as any)[imageUrl] || '').trim();
                                if (mapped) return mapped;
                              }

                              const imageTypes = Array.isArray((metadata as any).imageTypes) ? (metadata as any).imageTypes : [];
                              if (idx >= 0 && idx < imageTypes.length) {
                                const mapped = String(imageTypes[idx] || '').trim();
                                if (mapped) return mapped;
                              }

                              const outputImages = Array.isArray((metadata as any).outputImages) ? (metadata as any).outputImages : [];
                              if (outputImages.length > 0) {
                                const matched = outputImages.find((img: any) => {
                                  const rowUrl = String(img?.imageUrl || img?.downloadUrl || img?.url || img?.preview_url || img?.image_url || '').trim();
                                  return rowUrl && rowUrl === imageUrl;
                                });
                                const mapped = String(matched?.outputType || matched?.output_type || matched?.category || matched?.type || '').trim();
                                if (mapped) return mapped;
                              }

                              const maybeResults = (metadata as any).results || (metadata as any).items || (metadata as any).outputs;
                              const results = Array.isArray(maybeResults) ? maybeResults : [];
                              if (results.length > 0) {
                                const matched = results.find((row: any) => {
                                  const rowUrl = String(row?.preview_url || row?.image_url || row?.url || row?.src || '').trim();
                                  return rowUrl && rowUrl === imageUrl;
                                });
                                const mapped = String(matched?.outputType || matched?.output_type || matched?.type || matched?.category || '').trim();
                                if (mapped) return mapped;
                              }

                              const selections = item.settings?.typeSelections;
                              if (selections && typeof selections === 'object') {
                                const enabledKeys = Object.entries(selections)
                                  .filter(([, value]) => Boolean((value as any)?.enabled) && Number((value as any)?.count || 0) > 0)
                                  .map(([key]) => key);
                                if (enabledKeys.length === 1) return enabledKeys[0];
                                if (enabledKeys.length > 1) return tr('多种', 'Multiple');
                              }

                              return '';
                            })();

                            const outputTypeLabel =
                              outputType === 'white_bg'
                                ? t.pi_gallery_output_white_bg
                                : outputType === 'scene'
                                  ? t.pi_gallery_output_scene
                                  : outputType === 'selling_point'
                                    ? t.pi_gallery_output_selling_point
                                    : outputType === 'cover'
                                      ? t.pi_gallery_output_cover
                                      : outputType === 'poster'
                                        ? t.pi_gallery_output_poster
                                        : '';
                            const typeLabel = String(outputTypeLabel || '').trim() || (outputType ? outputType : '');

                            return (
                              <button
                                type="button"
                                key={`${item.id}-${idx}`}
                                onClick={() => openGalleryImagePreview(url, { kind: 'history_item', itemId: item.id, index: idx })}
                                className="relative rounded-lg overflow-hidden border border-white/10 bg-black/30 aspect-square cursor-pointer"
                                title={tr('点击预览', 'Click to preview')}
                              >
                                <img src={url} className="w-full h-full object-cover" alt={`history-${item.id}-${idx}`} />
                                {typeLabel ? (
                                  <div className="absolute top-1 left-1 pointer-events-none rounded-md border border-white/10 bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-zinc-200">
                                    {typeLabel}
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                          {item.images.length > 4 && (
                            <div className="rounded-lg border border-white/10 bg-black/30 aspect-square flex items-center justify-center text-zinc-500 text-xs font-bold">
                              +{item.images.length - 4}
                            </div>
                          )}
                        </div>
                        {item.settings && (
                          <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{item.settings.targetScene}</span>
                            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{item.settings.style}</span>
                            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{item.settings.aspectRatio}</span>
                            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{item.settings.resolution}</span>
                            {String(item.settings.sceneConfig?.sceneTheme || '').trim() ? (
                              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                                {item.settings.sceneConfig?.sceneTheme}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    <AppDialog
      isOpen={isQuickBatchDialogOpen}
      title={tr('快速批量', 'Quick Batch')}
      subtitle={tr(
        '在这个弹窗里集中确定整批套图的类型、比例和资源绑定，应用后再回到底部做高级微调。',
        'Set the full batch mix, ratio strategy, and resource bindings here, then return to fine-tune below if needed.'
      )}
      onClose={closeQuickBatchDialog}
      widthClassName="max-w-4xl"
      overlayClassName="z-[170]"
      footer={
        <>
          <button
            type="button"
            onClick={() => {
              closeQuickBatchDialog();
              openGalleryAiOutputPlanner();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
              galleryOutputMode === 'ai'
                ? 'border-orange-400/50 bg-orange-500/15 text-orange-100'
                : 'border-orange-500/30 bg-orange-500/10 text-orange-200 hover:bg-orange-500/15'
            }`}
          >
            {galleryOutputMode === 'ai' ? tr('重新 AI 推荐', 'Refresh AI Mix') : tr('AI 推荐组合', 'AI Recommended Mix')}
          </button>
          <button
            type="button"
            onClick={closeQuickBatchDialog}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition"
          >
            {tr('取消', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleQuickBatchDialogApply();
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-black hover:bg-orange-400 transition"
          >
            {tr('应用批量配置', 'Apply Batch Config')}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{tr('批量比例', 'Ratio Strategy')}</div>
            <DropdownSelect
              value={galleryBulkDialogDraft.ratioStrategy}
              options={[
                { value: 'recommended', label: tr('按类型推荐', 'Recommended by Type') },
                { value: '1:1', label: '1:1' },
                { value: '4:5', label: '4:5' },
                { value: '9:16', label: '9:16' },
              ]}
              onChange={(value) =>
                setGalleryBulkDialogDraft((prev) => ({
                  ...prev,
                  ratioStrategy: String(value || 'recommended') as GalleryBulkConfig['ratioStrategy'],
                }))
              }
              buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
              iconClassName="w-4 h-4 text-zinc-500"
              optionClassName="text-xs"
            />
          </label>

          <label className="space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{tr('批量分辨率', 'Resolution')}</div>
            <DropdownSelect
              value={galleryBulkDialogDraft.resolution}
              options={[
                { value: '1k', label: '1K' },
                { value: '2k', label: '2K' },
                { value: '4k', label: '4K' },
              ]}
              onChange={(value) =>
                setGalleryBulkDialogDraft((prev) => ({
                  ...prev,
                  resolution: (String(value || '1k').toLowerCase() === '2k' || String(value || '1k').toLowerCase() === '4k'
                    ? String(value).toLowerCase()
                    : '1k') as GalleryBulkConfig['resolution'],
                }))
              }
              buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
              iconClassName="w-4 h-4 text-zinc-500"
              optionClassName="text-xs"
            />
          </label>

          <label className="space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{tr('资源绑定', 'Binding')}</div>
            <DropdownSelect
              value={galleryBulkDialogDraft.bindingStrategy}
              options={[
                { value: 'auto_primary', label: tr('自动绑定默认模特/场景', 'Auto-bind Primary Model/Scene') },
                { value: 'none', label: tr('不预绑定', 'Do Not Pre-bind') },
              ]}
              onChange={(value) =>
                setGalleryBulkDialogDraft((prev) => ({
                  ...prev,
                  bindingStrategy: String(value || 'auto_primary') === 'none' ? 'none' : 'auto_primary',
                }))
              }
              buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
              iconClassName="w-4 h-4 text-zinc-500"
              optionClassName="text-xs"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {bulkTypeCards.map((card) => {
            const selection = galleryBulkDialogDraft.typeSelections[card.outputType];
            const enabled = Boolean(selection?.enabled);
            const count = Math.max(0, Math.round(Number(selection?.count || 0)));
            return (
              <div
                key={card.outputType}
                className={`rounded-2xl border px-4 py-3 transition ${
                  enabled ? `${card.accentClass} text-zinc-100` : 'border-white/10 bg-black/20 text-zinc-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <label className="flex min-w-0 flex-1 items-start gap-3">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) =>
                        setGalleryBulkDialogDraft((prev) => ({
                          ...prev,
                          typeSelections: {
                            ...prev.typeSelections,
                            [card.outputType]: {
                              enabled: e.target.checked,
                              count: e.target.checked ? Math.max(1, count || 1) : 0,
                            },
                          },
                        }))
                      }
                      className="mt-1 accent-orange-500"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{card.title}</span>
                      <span className="mt-1 block text-[11px] leading-5 text-zinc-400">{card.description}</span>
                    </span>
                  </label>

                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() =>
                        setGalleryBulkDialogDraft((prev) => ({
                          ...prev,
                          typeSelections: {
                            ...prev.typeSelections,
                            [card.outputType]: {
                              enabled: prev.typeSelections[card.outputType].enabled,
                              count: Math.max(0, Math.round(Number(prev.typeSelections[card.outputType].count || 0)) - 1),
                            },
                          },
                        }))
                      }
                      disabled={!enabled || count <= 1}
                      className="h-8 w-8 rounded-l-lg border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                    >
                      <Minus className="mx-auto h-4 w-4" />
                    </button>
                    <div className="flex h-8 w-10 items-center justify-center border-y border-white/10 bg-black/30 text-xs text-zinc-100">
                      {count}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setGalleryBulkDialogDraft((prev) => ({
                          ...prev,
                          typeSelections: {
                            ...prev.typeSelections,
                            [card.outputType]: {
                              enabled: true,
                              count: Math.min(8, Math.max(1, Math.round(Number(prev.typeSelections[card.outputType].count || 0)) + 1)),
                            },
                          },
                        }))
                      }
                      disabled={!enabled || count >= 8}
                      className="h-8 w-8 rounded-r-lg border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                    >
                      <Plus className="mx-auto h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
                  <span>
                    {galleryBulkDialogDraft.ratioStrategy === 'recommended'
                      ? tr('按类型推荐比例', 'Using recommended ratios')
                      : tr(`统一比例 ${galleryBulkDialogDraft.ratioStrategy}`, `Unified ratio ${galleryBulkDialogDraft.ratioStrategy}`)}
                  </span>
                  {card.outputType === 'selling_point' ? (
                    <span>
                      {gallerySellingPoints.some((item) => String(item || '').trim())
                        ? tr(`当前有效卖点 ${gallerySellingPoints.filter((item) => String(item || '').trim()).length} 条`, `${gallerySellingPoints.filter((item) => String(item || '').trim()).length} selling points detected`)
                        : tr('未填写卖点时默认不生成卖点图', 'Selling-point images stay off until selling points are filled')}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
          <div className="text-xs font-bold text-zinc-100">
            {tr(`当前批量共 ${galleryBulkDialogPlannedCount} 张`, `${galleryBulkDialogPlannedCount} images in batch`)}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-zinc-500">
            {galleryAdvancedDirty
              ? tr('当前高级编辑已手动微调。应用新的批量配置时，会提示是否覆盖这些逐张调整。', 'Advanced edits already exist. Applying the new batch config will ask before overwriting those per-card changes.')
              : tr('点击应用后会刷新下方高级编辑列表，但不会直接开始生成。', 'Applying will refresh the advanced list below, but will not generate yet.')}
          </div>
        </div>
      </div>
    </AppDialog>
    </>
  );
};

export default ImagesGalleryView;
