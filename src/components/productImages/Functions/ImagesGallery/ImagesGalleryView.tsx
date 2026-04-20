import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const galleryLeftPanelRef = useRef<HTMLDivElement | null>(null);
  const galleryMiddlePanelRef = useRef<HTMLDivElement | null>(null);
  const galleryRightPanelRef = useRef<HTMLDivElement | null>(null);
  const galleryGenerateRef = useRef<HTMLDivElement | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [guideStepIndex, setGuideStepIndex] = useState(0);
  const [guidePanelStyle, setGuidePanelStyle] = useState<React.CSSProperties>({});
  const [guideHighlightStyle, setGuideHighlightStyle] = useState<React.CSSProperties>({});

  type GuideStepKey = 'left' | 'middle' | 'generate' | 'right';
  const guideSteps = useMemo<Array<{ key: GuideStepKey; title: string; description: string }>>(
    () => [
      { key: 'left', title: props.t.pg_img_guide_step_upload_title, description: props.t.pg_img_guide_step_upload_desc },
      { key: 'middle', title: props.t.pg_img_guide_step_config_title, description: props.t.pg_img_guide_step_config_desc },
      { key: 'generate', title: props.t.pg_img_guide_step_generate_title, description: props.t.pg_img_guide_step_generate_desc },
      { key: 'right', title: props.t.pg_img_guide_step_result_title, description: props.t.pg_img_guide_step_result_desc },
    ],
    [props]
  );

  const activeGuideStep = isGuideOpen ? guideSteps[guideStepIndex] : null;
  const isGuideFocused = (key: GuideStepKey) => activeGuideStep?.key === key;
  const getGuideFocusClass = (key: GuideStepKey) => (
    isGuideFocused(key)
      ? 'relative z-[85] ring-2 ring-orange-400/80 ring-offset-2 ring-offset-black/60 shadow-[0_0_24px_rgba(251,146,60,0.35)] rounded-2xl'
      : ''
  );

  const getGuideTargetElement = useCallback(() => {
    const map: Record<GuideStepKey, React.RefObject<HTMLDivElement | null>> = {
      left: galleryLeftPanelRef,
      middle: galleryMiddlePanelRef,
      generate: galleryGenerateRef,
      right: galleryRightPanelRef,
    };
    const key = guideSteps[guideStepIndex]?.key;
    return key ? map[key]?.current || null : null;
  }, [guideStepIndex, guideSteps]);

  const updateGuidePanelPosition = useCallback(() => {
    const target = getGuideTargetElement();
    const viewportPadding = 12;
    const panelWidth = Math.min(420, window.innerWidth - viewportPadding * 2);
    const panelHeight = 330;
    const highlightPadding = 10;

    if (!target) {
      setGuidePanelStyle({
        width: `${panelWidth}px`,
        left: `${Math.max(viewportPadding, Math.round((window.innerWidth - panelWidth) / 2))}px`,
        top: `${Math.max(viewportPadding, Math.round((window.innerHeight - panelHeight) / 2))}px`,
      });
      setGuideHighlightStyle({ display: 'none' });
      return;
    }

    const rect = target.getBoundingClientRect();
    setGuideHighlightStyle({
      left: `${Math.round(rect.left - highlightPadding)}px`,
      top: `${Math.round(rect.top - highlightPadding)}px`,
      width: `${Math.round(rect.width + highlightPadding * 2)}px`,
      height: `${Math.round(rect.height + highlightPadding * 2)}px`,
    });
    let left = rect.right + 16;
    if (left + panelWidth > window.innerWidth - viewportPadding) {
      left = rect.left - panelWidth - 16;
    }
    if (left < viewportPadding) {
      left = Math.max(viewportPadding, Math.round((window.innerWidth - panelWidth) / 2));
    }

    let top = rect.top;
    if (top + panelHeight > window.innerHeight - viewportPadding) {
      top = window.innerHeight - panelHeight - viewportPadding;
    }
    if (top < viewportPadding) {
      top = viewportPadding;
    }

    setGuidePanelStyle({
      width: `${panelWidth}px`,
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
    });
  }, [getGuideTargetElement]);

  const galleryGuideSeenKey = useMemo(() => 'vflow_product_gallery_guide_seen_v1', []);
  const markGalleryGuideSeen = useCallback(() => {
    try {
      window.localStorage.setItem(galleryGuideSeenKey, '1');
    } catch {
    }
  }, [galleryGuideSeenKey]);

  useEffect(() => {
    const handler = () => {
      setGuideStepIndex(0);
      setIsGuideOpen(true);
    };
    window.addEventListener('vflow:open-product-gallery-guide', handler as EventListener);
    return () => window.removeEventListener('vflow:open-product-gallery-guide', handler as EventListener);
  }, []);

  useEffect(() => {
    if (isGuideOpen) return;
    try {
      if (window.localStorage.getItem(galleryGuideSeenKey) === '1') return;
    } catch {
    }
    const timer = window.setTimeout(() => {
      setGuideStepIndex(0);
      setIsGuideOpen(true);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [galleryGuideSeenKey, isGuideOpen]);

  useEffect(() => {
    if (!isGuideOpen) return;
    const target = getGuideTargetElement();
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }

    const timer = window.setTimeout(() => {
      updateGuidePanelPosition();
    }, 260);

    const onViewportChange = () => {
      updateGuidePanelPosition();
    };

    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [guideStepIndex, getGuideTargetElement, isGuideOpen, updateGuidePanelPosition]);

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
      title: t.pi_gallery_output_white_bg,
      description: t.pg_img_white_bg_desc,
      accentClass: 'border-sky-400/30 bg-sky-500/8',
    },
    {
      outputType: 'scene',
      title: t.pi_gallery_output_scene,
      description: t.pg_img_scene_desc,
      accentClass: 'border-emerald-400/30 bg-emerald-500/8',
    },
    {
      outputType: 'selling_point',
      title: t.pi_gallery_output_selling_point,
      description: t.pg_img_selling_point_desc,
      accentClass: 'border-amber-400/30 bg-amber-500/10',
    },
    {
      outputType: 'cover',
      title: t.pi_gallery_output_cover,
      description: t.pg_img_cover_desc,
      accentClass: 'border-fuchsia-400/30 bg-fuchsia-500/10',
    },
    {
      outputType: 'poster',
      title: t.pi_gallery_output_poster,
      description: t.pg_img_poster_desc,
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
      return `${card.title} ${count}${t.pg_img_count_unit ? ` ${t.pg_img_count_unit}` : ''}`.trim();
    })
    .filter(Boolean) as string[];
  const galleryBulkSummaryPrimary = galleryBulkSummaryItems.length > 0
    ? galleryBulkSummaryItems.join(' · ')
    : t.pg_img_no_batch_types_enabled;

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
        label: t.pg_img_visual_focus_label,
        placeholder: t.pg_img_visual_focus_placeholder,
      },
      {
        key: 'compositionHint',
        label: t.pg_img_composition_hint_label,
        placeholder: t.pg_img_composition_hint_placeholder,
      },
      {
        key: 'copyTone',
        label: t.pg_img_copy_tone_label,
        placeholder: t.pg_img_copy_tone_placeholder,
      },
      {
        key: 'negativeHints',
        label: t.pg_img_negative_hints_label,
        placeholder: t.pg_img_negative_hints_placeholder,
      },
    ];

    const typeSpecific =
      outputType === 'selling_point'
        ? [
            {
              key: 'sellingPointText',
              label: t.pg_img_selling_point_focus_label,
              placeholder: t.pg_img_selling_point_focus_placeholder,
            },
            {
              key: 'headlineFocus',
              label: t.pg_img_headline_focus_label,
              placeholder: t.pg_img_headline_focus_selling_placeholder,
            },
          ]
        : outputType === 'scene'
          ? [
              {
                key: 'backgroundStyle',
                label: t.pg_img_background_style_label,
                placeholder: t.pg_img_background_style_placeholder,
              },
              {
                key: 'displayAngle',
                label: t.pg_img_display_angle_label,
                placeholder: t.pg_img_display_angle_scene_placeholder,
              },
            ]
          : outputType === 'cover'
            ? [
                {
                  key: 'heroStyle',
                  label: t.pg_img_hero_style_label,
                  placeholder: t.pg_img_hero_style_placeholder,
                },
                {
                  key: 'headlineFocus',
                  label: t.pg_img_headline_focus_label,
                  placeholder: t.pg_img_headline_focus_cover_placeholder,
                },
              ]
            : outputType === 'poster'
              ? [
                  {
                    key: 'campaignAngle',
                    label: t.pg_img_campaign_angle_label,
                    placeholder: t.pg_img_campaign_angle_placeholder,
                  },
                  {
                    key: 'promotionTone',
                    label: t.pg_img_promotion_tone_label,
                    placeholder: t.pg_img_promotion_tone_placeholder,
                  },
                  {
                    key: 'copyBlockDensity',
                    label: t.pg_img_copy_block_density_label,
                    placeholder: t.pg_img_copy_block_density_placeholder,
                  },
                ]
              : [
                  {
                    key: 'displayAngle',
                    label: t.pg_img_display_angle_label,
                    placeholder: t.pg_img_display_angle_white_placeholder,
                  },
                  {
                    key: 'backgroundStyle',
                    label: t.pg_img_background_treatment_label,
                    placeholder: t.pg_img_background_treatment_placeholder,
                  },
                ];

    return [...common, ...typeSpecific] as Array<{ key: string; label: string; placeholder: string }>;
  };

  return (
    <>
    <div className={`${panelClassName('product_images_gallery')} h-full min-h-0 flex flex-col px-10 py-6`}>
      <div className="flex-1 min-h-0 flex overflow-hidden relative" id="gallery-container">
        <div
          ref={galleryLeftPanelRef}
          className={`flex flex-col gap-3 min-h-0 overflow-y-auto custom-scroll pr-2 shrink-0 transition-colors duration-150 rounded-2xl border border-white/5 bg-white/2 hover:border-orange-500/20 ${getGuideFocusClass('left')}`}
          style={{ width: `${leftWidth}px`, minWidth: `${GALLERY_PANEL_MIN_WIDTH}px` }}
          data-testid="left-panel"
        >
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-zinc-200">
                {t.wb_product_images_gallery_upload_title || 'Upload Product Images'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGalleryAiAnalyze}
                  disabled={isGalleryAnalyzing}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 disabled:opacity-60 disabled:hover:bg-zinc-900/70 transition"
                >
                  {isGalleryAnalyzing ? t.pg_img_filling : t.pg_img_ai_fill}
                </button>
              </div>
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
                        {String(t.pg_img_restored_from_history || '')
                          .replace('{count}', String(galleryRestoredImagePaths.length))}
                      </span>
                      <button
                        type="button"
                        onClick={() => setGalleryRestoredImagePaths([])}
                        className="text-emerald-400 hover:text-emerald-200 shrink-0"
                        title={t.pg_img_clear}
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
                            title={t.pg_img_remove}
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
                          title={t.pg_img_upload_replace}
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
                      {t.pg_img_drag_drop_hint}
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
              <div className="text-sm font-bold text-zinc-200">{t.pg_img_product_info}</div>
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
            <div className="text-sm font-bold text-zinc-200">{t.pg_img_hot_style_analysis}</div>

            {hotStyleLoading ? (
              <div className="mt-3 h-28 rounded-xl border border-white/10 bg-white/5 flex flex-col items-center justify-center gap-3 text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-zinc-400/70 animate-pulse" />
                  <span className="w-2 h-2 rounded-full bg-zinc-400/70 animate-pulse [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-zinc-400/70 animate-pulse [animation-delay:300ms]" />
                </div>
                <div className="text-xs">{t.pg_img_hot_style_analyzing}</div>
              </div>
            ) : hotStyleItems.length === 0 ? (
              <>
                <button
                  type="button"
                  onClick={handleHotStyleAnalyze}
                  disabled={!(galleryImages.length > 0 && gallerySellingPoints.some((p: string) => String(p || '').trim()))}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-zinc-300 hover:bg-white/10 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />{t.pg_img_analyze_hot_styles}
                </button>
                {!(galleryImages.length > 0 && gallerySellingPoints.some((p: string) => String(p || '').trim())) && (
                  <div className="mt-2 text-[11px] text-zinc-500">{t.pg_img_upload_and_fill_first}</div>
                )}
                {hotStyleError ? <div className="mt-2 text-[11px] text-red-400">{hotStyleError}</div> : null}
              </>
            ) : (
              <>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pg_img_style_ideas}</div>
                  <button
                    type="button"
                    onClick={handleHotStyleAnalyze}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
                  >
                    <RotateCw className="w-4 h-4" />{t.pg_img_regenerate_styles}
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
                        title={isSelected ? t.pg_img_selected_click_to_unselect : t.pg_img_click_to_select}
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
                <div className="text-sm font-bold text-zinc-200">{t.pg_img_model_resources}</div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  {t.pg_img_model_resources_desc}
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
                {t.pg_img_add_model}
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
                  <div className="text-sm font-bold">{t.pg_img_no_model_cards_cta}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {t.pg_img_model_photo_required_desc}
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
                          placeholder={t.pg_img_model_name_placeholder}
                        />
                        <button
                          type="button"
                          onClick={() => removeGalleryModelCard(card.id)}
                          className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 flex items-center justify-center"
                          title={t.pg_img_delete_model_card}
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
                              aria-label={t.pg_img_remove}
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
                            {previewSrc ? t.pg_img_replace_photo : t.pg_img_upload_photo}
                          </label>
                          <div className="mt-2 text-[11px] text-zinc-500">
                            {t.pg_img_model_photo_required_note}
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
                        placeholder={t.pg_img_model_info_placeholder}
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
                <div className="text-sm font-bold text-zinc-200">{t.pg_img_scene_resources}</div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  {t.pg_img_scene_resources_desc}
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
                {t.pg_img_add_scene}
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
                  <div className="text-sm font-bold">{t.pg_img_no_scene_cards_cta}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {t.pg_img_scene_preset_hint}
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
                        placeholder={t.pg_img_scene_name_placeholder}
                      />
                      <button
                        type="button"
                        onClick={() => removeGallerySceneCard(card.id)}
                        className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 flex items-center justify-center"
                        title={t.pg_img_delete_scene_card}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pg_img_preset_scene}</div>
                      <DropdownSelect
                        value={String(card.presetId || 'custom')}
                        options={[
                          { value: 'custom', label: t.pg_img_custom },
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
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pg_img_scene_theme}</div>
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
                          placeholder={t.pg_img_scene_theme_placeholder}
                        />
                      </label>
                      <label className="space-y-1">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pg_img_mood}</div>
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
                          placeholder={t.pg_img_mood_placeholder}
                        />
                      </label>
                    </div>

                    <label className="space-y-1">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pg_img_scene_description}</div>
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
                        placeholder={t.pg_img_scene_description_placeholder}
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pg_img_props}</div>
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
                          placeholder={t.pg_img_props_placeholder}
                        />
                      </label>
                      <label className="space-y-1">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pg_img_lighting}</div>
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
                          placeholder={t.pg_img_lighting_placeholder}
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
          ref={galleryMiddlePanelRef}
          className={`flex flex-col gap-4 min-h-0 overflow-y-auto custom-scroll pr-2 shrink-0 transition-[width] duration-100 border border-transparent hover:border-orange-500/20 ${getGuideFocusClass('middle')}`}
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
                    aria-label={isBasicsCollapsed ? t.pg_img_expand_basics : t.pg_img_collapse_basics}
                    title={isBasicsCollapsed ? t.pg_img_expand_basics : t.pg_img_collapse_basics}
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
                {t.pg_img_quick_batch}
              </button>

              <div className="hidden">
                {t.pg_img_model_scene_maintained_left}
              </div>

              <div className="rounded-2xl border border-orange-500/20 bg-[linear-gradient(180deg,rgba(249,115,22,0.06),rgba(17,24,39,0.1))] p-4">
                <div className="text-xs font-bold text-zinc-100">{t.pg_img_quick_batch_summary}</div>
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
                  {t.pg_img_ai_recommended_mix}
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
                  {isGalleryAiLayoutDesigning ? t.pg_img_designing : t.pg_img_ai_design_for_me}
                </button>
                <button
                  type="button"
                  onClick={openGalleryAiLayoutPromptDialog}
                  disabled={isGalleryAiLayoutDesigning || galleryAdvancedItemCount <= 0}
                  className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] font-bold text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
                >
                  {t.pg_img_advanced_settings}
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-zinc-200">{t.pg_img_advanced_editing}</div>
                    <div className="mt-1 text-[11px] leading-5 text-zinc-500">
                      {galleryAdvancedDirty
                        ? t.pg_img_advanced_editing_dirty_desc
                        : t.pg_img_advanced_editing_clean_desc}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {galleryAdvancedDirty ? (
                      <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-200">
                        {t.pg_img_adjusted}
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                        {galleryOutputMode === 'ai' ? t.pg_img_ai_mix : t.pg_img_batch_default}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsGalleryAdvancedEditingCollapsed((prev) => !prev)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"
                      aria-label={isGalleryAdvancedEditingCollapsed ? t.pg_img_expand_advanced_editing : t.pg_img_collapse_advanced_editing}
                      title={isGalleryAdvancedEditingCollapsed ? t.pg_img_expand_advanced_editing : t.pg_img_collapse_advanced_editing}
                    >
                      <ChevronLeft className={`h-4 w-4 transition-transform ${isGalleryAdvancedEditingCollapsed ? '-rotate-90' : 'rotate-90'}`} />
                    </button>
                  </div>
                </div>

                {isGalleryAdvancedEditingCollapsed ? (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-[11px] text-zinc-500">
                    {galleryAdvancedItemCount > 0
                      ? String(t.pg_img_output_items_configured || '').replace('{count}', String(galleryAdvancedItemCount))
                      : t.pg_img_no_per_card_items}
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
                            <span className="font-bold">{t.pg_img_enabled}</span>
                          </label>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => undefined}
                              className="hidden"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              {galleryOptimizingItemIds[item.id] ? t.pg_img_optimizing : t.pg_img_ai_optimize}
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
                            <div className="hidden">{t.pg_img_resource_binding}</div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pg_img_model}</div>
                                {galleryModelCards.length > 0 ? (
                                  <>
                                    <DropdownSelect
                                      value={String(item.modelCardId || '')}
                                      options={[
                                        { value: '', label: t.pg_img_no_model },
                                        ...galleryModelCards.map((card) => ({ value: card.id, label: card.name || card.id })),
                                      ]}
                                      onChange={(value) => updateOutputItem(item.id, (current) => ({ ...current, modelCardId: String(value || '') || undefined }))}
                                      buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                                      iconClassName="w-4 h-4 text-zinc-500"
                                      optionClassName="text-xs"
                                    />
                                    <div className="hidden">
                                      {item.modelCardId && !selectedModelName
                                        ? t.pg_img_bound_model_missing
                                        : selectedModelName
                                          ? `${t.pg_img_current_binding}: ${selectedModelName}`
                                          : t.pg_img_no_model_bound}
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
                                    {t.pg_img_no_model_cards_create}
                                  </button>
                                )}
                              </div>

                              <div className="space-y-1">
                                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pg_img_scene}</div>
                                {gallerySceneCards.length > 0 ? (
                                  <>
                                    <DropdownSelect
                                      value={String(item.sceneCardId || '')}
                                      options={[
                                        { value: '', label: t.pg_img_no_scene },
                                        ...gallerySceneCards.map((card) => ({ value: card.id, label: card.name || card.id })),
                                      ]}
                                      onChange={(value) => updateOutputItem(item.id, (current) => ({ ...current, sceneCardId: String(value || '') || undefined }))}
                                      buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                                      iconClassName="w-4 h-4 text-zinc-500"
                                      optionClassName="text-xs"
                                    />
                                    <div className="hidden">
                                      {item.sceneCardId && !selectedSceneName
                                        ? t.pg_img_bound_scene_missing
                                        : selectedSceneName
                                          ? `${t.pg_img_current_binding}: ${selectedSceneName}`
                                          : t.pg_img_no_scene_bound}
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
                                    {t.pg_img_no_scene_cards_create}
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
                                  {t.pg_img_layout}
                                </div>
                                {totalVariants > 1 ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => goVariant(-1)}
                                      disabled={clampedIndex <= 0}
                                      className="h-6 w-6 rounded-md border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 flex items-center justify-center disabled:opacity-40"
                                      aria-label={t.pg_img_previous_layout}
                                      title={t.pg_img_previous_layout}
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
                                      aria-label={t.pg_img_next_layout}
                                      title={t.pg_img_next_layout}
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
                                placeholder={t.pg_img_layout_placeholder}
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
                            {item.title ? <div>{`${t.pg_img_title}: ${String(item.title)}`}</div> : null}
                            {item.copy?.headline ? <div>{`${t.pg_img_copy}: ${String(item.copy?.headline)}`}</div> : null}
                            {item.notes ? <div>{`${t.pg_img_notes}: ${String(item.notes)}`}</div> : null}
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
                      {t.pg_img_add_item}
                    </button>
                  </div>
                )}
              </div>

            </div>

            <div ref={galleryGenerateRef} className={`mt-auto pt-6 ${getGuideFocusClass('generate')}`}>
              <button
                type="button"
                onClick={handleGalleryGenerate}
                disabled={isGalleryGenerating}
                className="grid w-full grid-cols-[1fr_auto_1fr] items-center rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-black transition hover:bg-orange-400 disabled:opacity-60 disabled:hover:bg-orange-500"
              >
                <span aria-hidden="true" className="min-w-0" />
                <span className="inline-flex min-w-0 items-center justify-center gap-2 justify-self-center text-center">
                  <Wand2 className="h-4 w-4 shrink-0" />
                  {isGalleryGenerating ? t.pg_img_generating : t.pg_img_generate}
                </span>
                <span className="justify-self-end self-center pr-0.5 text-right">
                  {!isGalleryGenerating && galleryEstimatedCost > 0 ? (
                    <span className="whitespace-nowrap text-[10px] font-semibold tabular-nums text-black/75">
                      {`-${galleryEstimatedCost} ${t.pg_img_v_points}`}
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
          ref={galleryRightPanelRef}
          className={`flex-1 rounded-2xl border border-white/5 bg-white/2 p-5 flex flex-col min-h-0 overflow-hidden border border-transparent hover:border-orange-500/20 ${getGuideFocusClass('right')}`}
          style={{ minWidth: `${GALLERY_PANEL_MIN_WIDTH}px` }}
          data-testid="right-panel"
        >
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-zinc-200">
              {galleryRightPanel === 'preview' ? t.pg_img_preview_area : t.pg_img_history}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openGalleryBoardEditor}
                className="px-3 py-2 rounded-xl text-xs font-bold transition border border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/15 inline-flex items-center gap-2"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                {t.pg_img_board_edit}
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
                {t.pg_img_preview_area}
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
                {t.pg_img_history}
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
                      {t.pg_img_waiting_for_generation}
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
                        ? t.pg_img_status_done
                        : item.status === 'failed'
                          ? t.pg_img_status_failed
                          : t.pg_img_status_generating;
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
                              title={t.pg_img_click_to_preview}
                            >
                              <img src={item.imageUrl} className="w-full h-full object-cover" alt={item.requestId} />
                              <div className="absolute inset-0 opacity-0 transition-opacity duration-200 bg-black/40 flex items-center justify-center group-hover:opacity-100">
                                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs font-bold text-white">
                                  <Eye className="w-4 h-4" />
                                  {t.pg_img_preview}
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
                                {item.error || (item.status === 'failed' ? t.pg_img_generation_failed : t.pg_img_waiting)}
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
                  {t.pg_img_no_history}
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
                          <span className="text-zinc-500">{item.images.length} {t.pg_img_imgs_unit}</span>
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
                                if (enabledKeys.length > 1) return t.pg_img_multiple_types;
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
                                title={t.pg_img_click_to_preview}
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
      title={t.pg_img_quick_batch}
      subtitle={t.pg_img_quick_batch_subtitle}
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
            {galleryOutputMode === 'ai' ? t.pg_img_refresh_ai_mix : t.pg_img_ai_recommended_mix}
          </button>
          <button
            type="button"
            onClick={closeQuickBatchDialog}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition"
          >
            {t.pg_img_cancel}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleQuickBatchDialogApply();
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-black hover:bg-orange-400 transition"
          >
            {t.pg_img_apply_batch_config}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{t.pg_img_batch_ratio}</div>
            <DropdownSelect
              value={galleryBulkDialogDraft.ratioStrategy}
              options={[
                { value: 'recommended', label: t.pg_img_recommended_by_type },
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
            <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{t.pg_img_batch_resolution}</div>
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
            <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{t.pg_img_binding}</div>
            <DropdownSelect
              value={galleryBulkDialogDraft.bindingStrategy}
              options={[
                { value: 'auto_primary', label: t.pg_img_auto_bind_primary },
                { value: 'none', label: t.pg_img_do_not_pre_bind },
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
                      ? t.pg_img_using_recommended_ratios
                      : `${t.pg_img_unified_ratio} ${galleryBulkDialogDraft.ratioStrategy}`}
                  </span>
                  {card.outputType === 'selling_point' ? (
                    <span>
                      {gallerySellingPoints.some((item) => String(item || '').trim())
                        ? String(t.pg_img_selling_points_detected || '').replace('{count}', String(gallerySellingPoints.filter((item) => String(item || '').trim()).length))
                        : t.pg_img_selling_points_none_note}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
          <div className="text-xs font-bold text-zinc-100">
            {String(t.pg_img_batch_total || '').replace('{count}', String(galleryBulkDialogPlannedCount))}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-zinc-500">
            {galleryAdvancedDirty
              ? t.pg_img_apply_batch_overwrite_note
              : t.pg_img_apply_batch_refresh_note}
          </div>
        </div>
      </div>
    </AppDialog>
    {isGuideOpen && (
      <div
        className="fixed inset-0 z-[120]"
        onClick={() => {
          setIsGuideOpen(false);
          markGalleryGuideSeen();
        }}
      >
        <div
          className="absolute rounded-2xl border-2 border-orange-400/90 bg-transparent pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.72),0_0_32px_rgba(249,115,22,0.35)]"
          style={guideHighlightStyle}
        />
        <div
          className="absolute rounded-2xl border border-orange-500/30 bg-zinc-950/95 shadow-2xl shadow-black/60 backdrop-blur p-4"
          style={guidePanelStyle}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-base font-bold text-white">{t.pg_img_guide_modal_title}</div>
              <div className="mt-1 text-xs text-zinc-400">{t.wb_guide_step} {guideStepIndex + 1} / {guideSteps.length}</div>
            </div>
            <button
              type="button"
              onClick={() => { setIsGuideOpen(false); markGalleryGuideSeen(); }}
              className="text-zinc-400 hover:text-white"
              title={t.wb_guide_close}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 px-3 py-3">
            <div className="text-sm font-bold text-orange-200">{activeGuideStep?.title || ''}</div>
            <div className="mt-2 text-xs leading-5 text-zinc-300">{activeGuideStep?.description || ''}</div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {guideSteps.map((step, index) => (
              <button
                key={step.key}
                type="button"
                onClick={() => setGuideStepIndex(index)}
                className={`text-left rounded-lg border px-3 py-2 text-xs transition ${guideStepIndex === index ? 'border-orange-500/70 bg-orange-500/20 text-orange-200' : 'border-white/10 bg-black/40 text-zinc-300 hover:bg-white/5'}`}
              >
                {index + 1}. {step.title}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setGuideStepIndex((prev) => Math.max(0, prev - 1))}
              disabled={guideStepIndex <= 0}
              className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-zinc-200 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-white/5 transition"
            >
              {t.wb_guide_prev}
            </button>
            <button
              type="button"
              onClick={() => {
                if (guideStepIndex >= guideSteps.length - 1) {
                  setIsGuideOpen(false);
                  markGalleryGuideSeen();
                  return;
                }
                setGuideStepIndex((prev) => Math.min(guideSteps.length - 1, prev + 1));
              }}
              className="px-4 py-2 rounded-xl bg-orange-500 text-xs font-bold text-black hover:bg-orange-400 transition"
            >
              {guideStepIndex >= guideSteps.length - 1 ? t.wb_guide_finish : t.wb_guide_next}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default ImagesGalleryView;
