import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ChevronLeft, ChevronsDown, FileText, Filter, Minus, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { DropdownSelect } from '../../../common/DropdownSelect';
import { AppDialog } from '../../../common/AppDialog';
import { ImageUploader } from '../../Common/ImageUploader';
import {
  AssetLibraryPickerDialog,
  type AssetLibraryPickedAsset,
} from '../../Common/AssetLibraryPickerDialog';
import { FirstFrameForm } from './FirstFrameForm';
import { FirstFrameResult } from './FirstFrameResult';
import ResizableSplitter from '../../../common/ResizableSplitter';
import { LoadingProgress } from '../../Common/LoadingProgress';
import { ErrorDialog, type ErrorInfo } from '../../Common/ErrorDialog';
import { productImagesApi } from '../../../../services/productImagesApi';
import { assetsApi, type Asset } from '../../../../services/assets';
import { apiRequest } from '../../../../services/apiClient';
import type { FirstFrameParams, ProductImageResult } from '../../../../types/productImages';
import { deleteImageHistoryItem, notifyImageHistoryUpdated, readImageHistoryByFeature, refreshImageHistory, replaceImageHistoryAsset, subscribeImageHistory, type ImageHistoryItem } from '../../../../utils/imageHistory';
import { extractLoadingThemeFromSources, getDefaultLoadingTheme, type LoadingTheme } from '../../../../utils/loadingTheme';
import { saveBlobWithPickerFallback } from '../../../../utils/browserDownload';
import { useRequireAuth } from '../../../../utils/useRequireAuth';
import {
  writeFirstFrameToVideoTransfer,
  type FirstFrameVideoTargetModel,
} from './firstFrameToVideoTransfer';

type Phase = 'upload' | 'form' | 'generating' | 'result' | 'error';
type FirstFramePickerTab = 'image' | 'model';
type FirstFramePickedAsset = AssetLibraryPickedAsset<FirstFramePickerTab>;

interface FirstFrameWorkspaceMeta {
  id: string;
  name?: string;
  createdAt: number;
  updatedAt: number;
}

interface FirstFrameDraftImage {
  name: string;
  type: string;
  dataUrl: string;
}

interface FirstFrameDraftSnapshot {
  params: FirstFrameParams;
  images: FirstFrameDraftImage[];
}

interface FirstFrameDraftItem {
  id: string;
  name: string;
  workspaceId: string;
  createdAt: number;
  updatedAt: number;
  snapshot: FirstFrameDraftSnapshot;
}

interface FirstFrameHistoryItem {
  id: string;
  workspaceId: string;
  createdAt: string;
  outputImages: ProductImageResult[];
  elapsedSeconds: number | null;
  params?: Partial<FirstFrameParams>;
}

interface FirstFrameExampleTemplate {
  id: string;
  titleKey?: string;
  subtitleKey?: string;
  promptKey?: string;
  title: string;
  subtitle: string;
  previewUrl: string;
  inputImageUrls: string[];
  resultImageUrls?: string[];
  params: FirstFrameParams;
  isUserSnapshot?: boolean;
}

interface FirstFrameViewProps {
  onBack?: () => void;
  projectId?: string;
  embedded?: boolean;
  isVisible?: boolean;
  onApplyToWorkbench?: () => void;
  headerActionsContainer?: HTMLElement | null;
}

const FIRST_FRAME_WORKSPACE_META_KEY = 'vflow_first_frame_workspaces_v1';
const FIRST_FRAME_ACTIVE_WORKSPACE_KEY = 'vflow_first_frame_active_workspace_v1';
const FIRST_FRAME_DRAFTS_KEY = 'vflow_first_frame_drafts_v1';
const FIRST_FRAME_EXAMPLES_COLLAPSED_KEY = 'vflow_first_frame_examples_collapsed_v1';
const FIRST_FRAME_COUNTDOWN_SECONDS = 120;
const FIRST_FRAME_PROGRESS_HOLD_MAX = 95;
const FIRST_FRAME_ASYNC_POLL_INTERVAL_MS = 3000;
const FIRST_FRAME_ASYNC_POLL_MAX_ATTEMPTS = 80;
const FIRST_FRAME_ASSET_PICKER_ACCEPTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
const FIRST_FRAME_ASSET_PICKER_MAX_FILE_SIZE = 5 * 1024 * 1024;
const FIRST_FRAME_ASSET_PICKER_MAX_COUNT = 4;
const FIRST_FRAME_PICKER_TABS = [
  {
    key: 'image' as const,
    labelKey: 'assets_tab_images',
    fallbackLabel: 'Images',
    assetType: 'product' as const,
  },
  {
    key: 'model' as const,
    labelKey: 'assets_tab_virtual_models',
    fallbackLabel: 'Virtual Models',
    assetType: 'model' as const,
  },
];
const FIRST_FRAME_PANEL_MIN_WIDTH = 280;
const FIRST_FRAME_PANEL_MAX_WIDTH = 720;
const FIRST_FRAME_PANEL_VERTICAL_GAP = 16;
const FIRST_FRAME_PANEL_BOTTOM_GAP = 24;
const FIRST_FRAME_DEFAULT_LEFT_RATIO = 0.8;
const FIRST_FRAME_DEFAULT_MIDDLE_RATIO = 1.1;
const FIRST_FRAME_DEFAULT_RIGHT_RATIO = 1;
const FIRST_FRAME_DEFAULT_TOTAL_RATIO =
  FIRST_FRAME_DEFAULT_LEFT_RATIO + FIRST_FRAME_DEFAULT_MIDDLE_RATIO + FIRST_FRAME_DEFAULT_RIGHT_RATIO;
const FIRST_FRAME_USER_EXAMPLE_LIMIT = 20;
const FIRST_FRAME_EXAMPLE_BASE_URL = '/examples/product-images/first-frame';

const FIRST_FRAME_EXAMPLE_TEMPLATES: FirstFrameExampleTemplate[] = [
  {
    id: 'person_selling_seeding',
    titleKey: 'ff_example_person_selling_title',
    subtitleKey: 'ff_example_person_selling_subtitle',
    promptKey: 'ff_example_person_selling_prompt',
    title: '人物带货/种草',
    subtitle: '具有生活感的人物带货短视频开场',
    previewUrl: `${FIRST_FRAME_EXAMPLE_BASE_URL}/person_selling/result1.png`,
    inputImageUrls: [
      `${FIRST_FRAME_EXAMPLE_BASE_URL}/person_selling/input.webp`,
    ],
    resultImageUrls: [
      `${FIRST_FRAME_EXAMPLE_BASE_URL}/person_selling/result1.png`,
      `${FIRST_FRAME_EXAMPLE_BASE_URL}/person_selling/result2.jpg`,
      `${FIRST_FRAME_EXAMPLE_BASE_URL}/person_selling/result3.png`,
    ],
    params: {
      openingScene: 'person_selling',
      prompt: '年轻女孩自然手持小风扇半身出镜，表情亲和有推荐感。小风扇清晰突出，背景简洁明亮，画面清爽有生活感，适合夏日好物种草短视频开场。',
      aspectRatio: '9:16',
      outputCount: 3,
      model: 'nano-banana-pro',
    },
  },
  {
    id: 'product_showcase_bag',
    titleKey: 'ff_example_product_showcase_title',
    subtitleKey: 'ff_example_product_showcase_subtitle',
    promptKey: 'ff_example_product_showcase_prompt',
    title: '纯商品展示',
    subtitle: '突出商品质感的展示开场',
    previewUrl: `${FIRST_FRAME_EXAMPLE_BASE_URL}/product_showcase/result1.jpg`,
    inputImageUrls: [
      `${FIRST_FRAME_EXAMPLE_BASE_URL}/product_showcase/input.jpg`,
    ],
    resultImageUrls: [
      `${FIRST_FRAME_EXAMPLE_BASE_URL}/product_showcase/result1.jpg`,
      `${FIRST_FRAME_EXAMPLE_BASE_URL}/product_showcase/result2.jpg`
    ],
    params: {
      openingScene: 'product_showcase',
      prompt: '包包摆放在浅色大理石桌面上，包链自然垂下。桌面铺有柔软的米白色丝绒布料，包包作为画面主体居中展示，周围可适当加些装饰物。背景简洁高级，光线柔和。',
      aspectRatio: '3:2',
      outputCount: 2,
      model: 'nano-banana-pro',
    },
  },
  {
    id: 'usage_demo_headphones',
    titleKey: 'ff_example_usage_demo_title',
    subtitleKey: 'ff_example_usage_demo_subtitle',
    promptKey: 'ff_example_usage_demo_prompt',
    title: '使用场景演示',
    subtitle: '展示商品真实使用状态',
    previewUrl: `${FIRST_FRAME_EXAMPLE_BASE_URL}/usage_demo/result1.jpg`,
    inputImageUrls: [
      `${FIRST_FRAME_EXAMPLE_BASE_URL}/usage_demo/input_product.jpg`,
    ],
    resultImageUrls: [
      `${FIRST_FRAME_EXAMPLE_BASE_URL}/usage_demo/result1.jpg`,
      `${FIRST_FRAME_EXAMPLE_BASE_URL}/usage_demo/result2.jpg`,
      `${FIRST_FRAME_EXAMPLE_BASE_URL}/usage_demo/result3.jpg`,
    ],
    params: {
      openingScene: 'usage_demo',
      prompt: '一个年轻帅气的男性在安静的居家空间中自然佩戴耳机，单手轻扶耳机，呈现沉浸听音乐的状态。耳机清晰突出，画面柔和有生活感。',
      aspectRatio: '16:9',
      outputCount: 3,
      model: 'nano-banana-pro',
    },
  },
  {
    id: 'brand_ad_skincare',
    titleKey: 'ff_example_brand_ad_title',
    subtitleKey: 'ff_example_brand_ad_subtitle',
    promptKey: 'ff_example_brand_ad_prompt',
    title: '品牌广告大片',
    subtitle: '打造高级感品牌广告开场',
    previewUrl: `${FIRST_FRAME_EXAMPLE_BASE_URL}/brand_ad/result1.jpg`,
    inputImageUrls: [
      `${FIRST_FRAME_EXAMPLE_BASE_URL}/brand_ad/input_model.png`,
      `${FIRST_FRAME_EXAMPLE_BASE_URL}/brand_ad/input_product.jpg`,
    ],
    resultImageUrls: [
      `${FIRST_FRAME_EXAMPLE_BASE_URL}/brand_ad/result1.jpg`,
      `${FIRST_FRAME_EXAMPLE_BASE_URL}/brand_ad/result2.jpg`
    ],
    params: {
      openingScene: 'brand_ad',
      prompt: '人物自然手持护肤品出镜，妆容精致，产品清晰突出。背景简洁高级，光线柔和，整体呈现高质感护肤品广告画面。',
      aspectRatio: '3:4',
      outputCount: 2,
      model: 'nano-banana-pro',
    },
  },
];

const createDefaultWorkspaceMeta = (): FirstFrameWorkspaceMeta => ({
  id: 'ff-workspace-1',
  name: '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const defaultFirstFrameDraftName = (prefix = 'My Draft') => {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${prefix}-${stamp}`;
};

const normalizeFirstFrameDraftParams = (params: Partial<FirstFrameParams> | undefined): FirstFrameParams => ({
  prompt: String(params?.prompt || ''),
  openingScene: (params?.openingScene || 'person_selling') as FirstFrameParams['openingScene'],
  aspectRatio: (params?.aspectRatio || '9:16') as FirstFrameParams['aspectRatio'],
  model: 'nano-banana-pro',
  resolution: (['1k', '2k', '4k'].includes(String(params?.resolution || '').trim().toLowerCase())
    ? String(params?.resolution || '').trim().toLowerCase()
    : '1k') as FirstFrameParams['resolution'],
  outputCount: Math.max(1, Math.min(4, Math.round(Number(params?.outputCount || 4)))) as FirstFrameParams['outputCount'],
});

const formatFirstFrameResolution = (value?: FirstFrameParams['resolution'] | string) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized ? normalized.toUpperCase() : '1K';
};

const readFirstFrameDrafts = (): FirstFrameDraftItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FIRST_FRAME_DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: any) => {
        const id = String(item?.id || '').trim();
        const name = String(item?.name || '').trim();
        const workspaceId = String(item?.workspaceId || '').trim();
        const createdAt = Number(item?.createdAt);
        const updatedAt = Number(item?.updatedAt);
        const rawImages = Array.isArray(item?.snapshot?.images) ? item.snapshot.images : [];
        if (!id || !name || !workspaceId) return null;
        return {
          id,
          name,
          workspaceId,
          createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
          updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
          snapshot: {
            params: normalizeFirstFrameDraftParams(item?.snapshot?.params),
            images: rawImages
              .map((image: any) => ({
                name: String(image?.name || 'draft-image.jpg'),
                type: String(image?.type || 'image/jpeg'),
                dataUrl: String(image?.dataUrl || ''),
              }))
              .filter((image: FirstFrameDraftImage) => image.dataUrl.startsWith('data:image/'))
              .slice(0, FIRST_FRAME_ASSET_PICKER_MAX_COUNT),
          },
        } satisfies FirstFrameDraftItem;
      })
      .filter(Boolean) as FirstFrameDraftItem[];
  } catch {
    return [];
  }
};

const writeFirstFrameDrafts = (drafts: FirstFrameDraftItem[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FIRST_FRAME_DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    // Ignore localStorage write failures.
  }
};

const fileToDraftImage = (file: File) => new Promise<FirstFrameDraftImage>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || '');
    if (!dataUrl) {
      reject(new Error('Failed to read image'));
      return;
    }
    resolve({
      name: file.name || 'draft-image.jpg',
      type: file.type || 'image/jpeg',
      dataUrl,
    });
  };
  reader.onerror = () => reject(new Error('Failed to read image'));
  reader.readAsDataURL(file);
});

const draftImageToFile = (image: FirstFrameDraftImage, index: number): File | null => {
  try {
    const [meta, payload] = image.dataUrl.split(',');
    if (!payload) return null;
    const mimeMatch = meta.match(/^data:([^;]+);base64$/);
    const type = image.type || mimeMatch?.[1] || 'image/jpeg';
    const binary = window.atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], image.name || `draft-image-${index + 1}.jpg`, { type });
  } catch {
    return null;
  }
};

const formatDraftRelativeTime = (timestamp: number, t: ReturnType<typeof useLanguage>['t']) => {
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) return t.ff_draft_time_just_now;
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return (t.ff_draft_time_minutes_ago || '{count} minutes ago').replace('{count}', String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return (t.ff_draft_time_hours_ago || '{count} hours ago').replace('{count}', String(hours));
  const days = Math.floor(hours / 24);
  if (days < 30) return (t.ff_draft_time_days_ago || '{count} days ago').replace('{count}', String(days));
  return new Date(timestamp).toLocaleDateString();
};

const sanitizeHistoryImage = (item: any, index: number, historyId: string): ProductImageResult | null => {
  const imageUrl = String(item?.imageUrl || item?.downloadUrl || '').trim();
  if (!imageUrl) return null;

  const rawId = String(item?.id || '').trim();
  const namespacedId = rawId
    ? `first-frame-history-${historyId}-${index}-${rawId}`
    : `first-frame-history-${historyId}-${index}`;

  return {
    id: namespacedId,
    imageUrl,
    downloadUrl: String(item?.downloadUrl || imageUrl),
    format: String(item?.format || 'jpg'),
    category: item?.category,
    metadata: {
      ...(item?.metadata && typeof item.metadata === 'object' ? item.metadata : {}),
      historyRecordId: historyId,
      historyAssetIndex: index,
    },
    size: typeof item?.size === 'number' ? item.size : undefined,
  };
};

const readFirstFrameHistoryParams = (item: ImageHistoryItem): Partial<FirstFrameParams> | undefined => {
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

  const readNumber = (...keys: string[]) => {
    const value = readString(...keys);
    if (!value) return undefined;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  };

  const outputCount = readNumber('outputCount', 'output_count');
  const params: Partial<FirstFrameParams> = {};
  const prompt = readString('prompt', 'promptOverride', 'prompt_override');
  const openingScene = readString('openingScene', 'opening_scene');
  const aspectRatio = readString('aspectRatio', 'aspect_ratio', 'ratio');
  const model = readString('model', 'generationModel', 'generation_model');
  const resolution = readString('resolution');

  if (prompt) params.prompt = prompt;
  if (openingScene) params.openingScene = openingScene as FirstFrameParams['openingScene'];
  if (aspectRatio) params.aspectRatio = aspectRatio as FirstFrameParams['aspectRatio'];
  if (model) params.model = model as FirstFrameParams['model'];
  if (resolution) params.resolution = resolution.toLowerCase() as FirstFrameParams['resolution'];
  if (outputCount) params.outputCount = outputCount as FirstFrameParams['outputCount'];

  return Object.keys(params).length > 0 ? params : undefined;
};

const mapImageHistoryToFirstFrameItem = (item: ImageHistoryItem): FirstFrameHistoryItem | null => {
  if (item.featureType !== 'first_frame') return null;

  const historyId = String(item.id || '').trim();
  const outputImages = (Array.isArray(item.metadata?.outputImages)
    ? item.metadata.outputImages
        .map((img: any, index: number) => sanitizeHistoryImage(img, index, historyId))
        .filter(Boolean)
    : item.images
        .map((imageUrl, index) => sanitizeHistoryImage({ imageUrl, downloadUrl: imageUrl }, index, historyId))
        .filter(Boolean)) as ProductImageResult[];

  if (outputImages.length === 0) return null;

  const rawElapsedSeconds = Number(item.metadata?.elapsedSeconds ?? item.metadata?.elapsed_seconds);
  const elapsedSeconds = Number.isFinite(rawElapsedSeconds) && rawElapsedSeconds > 0
    ? Math.round(rawElapsedSeconds)
    : null;

  return {
    id: item.id,
    workspaceId: item.workspaceId || 'ff-workspace-1',
    createdAt: item.createdAt,
    outputImages,
    elapsedSeconds,
    params: readFirstFrameHistoryParams(item),
  } satisfies FirstFrameHistoryItem;
};

const readWorkspaceMetas = (): FirstFrameWorkspaceMeta[] => {
  if (typeof window === 'undefined') return [createDefaultWorkspaceMeta()];

  try {
    const raw = window.localStorage.getItem(FIRST_FRAME_WORKSPACE_META_KEY);
    if (!raw) return [createDefaultWorkspaceMeta()];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [createDefaultWorkspaceMeta()];

    const normalized = parsed
      .map((item: any, index: number) => {
        const id = String(item?.id || '').trim();
        const createdAtRaw = Number(item?.createdAt);
        const updatedAtRaw = Number(item?.updatedAt);

        if (!id) return null;

        return {
          id,
          name: String(item?.name || '').trim() || undefined,
          createdAt: Number.isFinite(createdAtRaw) ? createdAtRaw : Date.now(),
          updatedAt: Number.isFinite(updatedAtRaw) ? updatedAtRaw : Date.now(),
        } satisfies FirstFrameWorkspaceMeta;
      })
      .filter(Boolean) as FirstFrameWorkspaceMeta[];

    return normalized.length > 0 ? normalized : [createDefaultWorkspaceMeta()];
  } catch {
    return [createDefaultWorkspaceMeta()];
  }
};

interface FirstFrameWorkspacePaneProps {
  workspaceId: string;
  workspaceLabel: string;
  projectId?: string;
  isVisible?: boolean;
  onApplyToWorkbench?: () => void;
  draftToApply?: FirstFrameDraftItem | null;
  onDraftApplied?: (draftId: string) => void;
  onSaveDraft?: (name: string, snapshot: FirstFrameDraftSnapshot) => void;
}

const FirstFrameWorkspacePane: React.FC<FirstFrameWorkspacePaneProps> = ({
  workspaceId,
  workspaceLabel,
  projectId,
  isVisible = true,
  onApplyToWorkbench,
  draftToApply,
  onDraftApplied,
  onSaveDraft,
}) => {
  const { t } = useLanguage();
  const { requireAuth } = useRequireAuth();
  const paneRootRef = useRef<HTMLDivElement | null>(null);
  const examplesHeaderRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousContainerWidthRef = useRef(0);
  const [leftWidth, setLeftWidth] = useState<number>(500);
  const [middleWidth, setMiddleWidth] = useState<number>(600);
  const [workspacePanelHeight, setWorkspacePanelHeight] = useState<number | null>(null);

  const [phase, setPhase] = useState<Phase>('upload');
  const [images, setImages] = useState<File[]>([]);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [isUploadingDroppedAssets, setIsUploadingDroppedAssets] = useState(false);
  const [results, setResults] = useState<ProductImageResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [uploaderResetKey, setUploaderResetKey] = useState(0);
  const [rightPanel, setRightPanel] = useState<'preview' | 'history'>('preview');
  const [historyItems, setHistoryItems] = useState<FirstFrameHistoryItem[]>([]);
  const [lastElapsedSeconds, setLastElapsedSeconds] = useState<number | null>(null);
  const [resultCreatedAt, setResultCreatedAt] = useState<string>('');
  const [resultParams, setResultParams] = useState<Partial<FirstFrameParams> | null>(null);
  const [resultSelectionKey, setResultSelectionKey] = useState<string>('');
  const [loadingTheme, setLoadingTheme] = useState<LoadingTheme>(getDefaultLoadingTheme());
  const [loadingBackgroundSrc, setLoadingBackgroundSrc] = useState<string>('');
  const [isAsyncGenerating, setIsAsyncGenerating] = useState(false);
  const [resultAspectRatio, setResultAspectRatio] = useState<string>('9:16');
  const [userExampleTemplates, setUserExampleTemplates] = useState<FirstFrameExampleTemplate[]>([]);
  const [exampleParams, setExampleParams] = useState<Partial<FirstFrameParams>>({});
  const [currentFormParams, setCurrentFormParams] = useState<FirstFrameParams>({
    prompt: '',
    openingScene: 'person_selling',
    aspectRatio: '9:16',
    model: 'nano-banana-pro',
    resolution: '1k',
    outputCount: 4,
  });
  const [exampleApplyVersion, setExampleApplyVersion] = useState(0);
  const [isApplyingExample, setIsApplyingExample] = useState(false);
  const [isSavingExampleSnapshot, setIsSavingExampleSnapshot] = useState(false);
  const [isDeletingExampleSnapshot, setIsDeletingExampleSnapshot] = useState(false);
  const [isExamplesCollapsed, setIsExamplesCollapsed] = useState(false);
  const [isSaveDraftDialogOpen, setIsSaveDraftDialogOpen] = useState(false);
  const [draftName, setDraftName] = useState(defaultFirstFrameDraftName);
  const [draftError, setDraftError] = useState('');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isDraftSavedDialogOpen, setIsDraftSavedDialogOpen] = useState(false);

  const generationSeqRef = useRef(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressStartedAtRef = useRef<number | null>(null);

  const isGenerating = phase === 'generating' || isAsyncGenerating;
  const showFullScreenGenerating = phase === 'generating' && !isAsyncGenerating;
  const hasResults = results.length > 0;
  const translateExampleText = useCallback((key: string | undefined, fallback?: string) => {
    const fallbackText = String(fallback || '');
    if (!key) return fallbackText;
    const value = (t as Record<string, string | undefined>)[key];
    return value || fallbackText;
  }, [t]);

  const builtInExampleTemplates = useMemo(
    () => FIRST_FRAME_EXAMPLE_TEMPLATES.map((item) => ({
      ...item,
      title: translateExampleText(item.titleKey, item.title),
      subtitle: translateExampleText(item.subtitleKey, item.subtitle),
    })),
    [translateExampleText]
  );

  const firstFrameExamples = useMemo(
    () => [...builtInExampleTemplates, ...userExampleTemplates],
    [builtInExampleTemplates, userExampleTemplates]
  );

  const refreshWorkspaceHistory = useCallback(async () => {
    await refreshImageHistory();
    const filtered = (readImageHistoryByFeature('first_frame')
      .map((item) => mapImageHistoryToFirstFrameItem(item))
      .filter(Boolean) as FirstFrameHistoryItem[])
      .filter((item) => item.workspaceId === workspaceId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    setHistoryItems(filtered);
  }, [workspaceId]);

  useEffect(() => {
    void refreshWorkspaceHistory();
    return subscribeImageHistory(() => {
      void refreshWorkspaceHistory();
    });
  }, [refreshWorkspaceHistory]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const resp = await apiRequest<any>('/api/projects/first-frame/example-snapshots', {
          method: 'GET',
          fallbackMessage: t.ff_error_generation_failed,
        });
        if (canceled) return;
        const items = Array.isArray(resp?.data?.items) ? resp.data.items : [];
        const templates = items
          .map((row: any) => {
            const id = String(row?.id || '').trim();
            const title = String(row?.title || '').trim();
            const subtitle = String(row?.subtitle || '').trim();
            const previewUrl = String(row?.preview_url || '').trim();
            const settings = row?.settings_snapshot && typeof row.settings_snapshot === 'object' && !Array.isArray(row.settings_snapshot)
              ? row.settings_snapshot
              : {};
            const inputImageUrls = Array.isArray(settings?.inputImageUrls)
              ? settings.inputImageUrls.map((v: any) => String(v || '').trim()).filter(Boolean).slice(0, 4)
              : [];
            const resultImageUrls = Array.isArray(settings?.resultImageUrls)
              ? settings.resultImageUrls.map((v: any) => String(v || '').trim()).filter(Boolean).slice(0, 4)
              : [];
            const paramsSeed = settings?.params && typeof settings.params === 'object' && !Array.isArray(settings.params)
              ? settings.params
              : {};
            if (!id || !title || !previewUrl) return null;
            return {
              id,
              title,
              subtitle,
              previewUrl,
              inputImageUrls,
              resultImageUrls,
              params: {
                openingScene: paramsSeed.openingScene,
                prompt: String(paramsSeed.prompt || '').trim(),
                aspectRatio: paramsSeed.aspectRatio,
                outputCount: paramsSeed.outputCount,
                model: 'nano-banana-pro',
              },
              isUserSnapshot: true,
            } as FirstFrameExampleTemplate;
          })
          .filter(Boolean)
          .slice(0, FIRST_FRAME_USER_EXAMPLE_LIMIT) as FirstFrameExampleTemplate[];
        setUserExampleTemplates(templates);
      } catch {
        if (!canceled) setUserExampleTemplates([]);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [t.ff_error_generation_failed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setIsExamplesCollapsed(window.localStorage.getItem(FIRST_FRAME_EXAMPLES_COLLAPSED_KEY) === '1');
    } catch {
      // Ignore localStorage read failures.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FIRST_FRAME_EXAMPLES_COLLAPSED_KEY, isExamplesCollapsed ? '1' : '0');
    } catch {
      // Ignore localStorage write failures.
    }
  }, [isExamplesCollapsed]);

  useEffect(() => {
    let alive = true;
    if (images.length === 0) {
      setLoadingTheme(getDefaultLoadingTheme());
      setLoadingBackgroundSrc('');
      return;
    }

    const objectUrls = images.map((file) => URL.createObjectURL(file));
    setLoadingBackgroundSrc(objectUrls[0] || '');
    void extractLoadingThemeFromSources(objectUrls).then((theme) => {
      if (alive) setLoadingTheme(theme);
    });

    return () => {
      alive = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [images]);

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!draftToApply || draftToApply.workspaceId !== workspaceId) return;
    const files = draftToApply.snapshot.images
      .map((image, index) => draftImageToFile(image, index))
      .filter(Boolean) as File[];
    const params = normalizeFirstFrameDraftParams(draftToApply.snapshot.params);
    generationSeqRef.current += 1;
    clearProgressTimer();
    progressStartedAtRef.current = null;
    setImages(files);
    setUploaderResetKey((prev) => prev + 1);
    setExampleParams(params);
    setCurrentFormParams(params);
    setExampleApplyVersion((prev) => prev + 1);
    setResults([]);
    setResultSelectionKey('');
    setResultAspectRatio(params.aspectRatio || '9:16');
    setLastElapsedSeconds(null);
    setResultCreatedAt('');
    setResultParams(params);
    setIsAsyncGenerating(false);
    setProgress(0);
    setError(null);
    setRightPanel('preview');
    setPhase(files.length > 0 ? 'form' : 'upload');
    onDraftApplied?.(draftToApply.id);
  }, [clearProgressTimer, draftToApply, onDraftApplied, workspaceId]);

  const startProgressSimulation = useCallback(() => {
    clearProgressTimer();
    progressStartedAtRef.current = Date.now();
    setProgress((prev) => Math.max(2, prev));

    progressTimerRef.current = window.setInterval(() => {
      const startedAt = progressStartedAtRef.current;
      if (!startedAt) return;

      const elapsedMs = Math.max(0, Date.now() - startedAt);
      const ratio = Math.max(0, Math.min(1, elapsedMs / (FIRST_FRAME_COUNTDOWN_SECONDS * 1000)));
      const eased = 1 - Math.pow(1 - ratio, 1.8);
      const simulated = Math.round(eased * FIRST_FRAME_PROGRESS_HOLD_MAX);

      setProgress((prev) => Math.max(prev, Math.min(FIRST_FRAME_PROGRESS_HOLD_MAX, Math.max(2, simulated))));
    }, 800);
  }, [clearProgressTimer]);

  useEffect(() => () => {
    clearProgressTimer();
  }, [clearProgressTimer]);

  const isTerminalFirstFrameStatus = (status: string) => (
    ['succeeded', 'success', 'completed', 'done', 'ready', 'failed', 'error', 'cancelled', 'canceled', 'rejected']
      .includes(String(status || '').trim().toLowerCase())
  );

  const isSuccessfulFirstFrameStatus = (status: string) => (
    ['succeeded', 'success', 'completed', 'done', 'ready']
      .includes(String(status || '').trim().toLowerCase())
  );

  const isNonRetryableFirstFramePollError = (err: unknown) => {
    const status = Number((err as any)?.status || 0);
    if (status === 400 || status === 404) return true;
    const message = String((err as any)?.message || err || '').trim().toLowerCase();
    return [
      'not found',
      'not exist',
      'invalid request',
      'invalid request_id',
      'request_id is required',
      'first-frame task not found',
    ].some((marker) => message.includes(marker));
  };

  const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const handleImagesSelected = useCallback((files: File[]) => {
    setImages(files);
    setError(null);
    setProgress(0);
    setResults([]);
    setLastElapsedSeconds(null);
    setResultCreatedAt('');
    setResultParams(null);
    setIsAsyncGenerating(false);
    setPhase(files.length > 0 ? 'form' : 'upload');
  }, []);

  const validateFirstFrameLibraryUploadFiles = (files: File[]) => {
    if (files.length === 0) return '';
    if (files.length + images.length > FIRST_FRAME_ASSET_PICKER_MAX_COUNT) {
      return t.ff_upload_error_max_count
        ? `${t.ff_upload_error_max_count} ${FIRST_FRAME_ASSET_PICKER_MAX_COUNT} ${t.ff_upload_image_unit}`
        : (t.ff_asset_picker_limit_reached || 'Selection limit reached');
    }
    for (const file of files) {
      if (!FIRST_FRAME_ASSET_PICKER_ACCEPTED_FORMATS.includes(file.type)) {
        return `${file.name}: ${t.ff_upload_error_format}`;
      }
      if (file.size > FIRST_FRAME_ASSET_PICKER_MAX_FILE_SIZE) {
        return `${file.name}: ${t.ff_upload_error_too_large} ${Math.ceil(FIRST_FRAME_ASSET_PICKER_MAX_FILE_SIZE / 1024 / 1024)}MB`;
      }
    }
    return '';
  };

  const loadExampleFiles = async (imageUrls: string[], seedName: string) => {
    const files: File[] = [];
    for (let index = 0; index < imageUrls.length; index += 1) {
      const url = String(imageUrls[index] || '').trim();
      if (!url) continue;
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) throw new Error(t.ff_error_generation_failed);
      const blob = await resp.blob();
      const mime = String(blob.type || '').trim() || 'image/jpeg';
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
      files.push(new File([blob], `first-frame-example-${seedName}-${index + 1}.${ext}`, { type: mime }));
    }
    return files;
  };

  const loadPickedAssetFiles = async (assets: FirstFramePickedAsset[]) => {
    const files: File[] = [];
    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index];
      const url = String(asset.fileUrl || '').trim();
      if (!url) continue;
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) throw new Error(t.ff_error_generation_failed);
      const blob = await resp.blob();
      const mime = String(blob.type || '').trim() || 'image/jpeg';
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
      const safeName = String(asset.name || `asset-${index + 1}`).replace(/\.[^.]+$/i, '');
      files.push(new File([blob], `${safeName}.${ext}`, { type: mime }));
    }
    return files;
  };

  const handleAssetPickerConfirm = async (assets: FirstFramePickedAsset[]) => {
    if (assets.length === 0) return;
    const remainingSlots = Math.max(0, FIRST_FRAME_ASSET_PICKER_MAX_COUNT - images.length);
    if (assets.length > remainingSlots) {
      setError({
        code: 'UPLOAD_ERROR',
        message: t.ff_upload_error_max_count
          ? `${t.ff_upload_error_max_count} ${FIRST_FRAME_ASSET_PICKER_MAX_COUNT} ${t.ff_upload_image_unit}`
          : (t.ff_asset_picker_limit_reached || 'Selection limit reached'),
        severity: 'warning',
      });
      return;
    }

    try {
      const files = await loadPickedAssetFiles(assets);
      if (files.length === 0) return;
      handleImagesSelected([...images, ...files]);
      setIsAssetPickerOpen(false);
    } catch (err: unknown) {
      setError({
        code: 'ASSET_LOAD_FAILED',
        message: err instanceof Error ? err.message : t.ff_error_generation_failed,
        severity: 'warning',
      });
    }
  };

  const handleFilesDroppedToLibrary = async (files: File[]) => {
    if (isUploadingDroppedAssets || files.length === 0) return;
    if (!requireAuth()) return;
    const validationError = validateFirstFrameLibraryUploadFiles(files);
    if (validationError) {
      setError({
        code: 'UPLOAD_ERROR',
        message: validationError,
        severity: 'warning',
      });
      return;
    }

    setIsUploadingDroppedAssets(true);
    try {
      const uploadedAssetIds: string[] = [];
      for (const file of files) {
        const response = await assetsApi.uploadAsset(file, 'product', null);
        const raw = (response as { data?: Partial<Asset> & { url?: string; path?: string; display_name?: string } }).data || response;
        const record = raw as Partial<Asset> & { url?: string; path?: string; display_name?: string };
        const id = String(record.id || '').trim();
        if (id) uploadedAssetIds.push(id);
      }

      const uploadedIdSet = new Set(uploadedAssetIds);
      const libraryItems = uploadedIdSet.size > 0
        ? await assetsApi.getAssets({ type: 'product', folderId: null })
        : [];
      const assets: FirstFramePickedAsset[] = libraryItems
        .filter((asset) => uploadedIdSet.has(asset.id))
        .map((asset) => ({
          id: asset.id,
          tab: 'image',
          assetType: 'product',
          name: asset.name,
          fileUrl: asset.file_url,
          thumbnail: asset.thumbnail,
        }));

      const uploadedFiles = await loadPickedAssetFiles(assets);
      if (uploadedFiles.length > 0) handleImagesSelected([...images, ...uploadedFiles]);
    } catch (err: unknown) {
      setError({
        code: 'ASSET_UPLOAD_FAILED',
        message: err instanceof Error
          ? err.message
          : (t.pg_main_toast_image_upload_failed_retry || t.ff_error_generation_failed),
        severity: 'warning',
      });
    } finally {
      setIsUploadingDroppedAssets(false);
    }
  };

  const applyFirstFrameExample = async (exampleId: string) => {
    if (!requireAuth()) return;
    if (isGenerating || isApplyingExample) return;
    const template = firstFrameExamples.find((item) => item.id === exampleId) || null;
    if (!template) return;

    setIsApplyingExample(true);
    try {
      const files = await loadExampleFiles(template.inputImageUrls, template.id);
      if (files.length === 0) {
        setError({
          code: 'EXAMPLE_LOAD_FAILED',
          message: t.ff_error_upload_product_image_first,
          severity: 'warning',
        });
        return;
      }
      const promptForLanguage = template.isUserSnapshot
        ? String(template.params.prompt || '')
        : translateExampleText(template.promptKey, '');
      const paramsForLanguage: FirstFrameParams = {
        ...template.params,
        prompt: promptForLanguage || String(template.params.prompt || ''),
        model: 'nano-banana-pro',
      };

      setImages(files);
      setExampleParams(paramsForLanguage);
      setCurrentFormParams({
        ...paramsForLanguage,
      });
      setResultParams({
        ...paramsForLanguage,
      });
      setResultCreatedAt('');
      setExampleApplyVersion((prev) => prev + 1);
      setResults([]);
      const restoredResults: ProductImageResult[] = (template.resultImageUrls || [])
        .map((url, index) => String(url || '').trim()
          ? {
              id: `first-frame-example-result-${template.id}-${index}`,
              imageUrl: String(url || '').trim(),
              downloadUrl: String(url || '').trim(),
              format: 'jpg',
              category: 'frame',
              generationStatus: 'succeeded',
              metadata: {
                source: 'example',
                exampleId: template.id,
              },
            }
          : null)
        .filter(Boolean) as ProductImageResult[];
      if (restoredResults.length > 0) {
        setResults(restoredResults);
        setResultSelectionKey(`example:${template.id}:${Date.now()}`);
      }
      setProgress(0);
      setLastElapsedSeconds(null);
      setResultAspectRatio(paramsForLanguage.aspectRatio || '9:16');
      setRightPanel('preview');
      setError(null);
      setPhase('form');
    } catch (err: any) {
      setError({
        code: 'EXAMPLE_LOAD_FAILED',
        message: String(err?.message || t.ff_error_generation_failed),
        severity: 'error',
      });
    } finally {
      setIsApplyingExample(false);
    }
  };

  const saveFirstFrameExampleSnapshot = async () => {
    if (!requireAuth()) return;
    if (isSavingExampleSnapshot) return;
    if (images.length === 0) {
      setError({
        code: 'NO_IMAGES',
        message: t.ff_error_upload_product_image_first,
        severity: 'warning',
      });
      return;
    }

    setIsSavingExampleSnapshot(true);
    try {
      const uploadedImagePaths: string[] = [];
      for (const file of images.slice(0, 4)) {
        const uploadResp = await assetsApi.uploadAsset(file, 'PRODUCT', undefined, { bundleOnly: true });
        const url = String((uploadResp as any)?.data?.url || '').trim();
        if (url) uploadedImagePaths.push(url);
      }
      if (uploadedImagePaths.length === 0) throw new Error(t.ff_error_generation_failed);

      const succeededCover = results.find((item) => Boolean(String(item.imageUrl || '').trim()) && item.generationStatus !== 'failed');
      const resultImageUrls = results
        .filter((item) => Boolean(String(item.imageUrl || '').trim()) && item.generationStatus !== 'failed')
        .map((item) => String(item.imageUrl || '').trim())
        .slice(0, 4);
      const coverImage = String(succeededCover?.imageUrl || uploadedImagePaths[0] || '').trim();
      const params: FirstFrameParams = {
        model: 'nano-banana-pro',
        openingScene: currentFormParams.openingScene || 'person_selling',
        prompt: String(currentFormParams.prompt || '').trim(),
        aspectRatio: currentFormParams.aspectRatio || resultAspectRatio as any || '9:16',
        resolution: currentFormParams.resolution || '1k',
        outputCount: currentFormParams.outputCount || 1,
      };
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const title = params.openingScene === 'brand_ad' ? '品牌广告大片' : 'AI首帧图示例';
      const subtitle = `保存当前工作区快照 · ${stamp}`;
      const settingsSnapshot = {
        inputImageUrls: uploadedImagePaths,
        resultImageUrls,
        params,
      };

      const resp = await apiRequest<any>('/api/projects/first-frame/example-snapshots', {
        method: 'POST',
        body: {
          title,
          subtitle,
          cover_image: coverImage,
          settings_snapshot: settingsSnapshot,
        },
        fallbackMessage: t.ff_error_generation_failed,
      });
      const created = resp?.data?.item || null;
      const createdId = String(created?.id || '').trim();
      const previewUrl = String(created?.preview_url || coverImage).trim();
      if (createdId && previewUrl) {
        setUserExampleTemplates((prev) => [
          ...prev,
          {
            id: createdId,
            title: String(created?.title || title).trim(),
            subtitle: String(created?.subtitle || subtitle).trim(),
            previewUrl,
            inputImageUrls: uploadedImagePaths,
            resultImageUrls,
            params,
            isUserSnapshot: true,
          },
        ].slice(-FIRST_FRAME_USER_EXAMPLE_LIMIT));
      }
    } catch (err: any) {
      setError({
        code: 'SAVE_EXAMPLE_FAILED',
        message: String(err?.message || t.ff_error_generation_failed),
        severity: 'error',
      });
    } finally {
      setIsSavingExampleSnapshot(false);
    }
  };

  const deleteFirstFrameExampleSnapshot = async (snapshotId: string) => {
    if (!requireAuth()) return;
    if (isDeletingExampleSnapshot) return;
    const id = String(snapshotId || '').trim();
    if (!id) return;

    setIsDeletingExampleSnapshot(true);
    try {
      await apiRequest<any>(`/api/projects/first-frame/example-snapshots/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        fallbackMessage: t.ff_error_generation_failed,
      });
      setUserExampleTemplates((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      setError({
        code: 'DELETE_EXAMPLE_FAILED',
        message: String(err?.message || t.ff_error_generation_failed),
        severity: 'error',
      });
    } finally {
      setIsDeletingExampleSnapshot(false);
    }
  };

  const handleGenerateFormSubmit = async (params: FirstFrameParams) => {
    if (!requireAuth()) return;
    setCurrentFormParams(params);
    setResultParams(params);
    if (images.length === 0) {
      setError({
        code: 'NO_IMAGES',
        message: t.ff_error_upload_product_image_first,
        severity: 'warning',
      });
      return;
    }

    const runSeq = generationSeqRef.current + 1;
    generationSeqRef.current = runSeq;

    try {
      setPhase('generating');
      setRightPanel('preview');
      setError(null);
      setResultAspectRatio(params.aspectRatio || '9:16');
      setResultCreatedAt(new Date().toISOString());
      setProgress(2);
      startProgressSimulation();

      const response = await productImagesApi.generateFirstFrame(images, params, projectId, {
        workspaceId,
      });
      if (generationSeqRef.current !== runSeq) return;

      if (response.isAsync && response.requests && response.requests.length > 0) {
        const placeholders: ProductImageResult[] = response.requests
          .slice()
          .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
          .map((item, index) => ({
            id: `first-frame-async-${item.requestId}`,
            imageUrl: '',
            downloadUrl: '',
            format: 'jpg',
            category: 'frame',
            generationStatus: 'processing',
            metadata: {
              requestId: item.requestId,
              status: item.status,
              outputIndex: item.outputIndex ?? index + 1,
              sortOrder: item.sortOrder ?? index,
              historyRecordId: response.historyRecordId,
              historyAssetIndex: item.sortOrder ?? index,
              frameRole: item.frameRole,
              role: item.role,
            },
          }));

        setProgress(8);

        const startedAt = progressStartedAtRef.current || Date.now();
        let hasRevealedResults = false;
        setResults(placeholders);

        await Promise.all(response.requests.map(async (requestItem, index) => {
          const requestId = String(requestItem.requestId || '').trim();
          if (!requestId) return;

          for (let attempt = 0; attempt < FIRST_FRAME_ASYNC_POLL_MAX_ATTEMPTS; attempt += 1) {
            if (generationSeqRef.current !== runSeq) return;
            if (attempt > 0) await sleep(FIRST_FRAME_ASYNC_POLL_INTERVAL_MS);
            if (generationSeqRef.current !== runSeq) return;

            try {
              const poll = await productImagesApi.getFirstFrameResult(requestId);
              const status = String(poll.status || '').trim().toLowerCase();
              const imageUrl = String(poll.imageUrl || '').trim();

              if (imageUrl) {
                if (!hasRevealedResults) {
                  hasRevealedResults = true;
                  setResultSelectionKey(`generation:${workspaceId}:${Date.now()}:async`);
                  setPhase('result');
                  setIsAsyncGenerating(true);
                }
                setResults((prev) => prev.map((item) => (
                  String(item.metadata?.requestId || '') === requestId
                    ? {
                        ...item,
                        imageUrl,
                        downloadUrl: imageUrl,
                        generationStatus: 'succeeded',
                        errorMessage: '',
                        metadata: {
                          ...(item.metadata || {}),
                          ...(poll.metadata || {}),
                          status,
                          requestId,
                        },
                      }
                    : item
                )));
                return;
              }

              if (isTerminalFirstFrameStatus(status)) {
                setResults((prev) => prev.map((item) => (
                  String(item.metadata?.requestId || '') === requestId
                    ? {
                        ...item,
                        generationStatus: isSuccessfulFirstFrameStatus(status) ? 'failed' : 'failed',
                        errorMessage: poll.error || t.ff_error_generation_failed,
                        metadata: {
                          ...(item.metadata || {}),
                          ...(poll.metadata || {}),
                          status,
                          requestId,
                        },
                      }
                    : item
                )));
                return;
              }
            } catch (pollError) {
              if (isNonRetryableFirstFramePollError(pollError) || attempt >= FIRST_FRAME_ASYNC_POLL_MAX_ATTEMPTS - 1) {
                setResults((prev) => prev.map((item) => (
                  String(item.metadata?.requestId || '') === requestId
                    ? {
                        ...item,
                        generationStatus: 'failed',
                        errorMessage: pollError instanceof Error ? pollError.message : t.ff_error_generation_failed,
                        metadata: {
                          ...(item.metadata || {}),
                          status: 'failed',
                          requestId,
                        },
                      }
                    : item
                )));
                return;
              }
            }

            setProgress((prev) => Math.max(prev, Math.min(FIRST_FRAME_PROGRESS_HOLD_MAX, 8 + Math.round(((index + 1) / response.requests!.length) * 20))));
          }

          setResults((prev) => prev.map((item) => (
            String(item.metadata?.requestId || '') === requestId
              ? {
                  ...item,
                  generationStatus: 'failed',
                  errorMessage: t.ff_error_generation_failed,
                  metadata: {
                    ...(item.metadata || {}),
                    status: 'timeout',
                    requestId,
                  },
                }
              : item
          )));
        }));

        if (generationSeqRef.current !== runSeq) return;
        clearProgressTimer();
        setProgress(100);
        setIsAsyncGenerating(false);
        const completedElapsedSeconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
        setLastElapsedSeconds(completedElapsedSeconds);
        progressStartedAtRef.current = null;
        if (!hasRevealedResults) {
          setResults([]);
          setError({
            code: 'GENERATION_FAILED',
            message: t.ff_error_generation_failed,
            severity: 'error',
            suggestion: t.ff_error_suggestion_clear_front_image,
          });
          setPhase(images.length > 0 ? 'form' : 'upload');
          return;
        }
        await refreshWorkspaceHistory();
        notifyImageHistoryUpdated();
        return;
      }

      clearProgressTimer();
      setProgress(100);
      const completedElapsedSeconds = progressStartedAtRef.current
        ? Math.max(1, Math.floor((Date.now() - progressStartedAtRef.current) / 1000))
        : null;
      setLastElapsedSeconds(completedElapsedSeconds);
      progressStartedAtRef.current = null;

      if (response.status === 'completed' && response.outputImages && response.outputImages.length > 0) {
        setResults(response.outputImages);
        setResultSelectionKey(`generation:${workspaceId}:${Date.now()}`);
        await refreshWorkspaceHistory();
        notifyImageHistoryUpdated();
        setPhase('result');
        return;
      }

      setError({
        code: 'GENERATION_FAILED',
        message: t.ff_error_generation_failed,
        severity: 'error',
        suggestion: t.ff_error_suggestion_clear_front_image,
      });
      setPhase(images.length > 0 ? 'form' : 'upload');
    } catch (err) {
      if (generationSeqRef.current !== runSeq) return;

      clearProgressTimer();
      setIsAsyncGenerating(false);
      const message = err instanceof Error ? err.message : t.ff_unknown_error;
      setError({
        code: 'GENERATION_ERROR',
        message,
        severity: 'error',
        suggestion: t.ff_error_suggestion_check_network,
      });
      setPhase(images.length > 0 ? 'form' : 'upload');
    }
  };

  const handleCancelGeneration = () => {
    generationSeqRef.current += 1;
    clearProgressTimer();
    progressStartedAtRef.current = null;
    setLastElapsedSeconds(null);
    setResultParams(null);
    setIsAsyncGenerating(false);
    setPhase(images.length > 0 ? 'form' : 'upload');
    setProgress(0);
  };

  const handleRegenerate = () => {
    setResults([]);
    setLastElapsedSeconds(null);
    setResultParams(null);
    setIsAsyncGenerating(false);
    setPhase('form');
    setProgress(0);
    setError(null);
    setRightPanel('preview');
  };

  const handleResetLayout = useCallback(() => {
    generationSeqRef.current += 1;
    clearProgressTimer();
    progressStartedAtRef.current = null;

    setImages([]);
    setUploaderResetKey((prev) => prev + 1);
    setExampleParams({});
    setCurrentFormParams({
      prompt: '',
      openingScene: 'person_selling',
      aspectRatio: '9:16',
      model: 'nano-banana-pro',
      resolution: '1k',
      outputCount: 4,
    });
    setExampleApplyVersion((prev) => prev + 1);
    setResults([]);
    setResultSelectionKey('');
    setResultAspectRatio('9:16');
    setLastElapsedSeconds(null);
    setResultCreatedAt('');
    setResultParams(null);
    setIsAsyncGenerating(false);
    setProgress(0);
    setError(null);
    setRightPanel('preview');
    setPhase('upload');
  }, [clearProgressTimer]);

  const openSaveDraftDialog = () => {
    setDraftName(defaultFirstFrameDraftName(t.ff_draft_default_name_prefix));
    setDraftError('');
    setIsSaveDraftDialogOpen(true);
  };

  const confirmSaveDraft = async () => {
    const name = draftName.trim();
    if (!name) {
      setDraftError(t.ff_draft_name_required);
      return;
    }
    setIsSavingDraft(true);
    setDraftError('');
    try {
      const draftImages = await Promise.all(images.slice(0, FIRST_FRAME_ASSET_PICKER_MAX_COUNT).map(fileToDraftImage));
      onSaveDraft?.(name, {
        params: normalizeFirstFrameDraftParams(currentFormParams),
        images: draftImages,
      });
      setIsSaveDraftDialogOpen(false);
      setIsDraftSavedDialogOpen(true);
    } catch {
      setDraftError(t.ff_draft_save_failed);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const buildFileName = useCallback((prefix: string, index: number) => {
    const safePrefix = prefix.trim() || 'ai_first_frame';
    return `${safePrefix}_${index + 1}.jpg`;
  }, []);

  const handleDownload = async (imageId: string, filename?: string) => {
    try {
      const index = results.findIndex((item) => item.id === imageId);
      const selected = index >= 0 ? results[index] : null;
      if (!selected) return;

      const blob = await productImagesApi.downloadImageByUrl(selected.imageUrl);
      const nextName = filename || buildFileName('ai_first_frame', Math.max(index, 0));
      await saveBlobWithPickerFallback(blob, nextName);
    } catch {
      setError({
        code: 'DOWNLOAD_FAILED',
        message: t.ff_error_download_failed,
        severity: 'error',
      });
    }
  };

  const handleDownloadAll = async (prefix: string) => {
    for (let i = 0; i < results.length; i += 1) {
      const item = results[i];
      if (!item.imageUrl || item.generationStatus === 'failed') continue;
      // Keep sequential order so filenames are deterministic.
      // eslint-disable-next-line no-await-in-loop
      await handleDownload(item.id, buildFileName(prefix, i));
    }
  };

  const applyToWorkbench = (image: ProductImageResult, targetModel: FirstFrameVideoTargetModel) => {
    const payload = {
      source: 'first_frame_result_to_video' as const,
      imageUrl: image.imageUrl,
      imageName: t.ff_ai_first_frame_name,
      targetModel,
      timestamp: new Date().toISOString(),
      firstFrameWorkspaceId: workspaceId,
    };

    writeFirstFrameToVideoTransfer({
      source: payload.source,
      imageUrl: payload.imageUrl,
      imageName: payload.imageName,
      targetModel: payload.targetModel,
      timestamp: payload.timestamp,
      workspaceId: payload.firstFrameWorkspaceId,
    });
    onApplyToWorkbench?.();
  };

  const buildAssetFileName = (image: ProductImageResult, index: number) => {
    const rawFormat = String(image.format || '').trim().toLowerCase();
    const url = String(image.imageUrl || '').toLowerCase();
    const extension = rawFormat
      || (url.endsWith('.png') ? 'png' : '')
      || (url.endsWith('.webp') ? 'webp' : '')
      || 'jpg';

    const normalizedExtension = extension === 'jpeg' ? 'jpg' : extension;
    return buildFileName('ai_first_frame', Math.max(index, 0)).replace(/\.jpg$/i, `.${normalizedExtension}`);
  };

  const handleSaveToAssets = async (imageId: string): Promise<boolean> => {
    if (!requireAuth()) return false;

    const image = results.find((r) => r.id === imageId);
    if (!image) {
      throw new Error('Selected image not found');
    }

    try {
      const index = results.findIndex((item) => item.id === imageId);
      const blob = await productImagesApi.downloadImageByUrl(image.imageUrl);
      const fileName = buildAssetFileName(image, index);
      const fileType = blob.type || `image/${fileName.toLowerCase().endsWith('.png') ? 'png' : fileName.toLowerCase().endsWith('.webp') ? 'webp' : 'jpeg'}`;
      const file = new File([blob], fileName, { type: fileType });
      await assetsApi.uploadAsset(file, 'product');
      return true;
    } catch (error) {
      setError({
        code: 'SAVE_TO_ASSETS_FAILED',
        message: t.ff_error_save_to_image_assets_failed,
        severity: 'error',
      });
      throw error;
    }
  };

  const handleNextStep = (imageId: string, targetModel: FirstFrameVideoTargetModel) => {
    const image = results.find((r) => r.id === imageId);
    if (!image) return;
    applyToWorkbench(image, targetModel);
  };

  const handleReplaceResultImage = async (imageId: string, imageUrl: string) => {
    const cleaned = String(imageUrl || '').trim();
    if (!cleaned) return;
    const current = results.find((item) => item.id === imageId);
    const historyRecordId = String(current?.metadata?.historyRecordId || '').trim();
    const rawHistoryAssetIndex = Number(current?.metadata?.historyAssetIndex ?? current?.metadata?.sortOrder);
    const historyAssetIndex = Number.isInteger(rawHistoryAssetIndex) && rawHistoryAssetIndex >= 0
      ? rawHistoryAssetIndex
      : -1;

    setResults((prev) => prev.map((item) => (
      item.id === imageId
        ? { ...item, imageUrl: cleaned, downloadUrl: cleaned, generationStatus: 'succeeded' }
        : item
    )));
    if (historyRecordId && historyAssetIndex >= 0) {
      await replaceImageHistoryAsset(historyRecordId, historyAssetIndex, cleaned);
      await refreshWorkspaceHistory();
    }
  };

  const handleErrorRetry = () => {
    setError(null);
    if (phase !== 'generating' && phase !== 'result') {
      setPhase(images.length > 0 ? 'form' : 'upload');
    }
  };

  const activateHistoryItem = (item: FirstFrameHistoryItem) => {
    if (!item.outputImages || item.outputImages.length === 0) return;
    setResults(item.outputImages);
    setLastElapsedSeconds(item.elapsedSeconds);
    setResultCreatedAt(item.createdAt);
    if (item.params) {
      setCurrentFormParams((prev) => ({ ...prev, ...item.params }));
      setResultParams(item.params);
      if (item.params.aspectRatio) setResultAspectRatio(item.params.aspectRatio);
    } else {
      setResultParams(null);
    }
    setResultSelectionKey(`history:${item.id}:${item.createdAt}`);
    setPhase('result');
    setProgress(100);
    setRightPanel('preview');
    setError(null);
  };

  const formatHistoryTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const historyOpeningSceneLabel = useCallback((scene: FirstFrameParams['openingScene']) => {
    switch (scene) {
      case 'product_showcase':
        return t.ff_opening_scene_product_showcase;
      case 'usage_demo':
        return t.ff_opening_scene_usage_demo;
      case 'brand_ad':
        return t.ff_opening_scene_brand_ad;
      case 'person_selling':
      default:
        return t.ff_opening_scene_person_selling;
    }
  }, [t]);

  const clampPanelWidth = useCallback((requested: number, min: number, max: number) => (
    Math.min(Math.max(requested, min), max)
  ), []);

  const computeDefaultPanelWidths = useCallback((containerWidth: number) => {
    const leftRaw = (containerWidth * FIRST_FRAME_DEFAULT_LEFT_RATIO) / FIRST_FRAME_DEFAULT_TOTAL_RATIO;
    const middleRaw = (containerWidth * FIRST_FRAME_DEFAULT_MIDDLE_RATIO) / FIRST_FRAME_DEFAULT_TOTAL_RATIO;

    let nextLeft = clampPanelWidth(leftRaw, FIRST_FRAME_PANEL_MIN_WIDTH, FIRST_FRAME_PANEL_MAX_WIDTH);
    let nextMiddle = clampPanelWidth(middleRaw, FIRST_FRAME_PANEL_MIN_WIDTH, FIRST_FRAME_PANEL_MAX_WIDTH);

    const maxMiddleByContainer = containerWidth - nextLeft - FIRST_FRAME_PANEL_MIN_WIDTH;
    nextMiddle = Math.max(
      FIRST_FRAME_PANEL_MIN_WIDTH,
      Math.min(nextMiddle, maxMiddleByContainer)
    );

    const maxLeftByContainer = containerWidth - nextMiddle - FIRST_FRAME_PANEL_MIN_WIDTH;
    nextLeft = Math.max(
      FIRST_FRAME_PANEL_MIN_WIDTH,
      Math.min(nextLeft, maxLeftByContainer)
    );

    return { nextLeft, nextMiddle };
  }, [clampPanelWidth]);

  const resetPanelWidthsForVisibleLayout = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerWidth = container.clientWidth;
    if (!Number.isFinite(containerWidth) || containerWidth <= FIRST_FRAME_PANEL_MIN_WIDTH * 2) return;

    const { nextLeft, nextMiddle } = computeDefaultPanelWidths(containerWidth);

    setLeftWidth(nextLeft);
    setMiddleWidth(nextMiddle);
  }, [computeDefaultPanelWidths]);

  const handleLeftResize = useCallback((width: number) => {
    const requestedWidth = clampPanelWidth(width, FIRST_FRAME_PANEL_MIN_WIDTH, FIRST_FRAME_PANEL_MAX_WIDTH);
    const container = containerRef.current;
    if (!container) {
      setLeftWidth(requestedWidth);
      return;
    }

    const containerWidth = container.clientWidth;
    const safeMiddle = Math.max(middleWidth, FIRST_FRAME_PANEL_MIN_WIDTH);
    const maxLeftByContainer = containerWidth - safeMiddle - FIRST_FRAME_PANEL_MIN_WIDTH;
    const limitedWidth = Math.max(FIRST_FRAME_PANEL_MIN_WIDTH, Math.min(requestedWidth, maxLeftByContainer));
    setLeftWidth(limitedWidth);
  }, [clampPanelWidth, middleWidth]);

  const handleMiddleResize = useCallback((width: number) => {
    const requestedWidth = clampPanelWidth(width, FIRST_FRAME_PANEL_MIN_WIDTH, FIRST_FRAME_PANEL_MAX_WIDTH);
    const container = containerRef.current;
    if (!container) {
      setMiddleWidth(requestedWidth);
      return;
    }

    const containerWidth = container.clientWidth;
    const safeLeft = Math.max(leftWidth, FIRST_FRAME_PANEL_MIN_WIDTH);
    const maxMiddleByContainer = containerWidth - safeLeft - FIRST_FRAME_PANEL_MIN_WIDTH;
    const limitedWidth = Math.max(FIRST_FRAME_PANEL_MIN_WIDTH, Math.min(requestedWidth, maxMiddleByContainer));
    setMiddleWidth(limitedWidth);
  }, [clampPanelWidth, leftWidth]);

  useEffect(() => {
    if (!isVisible) return;

    const keepWidthsValid = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth;
      const safeLeft = clampPanelWidth(leftWidth, FIRST_FRAME_PANEL_MIN_WIDTH, FIRST_FRAME_PANEL_MAX_WIDTH);
      const maxMiddleByContainer = containerWidth - safeLeft - FIRST_FRAME_PANEL_MIN_WIDTH;
      const nextMiddle = Math.max(
        FIRST_FRAME_PANEL_MIN_WIDTH,
        Math.min(clampPanelWidth(middleWidth, FIRST_FRAME_PANEL_MIN_WIDTH, FIRST_FRAME_PANEL_MAX_WIDTH), maxMiddleByContainer)
      );

      const maxLeftByContainer = containerWidth - nextMiddle - FIRST_FRAME_PANEL_MIN_WIDTH;
      const nextLeft = Math.max(
        FIRST_FRAME_PANEL_MIN_WIDTH,
        Math.min(safeLeft, maxLeftByContainer)
      );

      if (nextLeft !== leftWidth) setLeftWidth(nextLeft);
      if (nextMiddle !== middleWidth) setMiddleWidth(nextMiddle);
    };

    keepWidthsValid();
    window.addEventListener('resize', keepWidthsValid);
    return () => window.removeEventListener('resize', keepWidthsValid);
  }, [clampPanelWidth, isVisible, leftWidth, middleWidth]);

  useEffect(() => {
    if (!isVisible) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const rafId = window.requestAnimationFrame(() => {
      resetPanelWidthsForVisibleLayout();
      timeoutId = window.setTimeout(() => {
        resetPanelWidthsForVisibleLayout();
      }, 120);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [isVisible, resetPanelWidthsForVisibleLayout]);

  useEffect(() => {
    if (!isVisible) return;

    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    previousContainerWidthRef.current = container.clientWidth;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const nextWidth = entry.contentRect.width;
      const prevWidth = previousContainerWidthRef.current;
      previousContainerWidthRef.current = nextWidth;

      const widthsLookCollapsed =
        leftWidth <= FIRST_FRAME_PANEL_MIN_WIDTH + 1 &&
        middleWidth <= FIRST_FRAME_PANEL_MIN_WIDTH + 1;
      const containerCanFitDefaultLayout =
        nextWidth >= FIRST_FRAME_PANEL_MIN_WIDTH * 3;

      if ((prevWidth <= 1 || widthsLookCollapsed) && containerCanFitDefaultLayout) {
        window.requestAnimationFrame(() => {
          resetPanelWidthsForVisibleLayout();
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [isVisible, leftWidth, middleWidth, resetPanelWidthsForVisibleLayout]);

  useEffect(() => {
    if (!isVisible) return;

    const updateWorkspacePanelHeight = () => {
      const root = paneRootRef.current;
      const examplesHeader = examplesHeaderRef.current;
      const viewport = root?.parentElement;
      if (!root || !examplesHeader || !viewport) return;

      const nextHeight = Math.max(
        360,
        Math.round(
          viewport.clientHeight
          - examplesHeader.offsetHeight
          - FIRST_FRAME_PANEL_VERTICAL_GAP
          - FIRST_FRAME_PANEL_BOTTOM_GAP
        )
      );

      setWorkspacePanelHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    updateWorkspacePanelHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWorkspacePanelHeight);
      return () => window.removeEventListener('resize', updateWorkspacePanelHeight);
    }

    const observer = new ResizeObserver(updateWorkspacePanelHeight);
    const root = paneRootRef.current;
    const examplesHeader = examplesHeaderRef.current;
    const viewport = root?.parentElement;
    if (viewport) observer.observe(viewport);
    if (examplesHeader) observer.observe(examplesHeader);
    window.addEventListener('resize', updateWorkspacePanelHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateWorkspacePanelHeight);
    };
  }, [isVisible]);

  return (
    <>
      <div
        ref={paneRootRef}
        className={isExamplesCollapsed ? 'flex h-full min-h-0 flex-col gap-4 pb-6' : 'flex min-h-full flex-col gap-4 pb-6'}
      >
        <div className="shrink-0">
          <div ref={examplesHeaderRef} className="flex items-center gap-2">
            <div className="text-sm font-bold text-zinc-200">{t.ff_examples_title || '示例案例'}</div>
            <button
              type="button"
              onClick={() => setIsExamplesCollapsed((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-500 transition hover:text-zinc-300"
              aria-label={isExamplesCollapsed ? (t.ff_examples_expand || '展开') : (t.ff_examples_collapse || '折叠')}
            >
              <span>{isExamplesCollapsed ? (t.ff_examples_expand || '展开') : (t.ff_examples_collapse || '折叠')}</span>
              <ChevronsDown className={`w-4 h-4 transition-transform duration-200 ${isExamplesCollapsed ? 'rotate-0' : 'rotate-180'}`} />
            </button>
          </div>
          <div
            className={[
              'grid overflow-hidden transition-[grid-template-rows,opacity] duration-300',
              'ease-[cubic-bezier(0.22,1,0.36,1)]',
              isExamplesCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
            ].join(' ')}
            aria-hidden={isExamplesCollapsed}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="flex gap-3 overflow-x-auto pt-2 pb-2 custom-scroll">
                {firstFrameExamples.map((item) => {
                  const isUserSnapshot = Boolean(item.isUserSnapshot);
                  const isBusy = Boolean(isGenerating || isApplyingExample || isSavingExampleSnapshot || isDeletingExampleSnapshot);
                  const inputThumbs = (Array.isArray(item.inputImageUrls) ? item.inputImageUrls : [])
                    .filter(Boolean)
                    .slice(0, 2);
                  if (inputThumbs.length === 0) inputThumbs.push(item.previewUrl);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void applyFirstFrameExample(item.id)}
                      disabled={isBusy}
                      className="group relative aspect-[4/3] w-[288px] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 text-left transition duration-300 hover:-translate-y-1 hover:border-white/20 disabled:opacity-60 disabled:hover:border-white/10"
                      title={isBusy ? (t.ff_examples_loading || '处理中...') : undefined}
                    >
                      <div className="relative h-full w-full">
                        <img
                          src={item.previewUrl}
                          alt={item.title}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04] group-hover:brightness-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                        <div className="absolute left-3 bottom-[62px] px-1 py-0.5">
                          <div className="mb-1 text-[11px] font-normal leading-none text-white/80">{t.ff_examples_input_material || 'Input Materials'}</div>
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
                          <div className="mt-0.5 text-[11px] leading-snug text-white/70 whitespace-normal break-words">{item.subtitle}</div>
                        </div>

                        <span className="absolute right-3 bottom-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-transparent text-white transition duration-300 group-hover:scale-110">
                          <ArrowRight className="h-4 w-4 !text-white" style={{ color: '#fff' }} />
                        </span>

                        {isUserSnapshot ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteFirstFrameExampleSnapshot(item.id);
                            }}
                            className="absolute left-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-400/35 bg-black/45 text-red-200 opacity-0 transition hover:bg-red-500/35 group-hover:opacity-100 disabled:opacity-40"
                            title={t.ff_saved_example_delete || '删除'}
                            aria-label={t.ff_saved_example_delete || '删除'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </button>
                  );
                })}

              </div>
            </div>
          </div>
        </div>

        <div
          ref={containerRef}
          className={`relative flex min-h-0 items-stretch overflow-hidden ${workspacePanelHeight ? 'shrink-0' : 'flex-1'}`}
          style={workspacePanelHeight ? { height: `${workspacePanelHeight}px` } : undefined}
        >
          <section
            className="mr-3 flex h-full min-h-0 shrink-0 flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-[width] duration-100"
            style={{ width: `${leftWidth}px`, minWidth: `${FIRST_FRAME_PANEL_MIN_WIDTH}px` }}
          >
            <div className="mb-5 shrink-0">
              <h2 className="text-lg font-semibold text-white">
                {t.ff_upload_materials}
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <ImageUploader
                key={`${workspaceId}-${uploaderResetKey}`}
                maxFiles={FIRST_FRAME_ASSET_PICKER_MAX_COUNT}
                previewVariant="first-frame"
                value={images}
                onOpenLibraryPicker={() => setIsAssetPickerOpen(true)}
                onFilesDroppedToLibrary={(files) => void handleFilesDroppedToLibrary(files)}
                onFilesSelected={handleImagesSelected}
                onError={(err) =>
                  setError({
                    code: 'UPLOAD_ERROR',
                    message: err,
                    severity: 'warning',
                  })
                }
              />
            </div>
          </section>

          <ResizableSplitter
            position={leftWidth}
            minSize={FIRST_FRAME_PANEL_MIN_WIDTH}
            onResize={handleLeftResize}
            orientation="vertical"
            className="hover:bg-orange-500/20"
            hitAreaSize={8}
            lineThickness={2}
          />

          <section
            className="mx-3 flex h-full min-h-0 shrink-0 flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-[width] duration-100"
            style={{ width: `${middleWidth}px`, minWidth: `${FIRST_FRAME_PANEL_MIN_WIDTH}px` }}
          >
            <div className="mb-5 shrink-0">
              <h2 className="text-lg font-semibold text-white">
                {t.ff_generation_settings}
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <FirstFrameForm
                images={images}
                workspaceId={workspaceId}
                defaultParams={exampleParams}
                applyVersion={exampleApplyVersion}
                isSubmitting={isGenerating}
                onChange={setCurrentFormParams}
                onSubmit={handleGenerateFormSubmit}
                onReset={handleResetLayout}
                onSaveDraft={openSaveDraftDialog}
              />
            </div>
          </section>

          <ResizableSplitter
            position={middleWidth}
            minSize={FIRST_FRAME_PANEL_MIN_WIDTH}
            onResize={handleMiddleResize}
            orientation="vertical"
            className="hover:bg-orange-500/20"
            hitAreaSize={8}
            lineThickness={2}
          />

          <section
            className="ml-3 flex h-full min-h-0 flex-1 flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-5"
            style={{ minWidth: `${FIRST_FRAME_PANEL_MIN_WIDTH}px` }}
          >
            <div className="mb-5 flex shrink-0 items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {t.ff_result_preview}
                </h2>
              </div>
              <div className="flex items-center rounded-xl border border-white/10 bg-black/20 p-1">
                <button
                  type="button"
                  onClick={() => setRightPanel('preview')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold border transition ${
                    rightPanel === 'preview'
                      ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
                      : 'border-transparent bg-transparent text-zinc-300 hover:bg-zinc-800/70'
                  }`}
                >
                  {t.ff_preview_tab}
                </button>
                <button
                  type="button"
                  onClick={() => setRightPanel('history')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold border transition ${
                    rightPanel === 'history'
                      ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
                      : 'border-transparent bg-transparent text-zinc-300 hover:bg-zinc-800/70'
                  }`}
                >
                  {t.ff_history_tab}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {rightPanel === 'preview' ? (
              showFullScreenGenerating ? (
                <div className="flex min-h-[420px] items-center justify-center">
                  <LoadingProgress
                    progress={progress}
                    countdownStartSeconds={FIRST_FRAME_COUNTDOWN_SECONDS}
                    startedAtMs={progressStartedAtRef.current || undefined}
                    currentStep={t.ff_generating_first_frame_images}
                    totalSteps={3}
                    theme={loadingTheme}
                    backgroundImageSrc={loadingBackgroundSrc}
                    onCancel={handleCancelGeneration}
                  />
                </div>
              ) : hasResults ? (
                <FirstFrameResult
                  results={results}
                  elapsedSeconds={lastElapsedSeconds}
                  selectionKey={resultSelectionKey}
                  loadingTheme={loadingTheme}
                  aspectRatio={resultAspectRatio}
                  generationParams={resultParams || undefined}
                  createdAt={resultCreatedAt}
                  onRegenerate={handleRegenerate}
                  onDownload={handleDownload}
                  onDownloadAll={handleDownloadAll}
                  onSaveToAssets={handleSaveToAssets}
                  onReplaceImage={handleReplaceResultImage}
                  onNextStep={handleNextStep}
                />
              ) : (
                <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center">
                  <div>
                    <p className="text-sm font-medium text-zinc-300">
                      {t.ff_generate_after_finishing_settings}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {t.ff_generated_images_will_appear_here}
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="min-h-[420px] rounded-2xl border border-dashed border-white/10 bg-black/20 p-4">
                {historyItems.length === 0 ? (
                  <div className="h-full min-h-[380px] flex items-center justify-center text-zinc-500 text-sm">
                    {t.ff_no_history_yet}
                  </div>
                ) : (
                  <div className="space-y-3 pr-1">
                    {historyItems.map((item) => (
                      <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
                        <div className="px-3 py-2 border-b border-white/10 bg-black/40 flex items-center justify-between text-xs text-zinc-400">
                          <span>{workspaceLabel}</span>
                          <span>{formatHistoryTime(item.createdAt)}</span>
                        </div>
                        {item.params ? (
                          <div className="px-3 pt-3 flex flex-wrap gap-1.5 text-[10px]">
                            {item.params.openingScene ? (
                              <span className="rounded-md bg-white/5 px-2 py-0.5 text-zinc-400">
                                {historyOpeningSceneLabel(item.params.openingScene)}
                              </span>
                            ) : null}
                            {item.params.aspectRatio ? (
                              <span className="rounded-md bg-white/5 px-2 py-0.5 text-zinc-400">
                                {item.params.aspectRatio}
                              </span>
                            ) : null}
                            <span className="rounded-md bg-white/5 px-2 py-0.5 text-zinc-400">
                              {formatFirstFrameResolution(item.params.resolution)}
                            </span>
                            {item.params.outputCount ? (
                              <span className="rounded-md bg-white/5 px-2 py-0.5 text-zinc-400">
                                {(t.ff_draft_output_count || '{count} images').replace('{count}', String(Math.max(1, Number(item.params.outputCount || 1))))}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="p-3 grid grid-cols-4 gap-2">
                          {item.outputImages.slice(0, 4).map((img, idx) => (
                            <img
                              key={`${item.id}-${idx}`}
                              src={img.imageUrl}
                              alt={`${workspaceLabel}-${idx}`}
                              className="w-full aspect-square object-cover rounded-lg border border-white/10"
                            />
                          ))}
                        </div>
                        <div className="px-3 pb-3">
                          <button
                            type="button"
                            onClick={() => activateHistoryItem(item)}
                            className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition"
                          >
                            {t.ff_restore_this_record}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>
          </section>
        </div>
      </div>

      <AppDialog
        isOpen={isSaveDraftDialogOpen}
        title={t.ff_draft_save_as}
        onClose={() => {
          if (!isSavingDraft) setIsSaveDraftDialogOpen(false);
        }}
        widthClassName="max-w-md"
        footer={(
          <>
            <button
              type="button"
              onClick={() => setIsSaveDraftDialogOpen(false)}
              disabled={isSavingDraft}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
            >
              {t.ff_draft_cancel}
            </button>
            <button
              type="button"
              onClick={() => void confirmSaveDraft()}
              disabled={isSavingDraft}
              className="rounded-lg border border-orange-500/40 bg-orange-500/15 px-4 py-2 text-sm font-semibold text-orange-200 transition hover:bg-orange-500/25 disabled:opacity-50"
            >
              {isSavingDraft ? t.ff_draft_saving : t.ff_draft_save}
            </button>
          </>
        )}
      >
        <label className="mb-2 block text-xs font-semibold text-zinc-500">{t.ff_draft_name_label}</label>
        <input
          value={draftName}
          onChange={(event) => {
            setDraftName(event.target.value);
            if (draftError) setDraftError('');
          }}
          className="w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-orange-500/50"
          placeholder={defaultFirstFrameDraftName(t.ff_draft_default_name_prefix)}
          autoFocus
        />
        {draftError ? <div className="mt-2 text-xs text-red-300">{draftError}</div> : null}
      </AppDialog>

      <AppDialog
        isOpen={isDraftSavedDialogOpen}
        title={t.ff_draft_saved_title}
        onClose={() => setIsDraftSavedDialogOpen(false)}
        widthClassName="max-w-sm"
        footer={(
          <button
            type="button"
            onClick={() => setIsDraftSavedDialogOpen(false)}
            className="rounded-lg border border-orange-500/40 bg-orange-500/15 px-4 py-2 text-sm font-semibold text-orange-200 transition hover:bg-orange-500/25"
          >
            {t.ff_draft_ok}
          </button>
        )}
      >
        <div className="text-sm text-zinc-300">{t.ff_draft_saved_message}</div>
      </AppDialog>

      <AssetLibraryPickerDialog<FirstFramePickerTab>
        isOpen={isAssetPickerOpen}
        tabs={FIRST_FRAME_PICKER_TABS}
        maxCount={FIRST_FRAME_ASSET_PICKER_MAX_COUNT}
        appliedCount={images.length}
        maxFileSize={FIRST_FRAME_ASSET_PICKER_MAX_FILE_SIZE}
        acceptedFormats={FIRST_FRAME_ASSET_PICKER_ACCEPTED_FORMATS}
        uploadAccept=".jpg,.jpeg,.png,.webp"
        title={t.wb_dialog_choose_from_library || 'Choose From Asset Library'}
        limitReachedMessage={t.ff_asset_picker_limit_reached || 'Selection limit reached'}
        formatErrorMessage={t.ff_upload_error_format}
        tooLargeErrorPrefix={t.ff_upload_error_too_large}
        loadErrorMessage={t.pg_board_library_load_failed || t.assets_seedance_load_failed}
        uploadErrorMessage={t.pg_main_toast_image_upload_failed_retry}
        onConfirm={(assets) => void handleAssetPickerConfirm(assets)}
        onClose={() => setIsAssetPickerOpen(false)}
      />

      {error && phase !== 'generating' && (
        <ErrorDialog
          isOpen={!!error}
          error={error}
          onClose={() => setError(null)}
          onRetry={handleErrorRetry}
          showRetry={true}
        />
      )}
    </>
  );
};

export const FirstFrameView: React.FC<FirstFrameViewProps> = ({
  onBack,
  projectId,
  embedded = false,
  isVisible = true,
  onApplyToWorkbench,
  headerActionsContainer,
}) => {
  const { t } = useLanguage();

  const initialWorkspaceMetas = useMemo(() => readWorkspaceMetas(), []);
  const [workspaceMetas, setWorkspaceMetas] = useState<FirstFrameWorkspaceMeta[]>(initialWorkspaceMetas);
  const [drafts, setDrafts] = useState<FirstFrameDraftItem[]>(() => readFirstFrameDrafts());
  const [isDraftManagerOpen, setIsDraftManagerOpen] = useState(false);
  const [draftQuery, setDraftQuery] = useState('');
  const [renamingDraftId, setRenamingDraftId] = useState('');
  const [renamingDraftName, setRenamingDraftName] = useState('');
  const [isWorkspaceNameDialogOpen, setIsWorkspaceNameDialogOpen] = useState(false);
  const [workspaceNameDialogMode, setWorkspaceNameDialogMode] = useState<'create' | 'rename'>('create');
  const [workspaceNameTargetId, setWorkspaceNameTargetId] = useState('');
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState('');
  const [workspaceNameError, setWorkspaceNameError] = useState('');
  const [draftToApply, setDraftToApply] = useState<FirstFrameDraftItem | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => {
    if (typeof window === 'undefined') return initialWorkspaceMetas[0]?.id || createDefaultWorkspaceMeta().id;

    const stored = String(window.localStorage.getItem(FIRST_FRAME_ACTIVE_WORKSPACE_KEY) || '').trim();
    if (stored && initialWorkspaceMetas.some((ws) => ws.id === stored)) {
      return stored;
    }

    return initialWorkspaceMetas[0]?.id || createDefaultWorkspaceMeta().id;
  });
  const [draftWorkspaceFilter, setDraftWorkspaceFilter] = useState<'all' | string>(() => {
    if (typeof window === 'undefined') return initialWorkspaceMetas[0]?.id || createDefaultWorkspaceMeta().id;

    const stored = String(window.localStorage.getItem(FIRST_FRAME_ACTIVE_WORKSPACE_KEY) || '').trim();
    if (stored && initialWorkspaceMetas.some((ws) => ws.id === stored)) {
      return stored;
    }

    return initialWorkspaceMetas[0]?.id || createDefaultWorkspaceMeta().id;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FIRST_FRAME_WORKSPACE_META_KEY, JSON.stringify(workspaceMetas));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [workspaceMetas]);

  useEffect(() => {
    writeFirstFrameDrafts(drafts);
  }, [drafts]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FIRST_FRAME_ACTIVE_WORKSPACE_KEY, activeWorkspaceId);
    } catch {
      // Ignore localStorage write failures.
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (workspaceMetas.length === 0) {
      const fallback = createDefaultWorkspaceMeta();
      setWorkspaceMetas([fallback]);
      setActiveWorkspaceId(fallback.id);
      return;
    }

    if (!workspaceMetas.some((workspace) => workspace.id === activeWorkspaceId)) {
      setActiveWorkspaceId(workspaceMetas[0].id);
    }
  }, [activeWorkspaceId, workspaceMetas]);

  const defaultWorkspaceLabel = useCallback(() => (
    String(t.ff_new_workspace || '').trim() || 'New Workspace'
  ), [t]);

  const workspaceLabel = useCallback((workspace: FirstFrameWorkspaceMeta) => {
    const name = String(workspace.name || '').trim();
    return name || defaultWorkspaceLabel();
  }, [defaultWorkspaceLabel]);

  const workspaceOptions = useMemo(
    () => workspaceMetas.map((workspace) => ({
      value: workspace.id,
      label: workspaceLabel(workspace),
    })),
    [workspaceMetas, workspaceLabel]
  );

  const openCreateWorkspaceDialog = () => {
    setWorkspaceNameDialogMode('create');
    setWorkspaceNameTargetId('');
    setWorkspaceNameDraft(defaultWorkspaceLabel());
    setWorkspaceNameError('');
    setIsWorkspaceNameDialogOpen(true);
  };

  const openRenameWorkspaceDialog = (workspaceId: string) => {
    const workspace = workspaceMetas.find((item) => item.id === workspaceId);
    if (!workspace) return;
    setWorkspaceNameDialogMode('rename');
    setWorkspaceNameTargetId(workspace.id);
    setWorkspaceNameDraft(workspaceLabel(workspace));
    setWorkspaceNameError('');
    setIsWorkspaceNameDialogOpen(true);
  };

  const closeWorkspaceNameDialog = () => {
    setIsWorkspaceNameDialogOpen(false);
    setWorkspaceNameTargetId('');
    setWorkspaceNameDraft('');
    setWorkspaceNameError('');
  };

  const confirmWorkspaceName = () => {
    const name = workspaceNameDraft.trim();
    if (!name) {
      setWorkspaceNameError(t.ff_draft_name_required);
      return;
    }

    const now = Date.now();
    if (workspaceNameDialogMode === 'rename') {
      const targetId = workspaceNameTargetId;
      if (!targetId) return;
      setWorkspaceMetas((prev) => prev.map((workspace) => (
        workspace.id === targetId
          ? { ...workspace, name, updatedAt: now }
          : workspace
      )));
      closeWorkspaceNameDialog();
      return;
    }

    const newWorkspace: FirstFrameWorkspaceMeta = {
      id: `ff-workspace-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      createdAt: now,
      updatedAt: now,
    };

    setWorkspaceMetas((prev) => [newWorkspace, ...prev]);
    setActiveWorkspaceId(newWorkspace.id);
    closeWorkspaceNameDialog();
  };

  const switchWorkspace = (workspaceId: string) => {
    const id = String(workspaceId || '').trim();
    if (!id) return;

    setActiveWorkspaceId(id);
    setWorkspaceMetas((prev) => prev.map((workspace) => (
      workspace.id === id
        ? { ...workspace, updatedAt: Date.now() }
        : workspace
    )));
  };

  const deleteWorkspace = useCallback((workspaceId: string) => {
    const id = String(workspaceId || '').trim();
    if (!id || workspaceMetas.length <= 1) return;

    const nextWorkspaces = workspaceMetas.filter((workspace) => workspace.id !== id);
    if (nextWorkspaces.length === workspaceMetas.length) return;

    setWorkspaceMetas(nextWorkspaces);
    if (activeWorkspaceId === id && nextWorkspaces[0]) {
      setActiveWorkspaceId(nextWorkspaces[0].id);
    }

    readImageHistoryByFeature('first_frame')
      .filter((item) => (item.workspaceId || 'ff-workspace-1') === id)
      .forEach((item) => {
        deleteImageHistoryItem(item.id);
      });
  }, [activeWorkspaceId, workspaceMetas]);

  const activeWorkspaceMeta = useMemo(
    () => workspaceMetas.find((workspace) => workspace.id === activeWorkspaceId) || workspaceMetas[0] || createDefaultWorkspaceMeta(),
    [activeWorkspaceId, workspaceMetas]
  );

  const activeWorkspaceLabel = workspaceLabel(activeWorkspaceMeta);

  const saveDraftForWorkspace = useCallback((name: string, snapshot: FirstFrameDraftSnapshot) => {
    const now = Date.now();
    const draft: FirstFrameDraftItem = {
      id: `ff-draft-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim() || defaultFirstFrameDraftName(t.ff_draft_default_name_prefix),
      workspaceId: activeWorkspaceMeta.id,
      createdAt: now,
      updatedAt: now,
      snapshot,
    };
    setDrafts((prev) => [draft, ...prev]);
  }, [activeWorkspaceMeta, t.ff_draft_default_name_prefix]);

  useEffect(() => {
    if (draftWorkspaceFilter === 'all') return;
    if (workspaceMetas.some((workspace) => workspace.id === draftWorkspaceFilter)) return;
    setDraftWorkspaceFilter(activeWorkspaceId);
  }, [activeWorkspaceId, draftWorkspaceFilter, workspaceMetas]);

  const draftFilterOptions = useMemo(() => [
    { value: 'all', label: t.ff_draft_all_workspaces },
    ...workspaceMetas.map((workspace) => ({
      value: workspace.id,
      label: workspaceLabel(workspace),
    })),
  ], [t.ff_draft_all_workspaces, workspaceLabel, workspaceMetas]);

  const normalizedDraftQuery = draftQuery.trim().toLowerCase();
  const groupedDrafts = useMemo(() => {
    const targetWorkspaceId = draftWorkspaceFilter;
    const matched = drafts
      .filter((draft) => {
        const matchesQuery = !normalizedDraftQuery || draft.name.toLowerCase().includes(normalizedDraftQuery);
        if (!matchesQuery) return false;
        if (targetWorkspaceId === 'all') return true;
        return draft.workspaceId === targetWorkspaceId;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);

    if (targetWorkspaceId !== 'all') {
      return [{
        workspaceId: String(targetWorkspaceId),
        workspaceLabel: draftFilterOptions.find((option) => option.value === draftWorkspaceFilter)?.label || activeWorkspaceLabel,
        drafts: matched,
      }];
    }

    return workspaceMetas
      .map((workspace) => ({
        workspaceId: workspace.id,
        workspaceLabel: workspaceLabel(workspace),
        drafts: matched.filter((draft) => draft.workspaceId === workspace.id).sort((a, b) => b.updatedAt - a.updatedAt),
      }))
      .filter((group) => group.drafts.length > 0);
  }, [
    activeWorkspaceId,
    activeWorkspaceLabel,
    draftFilterOptions,
    draftWorkspaceFilter,
    drafts,
    normalizedDraftQuery,
    workspaceLabel,
    workspaceMetas,
  ]);

  const openDraft = (draft: FirstFrameDraftItem) => {
    if (!workspaceMetas.some((workspace) => workspace.id === draft.workspaceId)) {
      const now = Date.now();
      setWorkspaceMetas((prev) => [
        {
          id: draft.workspaceId,
          name: '',
          createdAt: now,
          updatedAt: now,
        },
        ...prev,
      ]);
    }
    setActiveWorkspaceId(draft.workspaceId);
    setDraftToApply(draft);
    setDrafts((prev) => prev.map((item) => (
      item.id === draft.id ? { ...item, updatedAt: Date.now() } : item
    )));
    setIsDraftManagerOpen(false);
  };

  const deleteDraft = (draftId: string) => {
    setDrafts((prev) => prev.filter((draft) => draft.id !== draftId));
  };

  const startRenameDraft = (draft: FirstFrameDraftItem) => {
    setRenamingDraftId(draft.id);
    setRenamingDraftName(draft.name);
  };

  const confirmRenameDraft = () => {
    const name = renamingDraftName.trim();
    if (!renamingDraftId || !name) return;
    setDrafts((prev) => prev.map((draft) => (
      draft.id === renamingDraftId
        ? { ...draft, name, updatedAt: Date.now() }
        : draft
    )));
    setRenamingDraftId('');
    setRenamingDraftName('');
  };

  const draftOpeningSceneLabel = useCallback((scene: FirstFrameParams['openingScene']) => {
    switch (scene) {
      case 'product_showcase':
        return t.ff_opening_scene_product_showcase;
      case 'usage_demo':
        return t.ff_opening_scene_usage_demo;
      case 'brand_ad':
        return t.ff_opening_scene_brand_ad;
      case 'person_selling':
      default:
        return t.ff_opening_scene_person_selling;
    }
  }, [t]);

  const draftPromptPreview = useCallback((prompt: string) => {
    const normalized = String(prompt || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return t.ff_draft_prompt_empty;
    return normalized.length > 34 ? `${normalized.slice(0, 34)}...` : normalized;
  }, []);

  const shellClassName = useMemo(
    () => (embedded
      ? 'flex h-full min-h-0 flex-col'
      : 'min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 p-6'),
    [embedded]
  );

  const contentWrapClassName = embedded
    ? 'flex h-full min-h-0 w-full flex-col'
    : 'mx-auto max-w-[1600px] pb-10';
  const workspaceActions = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setIsDraftManagerOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800"
      >
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span>{t.ff_draft_my_drafts}</span>
      </button>
      <div className="w-48">
        <DropdownSelect
          value={activeWorkspaceId}
          options={workspaceOptions}
          onChange={(value) => switchWorkspace(String(value || ''))}
          buttonClassName="w-full bg-zinc-900/70 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
          iconClassName="w-4 h-4 text-zinc-500"
          optionClassName="text-xs"
          renderOption={({ option, isSelected, onSelect }) => {
            const canDelete = workspaceMetas.length > 1;
            const targetWorkspace = workspaceMetas.find((workspace) => workspace.id === option.value);
            const optionTitle = targetWorkspace ? workspaceLabel(targetWorkspace) : String(option.value || '');

            return (
              <div
                className={`group flex items-center gap-2 px-3 py-2 text-xs transition ${
                  isSelected ? 'bg-white/5 text-white' : 'text-zinc-200 hover:bg-white/5'
                }`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={onSelect}
                >
                  <span className="block truncate">{option.label}</span>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openRenameWorkspaceDialog(option.value);
                  }}
                  className="shrink-0 rounded-full p-0.5 text-zinc-400 opacity-0 transition hover:text-zinc-200 group-hover:opacity-100"
                  aria-label={`${t.ff_draft_rename} ${optionTitle}`}
                  title={`${t.ff_draft_rename} ${optionTitle}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteWorkspace(option.value);
                  }}
                  disabled={!canDelete}
                  className={`shrink-0 rounded-full p-0.5 transition ${
                    canDelete
                      ? 'opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300'
                      : 'opacity-0 pointer-events-none'
                  }`}
                  aria-label={`Delete ${optionTitle}`}
                  title={canDelete ? `Delete ${optionTitle}` : undefined}
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current">
                    <Minus className="h-2.5 w-2.5" strokeWidth={2.5} />
                  </span>
                </button>
              </div>
            );
          }}
        />
      </div>
      <button
        type="button"
        onClick={openCreateWorkspaceDialog}
        className="px-3 py-2 rounded-xl text-xs font-semibold bg-orange-500/10 border border-orange-500/40 text-orange-300 hover:bg-orange-500/20 transition inline-flex items-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        {t.ff_new_workspace}
      </button>
    </div>
  );

  return (
    <div className={shellClassName}>
      <div className={contentWrapClassName}>
        {!embedded && (
          <div className="flex items-center gap-4 mb-8">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 hover:bg-zinc-800 rounded-lg transition"
                title={t.ff_back}
              >
                <ChevronLeft className="w-6 h-6 text-zinc-400" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">
                {t.ff_page_title}
              </h1>
              <p className="text-sm text-zinc-400">
                {t.ff_page_subtitle}
              </p>
            </div>

            <div className="ml-auto">
              {workspaceActions}
            </div>
          </div>
        )}

        {embedded && headerActionsContainer ? createPortal(workspaceActions, headerActionsContainer) : null}

        <AppDialog
          isOpen={isWorkspaceNameDialogOpen}
          title={workspaceNameDialogMode === 'create' ? t.ff_new_workspace : t.ff_draft_rename}
          onClose={closeWorkspaceNameDialog}
          widthClassName="max-w-md"
          footer={(
            <>
              <button
                type="button"
                onClick={closeWorkspaceNameDialog}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white/10"
              >
                {t.ff_draft_cancel}
              </button>
              <button
                type="button"
                onClick={confirmWorkspaceName}
                className="rounded-lg border border-orange-500/40 bg-orange-500/15 px-4 py-2 text-sm font-semibold text-orange-200 transition hover:bg-orange-500/25"
              >
                {t.ff_draft_save}
              </button>
            </>
          )}
        >
          <label className="mb-2 block text-xs font-semibold text-zinc-500">
            {t.ff_workspace_name}
          </label>
          <input
            value={workspaceNameDraft}
            onChange={(event) => {
              setWorkspaceNameDraft(event.target.value);
              if (workspaceNameError) setWorkspaceNameError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') confirmWorkspaceName();
              if (event.key === 'Escape') closeWorkspaceNameDialog();
            }}
            className="w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-orange-500/50"
            placeholder=""
            autoFocus
          />
          {workspaceNameError ? <div className="mt-2 text-xs text-red-300">{workspaceNameError}</div> : null}
        </AppDialog>

        <AppDialog
          isOpen={isDraftManagerOpen}
          title={t.ff_draft_my_drafts}
          onClose={() => {
            setIsDraftManagerOpen(false);
            setRenamingDraftId('');
            setRenamingDraftName('');
          }}
          widthClassName="max-w-2xl"
          contentClassName="overflow-y-auto pr-1 max-h-[65vh]"
        >
          <div className="mb-4 flex items-center gap-2">
            <div className="w-44 shrink-0">
              <div className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <DropdownSelect
                  value={draftWorkspaceFilter}
                  options={draftFilterOptions}
                  onChange={(value) => setDraftWorkspaceFilter(String(value || 'current'))}
                  buttonClassName="w-full bg-zinc-950/80 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs text-zinc-200 hover:bg-zinc-900"
                  labelClassName="pr-7"
                  iconClassName="w-4 h-4 text-zinc-500"
                  optionClassName="text-xs"
                />
              </div>
            </div>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-zinc-950/80 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-orange-500/50"
                placeholder={t.ff_draft_search_placeholder}
              />
            </div>
          </div>

          {groupedDrafts.every((group) => group.drafts.length === 0) ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 text-sm text-zinc-500">
              {t.ff_draft_empty}
            </div>
          ) : (
            <div className="space-y-5">
              {groupedDrafts.map((group) => (
                <div key={group.workspaceId}>
                  {draftWorkspaceFilter === 'all' ? (
                    <div className="mb-2 text-xs font-bold text-zinc-400">{group.workspaceLabel}</div>
                  ) : null}
                  <div className="space-y-2">
                    {group.drafts.map((draft) => {
                      const isRenaming = renamingDraftId === draft.id;
                      return (
                        <div key={draft.id} className="rounded-xl border border-white/10 bg-black/25 p-3 transition hover:border-white/15 hover:bg-black/30">
                          <div className="flex items-center gap-4">
                            <button
                              type="button"
                              onClick={() => openDraft(draft)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="min-w-0">
                                {isRenaming ? (
                                  <input
                                    value={renamingDraftName}
                                    onChange={(event) => setRenamingDraftName(event.target.value)}
                                    onClick={(event) => event.stopPropagation()}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') confirmRenameDraft();
                                      if (event.key === 'Escape') {
                                        setRenamingDraftId('');
                                        setRenamingDraftName('');
                                      }
                                    }}
                                    className="w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1 text-sm font-semibold text-zinc-100 outline-none focus:border-orange-500/50"
                                    autoFocus
                                  />
                                ) : (
                                  <div className="flex min-w-0 items-baseline gap-2">
                                    <span className="truncate text-sm font-semibold text-zinc-100">{draft.name}</span>
                                    <span className="shrink-0 text-[11px] text-zinc-500">{formatDraftRelativeTime(draft.updatedAt, t)}</span>
                                  </div>
                                )}
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                                  <span>{draftOpeningSceneLabel(draft.snapshot.params.openingScene)}</span>
                                  <span>{draft.snapshot.params.aspectRatio || '9:16'}</span>
                                  <span>{formatFirstFrameResolution(draft.snapshot.params.resolution)}</span>
                                  <span>{(t.ff_draft_output_count || '{count} images').replace('{count}', String(Math.max(1, Number(draft.snapshot.params.outputCount || 1))))}</span>
                                </div>
                                <div className="mt-1 truncate text-xs text-zinc-400">
                                  {draftPromptPreview(draft.snapshot.params.prompt || '')}
                                </div>
                                <div className="mt-2 grid w-36 grid-cols-4 gap-1">
                                  {Array.from({ length: FIRST_FRAME_ASSET_PICKER_MAX_COUNT }).map((_, index) => {
                                    const image = draft.snapshot.images[index];
                                    return (
                                      <div
                                        key={`${draft.id}-thumb-${index}`}
                                        className="aspect-square overflow-hidden rounded-md border border-white/10 bg-zinc-950/80"
                                      >
                                        {image ? (
                                          <img
                                            src={image.dataUrl}
                                            alt=""
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <div className="h-full w-full bg-white/[0.03]" />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </button>
                            {isRenaming ? (
                              <button
                                type="button"
                                onClick={confirmRenameDraft}
                                className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-200 hover:bg-orange-500/20"
                              >
                                {t.ff_draft_save}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startRenameDraft(draft)}
                                className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
                                title={t.ff_draft_rename}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteDraft(draft.id)}
                              className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-300"
                              title={t.ff_draft_delete}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </AppDialog>

        {workspaceMetas.map((workspace) => (
          <div
            key={workspace.id}
            className={workspace.id === activeWorkspaceId ? 'block h-full min-h-0' : 'hidden'}
            aria-hidden={workspace.id !== activeWorkspaceId}
          >
            <FirstFrameWorkspacePane
              workspaceId={workspace.id}
              workspaceLabel={workspaceLabel(workspace)}
              projectId={projectId}
              isVisible={isVisible && workspace.id === activeWorkspaceId}
              onApplyToWorkbench={onApplyToWorkbench}
              draftToApply={draftToApply && draftToApply.workspaceId === workspace.id ? draftToApply : null}
              onDraftApplied={(draftId) => {
                if (draftToApply?.id === draftId) setDraftToApply(null);
              }}
              onSaveDraft={saveDraftForWorkspace}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
