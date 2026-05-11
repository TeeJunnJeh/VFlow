import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, Eye, Image as ImageIcon, LayoutGrid, Minus, Plus, RotateCw, Save, Sparkles, Upload, Wand2, X } from 'lucide-react';
import Masonry from 'react-masonry-css';
import { DropdownSelect } from '../../../common/DropdownSelect';
import { AspectRatioPicker, GALLERY_RATIOS, LoadingCard as GalleryLoadingCard, ModelSelectorChips, ratioDescriptorsForLanguage } from '../../Common';
import { useLanguage } from '../../../../context/LanguageContext';
import type { ViewType } from '../../../workbench/types';
import type { LoadingTheme } from '../../../../utils/loadingTheme';
import ResizableSplitter from '../../../common/ResizableSplitter';
import { AppDialog } from '../../../common/AppDialog';
import {
  readCanvasToGalleryTransfer,
  clearCanvasToGalleryTransfer,
} from '../../../creativeLab/canvasToGalleryTransfer';

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
  isVisible: boolean;
  panelClassName: (view: ViewType) => string;
  t: any;

  galleryExamples: Array<{ id: string; title: string; subtitle: string; previewUrl: string; isUserSnapshot?: boolean; inputImageUrls?: string[] }>;
  applyGalleryExample: (id: string) => void;
  isGalleryApplyingExample: boolean;
  saveGalleryExampleSnapshot?: () => void;
  isGallerySavingExampleSnapshot?: boolean;
  deleteGalleryExampleSnapshot?: (id: string) => void;
  isGalleryDeletingExampleSnapshot?: boolean;

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
  galleryGenerationModel: 'nano-banana-pro' | 'gpt-image-1.5' | 'flux-2-pro';
  setGalleryGenerationModel: React.Dispatch<React.SetStateAction<'nano-banana-pro' | 'gpt-image-1.5' | 'flux-2-pro'>>;

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
  openGalleryModelPicker: (cardId: string) => void;
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

  handleGalleryGenerate: () => void;
  isGalleryGenerating: boolean;
  galleryEstimatedCost: number;

  galleryRightPanel: 'preview' | 'history';
  setGalleryRightPanel: React.Dispatch<React.SetStateAction<'preview' | 'history'>>;
  setIsGalleryHistoryManaging: (v: boolean) => void;
  setGalleryHistorySelectedKeys: React.Dispatch<React.SetStateAction<string[]>>;
  galleryBoardCanvasRatio: '3:4' | '1:1' | '4:3' | '2:3' | '3:2' | '16:9' | '9:16';
  openGalleryBoardEditor: (options?: { onboarding?: boolean }) => void;

  galleryPreviewItems: Array<{
    localId: string;
    requestId: string;
    status: 'created' | 'processing' | 'succeeded' | 'failed';
    imageUrl?: string;
    error?: string;
    outputType?: string;
    createdAt?: string;
    layout?: any;
    aspectRatio?: string;
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


// Threshold above which a generated image is treated as "wide" and given a full row
// in the preview panel. 7:6 ≈ 1.167 — anything more horizontal than that breaks out
// of the 2-column masonry layout.
const PG_WIDE_RATIO_THRESHOLD = 7 / 6;

const parseAspectRatioFloat = (ar: string | undefined | null): number => {
  if (!ar) return 1;
  const m = String(ar).trim().match(/^(\d+)\s*[:\/]\s*(\d+)$/);
  if (!m) return 1;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return 1;
  return w / h;
};

const isWideGalleryItem = (item: { aspectRatio?: string }): boolean => {
  return parseAspectRatioFloat(item.aspectRatio) > PG_WIDE_RATIO_THRESHOLD;
};

type GalleryGroup<T> =
  | { type: 'full'; key: string; item: T }
  | { type: 'masonry'; key: string; items: T[] };

// Splits items into a sequence of groups for the preview layout:
// — non-wide items go into 2-column masonry sub-blocks,
// — wide items become full-row sections,
// — before sealing a masonry block (because the next item is wide), we look ahead
//   into pending items beyond the wide one and "borrow" non-wide items to balance
//   the two-column heights, so the full-row landscape doesn't sit under an obviously
//   uneven gap.
const groupGalleryPreviewItems = <T extends { aspectRatio?: string; localId?: string }>(
  items: T[],
): GalleryGroup<T>[] => {
  const groups: GalleryGroup<T>[] = [];
  const pending = items.slice();
  let groupCounter = 0;

  while (pending.length > 0) {
    if (isWideGalleryItem(pending[0])) {
      const wide = pending.shift() as T;
      groups.push({
        type: 'full',
        key: `pg-grp-full-${groupCounter++}-${wide.localId ?? ''}`,
        item: wide,
      });
      continue;
    }

    const buffer: T[] = [];
    while (pending.length > 0 && !isWideGalleryItem(pending[0])) {
      buffer.push(pending.shift() as T);
    }

    // If a wide item is now next, try to balance the buffer's 2-column layout
    // by borrowing later non-wide items.
    if (pending.length > 0 && isWideGalleryItem(pending[0])) {
      const cols: [number, number] = [0, 0];
      for (const it of buffer) {
        const h = 1 / (parseAspectRatioFloat(it.aspectRatio) || 1);
        const target = cols[0] <= cols[1] ? 0 : 1;
        cols[target] += h;
      }

      while (Math.abs(cols[0] - cols[1]) > 1e-6) {
        let borrowIdx = -1;
        for (let k = 1; k < pending.length; k += 1) {
          if (!isWideGalleryItem(pending[k])) {
            borrowIdx = k;
            break;
          }
        }
        if (borrowIdx === -1) break;

        const portrait = pending[borrowIdx];
        const h = 1 / (parseAspectRatioFloat(portrait.aspectRatio) || 1);
        const shorter = cols[0] <= cols[1] ? 0 : 1;
        const otherCol = 1 - shorter;
        const oldDiff = Math.abs(cols[shorter] - cols[otherCol]);
        const newDiff = Math.abs(cols[shorter] + h - cols[otherCol]);
        // Only borrow if it actually reduces the imbalance — overshooting would
        // just move the gap to the other side.
        if (newDiff >= oldDiff) break;

        buffer.push(portrait);
        pending.splice(borrowIdx, 1);
        cols[shorter] += h;
      }
    }

    if (buffer.length > 0) {
      groups.push({
        type: 'masonry',
        key: `pg-grp-mas-${groupCounter++}`,
        items: buffer,
      });
    }
  }

  return groups;
};

type GalleryBoardExampleSlot = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const getBoardExampleAspectRatioStyle = (ratioId: string) => {
  const matched = String(ratioId || '').trim().match(/^(\d+)\s*[:/]\s*(\d+)$/);
  if (!matched) return '3 / 4';
  return `${matched[1]} / ${matched[2]}`;
};

const createBoardExampleGridSlots = (
  cols: number,
  rows: number,
  bounds: GalleryBoardExampleSlot = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 },
  gap = 0.02
) => {
  const safeCols = Math.max(cols, 1);
  const safeRows = Math.max(rows, 1);
  const cellW = (bounds.w - gap * (safeCols - 1)) / safeCols;
  const cellH = (bounds.h - gap * (safeRows - 1)) / safeRows;
  const slots: GalleryBoardExampleSlot[] = [];
  for (let row = 0; row < safeRows; row += 1) {
    for (let col = 0; col < safeCols; col += 1) {
      slots.push({
        x: bounds.x + col * (cellW + gap),
        y: bounds.y + row * (cellH + gap),
        w: cellW,
        h: cellH,
      });
    }
  }
  return slots;
};

const buildGalleryBoardExampleSlots = (count: number, ratioId: string): GalleryBoardExampleSlot[] => {
  const safeCount = clampNumber(Math.round(count || 0), 1, 9);
  const ratioValue = parseAspectRatioFloat(ratioId);
  const isPortrait = ratioValue < 0.95;
  const isLandscape = ratioValue > 1.05;

  if (safeCount === 1) {
    return [{ x: 0.08, y: 0.08, w: 0.84, h: 0.84 }];
  }

  if (safeCount === 2) {
    return isPortrait
      ? [
          { x: 0.08, y: 0.08, w: 0.84, h: 0.38 },
          { x: 0.08, y: 0.5, w: 0.84, h: 0.34 },
        ]
      : [
          { x: 0.08, y: 0.12, w: 0.38, h: 0.76 },
          { x: 0.54, y: 0.12, w: 0.38, h: 0.76 },
        ];
  }

  if (safeCount === 3) {
    if (isPortrait) {
      return [
        { x: 0.08, y: 0.08, w: 0.54, h: 0.76 },
        { x: 0.66, y: 0.08, w: 0.26, h: 0.36 },
        { x: 0.66, y: 0.48, w: 0.26, h: 0.36 },
      ];
    }
    if (isLandscape) {
      return [
        { x: 0.08, y: 0.08, w: 0.48, h: 0.76 },
        { x: 0.6, y: 0.08, w: 0.32, h: 0.36 },
        { x: 0.6, y: 0.48, w: 0.32, h: 0.36 },
      ];
    }
    return [
      { x: 0.08, y: 0.08, w: 0.84, h: 0.42 },
      { x: 0.08, y: 0.54, w: 0.4, h: 0.3 },
      { x: 0.52, y: 0.54, w: 0.4, h: 0.3 },
    ];
  }

  if (safeCount === 4) {
    return createBoardExampleGridSlots(2, 2);
  }

  if (safeCount === 5) {
    if (isLandscape) {
      return [
        { x: 0.08, y: 0.08, w: 0.44, h: 0.76 },
        ...createBoardExampleGridSlots(2, 2, { x: 0.56, y: 0.08, w: 0.36, h: 0.76 }, 0.02),
      ];
    }
    return [
      { x: 0.08, y: 0.08, w: 0.84, h: 0.34 },
      ...createBoardExampleGridSlots(2, 2, { x: 0.08, y: 0.46, w: 0.84, h: 0.38 }, 0.02),
    ];
  }

  if (safeCount === 6) {
    return createBoardExampleGridSlots(3, 2);
  }

  if (safeCount === 7) {
    if (isLandscape) {
      return [
        { x: 0.08, y: 0.08, w: 0.42, h: 0.76 },
        ...createBoardExampleGridSlots(2, 3, { x: 0.54, y: 0.08, w: 0.38, h: 0.76 }, 0.02),
      ];
    }
    return [
      { x: 0.08, y: 0.08, w: 0.84, h: 0.26 },
      ...createBoardExampleGridSlots(3, 2, { x: 0.08, y: 0.38, w: 0.84, h: 0.46 }, 0.02),
    ];
  }

  if (safeCount === 8) {
    return createBoardExampleGridSlots(4, 2);
  }

  return createBoardExampleGridSlots(3, 3);
};


const ImagesGalleryView: React.FC<ImagesGalleryViewProps> = (props) => {
  const { language } = useLanguage();
  const [leftWidth, setLeftWidth] = useState<number>(GALLERY_PANEL_DEFAULT_WIDTH);
  const [middleWidth, setMiddleWidth] = useState<number>(GALLERY_PANEL_DEFAULT_WIDTH);

  // Canvas → Gallery transfer: when the user clicked "Open in Gallery" from a
  // canvas ImageNode, pre-fill the product image slot here. Triggers only when
  // the user actually navigates here (isVisible flips true), reads once, clears.
  useEffect(() => {
    if (!props.isVisible) return;
    const payload = readCanvasToGalleryTransfer();
    if (!payload) return;
    const isAlreadyKnown =
      props.galleryRestoredImagePaths.includes(payload.productImageUrl)
      || props.galleryImages.length > 0;
    if (!isAlreadyKnown) {
      props.setGalleryRestoredImagePaths([payload.productImageUrl]);
    }
    clearCanvasToGalleryTransfer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isVisible]);
  const [isBasicsCollapsed, setIsBasicsCollapsed] = useState(false);
  const [isQuickBatchDialogOpen, setIsQuickBatchDialogOpen] = useState(false);
  const [galleryBulkDialogDraft, setGalleryBulkDialogDraft] = useState<GalleryBulkConfig>(() => cloneGalleryBulkConfig(props.galleryBulkConfig));
  const [resourceHighlight, setResourceHighlight] = useState<'model' | 'scene' | null>(null);
  const modelSectionRef = useRef<HTMLDivElement | null>(null);
  const sceneSectionRef = useRef<HTMLDivElement | null>(null);
  const galleryLeftPanelRef = useRef<HTMLDivElement | null>(null);
  const galleryMiddlePanelRef = useRef<HTMLDivElement | null>(null);
  const galleryPreviewResultsRef = useRef<HTMLDivElement | null>(null);
  const galleryBoardExampleRef = useRef<HTMLDivElement | null>(null);
  const galleryBoardEditButtonRef = useRef<HTMLButtonElement | null>(null);
  const galleryGenerateRef = useRef<HTMLDivElement | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [guideStepIndex, setGuideStepIndex] = useState(0);
  const [guidePanelStyle, setGuidePanelStyle] = useState<React.CSSProperties>({});
  const [guideHighlightStyle, setGuideHighlightStyle] = useState<React.CSSProperties>({});
  const isVisible = props.isVisible;
  const isVisibleRef = useRef(isVisible);

  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

  const gallerySucceededPreviewItems = useMemo(
    () =>
      props.galleryPreviewItems
        .filter((item) => item.status === 'succeeded' && Boolean(String(item.imageUrl || '').trim()))
        .slice(0, 9),
    [props.galleryPreviewItems]
  );
  const galleryBoardExampleAspect = useMemo(
    () => getBoardExampleAspectRatioStyle(props.galleryBoardCanvasRatio),
    [props.galleryBoardCanvasRatio]
  );
  const galleryBoardExampleSlots = useMemo(
    () => buildGalleryBoardExampleSlots(gallerySucceededPreviewItems.length, props.galleryBoardCanvasRatio),
    [gallerySucceededPreviewItems.length, props.galleryBoardCanvasRatio]
  );

  type GuideStepKey = 'left' | 'middle' | 'generate' | 'result' | 'board';
  const guideSteps = useMemo<Array<{ key: GuideStepKey; title: string; description: string }>>(
    () => [
      { key: 'left', title: props.t.pg_img_guide_step_upload_title, description: props.t.pg_img_guide_step_upload_desc },
      { key: 'middle', title: props.t.pg_img_guide_step_config_title, description: props.t.pg_img_guide_step_config_desc },
      { key: 'generate', title: props.t.pg_img_guide_step_generate_title, description: props.t.pg_img_guide_step_generate_desc },
      { key: 'result', title: props.t.pg_img_guide_step_result_title, description: props.t.pg_img_guide_step_result_desc },
      { key: 'board', title: props.t.pg_img_guide_step_board_title, description: props.t.pg_img_guide_step_board_desc },
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
    const key = guideSteps[guideStepIndex]?.key;
    if (key === 'left') return galleryLeftPanelRef.current;
    if (key === 'middle') return galleryMiddlePanelRef.current;
    if (key === 'generate') return galleryGenerateRef.current;
    if (key === 'result') return galleryPreviewResultsRef.current;
    if (key === 'board') return galleryBoardEditButtonRef.current;
    return null;
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

  const galleryGuideSeenKey = useMemo(() => 'vflow_product_gallery_guide_seen_v2', []);
  const galleryGuideTriggerKey = useMemo(() => 'vflow_product_gallery_guide_trigger', []);
  const markGalleryGuideSeen = useCallback(() => {
    try {
      window.localStorage.setItem(galleryGuideSeenKey, '1');
    } catch {
    }
  }, [galleryGuideSeenKey]);

  useEffect(() => {
    const handler = () => {
      if (!isVisibleRef.current) return;
      setGuideStepIndex(0);
      setIsGuideOpen(true);
    };
    window.addEventListener('vflow:open-product-gallery-guide', handler as EventListener);
    return () => window.removeEventListener('vflow:open-product-gallery-guide', handler as EventListener);
  }, []);

  useEffect(() => {
    if (isVisible) return;
    setIsGuideOpen(false);
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    if (isGuideOpen) return;
    try {
      if (window.sessionStorage.getItem(galleryGuideTriggerKey) !== '1') return;
    } catch {
      return;
    }
    try {
      window.sessionStorage.removeItem(galleryGuideTriggerKey);
    } catch {
    }
    try {
      if (window.localStorage.getItem(galleryGuideSeenKey) === '1') return;
    } catch {
      return;
    }
    const timer = window.setTimeout(() => {
      setGuideStepIndex(0);
      setIsGuideOpen(true);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [galleryGuideSeenKey, galleryGuideTriggerKey, isGuideOpen, isVisible]);

  useEffect(() => {
    if (!isGuideOpen) return;
    const key = guideSteps[guideStepIndex]?.key;
    if (key === 'result' || key === 'board') {
      props.setGalleryRightPanel('preview');
    }
  }, [guideStepIndex, guideSteps, isGuideOpen, props.setGalleryRightPanel]);

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
    openGalleryModelPicker,
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

    handleGalleryGenerate,
    isGalleryGenerating,
    galleryEstimatedCost,

    galleryRightPanel,
    setGalleryRightPanel,
    setIsGalleryHistoryManaging,
    setGalleryHistorySelectedKeys,
    galleryBoardCanvasRatio,
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
  const renderPreviewCard = (item: any) => {
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
    const placeholderAspect = (() => {
      const raw = String(item.aspectRatio || '').trim();
      if (!raw) return '1 / 1';
      const m = raw.match(/^(\d+)\s*[:\/]\s*(\d+)$/);
      return m ? `${m[1]} / ${m[2]}` : '1 / 1';
    })();

    return (
      <div
        key={item.localId}
        className="group rounded-xl border border-white/10 bg-black/20 overflow-hidden shadow-sm transition-all duration-200 ease-out hover:-translate-y-1 hover:border-indigo-500 hover:ring-1 hover:ring-indigo-500/50 hover:shadow-xl"
      >
        <div
          className="relative w-full bg-black/30"
          style={item.imageUrl ? undefined : { aspectRatio: placeholderAspect }}
        >
          {item.imageUrl ? (
            <button
              type="button"
              onClick={() => openGalleryImagePreview(item.imageUrl as string, { kind: 'preview_item', localId: item.localId })}
              className="block w-full"
              title={t.pg_img_click_to_preview}
            >
              <img src={item.imageUrl} className="block w-full h-auto" alt={item.requestId} />
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
  };
  const galleryPreviewGroups = useMemo(() => groupGalleryPreviewItems(galleryPreviewItems), [galleryPreviewItems]);
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

  const buildCardConfigFields = (_outputType: GalleryOutputItemConfig['outputType']) => {
    return [] as Array<{ key: string; label: string; placeholder: string }>;
  };

  return (
    <>
    <div className={`${panelClassName('product_images_gallery')} h-full flex flex-col px-10 py-6 overflow-y-auto custom-scroll pr-1`}>
      {props.galleryExamples.length > 0 && (
        <div className="mb-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-zinc-200">
                {props.t.pg_img_examples_title || '示例案例'}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {props.t.pg_img_examples_subtitle || '点击示例，自动填充参数与出图方案'}
              </div>
            </div>
          </div>

          <div className="mt-3 flex gap-3 overflow-x-auto pb-2 custom-scroll">
            {props.galleryExamples.map((item) => {
              const isUserSnapshot = Boolean((item as any)?.isUserSnapshot);
              const canDelete = isUserSnapshot && Boolean(props.deleteGalleryExampleSnapshot);
              const canApply = isUserSnapshot;
              const isBusy = Boolean(props.isGalleryGenerating || props.isGalleryApplyingExample || props.isGalleryDeletingExampleSnapshot);
              const inputThumbs = (Array.isArray(item.inputImageUrls) ? item.inputImageUrls : [])
                .filter(Boolean)
                .slice(0, 2);
              if (inputThumbs.length === 0) inputThumbs.push(item.previewUrl);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => (isUserSnapshot ? undefined : props.applyGalleryExample(item.id))}
                  disabled={props.isGalleryGenerating || props.isGalleryApplyingExample}
                  className={`group relative aspect-[4/3] w-[288px] shrink-0 overflow-hidden rounded-2xl border border-white/10 ${isUserSnapshot ? 'bg-black/10' : 'bg-black/20'} text-left transition duration-300 hover:-translate-y-1 hover:border-white/20 disabled:opacity-60 disabled:hover:border-white/10`}
                  title={props.isGalleryGenerating || props.isGalleryApplyingExample ? (props.t.pg_img_examples_loading || '生成中...') : (isUserSnapshot ? (props.t.pg_img_saved_example_hover_tip || '悬浮显示操作') : (props.t.pg_img_examples_click_to_generate || '点击填充'))}
                >
                  <div className="relative h-full w-full">
                    <img
                      src={item.previewUrl}
                      alt={item.title}
                      className={`h-full w-full object-cover transition duration-300 group-hover:scale-[1.04] group-hover:brightness-110 ${isUserSnapshot ? 'opacity-85 group-hover:opacity-70 group-hover:blur-sm' : ''}`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                    <div className="absolute left-3 top-3 inline-flex items-center rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[11px] font-semibold text-white/80">
                      最终结果
                    </div>

                    <div className="absolute left-3 bottom-[62px] px-1 py-0.5">
                      <div className="mb-1 text-[11px] font-normal leading-none text-white/80">输入素材</div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          {inputThumbs.map((thumb, thumbIndex) => (
                            <div
                              key={`${item.id}-input-thumb-${thumbIndex}`}
                              className="h-[64px] w-[64px] overflow-hidden rounded-[10px] bg-black/20 shadow-[0_2px_8px_rgba(0,0,0,0.22)]"
                            >
                              <img src={thumb} alt="input" className="h-full w-full object-cover" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="absolute inset-x-4 bottom-3 pr-12">
                      <div className="text-sm font-extrabold text-white/95">{item.title}</div>
                      <div className="mt-0.5 text-[11px] text-white/70 line-clamp-1">{item.subtitle}</div>
                    </div>

                    <span className="absolute right-3 bottom-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-transparent text-white transition duration-300 group-hover:scale-110">
                      <ArrowRight className="h-4 w-4 !text-white" style={{ color: '#fff' }} />
                    </span>

                    {isUserSnapshot && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                        <div className="flex items-center gap-2">
                          {canApply && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                props.applyGalleryExample(item.id);
                              }}
                              className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60 disabled:hover:bg-emerald-500/15 transition"
                            >
                              {props.t.pg_img_saved_example_apply || '添加'}
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                props.deleteGalleryExampleSnapshot?.(item.id);
                              }}
                              className="px-3 py-2 rounded-xl text-xs font-bold bg-red-500/15 border border-red-500/30 text-red-100 hover:bg-red-500/20 disabled:opacity-60 disabled:hover:bg-red-500/15 transition"
                            >
                              {props.t.pg_img_saved_example_delete || '删除'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}

            {props.saveGalleryExampleSnapshot && (
              <button
                type="button"
                onClick={props.saveGalleryExampleSnapshot}
                disabled={props.isGalleryGenerating || props.isGalleryApplyingExample || props.isGallerySavingExampleSnapshot}
                className="group relative aspect-[4/3] w-[288px] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/10 text-left transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-black/20 disabled:opacity-60 disabled:hover:border-white/10"
                title={props.isGallerySavingExampleSnapshot ? (props.t.pg_img_saving || '保存中...') : (props.t.pg_img_save_as_example || '保存当前配置为示例')}
              >
                <div className="relative h-full flex items-center justify-center gap-2 px-4">
                  <Save className="h-4 w-4 text-orange-300/90" />
                  <div>
                    <div className="text-sm font-extrabold text-zinc-200">{props.t.pg_img_save_as_example || '保存为示例'}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500 line-clamp-1">{props.t.pg_img_save_as_example_desc || '保存当前工作区快照'}</div>
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-[720px] flex overflow-hidden relative" id="gallery-container">
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
                            <button
                              type="button"
                              onClick={() => openGalleryModelPicker(card.id)}
                              className="w-full h-full flex items-center justify-center text-zinc-500 hover:text-zinc-300"
                              aria-label={t.pg_img_select_virtual_model || '从素材库选择'}
                            >
                              <ImageIcon className="w-5 h-5" />
                            </button>
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
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openGalleryModelPicker(card.id)}
                              className="inline-flex px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800"
                            >
                              {previewSrc ? (t.pg_img_replace_virtual_model || '从素材库选择') : (t.pg_img_select_virtual_model || '从素材库选择')}
                            </button>
                            <label
                              htmlFor={uploadInputId}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                            >
                              <Upload className="w-4 h-4" />
                              {t.pg_img_upload_photo || '从本地上传'}
                            </label>
                          </div>
                          <div className="mt-2 flex items-center gap-1 text-[11px] text-zinc-500">
                            <span>{t.pg_img_model_photo_required_note || '支持从素材库选择或本地上传'}</span>
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
          className={`flex flex-col gap-4 min-h-0 overflow-y-auto custom-scroll pr-2 shrink-0 transition-[width] duration-100 border border-transparent ${getGuideFocusClass('middle')}`}
          style={{ width: `${middleWidth}px`, minWidth: `${GALLERY_PANEL_MIN_WIDTH}px` }}
          data-testid="middle-panel"
        >
          <div className="rounded-2xl border border-white/5 bg-white/2 p-5 flex flex-col flex-1">
            <div className="text-sm font-bold text-zinc-200 shrink-0">{t.hist_img_settings_title}</div>

            <div className="mt-4 p-4 rounded-xl border border-white/10 bg-black/20 space-y-6 flex-1">
              <ModelSelectorChips
                value={props.galleryGenerationModel}
                onChange={(next) => props.setGalleryGenerationModel(next)}
                label={props.t.pg_main_model || (language === 'zh' ? '生成模型' : 'Model')}
                orientation="vertical"
              />


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

                        {/* Row 1: 出图类型 + 分辨率 + 张数 */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
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
                          </div>
                          <div className="w-20 shrink-0">
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
                          </div>
                          <div className="shrink-0 flex items-center">
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

                        {/* Row 2: 比例选择独占整行 */}
                        <AspectRatioPicker
                          value={String(item.aspectRatio || '1:1')}
                          onChange={(next) => updateOutputItem(item.id, (current) => ({ ...current, aspectRatio: next }))}
                          primary={GALLERY_RATIOS.primary}
                          more={GALLERY_RATIOS.more}
                          size="sm"
                          labels={{
                            more: language === 'zh' ? '更多比例' : 'More ratios',
                            vertical: t.pi_gallery_ratio_group_vertical,
                            landscape: t.pi_gallery_ratio_group_landscape,
                          }}
                          descriptors={ratioDescriptorsForLanguage(language)}
                        />

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

                        <div className="space-y-3">
                          {extraConfigFields.map((field) => {
                            const isLongText = field.key === 'compositionHint' || field.key === 'negativeHints' || field.key === 'sellingPointText';
                            const value = String((item.cardConfig as any)?.[field.key] || '');

                            return (
                              <label key={`${item.id}-${field.key}`} className="space-y-1">
                                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{field.label}</div>
                                {isLongText ? (
                                  <textarea
                                    value={value}
                                    onChange={(e) =>
                                      updateOutputItem(item.id, (current) => ({
                                        ...current,
                                        cardConfig: {
                                          ...(current.cardConfig || {}),
                                          [field.key]: e.target.value,
                                        },
                                      }))
                                    }
                                    rows={3}
                                    className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
                                    placeholder={field.placeholder}
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={value}
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
                                )}
                              </label>
                            );
                          })}
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
          className="flex-1 rounded-2xl border border-transparent bg-white/2 p-5 flex flex-col min-h-0 overflow-hidden"
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
                ref={galleryBoardEditButtonRef}
                onClick={() => openGalleryBoardEditor()}
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
              <div className="p-4 space-y-4">
                <div
                  ref={galleryPreviewResultsRef}
                  className={`rounded-2xl border border-white/10 bg-black/15 ${getGuideFocusClass('result')}`}
                >
                  <div className="border-b border-white/10 px-4 py-3 text-xs font-bold uppercase tracking-[0.24em] text-zinc-500">
                    {t.pg_img_preview_area}
                  </div>
                  {galleryPreviewItems.length === 0 ? (
                    <div className="p-6">
                      <div className="mx-auto flex w-full max-w-[560px] aspect-square items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-zinc-500 gap-3">
                        <ImageIcon className="w-10 h-10 opacity-60" />
                        <div className="text-sm font-semibold text-zinc-400">
                          {t.pg_img_waiting_for_generation}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 space-y-3">
                      {galleryPreviewGroups.map((group) => {
                        if (group.type === 'full') {
                          return (
                            <div key={group.key}>
                              {renderPreviewCard(group.item)}
                            </div>
                          );
                        }
                        return (
                          <Masonry
                            key={group.key}
                            breakpointCols={2}
                            className="pg-masonry-grid"
                            columnClassName="pg-masonry-grid-col"
                          >
                            {group.items.map(renderPreviewCard)}
                          </Masonry>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div
                  ref={galleryBoardExampleRef}
                  className={`rounded-2xl border border-white/10 bg-black/25 p-4 ${getGuideFocusClass('board')}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-zinc-100">{t.pg_img_board_example_title}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openGalleryBoardEditor({ onboarding: true })}
                      className="inline-flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-bold text-orange-200 transition hover:bg-orange-500/15"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      {t.pg_img_board_example_action}
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                      {String(t.pg_img_board_example_badge || '').replace('{count}', String(gallerySucceededPreviewItems.length || 0))}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                      {galleryBoardCanvasRatio}
                    </span>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/70 p-3">
                    {gallerySucceededPreviewItems.length > 0 ? (
                      <div
                        className="relative mx-auto w-full overflow-hidden rounded-[22px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.18),transparent_36%),linear-gradient(135deg,rgba(24,24,27,0.96),rgba(9,9,11,1))]"
                        style={{ aspectRatio: galleryBoardExampleAspect }}
                      >
                        <div className="absolute left-[6%] top-[5%] h-[5.5%] w-[34%] rounded-full bg-white/14" />
                        <div className="absolute left-[6%] top-[13%] h-[2.8%] w-[22%] rounded-full bg-white/8" />
                        {galleryBoardExampleSlots.map((slot, index) => {
                          const item = gallerySucceededPreviewItems[index];
                          if (!item?.imageUrl) return null;
                          return (
                            <div
                              key={`${item.localId}-board-example`}
                              className="absolute overflow-hidden rounded-[16px] border border-white/10 bg-black/30 shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
                              style={{
                                left: `${slot.x * 100}%`,
                                top: `${slot.y * 100}%`,
                                width: `${slot.w * 100}%`,
                                height: `${slot.h * 100}%`,
                              }}
                            >
                              <img src={item.imageUrl} alt={item.requestId} className="h-full w-full object-cover" />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex aspect-[3/4] w-full items-center justify-center rounded-[22px] border border-white/10 bg-black/30 px-6 text-center">
                        <div className="space-y-3 text-zinc-500">
                          <LayoutGrid className="mx-auto h-8 w-8 text-zinc-600" />
                          <div className="text-sm font-semibold text-zinc-400">{t.pg_img_board_example_empty}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
                  openGalleryBoardEditor({ onboarding: true });
                  return;
                }
                setGuideStepIndex((prev) => Math.min(guideSteps.length - 1, prev + 1));
              }}
              className="px-4 py-2 rounded-xl bg-orange-500 text-xs font-bold text-black hover:bg-orange-400 transition"
            >
              {guideStepIndex >= guideSteps.length - 1 ? t.pg_img_guide_enter_board : t.wb_guide_next}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default ImagesGalleryView;
