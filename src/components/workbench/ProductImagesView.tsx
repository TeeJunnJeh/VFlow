import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Image as ImageIcon, Plus, Upload, X, Wand2, Minus, Sparkles, RotateCw, Download, FileDown, ChevronLeft, ChevronRight, LayoutGrid, ArrowLeft, PencilLine, Trash2, Zap, Check, Shirt, Wrench, Clapperboard, Folder } from 'lucide-react';
import type { ViewType } from './types';
import { useLanguage } from '../../context/LanguageContext';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { FirstFrameView, ImagesGalleryView, SmartRepairView } from '../productImages';
import { AppDialog } from '../common/AppDialog';
import TextSeparationDemoView, { type TextSeparationBlock } from './TextSeparationDemoView';
import GalleryBoardEditor, { type GalleryBoardAsset, type GalleryBoardDraft } from './GalleryBoardEditor';
import { assetsApi } from '../../services/assets';
import { videoApi } from '../../services/video';
import { downloadBlob, productImagesApi } from '../../services/productImagesApi';
import { billingApi } from '../../services/billing';
import { notifyImageHistoryUpdated, readImageHistoryByFeature, refreshImageHistory, removeImageHistoryAssets, replaceImageHistoryAsset, subscribeImageHistory, type ImageHistoryItem } from '../../utils/imageHistory';
import { extractLoadingThemeFromSources, getDefaultLoadingTheme, type LoadingTheme } from '../../utils/loadingTheme';
import { saveBlobWithPickerFallback } from '../../utils/browserDownload';
import { useRequireAuth } from '../../utils/useRequireAuth';
import { formatCreditAmount, roundCreditTenths } from '../../utils/credits';

interface ProductImagesViewProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
}

interface TextSeparationSession {
  sampleTitle: string;
  originalImageUrl: string;
  backgroundImageUrl: string;
  textBlocks: TextSeparationBlock[];
}

interface TextSeparationRecordItem {
  id: string;
  createdAt: string;
  sampleTitle: string;
  originalImageUrl: string;
  backgroundImageUrl?: string;
  textBlocks?: TextSeparationBlock[];
  status: 'processing' | 'succeeded';
  progress: number;
  startedAtMs?: number;
}

interface DemoLibraryItem {
  id: string;
  title: string;
  subtitle: string;
  previewUrl: string;
}

type GalleryHistorySettings = {
  targetScene: string;
  style: string;
  aspectRatio?: string;
  resolution?: string;
  copyLanguage?: string;
  productName: string;
  productCategory: string;
  sellingPoints: string[];
  typeSelections?: Record<string, { enabled: boolean; count: number }>;
  outputMode?: 'custom' | 'ai';
  outputItems?: Array<{
    id: string;
    enabled: boolean;
    outputType: string;
    aspectRatio: string;
    resolution: string;
    count: number;
    title?: string;
    modelCardId?: string;
    sceneCardId?: string;
    layout?: string;
    copy?: {
      headline?: string;
      subheadline?: string;
      body?: string;
      bulletPoints?: string[];
    };
    notes?: string;
    prompt?: string;
    cardConfig?: GalleryOutputCardConfig;
  }>;
  modelCards?: GalleryModelCardSnapshot[];
  sceneCards?: GallerySceneCard[];
  sceneConfig?: GallerySceneConfig;
  uploadedImagePaths?: string[];
  modelInfo?: string;
  modelImagePath?: string;
  bulkConfig?: {
    ratioStrategy?: GalleryBulkRatioStrategy;
    resolution?: '1k' | '2k' | '4k';
    bindingStrategy?: GalleryBulkBindingStrategy;
    typeSelections?: Record<string, { enabled: boolean; count: number }>;
  };
  generatedFromBulk?: boolean;
};

type GallerySceneConfig = {
  sceneTheme: string;
  sceneDescription: string;
  sceneProps: string;
  lighting: string;
  mood: string;
};

type GallerySceneCardSourceMode = 'preset' | 'custom';

type GalleryOutputCardConfig = {
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

type GalleryModelCardSnapshot = {
  id: string;
  name: string;
  imagePath?: string;
  modelInfo?: string;
};

type GalleryModelCard = GalleryModelCardSnapshot & {
  imageFile?: File | null;
  imagePreviewUrl?: string | null;
};

type GallerySceneCard = {
  id: string;
  name: string;
  sourceMode: GallerySceneCardSourceMode;
  presetId?: string;
  sceneConfig: GallerySceneConfig;
};

type GalleryHistoryItem = {
  id: string;
  createdAt: string;
  images: string[];
  settings?: GalleryHistorySettings;
  metadata?: Record<string, any>;
};

type GalleryOutputType = 'white_bg' | 'scene' | 'selling_point' | 'cover' | 'poster';
type GalleryConfirmAction = 'ok' | 'cancel' | 'dismiss';
type GalleryCopyLanguageLabelKey = 'lang_en' | 'lang_zh' | 'lang_es' | 'lang_ja' | 'lang_ko' | 'lang_ms' | 'lang_vi' | 'lang_id';
type GalleryBulkRatioStrategy = 'recommended' | '1:1' | '4:5' | '9:16';
type GalleryBulkBindingStrategy = 'none' | 'auto_primary';

type GalleryOutputMode = 'custom' | 'ai';
type GalleryOutputItem = {
  id: string;
  enabled: boolean;
  outputType: GalleryOutputType;
  aspectRatio: string;
  resolution: '1k' | '2k' | '4k';
  count: number;
  title?: string;
  modelCardId?: string;
  sceneCardId?: string;
  /** @deprecated kept for backward compat with old snapshots; new code reads from `layouts[layoutIndex]`. */
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
  cardConfig?: GalleryOutputCardConfig;
};

type GalleryBulkConfig = {
  ratioStrategy: GalleryBulkRatioStrategy;
  resolution: '1k' | '2k' | '4k';
  bindingStrategy: GalleryBulkBindingStrategy;
  typeSelections: Record<GalleryOutputType, { enabled: boolean; count: number }>;
};

const GALLERY_COPY_LANGUAGE_OPTIONS: Array<{ value: string; labelKey: GalleryCopyLanguageLabelKey }> = [
  { value: 'en', labelKey: 'lang_en' },
  { value: 'zh', labelKey: 'lang_zh' },
  { value: 'es', labelKey: 'lang_es' },
  { value: 'ja', labelKey: 'lang_ja' },
  { value: 'ko', labelKey: 'lang_ko' },
  { value: 'ms', labelKey: 'lang_ms' },
  { value: 'vi', labelKey: 'lang_vi' },
  { value: 'id', labelKey: 'lang_id' },
];

const GALLERY_OUTPUT_TYPE_ORDER: GalleryOutputType[] = ['white_bg', 'scene', 'selling_point', 'cover', 'poster'];
const GALLERY_SCENE_SENSITIVE_TYPES = new Set<GalleryOutputType>(['scene', 'selling_point', 'cover', 'poster']);
const GALLERY_BULK_RECOMMENDED_ASPECT_RATIOS: Record<GalleryOutputType, '1:1' | '4:5' | '9:16'> = {
  white_bg: '1:1',
  scene: '4:5',
  selling_point: '1:1',
  cover: '4:5',
  poster: '9:16',
};

const normalizeGalleryTypeSelections = (
  selections: Record<GalleryOutputType, { enabled: boolean; count: number }>
): Record<GalleryOutputType, { enabled: boolean; count: number }> => ({
  white_bg: {
    enabled: Boolean(selections.white_bg?.enabled),
    count: Math.max(0, Math.round(Number(selections.white_bg?.count || 0))),
  },
  scene: {
    enabled: Boolean(selections.scene?.enabled),
    count: Math.max(0, Math.round(Number(selections.scene?.count || 0))),
  },
  selling_point: {
    enabled: Boolean(selections.selling_point?.enabled),
    count: Math.max(0, Math.round(Number(selections.selling_point?.count || 0))),
  },
  cover: {
    enabled: Boolean(selections.cover?.enabled),
    count: Math.max(0, Math.round(Number(selections.cover?.count || 0))),
  },
  poster: {
    enabled: Boolean(selections.poster?.enabled),
    count: Math.max(0, Math.round(Number(selections.poster?.count || 0))),
  },
});

const createGalleryBulkTypeSelections = (sellingPointCount = 0) =>
  normalizeGalleryTypeSelections({
    white_bg: { enabled: true, count: 1 },
    scene: { enabled: true, count: 1 },
    selling_point: { enabled: sellingPointCount > 0, count: sellingPointCount > 0 ? sellingPointCount : 0 },
    cover: { enabled: false, count: 0 },
    poster: { enabled: false, count: 0 },
  });

const createDefaultGalleryBulkConfig = (sellingPointCount = 0): GalleryBulkConfig => ({
  ratioStrategy: 'recommended',
  resolution: '1k',
  bindingStrategy: 'auto_primary',
  typeSelections: createGalleryBulkTypeSelections(sellingPointCount),
});

const normalizeGalleryBulkConfig = (value: any, sellingPointCount = 0): GalleryBulkConfig => {
  const defaults = createDefaultGalleryBulkConfig(sellingPointCount);
  const ratioStrategy = String(value?.ratioStrategy || value?.ratio_strategy || '').trim();
  const resolutionRaw = String(value?.resolution || '').trim().toLowerCase();
  const bindingStrategyRaw = String(value?.bindingStrategy || value?.binding_strategy || '').trim();
  const normalizedSelections = value?.typeSelections && typeof value.typeSelections === 'object'
    ? normalizeGalleryTypeSelections({
        ...defaults.typeSelections,
        ...(value.typeSelections as Record<GalleryOutputType, { enabled: boolean; count: number }>),
      })
    : defaults.typeSelections;

  return {
    ratioStrategy:
      ratioStrategy === '1:1' || ratioStrategy === '4:5' || ratioStrategy === '9:16'
        ? ratioStrategy
        : 'recommended',
    resolution: resolutionRaw === '2k' || resolutionRaw === '4k' ? resolutionRaw : '1k',
    bindingStrategy: bindingStrategyRaw === 'none' ? 'none' : 'auto_primary',
    typeSelections: normalizedSelections,
  };
};

const resolveGalleryBulkAspectRatio = (
  outputType: GalleryOutputType,
  ratioStrategy: GalleryBulkRatioStrategy
) => (ratioStrategy === 'recommended' ? GALLERY_BULK_RECOMMENDED_ASPECT_RATIOS[outputType] : ratioStrategy);

const buildGalleryOutputItemsFromBulkConfig = ({
  bulkConfig,
  fallbackModelCardId,
  fallbackSceneCardId,
}: {
  bulkConfig: GalleryBulkConfig;
  fallbackModelCardId?: string;
  fallbackSceneCardId?: string;
}): GalleryOutputItem[] =>
  GALLERY_OUTPUT_TYPE_ORDER.flatMap((outputType) => {
    const selection = bulkConfig.typeSelections[outputType];
    if (!selection?.enabled) return [];
    const count = Math.max(0, Math.round(Number(selection.count || 0)));
    if (count <= 0) return [];
    return [{
      id: createGalleryOutputItemId(),
      enabled: true,
      outputType,
      aspectRatio: resolveGalleryBulkAspectRatio(outputType, bulkConfig.ratioStrategy),
      resolution: bulkConfig.resolution,
      count,
      modelCardId: GALLERY_SCENE_SENSITIVE_TYPES.has(outputType) && bulkConfig.bindingStrategy === 'auto_primary'
        ? fallbackModelCardId || undefined
        : undefined,
      sceneCardId: GALLERY_SCENE_SENSITIVE_TYPES.has(outputType) && bulkConfig.bindingStrategy === 'auto_primary'
        ? fallbackSceneCardId || undefined
        : undefined,
    }];
  });

const inferGalleryBulkConfigFromOutputItems = (
  items: GalleryOutputItem[],
  sellingPointCount: number
): GalleryBulkConfig => {
  const defaults = createDefaultGalleryBulkConfig(sellingPointCount);
  const enabledItems = items.filter((item) => item.enabled && item.count > 0);
  if (enabledItems.length === 0) return defaults;

  const typeSelections = normalizeGalleryTypeSelections(
    GALLERY_OUTPUT_TYPE_ORDER.reduce((acc, outputType) => {
      const matching = enabledItems.filter((item) => item.outputType === outputType);
      acc[outputType] = {
        enabled: matching.length > 0,
        count: matching.reduce((sum, item) => sum + Math.max(0, Math.round(Number(item.count || 0))), 0),
      };
      return acc;
    }, {} as Record<GalleryOutputType, { enabled: boolean; count: number }>)
  );

  const firstResolution = enabledItems[0]?.resolution || '1k';
  const sameResolution = enabledItems.every((item) => item.resolution === firstResolution);
  const firstAspectRatio = enabledItems[0]?.aspectRatio || '1:1';
  const sameAspectRatio = enabledItems.every((item) => item.aspectRatio === firstAspectRatio);
  const matchesRecommended = enabledItems.every(
    (item) => item.aspectRatio === GALLERY_BULK_RECOMMENDED_ASPECT_RATIOS[item.outputType]
  );
  const bindingStrategy = enabledItems.some(
    (item) => GALLERY_SCENE_SENSITIVE_TYPES.has(item.outputType) && (item.modelCardId || item.sceneCardId)
  )
    ? 'auto_primary'
    : 'none';

  return {
    ratioStrategy:
      sameAspectRatio && (firstAspectRatio === '1:1' || firstAspectRatio === '4:5' || firstAspectRatio === '9:16')
        ? firstAspectRatio
        : matchesRecommended
          ? 'recommended'
          : 'recommended',
    resolution: sameResolution ? firstResolution : '1k',
    bindingStrategy,
    typeSelections,
  };
};

const buildGalleryGenerationPlan = (selections: Record<GalleryOutputType, { enabled: boolean; count: number }>) => {
  const plan: Array<{ outputType: GalleryOutputType; order: number }> = [];

  for (const outputType of GALLERY_OUTPUT_TYPE_ORDER) {
    const config = selections[outputType];
    if (!config?.enabled) continue;
    const count = Math.max(0, Math.round(Number(config.count || 0)));
    for (let index = 0; index < count; index += 1) {
      plan.push({ outputType, order: index });
    }
  }

  return plan;
};

const createGalleryOutputItemId = () => `pg-out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createGalleryModelCardId = () => `pg-model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createGallerySceneCardId = () => `pg-scene-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createDefaultGalleryOutputItem = (): GalleryOutputItem => ({
  id: createGalleryOutputItemId(),
  enabled: true,
  outputType: 'white_bg',
  aspectRatio: '1:1',
  resolution: '1k',
  count: 1,
});

const createGalleryEmptySceneConfig = (): GallerySceneConfig => ({
  sceneTheme: '',
  sceneDescription: '',
  sceneProps: '',
  lighting: '',
  mood: '',
});

const sanitizeGallerySceneConfig = (value: any): GallerySceneConfig => ({
  sceneTheme: String(value?.sceneTheme || '').trim(),
  sceneDescription: String(value?.sceneDescription || '').trim(),
  sceneProps: String(value?.sceneProps || '').trim(),
  lighting: String(value?.lighting || '').trim(),
  mood: String(value?.mood || '').trim(),
});

const sanitizeGalleryOutputCardConfig = (value: any): GalleryOutputCardConfig | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const next: GalleryOutputCardConfig = {};
  const keys: Array<keyof GalleryOutputCardConfig> = [
    'visualFocus',
    'compositionHint',
    'copyTone',
    'negativeHints',
    'sellingPointText',
    'headlineFocus',
    'heroStyle',
    'campaignAngle',
    'promotionTone',
    'copyBlockDensity',
    'backgroundStyle',
    'displayAngle',
  ];
  keys.forEach((key) => {
    const raw = String((value as any)?.[key] || '').trim();
    if (raw) next[key] = raw;
  });
  return Object.keys(next).length > 0 ? next : undefined;
};

const sanitizeGalleryCopy = (value: any) => {
  if (!value || typeof value !== 'object') return undefined;
  const headline = typeof value.headline === 'string' ? value.headline.trim() : '';
  const subheadline = typeof value.subheadline === 'string' ? value.subheadline.trim() : '';
  const body = typeof value.body === 'string' ? value.body.trim() : '';
  const bulletPoints = Array.isArray(value.bulletPoints)
    ? value.bulletPoints.map((item: any) => String(item || '').trim()).filter(Boolean).slice(0, 8)
    : [];
  if (!headline && !subheadline && !body && bulletPoints.length === 0) return undefined;
  return {
    headline: headline || undefined,
    subheadline: subheadline || undefined,
    body: body || undefined,
    bulletPoints: bulletPoints.length > 0 ? bulletPoints : undefined,
  };
};

const createGalleryModelCard = (name: string): GalleryModelCard => ({
  id: createGalleryModelCardId(),
  name,
  imagePath: '',
  modelInfo: '',
  imageFile: null,
  imagePreviewUrl: null,
});

const createGallerySceneCard = (name: string): GallerySceneCard => ({
  id: createGallerySceneCardId(),
  name,
  sourceMode: 'custom',
  presetId: '',
  sceneConfig: createGalleryEmptySceneConfig(),
});

const toGalleryModelCardSnapshot = (card: GalleryModelCard): GalleryModelCardSnapshot => ({
  id: card.id,
  name: String(card.name || '').trim(),
  imagePath: String(card.imagePath || '').trim() || undefined,
  modelInfo: String(card.modelInfo || '').trim() || undefined,
});

const normalizeGalleryModelCard = (row: any): GalleryModelCard | null => {
  if (!row || typeof row !== 'object') return null;
  const id = String(row.id || createGalleryModelCardId()).trim();
  const name = String(row.name || '').trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    imagePath: String(row.imagePath || row.image_path || '').trim(),
    modelInfo: String(row.modelInfo || row.model_info || '').trim(),
    imageFile: null,
    imagePreviewUrl: String(row.imagePreviewUrl || '').trim() || null,
  };
};

const normalizeGallerySceneCard = (row: any): GallerySceneCard | null => {
  if (!row || typeof row !== 'object') return null;
  const id = String(row.id || createGallerySceneCardId()).trim();
  const name = String(row.name || '').trim();
  if (!id || !name) return null;
  const sourceMode = String(row.sourceMode || row.source_mode || '').trim() === 'preset' ? 'preset' : 'custom';
  return {
    id,
    name,
    sourceMode,
    presetId: String(row.presetId || row.preset_id || '').trim(),
    sceneConfig: sanitizeGallerySceneConfig(row.sceneConfig || row.scene_config || row),
  };
};

const normalizeGalleryOutputItem = (row: any): GalleryOutputItem | null => {
  const outputType = String(row?.outputType || row?.output_type || '').trim() as GalleryOutputType;
  if (!GALLERY_OUTPUT_TYPE_ORDER.includes(outputType)) return null;
  const supportsResourceBinding = outputType !== 'white_bg';
  const aspectRatio = String(row?.aspectRatio || row?.aspect_ratio || '1:1').trim() || '1:1';
  const resolutionRaw = String(row?.resolution || '1k').trim().toLowerCase();
  const resolution = resolutionRaw === '2k' || resolutionRaw === '4k' ? resolutionRaw : '1k';
  const count = Math.max(0, Math.round(Number(row?.count || 0)));
  const rawLayouts = Array.isArray(row?.layouts)
    ? row.layouts.map((entry: any) => String(entry ?? '')).filter((entry: string) => entry.trim().length > 0)
    : [];
  const legacyLayout = typeof row?.layout === 'string' ? row.layout : '';
  const layouts = rawLayouts.length > 0
    ? rawLayouts
    : (legacyLayout && legacyLayout.trim() ? [legacyLayout] : []);
  const rawIndex = Number(row?.layoutIndex ?? row?.layout_index ?? 0);
  const layoutIndex = Number.isFinite(rawIndex)
    ? Math.min(Math.max(0, Math.floor(rawIndex)), Math.max(0, layouts.length - 1))
    : 0;
  return {
    id: String(row?.id || createGalleryOutputItemId()),
    enabled: Boolean(row?.enabled ?? true),
    outputType,
    aspectRatio,
    resolution: resolution as '1k' | '2k' | '4k',
    count,
    title: typeof row?.title === 'string' ? row.title : undefined,
    modelCardId: supportsResourceBinding
      ? (typeof row?.modelCardId === 'string' ? row.modelCardId : (typeof row?.model_card_id === 'string' ? row.model_card_id : undefined))
      : undefined,
    sceneCardId: supportsResourceBinding
      ? (typeof row?.sceneCardId === 'string' ? row.sceneCardId : (typeof row?.scene_card_id === 'string' ? row.scene_card_id : undefined))
      : undefined,
    layout: layouts[layoutIndex] ?? (legacyLayout || undefined),
    layouts,
    layoutIndex,
  };
};

const GALLERY_SCENE_PRESETS: Array<GallerySceneConfig & { id: string; name: string }> = [
  {
    id: 'kitchen_counter',
    name: '厨房台面',
    sceneTheme: '现代厨房台面',
    sceneDescription: '干净的厨房石英台面，背景有轻微虚化的橱柜与餐具，整体整洁明亮。',
    sceneProps: '瓷盘、亚麻餐巾、玻璃杯、少量食材点缀',
    lighting: '侧前方自然柔光，明亮但不过曝',
    mood: '清新、日常、高品质生活感',
  },
  {
    id: 'vanity_desk',
    name: '梳妆台',
    sceneTheme: '精致梳妆台',
    sceneDescription: '米白色或浅木色梳妆台，背景简洁，高级但生活化。',
    sceneProps: '镜子、香氛、托盘、化妆刷、丝绸布料',
    lighting: '柔和漫射光，略带暖调',
    mood: '高级、女性化、精致护理感',
  },
  {
    id: 'living_room',
    name: '客厅茶几',
    sceneTheme: '现代客厅茶几',
    sceneDescription: '简洁现代客厅环境，茶几作为主要表面，背景为沙发和窗边虚化景深。',
    sceneProps: '杂志、咖啡杯、小型绿植、摆件',
    lighting: '窗边自然光，光线均匀柔和',
    mood: '松弛、温暖、居家品质感',
  },
  {
    id: 'family_room',
    name: '家庭房',
    sceneTheme: '温馨家庭房',
    sceneDescription: '家庭房沙发与茶几区域，背景有地毯、落地灯和收纳柜，整体温暖放松，生活化明显。',
    sceneProps: '抱枕、毛毯、杂志、马克杯、绿植',
    lighting: '窗边自然光配合室内暖光，柔和通透',
    mood: '温馨、陪伴感、家庭生活氛围',
  },
  {
    id: 'bathroom_sink',
    name: '浴室台面',
    sceneTheme: '高级浴室洗手台',
    sceneDescription: '石材洗手台面，背景有镜面和简洁卫浴元素，整体干净利落。',
    sceneProps: '毛巾、托盘、香薰蜡烛、绿植',
    lighting: '顶部柔光加侧面补光，清爽高亮',
    mood: '洁净、护理感、高级氛围',
  },
  {
    id: 'outdoor_picnic',
    name: '户外野餐',
    sceneTheme: '户外草地野餐',
    sceneDescription: '自然草地或木桌环境，背景带户外虚化景色，画面通透轻松。',
    sceneProps: '野餐布、藤篮、水果、玻璃瓶、花束',
    lighting: '自然日光，通透明快',
    mood: '轻松、活力、生活方式感',
  },
];

const formatGalleryPreviewDatetime = (raw: string) => {
  const value = String(raw || '').trim();
  if (!value || value === '-') return '-';

  const direct = value.match(/^(\d{4})[-/](\d{2})[-/](\d{2})\s+(\d{2}):(\d{2})/);
  if (direct) {
    const [, y, m, d, hh, mm] = direct;
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }

  const numeric = value.match(/^\d{10,13}$/);
  const date = numeric
    ? new Date(Number(value) * (value.length === 10 ? 1000 : 1))
    : new Date(value);

  if (!Number.isFinite(date.getTime())) return value;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const getGalleryPreviewAspectClass = (ratio: string) => {
  const cleaned = String(ratio || '').trim();
  const map: Record<string, string> = {
    '21:9': 'aspect-[21/9]',
    '16:9': 'aspect-video',
    '4:3': 'aspect-[4/3]',
    '3:2': 'aspect-[3/2]',
    '1:1': 'aspect-square',
    '9:16': 'aspect-[9/16]',
    '3:4': 'aspect-[3/4]',
    '2:3': 'aspect-[2/3]',
    '5:4': 'aspect-[5/4]',
    '4:5': 'aspect-[4/5]',
    default: 'aspect-square',
  };
  return map[cleaned] || 'aspect-square';
};

const hexToRgba = (hex: string, alpha: number) => {
  const cleaned = String(hex || '').trim().replace('#', '');
  const normalized = cleaned.length === 3
    ? cleaned.split('').map((char) => char + char).join('')
    : cleaned;
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
  const shift = ((hash % 23) - 11) / 100;
  const secondaryShift = (((hash >> 3) % 19) - 9) / 100;
  const accentShift = (((hash >> 5) % 17) - 8) / 100;

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
              top: blob.top,
              left: blob.left,
              right: blob.right,
              bottom: blob.bottom,
              background: blob.gradient,
              animationName: 'gallery-card-blob-shift',
              animationDuration: blob.duration,
              animationDelay: blob.delay,
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
              animationDirection: blob.direction || 'normal',
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
          <div className="mt-1 text-[11px] text-zinc-700/60">
            Rendering preview...
          </div>
        </div>
      </div>
    </div>
  );
};

const ProductImagesView: React.FC<ProductImagesViewProps> = ({ activeView, setActiveView }) => {
  const { language, t } = useLanguage();
  const { requireAuth } = useRequireAuth();
  const isZh = language === 'zh';
  const isProductView =
    activeView === 'product_images_clothing_swap' ||
    activeView === 'product_images_first_frame' ||
    activeView === 'product_images_smart_repair' ||
    activeView === 'product_images_gallery' ||
    activeView === 'product_images_text_separation';

  const currentValue: ViewType = isProductView ? activeView : 'product_images_first_frame';
  const panelClassName = (view: ViewType) => (currentValue === view ? 'block' : 'hidden');
  const [firstFrameHeaderActionsContainer, setFirstFrameHeaderActionsContainer] = useState<HTMLDivElement | null>(null);

  const currentHeader = useMemo(() => {
    switch (currentValue) {
      case 'product_images_clothing_swap':
        return {
          icon: Shirt,
          title: t.wb_nav_product_clothing_swap,
          subtitle: t.pg_main_clothing_swap_subtitle,
        };
      case 'product_images_smart_repair':
        return {
          icon: Wrench,
          title: t.wb_nav_product_smart_repair,
          subtitle: t.pg_main_smart_repair_subtitle,
        };
      case 'product_images_gallery':
        return {
          icon: LayoutGrid,
          title: t.pg_main_gallery_title,
          subtitle: t.pg_main_gallery_subtitle,
        };
      case 'product_images_text_separation':
        return {
          icon: PencilLine,
          title: t.wb_nav_product_text_separation,
          subtitle: t.pg_main_text_separation_subtitle,
        };
      case 'product_images_first_frame':
      default:
        return {
          icon: Clapperboard,
          title: t.ff_page_title,
          subtitle: '',
        };
    }
  }, [currentValue, t]);


  const CurrentHeaderIcon = currentHeader.icon;

  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [galleryProductName, setGalleryProductName] = useState('');
  const [galleryCategory, setGalleryCategory] = useState('');
  const [gallerySellingPoints, setGallerySellingPoints] = useState<string[]>([]);
  const [galleryTargetScene, setGalleryTargetScene] = useState<'detail' | 'xiaohongshu' | 'douyin' | 'poster' | 'ads'>('detail');
  const [galleryStyle, setGalleryStyle] = useState<'ecom_clean' | 'lifestyle' | 'premium' | 'festival'>('ecom_clean');
  const [galleryModelCards, setGalleryModelCards] = useState<GalleryModelCard[]>([]);
  const [gallerySceneCards, setGallerySceneCards] = useState<GallerySceneCard[]>([]);
  const [galleryResourceGuide, setGalleryResourceGuide] = useState<{ target: 'model' | 'scene' | null; token: number }>({
    target: null,
    token: 0,
  });
  const [galleryBulkConfig, setGalleryBulkConfig] = useState<GalleryBulkConfig>(() => createDefaultGalleryBulkConfig());
  const [galleryAdvancedDirty, setGalleryAdvancedDirty] = useState(false);
  const [isGalleryAdvancedEditingCollapsed, setIsGalleryAdvancedEditingCollapsed] = useState(true);
  const [galleryOutputMode, setGalleryOutputMode] = useState<GalleryOutputMode>('custom');
  const [galleryOutputItems, setGalleryOutputItems] = useState<GalleryOutputItem[]>(() =>
    buildGalleryOutputItemsFromBulkConfig({ bulkConfig: createDefaultGalleryBulkConfig() })
  );
  const galleryPreviewAspectRatio = useMemo(() => {
    const firstEnabled = galleryOutputItems.find((item) => item.enabled);
    return firstEnabled?.aspectRatio || '1:1';
  }, [galleryOutputItems]);
  const galleryPreviewAspectClass = useMemo(() => getGalleryPreviewAspectClass(galleryPreviewAspectRatio), [galleryPreviewAspectRatio]);
  const [galleryCopyLanguage, setGalleryCopyLanguage] = useState<string>(() => {
    const defaultLang = language === 'zh' || language === 'ms' || language === 'vi' || language === 'ko' ? language : 'en';
    return GALLERY_COPY_LANGUAGE_OPTIONS.some((opt) => opt.value === defaultLang) ? defaultLang : 'en';
  });
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);
  const [galleryPreviewUrls, setGalleryPreviewUrls] = useState<string[]>([]);
  const [isGalleryDragActive, setIsGalleryDragActive] = useState(false);
  const [isGalleryAnalyzing, setIsGalleryAnalyzing] = useState(false);
  const [galleryAlert, setGalleryAlert] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });
  const [galleryRightPanel, setGalleryRightPanel] = useState<'preview' | 'history'>('preview');
  const [galleryHistoryItems, setGalleryHistoryItems] = useState<GalleryHistoryItem[]>([]);
  const [isGalleryHistoryManaging, setIsGalleryHistoryManaging] = useState(false);
  const [galleryHistorySelectedKeys, setGalleryHistorySelectedKeys] = useState<string[]>([]);
  const [isGalleryGenerating, setIsGalleryGenerating] = useState(false);
  const [galleryPreviewImageUrl, setGalleryPreviewImageUrl] = useState<string | null>(null);
  const [isTextSeparationLoading, setIsTextSeparationLoading] = useState(false);
  const [textSeparationSession, setTextSeparationSession] = useState<TextSeparationSession | null>(null);
  const textSeparationFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isTextSeparationDragActive, setIsTextSeparationDragActive] = useState(false);
  const [textSeparationUploadPreviewUrl, setTextSeparationUploadPreviewUrl] = useState<string | null>(null);
  const [textSeparationUploadName, setTextSeparationUploadName] = useState<string>('');
  const [isTextSeparationHistoryPickerOpen, setIsTextSeparationHistoryPickerOpen] = useState(false);
  const [textSeparationSelectedImagePath, setTextSeparationSelectedImagePath] = useState<string | null>(null);
  const [textSeparationSelectedOriginalUrl, setTextSeparationSelectedOriginalUrl] = useState<string | null>(null);
  const [textSeparationRecords, setTextSeparationRecords] = useState<TextSeparationRecordItem[]>([]);
  // Backend image paths restored from history "re-generate" — allows skipping upload
  const [galleryRestoredImagePaths, setGalleryRestoredImagePaths] = useState<string[]>([]);
  const [galleryPreviewItems, setGalleryPreviewItems] = useState<
    Array<{
      localId: string;
      requestId: string;
      status: 'created' | 'processing' | 'succeeded' | 'failed';
      imageUrl?: string;
      error?: string;
      outputType?: string;
      createdAt?: string;
      layout?: any;
    }>
  >([]);
  const [isGalleryBoardAssetPickerOpen, setIsGalleryBoardAssetPickerOpen] = useState(false);
  const [isGalleryBoardEditorOpen, setIsGalleryBoardEditorOpen] = useState(false);
  const [galleryBoardSessionAssets, setGalleryBoardSessionAssets] = useState<GalleryBoardAsset[]>([]);
  const [galleryBoardLocalAssets, setGalleryBoardLocalAssets] = useState<GalleryBoardAsset[]>([]);
  const [galleryBoardPickerAssets, setGalleryBoardPickerAssets] = useState<GalleryBoardAsset[]>([]);
  const [galleryBoardDraft, setGalleryBoardDraft] = useState<GalleryBoardDraft | null>(null);
  const [galleryBoardSelectedAssetIds, setGalleryBoardSelectedAssetIds] = useState<string[]>([]);
  const [galleryBoardCanvasRatio, setGalleryBoardCanvasRatio] = useState<'3:4' | '1:1' | '4:3' | '2:3' | '3:2' | '16:9' | '9:16'>('3:4');
  const [isGalleryBoardLibraryPickerOpen, setIsGalleryBoardLibraryPickerOpen] = useState(false);
  const [galleryBoardLibraryAssetType, setGalleryBoardLibraryAssetType] = useState<'product' | 'scene'>('product');
  const [galleryBoardLibraryLoading, setGalleryBoardLibraryLoading] = useState(false);
  const [galleryBoardLibraryError, setGalleryBoardLibraryError] = useState<string | null>(null);
  const [galleryBoardLibraryItems, setGalleryBoardLibraryItems] = useState<any[]>([]);
  const [galleryBoardLibraryFolders, setGalleryBoardLibraryFolders] = useState<any[]>([]);
  const [galleryBoardLibraryBreadcrumb, setGalleryBoardLibraryBreadcrumb] = useState<any[]>([]);
  const [galleryBoardLibraryCurrentFolderId, setGalleryBoardLibraryCurrentFolderId] = useState<string | null>(null);
  const [isGalleryBoardHistoryPickerOpen, setIsGalleryBoardHistoryPickerOpen] = useState(false);
  const galleryBoardPickerUploadRef = useRef<HTMLInputElement | null>(null);
  const [galleryTextEditor, setGalleryTextEditor] = useState<{ open: boolean; localId: string; imageUrl: string; layout: any } | null>(null);
  const [galleryTextDraftLayout, setGalleryTextDraftLayout] = useState<any | null>(null);
  const [isGalleryTextExporting, setIsGalleryTextExporting] = useState(false);
  const galleryBoardBlobUrlsRef = useRef<string[]>([]);
  const dragTextRef = useRef<{
    index: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const [hotStyleLoading, setHotStyleLoading] = useState(false);
  const [hotStyleItems, setHotStyleItems] = useState<Array<{ name: string; tones: string[]; description: string }>>([]);
  const [hotStyleSelectedIndex, setHotStyleSelectedIndex] = useState<number | null>(null);
  const [hotStyleError, setHotStyleError] = useState<string | null>(null);
  const [galleryLoadingTheme, setGalleryLoadingTheme] = useState<LoadingTheme>(getDefaultLoadingTheme());
  const [galleryLoadingBackgroundSrc, setGalleryLoadingBackgroundSrc] = useState<string>('');
  const [galleryOptimizingItemIds, setGalleryOptimizingItemIds] = useState<Record<string, boolean>>({});
  const [imageModelRates, setImageModelRates] = useState<Record<string, number>>({});
  const galleryModelPreviewUrlsRef = useRef<string[]>([]);
  const galleryPrevSellingPointCountRef = useRef(0);

  useEffect(() => {
    let alive = true;
    void billingApi.getOverview()
      .then((res) => {
        if (!alive) return;
        const models = (res?.data?.pricing?.image?.models || {}) as Record<string, any>;
        const nextRates: Record<string, number> = {};
        Object.entries(models).forEach(([key, value]) => {
          const rate = Number((value as any)?.rate || 0);
          if (Number.isFinite(rate) && rate > 0) nextRates[String(key)] = rate;
        });
        setImageModelRates(nextRates);
      })
      .catch(() => {
        if (alive) setImageModelRates({});
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!isGalleryBoardLibraryPickerOpen) return;
    let cancelled = false;

    const loadLibraryItems = async () => {
      setGalleryBoardLibraryLoading(true);
      setGalleryBoardLibraryError(null);
      try {
        const [items, folderData] = await Promise.all([
          assetsApi.getAssets({ type: galleryBoardLibraryAssetType, folderId: galleryBoardLibraryCurrentFolderId }),
          assetsApi.getFolders({ type: galleryBoardLibraryAssetType, parentId: galleryBoardLibraryCurrentFolderId }),
        ]);
        if (cancelled) return;
        setGalleryBoardLibraryItems(Array.isArray(items) ? items.filter((item: any) => item.media_kind !== 'video') : []);
        setGalleryBoardLibraryFolders(Array.isArray(folderData.folders) ? folderData.folders : []);
        setGalleryBoardLibraryBreadcrumb(Array.isArray(folderData.breadcrumb) ? folderData.breadcrumb : []);
      } catch (error: any) {
        if (cancelled) return;
        setGalleryBoardLibraryItems([]);
        setGalleryBoardLibraryFolders([]);
        setGalleryBoardLibraryBreadcrumb([]);
        setGalleryBoardLibraryError(String(error?.message || t.ui_dialog_error));
      } finally {
        if (!cancelled) setGalleryBoardLibraryLoading(false);
      }
    };

    void loadLibraryItems();
    return () => {
      cancelled = true;
    };
  }, [galleryBoardLibraryAssetType, galleryBoardLibraryCurrentFolderId, isGalleryBoardLibraryPickerOpen, t.ui_dialog_error]);

  const textSeparationEstimatedCost = useMemo(() => {
    const rate = Number(imageModelRates['gemini-3-pro-image-preview'] || 0);
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return Math.max(0, roundCreditTenths(rate));
  }, [imageModelRates]);

  const galleryPlannedImageCount = useMemo(() => {
    return galleryOutputItems
      .filter((item) => item.enabled)
      .reduce((sum, item) => sum + Math.max(0, Math.round(Number(item.count || 0))), 0);
  }, [galleryOutputItems]);
  const effectiveGallerySellingPointCount = useMemo(
    () => gallerySellingPoints.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 5).length,
    [gallerySellingPoints]
  );

  useEffect(() => {
    setGalleryBulkConfig((prev) => {
      const previousDetectedCount = galleryPrevSellingPointCountRef.current;
      galleryPrevSellingPointCountRef.current = effectiveGallerySellingPointCount;

      const currentSellingPointSelection = prev.typeSelections.selling_point;
      const shouldSyncWithSellingPoints =
        effectiveGallerySellingPointCount === 0 ||
        currentSellingPointSelection.count === previousDetectedCount ||
        currentSellingPointSelection.count === 0;

      if (!shouldSyncWithSellingPoints) return prev;

      const nextTypeSelections = normalizeGalleryTypeSelections({
        ...prev.typeSelections,
        selling_point: {
          enabled: effectiveGallerySellingPointCount > 0,
          count: effectiveGallerySellingPointCount,
        },
      });

      if (
        nextTypeSelections.selling_point.enabled === currentSellingPointSelection.enabled &&
        nextTypeSelections.selling_point.count === currentSellingPointSelection.count
      ) {
        return prev;
      }

      return {
        ...prev,
        typeSelections: nextTypeSelections,
      };
    });
  }, [effectiveGallerySellingPointCount]);

  const galleryEstimatedCost = useMemo(() => {
    const rate = Number(imageModelRates['gemini-3-pro-image-preview'] || 0);
    if (!Number.isFinite(rate) || rate <= 0 || galleryPlannedImageCount <= 0) return 0;
    return Math.max(0, roundCreditTenths(rate * galleryPlannedImageCount));
  }, [imageModelRates, galleryPlannedImageCount]);

  const galleryInpaintEstimatedCost = useMemo(() => {
    const rate = Number(imageModelRates['gemini-3-pro-image-preview'] || 0);
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return Math.max(0, roundCreditTenths(rate));
  }, [imageModelRates]);

  const galleryHistoryAllKeys = useMemo(
    () => galleryHistoryItems.flatMap((item) => item.images.map((_, idx) => `${item.id}:${idx}`)),
    [galleryHistoryItems]
  );
  const galleryHistorySelectedSet = useMemo(() => new Set(galleryHistorySelectedKeys), [galleryHistorySelectedKeys]);
  const isGalleryHistoryAllSelected =
    galleryHistoryAllKeys.length > 0 && galleryHistoryAllKeys.every((key) => galleryHistorySelectedSet.has(key));
  const galleryBoardAssets = useMemo(
    () =>
      galleryPreviewItems
        .filter((item) => item.status === 'succeeded' && Boolean(String(item.imageUrl || '').trim()))
        .map((item) => ({
          localId: `current-${item.localId}`,
          requestId: item.requestId,
          imageUrl: String(item.imageUrl || '').trim(),
          source: 'current' as const,
          layout: item.layout,
        })),
    [galleryPreviewItems]
  );
  const galleryBoardCandidateAssets = useMemo(() => {
    const deduped = new Map<string, GalleryBoardAsset>();
    [...galleryBoardAssets, ...galleryBoardSessionAssets, ...galleryBoardPickerAssets].forEach((asset) => {
      const localId = String(asset.localId || '').trim();
      if (!localId || deduped.has(localId)) return;
      deduped.set(localId, asset);
    });
    return Array.from(deduped.values());
  }, [galleryBoardAssets, galleryBoardPickerAssets, galleryBoardSessionAssets]);
  const galleryBoardSelectedAssetSet = useMemo(() => new Set(galleryBoardSelectedAssetIds), [galleryBoardSelectedAssetIds]);
  const galleryPollAbortRef = useRef(false);
  const galleryPollRunIdRef = useRef<number>(0);

  const closeGalleryAlert = () => setGalleryAlert((prev) => ({ ...prev, open: false }));
  const openGalleryAlert = (message: string, title?: string) =>
    setGalleryAlert({
      open: true,
      title: title || t.pg_main_notice,
      message,
    });

  const guideGalleryResourceSection = (target: 'model' | 'scene') => {
    setGalleryResourceGuide({
      target,
      token: Date.now(),
    });
  };

  const buildNextGalleryResourceName = (prefix: string, items: Array<{ name?: string }>) => {
    let next = items.length + 1;
    const taken = new Set(items.map((item) => String(item.name || '').trim()).filter(Boolean));
    while (taken.has(`${prefix}${next}`)) {
      next += 1;
    }
    return `${prefix}${next}`;
  };

  const addGalleryModelCard = () => {
    setGalleryModelCards((prev) => [...prev, createGalleryModelCard(buildNextGalleryResourceName('模特', prev))]);
    guideGalleryResourceSection('model');
  };

  const addGallerySceneCard = () => {
    setGallerySceneCards((prev) => [...prev, createGallerySceneCard(buildNextGalleryResourceName('场景', prev))]);
    guideGalleryResourceSection('scene');
  };

  const revokeGalleryModelPreviewUrl = (value?: string | null) => {
    const url = String(value || '').trim();
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  };

  const applyGalleryScenePresetToCard = (presetId: string): GallerySceneConfig => {
    const preset = GALLERY_SCENE_PRESETS.find((item) => item.id === presetId);
    return preset ? sanitizeGallerySceneConfig(preset) : createGalleryEmptySceneConfig();
  };

  const removeGalleryModelCard = (cardId: string) => {
    setGalleryModelCards((prev) => {
      const target = prev.find((card) => card.id === cardId);
      if (target) revokeGalleryModelPreviewUrl(target.imagePreviewUrl);
      return prev.filter((card) => card.id !== cardId);
    });
  };

  const clearGalleryModelCardImage = (cardId: string) => {
    setGalleryModelCards((prev) =>
      prev.map((card) => {
        if (card.id !== cardId) return card;
        revokeGalleryModelPreviewUrl(card.imagePreviewUrl);
        return {
          ...card,
          imageFile: null,
          imagePath: '',
          imagePreviewUrl: null,
        };
      })
    );
  };

  const removeGallerySceneCard = (cardId: string) => {
    setGallerySceneCards((prev) => prev.filter((card) => card.id !== cardId));
  };

  const ensureGalleryModelCardAssetPaths = async (cardIds?: string[]) => {
    const limitedIds = Array.isArray(cardIds) && cardIds.length > 0 ? new Set(cardIds) : null;
    const nextCards: GalleryModelCard[] = [];
    let changed = false;

    for (const card of galleryModelCards) {
      if (limitedIds && !limitedIds.has(card.id)) {
        nextCards.push(card);
        continue;
      }
      if (!card.imageFile) {
        nextCards.push(card);
        continue;
      }
      const uploadResp = await assetsApi.uploadTempAsset(card.imageFile);
      const path = extractUploadedAssetPath(uploadResp);
      if (!path) {
        throw new Error(t.pg_main_error_model_card_upload.replace('{name}', String(card.name || card.id)));
      }
      nextCards.push({
        ...card,
        imagePath: String(path).trim(),
        imageFile: null,
      });
      changed = true;
    }

    if (changed) {
      setGalleryModelCards(nextCards);
      return nextCards;
    }
    return galleryModelCards;
  };

  const galleryConfirmResolverRef = useRef<((value: GalleryConfirmAction) => void) | null>(null);
  const [galleryConfirm, setGalleryConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
    okLabel: string;
    cancelLabel: string;
  }>({
    open: false,
    title: '',
    message: '',
    okLabel: '',
    cancelLabel: '',
  });

  const closeGalleryConfirm = (value: GalleryConfirmAction) => {
    setGalleryConfirm((prev) => ({ ...prev, open: false }));
    const resolver = galleryConfirmResolverRef.current;
    galleryConfirmResolverRef.current = null;
    if (resolver) resolver(value);
  };

  const [galleryAiOutputPlanner, setGalleryAiOutputPlanner] = useState<{
    open: boolean;
    prompt: string;
    isGenerating: boolean;
    error: string | null;
  }>({
    open: false,
    prompt: '',
    isGenerating: false,
    error: null,
  });

  type GalleryPreviewSource =
    | { kind: 'preview_item'; localId: string }
    | { kind: 'history_item'; itemId: string; index: number }
    | null;

  const [isGalleryPreviewDownloading, setIsGalleryPreviewDownloading] = useState(false);
  const [isGalleryPreviewExportingPdf, setIsGalleryPreviewExportingPdf] = useState(false);
  const [galleryPreviewSource, setGalleryPreviewSource] = useState<GalleryPreviewSource>(null);
  const [galleryDownloadBubbleOpen, setGalleryDownloadBubbleOpen] = useState(false);
  const galleryDownloadBubbleRef = useRef<HTMLDivElement | null>(null);
  const galleryDownloadButtonRef = useRef<HTMLButtonElement | null>(null);
  const [galleryToastMessage, setGalleryToastMessage] = useState<string | null>(null);
  const [galleryPreviewResolution, setGalleryPreviewResolution] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!galleryToastMessage) return;
    const timer = window.setTimeout(() => setGalleryToastMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [galleryToastMessage]);

  useEffect(() => {
    if (!galleryDownloadBubbleOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (galleryDownloadBubbleRef.current?.contains(target)) return;
      if (galleryDownloadButtonRef.current?.contains(target)) return;
      setGalleryDownloadBubbleOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGalleryDownloadBubbleOpen(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [galleryDownloadBubbleOpen]);

  useEffect(() => {
    galleryBoardBlobUrlsRef.current = [...galleryBoardSessionAssets, ...galleryBoardPickerAssets, ...galleryBoardLocalAssets]
      .map((item) => String(item.imageUrl || ''))
      .filter((url) => url.startsWith('blob:'));
  }, [galleryBoardLocalAssets, galleryBoardPickerAssets, galleryBoardSessionAssets]);

  useEffect(() => {
    return () => {
      galleryBoardBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    setGalleryPreviewResolution(null);
  }, [galleryPreviewImageUrl]);

  const [galleryInpaint, setGalleryInpaint] = useState<{
    open: boolean;
    step: 'edit' | 'compare';
    selectedCompare: 'original' | 'edited';
    prompt: string;
    rect: { x: number; y: number; w: number; h: number } | null;
    isDragging: boolean;
    dragStart: { x: number; y: number } | null;
    maskOpacity: number;
    isGenerating: boolean;
    resultUrl: string | null;
    error: string | null;
  }>({
    open: false,
    step: 'edit',
    selectedCompare: 'edited',
    prompt: '',
    rect: null,
    isDragging: false,
    dragStart: null,
    maskOpacity: 0.55,
    isGenerating: false,
    resultUrl: null,
    error: null,
  });

  const galleryInpaintBoxRef = useRef<HTMLDivElement | null>(null);
  const galleryInpaintImgRef = useRef<HTMLImageElement | null>(null);
  const inpaintRafRef = useRef<number | null>(null);
  const inpaintPendingRef = useRef<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [inpaintBoxSize, setInpaintBoxSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    if (!galleryInpaint.open) return;

    const update = () => {
      const box = galleryInpaintBoxRef.current;
      if (!box) return;
      const r = box.getBoundingClientRect();
      setInpaintBoxSize({ w: r.width, h: r.height });
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [galleryInpaint.open]);

  const closeGalleryImagePreview = () => {
    setGalleryPreviewImageUrl(null);
    setGalleryPreviewSource(null);
  };

  const openGalleryImagePreview = (url: string, source: GalleryPreviewSource = null) => {
    const cleaned = String(url || '').trim();
    if (!cleaned) return;
    setGalleryPreviewImageUrl(cleaned);
    setGalleryPreviewSource(source);
  };

  const openGalleryBoardEditor = () => {
    const preservedIds = galleryBoardSessionAssets.map((item) => item.localId).filter(Boolean).slice(0, 9);
    const defaultIds = preservedIds.length > 0
      ? preservedIds
      : galleryBoardAssets.slice(0, 9).map((item) => item.localId);
    setGalleryBoardSelectedAssetIds(defaultIds);
    setGalleryBoardCanvasRatio(galleryBoardDraft?.templateRatioId || galleryBoardCanvasRatio || '3:4');
    setGalleryBoardLibraryCurrentFolderId(null);
    setGalleryBoardLibraryAssetType('product');
    setGalleryBoardPickerAssets([]);
    setIsGalleryBoardAssetPickerOpen(true);
  };

  const closeGalleryBoardEditor = () => {
    setIsGalleryBoardEditorOpen(false);
  };

  const closeGalleryBoardAssetPicker = () => {
    setIsGalleryBoardAssetPickerOpen(false);
    setIsGalleryBoardLibraryPickerOpen(false);
    setIsGalleryBoardHistoryPickerOpen(false);
  };

  const confirmGalleryBoardAssetPicker = () => {
    const selectedAssets = galleryBoardCandidateAssets.filter((item) => galleryBoardSelectedAssetSet.has(item.localId)).slice(0, 9);
    if (selectedAssets.length < 1) {
      openGalleryAlert('请先至少选择 1 张图片', t.pg_main_notice);
      return;
    }
    const nextSelectionKey = selectedAssets.map((item) => item.localId).join('|');
    const prevSelectionKey = galleryBoardSessionAssets.map((item) => item.localId).join('|');
    const shouldResetDraft =
      nextSelectionKey !== prevSelectionKey ||
      galleryBoardDraft?.templateRatioId !== galleryBoardCanvasRatio;
    setGalleryBoardSessionAssets(selectedAssets);
    setGalleryBoardPickerAssets([]);
    if (shouldResetDraft) {
      setGalleryBoardLocalAssets([]);
      setGalleryBoardDraft(null);
    }
    setIsGalleryBoardAssetPickerOpen(false);
    setIsGalleryBoardLibraryPickerOpen(false);
    setIsGalleryBoardHistoryPickerOpen(false);
    setIsGalleryBoardEditorOpen(true);
  };

  const appendGalleryBoardPickerAssets = (items: GalleryBoardAsset[], autoSelect = true) => {
    if (items.length < 1) return;
    setGalleryBoardPickerAssets((prev) => {
      const existing = new Set(prev.map((item) => item.localId));
      const current = new Set(galleryBoardAssets.map((item) => item.localId));
      const next = items.filter((item) => !existing.has(item.localId) && !current.has(item.localId));
      return next.length > 0 ? [...next, ...prev] : prev;
    });
    if (autoSelect) {
      setGalleryBoardSelectedAssetIds((prev) => {
        const next = [...prev];
        for (const item of items) {
          if (next.length >= 9) break;
          if (!next.includes(item.localId)) next.push(item.localId);
        }
        return next;
      });
    }
  };

  const toggleGalleryBoardSelectedAsset = (localId: string) => {
    setGalleryBoardSelectedAssetIds((prev) => {
      if (prev.includes(localId)) return prev.filter((item) => item !== localId);
      if (prev.length >= 9) {
        openGalleryAlert('最多只能选择 9 张图片', t.pg_main_notice);
        return prev;
      }
      return [...prev, localId];
    });
  };

  const importGalleryBoardPickerHistoryAsset = (historyItem: GalleryHistoryItem, imageUrl: string, imageIndex: number) => {
    appendGalleryBoardPickerAssets([
      {
        localId: `history-${historyItem.id}-${imageIndex}`,
        requestId: `${t.pg_main_history_image} ${historyItem.createdAt}`,
        imageUrl,
        source: 'history',
        layout: null,
      },
    ]);
  };

  const importGalleryBoardPickerLibraryAsset = (asset: any) => {
    const previewUrl = String(asset?.file_url || asset?.thumbnail || '').trim();
    if (!previewUrl) return;
    appendGalleryBoardPickerAssets([
      {
        localId: `library-${asset.type}-${asset.id}`,
        requestId: asset.name || `asset-${asset.id}`,
        imageUrl: previewUrl,
        source: 'library',
        layout: null,
      },
    ]);
  };

  const galleryPreviewNav = useMemo<
    | null
    | { kind: 'preview'; index: number; total: number; items: Array<{ localId: string; imageUrl: string }> }
    | { kind: 'history'; index: number; total: number; itemId: string; urls: string[] }
  >(() => {
    if (!galleryPreviewImageUrl || !galleryPreviewSource) return null;

    if (galleryPreviewSource.kind === 'preview_item') {
      const items = galleryPreviewItems
        .filter((it) => typeof it.imageUrl === 'string' && String(it.imageUrl).trim())
        .map((it) => ({ localId: it.localId, imageUrl: String(it.imageUrl) }));
      const index = items.findIndex((it) => it.localId === galleryPreviewSource.localId);
      if (index < 0) return null;
      return { kind: 'preview', index, total: items.length, items };
    }

    if (galleryPreviewSource.kind === 'history_item') {
      const item = galleryHistoryItems.find((it) => it.id === galleryPreviewSource.itemId);
      const urls = (item?.images || []).map((u) => String(u || '').trim()).filter(Boolean);
      if (urls.length === 0) return null;
      const index = Math.max(0, Math.min(galleryPreviewSource.index, urls.length - 1));
      return { kind: 'history', index, total: urls.length, itemId: galleryPreviewSource.itemId, urls };
    }

    return null;
  }, [galleryHistoryItems, galleryPreviewImageUrl, galleryPreviewItems, galleryPreviewSource]);

  const handleGalleryPreviewPrev = () => {
    if (!galleryPreviewNav || galleryPreviewNav.total <= 1 || galleryPreviewNav.index <= 0) return;
    const nextIndex = galleryPreviewNav.index - 1;

    if (galleryPreviewNav.kind === 'preview') {
      const next = galleryPreviewNav.items[nextIndex];
      setGalleryPreviewImageUrl(next.imageUrl);
      setGalleryPreviewSource({ kind: 'preview_item', localId: next.localId });
      return;
    }

    const nextUrl = galleryPreviewNav.urls[nextIndex];
    setGalleryPreviewImageUrl(nextUrl);
    setGalleryPreviewSource({ kind: 'history_item', itemId: galleryPreviewNav.itemId, index: nextIndex });
  };

  const handleGalleryPreviewNext = () => {
    if (!galleryPreviewNav || galleryPreviewNav.total <= 1 || galleryPreviewNav.index >= galleryPreviewNav.total - 1) return;
    const nextIndex = galleryPreviewNav.index + 1;

    if (galleryPreviewNav.kind === 'preview') {
      const next = galleryPreviewNav.items[nextIndex];
      setGalleryPreviewImageUrl(next.imageUrl);
      setGalleryPreviewSource({ kind: 'preview_item', localId: next.localId });
      return;
    }

    const nextUrl = galleryPreviewNav.urls[nextIndex];
    setGalleryPreviewImageUrl(nextUrl);
    setGalleryPreviewSource({ kind: 'history_item', itemId: galleryPreviewNav.itemId, index: nextIndex });
  };

  const buildGalleryPreviewFilename = (url: string, extFallback = 'png') => {
    const cleaned = String(url || '').trim();
    const safeExt = /^[a-z0-9]+$/i.test(extFallback) ? extFallback : 'png';
    const match = cleaned.match(/\.(png|jpe?g|webp)(?:\?|#|$)/i);
    const ext = (match?.[1] || safeExt).toLowerCase();
    return `product_gallery_${Date.now()}.${ext}`;
  };

  const buildGalleryPreviewFilenameWithIndex = (url: string, index: number) => {
    const cleaned = String(url || '').trim();
    const match = cleaned.match(/\.(png|jpe?g|webp)(?:\?|#|$)/i);
    const ext = (match?.[1] || 'png').toLowerCase();
    const seq = String(Math.max(0, index) + 1).padStart(2, '0');
    return `product_gallery_${Date.now()}_${seq}.${ext}`;
  };

  const handleDownloadGalleryPreviewImage = async () => {
    if (!galleryPreviewImageUrl || isGalleryPreviewDownloading) return;

    setIsGalleryPreviewDownloading(true);
    try {
      const blob = await productImagesApi.downloadImageByUrl(galleryPreviewImageUrl);
      await saveBlobWithPickerFallback(blob, buildGalleryPreviewFilename(galleryPreviewImageUrl));
      setGalleryToastMessage(t.pg_main_toast_download_started);
    } catch (err: any) {
      openGalleryAlert(String(err?.message || t.pg_main_toast_download_failed));
    } finally {
      setIsGalleryPreviewDownloading(false);
    }
  };

  const handleDownloadGalleryPreviewAllImages = async () => {
    if (!galleryPreviewImageUrl || isGalleryPreviewDownloading) return;

    const urls = (() => {
      if (!galleryPreviewNav) return [galleryPreviewImageUrl];
      if (galleryPreviewNav.kind === 'preview') return galleryPreviewNav.items.map((it) => it.imageUrl);
      return galleryPreviewNav.urls;
    })();

    const cleaned = urls.map((u) => String(u || '').trim()).filter(Boolean);
    if (cleaned.length === 0) return;

    setIsGalleryPreviewDownloading(true);
    try {
      for (let index = 0; index < cleaned.length; index += 1) {
        const url = cleaned[index];
        const blob = await productImagesApi.downloadImageByUrl(url);
        downloadBlob(blob, buildGalleryPreviewFilenameWithIndex(url, index));
        if (index < cleaned.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      setGalleryToastMessage(t.pg_main_toast_download_started);
    } catch (err: any) {
      openGalleryAlert(String(err?.message || t.pg_main_toast_download_failed));
    } finally {
      setIsGalleryPreviewDownloading(false);
    }
  };

  const handleToggleGalleryDownloadBubble = () => {
    if (!galleryPreviewImageUrl || isGalleryPreviewDownloading) return;
    const total = galleryPreviewNav?.total || 1;
    if (total <= 1) {
      void handleDownloadGalleryPreviewImage();
      return;
    }
    setGalleryDownloadBubbleOpen((prev) => !prev);
  };

  const handleExportGalleryPreviewAsPdf = async () => {
    if (!galleryPreviewImageUrl || isGalleryPreviewExportingPdf) return;

    setIsGalleryPreviewExportingPdf(true);
    try {
      const blob = await productImagesApi.downloadImageByUrl(galleryPreviewImageUrl);
      const objectUrl = URL.createObjectURL(blob);

      const win = window.open('', '_blank');
      if (!win) {
        URL.revokeObjectURL(objectUrl);
        openGalleryAlert(t.pg_main_toast_popup_blocked);
        return;
      }

      const title = t.pi_gallery_preview_export_pdf;
      win.document.open();
      win.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title><style>@page{size:A4;margin:12mm;}html,body{height:100%;}body{margin:0;display:flex;align-items:center;justify-content:center;}img{max-width:100%;max-height:100%;object-fit:contain;}</style></head><body><img id="img" src="${objectUrl}" /><script>const img=document.getElementById('img');img.onload=()=>{setTimeout(()=>{window.focus();window.print();},50)};window.onafterprint=()=>{window.close();};</script></body></html>`);
      win.document.close();

      const cleanup = () => URL.revokeObjectURL(objectUrl);
      try {
        win.addEventListener('beforeunload', cleanup);
      } catch {
        const timer = window.setInterval(() => {
          if (win.closed) {
            window.clearInterval(timer);
            cleanup();
          }
        }, 400);
      }
    } catch (err: any) {
      openGalleryAlert(String(err?.message || t.pg_main_toast_export_failed_retry));
    } finally {
      setIsGalleryPreviewExportingPdf(false);
    }
  };

  const closeGalleryInpaint = () =>
    setGalleryInpaint({
      open: false,
      step: 'edit',
      selectedCompare: 'edited',
      prompt: '',
      rect: null,
      isDragging: false,
      dragStart: null,
      maskOpacity: 0.55,
      isGenerating: false,
      resultUrl: null,
      error: null,
    });

  const openGalleryInpaint = () => {
    if (!galleryPreviewImageUrl) return;
    setGalleryInpaint((prev) => ({
      ...prev,
      open: true,
      step: 'edit',
      selectedCompare: 'edited',
      prompt: prev.prompt || '',
      rect: null,
      isDragging: false,
      dragStart: null,
      maskOpacity: 0.55,
      isGenerating: false,
      resultUrl: null,
      error: null,
    }));
  };

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  const updateInpaintRectFromPoints = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);

    const w = Math.max(0.001, right - left);
    const h = Math.max(0.001, bottom - top);

    setGalleryInpaint((prev) => ({
      ...prev,
      rect: {
        x: clamp01(left),
        y: clamp01(top),
        w: clamp01(w),
        h: clamp01(h),
      },
    }));
  };

  const handleInpaintPointerDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!galleryInpaint.open || galleryInpaint.isGenerating) return;
    const box = galleryInpaintBoxRef.current;
    const img = galleryInpaintImgRef.current;
    if (!box) return;

    const rect = box.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    let x = clamp01(localX / rect.width);
    let y = clamp01(localY / rect.height);

    if (img && img.naturalWidth > 0 && img.naturalHeight > 0 && rect.width > 0 && rect.height > 0) {
      const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const offsetX = (rect.width - drawW) / 2;
      const offsetY = (rect.height - drawH) / 2;

      const clampedX = Math.min(offsetX + drawW, Math.max(offsetX, localX));
      const clampedY = Math.min(offsetY + drawH, Math.max(offsetY, localY));

      x = clamp01(clampedX / rect.width);
      y = clamp01(clampedY / rect.height);
    }

    setGalleryInpaint((prev) => ({ ...prev, isDragging: true, dragStart: { x, y }, rect: { x, y, w: 0.001, h: 0.001 } }));
  };

  const handleInpaintPointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!galleryInpaint.isDragging || !galleryInpaint.dragStart) return;
    const box = galleryInpaintBoxRef.current;
    const img = galleryInpaintImgRef.current;
    if (!box) return;

    const rect = box.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    let x = clamp01(localX / rect.width);
    let y = clamp01(localY / rect.height);

    if (img && img.naturalWidth > 0 && img.naturalHeight > 0 && rect.width > 0 && rect.height > 0) {
      const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const offsetX = (rect.width - drawW) / 2;
      const offsetY = (rect.height - drawH) / 2;

      const clampedX = Math.min(offsetX + drawW, Math.max(offsetX, localX));
      const clampedY = Math.min(offsetY + drawH, Math.max(offsetY, localY));

      x = clamp01(clampedX / rect.width);
      y = clamp01(clampedY / rect.height);
    }

    inpaintPendingRef.current = { start: galleryInpaint.dragStart, end: { x, y } };
    if (inpaintRafRef.current != null) return;

    inpaintRafRef.current = window.requestAnimationFrame(() => {
      inpaintRafRef.current = null;
      const pending = inpaintPendingRef.current;
      if (!pending) return;
      updateInpaintRectFromPoints(pending.start, pending.end);
    });
  };

  const handleInpaintPointerUp = () => {
    if (inpaintRafRef.current != null) {
      window.cancelAnimationFrame(inpaintRafRef.current);
      inpaintRafRef.current = null;
    }
    inpaintPendingRef.current = null;

    if (!galleryInpaint.isDragging) return;
    setGalleryInpaint((prev) => ({ ...prev, isDragging: false, dragStart: null }));
  };

  const buildMaskDataUrl = (width: number, height: number, rectPx: { x: number; y: number; w: number; h: number }) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas context unavailable');

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#fff';
    ctx.fillRect(
      Math.max(0, Math.floor(rectPx.x)),
      Math.max(0, Math.floor(rectPx.y)),
      Math.max(1, Math.floor(rectPx.w)),
      Math.max(1, Math.floor(rectPx.h))
    );

    return canvas.toDataURL('image/png');
  };

  const applyGalleryPreviewOverwrite = async (nextUrl: string) => {
    setGalleryPreviewImageUrl(nextUrl);

    if (!galleryPreviewSource) return;

    if (galleryPreviewSource.kind === 'preview_item') {
      const localId = galleryPreviewSource.localId;
      setGalleryPreviewItems((prev) => prev.map((it) => (it.localId === localId ? { ...it, imageUrl: nextUrl } : it)));
      return;
    }

    if (galleryPreviewSource.kind === 'history_item') {
      const { itemId, index } = galleryPreviewSource;
      await replaceImageHistoryAsset(itemId, index, nextUrl);
    }
  };

  const handleRunInpaint = async () => {
    if (!galleryPreviewImageUrl) return;
    if (galleryInpaint.isGenerating) return;
    if (!galleryInpaint.rect) {
      setGalleryInpaint((prev) => ({ ...prev, error: t.pg_main_inpaint_error_select_area }));
      return;
    }

    const img = galleryInpaintImgRef.current;
    const box = galleryInpaintBoxRef.current;
    if (!img || !box || !img.naturalWidth || !img.naturalHeight) {
      setGalleryInpaint((prev) => ({ ...prev, error: t.pg_main_inpaint_error_image_not_ready }));
      return;
    }

    const boxRect = box.getBoundingClientRect();
    const containerW = boxRect.width;
    const containerH = boxRect.height;

    const scale = Math.min(containerW / img.naturalWidth, containerH / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const offsetX = (containerW - drawW) / 2;
    const offsetY = (containerH - drawH) / 2;

    const rect = galleryInpaint.rect;

    const imgX = clamp01((rect.x * containerW - offsetX) / drawW);
    const imgY = clamp01((rect.y * containerH - offsetY) / drawH);
    const imgW = clamp01((rect.w * containerW) / drawW);
    const imgH = clamp01((rect.h * containerH) / drawH);

    const rectPx = {
      x: imgX * img.naturalWidth,
      y: imgY * img.naturalHeight,
      w: Math.max(1, imgW * img.naturalWidth),
      h: Math.max(1, imgH * img.naturalHeight),
    };

    const prompt = String(galleryInpaint.prompt || '').trim();
    if (!prompt) {
      setGalleryInpaint((prev) => ({ ...prev, error: t.pg_main_inpaint_error_enter_instruction }));
      return;
    }

    setGalleryInpaint((prev) => ({ ...prev, isGenerating: true, error: null }));

    try {
      const maskDataUrl = buildMaskDataUrl(img.naturalWidth, img.naturalHeight, rectPx);
      const apiBase = (import.meta as any).env?.VITE_API_BASE || '/api';
      const resp = await fetch(`${apiBase}/projects/inpaint_image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          image_url: galleryInpaint.resultUrl || galleryPreviewImageUrl,
          mask_data_url: maskDataUrl,
          prompt,
          aspect_ratio: `${img.naturalWidth}:${img.naturalHeight}`,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || (data && data.code && data.code !== 0)) {
        throw new Error(String(data?.message || data?.error?.message || 'request failed'));
      }

      const requestId = String(data?.data?.request_id || '').trim();
      if (!requestId) throw new Error(t.pg_main_error_create_task_failed);

      let outputUrl: string | null = null;
      for (let i = 0; i < 40; i += 1) {
        const res = await videoApi.getProductGalleryResult(requestId);
        const status = String((res as any)?.data?.status || (res as any)?.status || '').toLowerCase();
        const outputs = (res as any)?.data?.outputs || (res as any)?.outputs || [];
        const list = Array.isArray(outputs) ? outputs : [];
        if (list.length > 0) {
          outputUrl = String(list[0] || '').trim() || null;
        }
        if (outputUrl) break;
        if (status && ['failed', 'canceled', 'cancelled', 'error'].includes(status)) break;
        await new Promise<void>((r) => setTimeout(r, 1500));
      }

      if (!outputUrl) {
        throw new Error(t.pg_main_toast_generation_failed_retry);
      }

      setGalleryInpaint((prev) => ({ ...prev, isGenerating: false, resultUrl: outputUrl, error: null, step: 'compare', selectedCompare: 'edited' }));
    } catch (err: any) {
      setGalleryInpaint((prev) => ({ ...prev, isGenerating: false, error: String(err?.message || err), resultUrl: null }));
    }
  };

  const openTextSeparationHistoryItem = (item: TextSeparationRecordItem) => {
    if (item.status !== 'succeeded' || !item.backgroundImageUrl || !item.textBlocks) return;
    setTextSeparationSession({
      sampleTitle: item.sampleTitle,
      originalImageUrl: item.originalImageUrl,
      backgroundImageUrl: item.backgroundImageUrl,
      textBlocks: item.textBlocks,
    });
  };

  const clearSelectedTextSeparationSource = (revokePreview = true) => {
    if (revokePreview && textSeparationUploadPreviewUrl && textSeparationUploadPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(textSeparationUploadPreviewUrl);
    }
    setTextSeparationUploadPreviewUrl(null);
    setTextSeparationUploadName('');
    setTextSeparationSelectedImagePath(null);
    setTextSeparationSelectedOriginalUrl(null);
  };

  const selectTextSeparationSource = (imagePath: string, sampleTitle: string, originalImageUrl?: string) => {
    const cleaned = String(imagePath || '').trim();
    if (!cleaned) return;
    if (originalImageUrl) {
      if (textSeparationUploadPreviewUrl && textSeparationUploadPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(textSeparationUploadPreviewUrl);
      }
      setTextSeparationUploadPreviewUrl(originalImageUrl);
    }
    setTextSeparationUploadName(sampleTitle);
    setTextSeparationSelectedImagePath(cleaned);
    setTextSeparationSelectedOriginalUrl(originalImageUrl || cleaned);
  };

  const openTextSeparationDemo = async (item: DemoLibraryItem | null) => {
    if (!item || isTextSeparationLoading) return;

    setIsTextSeparationLoading(true);
    try {
      const parsed = await videoApi.textSeparation({ sample_id: item.id });
      const rawBlocks = Array.isArray(parsed?.text_blocks) ? parsed.text_blocks : [];
      const textBlocks = rawBlocks
        .map((block: any) => {
          const bbox = Array.isArray(block?.bbox) ? block.bbox.map((n: any) => Number(n)) : [];
          if (bbox.length !== 4 || bbox.some((n: number) => !Number.isFinite(n))) return null;
          const color = Array.isArray(block?.color) ? block.color.map((n: any) => Number(n)) : null;
          const outlineColor = Array.isArray(block?.outline?.color) ? block.outline.color.map((n: any) => Number(n)) : null;
          const shadowColor = Array.isArray(block?.shadow?.color) ? block.shadow.color.map((n: any) => Number(n)) : null;
          return {
            id: String(block?.id || '').trim() || `txt_${Math.random().toString(36).slice(2, 8)}`,
            text: String(block?.text || '').trim(),
            bbox: [bbox[0], bbox[1], bbox[2], bbox[3]] as [number, number, number, number],
            font_size: Number.isFinite(Number(block?.font_size)) ? Number(block.font_size) : undefined,
            color:
              color && color.length === 3 && color.every((n: number) => Number.isFinite(n))
                ? ([color[0], color[1], color[2]] as [number, number, number])
                : undefined,
            bold: typeof block?.bold === 'boolean' ? block.bold : undefined,
            outline:
              typeof block?.outline === 'boolean'
                ? block.outline
                : block?.outline && typeof block.outline === 'object'
                  ? {
                      color:
                        outlineColor && outlineColor.length === 3 && outlineColor.every((n: number) => Number.isFinite(n))
                          ? ([outlineColor[0], outlineColor[1], outlineColor[2]] as [number, number, number])
                          : undefined,
                      width: Number.isFinite(Number(block.outline.width)) ? Number(block.outline.width) : undefined,
                    }
                  : undefined,
            shadow:
              typeof block?.shadow === 'boolean'
                ? block.shadow
                : block?.shadow && typeof block.shadow === 'object'
                  ? {
                      color:
                        shadowColor && shadowColor.length === 3 && shadowColor.every((n: number) => Number.isFinite(n))
                          ? ([shadowColor[0], shadowColor[1], shadowColor[2]] as [number, number, number])
                          : undefined,
                      blur: Number.isFinite(Number(block.shadow.blur)) ? Number(block.shadow.blur) : undefined,
                      offsetX: Number.isFinite(Number(block.shadow.offsetX)) ? Number(block.shadow.offsetX) : undefined,
                      offsetY: Number.isFinite(Number(block.shadow.offsetY)) ? Number(block.shadow.offsetY) : undefined,
                    }
                  : undefined,
          };
        })
        .filter(Boolean) as TextSeparationBlock[];


      setTextSeparationSession({
        sampleTitle: item.title,
        originalImageUrl: String(parsed.original_image_url || item.previewUrl),
        backgroundImageUrl: String(parsed.clean_image_url || ''),
        textBlocks,
      });
    } catch (err: any) {
      openGalleryAlert(String(err?.message || t.pg_main_toast_open_text_separation_failed));
    } finally {
      setIsTextSeparationLoading(false);
    }
  };

  const normalizeTextSeparationBlocks = (rawBlocks: any[]): TextSeparationBlock[] =>
    rawBlocks
      .map((block: any) => {
        const bbox = Array.isArray(block?.bbox) ? block.bbox.map((n: any) => Number(n)) : [];
        if (bbox.length !== 4 || bbox.some((n: number) => !Number.isFinite(n))) return null;
        const color = Array.isArray(block?.color) ? block.color.map((n: any) => Number(n)) : null;
        const outlineColor = Array.isArray(block?.outline?.color) ? block.outline.color.map((n: any) => Number(n)) : null;
        const shadowColor = Array.isArray(block?.shadow?.color) ? block.shadow.color.map((n: any) => Number(n)) : null;
        return {
          id: String(block?.id || '').trim() || `txt_${Math.random().toString(36).slice(2, 8)}`,
          text: String(block?.text || '').trim(),
          bbox: [bbox[0], bbox[1], bbox[2], bbox[3]] as [number, number, number, number],
          font_size: Number.isFinite(Number(block?.font_size)) ? Number(block.font_size) : undefined,
          color:
            color && color.length === 3 && color.every((n: number) => Number.isFinite(n))
              ? ([color[0], color[1], color[2]] as [number, number, number])
              : undefined,
          bold: typeof block?.bold === 'boolean' ? block.bold : undefined,
          outline:
            typeof block?.outline === 'boolean'
              ? block.outline
              : block?.outline && typeof block.outline === 'object'
                ? {
                    color:
                      outlineColor && outlineColor.length === 3 && outlineColor.every((n: number) => Number.isFinite(n))
                        ? ([outlineColor[0], outlineColor[1], outlineColor[2]] as [number, number, number])
                        : undefined,
                    width: Number.isFinite(Number(block.outline.width)) ? Number(block.outline.width) : undefined,
                  }
                : undefined,
          shadow:
            typeof block?.shadow === 'boolean'
              ? block.shadow
              : block?.shadow && typeof block.shadow === 'object'
                ? {
                    color:
                      shadowColor && shadowColor.length === 3 && shadowColor.every((n: number) => Number.isFinite(n))
                        ? ([shadowColor[0], shadowColor[1], shadowColor[2]] as [number, number, number])
                        : undefined,
                    blur: Number.isFinite(Number(block.shadow.blur)) ? Number(block.shadow.blur) : undefined,
                    offsetX: Number.isFinite(Number(block.shadow.offsetX)) ? Number(block.shadow.offsetX) : undefined,
                    offsetY: Number.isFinite(Number(block.shadow.offsetY)) ? Number(block.shadow.offsetY) : undefined,
                  }
                : undefined,
        };
      })
      .filter(Boolean) as TextSeparationBlock[];

  const loadGalleryHistoryFromStore = (): GalleryHistoryItem[] =>
    readImageHistoryByFeature('gallery')
      .map((item) => {
        const images = Array.isArray(item.images)
          ? item.images.map((value) => String(value || '').trim()).filter(Boolean)
          : [];
        if (images.length === 0) return null;
        return {
          id: item.id,
          createdAt: item.createdAt,
          images,
          settings: item.settings as GalleryHistorySettings | undefined,
          metadata: item.metadata as Record<string, any> | undefined,
        } satisfies GalleryHistoryItem;
      })
      .filter(Boolean) as GalleryHistoryItem[];

  const mapImageHistoryToTextSeparationRecord = (item: ImageHistoryItem): TextSeparationRecordItem | null => {
    if (item.featureType !== 'text_separation') return null;
    const backgroundImageUrl = String(item.metadata?.backgroundImageUrl || item.images[0] || '').trim();
    const originalImageUrl = String(item.metadata?.originalImageUrl || backgroundImageUrl).trim();
    if (!backgroundImageUrl || !originalImageUrl) return null;
    return {
      id: item.id,
      createdAt: item.createdAt,
      sampleTitle: String(item.metadata?.sampleTitle || t.pg_main_untitled_image).trim(),
      originalImageUrl,
      backgroundImageUrl,
      textBlocks: normalizeTextSeparationBlocks(Array.isArray(item.metadata?.textBlocks) ? item.metadata.textBlocks : []),
      status: 'succeeded',
      progress: 100,
    } as TextSeparationRecordItem;
  };

  const mergeTextSeparationRecords = (persisted: TextSeparationRecordItem[], current: TextSeparationRecordItem[]): TextSeparationRecordItem[] => {
    const byId = new Map<string, TextSeparationRecordItem>();

    for (const item of persisted) {
      byId.set(item.id, item);
    }

    for (const item of current) {
      if (item.status === 'processing' || !byId.has(item.id)) {
        byId.set(item.id, item);
      }
    }

    return [...byId.values()].sort((a, b) => {
      const aMs = new Date(a.createdAt).getTime() || 0;
      const bMs = new Date(b.createdAt).getTime() || 0;
      return bMs - aMs;
    });
  };

  const openTextSeparationByImagePath = async (imagePath: string, sampleTitle: string, originalImageUrl?: string) => {
    const cleaned = String(imagePath || '').trim();
    if (!cleaned || isTextSeparationLoading) return;

    setIsTextSeparationLoading(true);
    try {
      const parsed = await videoApi.textSeparation({ image_path: cleaned, sample_title: sampleTitle });
      const textBlocks = normalizeTextSeparationBlocks(Array.isArray(parsed?.text_blocks) ? parsed.text_blocks : []);
      return {
        sampleTitle,
        originalImageUrl: String(originalImageUrl || parsed.original_image_url || cleaned),
        backgroundImageUrl: String(parsed.clean_image_url || ''),
        textBlocks,
        historyRecordId: String((parsed as any)?.history_record_id || '').trim(),
      };
    } catch (err: any) {
      openGalleryAlert(String(err?.message || t.pg_main_toast_open_text_separation_failed));
      return null;
    } finally {
      setIsTextSeparationLoading(false);
    }
  };

  const handleStartTextSeparation = async () => {
    if (!textSeparationSelectedImagePath || isTextSeparationLoading || !textSeparationUploadPreviewUrl) return;
    const recordId = `ts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sampleTitle = textSeparationUploadName || t.pg_main_untitled_image;
    const originalImageUrl = textSeparationSelectedOriginalUrl || textSeparationUploadPreviewUrl;
    const imagePath = textSeparationSelectedImagePath;
    const createdAt = new Date().toISOString();

    setTextSeparationRecords((prev) => [
      {
        id: recordId,
        createdAt,
        sampleTitle,
        originalImageUrl,
        status: 'processing',
        progress: 0,
        startedAtMs: Date.now(),
      },
      ...prev,
    ]);

    clearSelectedTextSeparationSource(false);

    const result = await openTextSeparationByImagePath(imagePath, sampleTitle, originalImageUrl);
    if (!result) {
      setTextSeparationRecords((prev) => prev.filter((item) => item.id !== recordId));
      return;
    }

    await refreshImageHistory();
    notifyImageHistoryUpdated();

    setTextSeparationRecords((prev) =>
      prev.map((item) =>
        item.id === recordId
          ? {
              ...item,
              id: result.historyRecordId || item.id,
              status: 'succeeded' as const,
              progress: 100,
              backgroundImageUrl: result.backgroundImageUrl,
              textBlocks: result.textBlocks,
              startedAtMs: undefined,
            }
          : item
      )
    );
  };

  const handleTextSeparationUpload = async (file: File) => {
    if (isTextSeparationLoading) return;
    const objectUrl = URL.createObjectURL(file);
    if (textSeparationUploadPreviewUrl && textSeparationUploadPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(textSeparationUploadPreviewUrl);
    }
    setTextSeparationUploadPreviewUrl(objectUrl);
    setTextSeparationUploadName(file.name);

    try {
      const uploadResp = await assetsApi.uploadTempAsset(file);
      const imagePath = String(uploadResp?.data?.path || uploadResp?.data?.url || uploadResp?.path || uploadResp?.url || '').trim();
      const originalUrl = String(uploadResp?.data?.url || uploadResp?.url || imagePath || '').trim();
      if (!imagePath) {
        throw new Error(t.pg_main_error_upload_no_path);
      }
      setTextSeparationSelectedImagePath(imagePath);
      setTextSeparationSelectedOriginalUrl(originalUrl || objectUrl);
    } catch (err: any) {
      openGalleryAlert(String(err?.message || t.pg_main_toast_upload_failed));
    }
  };

  const toggleGalleryHistoryKey = (key: string) => {
    setGalleryHistorySelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleGalleryHistorySelectAll = () => {
    if (galleryHistoryAllKeys.length === 0) return;
    setGalleryHistorySelectedKeys(isGalleryHistoryAllSelected ? [] : galleryHistoryAllKeys);
  };

  const handleGalleryHistoryDeleteSelected = async () => {
    if (galleryHistorySelectedKeys.length === 0) return;

    const action = await openGalleryConfirm(
      t.pg_main_confirm_delete_selected,
      {
        title: t.pg_main_confirm_delete_title,
        okLabel: t.pg_main_btn_delete,
        cancelLabel: t.pg_main_btn_cancel,
      }
    );

    if (action !== 'ok') return;

    const selected = new Set(galleryHistorySelectedKeys);

    for (const item of galleryHistoryItems) {
      const indices = item.images
        .map((_, idx) => idx)
        .filter((idx) => selected.has(`${item.id}:${idx}`));
      if (indices.length === 0) continue;
      await removeImageHistoryAssets(item.id, indices);
    }

    setGalleryHistorySelectedKeys([]);
  };

  const openGalleryConfirm = (message: string, opts?: { title?: string; okLabel?: string; cancelLabel?: string }) =>
    new Promise<GalleryConfirmAction>((resolve) => {
      galleryConfirmResolverRef.current = resolve;
      setGalleryConfirm({
        open: true,
        title: opts?.title || t.pg_main_confirm_default_title,
        message,
        okLabel: opts?.okLabel || t.pg_main_btn_ok,
        cancelLabel: opts?.cancelLabel || t.pg_main_btn_cancel,
      });
    });

  useEffect(() => {
    const urls = galleryImages.map((f) => URL.createObjectURL(f));
    setGalleryPreviewUrls(urls);
    setGalleryLoadingBackgroundSrc(urls[0] || '');
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [galleryImages]);

  useEffect(() => {
    galleryModelPreviewUrlsRef.current = galleryModelCards
      .map((card) => String(card.imagePreviewUrl || '').trim())
      .filter((url) => url.startsWith('blob:'));
  }, [galleryModelCards]);

  useEffect(() => {
    return () => {
      galleryModelPreviewUrlsRef.current.forEach((url) => revokeGalleryModelPreviewUrl(url));
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const sources = [...galleryPreviewUrls, ...galleryRestoredImagePaths]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .slice(0, 3);

    if (sources.length === 0) {
      setGalleryLoadingTheme(getDefaultLoadingTheme());
      setGalleryLoadingBackgroundSrc('');
      return;
    }

    setGalleryLoadingBackgroundSrc(sources[0] || '');
    void extractLoadingThemeFromSources(sources).then((theme) => {
      if (alive) setGalleryLoadingTheme(theme);
    });

    return () => {
      alive = false;
    };
  }, [galleryPreviewUrls, galleryRestoredImagePaths]);

  useEffect(() => {
    const syncGalleryHistory = async () => {
      await refreshImageHistory();
      setGalleryHistoryItems(loadGalleryHistoryFromStore());
    };

    void syncGalleryHistory();
    return subscribeImageHistory(() => {
      void syncGalleryHistory();
    });
  }, []);

  useEffect(() => {
    galleryPollAbortRef.current = false;
    return () => {
      galleryPollAbortRef.current = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (textSeparationUploadPreviewUrl && textSeparationUploadPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(textSeparationUploadPreviewUrl);
      }
    };
  }, [textSeparationUploadPreviewUrl]);

  useEffect(() => {
    const hasProcessing = textSeparationRecords.some((item) => item.status === 'processing' && item.startedAtMs);
    if (!hasProcessing) return;

    const timer = window.setInterval(() => {
      setTextSeparationRecords((prev) =>
        prev.map((item) => {
          if (item.status !== 'processing' || !item.startedAtMs) return item;
          const elapsed = Date.now() - item.startedAtMs;
          const progress = Math.min(90, (elapsed / 15000) * 90);
          return progress > item.progress ? { ...item, progress } : item;
        })
      );
    }, 200);

    return () => window.clearInterval(timer);
  }, [textSeparationRecords]);

  useEffect(() => {
    const syncTextSeparationHistory = async () => {
      await refreshImageHistory();
      const persisted = readImageHistoryByFeature('text_separation')
        .map((item) => mapImageHistoryToTextSeparationRecord(item))
        .filter(Boolean) as TextSeparationRecordItem[];
      setTextSeparationRecords((prev) => mergeTextSeparationRecords(persisted, prev));
    };

    void syncTextSeparationHistory();
    return subscribeImageHistory(() => {
      void syncTextSeparationHistory();
    });
  }, [language]);

  // Restore settings from history "re-generate" flow
  const GALLERY_RESTORE_KEY = 'vflow_gallery_restore_settings';
  useEffect(() => {
    if (activeView !== 'product_images_gallery') return;
    try {
      const raw = localStorage.getItem(GALLERY_RESTORE_KEY);
      if (!raw) return;
      localStorage.removeItem(GALLERY_RESTORE_KEY);
      const s = JSON.parse(raw) as Record<string, any>;
      const restoredSellingPoints = Array.isArray(s.sellingPoints)
        ? s.sellingPoints.map((item: any) => String(item || '').trim()).filter(Boolean).slice(0, 5)
        : [];
      const restoredModelCards = Array.isArray(s.modelCards)
        ? s.modelCards.map((row: any) => normalizeGalleryModelCard(row)).filter(Boolean) as GalleryModelCard[]
        : [];
      const restoredSceneCards = Array.isArray(s.sceneCards)
        ? s.sceneCards.map((row: any) => normalizeGallerySceneCard(row)).filter(Boolean) as GallerySceneCard[]
        : [];
      let fallbackModelCardId = restoredModelCards[0]?.id || '';
      let fallbackSceneCardId = restoredSceneCards[0]?.id || '';

      if (!fallbackModelCardId) {
        const restoredModelInfo = String(s.modelInfo || '').trim();
        const restoredModelImagePath = String(s.modelImagePath || '').trim();
        if (restoredModelInfo || restoredModelImagePath) {
          const legacyModelCard: GalleryModelCard = {
            ...createGalleryModelCard('模特1'),
            imagePath: restoredModelImagePath,
            modelInfo: restoredModelInfo,
          };
          restoredModelCards.push(legacyModelCard);
          fallbackModelCardId = legacyModelCard.id;
        }
      }

      if (!fallbackSceneCardId && s.sceneConfig && typeof s.sceneConfig === 'object') {
        const legacySceneConfig = sanitizeGallerySceneConfig(s.sceneConfig);
        if (Object.values(legacySceneConfig).some((value) => Boolean(String(value || '').trim()))) {
          const legacySceneCard: GallerySceneCard = {
            ...createGallerySceneCard('场景1'),
            sceneConfig: legacySceneConfig,
          };
          restoredSceneCards.push(legacySceneCard);
          fallbackSceneCardId = legacySceneCard.id;
        }
      }

      if (s.targetScene) setGalleryTargetScene(s.targetScene);
      if (s.style) setGalleryStyle(s.style);
      if (s.copyLanguage) setGalleryCopyLanguage(String(s.copyLanguage));
      if (s.productName) setGalleryProductName(s.productName);
      if (s.productCategory) setGalleryCategory(s.productCategory);
      setGallerySellingPoints(restoredSellingPoints);
      if (s.outputMode === 'custom' || s.outputMode === 'ai') setGalleryOutputMode(s.outputMode);
      setGalleryModelCards(restoredModelCards);
      setGallerySceneCards(restoredSceneCards);

      let restoredBulkConfig = normalizeGalleryBulkConfig(s.bulkConfig, restoredSellingPoints.length);
      if (Array.isArray(s.outputItems) && s.outputItems.length > 0) {
        const restoredItems: GalleryOutputItem[] = s.outputItems
          .map((row: any) => normalizeGalleryOutputItem(row))
          .map((item) => {
            if (!item) return null;
            return {
              ...item,
              modelCardId: item.modelCardId || (GALLERY_SCENE_SENSITIVE_TYPES.has(item.outputType) ? fallbackModelCardId || undefined : undefined),
              sceneCardId: item.sceneCardId || (GALLERY_SCENE_SENSITIVE_TYPES.has(item.outputType) ? fallbackSceneCardId || undefined : undefined),
            } satisfies GalleryOutputItem;
          })
          .filter(Boolean) as GalleryOutputItem[];
        if (restoredItems.length > 0) {
          setGalleryOutputItems(restoredItems);
          restoredBulkConfig = s.bulkConfig
            ? normalizeGalleryBulkConfig(s.bulkConfig, restoredSellingPoints.length)
            : inferGalleryBulkConfigFromOutputItems(restoredItems, restoredSellingPoints.length);
        }
      } else {
        const aspectRatio = String(s.aspectRatio || '1:1').trim() || '1:1';
        const resolutionRaw = String(s.resolution || '1k').trim().toLowerCase();
        const resolution = (resolutionRaw === '2k' || resolutionRaw === '4k') ? resolutionRaw : '1k';
        const selections = s.typeSelections && typeof s.typeSelections === 'object' ? s.typeSelections : null;
        if (selections) {
          const items: GalleryOutputItem[] = [];
          for (const outputType of GALLERY_OUTPUT_TYPE_ORDER) {
            const config = selections[outputType];
            if (!config || !config.enabled) continue;
            const count = Math.max(0, Math.round(Number(config.count || 0)));
            if (count <= 0) continue;
            items.push({
              id: createGalleryOutputItemId(),
              enabled: true,
              outputType,
              aspectRatio,
              resolution: resolution as any,
              count,
              modelCardId: GALLERY_SCENE_SENSITIVE_TYPES.has(outputType) ? fallbackModelCardId || undefined : undefined,
              sceneCardId: GALLERY_SCENE_SENSITIVE_TYPES.has(outputType) ? fallbackSceneCardId || undefined : undefined,
            });
          }
          if (items.length > 0) {
            setGalleryOutputItems(items);
            restoredBulkConfig = inferGalleryBulkConfigFromOutputItems(items, restoredSellingPoints.length);
          }
        }
      }
      setGalleryBulkConfig(restoredBulkConfig);
      setGalleryAdvancedDirty(false);
      setIsGalleryAdvancedEditingCollapsed(true);
      // Restore backend image paths so generation can skip the upload step
      if (Array.isArray(s.uploadedImagePaths) && s.uploadedImagePaths.length > 0) {
        const paths = s.uploadedImagePaths.map((p: any) => String(p || '').trim()).filter(Boolean);
        setGalleryRestoredImagePaths(paths);
      }

      // Switch right-panel to preview so user sees the form ready to generate
      setGalleryRightPanel('preview');
    } catch { /* ignore */ }
  }, [activeView]);

  const gallerySupportedFormatTip = t.pg_main_unsupported_format_tip;

  const isSupportedGalleryImageFile = (file: File) => {
    const name = String(file?.name || '').toLowerCase();
    if (!name) return false;
    if (!/\.(jpe?g|png|webp)$/i.test(name)) return false;
    const type = String(file?.type || '');
    if (type && !type.startsWith('image/')) return false;
    return true;
  };

  const appendGalleryFiles = (picked: File[]) => {
    if (picked.length === 0) return;

    const supported = picked.filter((f) => isSupportedGalleryImageFile(f));
    const hasUnsupported = supported.length !== picked.length;
    if (hasUnsupported) {
      openGalleryAlert(gallerySupportedFormatTip);
    }

    if (supported.length === 0) {
      return;
    }

    setGalleryImages((prev) => [...prev, ...supported].slice(0, 3));
    setGalleryRestoredImagePaths([]);
  };

  const handleTextSeparationFileSelection = (picked: File[]) => {
    const file = picked[0];
    if (!file) return;
    if (!isSupportedGalleryImageFile(file)) {
      openGalleryAlert(gallerySupportedFormatTip);
      return;
    }
    void handleTextSeparationUpload(file);
  };

  const handleGalleryModelCardFileSelection = (cardId: string, picked: File[]) => {
    const file = picked[0];
    if (!file) return;
    if (!isSupportedGalleryImageFile(file)) {
      openGalleryAlert(gallerySupportedFormatTip);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setGalleryModelCards((prev) =>
      prev.map((card) => {
        if (card.id !== cardId) return card;
        revokeGalleryModelPreviewUrl(card.imagePreviewUrl);
        return {
          ...card,
          imageFile: file,
          imagePath: '',
          imagePreviewUrl: previewUrl,
        };
      })
    );
  };

  const preventDragDefaults = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const extractUploadedAssetPath = (uploadResp: any): string | null => {
    if (uploadResp?.assets && Array.isArray(uploadResp.assets) && uploadResp.assets.length > 0) {
      return uploadResp.assets[0].url || uploadResp.assets[0].file_url || uploadResp.assets[0].path || null;
    }
    return uploadResp?.url || uploadResp?.file_url || uploadResp?.path || uploadResp?.data?.url || uploadResp?.data?.path || null;
  };

  const openGalleryTextEditor = (item: { localId: string; imageUrl?: string; layout?: any }) => {
    const url = String(item.imageUrl || '').trim();
    if (!url) return;
    if (!item.layout || !item.layout.elements) {
      openGalleryAlert(t.pg_main_toast_no_editable_layout);
      return;
    }
    const draft = JSON.parse(JSON.stringify(item.layout));
    setGalleryTextDraftLayout(draft);
    setGalleryTextEditor({ open: true, localId: item.localId, imageUrl: url, layout: item.layout });
  };

  const closeGalleryTextEditor = () => {
    setGalleryTextEditor(null);
    setGalleryTextDraftLayout(null);
    dragTextRef.current = null;
  };

  const parseAspectRatioCss = (value: string | undefined) => {
    const raw = String(value || '').trim();
    const m = raw.match(/^(\d+)\s*:\s*(\d+)$/);
    if (!m) return '1 / 1';
    const w = Number(m[1]) || 1;
    const h = Number(m[2]) || 1;
    return `${w} / ${h}`;
  };

  const startDragText = (index: number, e: React.PointerEvent) => {
    if (!galleryTextDraftLayout?.elements || !Array.isArray(galleryTextDraftLayout.elements)) return;
    const el = galleryTextDraftLayout.elements[index];
    if (!el) return;

    dragTextRef.current = {
      index,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: Number(el.x) || 0,
      startY: Number(el.y) || 0,
    };

    const onMove = (ev: PointerEvent) => {
      const state = dragTextRef.current;
      if (!state) return;
      setGalleryTextDraftLayout((prev: any) => {
        if (!prev?.elements || !Array.isArray(prev.elements)) return prev;
        const next = { ...prev, elements: prev.elements.map((x: any) => ({ ...x })) };
        const current = next.elements[state.index];
        if (!current) return prev;

        const dx = (ev.clientX - state.startClientX) / 560;
        const dy = (ev.clientY - state.startClientY) / 560;
        current.x = Math.max(0, Math.min(1, state.startX + dx));
        current.y = Math.max(0, Math.min(1, state.startY + dy));
        return next;
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragTextRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const saveGalleryTextLayout = () => {
    if (!galleryTextEditor || !galleryTextDraftLayout) return;
    setGalleryPreviewItems((prev) => prev.map((it) => (it.localId === galleryTextEditor.localId ? { ...it, layout: galleryTextDraftLayout } : it)));
    closeGalleryTextEditor();
  };

  const exportGalleryTextPng = async () => {
    if (!galleryTextEditor || !galleryTextDraftLayout) return;
    const url = galleryTextEditor.imageUrl;

    setIsGalleryTextExporting(true);
    try {
      const resp = await fetch(url, { method: 'GET', credentials: 'include' });
      if (!resp.ok) throw new Error(t.pg_main_error_download_bg_failed);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);

      const img = new Image();
      const imgLoaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(t.pg_main_error_load_bg_failed));
      });
      img.src = objUrl;
      await imgLoaded;

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(t.pg_main_error_export_failed);

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const elements = Array.isArray(galleryTextDraftLayout.elements) ? galleryTextDraftLayout.elements : [];
      const base = Math.min(canvas.width, canvas.height);

      for (const el of elements) {
        if (!el || el.type !== 'text') continue;
        const x = Number(el.x) || 0;
        const y = Number(el.y) || 0;
        const w = Number(el.w) || 0.5;
        const h = Number(el.h) || 0.2;
        const fontSize = (Number(el.font_size) || 0.03) * base;
        const fontWeight = Number(el.font_weight) || 600;
        const color = String(el.color || '#111111');
        const align = String(el.align || 'left');
        const bg = String(el.background || '').trim();

        const px = x * canvas.width;
        const py = y * canvas.height;
        const pw = w * canvas.width;
        const ph = h * canvas.height;

        if (bg) {
          ctx.fillStyle = bg;
          ctx.globalAlpha = 0.95;
          ctx.fillRect(px, py, pw, ph);
          ctx.globalAlpha = 1;
        }

        ctx.fillStyle = color;
        ctx.font = `${fontWeight} ${Math.max(10, Math.round(fontSize))}px system-ui`;
        ctx.textBaseline = 'top';
        ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';

        const text = String(el.text || '');
        const lines = text.split(/\r?\n/);
        const lineHeight = Math.round(fontSize * 1.25);
        let ty = py + 8;
        const tx = align === 'center' ? px + pw / 2 : align === 'right' ? px + pw - 8 : px + 8;
        for (const line of lines) {
          ctx.fillText(line, tx, ty);
          ty += lineHeight;
          if (ty > py + ph - lineHeight) break;
        }
      }

      const outBlob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!outBlob) throw new Error(t.pg_main_error_export_failed);
      await saveBlobWithPickerFallback(outBlob, `product_gallery_edit_${Date.now()}.png`);
      URL.revokeObjectURL(objUrl);
    } catch (err: any) {
      openGalleryAlert(String(err?.message || err || t.pg_main_error_export_failed));
    } finally {
      setIsGalleryTextExporting(false);
    }
  };

  const handleHotStyleAnalyze = async () => {
    if (!gallerySellingPoints.some((p) => String(p || '').trim())) {
      openGalleryAlert(t.pg_main_toast_fill_selling_points);
      return;
    }
    if (galleryImages.length === 0) {
      openGalleryAlert(t.pg_main_toast_upload_one_image);
      return;
    }

    setHotStyleLoading(true);
    setHotStyleError(null);
    setHotStyleSelectedIndex(null);

    try {
      const uploadTargets = galleryImages.slice(0, 3);
      const imagePaths: string[] = [];
      for (const f of uploadTargets) {
        const resp = await assetsApi.uploadTempAsset(f);
        const p = extractUploadedAssetPath(resp);
        if (p) imagePaths.push(p);
      }
      if (imagePaths.length === 0) throw new Error(t.pg_main_error_image_upload_failed);

      const selling = gallerySellingPoints.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 5);
      const apiResp = await videoApi.hotStyleAnalysis({
        image_paths: imagePaths,
        product_name: galleryProductName.trim(),
        product_category: galleryCategory.trim(),
        selling_points: selling,
        output_language: isZh ? 'zh' : 'en',
      });

      const raw = (apiResp as any)?.data?.styles || (apiResp as any)?.styles || [];
      const styles = Array.isArray(raw)
        ? raw.map((it: any) => ({
            name: String(it?.name || '').slice(0, 20),
            tones: Array.isArray(it?.tones) ? it.tones.map((c: any) => String(c || '').trim()).filter(Boolean).slice(0, 5) : [],
            description: String(it?.description || '').slice(0, 60),
          })).filter((x: any) => x.name && x.description).slice(0, 4)
        : [];

      if (styles.length === 0) throw new Error(t.pg_main_error_ai_response_invalid);
      setHotStyleItems(styles);
      setHotStyleSelectedIndex(null);
    } catch (err: any) {
      const msg = String(err?.message || err || t.pg_main_toast_analysis_failed_retry).trim();
      setHotStyleError(msg);
      openGalleryAlert(msg, t.pg_main_toast_analysis_failed_title);
    } finally {
      setHotStyleLoading(false);
    }
  };



  const handleGalleryAiAnalyze = async () => {
    if (isGalleryAnalyzing) return;

    const hasNewImages = galleryImages.length > 0;
    const hasRestoredPaths = galleryRestoredImagePaths.length > 0;

    if (!hasNewImages && !hasRestoredPaths) {
      openGalleryAlert(t.pg_main_toast_upload_one_image);
      return;
    }

    const hasExisting = Boolean(
      galleryProductName.trim() ||
      galleryCategory.trim() ||
      gallerySellingPoints.some((p) => String(p || '').trim())
    );

    if (hasExisting) {
      const action = await openGalleryConfirm(
        t.pg_main_confirm_overwrite_with_ai,
        {
          title: t.pg_main_confirm_overwrite_title,
          okLabel: t.pg_main_btn_overwrite,
          cancelLabel: t.pg_main_btn_cancel,
        }
      );
      if (action !== 'ok') return;
    }

    setIsGalleryAnalyzing(true);
    try {
      let imagePaths: string[] = [];

      if (hasNewImages) {
        const uploadTargets = galleryImages.slice(0, 4);
        if (uploadTargets.some((f) => !isSupportedGalleryImageFile(f))) {
          openGalleryAlert(gallerySupportedFormatTip);
          setIsGalleryAnalyzing(false);
          return;
        }
        for (const file of uploadTargets) {
          const uploadResp = await assetsApi.uploadTempAsset(file);
          const path = extractUploadedAssetPath(uploadResp);
          if (path) imagePaths.push(String(path));
        }
      } else {
        // Use restored backend paths directly
        imagePaths = [...galleryRestoredImagePaths];
      }

      if (imagePaths.length === 0) {
        throw new Error(t.pg_main_toast_image_upload_failed_retry);
      }

      const resp = await videoApi.recognizeProductInfo({ image_paths: imagePaths, output_language: language });
      const data = resp?.data || resp?.result || resp?.payload || resp;

      const nextName = String(data?.product_name || '').trim();
      const nextCategory = String(data?.product_category || '').trim();

      const rawSelling = data?.core_selling_points;
      const nextSellingPoints = Array.isArray(rawSelling)
        ? rawSelling.map((item: any) => String(item || '').trim()).filter(Boolean)
        : String(rawSelling || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

      setGalleryProductName(nextName);
      setGalleryCategory(nextCategory);
      setGallerySellingPoints(nextSellingPoints.slice(0, 5));
    } catch (err: any) {
      const rawMsg = String(err?.message || '').trim();
      const isTypeInvalid = rawMsg.includes('文件格式不支持') || rawMsg.toLowerCase().includes('file_type_invalid');
      const message = isTypeInvalid
        ? gallerySupportedFormatTip
        : String(rawMsg || t.pg_main_toast_recognition_failed_retry);

      openGalleryAlert(message, t.pg_main_toast_recognition_failed_title);
    } finally {
      setIsGalleryAnalyzing(false);
    }
  };

  const openGalleryAiOutputPlanner = () => {
    setGalleryAiOutputPlanner({ open: true, prompt: '', isGenerating: false, error: null });
  };

  const closeGalleryAiOutputPlanner = () => {
    setGalleryAiOutputPlanner((prev) => ({ ...prev, open: false, isGenerating: false, error: null }));
  };

  const normalizeAiOutputType = (value: any): GalleryOutputType | null => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;
    if (GALLERY_OUTPUT_TYPE_ORDER.includes(raw as any)) return raw as any;
    if (raw.includes('白底')) return 'white_bg';
    if (raw.includes('场景')) return 'scene';
    if (raw.includes('卖点')) return 'selling_point';
    if (raw.includes('封面')) return 'cover';
    if (raw.includes('海报')) return 'poster';
    return null;
  };

  const normalizeAiResolution = (value: any): '1k' | '2k' | '4k' => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === '2k') return '2k';
    if (raw === '4k') return '4k';
    return '1k';
  };

  const normalizeAiAspectRatio = (value: any): string => {
    const raw = String(value || '').trim();
    if (!raw || raw === 'default') return '1:1';
    return raw;
  };

  const buildGalleryResolvedSceneBinding = (card?: GallerySceneCard | null) => {
    if (!card) return undefined;
    const sceneConfig = sanitizeGallerySceneConfig(card.sceneConfig);
    return {
      id: card.id,
      name: String(card.name || '').trim(),
      source_mode: card.sourceMode,
      preset_id: String(card.presetId || '').trim() || undefined,
      scene_config: Object.values(sceneConfig).some((value) => Boolean(String(value || '').trim())) ? sceneConfig : undefined,
    };
  };

  const buildGalleryResolvedModelBinding = (card?: GalleryModelCard | null) => {
    if (!card) return undefined;
    return {
      id: card.id,
      name: String(card.name || '').trim(),
      image_path: String(card.imagePath || '').trim() || undefined,
      model_info: String(card.modelInfo || '').trim() || undefined,
    };
  };

  const getGalleryPrimaryModelCard = (cards: GalleryModelCard[]) =>
    cards.find((card) => Boolean(String(card.imagePath || '').trim()) || Boolean(card.imageFile) || Boolean(String(card.modelInfo || '').trim()))
    || cards[0]
    || null;

  const getGalleryPrimarySceneCard = (cards: GallerySceneCard[]) =>
    cards.find((card) => Object.values(sanitizeGallerySceneConfig(card.sceneConfig)).some((value) => Boolean(String(value || '').trim())))
    || cards[0]
    || null;

  const markGalleryAdvancedDirty = () => {
    setGalleryAdvancedDirty(true);
    setGalleryOutputMode('custom');
    setIsGalleryAdvancedEditingCollapsed(false);
  };

  const handleApplyGalleryBulkConfig = async (nextBulkConfig?: GalleryBulkConfig): Promise<boolean> => {
    const appliedBulkConfig = nextBulkConfig || galleryBulkConfig;
    const nextItems = buildGalleryOutputItemsFromBulkConfig({
      bulkConfig: appliedBulkConfig,
      fallbackModelCardId: getGalleryPrimaryModelCard(galleryModelCards)?.id,
      fallbackSceneCardId: getGalleryPrimarySceneCard(gallerySceneCards)?.id,
    });

    if (nextItems.length === 0) {
      openGalleryAlert(t.pg_main_toast_enable_one_output);
      return false;
    }

    if (galleryAdvancedDirty && galleryOutputItems.some((item) => item.enabled && item.count > 0)) {
      const action = await openGalleryConfirm(
        t.pg_main_confirm_overwrite_advanced_body,
        {
          title: t.pg_main_confirm_overwrite_advanced_title,
          okLabel: t.pg_main_btn_overwrite_apply,
          cancelLabel: t.pg_main_btn_cancel,
        }
      );
      if (action !== 'ok') return false;
    }

    setGalleryBulkConfig(appliedBulkConfig);
    setGalleryOutputItems(nextItems);
    setGalleryOutputMode('custom');
    setGalleryAdvancedDirty(false);
    setIsGalleryAdvancedEditingCollapsed(true);
    return true;
  };

  const normalizeGalleryOutputPayloadItem = (
    item: GalleryOutputItem,
    modelCardsById: Map<string, GalleryModelCard>,
    sceneCardsById: Map<string, GallerySceneCard>
  ) => {
    const supportsResourceBinding = item.outputType !== 'white_bg';
    const modelCard = supportsResourceBinding && item.modelCardId ? (modelCardsById.get(item.modelCardId) || null) : null;
    const sceneCard = supportsResourceBinding && item.sceneCardId ? (sceneCardsById.get(item.sceneCardId) || null) : null;
    const layouts = Array.isArray(item.layouts) ? item.layouts : [];
    const activeIdx = Math.min(Math.max(0, Number(item.layoutIndex ?? 0)), Math.max(0, layouts.length - 1));
    const activeLayout = layouts[activeIdx] ?? item.layout ?? undefined;
    return {
      id: item.id,
      enabled: item.enabled,
      output_type: item.outputType,
      aspect_ratio: item.aspectRatio,
      resolution: item.resolution,
      count: item.count,
      model_card_id: supportsResourceBinding ? (item.modelCardId || undefined) : undefined,
      scene_card_id: supportsResourceBinding ? (item.sceneCardId || undefined) : undefined,
      model_binding: buildGalleryResolvedModelBinding(modelCard),
      scene_binding: buildGalleryResolvedSceneBinding(sceneCard),
      layout: activeLayout,
    };
  };

  const validateGalleryOutputBindings = (
    items: GalleryOutputItem[],
    modelCardsById: Map<string, GalleryModelCard>,
    sceneCardsById: Map<string, GallerySceneCard>
  ) => {
    for (const item of items) {
      if (item.modelCardId) {
        const modelCard = modelCardsById.get(item.modelCardId);
        if (!modelCard) {
          return {
            ok: false as const,
            target: 'model' as const,
            message: t.pg_main_error_missing_bound_model,
          };
        }
        if (!String(modelCard.imagePath || '').trim() && !modelCard.imageFile) {
          return {
            ok: false as const,
            target: 'model' as const,
            message: t.pg_main_error_model_card_missing_photo.replace('{name}', String(modelCard.name || item.modelCardId)),
          };
        }
      }
      if (item.sceneCardId && !sceneCardsById.has(item.sceneCardId)) {
        return {
          ok: false as const,
          target: 'scene' as const,
          message: t.pg_main_error_missing_bound_scene,
        };
      }
    }
    return { ok: true as const };
  };

  const handleGenerateAiOutputPlan = async () => {
    if (galleryAiOutputPlanner.isGenerating) return;

    const userPrompt = String(galleryAiOutputPlanner.prompt || '').trim();
    setGalleryAiOutputPlanner((prev) => ({ ...prev, isGenerating: true, error: null }));
    try {
      const hasNewImages = galleryImages.length > 0;
      const hasRestoredPaths = galleryRestoredImagePaths.length > 0;
      let workingModelCards = galleryModelCards;
      const primaryModelCard = getGalleryPrimaryModelCard(workingModelCards);
      if (primaryModelCard?.imageFile) {
        workingModelCards = await ensureGalleryModelCardAssetPaths([primaryModelCard.id]);
      }
      const resolvedPrimaryModelCard = getGalleryPrimaryModelCard(workingModelCards);
      const primarySceneCard = getGalleryPrimarySceneCard(gallerySceneCards);
      const sceneConfig = sanitizeGallerySceneConfig(primarySceneCard?.sceneConfig);
      const hasSceneConfig = Object.values(sceneConfig).some((value) => Boolean(String(value || '').trim()));

      let imagePaths: string[] = [];
      if (hasRestoredPaths) {
        imagePaths = [...galleryRestoredImagePaths];
      } else if (hasNewImages) {
        const target = galleryImages[0];
        if (target && !isSupportedGalleryImageFile(target)) {
          openGalleryAlert(gallerySupportedFormatTip);
          setGalleryAiOutputPlanner((prev) => ({ ...prev, isGenerating: false }));
          return;
        }
        if (target) {
          const uploadResp = await assetsApi.uploadTempAsset(target);
          const path = extractUploadedAssetPath(uploadResp);
          if (path) imagePaths = [String(path)];
        }
      }

      const planResp = await videoApi.generateProductGalleryPlan({
        prompt: userPrompt,
        image_paths: imagePaths,
        product_name: galleryProductName.trim(),
        product_category: galleryCategory.trim(),
        core_selling_points: gallerySellingPoints.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 5),
        target_scene: galleryTargetScene,
        style: galleryStyle,
        target_language: galleryCopyLanguage,
        scene_config: hasSceneConfig ? sceneConfig : undefined,
        model_image_path: String(resolvedPrimaryModelCard?.imagePath || '').trim() || undefined,
        model_info: String(resolvedPrimaryModelCard?.modelInfo || '').trim() || undefined,
      });
      const data = (planResp as any)?.data || planResp;
      const rawItems = Array.isArray(data?.items) ? data.items : [];
      if (rawItems.length === 0) throw new Error(t.pg_main_error_ai_no_items);

      const items: GalleryOutputItem[] = rawItems
        .map((row: any) => {
          const outputType = normalizeAiOutputType(row?.outputType ?? row?.output_type ?? row?.type);
          if (!outputType) return null;
          const shouldBindPrimaryResources = outputType === 'scene' || outputType === 'selling_point' || outputType === 'cover' || outputType === 'poster';
          const layoutText = typeof row?.layout === 'string' ? row.layout.trim() : '';
          const layouts = layoutText ? [layoutText] : [];
          return {
            id: createGalleryOutputItemId(),
            enabled: Boolean(row?.enabled ?? true),
            outputType,
            aspectRatio: normalizeAiAspectRatio(row?.aspectRatio ?? row?.aspect_ratio),
            resolution: normalizeAiResolution(row?.resolution),
            count: 1,
            modelCardId: shouldBindPrimaryResources ? (resolvedPrimaryModelCard?.id || undefined) : undefined,
            sceneCardId: shouldBindPrimaryResources ? (primarySceneCard?.id || undefined) : undefined,
            layout: layoutText || undefined,
            layouts,
            layoutIndex: 0,
          } satisfies GalleryOutputItem;
        })
        .filter(Boolean) as GalleryOutputItem[];

      const total = items.filter((it) => it.enabled).reduce((sum, it) => sum + Math.max(0, Math.round(Number(it.count || 0))), 0);
      if (total <= 0) {
        throw new Error(t.pg_main_error_ai_plan_total_zero);
      }
      if (total > 20) {
        throw new Error(t.pg_main_error_ai_plan_exceeds_20);
      }

      setGalleryOutputMode('ai');
      setGalleryBulkConfig(inferGalleryBulkConfigFromOutputItems(items, effectiveGallerySellingPointCount));
      setGalleryOutputItems(items);
      setGalleryAdvancedDirty(false);
      setIsGalleryAdvancedEditingCollapsed(false);
      setGalleryAiOutputPlanner({ open: false, prompt: '', isGenerating: false, error: null });
    } catch (err: any) {
      const message = String(err?.message || t.pg_main_error_ai_planning_failed_retry);
      setGalleryAiOutputPlanner((prev) => ({ ...prev, isGenerating: false, error: message }));
    }
  };

  const handleGalleryOptimizeOutputItem = async (itemId: string) => {
    const targetId = String(itemId || '').trim();
    if (!targetId || galleryOptimizingItemIds[targetId]) return;

    const targetItem = galleryOutputItems.find((item) => item.id === targetId) || null;
    if (!targetItem) return;

    const hasNewImages = galleryImages.length > 0;
    const hasRestoredPaths = galleryRestoredImagePaths.length > 0;
    if (!hasNewImages && !hasRestoredPaths) {
      openGalleryAlert(t.pg_main_toast_upload_one_image);
      return;
    }

    const normalizedItem = normalizeGalleryOutputItem(targetItem);
    if (!normalizedItem) return;

    const modelCardsById = new Map(galleryModelCards.map((card) => [card.id, card] as const));
    const sceneCardsById = new Map(gallerySceneCards.map((card) => [card.id, card] as const));
    const bindingValidation = validateGalleryOutputBindings([normalizedItem], modelCardsById, sceneCardsById);
    if (!bindingValidation.ok) {
      guideGalleryResourceSection(bindingValidation.target);
      openGalleryAlert(bindingValidation.message);
      return;
    }

    setGalleryOptimizingItemIds((prev) => ({ ...prev, [targetId]: true }));
    try {
      let imagePaths: string[] = [];
      if (hasRestoredPaths) {
        imagePaths = [...galleryRestoredImagePaths];
      } else {
        const uploadTargets = galleryImages.slice(0, 3);
        if (uploadTargets.some((file) => !isSupportedGalleryImageFile(file))) {
          openGalleryAlert(gallerySupportedFormatTip);
          setGalleryOptimizingItemIds((prev) => ({ ...prev, [targetId]: false }));
          return;
        }
        for (const file of uploadTargets) {
          const uploadResp = await assetsApi.uploadTempAsset(file);
          const path = extractUploadedAssetPath(uploadResp);
          if (path) imagePaths.push(String(path));
        }
      }
      if (imagePaths.length === 0) {
        throw new Error(t.pg_main_toast_image_upload_failed_retry);
      }

      const requiredModelCardIds = normalizedItem.modelCardId ? [normalizedItem.modelCardId] : [];
      const workingModelCards = requiredModelCardIds.length > 0
        ? await ensureGalleryModelCardAssetPaths(requiredModelCardIds)
        : galleryModelCards;
      const workingModelCardsById = new Map(workingModelCards.map((card) => [card.id, card] as const));
      const workingSceneCardsById = new Map(gallerySceneCards.map((card) => [card.id, card] as const));
      const payloadItem = normalizeGalleryOutputPayloadItem(normalizedItem, workingModelCardsById, workingSceneCardsById);

      const optimizeResp = await videoApi.optimizeProductGalleryItem({
        image_paths: imagePaths,
        product_name: galleryProductName.trim(),
        product_category: galleryCategory.trim(),
        core_selling_points: gallerySellingPoints.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 5),
        target_scene: galleryTargetScene,
        style: galleryStyle,
        target_language: galleryCopyLanguage,
        hot_style: hotStyleSelectedIndex !== null ? hotStyleItems[hotStyleSelectedIndex] : undefined,
        output_item: payloadItem,
      });
      const optimized = (optimizeResp as any)?.data?.item || (optimizeResp as any)?.item || (optimizeResp as any)?.data || optimizeResp;
      const nextCopy = sanitizeGalleryCopy(optimized?.copy);
      const nextCardConfig = sanitizeGalleryOutputCardConfig(optimized?.card_config || optimized?.cardConfig);

      setGalleryOutputItems((prev) =>
        prev.map((item) => {
          if (item.id !== targetId) return item;
          const optimizedLayout = typeof optimized?.layout === 'string' ? optimized.layout : '';
          const prevLayouts = Array.isArray(item.layouts) ? item.layouts : [];
          const prevIdx = Math.min(Math.max(0, Number(item.layoutIndex ?? 0)), Math.max(0, prevLayouts.length - 1));
          let nextLayouts = prevLayouts;
          let nextLayoutText = item.layout;
          if (optimizedLayout) {
            if (prevLayouts.length > 0) {
              nextLayouts = prevLayouts.map((txt, idx) => (idx === prevIdx ? optimizedLayout : txt));
            } else {
              nextLayouts = [optimizedLayout];
            }
            nextLayoutText = optimizedLayout;
          }
          return {
            ...item,
            layout: nextLayoutText,
            layouts: nextLayouts,
            layoutIndex: Math.min(prevIdx, Math.max(0, nextLayouts.length - 1)),
            copy: nextCopy || item.copy,
            notes: typeof optimized?.notes === 'string' ? optimized.notes : item.notes,
            prompt: typeof optimized?.prompt === 'string' ? optimized.prompt : item.prompt,
            cardConfig: nextCardConfig || item.cardConfig || {},
          };
        })
      );
    } catch (err: any) {
      openGalleryAlert(String(err?.message || t.pg_main_error_optimize_card_failed));
    } finally {
      setGalleryOptimizingItemIds((prev) => ({ ...prev, [targetId]: false }));
    }
  };

  const handleGalleryGenerate = async () => {
    if (!requireAuth()) return;
    if (isGalleryGenerating) return;

    // Determine whether we have new uploaded images or restored backend paths
    const hasNewImages = galleryImages.length > 0;
    const hasRestoredPaths = galleryRestoredImagePaths.length > 0;

    if (!hasNewImages && !hasRestoredPaths) {
      openGalleryAlert(t.pg_main_toast_upload_one_image);
      return;
    }

    const uploadTargets = galleryImages.slice(0, 3);
    if (hasNewImages && uploadTargets.some((f) => !isSupportedGalleryImageFile(f))) {
      openGalleryAlert(gallerySupportedFormatTip);
      return;
    }

    let normalizedOutputItems: GalleryOutputItem[] = galleryOutputItems
      .map((item) => ({
        ...item,
        aspectRatio: String(item.aspectRatio || '1:1').trim() || '1:1',
        resolution: (String(item.resolution || '1k').trim().toLowerCase() === '2k' || String(item.resolution || '1k').trim().toLowerCase() === '4k'
          ? String(item.resolution).trim().toLowerCase()
          : '1k') as any,
        count: Math.max(0, Math.round(Number(item.count || 0))),
        modelCardId: item.outputType !== 'white_bg' ? (String(item.modelCardId || '').trim() || undefined) : undefined,
        sceneCardId: item.outputType !== 'white_bg' ? (String(item.sceneCardId || '').trim() || undefined) : undefined,
        title: undefined,
        copy: undefined,
        notes: undefined,
        prompt: undefined,
        cardConfig: undefined,
      }))
      .filter((item) => item.enabled && item.count > 0);

    let totalCount = normalizedOutputItems.reduce((sum, item) => sum + item.count, 0);
    if (totalCount <= 0) {
      openGalleryAlert(t.pg_main_toast_add_one_output_item);
      return;
    }
    if (totalCount > 20) {
      openGalleryAlert(t.pg_main_toast_too_many_images);
      return;
    }

    let effectiveSellingPoints = gallerySellingPoints
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .slice(0, 5);

    const requestedSellingPointCount = normalizedOutputItems
      .filter((item) => item.outputType === 'selling_point')
      .reduce((sum, item) => sum + item.count, 0);

    if (
      requestedSellingPointCount > 0 &&
      effectiveSellingPoints.length > 0 &&
      effectiveSellingPoints.length !== requestedSellingPointCount
    ) {
      const confirmAction = await openGalleryConfirm(
        t.pg_main_selling_point_count_mismatch
          .replace('{used}', String(Math.min(requestedSellingPointCount, effectiveSellingPoints.length)))
          .replace('{total}', String(effectiveSellingPoints.length)),
        {
          title: t.pg_main_confirm_selling_point_count_title,
          okLabel: t.pg_main_btn_match_count,
          cancelLabel: t.pg_main_btn_use_current_count,
        }
      );

      if (confirmAction === 'dismiss') {
        return;
      }

      if (confirmAction === 'ok') {
        const sellingPointEntries = normalizedOutputItems.filter((item) => item.outputType === 'selling_point');
        const targetId = sellingPointEntries[0]?.id || null;

        setGalleryOutputItems((prev) => {
          const cleared = prev.map((item) => (item.outputType === 'selling_point' ? { ...item, count: 0 } : item));
          if (targetId) {
            return cleared.map((item) => (item.id === targetId ? { ...item, enabled: true, count: effectiveSellingPoints.length } : item));
          }
          return [
            ...cleared,
            {
              id: createGalleryOutputItemId(),
              enabled: true,
              outputType: 'selling_point',
              aspectRatio: '1:1',
              resolution: '1k',
              count: effectiveSellingPoints.length,
            },
          ];
        });

        normalizedOutputItems = [
          ...normalizedOutputItems.filter((item) => item.outputType !== 'selling_point'),
          {
            id: targetId || createGalleryOutputItemId(),
            enabled: true,
            outputType: 'selling_point',
            aspectRatio: sellingPointEntries[0]?.aspectRatio || '1:1',
            resolution: sellingPointEntries[0]?.resolution || '1k',
            count: effectiveSellingPoints.length,
            modelCardId: sellingPointEntries[0]?.modelCardId,
            sceneCardId: sellingPointEntries[0]?.sceneCardId,
            layout: sellingPointEntries[0]?.layout,
            layouts: Array.isArray(sellingPointEntries[0]?.layouts) ? [...sellingPointEntries[0]!.layouts!] : [],
            layoutIndex: sellingPointEntries[0]?.layoutIndex ?? 0,
          },
        ];

        totalCount = normalizedOutputItems.reduce((sum, item) => sum + item.count, 0);
      } else {
        effectiveSellingPoints = effectiveSellingPoints.slice(0, requestedSellingPointCount);
      }
    }

    const flattenedPlan = normalizedOutputItems.flatMap((item) => {
      const rows: Array<{ outputType: GalleryOutputType; order: number; entryId: string; aspectRatio: string; resolution: '1k' | '2k' | '4k' }> = [];
      for (let idx = 0; idx < item.count; idx += 1) {
        rows.push({
          outputType: item.outputType,
          order: idx,
          entryId: item.id,
          aspectRatio: item.aspectRatio,
          resolution: item.resolution,
        });
      }
      return rows;
    });
    totalCount = flattenedPlan.length;
    if (totalCount <= 0) {
      openGalleryAlert(t.pg_main_toast_add_one_output_item);
      return;
    }
    if (totalCount > 20) {
      openGalleryAlert(t.pg_main_toast_too_many_images);
      return;
    }

    const currentModelCardsById = new Map(galleryModelCards.map((card) => [card.id, card] as const));
    const currentSceneCardsById = new Map(gallerySceneCards.map((card) => [card.id, card] as const));
    const bindingValidation = validateGalleryOutputBindings(normalizedOutputItems, currentModelCardsById, currentSceneCardsById);
    if (!bindingValidation.ok) {
      guideGalleryResourceSection(bindingValidation.target);
      openGalleryAlert(bindingValidation.message);
      return;
    }

    const requiredModelCardIds = Array.from(new Set(normalizedOutputItems.map((item) => String(item.modelCardId || '').trim()).filter(Boolean)));
    const workingModelCards = requiredModelCardIds.length > 0
      ? await ensureGalleryModelCardAssetPaths(requiredModelCardIds)
      : galleryModelCards;
    const modelCardsById = new Map(workingModelCards.map((card) => [card.id, card] as const));
    const sceneCardsById = new Map(gallerySceneCards.map((card) => [card.id, card] as const));
    const resolvedPrimaryModelCard = getGalleryPrimaryModelCard(workingModelCards);
    const resolvedPrimarySceneCard = getGalleryPrimarySceneCard(gallerySceneCards);
    const sceneConfig = sanitizeGallerySceneConfig(resolvedPrimarySceneCard?.sceneConfig);
    const hasSceneConfig = Object.values(sceneConfig).some((value) => Boolean(String(value || '').trim()));
    const primaryModelBinding = buildGalleryResolvedModelBinding(resolvedPrimaryModelCard);
    const primarySceneBinding = buildGalleryResolvedSceneBinding(resolvedPrimarySceneCard);

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const legacyTypeSelections = GALLERY_OUTPUT_TYPE_ORDER.reduce((acc, outputType) => {
      const sumCount = normalizedOutputItems
        .filter((item) => item.outputType === outputType)
        .reduce((sum, item) => sum + item.count, 0);
      acc[outputType] = { enabled: sumCount > 0, count: sumCount };
      return acc;
    }, {} as Record<GalleryOutputType, { enabled: boolean; count: number }>);
    const firstEnabled = normalizedOutputItems[0] || null;
    const fallbackAspectRatio = firstEnabled?.aspectRatio || '1:1';
    const fallbackResolution = firstEnabled?.resolution || '1k';

    const settingsSnapshot: GalleryHistorySettings = {
      targetScene: galleryTargetScene,
      style: galleryStyle,
      aspectRatio: fallbackAspectRatio,
      resolution: fallbackResolution,
      copyLanguage: galleryCopyLanguage,
      productName: galleryProductName.trim(),
      productCategory: galleryCategory.trim(),
      sellingPoints: effectiveSellingPoints,
      typeSelections: legacyTypeSelections,
      outputMode: galleryOutputMode,
      outputItems: normalizedOutputItems.map((item) => ({
        id: item.id,
        enabled: item.enabled,
        outputType: item.outputType,
        aspectRatio: item.aspectRatio,
        resolution: item.resolution,
        count: item.count,
        modelCardId: item.modelCardId,
        sceneCardId: item.sceneCardId,
        layout: item.layout,
        layouts: Array.isArray(item.layouts) ? [...item.layouts] : undefined,
        layoutIndex: item.layoutIndex,
      })),
      modelCards: workingModelCards.map((card) => toGalleryModelCardSnapshot(card)),
      sceneCards: gallerySceneCards.map((card) => ({
        id: card.id,
        name: String(card.name || '').trim(),
        sourceMode: card.sourceMode,
        presetId: String(card.presetId || '').trim() || undefined,
        sceneConfig: sanitizeGallerySceneConfig(card.sceneConfig),
      })),
      sceneConfig: hasSceneConfig ? sceneConfig : undefined,
      modelInfo: primaryModelBinding?.model_info,
      modelImagePath: primaryModelBinding?.image_path,
      uploadedImagePaths: [] as string[],
      bulkConfig: {
        ratioStrategy: galleryBulkConfig.ratioStrategy,
        resolution: galleryBulkConfig.resolution,
        bindingStrategy: galleryBulkConfig.bindingStrategy,
        typeSelections: galleryBulkConfig.typeSelections,
      },
      generatedFromBulk: !galleryAdvancedDirty,
    };

    // Collect all successful image URLs across all poll tasks
    const collectedImageUrls: string[] = [];
    const clientHistoryId = `pg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const runId = Date.now();
    galleryPollRunIdRef.current = runId;
    const placeholderCreatedAt = new Date().toISOString();
    const previewPlaceholders = flattenedPlan.map((planned, index) => ({
      localId: `pg-prev-${runId}-${index}-${planned.outputType}`,
      requestId: `pending-${runId}-${index}`,
      status: 'created' as const,
      outputType: planned.outputType,
      createdAt: placeholderCreatedAt,
    }));

    setIsGalleryGenerating(true);
    setGalleryRightPanel('preview');
    setGalleryPreviewItems(previewPlaceholders);

    try {
      let imagePaths: string[] = [];

      if (hasNewImages) {
        // User uploaded new images → upload them to get backend paths
        for (const file of uploadTargets) {
          const uploadResp = await assetsApi.uploadTempAsset(file);
          const path = extractUploadedAssetPath(uploadResp);
          if (path) imagePaths.push(String(path));
        }
      } else {
        // No new images but we have restored paths from history → reuse them
        imagePaths = [...galleryRestoredImagePaths];
      }

      if (imagePaths.length === 0) {
        throw new Error(t.pg_main_toast_image_upload_failed_retry);
      }

      // Save uploaded paths into the snapshot so history re-generate can reference them
      settingsSnapshot.uploadedImagePaths = [...imagePaths];
      // Clear restored paths once consumed
      setGalleryRestoredImagePaths([]);

      const modelInfo = String(primaryModelBinding?.model_info || '').trim();
      const modelImagePath: string | null = String(primaryModelBinding?.image_path || '').trim() || null;
      /*
        void modelImagePath;
        void 0;
        if (!path) throw new Error(t.pg_main_error_model_upload_failed);
        modelImagePath = String(path);
        setGalleryModelImagePath(modelImagePath);
      */

      const createResp = await videoApi.generateProductGallery({
        image_paths: imagePaths,
        aspect_ratio: fallbackAspectRatio,
        resolution: fallbackResolution,
        count: totalCount,
        client_history_id: clientHistoryId,
        product_name: galleryProductName.trim(),
        product_category: galleryCategory.trim(),
        core_selling_points: effectiveSellingPoints,
        target_scene: galleryTargetScene,
        scene_config: hasSceneConfig ? sceneConfig : undefined,
        style: galleryStyle,
        target_language: galleryCopyLanguage,
        hot_style: hotStyleSelectedIndex !== null ? hotStyleItems[hotStyleSelectedIndex] : undefined,
        model_cards: workingModelCards.map((card) => toGalleryModelCardSnapshot(card)),
        scene_cards: gallerySceneCards.map((card) => ({
          id: card.id,
          name: String(card.name || '').trim(),
          source_mode: card.sourceMode,
          preset_id: String(card.presetId || '').trim() || undefined,
          scene_config: sanitizeGallerySceneConfig(card.sceneConfig),
        })),
        type_selections: legacyTypeSelections as any,
        output_mode: galleryOutputMode,
        output_items: normalizedOutputItems.map((item) => normalizeGalleryOutputPayloadItem(item, modelCardsById, sceneCardsById)),
        model_image_path: modelImagePath || undefined,
        model_info: modelInfo || undefined,
      });

      const list = (createResp as any)?.data?.requests || (createResp as any)?.requests || [];
      const requests = Array.isArray(list) ? list : [];

      const initial = requests
        .map((r: any, idx: number) => {
          const fallback = previewPlaceholders[idx];
          const requestId = String(r?.request_id || r?.id || '').trim();
          if (!requestId) return null;
          const outputType = String(r?.type || r?.output_type || r?.image_type || r?.kind || '').trim();
          const createdAt = String(r?.created_at || r?.createdAt || '').trim() || new Date().toISOString();
          return {
            localId: fallback?.localId || `pg-prev-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            requestId,
            status: 'created' as const,
            outputType: outputType || fallback?.outputType || undefined,
            createdAt: createdAt || fallback?.createdAt,
          };
        })
        .filter(Boolean) as Array<{ localId: string; requestId: string; status: 'created' | 'processing' | 'succeeded' | 'failed'; imageUrl?: string; error?: string; outputType?: string; createdAt?: string; layout?: any }>;

      if (initial.length === 0) {
        throw new Error(t.pg_main_error_create_generation_task_failed);
      }

      setGalleryPreviewItems(initial);

      const collectOutputUrls = (payload: any): string[] => {
        const urls: string[] = [];
        const queue: any[] = [payload];
        let visited = 0;

        const pushUrl = (value: any) => {
          if (typeof value !== 'string') return;
          const cleaned = value.trim();
          if (!cleaned) return;
          if (cleaned.startsWith('http://') || cleaned.startsWith('https://') || cleaned.startsWith('/media/')) {
            if (!urls.includes(cleaned)) urls.push(cleaned);
          }
        };

        while (queue.length > 0 && visited < 80 && urls.length < 8) {
          const current = queue.shift();
          visited += 1;
          if (current == null) continue;

          if (typeof current === 'string') {
            pushUrl(current);
            continue;
          }

          if (Array.isArray(current)) {
            queue.push(...current.slice(0, 12));
            continue;
          }

          if (typeof current === 'object') {
            pushUrl((current as any).url);
            pushUrl((current as any).image_url);
            pushUrl((current as any).file_url);
            pushUrl((current as any).src);
            pushUrl((current as any).path);

            queue.push((current as any).outputs);
            queue.push((current as any).output);
            queue.push((current as any).images);
            queue.push((current as any).result);
            queue.push((current as any).data);
          }
        }

        return urls;
      };

      const successStatuses = new Set(['ready', 'success', 'succeeded', 'completed', 'done']);
      const failureStatuses = new Set(['failed', 'error', 'canceled', 'cancelled', 'rejected']);

      const pollOne = async (requestId: string) => {
        setGalleryPreviewItems((prev) =>
          prev.map((it) => (it.requestId === requestId ? { ...it, status: 'processing' as const } : it))
        );

        for (let i = 0; i < 120; i += 1) {
          if (galleryPollAbortRef.current) {
            return { status: 'failed' as const, error: t.pg_main_error_generation_interrupted };
          }
          if (galleryPollRunIdRef.current !== runId) {
            return { status: 'failed' as const, error: t.pg_main_error_generation_task_stale };
          }

          const statusResp = await videoApi.getProductGalleryResult(requestId);
          const data = (statusResp as any)?.data || statusResp;
          const status = String(data?.status || '').trim().toLowerCase();
          const outputs = collectOutputUrls(data);
          const upstreamError = String(data?.error || '').trim();

          if (upstreamError && outputs.length === 0) {
            setGalleryPreviewItems((prev) =>
              prev.map((it) => (it.requestId === requestId ? { ...it, status: 'failed' as const, error: upstreamError } : it))
            );
            return { status: 'failed' as const, error: upstreamError };
          }

          if (outputs.length > 0) {
            const url = String(outputs[0] || '').trim();
            if (!url) {
              throw new Error(t.pg_main_error_generation_empty);
            }

            const outputType = String(data?.type || data?.output_type || data?.image_type || data?.kind || '').trim();
            const createdAt = String(data?.created_at || data?.createdAt || '').trim();

            setGalleryPreviewItems((prev) =>
              prev.map((it) =>
                it.requestId === requestId
                  ? {
                      ...it,
                      status: 'succeeded' as const,
                      imageUrl: url,
                      outputType: it.outputType || outputType || undefined,
                      createdAt: it.createdAt || createdAt || undefined,
                    }
                  : it
              )
            );
            try {
              await refreshImageHistory();
              notifyImageHistoryUpdated();
            } catch {
              // Keep generation flow non-blocking when history refresh fails.
            }
            // Collect URL for batch history write
            outputs.forEach((o: any) => {
              const u = String(o || '').trim();
              if (u) collectedImageUrls.push(u);
            });
            return { status: 'succeeded' as const, outputs };
          }

          if (failureStatuses.has(status)) {
            const errorMessage = upstreamError || t.pg_main_status_failed;
            setGalleryPreviewItems((prev) =>
              prev.map((it) => (it.requestId === requestId ? { ...it, status: 'failed' as const, error: errorMessage } : it))
            );
            return { status: 'failed' as const, error: errorMessage };
          }

          if (successStatuses.has(status)) {
            const errorMessage = upstreamError || t.pg_main_error_generation_no_result;
            setGalleryPreviewItems((prev) =>
              prev.map((it) => (it.requestId === requestId ? { ...it, status: 'failed' as const, error: errorMessage } : it))
            );
            return { status: 'failed' as const, error: errorMessage };
          }

          await sleep(1500);
        }

        const timeoutMessage = t.pg_main_error_generation_timeout;
        setGalleryPreviewItems((prev) =>
          prev.map((it) => (it.requestId === requestId ? { ...it, status: 'failed' as const, error: timeoutMessage } : it))
        );
        return { status: 'failed' as const, error: timeoutMessage };
      };

      const pollResults = await Promise.all(initial.map((it) => pollOne(it.requestId)));

      const failedResults = pollResults.filter((item) => item?.status === 'failed');
      if (failedResults.length > 0) {
        const firstError = String(failedResults[0]?.error || '').trim();
        if (collectedImageUrls.length === 0) {
          throw new Error(firstError || t.pg_main_error_gallery_generation_failed);
        }
        openGalleryAlert(
          firstError
            ? t.pg_main_error_partial_failed_prefix + firstError
            : t.pg_main_error_partial_failed_review
        );
      }

      if (collectedImageUrls.length === 0 && failedResults.length === 0) {
        throw new Error(t.pg_main_error_gallery_no_result);
      }

      if (collectedImageUrls.length > 0) {
        await refreshImageHistory();
        notifyImageHistoryUpdated();
      }
    } catch (err: any) {
      const message = String(err?.message || t.pg_main_toast_generation_failed_retry);
      setGalleryPreviewItems((prev) =>
        prev.some((item) => Boolean(String(item.imageUrl || '').trim()))
          ? prev
          : prev.map((item) => ({ ...item, status: 'failed' as const, error: message }))
      );
      openGalleryAlert(message);
    } finally {
      if (galleryPollRunIdRef.current === runId) {
        setIsGalleryGenerating(false);
      }
    }
  };

  return (
    <div className="flex flex-col h-full z-10">
      <AppDialog
        isOpen={galleryAlert.open}
        title={galleryAlert.title}
        onClose={closeGalleryAlert}
        widthClassName="max-w-sm"
        footer={
          <button
            type="button"
            onClick={closeGalleryAlert}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-black hover:bg-orange-400 transition"
          >
            {t.pg_main_btn_ok}
          </button>
        }
      >
        {galleryAlert.message}
      </AppDialog>

      <AppDialog
        isOpen={galleryConfirm.open}
        title={galleryConfirm.title}
        onClose={() => closeGalleryConfirm('dismiss')}
        widthClassName="max-w-sm"
        overlayClassName="z-[160]"
        footer={
          <>
            <button
              type="button"
              onClick={() => closeGalleryConfirm('cancel')}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition"
            >
              {galleryConfirm.cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => closeGalleryConfirm('ok')}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-black hover:bg-orange-400 transition"
            >
              {galleryConfirm.okLabel}
            </button>
          </>
        }
      >
        {galleryConfirm.message}
      </AppDialog>


      <AppDialog
        isOpen={galleryAiOutputPlanner.open}
        title={t.pg_main_dialog_ai_recommended_mix_title}
        onClose={closeGalleryAiOutputPlanner}
        widthClassName="max-w-lg"
        overlayClassName="z-[160]"
        footer={
          <>
            <button
              type="button"
              onClick={closeGalleryAiOutputPlanner}
              disabled={galleryAiOutputPlanner.isGenerating}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition disabled:opacity-50"
            >
              {t.pg_main_btn_cancel}
            </button>
            <button
              type="button"
              onClick={handleGenerateAiOutputPlan}
              disabled={galleryAiOutputPlanner.isGenerating}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-black hover:bg-orange-400 transition disabled:opacity-50"
            >
              {galleryAiOutputPlanner.isGenerating ? t.pi_gallery_inpaint_generating : t.pg_main_btn_generate_plan}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-zinc-400">
            {t.pg_main_ai_recommend_description}
          </div>
          <textarea
            value={galleryAiOutputPlanner.prompt}
            onChange={(e) => setGalleryAiOutputPlanner((prev) => ({ ...prev, prompt: e.target.value }))}
            rows={4}
            className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
            placeholder={t.pg_main_ai_recommend_placeholder}
          />
          {galleryAiOutputPlanner.error ? (
            <div className="text-xs text-red-400">{galleryAiOutputPlanner.error}</div>
          ) : null}
        </div>
      </AppDialog>

      <AppDialog
        isOpen={Boolean(galleryPreviewImageUrl)}
        title={t.pg_main_dialog_image_details_title}
        onClose={closeGalleryImagePreview}
        widthClassName="max-w-6xl h-[calc(100vh-3rem)]"
        titleClassName="text-base"
        subtitle={(() => {
          const activeHistoryItem = galleryPreviewSource?.kind === 'history_item' ? galleryHistoryItems.find((it) => it.id === galleryPreviewSource.itemId) : null;
          const productNameLabel = String(activeHistoryItem?.settings?.productName || '').trim() || String(galleryProductName || '').trim() || '-';
          const targetSceneValue = String(activeHistoryItem?.settings?.targetScene || galleryTargetScene || '').trim();
          const targetSceneLabel =
            targetSceneValue === 'detail'
              ? t.pg_main_style_detail
              : targetSceneValue === 'poster'
                ? t.pg_main_style_poster
                : targetSceneValue === 'xiaohongshu'
                  ? t.pg_main_style_xiaohongshu
                  : targetSceneValue === 'douyin'
                    ? t.pg_main_style_douyin
                    : targetSceneValue === 'ads'
                      ? t.pg_main_style_ads
                      : '-';
          return `${productNameLabel} · ${targetSceneLabel}`;
        })()}
        contentClassName="overflow-hidden"
      >
        {galleryPreviewImageUrl ? (() => {
          const activePreviewItem = galleryPreviewSource?.kind === 'preview_item' ? galleryPreviewItems.find((it) => it.localId === galleryPreviewSource.localId) : null;
          const activeHistoryItem =
            galleryPreviewSource?.kind === 'history_item' ? galleryHistoryItems.find((it) => it.id === galleryPreviewSource.itemId) : null;

          const resolveHistoryOutputType = () => {
            if (!activeHistoryItem) return '';

            const historyIndex = galleryPreviewSource?.kind === 'history_item' ? Number((galleryPreviewSource as any).index) : -1;
            const imageUrl = String(galleryPreviewImageUrl || '').trim();
            const metadata = (activeHistoryItem.metadata && typeof activeHistoryItem.metadata === 'object' && !Array.isArray(activeHistoryItem.metadata))
              ? activeHistoryItem.metadata
              : {};

            const outputTypesByUrl = (metadata as any).outputTypesByUrl;
            if (outputTypesByUrl && typeof outputTypesByUrl === 'object') {
              const mapped = String((outputTypesByUrl as any)[imageUrl] || '').trim();
              if (mapped) return mapped;
            }

            const imageTypes = Array.isArray((metadata as any).imageTypes) ? (metadata as any).imageTypes : [];
            if (historyIndex >= 0 && historyIndex < imageTypes.length) {
              const mapped = String(imageTypes[historyIndex] || '').trim();
              if (mapped) return mapped;
            }

            const outputImages = Array.isArray((metadata as any).outputImages) ? (metadata as any).outputImages : [];
            if (outputImages.length > 0) {
              const matched = outputImages.find((img: any) => {
                const url = String(img?.imageUrl || img?.downloadUrl || img?.url || img?.preview_url || img?.image_url || '').trim();
                return url && url === imageUrl;
              });
              const mapped = String(matched?.outputType || matched?.output_type || matched?.category || matched?.type || '').trim();
              if (mapped) return mapped;
            }

            const maybeResults = (metadata as any).results || (metadata as any).items || (metadata as any).outputs;
            const results = Array.isArray(maybeResults) ? maybeResults : [];
            if (results.length > 0) {
              const matched = results.find((row: any) => {
                const url = String(row?.preview_url || row?.image_url || row?.url || row?.src || '').trim();
                return url && url === imageUrl;
              });
              const mapped = String(matched?.outputType || matched?.output_type || matched?.type || matched?.category || '').trim();
              if (mapped) return mapped;
            }

            const selections = activeHistoryItem.settings?.typeSelections;
            if (selections && typeof selections === 'object') {
              const enabledKeys = Object.entries(selections)
                .filter(([, value]) => Boolean((value as any)?.enabled) && Number((value as any)?.count || 0) > 0)
                .map(([key]) => key);
              if (enabledKeys.length === 1) return enabledKeys[0];
              if (enabledKeys.length > 1) return t.pg_main_multiple;
            }

            return '';
          };

          const createdAtRaw = activeHistoryItem?.createdAt
            ? String(activeHistoryItem.createdAt)
            : activePreviewItem?.createdAt
              ? String(activePreviewItem.createdAt)
              : '';
          const createdAtLabel = createdAtRaw ? formatGalleryPreviewDatetime(createdAtRaw) : '-';
          const modelLabel = 'nano banana pro';
          const productNameLabel =
            String(activeHistoryItem?.settings?.productName || '').trim() || String(galleryProductName || '').trim() || '-';
          const targetSceneValue = String(activeHistoryItem?.settings?.targetScene || galleryTargetScene || '').trim();
          const targetSceneLabel =
            targetSceneValue === 'detail'
              ? t.pg_main_style_detail
              : targetSceneValue === 'poster'
                ? t.pg_main_style_poster
                : targetSceneValue === 'xiaohongshu'
                  ? t.pg_main_style_xiaohongshu
                  : targetSceneValue === 'douyin'
                    ? t.pg_main_style_douyin
                    : targetSceneValue === 'ads'
                      ? t.pg_main_style_ads
                      : '-';
          const previewSubtitle = `${productNameLabel} · ${targetSceneLabel}`;
          const outputType = String(activePreviewItem?.outputType || resolveHistoryOutputType() || '').trim();
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
          const typeLabel = String(outputTypeLabel || '').trim() || (outputType ? outputType : '-');

          return (
            <div className="w-full h-full flex flex-col min-h-0">
              <div className="hidden">
                <div className="text-xs font-semibold text-zinc-500">{previewSubtitle}</div>
              </div>

              <div className="w-full flex-1 min-h-0 flex overflow-hidden">
                <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center pr-6">
                  <div className="relative w-full h-full flex items-center justify-center rounded-2xl bg-black/5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                  {galleryPreviewNav && galleryPreviewNav.total > 1 ? (
                    <button
                      type="button"
                      onClick={handleGalleryPreviewPrev}
                      disabled={galleryPreviewNav.index <= 0}
                      className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/60 border border-white/10 text-zinc-200 hover:bg-black/75 disabled:opacity-40 disabled:hover:bg-black/60 transition flex items-center justify-center"
                      aria-label={t.pg_main_aria_previous}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  ) : null}

                  <div className="relative h-full w-full overflow-hidden">
                    <img
                      src={galleryPreviewImageUrl}
                      alt={t.pg_main_aria_preview_image}
                      className="h-full w-full object-contain transition-transform duration-300 ease-out group-hover:scale-105"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        if (img.naturalWidth && img.naturalHeight) setGalleryPreviewResolution({ w: img.naturalWidth, h: img.naturalHeight });
                      }}
                    />
                  </div>

                  {galleryPreviewNav && galleryPreviewNav.total > 1 ? (
                    <button
                      type="button"
                      onClick={handleGalleryPreviewNext}
                      disabled={galleryPreviewNav.index >= galleryPreviewNav.total - 1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/60 border border-white/10 text-zinc-200 hover:bg-black/75 disabled:opacity-40 disabled:hover:bg-black/60 transition flex items-center justify-center"
                      aria-label={t.pg_main_aria_next}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="w-[320px] shrink-0 min-h-0 flex flex-col gap-3 pl-6 border-l border-white/10">


                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-bold text-zinc-200">{t.pg_main_generation_info}</div>
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">{t.pg_main_resolution}</span>
                      <span className="text-zinc-200 font-bold">
                        {galleryPreviewResolution ? `${galleryPreviewResolution.w} × ${galleryPreviewResolution.h} px` : '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">{t.pg_main_created_at}</span>
                      <span className="text-zinc-200 font-bold">{createdAtLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">{t.pg_main_type}</span>
                      <span className="text-zinc-200 font-bold">{typeLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">{t.pg_main_model}</span>
                      <span className="text-zinc-200 font-bold">{modelLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-auto flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={openGalleryInpaint}
                    className="w-full rounded-xl border border-white/10 bg-black/80 px-4 py-3 text-sm font-bold text-white shadow-sm transition-all duration-200 hover:bg-indigo-600 hover:shadow-xl active:scale-[0.96] active:shadow-lg flex items-center justify-center gap-2"
                  >
                    <Wand2 className="w-4 h-4" />
                    {t.pg_main_inpaint_edit}
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      {galleryDownloadBubbleOpen ? (
                        <div
                          ref={galleryDownloadBubbleRef}
                          className="absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/80 p-2 text-xs text-zinc-200 shadow-lg shadow-black/30 backdrop-blur"
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={isGalleryPreviewDownloading}
                              onClick={() => {
                                setGalleryDownloadBubbleOpen(false);
                                void handleDownloadGalleryPreviewImage();
                              }}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-bold text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                            >
                              {t.pg_main_single}
                            </button>
                            <button
                              type="button"
                              disabled={isGalleryPreviewDownloading}
                              onClick={() => {
                                setGalleryDownloadBubbleOpen(false);
                                void handleDownloadGalleryPreviewAllImages();
                              }}
                              className="rounded-xl bg-orange-500 px-3 py-2 font-bold text-black hover:bg-orange-400 disabled:opacity-60"
                            >
                              {t.pg_main_all}
                            </button>
                          </div>
                          <div className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1.5 rotate-45 border-b border-r border-white/10 bg-black/80" />
                        </div>
                      ) : null}

                      <button
                        ref={galleryDownloadButtonRef}
                        type="button"
                        onClick={handleToggleGalleryDownloadBubble}
                        disabled={isGalleryPreviewDownloading}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-zinc-200 transition-all duration-200 hover:bg-white/10 hover:border-white/20 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        {isGalleryPreviewDownloading ? t.pg_main_downloading : (t.pi_gallery_preview_download_image)}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportGalleryPreviewAsPdf}
                      disabled={isGalleryPreviewExportingPdf}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-zinc-200 transition-all duration-200 hover:bg-white/10 hover:border-white/20 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      <FileDown className="w-4 h-4" />
                      {isGalleryPreviewExportingPdf ? t.pg_main_exporting : (t.pi_gallery_preview_export_pdf)}
                    </button>
                  </div>
                </div>
              </div>
              </div>
            </div>
          );
        })() : null}
      </AppDialog>

      {galleryToastMessage ? (
        <div className="fixed left-6 bottom-6 z-[170] max-w-[360px] rounded-xl border border-white/10 bg-black/70 px-4 py-3 text-xs text-zinc-200 shadow-lg shadow-black/30">
          {galleryToastMessage}
        </div>
      ) : null}

      <AppDialog
        isOpen={galleryInpaint.open}
        title={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeGalleryInpaint}
              className="-ml-1 inline-flex items-center justify-center rounded-lg px-2 py-1 text-zinc-300 hover:bg-white/5 hover:text-white transition"
              aria-label={t.ff_back}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span>{galleryInpaint.step === 'compare' ? t.pg_main_inpaint_choose_result : t.pg_main_inpaint_local_edit}</span>
          </div>
        }
        titleClassName="text-base"
        subtitle={
          galleryInpaint.step === 'compare'
            ? t.pg_main_inpaint_compare_hint
            : t.pg_main_inpaint_select_on_left
        }
        onClose={closeGalleryInpaint}
        widthClassName="max-w-none w-[1120px] max-w-[calc(100vw-3rem)]"
        contentClassName="overflow-y-auto overflow-x-hidden"
      >
        {galleryPreviewImageUrl ? (
          <div className="w-full h-[calc(100vh-12rem)] max-h-[680px] flex gap-6">
            <div className="flex-1 min-w-0 min-h-0 rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
              {galleryInpaint.step === 'compare' && galleryInpaint.resultUrl ? (
                <div className="h-full w-full flex items-center justify-center p-8">
                  <div className="w-full h-full max-w-[720px] flex items-center justify-center gap-6">
                    <button
                      type="button"
                      onClick={() => setGalleryInpaint((prev) => ({ ...prev, selectedCompare: 'original' }))}
                      className={`relative flex-1 h-full rounded-2xl bg-black/40 overflow-hidden transition ${galleryInpaint.selectedCompare === 'original' ? 'border-2 border-indigo-500/70 shadow-lg shadow-indigo-600/10' : 'border border-white/10 hover:border-white/20'}`}
                      aria-label={t.pg_main_aria_select_original}
                    >
                      <img src={galleryPreviewImageUrl} alt={t.pg_main_original} className="w-full h-full object-contain" draggable={false} />
                      <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold text-white">{t.pg_main_original}</div>
                      {galleryInpaint.selectedCompare === 'original' ? (
                        <div className="absolute right-3 top-3 rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-bold text-white">{t.pg_main_selected}</div>
                      ) : null}
                    </button>

                    <button
                      type="button"
                      onClick={() => setGalleryInpaint((prev) => ({ ...prev, selectedCompare: 'edited' }))}
                      className={`relative flex-1 h-full rounded-2xl bg-black/40 overflow-hidden transition ${galleryInpaint.selectedCompare === 'edited' ? 'border-2 border-indigo-500/70 shadow-lg shadow-indigo-600/10' : 'border border-white/10 hover:border-white/20'}`}
                      aria-label={t.pg_main_aria_select_edited}
                    >
                      <img src={galleryInpaint.resultUrl} alt={t.pg_main_edited} className="w-full h-full object-contain" draggable={false} />
                      <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold text-white">{t.pg_main_edited}</div>
                      {galleryInpaint.selectedCompare === 'edited' ? (
                        <div className="absolute right-3 top-3 rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-bold text-white">{t.pg_main_selected}</div>
                      ) : null}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  ref={galleryInpaintBoxRef}
                  className="relative w-full h-full select-none"
                  onMouseDown={handleInpaintPointerDown}
                  onMouseMove={handleInpaintPointerMove}
                  onMouseUp={handleInpaintPointerUp}
                  onMouseLeave={handleInpaintPointerUp}
                >
                  <img
                    ref={galleryInpaintImgRef}
                    src={galleryInpaint.resultUrl || galleryPreviewImageUrl}
                    alt={t.pg_main_aria_preview_image}
                    className="w-full h-full object-contain"
                    draggable={false}
                  />

                  {galleryInpaint.rect ? (
                    <>
                      <div
                        className="absolute pointer-events-none rounded-xl"
                        style={{
                          left: `${galleryInpaint.rect.x * 100}%`,
                          top: `${galleryInpaint.rect.y * 100}%`,
                          width: `${galleryInpaint.rect.w * 100}%`,
                          height: `${galleryInpaint.rect.h * 100}%`,
                          boxShadow: `0 0 0 9999px rgba(0,0,0,${galleryInpaint.maskOpacity})`,
                        }}
                      />
                      <style>{'@keyframes inpaintDash{from{stroke-dashoffset:0;}to{stroke-dashoffset:-26;}}'}</style>

                      {(() => {
                        const w = Math.max(1, Math.round(galleryInpaint.rect.w * (inpaintBoxSize.w || 100)));
                        const h = Math.max(1, Math.round(galleryInpaint.rect.h * (inpaintBoxSize.h || 100)));
                        const r = Math.max(0, Math.min(12, w / 2, h / 2));

                        return (
                          <svg
                            className="absolute pointer-events-none"
                            style={{
                              left: `${galleryInpaint.rect.x * 100}%`,
                              top: `${galleryInpaint.rect.y * 100}%`,
                              width: `${galleryInpaint.rect.w * 100}%`,
                              height: `${galleryInpaint.rect.h * 100}%`,
                            }}
                            viewBox={`0 0 ${w} ${h}`}
                            preserveAspectRatio="none"
                          >
                            <rect
                              x={1}
                              y={1}
                              width={Math.max(0, w - 2)}
                              height={Math.max(0, h - 2)}
                              rx={r}
                              ry={r}
                              fill="none"
                              stroke="rgba(99,102,241,0.35)"
                              strokeWidth={2}
                            />
                            <rect
                              x={1}
                              y={1}
                              width={Math.max(0, w - 2)}
                              height={Math.max(0, h - 2)}
                              rx={r}
                              ry={r}
                              fill="none"
                              stroke="rgba(255,255,255,0.95)"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeDasharray="6 7"
                              style={{ animation: 'inpaintDash 0.9s linear infinite' }}
                            />
                          </svg>
                        );
                      })()}

                      <div
                        className="absolute pointer-events-none"
                        style={{
                          left: `${galleryInpaint.rect.x * 100}%`,
                          top: `${galleryInpaint.rect.y * 100}%`,
                          transform: 'translateY(-110%)',
                        }}
                      >
                        <div className="inline-flex items-center rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-bold text-white shadow-sm">
                          {t.pg_main_area}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 pointer-events-none bg-black/35" />
                  )}

                  <div className="absolute left-1/2 bottom-5 -translate-x-1/2 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/60 px-3 py-2 shadow-lg shadow-black/40">
                    <button
                      type="button"
                      className="h-9 w-9 rounded-xl bg-white/10 text-white hover:bg-white/15 transition inline-flex items-center justify-center"
                      aria-label={t.pg_main_aria_select_tool}
                    >
                      <PencilLine className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setGalleryInpaint((prev) => ({ ...prev, rect: null, error: null }))}
                      disabled={galleryInpaint.isGenerating}
                      className="h-9 w-9 rounded-xl bg-white/10 text-white hover:bg-white/15 transition inline-flex items-center justify-center disabled:opacity-60"
                      aria-label={t.pg_main_aria_clear_selection}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="w-[380px] shrink-0 min-h-0 rounded-2xl bg-white text-zinc-900 border border-white/10 overflow-hidden flex flex-col">
              {galleryInpaint.step === 'compare' ? (
                <div className="p-6 flex flex-col min-h-0 flex-1">
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4 text-indigo-900">
                    <div className="text-sm font-extrabold">{t.pg_main_inpaint_done}</div>
                    <div className="mt-2 text-xs leading-relaxed text-indigo-700">
                      {t.pg_main_inpaint_select_version_hint}
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="text-xs font-bold text-zinc-500">{t.pg_main_inpaint_current_version}</div>
                    <div className="mt-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-indigo-600/10 flex items-center justify-center overflow-hidden">
                        <img
                          src={galleryInpaint.selectedCompare === 'edited' ? (galleryInpaint.resultUrl || galleryPreviewImageUrl) : galleryPreviewImageUrl}
                          alt={t.pg_main_aria_thumbnail}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-zinc-900">
                          {galleryInpaint.selectedCompare === 'edited' ? t.pg_main_inpaint_ai_edited_version : t.pg_main_inpaint_original_version}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          {galleryInpaint.selectedCompare === 'edited' ? t.pg_main_inpaint_one_result : t.pg_main_inpaint_keep_unmodified}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-800">
                    <div className="text-xs font-bold">{t.pg_main_tip}</div>
                    <div className="mt-2 text-xs leading-relaxed">
                      {t.pg_main_inpaint_tip_continue}
                    </div>
                  </div>

                  <div className="mt-auto pt-6 flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setGalleryInpaint((prev) => ({
                          ...prev,
                          step: 'edit',
                          rect: null,
                          isDragging: false,
                          dragStart: null,
                          error: null,
                          resultUrl: prev.selectedCompare === 'edited' ? prev.resultUrl : null,
                        }))
                      }
                      className="w-full rounded-xl border border-rose-400 bg-white px-4 py-3 text-sm font-extrabold text-rose-600 hover:bg-rose-50 transition"
                    >
                      {t.pg_main_btn_continue_editing}
                    </button>
                    <button
                      type="button"
                      disabled={galleryInpaint.selectedCompare === 'edited' && !galleryInpaint.resultUrl}
                      onClick={async () => {
                        if (galleryInpaint.selectedCompare === 'original') {
                          closeGalleryInpaint();
                          return;
                        }

                        if (!galleryInpaint.resultUrl) return;
                        try {
                          await applyGalleryPreviewOverwrite(galleryInpaint.resultUrl);
                          closeGalleryInpaint();
                        } catch (err: any) {
                          openGalleryAlert(String(err?.message || err || t.pg_main_error_apply_failed));
                        }
                      }}
                      className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-indigo-500 disabled:opacity-60 transition inline-flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      {galleryInpaint.selectedCompare === 'original' ? t.pg_main_btn_keep_original : t.pg_main_btn_apply_replace_original}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-6 flex flex-col min-h-0 flex-1">
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-extrabold text-zinc-900">{t.pi_gallery_inpaint_prompt_label}</div>
                      <button
                        type="button"
                        onClick={() => setGalleryInpaint((prev) => ({ ...prev, rect: null, error: null }))}
                        disabled={galleryInpaint.isGenerating}
                        className="text-xs font-bold text-zinc-500 hover:text-zinc-900 disabled:opacity-60 transition"
                      >
                        {t.pg_main_btn_clear_all_selection}
                      </button>
                    </div>

                    <textarea
                      value={galleryInpaint.prompt}
                      onChange={(e) => setGalleryInpaint((prev) => ({ ...prev, prompt: e.target.value }))}
                      placeholder={t.pi_gallery_inpaint_prompt_placeholder}
                      className="mt-3 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none focus:border-indigo-300 min-h-[140px] resize-none"
                    />

                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-800">
                      <div className="text-xs font-bold">{t.pg_main_tip}</div>
                      <div className="mt-2 text-xs leading-relaxed">
                        {t.pg_main_inpaint_prompt_hint}
                      </div>
                    </div>

                    {galleryInpaint.error ? <div className="mt-3 text-xs text-rose-600 font-bold">{galleryInpaint.error}</div> : null}
                  </div>

                  <div className="shrink-0 pt-6">
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <div>{t.pg_main_inpaint_per_image}</div>
                      <div className="font-bold text-indigo-600">{t.pg_main_inpaint_fast_mode}</div>
                    </div>

                    <button
                      type="button"
                      onClick={handleRunInpaint}
                      disabled={galleryInpaint.isGenerating || !galleryInpaint.rect || !String(galleryInpaint.prompt || '').trim()}
                      className="mt-3 grid w-full grid-cols-[1fr_auto_1fr] items-center rounded-2xl bg-indigo-600 px-4 py-4 text-base font-extrabold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-60"
                    >
                      <span aria-hidden="true" className="min-w-0" />
                      <span className="inline-flex min-w-0 items-center justify-center gap-2 justify-self-center text-center">
                        <Zap className="h-4 w-4 shrink-0" />
                        {galleryInpaint.isGenerating ? (t.pi_gallery_inpaint_generating) : t.pg_main_btn_start_editing}
                      </span>
                      <span className="justify-self-end self-center pr-0.5 text-right">
                        {!galleryInpaint.isGenerating && galleryInpaintEstimatedCost > 0 ? (
                          <span className="whitespace-nowrap text-[10px] font-semibold tabular-nums text-white/80">
                            {`-${formatCreditAmount(galleryInpaintEstimatedCost)} ${t.pg_main_v_points}`}
                          </span>
                        ) : null}
                      </span>
                    </button>

                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </AppDialog>

      <AppDialog
        isOpen={isTextSeparationHistoryPickerOpen}
        title={t.pg_main_dialog_choose_gallery_history_title}
        onClose={() => setIsTextSeparationHistoryPickerOpen(false)}
        widthClassName="max-w-6xl"
        footer={
          <button
            type="button"
            onClick={() => setIsTextSeparationHistoryPickerOpen(false)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition"
          >
            {t.pg_main_btn_close}
          </button>
        }
      >
        {galleryHistoryItems.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-zinc-500">
            {t.pg_main_no_gallery_history}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto pr-1">
            {galleryHistoryItems
              .slice()
              .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
              .flatMap((item) =>
                item.images.map((url, idx) => (
                  <div key={`${item.id}-${idx}`} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                    <button
                      type="button"
                      onClick={() => {
                        setIsTextSeparationHistoryPickerOpen(false);
                        selectTextSeparationSource(url, `${t.pg_main_history_image} ${item.createdAt}`, url);
                      }}
                      disabled={isTextSeparationLoading}
                      className="block w-full disabled:opacity-70"
                    >
                      <img src={url} alt={`${item.id}-${idx}`} className="aspect-square w-full object-cover" />
                    </button>
                    <div className="border-t border-white/10 px-3 py-3">
                      <div className="text-[11px] text-zinc-500">{item.createdAt}</div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => openGalleryImagePreview(url)}
                          className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:bg-zinc-800"
                        >
                          {t.pg_main_btn_preview}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsTextSeparationHistoryPickerOpen(false);
                            selectTextSeparationSource(url, `${t.pg_main_history_image} ${item.createdAt}`, url);
                          }}
                          disabled={isTextSeparationLoading}
                          className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-black transition hover:bg-orange-400 disabled:opacity-60"
                        >
                          {isTextSeparationLoading ? t.pg_main_processing : t.pg_main_text_separation_action}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
          </div>
        )}
      </AppDialog>

      <AppDialog
        isOpen={isGalleryBoardAssetPickerOpen}
        title="选择拼图图片"
        onClose={closeGalleryBoardAssetPicker}
        widthClassName="max-w-6xl"
        footer={
          <>
            <button
              type="button"
              onClick={closeGalleryBoardAssetPicker}
              className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-2 text-xs font-bold text-zinc-200 transition hover:bg-zinc-800"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={confirmGalleryBoardAssetPicker}
              className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-black transition hover:bg-orange-400"
            >
              进入模板编辑
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-zinc-400">已选 {galleryBoardSelectedAssetIds.length} / 9</div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs text-zinc-500">海报比例</div>
              {(['3:4', '1:1', '4:3', '2:3', '3:2', '16:9', '9:16'] as const).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setGalleryBoardCanvasRatio(ratio)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    galleryBoardCanvasRatio === ratio
                      ? 'border-orange-500/40 bg-orange-500/10 text-orange-200'
                      : 'border-white/10 bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={galleryBoardPickerUploadRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
                if (files.length < 1) return;
                appendGalleryBoardPickerAssets(
                  files.map((file, index) => ({
                    localId: `upload-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
                    requestId: file.name,
                    imageUrl: URL.createObjectURL(file),
                    source: 'upload',
                    layout: null,
                  }))
                );
                event.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => galleryBoardPickerUploadRef.current?.click()}
              className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:bg-zinc-800"
            >
              上传素材
            </button>
            <button
              type="button"
              onClick={() => setIsGalleryBoardLibraryPickerOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:bg-zinc-800"
            >
              <Folder className="h-3.5 w-3.5" />
              从素材库导入
            </button>
            <button
              type="button"
              onClick={() => setIsGalleryBoardHistoryPickerOpen(true)}
              className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:bg-zinc-800"
            >
              从历史记录导入
            </button>
          </div>

          <div className="grid max-h-[62vh] grid-cols-2 gap-3 overflow-y-auto pr-1 md:grid-cols-4">
            {galleryBoardCandidateAssets.map((asset) => {
              const checked = galleryBoardSelectedAssetSet.has(asset.localId);
              return (
                <button
                  key={asset.localId}
                  type="button"
                  onClick={() => toggleGalleryBoardSelectedAsset(asset.localId)}
                  className={`overflow-hidden rounded-2xl border text-left transition ${
                    checked ? 'border-orange-500/50 bg-orange-500/5' : 'border-white/10 bg-black/20 hover:bg-white/5'
                  }`}
                >
                  <div className="relative">
                    <img src={asset.imageUrl} alt={asset.requestId} className="aspect-square w-full object-cover" />
                    <div className="absolute right-2 top-2 rounded-full border border-white/10 bg-black/60 px-2 py-1 text-[10px] font-bold text-white">
                      {checked ? '已选中' : '点击选择'}
                    </div>
                  </div>
                  <div className="px-3 py-3">
                    <div className="truncate text-xs font-bold text-zinc-200">{asset.requestId}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">{asset.source || 'current'}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </AppDialog>

      <AppDialog
        isOpen={isGalleryBoardLibraryPickerOpen}
        title="从素材库导入"
        onClose={() => setIsGalleryBoardLibraryPickerOpen(false)}
        widthClassName="max-w-5xl"
        contentClassName="overflow-hidden"
        footer={
          <button
            type="button"
            onClick={() => setIsGalleryBoardLibraryPickerOpen(false)}
            className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-2 text-xs font-bold text-zinc-200 transition hover:bg-zinc-800"
          >
            关闭
          </button>
        }
      >
        <div className="flex h-[min(72vh,680px)] flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {([
                { value: 'product', label: '商品' },
                { value: 'scene', label: '场景' },
              ] as const).map((option) => {
                const active = galleryBoardLibraryAssetType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setGalleryBoardLibraryAssetType(option.value);
                      setGalleryBoardLibraryCurrentFolderId(null);
                    }}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      active
                        ? 'border-orange-500/40 bg-orange-500/10 text-orange-200'
                        : 'border-white/10 bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-zinc-500">
              <button
                type="button"
                onClick={() => setGalleryBoardLibraryCurrentFolderId(null)}
                className={`transition hover:text-zinc-200 ${galleryBoardLibraryCurrentFolderId === null ? 'text-zinc-200' : ''}`}
              >
                根目录
              </button>
              {galleryBoardLibraryBreadcrumb.map((folder: any) => (
                <React.Fragment key={folder.id}>
                  <span>/</span>
                  <button
                    type="button"
                    onClick={() => setGalleryBoardLibraryCurrentFolderId(folder.id)}
                    className={`max-w-[180px] truncate transition hover:text-zinc-200 ${
                      galleryBoardLibraryCurrentFolderId === folder.id ? 'text-zinc-200' : ''
                    }`}
                  >
                    {folder.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto custom-scroll pr-1">
            {galleryBoardLibraryLoading ? (
              <div className="flex h-56 items-center justify-center text-sm text-zinc-400">素材加载中...</div>
            ) : galleryBoardLibraryError ? (
              <div className="flex h-56 items-center justify-center text-sm text-red-300">
                {galleryBoardLibraryError}
              </div>
            ) : galleryBoardLibraryItems.length < 1 && galleryBoardLibraryFolders.length < 1 ? (
              <div className="flex h-56 items-center justify-center text-sm text-zinc-500">
                当前目录下暂无可用素材。
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {galleryBoardLibraryFolders.map((folder: any) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setGalleryBoardLibraryCurrentFolderId(folder.id)}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 text-center transition hover:border-orange-500/40 hover:bg-white/5"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900/80">
                      <Folder className="h-5 w-5 text-zinc-300" />
                    </div>
                    <div className="w-full truncate text-xs font-semibold text-zinc-200">{folder.name}</div>
                  </button>
                ))}

                {galleryBoardLibraryItems.map((asset: any) => {
                  const previewUrl = String(asset.thumbnail || asset.file_url || '').trim();
                  const localId = `library-${asset.type}-${asset.id}`;
                  const isImported = galleryBoardCandidateAssets.some((item) => item.localId === localId);
                  return (
                    <div
                      key={`${asset.type}-${asset.id}`}
                      className="flex flex-col rounded-2xl border border-white/10 bg-black/20 p-2.5"
                    >
                      <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/70">
                        {previewUrl ? (
                          <img src={previewUrl} alt={asset.name} className="aspect-[4/5] w-full object-cover" />
                        ) : (
                          <div className="flex aspect-[4/5] items-center justify-center text-xs text-zinc-500">
                            无预览
                          </div>
                        )}
                      </div>
                      <div className="mt-2 truncate text-xs font-semibold text-zinc-200">{asset.name || `asset-${asset.id}`}</div>
                      <div className="mt-1 text-[10px] text-zinc-500">{asset.type === 'scene' ? '场景素材' : '商品素材'}</div>
                      <button
                        type="button"
                        onClick={() => importGalleryBoardPickerLibraryAsset(asset)}
                        disabled={isImported}
                        className={`mt-3 rounded-xl px-3 py-2 text-[11px] font-semibold transition ${
                          isImported
                            ? 'cursor-default border border-white/10 bg-white/5 text-zinc-500'
                            : 'border border-orange-500/30 bg-orange-500/10 text-orange-200 hover:bg-orange-500/15'
                        }`}
                      >
                        {isImported ? '已导入' : '导入并选中'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </AppDialog>

      <AppDialog
        isOpen={isGalleryBoardHistoryPickerOpen}
        title="从历史记录导入"
        onClose={() => setIsGalleryBoardHistoryPickerOpen(false)}
        widthClassName="max-w-6xl"
        contentClassName="overflow-hidden"
        footer={
          <button
            type="button"
            onClick={() => setIsGalleryBoardHistoryPickerOpen(false)}
            className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-2 text-xs font-bold text-zinc-200 transition hover:bg-zinc-800"
          >
            关闭
          </button>
        }
      >
        <div className="min-h-[320px] max-h-[72vh] overflow-y-auto pr-1">
          {galleryHistoryItems.length < 1 ? (
            <div className="flex h-72 items-center justify-center text-sm text-zinc-500">
              暂无可导入的历史图片生成记录。
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {galleryHistoryItems
                .slice()
                .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
                .flatMap((item) =>
                  item.images.map((url, idx) => {
                    const localId = `history-${item.id}-${idx}`;
                    const isImported = galleryBoardCandidateAssets.some((asset) => asset.localId === localId);
                    return (
                      <div key={localId} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                        <button type="button" onClick={() => openGalleryImagePreview(url)} className="block w-full">
                          <img src={url} alt={localId} className="aspect-square w-full object-cover" />
                        </button>
                        <div className="border-t border-white/10 px-3 py-3">
                          <div className="text-[11px] text-zinc-500">{item.createdAt}</div>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => openGalleryImagePreview(url)}
                              className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                            >
                              预览
                            </button>
                            <button
                              type="button"
                              onClick={() => importGalleryBoardPickerHistoryAsset(item, url, idx)}
                              disabled={isImported}
                              className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                                isImported
                                  ? 'cursor-default border border-white/10 bg-white/5 text-zinc-500'
                                  : 'bg-orange-500 text-black hover:bg-orange-400'
                              }`}
                            >
                              {isImported ? '已导入' : '导入并选中'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
            </div>
          )}
        </div>
      </AppDialog>

      <AppDialog
        isOpen={isGalleryBoardEditorOpen}
        title={t.pg_main_dialog_board_editor_title}
        onClose={closeGalleryBoardEditor}
        widthClassName="max-w-[96rem]"
      >
        {isGalleryBoardEditorOpen ? (
          <GalleryBoardEditor
            assets={galleryBoardSessionAssets}
            historyItems={galleryHistoryItems}
            productName={galleryProductName}
            sellingPoints={gallerySellingPoints}
            initialCanvasRatio={galleryBoardCanvasRatio}
            initialTitle={galleryProductName}
            initialSubtitle={gallerySellingPoints.filter((item) => String(item || '').trim()).slice(0, 2).join(' / ')}
            initialLocalAssets={galleryBoardLocalAssets}
            initialDraft={galleryBoardDraft}
            onLocalAssetsChange={setGalleryBoardLocalAssets}
            onDraftChange={setGalleryBoardDraft}
            onAlert={openGalleryAlert}
          />
        ) : null}
      </AppDialog>


      <header className="relative z-50 flex justify-between gap-6 px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-zinc-100">
            <CurrentHeaderIcon className="h-6 w-6 shrink-0 text-zinc-100" />
            {currentHeader.title}
          </h1>

          <p className="mt-1 text-sm text-zinc-400">
            {currentHeader.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
      {currentValue === 'product_images_gallery' && (
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('vflow:open-product-gallery-guide'));
          }}
          className="px-3 py-2 rounded-xl text-xs font-bold transition border border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/15 inline-flex items-center gap-2"
          title={t.pg_img_guide_modal_title}
        >
          <Sparkles className="w-4 h-4" />
          {t.wb_guide_button_label}
        </button>
      )}
          <LanguageSwitcher />
          {currentValue === 'product_images_first_frame' && <div ref={setFirstFrameHeaderActionsContainer} className="flex items-center gap-3" />}
        </div>
      </header>

      <main
        className={
          currentValue === 'product_images_gallery'
            ? 'flex-1 overflow-hidden p-0'
            : 'flex-1 overflow-y-auto custom-scroll px-10 py-6'
        }
      >
        <div className={panelClassName('product_images_clothing_swap')}>
          <div className="rounded-2xl border border-white/5 bg-white/2 h-full flex items-center justify-center text-zinc-500">
            <div>{t.pg_main_clothing_swap_in_dev}</div>
          </div>
        </div>

        <div className={currentValue === 'product_images_first_frame' ? 'block h-full' : 'hidden'}>
          <FirstFrameView
            embedded
            isVisible={currentValue === 'product_images_first_frame'}
            headerActionsContainer={firstFrameHeaderActionsContainer}
            onApplyToWorkbench={() => setActiveView('workbench')}
          />
        </div>

        <div className={panelClassName('product_images_smart_repair')}>
          <SmartRepairView embedded />
        </div>

        <div className={panelClassName('product_images_text_separation')}>
          {textSeparationSession ? (
            <TextSeparationDemoView
              backgroundImageUrl={textSeparationSession.backgroundImageUrl}
              originalImageUrl={textSeparationSession.originalImageUrl}
              sampleTitle={textSeparationSession.sampleTitle}
              textBlocks={textSeparationSession.textBlocks}
              isZh={isZh}
              onBack={() => setTextSeparationSession(null)}
            />
          ) : (
              <div className="h-full flex flex-col gap-6 p-2">

                <div className="flex flex-1 min-h-0 gap-8">
                  <div className="w-[26%] min-w-[300px] max-w-[380px] flex flex-col gap-6">
                    <div className="space-y-6">
                      <input
                        ref={textSeparationFileInputRef}
                        type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        handleTextSeparationFileSelection(Array.from(e.target.files || []));
                        e.target.value = '';
                      }}
                      />

                    <div
                      className="relative"
                      onDragEnter={(e) => {
                        preventDragDefaults(e);
                        setIsTextSeparationDragActive(true);
                      }}
                      onDragOver={(e) => {
                        preventDragDefaults(e);
                        setIsTextSeparationDragActive(true);
                      }}
                      onDragLeave={(e) => {
                        preventDragDefaults(e);
                        setIsTextSeparationDragActive(false);
                      }}
                      onDrop={(e) => {
                        preventDragDefaults(e);
                        setIsTextSeparationDragActive(false);
                        handleTextSeparationFileSelection(Array.from(e.dataTransfer.files || []));
                      }}
                    >
                        {textSeparationUploadPreviewUrl ? (
                          <div className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">{t.pg_main_current_image_label}</div>
                                <div className="mt-1 truncate text-sm font-bold text-zinc-200">
                                  {textSeparationUploadName || t.pg_main_latest_upload}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => clearSelectedTextSeparationSource()}
                              disabled={isTextSeparationLoading}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition hover:border-red-500/30 hover:text-red-400 disabled:opacity-50"
                            >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <img
                              src={textSeparationUploadPreviewUrl}
                              alt={textSeparationUploadName || 'upload'}
                              className="aspect-auto max-h-[300px] w-full rounded-2xl border border-dashed border-white/15 bg-white/[0.03] object-cover"
                            />
                            <div className="mt-4 flex gap-3">
                              <button
                                type="button"
                                onClick={handleStartTextSeparation}
                              disabled={isTextSeparationLoading || !textSeparationSelectedImagePath}
                              className="flex-1 rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm font-bold text-orange-200 transition hover:bg-orange-500/20 disabled:border-white/10 disabled:bg-black/30 disabled:text-zinc-500"
                            >
                              <div className="flex items-center justify-center gap-2">
                                {isTextSeparationLoading ? t.pg_main_processing : t.pg_main_btn_start_text_separation}
                                {textSeparationEstimatedCost > 0 && !isTextSeparationLoading ? (
                                  <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">-{formatCreditAmount(textSeparationEstimatedCost)} V</span>
                                ) : null}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => openGalleryImagePreview(textSeparationUploadPreviewUrl)}
                              className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:bg-white/[0.04]"
                            >
                              {t.pg_main_btn_view}
                            </button>
                          </div>
                        </div>
                      ) : (
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={() => textSeparationFileInputRef.current?.click()}
                            disabled={isTextSeparationLoading}
                              className={`flex aspect-[16/10] w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 transition ${
                                isTextSeparationDragActive
                                    ? 'border-orange-500 bg-white/[0.05]'
                                    : 'border-white/15 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.05]'
                              }`}
                            >
                                <Upload className={`mb-4 h-8 w-8 ${isTextSeparationDragActive ? 'text-orange-400' : 'text-zinc-400'}`} />
                              <div className="text-[15px] font-bold text-zinc-200">{t.pg_main_choose_poster_image}</div>
                              <div className="mt-2 text-[11px] uppercase tracking-widest text-zinc-500">JPG, PNG, WEBP (MAX 10MB)</div>
                            </button>
                          <button
                            type="button"
                            onClick={() => setIsTextSeparationHistoryPickerOpen(true)}
                            disabled={isTextSeparationLoading}
                              className="w-full rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-3.5 text-[15px] font-bold text-zinc-400 transition hover:border-white/30 hover:bg-white/[0.05] hover:text-zinc-200 disabled:opacity-50"
                            >
                            {t.pg_main_btn_choose_from_history}
                          </button>
                        </div>
                      )}
                    </div>
                    </div>
                  </div>

                  <div className="flex flex-1 min-w-0 flex-col">
                    <div className="mb-4 flex items-center gap-2 text-zinc-400">
                      <LayoutGrid className="h-4 w-4" />
                      <div className="text-base font-bold">{t.pg_main_generation_records}</div>
                    </div>

                    <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-6">
                      {textSeparationRecords.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center gap-3 opacity-40">
                          <Plus className="h-5 w-5 text-zinc-500" />
                          <p className="text-sm font-medium italic tracking-wide text-zinc-500">{t.pg_main_no_generation_records}</p>
                        </div>
                      ) : (
                          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                          {textSeparationRecords.map((item) => (
                            <button
                              type="button"
                              key={item.id}
                              onClick={() => openTextSeparationHistoryItem(item)}
                              disabled={item.status !== 'succeeded'}
                                className="group/card relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/20 text-left shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition-all duration-300 hover:-translate-y-1 hover:border-orange-500/40 hover:bg-zinc-900/40 hover:shadow-[0_12px_28px_rgba(0,0,0,0.18)] disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
                              >
                                <div className="relative aspect-[5/4] overflow-hidden rounded-t-xl bg-black/20">
                                  <img
                                    src={item.originalImageUrl}
                                    alt={item.sampleTitle}
                                    className={`h-full w-full object-cover transition-all duration-500 ${item.status === 'processing' ? 'opacity-40 blur-[2px]' : 'opacity-90 group-hover/card:scale-[1.03] group-hover/card:opacity-100'}`}
                                  />
                              {item.status === 'processing' ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                                  <div className="w-full max-w-[120px] space-y-2">
                                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter text-orange-400">
                                      <span>Processing</span>
                                      <span>{Math.round(item.progress)}%</span>
                                    </div>
                                    <div className="h-1 overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10">
                                      <div
                                        className="h-full bg-orange-500 transition-all duration-500"
                                        style={{ width: `${Math.max(6, item.progress)}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                                <div className="flex items-center justify-between gap-3 px-3 py-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-bold text-zinc-200 transition-colors group-hover/card:text-orange-200">{item.sampleTitle}</div>
                                  <div className="mt-1 text-xs font-medium uppercase italic tracking-tighter text-zinc-500">{item.createdAt}</div>
                                </div>
                                <div className={`shrink-0 rounded px-2 py-0.5 text-xs font-black uppercase tracking-widest ${item.status === 'processing' ? 'bg-orange-400/10 text-orange-400' : 'bg-emerald-400/10 text-emerald-400'}`}>
                                  {item.status === 'processing' ? t.pg_main_status_wait : t.pg_main_status_done}
                                </div>
                              </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-6">
                  <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                    <div className="max-w-xl">
                      <div className="mb-3 inline-block border border-white/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-zinc-400">Workflow</div>
                      <h2 className="text-lg font-bold tracking-tight text-zinc-100">{t.pg_main_quick_guide_title}</h2>
                      <p className="mt-1 text-sm italic text-zinc-500">
                        {t.pg_main_quick_guide_subtitle}
                      </p>
                    </div>
                  </div>

                    <div className="grid gap-8 lg:grid-cols-3">
                  {[
                    {
                      step: '01',
                      title: t.pg_main_guide_step1_title,
                      img: '/ai-poster-editor-guide/origin.jpeg',
                      desc: t.pg_main_guide_step1_desc,
                    },
                    {
                      step: '02',
                      title: t.pg_main_guide_step2_title,
                      img: '/ai-poster-editor-guide/edited.png',
                      desc: t.pg_main_guide_step2_desc,
                    },
                    {
                      step: '03',
                      title: t.pg_main_guide_step3_title,
                      img: '/ai-poster-editor-guide/repainted.jpeg',
                      desc: t.pg_main_guide_step3_desc,
                    },
                      ].map((card) => (
                        <div key={card.step} className="space-y-5">
                          <div className="mx-auto w-[88%] overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                            <img src={card.img} alt={card.title} className="block h-auto w-full opacity-90" />
                          </div>
                          <div className="mx-auto w-[88%]">
                            <div className="mb-2 text-sm font-black uppercase tracking-[0.3em] text-orange-600">{card.step}</div>
                            <div className="mb-2 text-sm font-bold text-zinc-200">{card.title}</div>
                            <p className="text-sm font-medium leading-relaxed text-zinc-500">{card.desc}</p>
                          </div>
                        </div>
                      ))}
                  </div>
              </div>
            </div>
          )}
        </div>

        <ImagesGalleryView
          panelClassName={panelClassName}
          t={t}
          galleryFileInputRef={galleryFileInputRef}
          galleryImages={galleryImages}
          galleryPreviewUrls={galleryPreviewUrls}
          galleryRestoredImagePaths={galleryRestoredImagePaths}
          isGalleryDragActive={isGalleryDragActive}
          setIsGalleryDragActive={setIsGalleryDragActive}
          setGalleryRestoredImagePaths={setGalleryRestoredImagePaths}
          appendGalleryFiles={appendGalleryFiles}
          setGalleryImages={setGalleryImages}
          handleGalleryAiAnalyze={handleGalleryAiAnalyze}
          isGalleryAnalyzing={isGalleryAnalyzing}
          galleryProductName={galleryProductName}
          setGalleryProductName={setGalleryProductName}
          galleryCategory={galleryCategory}
          setGalleryCategory={setGalleryCategory}
          gallerySellingPoints={gallerySellingPoints}
          setGallerySellingPoints={setGallerySellingPoints}
          hotStyleLoading={hotStyleLoading}
          hotStyleItems={hotStyleItems}
          hotStyleSelectedIndex={hotStyleSelectedIndex}
          setHotStyleSelectedIndex={setHotStyleSelectedIndex}
          hotStyleError={hotStyleError}
          handleHotStyleAnalyze={handleHotStyleAnalyze}
          galleryModelCards={galleryModelCards}
          setGalleryModelCards={setGalleryModelCards}
          addGalleryModelCard={addGalleryModelCard}
          removeGalleryModelCard={removeGalleryModelCard}
          clearGalleryModelCardImage={clearGalleryModelCardImage}
          handleGalleryModelCardFileSelection={handleGalleryModelCardFileSelection}
          galleryTargetScene={galleryTargetScene}
          setGalleryTargetScene={setGalleryTargetScene}
          galleryStyle={galleryStyle}
          setGalleryStyle={setGalleryStyle}
          galleryCopyLanguage={galleryCopyLanguage}
          setGalleryCopyLanguage={setGalleryCopyLanguage}
          GALLERY_COPY_LANGUAGE_OPTIONS={GALLERY_COPY_LANGUAGE_OPTIONS}
          GALLERY_SCENE_PRESETS={GALLERY_SCENE_PRESETS}
          gallerySceneCards={gallerySceneCards}
          setGallerySceneCards={setGallerySceneCards}
          addGallerySceneCard={addGallerySceneCard}
          removeGallerySceneCard={removeGallerySceneCard}
          applyGalleryScenePresetToCard={applyGalleryScenePresetToCard}
          galleryResourceGuide={galleryResourceGuide}
          guideGalleryResourceSection={guideGalleryResourceSection}
          galleryBulkConfig={galleryBulkConfig}
          setGalleryBulkConfig={setGalleryBulkConfig}
          handleApplyGalleryBulkConfig={handleApplyGalleryBulkConfig}
          galleryAdvancedDirty={galleryAdvancedDirty}
          isGalleryAdvancedEditingCollapsed={isGalleryAdvancedEditingCollapsed}
          setIsGalleryAdvancedEditingCollapsed={setIsGalleryAdvancedEditingCollapsed}
          markGalleryAdvancedDirty={markGalleryAdvancedDirty}
          galleryOutputMode={galleryOutputMode}
          galleryOutputItems={galleryOutputItems}
          setGalleryOutputItems={setGalleryOutputItems}
          galleryPreviewAspectRatio={galleryPreviewAspectRatio}
          openGalleryAiOutputPlanner={openGalleryAiOutputPlanner}
          handleGalleryGenerate={handleGalleryGenerate}
          isGalleryGenerating={isGalleryGenerating}
          galleryEstimatedCost={galleryEstimatedCost}
          galleryRightPanel={galleryRightPanel}
          setGalleryRightPanel={setGalleryRightPanel}
          setIsGalleryHistoryManaging={setIsGalleryHistoryManaging}
          setGalleryHistorySelectedKeys={setGalleryHistorySelectedKeys}
          openGalleryBoardEditor={openGalleryBoardEditor}
          galleryPreviewItems={galleryPreviewItems}
          openGalleryImagePreview={openGalleryImagePreview}
          galleryHistoryItems={galleryHistoryItems}
          galleryLoadingTheme={galleryLoadingTheme}
          galleryLoadingBackgroundSrc={galleryLoadingBackgroundSrc}
          preventDragDefaults={preventDragDefaults}
        />
      </main>
    </div>
  );
};

export default ProductImagesView;
