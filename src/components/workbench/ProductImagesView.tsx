import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Eye, Image as ImageIcon, Plus, Upload, X, Wand2, Minus, Sparkles, RotateCw, Download, FileDown, ChevronLeft, ChevronRight, LayoutGrid, ArrowLeft, PencilLine, Trash2, Zap, Check } from 'lucide-react';
import type { ViewType } from './types';
import { useLanguage } from '../../context/LanguageContext';
import { DropdownSelect, type DropdownSelectOption } from '../common/DropdownSelect';
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
import { useRequireAuth } from '../../utils/useRequireAuth';

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
    layout?: string;
    copy?: {
      headline?: string;
      subheadline?: string;
      body?: string;
      bulletPoints?: string[];
    };
    notes?: string;
  }>;
  sceneConfig?: GallerySceneConfig;
  uploadedImagePaths?: string[];
  modelInfo?: string;
  modelImagePath?: string;
};

type GallerySceneConfig = {
  sceneTheme: string;
  sceneDescription: string;
  sceneProps: string;
  lighting: string;
  mood: string;
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

type GalleryOutputMode = 'custom' | 'ai';
type GalleryOutputItem = {
  id: string;
  enabled: boolean;
  outputType: GalleryOutputType;
  aspectRatio: string;
  resolution: '1k' | '2k' | '4k';
  count: number;
  title?: string;
  layout?: string;
  copy?: {
    headline?: string;
    subheadline?: string;
    body?: string;
    bulletPoints?: string[];
  };
  notes?: string;
  prompt?: string;
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

const createDefaultGalleryOutputItem = (): GalleryOutputItem => ({
  id: createGalleryOutputItemId(),
  enabled: true,
  outputType: 'white_bg',
  aspectRatio: '1:1',
  resolution: '1k',
  count: 4,
});

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
  const tr = (zhText: string, enText: string) => (isZh ? zhText : enText);
  const tx = (key: string, fallback: string) => ((t as any)[key] as string) || fallback;
  const isProductView =
    activeView === 'product_images_clothing_swap' ||
    activeView === 'product_images_first_frame' ||
    activeView === 'product_images_smart_repair' ||
    activeView === 'product_images_gallery' ||
    activeView === 'product_images_text_separation';

  const currentValue: ViewType = isProductView ? activeView : 'product_images_first_frame';
  const panelClassName = (view: ViewType) => (currentValue === view ? 'block' : 'hidden');
  const [firstFrameHeaderActionsContainer, setFirstFrameHeaderActionsContainer] = useState<HTMLDivElement | null>(null);

  const productToolOptions = useMemo<DropdownSelectOption[]>(
    () => [
      {
        value: 'product_images_clothing_swap',
        label: tx('wb_nav_product_clothing_swap', tr('AI 换装', 'AI Clothing Swap')),
      },
      {
        value: 'product_images_first_frame',
        label: tx('wb_nav_product_first_frame', tr('AI 首帧图', 'AI First Frame')),
      },
      {
        value: 'product_images_smart_repair',
        label: tx('wb_nav_product_smart_repair', tr('AI 智能修复', 'AI Smart Repair')),
      },
      {
        value: 'product_images_gallery',
        label: tx('wb_nav_product_gallery', tr('AI 商品套图', 'AI Product Gallery')),
      },
      {
        value: 'product_images_text_separation',
        label: tx('wb_nav_product_text_separation', tr('文本分离', 'Text Separation')),
      },
    ],
    [t, isZh]
  );

  const [isProductToolMenuOpen, setIsProductToolMenuOpen] = useState(false);
  const productToolMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isProductToolMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (productToolMenuRef.current && !productToolMenuRef.current.contains(event.target as Node)) {
        setIsProductToolMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProductToolMenuOpen]);

  useEffect(() => {
    setIsProductToolMenuOpen(false);
  }, [currentValue]);

  const currentHeader = useMemo(() => {
    switch (currentValue) {
      case 'product_images_clothing_swap':
        return {
          title: tr('AI 换装', 'AI Clothing Swap'),
          subtitle: tr('商品服饰智能换装功能开发中', 'AI clothing swap is currently in development.'),
        };
      case 'product_images_smart_repair':
        return {
          title: tr('AI 智能修复', 'AI Smart Repair'),
          subtitle: tr('基于三类能力中心进行可扩展的智能修图', 'Extensible smart-retouch workspace with three capability groups'),
        };
      case 'product_images_gallery':
        return {
          title: tr('商品套图', 'Product Gallery'),
          subtitle: tr('围绕商品信息与场景配置批量生成电商图', 'Generate e-commerce image sets from product info and scene settings'),
        };
      case 'product_images_text_separation':
        return {
          title: tr('文本分离', 'Text Separation'),
          subtitle: tr('上传海报，或复用商品套图历史图片，可生成去字底图和可编辑文本框', 'Upload a poster or reuse Product Gallery history to extract text and generate a clean background'),
        };
      case 'product_images_first_frame':
      default:
        return {
          title: t.ff_page_title || tr('AI 首帧图生成', 'AI First Frame Generation'),
          subtitle: t.ff_page_subtitle || tr('为视频生成提供起始视觉素材', 'Create starting visuals for video generation'),
        };
    }
  }, [currentValue, t, isZh]);

  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [galleryProductName, setGalleryProductName] = useState('');
  const [galleryCategory, setGalleryCategory] = useState('');
  const [gallerySellingPoints, setGallerySellingPoints] = useState<string[]>([]);
  const [galleryTargetScene, setGalleryTargetScene] = useState<'detail' | 'xiaohongshu' | 'douyin' | 'poster' | 'ads'>('detail');
  const [galleryStyle, setGalleryStyle] = useState<'ecom_clean' | 'lifestyle' | 'premium' | 'festival'>('ecom_clean');
  const [galleryScenePresetId, setGalleryScenePresetId] = useState<string>('');
  const [gallerySceneTheme, setGallerySceneTheme] = useState<string>('');
  const [gallerySceneDescription, setGallerySceneDescription] = useState<string>('');
  const [gallerySceneProps, setGallerySceneProps] = useState<string>('');
  const [gallerySceneLighting, setGallerySceneLighting] = useState<string>('');
  const [gallerySceneMood, setGallerySceneMood] = useState<string>('');
  const [galleryOutputMode, setGalleryOutputMode] = useState<GalleryOutputMode>('custom');
  const [galleryOutputItems, setGalleryOutputItems] = useState<GalleryOutputItem[]>(() => [createDefaultGalleryOutputItem()]);
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
  const [isGalleryBoardEditorOpen, setIsGalleryBoardEditorOpen] = useState(false);
  const [galleryBoardLocalAssets, setGalleryBoardLocalAssets] = useState<GalleryBoardAsset[]>([]);
  const [galleryBoardDraft, setGalleryBoardDraft] = useState<GalleryBoardDraft | null>(null);
  const [galleryTextEditor, setGalleryTextEditor] = useState<{ open: boolean; localId: string; imageUrl: string; layout: any } | null>(null);
  const [galleryTextDraftLayout, setGalleryTextDraftLayout] = useState<any | null>(null);
  const [isGalleryTextExporting, setIsGalleryTextExporting] = useState(false);
  const galleryBoardLocalAssetUrlsRef = useRef<string[]>([]);
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

  const [isGalleryModelInfoOpen, setIsGalleryModelInfoOpen] = useState(false);
  const [galleryModelInfo, setGalleryModelInfo] = useState('');
  const [galleryModelImageFile, setGalleryModelImageFile] = useState<File | null>(null);
  const [galleryModelImagePreviewUrl, setGalleryModelImagePreviewUrl] = useState<string | null>(null);
  const [galleryModelImagePath, setGalleryModelImagePath] = useState<string>('');
  const galleryModelFileInputRef = useRef<HTMLInputElement | null>(null);
  const [imageModelRates, setImageModelRates] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!galleryModelImageFile) {
      setGalleryModelImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(galleryModelImageFile);
    setGalleryModelImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [galleryModelImageFile]);

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

  const textSeparationEstimatedCost = useMemo(() => {
    const rate = Number(imageModelRates['gemini-3-pro-image-preview'] || 0);
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return Math.max(0, Math.round(rate));
  }, [imageModelRates]);

  const galleryPlannedImageCount = useMemo(() => {
    return galleryOutputItems
      .filter((item) => item.enabled)
      .reduce((sum, item) => sum + Math.max(0, Math.round(Number(item.count || 0))), 0);
  }, [galleryOutputItems]);

  const galleryEstimatedCost = useMemo(() => {
    const rate = Number(imageModelRates['gemini-3-pro-image-preview'] || 0);
    if (!Number.isFinite(rate) || rate <= 0 || galleryPlannedImageCount <= 0) return 0;
    return Math.max(0, Math.round(rate * galleryPlannedImageCount));
  }, [imageModelRates, galleryPlannedImageCount]);

  const galleryInpaintEstimatedCost = useMemo(() => {
    const rate = Number(imageModelRates['gemini-3-pro-image-preview'] || 0);
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return Math.max(0, Math.round(rate));
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
          localId: item.localId,
          requestId: item.requestId,
          imageUrl: String(item.imageUrl || '').trim(),
          layout: item.layout,
        })),
    [galleryPreviewItems]
  );
  const galleryPollAbortRef = useRef(false);
  const galleryPollRunIdRef = useRef<number>(0);

  const closeGalleryAlert = () => setGalleryAlert((prev) => ({ ...prev, open: false }));
  const openGalleryAlert = (message: string, title?: string) =>
    setGalleryAlert({
      open: true,
      title: title || tr('提示', 'Notice'),
      message,
    });

  const applyGalleryScenePreset = (presetId: string) => {
    setGalleryScenePresetId(presetId);
    const preset = GALLERY_SCENE_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setGallerySceneTheme(preset.sceneTheme);
    setGallerySceneDescription(preset.sceneDescription);
    setGallerySceneProps(preset.sceneProps);
    setGallerySceneLighting(preset.lighting);
    setGallerySceneMood(preset.mood);
  };

  const clearGallerySceneConfig = () => {
    setGalleryScenePresetId('');
    setGallerySceneTheme('');
    setGallerySceneDescription('');
    setGallerySceneProps('');
    setGallerySceneLighting('');
    setGallerySceneMood('');
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
    galleryBoardLocalAssetUrlsRef.current = galleryBoardLocalAssets
      .map((item) => String(item.imageUrl || ''))
      .filter((url) => url.startsWith('blob:'));
  }, [galleryBoardLocalAssets]);

  useEffect(() => {
    return () => {
      galleryBoardLocalAssetUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
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
    setIsGalleryBoardEditorOpen(true);
  };

  const closeGalleryBoardEditor = () => {
    setIsGalleryBoardEditorOpen(false);
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
      downloadBlob(blob, buildGalleryPreviewFilename(galleryPreviewImageUrl));
      setGalleryToastMessage(tr('已开始下载', 'Download started'));
    } catch (err: any) {
      openGalleryAlert(String(err?.message || tr('下载失败，请重试。', 'Download failed. Please try again.')));
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
      setGalleryToastMessage(tr('已开始下载', 'Download started'));
    } catch (err: any) {
      openGalleryAlert(String(err?.message || tr('下载失败，请重试。', 'Download failed. Please try again.')));
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
        openGalleryAlert(tr('浏览器阻止了弹窗，请允许弹窗后重试。', 'Popup blocked by browser. Please allow popups and try again.'));
        return;
      }

      const title = tr('导出为PDF', 'Export as PDF');
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
      openGalleryAlert(String(err?.message || tr('导出失败，请重试。', 'Export failed. Please try again.')));
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
      setGalleryInpaint((prev) => ({ ...prev, error: tr('请先框选要修改的区域', 'Please select an area to edit') }));
      return;
    }

    const img = galleryInpaintImgRef.current;
    const box = galleryInpaintBoxRef.current;
    if (!img || !box || !img.naturalWidth || !img.naturalHeight) {
      setGalleryInpaint((prev) => ({ ...prev, error: tr('图片未加载完成', 'Image not ready') }));
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
      setGalleryInpaint((prev) => ({ ...prev, error: tr('请填写修改指令', 'Please enter an edit instruction') }));
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
      if (!requestId) throw new Error(tr('创建任务失败', 'Failed to create task'));

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
        throw new Error(tr('生成失败，请重试。', 'Generation failed. Please try again.'));
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
      openGalleryAlert(String(err?.message || tr('打开文本分离失败', 'Failed to open text separation')));
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
      sampleTitle: String(item.metadata?.sampleTitle || tr('未命名图片', 'Untitled image')).trim(),
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
      openGalleryAlert(String(err?.message || tr('打开文本分离失败', 'Failed to open text separation')));
      return null;
    } finally {
      setIsTextSeparationLoading(false);
    }
  };

  const handleStartTextSeparation = async () => {
    if (!textSeparationSelectedImagePath || isTextSeparationLoading || !textSeparationUploadPreviewUrl) return;
    const recordId = `ts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sampleTitle = textSeparationUploadName || tr('未命名图片', 'Untitled image');
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
        throw new Error(tr('上传成功但未返回图片路径', 'Upload succeeded but no image path was returned'));
      }
      setTextSeparationSelectedImagePath(imagePath);
      setTextSeparationSelectedOriginalUrl(originalUrl || objectUrl);
    } catch (err: any) {
      openGalleryAlert(String(err?.message || tr('上传图片失败', 'Failed to upload image')));
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
      tr('确定删除选中的图片吗？', 'Delete selected images?'),
      {
        title: tr('删除确认', 'Delete confirmation'),
        okLabel: tr('删除', 'Delete'),
        cancelLabel: tr('取消', 'Cancel'),
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
        title: opts?.title || tr('确认', 'Confirm'),
        message,
        okLabel: opts?.okLabel || tr('确定', 'OK'),
        cancelLabel: opts?.cancelLabel || tr('取消', 'Cancel'),
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
      if (s.targetScene) setGalleryTargetScene(s.targetScene);
      if (s.style) setGalleryStyle(s.style);
      if (s.copyLanguage) setGalleryCopyLanguage(String(s.copyLanguage));
      if (s.productName) setGalleryProductName(s.productName);
      if (s.productCategory) setGalleryCategory(s.productCategory);
      if (Array.isArray(s.sellingPoints) && s.sellingPoints.length > 0) setGallerySellingPoints(s.sellingPoints);
      if (s.outputMode === 'custom' || s.outputMode === 'ai') setGalleryOutputMode(s.outputMode);
      if (Array.isArray(s.outputItems) && s.outputItems.length > 0) {
        const restoredItems: GalleryOutputItem[] = s.outputItems
          .map((row: any) => {
            const outputType = String(row?.outputType || '').trim() as GalleryOutputType;
            if (!GALLERY_OUTPUT_TYPE_ORDER.includes(outputType)) return null;
            const aspectRatio = String(row?.aspectRatio || '1:1').trim() || '1:1';
            const resolution = String(row?.resolution || '1k').trim().toLowerCase();
            const normalizedResolution = resolution === '2k' || resolution === '4k' ? resolution : '1k';
            const count = Math.max(0, Math.round(Number(row?.count || 0)));
            return {
              id: String(row?.id || createGalleryOutputItemId()),
              enabled: Boolean(row?.enabled ?? true),
              outputType,
              aspectRatio,
              resolution: normalizedResolution as any,
              count,
              title: typeof row?.title === 'string' ? row.title : undefined,
              layout: typeof row?.layout === 'string' ? row.layout : undefined,
              copy: row?.copy && typeof row.copy === 'object' ? row.copy : undefined,
              notes: typeof row?.notes === 'string' ? row.notes : undefined,
              prompt: typeof row?.prompt === 'string' ? row.prompt : undefined,
            } satisfies GalleryOutputItem;
          })
          .filter(Boolean) as GalleryOutputItem[];
        if (restoredItems.length > 0) {
          setGalleryOutputItems(restoredItems);
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
            });
          }
          if (items.length > 0) setGalleryOutputItems(items);
        }
      }
      if (s.sceneConfig && typeof s.sceneConfig === 'object') {
        setGalleryScenePresetId('');
        setGallerySceneTheme(String(s.sceneConfig.sceneTheme || ''));
        setGallerySceneDescription(String(s.sceneConfig.sceneDescription || ''));
        setGallerySceneProps(String(s.sceneConfig.sceneProps || ''));
        setGallerySceneLighting(String(s.sceneConfig.lighting || ''));
        setGallerySceneMood(String(s.sceneConfig.mood || ''));
      }
      // Restore backend image paths so generation can skip the upload step
      if (Array.isArray(s.uploadedImagePaths) && s.uploadedImagePaths.length > 0) {
        const paths = s.uploadedImagePaths.map((p: any) => String(p || '').trim()).filter(Boolean);
        setGalleryRestoredImagePaths(paths);
      }

      const restoredModelInfo = String(s.modelInfo || '').trim();
      const restoredModelImagePath = String(s.modelImagePath || '').trim();
      if (restoredModelInfo) setGalleryModelInfo(restoredModelInfo);
      if (restoredModelImagePath) setGalleryModelImagePath(restoredModelImagePath);
      if (restoredModelInfo || restoredModelImagePath) setIsGalleryModelInfoOpen(true);
      setGalleryModelImageFile(null);

      // Switch right-panel to preview so user sees the form ready to generate
      setGalleryRightPanel('preview');
    } catch { /* ignore */ }
  }, [activeView]);

  const gallerySupportedFormatTip = tr(
    '文件格式不支持，仅支持图片：.jpg .jpeg .png .webp',
    'Unsupported file format. Only images are supported: .jpg .jpeg .png .webp'
  );

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

  const handleGalleryModelFileSelection = (picked: File[]) => {
    const file = picked[0];
    if (!file) return;
    if (!isSupportedGalleryImageFile(file)) {
      openGalleryAlert(gallerySupportedFormatTip);
      return;
    }
    setGalleryModelImageFile(file);
    setGalleryModelImagePath('');
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
      openGalleryAlert(tr('没有可编辑版式，请先生成爆款风格并填写卖点后再生成套图。', 'No editable layout. Fill selling points and generate styles, then generate gallery again.'));
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
      if (!resp.ok) throw new Error(tr('下载背景图失败', 'Failed to download background'));
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);

      const img = new Image();
      const imgLoaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(tr('加载背景图失败', 'Failed to load background')));
      });
      img.src = objUrl;
      await imgLoaded;

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(tr('导出失败', 'Export failed'));

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
      if (!outBlob) throw new Error(tr('导出失败', 'Export failed'));
      const outUrl = URL.createObjectURL(outBlob);
      const a = document.createElement('a');
      a.href = outUrl;
      a.download = `product_gallery_edit_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(outUrl);
      URL.revokeObjectURL(objUrl);
    } catch (err: any) {
      openGalleryAlert(String(err?.message || err || tr('导出失败', 'Export failed')));
    } finally {
      setIsGalleryTextExporting(false);
    }
  };

  const handleHotStyleAnalyze = async () => {
    if (!gallerySellingPoints.some((p) => String(p || '').trim())) {
      openGalleryAlert(tr('请先填写核心卖点', 'Please fill selling points first'));
      return;
    }
    if (galleryImages.length === 0) {
      openGalleryAlert(tr('请先上传至少 1 张商品图片。', 'Please upload at least 1 product image.'));
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
      if (imagePaths.length === 0) throw new Error(tr('图片上传失败', 'Image upload failed'));

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

      if (styles.length === 0) throw new Error(tr('AI 返回格式不正确', 'AI response invalid'));
      setHotStyleItems(styles);
      setHotStyleSelectedIndex(null);
    } catch (err: any) {
      const msg = String(err?.message || err || tr('分析失败，请重试。', 'Analysis failed')).trim();
      setHotStyleError(msg);
      openGalleryAlert(msg, tr('分析失败', 'Analysis Failed'));
    } finally {
      setHotStyleLoading(false);
    }
  };



  const handleGalleryAiAnalyze = async () => {
    if (isGalleryAnalyzing) return;

    const hasNewImages = galleryImages.length > 0;
    const hasRestoredPaths = galleryRestoredImagePaths.length > 0;

    if (!hasNewImages && !hasRestoredPaths) {
      openGalleryAlert(tr('请先上传至少 1 张商品图片。', 'Please upload at least 1 product image.'));
      return;
    }

    const hasExisting = Boolean(
      galleryProductName.trim() ||
      galleryCategory.trim() ||
      gallerySellingPoints.some((p) => String(p || '').trim())
    );

    if (hasExisting) {
      const action = await openGalleryConfirm(
        tr('是否使用新的识别结果覆盖当前内容？', 'Overwrite current fields with new AI results?'),
        {
          title: tr('覆盖确认', 'Overwrite confirmation'),
          okLabel: tr('覆盖', 'Overwrite'),
          cancelLabel: tr('取消', 'Cancel'),
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
        throw new Error(tr('图片上传失败，请重试。', 'Image upload failed. Please try again.'));
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
        : String(rawMsg || tr('识别失败，请重试。', 'Recognition failed. Please try again.'));

      openGalleryAlert(message, tr('识别失败', 'Recognition failed'));
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

  const handleGenerateAiOutputPlan = async () => {
    if (galleryAiOutputPlanner.isGenerating) return;

    const userPrompt = String(galleryAiOutputPlanner.prompt || '').trim();
    setGalleryAiOutputPlanner((prev) => ({ ...prev, isGenerating: true, error: null }));
    try {
      const hasNewImages = galleryImages.length > 0;
      const hasRestoredPaths = galleryRestoredImagePaths.length > 0;

      const sceneConfig: GallerySceneConfig = {
        sceneTheme: String(gallerySceneTheme || '').trim(),
        sceneDescription: String(gallerySceneDescription || '').trim(),
        sceneProps: String(gallerySceneProps || '').trim(),
        lighting: String(gallerySceneLighting || '').trim(),
        mood: String(gallerySceneMood || '').trim(),
      };
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
        model_image_path: String(galleryModelImagePath || '').trim() || undefined,
        model_info: String(galleryModelInfo || '').trim() || undefined,
      });
      const data = (planResp as any)?.data || planResp;
      const rawItems = Array.isArray(data?.items) ? data.items : [];
      if (rawItems.length === 0) throw new Error(tr('AI 未返回可用方案条目', 'AI returned no usable items'));

      const items: GalleryOutputItem[] = rawItems
        .map((row: any) => {
          const outputType = normalizeAiOutputType(row?.outputType ?? row?.output_type ?? row?.type);
          if (!outputType) return null;
          const count = Math.max(1, Math.min(8, Math.round(Number(row?.count ?? 1))));
          return {
            id: createGalleryOutputItemId(),
            enabled: Boolean(row?.enabled ?? true),
            outputType,
            aspectRatio: normalizeAiAspectRatio(row?.aspectRatio ?? row?.aspect_ratio),
            resolution: normalizeAiResolution(row?.resolution),
            count,
            title: typeof row?.title === 'string' ? row.title : undefined,
            layout: typeof row?.layout === 'string' ? row.layout : undefined,
            copy: row?.copy && typeof row.copy === 'object'
              ? {
                  headline: typeof row.copy.headline === 'string' ? row.copy.headline : undefined,
                  subheadline: typeof row.copy.subheadline === 'string' ? row.copy.subheadline : undefined,
                  body: typeof row.copy.body === 'string' ? row.copy.body : undefined,
                  bulletPoints: Array.isArray(row.copy.bulletPoints) ? row.copy.bulletPoints.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 6) : undefined,
                }
              : undefined,
            notes: typeof row?.notes === 'string' ? row.notes : undefined,
            prompt: typeof row?.prompt === 'string' ? row.prompt : undefined,
          } satisfies GalleryOutputItem;
        })
        .filter(Boolean) as GalleryOutputItem[];

      const total = items.filter((it) => it.enabled).reduce((sum, it) => sum + Math.max(0, Math.round(Number(it.count || 0))), 0);
      if (total <= 0) {
        throw new Error(tr('AI 方案总数量为 0', 'AI plan total count is 0'));
      }
      if (total > 20) {
        throw new Error(tr('AI 方案生成数量超过 20，请减少数量', 'AI plan exceeds 20 images'));
      }

      setGalleryOutputMode('ai');
      setGalleryOutputItems(items);
      setGalleryAiOutputPlanner({ open: false, prompt: '', isGenerating: false, error: null });
    } catch (err: any) {
      const message = String(err?.message || tr('AI 生成失败，请重试。', 'AI planning failed. Please try again.'));
      setGalleryAiOutputPlanner((prev) => ({ ...prev, isGenerating: false, error: message }));
    }
  };

  const handleGalleryGenerate = async () => {
    if (!requireAuth()) return;
    if (isGalleryGenerating) return;

    // Determine whether we have new uploaded images or restored backend paths
    const hasNewImages = galleryImages.length > 0;
    const hasRestoredPaths = galleryRestoredImagePaths.length > 0;

    if (!hasNewImages && !hasRestoredPaths) {
      openGalleryAlert(tr('请先上传至少 1 张商品图片。', 'Please upload at least 1 product image.'));
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
      }))
      .filter((item) => item.enabled && item.count > 0);

    let totalCount = normalizedOutputItems.reduce((sum, item) => sum + item.count, 0);
    if (totalCount <= 0) {
      openGalleryAlert(tr('请至少添加 1 个出图类型条目。', 'Please add at least one output item.'));
      return;
    }
    if (totalCount > 20) {
      openGalleryAlert(tr('生成数量过多，请减少条目数量或每种数量（最多 20 张）。', 'Too many images. Please reduce counts (max 20).'));
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
        tr(
          `当前卖点数和将生成的卖点图数目不一致。按当前数目继续生成时，只会根据前 ${Math.min(requestedSellingPointCount, effectiveSellingPoints.length)} 个卖点生成卖点图；保持一致则会自动把生成图片数调整为 ${effectiveSellingPoints.length}。关闭弹窗可返回重新设置数量。`,
          `The number of selling points does not match the number of selling-point images to generate. If you keep the current image count, only the first ${Math.min(requestedSellingPointCount, effectiveSellingPoints.length)} selling point(s) will be used. If you match them, the image count will be updated to ${effectiveSellingPoints.length}. Close the dialog to adjust the count manually.`
        ),
        {
          title: tr('卖点图数量提醒', 'Selling Point Count Reminder'),
          okLabel: tr('保持一致', 'Match Count'),
          cancelLabel: tr('按当前数目生成', 'Use Current Count'),
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
            title: sellingPointEntries[0]?.title,
            layout: sellingPointEntries[0]?.layout,
            copy: sellingPointEntries[0]?.copy,
            notes: sellingPointEntries[0]?.notes,
            prompt: sellingPointEntries[0]?.prompt,
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
      openGalleryAlert(tr('请至少添加 1 个出图类型条目。', 'Please add at least one output item.'));
      return;
    }
    if (totalCount > 20) {
      openGalleryAlert(tr('生成数量过多，请减少条目数量或每种数量（最多 20 张）。', 'Too many images. Please reduce counts (max 20).'));
      return;
    }

    const sceneConfig: GallerySceneConfig = {
      sceneTheme: String(gallerySceneTheme || '').trim(),
      sceneDescription: String(gallerySceneDescription || '').trim(),
      sceneProps: String(gallerySceneProps || '').trim(),
      lighting: String(gallerySceneLighting || '').trim(),
      mood: String(gallerySceneMood || '').trim(),
    };
    const hasSceneConfig = Object.values(sceneConfig).some((value) => Boolean(String(value || '').trim()));

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

    const settingsSnapshot = {
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
        title: item.title,
        layout: item.layout,
        copy: item.copy,
        notes: item.notes,
        prompt: item.prompt,
      })),
      sceneConfig: hasSceneConfig ? sceneConfig : undefined,
      uploadedImagePaths: [] as string[],
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
        throw new Error(tr('图片上传失败，请重试。', 'Image upload failed. Please try again.'));
      }

      // Save uploaded paths into the snapshot so history re-generate can reference them
      settingsSnapshot.uploadedImagePaths = [...imagePaths];
      // Clear restored paths once consumed
      setGalleryRestoredImagePaths([]);

      const modelInfo = String(galleryModelInfo || '').trim();
      let modelImagePath: string | null = String(galleryModelImagePath || '').trim() || null;
      if (galleryModelImageFile) {
        const uploadResp = await assetsApi.uploadTempAsset(galleryModelImageFile);
        const path = extractUploadedAssetPath(uploadResp);
        if (!path) throw new Error(tr('模特图片上传失败，请重试。', 'Model image upload failed. Please try again.'));
        modelImagePath = String(path);
        setGalleryModelImagePath(modelImagePath);
      }

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
        type_selections: legacyTypeSelections as any,
        output_mode: galleryOutputMode,
        output_items: normalizedOutputItems.map((item) => ({
          id: item.id,
          enabled: item.enabled,
          output_type: item.outputType,
          aspect_ratio: item.aspectRatio,
          resolution: item.resolution,
          count: item.count,
          title: item.title,
          layout: item.layout,
          copy: item.copy,
          notes: item.notes,
          prompt: item.prompt,
        })),
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
        throw new Error(tr('创建生成任务失败，请重试。', 'Failed to create generation tasks.'));
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
            return { status: 'failed' as const, error: tr('生成流程被中断', 'Generation was interrupted') };
          }
          if (galleryPollRunIdRef.current !== runId) {
            return { status: 'failed' as const, error: tr('生成任务已失效，请重试。', 'Generation task became stale. Please try again.') };
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
              throw new Error(tr('生成结果为空', 'Output is empty'));
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
            const errorMessage = upstreamError || tr('生成失败', 'Failed');
            setGalleryPreviewItems((prev) =>
              prev.map((it) => (it.requestId === requestId ? { ...it, status: 'failed' as const, error: errorMessage } : it))
            );
            return { status: 'failed' as const, error: errorMessage };
          }

          if (successStatuses.has(status)) {
            const errorMessage = upstreamError || tr('生成成功但无结果', 'Succeeded but no output');
            setGalleryPreviewItems((prev) =>
              prev.map((it) => (it.requestId === requestId ? { ...it, status: 'failed' as const, error: errorMessage } : it))
            );
            return { status: 'failed' as const, error: errorMessage };
          }

          await sleep(1500);
        }

        const timeoutMessage = tr('生成超时', 'Timeout');
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
          throw new Error(firstError || tr('商品套图生成失败，请稍后重试。', 'Product gallery generation failed. Please try again.'));
        }
        openGalleryAlert(
          firstError
            ? tr('部分图片生成失败：', 'Some images failed to generate: ') + firstError
            : tr('部分图片生成失败，请检查结果后重试。', 'Some images failed to generate. Please review the results and try again.')
        );
      }

      if (collectedImageUrls.length === 0 && failedResults.length === 0) {
        throw new Error(tr('商品套图生成未返回结果，请重试。', 'Product gallery generation returned no result. Please try again.'));
      }

      if (collectedImageUrls.length > 0) {
        await refreshImageHistory();
        notifyImageHistoryUpdated();
      }
    } catch (err: any) {
      const message = String(err?.message || tr('生成失败，请重试。', 'Generation failed. Please try again.'));
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
            {tr('确定', 'OK')}
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
        title={tr('AI 智能添加出图类型', 'AI Output Planner')}
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
              {tr('取消', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={handleGenerateAiOutputPlan}
              disabled={galleryAiOutputPlanner.isGenerating}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-black hover:bg-orange-400 transition disabled:opacity-50"
            >
              {galleryAiOutputPlanner.isGenerating ? tr('生成中...', 'Generating...') : tr('生成方案', 'Generate')}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-zinc-400">
            {tr('输入你想要的套图风格/构图/卖点表达等提示词，AI 会生成可选的出图条目。', 'Describe desired styles/layouts and AI will propose output items.')}
          </div>
          <textarea
            value={galleryAiOutputPlanner.prompt}
            onChange={(e) => setGalleryAiOutputPlanner((prev) => ({ ...prev, prompt: e.target.value }))}
            rows={4}
            className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
            placeholder={tr('例如：白底主图 2 张 + 场景图 2 张（厨房台面，晨光），卖点图 3 张（每张一个卖点），海报 1 张偏节日氛围。', 'E.g. 2 white background + 2 kitchen scene + 3 selling-point (one per point) + 1 festive poster.')}
          />
          {galleryAiOutputPlanner.error ? (
            <div className="text-xs text-red-400">{galleryAiOutputPlanner.error}</div>
          ) : null}
        </div>
      </AppDialog>

      <AppDialog
        isOpen={Boolean(galleryPreviewImageUrl)}
        title={tr('图片详情预览', 'Image Details')}
        onClose={closeGalleryImagePreview}
        widthClassName="max-w-6xl h-[calc(100vh-3rem)]"
        titleClassName="text-base"
        subtitle={(() => {
          const activeHistoryItem = galleryPreviewSource?.kind === 'history_item' ? galleryHistoryItems.find((it) => it.id === galleryPreviewSource.itemId) : null;
          const productNameLabel = String(activeHistoryItem?.settings?.productName || '').trim() || String(galleryProductName || '').trim() || '-';
          const targetSceneValue = String(activeHistoryItem?.settings?.targetScene || galleryTargetScene || '').trim();
          const targetSceneLabel =
            targetSceneValue === 'detail'
              ? tr('详情页风格', 'Detail Style')
              : targetSceneValue === 'poster'
                ? tr('海报风格', 'Poster Style')
                : targetSceneValue === 'xiaohongshu'
                  ? tr('小红书风格', 'Xiaohongshu Style')
                  : targetSceneValue === 'douyin'
                    ? tr('抖音风格', 'Douyin Style')
                    : targetSceneValue === 'ads'
                      ? tr('广告风格', 'Ads Style')
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
              if (enabledKeys.length > 1) return tr('多种', 'Multiple');
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
              ? tr('详情页风格', 'Detail Style')
              : targetSceneValue === 'poster'
                ? tr('海报风格', 'Poster Style')
                : targetSceneValue === 'xiaohongshu'
                  ? tr('小红书风格', 'Xiaohongshu Style')
                  : targetSceneValue === 'douyin'
                    ? tr('抖音风格', 'Douyin Style')
                    : targetSceneValue === 'ads'
                      ? tr('广告风格', 'Ads Style')
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
                      aria-label={tr('上一张', 'Previous')}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  ) : null}

                  <div className="relative h-full w-full overflow-hidden">
                    <img
                      src={galleryPreviewImageUrl}
                      alt={tr('预览图片', 'Preview image')}
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
                      aria-label={tr('下一张', 'Next')}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="w-[320px] shrink-0 min-h-0 flex flex-col gap-3 pl-6 border-l border-white/10">


                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-bold text-zinc-200">{tr('生成信息', 'Generation Info')}</div>
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">{tr('分辨率', 'Resolution')}</span>
                      <span className="text-zinc-200 font-bold">
                        {galleryPreviewResolution ? `${galleryPreviewResolution.w} × ${galleryPreviewResolution.h} px` : '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">{tr('生成时间', 'Created At')}</span>
                      <span className="text-zinc-200 font-bold">{createdAtLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">{tr('类型', 'Type')}</span>
                      <span className="text-zinc-200 font-bold">{typeLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">{tr('生成模型', 'Model')}</span>
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
                    {tr('局部重绘 / 修改', 'Inpaint / Edit')}
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
                              {tr('单张', 'Single')}
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
                              {tr('全部', 'All')}
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
                        {isGalleryPreviewDownloading ? tr('下载中...', 'Downloading...') : (t.pi_gallery_preview_download_image || tr('下载图片', 'Download'))}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportGalleryPreviewAsPdf}
                      disabled={isGalleryPreviewExportingPdf}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-zinc-200 transition-all duration-200 hover:bg-white/10 hover:border-white/20 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      <FileDown className="w-4 h-4" />
                      {isGalleryPreviewExportingPdf ? tr('导出中...', 'Exporting...') : (t.pi_gallery_preview_export_pdf || tr('导出 PDF', 'Export PDF'))}
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
              aria-label={tr('返回', 'Back')}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span>{galleryInpaint.step === 'compare' ? tr('重绘结果选择', 'Choose Result') : tr('局部重绘修改', 'Local Edit')}</span>
          </div>
        }
        titleClassName="text-base"
        subtitle={
          galleryInpaint.step === 'compare'
            ? tr('对比两张图片，选择继续修改或应用覆盖原图。', 'Compare two images, then continue editing or apply to replace the original.')
            : tr('请在左侧框选需要修改的部分', 'Select the area to edit on the left')
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
                      aria-label={tr('选择原图', 'Select original')}
                    >
                      <img src={galleryPreviewImageUrl} alt={tr('原图', 'Original')} className="w-full h-full object-contain" draggable={false} />
                      <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold text-white">{tr('原图', 'Original')}</div>
                      {galleryInpaint.selectedCompare === 'original' ? (
                        <div className="absolute right-3 top-3 rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-bold text-white">{tr('当前选中', 'Selected')}</div>
                      ) : null}
                    </button>

                    <button
                      type="button"
                      onClick={() => setGalleryInpaint((prev) => ({ ...prev, selectedCompare: 'edited' }))}
                      className={`relative flex-1 h-full rounded-2xl bg-black/40 overflow-hidden transition ${galleryInpaint.selectedCompare === 'edited' ? 'border-2 border-indigo-500/70 shadow-lg shadow-indigo-600/10' : 'border border-white/10 hover:border-white/20'}`}
                      aria-label={tr('选择修改后', 'Select edited')}
                    >
                      <img src={galleryInpaint.resultUrl} alt={tr('修改后', 'Edited')} className="w-full h-full object-contain" draggable={false} />
                      <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold text-white">{tr('修改后', 'Edited')}</div>
                      {galleryInpaint.selectedCompare === 'edited' ? (
                        <div className="absolute right-3 top-3 rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-bold text-white">{tr('当前选中', 'Selected')}</div>
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
                    alt={tr('预览图片', 'Preview image')}
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
                          {tr('修改区域', 'Area')}
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
                      aria-label={tr('框选', 'Select')}
                    >
                      <PencilLine className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setGalleryInpaint((prev) => ({ ...prev, rect: null, error: null }))}
                      disabled={galleryInpaint.isGenerating}
                      className="h-9 w-9 rounded-xl bg-white/10 text-white hover:bg-white/15 transition inline-flex items-center justify-center disabled:opacity-60"
                      aria-label={tr('清除选区', 'Clear selection')}
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
                    <div className="text-sm font-extrabold">{tr('生成完毕！', 'Done!')}</div>
                    <div className="mt-2 text-xs leading-relaxed text-indigo-700">
                      {tr('点击左侧图片选择要保留的版本，然后继续修改或直接应用。', 'Click an image on the left to select the version, then continue editing or apply it.')}
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="text-xs font-bold text-zinc-500">{tr('当前版本', 'Current Version')}</div>
                    <div className="mt-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-indigo-600/10 flex items-center justify-center overflow-hidden">
                        <img
                          src={galleryInpaint.selectedCompare === 'edited' ? (galleryInpaint.resultUrl || galleryPreviewImageUrl) : galleryPreviewImageUrl}
                          alt={tr('缩略图', 'Thumbnail')}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-zinc-900">
                          {galleryInpaint.selectedCompare === 'edited' ? tr('AI 重绘版本', 'AI Edited Version') : tr('原图版本', 'Original Version')}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          {galleryInpaint.selectedCompare === 'edited' ? tr('已生成 1 个修改结果', '1 edited result generated') : tr('保留未修改版本', 'Keep unmodified version')}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-800">
                    <div className="text-xs font-bold">{tr('提示', 'Tip')}</div>
                    <div className="mt-2 text-xs leading-relaxed">
                      {tr('点击“继续修改”将基于当前选中的版本进入下一轮修改。', 'Click “Continue editing” to start another edit based on the selected version.')}
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
                      {tr('继续修改', 'Continue Editing')}
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
                          openGalleryAlert(String(err?.message || err || tr('应用失败，请重试。', 'Failed to apply. Please try again.')));
                        }
                      }}
                      className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-indigo-500 disabled:opacity-60 transition inline-flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      {galleryInpaint.selectedCompare === 'original' ? tr('保留原图', 'Keep Original') : tr('应用并覆盖原图', 'Apply & Replace Original')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-6 flex flex-col min-h-0 flex-1">
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-extrabold text-zinc-900">{t.pi_gallery_inpaint_prompt_label || tr('修改指令（Prompt）', 'Edit Prompt')}</div>
                      <button
                        type="button"
                        onClick={() => setGalleryInpaint((prev) => ({ ...prev, rect: null, error: null }))}
                        disabled={galleryInpaint.isGenerating}
                        className="text-xs font-bold text-zinc-500 hover:text-zinc-900 disabled:opacity-60 transition"
                      >
                        {tr('清除全部选区', 'Clear Selection')}
                      </button>
                    </div>

                    <textarea
                      value={galleryInpaint.prompt}
                      onChange={(e) => setGalleryInpaint((prev) => ({ ...prev, prompt: e.target.value }))}
                      placeholder={t.pi_gallery_inpaint_prompt_placeholder || tr('例如：把选中区域的鞋带改成浅黄色，并增加质感，保持光影与原图一致。', 'E.g. Change the laces in the selected area to light yellow, add texture, keep lighting consistent.')}
                      className="mt-3 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none focus:border-indigo-300 min-h-[140px] resize-none"
                    />

                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-800">
                      <div className="text-xs font-bold">{tr('提示', 'Tip')}</div>
                      <div className="mt-2 text-xs leading-relaxed">
                        {tr('描述得越具体越好（如颜色、材质、环境光等），生成的效果更接近自然。', 'Be specific (color, material, lighting, etc.) for better results.')}
                      </div>
                    </div>

                    {galleryInpaint.error ? <div className="mt-3 text-xs text-rose-600 font-bold">{galleryInpaint.error}</div> : null}
                  </div>

                  <div className="shrink-0 pt-6">
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <div>{tr('单张计费', 'Per image')}</div>
                      <div className="font-bold text-indigo-600">{tr('极速模式', 'Fast Mode')}</div>
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
                        {galleryInpaint.isGenerating ? (t.pi_gallery_inpaint_generating || tr('生成中...', 'Generating...')) : tr('开始生成修改', 'Start Editing')}
                      </span>
                      <span className="justify-self-end self-center pr-0.5 text-right">
                        {!galleryInpaint.isGenerating && galleryInpaintEstimatedCost > 0 ? (
                          <span className="whitespace-nowrap text-[10px] font-semibold tabular-nums text-white/80">
                            {`-${galleryInpaintEstimatedCost} ${tr('V点', 'V-points')}`}
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
        title={tr('选择商品套图历史图片', 'Choose Product Gallery History')}
        onClose={() => setIsTextSeparationHistoryPickerOpen(false)}
        widthClassName="max-w-6xl"
        footer={
          <button
            type="button"
            onClick={() => setIsTextSeparationHistoryPickerOpen(false)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition"
          >
            {tr('关闭', 'Close')}
          </button>
        }
      >
        {galleryHistoryItems.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-zinc-500">
            {tr('暂无可用的商品套图历史图片', 'No Product Gallery history available')}
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
                        selectTextSeparationSource(url, `${tr('历史图片', 'History Image')} ${item.createdAt}`, url);
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
                          {tr('预览', 'Preview')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsTextSeparationHistoryPickerOpen(false);
                            selectTextSeparationSource(url, `${tr('历史图片', 'History Image')} ${item.createdAt}`, url);
                          }}
                          disabled={isTextSeparationLoading}
                          className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-black transition hover:bg-orange-400 disabled:opacity-60"
                        >
                          {isTextSeparationLoading ? tr('处理中...', 'Processing...') : tr('文本分离', 'Text Separation')}
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
        isOpen={isGalleryBoardEditorOpen}
        title={tr('画板编辑器', 'Board Editor')}
        onClose={closeGalleryBoardEditor}
        widthClassName="max-w-[96rem]"
      >
        {isGalleryBoardEditorOpen ? (
          <GalleryBoardEditor
            assets={galleryBoardAssets}
            productName={galleryProductName}
            sellingPoints={gallerySellingPoints}
            tr={tr}
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
          <div ref={productToolMenuRef} className="relative inline-block">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              <button
                type="button"
                onClick={() => setIsProductToolMenuOpen((prev) => !prev)}
                className="group inline-flex items-center gap-2 rounded-lg px-2 py-1 -ml-2 text-left transition hover:bg-white/5"
                aria-haspopup="listbox"
                aria-expanded={isProductToolMenuOpen}
              >
                <ChevronDown
                  className={`w-5 h-5 text-zinc-400 transition-transform ${isProductToolMenuOpen ? 'rotate-0' : '-rotate-90'} group-hover:text-zinc-200`}
                />
                <span>{currentHeader.title}</span>
              </button>
            </h1>

            {isProductToolMenuOpen ? (
              <div
                className="absolute left-0 mt-2 w-56 max-h-72 overflow-auto custom-scroll rounded-xl border border-white/10 bg-zinc-950/95 backdrop-blur-sm shadow-xl z-[210] py-2"
                role="listbox"
              >
                {productToolOptions.map((opt) => {
                  const selected = opt.value === currentValue;
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setActiveView(opt.value as ViewType);
                        setIsProductToolMenuOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm transition ${
                        selected ? 'bg-indigo-500/15 text-indigo-200' : 'text-zinc-200 hover:bg-white/5'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <p className="mt-1 text-sm text-zinc-400">
            {currentHeader.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
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
            <div>{tr('AI 换装（开发中）', 'AI Clothing Swap (In Development)')}</div>
          </div>
        </div>

        <div className={panelClassName('product_images_first_frame')}>
          <FirstFrameView
            embedded
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
            <div className="h-full flex gap-6">
              <div className="w-[30%] min-w-[360px] max-w-[420px]">
                <div className="rounded-2xl border border-white/5 bg-white/2 p-5">
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
                    className="transition-colors"
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
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-zinc-200">{tr('当前处理图片', 'Current Image')}</div>
                          <div className="mt-2 truncate text-sm font-bold text-zinc-200">
                            {textSeparationUploadName || tr('最近上传', 'Latest upload')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => clearSelectedTextSeparationSource()}
                          disabled={isTextSeparationLoading}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/50 text-zinc-300 transition hover:bg-black/80 hover:text-white disabled:opacity-60"
                          title={tr('删除并重新选择', 'Remove and choose again')}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <img
                        src={textSeparationUploadPreviewUrl}
                        alt={textSeparationUploadName || 'upload'}
                        className="mt-3 w-full rounded-xl border border-white/10 object-cover"
                      />
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={handleStartTextSeparation}
                          disabled={isTextSeparationLoading || !textSeparationSelectedImagePath}
                          className="text-separation-start-btn grid flex-1 grid-cols-[1fr_auto_1fr] items-center rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-black transition hover:bg-orange-400 disabled:opacity-60 disabled:hover:bg-orange-500"
                        >
                          <span aria-hidden="true" className="min-w-0" />
                          <span className="min-w-0 justify-self-center text-center">
                            {isTextSeparationLoading ? tr('处理中...', 'Processing...') : tr('开始文本分离', 'Start Text Separation')}
                          </span>
                          <span className="justify-self-end self-center pr-0.5 text-right">
                            {textSeparationEstimatedCost > 0 ? (
                              <span className="whitespace-nowrap text-[10px] font-semibold tabular-nums text-black/75">
                                {`-${textSeparationEstimatedCost} ${tr('V点', 'V-points')}`}
                              </span>
                            ) : null}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openGalleryImagePreview(textSeparationUploadPreviewUrl)}
                          className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800"
                        >
                          {tr('查看', 'View')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-bold text-zinc-200">{tr('上传图片', 'Upload Image')}</div>
                      <div
                        onDragEnter={(e) => {
                          e.preventDefault();
                          if (!isTextSeparationLoading) setIsTextSeparationDragActive(true);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (!isTextSeparationLoading) setIsTextSeparationDragActive(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          const nextTarget = e.relatedTarget as Node | null;
                          if (!e.currentTarget.contains(nextTarget)) {
                            setIsTextSeparationDragActive(false);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsTextSeparationDragActive(false);
                          if (isTextSeparationLoading) return;
                          const file = Array.from(e.dataTransfer.files || [])[0];
                          if (!file) return;
                          if (!isSupportedGalleryImageFile(file)) {
                            openGalleryAlert(gallerySupportedFormatTip);
                            return;
                          }
                          void handleTextSeparationUpload(file);
                        }}
                      >
                      <button
                        type="button"
                        onClick={() => textSeparationFileInputRef.current?.click()}
                        disabled={isTextSeparationLoading}
                        className={`mt-4 w-full rounded-2xl border border-dashed px-4 py-10 text-center transition disabled:opacity-60 ${
                          isTextSeparationLoading
                            ? 'border-white/10 bg-black/20 text-zinc-500'
                            : isTextSeparationDragActive
                              ? 'border-orange-400 bg-orange-500/10 text-orange-200'
                              : 'border-white/10 bg-black/20 text-zinc-500 hover:border-white/20 hover:text-zinc-300'
                        }`}
                      >
                        <Upload className="mx-auto mb-3 h-10 w-10 opacity-70" />
                        <div className="text-sm font-semibold">{tr('选择一张海报图片', 'Choose one poster image')}</div>
                        <div className="mt-1 text-[11px]">{tr('点击选择，或将文件拖拽到这里', 'Click to choose or drag a file here')}</div>
                        <div className="mt-1 text-[11px]">JPG / PNG / WEBP</div>
                      </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsTextSeparationHistoryPickerOpen(true)}
                        disabled={isTextSeparationLoading}
                        className="mt-3 w-full rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60"
                      >
                        {tr('从商品套图历史记录选择', 'Choose from Product Gallery History')}
                      </button>
                    </>
                  )}
                  </div>
                </div>
              </div>

              <div className="flex-1 min-w-0 rounded-2xl border border-white/5 bg-white/2 p-5 flex flex-col min-h-0 max-h-[calc(100vh-80px)]">
                <div className="text-sm font-bold text-zinc-200">{tr('生成记录', 'Generation Records')}</div>
                <div className="flex-1 mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 overflow-y-auto">
                  {textSeparationRecords.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                      {tr('暂无生成记录', 'No generation records yet')}
                    </div>
                  ) : (
                    <div className="p-4 grid grid-cols-2 gap-3">
                      {textSeparationRecords.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => openTextSeparationHistoryItem(item)}
                          disabled={item.status !== 'succeeded'}
                          className="overflow-hidden rounded-xl border border-white/10 bg-black/20 text-left transition hover:border-orange-500/40 disabled:hover:border-white/10 disabled:cursor-default"
                        >
                          <div className="aspect-video overflow-hidden border-b border-white/10 bg-black/30 relative">
                            <img
                              src={(item.status === 'succeeded' && item.backgroundImageUrl) ? item.backgroundImageUrl : item.originalImageUrl}
                              alt={item.sampleTitle}
                              className={`h-full w-full object-cover ${item.status === 'processing' ? 'opacity-70' : ''}`}
                            />
                            {item.status === 'processing' ? (
                              <div className="absolute inset-x-3 bottom-3">
                                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-orange-500 transition-[width] duration-200"
                                    style={{ width: `${Math.max(6, item.progress)}%` }}
                                  />
                                </div>
                              </div>
                            ) : null}
                          </div>
                          <div className="p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="truncate text-sm font-bold text-zinc-200">{item.sampleTitle}</div>
                              <div className={`text-[11px] font-bold ${item.status === 'processing' ? 'text-orange-300' : 'text-emerald-300'}`}>
                                {item.status === 'processing' ? tr('生成中', 'Processing') : tr('已完成', 'Done')}
                              </div>
                            </div>
                            <div className="mt-1 text-[11px] text-zinc-500">{item.createdAt}</div>
                            <div className="mt-2 text-xs text-zinc-400">
                              {item.status === 'processing'
                                ? tr(`进度 ${Math.round(item.progress)}%`, `${Math.round(item.progress)}% complete`)
                                : tr(`文本框 ${item.textBlocks?.length || 0} 个`, `${item.textBlocks?.length || 0} text blocks`)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <ImagesGalleryView
          panelClassName={panelClassName}
          t={t}
          tr={tr}
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
          isGalleryModelInfoOpen={isGalleryModelInfoOpen}
          setIsGalleryModelInfoOpen={setIsGalleryModelInfoOpen}
          galleryModelImagePreviewUrl={galleryModelImagePreviewUrl}
          galleryModelImagePath={galleryModelImagePath}
          galleryModelFileInputRef={galleryModelFileInputRef}
          setGalleryModelImageFile={setGalleryModelImageFile}
          setGalleryModelImagePath={setGalleryModelImagePath}
          galleryModelInfo={galleryModelInfo}
          setGalleryModelInfo={setGalleryModelInfo}
          handleGalleryModelFileSelection={handleGalleryModelFileSelection}
          galleryTargetScene={galleryTargetScene}
          setGalleryTargetScene={setGalleryTargetScene}
          galleryStyle={galleryStyle}
          setGalleryStyle={setGalleryStyle}
          galleryCopyLanguage={galleryCopyLanguage}
          setGalleryCopyLanguage={setGalleryCopyLanguage}
          GALLERY_COPY_LANGUAGE_OPTIONS={GALLERY_COPY_LANGUAGE_OPTIONS}
          galleryScenePresetId={galleryScenePresetId}
          GALLERY_SCENE_PRESETS={GALLERY_SCENE_PRESETS}
          clearGallerySceneConfig={clearGallerySceneConfig}
          applyGalleryScenePreset={applyGalleryScenePreset}
          gallerySceneTheme={gallerySceneTheme}
          setGallerySceneTheme={setGallerySceneTheme}
          gallerySceneMood={gallerySceneMood}
          setGallerySceneMood={setGallerySceneMood}
          gallerySceneDescription={gallerySceneDescription}
          setGallerySceneDescription={setGallerySceneDescription}
          gallerySceneProps={gallerySceneProps}
          setGallerySceneProps={setGallerySceneProps}
          gallerySceneLighting={gallerySceneLighting}
          setGallerySceneLighting={setGallerySceneLighting}
          galleryOutputMode={galleryOutputMode}
          setGalleryOutputMode={setGalleryOutputMode}
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
