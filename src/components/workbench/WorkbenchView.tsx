import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  UploadCloud, Plus, X, CheckCircle, FolderPlus, Folder, Eye,
  Wand2, Loader2, Clapperboard, ArrowRight, BookmarkPlus, FolderOpen,
  MonitorPlay, Film, SkipBack, Play, Pause, SkipForward, FileJson, Send, Cpu,
  Zap, Layers, Layers3, Video, Lock, Info, Check, Sparkles, List, MoreHorizontal, Pencil, Trash2, Gift, ImagePlus, Users, Image as ImageIcon,
  SlidersHorizontal, Music, Languages, HelpCircle, AlertCircle, ChevronDown, ChevronUp, ChevronsDown, Library
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useRequireAuth } from '../../utils/useRequireAuth';
import { useTasks } from '../../context/TaskContext';
import { useWorkbenchModel } from '../../context/WorkbenchModelContext';
import { videoApi, VideoApiError, type GeneratePreviewData } from '../../services/video';
import { assetsApi, subjectGroupApi, type Asset as LibraryAsset, type AssetFolder, type SubjectGroup } from '../../services/assets';
import { tiktokApi } from '../../services/tiktok';
import { authApi } from '../../services/auth';
import { billingApi } from '../../services/billing';
import { formatCreditAmount, roundCreditTenths } from '../../utils/credits';
import { getDebugModeEnabled } from '../../services/debugMode';
import {
  PromptLabWindow,
  buildBackendPromptOverrides,
  loadPromptOverrides,
  type PromptOverrides,
  type PromptStepTemplate,
  type PromptTemplatesResponse,
} from './PromptLabWindow';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { DropdownSelect } from '../common/DropdownSelect';
import { type Template } from '../../services/templates';
import { AppDialog } from '../common/AppDialog';
import { AiOverwriteDialog, type AiOverwriteField } from './AiOverwriteDialog';
import { ErrorModal } from './workflow/ErrorModal';
import type { ErrorModalProps } from './workflow/ErrorModal';
import { buildErrorModalData, type ErrorCategory, type ErrorI18n } from '../../utils/errorModalHelper';
import { getWorkbenchPreferences, setWorkbenchPreferences } from '../../utils/preferences';
import {
  buildCreativeCardEditorText,
  buildCreativeCardPrompt,
  buildFullScriptFallback,
  buildScriptEstimateStorageKey,
  buildScriptsFromShots,
  distributeTenthsProportional,
  durToTenths,
  formatScriptPageDisplayName,
  getScriptGenerationCooldownRemainingMs,
  hasCreativeCardContent,
  isAbortError,
  normalizeScriptText,
  parseScriptStringList,
  readLocalScriptEstimate,
  recordScriptGenerationCancelTimestamp,
  tenthsToDur,
  useScriptGenerationProgress,
  writeLocalScriptEstimate,
  type ScriptCreativeCard,
  type ScriptItem,
  type ScriptPage,
} from '../../utils/scriptUtils';
import {
  clearTransferStationItems,
  loadTransferStationItems,
  removeTransferStationItem,
  type TransferStationItem,
} from '../../utils/workbenchTransferStation';
import ShotTimelineBar from './ShotTimelineBar';
import {
  SeedanceReplayUploadPanel,
  type SeedanceReplayUploadAsset,
} from './Seedance/SeedanceReplayUploadPanel';
import {
  SEEDANCE_REPLAY_AUDIO_EXTS,
  buildSeedanceReplayValidationSummary,
  parseSeedanceReplayLocalFile,
  SEEDANCE_REPLAY_IMAGE_EXTS,
  SEEDANCE_REPLAY_AUDIO_LIMIT,
  SEEDANCE_REPLAY_IMAGE_LIMIT,
  SEEDANCE_REPLAY_UPLOAD_ACCEPT,
  SEEDANCE_REPLAY_VIDEO_EXTS,
  SEEDANCE_REPLAY_VIDEO_LIMIT,
  type SeedanceReplayMediaKind,
  type SeedanceReplayParsedAsset,
  validateSeedanceReplayParsedAsset,
} from './Seedance/seedanceReplayUploadRules';
import {
  closeTikTokAuthPopup,
  navigateTikTokAuthPopup,
  openTikTokAuthPopup,
} from '../../utils/tiktokAuthPopup';

const ENABLE_PROMPT_LAB = true;
const ENABLE_STORYBOARD_PROMPT = true;
const WAIT_PROGRESS_SIM_DURATION_MS = 90_000;
const WAIT_PROGRESS_MAX_BEFORE_HOLD = 90;
const SCRIPT_PROGRESS_MAX_BEFORE_HOLD = 88;
const SCRIPT_PROGRESS_HOLD_MAX = 96;
const WAITING_PREVIEW_VIDEO_SRC = (import.meta.env.VITE_WAITING_PREVIEW_VIDEO_URL || 'https://vflow.genviewtech.com/media/vedio.mp4').toString();
const ASSET_PLACEHOLDER_DATA_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iNDAwIiB2aWV3Qm94PSIwIDAgMzAwIDQwMCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzFmMjkzNyIvPjx0ZXh0IHg9IjE1MCIgeT0iMjAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiBmaWxsPSIjOWNhM2FmIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjAiPk5vIFByZXZpZXc8L3RleHQ+PC9zdmc+';
const TRANSFER_STATION_DRAG_MIME = 'application/x-vflow-transfer-station-item';
const revokeBlobUrl = (url: string | null | undefined) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

const renderAudioArtwork = (isLightTheme = false) => (
  <div className="absolute inset-0 overflow-hidden rounded-lg">
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

const formatAssetSize = (sizeBytes?: number | null) => {
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes < 0) return '';
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(sizeBytes >= 10 * 1024 * 1024 ? 1 : 2)}MB`;
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)}KB`;
  return `${sizeBytes}B`;
};

type BillingPricingModelEntry = {
  display_name?: string;
  rate?: number;
  rate_credit_tenths?: number;
  rate_label?: string;
  unit?: string;
};

type BillingPricingModeEntry = {
  default_duration_seconds?: number;
  default_model?: string;
  models?: Record<string, BillingPricingModelEntry>;
};

type BillingPricingCatalog = {
  video?: {
    default_mode?: string;
    models?: Record<string, BillingPricingModelEntry>;
    modes?: Record<string, BillingPricingModeEntry>;
  };

  image?: {
    default_model?: string;
    models?: Record<string, BillingPricingModelEntry>;
  };
};

const VIDEO_MODEL_PRICING_ALIASES: Record<string, string> = {
  kling: 'kling',
  sora2: 'sora-2',
  sora2pro: 'sora-2-pro',
  'seedance2.0': 'seedance-2.0',
};

const IMAGE_MODEL_PRICING_ALIASES: Record<string, string> = {
  'gpt-image-1.5': 'gpt-image-1.5',
  'flux-2-pro': 'flux-2-pro',
  'flux-2-flex': 'flux-2-flex',
};

const getVideoPricingMode = (pricing: BillingPricingCatalog | null | undefined, creationMode: 'fast' | 'replay') => {
  const requestedMode = creationMode === 'replay' ? 'replay' : 'fast';
  const modes = pricing?.video?.modes;
  if (!modes) return requestedMode;
  if (modes[requestedMode]) return requestedMode;
  const defaultMode = pricing?.video?.default_mode;
  if (defaultMode && modes[defaultMode]) return defaultMode;
  const firstMode = Object.keys(modes)[0];
  return firstMode || requestedMode;
};

const getVideoModelPricingEntry = (
  pricing: BillingPricingCatalog | null | undefined,
  modelId: string,
  creationMode: 'fast' | 'replay' = 'fast',
) => {
  const modelKey = VIDEO_MODEL_PRICING_ALIASES[modelId] || modelId;
  const modeKey = getVideoPricingMode(pricing, creationMode);
  return pricing?.video?.modes?.[modeKey]?.models?.[modelKey] || pricing?.video?.models?.[modelKey] || null;
};

const getImageModelPricingEntry = (
  pricing: BillingPricingCatalog | null | undefined,
  modelId: string,
) => {
  const modelKey = IMAGE_MODEL_PRICING_ALIASES[modelId] || modelId;
  return pricing?.image?.models?.[modelKey] || null;
};

const isSeedanceModel = (modelId: string | null | undefined) => {
  const normalized = String(modelId || '').trim();
  const modelKey = VIDEO_MODEL_PRICING_ALIASES[normalized] || normalized;
  return modelKey === 'seedance-2.0';
};

const getSeedanceReplayLocalAccept = (mediaKind?: SeedanceReplayMediaKind | null, options: { allowAudio?: boolean } = {}) => {
  const allowAudio = options.allowAudio !== false;
  if (mediaKind === 'image') return SEEDANCE_REPLAY_IMAGE_EXTS.map((ext) => `.${ext}`).join(',');
  if (mediaKind === 'video') return SEEDANCE_REPLAY_VIDEO_EXTS.map((ext) => `.${ext}`).join(',');
  if (mediaKind === 'audio' && !allowAudio) return [
    ...SEEDANCE_REPLAY_IMAGE_EXTS.map((ext) => `.${ext}`),
    ...SEEDANCE_REPLAY_VIDEO_EXTS.map((ext) => `.${ext}`),
  ].join(',');
  if (mediaKind === 'audio') return SEEDANCE_REPLAY_AUDIO_EXTS.map((ext) => `.${ext}`).join(',');
  if (!allowAudio) return [
    ...SEEDANCE_REPLAY_IMAGE_EXTS.map((ext) => `.${ext}`),
    ...SEEDANCE_REPLAY_VIDEO_EXTS.map((ext) => `.${ext}`),
  ].join(',');
  return SEEDANCE_REPLAY_UPLOAD_ACCEPT;
};
// Storyboard editor is now a user-toggleable runtime setting (no longer a compile-time constant).
// The state `enableStoryboardEditor` replaces the old `enableStoryboardEditor` const.

// Types specific to Workbench View
type WorkbenchAspectRatio = '9:16' | '16:9' | '1:1' | '4:3' | '3:4' | '21:9';

const DEFAULT_WORKBENCH_ASPECT_RATIO: WorkbenchAspectRatio = '9:16';

const normalizeWorkbenchAspectRatio = (value: string | null | undefined): WorkbenchAspectRatio => {
  if (
    value === '9:16' ||
    value === '16:9' ||
    value === '1:1' ||
    value === '4:3' ||
    value === '3:4' ||
    value === '21:9'
  ) {
    return value;
  }

  return DEFAULT_WORKBENCH_ASPECT_RATIO;
};

type QueuedAsset = {
  id: string;
  name: string;
  previewUrl: string | null;
  fileObj?: File | null;
  assetUrl?: string | null;
  assetId?: string | null;
  source: 'product' | 'preference' | 'subject' | 'tail';
  materialType?: AssetLibraryTab;
  isPrimaryFrame?: boolean;
  mediaKind?: 'image' | 'video' | 'audio' | 'file';
  durationSeconds?: number | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  validationMessages?: string[];
  uploadedPath?: string | null;
  hasSubjectOtherViews?: boolean;
  frameRole?: '首帧' | '尾帧' | null;
  seedanceAssetId?: string | null;
};

type QueuedScript = {
  id: string;
  name: string;
  scripts: ScriptItem[];
  duration: number;
  fullScript?: string;
  creativeCard?: ScriptCreativeCard;
  creativeCardText?: string;
};

type SeedanceReplayUploadIntent = {
  targetMediaKind: SeedanceReplayMediaKind | null;
};

type SeedanceReplayLibraryIntent = {
  targetMediaKind: SeedanceReplayMediaKind | null;
  allowedTabs: AssetLibraryTab[];
  preferredTab: AssetLibraryTab;
};

type AssetLibraryTab = 'product' | 'model' | 'scene' | 'motion' | 'audio' | 'script' | 'subject';
type AssetLibraryPickMode = 'default' | 'background_audio' | 'script_import';
type KlingLibraryUploadTarget = 'default' | 'primary' | 'reference';
type AiOptimizeResolution = 'sd' | 'hd' | 'uhd';
type WaitProgressPhase = 'idle' | 'simulating' | 'holding' | 'finishing' | 'done';


type GeneratePayload = {
  model: string;
  prompt: string;
  duration: number;
  sound: 'on' | 'off';
  project_id?: string;
  image_path?: string | null;
  motion_video_path?: string | null;
  asset_source?: 'product' | 'preference' | 'subject' | 'tail' | null;
  kling_mode?: 'first_frame' | 'subject' | 'first_last_frame';
  omni_assets?: Array<{ role: 'first_frame' | 'last_frame' | 'reference' | 'subject'; image_url: string; asset_id?: string | null; name?: string }>;
  subject_description_hint?: string;
  aspect_ratio?: WorkbenchAspectRatio;
  mode?: 'pro' | 'std';
  user_language: string;
  target_language: string;
  model_asset_id: string | number | null;
  motion_asset_id: string | number | null;
  background_audio_asset_id?: string | number | null;
  background_audio_url?: string | null;
  background_audio_name?: string | null;
  negative_prompt?: string;
  [key: string]: unknown;
};

type ReplayScriptTemplate = {
  id: string;
  title: string;
  description: string;
  fullScript: string;
  prompt: string;
  previewImageUrl: string;
  previewVideoUrl?: string;
  tags: string[];
  duration: number;
  aspectRatio: WorkbenchAspectRatio;
};

type ReplayBatchItemStatus = 'queued' | 'submitting' | 'processing' | 'success' | 'failed';

type ReplayBatchItem = {
  id: string;
  label: string;
  source: 'template' | 'user_reference';
  templateId?: string;
  copyIndex: number;
  taskId?: string | number;
  projectId?: string;
  status: ReplayBatchItemStatus;
  detail?: string;
  error?: string;
};

type ReplayReverseStatus = 'idle' | 'queued' | 'processing' | 'success' | 'failed';

type ReplayBatchRun = {
  id: string;
  expanded: boolean;
  startedAt: number;
  totalVideos: number;
  userReferenceCount: number;
  templateVideoCount: number;
  reverse: {
    status: ReplayReverseStatus;
    progress: number;
    detail?: string;
    error?: string;
    scriptBrief?: string;
  };
  items: ReplayBatchItem[];
};

const REPLAY_SCRIPT_TEMPLATES: ReplayScriptTemplate[] = [
  {
    id: 'hook-demo-closeup',
    title: '3 秒强钩子产品展示',
    description: '开场快速抓住痛点，随后用产品特写和使用动作完成卖点展示。',
    fullScript: '开场用近景展示产品解决的核心痛点；中段切换到手持/摆放使用动作；结尾用清晰 CTA 强化购买理由。',
    prompt: '为xx产品生成一条强钩子电商广告视频：前 3 秒用近景展示痛点与产品出现，中段使用多张商品图片作为外观参考，镜头节奏清晰，突出质感、功能和使用结果，结尾给出明确行动号召。避免复刻参考视频中的真人，只使用提供的商品图片作为视觉依据。',
    previewImageUrl: ASSET_PLACEHOLDER_DATA_URL,
    previewVideoUrl: WAITING_PREVIEW_VIDEO_SRC,
    tags: ['Hook', 'Demo', 'CTA'],
    duration: 8,
    aspectRatio: '9:16',
  },
  {
    id: 'problem-solution-proof',
    title: '痛点-方案-证明',
    description: '用问题场景切入，再展示产品解决方案和结果对比。',
    fullScript: '先呈现目标用户常见问题；随后展示产品细节与使用步骤；最后用结果感画面和利益点收束。',
    prompt: '为xx产品生成一条痛点-方案-证明结构的短视频广告：先用克制但明确的视觉语言展示用户问题，再围绕提供的商品图片设计使用步骤、细节特写和结果画面，节奏稳中有变化，结尾突出核心利益点和购买动机。全程不要使用参考广告视频作为生成素材。',
    previewImageUrl: ASSET_PLACEHOLDER_DATA_URL,
    previewVideoUrl: WAITING_PREVIEW_VIDEO_SRC,
    tags: ['Pain Point', 'Proof', 'Lifestyle'],
    duration: 10,
    aspectRatio: '9:16',
  },
  {
    id: 'premium-texture-showcase',
    title: '质感大片式陈列',
    description: '更适合高客单价产品，强调材质、光线、慢镜头和高级感。',
    fullScript: '用干净背景和有层次的光线展示产品；穿插局部特写、包装和使用场景；以品牌感口吻结束。',
    prompt: '为xx产品生成一条高级质感广告视频：围绕上传的商品图片，设计干净背景、柔和但有层次的灯光、慢速推拉镜头、细节特写和品牌感收束。整体画面精致、克制、商业化，避免真人敏感内容，只使用图片参考生成。',
    previewImageUrl: ASSET_PLACEHOLDER_DATA_URL,
    previewVideoUrl: WAITING_PREVIEW_VIDEO_SRC,
    tags: ['Premium', 'Texture', 'Brand'],
    duration: 8,
    aspectRatio: '9:16',
  },
];

const SEEDANCE_REPLAY_MODEL_LIMIT = 3;

type SelectedBackgroundAudio = {
  id: string;
  name: string;
  file_url: string;
  source?: 'library' | 'local';
};

type ActionRequired = {
  type?: string;
  prompt?: string;
  request_flag?: string | null;
} | null;

type WorkbenchSnapshot = {
  version: 1;
  template_id: string | null;
  timestamp: number;
};

type ProjectWorkspaceState = {
  fileName: string;
  uploadedFile: string | null;
  selectedAssetUrl: string | null;
  lastUploadedUrl: string | null;
  selectedAssetSource: 'product' | 'preference' | 'subject' | 'tail' | null;
  klingGenerateMode: 'first_frame' | 'subject' | 'first_last_frame';
  currentMaterialType: AssetLibraryTab | null;
  productName: string;
  productCategory: string;
  coreSellingPoints: string;
  targetAudience: string;
  deliveryRegion: string;
  videoType: string;
  aspectRatio: WorkbenchAspectRatio;
  hasAiRecognized: boolean;
  recognizedProductSourceSignature: string;
  needsAiReRecognize: boolean;
  genPrompt: string;
  referenceScript: string;
  referenceScriptProductSignature: string;
  genDuration: number;
  soundSetting: 'on' | 'off';
  selectedBackgroundAudio: SelectedBackgroundAudio | null;
  scriptVariantCount: number;
  targetLanguage: string;
  creationMode: 'fast' | 'replay';
  reuseQueueEnabled: boolean;
  scripts: ScriptItem[];
  scriptPages: ScriptPage[];
  activeScriptPage: number;
  assetQueue: QueuedAsset[];
  scriptQueue: QueuedScript[];
  selectedTemplateId: string | null;
  selectedModelId: string | null;
  generatedVideoUrl: string | null;
};

type LocalProjectMeta = {
  id: string;
  name: string;
  updatedAt: number;
  createdAt?: number;
};

type LocalProjectStore = {
  currentProjectId: string;
  projects: LocalProjectMeta[];
  workspaces: Record<string, ProjectWorkspaceState>;
};

const LOCAL_PROJECT_STORE_KEY_PREFIX = 'vflow_workbench_projects_v1';
const DEFAULT_PROJECT_NAME = 'Project_Alpha_01';
const MAX_PROJECT_NAME_LENGTH = 30;
const PROJECT_ACTION_MENU_RESERVED_SPACE = 60;

const estimateProjectNameWidthEm = (value: string): number => {
  const text = value || '';
  let units = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) {
      units += 0.35;
      continue;
    }
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/.test(ch)) {
      units += 1;
      continue;
    }
    units += 0.62;
  }
  return units + 0.8;
};

const createWorkspaceState = (params?: {
  scripts?: ScriptItem[];
  scriptPagePrefix?: string;
  userId?: string | number | null;
}): ProjectWorkspaceState => {
  const prefs = getWorkbenchPreferences(params?.userId ?? null);
  return {
    fileName: '',
    uploadedFile: null,
    selectedAssetUrl: null,
    lastUploadedUrl: null,
    selectedAssetSource: null,
    klingGenerateMode: 'first_frame',
    currentMaterialType: null,
    productName: '',
    productCategory: '',
    coreSellingPoints: '',
    targetAudience: '',
    deliveryRegion: prefs.deliveryRegion || '中国',
    videoType: prefs.videoType || '',
    aspectRatio: normalizeWorkbenchAspectRatio(prefs.aspectRatio),
    hasAiRecognized: false,
    recognizedProductSourceSignature: '',
    needsAiReRecognize: false,
    genPrompt: '',
    referenceScript: '',
    referenceScriptProductSignature: '',
    genDuration: prefs.genDuration || 10,
    soundSetting: prefs.soundSetting === 'off' ? 'off' : 'on',
    selectedBackgroundAudio: null,
    scriptVariantCount:
      typeof prefs.scriptVariantCount === 'number' && prefs.scriptVariantCount > 0 ? prefs.scriptVariantCount : 1,
    targetLanguage: prefs.targetLanguage || 'en',
    creationMode: 'fast',
    reuseQueueEnabled: false,
    scripts: params?.scripts || [],
    scriptPages: [{
      id: 'page-1',
      name: `${params?.scriptPagePrefix || 'Script'} 1`,
      scripts: params?.scripts || [],
    }],
    activeScriptPage: 0,
    assetQueue: [],
    scriptQueue: [],
    selectedTemplateId: null,
    selectedModelId:
      prefs.selectedModelId === 'kling' ||
        prefs.selectedModelId === 'sora2' ||
        prefs.selectedModelId === 'sora2pro' ||
        prefs.selectedModelId === 'seedance2.0'
        ? prefs.selectedModelId
        : null,
    generatedVideoUrl: null,
  };
};

const createDefaultProjectStore = (): LocalProjectStore => {
  const projectId = 'project_alpha_01';
  return {
    currentProjectId: projectId,
    projects: [{ id: projectId, name: DEFAULT_PROJECT_NAME, updatedAt: Date.now(), createdAt: Date.now() }],
    workspaces: {},
  };
};

const getLocalProjectStoreKey = (userId?: string | number | null): string => {
  const normalized = userId === null || userId === undefined || userId === '' ? 'guest' : String(userId);
  return `${LOCAL_PROJECT_STORE_KEY_PREFIX}_${normalized}`;
};

const getLocalProjectStoreOwner = (userId?: string | number | null): string => (
  userId === null || userId === undefined || userId === '' ? 'guest' : String(userId)
);

const loadLocalProjectStore = (userId?: string | number | null): LocalProjectStore => {
  try {
    const raw = localStorage.getItem(getLocalProjectStoreKey(userId));
    if (!raw) return createDefaultProjectStore();
    const parsed = JSON.parse(raw) as Partial<LocalProjectStore>;
    if (!parsed || typeof parsed !== 'object') return createDefaultProjectStore();
    if (!Array.isArray(parsed.projects) || parsed.projects.length === 0) return createDefaultProjectStore();
    const currentProjectId = typeof parsed.currentProjectId === 'string' && parsed.currentProjectId
      ? parsed.currentProjectId
      : parsed.projects[0].id;
    return {
      currentProjectId,
      projects: (parsed.projects as LocalProjectMeta[]).map(p => ({
        ...p,
        createdAt: p.createdAt || p.updatedAt || Date.now(),
      })),
      workspaces: (parsed.workspaces as Record<string, ProjectWorkspaceState>) || {},
    };
  } catch {
    return createDefaultProjectStore();
  }
};

export type GuestPromoteStats = {
  workspaceCount: number;
  projectCount: number;
  uploadedFileCount: number;
  totalScriptCount: number;
  totalAssetQueueCount: number;
};

/**
 * 游客->登录瞬间的迁移结果。
 *
 * 状态：
 *  - `no_window` / `no_guest_data` / `guest_pristine` / `storage_error`：无需打扰用户，
 *    migrate 函数已经把 localStorage 处理好（如清掉 pristine 占位）。
 *  - `auto_migrated`：guest 有内容 + target 是空的，自动搬完。
 *  - `needs_confirmation`：guest 和 target 都有 meaningful 内容，**migrate 函数不动 localStorage**，
 *    把两个 store 都返回让 UI 起弹窗，等用户决定。
 */
export type GuestPromoteOutcome =
  | { status: 'no_window' }
  | { status: 'no_guest_data' }
  | { status: 'guest_pristine' }
  | { status: 'storage_error' }
  | { status: 'auto_migrated'; stats: GuestPromoteStats }
  | { status: 'needs_confirmation'; guestStore: LocalProjectStore; targetStore: LocalProjectStore; stats: GuestPromoteStats };

/**
 * 检查一个 LocalProjectStore 是否包含「实质内容」——
 * 至少一个 workspace 有用户操作过的痕迹（上传过文件、产出过脚本、有 asset queue、
 * 或填了商品名 / 生成 prompt 等等）。
 */
const projectStoreHasMeaningfulContent = (raw: unknown): boolean => {
  if (!raw || typeof raw !== 'object') return false;
  const workspaces = (raw as { workspaces?: Record<string, unknown> }).workspaces;
  if (!workspaces || typeof workspaces !== 'object') return false;
  const entries = Object.values(workspaces);
  if (entries.length === 0) return false;
  return entries.some((wsRaw) => {
    if (!wsRaw || typeof wsRaw !== 'object') return false;
    const ws = wsRaw as Record<string, unknown>;
    if (typeof ws.uploadedFile === 'string' && ws.uploadedFile.trim().length > 0) return true;
    if (typeof ws.lastUploadedUrl === 'string' && ws.lastUploadedUrl.trim().length > 0) return true;
    if (typeof ws.selectedAssetUrl === 'string' && ws.selectedAssetUrl.trim().length > 0) return true;
    if (Array.isArray(ws.scripts) && ws.scripts.length > 0) return true;
    if (Array.isArray(ws.assetQueue) && ws.assetQueue.length > 0) return true;
    if (typeof ws.productName === 'string' && ws.productName.trim().length > 0) return true;
    if (typeof ws.genPrompt === 'string' && ws.genPrompt.trim().length > 0) return true;
    if (typeof ws.referenceScript === 'string' && ws.referenceScript.trim().length > 0) return true;
    return false;
  });
};

const computeGuestPromoteStats = (raw: unknown): GuestPromoteStats => {
  const stats: GuestPromoteStats = {
    workspaceCount: 0,
    projectCount: 0,
    uploadedFileCount: 0,
    totalScriptCount: 0,
    totalAssetQueueCount: 0,
  };
  if (!raw || typeof raw !== 'object') return stats;
  const projects = (raw as { projects?: unknown[] }).projects;
  if (Array.isArray(projects)) stats.projectCount = projects.length;
  const workspaces = (raw as { workspaces?: Record<string, unknown> }).workspaces;
  if (workspaces && typeof workspaces === 'object') {
    const entries = Object.values(workspaces);
    stats.workspaceCount = entries.length;
    for (const wsRaw of entries) {
      if (!wsRaw || typeof wsRaw !== 'object') continue;
      const ws = wsRaw as Record<string, unknown>;
      if (typeof ws.uploadedFile === 'string' && ws.uploadedFile.trim().length > 0) {
        stats.uploadedFileCount += 1;
      }
      if (Array.isArray(ws.scripts)) stats.totalScriptCount += ws.scripts.length;
      if (Array.isArray(ws.assetQueue)) stats.totalAssetQueueCount += ws.assetQueue.length;
    }
  }
  return stats;
};

/**
 * 把 raw JSON 字符串解析成 LocalProjectStore，规范化和 loadLocalProjectStore 一致；
 * 区别是这里返回 null 表示「没有」，方便上层做"双方是否都有内容"判断。
 */
const parseProjectStoreRawStrict = (raw: string | null): LocalProjectStore | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalProjectStore>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.projects) || parsed.projects.length === 0) return null;
    const currentProjectId = typeof parsed.currentProjectId === 'string' && parsed.currentProjectId
      ? parsed.currentProjectId
      : parsed.projects[0].id;
    return {
      currentProjectId,
      projects: (parsed.projects as LocalProjectMeta[]).map(p => ({
        ...p,
        createdAt: p.createdAt || p.updatedAt || Date.now(),
      })),
      workspaces: (parsed.workspaces as Record<string, ProjectWorkspaceState>) || {},
    };
  } catch {
    return null;
  }
};

/**
 * 游客->登录瞬间的迁移决策入口。
 *
 * 行为分流（2026-04-30 v2）：
 *  - guest 没数据 / pristine：no-op（清掉 pristine 占位也不打扰用户）
 *  - guest 有数据 + target 空：自动搬，沿用旧体验
 *  - guest 有数据 + target 也有数据：**不动 localStorage**，把两个 store 都解析好
 *    返给调用方，由 UI 弹窗让用户从 合并 / 覆盖 / 丢弃 中选。
 */
// Module-level cache：让 migrate 函数对相同 userId 幂等。
// React 18 strict mode 在 dev 下会对 useState lazy init / useEffect 双跑，第二次跑必须返回
// 第一次的结果，不能重复改 localStorage——否则会出现「第一次 migrate 写入 → 第二次 SAVE 把空
// 数据写回去 → 第二次 migrate 读到空数据当作 no_guest_data」的级联 race（实测踩到过）。
const _guestMigrationCache = new Map<string, GuestPromoteOutcome>();

const migrateGuestProjectStoreOnLogin = (targetUserId: string | number): GuestPromoteOutcome => {
  if (typeof window === 'undefined') return { status: 'no_window' };
  if (targetUserId === null || targetUserId === undefined || targetUserId === '') {
    return { status: 'no_guest_data' };
  }

  // 幂等：同一 userId 的第二次及之后调用直接返回首次结果，不重复改 localStorage。
  const cacheKey = String(targetUserId);
  const cached = _guestMigrationCache.get(cacheKey);
  if (cached) return cached;

  const guestKey = getLocalProjectStoreKey(null);
  const targetKey = getLocalProjectStoreKey(targetUserId);
  if (guestKey === targetKey) return { status: 'no_guest_data' };

  try {
    const guestRaw = localStorage.getItem(guestKey);
    if (!guestRaw) return { status: 'no_guest_data' };

    const guestParsed = JSON.parse(guestRaw);
    if (!projectStoreHasMeaningfulContent(guestParsed)) {
      // Guest 仅是默认占位，没必要搬，但也清掉避免下次干扰。
      localStorage.removeItem(guestKey);
      const outcome: GuestPromoteOutcome = { status: 'guest_pristine' };
      _guestMigrationCache.set(cacheKey, outcome);
      return outcome;
    }

    const targetRaw = localStorage.getItem(targetKey);
    const targetMeaningful = (() => {
      if (!targetRaw) return false;
      try {
        return projectStoreHasMeaningfulContent(JSON.parse(targetRaw));
      } catch {
        return false;
      }
    })();

    if (targetMeaningful) {
      // 双方都有内容——把两个 store 解析好返给调用方，等用户决定。
      const guestStore = parseProjectStoreRawStrict(guestRaw);
      const targetStore = parseProjectStoreRawStrict(targetRaw);
      if (!guestStore || !targetStore) return { status: 'storage_error' };
      const outcome: GuestPromoteOutcome = {
        status: 'needs_confirmation',
        guestStore,
        targetStore,
        stats: computeGuestPromoteStats(guestParsed),
      };
      _guestMigrationCache.set(cacheKey, outcome);
      return outcome;
    }

    // target 是空的或者格式坏掉——直接搬。
    const stats = computeGuestPromoteStats(guestParsed);
    localStorage.setItem(targetKey, guestRaw);
    localStorage.removeItem(guestKey);
    const outcome: GuestPromoteOutcome = { status: 'auto_migrated', stats };
    _guestMigrationCache.set(cacheKey, outcome);
    return outcome;
  } catch {
    return { status: 'storage_error' };
  }
};

const ensureUniqueProjectName = (rawName: string, projects: LocalProjectMeta[], excludeId?: string): string => {
  const baseName = (rawName || '').trim() || 'Project';
  const names = new Set(
    projects
      .filter((project) => project.id !== excludeId)
      .map((project) => project.name.toLowerCase())
  );
  if (!names.has(baseName.toLowerCase())) return baseName;
  let suffix = 1;
  let nextName = `${baseName}(${suffix})`;
  while (names.has(nextName.toLowerCase())) {
    suffix += 1;
    nextName = `${baseName}(${suffix})`;
  }
  return nextName;
};

/**
 * 合并 guest 的工作台到 target，返回合并后的新 store。
 * - 给每个 guest 项目重新生成 ID，避开 target 中已存在的 ID（最常见碰撞：双方都用了
 *   `project_alpha_01` 这个默认 ID）
 * - workspaces map 的 key 同步换成新 ID
 * - 项目名按现有 `ensureUniqueProjectName` 兜底冲突
 * - `currentProjectId` 切到 guest 当前项目的新 ID——让用户登录后第一眼看到刚上传的内容
 *
 * 不修改入参对象。
 */
const mergeGuestStoreIntoTarget = (
  guestStore: LocalProjectStore,
  targetStore: LocalProjectStore,
): LocalProjectStore => {
  const newProjectId = (): string => `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const idMap: Record<string, string> = {};
  const renamedGuestProjects: LocalProjectMeta[] = [];
  for (const p of guestStore.projects) {
    let candidateId = newProjectId();
    // 极小概率撞 target 已有 ID，重生几次
    let safety = 0;
    while (
      safety < 8 &&
      (targetStore.projects.some((tp) => tp.id === candidateId) ||
        renamedGuestProjects.some((rp) => rp.id === candidateId))
    ) {
      candidateId = newProjectId();
      safety += 1;
    }
    idMap[p.id] = candidateId;
    const uniqueName = ensureUniqueProjectName(
      p.name,
      [...targetStore.projects, ...renamedGuestProjects],
    );
    renamedGuestProjects.push({
      ...p,
      id: candidateId,
      name: uniqueName,
      updatedAt: Date.now(),
    });
  }

  const renamedGuestWorkspaces: Record<string, ProjectWorkspaceState> = {};
  for (const [oldId, ws] of Object.entries(guestStore.workspaces)) {
    const newId = idMap[oldId];
    if (newId) renamedGuestWorkspaces[newId] = ws;
  }

  const newCurrentProjectId =
    idMap[guestStore.currentProjectId] || targetStore.currentProjectId;

  return {
    currentProjectId: newCurrentProjectId,
    projects: [...targetStore.projects, ...renamedGuestProjects],
    workspaces: { ...targetStore.workspaces, ...renamedGuestWorkspaces },
  };
};

const SoraStarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M12 2.5l2.2 7.3 7.3 2.2-7.3 2.2-2.2 7.3-2.2-7.3-7.3-2.2 7.3-2.2L12 2.5Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

const RATIO_TO_RES: Record<string, string> = {
  '16:9': '1280*720',
  '9:16': '720*1280',
  '1:1': '1080*1080',
  '4:3': '1024*768',
  '3:4': '768*1024',
  '21:9': '1680*720',
};

const USER_CANCELLED_ADAPT = '__USER_CANCELLED_IMAGE_ADAPT__';

const inferMediaKind = (value: { name?: string | null; url?: string | null; type?: string | null; file?: File | null }): 'image' | 'video' | 'audio' | 'file' => {
  if (value.type === 'motion') return 'video';
  const file = value.file;
  if (file?.type?.startsWith('image/')) return 'image';
  if (file?.type?.startsWith('video/')) return 'video';
  if (file?.type?.startsWith('audio/')) return 'audio';

  const raw = String(value.name || value.url || '').split('?', 1)[0].toLowerCase();
  if (/\.(jpg|jpeg|png|webp|gif)$/.test(raw)) return 'image';
  if (/\.(mp4|mov|mkv|webm|avi)$/.test(raw)) return 'video';
  if (/\.(mp3|wav|flac)$/.test(raw)) return 'audio';
  return 'file';
};
const normalizeUiLanguageCode = (value: string | null | undefined): string => {
  const normalized = String(value || '').trim().toLowerCase().replace('_', '-');
  if (!normalized) return 'en';
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('en')) return 'en';
  if (normalized.startsWith('ms')) return 'ms';
  if (normalized.startsWith('vi')) return 'vi';
  if (normalized.startsWith('ko')) return 'ko';
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('es')) return 'es';
  return normalized.split('-', 1)[0] || 'en';
};

const buildProductRecognitionSourceSignature = (assets: QueuedAsset[]): string => {
  const entries = assets
    .filter((asset) => asset.materialType === 'product' && asset.mediaKind === 'image')
    .slice(0, 4)
    .map((asset) => {
      const fileName = String(asset.fileObj?.name || '').trim();
      const fileSize = Number(asset.fileObj?.size || 0);
      const fileLastModified = Number(asset.fileObj?.lastModified || 0);
      if (fileName && fileSize > 0) return `local::${fileName}::${fileSize}::${fileLastModified}`;

      const path = String(asset.uploadedPath || asset.assetUrl || '').trim();
      if (path) return path;
      return '';
    })
    .filter(Boolean)
    .sort();

  return entries.join('|');
};

const buildProductInfoSignature = (params: {
  productName?: string;
  productCategory?: string;
  coreSellingPoints?: string;
}): string => {
  return [
    String(params.productName || '').trim(),
    String(params.productCategory || '').trim(),
    String(params.coreSellingPoints || '').trim().replace(/\s+/g, ' '),
  ].join('||').toLowerCase();
};

// 增加前端图片压缩函数
const compressImage = async (file: File, maxWidth = 1920, maxHeight = 1920, quality = 0.8): Promise<File> => {
  if (!file.type.startsWith('image/')) return file;
  // 小于 500KB 的图片不压缩
  if (file.size < 500 * 1024) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
};

type LangLabelKey =
  | 'lang_en'
  | 'lang_zh'
  | 'lang_es'
  | 'lang_ja'
  | 'lang_ko'
  | 'lang_ms'
  | 'lang_vi'
  | 'lang_id';

type RegionLabelKey =
  | 'wb_region_us'
  | 'wb_region_sea'
  | 'wb_region_eu'
  | 'wb_region_jp'
  | 'wb_region_kr'
  | 'wb_region_cn'
  | 'wb_region_mx';

type GuideStepKey = 'mode' | 'upload' | 'config' | 'scripts' | 'preview';

const TARGET_LANGUAGE_OPTIONS: Array<{ value: string; labelKey: LangLabelKey }> = [
  { value: 'en', labelKey: 'lang_en' },
  { value: 'zh', labelKey: 'lang_zh' },
  { value: 'es', labelKey: 'lang_es' },
  { value: 'ja', labelKey: 'lang_ja' },
  { value: 'ko', labelKey: 'lang_ko' },
  { value: 'ms', labelKey: 'lang_ms' },
  { value: 'vi', labelKey: 'lang_vi' },
  { value: 'id', labelKey: 'lang_id' },
];

const DELIVERY_REGION_OPTIONS: Array<{ value: string; labelKey: RegionLabelKey }> = [
  { value: '中国', labelKey: 'wb_region_cn' },
  { value: '美国', labelKey: 'wb_region_us' },
  { value: '东南亚', labelKey: 'wb_region_sea' },
  { value: '欧洲', labelKey: 'wb_region_eu' },
  { value: '日本', labelKey: 'wb_region_jp' },
  { value: '韩国', labelKey: 'wb_region_kr' },
  { value: '墨西哥', labelKey: 'wb_region_mx' },
];

interface WorkbenchViewProps {
  initialFileUrl?: string | null;
  initialFileName?: string;
  initialAssetSource?: 'product' | 'preference' | null;
  initialLibraryAsset?: LibraryAsset | null;
  initialLibraryAssetToken?: string | null;
  initialLibraryAssetMode?: 'library_asset' | 'background_audio' | 'script_import';
  initialLibraryAssetTargetProjectId?: string | null;
  initialLibraryAssetForceFirstFrame?: boolean;
  onInitialLibraryAssetHandled?: () => void;
  initialTransferRole?: 'first_frame' | 'asset_apply' | null;
  initialTransferProjectName?: string | null;
  initialTransferModel?: 'sora2' | 'sora2pro' | 'seedance2.0' | null;
  onTransferRoleHandled?: () => void;
  templateList: Template[];
  onSelectTemplate: (t: Template | null) => void;
  selectedTemplate: Template | null;
  generatedVideoUrl: string | null;
  setGeneratedVideoUrl: (url: string | null) => void;
  onExportToServer?: (data: any) => Promise<void>;
  onNavigateToAssetsLibrary?: () => void;
}

export const WorkbenchView: React.FC<WorkbenchViewProps> = ({
  initialFileUrl,
  initialFileName,
  initialAssetSource,
  initialLibraryAsset,
  initialLibraryAssetToken,
  initialLibraryAssetMode,
  initialLibraryAssetTargetProjectId,
  initialLibraryAssetForceFirstFrame,
  onInitialLibraryAssetHandled,
  initialTransferRole,
  initialTransferProjectName,
  initialTransferModel,
  onTransferRoleHandled,
  templateList,
  onSelectTemplate,
  selectedTemplate,
  generatedVideoUrl,
  setGeneratedVideoUrl,
  onExportToServer,
  onNavigateToAssetsLibrary
}) => {
  const { t, language } = useLanguage();
  const uiLanguageCode = useMemo(() => normalizeUiLanguageCode(language), [language]);
  const { user } = useAuth();
  const { requireAuth } = useRequireAuth();
  const { tasks, addTask, updateTask, upsertTask } = useTasks();
  const { model: selectedModel, setModel: setSelectedModel } = useWorkbenchModel();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seedanceReplayFileInputRef = useRef<HTMLInputElement>(null);
  const backgroundAudioInputRef = useRef<HTMLInputElement>(null);
  const scriptFileInputRef = useRef<HTMLInputElement>(null);
  const assetLibraryUploadInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const modeSectionRef = useRef<HTMLDivElement | null>(null);
  const uploadSectionRef = useRef<HTMLDivElement | null>(null);
  const configSectionRef = useRef<HTMLDivElement | null>(null);
  const audioConfigSectionRef = useRef<HTMLDivElement | null>(null);
  const scriptsSectionRef = useRef<HTMLDivElement | null>(null);
  const previewSectionRef = useRef<HTMLDivElement | null>(null);
  const [scriptsColumnWidth, setScriptsColumnWidth] = useState(0);
  const SCRIPTS_HEADER_COMPACT_THRESHOLD = 480;
  const isScriptsHeaderCompact =
    scriptsColumnWidth > 0 && scriptsColumnWidth < SCRIPTS_HEADER_COMPACT_THRESHOLD;

  useEffect(() => {
    const element = scriptsSectionRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect?.width ?? 0;
        setScriptsColumnWidth((prev) => (Math.abs(prev - width) < 1 ? prev : width));
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const toDisplayUrl = (pathOrUrl: string | null | undefined): string | null => {
    if (!pathOrUrl) return null;
    const raw = String(pathOrUrl).trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
    const normalized = raw.startsWith('/') ? raw : `/${raw}`;
    const mediaBase: string = (import.meta as any).env?.VITE_MEDIA_BASE_URL || '';
    if (mediaBase && normalized.startsWith('/media/')) return `${mediaBase}${normalized}`;
    return normalized;
  };

  const [isPromptLabOpen, setIsPromptLabOpen] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<PromptStepTemplate[]>([]);
  const [promptOverrides, setPromptOverrides] = useState<PromptOverrides>(() =>
    ENABLE_PROMPT_LAB ? loadPromptOverrides() : {}
  );
  const [promptTemplatesLoading, setPromptTemplatesLoading] = useState(false);
  const [promptTemplatesError, setPromptTemplatesError] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [guideStepIndex, setGuideStepIndex] = useState(0);
  const [guidePanelStyle, setGuidePanelStyle] = useState<React.CSSProperties>({});
  const promptOverridesPayload = useMemo(
    () => (ENABLE_PROMPT_LAB ? buildBackendPromptOverrides(promptOverrides) : null),
    [promptOverrides]
  );
  const guideSteps = useMemo<Array<{ key: GuideStepKey; title: string; description: string }>>(
    () => [
      { key: 'mode', title: t.wb_guide_mode_title, description: t.wb_guide_mode_desc },
      { key: 'upload', title: t.wb_guide_upload_title, description: t.wb_guide_upload_desc },
      { key: 'config', title: t.wb_guide_config_title, description: t.wb_guide_config_desc },
      { key: 'scripts', title: t.wb_guide_scripts_title, description: t.wb_guide_scripts_desc },
      { key: 'preview', title: t.wb_guide_preview_title, description: t.wb_guide_preview_desc },
    ],
    [language, t]
  );
  const formatMessage = (template: string, values: Record<string, string | number>) =>
    template.replace(/\{(\w+)\}/g, (match, key) => (Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match));
  const popupTitles = {
    success: t.ui_dialog_success,
    notice: t.ui_dialog_notice,
    error: t.ui_dialog_error,
    warning: t.ui_dialog_warning,
  };

  const loadPromptLabTemplates = async () => {
    if (!ENABLE_PROMPT_LAB) return;
    if (promptTemplatesLoading) return;
    setPromptTemplatesError(null);
    setPromptTemplatesLoading(true);
    try {
      const resp: PromptTemplatesResponse = await videoApi.getPromptTemplates();
      const steps = resp?.data?.steps;
      if (Array.isArray(steps)) setPromptTemplates(steps);
    } catch (err: any) {
      console.warn('[PromptLab] failed to load templates:', err);
      setPromptTemplatesError(String(err?.message || err || '加载失败'));
    } finally {
      setPromptTemplatesLoading(false);
    }
  };

  const openPromptLab = async () => {
    const account = Number(user?.account);
    if (user?.account && account >= 13800000100 && account <= 13800000199) return;
    if (!ENABLE_PROMPT_LAB) return;
    setIsPromptLabOpen(true);
    if (promptTemplates.length > 0) return;
    await loadPromptLabTemplates();
  };

  const [uploadedFile, setUploadedFile] = useState<string | null>(initialFileUrl || null);
  const [fileName, setFileName] = useState(initialFileName || '');
  const [selectedFileObj, setSelectedFileObj] = useState<File | null>(null);
  const [selectedAssetSource, setSelectedAssetSource] = useState<'product' | 'preference' | 'subject' | 'tail' | null>(initialAssetSource || null);
  const [klingGenerateMode, setKlingGenerateMode] = useState<'first_frame' | 'subject' | 'first_last_frame'>('first_frame');

  const [isGeneratingKlingBoundaryFrames, setIsGeneratingKlingBoundaryFrames] = useState(false);
  const [imageGenModel, setImageGenModel] = useState<'flux-2-pro' | 'flux-2-flex' | 'gpt-image-1.5'>('flux-2-pro');
  const [isDragUploadActive, setIsDragUploadActive] = useState(false);
  const [isScriptDropActive, setIsScriptDropActive] = useState(false);
  const [selectedAssetUrl, setSelectedAssetUrl] = useState<string | null>(initialFileUrl || null);
  const [lastUploadedUrl, setLastUploadedUrl] = useState<string | null>(initialFileUrl || null);
  const [lastGeneratedProjectId, setLastGeneratedProjectId] = useState<string | null>(null);
  const [previewProjectId, setPreviewProjectId] = useState<string | null>(null);
  const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false);
  const [assetLibraryPickMode, setAssetLibraryPickMode] = useState<AssetLibraryPickMode>('default');
  const [assetLibraryTab, setAssetLibraryTab] = useState<AssetLibraryTab>('product');
  const [assetLibraryItems, setAssetLibraryItems] = useState<LibraryAsset[]>([]);
  const [assetLibraryFolders, setAssetLibraryFolders] = useState<AssetFolder[]>([]);
  const [assetLibraryBreadcrumb, setAssetLibraryBreadcrumb] = useState<AssetFolder[]>([]);
  const [assetLibraryCurrentFolderId, setAssetLibraryCurrentFolderId] = useState<string | null>(null);
  const [assetLibraryLoading, setAssetLibraryLoading] = useState(false);
  const [isAssetLibraryUploading, setIsAssetLibraryUploading] = useState(false);
  const [assetLibraryUploadSummaryToast, setAssetLibraryUploadSummaryToast] = useState<{ uploadedCount: number; addedCount: number } | null>(null);
  const assetLibraryUploadSummaryToastTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [assetLibraryHoverAssetId, setAssetLibraryHoverAssetId] = useState<string | null>(null);
  const [assetLibraryHoverClickedAssetId, setAssetLibraryHoverClickedAssetId] = useState<string | null>(null);
  const [assetLibraryError, setAssetLibraryError] = useState<string | null>(null);
  const [assetLibrarySubjects, setAssetLibrarySubjects] = useState<SubjectGroup[]>([]);
  const [seedanceReplayLibraryIntent, setSeedanceReplayLibraryIntent] = useState<SeedanceReplayLibraryIntent | null>(null);
  const [klingLibraryUploadTarget, setKlingLibraryUploadTarget] = useState<KlingLibraryUploadTarget>('default');
  const [draggingWorkbenchAssetId, setDraggingWorkbenchAssetId] = useState<string | null>(null);
  const [transferStationItems, setTransferStationItems] = useState<TransferStationItem[]>([]);
  const [isTransferStationOpen, setIsTransferStationOpen] = useState(false);
  const [isKlingSubjectGuideOpen, setIsKlingSubjectGuideOpen] = useState(false);
  const [isKlingSubjectModeHintDismissed, setIsKlingSubjectModeHintDismissed] = useState(false);

  const [isRestoring, setIsRestoring] = useState(true);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [wasDraftRestored, setWasDraftRestored] = useState(false);
  const hasAutoSelectedTemplateRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSnapshotRef = useRef<WorkbenchSnapshot | null>(null);
  const canAutoSaveRef = useRef(false);
  const skipTemplateDurationSyncRef = useRef(false);
  const restoredDraftRef = useRef(false);

  const initialPrefs = useMemo(() => getWorkbenchPreferences(user?.id ?? null), [user?.id]);
  const prefSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const normalizeDurationForModel = useCallback((value: number | null | undefined, model: string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 10;

    if (model === 'kling') return Math.min(10, Math.max(3, Math.round(numeric)));

    if (model === 'sora2' || model === 'sora2pro') {
      const allowed = [4, 8, 12];
      const rounded = Math.round(numeric);
      if (allowed.includes(rounded)) return rounded;
      return allowed.reduce((best, cur) => (
        Math.abs(cur - rounded) < Math.abs(best - rounded) ? cur : best
      ), allowed[1]);
    }

    return Math.min(15, Math.max(4, Math.round(numeric)));
  }, []);

  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [coreSellingPoints, setCoreSellingPoints] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [productInfoTouched, setProductInfoTouched] = useState({
    name: false,
    category: false,
    sellingPoints: false,
    audience: false,
  });
  const [deliveryRegion, setDeliveryRegion] = useState(() => initialPrefs.deliveryRegion || '中国');
  const [videoType, setVideoType] = useState(() => initialPrefs.videoType || '');
  const [aspectRatio, setAspectRatio] = useState<WorkbenchAspectRatio>(() => (
    normalizeWorkbenchAspectRatio(initialPrefs.aspectRatio)
  ));
  const [requiredErrors, setRequiredErrors] = useState<{
    productName?: string;
    productCategory?: string;
    coreSellingPoints?: string;
    videoType?: string;
  }>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [scriptGenerationNotice, setScriptGenerationNotice] = useState<string | null>(null);
  const [scriptGenerationEstimatedSeconds, setScriptGenerationEstimatedSeconds] = useState(45);
  const [scriptGenerationProgress, setScriptGenerationProgress] = useState(0);
  const [scriptGenerationCompletedCount, setScriptGenerationCompletedCount] = useState(0);
  const [scriptGenerationTotalCount, setScriptGenerationTotalCount] = useState(0);
  const [isScriptGenerationProgressVisible, setIsScriptGenerationProgressVisible] = useState(false);
  const scriptGenerationStartedAtRef = useRef<number | null>(null);
  const scriptGenerationEstimateKeyRef = useRef<string | null>(null);
  const scriptGenerationFinishingRef = useRef(false);
  const scriptGenerationAbortRef = useRef<AbortController | null>(null);
  const scriptGenerationLockRef = useRef(false);
  const activeScriptGenerationSeqRef = useRef(0);
  const scriptGenerationProjectIdRef = useRef<string | null>(null);
  const currentScriptQueueTaskIdRef = useRef<string | null>(null);
  const currentImageQueueTaskIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const currentProjectIdRef = useRef('');
  const transferStationOwnerId = user?.id ?? null;
  const refreshTransferStationItems = useCallback(() => {
    setTransferStationItems(loadTransferStationItems(transferStationOwnerId));
  }, [transferStationOwnerId]);

  useEffect(() => {
    refreshTransferStationItems();
  }, [refreshTransferStationItems]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handleTransferStationUpdated = () => {
      refreshTransferStationItems();
    };

    if (typeof window === 'undefined') return undefined;
    window.addEventListener('vflow-transfer-station-updated', handleTransferStationUpdated);
    return () => window.removeEventListener('vflow-transfer-station-updated', handleTransferStationUpdated);
  }, [refreshTransferStationItems]);

  useEffect(() => {
    if (transferStationItems.length === 0) {
      setIsTransferStationOpen(false);
    }
  }, [transferStationItems.length]);


  const productNameFieldRef = useRef<HTMLInputElement | null>(null);
  const productCategoryFieldRef = useRef<HTMLDivElement | null>(null);
  const coreSellingPointsFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const videoTypeFieldRef = useRef<HTMLDivElement | null>(null);
  const [genPrompt, setGenPrompt] = useState('');
  const [referenceScript, setReferenceScript] = useState('');
  const [genDuration, setGenDuration] = useState<number>(() => normalizeDurationForModel(initialPrefs.genDuration ?? selectedTemplate?.duration ?? 10, selectedModel));
  const [soundSetting, setSoundSetting] = useState<'on' | 'off'>(() => (initialPrefs.soundSetting === 'off' ? 'off' : 'on'));
  const [selectedBackgroundAudio, setSelectedBackgroundAudio] = useState<SelectedBackgroundAudio | null>(null);
  const [isBackgroundAudioSourceOpen, setIsBackgroundAudioSourceOpen] = useState(false);
  const [scriptVariantCount, setScriptVariantCount] = useState<number>(() =>
    typeof initialPrefs.scriptVariantCount === 'number' && initialPrefs.scriptVariantCount > 0 ? initialPrefs.scriptVariantCount : 1
  );
  const [targetLanguage, setTargetLanguage] = useState<string>(() => initialPrefs.targetLanguage || 'en');
  const [translatingShots, setTranslatingShots] = useState<Record<number, boolean>>({});
  const creationMode = 'fast' as 'fast' | 'replay';
  const isSeedanceReplayMode = false;
  const isSeedanceFastMode = selectedModel === 'seedance2.0';
  const isSeedanceMode = isSeedanceReplayMode || isSeedanceFastMode;
  const [seedanceReplayUploadIntent, setSeedanceReplayUploadIntent] = useState<SeedanceReplayUploadIntent>({ targetMediaKind: null });
  const [seedanceReplayFocusTarget, setSeedanceReplayFocusTarget] = useState<SeedanceReplayMediaKind | null>(null);
  const [replayUserReferenceGenerateCount, setReplayUserReferenceGenerateCount] = useState(1);
  const [replayTemplateCountsById, setReplayTemplateCountsById] = useState<Record<string, number>>({});
  const [replayPreviewTemplate, setReplayPreviewTemplate] = useState<ReplayScriptTemplate | null>(null);
  const [replayBatchRun, setReplayBatchRun] = useState<ReplayBatchRun | null>(null);
  const [reuseQueueEnabled, setReuseQueueEnabled] = useState(false);
  const [billingPricing, setBillingPricing] = useState<BillingPricingCatalog | null>(null);
  const [isModelSectionCollapsed, setIsModelSectionCollapsed] = useState(false);
  const [isUploadSectionCollapsed, setIsUploadSectionCollapsed] = useState(false);
  const [isAiRecognizing, setIsAiRecognizing] = useState(false);
  const [hasAiRecognized, setHasAiRecognized] = useState(false);
  const [recognizedProductSourceSignature, setRecognizedProductSourceSignature] = useState('');
  const [needsAiReRecognize, setNeedsAiReRecognize] = useState(false);
  const [aiOverwriteFields, setAiOverwriteFields] = useState<AiOverwriteField[]>([]);
  const [isAiOverwriteOpen, setIsAiOverwriteOpen] = useState(false);
  const aiOverwriteResolveRef = useRef<((selected: Set<string> | null) => void) | null>(null);
  const [referenceScriptProductSignature, setReferenceScriptProductSignature] = useState('');
  useEffect(() => {
    let active = true;

    billingApi.getOverview()
      .then((res) => {
        if (!active) return;
        setBillingPricing((res?.data?.pricing as BillingPricingCatalog | null) || null);
      })
      .catch(() => {
        if (!active) return;
        setBillingPricing(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const latestProductInfoRef = useRef({
    productName: '',
    productCategory: '',
    coreSellingPoints: '',
    targetAudience: '',
  });

  useEffect(() => {
    if (soundSetting !== 'off') {
      setIsBackgroundAudioSourceOpen(false);
    }
  }, [soundSetting]);

  useEffect(() => {
    latestProductInfoRef.current = {
      productName,
      productCategory,
      coreSellingPoints,
      targetAudience,
    };
  }, [coreSellingPoints, productCategory, productName, targetAudience]);

  const LEFT_COLUMN_MIN_WIDTH = 390;
  const SCRIPT_COLUMN_MIN_WIDTH = 350;
  const PREVIEW_COLUMN_MIN_WIDTH = 260;
  const LEFT_COLUMN_RATIO_KEY = `vflow_workbench_layout_ratio_v1_${user?.id ?? 'guest'}`;
  const SCRIPT_PREVIEW_RATIO_KEY = `vflow_workbench_script_preview_ratio_v1_${user?.id ?? 'guest'}`;
  const workspaceRowRef = useRef<HTMLDivElement | null>(null);
  const isResizingRef = useRef(false);
  const isResizingScriptPreviewRef = useRef(false);
  const [leftColumnWidth, setLeftColumnWidth] = useState<number>(() => {
    try {
      const ratioRaw = sessionStorage.getItem(LEFT_COLUMN_RATIO_KEY);
      const ratio = ratioRaw ? Number(ratioRaw) : NaN;
      const fallback = 320;
      if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) return fallback;
      const width = Math.round(window.innerWidth * ratio);
      return Math.min(640, Math.max(LEFT_COLUMN_MIN_WIDTH, width));
    } catch {
      return 320;
    }
  });
  const [scriptPreviewRatio, setScriptPreviewRatio] = useState<number>(() => {
    try {
      const ratioRaw = sessionStorage.getItem(SCRIPT_PREVIEW_RATIO_KEY);
      const ratio = ratioRaw ? Number(ratioRaw) : NaN;
      if (!Number.isFinite(ratio) || ratio <= 0.3 || ratio >= 0.8) return 0.55;
      return ratio;
    } catch {
      return 0.55;
    }
  });
  const currentAssetMediaKind = inferMediaKind({ name: fileName, url: selectedAssetUrl || uploadedFile, file: selectedFileObj });

  useEffect(() => {
    if (isRestoring) return;
    if (isApplyingProjectWorkspaceRef.current) return;

    if (prefSyncTimerRef.current) window.clearTimeout(prefSyncTimerRef.current);

    prefSyncTimerRef.current = window.setTimeout(() => {

      setWorkbenchPreferences({
        deliveryRegion,
        targetLanguage,
        videoType,
        aspectRatio,
        genDuration,
        soundSetting,
        scriptVariantCount,
        creationMode: 'fast',
        selectedModelId: selectedModel,
      }, user?.id ?? null);
    }, 400);

    return () => {
      if (prefSyncTimerRef.current) window.clearTimeout(prefSyncTimerRef.current);
    };
  }, [
    aspectRatio,
    deliveryRegion,
    genDuration,
    isRestoring,
    scriptVariantCount,
    selectedModel,
    soundSetting,
    targetLanguage,
    user?.id,
    videoType,
  ]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [waitProgress, setWaitProgress] = useState(0);
  const [waitProgressPhase, setWaitProgressPhase] = useState<WaitProgressPhase>('idle');
  const [waitingVideoFailed, setWaitingVideoFailed] = useState(false);
  const [isPostingTikTok, setIsPostingTikTok] = useState(false);
  const [isSavingScriptAsset, setIsSavingScriptAsset] = useState(false);
  const [isPreparingDebug, setIsPreparingDebug] = useState(false);
  const [isSendingDebug, setIsSendingDebug] = useState(false);
  const [debugPayloadText, setDebugPayloadText] = useState('');
  const [debugPreview, setDebugPreview] = useState<GeneratePreviewData | null>(null);
  const shotTypeOptions = useMemo<Array<{ value: string; label: string }>>(() => ([
    { value: 'Medium', label: t.wb_shot_type_medium || 'Medium' },
    { value: 'Detail', label: t.wb_shot_type_detail || 'Detail' },
    { value: 'Close-up', label: t.wb_shot_type_closeup || 'Close-up' },
    { value: 'Wide', label: t.wb_shot_type_wide || 'Wide' },
    { value: 'General', label: t.wb_shot_type_general || 'General' },
  ]), [
    t.wb_shot_type_medium,
    t.wb_shot_type_detail,
    t.wb_shot_type_closeup,
    t.wb_shot_type_wide,
    t.wb_shot_type_general,
  ]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const isInfoOpenRef = useRef(false);
  const [infoTitle, setInfoTitle] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const isBatchAutoAddInfoQueueingRef = useRef(false);
  const batchAutoAddInfoQueueRef = useRef<Array<{ title: string; message: string | null }>>([]);
  const openInfoDirect = (title: string, message: string | null = null) => {
    setInfoTitle(title || '');
    setInfoMessage(message || null);
    isInfoOpenRef.current = true;
    setIsInfoOpen(true);
  };
  const openInfo = (title: string, message: string | null = null) => {
    if (isBatchAutoAddInfoQueueingRef.current && title === popupTitles.notice) {
      const payload = { title: title || '', message: message || null };
      if (isInfoOpenRef.current) {
        batchAutoAddInfoQueueRef.current.push(payload);
      } else {
        openInfoDirect(payload.title, payload.message);
      }
      return;
    }
    openInfoDirect(title, message);
  };

  // ─── ErrorModal 状态（结构化错误弹窗） ───
  const [errorModalData, setErrorModalData] = useState<Omit<ErrorModalProps, 'isOpen' | 'onClose'> | null>(null);
  const closeErrorModal = () => setErrorModalData(null);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmOkLabel, setConfirmOkLabel] = useState('');
  const [confirmCancelLabel, setConfirmCancelLabel] = useState('');
  const confirmResolveRef = useRef<((v: boolean) => void) | null>(null);
  const openConfirm = (
    title: string,
    message: string,
    opts?: {
      okLabel?: string;
      cancelLabel?: string;
    }
  ) => {
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmTitle(title || '');
      setConfirmMessage(message || '');
      setConfirmOkLabel(opts?.okLabel || t.wb_confirm_ok);
      setConfirmCancelLabel(opts?.cancelLabel || t.wb_confirm_cancel);
      setIsConfirmOpen(true);
    });
  };

  const buildDemoScripts = useCallback(() => ([
    { id: 1, shot: '1', type: 'Medium', dur: '2s', visual: t.demo_shot1_visual, audio: t.demo_shot1_audio, audioTranslation: '' },
    { id: 2, shot: '2', type: 'Detail', dur: '2s', visual: t.demo_shot2_visual, audio: t.demo_shot2_audio, audioTranslation: '' }
  ]), [t]);
  const isDemoScriptsRef = useRef(false);
  const [scripts, setScripts] = useState<ScriptItem[]>(buildDemoScripts);
  const [scriptPages, setScriptPages] = useState<ScriptPage[]>(() => ([{ id: 'page-1', name: `${t.wb_script_page_prefix} 1`, scripts: buildDemoScripts() }]));
  const [activeScriptPage, setActiveScriptPage] = useState(0);
  const [isScriptSaveDialogOpen, setIsScriptSaveDialogOpen] = useState(false);
  const [scriptSaveNameDraft, setScriptSaveNameDraft] = useState('');
  const scriptPagesRef = useRef<ScriptPage[]>([]);
  const [isShotBreakdownOpen, setIsShotBreakdownOpen] = useState(false);
  const [enableStoryboardEditor, setEnableStoryboardEditor] = useState(false);
  const [storyboardEditorEnabledByPage, setStoryboardEditorEnabledByPage] = useState<Record<string, boolean>>({});
  const [shotBreakdownOpenByPage, setShotBreakdownOpenByPage] = useState<Record<string, boolean>>({});
  const [isGeneratingShotsOnly, setIsGeneratingShotsOnly] = useState(false);
  const [batchGenerateCountsByPage, setBatchGenerateCountsByPage] = useState<Record<string, number>>({});

  const [assetQueue, setAssetQueue] = useState<QueuedAsset[]>([]);
  const [scriptQueue, setScriptQueue] = useState<QueuedScript[]>([]);
  const [currentMaterialType, setCurrentMaterialType] = useState<AssetLibraryTab | null>(null);
  const [selectedQueueAssetId, setSelectedQueueAssetId] = useState<string | null>(null);
  const [seedanceReplayPreviewAsset, setSeedanceReplayPreviewAsset] = useState<QueuedAsset | null>(null);
  const [isAiOptimizeOpen, setIsAiOptimizeOpen] = useState(false);
  const [aiOptimizeReferenceId, setAiOptimizeReferenceId] = useState<string | null>(null);
  const [aiOptimizeCategory, setAiOptimizeCategory] = useState('');
  const [aiOptimizeKeywords, setAiOptimizeKeywords] = useState<string[]>([]);
  const [aiOptimizePrompt, setAiOptimizePrompt] = useState('');
  const [aiOptimizeAspectRatio, setAiOptimizeAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [aiOptimizeResolution, setAiOptimizeResolution] = useState<AiOptimizeResolution>('hd');
  const [aiOptimizeStyleStrength, setAiOptimizeStyleStrength] = useState(60);
  const [aiOptimizeCount, setAiOptimizeCount] = useState(2);
  const [isAiOptimizeGenerating, setIsAiOptimizeGenerating] = useState(false);
  const [isAiOptimizePromptGenerating, setIsAiOptimizePromptGenerating] = useState(false);
  const [isAiOptimizePromptSaving, setIsAiOptimizePromptSaving] = useState(false);
  const [aiOptimizeResults, setAiOptimizeResults] = useState<Array<{ id: string; url: string }>>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleQueueFocus = (event: Event) => {
      const detail = (event as CustomEvent<{ focus?: string }>).detail;
      const focus = String(detail?.focus || '').trim();
      if (!focus) return;

      if (focus === 'scripts') {
        scriptsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        return;
      }

      if (focus === 'preview') {
        previewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        return;
      }

      if (focus === 'image') {
        uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        if (!isAiOptimizeOpen && aiOptimizeResults.length > 0) {
          setIsAiOptimizeOpen(true);
        }
      }
    };

    window.addEventListener('vflow:queue-focus', handleQueueFocus as EventListener);
    return () => window.removeEventListener('vflow:queue-focus', handleQueueFocus as EventListener);
  }, [aiOptimizeResults.length, isAiOptimizeOpen]);

  const [projectStore, setProjectStore] = useState<LocalProjectStore>(() => {
    // 关键：在 loadLocalProjectStore 之前先 migrate 一次，让初始 React state
    // 直接读到 migrate 完的 _<userId>。否则后续 SAVE effect 第一次 fire 会把
    // 默认占位数据写回 _<userId>，覆盖 migrate 的成果（strict mode 双 fire 会
    // 进一步放大这个 race）。migrate 函数自带模块级缓存，幂等。
    if (typeof window !== 'undefined' && user?.id !== null && user?.id !== undefined && user.id !== '') {
      try {
        migrateGuestProjectStoreOnLogin(user.id);
      } catch {
        // 静默兜底，绝不阻塞 mount
      }
    }
    return loadLocalProjectStore(user?.id ?? null);
  });
  const [projectStoreOwner, setProjectStoreOwner] = useState<string>(() => getLocalProjectStoreOwner(user?.id ?? null));
  const [projectStoreLoadVersion, setProjectStoreLoadVersion] = useState(0);

  useEffect(() => {
    currentProjectIdRef.current = projectStore.currentProjectId;
  }, [projectStore.currentProjectId]);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [isTaskQueueOpen, setIsTaskQueueOpen] = useState(false);
  const taskQueueButtonRef = useRef<HTMLButtonElement | null>(null);
  const taskQueuePanelRef = useRef<HTMLDivElement | null>(null);
  const currentProjectVideoQueue = useMemo(() => {
    const currentId = String(projectStore.currentProjectId || '').trim();
    if (!currentId) return [];
    return tasks
      .filter((task) => String(task.workbenchProjectId || '').trim() === currentId && task.type === 'video_generation')
      .slice()
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }, [projectStore.currentProjectId, tasks]);
  const replayTaskById = useMemo(() => {
    const map = new Map<string, typeof tasks[number]>();
    tasks.forEach((task) => map.set(String(task.id), task));
    return map;
  }, [tasks]);
  const replayBatchProgress = useMemo(() => {
    if (!replayBatchRun) return null;

    const items = replayBatchRun.items.map((item) => {
      const remoteTask = item.taskId ? replayTaskById.get(String(item.taskId)) : null;
      if (!remoteTask) return item;

      const nextStatus: ReplayBatchItemStatus = remoteTask.status === 'success'
        ? 'success'
        : remoteTask.status === 'failed'
          ? 'failed'
          : 'processing';
      return {
        ...item,
        status: nextStatus,
        detail: nextStatus === 'success'
          ? (language === 'zh' ? '生成完成' : 'Generated')
          : nextStatus === 'failed'
            ? (remoteTask.result?.error || item.error || (language === 'zh' ? '生成失败' : 'Generation failed'))
            : item.detail,
        error: nextStatus === 'failed' ? (remoteTask.result?.error || item.error) : item.error,
      };
    });

    const reverseRequired = replayBatchRun.userReferenceCount > 0;
    const reverseScore = !reverseRequired
      ? 0
      : replayBatchRun.reverse.status === 'success' || replayBatchRun.reverse.status === 'failed'
        ? 1
        : replayBatchRun.reverse.status === 'processing'
          ? Math.max(0.15, Math.min(0.92, replayBatchRun.reverse.progress / 100))
          : replayBatchRun.reverse.status === 'queued'
            ? 0.05
            : 0;

    const itemScore = items.reduce((sum, item) => {
      if (item.status === 'success' || item.status === 'failed') return sum + 1;
      if (item.status === 'processing') return sum + 0.55;
      if (item.status === 'submitting') return sum + 0.2;
      return sum;
    }, 0);
    const totalUnits = items.length + (reverseRequired ? 1 : 0);
    const completedUnits = items.filter((item) => item.status === 'success' || item.status === 'failed').length
      + (reverseRequired && (replayBatchRun.reverse.status === 'success' || replayBatchRun.reverse.status === 'failed') ? 1 : 0);
    const percent = totalUnits > 0 ? Math.round(((itemScore + reverseScore) / totalUnits) * 100) : 0;

    return {
      items,
      completedUnits,
      totalUnits,
      percent: Math.max(0, Math.min(100, percent)),
    };
  }, [language, replayBatchRun, replayTaskById]);
  const [taskQueueNowTs, setTaskQueueNowTs] = useState<number>(Date.now());
  const taskQueueTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isCompletedCollapsed, setIsCompletedCollapsed] = useState(true);
  const waitProgressValueRef = useRef(0);
  const waitProgressPhaseRef = useRef<WaitProgressPhase>('idle');
  const waitProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitProgressRafRef = useRef<number | null>(null);
  const waitProgressStartedAtRef = useRef<number | null>(null);
  const waitProgressHoldValueRef = useRef<number | null>(null);
  const waitProgressTrackedTaskIdRef = useRef<string | null>(null);
  const waitProgressSimDurationMsRef = useRef<number>(WAIT_PROGRESS_SIM_DURATION_MS);
  const waitProgressDebugPrintedRef = useRef<boolean>(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectActionMenuId, setProjectActionMenuId] = useState<string | null>(null);
  const [isProjectManageMode, setIsProjectManageMode] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [renameRetryState, setRenameRetryState] = useState<{ projectId: string; originalName: string } | null>(null);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [newProjectNameDraft, setNewProjectNameDraft] = useState('');
  const [createProjectNameError, setCreateProjectNameError] = useState('');
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renamingProjectName, setRenamingProjectName] = useState('');
  const [isHeaderProjectEditing, setIsHeaderProjectEditing] = useState(false);
  const [headerProjectNameDraft, setHeaderProjectNameDraft] = useState('');
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<LocalProjectMeta | null>(null);
  const [deleteProjectIds, setDeleteProjectIds] = useState<string[]>([]);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const projectMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const projectActionMenuIdRef = useRef<string | null>(null);
  const projectListRef = useRef<HTMLDivElement | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const swipeStartTsRef = useRef<number | null>(null);
  const swipeActiveRef = useRef<boolean>(false);
  const isApplyingProjectWorkspaceRef = useRef(false);
  const isSwitchingProjectRef = useRef(false);
  const skipNextKlingNormalizeRef = useRef(false);
  const currentProject = useMemo(
    () => projectStore.projects.find((project) => project.id === projectStore.currentProjectId) || null,
    [projectStore.currentProjectId, projectStore.projects]
  );

  const activeVideoTasks = useMemo(
    () => tasks.filter((task) => task.type === 'video_generation' && (task.status === 'pending' || task.status === 'processing')),
    [tasks]
  );
  const activeVideoTaskCount = activeVideoTasks.length;

  const completedVideoTasks = useMemo(
    () => tasks.filter((task) => task.type === 'video_generation' && task.status === 'success'),
    [tasks]
  );
  const completedVideoTaskCount = completedVideoTasks.length;
  const previewTargetProjectId = lastGeneratedProjectId || projectStore.currentProjectId;
  const previewActiveTask = useMemo(() => {
    if (activeVideoTasks.length === 0) return null;

    const scoped = previewTargetProjectId
      ? activeVideoTasks.filter((task) => task.projectId === previewTargetProjectId)
      : [];
    const pool = scoped.length > 0 ? scoped : activeVideoTasks;

    return [...pool].sort((a, b) => {
      const at = a.updatedAt || a.createdAt || 0;
      const bt = b.updatedAt || b.createdAt || 0;
      return bt - at;
    })[0] || null;
  }, [activeVideoTasks, previewTargetProjectId]);

  const clearWaitProgressTimers = useCallback(() => {
    if (waitProgressTimerRef.current) {
      window.clearTimeout(waitProgressTimerRef.current);
      waitProgressTimerRef.current = null;
    }
    if (waitProgressRafRef.current) {
      window.cancelAnimationFrame(waitProgressRafRef.current);
      waitProgressRafRef.current = null;
    }
  }, []);

  const setWaitProgressWithRef = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(100, value));
    waitProgressValueRef.current = clamped;
    setWaitProgress(clamped);
  }, []);

  const setWaitProgressPhaseWithRef = useCallback((phase: WaitProgressPhase) => {
    waitProgressPhaseRef.current = phase;
    setWaitProgressPhase(phase);
  }, []);

  const tickWaitSimulation = useCallback(() => {
    const phase = waitProgressPhaseRef.current;
    if (phase === 'idle' || phase === 'finishing' || phase === 'done') return;

    const startedAt = waitProgressStartedAtRef.current;
    if (!startedAt) return;

    const elapsedMs = Date.now() - startedAt;
    const simDurationMs = waitProgressSimDurationMsRef.current || WAIT_PROGRESS_SIM_DURATION_MS;

    if (!waitProgressDebugPrintedRef.current) {
      const estSec = Math.round(simDurationMs / 1000);
      const ratioRaw = simDurationMs > 0 ? elapsedMs / simDurationMs : 0;
      console.log('[WaitProgressDebug]', {
        taskId: waitProgressTrackedTaskIdRef.current,
        estimatedSeconds: estSec,
        simDurationMs,
        elapsedMs,
        ratio: ratioRaw,
        percentApprox: Math.round(ratioRaw * 100),
      });
      waitProgressDebugPrintedRef.current = true;
    }

    if (phase === 'holding') {
      if (waitProgressHoldValueRef.current === null) {
        waitProgressHoldValueRef.current = 96;
      }
      setWaitProgressWithRef(waitProgressHoldValueRef.current);
      return;
    }

    const ratio = Math.max(0, Math.min(1, elapsedMs / simDurationMs));
    const eased = 1 - Math.pow(1 - ratio, 3);
    const next = eased * WAIT_PROGRESS_MAX_BEFORE_HOLD;

    if (ratio >= 1) {
      if (waitProgressHoldValueRef.current === null) {
        waitProgressHoldValueRef.current = 96;
      }
      setWaitProgressPhaseWithRef('holding');
      setWaitProgressWithRef(waitProgressHoldValueRef.current);
      return;
    }

    setWaitProgressPhaseWithRef('simulating');
    setWaitProgressWithRef(next);
  }, [setWaitProgressPhaseWithRef, setWaitProgressWithRef]);

  const scheduleWaitSimulationTick = useCallback(() => {
    if (waitProgressTimerRef.current) {
      window.clearTimeout(waitProgressTimerRef.current);
      waitProgressTimerRef.current = null;
    }

    const delay = waitProgressPhaseRef.current === 'holding'
      ? 1200 + Math.random() * 500
      : 320 + Math.random() * 900;

    waitProgressTimerRef.current = window.setTimeout(() => {
      tickWaitSimulation();
      if (waitProgressPhaseRef.current === 'simulating' || waitProgressPhaseRef.current === 'holding') {
        scheduleWaitSimulationTick();
      }
    }, delay);
  }, [tickWaitSimulation]);

  const startWaitProgressSimulation = useCallback((taskId: string, estimatedSeconds?: number | null) => {
    clearWaitProgressTimers();
    waitProgressTrackedTaskIdRef.current = taskId;
    waitProgressStartedAtRef.current = Date.now();
    waitProgressHoldValueRef.current = null;
    waitProgressDebugPrintedRef.current = false;

    const est = Number(estimatedSeconds);
    const durationMs = Number.isFinite(est) && est > 0 ? Math.round(est * 1000) : 120_000;
    waitProgressSimDurationMsRef.current = Math.max(30_000, Math.min(900_000, durationMs));

    setWaitingVideoFailed(false);
    setWaitProgressWithRef(0);
    setWaitProgressPhaseWithRef('simulating');
    tickWaitSimulation();
    scheduleWaitSimulationTick();
  }, [clearWaitProgressTimers, scheduleWaitSimulationTick, setWaitProgressPhaseWithRef, setWaitProgressWithRef, tickWaitSimulation]);

  const finishWaitProgressSimulation = useCallback(() => {
    if (waitProgressPhaseRef.current === 'finishing' || waitProgressPhaseRef.current === 'done') return;

    clearWaitProgressTimers();
    const from = Math.max(0, Math.min(100, waitProgressValueRef.current));

    if (from >= 100) {
      setWaitProgressWithRef(100);
      setWaitProgressPhaseWithRef('done');
      return;
    }

    setWaitProgressPhaseWithRef('finishing');
    const startedAt = performance.now();
    const durationMs = 480;

    const animate = (now: number) => {
      const ratio = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - ratio, 3);
      setWaitProgressWithRef(from + (100 - from) * eased);

      if (ratio < 1) {
        waitProgressRafRef.current = window.requestAnimationFrame(animate);
      } else {
        setWaitProgressWithRef(100);
        setWaitProgressPhaseWithRef('done');
      }
    };

    waitProgressRafRef.current = window.requestAnimationFrame(animate);
  }, [clearWaitProgressTimers, setWaitProgressPhaseWithRef, setWaitProgressWithRef]);

  const resetWaitProgressSimulation = useCallback(() => {
    clearWaitProgressTimers();
    waitProgressTrackedTaskIdRef.current = null;
    waitProgressStartedAtRef.current = null;
    waitProgressHoldValueRef.current = null;
    setWaitProgressWithRef(0);
    setWaitProgressPhaseWithRef('idle');
  }, [clearWaitProgressTimers, setWaitProgressPhaseWithRef, setWaitProgressWithRef]);

  useEffect(() => {
    const activeTaskId = previewActiveTask ? String(previewActiveTask.id) : null;
    const trackedTaskId = waitProgressTrackedTaskIdRef.current;

    if (activeTaskId) {
      if (trackedTaskId !== activeTaskId || waitProgressPhaseRef.current === 'idle') {
        startWaitProgressSimulation(activeTaskId, previewActiveTask?.estimatedSeconds);
      }
      return;
    }

    if (!trackedTaskId) return;

    const trackedTask = tasks.find((task) => String(task.id) === trackedTaskId);
    if (!trackedTask) {
      resetWaitProgressSimulation();
      return;
    }

    if (trackedTask.status === 'success') {
      finishWaitProgressSimulation();
      return;
    }

    if (trackedTask.status === 'failed') {
      resetWaitProgressSimulation();
    }
  }, [finishWaitProgressSimulation, previewActiveTask, resetWaitProgressSimulation, startWaitProgressSimulation, tasks]);

  useEffect(() => {
    return () => {
      clearWaitProgressTimers();
    };
  }, [clearWaitProgressTimers]);

  const waitingProgressPercent = Math.max(0, Math.min(100, Math.round(waitProgress)));
  const isWaitingPreview = !generatedVideoUrl && (
    Boolean(previewActiveTask)
    || waitProgressPhase === 'simulating'
    || waitProgressPhase === 'holding'
    || waitProgressPhase === 'finishing'
    || waitProgressPhase === 'done'
  );
  const waitingPhaseMessage = waitProgressPhase === 'holding'
    ? (t.wb_waiting_delayed || 'Taking longer than expected, waiting for final render...')
    : (t.wb_waiting_generating || t.wb_waiting || 'Waiting for generation...');

  const projectUiText = useMemo(() => ({
    listTooltip: t.wb_project_list_tooltip,
    switchTitle: t.wb_project_switch_title,
    searchPlaceholder: t.wb_project_search_placeholder,
    recent: t.wb_project_recent,
    empty: t.wb_project_empty,
    newProject: t.wb_project_new,
    manageProjects: t.wb_project_manage,
    manageSelectAll: t.wb_project_manage_select_all,
    manageUnselectAll: t.wb_project_manage_unselect_all,
    manageSoon: t.wb_project_manage_placeholder,
    manageCancel: t.wb_project_manage_cancel,
    manageDelete: t.wb_project_manage_delete,
    createTitle: t.wb_project_create_title,
    createNameLabel: t.wb_project_create_name_label,
    createNamePlaceholder: t.wb_project_create_name_placeholder,
    createConfirm: t.wb_project_create_confirm,
    rename: t.wb_project_rename,
    delete: t.wb_project_delete,
    deleteTitle: t.wb_project_delete_confirm_title,
    deleteDesc: t.wb_project_delete_confirm_desc,
    bulkDeleteTitle: t.wb_project_bulk_delete_confirm_title,
    bulkDeleteDesc: t.wb_project_bulk_delete_confirm_desc,
    cancel: t.wb_project_cancel,
    defaultProjectName: t.wb_project_default_name,
    justNow: t.wb_project_time_just_now,
    yesterday: t.wb_project_time_yesterday,
    minutesAgo: t.wb_project_time_minutes_ago,
    hoursAgo: t.wb_project_time_hours_ago,
    daysAgo: t.wb_project_time_days_ago,
    currentTag: t.wb_project_current_tag,
  }), [t]);

  const compactTimeLanguages = new Set(['zh', 'ko']);
  const useCompactTime = compactTimeLanguages.has(language);
  const sortedProjects: LocalProjectMeta[] = useMemo(
    () => [...projectStore.projects].sort((a, b) => (b.createdAt || b.updatedAt) - (a.createdAt || a.updatedAt)),
    [projectStore.projects]
  );
  const currentProjectIndex = useMemo(() => (
    sortedProjects.findIndex((p) => p.id === projectStore.currentProjectId)
  ), [sortedProjects, projectStore.currentProjectId]);
  const canGoToPrevProject = currentProjectIndex > 0;
  const canGoToNextProject = currentProjectIndex >= 0 && currentProjectIndex < sortedProjects.length - 1;
  const [rowStyle, setRowStyle] = useState<React.CSSProperties>({ transition: 'transform 420ms cubic-bezier(.22,.61,.36,1)', transform: 'translate3d(0,0,0)', willChange: 'transform' });
  const filteredProjects = useMemo(() => {
    const keyword = projectSearch.trim().toLowerCase();
    if (!keyword) return sortedProjects;
    return sortedProjects.filter((project) => project.name.toLowerCase().includes(keyword));
  }, [projectSearch, sortedProjects]);

  const formatProjectLastEdited = (updatedAt: number) => {
    const deltaMs = Date.now() - updatedAt;
    const minuteMs = 60 * 1000;
    const hourMs = 60 * minuteMs;
    const dayMs = 24 * hourMs;
    if (deltaMs < 5 * minuteMs) return projectUiText.justNow;
    if (deltaMs < hourMs) {
      const minutes = Math.max(1, Math.floor(deltaMs / minuteMs));
      return useCompactTime ? `${minutes}${projectUiText.minutesAgo}` : `${minutes} ${projectUiText.minutesAgo}`;
    }
    if (deltaMs < dayMs) {
      const hours = Math.max(1, Math.floor(deltaMs / hourMs));
      return useCompactTime ? `${hours}${projectUiText.hoursAgo}` : `${hours} ${projectUiText.hoursAgo}`;
    }
    if (deltaMs < dayMs * 2) return projectUiText.yesterday;
    const days = Math.max(2, Math.floor(deltaMs / dayMs));
    return useCompactTime ? `${days}${projectUiText.daysAgo}` : `${days} ${projectUiText.daysAgo}`;
  };

  const applyWorkspaceState = useCallback((workspace: ProjectWorkspaceState) => {
    const normalizePersistedUrl = (value: string | null | undefined, fallback?: string | null | undefined) => {
      const primary = value || '';
      const backup = fallback || '';
      if (primary && !primary.startsWith('blob:')) return primary;
      if (backup && !backup.startsWith('blob:')) return backup;
      return primary || backup || null;
    };
    const restoredModelId =
      workspace.selectedModelId === 'kling' ||
        workspace.selectedModelId === 'sora2' ||
        workspace.selectedModelId === 'sora2pro' ||
        workspace.selectedModelId === 'seedance2.0'
        ? workspace.selectedModelId
        : (
          initialPrefs.selectedModelId === 'kling' ||
            initialPrefs.selectedModelId === 'sora2' ||
            initialPrefs.selectedModelId === 'sora2pro' ||
            initialPrefs.selectedModelId === 'seedance2.0'
            ? initialPrefs.selectedModelId
            : 'sora2'
        );

    isApplyingProjectWorkspaceRef.current = true;
    skipNextKlingNormalizeRef.current = true;

    const restoredLastUploaded = workspace.lastUploadedUrl || null;
    const restoredUploadedFileRaw = workspace.uploadedFile || null;
    const restoredUploadedFile = (() => {
      if (restoredUploadedFileRaw && restoredUploadedFileRaw.startsWith('blob:')) {
        return toDisplayUrl(restoredLastUploaded);
      }
      return toDisplayUrl(restoredUploadedFileRaw) || restoredUploadedFileRaw;
    })();

    const restoredAssetQueue = (Array.isArray(workspace.assetQueue) ? workspace.assetQueue : []).map((item) => {
      const rawPreview = item?.previewUrl || null;
      const stablePreview =
        (rawPreview && rawPreview.startsWith('blob:'))
          ? (toDisplayUrl(item.uploadedPath || item.assetUrl) || null)
          : (toDisplayUrl(rawPreview) || rawPreview);

      return {
        ...item,
        previewUrl: stablePreview,
        assetUrl: toDisplayUrl(item.assetUrl) || item.assetUrl,
        uploadedPath: item.uploadedPath || null,
        fileObj: null,
      } as QueuedAsset;
    });

    setFileName(workspace.fileName || '');
    setUploadedFile(restoredUploadedFile);
    setSelectedAssetUrl(toDisplayUrl(workspace.selectedAssetUrl) || workspace.selectedAssetUrl || null);
    setLastUploadedUrl(restoredLastUploaded);
    setSelectedAssetSource(workspace.selectedAssetSource || null);
    setKlingGenerateMode(
      workspace.klingGenerateMode === 'subject'
        ? 'subject'
        : workspace.klingGenerateMode === 'first_last_frame'
          ? 'first_last_frame'
          : 'first_frame'
    );
    setCurrentMaterialType(workspace.currentMaterialType || null);
    setSelectedFileObj(null);
    setProductName(workspace.productName || '');
    setProductCategory(workspace.productCategory || '');
    setCoreSellingPoints(workspace.coreSellingPoints || '');
    setTargetAudience(workspace.targetAudience || '');
    setDeliveryRegion(workspace.deliveryRegion || initialPrefs.deliveryRegion || '中国');
    setVideoType(workspace.videoType || initialPrefs.videoType || '');
    setAspectRatio(normalizeWorkbenchAspectRatio(workspace.aspectRatio || initialPrefs.aspectRatio));
    setHasAiRecognized(!!workspace.hasAiRecognized);
    setRecognizedProductSourceSignature(String(workspace.recognizedProductSourceSignature || ''));
    setNeedsAiReRecognize(!!workspace.needsAiReRecognize);
    setGenPrompt(workspace.genPrompt || '');
    setReferenceScript(workspace.referenceScript || '');
    setReferenceScriptProductSignature(
      String(workspace.referenceScriptProductSignature || '')
    );
    setGenDuration(normalizeDurationForModel(
      workspace.genDuration ?? initialPrefs.genDuration ?? 10,
      restoredModelId
    ));
    setSoundSetting(workspace.soundSetting || (initialPrefs.soundSetting === 'off' ? 'off' : 'on'));
    setSelectedBackgroundAudio(workspace.selectedBackgroundAudio || null);
    setScriptVariantCount(
      typeof workspace.scriptVariantCount === 'number'
        ? workspace.scriptVariantCount
        : (typeof initialPrefs.scriptVariantCount === 'number' && initialPrefs.scriptVariantCount > 0 ? initialPrefs.scriptVariantCount : 1)
    );
    setTargetLanguage(workspace.targetLanguage || initialPrefs.targetLanguage || 'en');
    setReuseQueueEnabled(!!workspace.reuseQueueEnabled);
    const restoredScriptPages = (Array.isArray(workspace.scriptPages) && workspace.scriptPages.length > 0)
      ? workspace.scriptPages
      : [{ id: 'page-1', name: `${t.wb_script_page_prefix} 1`, scripts: [] }];
    const restoredActivePage = (
      typeof workspace.activeScriptPage === 'number'
      && workspace.activeScriptPage >= 0
      && workspace.activeScriptPage < restoredScriptPages.length
    ) ? workspace.activeScriptPage : 0;
    setScriptPages(restoredScriptPages);
    setActiveScriptPage(restoredActivePage);
    setScripts(restoredScriptPages[restoredActivePage]?.scripts || (Array.isArray(workspace.scripts) ? workspace.scripts : []));
    setBatchGenerateCountsByPage({});
    setAssetQueue(restoredAssetQueue);
    setScriptQueue(Array.isArray(workspace.scriptQueue) ? workspace.scriptQueue : []);
    setGeneratedVideoUrl(workspace.generatedVideoUrl || null);

    if (workspace.selectedTemplateId) {
      const matchedTemplate = templateList.find((tpl) => tpl.id === workspace.selectedTemplateId) || null;
      onSelectTemplate(matchedTemplate);
    } else {
      onSelectTemplate(null);
    }
    setSelectedModel(restoredModelId);
    setTimeout(() => {
      isApplyingProjectWorkspaceRef.current = false;
      isSwitchingProjectRef.current = false;
    }, 600);
  }, [initialPrefs.genDuration, initialPrefs.selectedModelId, normalizeDurationForModel, onSelectTemplate, setSelectedModel, t.wb_script_page_prefix, templateList]);

  const beginHeaderRename = () => {
    if (!currentProject) return;
    setIsHeaderProjectEditing(true);
    setHeaderProjectNameDraft(currentProject.name);
  };

  const commitProjectRename = (
    projectId: string,
    nameDraft: string,
    options?: { keepEditingOnFail?: boolean; originalName?: string }
  ) => {
    const trimmedName = (nameDraft || '').trim();
    if (trimmedName.length > MAX_PROJECT_NAME_LENGTH) {
      const messageTpl = t.wb_project_name_too_long || 'Project name must be {max} characters or fewer';
      if (options?.keepEditingOnFail) {
        const fallbackName = options.originalName ?? projectStore.projects.find((p) => p.id === projectId)?.name ?? '';
        setRenameRetryState({ projectId, originalName: fallbackName });
      }
      openInfo(
        t.assets_confirm_title || 'Notice',
        messageTpl.replace('{max}', String(MAX_PROJECT_NAME_LENGTH))
      );
      return false;
    }
    setProjectStore((prev) => {
      const nextName = ensureUniqueProjectName(trimmedName, prev.projects, projectId);
      return {
        ...prev,
        projects: prev.projects.map((project) => (
          project.id === projectId ? { ...project, name: nextName, updatedAt: Date.now() } : project
        )),
      };
    });
    setRenameRetryState(null);
    return true;
  };

  const closeInfoDialog = () => {
    if (batchAutoAddInfoQueueRef.current.length > 0) {
      const next = batchAutoAddInfoQueueRef.current.shift();
      if (next) {
        openInfoDirect(next.title, next.message);
        return;
      }
    }
    isInfoOpenRef.current = false;
    setIsInfoOpen(false);
    if (renameRetryState) {
      setProjectMenuOpen(true);
      setRenamingProjectId(renameRetryState.projectId);
      setRenamingProjectName(renameRetryState.originalName);
      setProjectActionMenuId(null);
      setRenameRetryState(null);
    }
  };

  const switchProject = (projectId: string) => {
    const normalizedId = String(projectId || '').trim();
    if (!normalizedId) return;

    if (normalizedId === projectStore.currentProjectId) {
      setProjectMenuOpen(false);
      return;
    }

    isSwitchingProjectRef.current = true;

    setProjectStore((prev) => {
      const now = Date.now();
      const hasProject = prev.projects.some((p) => p.id === normalizedId);
      const projects = hasProject
        ? prev.projects
        : [{
          id: normalizedId,
          name: ensureUniqueProjectName(`Project ${normalizedId.slice(0, 6)}`, prev.projects),
          updatedAt: now,
          createdAt: now,
        }, ...prev.projects];

      const workspaces = prev.workspaces[normalizedId]
        ? prev.workspaces
        : {
          ...prev.workspaces,
          [normalizedId]: createWorkspaceState({
            scripts: buildDemoScripts(),
            scriptPagePrefix: t.wb_script_page_prefix,
            userId: user?.id ?? null,
          }),
        };

      return {
        ...prev,
        currentProjectId: normalizedId,
        projects,
        workspaces,
      };
    });

    setProjectMenuOpen(false);
    setProjectActionMenuId(null);
    setIsProjectManageMode(false);
    setSelectedProjectIds([]);
    setRenamingProjectId(null);
  };

  const goToPrevProject = useCallback(() => {
    const list = sortedProjects;
    const idx = list.findIndex((p) => p.id === projectStore.currentProjectId);
    if (idx > 0) {
      setRowStyle({ transition: 'transform 420ms cubic-bezier(.22,.61,.36,1)', transform: 'translate3d(110%,0,0)', willChange: 'transform' });
      window.setTimeout(() => {
        switchProject(list[idx - 1].id);
        setRowStyle({ transition: 'none', transform: 'translate3d(-110%,0,0)' });
        window.requestAnimationFrame(() => {
          setRowStyle({ transition: 'transform 420ms cubic-bezier(.22,.61,.36,1)', transform: 'translate3d(0,0,0)', willChange: 'transform' });
        });
      }, 420);
    }
  }, [sortedProjects, projectStore.currentProjectId, switchProject]);

  const goToNextProject = useCallback(() => {
    const list = sortedProjects;
    const idx = list.findIndex((p) => p.id === projectStore.currentProjectId);
    if (idx >= 0 && idx < list.length - 1) {
      setRowStyle({ transition: 'transform 420ms cubic-bezier(.22,.61,.36,1)', transform: 'translate3d(-110%,0,0)', willChange: 'transform' });
      window.setTimeout(() => {
        switchProject(list[idx + 1].id);
        setRowStyle({ transition: 'none', transform: 'translate3d(110%,0,0)' });
        window.requestAnimationFrame(() => {
          setRowStyle({ transition: 'transform 420ms cubic-bezier(.22,.61,.36,1)', transform: 'translate3d(0,0,0)', willChange: 'transform' });
        });
      }, 420);
    }
  }, [sortedProjects, projectStore.currentProjectId, switchProject]);

  const ensureProjectInStore = useCallback((projectId: string) => {
    const rawProjectId: unknown = projectId;
    const normalizedId = (typeof rawProjectId === 'string' || typeof rawProjectId === 'number')
      ? String(rawProjectId).trim()
      : '';

    if (!normalizedId || normalizedId === 'undefined' || normalizedId === 'null' || normalizedId === '[object Object]') {
      console.warn('[TaskQueue] ensureProjectInStore: invalid projectId', { rawProjectId, normalizedId });
      return;
    }

    setProjectStore((prev) => {
      const now = Date.now();
      const existing = prev.projects.find((p) => p.id === normalizedId) || null;
      const hasWorkspace = !!prev.workspaces[normalizedId];

      console.debug('[TaskQueue] ensureProjectInStore', {
        rawProjectId,
        normalizedId,
        existed: !!existing,
        hasWorkspace,
        prevProjectCount: prev.projects.length,
        currentProjectId: prev.currentProjectId,
      });

      if (existing) {
        const nextProjects = prev.projects.map((p) => (p.id === normalizedId ? { ...p, updatedAt: now } : p));
        if (hasWorkspace) return { ...prev, projects: nextProjects };
        return {
          ...prev,
          projects: nextProjects,
          workspaces: {
            ...prev.workspaces,
            [normalizedId]: createWorkspaceState({
              scripts: buildDemoScripts(),
              scriptPagePrefix: t.wb_script_page_prefix,
              userId: user?.id ?? null,
            }),
          },
        };
      }

      const baseName = `Project ${normalizedId.slice(0, 6)}`;
      const name = ensureUniqueProjectName(baseName, prev.projects);

      return {
        ...prev,
        projects: [{ id: normalizedId, name, updatedAt: now, createdAt: now }, ...prev.projects],
        workspaces: {
          ...prev.workspaces,
          [normalizedId]: createWorkspaceState({
            scripts: buildDemoScripts(),
            scriptPagePrefix: t.wb_script_page_prefix,
            userId: user?.id ?? null,
          }),
        },
      };
    });
  }, [buildDemoScripts, t.wb_script_page_prefix, user?.id]);

  const goToProject = useCallback((projectId: string, onSwitched?: () => void) => {
    const list = sortedProjects;
    const idx = list.findIndex((p) => p.id === projectStore.currentProjectId);
    const targetIdx = list.findIndex((p) => p.id === projectId);

    // If current or target not found in list, or same project, fall back to direct switch
    if (idx === -1 || targetIdx === -1) {
      console.debug('[TaskQueue] goToProject fallback switch', {
        currentProjectId: projectStore.currentProjectId,
        targetProjectId: projectId,
        idx,
        targetIdx,
        knownProjects: list.slice(0, 8).map((p) => p.id),
        totalProjects: list.length,
      });
      switchProject(projectId);
      if (onSwitched) onSwitched();
      return;
    }

    if (idx === targetIdx) {
      if (onSwitched) onSwitched();
      return;
    }

    // if target is before current, animate right-to-left (prev style)
    if (targetIdx < idx) {
      setRowStyle({ transition: 'transform 420ms cubic-bezier(.22,.61,.36,1)', transform: 'translate3d(110%,0,0)', willChange: 'transform' });
      window.setTimeout(() => {
        switchProject(projectId);
        setRowStyle({ transition: 'none', transform: 'translate3d(-110%,0,0)' });
        window.requestAnimationFrame(() => {
          setRowStyle({ transition: 'transform 420ms cubic-bezier(.22,.61,.36,1)', transform: 'translate3d(0,0,0)', willChange: 'transform' });
        });
        // ensure switching flag cleared and then run callback
        window.setTimeout(() => {
          isSwitchingProjectRef.current = false;
          if (onSwitched) onSwitched();
        }, 80);
      }, 420);
      return;
    }

    // target is after current, animate left-to-right (next style)
    setRowStyle({ transition: 'transform 420ms cubic-bezier(.22,.61,.36,1)', transform: 'translate3d(-110%,0,0)', willChange: 'transform' });
    window.setTimeout(() => {
      switchProject(projectId);
      setRowStyle({ transition: 'none', transform: 'translate3d(110%,0,0)' });
      window.requestAnimationFrame(() => {
        setRowStyle({ transition: 'transform 420ms cubic-bezier(.22,.61,.36,1)', transform: 'translate3d(0,0,0)', willChange: 'transform' });
      });
      window.setTimeout(() => {
        isSwitchingProjectRef.current = false;
        if (onSwitched) onSwitched();
      }, 80);
    }, 420);
  }, [sortedProjects, projectStore.currentProjectId, switchProject]);

  const createNewProject = (nameDraft?: string) => {
    const rawName = (nameDraft || '').trim() || projectUiText.defaultProjectName;
    if (rawName.length > MAX_PROJECT_NAME_LENGTH) {
      const messageTpl = t.wb_project_name_too_long || 'Project name must be {max} characters or fewer';
      setCreateProjectNameError(messageTpl.replace('{max}', String(MAX_PROJECT_NAME_LENGTH)));
      return;
    }
    setCreateProjectNameError('');
    const projectId = `project_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const demoScripts = buildDemoScripts();
    setProjectStore((prev) => {
      const projectName = ensureUniqueProjectName(rawName, prev.projects);
      const nextWorkspace = createWorkspaceState({
        scripts: demoScripts,
        scriptPagePrefix: t.wb_script_page_prefix,
        userId: user?.id ?? null,
      });
      return {
        currentProjectId: projectId,
        projects: [{ id: projectId, name: projectName, updatedAt: Date.now(), createdAt: Date.now() }, ...prev.projects],
        workspaces: {
          ...prev.workspaces,
          [projectId]: nextWorkspace,
        },
      };
    });
    setProjectMenuOpen(false);
    setProjectActionMenuId(null);
    setIsProjectManageMode(false);
    setSelectedProjectIds([]);
    setIsCreateProjectOpen(false);
    setNewProjectNameDraft('');
    setCreateProjectNameError('');
  };

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds((prev) => (
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    ));
  };

  const removeProjectsByIds = (ids: string[]) => {
    const idSet = new Set(ids);
    setProjectStore((prev) => {
      const remaining = prev.projects.filter((project) => !idSet.has(project.id));
      const nextProjects = remaining.length > 0
        ? remaining
        : [{ id: 'project_alpha_01', name: DEFAULT_PROJECT_NAME, updatedAt: Date.now(), createdAt: Date.now() }];
      const nextCurrent = idSet.has(prev.currentProjectId) ? nextProjects[0].id : prev.currentProjectId;
      const nextWorkspaces = { ...prev.workspaces };
      ids.forEach((id) => { delete nextWorkspaces[id]; });
      if (!nextWorkspaces[nextCurrent]) {
        nextWorkspaces[nextCurrent] = createWorkspaceState({
          scripts: buildDemoScripts(),
          scriptPagePrefix: t.wb_script_page_prefix,
          userId: user?.id ?? null,
        });
      }
      return {
        currentProjectId: nextCurrent,
        projects: nextProjects,
        workspaces: nextWorkspaces,
      };
    });
  };
  const injectedAssetSignaturesRef = useRef<Set<string>>(new Set());
  const transferExecutionKeyRef = useRef<string>('');

  useEffect(() => {
    if (!initialTransferRole && !initialTransferModel) {
      transferExecutionKeyRef.current = '';
    }
  }, [initialTransferModel, initialTransferRole]);

  useEffect(() => {
    if (!initialLibraryAsset || !initialLibraryAssetToken) return;
    if (isRestoring) return;
    if (initialLibraryAssetMode !== 'background_audio') return;
    if (injectedAssetSignaturesRef.current.has(initialLibraryAssetToken)) return;
    injectedAssetSignaturesRef.current.add(initialLibraryAssetToken);
    setSoundSetting('off');
    setSelectedBackgroundAudio({
      id: initialLibraryAsset.id,
      name: initialLibraryAsset.name || 'audio',
      file_url: initialLibraryAsset.file_url,
    });
    window.setTimeout(() => {
      (audioConfigSectionRef.current || configSectionRef.current)?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    }, 120);
    onInitialLibraryAssetHandled?.();
  }, [initialLibraryAsset, initialLibraryAssetMode, initialLibraryAssetToken, isRestoring, onInitialLibraryAssetHandled]);

  useEffect(() => {
    if (!initialLibraryAsset || !initialLibraryAssetToken) return;
    if (isRestoring) return;
    if (initialLibraryAssetMode === 'background_audio' || initialLibraryAssetMode === 'script_import') return;
    // Skip if a transfer operation is in progress — the transfer effect handles injection after workspace reset
    if (initialTransferRole || initialTransferModel) return;
    if (injectedAssetSignaturesRef.current.has(initialLibraryAssetToken)) return;
    injectedAssetSignaturesRef.current.add(initialLibraryAssetToken);

    const injectAssetIntoCurrentProject = () => {
      queueLibraryAssetIntoWorkbench(initialLibraryAsset, {
        preferLastModeRouting: true,
        forceFirstFrame: initialLibraryAssetForceFirstFrame === true,
      });
      onInitialLibraryAssetHandled?.();
    };

    const targetProjectId = String(initialLibraryAssetTargetProjectId || '').trim();
    if (targetProjectId && targetProjectId !== projectStore.currentProjectId) {
      ensureProjectInStore(targetProjectId);
      goToProject(targetProjectId, injectAssetIntoCurrentProject);
      return;
    }

    injectAssetIntoCurrentProject();
  }, [
    ensureProjectInStore,
    goToProject,
    initialLibraryAsset,
    initialLibraryAssetForceFirstFrame,
    initialLibraryAssetMode,
    initialLibraryAssetTargetProjectId,
    initialLibraryAssetToken,
    initialTransferModel,
    initialTransferRole,
    isRestoring,
    onInitialLibraryAssetHandled,
    projectStore.currentProjectId,
    queueLibraryAssetIntoWorkbench,
  ]);

  // Switch model and create a new project when a transfer comes from ImageHistoryPanel "apply to workbench"
  //
  // IMPORTANT timing note:
  //   createNewProject() changes projectStore.currentProjectId, which triggers the
  //   workspace-restore effect (applyWorkspaceState).  That effect resets ALL state
  //   — including asset/upload state — to a blank workspace.  It sets
  //   `isApplyingProjectWorkspaceRef = true` and resets it when done.
  //
  //   Instead of a fragile fixed-delay setTimeout, we poll the ref at 50ms intervals
  //   and inject the transferred asset as soon as the restore completes.  A 5-second
  //   safety cap prevents infinite polling.
  useEffect(() => {
    if (!initialTransferRole && !initialTransferModel) return;

    const transferKey = [
      String(initialTransferRole || ''),
      String(initialTransferModel || ''),
      String(initialLibraryAssetToken || ''),
      String(initialLibraryAssetTargetProjectId || ''),
      String(initialTransferProjectName || ''),
    ].join('::');

    if (transferExecutionKeyRef.current === transferKey) return;
    transferExecutionKeyRef.current = transferKey;

    // 1. Create a new project first (this triggers applyWorkspaceState which blanks everything)
    if (initialTransferRole) {
      createNewProject(initialTransferProjectName || projectUiText.defaultProjectName);
    }

    // 2. Poll until applyWorkspaceState finishes (isApplyingProjectWorkspaceRef becomes false)
    let elapsed = 0;
    const POLL_INTERVAL = 50;
    const MAX_WAIT = 5000;
    const poller = window.setInterval(() => {
      elapsed += POLL_INTERVAL;
      // Still applying — keep waiting (unless we've exceeded the safety cap)
      if (isApplyingProjectWorkspaceRef.current && elapsed < MAX_WAIT) return;
      window.clearInterval(poller);

      // 2a. Switch model (only Sora-family models are supported for transfer)
      if (initialTransferModel) {
        setSelectedModel(initialTransferModel);
      }

      const finalizeTransfer = () => {
        onTransferRoleHandled?.();
      };

      const injectTransferredAsset = () => {
        // 2b. Inject the asset that was set in selectedAssetForWorkbench by Workbench.tsx
        if (initialLibraryAsset && initialLibraryAssetToken) {
          // Reset the dedup set so this token can be consumed after the workspace reset
          injectedAssetSignaturesRef.current.delete(initialLibraryAssetToken);
          queueLibraryAssetIntoWorkbench(initialLibraryAsset, {
            preferLastModeRouting: true,
            forceFirstFrame: initialLibraryAssetForceFirstFrame === true,
          });
          // Also mark the asset as handled so the normal injection effect doesn't fire again
          onInitialLibraryAssetHandled?.();
        }
        // 2c. Clear the transfer signals
        finalizeTransfer();
      };

      const targetProjectId = String(initialLibraryAssetTargetProjectId || '').trim();
      if (targetProjectId && targetProjectId !== projectStore.currentProjectId) {
        ensureProjectInStore(targetProjectId);
        goToProject(targetProjectId, injectTransferredAsset);
        return;
      }

      injectTransferredAsset();
    }, POLL_INTERVAL);

    return () => window.clearInterval(poller);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ensureProjectInStore,
    goToProject,
    initialLibraryAsset,
    initialLibraryAssetForceFirstFrame,
    initialLibraryAssetTargetProjectId,
    initialLibraryAssetToken,
    initialTransferModel,
    initialTransferProjectName,
    initialTransferRole,
    projectUiText.defaultProjectName,
    onInitialLibraryAssetHandled,
    onTransferRoleHandled,
    projectStore.currentProjectId,
    queueLibraryAssetIntoWorkbench,
    setSelectedModel,
  ]);

  useEffect(() => {
    if (initialLibraryAsset) return;
    if (!initialFileUrl) return;
    if (isRestoring) return;
    const name = initialFileName || '未命名素材';
    const source = initialAssetSource || 'preference';
    const signature = `${initialFileUrl}::${name}`;

    setUploadedFile(initialFileUrl);
    setSelectedAssetUrl(initialFileUrl);
    setLastUploadedUrl(initialFileUrl);
    setSelectedFileObj(null);
    setFileName(name);
    setSelectedAssetSource(source);

    if (injectedAssetSignaturesRef.current.has(signature)) return;
    injectedAssetSignaturesRef.current.add(signature);

    setAssetQueue(prev => ([
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        previewUrl: initialFileUrl,
        fileObj: null,
        assetUrl: initialFileUrl,
        source,
        materialType: source === 'preference' ? 'motion' : 'product',
        isPrimaryFrame: source === 'product',
        hasSubjectOtherViews: false,
        mediaKind: inferMediaKind({ name, url: initialFileUrl }),
        uploadedPath: initialFileUrl,
      }
    ]));
  }, [initialAssetSource, initialFileName, initialFileUrl, initialLibraryAsset, isRestoring]);

  useEffect(() => {
    const currentProjectId = String(projectStore.currentProjectId || '').trim();
    if (!currentProjectId) return;

    setProjectStore((prev) => {
      const now = Date.now();
      const hasProject = prev.projects.some((p) => p.id === currentProjectId);
      const hasWorkspace = !!prev.workspaces[currentProjectId];

      if (hasProject && hasWorkspace) return prev;

      const projects = hasProject
        ? prev.projects
        : [{
          id: currentProjectId,
          name: ensureUniqueProjectName(`Project ${currentProjectId.slice(0, 6)}`, prev.projects),
          updatedAt: now,
          createdAt: now,
        }, ...prev.projects];

      const workspaces = hasWorkspace
        ? prev.workspaces
        : {
          ...prev.workspaces,
          [currentProjectId]: createWorkspaceState({
            scripts: buildDemoScripts(),
            scriptPagePrefix: t.wb_script_page_prefix,
            userId: user?.id ?? null,
          }),
        };

      return {
        ...prev,
        projects,
        workspaces,
      };
    });
  }, [buildDemoScripts, projectStore.currentProjectId, t.wb_script_page_prefix, user?.id]);

  useEffect(() => {
    const currentProjectId = projectStore.currentProjectId;

    const workspace = projectStore.workspaces[currentProjectId];
    if (workspace) {
      applyWorkspaceState(workspace);
      return;
    }
    applyWorkspaceState(createWorkspaceState({
      scripts: buildDemoScripts(),
      scriptPagePrefix: t.wb_script_page_prefix,
      userId: user?.id ?? null,
    }));
  }, [
    applyWorkspaceState,
    buildDemoScripts,
    projectStore.currentProjectId,
    projectStoreLoadVersion,
    t.wb_script_page_prefix,
    user?.id,
  ]);

  useEffect(() => {
    if (projectStoreOwner !== getLocalProjectStoreOwner(user?.id ?? null)) return;
    localStorage.setItem(getLocalProjectStoreKey(user?.id ?? null), JSON.stringify(projectStore));
    window.dispatchEvent(new CustomEvent('vflow-workbench-projects-updated'));
  }, [projectStore, projectStoreOwner, user?.id]);

  // 游客->登录 + 双方都有数据时，弹窗等用户决定怎么处理。
  // pending 期间 UI 已经按 target 加载（不空白）；等用户点了按钮再二次更新。
  type PendingGuestMigration = {
    guestStore: LocalProjectStore;
    targetStore: LocalProjectStore;
    stats: GuestPromoteStats;
  };
  const [pendingGuestMigration, setPendingGuestMigration] = useState<PendingGuestMigration | null>(null);

  useEffect(() => {
    const nextOwner = getLocalProjectStoreOwner(user?.id ?? null);

    // 只要当前是已登录态，就检查 `_guest` localStorage 是否有遗留数据等待迁移。
    // 注意不要用 useRef 检测 "guest→auth 瞬时 transition"——因为登录通常会跳转
    // `/login` 路由，导致 WorkbenchView 卸载重挂，ref 在新挂载里被初始化成已登录状态，
    // 永远捕捉不到瞬时变化。改成"每次都看 `_guest` 有没有内容"就对所有挂载路径都鲁棒。
    // migrate 函数本身已经在 useState lazy init 里跑过一次了，这里再调相当于读缓存（幂等），
    // 用来决定要不要弹确认窗 / 上报 OpsLog。
    if (user?.id !== null && user?.id !== undefined && user.id !== '') {
      const outcome = migrateGuestProjectStoreOnLogin(user.id);
      if (outcome.status === 'needs_confirmation') {
        setPendingGuestMigration({
          guestStore: outcome.guestStore,
          targetStore: outcome.targetStore,
          stats: outcome.stats,
        });
      } else if (outcome.status === 'auto_migrated') {
        void authApi.reportGuestToAuthPromote({
          migrated: true,
          reason: 'auto_migrated',
          stats: outcome.stats,
        });
      } else if (outcome.status === 'guest_pristine') {
        // pristine 是一次性事件（清完就不会再触发了），值得记一笔便于后续转化分析
        void authApi.reportGuestToAuthPromote({
          migrated: false,
          reason: 'guest_pristine',
        });
      }
      // no_guest_data / no_window / storage_error 静默——前者是 99% 的常态
    }

    setProjectStore(loadLocalProjectStore(user?.id ?? null));
    setProjectStoreOwner(nextOwner);
    setProjectStoreLoadVersion((prev) => prev + 1);
  }, [user?.id]);

  // 三个按钮的 handler：merge / overwrite / discard。
  // 三个 case 都会清掉 _guest key（用户已经表态过了，不留残余）+ 重新加载 projectStore + 上报 OpsLog。
  const applyGuestMigrationChoice = useCallback(
    (choice: 'merge' | 'overwrite' | 'discard') => {
      if (!pendingGuestMigration) return;
      const currentUserId = user?.id;
      if (currentUserId === null || currentUserId === undefined || currentUserId === '') {
        setPendingGuestMigration(null);
        return;
      }
      const targetKey = getLocalProjectStoreKey(currentUserId);
      const guestKey = getLocalProjectStoreKey(null);
      const { guestStore, targetStore, stats } = pendingGuestMigration;

      try {
        if (choice === 'merge') {
          const merged = mergeGuestStoreIntoTarget(guestStore, targetStore);
          localStorage.setItem(targetKey, JSON.stringify(merged));
        } else if (choice === 'overwrite') {
          localStorage.setItem(targetKey, JSON.stringify(guestStore));
        }
        // discard: target 不动
        localStorage.removeItem(guestKey);
      } catch {
        // 失败静默，不阻塞 UI
      }

      setProjectStore(loadLocalProjectStore(currentUserId));
      setProjectStoreOwner(getLocalProjectStoreOwner(currentUserId));
      setProjectStoreLoadVersion((prev) => prev + 1);
      setPendingGuestMigration(null);

      void authApi.reportGuestToAuthPromote({
        migrated: choice !== 'discard',
        reason:
          choice === 'merge'
            ? 'merged'
            : choice === 'overwrite'
              ? 'overwrote_target'
              : 'discarded_guest',
        stats,
      });
    },
    [pendingGuestMigration, user?.id],
  );

  useEffect(() => {
    if (isApplyingProjectWorkspaceRef.current) return;
    if (!projectStore.currentProjectId) return;

    const currentProjectId = projectStore.currentProjectId;

    const persistedUploadedFile = (() => {
      if (uploadedFile && uploadedFile.startsWith('blob:')) {
        return lastUploadedUrl || selectedAssetUrl || null;
      }
      return uploadedFile;
    })();

    const persistedAssetQueue = assetQueue.map((item) => {
      const rawPreview = item.previewUrl;
      const stablePreview =
        rawPreview && rawPreview.startsWith('blob:')
          ? (item.uploadedPath || item.assetUrl || null)
          : rawPreview;

      return {
        ...item,
        previewUrl: stablePreview,
        fileObj: null,
      } as QueuedAsset;
    });

    const workspace: ProjectWorkspaceState = {
      fileName,
      uploadedFile: persistedUploadedFile,
      selectedAssetUrl,
      lastUploadedUrl,
      selectedAssetSource,
      klingGenerateMode,
      currentMaterialType,
      productName,
      productCategory,
      coreSellingPoints,
      targetAudience,
      deliveryRegion,
      videoType,
      aspectRatio,
      hasAiRecognized,
      recognizedProductSourceSignature,
      needsAiReRecognize,
      genPrompt,
      referenceScript,
      referenceScriptProductSignature,
      genDuration,
      soundSetting,
      selectedBackgroundAudio,
      scriptVariantCount,
      targetLanguage,
      creationMode: 'fast',
      reuseQueueEnabled,
      scripts,
      scriptPages,
      activeScriptPage,
      assetQueue: persistedAssetQueue,
      scriptQueue,
      selectedTemplateId: selectedTemplate?.id || null,
      selectedModelId: (selectedModel as string) || null,
      generatedVideoUrl,
    };

    setProjectStore((prev) => {
      const prevWorkspace = prev.workspaces[currentProjectId];
      if (JSON.stringify(prevWorkspace) === JSON.stringify(workspace)) return prev;
      return {
        ...prev,
        projects: prev.projects.map((project) => (
          project.id === currentProjectId ? { ...project, updatedAt: Date.now() } : project
        )),
        workspaces: {
          ...prev.workspaces,
          [currentProjectId]: workspace,
        },
      };
    });
  }, [
    projectStore.currentProjectId,
    fileName,
    uploadedFile,
    selectedAssetUrl,
    lastUploadedUrl,
    selectedAssetSource,
    klingGenerateMode,
    currentMaterialType,
    productName,
    productCategory,
    coreSellingPoints,
    targetAudience,
    deliveryRegion,
    videoType,
    aspectRatio,
    hasAiRecognized,
    recognizedProductSourceSignature,
    needsAiReRecognize,
    genPrompt,
    referenceScript,
    referenceScriptProductSignature,
    genDuration,
    soundSetting,
    selectedBackgroundAudio,
    scriptVariantCount,
    targetLanguage,
    reuseQueueEnabled,
    scripts,
    scriptPages,
    activeScriptPage,
    assetQueue,
    scriptQueue,
    selectedTemplate?.id,
    selectedModel,
    generatedVideoUrl,
  ]);

  useEffect(() => {
    projectActionMenuIdRef.current = projectActionMenuId;
  }, [projectActionMenuId]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const withinMenu = projectMenuRef.current?.contains(target);
      const withinButton = projectMenuButtonRef.current?.contains(target);
      if (!withinMenu && !withinButton) {
        if (projectActionMenuIdRef.current) {
          setProjectActionMenuId(null);
          return;
        }
        setProjectMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (taskQueueTimerRef.current) {
      clearInterval(taskQueueTimerRef.current);
      taskQueueTimerRef.current = null;
    }

    if (isTaskQueueOpen || activeVideoTaskCount > 0) {
      taskQueueTimerRef.current = setInterval(() => {
        setTaskQueueNowTs(Date.now());
      }, 1000);
    }

    return () => {
      if (taskQueueTimerRef.current) {
        clearInterval(taskQueueTimerRef.current);
        taskQueueTimerRef.current = null;
      }
    };
  }, [activeVideoTaskCount, isTaskQueueOpen]);

  useEffect(() => {
    if (!isTaskQueueOpen) return;

    const onClickOutsideQueue = (event: MouseEvent) => {
      const target = event.target as Node;
      const withinButton = taskQueueButtonRef.current?.contains(target);
      const withinPanel = taskQueuePanelRef.current?.contains(target);
      if (!withinButton && !withinPanel) {
        setIsTaskQueueOpen(false);
      }
    };

    document.addEventListener('mousedown', onClickOutsideQueue);
    return () => document.removeEventListener('mousedown', onClickOutsideQueue);
  }, [isTaskQueueOpen]);

  useEffect(() => {
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      swipeStartXRef.current = t.clientX;
      swipeStartYRef.current = t.clientY;
      swipeStartTsRef.current = Date.now();
      swipeActiveRef.current = true;
    };
    const move = (e: TouchEvent) => {
      if (!swipeActiveRef.current) return;
      const t = e.touches[0];
      const dx = t.clientX - (swipeStartXRef.current || 0);
      const dy = t.clientY - (swipeStartYRef.current || 0);
      if (Math.abs(dy) > Math.abs(dx) + 10) swipeActiveRef.current = false;
    };
    const end = (e: TouchEvent) => {
      if (!swipeActiveRef.current) return;
      const endTs = Date.now();
      const duration = endTs - (swipeStartTsRef.current || endTs);
      const threshold = 50;
      const maxDur = 800;
      const startX = swipeStartXRef.current || 0;
      const startY = swipeStartYRef.current || 0;
      const touch = (e.changedTouches && e.changedTouches[0]) || null;
      const endX = touch ? touch.clientX : startX;
      const endY = touch ? touch.clientY : startY;
      const dx = endX - startX;
      const dy = endY - startY;
      swipeActiveRef.current = false;
      swipeStartXRef.current = null;
      swipeStartYRef.current = null;
      swipeStartTsRef.current = null;
      if (Math.abs(dx) >= threshold && Math.abs(dy) <= 40 && duration <= maxDur) {
        if (dx < 0) {
          goToNextProject();
        } else {
          goToPrevProject();
        }
      }
    };

    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end, { passive: true });
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
    };
  }, [sortedProjects, projectStore.currentProjectId, goToNextProject, goToPrevProject]);

  useEffect(() => {
    if (projectMenuOpen) return;
    setRenamingProjectId(null);
    setRenamingProjectName('');
    setIsProjectManageMode(false);
    setSelectedProjectIds([]);
    setProjectActionMenuId(null);
  }, [projectMenuOpen]);

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }
    if (skipTemplateDurationSyncRef.current) {
      skipTemplateDurationSyncRef.current = false;
      return;
    }
    if (!isRestoring) setGenDuration(normalizeDurationForModel(selectedTemplate.duration, selectedModel));
  }, [selectedTemplate, isRestoring, normalizeDurationForModel, selectedModel]);

  useEffect(() => {
    setIsPlaying(false);
  }, [generatedVideoUrl]);

  useEffect(() => {
    canAutoSaveRef.current = !!user?.id && !isRestoring;
  }, [user?.id, isRestoring]);

  useEffect(() => {
    let cancelled = false;
    const restoreDraft = async () => {
      setIsRestoring(true);
      restoredDraftRef.current = false;

      if (!user?.id) {
        setIsRestoring(false);
        return;
      }

      let restored = false;
      try {
        const res = await videoApi.getDraft();
        if (cancelled) return;

        const snap = (res && res.code === 0 ? res.data?.snapshot : null) as Partial<WorkbenchSnapshot> | null;
        if (snap && typeof snap === 'object') {
          restoredDraftRef.current = true;
          restored = true;
          if (typeof snap.template_id === 'string' && snap.template_id) {
            setPendingTemplateId(snap.template_id);
          } else if (snap.template_id === null) {
            onSelectTemplate(null);
          }
        }
      } catch (err) {
        console.warn("Failed to restore workbench draft:", err);
      } finally {
        if (cancelled) return;
        setWasDraftRestored(restored);
        setIsRestoring(false);
      }
    };
    restoreDraft();
    return () => {
      cancelled = true;
    };
  }, [user?.id, onSelectTemplate]);

  useEffect(() => {
    if (!pendingTemplateId) return;
    if (isRestoring) return;
    if (selectedTemplate?.id) {
      setPendingTemplateId(null);
      return;
    }

    const tpl = templateList.find(t => t.id === pendingTemplateId);
    if (tpl) {
      skipTemplateDurationSyncRef.current = true;
      onSelectTemplate(tpl);
      setPendingTemplateId(null);
      return;
    }

    if (templateList.length > 0) setPendingTemplateId(null);
  }, [pendingTemplateId, isRestoring, selectedTemplate?.id, templateList, onSelectTemplate]);

  useEffect(() => {
    if (isRestoring) return;
    if (pendingTemplateId) return;
    if (templateList.length === 0) return;

    const selectedId = selectedTemplate?.id;
    const isValidSelection = !!selectedId && templateList.some(t => t.id === selectedId);
    if (isValidSelection) return;

    if (restoredDraftRef.current) skipTemplateDurationSyncRef.current = true;

    onSelectTemplate(templateList[0]);
  }, [templateList, selectedTemplate?.id, pendingTemplateId, isRestoring, onSelectTemplate]);

  useEffect(() => {
    if (isRestoring) return;
    if (wasDraftRestored) return;
    if (!templateList || templateList.length === 0) return;
    if (selectedTemplate?.id) return;
    if (hasAutoSelectedTemplateRef.current) return;

    const first = templateList.find((tpl) => !!tpl.id) || null;
    if (!first) return;

    onSelectTemplate(first);
    hasAutoSelectedTemplateRef.current = true;
  }, [isRestoring, wasDraftRestored, templateList, selectedTemplate?.id, onSelectTemplate]);

  latestSnapshotRef.current = {
    version: 1,
    template_id: (selectedTemplate?.id as string | undefined) || null,
    timestamp: Date.now(),
  };

  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (!user?.id || isRestoring) return;

    autoSaveTimerRef.current = setTimeout(() => {
      const snapshot = latestSnapshotRef.current;
      if (!snapshot) return;
      videoApi.saveDraft(snapshot).catch((e) => console.warn("Auto-save draft failed:", e));
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [user?.id, isRestoring, selectedTemplate?.id]);

  useEffect(() => {
    return () => {
      if (!canAutoSaveRef.current) return;
      const snapshot = latestSnapshotRef.current;
      if (!snapshot) return;
      videoApi.saveDraft(snapshot).catch(() => { });
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      if (!canAutoSaveRef.current) return;
      const snapshot = latestSnapshotRef.current;
      if (!snapshot) return;

      try {
        const body = new Blob([JSON.stringify({ snapshot })], { type: 'application/json' });
        navigator.sendBeacon('/api/projects/draft/', body);
      } catch {
        // ignore
      }
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const taskStatusSnapshotRef = useRef<Record<string, string>>({});
  const autoPreviewedTaskIdsRef = useRef<Record<string, true>>({});

  useEffect(() => {
    if (!generatedVideoUrl) return;
    const matched = tasks.find(t => (t.result?.video_url || t.result?.url) === generatedVideoUrl);
    if (matched?.projectId) setPreviewProjectId(matched.projectId);
  }, [generatedVideoUrl, tasks]);

  useEffect(() => {
    const preferredProjectId = lastGeneratedProjectId || projectStore.currentProjectId;

    const nextSnapshot: Record<string, string> = {};
    const newlySucceeded = tasks.filter((task) => {
      const key = String(task.id);
      nextSnapshot[key] = String(task.status);
      const prev = taskStatusSnapshotRef.current[key];
      return prev !== 'success' && task.status === 'success';
    });
    taskStatusSnapshotRef.current = nextSnapshot;

    if (!preferredProjectId || newlySucceeded.length === 0) return;

    const candidates = newlySucceeded
      .filter((task) => task.type === 'video_generation' && task.projectId === preferredProjectId)
      .map((task) => {
        const url = task.result?.video_url || task.result?.url;
        return { task, url: typeof url === 'string' ? url : null };
      })
      .filter((item) => Boolean(item.url) && !autoPreviewedTaskIdsRef.current[String(item.task.id)]);

    if (candidates.length === 0) return;

    candidates.sort((a, b) => {
      const at = (a.task.updatedAt || a.task.createdAt || 0);
      const bt = (b.task.updatedAt || b.task.createdAt || 0);
      return bt - at;
    });

    const picked = candidates[0];
    if (!picked?.url) return;

    autoPreviewedTaskIdsRef.current[String(picked.task.id)] = true;
    setGeneratedVideoUrl(picked.url);
    setPreviewProjectId(picked.task.projectId || null);
  }, [tasks, lastGeneratedProjectId, projectStore.currentProjectId, setGeneratedVideoUrl]);

  const sortByCreatedAtDesc = useCallback(
    function <T extends { created_at?: string }>(items: T[]): T[] {
      return [...items].sort((a, b) => {
        const at = Date.parse(String(a.created_at || ''));
        const bt = Date.parse(String(b.created_at || ''));
        return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
      });
    },
    []
  );

  const filterAssetLibraryItems = useCallback((items: LibraryAsset[]): LibraryAsset[] => {
    const normalizedItems = Array.isArray(items) ? items : [];

    if (assetLibraryPickMode === 'script_import') {
      return sortByCreatedAtDesc(
        normalizedItems.filter((item) => item.type === 'script' || item.media_kind === 'document')
      );
    }

    const filteredItems = seedanceReplayLibraryIntent
      ? normalizedItems.filter((item) => {
        let itemTab: AssetLibraryTab;
        if (item.media_kind === 'video') {
          itemTab = 'motion';
        } else if (item.media_kind === 'audio') {
          itemTab = 'audio';
        } else {
          const rawType = String((item as any).type || '').toLowerCase();
          itemTab = (rawType === 'model' || rawType === 'scene' || rawType === 'reference')
            ? (rawType as AssetLibraryTab)
            : 'product';
        }
        return seedanceReplayLibraryIntent.allowedTabs.includes(itemTab);
      })
      : assetLibraryPickMode === 'background_audio'
        ? normalizedItems.filter((item) => item.media_kind === 'audio')
        : normalizedItems.filter((item) => item.media_kind !== 'audio');

    return sortByCreatedAtDesc(filteredItems);
  }, [assetLibraryPickMode, seedanceReplayLibraryIntent, sortByCreatedAtDesc]);

  const reloadAssetLibraryItems = useCallback(async () => {
    setAssetLibraryLoading(true);
    setAssetLibraryError(null);
    try {
      if (assetLibraryTab === 'subject') {
        const subjects = await subjectGroupApi.list();
        setAssetLibrarySubjects(subjects);
        setAssetLibraryItems([]);
        setAssetLibraryFolders([]);
        setAssetLibraryBreadcrumb([]);
      } else {
        const [items, folderData] = await Promise.all([
          assetsApi.getAssets({ type: assetLibraryTab, folderId: assetLibraryCurrentFolderId }),
          assetsApi.getFolders({ type: assetLibraryTab, parentId: assetLibraryCurrentFolderId }),
        ]);

        let mergedItems = items;
        if (!user) {
          try {
            const cached = JSON.parse(sessionStorage.getItem('vflow_guest_assets') || '[]');
            const typed = cached.filter((a: any) => a.type === assetLibraryTab);
            mergedItems = [...typed, ...items];
          } catch { /* ignore */ }
        }
        setAssetLibraryItems(filterAssetLibraryItems(mergedItems));
        setAssetLibraryFolders(sortByCreatedAtDesc(Array.isArray(folderData.folders) ? folderData.folders : []));
        setAssetLibraryBreadcrumb(Array.isArray(folderData.breadcrumb) ? folderData.breadcrumb : []);
        setAssetLibrarySubjects([]);
      }
    } catch (err: any) {
      console.error('Failed to load asset library items:', err);
      setAssetLibraryItems([]);
      setAssetLibraryFolders([]);
      setAssetLibraryBreadcrumb([]);
      setAssetLibraryError(String(err?.message || '加载素材失败'));
    } finally {
      setAssetLibraryLoading(false);
    }
  }, [assetLibraryCurrentFolderId, assetLibraryTab, filterAssetLibraryItems, sortByCreatedAtDesc]);

  useEffect(() => {
    if (!isAssetLibraryOpen) return;
    void reloadAssetLibraryItems();
  }, [isAssetLibraryOpen, reloadAssetLibraryItems]);
  useEffect(() => {
    if (isAssetLibraryOpen) return;
    setAssetLibraryUploadSummaryToast(null);
    if (assetLibraryUploadSummaryToastTimerRef.current) {
      window.clearTimeout(assetLibraryUploadSummaryToastTimerRef.current);
      assetLibraryUploadSummaryToastTimerRef.current = null;
    }
  }, [isAssetLibraryOpen]);

  const openAssetLibraryPicker = (target: KlingLibraryUploadTarget = 'default') => {
    setKlingLibraryUploadTarget(target);
    setSeedanceReplayLibraryIntent(null);
    if (selectedModel === 'kling') {
      setAssetLibraryPickMode('default');
      setAssetLibraryTab(klingGenerateMode === 'subject' && target === 'primary' ? 'subject' : 'product');
      setAssetLibraryCurrentFolderId(null);
      setIsAssetLibraryOpen(true);
      return;
    }
    setAssetLibraryPickMode('default');
    setAssetLibraryTab('product');
    setAssetLibraryCurrentFolderId(null);
    setIsAssetLibraryOpen(true);
  };

  const openBackgroundAudioPicker = () => {
    setKlingLibraryUploadTarget('default');
    setSeedanceReplayLibraryIntent(null);
    setAssetLibraryPickMode('background_audio');
    setAssetLibraryTab('audio');
    setAssetLibraryCurrentFolderId(null);
    setIsAssetLibraryOpen(true);
    setIsBackgroundAudioSourceOpen(false);
  };

  const openScriptLibraryPicker = useCallback(() => {
    setKlingLibraryUploadTarget('default');
    setSeedanceReplayLibraryIntent(null);
    setAssetLibraryPickMode('script_import');
    setAssetLibraryTab('script');
    setAssetLibraryCurrentFolderId(null);
    setIsAssetLibraryOpen(true);
  }, []);

  const getAssetLibraryUploadAccept = useCallback((tab: AssetLibraryTab) => {
    if (tab === 'motion') return '.mp4,.mov,.mkv,.webm,.avi';
    if (tab === 'audio') return '.mp3,.wav,.flac';
    if (tab === 'script') return '.txt,.md,.json';
    return '.jpg,.jpeg,.png,.webp';
  }, []);

  const probeAssetLibraryMediaMeta = useCallback((file: File): Promise<{ width: number | null; height: number | null; duration: number | null; kind: string }> =>
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
    }), []);

  const triggerAssetLibraryLocalUpload = useCallback(() => {
    const input = assetLibraryUploadInputRef.current;
    if (!input || isAssetLibraryUploading) return;

    input.value = '';
    input.multiple = true;
    input.accept = getAssetLibraryUploadAccept(assetLibraryTab);
    input.click();
  }, [assetLibraryTab, getAssetLibraryUploadAccept, isAssetLibraryUploading]);
  const [pendingSeedanceAutoAddPayload, setPendingSeedanceAutoAddPayload] = useState<{
    ids: string[];
    tab: AssetLibraryTab;
    folderId: string | null;
  } | null>(null);

  const handleAssetLibraryLocalUploadChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsAssetLibraryUploading(true);
    const failedMessages: string[] = [];
    const successfulUploadedAssetIds: string[] = [];
    let successCount = 0;

    try {
      for (const file of files) {
        try {
          if (!user) {
            // Guest path: same as AssetsView guest upload flow (temp upload + session cache)
            // eslint-disable-next-line no-await-in-loop
            const resp = await assetsApi.uploadTempAsset(file);
            const url = resp?.data?.url || resp?.url || '';
            // eslint-disable-next-line no-await-in-loop
            const mediaMeta = await probeAssetLibraryMediaMeta(file);
            const tempAsset: LibraryAsset = {
              id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              name: file.name,
              type: assetLibraryTab,
              file_url: url,
              thumbnail: url,
              media_kind: mediaMeta.kind as LibraryAsset['media_kind'],
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
            };
            try {
              const existing: LibraryAsset[] = JSON.parse(sessionStorage.getItem('vflow_guest_assets') || '[]');
              sessionStorage.setItem('vflow_guest_assets', JSON.stringify([tempAsset, ...existing]));
            } catch {
              // ignore session cache failures
            }
          } else {
            // eslint-disable-next-line no-await-in-loop
            const uploadResp = await assetsApi.uploadAsset(file, assetLibraryTab, assetLibraryCurrentFolderId);
            const rawUploaded = (uploadResp as any)?.data || uploadResp;
            const uploadedId = rawUploaded?.id;
            if (uploadedId != null) successfulUploadedAssetIds.push(String(uploadedId));
          }
          successCount += 1;
        } catch (err: any) {
          failedMessages.push(`${file.name}: ${String(err?.message || '上传失败')}`);
        }
      }

      await reloadAssetLibraryItems();
      const shouldAutoAddForSeedance = false;
      if (shouldAutoAddForSeedance && assetLibraryPickMode === 'default' && successfulUploadedAssetIds.length > 0 && user) {
        setPendingSeedanceAutoAddPayload({
          ids: successfulUploadedAssetIds,
          tab: assetLibraryTab,
          folderId: assetLibraryCurrentFolderId,
        });
      } else if (successCount > 0) {
        setAssetLibraryUploadSummaryToast({ uploadedCount: successCount, addedCount: 0 });
        if (assetLibraryUploadSummaryToastTimerRef.current) {
          window.clearTimeout(assetLibraryUploadSummaryToastTimerRef.current);
        }
        assetLibraryUploadSummaryToastTimerRef.current = window.setTimeout(() => {
          setAssetLibraryUploadSummaryToast(null);
          assetLibraryUploadSummaryToastTimerRef.current = null;
        }, 5000);
      }

      if (successCount > 0 && failedMessages.length === 0) {
        // Keep silent on full success; upload summary toast handles feedback.
      } else if (successCount > 0) {
        openInfo(
          popupTitles.notice,
          [
            formatMessage((t as any).assets_upload_success_count || '已上传 {count} 个文件', { count: successCount }),
            ...failedMessages,
          ].join('\n')
        );
      } else if (failedMessages.length > 0) {
        openInfo(popupTitles.notice, failedMessages.join('\n'));
      }
    } finally {
      setIsAssetLibraryUploading(false);
      if (assetLibraryUploadInputRef.current) {
        assetLibraryUploadInputRef.current.value = '';
      }
    }
  }, [
    assetLibraryCurrentFolderId,
    assetLibraryTab,
    formatMessage,
    openInfo,
    popupTitles.notice,
    popupTitles.success,
    probeAssetLibraryMediaMeta,
    reloadAssetLibraryItems,
    assetLibraryPickMode,
    selectedModel,
    assetLibraryCurrentFolderId,
    setPendingSeedanceAutoAddPayload,
    user,
    (t as any).assets_upload_success_count,
  ]);

  const getSeedanceReplayLibraryIntent = useCallback((targetMediaKind?: SeedanceReplayMediaKind | null): SeedanceReplayLibraryIntent => {
    const replayOnly = false;
    if (targetMediaKind === 'image') {
      return {
        targetMediaKind: 'image',
        allowedTabs: ['product'],
        preferredTab: 'product',
      };
    }
    if (targetMediaKind === 'video') {
      return {
        targetMediaKind: 'video',
        allowedTabs: ['motion'],
        preferredTab: 'motion',
      };
    }
    if (targetMediaKind === 'audio') {
      if (replayOnly) {
        return {
          targetMediaKind: 'image',
          allowedTabs: ['product'],
          preferredTab: 'product',
        };
      }
      return {
        targetMediaKind: 'audio',
        allowedTabs: ['audio'],
        preferredTab: 'audio',
      };
    }
    if (replayOnly) {
      return {
        targetMediaKind: null,
        allowedTabs: ['product', 'motion', 'model'],
        preferredTab: 'product',
      };
    }
    return {
      targetMediaKind: null,
      allowedTabs: ['product', 'model', 'motion', 'audio'],
      preferredTab: 'product',
    };
  }, [creationMode, selectedModel]);
  const openSubjectCreationLibrary = useCallback(() => {
    onNavigateToAssetsLibrary?.();
  }, [onNavigateToAssetsLibrary]);
  const openKlingSubjectGuide = useCallback(() => {
    setIsKlingSubjectGuideOpen(true);
  }, []);
  const handleKlingGenerateModeChange = useCallback((mode: 'first_frame' | 'subject' | 'first_last_frame') => {
    setKlingGenerateMode(mode);
    if (mode === 'subject') {
      setIsKlingSubjectModeHintDismissed(false);
    }
  }, []);

  const isKlingOmniMode = selectedModel === 'kling';
  const isSeedanceMultiAssetMode = selectedModel === 'seedance2.0';

  const hasSubjectOtherViews = useCallback((asset: LibraryAsset | QueuedAsset | null | undefined) => {
    if (!asset) return false;
    if (typeof (asset as QueuedAsset).hasSubjectOtherViews === 'boolean') {
      return Boolean((asset as QueuedAsset).hasSubjectOtherViews);
    }
    const metaData = (asset as LibraryAsset).meta_data;
    // Check subject_other_assets (from SubjectGroup picker)
    const subjectOthers = metaData?.subject_other_assets;
    if (Array.isArray(subjectOthers) && subjectOthers.length > 0) return true;
    // Check kling_subject.other_view_asset_ids (from asset library)
    const raw = metaData?.kling_subject;
    const meta = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
    const otherViews = meta?.other_view_asset_ids;
    return Array.isArray(otherViews) && otherViews.some((item) => String(item || '').trim());
  }, []);

  const buildQueuedAssetFromLibrary = useCallback((asset: LibraryAsset, options?: { preferLastModeRouting?: boolean; forceFirstFrame?: boolean }): QueuedAsset | null => {
    const assetUrl = asset.file_url || null;
    if (!assetUrl) return null;

    const rawMaterialType: AssetLibraryTab = asset.media_kind === 'video'
      ? 'motion'
      : (asset.type === 'model' || asset.type === 'product' || asset.type === 'scene' || asset.type === 'motion' || asset.type === 'audio'
        ? asset.type
        : 'product');
    const mediaKind: QueuedAsset['mediaKind'] =
      asset.media_kind === 'video'
        ? 'video'
        : asset.media_kind === 'audio'
          ? 'audio'
          : (asset.media_kind === 'image' ? 'image' : inferMediaKind({ name: asset.name || '', url: assetUrl }));

    const forceFirstFrame = options?.forceFirstFrame === true && mediaKind === 'image';
    const materialType: AssetLibraryTab = forceFirstFrame ? 'product' : rawMaterialType;

    let source: QueuedAsset['source'] = mediaKind === 'video' ? 'preference' : 'product';
    if (forceFirstFrame) {
      source = 'product';
    } else if (options?.preferLastModeRouting) {
      if (selectedModel === 'kling') {
        if (klingGenerateMode === 'subject') {
          source = mediaKind === 'image' && (materialType === 'product' || materialType === 'model') && hasSubjectOtherViews(asset)
            ? 'subject'
            : 'preference';
        } else {
          source = mediaKind === 'image' ? 'product' : 'preference';
        }
      } else {
        source = mediaKind === 'video' ? 'preference' : 'product';
      }
    } else {
      source = mediaKind === 'video'
        ? 'preference'
        : (isKlingOmniMode ? (klingGenerateMode === 'subject' ? 'subject' : 'product') : 'product');
    }

    return {
      id: `lib-${asset.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: asset.name || '未命名素材',
      previewUrl: assetUrl,
      fileObj: null,
      assetUrl,
      assetId: asset.id,
      source,
      materialType,
      isPrimaryFrame: source === 'product',
      mediaKind,
      uploadedPath: assetUrl,
      hasSubjectOtherViews: hasSubjectOtherViews(asset),
      seedanceAssetId: materialType === 'model' && asset.meta_data?.seedance_asset_id
        ? String(asset.meta_data.seedance_asset_id)
        : null,
    };
  }, [hasSubjectOtherViews, isKlingOmniMode, klingGenerateMode, selectedModel]);

  const extractSeedanceReplayLibraryNumber = useCallback((meta: Record<string, unknown> | null | undefined, keys: string[]) => {
    if (!meta) return null;
    for (const key of keys) {
      const raw = meta[key];
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
      if (typeof raw === 'string') {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return null;
  }, []);

  const parseSeedanceReplayLibrarySizeLabel = useCallback((value: string | null | undefined) => {
    const raw = String(value || '').trim();
    const match = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*(B|KB|MB|GB)$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) return null;
    const unit = match[2].toUpperCase();
    if (unit === 'GB') return amount * 1024 * 1024 * 1024;
    if (unit === 'MB') return amount * 1024 * 1024;
    if (unit === 'KB') return amount * 1024;
    return amount;
  }, []);

  const normalizeSeedanceAssetUrl = useCallback((value: string | null | undefined) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const withoutQuery = raw.split('#', 1)[0].split('?', 1)[0];
    if (!withoutQuery) return '';
    return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery.replace(/^\/+/, '')}`;
  }, []);

  const buildSeedanceReplayLibraryCandidate = useCallback((asset: LibraryAsset) => {
    const assetUrl = asset.file_url || null;
    if (!assetUrl) return null;
    const mediaKind = asset.media_kind === 'video'
      ? 'video'
      : asset.media_kind === 'audio'
        ? 'audio'
        : asset.media_kind === 'image'
          ? 'image'
          : inferMediaKind({ name: asset.name || '', url: assetUrl });

    if (mediaKind !== 'image' && mediaKind !== 'video' && mediaKind !== 'audio') {
      return null;
    }

    const meta = asset.meta_data && typeof asset.meta_data === 'object'
      ? asset.meta_data as Record<string, unknown>
      : null;

    return {
      name: asset.name || '未命名素材',
      mediaKind,
      format: typeof meta?.format === 'string' ? String(meta.format) : null,
      mimeType: typeof meta?.format === 'string' ? String(meta.format) : null,
      sourceUrl: assetUrl,
      sizeBytes: extractSeedanceReplayLibraryNumber(meta, ['size_bytes']) ?? parseSeedanceReplayLibrarySizeLabel(asset.size) ?? 0,
      width: extractSeedanceReplayLibraryNumber(meta, ['width', 'video_width']),
      height: extractSeedanceReplayLibraryNumber(meta, ['height', 'video_height']),
      durationSeconds: extractSeedanceReplayLibraryNumber(meta, ['duration_seconds', 'duration', 'durationSeconds', 'length_seconds']),
      fps: extractSeedanceReplayLibraryNumber(meta, ['fps', 'frame_rate', 'frameRate']),
    };
  }, [extractSeedanceReplayLibraryNumber, parseSeedanceReplayLibrarySizeLabel]);

  const buildSeedanceReplayQueuedAssetFromLibrary = useCallback((asset: LibraryAsset): QueuedAsset | null => {
    const baseAsset = buildQueuedAssetFromLibrary(asset);
    const candidate = buildSeedanceReplayLibraryCandidate(asset);
    if (!baseAsset || !candidate) return null;

    return {
      ...baseAsset,
      source: baseAsset.materialType === 'model' ? 'preference' : candidate.mediaKind === 'image' ? 'product' : 'preference',
      materialType: candidate.mediaKind === 'video' ? 'motion'
        : candidate.mediaKind === 'audio' ? 'audio'
          : (baseAsset.materialType === 'model' ? 'model' : 'product'),
      isPrimaryFrame: candidate.mediaKind === 'image' && baseAsset.materialType !== 'model',
      mediaKind: candidate.mediaKind,
      durationSeconds: candidate.durationSeconds ?? null,
      mimeType: candidate.mimeType,
      sizeBytes: candidate.sizeBytes,
      width: candidate.width,
      height: candidate.height,
      fps: candidate.fps,
      validationMessages: [],
      uploadedPath: baseAsset.assetUrl,
    };
  }, [buildQueuedAssetFromLibrary, buildSeedanceReplayLibraryCandidate]);

  function queueLibraryAssetIntoWorkbench(asset: LibraryAsset, options?: { preferLastModeRouting?: boolean; forceFirstFrame?: boolean }) {
    const queuedAsset = buildQueuedAssetFromLibrary(asset, options);
    const assetUrl = queuedAsset?.assetUrl || null;
    if (!queuedAsset || !assetUrl) return null;

    if (
      selectedModel === 'kling'
      && klingGenerateMode === 'first_frame'
      && queuedAsset.mediaKind === 'image'
      && queuedAsset.source === 'preference'
    ) {
      const currentReferenceCount = normalizeQueueSourcesForKlingMode(
        assetQueue.filter((item) => item.mediaKind === 'image'),
        klingGenerateMode
      ).filter((item) => item.source === 'preference').length;
      if (currentReferenceCount >= 6) {
        openInfo(
          popupTitles.notice,
          t.wb_kling_reference_slot_first_frame_max || '最多6张'
        );
        return null;
      }
    }

    if (options?.forceFirstFrame && selectedModel === 'kling' && klingGenerateMode !== 'first_frame') {
      setKlingGenerateMode('first_frame');
    }

    setAssetQueue(prev => {
      const adjustedQueuedAsset: QueuedAsset = (
        isKlingOmniMode
        && klingGenerateMode === 'first_last_frame'
        && queuedAsset.mediaKind === 'image'
      )
        ? { ...queuedAsset, source: suggestKlingImageSourceForMode(prev), isPrimaryFrame: false }
        : queuedAsset;
      const next = isKlingOmniMode
        ? [...prev, adjustedQueuedAsset]
        : isSeedanceMultiAssetMode
          ? [...prev, adjustedQueuedAsset]
          : prev.filter(item => item.materialType !== adjustedQueuedAsset.materialType).concat(adjustedQueuedAsset);
      return isKlingOmniMode ? normalizeQueueSourcesForKlingMode(next, klingGenerateMode) : next;
    });

    setUploadedFile(assetUrl);
    setSelectedAssetUrl(assetUrl);
    setLastUploadedUrl(assetUrl);
    setSelectedFileObj(null);
    setFileName(queuedAsset.name);
    setSelectedAssetSource(queuedAsset.source);
    setCurrentMaterialType(queuedAsset.materialType ?? null);
    setSelectedQueueAssetId(queuedAsset.id);
    setGeneratedVideoUrl(null);
    return queuedAsset;
  }

  const selectAssetFromLibraryPopup = (asset: LibraryAsset): boolean => {
    if (assetLibraryPickMode === 'script_import') {
      void handleImportScriptFromLibraryAsset(asset);
      return true;
    }

    if (assetLibraryPickMode === 'background_audio') {
      if (asset.media_kind !== 'audio') {
        openInfo(popupTitles.notice, t.wb_audio_picker_only_audio || '请选择音频素材');
        return false;
      }
      setSelectedBackgroundAudio({
        id: asset.id,
        name: asset.name || 'audio',
        file_url: asset.file_url,
        source: 'library',
      });
      setIsAssetLibraryOpen(false);
      setAssetLibraryPickMode('default');
      setIsBackgroundAudioSourceOpen(false);
      return true;
    }

    if (selectedModel === 'kling' && assetLibraryPickMode === 'default' && klingLibraryUploadTarget !== 'default') {
      const queuedAsset = buildQueuedAssetFromLibrary(asset, { preferLastModeRouting: true });
      if (!queuedAsset || queuedAsset.mediaKind !== 'image') {
        openInfo(popupTitles.notice, t.wb_popup_only_image_first_frame || '仅支持图片素材');
        return false;
      }

      if (klingLibraryUploadTarget === 'primary') {
        const primarySource: QueuedAsset['source'] = klingGenerateMode === 'subject' ? 'subject' : 'product';
        if (primarySource === 'subject' && !canBeKlingSubject(queuedAsset)) {
          handleInvalidKlingSubjectTarget(queuedAsset);
          return false;
        }
        const nextPrimary: QueuedAsset = {
          ...queuedAsset,
          source: primarySource,
          isPrimaryFrame: primarySource === 'product',
        };
        setAssetQueue((prev) => {
          const withoutExistingPrimary = prev.filter((item) => !(item.mediaKind === 'image' && item.source === primarySource));
          return normalizeQueueSourcesForKlingMode([...withoutExistingPrimary, nextPrimary], klingGenerateMode);
        });
        applyWorkbenchAssetSelection(nextPrimary);
        setLastUploadedUrl(nextPrimary.assetUrl || null);
        return true;
      }

      if (klingGenerateMode === 'first_frame') {
        const currentReferenceCount = normalizeQueueSourcesForKlingMode(
          assetQueue.filter((item) => item.mediaKind === 'image'),
          klingGenerateMode
        ).filter((item) => item.source === 'preference').length;
        if (currentReferenceCount >= 6) {
          openInfo(
            popupTitles.notice,
            t.wb_kling_reference_slot_first_frame_max || '最多6张'
          );
          return false;
        }
      }

      const nextReference: QueuedAsset = {
        ...queuedAsset,
        source: 'preference',
        isPrimaryFrame: false,
      };
      setAssetQueue((prev) => normalizeQueueSourcesForKlingMode([...prev, nextReference], klingGenerateMode));
      applyWorkbenchAssetSelection(nextReference);
      setLastUploadedUrl(nextReference.assetUrl || null);
      return true;
    }

    if (isSeedanceReplayMode && seedanceReplayLibraryIntent) {
      const queuedAsset = buildSeedanceReplayQueuedAssetFromLibrary(asset);
      const candidate = buildSeedanceReplayLibraryCandidate(asset);
      if (!queuedAsset || !candidate) {
        openInfo(
          popupTitles.notice,
          t.wb_seedance_replay_notice_unsupported_library_asset || 'The selected asset is not supported as a Seedance reference asset.',
        );
        return false;
      }
      if (!seedanceReplayLibraryIntent.allowedTabs.includes(queuedAsset.materialType || 'product')) {
        openInfo(
          popupTitles.notice,
          t.wb_seedance_replay_notice_unsupported_library_category || 'This entry does not support the selected asset category.',
        );
        return false;
      }
      if (seedanceReplayLibraryIntent.targetMediaKind && queuedAsset.mediaKind !== seedanceReplayLibraryIntent.targetMediaKind) {
        const kindLabel = seedanceReplayLibraryIntent.targetMediaKind === 'image'
          ? (t.wb_seedance_replay_media_image || 'Image')
          : seedanceReplayLibraryIntent.targetMediaKind === 'video'
            ? (t.wb_seedance_replay_media_video || 'Video')
            : (t.wb_seedance_replay_media_audio || 'Audio');
        openInfo(
          popupTitles.notice,
          formatMessage(
            t.wb_seedance_replay_notice_library_kind_only || 'This entry only supports selecting {kind} assets.',
            { kind: kindLabel },
          ),
        );
        return false;
      }
      const validationMessage = validateSeedanceReplayParsedAsset(candidate, t);
      if (validationMessage) {
        openInfo(popupTitles.notice, validationMessage);
        return false;
      }

      const normalizedQueuedUrl = normalizeSeedanceAssetUrl(
        queuedAsset.assetUrl || queuedAsset.uploadedPath || queuedAsset.previewUrl || '',
      );
      const duplicateExists = uploadDisplayAssets.some((item) => {
        const sameAssetId = !!queuedAsset.assetId && !!item.assetId && String(item.assetId).trim() === String(queuedAsset.assetId).trim();
        if (sameAssetId) return true;

        const normalizedItemUrl = normalizeSeedanceAssetUrl(item.assetUrl || item.uploadedPath || item.previewUrl || '');
        return !!normalizedQueuedUrl && normalizedQueuedUrl === normalizedItemUrl;
      });
      if (duplicateExists) {
        openInfo(
          popupTitles.notice,
          t.wb_seedance_replay_notice_duplicate_asset || 'This asset has already been added. Please choose another one.',
        );
        return false;
      }

      const currentCount = queuedAsset.materialType === 'model'
        ? uploadDisplayAssets.filter((item) => item.materialType === 'model').length
        : uploadDisplayAssets.filter((item) => item.mediaKind === queuedAsset.mediaKind && item.materialType !== 'model').length;
      const limit = queuedAsset.materialType === 'model'
        ? SEEDANCE_REPLAY_MODEL_LIMIT
        : queuedAsset.mediaKind === 'image'
          ? SEEDANCE_REPLAY_IMAGE_LIMIT
          : queuedAsset.mediaKind === 'video'
            ? (isSeedanceReplayMode ? 1 : SEEDANCE_REPLAY_VIDEO_LIMIT)
            : SEEDANCE_REPLAY_AUDIO_LIMIT;
      if (currentCount >= limit) {
        const kindLabel = queuedAsset.materialType === 'model'
          ? (t.wb_seedance_replay_virtual_models || 'Virtual Models')
          : queuedAsset.mediaKind === 'image'
            ? (t.wb_seedance_replay_media_image || 'Image')
          : queuedAsset.mediaKind === 'video'
            ? (t.wb_seedance_replay_media_video || 'Video')
            : (t.wb_seedance_replay_media_audio || 'Audio');
        openInfo(
          popupTitles.notice,
          formatMessage(
            t.wb_seedance_replay_notice_kind_limit || 'Up to {limit} {kind} assets can be added.',
            { limit, kind: kindLabel },
          ),
        );
        return false;
      }

      setAssetQueue((prev) => [...prev, queuedAsset]);
      applyWorkbenchAssetSelection(queuedAsset);
      setLastUploadedUrl(queuedAsset.assetUrl || null);
      return true;
    }

    const queued = queueLibraryAssetIntoWorkbench(asset);
    return Boolean(queued);
  };
  useEffect(() => {
    if (!pendingSeedanceAutoAddPayload || pendingSeedanceAutoAddPayload.ids.length === 0) return;
    let cancelled = false;
    const run = async () => {
      isBatchAutoAddInfoQueueingRef.current = true;
      batchAutoAddInfoQueueRef.current = [];
      try {
        const latestAssets = await assetsApi.getAssets({
          type: pendingSeedanceAutoAddPayload.tab,
          folderId: pendingSeedanceAutoAddPayload.folderId,
        });
        if (cancelled) return;
        const assetMap = new Map(latestAssets.map((asset) => [String(asset.id), asset]));
        let addedCount = 0;
        pendingSeedanceAutoAddPayload.ids.forEach((id) => {
          const matched = assetMap.get(id);
          if (matched && selectAssetFromLibraryPopup(matched)) {
            addedCount += 1;
          }
        });
        setAssetLibraryUploadSummaryToast({
          uploadedCount: pendingSeedanceAutoAddPayload.ids.length,
          addedCount,
        });
        if (assetLibraryUploadSummaryToastTimerRef.current) {
          window.clearTimeout(assetLibraryUploadSummaryToastTimerRef.current);
        }
        assetLibraryUploadSummaryToastTimerRef.current = window.setTimeout(() => {
          setAssetLibraryUploadSummaryToast(null);
          assetLibraryUploadSummaryToastTimerRef.current = null;
        }, 5000);
      } finally {
        isBatchAutoAddInfoQueueingRef.current = false;
        if (!isInfoOpenRef.current && batchAutoAddInfoQueueRef.current.length > 0) {
          const next = batchAutoAddInfoQueueRef.current.shift();
          if (next) openInfoDirect(next.title, next.message);
        }
        if (!cancelled) setPendingSeedanceAutoAddPayload(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [pendingSeedanceAutoAddPayload, selectAssetFromLibraryPopup]);

  const selectSubjectFromLibraryPopup = (subject: SubjectGroup) => {
    if (!subject.primary_asset) {
      openInfo(popupTitles.notice, '该主体没有主图片，请先在素材库中设置主体图片。');
      return;
    }
    // Clear existing queue before populating subject assets
    setAssetQueue([]);

    // Build primary asset (→ subject slot)
    const pseudoPrimary: LibraryAsset = {
      id: subject.primary_asset.id,
      name: subject.name,
      file_url: subject.primary_asset.file_url,
      thumbnail: subject.primary_asset.thumbnail || subject.primary_asset.file_url,
      type: 'product',
      media_kind: 'image',
      size: '0',
      status: 'ready',
      is_favorited: false,
      created_at: subject.created_at,
      meta_data: { subject_group_id: subject.id, subject_other_assets: subject.other_assets },
      folder_id: null,
    } as LibraryAsset;
    const primaryResult = queueLibraryAssetIntoWorkbench(pseudoPrimary, { preferLastModeRouting: true });

    // Build other assets (→ reference/preference slots)
    if (subject.other_assets && subject.other_assets.length > 0) {
      for (const otherAsset of subject.other_assets) {
        const pseudoRef: LibraryAsset = {
          id: otherAsset.id,
          name: otherAsset.name || subject.name,
          file_url: otherAsset.file_url,
          thumbnail: otherAsset.thumbnail || otherAsset.file_url,
          type: 'product',
          media_kind: 'image',
          size: '0',
          status: 'ready',
          is_favorited: false,
          created_at: subject.created_at,
          meta_data: { subject_group_id: subject.id },
          folder_id: null,
        } as LibraryAsset;
        queueLibraryAssetIntoWorkbench(pseudoRef, { preferLastModeRouting: true });
      }
    }

    // Re-select primary asset in UI
    if (primaryResult) {
      applyWorkbenchAssetSelection(primaryResult);
      setSelectedQueueAssetId(primaryResult.id);
    }
  };

  const currentScriptDuration = enableStoryboardEditor
    ? scripts.reduce((total, s) => total + (parseFloat(s.dur.replace('s', '')) || 0), 0)
    : genDuration;
  const isDurationValid = Math.abs(currentScriptDuration - genDuration) < 0.1;
  const hasAnyReuseQueue = assetQueue.length > 0 || scriptQueue.length > 0;
  const isReuseReady = assetQueue.length > 0 && scriptQueue.length > 0;
  const expectedBatchCount = isReuseReady ? assetQueue.length * scriptQueue.length : 0;
  const selectedVideoPricing = getVideoModelPricingEntry(billingPricing, selectedModel, creationMode);
  const selectedImagePricing = getImageModelPricingEntry(billingPricing, imageGenModel);
  const normalizeBatchGenerateCount = (value: unknown) => {
    const n = Math.floor(Number(value) || 0);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const getScriptPageBatchGenerateCount = (pageId: string, pageIndex: number) => (
    Object.prototype.hasOwnProperty.call(batchGenerateCountsByPage, pageId)
      ? normalizeBatchGenerateCount(batchGenerateCountsByPage[pageId])
      : (pageIndex === 0 ? 1 : 0)
  );
  const getPageScriptDuration = (page: ScriptPage, pageIndex: number, storyboardEnabled: boolean) => {
    if (!storyboardEnabled) return Math.max(1, Number(genDuration) || 0);
    const pageScripts = pageIndex === activeScriptPage ? scripts : (page.scripts || []);
    const total = pageScripts.reduce((sum, item) => sum + (parseFloat(String(item.dur || '').replace('s', '')) || 0), 0);
    return Number.isFinite(total) && total > 0 ? total : Math.max(1, Number(genDuration) || 0);
  };
  const scriptPageBatchGenerateItems = useMemo(() => (
    scriptPages
      .map((page, pageIndex) => {
        const count = getScriptPageBatchGenerateCount(page.id, pageIndex);
        const storyboardEnabled = storyboardEditorEnabledByPage[page.id] ?? (pageIndex === activeScriptPage ? enableStoryboardEditor : false);
        const pageScripts = pageIndex === activeScriptPage ? scripts : (page.scripts || []);
        return {
          page: { ...page, scripts: pageScripts },
          pageIndex,
          count,
          storyboardEnabled,
          duration: getPageScriptDuration({ ...page, scripts: pageScripts }, pageIndex, storyboardEnabled),
        };
      })
      .filter((item) => item.count > 0)
  ), [activeScriptPage, batchGenerateCountsByPage, enableStoryboardEditor, genDuration, scriptPages, scripts, storyboardEditorEnabledByPage]);
  const scriptPageBatchGenerateTotalCount = scriptPageBatchGenerateItems.reduce((sum, item) => sum + item.count, 0);
  const hasScriptPageBatchGeneratePlan = scriptPageBatchGenerateTotalCount > 0;
  const scriptPageBatchGenerateTotalSeconds = scriptPageBatchGenerateItems.reduce((sum, item) => sum + item.duration * item.count, 0);
  const formatVideoRateLabel = (entry: BillingPricingModelEntry | null | undefined) => {
    const rate = Number(entry?.rate ?? 0);
    if (!Number.isFinite(rate) || rate <= 0) return '-';
    return `${formatCreditAmount(rate)}${t.wb_vpoints_per_sec || ''}`;
  };
  const formatApproxVideoRateLabel = (entry: BillingPricingModelEntry | null | undefined) => {
    const label = formatVideoRateLabel(entry);
    if (label === '-') return label;
    return `${t.wb_rate_approx_prefix || 'Approx. '}${label}`;
  };
  const estimatedVideoCost = useMemo(() => {
    const rate = Number(selectedVideoPricing?.rate ?? 0);
    if (!Number.isFinite(rate) || rate <= 0) return 0;

    if (!hasScriptPageBatchGeneratePlan) return 0;
    return Math.max(0, roundCreditTenths(rate * scriptPageBatchGenerateTotalSeconds));
  }, [hasScriptPageBatchGeneratePlan, scriptPageBatchGenerateTotalSeconds, selectedVideoPricing]);

  const estimatedImageCost = useMemo(() => {
    const rate = Number(selectedImagePricing?.rate ?? 0);
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return Math.max(0, roundCreditTenths(rate * Math.max(1, Math.min(4, Number(aiOptimizeCount) || 1))));
  }, [aiOptimizeCount, selectedImagePricing]);

  const estimatedVideoCostLabel = hasScriptPageBatchGeneratePlan && isSeedanceModel(selectedModel)
    ? (t.wb_usage_based_billing || '按量付费')
    : (estimatedVideoCost > 0 ? `${formatCreditAmount(estimatedVideoCost)} ${t.v_points || 'V点'}` : '');
  const estimatedImageCostLabel = estimatedImageCost > 0 ? `-${formatCreditAmount(estimatedImageCost)} ${t.v_points || 'V点'}` : '';
  const hasCurrentAsset = Boolean(uploadedFile || selectedAssetUrl || selectedFileObj);
  const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
  const VIDEO_EXTS = ['mp4', 'mov', 'mkv', 'webm', 'avi'];
  const imageFormats = IMAGE_EXTS.join('/');
  const videoFormats = VIDEO_EXTS.join('/');
  const formatHint = `图片(${imageFormats}) 视频(${videoFormats}) · ≤1GB`;
  const isBatchDebugMode = reuseQueueEnabled && hasAnyReuseQueue;
  const materialTypeLabelMap: Record<AssetLibraryTab, string> = {
    product: t.assets_tab_images || '图片',
    model: t.assets_tab_virtual_models || '虚拟模特',
    scene: t.assets_tab_scenes || '场景',
    motion: t.assets_tab_videos || '视频',
    audio: t.assets_tab_audio || '音频',
    script: t.assets_tab_scripts || '脚本',
    subject: t.assets_tab_subjects || 'Subjects',
  };
  const defaultAssetLibraryTabs = useMemo<Array<{ value: AssetLibraryTab; label: string }>>(() => ([
    { value: 'product', label: materialTypeLabelMap.product },
    { value: 'motion', label: materialTypeLabelMap.motion },
    { value: 'audio', label: materialTypeLabelMap.audio },
    { value: 'model', label: materialTypeLabelMap.model },
    { value: 'scene', label: materialTypeLabelMap.scene },
  ]), [materialTypeLabelMap]);
  const subjectAssetLibraryTabs = useMemo<Array<{ value: AssetLibraryTab; label: string }>>(() => ([
    { value: 'subject', label: materialTypeLabelMap.subject },
  ]), [materialTypeLabelMap]);
  const klingAssetLibraryTabs = useMemo<Array<{ value: AssetLibraryTab; label: string }>>(() => ([
    { value: 'product', label: materialTypeLabelMap.product },
    { value: 'model', label: materialTypeLabelMap.model },
  ]), [materialTypeLabelMap.model, materialTypeLabelMap.product]);
  const seedanceReplayAssetLibraryTabs = useMemo<Array<{ value: AssetLibraryTab; label: string }>>(() => (
    seedanceReplayLibraryIntent
      ? seedanceReplayLibraryIntent.allowedTabs.map((tab) => ({ value: tab, label: materialTypeLabelMap[tab] }))
      : []
  ), [materialTypeLabelMap, seedanceReplayLibraryIntent]);
  const scriptImportAssetLibraryTabs = useMemo<Array<{ value: AssetLibraryTab; label: string }>>(() => ([
    { value: 'script', label: materialTypeLabelMap.script },
  ]), [materialTypeLabelMap.script]);
  const assetLibraryVisibleTabs = assetLibraryPickMode === 'script_import'
    ? scriptImportAssetLibraryTabs
    : isKlingOmniMode
      && assetLibraryPickMode === 'default'
      && klingGenerateMode === 'subject'
      && klingLibraryUploadTarget === 'primary'
      ? subjectAssetLibraryTabs
    : isKlingOmniMode && assetLibraryPickMode === 'default'
      ? klingAssetLibraryTabs
    : assetLibraryTab === 'subject'
      ? subjectAssetLibraryTabs
      : (seedanceReplayLibraryIntent ? seedanceReplayAssetLibraryTabs : defaultAssetLibraryTabs);
  const shouldHideAssetLibraryLocalUpload = assetLibraryTab === 'model';
  const replayTemplateGenerateCount = useMemo(() => (
    REPLAY_SCRIPT_TEMPLATES.reduce((sum, template) => {
      const count = Number(replayTemplateCountsById[template.id] || 0);
      return sum + (Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
    }, 0)
  ), [replayTemplateCountsById]);
  const replayTotalGenerateCount = Math.max(0, Math.floor(replayUserReferenceGenerateCount || 0)) + replayTemplateGenerateCount;
  const uploadDisplayAssets: QueuedAsset[] = useMemo(() => {
    if (assetQueue.length > 0) return assetQueue;
    if (!uploadedFile) return [];
    return [{
      id: 'current-upload',
      name: fileName || '当前素材',
      previewUrl: uploadedFile,
      fileObj: selectedFileObj,
      assetUrl: selectedAssetUrl,
      source: selectedAssetSource || 'product',
      materialType: currentMaterialType || (currentAssetMediaKind === 'video' ? 'motion' : currentAssetMediaKind === 'audio' ? 'audio' : 'product'),
      isPrimaryFrame: selectedAssetSource === 'product',
      hasSubjectOtherViews: false,
      mediaKind: currentAssetMediaKind,
      uploadedPath: lastUploadedUrl,
    }];
  }, [
    assetQueue,
    currentAssetMediaKind,
    currentMaterialType,
    fileName,
    lastUploadedUrl,
    selectedAssetSource,
    selectedAssetUrl,
    selectedFileObj,
    uploadedFile,
  ]);
  const currentProductRecognitionSourceSignature = useMemo(
    () => buildProductRecognitionSourceSignature(uploadDisplayAssets),
    [uploadDisplayAssets]
  );
  const currentProductInfoSignature = useMemo(
    () => buildProductInfoSignature({
      productName,
      productCategory,
      coreSellingPoints,
    }),
    [coreSellingPoints, productCategory, productName]
  );
  const seedanceReplayUploadAssets = useMemo<SeedanceReplayUploadAsset[]>(() => {
    return uploadDisplayAssets.flatMap((asset) => {
      if (asset.mediaKind !== 'image' && asset.mediaKind !== 'video' && asset.mediaKind !== 'audio') {
        return [];
      }

      // Assets from the model tab become 'model' mediaKind in the panel
      const panelMediaKind = asset.materialType === 'model' ? 'model' as const : asset.mediaKind;

      return [{
        id: asset.id,
        name: asset.name,
        mediaKind: panelMediaKind,
        source: asset.fileObj ? 'local' : 'library',
        previewUrl: asset.previewUrl || asset.assetUrl || asset.uploadedPath || null,
        durationSeconds: asset.durationSeconds ?? null,
        frameRole: asset.frameRole ?? null,
      }];
    });
  }, [uploadDisplayAssets]);

  const seedanceReplaySelectedAssetSignatures = useMemo(() => {
    const signatures = new Set<string>();
    uploadDisplayAssets.forEach((asset) => {
      const assetId = String(asset.assetId || asset.id || '').trim();
      if (assetId) signatures.add(`id:${assetId}`);

      const normalizedUrl = normalizeSeedanceAssetUrl(asset.assetUrl || asset.uploadedPath || asset.previewUrl || '');
      if (normalizedUrl) signatures.add(`url:${normalizedUrl}`);
    });
    return signatures;
  }, [normalizeSeedanceAssetUrl, uploadDisplayAssets]);

  const isSeedanceReplayAssetAlreadyAdded = useCallback((asset: LibraryAsset) => {
    const assetId = String(asset.id || '').trim();
    if (assetId && seedanceReplaySelectedAssetSignatures.has(`id:${assetId}`)) return true;

    const normalizedUrl = normalizeSeedanceAssetUrl(asset.file_url);
    if (normalizedUrl && seedanceReplaySelectedAssetSignatures.has(`url:${normalizedUrl}`)) return true;

    return false;
  }, [normalizeSeedanceAssetUrl, seedanceReplaySelectedAssetSignatures]);

  const klingSelectedAssetSignatures = useMemo(() => {
    const signatures = new Set<string>();
    uploadDisplayAssets.forEach((asset) => {
      const assetId = String(asset.assetId || asset.id || '').trim();
      if (assetId) signatures.add(`id:${assetId}`);

      const normalizedUrl = normalizeSeedanceAssetUrl(asset.assetUrl || asset.uploadedPath || asset.previewUrl || '');
      if (normalizedUrl) signatures.add(`url:${normalizedUrl}`);
    });
    return signatures;
  }, [normalizeSeedanceAssetUrl, uploadDisplayAssets]);

  const isKlingAssetAlreadyAdded = useCallback((asset: LibraryAsset) => {
    const assetId = String(asset.id || '').trim();
    if (assetId && klingSelectedAssetSignatures.has(`id:${assetId}`)) return true;

    const normalizedUrl = normalizeSeedanceAssetUrl(asset.file_url);
    if (normalizedUrl && klingSelectedAssetSignatures.has(`url:${normalizedUrl}`)) return true;

    return false;
  }, [klingSelectedAssetSignatures, normalizeSeedanceAssetUrl]);

  const seedanceReplayValidation = useMemo(
    () => buildSeedanceReplayValidationSummary(uploadDisplayAssets, t, { mode: isSeedanceReplayMode ? 'viral_replay' : 'multimodal' }),
    [isSeedanceReplayMode, t, uploadDisplayAssets]
  );

  const focusSeedanceReplayValidationTarget = useCallback((target: SeedanceReplayMediaKind) => {
    setSeedanceReplayFocusTarget(null);
    window.requestAnimationFrame(() => {
      setSeedanceReplayFocusTarget(target);
    });
  }, []);

  const toLibraryAssetFromTransferStationItem = (item: TransferStationItem): LibraryAsset | null => {
    if (item.mediaKind === 'script') return null;

    const fileUrl = toDisplayUrl(item.fileUrl);
    if (!fileUrl) return null;

    const mediaKind = item.mediaKind === 'file'
      ? inferMediaKind({ name: item.name, url: fileUrl })
      : item.mediaKind;
    const type: LibraryAsset['type'] =
      item.type === 'model' || item.type === 'product' || item.type === 'scene' || item.type === 'motion' || item.type === 'audio'
        ? item.type
        : (mediaKind === 'video' ? 'motion' : mediaKind === 'audio' ? 'audio' : 'product');

    return {
      id: String(item.assetId || `transfer-${item.id}`),
      name: item.name || 'Untitled Asset',
      type,
      file_url: fileUrl,
      media_kind: mediaKind,
      size: '',
      status: 'ready',
      created_at: item.createdAt || new Date().toISOString(),
    };
  };

  const applyTransferStationItemToWorkbench = (item: TransferStationItem): boolean => {
    if (item.mediaKind === 'script') {
      const scriptContent = String(item.scriptContent || '').trim();
      if (!scriptContent) {
        openInfo(popupTitles.notice, t.wb_transfer_station_apply_failed || 'Unable to read this transfer-station asset.');
        return false;
      }

      setReferenceScript(scriptContent);
      setReferenceScriptProductSignature(currentProductInfoSignature);
      setToastMessage(t.wb_transfer_station_apply_script_success || t.wb_transfer_station_apply_success || 'Script applied to workbench.');

      window.setTimeout(() => {
        configSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }, 80);
      return true;
    }

    const libraryAsset = toLibraryAssetFromTransferStationItem(item);
    if (!libraryAsset) {
      openInfo(popupTitles.notice, t.wb_transfer_station_apply_failed || 'Unable to read this transfer-station asset.');
      return false;
    }

    if (isSeedanceReplayMode && isSeedanceReplayAssetAlreadyAdded(libraryAsset)) {
      openInfo(
        popupTitles.notice,
        t.wb_seedance_replay_notice_duplicate_asset || 'This asset has already been added. Please choose another one.',
      );
      return false;
    }

    // Seedance replay mode: append (not replace) — same as selectAssetFromLibraryPopup replay branch
    if (isSeedanceReplayMode) {
      const replayQueued = buildSeedanceReplayQueuedAssetFromLibrary(libraryAsset);
      const replayCandidate = buildSeedanceReplayLibraryCandidate(libraryAsset);
      if (!replayQueued || !replayCandidate) {
        openInfo(popupTitles.notice, t.wb_transfer_station_apply_failed || 'Unable to read this transfer-station asset.');
        return false;
      }
      if (replayQueued.mediaKind !== 'image' && replayQueued.mediaKind !== 'video') {
        openInfo(popupTitles.notice, t.wb_replay_error_audio_not_supported || 'Audio assets are not supported in viral recreate mode.');
        return false;
      }
      const validationMessage = validateSeedanceReplayParsedAsset(replayCandidate, t);
      if (validationMessage) {
        openInfo(popupTitles.notice, validationMessage);
        return false;
      }
      const currentCount = replayQueued.materialType === 'model'
        ? uploadDisplayAssets.filter((a) => a.materialType === 'model').length
        : uploadDisplayAssets.filter((a) => a.mediaKind === replayQueued.mediaKind && a.materialType !== 'model').length;
      const limit = replayQueued.materialType === 'model'
        ? SEEDANCE_REPLAY_MODEL_LIMIT
        : replayQueued.mediaKind === 'image'
          ? SEEDANCE_REPLAY_IMAGE_LIMIT
          : replayQueued.mediaKind === 'video'
            ? 1
            : SEEDANCE_REPLAY_AUDIO_LIMIT;
      if (currentCount >= limit) {
        const kindLabel = replayQueued.mediaKind === 'image'
          ? (replayQueued.materialType === 'model' ? (t.wb_seedance_replay_virtual_models || 'Virtual Models') : (t.wb_seedance_replay_media_image || 'Image'))
          : replayQueued.mediaKind === 'video'
            ? (t.wb_seedance_replay_media_video || 'Video')
            : (t.wb_seedance_replay_media_audio || 'Audio');
        openInfo(
          popupTitles.notice,
          formatMessage(
            t.wb_seedance_replay_notice_kind_limit || 'Up to {limit} {kind} assets can be added.',
            { limit, kind: kindLabel },
          ),
        );
        return false;
      }
      setAssetQueue((prev) => [...prev, replayQueued]);
      applyWorkbenchAssetSelection(replayQueued);
      setLastUploadedUrl(replayQueued.assetUrl || null);
      setToastMessage(t.wb_transfer_station_apply_success || 'Asset applied to workbench.');
      return true;
    }

    const queuedAsset = queueLibraryAssetIntoWorkbench(libraryAsset, { preferLastModeRouting: true });
    if (!queuedAsset) {
      openInfo(popupTitles.notice, t.wb_transfer_station_apply_failed || 'Unable to read this transfer-station asset.');
      return false;
    }

    setToastMessage(t.wb_transfer_station_apply_success || 'Asset applied to workbench.');
    return true;
  };

  const handleUseTransferStationItem = (item: TransferStationItem) => {
    applyTransferStationItemToWorkbench(item);
  };

  const handleRemoveTransferStationEntry = (itemId: string) => {
    removeTransferStationItem(itemId, transferStationOwnerId);
    refreshTransferStationItems();
  };

  const handleClearTransferStationEntries = () => {
    clearTransferStationItems(transferStationOwnerId);
    setIsTransferStationOpen(false);
    refreshTransferStationItems();
  };

  const handleTransferStationItemDragStart = (item: TransferStationItem, event: React.DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.setData(TRANSFER_STATION_DRAG_MIME, JSON.stringify(item));
    event.dataTransfer.effectAllowed = 'copy';
  };
  const aiOptimizeImageCandidates = useMemo(
    () => uploadDisplayAssets.filter((asset) => asset.mediaKind === 'image'),
    [uploadDisplayAssets]
  );
  const aiOptimizeKeywordChoices = useMemo(
    () => ([
      t.wb_ai_opt_keyword_white_bg || '白底商品图',
      t.wb_ai_opt_keyword_lifestyle || '生活化场景',
      t.wb_ai_opt_keyword_detail || '高清细节',
      t.wb_ai_opt_keyword_lighting || '质感灯光',
      t.wb_ai_opt_keyword_clean || '干净背景',
      t.wb_ai_opt_keyword_conversion || '电商转化导向',
    ]),
    [
      t.wb_ai_opt_keyword_clean,
      t.wb_ai_opt_keyword_conversion,
      t.wb_ai_opt_keyword_detail,
      t.wb_ai_opt_keyword_lifestyle,
      t.wb_ai_opt_keyword_lighting,
      t.wb_ai_opt_keyword_white_bg,
    ]
  );
  const buildAiOptimizePromptScript = useCallback((referenceAsset?: QueuedAsset | null) => {
    const lines: string[] = [];
    const refName = (referenceAsset?.name || '').trim();
    if (refName) lines.push(`${t.wb_ai_opt_prompt_ref || '参考素材'}: ${refName}`);
    const category = (aiOptimizeCategory || productCategory || '').trim();
    if (category) lines.push(`${t.wb_field_product_category_label}: ${category}`);
    const product = (productName || '').trim();
    if (product) lines.push(`${t.wb_field_product_name_label}: ${product}`);
    const selling = (coreSellingPoints || '').trim();
    if (selling) lines.push(`${t.wb_field_core_selling_points_label}: ${selling.replace(/\n+/g, ' / ')}`);
    if (aiOptimizeKeywords.length > 0) {
      lines.push(`${t.wb_ai_opt_keywords_label || '关键词'}: ${aiOptimizeKeywords.join('、')}`);
    }
    const outputLanguageOption = TARGET_LANGUAGE_OPTIONS.find((option) => option.value === uiLanguageCode);
    const outputLanguageLabel = outputLanguageOption
      ? t[outputLanguageOption.labelKey]
      : uiLanguageCode.toUpperCase();
    lines.push(`${t.wb_ai_opt_prompt_output_language || 'Output Language'}: ${outputLanguageLabel}`);
    lines.push(t.wb_ai_opt_prompt_language_rule || `Use ${outputLanguageLabel} for the final prompt output.`);
    lines.push(`${t.wb_ai_opt_prompt_goal || '目标'}: ${t.wb_ai_opt_prompt_goal_default || '保留主体形态与核心卖点，提升电商展示质感和清晰度。'}`);
    lines.push(`${t.wb_ai_opt_prompt_constraints || '约束'}: ${t.wb_ai_opt_prompt_constraints_default || '仅输出商品图，不添加文字水印，不改变商品结构。'}`);
    return lines.join('\n');
  }, [
    aiOptimizeCategory,
    aiOptimizeKeywords,
    coreSellingPoints,
    productCategory,
    productName,
    uiLanguageCode,
    t,
  ]);
  const openAiOptimizeDialog = useCallback(() => {
    if (aiOptimizeImageCandidates.length === 0) {
      openInfo(popupTitles.notice, t.wb_ai_opt_need_image || '请先上传至少 1 张图片素材。');
      return;
    }
    const preferred = aiOptimizeImageCandidates.find((asset) => asset.id === selectedQueueAssetId)
      || aiOptimizeImageCandidates.find((asset) => asset.previewUrl === uploadedFile)
      || aiOptimizeImageCandidates[0];
    const nextReferenceId = preferred?.id || null;

    setAiOptimizeReferenceId(nextReferenceId);
    setAiOptimizeCategory(productCategory || '');
    setAiOptimizeKeywords([]);
    setAiOptimizeAspectRatio(aspectRatio === '16:9' || aspectRatio === '1:1' ? aspectRatio : '9:16');
    setAiOptimizeResolution('hd');
    setAiOptimizeStyleStrength(60);
    setAiOptimizeCount(2);
    setAiOptimizeResults([]);
    setAiOptimizePrompt(buildAiOptimizePromptScript(preferred || null));
    setIsAiOptimizeOpen(true);
  }, [
    aiOptimizeImageCandidates,
    aspectRatio,
    buildAiOptimizePromptScript,
    openInfo,
    popupTitles.notice,
    productCategory,
    selectedQueueAssetId,
    t.wb_ai_opt_need_image,
    uploadedFile,
  ]);
  const handleBuildAiOptimizePromptScript = useCallback(async () => {
    const selected = aiOptimizeImageCandidates.find((item) => item.id === aiOptimizeReferenceId) || null;
    const fallbackPrompt = buildAiOptimizePromptScript(selected);

    setIsAiOptimizePromptGenerating(true);
    try {
      const resp = await videoApi.generateOptimizedPromptScript({
        raw_prompt: fallbackPrompt,
        reference_name: String(selected?.name || '').trim() || undefined,
        product_name: String(productName || '').trim() || undefined,
        product_category: String(aiOptimizeCategory || productCategory || '').trim() || undefined,
        core_selling_points: String(coreSellingPoints || '').trim() || undefined,
        keyword_tags: aiOptimizeKeywords,
        output_language: uiLanguageCode,
        sound: soundSetting,
      });

      const body = resp?.data || resp?.result || resp;
      const promptScript = String(body?.prompt_script || body?.prompt || body?.kling_prompt || '').trim();
      if (!promptScript) {
        setAiOptimizePrompt(fallbackPrompt);
        openInfo(popupTitles.notice, t.wb_ai_opt_prompt_empty || '后端未返回提示词脚本，已使用默认草稿。');
        return;
      }

      setAiOptimizePrompt(promptScript);
    } catch (err) {
      const message = err instanceof Error && err.message.trim()
        ? err.message.trim()
        : (t.wb_ai_opt_prompt_empty || '提示词脚本生成失败，请稍后重试。');
      openInfo(popupTitles.notice, message);
    } finally {
      setIsAiOptimizePromptGenerating(false);
    }
  }, [
    aiOptimizeCategory,
    aiOptimizeImageCandidates,
    aiOptimizeKeywords,
    aiOptimizeReferenceId,
    buildAiOptimizePromptScript,
    coreSellingPoints,
    openInfo,
    popupTitles.notice,
    productCategory,
    productName,
    soundSetting,
    t.wb_ai_opt_prompt_empty,
    uiLanguageCode,
  ]);
  const handleSaveAiOptimizePromptToLibrary = useCallback(async () => {
    const promptContent = String(aiOptimizePrompt || '').trim();
    if (!promptContent) {
      openInfo(popupTitles.notice, t.wb_ai_opt_prompt_save_need_text || '请先生成或填写提示词脚本后再保存。');
      return;
    }

    const baseCandidate = String(productName || aiOptimizeCategory || 'prompt').trim();
    const safeBase = baseCandidate
      .replace(/[\\/:*?"<>|\s]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'prompt';
    const timeSuffix = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${safeBase}_${timeSuffix}.txt`;
    const promptFile = new File([promptContent], fileName, { type: 'text/plain;charset=utf-8' });

    setIsAiOptimizePromptSaving(true);
    try {
      await assetsApi.uploadAsset(promptFile, 'script');
      openInfo(popupTitles.success, t.wb_ai_opt_prompt_saved || '优质 Prompt 已保存到素材库。');
    } catch (err) {
      const message = err instanceof Error && err.message.trim()
        ? err.message.trim()
        : (t.wb_ai_opt_prompt_save_failed || '保存失败，请稍后重试。');
      openInfo(popupTitles.notice, message);
    } finally {
      setIsAiOptimizePromptSaving(false);
    }
  }, [
    aiOptimizeCategory,
    aiOptimizePrompt,
    openInfo,
    popupTitles.notice,
    popupTitles.success,
    productName,
    t.wb_ai_opt_prompt_save_failed,
    t.wb_ai_opt_prompt_save_need_text,
    t.wb_ai_opt_prompt_saved,
  ]);
  const openSeedanceReplayLibraryPicker = useCallback((targetMediaKind?: SeedanceReplayMediaKind | null) => {
    const nextIntent = getSeedanceReplayLibraryIntent(targetMediaKind);
    setSeedanceReplayLibraryIntent(nextIntent);
    setAssetLibraryPickMode('default');
    setAssetLibraryTab(nextIntent.preferredTab);
    setAssetLibraryCurrentFolderId(null);
    setIsAssetLibraryOpen(true);
  }, [getSeedanceReplayLibraryIntent]);

  const handleSeedanceReplayAddFromLibrary = useCallback((targetMediaKind?: SeedanceReplayMediaKind) => {
    openSeedanceReplayLibraryPicker(targetMediaKind || null);
  }, [openSeedanceReplayLibraryPicker]);

  const handleSeedanceReplaySetFrameRole = useCallback((assetId: string, role: 'firstFrame' | 'lastFrame' | null) => {
    setAssetQueue((prev) => {
      // Clear the role from any other asset that holds it, then set on target
      const roleLabel = role === 'firstFrame' ? '首帧' as const : role === 'lastFrame' ? '尾帧' as const : null;
      return prev.map((item) => {
        if (item.id === assetId) {
          return { ...item, frameRole: roleLabel };
        }
        // If another asset already has this role, clear it
        if (roleLabel && item.frameRole === roleLabel) {
          return { ...item, frameRole: null };
        }
        // If we're clearing a first frame, also clear any last frame (can't have last without first)
        if (role === null) {
          const targetAsset = prev.find((a) => a.id === assetId);
          if (targetAsset?.frameRole === '首帧' && item.frameRole === '尾帧') {
            return { ...item, frameRole: null };
          }
        }
        return item;
      });
    });
  }, []);

  const handleSeedanceReplayAddVirtualModel = useCallback(() => {
    const intent: SeedanceReplayLibraryIntent = {
      targetMediaKind: 'image',
      allowedTabs: ['model'],
      preferredTab: 'model',
    };
    setSeedanceReplayLibraryIntent(intent);
    setAssetLibraryPickMode('default');
    setAssetLibraryTab('model');
    setAssetLibraryCurrentFolderId(null);
    setIsAssetLibraryOpen(true);
  }, []);
  const resolveAiOptimizeReferencePath = useCallback(async (asset: QueuedAsset) => {
    let referencePath = asset.uploadedPath || asset.assetUrl || null;
    if (!referencePath && asset.fileObj) {
      const uploadResp = await assetsApi.uploadTempAsset(asset.fileObj);
      referencePath =
        (Array.isArray(uploadResp?.assets) && uploadResp.assets[0]
          ? (uploadResp.assets[0].url || uploadResp.assets[0].file_url || uploadResp.assets[0].path)
          : null)
        || uploadResp?.url
        || uploadResp?.file_url
        || uploadResp?.path
        || uploadResp?.data?.url
        || null;
    }
    if (!referencePath && asset.previewUrl) {
      referencePath = asset.previewUrl;
    }
    return referencePath;
  }, []);
  const handleGenerateOptimizedImages = useCallback(async () => {
    const selectedAsset = aiOptimizeImageCandidates.find((asset) => asset.id === aiOptimizeReferenceId);
    if (!selectedAsset) {
      openInfo(popupTitles.notice, t.wb_ai_opt_need_image || '请先上传至少 1 张图片素材。');
      return;
    }

    const prompt = aiOptimizePrompt.trim();
    if (!prompt) {
      openInfo(popupTitles.notice, t.wb_prompt_script_required || '请先生成或填写提示词脚本。');
      return;
    }

    const imageQueueTaskId = `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const imageEstimatedSeconds = Math.max(15, Math.min(180, Math.round(aiOptimizeCount) * 30));
    currentImageQueueTaskIdRef.current = imageQueueTaskId;
    upsertTask({
      id: imageQueueTaskId,
      workbenchProjectId: projectStore.currentProjectId,
      estimatedSeconds: imageEstimatedSeconds,
      type: 'image_generation',
      status: 'processing',
      navigateTo: { view: 'workbench', focus: 'image' },
      name: `${selectedAsset.name || (productName || '').trim() || 'AI Image Optimize'}`,
      thumbnail: selectedAsset.previewUrl || uploadedFile || undefined,
      createdAt: Date.now(),
    });

    setIsAiOptimizeGenerating(true);
    try {
      const referencePath = await resolveAiOptimizeReferencePath(selectedAsset);
      const resp = await videoApi.generateOptimizedImage({
        prompt,
        aspect_ratio: aiOptimizeAspectRatio,
        resolution: aiOptimizeResolution,
        style_strength: Math.max(0, Math.min(100, Math.round(aiOptimizeStyleStrength))),
        generate_count: Math.max(1, Math.min(4, Math.round(aiOptimizeCount))),
        product_category: aiOptimizeCategory || undefined,
        keyword_tags: aiOptimizeKeywords,
        reference_image_url: referencePath || undefined,
        reference_image_path: referencePath || undefined,
        output_language: uiLanguageCode,
      });

      const body = resp?.data || resp?.result || resp;
      const rawImages = Array.isArray(body?.images)
        ? body.images
        : (Array.isArray(body?.results) ? body.results : []);
      const nextImages = rawImages
        .map((item: any, idx: number) => {
          const raw = typeof item === 'string'
            ? item
            : (item?.url || item?.image_url || item?.file_url || item?.path || '');
          const finalUrl = toDisplayUrl(raw);
          if (!finalUrl) return null;
          return {
            id: String(item?.id || `ai-opt-${Date.now()}-${idx}`),
            url: finalUrl,
          };
        })
        .filter(Boolean) as Array<{ id: string; url: string }>;

      if (nextImages.length === 0) {
        updateTask(imageQueueTaskId, {
          status: 'failed',
          result: { error: 'NO_RESULT' },
          navigateTo: { view: 'workbench', focus: 'image' },
        });
        openInfo(popupTitles.notice, t.wb_ai_opt_no_result || '后端未返回可用图片，请稍后重试。');
        return;
      }
      setAiOptimizeResults(nextImages);
      updateTask(imageQueueTaskId, {
        status: 'success',
        result: { images: nextImages },
        navigateTo: { view: 'workbench', focus: 'image' },
      });
    } catch (err: any) {
      if (err instanceof VideoApiError && err.status === 404) {
        updateTask(imageQueueTaskId, {
          status: 'failed',
          result: { error: 'BACKEND_NOT_READY' },
          navigateTo: { view: 'workbench', focus: 'image' },
        });
        openInfo(popupTitles.notice, t.wb_ai_opt_backend_not_ready || '后端暂未接入图生图接口。');
      } else {
        const message = err instanceof Error && err.message.trim()
          ? err.message.trim()
          : (t.wb_ai_opt_generate_failed || 'Image optimization failed. Please try again.');
        updateTask(imageQueueTaskId, {
          status: 'failed',
          result: { error: message },
          navigateTo: { view: 'workbench', focus: 'image' },
        });
        openErrorModal(err, { category: 'generation_failed', onRetry: handleGenerateOptimizedImages });
      }
    } finally {
      setIsAiOptimizeGenerating(false);
      if (currentImageQueueTaskIdRef.current === imageQueueTaskId) {
        currentImageQueueTaskIdRef.current = null;
      }
    }
  }, [
    aiOptimizeAspectRatio,
    aiOptimizeCategory,
    aiOptimizeCount,
    aiOptimizeImageCandidates,
    aiOptimizeKeywords,
    aiOptimizePrompt,
    aiOptimizeReferenceId,
    aiOptimizeResolution,
    aiOptimizeStyleStrength,
    openInfo,
    popupTitles.error,
    popupTitles.notice,
    resolveAiOptimizeReferencePath,
    t.wb_ai_opt_backend_not_ready,
    t.wb_ai_opt_generate_failed,
    t.wb_ai_opt_need_image,
    t.wb_ai_opt_need_prompt,
    t.wb_ai_opt_no_result,
    productName,
    projectStore.currentProjectId,
    uiLanguageCode,
    updateTask,
    uploadedFile,
    upsertTask,
  ]);
  const handleReplaceWithOptimizedImage = useCallback((imageUrl: string) => {
    const finalUrl = toDisplayUrl(imageUrl);
    if (!finalUrl) return;

    const targetId = aiOptimizeReferenceId || selectedQueueAssetId;
    if (targetId && assetQueue.length > 0) {
      setAssetQueue((prev) => prev.map((item): QueuedAsset => (
        item.id === targetId
          ? {
            ...item,
            previewUrl: finalUrl,
            assetUrl: finalUrl,
            uploadedPath: finalUrl,
            fileObj: null,
            mediaKind: 'image',
          }
          : item
      )));
      setSelectedQueueAssetId(targetId);
    }

    setUploadedFile(finalUrl);
    setSelectedFileObj(null);
    setSelectedAssetUrl(finalUrl);
    setLastUploadedUrl(finalUrl);
    setSelectedAssetSource((prev) => prev || 'product');
    setCurrentMaterialType((prev) => prev || 'product');
    setGeneratedVideoUrl(null);
    setIsAiOptimizeOpen(false);
    openInfo(popupTitles.success, t.wb_ai_opt_replace_success || '已替换为优化结果。');
  }, [
    aiOptimizeReferenceId,
    assetQueue.length,
    openInfo,
    popupTitles.success,
    selectedQueueAssetId,
    setGeneratedVideoUrl,
    t.wb_ai_opt_replace_success,
  ]);
  const klingRoleLabel = (source: QueuedAsset['source']) => {
    if (source === 'subject') return t.wb_label_subject_reference || 'Subject Reference';
    if (source === 'product') return t.wb_label_first_frame || 'First Frame';
    if (source === 'tail') return t.wb_label_tail_frame || 'Tail Frame';
    return t.wb_label_reference_image || 'Reference';
  };
  const canBeKlingSubject = useCallback((asset: QueuedAsset) => (
    asset.mediaKind === 'image'
    && (asset.materialType === 'model' || asset.materialType === 'product')
    && hasSubjectOtherViews(asset)
  ), [hasSubjectOtherViews]);
  const sortKlingQueueAssets = useCallback((assets: QueuedAsset[]) => {
    const priority = (asset: QueuedAsset) => {
      if (asset.source === 'subject' || asset.source === 'product' || asset.source === 'tail') return 0;
      return 1;
    };
    return [...assets].sort((a, b) => priority(a) - priority(b));
  }, []);
  const normalizeQueueSourcesForKlingMode = useCallback((assets: QueuedAsset[], mode: 'first_frame' | 'subject' | 'first_last_frame'): QueuedAsset[] => {
    let primaryAssigned = false;
    let subjectAssigned = false;
    let tailAssigned = false;

    const normalized = assets.map((item): QueuedAsset => {
      if (item.mediaKind !== 'image') {
        return { ...item, source: 'preference', isPrimaryFrame: false };
      }
      if (mode === 'first_frame') {
        const wantsPrimary = item.source === 'product';
        if (wantsPrimary && !primaryAssigned) {
          primaryAssigned = true;
          return { ...item, source: 'product', isPrimaryFrame: true };
        }
        return { ...item, source: 'preference', isPrimaryFrame: false };
      }

      if (mode === 'first_last_frame') {
        const wantsPrimary = item.source === 'product';
        if (wantsPrimary && !primaryAssigned) {
          primaryAssigned = true;
          return { ...item, source: 'product', isPrimaryFrame: true };
        }
        const wantsTail = item.source === 'tail';
        if (wantsTail && !tailAssigned) {
          tailAssigned = true;
          return { ...item, source: 'tail', isPrimaryFrame: false };
        }
        return { ...item, source: 'preference', isPrimaryFrame: false };
      }

      const wantsSubject = canBeKlingSubject(item) && item.source === 'subject';
      if (wantsSubject && !subjectAssigned) {
        subjectAssigned = true;
        return { ...item, source: 'subject', isPrimaryFrame: false };
      }
      return { ...item, source: 'preference', isPrimaryFrame: false };
    });
    const sorted = sortKlingQueueAssets(normalized);
    if (mode === 'first_last_frame') {
      return sorted.map((item) => (item.mediaKind === 'image' ? { ...item, materialType: 'product' as const } : item));
    }
    return sorted;
  }, [canBeKlingSubject, sortKlingQueueAssets]);

  const suggestKlingImageSourceForMode = useCallback((existing: QueuedAsset[]): QueuedAsset['source'] => {
    if (klingGenerateMode === 'subject') return 'subject';
    if (klingGenerateMode === 'first_last_frame') {
      return 'preference';
    }
    return 'product';
  }, [klingGenerateMode]);

  const reorderReferenceAssets = useCallback((assets: QueuedAsset[], movedId: string, beforeId?: string | null): QueuedAsset[] => {
    const moved = assets.find((item) => item.id === movedId);
    if (!moved) return assets;

    const primaryRole: QueuedAsset['source'] = isKlingOmniMode
      ? (klingGenerateMode === 'subject' ? 'subject' : 'product')
      : 'product';
    const updated = assets.map((item): QueuedAsset => (
      item.id === movedId ? { ...item, source: 'preference', isPrimaryFrame: false } : item
    ));
    const movedUpdated = updated.find((item) => item.id === movedId);
    if (!movedUpdated) return updated;

    const primaryItems = updated.filter((item) => item.mediaKind === 'image' && item.source === primaryRole);
    const nonPrimaryItems = updated.filter((item) => !(item.mediaKind === 'image' && item.source === primaryRole) && item.id !== movedId);
    const insertIndex = beforeId ? nonPrimaryItems.findIndex((item) => item.id === beforeId) : -1;
    if (insertIndex >= 0) {
      nonPrimaryItems.splice(insertIndex, 0, movedUpdated);
    } else {
      nonPrimaryItems.push(movedUpdated);
    }
    return [...primaryItems, ...nonPrimaryItems];
  }, [isKlingOmniMode, klingGenerateMode]);

  const clearWorkbenchDragState = useCallback(() => {
    setDraggingWorkbenchAssetId(null);
  }, []);

  const handleInvalidKlingSubjectTarget = useCallback((target: QueuedAsset) => {
    if (target.materialType === 'scene') {
      openInfo(popupTitles.notice, '场景类型的素材不支持作为主体');
      return;
    }
    openKlingSubjectGuide();
  }, [openInfo, openKlingSubjectGuide, popupTitles.notice]);

  const handleWorkbenchAssetDragStart = useCallback((asset: QueuedAsset, event: React.DragEvent) => {
    setDraggingWorkbenchAssetId(asset.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', asset.id);
  }, []);

  function moveQueueAssetToSlot(assetId: string, slot: 'primary' | 'reference', beforeId?: string | null) {
    const target = assetQueue.find((item) => item.id === assetId);
    if (!target || target.mediaKind !== 'image') return;

    if (slot === 'primary') {
      if (isKlingOmniMode && klingGenerateMode === 'subject' && !canBeKlingSubject(target)) {
        handleInvalidKlingSubjectTarget(target);
        return;
      }
      const primarySource: QueuedAsset['source'] = isKlingOmniMode
        ? (klingGenerateMode === 'subject' ? 'subject' : 'product')
        : 'product';
      if (isKlingOmniMode) {
        applyKlingPrimarySelection(assetId, primarySource);
      } else {
        setAssetQueue((prev) => prev.map((item): QueuedAsset => (
          item.mediaKind !== 'image'
            ? item
            : item.id === assetId
              ? { ...item, source: 'product', isPrimaryFrame: true }
              : { ...item, source: 'preference', isPrimaryFrame: false }
        )));
      }
      return;
    }

    if (isKlingOmniMode && klingGenerateMode === 'first_frame') {
      const normalizedImages = normalizeQueueSourcesForKlingMode(
        assetQueue.filter((item) => item.mediaKind === 'image'),
        klingGenerateMode
      );
      const referenceCount = normalizedImages.filter((item) => item.source === 'preference').length;
      const targetIsAlreadyReference = normalizedImages.some((item) => item.id === assetId && item.source === 'preference');
      if (!targetIsAlreadyReference && referenceCount >= 6) {
        openInfo(
          popupTitles.notice,
          t.wb_kling_reference_slot_first_frame_max || '最多6张'
        );
        return;
      }
    }

    setAssetQueue((prev) => {
      const next = reorderReferenceAssets(prev, assetId, beforeId);
      return isKlingOmniMode ? normalizeQueueSourcesForKlingMode(next, klingGenerateMode) : next;
    });
  }

  const applyKlingPrimarySelection = useCallback((assetId: string, primarySource: 'product' | 'subject') => {
    setAssetQueue(prev => {
      const next = prev.map((item): QueuedAsset => {
        if (item.mediaKind !== 'image') return item;
        if (item.id === assetId) {
          if (primarySource === 'subject' && !canBeKlingSubject(item)) {
            handleInvalidKlingSubjectTarget(item);
            return { ...item, source: 'preference', isPrimaryFrame: false };
          }
          return { ...item, source: primarySource, isPrimaryFrame: primarySource === 'product' };
        }
        return { ...item, source: 'preference', isPrimaryFrame: false };
      });
      const normalized = normalizeQueueSourcesForKlingMode(next, klingGenerateMode);
      const selectedAsset = normalized.find(item => item.id === assetId);
      if (selectedAsset) {
        setSelectedQueueAssetId(selectedAsset.id);
        setUploadedFile(selectedAsset.previewUrl || null);
        setFileName(selectedAsset.name || '');
        setSelectedFileObj(selectedAsset.fileObj || null);
        setSelectedAssetUrl(selectedAsset.assetUrl || null);
        setSelectedAssetSource(selectedAsset.source || null);
        setCurrentMaterialType(selectedAsset.materialType || null);
      }
      return normalized;
    });
  }, [canBeKlingSubject, handleInvalidKlingSubjectTarget, klingGenerateMode, normalizeQueueSourcesForKlingMode]);
  useEffect(() => {
    if (!isKlingOmniMode) return;
    if (skipNextKlingNormalizeRef.current) {
      skipNextKlingNormalizeRef.current = false;
      return;
    }
    setAssetQueue((prev) => normalizeQueueSourcesForKlingMode(prev, klingGenerateMode));
    setSelectedAssetSource((prev) => {
      if (klingGenerateMode === 'first_frame') {
        return prev === 'product' ? 'product' : 'preference';
      }
      if (klingGenerateMode === 'first_last_frame') {
        return prev === 'product' || prev === 'tail' ? prev : 'preference';
      }
      return prev === 'subject' ? 'subject' : 'preference';
    });
  }, [isKlingOmniMode, klingGenerateMode, normalizeQueueSourcesForKlingMode]);
  const activeScriptPlan = scriptPages[activeScriptPage];
  const activeFullScript = activeScriptPlan?.fullScript || '';
  const activeCreativeCard = activeScriptPlan?.creativeCard;
  const activeCreativeCardText = activeScriptPlan?.creativeCardText || '';
  const activeGuideStep = isGuideOpen ? guideSteps[guideStepIndex] : null;
  const isGuideFocused = (key: GuideStepKey) => activeGuideStep?.key === key;
  const getGuideFocusClass = (key: GuideStepKey) => {
    if (!isGuideOpen) return '';
    return isGuideFocused(key)
      ? 'relative z-[85] pointer-events-auto opacity-100 blur-0 rounded-md outline outline-2 outline-orange-300/80 outline-offset-4 transition-[filter,opacity] duration-200'
      : 'pointer-events-none blur-[1.5px] opacity-45 transition-[filter,opacity] duration-200';
  };

  const getGuideTargetElement = useCallback(() => {
    const map: Record<GuideStepKey, React.RefObject<HTMLDivElement | null>> = {
      mode: modeSectionRef,
      upload: uploadSectionRef,
      config: configSectionRef,
      scripts: scriptsSectionRef,
      preview: previewSectionRef,
    };
    const key = guideSteps[guideStepIndex]?.key;
    return key ? map[key]?.current || null : null;
  }, [guideStepIndex, guideSteps]);

  const updateGuidePanelPosition = useCallback(() => {
    const target = getGuideTargetElement();
    const viewportPadding = 12;
    const panelWidth = Math.min(420, window.innerWidth - viewportPadding * 2);
    const panelHeight = 330;
    const activeKey = guideSteps[guideStepIndex]?.key;

    if (!target) {
      setGuidePanelStyle({
        width: `${panelWidth}px`,
        left: `${Math.max(viewportPadding, Math.round((window.innerWidth - panelWidth) / 2))}px`,
        top: `${Math.max(viewportPadding, Math.round((window.innerHeight - panelHeight) / 2))}px`,
      });
      return;
    }

    const rect = target.getBoundingClientRect();
    const gap = activeKey === 'preview' ? 64 : 20;
    const preferredLeft = activeKey === 'preview'
      ? rect.left - panelWidth - gap
      : rect.right + gap;
    const left = Math.min(
      Math.max(viewportPadding, preferredLeft),
      Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding)
    );

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
  }, [getGuideTargetElement, guideStepIndex, guideSteps]);

  useLayoutEffect(() => {
    if (!isGuideOpen) return;
    const target = getGuideTargetElement();
    if (target) {
      target.scrollIntoView({
        behavior: 'auto',
        block: guideSteps[guideStepIndex]?.key === 'config' ? 'start' : 'nearest',
        inline: 'nearest',
      });
    }

    updateGuidePanelPosition();
    return undefined;
  }, [guideStepIndex, isGuideOpen, getGuideTargetElement, updateGuidePanelPosition]);

  const extractUploadedAssetPath = (uploadResp: any): string | null => {
    if (uploadResp?.assets && Array.isArray(uploadResp.assets) && uploadResp.assets.length > 0) {
      return uploadResp.assets[0].url || uploadResp.assets[0].file_url || uploadResp.assets[0].path || null;
    }
    return uploadResp?.url || uploadResp?.file_url || uploadResp?.path || uploadResp?.data?.url || null;
  };


  const hasActiveScriptConcept =
    Boolean((activeFullScript || '').trim())
    || Boolean((activeCreativeCardText || '').trim())
    || hasCreativeCardContent(activeCreativeCard);

  const hasAnyScriptPlanGridContent = useMemo(() => {
    return scriptPages.some((page) => {
      const hasConcept = Boolean((page?.fullScript || '').trim())
        || Boolean((page?.creativeCardText || '').trim())
        || hasCreativeCardContent(page?.creativeCard);
      if (hasConcept) return true;
      const pageScripts = Array.isArray(page?.scripts) ? page.scripts : [];
      return pageScripts.some((item) => Boolean(String(item?.visual || '').trim()) || Boolean(String(item?.audio || '').trim()));
    });
  }, [scriptPages]);

  const resetScriptPlanGridToDefault = useCallback(() => {
    isDemoScriptsRef.current = false;
    const defaultPage: ScriptPage = {
      id: 'page-1',
      name: `${t.wb_script_page_prefix} 1`,
      scripts: [],
    };
    scriptPagesRef.current = [defaultPage];
    setScriptPages([defaultPage]);
    setActiveScriptPage(0);
    setScripts([]);
    setIsShotBreakdownOpen(false);
  }, [t.wb_script_page_prefix]);

  useEffect(() => {
    console.log('[ScriptDebug] render-state', {
      activeScriptPage,
      scriptPagesLength: scriptPages.length,
      hasActiveScriptPlan: Boolean(activeScriptPlan),
      activeCreativeCardTextLength: (activeScriptPlan?.creativeCardText || '').length,
      activeFullScriptLength: (activeScriptPlan?.fullScript || '').length,
    });
  }, [activeScriptPage, scriptPages.length, activeScriptPlan?.creativeCardText, activeScriptPlan?.fullScript]);

  function buildCombinedScriptPrompt(
    fullScript: string,
    card?: ScriptCreativeCard,
    inputScripts: ScriptItem[] = [],
    cardText?: string
  ) {
    const creativeCardPrompt = (cardText || '').trim() || buildCreativeCardPrompt(card);
    const masterScriptPrompt = (fullScript || '').trim() ? `[完整脚本]: ${(fullScript || '').trim()}` : '';
    const shotPrompt = inputScripts.map((script, idx) => {
      const audioMarker = (soundSetting === 'on' && script.audio) ? `【音频|旁白】${script.audio}` : '';
      const typeLabel = script.type ? `(${script.type})` : '';
      const durLabel = script.dur ? `${script.dur}s` : '';
      const meta = [durLabel, typeLabel].filter(Boolean).join(' ');
      return `[镜头${idx + 1}]${meta ? ` ${meta}` : ''} ${script.visual || ''} ${audioMarker}`.trim();
    }).join('\n');
    const basePrompt = [masterScriptPrompt, creativeCardPrompt].filter(Boolean).join('\n\n');
    const storyboardSupplement = '[分镜补充要求]: 不要出现从手部特写到脚部穿戴/特写/接触商品的渐进过渡，以避免把手误生成成脚。';
    const firstLastFrameAudioSupplement = selectedModel === 'kling' && klingGenerateMode === 'first_last_frame' && soundSetting === 'on'
      ? '【音频|【[旁白]】全程保留清晰自然的人声口播讲解与轻微环境声，不要输出静音视频；口播需与站立手持展示动作一致，语气自然，避免无声片段。】'
      : '';
    if (ENABLE_STORYBOARD_PROMPT && shotPrompt) {
      if (basePrompt) return `${basePrompt}\n\n[分镜指引]: ${shotPrompt}\n${storyboardSupplement}${firstLastFrameAudioSupplement ? `\n${firstLastFrameAudioSupplement}` : ''}`;
      return `[分镜指引]: ${shotPrompt}\n${storyboardSupplement}${firstLastFrameAudioSupplement ? `\n${firstLastFrameAudioSupplement}` : ''}`;
    }
    return [basePrompt || shotPrompt, storyboardSupplement, firstLastFrameAudioSupplement].filter(Boolean).join('\n\n');
  }

  const resolveCurrentSingleAssetPath = async () => {
    let apiPath = lastUploadedUrl;

    if (!apiPath && selectedFileObj) {
      const uploadResp = await assetsApi.uploadTempAsset(selectedFileObj);
      const rawPath = extractUploadedAssetPath(uploadResp);
      if (!rawPath) throw new Error('Could not retrieve asset path from upload response');
      setLastUploadedUrl(rawPath);
      apiPath = rawPath;
    } else if (!apiPath && selectedAssetUrl) {
      apiPath = selectedAssetUrl;
    }

    return apiPath;
  };

  const buildScriptInputText = () => {
    const parts: string[] = [];
    const normalizedAdditionalRequirements = (genPrompt || '').trim();
    const normalizedReferenceScript = isReferenceScriptFresh ? (referenceScript || '').trim() : '';

    const pushLine = (label: string, value: string) => {
      const trimmed = (value || '').trim();
      if (!trimmed) return;
      parts.push(`${label}: ${trimmed}`);
    };

    pushLine(t.wb_field_product_name_label, productName);
    pushLine(t.wb_field_product_category_label, productCategory);
    pushLine(t.wb_field_core_selling_points_label, coreSellingPoints);
    pushLine(t.wb_field_target_audience_label, targetAudience);
    pushLine(t.wb_field_delivery_region_label, deliveryRegion);
    pushLine(t.wb_field_video_language_label, targetLanguage);
    pushLine(t.wb_field_video_type_label, videoType);
    if (normalizedAdditionalRequirements && normalizedAdditionalRequirements !== normalizedReferenceScript) {
      pushLine(t.wb_field_additional_requirements_label, normalizedAdditionalRequirements);
    }
    if (normalizedReferenceScript) {
      parts.push(`${t.wb_reference_script_label || 'Reference Script'}:\n${normalizedReferenceScript}`);
    }

    return parts.length > 0 ? parts.join('\n') : t.wb_script_prompt_fallback;
  };

  const getProductRecognitionSources = useCallback(() => {
    return uploadDisplayAssets.filter(
      (asset) => asset.materialType === 'product' && asset.mediaKind === 'image'
    );
  }, [uploadDisplayAssets]);

  const resolveProductRecognitionImagePaths = useCallback(async () => {
    const sources = getProductRecognitionSources();
    const limited = sources.slice(0, 4);

    const queuedPathUpdates: Record<string, string> = {};
    const paths: string[] = [];

    for (const asset of limited) {
      let resolvedPath = asset.uploadedPath || asset.assetUrl || null;
      if (!resolvedPath && asset.fileObj) {
        const uploadResp = await assetsApi.uploadTempAsset(asset.fileObj);
        resolvedPath = extractUploadedAssetPath(uploadResp);
      }
      if (!resolvedPath) continue;

      paths.push(resolvedPath);
      if (asset.id && asset.id !== 'current-upload') {
        queuedPathUpdates[asset.id] = resolvedPath;
      } else if (asset.id === 'current-upload') {
        setLastUploadedUrl(resolvedPath);
      }
    }

    if (Object.keys(queuedPathUpdates).length > 0) {
      setAssetQueue((prev) => prev.map((item) => (
        queuedPathUpdates[item.id] ? { ...item, uploadedPath: queuedPathUpdates[item.id] } : item
      )));
    }

    return paths;
  }, [extractUploadedAssetPath, getProductRecognitionSources]);

  useEffect(() => {
    if (!hasAiRecognized) {
      if (needsAiReRecognize) setNeedsAiReRecognize(false);
      return;
    }

    if (!recognizedProductSourceSignature) {
      if (needsAiReRecognize) setNeedsAiReRecognize(false);
      return;
    }

    if (!currentProductRecognitionSourceSignature) {
      if (needsAiReRecognize) setNeedsAiReRecognize(false);
      return;
    }

    const nextDirty = currentProductRecognitionSourceSignature !== recognizedProductSourceSignature;
    if (nextDirty !== needsAiReRecognize) {
      setNeedsAiReRecognize(nextDirty);
    }
  }, [
    currentProductRecognitionSourceSignature,
    hasAiRecognized,
    needsAiReRecognize,
    recognizedProductSourceSignature,
  ]);

  const isReferenceScriptFresh = !referenceScript || referenceScriptProductSignature === currentProductInfoSignature;

  const handleResizeMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = leftColumnWidth;

    const layoutRect = workspaceRowRef.current?.getBoundingClientRect();
    if (!layoutRect) return;

    const GAP_PX = 24;
    const SEPARATOR_HIT_WIDTH = 16;
    const previewWidth = previewSectionRef.current?.getBoundingClientRect().width ?? 300;
    const maxLeftByLayout = Math.floor(
      layoutRect.width - previewWidth - SCRIPT_COLUMN_MIN_WIDTH - GAP_PX * 3 - SEPARATOR_HIT_WIDTH
    );
    const maxLeft = Math.max(LEFT_COLUMN_MIN_WIDTH, Math.min(640, maxLeftByLayout));

    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = e.clientX - startX;
      const nextWidth = Math.min(maxLeft, Math.max(LEFT_COLUMN_MIN_WIDTH, startWidth + delta));
      setLeftColumnWidth(nextWidth);
      const ratio = layoutRect.width > 0 ? nextWidth / layoutRect.width : 0;
      if (ratio > 0 && ratio < 1) {
        try {
          sessionStorage.setItem(LEFT_COLUMN_RATIO_KEY, String(ratio));
        } catch {
          void 0;
        }
      }
    };

    const onUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [LEFT_COLUMN_MIN_WIDTH, LEFT_COLUMN_RATIO_KEY, SCRIPT_COLUMN_MIN_WIDTH, leftColumnWidth]);

  const handleScriptPreviewResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startRatio = scriptPreviewRatio;

    const scriptElement = scriptsSectionRef.current;
    const previewElement = previewSectionRef.current;
    if (!scriptElement || !previewElement) return;

    const scriptRect = scriptElement.getBoundingClientRect();
    const previewRect = previewElement.getBoundingClientRect();
    const totalWidth = scriptRect.width + previewRect.width;

    isResizingScriptPreviewRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (e: MouseEvent) => {
      if (!isResizingScriptPreviewRef.current) return;
      const delta = e.clientX - startX;
      const newScriptWidth = scriptRect.width + delta;
      const newRatio = newScriptWidth / totalWidth;

      if (newScriptWidth >= SCRIPT_COLUMN_MIN_WIDTH &&
        (totalWidth - newScriptWidth) >= PREVIEW_COLUMN_MIN_WIDTH &&
        newRatio > 0.2 && newRatio < 0.9) {
        setScriptPreviewRatio(newRatio);
        try {
          sessionStorage.setItem(SCRIPT_PREVIEW_RATIO_KEY, String(newRatio));
        } catch {
          void 0;
        }
      }
    };

    const onUp = () => {
      isResizingScriptPreviewRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [scriptPreviewRatio, SCRIPT_COLUMN_MIN_WIDTH, PREVIEW_COLUMN_MIN_WIDTH, SCRIPT_PREVIEW_RATIO_KEY]);

  const handleAiRecognize = useCallback(
    async () => {
      const imagePaths = await resolveProductRecognitionImagePaths();
      if (imagePaths.length === 0) {
        openInfo(popupTitles.notice, t.wb_popup_need_product_image_first);
        return;
      }

      // Determine if user has manually edited any product info field
      const hasUserEdited = Boolean(
        (productInfoTouched.name && productName.trim()) ||
        (productInfoTouched.category && productCategory.trim()) ||
        (productInfoTouched.sellingPoints && coreSellingPoints.trim()) ||
        (productInfoTouched.audience && targetAudience.trim())
      );

      // Always send existing content as context for the AI (whether user-typed or AI-filled)
      const hasAnyContent = Boolean(
        productName.trim() || productCategory.trim() || coreSellingPoints.trim() || targetAudience.trim()
      );

      // Build existing_info payload when fields have content
      const existingInfo = hasAnyContent
        ? {
          ...(productName.trim() ? { product_name: productName.trim() } : {}),
          ...(productCategory.trim() ? { product_category: productCategory.trim() } : {}),
          ...(coreSellingPoints.trim() ? { core_selling_points: coreSellingPoints.trim() } : {}),
          ...(targetAudience.trim() ? { target_audience: targetAudience.trim() } : {}),
        }
        : undefined;

      setIsAiRecognizing(true);
      try {
        const resp = await videoApi.recognizeProductInfo({
          image_paths: imagePaths,
          output_language: language,
          ...(existingInfo ? { existing_info: existingInfo } : {}),
        });
        const data = resp?.data || resp?.result || resp?.payload || resp;

        const nextName = String(data?.product_name || '').trim();
        const nextCategory = String(data?.product_category || '').trim();
        const nextSelling = Array.isArray(data?.core_selling_points)
          ? data.core_selling_points.filter(Boolean).join('\n')
          : String(data?.core_selling_points || '').trim();
        const nextAudience = String(data?.target_audience || '').trim();

        // If user has manually edited fields, show per-field overwrite dialog
        if (hasUserEdited) {
          const fields: AiOverwriteField[] = [
            { key: 'product_name', label: t.wb_field_product_name_label, currentValue: productName.trim(), newValue: nextName },
            { key: 'product_category', label: t.wb_field_product_category_label, currentValue: productCategory.trim(), newValue: nextCategory },
            { key: 'core_selling_points', label: t.wb_field_core_selling_points_label, currentValue: coreSellingPoints.trim(), newValue: nextSelling },
            { key: 'target_audience', label: t.wb_field_target_audience_label, currentValue: targetAudience.trim(), newValue: nextAudience },
          ];

          // Only show fields that actually differ
          const changedFields = fields.filter((f) => f.currentValue !== f.newValue);

          if (changedFields.length === 0) {
            openInfo(popupTitles.notice, t.wb_ai_overwrite_no_change);
          } else {
            // Open the overwrite dialog and wait for user selection
            const selectedKeys = await new Promise<Set<string> | null>((resolve) => {
              aiOverwriteResolveRef.current = resolve;
              setAiOverwriteFields(fields);
              setIsAiOverwriteOpen(true);
            });

            if (!selectedKeys) {
              // User cancelled
              return;
            }

            // Apply only selected fields
            if (selectedKeys.has('product_name')) setProductName(nextName);
            if (selectedKeys.has('product_category')) setProductCategory(nextCategory);
            if (selectedKeys.has('core_selling_points')) setCoreSellingPoints(nextSelling);
            if (selectedKeys.has('target_audience')) setTargetAudience(nextAudience);
          }
        } else {
          // No existing content — apply all directly (original behavior)
          setProductName(nextName);
          setProductCategory(nextCategory);
          setCoreSellingPoints(nextSelling);
          setTargetAudience(nextAudience);
        }

        setProductInfoTouched({ name: false, category: false, sellingPoints: false, audience: false });

        const recognizedSignature = buildProductRecognitionSourceSignature(getProductRecognitionSources());

        setHasAiRecognized(true);
        setRecognizedProductSourceSignature(recognizedSignature);
        setNeedsAiReRecognize(false);
      } catch (err: any) {
        openErrorModal(err, { category: 'recognize_failed' });
      } finally {
        setIsAiRecognizing(false);
      }
    },
    [
      coreSellingPoints,
      openInfo,
      productCategory,
      productInfoTouched,
      productName,
      getProductRecognitionSources,
      resolveProductRecognitionImagePaths,
      targetAudience,
      user?.id,
      t,
      language
    ]
  );

  const handleGenerateKlingBoundaryFrames = async () => {
    if (selectedModel !== 'kling') return;
    if (isGeneratingKlingBoundaryFrames) return;

    const imageAssets = uploadDisplayAssets.filter((asset) => asset.mediaKind === 'image');
    if (imageAssets.length === 0) {
      openInfo(popupTitles.notice, t.wb_kling_boundary_frames_need_reference || 'Please upload at least 1 reference image before generating first and last frames.');
      return;
    }

    setIsGeneratingKlingBoundaryFrames(true);
    try {
      const projectId = await ensureSingleProjectId();
      const selectedImageAsset = selectedQueueAssetId
        ? imageAssets.find((asset) => asset.id === selectedQueueAssetId) || null
        : null;
      const selectedImagePath = String(selectedImageAsset?.uploadedPath || selectedImageAsset?.assetUrl || '').trim();
      const selectedIsUsable = !!selectedImageAsset && (
        !!selectedImageAsset.fileObj ||
        (!!selectedImagePath && !selectedImagePath.includes('/media/generated/'))
      );
      const uploadableImageAsset = imageAssets.find((asset) => !!asset.fileObj) || null;
      const nonGeneratedImageAsset = imageAssets.find((asset) => {
        const path = String(asset.uploadedPath || asset.assetUrl || '').trim();
        return !!path && !path.includes('/media/generated/');
      }) || null;

      const referenceAsset =
        (selectedIsUsable ? selectedImageAsset : null)
        || uploadableImageAsset
        || nonGeneratedImageAsset
        || imageAssets[0];

      let referencePath = referenceAsset.uploadedPath || referenceAsset.assetUrl || null;
      const needUpload = !referencePath || String(referencePath).includes('/media/generated/');
      if (needUpload && referenceAsset.fileObj) {
        const uploadResp = await assetsApi.uploadTempAsset(referenceAsset.fileObj);
        referencePath = extractUploadedAssetPath(uploadResp);
      }

      if (!referencePath) {
        throw new Error(t.wb_kling_boundary_frames_upload_failed || 'Reference image upload failed. Please try again.');
      }

      const resp = await videoApi.generateFirstFrame({
        project_id: projectId,
        reference_image_path: referencePath,
        aspect_ratio: aspectRatio,
        frame_type: 'both',
        model: imageGenModel,
      });

      const firstPath = String(resp?.data?.first_frame_path || '').trim();
      const lastPath = String(resp?.data?.last_frame_path || '').trim();
      if (!firstPath || !lastPath) {
        throw new Error(t.wb_kling_boundary_frames_missing_result || 'Generation succeeded but first/last frame URLs were not returned.');
      }

      const firstDisplay = toDisplayUrl(firstPath) || firstPath;
      const lastDisplay = toDisplayUrl(lastPath) || lastPath;
      const firstId = `kling-first-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const lastId = `kling-last-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      setKlingGenerateMode('first_last_frame');
      setAssetQueue((prev) => {
        const withoutOldFrames = prev.filter((item) => item.source !== 'product' && item.source !== 'tail');
        const next: QueuedAsset[] = [
          {
            id: firstId,
            name: t.wb_kling_generated_first_frame_name || 'AI First Frame',
            previewUrl: firstDisplay,
            fileObj: null,
            assetUrl: firstPath,
            source: 'product',
            materialType: 'product',
            isPrimaryFrame: true,
            mediaKind: 'image',
            uploadedPath: firstPath,
          },
          {
            id: lastId,
            name: t.wb_kling_generated_last_frame_name || 'AI Last Frame',
            previewUrl: lastDisplay,
            fileObj: null,
            assetUrl: lastPath,
            source: 'tail',
            materialType: 'product',
            isPrimaryFrame: false,
            mediaKind: 'image',
            uploadedPath: lastPath,
          },
          ...withoutOldFrames,
        ];
        return normalizeQueueSourcesForKlingMode(next, 'first_last_frame');
      });

      setSelectedQueueAssetId(firstId);
      setUploadedFile(firstDisplay);
      setFileName(t.wb_kling_generated_first_frame_name || 'AI First Frame');
      setSelectedFileObj(null);
      setSelectedAssetUrl(firstPath);
      setSelectedAssetSource('product');
      setCurrentMaterialType('product');
      setLastUploadedUrl(firstPath);
      openInfo(popupTitles.success, t.wb_kling_boundary_frames_generated || 'First and last frames have been generated. You can now click "Generate Video".');
    } catch (err) {
      openErrorModal(err, { category: 'generation_failed', onRetry: handleGenerateKlingBoundaryFrames });
    } finally {
      setIsGeneratingKlingBoundaryFrames(false);
    }
  };

  const buildSingleGeneratePayload = async (): Promise<GeneratePayload> => {
    if (selectedModel === 'kling') {
      const imageAssets = uploadDisplayAssets.filter((asset) => asset.mediaKind === 'image');
      const normalizedAssets = normalizeQueueSourcesForKlingMode(imageAssets, klingGenerateMode);
      const firstFrameCount = normalizedAssets.filter((asset) => asset.source === 'product').length;
      const tailFrameCount = normalizedAssets.filter((asset) => asset.source === 'tail').length;
      const subjectCount = normalizedAssets.filter((asset) => asset.source === 'subject').length;
      const referenceCount = normalizedAssets.filter((asset) => asset.source === 'preference').length;

      if (klingGenerateMode === 'first_frame' && firstFrameCount !== 1) {
        throw new Error(t.wb_kling_validation_first_frame_exactly_one || 'Kling first-frame mode requires exactly 1 first-frame image.');
      }
      if (klingGenerateMode === 'subject' && subjectCount !== 1) {
        throw new Error(t.wb_kling_validation_subject_exactly_one || 'Kling subject mode requires exactly 1 subject image.');
      }
      if (klingGenerateMode === 'first_last_frame' && firstFrameCount !== 1) {
        throw new Error(t.wb_kling_first_last_frame_need_generate || 'Please click "Generate First + Last Frames From Reference" and wait for both frames before generating the video.');
      }
      if (klingGenerateMode === 'first_last_frame' && tailFrameCount !== 1) {
        throw new Error(t.wb_kling_first_last_frame_need_generate || 'Please click "Generate First + Last Frames From Reference" and wait for both frames before generating the video.');
      }

      if (klingGenerateMode === 'subject' && referenceCount < 1) {
        throw new Error(t.wb_kling_validation_subject_reference_range || 'Kling subject mode requires 1 to 3 additional reference images.');
      }
      if (klingGenerateMode === 'subject' && referenceCount > 3) {
        throw new Error(t.wb_kling_validation_subject_reference_max || 'Kling subject mode allows at most 3 additional reference images.');
      }

      const omniAssets: NonNullable<GeneratePayload['omni_assets']> = [];
      for (const asset of normalizedAssets) {
        let apiPath = asset.uploadedPath || asset.assetUrl || null;
        if (!apiPath && asset.fileObj) {
          const uploadResp = await assetsApi.uploadTempAsset(asset.fileObj);
          apiPath = extractUploadedAssetPath(uploadResp);
        }
        if (!apiPath) continue;

        omniAssets.push({
          role:
            asset.source === 'subject'
              ? 'subject'
              : asset.source === 'tail'
                ? 'last_frame'
                : asset.source === 'product'
                  ? 'first_frame'
                  : 'reference',
          image_url: apiPath,
          asset_id: asset.assetId || null,
          name: asset.name,
        });
      }

      if (omniAssets.length === 0) {
        throw new Error('可灵生成至少需要 1 张图片素材');
      }

      return {
        model: backendModel,
        prompt: buildCombinedScriptPrompt(activeFullScript, activeCreativeCard, scripts, activeCreativeCardText),
        product_name: productName,
        duration: genDuration,
        sound: soundSetting,
        ...(selectedBackgroundAudio && soundSetting === 'off'
          ? {
            background_audio_asset_id: selectedBackgroundAudio.id,
            background_audio_url: selectedBackgroundAudio.file_url,
            background_audio_name: selectedBackgroundAudio.name,
          }
          : {}),
        kling_mode: klingGenerateMode,
        omni_assets: omniAssets,
        user_language: language,
        target_language: targetLanguage,
        model_asset_id: null,
        motion_asset_id: null,
        ...(klingGenerateMode === 'subject' ? { aspect_ratio: aspectRatio } : {}),
        mode: 'pro',
        pricing_mode: creationMode,
        subject_description_hint: coreSellingPoints.trim() || undefined,
        asset_source: (normalizedAssets[0]?.source ?? null) as GeneratePayload['asset_source'],
        ...(promptOverridesPayload ? { prompt_overrides: promptOverridesPayload } : {}),
      };
    }

    // ── Seedance Replay 多素材：从队列中按类型收集所有素材 ──
    const resolveQueueAssetPath = async (asset: QueuedAsset): Promise<string | null> => {
      let p = asset.uploadedPath || asset.assetUrl || null;
      if (!p && asset.fileObj) {
        const uploadResp = await assetsApi.uploadTempAsset(asset.fileObj);
        p = extractUploadedAssetPath(uploadResp);
      }
      return p;
    };

    const imageAssetsInQueue = uploadDisplayAssets.filter((a) => a.mediaKind === 'image');
    const videoAssetsInQueue = uploadDisplayAssets.filter((a) => a.mediaKind === 'video');
    const audioAssetsInQueue = uploadDisplayAssets.filter((a) => a.mediaKind === 'audio');

    // 首帧图片：取队列中第一张图片（Kling 兼容）+ 收集所有图片路径（Seedance 多图参考）
    let resolvedImagePath: string | null = null;
    const allImagePaths: string[] = [];
    const imageAssetsMeta: Array<{ path: string; material_type: string; seedance_asset_id?: string; frame_role?: string | null }> = [];
    for (const imgAsset of imageAssetsInQueue) {
      const p = await resolveQueueAssetPath(imgAsset);
      if (p) {
        allImagePaths.push(p);
        if (!resolvedImagePath) resolvedImagePath = p;
        // Collect metadata for Seedance model-type assets (virtual human)
        const metaEntry: { path: string; material_type: string; seedance_asset_id?: string; frame_role?: string | null } = {
          path: p,
          material_type: imgAsset.materialType || 'product',
          frame_role: imgAsset.frameRole === '首帧' ? 'first_frame'
                    : imgAsset.frameRole === '尾帧' ? 'last_frame'
                    : null,
        };
        if (imgAsset.materialType === 'model') {
          const seedanceId = imgAsset.seedanceAssetId;
          if (seedanceId) {
            metaEntry.seedance_asset_id = seedanceId;
          }
        }
        imageAssetsMeta.push(metaEntry);
      }
    }

    // 参考视频：取第一个（Kling/Sora 兼容）+ 收集所有视频路径（Seedance 多视频参考）
    let resolvedVideoPath: string | null = null;
    const allVideoPaths: string[] = [];
    for (const vidAsset of videoAssetsInQueue) {
      const p = await resolveQueueAssetPath(vidAsset);
      if (p) {
        allVideoPaths.push(p);
        if (!resolvedVideoPath) resolvedVideoPath = p;
      }
    }

    // 参考音频：收集所有音频路径
    const singleAudioPaths: string[] = [];
    for (const audioAsset of audioAssetsInQueue) {
      const aPath = await resolveQueueAssetPath(audioAsset);
      if (aPath) singleAudioPaths.push(aPath);
    }

    // 如果队列为空，回退到当前选中素材（兼容非 Replay 模式）
    if (!resolvedImagePath && !resolvedVideoPath && imageAssetsInQueue.length === 0 && videoAssetsInQueue.length === 0) {
      const fallbackPath = currentAssetMediaKind !== 'audio' ? await resolveCurrentSingleAssetPath() : null;
      if (fallbackPath) {
        if (currentAssetMediaKind === 'video') resolvedVideoPath = fallbackPath;
        else resolvedImagePath = fallbackPath;
      }
    }

    const hasVisualAsset = !!resolvedImagePath || !!resolvedVideoPath;

    const payload: GeneratePayload = {
      model: backendModel,
      prompt: buildCombinedScriptPrompt(activeFullScript, activeCreativeCard, scripts, activeCreativeCardText),
      product_name: productName,
      duration: genDuration,
      aspect_ratio: aspectRatio,
      sound: soundSetting,
      ...(selectedBackgroundAudio && soundSetting === 'off'
        ? {
          background_audio_asset_id: selectedBackgroundAudio.id,
          background_audio_url: selectedBackgroundAudio.file_url,
          background_audio_name: selectedBackgroundAudio.name,
        }
        : {}),
      asset_source: selectedAssetSource,
      pricing_mode: creationMode,
      user_language: language,
      target_language: targetLanguage,
      model_asset_id: selectedTemplate?.default_model_asset?.id ?? null,
      motion_asset_id: hasVisualAsset ? null : (selectedTemplate?.default_motion_asset?.id ?? null),
      ...(resolvedImagePath ? { image_path: resolvedImagePath } : {}),
      ...(allImagePaths.length > 1 ? { image_paths: allImagePaths } : {}),
      ...(imageAssetsMeta.length > 0 ? { image_assets_meta: imageAssetsMeta } : {}),
      ...(resolvedVideoPath ? { motion_video_path: resolvedVideoPath } : {}),
      ...(allVideoPaths.length > 1 ? { video_paths: allVideoPaths } : {}),
      ...(singleAudioPaths.length > 0 ? { audio_paths: singleAudioPaths } : {}),
      ...(selectedModel === 'seedance2.0' ? { aspect_ratio: aspectRatio } : {}),
      ...(promptOverridesPayload ? { prompt_overrides: promptOverridesPayload } : {}),
    };

    if (selectedModel === 'sora2' || selectedModel === 'sora2pro') {
      payload.size = aspectRatio === '9:16' ? '720x1280' : '1280x720';
    }

    return payload;
  };

  const ensureSingleProjectId = async () => {
    if (selectedTemplate?.id) {
      const cloneResp = await videoApi.cloneProject(selectedTemplate.id);
      const clonedProjectId = cloneResp?.data?.new_project_id || cloneResp?.new_project_id || cloneResp?.data?.id;
      if (!clonedProjectId) throw new Error('Failed to clone project');
      return String(clonedProjectId);
    }

    if (!user?.id) throw new Error('请先登录');

    const createResp = await videoApi.createProject(user.id, {
      title: (productName || '').trim() || fileName || 'Video',
      aspect_ratio: aspectRatio || selectedTemplate?.aspect_ratio || '9:16',
      script_content: {
        duration: genDuration,
        shots: enableStoryboardEditor ? scripts : [],
      }
    });

    const createdProjectId = createResp?.data?.id || createResp?.data?.project_id || createResp?.id;
    if (!createdProjectId) throw new Error('Failed to create project');
    return String(createdProjectId);
  };

  const submitSingleGeneration = async (inputPayload: GeneratePayload) => {
    const projectId = inputPayload.project_id ? String(inputPayload.project_id) : await ensureSingleProjectId();
    const requestPayload: GeneratePayload = {
      ...inputPayload,
      project_id: projectId,
    };

    console.log('🚀 Sending Generation Request:', requestPayload);

    const genResp = await generateWithAdaptiveImageConfirm(requestPayload);
    if (genResp?.data?.debug_trace) {
      console.log('🧩 Kling Subject Debug Trace:', genResp.data.debug_trace);
    }
    const taskId = genResp?.data?.task_id || genResp?.task_id;

    if (genResp?.code === 0 && taskId) {
      const estimatedSeconds = await fetchEstimatedSeconds({
        model: backendModel,
        duration: Number(requestPayload.duration ?? genDuration),
        sound: String(requestPayload.sound || '') === 'off' ? 'off' : 'on',
        aspect_ratio: String(requestPayload.aspect_ratio || ''),
        resolution: String((requestPayload as any).resolution || (requestPayload as any).size || ''),
      });
      console.log('[Estimate] submitSingleGeneration', { taskId, projectId, estimatedSeconds });

      const estimatedHint = (t.wb_queue_estimated_complete_in || '预计 {s}s 生成完成').replace('{s}', String(estimatedSeconds));

      addTask({
        id: taskId,
        projectId,
        workbenchProjectId: projectStore.currentProjectId,
        estimatedSeconds,
        type: 'video_generation',
        status: 'processing',
        name: `${(productName || '').trim() || fileName || scriptPages[activeScriptPage]?.name || selectedTemplate?.name || 'Video'}`,
        thumbnail: uploadedFile || undefined,
        createdAt: Date.now(),
      });
      setLastGeneratedProjectId(projectId);
      openInfo(popupTitles.success, `${t.wb_popup_submit_success}\n${estimatedHint}`);
      return;
    }

    openInfo(popupTitles.notice, t.wb_popup_submit_no_task_id);
  };

  const getActionRequiredFromError = (err: unknown): ActionRequired => {
    if (err instanceof VideoApiError) {
      return err.actionRequired || null;
    }
    return null;
  };

  const formatWorkbenchError = (err: unknown, fallback: string) => {
    if (err instanceof VideoApiError) {
      const base = String(err.message || fallback);
      const parts: string[] = [base];
      // 如果有 errorCode，附带展示，方便用户截图反馈
      if (err.errorCode) {
        parts.push(`[${err.errorCode}]`);
      }
      if (err.trackingId) {
        parts.push(`Tracking ID: ${err.trackingId}`);
      }
      return parts.join('\n');
    }
    const raw = (err as any)?.message;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    return fallback;
  };

  // ─── 结构化错误弹窗 ───
  // 从 t 中提取 ErrorI18n 所需的国际化文本
  const errorI18n: Partial<ErrorI18n> = {
    err_title_generation: t.err_title_generation,
    err_title_script: t.err_title_script,
    err_title_parse: t.err_title_parse,
    err_title_recognize: t.err_title_recognize,
    err_title_upload: t.err_title_upload,
    err_title_network: t.err_title_network,
    err_title_auth: t.err_title_auth,
    err_title_unknown: t.err_title_unknown,
    err_msg_generation: t.err_msg_generation,
    err_msg_script: t.err_msg_script,
    err_msg_parse: t.err_msg_parse,
    err_msg_recognize: t.err_msg_recognize,
    err_msg_upload: t.err_msg_upload,
    err_msg_network: t.err_msg_network,
    err_msg_auth: t.err_msg_auth,
    err_msg_unknown: t.err_msg_unknown,
    err_sug_retry: t.err_sug_retry,
    err_sug_check_network: t.err_sug_check_network,
    err_sug_check_params: t.err_sug_check_params,
    err_sug_relogin: t.err_sug_relogin,
    err_sug_contact_support: t.err_sug_contact_support,
    err_sug_try_later: t.err_sug_try_later,
    err_sug_manual_fill: t.err_sug_manual_fill,
    err_btn_retry: t.err_btn_retry,
    err_btn_feedback: t.err_btn_feedback,
  };

  /**
   * 打开结构化错误弹窗（替代 openInfo + formatWorkbenchError 的组合）
   *
   * @param error    错误对象
   * @param category 错误类别（不传则自动推断）
   * @param onRetry  重试回调（不传则不显示重试按钮）
   * @param messageOverride 覆盖默认消息
   */
  const openErrorModal = (
    error: unknown,
    opts?: {
      category?: ErrorCategory;
      onRetry?: () => void;
      messageOverride?: string;
    },
  ) => {
    const data = buildErrorModalData({
      error,
      category: opts?.category,
      onRetry: opts?.onRetry,
      messageOverride: opts?.messageOverride,
      i18n: errorI18n,
    });
    setErrorModalData(data);
  };

  const generateWithAdaptiveImageConfirm = async (payload: GeneratePayload) => {
    try {
      return await videoApi.generate(payload);
    } catch (err) {
      const actionRequired = getActionRequiredFromError(err);
      const requestFlagRaw = actionRequired?.request_flag;
      const requestFlag = typeof requestFlagRaw === 'string' ? requestFlagRaw : null;
      const supportedFlag = requestFlag === 'allow_image_resize' || requestFlag === 'allow_image_compress';

      if (!supportedFlag || !requestFlag) {
        throw err;
      }

      if (payload[requestFlag]) {
        throw err;
      }

      const prompt =
        (typeof actionRequired?.prompt === 'string' && actionRequired.prompt.trim())
          ? actionRequired.prompt.trim()
          : (requestFlag === 'allow_image_resize'
            ? '当前图片不满足最小分辨率要求，是否自动放大后继续？'
            : '当前图片超过 10MB，是否自动压缩后继续？');

      const confirmed = await openConfirm(t.wb_popup_image_adjustment_title, prompt);
      if (!confirmed) {
        throw new Error(USER_CANCELLED_ADAPT);
      }

      const retriedPayload: GeneratePayload = { ...payload, [requestFlag]: true };
      return await videoApi.generate(retriedPayload);
    }
  };

  const refreshDebugPreview = async (payload: Record<string, unknown>) => {
    const previewResp = await videoApi.previewGenerate(payload);
    if (previewResp.code !== 0 || !previewResp.data) {
      throw new Error(previewResp.message || 'Failed to preview generation payload');
    }
    setDebugPreview(previewResp.data);
    return previewResp.data;
  };

  const handlePrepareDebug = async () => {
    if (isBatchDebugMode) {
      openInfo(popupTitles.notice, t.wb_debug_batch_unsupported);
      return;
    }
    if (!selectedTemplate?.id && !selectedFileObj && !selectedAssetUrl && !uploadedFile) {
      openInfo(popupTitles.notice, t.wb_popup_need_reference_or_template);
      return;
    }
    if (!hasActiveScriptConcept) {
      openInfo(popupTitles.notice, t.wb_popup_need_script_concept);
      return;
    }
    if (enableStoryboardEditor && !isDurationValid) {
      openInfo(popupTitles.warning, formatMessage(t.wb_popup_duration_mismatch, { current: currentScriptDuration, target: genDuration }));
      return;
    }

    setIsPreparingDebug(true);
    setDebugPreview(null);

    try {
      const projectId = await ensureSingleProjectId();
      const payload = await buildSingleGeneratePayload();
      payload.project_id = projectId;
      const preview = await refreshDebugPreview(payload as Record<string, unknown>);
      setDebugPayloadText(JSON.stringify(preview.request_payload || payload, null, 2));
    } catch (err: any) {
      openErrorModal(err, { category: 'generation_failed', onRetry: handlePrepareDebug });
    } finally {
      setIsPreparingDebug(false);
    }
  };

  const handleRefreshDebugPreview = async () => {
    let parsed: Record<string, unknown>;
    try {
      const next = JSON.parse(debugPayloadText);
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        throw new Error(t.wb_debug_invalid_json);
      }
      parsed = next as Record<string, unknown>;
    } catch {
      openErrorModal(new Error(t.wb_debug_invalid_json), { category: 'parse_failed' });
      return;
    }

    setIsPreparingDebug(true);
    try {
      const preview = await refreshDebugPreview(parsed);
      setDebugPayloadText(JSON.stringify(preview.request_payload || parsed, null, 2));
    } catch (err: any) {
      openErrorModal(err, { category: 'generation_failed', onRetry: handleRefreshDebugPreview });
    } finally {
      setIsPreparingDebug(false);
    }
  };

  const handleSendDebugPayload = async () => {
    let parsed: GeneratePayload;
    try {
      const next = JSON.parse(debugPayloadText);
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        throw new Error(t.wb_debug_invalid_json);
      }
      parsed = next as GeneratePayload;
    } catch {
      openErrorModal(new Error(t.wb_debug_invalid_json), { category: 'parse_failed' });
      return;
    }

    setIsSendingDebug(true);
    setGeneratedVideoUrl(null);
    try {
      await submitSingleGeneration(parsed);
    } catch (err: any) {
      openErrorModal(err, { category: 'generation_failed', onRetry: handleSendDebugPayload });
    } finally {
      setIsSendingDebug(false);
    }
  };

  const validateUploadFile = (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) return `${t.assets_upload_error_too_large || '文件过大'}：${file.name}（>1GB）`;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = IMAGE_EXTS.includes(ext);
    const isVideo = VIDEO_EXTS.includes(ext);

    if (!isImage && !isVideo) return `${t.assets_upload_error_unsupported || '格式不支持'}：${file.name}`;
    return null;
  };

  const validateBackgroundAudioFile = (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) return `${t.assets_upload_error_too_large || '文件过大'}：${file.name}（>1GB）`;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['mp3', 'wav', 'flac'].includes(ext)) {
      return `${t.assets_upload_error_unsupported || '格式不支持'}：${file.name}`;
    }
    return null;
  };

  const handleBackgroundAudioUpload = useCallback(async (file: File) => {
    const validationError = validateBackgroundAudioFile(file);
    if (validationError) {
      openInfo(
        (t as any).assets_upload_formats_title || '提示',
        `${validationError}\n\n${(t as any).wb_background_audio_formats || '支持格式'}：mp3 / wav / flac，≤ 1GB`
      );
      if (backgroundAudioInputRef.current) {
        backgroundAudioInputRef.current.value = '';
      }
      return;
    }

    try {
      const uploadResp = await assetsApi.uploadTempAsset(file);
      const rawPath = extractUploadedAssetPath(uploadResp);
      if (!rawPath) throw new Error('Could not retrieve audio path from upload response');

      setSelectedBackgroundAudio({
        id: `local-audio-${Date.now()}`,
        name: file.name,
        file_url: rawPath,
        source: 'local',
      });
      setIsBackgroundAudioSourceOpen(false);
    } catch (err: any) {
      openInfo(
        popupTitles.error,
        formatWorkbenchError(err, t.err_msg_upload || '上传失败')
      );
    } finally {
      if (backgroundAudioInputRef.current) {
        backgroundAudioInputRef.current.value = '';
      }
    }
  }, [extractUploadedAssetPath, formatWorkbenchError, openInfo, popupTitles.error, t]);

  const handleBackgroundAudioFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleBackgroundAudioUpload(file);
  }, [handleBackgroundAudioUpload]);

  const persistLocalQueuedAsset = useCallback(async (
    queueId: string,
    file: File,
    localPreviewUrl: string,
    updateSelected = false,
  ) => {
    try {
      const uploadResp = await assetsApi.uploadTempAsset(file);
      const rawPath = extractUploadedAssetPath(uploadResp);
      if (!rawPath) return;
      const uploadedFps = typeof uploadResp?.data?.fps === 'number' ? uploadResp.data.fps : null;

      const displayUrl = toDisplayUrl(rawPath) || rawPath;
      if (localPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localPreviewUrl);
      }

      setAssetQueue(prev => prev.map(item => (
        item.id === queueId
          ? {
            ...item,
            previewUrl: displayUrl,
            assetUrl: rawPath,
            uploadedPath: rawPath,
            fileObj: null,
            fps: uploadedFps ?? item.fps ?? null,
          }
          : item
      )));

      if (!updateSelected) return;

      setUploadedFile((prev) => {
        if (prev && prev !== displayUrl && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return displayUrl;
      });
      setSelectedFileObj(null);
      setSelectedAssetUrl(rawPath);
      setLastUploadedUrl(rawPath);
    } catch (err) {
      console.warn('Failed to persist local upload for preview:', err);
    }
  }, [extractUploadedAssetPath, toDisplayUrl]);

  const buildSeedanceReplayQueuedAsset = useCallback((asset: SeedanceReplayParsedAsset, index: number): QueuedAsset => {
    const mediaKind = asset.mediaKind;
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${index}`,
      name: asset.name,
      previewUrl: URL.createObjectURL(asset.file),
      fileObj: asset.file,
      assetUrl: null,
      assetId: null,
      source: mediaKind === 'image' ? 'product' : 'preference',
      materialType: mediaKind === 'video' ? 'motion' : mediaKind === 'audio' ? 'audio' : 'product',
      isPrimaryFrame: mediaKind === 'image',
      mediaKind,
      durationSeconds: asset.durationSeconds,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      width: asset.width,
      height: asset.height,
      fps: asset.fps,
      validationMessages: [],
      uploadedPath: null,
    };
  }, []);

  const applySelectedUploadType = (files: File[], selectedType: AssetLibraryTab) => {
    if (files.length === 0) return;

    const latestFile = files[files.length - 1];
    const mediaKind = inferMediaKind({ name: latestFile.name, file: latestFile });
    const source: QueuedAsset['source'] = mediaKind === 'video'
      ? 'preference'
      : (isKlingOmniMode ? suggestKlingImageSourceForMode(assetQueue) : 'product');
    const latestItem: QueuedAsset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-0`,
      name: latestFile.name,
      previewUrl: URL.createObjectURL(latestFile),
      fileObj: latestFile,
      assetUrl: null,
      source,
      materialType: selectedType,
      isPrimaryFrame: mediaKind === 'image',
      mediaKind,
      uploadedPath: null,
    };
    const queueId = latestItem.id;

    setUploadedFile((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return latestItem.previewUrl;
    });
    setFileName(latestItem.name);
    setSelectedFileObj(latestItem.fileObj || null);
    setSelectedAssetSource(latestItem.source);
    setSelectedAssetUrl(null);
    setSelectedQueueAssetId(latestItem.id);
    setCurrentMaterialType(latestItem.materialType || null);
    setGeneratedVideoUrl(null);
    setLastUploadedUrl(null);

    setAssetQueue((prev) => {
      const next = isKlingOmniMode ? [...prev, latestItem] : prev.filter((item) => item.materialType !== selectedType).concat(latestItem);
      return normalizeQueueSourcesForKlingMode(next, klingGenerateMode);
    });

    void persistLocalQueuedAsset(queueId, latestFile, latestItem.previewUrl || '', true);
  };

  const handleLocalFiles = async (files: File[]) => {
    if (files.length === 0) return;

    const errors: string[] = [];
    const validFiles: File[] = [];

    for (const file of files) {
      const err = validateUploadFile(file);
      if (err) {
        errors.push(err);
      } else {
        const processedFile = await compressImage(file);
        validFiles.push(processedFile);
      }
    }

    if (errors.length > 0) {
      openInfo(
        (t as any).assets_upload_formats_title || '提示',
        `${errors.join('\n')}\n\n${(t as any).assets_upload_formats_title || '支持格式'}：${formatHint}`
      );
    }

    if (validFiles.length === 0) return;

    const isKlingBatchUpload = selectedModel === 'kling' && validFiles.length > 1;
    if (!isKlingBatchUpload) {
      const firstMediaKind = inferMediaKind({ name: validFiles[0].name, file: validFiles[0] });
      const defaultType = firstMediaKind === 'video' ? 'motion' : firstMediaKind === 'audio' ? 'audio' : 'product';
      applySelectedUploadType(validFiles, defaultType);
      return;
    }

    const imageFiles = validFiles.filter((file) => inferMediaKind({ name: file.name, file }) === 'image');
    const ignoredNonImageCount = validFiles.length - imageFiles.length;
    if (imageFiles.length === 0) {
      openInfo(
        popupTitles.notice,
        `可灵批量本地上传仅支持图片，已忽略 ${ignoredNonImageCount} 个非图片文件。`
      );
      return;
    }

    const normalizedExistingImages = normalizeQueueSourcesForKlingMode(
      assetQueue.filter((asset) => asset.mediaKind === 'image'),
      klingGenerateMode
    );
    const firstFrameCount = normalizedExistingImages.filter((asset) => asset.source === 'product').length;
    const tailFrameCount = normalizedExistingImages.filter((asset) => asset.source === 'tail').length;
    const subjectCount = normalizedExistingImages.filter((asset) => asset.source === 'subject').length;
    const referenceCount = normalizedExistingImages.filter((asset) => asset.source === 'preference').length;
    const totalLimit = klingGenerateMode === 'subject' ? 4 : klingGenerateMode === 'first_last_frame' ? 3 : 7;
    const remainingCapacity = Math.max(0, totalLimit - normalizedExistingImages.length);
    const acceptedFiles = imageFiles.slice(0, remainingCapacity);
    const overflowCount = Math.max(0, imageFiles.length - acceptedFiles.length);

    if (acceptedFiles.length === 0) {
      const details: string[] = ['当前可灵槽位已满，未导入新的图片。'];
      if (ignoredNonImageCount > 0) details.push(`已忽略 ${ignoredNonImageCount} 个非图片文件。`);
      openInfo(popupTitles.notice, details.join('\n'));
      return;
    }

    let nextNeedsPrimary = klingGenerateMode === 'first_frame' && firstFrameCount === 0;
    let nextNeedsTail = klingGenerateMode === 'first_last_frame' && tailFrameCount === 0 && firstFrameCount > 0;
    let nextNeedsSubject = klingGenerateMode === 'subject' && subjectCount === 0;
    const nextItems: QueuedAsset[] = acceptedFiles.map((file, index) => {
      let source: QueuedAsset['source'] = 'preference';
      if (klingGenerateMode === 'subject') {
        const draftAsset: QueuedAsset = {
          id: `local-subject-draft-${Date.now()}-${index}`,
          name: file.name,
          previewUrl: '',
          fileObj: file,
          assetUrl: null,
          source: 'subject',
          materialType: 'product',
          isPrimaryFrame: false,
          mediaKind: 'image',
          uploadedPath: null,
        };
        if (nextNeedsSubject && canBeKlingSubject(draftAsset)) {
          source = 'subject';
          nextNeedsSubject = false;
        } else {
          source = 'preference';
        }
      } else if (nextNeedsPrimary) {
        source = 'product';
        nextNeedsPrimary = false;
      } else if (nextNeedsTail) {
        source = 'tail';
        nextNeedsTail = false;
      }

      const previewUrl = URL.createObjectURL(file);
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${index}`,
        name: file.name,
        previewUrl,
        fileObj: file,
        assetUrl: null,
        source,
        materialType: 'product',
        isPrimaryFrame: source === 'product',
        mediaKind: 'image',
        uploadedPath: null,
      };
    });

    const normalizedNextQueue = normalizeQueueSourcesForKlingMode([...assetQueue, ...nextItems], klingGenerateMode);
    const selectedItem = nextItems[nextItems.length - 1];

    setAssetQueue(normalizedNextQueue);
    setSelectedQueueAssetId(selectedItem.id);
    setUploadedFile(selectedItem.previewUrl);
    setFileName(selectedItem.name);
    setSelectedFileObj(selectedItem.fileObj || null);
    setSelectedAssetSource(selectedItem.source);
    setSelectedAssetUrl(null);
    setCurrentMaterialType(selectedItem.materialType || null);
    setGeneratedVideoUrl(null);
    setLastUploadedUrl(null);

    nextItems.forEach((item) => {
      if (!item.fileObj) return;
      void persistLocalQueuedAsset(item.id, item.fileObj, item.previewUrl || '', item.id === selectedItem.id);
    });

    const summaryLines = [`已导入 ${acceptedFiles.length} 张图片。`];
    if (ignoredNonImageCount > 0) summaryLines.push(`已忽略 ${ignoredNonImageCount} 个非图片文件。`);
    if (overflowCount > 0) summaryLines.push(`因当前模式槽位不足，已忽略 ${overflowCount} 张图片。`);
    openInfo(popupTitles.notice, summaryLines.join('\n'));
    return;

  };

  const markQueueAssetAsPrimaryFrame = (targetId: string) => {
    const target = assetQueue.find((item) => item.id === targetId);
    if (!target) return;
    if (target.mediaKind !== 'image') {
      openInfo(popupTitles.notice, t.wb_popup_only_image_first_frame);
      return;
    }
    if (isKlingOmniMode && klingGenerateMode === 'subject' && !canBeKlingSubject(target)) {
      handleInvalidKlingSubjectTarget(target);
      return;
    }

    const primarySource: QueuedAsset['source'] = isKlingOmniMode
      ? (klingGenerateMode === 'subject' ? 'subject' : 'product')
      : 'product';

    if (isKlingOmniMode) {
      applyKlingPrimarySelection(targetId, primarySource);
      return;
    }

    setAssetQueue(prev => prev.map(item => ({
      ...item,
      isPrimaryFrame: item.id === targetId,
      source: item.id === targetId ? 'product' : item.source,
    })));
    selectAssetFromQueue({ ...target, source: 'product', isPrimaryFrame: true });
  };

  const handleWorkbenchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleLocalFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resolveTransferStationItemFromDrag = (e: React.DragEvent): TransferStationItem | null => {
    const supportsTransferStation = e.dataTransfer.types?.includes(TRANSFER_STATION_DRAG_MIME);
    if (!supportsTransferStation) return null;

    const raw = e.dataTransfer.getData(TRANSFER_STATION_DRAG_MIME);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as Partial<TransferStationItem>;
      const droppedItemId = String(parsed?.id || '').trim();
      if (!droppedItemId) return null;
      return transferStationItems.find((item) => item.id === droppedItemId) || null;
    } catch {
      return null;
    }
  };

  const handleUploadDragOver = (e: React.DragEvent) => {
    const supportsFiles = e.dataTransfer.types?.includes('Files');
    const supportsTransferStation = e.dataTransfer.types?.includes(TRANSFER_STATION_DRAG_MIME);
    if (!supportsFiles && !supportsTransferStation) return;
    e.preventDefault();
    setIsDragUploadActive(true);
  };

  const handleUploadDragLeave = (e: React.DragEvent) => {
    const supportsFiles = e.dataTransfer.types?.includes('Files');
    const supportsTransferStation = e.dataTransfer.types?.includes(TRANSFER_STATION_DRAG_MIME);
    if (!supportsFiles && !supportsTransferStation) return;
    e.preventDefault();
    setIsDragUploadActive(false);
  };

  const handleUploadDrop = (e: React.DragEvent) => {
    const supportsFiles = e.dataTransfer.types?.includes('Files');
    const supportsTransferStation = e.dataTransfer.types?.includes(TRANSFER_STATION_DRAG_MIME);
    if (!supportsFiles && !supportsTransferStation) return;
    e.preventDefault();
    setIsDragUploadActive(false);

    if (supportsTransferStation) {
      const droppedItem = resolveTransferStationItemFromDrag(e);
      if (droppedItem) {
        applyTransferStationItemToWorkbench(droppedItem);
        return;
      }
    }

    if (!supportsFiles) return;
    const files = Array.from(e.dataTransfer.files || []);
    handleLocalFiles(files);
  };

  const handleScriptDragOver = (e: React.DragEvent) => {
    const supportsTransferStation = e.dataTransfer.types?.includes(TRANSFER_STATION_DRAG_MIME);
    if (!supportsTransferStation) return;
    e.preventDefault();
    setIsScriptDropActive(true);
  };

  const handleScriptDragLeave = (e: React.DragEvent) => {
    const supportsTransferStation = e.dataTransfer.types?.includes(TRANSFER_STATION_DRAG_MIME);
    if (!supportsTransferStation) return;
    e.preventDefault();
    setIsScriptDropActive(false);
  };

  const handleScriptDrop = (e: React.DragEvent) => {
    const supportsTransferStation = e.dataTransfer.types?.includes(TRANSFER_STATION_DRAG_MIME);
    if (!supportsTransferStation) return;
    e.preventDefault();
    setIsScriptDropActive(false);

    const droppedItem = resolveTransferStationItemFromDrag(e);
    if (!droppedItem || droppedItem.mediaKind !== 'script') return;
    applyTransferStationItemToWorkbench(droppedItem);
  };

  const removeUpload = (e: React.MouseEvent, assetId?: string) => {
    e.stopPropagation();

    const removeTargetId = assetId || selectedQueueAssetId;
    if (removeTargetId) {
      removeQueuedAssetById(removeTargetId);
      return;
    }

    revokeBlobUrl(uploadedFile);
    clearWorkbenchAssetSelection();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getScriptsForPageEdit = (pageIndex: number): ScriptItem[] => (
    pageIndex === activeScriptPage ? scripts : (scriptPages[pageIndex]?.scripts || [])
  );

  const updateScriptPageMetaAt = (pageIndex: number, updater: (page: ScriptPage) => ScriptPage) => {
    setScriptPages((prev) => {
      if (pageIndex < 0 || pageIndex >= prev.length) return prev;
      const next = [...prev];
      next[pageIndex] = updater(next[pageIndex]);
      return next;
    });
  };

  const updateScriptPageScriptsAt = (pageIndex: number, newScripts: ScriptItem[]) => {
    isDemoScriptsRef.current = false;
    if (pageIndex === activeScriptPage) {
      setScripts(newScripts);
    }
    setScriptPages((prev) => {
      if (pageIndex < 0 || pageIndex >= prev.length) return prev;
      const next = [...prev];
      next[pageIndex] = { ...next[pageIndex], scripts: newScripts };
      return next;
    });
  };

  const updateScriptPageNameAt = (pageIndex: number, value: string) => {
    updateScriptPageMetaAt(pageIndex, (page) => ({
      ...page,
      name: value,
    }));
  };

  const updateScriptPageCreativeCardTextAt = (pageIndex: number, value: string) => {
    updateScriptPageMetaAt(pageIndex, (page) => ({
      ...page,
      creativeCardText: value,
    }));
  };

  const handleDurationChangeForPage = (pageIndex: number, id: number, newValue: string) => {
    const raw = newValue.trim();
    if (!raw) return;
    const num = Number(raw);
    if (!Number.isFinite(num)) return;

    const pageScripts = getScriptsForPageEdit(pageIndex);
    const idx = pageScripts.findIndex(s => s.id === id);
    if (idx < 0) return;

    const n = pageScripts.length;
    const minFloor = 1; // 0.1s in tenths
    const targetTenths = Math.max(n * minFloor, Math.round((Number(genDuration) || 1) * 10));

    // 单镜头：锁定为 genDuration，保持 sum == genDuration
    if (n === 1) {
      updateScriptPageScriptsAt(pageIndex, [{ ...pageScripts[0], dur: tenthsToDur(targetTenths) }]);
      return;
    }

    // 把被改镜头 clamp 到 [0.1s, genDuration - 其它镜头最小占用]
    const othersMinSum = (n - 1) * minFloor;
    const maxNewTenths = Math.max(minFloor, targetTenths - othersMinSum);
    const rawNewTenths = Math.round(Math.max(0.1, num) * 10);
    const newDurTenths = Math.min(Math.max(rawNewTenths, minFloor), maxNewTenths);

    // 剩余 targetTenths - newDurTenths 按原比例分给其他镜头
    const otherWeights = pageScripts.filter((_, i) => i !== idx).map(s => durToTenths(s.dur));
    const otherTargetTotal = targetTenths - newDurTenths;
    const distributedOthers = distributeTenthsProportional(otherWeights, otherTargetTotal, minFloor);

    let j = 0;
    const next = pageScripts.map((s, i) => {
      if (i === idx) return { ...s, dur: tenthsToDur(newDurTenths) };
      const d = distributedOthers[j];
      j += 1;
      return { ...s, dur: tenthsToDur(d) };
    });
    updateScriptPageScriptsAt(pageIndex, next);
  };

  const handleScriptTypeChangeForPage = (pageIndex: number, id: number, newType: string) => {
    const normalizedType = newType.trim() || 'Medium';
    const pageScripts = getScriptsForPageEdit(pageIndex);
    const newScripts = pageScripts.map((item) => (item.id === id ? { ...item, type: normalizedType } : item));
    updateScriptPageScriptsAt(pageIndex, newScripts);
  };

  // 台词翻译处理（直接翻译 / 创意翻译）
  const handleTranslateShotForPage = async (pageIndex: number, script: ScriptItem, index: number, mode: 'direct' | 'creative') => {
    if (!script.audioTranslation?.trim() || !user?.id) return;
    setTranslatingShots(prev => ({ ...prev, [script.id]: true }));
    try {
      const resp = await videoApi.translateAudioText(user.id, {
        text: script.audioTranslation,
        target_language: targetLanguage,
        mode,
        visual_description: script.visual,
        product_category: productCategory,
        product_selling_points: coreSellingPoints,
      });
      if (resp.code === 0 && resp.data?.translated_text) {
        const ns = [...getScriptsForPageEdit(pageIndex)];
        ns[index].audio = resp.data.translated_text;
        updateScriptPageScriptsAt(pageIndex, ns);
      }
    } catch (err) {
      console.error('[handleTranslateShot] 翻译失败:', err);
    } finally {
      setTranslatingShots(prev => ({ ...prev, [script.id]: false }));
    }
  };

  const updateScripts = (newScripts: ScriptItem[]) => {
    updateScriptPageScriptsAt(activeScriptPage, newScripts);
  };

  // 不变量：只要开着分镜编辑器，每一页分镜的 Σdur 必须恒等于 genDuration。
  // addScript / removeScript / handleDurationChange / ShotTimelineBar 里
  // insert / delete / drag 经过前面改造后全部输出严格对齐状态，对普通编辑都是 no-op。
  // 会真正触发 rescale 的只有：
  //   1) 用户改 genDuration 滑块 / 下拉；
  //   2) 切换 scriptPage（旧对齐的目标总时长已变）；
  //   3) LLM 脚本生成返回 Σdur drift；
  //   4) 工作区 / 模板恢复出来 Σdur 与 genDuration 不符。
  useEffect(() => {
    if (!enableStoryboardEditor) return;
    const rescalePageScripts = (pageScripts: ScriptItem[]): ScriptItem[] => {
      if (!pageScripts || pageScripts.length === 0) return pageScripts;
      const pageTarget = Math.max(pageScripts.length, Math.round((Number(genDuration) || 1) * 10));
      const currentTenths = pageScripts.reduce((sum, s) => sum + durToTenths(s.dur), 0);
      if (currentTenths === pageTarget) return pageScripts;
      const weights = pageScripts.map((s) => durToTenths(s.dur));
      const distributed = distributeTenthsProportional(weights, pageTarget, 1);
      return pageScripts.map((s, i) => ({ ...s, dur: tenthsToDur(distributed[i]) }));
    };

    const newActiveScripts = rescalePageScripts(scripts);
    const activeChanged = newActiveScripts !== scripts;
    if (activeChanged) setScripts(newActiveScripts);

    setScriptPages((prev) => {
      let changed = false;
      const next = prev.map((page, i) => {
        if (i === activeScriptPage) {
          if (activeChanged) {
            changed = true;
            return { ...page, scripts: newActiveScripts };
          }
          return page;
        }
        const original = page.scripts || [];
        const rescaled = rescalePageScripts(original);
        if (rescaled !== original) {
          changed = true;
          return { ...page, scripts: rescaled };
        }
        return page;
      });
      return changed ? next : prev;
    });
  }, [genDuration, enableStoryboardEditor, scripts, scriptPages, activeScriptPage]);

  const removeScriptPage = (index: number) => {
    if (scriptPages.length <= 1) return;
    setScriptPages(prev => {
      const next = prev.filter((_, i) => i !== index);
      const newActive = index < activeScriptPage
        ? activeScriptPage - 1
        : index === activeScriptPage
          ? Math.min(activeScriptPage, next.length - 1)
          : activeScriptPage;
      setActiveScriptPage(newActive);
      setScripts(next[newActive]?.scripts || []);
      return next;
    });
  };

  const addScriptPage = () => {
    const nextIndex = scriptPages.length;
    const nextPage: ScriptPage = {
      id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${t.wb_script_page_prefix} ${nextIndex + 1}`,
      scripts: [],
      fullScript: '',
      creativeCardText: '',
    };

    setScriptPages((prev) => {
      const next = [...prev];
      if (activeScriptPage >= 0 && activeScriptPage < next.length) {
        next[activeScriptPage] = { ...next[activeScriptPage], scripts };
      }
      return [...next, nextPage];
    });
    setActiveScriptPage(nextIndex);
    setScripts([]);
    setIsShotBreakdownOpen(false);
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

  const cardLabels = useMemo(() => {
    const lang = String(language || 'en').toLowerCase();
    if (lang.startsWith('zh')) {
      return {
        style: '风格',
        environment: '环境',
        tonePacing: '语调与节奏',
        camera: '镜头',
        lighting: '光线',
        actions: '动作',
        backgroundSound: '背景音',
        transitionEditing: '转场 / 剪辑',
        callToAction: '行动号召',
      };
    }
    if (lang.startsWith('ko')) {
      return {
        style: '스타일',
        environment: '환경',
        tonePacing: '톤 & 페이싱',
        camera: '카메라',
        lighting: '조명',
        actions: '액션',
        backgroundSound: '배경음',
        transitionEditing: '전환 / 편집',
        callToAction: '콜 투 액션',
      };
    }
    if (lang.startsWith('vi')) {
      return {
        style: 'Phong cách',
        environment: 'Bối cảnh',
        tonePacing: 'Tông & Nhịp độ',
        camera: 'Máy quay',
        lighting: 'Ánh sáng',
        actions: 'Hành động',
        backgroundSound: 'Âm thanh nền',
        transitionEditing: 'Chuyển cảnh / Dựng',
        callToAction: 'Kêu gọi hành động',
      };
    }
    if (lang.startsWith('ms')) {
      return {
        style: 'Gaya',
        environment: 'Persekitaran',
        tonePacing: 'Nada & Rentak',
        camera: 'Kamera',
        lighting: 'Pencahayaan',
        actions: 'Aksi',
        backgroundSound: 'Bunyi Latar',
        transitionEditing: 'Peralihan / Suntingan',
        callToAction: 'Seruan Tindakan',
      };
    }
    return {
      style: 'Style',
      environment: 'Environment',
      tonePacing: 'Tone & Pacing',
      camera: 'Camera',
      lighting: 'Lighting',
      actions: 'Actions',
      backgroundSound: 'Background Sound',
      transitionEditing: 'Transition / Editing',
      callToAction: 'Call to Action',
    };
  }, [language]);

  const cardThemeClass = useMemo(() => {
    if (isLightTheme) {
      return {
        shell: 'rounded-2xl px-0 py-0 text-slate-800',
        panel: 'rounded-xl border border-slate-300/85 bg-white/90 p-1.5',
        row: 'flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100/85 border border-transparent focus-within:border-purple-300/60 focus-within:bg-purple-50/35',
        actionsBlock: 'rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100/85 border border-transparent focus-within:border-purple-300/60 focus-within:bg-purple-50/35',
        actionIndex: 'mt-0.5 text-[11px] font-semibold text-slate-600',
        label: 'font-semibold text-slate-800 tracking-tight',
        input: 'mt-0.5 w-full min-h-[28px] rounded-md border border-slate-300 bg-white px-2 py-1 text-[12px] leading-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400/40 resize-y custom-scroll',
        actionItem: 'rounded-md border border-slate-300 bg-white p-1',
        actionInput: 'w-full min-h-[28px] rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] leading-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400/30 resize-y custom-scroll',
        button: 'text-[11px] px-2 py-0.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition',
        dangerButton: 'text-[11px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-600 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition',
        subLabel: 'shrink-0 mt-0.5 text-[10px] leading-4 font-semibold text-emerald-800 border border-emerald-300 bg-emerald-50 rounded-full px-2 py-0.5',
        textarea: 'flex-1 bg-transparent border-0 p-0 text-[12px] leading-5 focus:outline-none resize-none text-slate-800 placeholder:text-slate-400',
      };
    }
    if (isDimTheme) {
      return {
        shell: 'rounded-2xl px-0 py-0 text-slate-100',
        panel: 'rounded-xl border border-slate-500/35 bg-slate-950/80 p-1.5',
        row: 'flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-800/55 border border-transparent focus-within:border-emerald-400/45 focus-within:bg-emerald-500/10',
        actionsBlock: 'rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-800/55 border border-transparent focus-within:border-emerald-400/45 focus-within:bg-emerald-500/10',
        actionIndex: 'mt-0.5 text-[11px] font-semibold text-slate-400',
        label: 'font-semibold text-slate-100 tracking-tight',
        input: 'mt-0.5 w-full min-h-[28px] rounded-md border border-slate-500/40 bg-slate-800/70 px-2 py-1 text-[12px] leading-4 text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300/30 resize-y custom-scroll',
        actionItem: 'rounded-md border border-slate-500/40 bg-slate-800/70 p-1',
        actionInput: 'w-full min-h-[28px] rounded-md border border-slate-500/30 bg-slate-900/60 px-2 py-1 text-[12px] leading-4 text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300/25 resize-y custom-scroll',
        button: 'text-[11px] px-2 py-0.5 rounded-md border border-slate-400/40 bg-slate-700/60 text-slate-100 hover:bg-slate-700/80 transition',
        dangerButton: 'text-[11px] px-1.5 py-0.5 rounded border border-slate-400/40 text-slate-300 hover:text-red-300 hover:border-red-300/40 hover:bg-red-500/10 transition',
        subLabel: 'shrink-0 mt-0.5 text-[10px] leading-4 font-semibold text-emerald-300 border border-emerald-400/40 bg-emerald-500/10 rounded-full px-2 py-0.5',
        textarea: 'flex-1 bg-slate-950/55 border-0 rounded-lg p-2 text-[12px] leading-5 focus:outline-none resize-none text-slate-100 placeholder:text-slate-500',
      };
    }
    return {
      shell: 'rounded-2xl px-0 py-0 text-zinc-100',
      panel: 'rounded-xl border border-zinc-600/40 bg-zinc-950/85 p-1.5',
      row: 'flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5 border border-transparent focus-within:border-emerald-400/40 focus-within:bg-emerald-500/10',
      actionsBlock: 'rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5 border border-transparent focus-within:border-emerald-400/40 focus-within:bg-emerald-500/10',
      actionIndex: 'mt-0.5 text-[11px] font-semibold text-zinc-400',
      label: 'font-semibold text-zinc-100 tracking-tight',
      input: 'mt-0.5 w-full min-h-[28px] rounded-md border border-zinc-600 bg-zinc-800/80 px-2 py-1 text-[12px] leading-4 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-300/25 resize-y custom-scroll',
      actionItem: 'rounded-md border border-zinc-600 bg-zinc-800/80 p-1',
      actionInput: 'w-full min-h-[28px] rounded-md border border-zinc-500/60 bg-zinc-900/70 px-2 py-1 text-[12px] leading-4 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-300/20 resize-y custom-scroll',
      button: 'text-[11px] px-2 py-0.5 rounded-md border border-zinc-500 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition',
      dangerButton: 'text-[11px] px-1.5 py-0.5 rounded border border-zinc-500 text-zinc-300 hover:text-red-300 hover:border-red-300/40 hover:bg-red-500/10 transition',
      subLabel: 'shrink-0 mt-0.5 text-[10px] leading-4 font-semibold text-emerald-300 border border-emerald-400/35 bg-emerald-500/10 rounded-full px-2 py-0.5',
      textarea: 'flex-1 bg-zinc-950/60 border-0 rounded-lg p-2 text-[12px] leading-5 focus:outline-none resize-none text-zinc-100 placeholder:text-zinc-500',
    };
  }, [isLightTheme, isDimTheme]);

  const autoResizeCardTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    const areas = document.querySelectorAll<HTMLTextAreaElement>('textarea[data-card-autosize="true"]');
    areas.forEach((el) => autoResizeCardTextarea(el));
  }, [activeScriptPage, scriptPages]);

  const addScriptToPage = (pageIndex: number) => {
    const pageScripts = getScriptsForPageEdit(pageIndex);
    const newId = pageScripts.length > 0 ? Math.max(...pageScripts.map(s => s.id)) + 1 : 1;
    // 空状态：第一个镜头直接等于用户所选 genDuration，让总时长立刻对齐
    if (pageScripts.length === 0) {
      const targetTenths = Math.max(1, Math.round((Number(genDuration) || 1) * 10));
      updateScriptPageScriptsAt(pageIndex, [{
        id: newId,
        shot: '1',
        type: 'Medium',
        dur: tenthsToDur(targetTenths),
        visual: '',
        audio: '',
        audioTranslation: '',
      }]);
      return;
    }
    // 非空：对最后一个镜头做「对半分裂」，保持总时长不变
    const lastIdx = pageScripts.length - 1;
    const lastTenths = durToTenths(pageScripts[lastIdx].dur);
    if (lastTenths < 2) {
      openInfo(popupTitles.notice, t.wb_shot_timeline_insert_too_short || '当前镜头过短，无法分裂');
      return;
    }
    const frontTenths = Math.floor(lastTenths / 2);
    const backTenths = lastTenths - frontTenths;
    const next = pageScripts.map((s, i) =>
      i === lastIdx ? { ...s, dur: tenthsToDur(frontTenths) } : s
    );
    next.push({
      id: newId,
      shot: (pageScripts.length + 1).toString(),
      type: 'Medium',
      dur: tenthsToDur(backTenths),
      visual: '',
      audio: '',
      audioTranslation: '',
    });
    updateScriptPageScriptsAt(pageIndex, next);
  };

  const removeScriptFromPage = (pageIndex: number, id: number) => {
    const pageScripts = getScriptsForPageEdit(pageIndex);
    const index = pageScripts.findIndex(s => s.id === id);
    if (index < 0) return;
    if (pageScripts.length === 1) {
      updateScriptPageScriptsAt(pageIndex, []);
      return;
    }
    // Preserve total duration: redistribute deleted shot's dur 50/50 to adjacent neighbors.
    // Edge shots (first/last) give 100% to their single neighbor.
    const deletedTenths = durToTenths(pageScripts[index].dur);
    const leftShare = Math.floor(deletedTenths / 2);
    const rightShare = deletedTenths - leftShare;
    const isFirst = index === 0;
    const isLast = index === pageScripts.length - 1;
    const filtered = pageScripts.filter((_, i) => i !== index);
    const redistributed = filtered.map((s, i) => {
      if (isFirst) {
        return i === 0 ? { ...s, dur: tenthsToDur(durToTenths(s.dur) + deletedTenths) } : s;
      }
      if (isLast) {
        return i === filtered.length - 1 ? { ...s, dur: tenthsToDur(durToTenths(s.dur) + deletedTenths) } : s;
      }
      if (i === index - 1) return { ...s, dur: tenthsToDur(durToTenths(s.dur) + leftShare) };
      if (i === index) return { ...s, dur: tenthsToDur(durToTenths(s.dur) + rightShare) };
      return s;
    });
    const remaining = redistributed.map((s, idx) => ({ ...s, shot: (idx + 1).toString() }));
    updateScriptPageScriptsAt(pageIndex, remaining);
  };

  const addCurrentAssetToQueue = () => {
    if (!selectedFileObj && !selectedAssetUrl && !uploadedFile) {
      openInfo(popupTitles.notice, t.wb_popup_choose_or_upload_asset);
      return;
    }
    const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const previewUrl = uploadedFile || selectedAssetUrl || null;
    const name = fileName || '未命名素材';
    const mediaKind = inferMediaKind({ name, url: previewUrl, file: selectedFileObj });

    const nextMaterialType: AssetLibraryTab = currentAssetMediaKind === 'video'
      ? 'motion'
      : currentAssetMediaKind === 'audio'
        ? 'audio'
        : (currentMaterialType || 'product');
    const nextItem: QueuedAsset = {
      id: newId,
      name,
      previewUrl,
      fileObj: selectedFileObj,
      assetUrl: selectedAssetUrl,
      assetId: null,
      source: selectedAssetSource || (selectedFileObj ? 'product' : 'preference'),
      materialType: nextMaterialType,
      isPrimaryFrame: mediaKind === 'image',
      mediaKind,
      uploadedPath: null
    };

    setAssetQueue(prev => {
      const next = isKlingOmniMode ? [...prev, nextItem] : prev.filter(item => item.materialType !== nextMaterialType).concat(nextItem);
      return normalizeQueueSourcesForKlingMode(next, klingGenerateMode);
    });
    setSelectedQueueAssetId(newId);

    setUploadedFile(null);
    setSelectedFileObj(null);
    setFileName('');
    setSelectedAssetUrl(null);
    setSelectedAssetSource(null);
    setLastUploadedUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearWorkbenchAssetSelection = useCallback(() => {
    setSelectedQueueAssetId(null);
    setUploadedFile(null);
    setSelectedFileObj(null);
    setFileName('');
    setSelectedAssetUrl(null);
    setLastUploadedUrl(null);
    setSelectedAssetSource(null);
    setCurrentMaterialType(null);
    setGeneratedVideoUrl(null);
  }, []);

  const applyWorkbenchAssetSelection = useCallback((asset: QueuedAsset | null) => {
    if (!asset) {
      clearWorkbenchAssetSelection();
      return;
    }

    setSelectedQueueAssetId(asset.id);
    setUploadedFile(asset.previewUrl || null);
    setFileName(asset.name || '');
    setSelectedFileObj(asset.fileObj || null);
    setSelectedAssetUrl(asset.assetUrl || null);
    setLastUploadedUrl(asset.uploadedPath || asset.assetUrl || null);
    setSelectedAssetSource(asset.source || null);
    setCurrentMaterialType(asset.materialType || null);
    setGeneratedVideoUrl(null);
  }, [clearWorkbenchAssetSelection]);

  useEffect(() => {
    if (!isSeedanceReplayMode) return;

    if (assetQueue.length > 0) {
      let hasVideo = false;
      const allowedQueue = assetQueue.filter((asset) => {
        if (asset.mediaKind === 'image') return true;
        if (asset.mediaKind === 'video' && !hasVideo) {
          hasVideo = true;
          return true;
        }
        return false;
      });

      if (allowedQueue.length !== assetQueue.length) {
        setAssetQueue(allowedQueue);
        if (!selectedQueueAssetId || !allowedQueue.some((asset) => asset.id === selectedQueueAssetId)) {
          applyWorkbenchAssetSelection(allowedQueue[0] || null);
        }
      }
      return;
    }

    if (uploadedFile && currentAssetMediaKind === 'audio') {
      clearWorkbenchAssetSelection();
    }
  }, [
    applyWorkbenchAssetSelection,
    assetQueue,
    clearWorkbenchAssetSelection,
    currentAssetMediaKind,
    currentMaterialType,
    isSeedanceReplayMode,
    selectedQueueAssetId,
    uploadedFile,
  ]);

  const removeQueuedAssetById = useCallback((id: string) => {
    const removedAsset = assetQueue.find((asset) => asset.id === id) || null;
    const nextQueue = assetQueue.filter((asset) => asset.id !== id);
    setAssetQueue(nextQueue);

    const preservedSelection = selectedQueueAssetId && selectedQueueAssetId !== id
      ? nextQueue.find((asset) => asset.id === selectedQueueAssetId) || null
      : null;
    applyWorkbenchAssetSelection(preservedSelection || nextQueue[0] || null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (seedanceReplayFileInputRef.current) {
      seedanceReplayFileInputRef.current.value = '';
    }
    revokeBlobUrl(removedAsset?.previewUrl);
  }, [applyWorkbenchAssetSelection, assetQueue, selectedQueueAssetId]);

  const removeAssetFromQueue = (id: string) => {
    removeQueuedAssetById(id);
  };

  const selectAssetFromQueue = (asset: QueuedAsset) => {
    applyWorkbenchAssetSelection(asset);
  };

  const openSeedanceReplayLocalPicker = useCallback((intent: SeedanceReplayUploadIntent) => {
    setSeedanceReplayUploadIntent(intent);
    if (!seedanceReplayFileInputRef.current) return;
    seedanceReplayFileInputRef.current.value = '';
    seedanceReplayFileInputRef.current.multiple = true;
    seedanceReplayFileInputRef.current.accept = getSeedanceReplayLocalAccept(intent.targetMediaKind, { allowAudio: !isSeedanceReplayMode });
    seedanceReplayFileInputRef.current.click();
  }, [isSeedanceReplayMode]);

  const handleSeedanceReplayOpenLibrary = useCallback(() => {
    const intent = getSeedanceReplayLibraryIntent(null);
    setSeedanceReplayLibraryIntent(intent);
    setAssetLibraryPickMode('default');
    setAssetLibraryTab(intent.preferredTab);
    setAssetLibraryCurrentFolderId(null);
    setIsAssetLibraryOpen(true);
  }, [getSeedanceReplayLibraryIntent]);

  const handleSeedanceReplayPreview = useCallback((assetId: string) => {
    const target = uploadDisplayAssets.find((asset) => asset.id === assetId);
    if (!target) return;
    setSeedanceReplayPreviewAsset(target);
  }, [uploadDisplayAssets]);

  const handleSeedanceReplayRemove = useCallback((assetId: string) => {
    removeQueuedAssetById(assetId);
  }, [removeQueuedAssetById]);

  const seedanceReplayPreviewSrc = seedanceReplayPreviewAsset
    ? (
      seedanceReplayPreviewAsset.previewUrl
      || toDisplayUrl(seedanceReplayPreviewAsset.assetUrl || seedanceReplayPreviewAsset.uploadedPath)
      || seedanceReplayPreviewAsset.assetUrl
      || seedanceReplayPreviewAsset.uploadedPath
      || null
    )
    : null;

  const handleSeedanceReplayLocalFiles = useCallback(async (files: File[], intent: SeedanceReplayUploadIntent) => {
    if (files.length === 0) return;

    const errors: string[] = [];
    const parsedAssets: SeedanceReplayParsedAsset[] = [];
    for (const file of files) {
      try {
        const parsedAsset = await parseSeedanceReplayLocalFile(file, {
          inferMediaKind,
          compressImage,
        }, t);
        if (isSeedanceReplayMode && parsedAsset.mediaKind === 'audio') {
          errors.push(t.wb_replay_error_audio_not_supported || 'Audio assets are not supported in viral recreate mode.');
          continue;
        }
        if (intent.targetMediaKind && parsedAsset.mediaKind !== intent.targetMediaKind) {
          const kindLabel = intent.targetMediaKind === 'image'
            ? (t.wb_seedance_replay_media_image || 'Image')
            : intent.targetMediaKind === 'video'
              ? (t.wb_seedance_replay_media_video || 'Video')
              : (t.wb_seedance_replay_media_audio || 'Audio');
          errors.push(formatMessage(
            t.wb_seedance_replay_notice_upload_kind_only || 'This entry only supports uploading {kind}: {name}',
            { kind: kindLabel, name: file.name },
          ));
          continue;
        }
        const validationMessage = validateSeedanceReplayParsedAsset(parsedAsset, t);
        if (validationMessage) {
          errors.push(validationMessage);
          continue;
        }
        parsedAssets.push(parsedAsset);
      } catch (error: any) {
        errors.push(error?.message || formatMessage(
          t.wb_seedance_replay_notice_file_process_failed || 'Unable to process file: {name}',
          { name: file.name },
        ));
      }
    }

    const existingCounts = assetQueue.reduce(
      (acc, asset) => {
        if (asset.mediaKind === 'image') acc.image += 1;
        if (asset.mediaKind === 'video') acc.video += 1;
        if (asset.mediaKind === 'audio') acc.audio += 1;
        return acc;
      },
      { image: 0, video: 0, audio: 0 }
    );
    const acceptedAssets: SeedanceReplayParsedAsset[] = [];
    const overflow = { image: 0, video: 0, audio: 0 };

    parsedAssets.forEach((asset) => {
      const limit = asset.mediaKind === 'image'
        ? SEEDANCE_REPLAY_IMAGE_LIMIT
        : asset.mediaKind === 'video'
          ? (isSeedanceReplayMode ? 1 : SEEDANCE_REPLAY_VIDEO_LIMIT)
          : SEEDANCE_REPLAY_AUDIO_LIMIT;

      if (existingCounts[asset.mediaKind] + acceptedAssets.filter((item) => item.mediaKind === asset.mediaKind).length >= limit) {
        overflow[asset.mediaKind] += 1;
        return;
      }
      acceptedAssets.push(asset);
    });

    if (acceptedAssets.length === 0) {
      const summaryLines = [...errors];
      if (overflow.image > 0) summaryLines.push(formatMessage(
        t.wb_seedance_replay_notice_overflow || 'Up to {limit} {kind} assets can be added. Ignored {count}.',
        { limit: SEEDANCE_REPLAY_IMAGE_LIMIT, kind: t.wb_seedance_replay_media_image || 'Image', count: overflow.image },
      ));
      if (overflow.video > 0) summaryLines.push(formatMessage(
        t.wb_seedance_replay_notice_overflow || 'Up to {limit} {kind} assets can be added. Ignored {count}.',
        { limit: isSeedanceReplayMode ? 1 : SEEDANCE_REPLAY_VIDEO_LIMIT, kind: t.wb_seedance_replay_media_video || 'Video', count: overflow.video },
      ));
      if (overflow.audio > 0) summaryLines.push(formatMessage(
        t.wb_seedance_replay_notice_overflow || 'Up to {limit} {kind} assets can be added. Ignored {count}.',
        { limit: SEEDANCE_REPLAY_AUDIO_LIMIT, kind: t.wb_seedance_replay_media_audio || 'Audio', count: overflow.audio },
      ));
      if (summaryLines.length > 0) {
        openInfo(popupTitles.notice, summaryLines.join('\n'));
      }
      return;
    }

    const nextItems = acceptedAssets.map((asset, index) => buildSeedanceReplayQueuedAsset(asset, index));
    const selectedItem = nextItems[nextItems.length - 1];
    setAssetQueue((prev) => [...prev, ...nextItems]);
    applyWorkbenchAssetSelection(selectedItem);
    setLastUploadedUrl(null);

    nextItems.forEach((item) => {
      if (!item.fileObj) return;
      void persistLocalQueuedAsset(item.id, item.fileObj, item.previewUrl || '', item.id === selectedItem.id);
    });

    const summaryLines = [
      ...errors,
      ...(overflow.image > 0 ? [formatMessage(
        t.wb_seedance_replay_notice_overflow || 'Up to {limit} {kind} assets can be added. Ignored {count}.',
        { limit: SEEDANCE_REPLAY_IMAGE_LIMIT, kind: t.wb_seedance_replay_media_image || 'Image', count: overflow.image },
      )] : []),
      ...(overflow.video > 0 ? [formatMessage(
        t.wb_seedance_replay_notice_overflow || 'Up to {limit} {kind} assets can be added. Ignored {count}.',
        { limit: isSeedanceReplayMode ? 1 : SEEDANCE_REPLAY_VIDEO_LIMIT, kind: t.wb_seedance_replay_media_video || 'Video', count: overflow.video },
      )] : []),
      ...(overflow.audio > 0 ? [formatMessage(
        t.wb_seedance_replay_notice_overflow || 'Up to {limit} {kind} assets can be added. Ignored {count}.',
        { limit: SEEDANCE_REPLAY_AUDIO_LIMIT, kind: t.wb_seedance_replay_media_audio || 'Audio', count: overflow.audio },
      )] : []),
    ];
    if (summaryLines.length > 0) {
      openInfo(popupTitles.notice, summaryLines.join('\n'));
    }
  }, [
    applyWorkbenchAssetSelection,
    assetQueue,
    buildSeedanceReplayQueuedAsset,
    compressImage,
    inferMediaKind,
    isSeedanceReplayMode,
    openInfo,
    persistLocalQueuedAsset,
    popupTitles.notice,
    t,
  ]);

  const handleSeedanceReplayFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const intent = seedanceReplayUploadIntent;
    await handleSeedanceReplayLocalFiles(files, intent);
    setSeedanceReplayUploadIntent({ targetMediaKind: null });
    if (seedanceReplayFileInputRef.current) {
      seedanceReplayFileInputRef.current.value = '';
      seedanceReplayFileInputRef.current.accept = getSeedanceReplayLocalAccept(null, { allowAudio: !isSeedanceReplayMode });
    }
  }, [handleSeedanceReplayLocalFiles, isSeedanceReplayMode, seedanceReplayUploadIntent]);

  const klingPrimarySlotAsset = useMemo(
    () => uploadDisplayAssets.find((asset) => klingGenerateMode === 'subject' ? asset.source === 'subject' : asset.source === 'product') || null,
    [uploadDisplayAssets, klingGenerateMode]
  );
  const klingTailSlotAsset = useMemo(
    () => uploadDisplayAssets.find((asset) => asset.source === 'tail') || null,
    [uploadDisplayAssets]
  );
  const klingReferenceSlotAssets = useMemo(
    () => uploadDisplayAssets.filter((asset) => asset.id !== klingPrimarySlotAsset?.id && asset.id !== klingTailSlotAsset?.id),
    [uploadDisplayAssets, klingPrimarySlotAsset, klingTailSlotAsset]
  );
  const klingReferenceLimit = klingGenerateMode === 'subject' ? 3 : 6;
  const isKlingReferenceOverflow = klingReferenceSlotAssets.length > klingReferenceLimit;
  const klingPrimaryCountLabel = `${klingPrimarySlotAsset ? 1 : 0}/1`;
  const klingReferenceCountLabel = `${klingReferenceSlotAssets.length}/${klingReferenceLimit}`;
  const renderUploadAssetCard = useCallback((asset: QueuedAsset, compact = false) => {
    const inQueue = assetQueue.find((item) => item.id === asset.id);
    const selected = selectedQueueAssetId ? selectedQueueAssetId === asset.id : uploadedFile === asset.previewUrl;
    const isKlingPreviewCard = isKlingOmniMode && (klingGenerateMode === 'first_frame' || klingGenerateMode === 'subject');
    const highlighted = isKlingOmniMode
      ? (klingGenerateMode === 'subject'
        ? asset.source === 'subject' || (!asset.source && selected && selectedAssetSource === 'subject')
        : asset.source === 'product' || (!asset.source && selected && selectedAssetSource === 'product'))
      : asset.source === 'product' || (!asset.source && selected && selectedAssetSource === 'product');

    return (
      <div
        key={asset.id}
        role="button"
        tabIndex={0}
        draggable={Boolean(inQueue && asset.mediaKind === 'image')}
        onDragStart={(e) => {
          if (!inQueue) {
            e.preventDefault();
            return;
          }
          handleWorkbenchAssetDragStart(inQueue, e);
        }}
        onDragEnd={clearWorkbenchDragState}
        onClick={(e) => {
          e.stopPropagation();
          if (isKlingPreviewCard) {
            setSeedanceReplayPreviewAsset(inQueue || asset);
            return;
          }
          if (inQueue) {
            selectAssetFromQueue(inQueue);
            return;
          }
          setUploadedFile(asset.previewUrl || null);
          setFileName(asset.name || '');
          setSelectedFileObj(asset.fileObj || null);
          setSelectedAssetUrl(asset.assetUrl || null);
          setSelectedAssetSource(asset.source || null);
          setCurrentMaterialType(asset.materialType || null);
          setSelectedQueueAssetId(null);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          if (isKlingPreviewCard) {
            setSeedanceReplayPreviewAsset(inQueue || asset);
            return;
          }
          if (inQueue) {
            selectAssetFromQueue(inQueue);
            return;
          }
          setUploadedFile(asset.previewUrl || null);
          setFileName(asset.name || '');
          setSelectedFileObj(asset.fileObj || null);
          setSelectedAssetUrl(asset.assetUrl || null);
          setSelectedAssetSource(asset.source || null);
          setCurrentMaterialType(asset.materialType || null);
          setSelectedQueueAssetId(null);
        }}
        className={`group/upload-asset relative w-full rounded-md overflow-visible border text-left transition ${selected ? 'border-orange-500/70 ring-1 ring-orange-500/50' : 'border-white/10 hover:border-white/20'}`}
      >
        {asset.previewUrl ? (asset.mediaKind === 'video' ? (
          <video src={asset.previewUrl} className="w-full h-auto max-h-[240px] object-contain bg-black/40 opacity-80" muted playsInline />
        ) : (
          <img src={asset.previewUrl} className="w-full h-auto max-h-[240px] rounded-md object-contain bg-black/40 opacity-80" alt={asset.name} />
        )) : (
          <div className="w-full h-24 rounded-md flex items-center justify-center text-[10px] text-zinc-500 bg-zinc-800">无预览</div>
        )}
        {(() => {
          const hideMaterialTypeSelect =
            isKlingOmniMode && klingGenerateMode === 'first_last_frame';
          const useKlingImageTagOnly =
            isKlingOmniMode
            && (klingGenerateMode === 'first_frame' || klingGenerateMode === 'subject')
            && asset.mediaKind === 'image';
          const showSubjectBadge =
            isKlingOmniMode &&
            klingGenerateMode === 'subject' &&
            hasSubjectOtherViews(asset) &&
            (asset.materialType === 'product' || asset.materialType === 'model');
          if (!showSubjectBadge && hideMaterialTypeSelect) return null;
          return (
            <div className="absolute top-1 left-1 z-10 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {showSubjectBadge ? (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm">
                  <Layers3 className="h-3 w-3" />
                </span>
              ) : null}
              {!hideMaterialTypeSelect ? (
                <DropdownSelect
                  value={(() => {
                    const fallback = asset.mediaKind === 'video' ? 'motion' : asset.mediaKind === 'audio' ? 'audio' : 'product';
                    const current = asset.materialType || fallback;
                    if (!useKlingImageTagOnly) return current;
                    return (current === 'product' || current === 'model' || current === 'scene') ? current : 'product';
                  })()}
                  options={[
                    { value: 'product', label: t.assets_tab_products || '商品' },
                    { value: 'model', label: materialTypeLabelMap['model'] },
                    { value: 'scene', label: materialTypeLabelMap['scene'] },
                    ...(useKlingImageTagOnly ? [] : [
                      { value: 'motion', label: materialTypeLabelMap['motion'] },
                      { value: 'audio', label: materialTypeLabelMap['audio'] },
                    ]),
                  ]}
                  onChange={(value) => {
                    const newType = value as AssetLibraryTab;
                    setAssetQueue((prev) => {
                      const next = prev.map((item): QueuedAsset =>
                        item.id === asset.id ? { ...item, materialType: newType } : item
                      );
                      return isKlingOmniMode ? normalizeQueueSourcesForKlingMode(next, klingGenerateMode) : next;
                    });
                    if (selectedQueueAssetId === asset.id || uploadedFile === asset.previewUrl) {
                      setCurrentMaterialType(newType);
                    }
                  }}
                  buttonClassName="min-w-[72px] rounded-md border border-white/20 bg-black/55 px-2 py-1 text-[10px] font-semibold text-zinc-100 shadow-sm backdrop-blur-sm hover:border-white/35 hover:bg-black/65"
                  labelClassName="text-[10px] text-zinc-100"
                  iconClassName="h-3 w-3 text-zinc-300"
                  menuClassName="w-[120px] border-white/20 bg-zinc-950/95 z-[260]"
                  optionClassName="text-[11px] font-medium text-zinc-100 hover:bg-white/10"
                  renderInPortal
                />
              ) : null}
            </div>
          );
        })()}
        {!isKlingPreviewCard ? (
          <div className="absolute top-1 right-1 flex items-center gap-1 z-10">
          {!isKlingOmniMode && asset.mediaKind === 'image' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const primarySource: QueuedAsset['source'] = isKlingOmniMode
                  ? (klingGenerateMode === 'subject' ? 'subject' : 'product')
                  : 'product';
                const nextSource: QueuedAsset['source'] = highlighted ? 'preference' : primarySource;

                if (inQueue) {
                  if (isKlingOmniMode && nextSource !== 'preference') {
                    applyKlingPrimarySelection(asset.id, nextSource);
                  } else {
                    setAssetQueue(prev => prev.map((item): QueuedAsset => (
                      item.id === asset.id
                        ? { ...item, source: 'preference', isPrimaryFrame: false }
                        : item
                    )));
                  }
                }

                if (selected) {
                  setSelectedAssetSource(nextSource);
                }
              }}
              className={`rounded border px-1.5 py-0.5 text-[9px] font-bold transition ${highlighted
                ? 'border-orange-500/70 bg-orange-500/20 text-orange-300'
                : 'border-white/20 bg-black/45 text-zinc-200 hover:bg-black/65'
                }`}
            >
              {highlighted
                ? (isKlingOmniMode ? klingRoleLabel(klingGenerateMode === 'subject' ? 'subject' : 'product') : (t.wb_label_first_frame || 'First Frame'))
                : (isKlingOmniMode ? klingRoleLabel('preference') : (t.wb_label_reference_image || 'Reference'))}
            </button>
          )}
          <button onClick={(e) => removeUpload(e, asset.id)} className="p-1 bg-black/50 hover:bg-red-500 rounded text-white transition"><X className="w-2.5 h-2.5" /></button>
          </div>
        ) : null}
        {isKlingPreviewCard ? (
          <div className="absolute top-1 right-1 z-10">
            <button
              type="button"
              onClick={(e) => removeUpload(e, asset.id)}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-red-500/30 bg-red-500/20 text-red-200 transition hover:bg-red-500 hover:text-white"
              aria-label="Delete"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        {!isKlingPreviewCard ? (
          <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent pointer-events-none z-10">
            <p className="text-[9px] text-white truncate drop-shadow-md">{asset.name}</p>
          </div>
        ) : null}
      </div>
    );
  }, [
    applyKlingPrimarySelection,
    assetQueue,
    clearWorkbenchDragState,
    handleWorkbenchAssetDragStart,
    isKlingOmniMode,
    klingGenerateMode,
    materialTypeLabelMap,
    normalizeQueueSourcesForKlingMode,
    removeUpload,
    selectedAssetSource,
    selectedQueueAssetId,
    setSeedanceReplayPreviewAsset,
    uploadedFile,
  ]);

  const addCurrentScriptToQueue = () => {
    if (!hasActiveScriptConcept) {
      openInfo(popupTitles.notice, t.wb_script_plan_require_notice);
      return;
    }
    if (enableStoryboardEditor && !isDurationValid) {
      openInfo(popupTitles.warning, formatMessage(t.wb_popup_duration_mismatch, { current: currentScriptDuration.toFixed(1), target: genDuration }));
      return;
    }

    const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = `${t.wb_script_page_prefix} ${scriptQueue.length + 1}`;
    const copiedScripts = scripts.map(s => ({ ...s }));

    setScriptQueue(prev => ([
      ...prev,
      {
        id: newId,
        name,
        scripts: copiedScripts,
        duration: genDuration,
        fullScript: activeFullScript,
        creativeCard: activeScriptPlan?.creativeCard,
        creativeCardText: activeScriptPlan?.creativeCardText,
      }
    ]));
  };

  const removeScriptFromQueue = (id: string) => {
    setScriptQueue(prev => prev.filter(s => s.id !== id));
  };

  useEffect(() => {
    scriptPagesRef.current = scriptPages;
  }, [scriptPages]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 10000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!scriptGenerationNotice) return;
    const timer = window.setTimeout(() => setScriptGenerationNotice(null), 2000);
    return () => window.clearTimeout(timer);
  }, [scriptGenerationNotice]);


  const applyImportedScriptText = useCallback((rawText: string, sourceName?: string, sourceLabel?: string) => {
    isDemoScriptsRef.current = false;
    const content = String(rawText || '').trim();
    if (!content) {
      openInfo(popupTitles.notice, t.wb_script_import_empty || '素材库中的脚本内容为空。');
      return;
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = null;
    }

    const importedName = String(sourceName || parsed?.name || '').trim();
    const importedSourceLabel = String(sourceLabel || t.wb_script_imported_from_library_badge || '从素材库导入').trim();
    const scriptContent = parsed?.script_content || parsed || {};

    const rawScripts = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(scriptContent?.scripts)
        ? scriptContent.scripts
        : (Array.isArray(scriptContent?.shots) ? scriptContent.shots : null));

    const hasStructuredShots = Array.isArray(rawScripts) && rawScripts.length > 0 && typeof rawScripts[0] === 'object';
    const nextPageIndex = scriptPagesRef.current.length;

    if (hasStructuredShots) {
      const importedScripts: ScriptItem[] = rawScripts.map((item: any, idx: number) => ({
        id: Number(item?.id) || Date.now() + idx,
        shot: String(item?.shot || idx + 1),
        type: String(item?.type || 'Medium'),
        dur: String(item?.dur || '2s'),
        visual: String(item?.visual || item?.image_description || ''),
        audio: String(item?.audio || item?.voiceover || ''),
        audioTranslation: String(item?.audioTranslation || ''),
      }));

      const normalizedCreativeCard: ScriptCreativeCard = {
        style: normalizeScriptText(scriptContent?.creative_card?.style || parsed?.creative_card?.style),
        environment: normalizeScriptText(scriptContent?.creative_card?.environment || parsed?.creative_card?.environment),
        tonePacing: normalizeScriptText(scriptContent?.creative_card?.tone_pacing || parsed?.creative_card?.tone_pacing),
        camera: normalizeScriptText(scriptContent?.creative_card?.camera || parsed?.creative_card?.camera),
        lighting: normalizeScriptText(scriptContent?.creative_card?.lighting || parsed?.creative_card?.lighting),
        actions: parseScriptStringList(scriptContent?.creative_card?.actions || parsed?.creative_card?.actions, 8),
        backgroundSound: normalizeScriptText(scriptContent?.creative_card?.background_sound || parsed?.creative_card?.background_sound),
        transitionEditing: normalizeScriptText(scriptContent?.creative_card?.transition_editing || parsed?.creative_card?.transition_editing),
        callToAction: normalizeScriptText(scriptContent?.creative_card?.call_to_action || parsed?.creative_card?.call_to_action),
      };

      const importedFullScript = normalizeScriptText(
        scriptContent?.video_master_script || parsed?.video_master_script || parsed?.fullScript || parsed?.full_script
      ) || buildFullScriptFallback(importedScripts);
      const importedCreativeCardText = normalizeScriptText(
        scriptContent?.creative_card_text || parsed?.creative_card_text || parsed?.creativeCardText
      ) || buildCreativeCardEditorText(normalizedCreativeCard) || importedFullScript;

      const appendedPage: ScriptPage = {
        id: `page-${nextPageIndex + 1}`,
        name: importedName || `${t.wb_script_page_prefix} ${nextPageIndex + 1}`,
        scripts: importedScripts,
        fullScript: importedFullScript,
        continuityAnchor: scriptContent?.continuity_anchor || parsed?.continuity_anchor || undefined,
        scriptStructure: scriptContent?.script_structure || parsed?.script_structure || undefined,
        sellingPoints: parseScriptStringList(scriptContent?.selling_points || parsed?.selling_points),
        sceneSuggestions: parseScriptStringList(scriptContent?.scene_suggestions || parsed?.scene_suggestions),
        styleTags: parseScriptStringList(scriptContent?.style_tags || parsed?.style_tags),
        creativeCard: normalizedCreativeCard,
        creativeCardText: importedCreativeCardText,
        sourceLabel: importedSourceLabel,
      };

      scriptPagesRef.current = [...scriptPagesRef.current, appendedPage];
      setScriptPages((prev) => [...prev, appendedPage]);
      setActiveScriptPage(nextPageIndex);
      setScripts(importedScripts);
    } else {
      const appendedPage: ScriptPage = {
        id: `page-${nextPageIndex + 1}`,
        name: importedName || `${t.wb_script_page_prefix} ${nextPageIndex + 1}`,
        scripts: [],
        fullScript: content,
        creativeCardText: content,
        sourceLabel: importedSourceLabel,
      };

      scriptPagesRef.current = [...scriptPagesRef.current, appendedPage];
      setScriptPages((prev) => [...prev, appendedPage]);
      setActiveScriptPage(nextPageIndex);
      setScripts([]);
    }

    setIsShotBreakdownOpen(false);
    openInfo(
      popupTitles.success,
      formatMessage(t.wb_script_imported_from_library || '已从素材库导入脚本：{name}', {
        name: importedName || sourceName || 'script',
      })
    );
  }, [buildCreativeCardEditorText, buildFullScriptFallback, formatMessage, normalizeScriptText, openInfo, parseScriptStringList, popupTitles.notice, popupTitles.success, t]);

  const handleImportScriptFromLibraryAsset = useCallback(async (asset: LibraryAsset) => {
    const assetUrl = toDisplayUrl(asset.file_url) || asset.file_url;
    if (!assetUrl) {
      openInfo(popupTitles.notice, t.wb_script_import_failed || '脚本地址无效，无法导入。');
      return;
    }

    try {
      const response = await fetch(assetUrl, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(t.wb_script_import_failed || '脚本读取失败，请稍后重试。');
      }

      const text = await response.text();
      applyImportedScriptText(text, asset.name || 'script', t.wb_script_imported_from_library_badge || '从素材库导入');
      setIsAssetLibraryOpen(false);
      setAssetLibraryPickMode('default');
    } catch (err: any) {
      openInfo(
        popupTitles.notice,
        String(err?.message || t.wb_script_import_failed || '脚本读取失败，请稍后重试。')
      );
    }
  }, [applyImportedScriptText, openInfo, popupTitles.notice, t]);

  // Script import from asset library — fetch script content and apply as new ScriptPage
  useEffect(() => {
    if (!initialLibraryAsset || !initialLibraryAssetToken) return;
    if (isRestoring) return;
    if (initialLibraryAssetMode !== 'script_import') return;
    if (injectedAssetSignaturesRef.current.has(initialLibraryAssetToken)) return;
    injectedAssetSignaturesRef.current.add(initialLibraryAssetToken);

    const importScriptIntoProject = () => {
      void handleImportScriptFromLibraryAsset(initialLibraryAsset);
      onInitialLibraryAssetHandled?.();
    };

    const targetProjectId = String(initialLibraryAssetTargetProjectId || '').trim();
    if (targetProjectId && targetProjectId !== projectStore.currentProjectId) {
      ensureProjectInStore(targetProjectId);
      goToProject(targetProjectId, importScriptIntoProject);
      return;
    }

    importScriptIntoProject();
  }, [
    ensureProjectInStore,
    goToProject,
    handleImportScriptFromLibraryAsset,
    initialLibraryAsset,
    initialLibraryAssetMode,
    initialLibraryAssetTargetProjectId,
    initialLibraryAssetToken,
    isRestoring,
    onInitialLibraryAssetHandled,
    projectStore.currentProjectId,
  ]);

  const openScriptSaveDialog = useCallback(() => {
    const fallbackName = scriptPages[activeScriptPage]?.name || `${t.wb_script_page_prefix} ${activeScriptPage + 1}`;
    setScriptSaveNameDraft(fallbackName);
    setIsScriptSaveDialogOpen(true);
  }, [activeScriptPage, scriptPages, t.wb_script_page_prefix]);

  const normalizeScriptAssetName = useCallback((rawName: string) => {
    return String(rawName || '')
      .trim()
      .replace(/\.(json|txt|md)$/i, '')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  const confirmScriptSaveToLibrary = useCallback(async () => {
    const displayName = normalizeScriptAssetName(scriptSaveNameDraft);
    if (!displayName) {
      openInfo(popupTitles.notice, t.wb_script_save_name_required || '请输入脚本名称后再保存。');
      return;
    }

    const combinedScript = buildCombinedScriptPrompt(activeFullScript, activeCreativeCard, scripts, activeCreativeCardText).trim();
    if (!combinedScript) {
      openInfo(popupTitles.notice, t.wb_script_save_need_content || '请先生成或编辑脚本后再保存。');
      return;
    }

    const payload = {
      name: displayName,
      video_master_script: activeFullScript?.trim() || combinedScript,
      creative_card: activeCreativeCard || null,
      creative_card_text: activeCreativeCardText || '',
      scripts,
      shots: scripts,
      continuity_anchor: activeScriptPlan?.continuityAnchor || null,
      script_structure: activeScriptPlan?.scriptStructure || null,
      selling_points: activeScriptPlan?.sellingPoints || [],
      scene_suggestions: activeScriptPlan?.sceneSuggestions || [],
      style_tags: activeScriptPlan?.styleTags || [],
      saved_at: new Date().toISOString(),
    };
    const fileName = `${displayName}.json`;
    const scriptFile = new File([JSON.stringify(payload, null, 2)], fileName, { type: 'application/json' });

    setIsSavingScriptAsset(true);
    try {
      const uploadResult = await assetsApi.uploadAsset(scriptFile, 'script');
      const uploadedAsset = uploadResult?.data || uploadResult?.asset || uploadResult?.data?.asset || null;
      const uploadedAssetId = uploadedAsset?.id ? String(uploadedAsset.id) : '';

      if (uploadedAssetId) {
        try {
          await assetsApi.renameAsset(uploadedAssetId, displayName);
        } catch (renameErr) {
          console.warn('Rename saved script asset failed:', renameErr);
        }
      }

      setScriptPages((prev) => {
        if (activeScriptPage < 0 || activeScriptPage >= prev.length) return prev;
        const next = [...prev];
        next[activeScriptPage] = {
          ...next[activeScriptPage],
          name: displayName,
          sourceLabel: undefined,
        };
        return next;
      });

      setIsScriptSaveDialogOpen(false);
      openInfo(popupTitles.success, t.wb_script_saved_to_library || '已保存到素材库。');
    } catch (err: any) {
      openInfo(
        popupTitles.notice,
        String(err?.message || t.wb_script_save_failed || '保存失败，请稍后重试。')
      );
    } finally {
      setIsSavingScriptAsset(false);
    }
  }, [activeCreativeCard, activeCreativeCardText, activeFullScript, activeScriptPage, activeScriptPlan?.continuityAnchor, activeScriptPlan?.sceneSuggestions, activeScriptPlan?.scriptStructure, activeScriptPlan?.sellingPoints, activeScriptPlan?.styleTags, buildCombinedScriptPrompt, normalizeScriptAssetName, openInfo, popupTitles.notice, popupTitles.success, scriptSaveNameDraft, scripts, t.wb_script_save_need_content, t.wb_script_save_failed, t.wb_script_saved_to_library, t.wb_script_save_name_required]);

  const saveCurrentWorkspaceScriptsToLibrary = useCallback(async () => {
    const fallbackName = scriptPages[activeScriptPage]?.name || `${t.wb_script_page_prefix} ${activeScriptPage + 1}`;
    const displayName = normalizeScriptAssetName(fallbackName);
    const combinedScript = buildCombinedScriptPrompt(activeFullScript, activeCreativeCard, scripts, activeCreativeCardText).trim();
    if (!displayName || !combinedScript) {
      openInfo(popupTitles.notice, t.wb_script_save_need_content || '请先生成或编辑脚本后再保存。');
      return false;
    }

    const payload = {
      name: displayName,
      video_master_script: activeFullScript?.trim() || combinedScript,
      creative_card: activeCreativeCard || null,
      creative_card_text: activeCreativeCardText || '',
      scripts,
      shots: scripts,
      continuity_anchor: activeScriptPlan?.continuityAnchor || null,
      script_structure: activeScriptPlan?.scriptStructure || null,
      selling_points: activeScriptPlan?.sellingPoints || [],
      scene_suggestions: activeScriptPlan?.sceneSuggestions || [],
      style_tags: activeScriptPlan?.styleTags || [],
      saved_at: new Date().toISOString(),
    };

    setIsSavingScriptAsset(true);
    try {
      const scriptFile = new File([JSON.stringify(payload, null, 2)], `${displayName}.json`, { type: 'application/json' });
      const uploadResult = await assetsApi.uploadAsset(scriptFile, 'script');
      const uploadedAsset = uploadResult?.data || uploadResult?.asset || uploadResult?.data?.asset || null;
      const uploadedAssetId = uploadedAsset?.id ? String(uploadedAsset.id) : '';
      if (uploadedAssetId) {
        await assetsApi.renameAsset(uploadedAssetId, displayName).catch(() => undefined);
      }
      openInfo(popupTitles.success, t.wb_script_saved_to_library || '已保存到素材库。');
      return true;
    } catch (err: any) {
      openInfo(popupTitles.notice, String(err?.message || t.wb_script_save_failed || '保存失败，请稍后重试。'));
      return false;
    } finally {
      setIsSavingScriptAsset(false);
    }
  }, [activeCreativeCard, activeCreativeCardText, activeFullScript, activeScriptPage, activeScriptPlan?.continuityAnchor, activeScriptPlan?.sceneSuggestions, activeScriptPlan?.scriptStructure, activeScriptPlan?.sellingPoints, activeScriptPlan?.styleTags, buildCombinedScriptPrompt, normalizeScriptAssetName, openInfo, popupTitles.notice, popupTitles.success, scriptPages, scripts, t.wb_script_page_prefix, t.wb_script_save_failed, t.wb_script_save_need_content, t.wb_script_saved_to_library]);

  const parseScriptPage = useCallback((raw: any, idx: number): ScriptPage => {
    const shots = buildScriptsFromShots(raw?.shots || raw?.script_content?.shots || []);
    const scriptContent = raw?.script_content || raw || {};
    const continuityAnchor = scriptContent?.continuity_anchor || {};
    const scriptStructure = scriptContent?.script_structure || {};
    const creativeCard = scriptContent?.creative_card || {};
    const normalizedCreativeCard: ScriptCreativeCard = {
      style: normalizeScriptText(creativeCard?.style),
      environment: normalizeScriptText(creativeCard?.environment),
      tonePacing: normalizeScriptText(creativeCard?.tone_pacing),
      camera: normalizeScriptText(creativeCard?.camera),
      lighting: normalizeScriptText(creativeCard?.lighting),
      actions: parseScriptStringList(creativeCard?.actions, 8),
      backgroundSound: normalizeScriptText(creativeCard?.background_sound),
      transitionEditing: normalizeScriptText(creativeCard?.transition_editing),
      callToAction: normalizeScriptText(creativeCard?.call_to_action),
    };
    const fullScriptBase = normalizeScriptText(scriptContent?.video_master_script) || buildFullScriptFallback(shots);
    const materialUsageTextRaw = String(scriptContent?.material_usage_text || '').trim();
    const fullScript = materialUsageTextRaw
      ? `${fullScriptBase}\n\n${materialUsageTextRaw}`.trim()
      : fullScriptBase;
    const creativeCardText = String(scriptContent?.creative_card_text || '').trim()
      || buildCreativeCardEditorText(normalizedCreativeCard)
      || fullScript;
    console.log('[ScriptDebug] parseScriptPage', {
      idx,
      shotCount: shots.length,
      hasVideoMasterScript: Boolean(normalizeScriptText(scriptContent?.video_master_script)),
      hasCreativeCard: Boolean(scriptContent?.creative_card && typeof scriptContent.creative_card === 'object'),
      fullScriptLength: fullScript.length,
      creativeCardTextLength: creativeCardText.length,
    });
    return {
      id: `page-${idx + 1}`,
      name: String(raw?.name || '').trim() || `${t.wb_script_page_prefix} ${idx + 1}`,
      scripts: shots,
      fullScript,
      continuityAnchor: {
        subject: normalizeScriptText(continuityAnchor?.subject),
        scene: normalizeScriptText(continuityAnchor?.scene),
        style: normalizeScriptText(continuityAnchor?.style),
      },
      scriptStructure: {
        hook: normalizeScriptText(scriptStructure?.hook),
        development: normalizeScriptText(scriptStructure?.development),
        payoff: normalizeScriptText(scriptStructure?.payoff),
      },
      sellingPoints: parseScriptStringList(scriptContent?.selling_points),
      sceneSuggestions: parseScriptStringList(scriptContent?.scene_suggestions),
      styleTags: parseScriptStringList(scriptContent?.style_tags),
      creativeCard: normalizedCreativeCard,
      creativeCardText,
      sourceLabel: String(raw?.sourceLabel || '').trim() || undefined,
    };
  }, [buildCreativeCardEditorText, buildFullScriptFallback, buildScriptsFromShots, normalizeScriptText, parseScriptStringList, t.wb_script_page_prefix]);

  const appendGeneratedScriptPage = useCallback((raw: any, options?: { replaceExisting?: boolean }) => {
    isDemoScriptsRef.current = false;
    const replaceExisting = !!options?.replaceExisting;
    if (replaceExisting) {
      const nextPage = parseScriptPage(raw, 0);
      scriptPagesRef.current = [nextPage];
      setScriptPages([nextPage]);
      setActiveScriptPage(0);
      setScripts(nextPage.scripts);
      setIsShotBreakdownOpen(false);
      return;
    }

    const appendedIndex = scriptPagesRef.current.length;
    const appendedPage = parseScriptPage(raw, appendedIndex);
    scriptPagesRef.current = [...scriptPagesRef.current, appendedPage];
    setScriptPages((prev) => [...prev, appendedPage]);
    setActiveScriptPage(appendedIndex);
    setScripts(appendedPage.scripts);
    setIsShotBreakdownOpen(false);
  }, [parseScriptPage]);

  const appendGeneratedScriptPageToWorkspace = useCallback((projectId: string, raw: any, options?: { replaceExisting?: boolean }) => {
    const pid = String(projectId || '').trim();
    if (!pid) return;
    const replaceExisting = !!options?.replaceExisting;

    setProjectStore((prev) => {
      const prevWorkspace = prev.workspaces[pid] || createWorkspaceState({ scripts: [], scriptPagePrefix: t.wb_script_page_prefix, userId: user?.id ?? null });
      const prevPages = Array.isArray((prevWorkspace as any).scriptPages) ? (prevWorkspace as any).scriptPages : [];
      const nextPages = replaceExisting
        ? [parseScriptPage(raw, 0)]
        : [...prevPages, parseScriptPage(raw, prevPages.length)];
      const nextActive = Math.max(0, nextPages.length - 1);
      const nextScripts = nextPages[nextActive]?.scripts || [];

      return {
        ...prev,
        projects: prev.projects.map((p) => (p.id === pid ? { ...p, updatedAt: Date.now() } : p)),
        workspaces: {
          ...prev.workspaces,
          [pid]: {
            ...(prevWorkspace as any),
            scriptPages: nextPages,
            activeScriptPage: nextActive,
            scripts: nextScripts,
          },
        },
      };
    });
  }, [createWorkspaceState, parseScriptPage, setProjectStore, t.wb_script_page_prefix, user?.id]);

  // 补生成分镜：基于当前页已有的整片方案，只跑 Stage 2 分镜拆分。
  const handleGenerateShotsOnly = useCallback(async () => {
    if (isGeneratingShotsOnly) return;
    if (!user?.id) {
      openInfo(popupTitles.notice, t.wb_popup_not_logged_in);
      return;
    }
    const pageIdx = activeScriptPage;
    const currentPage = scriptPagesRef.current[pageIdx];
    if (!currentPage) return;

    const rawFullScript = String(currentPage.fullScript || '').trim();
    if (!rawFullScript) {
      openInfo(popupTitles.notice, '当前页还没有整片方案，请先生成脚本。');
      return;
    }

    setIsGeneratingShotsOnly(true);
    try {
      const category = productCategory.trim() || selectedTemplate?.product_category || "相机";
      const style = selectedTemplate?.visual_style || "写实";
      const rawRatio = aspectRatio || selectedTemplate?.aspect_ratio || "16:9";
      const duration = genDuration || selectedTemplate?.duration || 10;
      const shotsCount = selectedTemplate?.shot_number || 5;
      const promptText = buildScriptInputText();

      const creativeCardOut = currentPage.creativeCard ? {
        style: currentPage.creativeCard.style || '',
        environment: currentPage.creativeCard.environment || '',
        tone_pacing: currentPage.creativeCard.tonePacing || '',
        camera: currentPage.creativeCard.camera || '',
        lighting: currentPage.creativeCard.lighting || '',
        actions: currentPage.creativeCard.actions || [],
        background_sound: currentPage.creativeCard.backgroundSound || '',
        transition_editing: currentPage.creativeCard.transitionEditing || '',
        call_to_action: currentPage.creativeCard.callToAction || '',
      } : undefined;

      const payload: any = {
        product_category: category,
        visual_style: style,
        aspect_ratio: rawRatio,
        user_language: language,
        target_language: targetLanguage,
        sound: soundSetting,
        enable_storyboard_editor: true,
        script_content: {
          duration,
          shot_number: shotsCount,
          custom: selectedTemplate?.custom_config || "",
          input: promptText,
          shots: [],
          video_master_script: rawFullScript,
          ...(currentPage.continuityAnchor ? { continuity_anchor: currentPage.continuityAnchor } : {}),
          ...(currentPage.scriptStructure ? { script_structure: currentPage.scriptStructure } : {}),
          ...(creativeCardOut ? { creative_card: creativeCardOut } : {}),
          ...(currentPage.sellingPoints?.length ? { selling_points: currentPage.sellingPoints } : {}),
          ...(currentPage.sceneSuggestions?.length ? { scene_suggestions: currentPage.sceneSuggestions } : {}),
          ...(currentPage.styleTags?.length ? { style_tags: currentPage.styleTags } : {}),
        },
      };

      const resp: any = await videoApi.generateShots(user.id, payload);
      const newScriptContent = resp?.data?.script_content;
      if (!newScriptContent) {
        throw new Error('分镜补生成返回为空');
      }

      // 构造更新后的页：沿用当前页的 Stage 1 字段，只替换 shots。
      const nextPage = parseScriptPage({ script_content: newScriptContent, name: currentPage.name }, pageIdx);
      scriptPagesRef.current = scriptPagesRef.current.map((p, i) => (i === pageIdx ? { ...nextPage, sourceLabel: currentPage.sourceLabel } : p));
      setScriptPages((prev) => prev.map((p, i) => (i === pageIdx ? { ...nextPage, sourceLabel: currentPage.sourceLabel } : p)));
      setScripts(nextPage.scripts);
      setIsShotBreakdownOpen(true);
    } catch (err) {
      console.error('generate shots only failed', err);
      openErrorModal(err, { category: 'script_failed', onRetry: handleGenerateShotsOnly });
    } finally {
      setIsGeneratingShotsOnly(false);
    }
  }, [
    isGeneratingShotsOnly,
    user?.id,
    activeScriptPage,
    productCategory,
    selectedTemplate,
    aspectRatio,
    genDuration,
    language,
    targetLanguage,
    soundSetting,
    buildScriptInputText,
    parseScriptPage,
    popupTitles.notice,
    t,
  ]);

  const { finishScriptGenerationProgress } = useScriptGenerationProgress({
    isGenerating: isGeneratingScript,
    estimatedSeconds: scriptGenerationEstimatedSeconds,
    progress: scriptGenerationProgress,
    setProgress: setScriptGenerationProgress,
    startedAtRef: scriptGenerationStartedAtRef,
    finishingRef: scriptGenerationFinishingRef,
    maxBeforeHold: SCRIPT_PROGRESS_MAX_BEFORE_HOLD,
    holdMax: SCRIPT_PROGRESS_HOLD_MAX,
  });

  const SCRIPT_GEN_IN_PROGRESS_KEY = `vflow_workbench_script_gen_in_progress_v1_${user?.id ?? 'guest'}`;

  const handleCancelGenerateScripts = useCallback(() => {
    const controller = scriptGenerationAbortRef.current;
    if (!controller) return;

    activeScriptGenerationSeqRef.current += 1;
    scriptGenerationAbortRef.current = null;
    scriptGenerationStartedAtRef.current = null;
    scriptGenerationEstimateKeyRef.current = null;
    scriptGenerationFinishingRef.current = false;
    scriptGenerationProjectIdRef.current = null;
    const scriptTaskId = currentScriptQueueTaskIdRef.current;
    if (scriptTaskId) {
      updateTask(scriptTaskId, {
        status: 'failed',
        result: { error: 'CANCELLED' },
        navigateTo: { view: 'workbench', focus: 'scripts' },
      });
      currentScriptQueueTaskIdRef.current = null;
    }
    try {
      window.localStorage.removeItem(SCRIPT_GEN_IN_PROGRESS_KEY);
    } catch {
    }

    controller.abort();
    setIsGeneratingScript(false);
    setIsScriptGenerationProgressVisible(false);
    setScriptGenerationProgress(0);
    setScriptGenerationCompletedCount(0);
    setScriptGenerationTotalCount(0);
    recordScriptGenerationCancelTimestamp(user?.id ?? null);
    setScriptGenerationNotice(t.wb_popup_script_generation_cancelled || '已成功取消脚本');
  }, [t.wb_popup_script_generation_cancelled, updateTask, user?.id]);

  const handleGenerateScriptsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SCRIPT_GEN_IN_PROGRESS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { projectId?: string; startedAt?: number };
      const pid = String(parsed?.projectId || '').trim();
      const startedAt = Number(parsed?.startedAt);
      if (!pid || pid !== String(projectStore.currentProjectId || '').trim()) return;
      if (!Number.isFinite(startedAt) || startedAt <= 0) return;
      if (Date.now() - startedAt > 12 * 60 * 1000) {
        window.localStorage.removeItem(SCRIPT_GEN_IN_PROGRESS_KEY);
        return;
      }

      window.localStorage.removeItem(SCRIPT_GEN_IN_PROGRESS_KEY);
      setScriptGenerationNotice('检测到未完成的脚本生成，已自动继续生成。');
      window.setTimeout(() => {
        handleGenerateScriptsRef.current?.();
      }, 250);
    } catch {
    }
  }, [SCRIPT_GEN_IN_PROGRESS_KEY, projectStore.currentProjectId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SCRIPT_GEN_IN_PROGRESS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { projectId?: string; startedAt?: number };
      const pid = String(parsed?.projectId || '').trim();
      const startedAt = Number(parsed?.startedAt);
      if (!pid || pid !== String(projectStore.currentProjectId || '').trim()) return;
      if (!Number.isFinite(startedAt) || startedAt <= 0) return;
      if (Date.now() - startedAt > 12 * 60 * 1000) {
        window.localStorage.removeItem(SCRIPT_GEN_IN_PROGRESS_KEY);
        return;
      }

      window.localStorage.removeItem(SCRIPT_GEN_IN_PROGRESS_KEY);
      setScriptGenerationNotice('检测到未完成的脚本生成，已自动继续生成。');
      window.setTimeout(() => {
        handleGenerateScriptsRef.current?.();
      }, 250);
    } catch {
    }
  }, [SCRIPT_GEN_IN_PROGRESS_KEY, projectStore.currentProjectId]);

  useEffect(() => {
    return () => {
      scriptGenerationAbortRef.current?.abort();
      scriptGenerationAbortRef.current = null;
      scriptGenerationStartedAtRef.current = null;
      scriptGenerationEstimateKeyRef.current = null;
      scriptGenerationFinishingRef.current = false;
      scriptGenerationProjectIdRef.current = null;
    };
  }, []);

  const handleGenerateScripts = async () => {
    if (scriptGenerationLockRef.current) return;
    scriptGenerationLockRef.current = true;

    const effectiveUserId = user?.id || 0;

    const cooldownRemainingMs = getScriptGenerationCooldownRemainingMs(effectiveUserId);
    if (cooldownRemainingMs > 0) {
      scriptGenerationLockRef.current = false;
      openInfo(popupTitles.warning, t.wb_popup_script_generation_too_frequent || '操作过于频繁，请稍后再试。');
      return;
    }

    const nextErrors: {
      productName?: string;
      productCategory?: string;
      coreSellingPoints?: string;
      videoType?: string;
    } = {};

    if (!productName.trim()) nextErrors.productName = t.wb_required_product_name;
    if (!productCategory.trim()) nextErrors.productCategory = t.wb_required_product_category;
    if (!coreSellingPoints.trim()) nextErrors.coreSellingPoints = t.wb_required_core_selling_points;
    if (!videoType.trim()) nextErrors.videoType = t.wb_required_video_type;

    if (Object.keys(nextErrors).length > 0) {
      setRequiredErrors(nextErrors);
      setToastMessage(t.wb_required_toast);

      const scrollOptions: ScrollIntoViewOptions = { behavior: 'smooth', block: 'center' };
      const focusDropdownButton = (wrapper: HTMLDivElement | null) => {
        const btn = wrapper?.querySelector('button') as HTMLButtonElement | null;
        if (!btn) return;
        window.requestAnimationFrame(() => btn.focus());
      };

      if (nextErrors.productName) {
        productNameFieldRef.current?.scrollIntoView(scrollOptions);
        productNameFieldRef.current?.focus();
      } else if (nextErrors.productCategory) {
        productCategoryFieldRef.current?.scrollIntoView(scrollOptions);
        focusDropdownButton(productCategoryFieldRef.current);
      } else if (nextErrors.coreSellingPoints) {
        coreSellingPointsFieldRef.current?.scrollIntoView(scrollOptions);
        coreSellingPointsFieldRef.current?.focus();
      } else if (nextErrors.videoType) {
        videoTypeFieldRef.current?.scrollIntoView(scrollOptions);
        focusDropdownButton(videoTypeFieldRef.current);
      }

      scriptGenerationLockRef.current = false;
      return;
    }

    if (Object.keys(requiredErrors).length > 0) setRequiredErrors({});

    if (isSeedanceReplayMode && seedanceReplayValidation.hasBlockingIssues) {
      if (seedanceReplayValidation.globalErrors.length > 0) {
        openInfo(popupTitles.notice, seedanceReplayValidation.globalErrors.join('\n'));
      } else {
        const focusTarget: SeedanceReplayMediaKind = seedanceReplayValidation.imageErrors.length > 0
          ? 'image'
          : seedanceReplayValidation.videoErrors.length > 0
            ? 'video'
            : 'audio';
        focusSeedanceReplayValidationTarget(focusTarget);
      }
      scriptGenerationLockRef.current = false;
      return;
    }

    if (hasAnyScriptPlanGridContent) {
      const shouldKeepCurrentScripts = await openConfirm(
        '提示',
        '是否保留当前工作区内脚本？',
        { okLabel: '保留并保存到素材库', cancelLabel: '不保留' }
      );
      if (shouldKeepCurrentScripts) {
        const saved = await saveCurrentWorkspaceScriptsToLibrary();
        if (!saved) {
          scriptGenerationLockRef.current = false;
          return;
        }
      }
      resetScriptPlanGridToDefault();
    }

    const totalScriptCount = Math.max(1, scriptVariantCount || 1);
    const estimateParams = {
      script_count: 1,
      duration: Math.max(1, genDuration || 10),
      has_reference_assets: uploadDisplayAssets.some((asset) => asset.mediaKind === 'image' || asset.mediaKind === 'video'),
      with_shots: enableStoryboardEditor,
    };
    const estimateStorageKey = buildScriptEstimateStorageKey(user?.id ?? null, estimateParams);
    let estimatedSeconds = 45;
    try {
      const resp: any = await Promise.race([
        videoApi.estimateScriptTime(estimateParams),
        new Promise((resolve) => window.setTimeout(() => resolve(null), 1200)),
      ]);
      const raw = Number(resp?.data?.estimated_seconds);
      if (Number.isFinite(raw) && raw > 0) {
        estimatedSeconds = Math.round(raw);
      }
    } catch (err) {
      console.log('[ScriptEstimate] fallback default', err);
    }
    if (estimatedSeconds <= 45) {
      const localEstimate = readLocalScriptEstimate(estimateStorageKey);
      if (localEstimate?.avgSeconds) {
        estimatedSeconds = Math.max(1, Math.round(localEstimate.avgSeconds));
      }
    }

    const scriptQueueTaskId = `script-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    currentScriptQueueTaskIdRef.current = scriptQueueTaskId;
    upsertTask({
      id: scriptQueueTaskId,
      workbenchProjectId: projectStore.currentProjectId,
      estimatedSeconds,
      type: 'script_generation',
      status: 'processing',
      navigateTo: { view: 'workbench', focus: 'scripts' },
      name: `${(productName || '').trim() || fileName || scriptPages[activeScriptPage]?.name || selectedTemplate?.name || 'Script'}`,
      thumbnail: uploadDisplayAssets.find((asset) => asset.mediaKind === 'image')?.previewUrl || uploadedFile || undefined,
      createdAt: Date.now(),
    });

    setIsGeneratingScript(true);
    setIsScriptGenerationProgressVisible(true);
    try {
      window.localStorage.setItem(SCRIPT_GEN_IN_PROGRESS_KEY, JSON.stringify({
        projectId: projectStore.currentProjectId,
        startedAt: Date.now(),
      }));
    } catch {
    }
    try {
      window.localStorage.setItem(SCRIPT_GEN_IN_PROGRESS_KEY, JSON.stringify({
        projectId: projectStore.currentProjectId,
        startedAt: Date.now(),
      }));
    } catch {
    }
    setScriptGenerationEstimatedSeconds(estimatedSeconds);
    setScriptGenerationProgress(0);
    setScriptGenerationCompletedCount(0);
    setScriptGenerationTotalCount(totalScriptCount);
    scriptGenerationStartedAtRef.current = Date.now();
    scriptGenerationEstimateKeyRef.current = estimateStorageKey;
    scriptGenerationFinishingRef.current = false;
    const generationProjectId = projectStore.currentProjectId;
    scriptGenerationProjectIdRef.current = generationProjectId;
    const generationSeq = activeScriptGenerationSeqRef.current + 1;
    activeScriptGenerationSeqRef.current = generationSeq;
    const abortController = new AbortController();
    scriptGenerationAbortRef.current = abortController;
    let shouldHideProgressImmediately = true;

    try {
      type ScriptReferenceAsset = {
        type: 'model' | 'product' | 'scene' | 'motion';
        name: string;
        media_type: 'image' | 'video';
        transfer_kind: 'url' | 'path' | 'data_url';
        media_uri: string;
        image_path: string;
      };

      const referenceSources = uploadDisplayAssets;
      const queuedPathUpdates: Record<string, string> = {};
      const resolveQueuedAssetPath = async (asset: QueuedAsset) => {
        let resolvedPath = asset.uploadedPath || asset.assetUrl || null;
        if (!resolvedPath && asset.fileObj) {
          const uploadResp = await assetsApi.uploadTempAsset(asset.fileObj);
          resolvedPath = extractUploadedAssetPath(uploadResp);
        }
        if (!resolvedPath) return null;

        if (asset.id && asset.id !== 'current-upload') {
          queuedPathUpdates[asset.id] = resolvedPath;
        }
        if (selectedQueueAssetId && selectedQueueAssetId === asset.id) {
          setLastUploadedUrl(resolvedPath);
        }
        return resolvedPath;
      };
      const scriptReferenceSources = referenceSources.filter((asset) => asset.mediaKind === 'image' || asset.mediaKind === 'video');
      const resolvedReferencePaths = new Map<string, string>();
      for (const asset of scriptReferenceSources) {
        const resolvedPath = await resolveQueuedAssetPath(asset);
        if (resolvedPath) {
          resolvedReferencePaths.set(asset.id, resolvedPath);
        }
      }
      const normalizedImageAssets = selectedModel === 'kling'
        ? normalizeQueueSourcesForKlingMode(scriptReferenceSources.filter((asset) => asset.mediaKind === 'image'), klingGenerateMode)
        : scriptReferenceSources;

      const referenceAssets: ScriptReferenceAsset[] = [];
      const orderedTypes: Array<'model' | 'product' | 'scene' | 'motion'> = ['model', 'product', 'scene', 'motion'];
      for (const type of orderedTypes) {
        const sameTypeAssets = normalizedImageAssets.filter((asset) => asset.materialType === type);
        for (const asset of sameTypeAssets) {
          let resolvedPath = resolvedReferencePaths.get(asset.id) || null;
          if (!resolvedPath) {
            resolvedPath = await resolveQueuedAssetPath(asset);
          }
          if (!resolvedPath) continue;

          const transferKind: 'url' | 'path' | 'data_url' = resolvedPath.startsWith('http://') || resolvedPath.startsWith('https://')
            ? 'url'
            : (resolvedPath.startsWith('data:') ? 'data_url' : 'path');

          referenceAssets.push({
            type,
            name: asset.name || '',
            media_type: asset.mediaKind === 'video' ? 'video' : 'image',
            transfer_kind: transferKind,
            media_uri: resolvedPath,
            image_path: resolvedPath,
          });
        }
      }
      if (Object.keys(queuedPathUpdates).length > 0) {
        setAssetQueue(prev => prev.map(item => (
          queuedPathUpdates[item.id] ? { ...item, uploadedPath: queuedPathUpdates[item.id] } : item
        )));
      }

      let imagePath = selectedModel === 'kling'
        ? ''
        : (referenceAssets.find((item) => item.type === 'product' && item.media_type === 'image')?.image_path || referenceAssets.find((item) => item.media_type === 'image')?.image_path || '');

      const promptText = buildScriptInputText();
      const klingContext = (() => {
        if (selectedModel !== 'kling') return null;

        const firstFrameAsset = normalizedImageAssets.find((asset) => asset.source === 'product') || null;
        const subjectAsset = normalizedImageAssets.find((asset) => asset.source === 'subject') || null;

        const subjectLibraryAsset = subjectAsset?.assetId
          ? assetLibraryItems.find((item) => item.id === subjectAsset.assetId) || null
          : null;
        const rawSubjectMeta = subjectLibraryAsset?.meta_data?.kling_subject;
        const subjectMeta = rawSubjectMeta && typeof rawSubjectMeta === 'object'
          ? rawSubjectMeta as Record<string, unknown>
          : null;
        const subjectName = String(subjectMeta?.name || subjectAsset?.name || '').trim();
        const subjectDescription = String(subjectMeta?.description || '').trim();

        return {
          engine: 'kling',
          kling_mode: klingGenerateMode,
          ...(subjectName ? { subject_name: subjectName } : {}),
          ...(subjectDescription ? { subject_description: subjectDescription } : {}),
        };
      })();
      const klingPrimaryImage = selectedModel === 'kling'
        ? (() => {
          const primaryAsset = normalizedImageAssets.find((asset) => asset.source === (klingGenerateMode === 'subject' ? 'subject' : 'product')) || null;
          if (!primaryAsset) return null;
          const primaryPath = resolvedReferencePaths.get(primaryAsset.id) || '';
          if (!primaryPath) return null;
          return {
            path: primaryPath,
            type: (primaryAsset.materialType === 'model' || primaryAsset.materialType === 'product' || primaryAsset.materialType === 'scene')
              ? primaryAsset.materialType
              : 'product',
          };
        })()
        : null;

      const category = productCategory.trim() || selectedTemplate?.product_category || "相机";
      const style = selectedTemplate?.visual_style || "写实";
      const rawRatio = aspectRatio || selectedTemplate?.aspect_ratio || "16:9";
      const duration = genDuration || selectedTemplate?.duration || 10;
      const shots = selectedTemplate?.shot_number || 5;
      const normalizedReferenceScript = isReferenceScriptFresh ? referenceScript.trim() : '';

      const payload = {
        product_category: category,
        visual_style: style,
        aspect_ratio: rawRatio,
        user_language: language,
        target_language: targetLanguage,
        sound: soundSetting,
        script_count: scriptVariantCount,
        enable_storyboard_editor: enableStoryboardEditor,
        script_content: {
          duration,
          shot_number: shots,
          custom: selectedTemplate?.custom_config || "",
          input: promptText,
          shots: [],
          ...(normalizedReferenceScript ? { reference_script: normalizedReferenceScript } : {}),
        },
        ...(normalizedReferenceScript ? { reference_script: normalizedReferenceScript } : {}),
        ...(klingContext ? { generation_context: klingContext } : {}),
        ...(selectedModel === 'kling' && klingGenerateMode === 'first_frame' && klingPrimaryImage
          ? { first_frame_image_path: klingPrimaryImage.path, first_frame_image_type: klingPrimaryImage.type }
          : {}),
        ...(selectedModel === 'kling' && klingGenerateMode === 'subject' && klingPrimaryImage
          ? { subject_image_path: klingPrimaryImage.path, subject_image_type: klingPrimaryImage.type }
          : {}),
        ...(referenceAssets.length > 0 ? { reference_assets: referenceAssets } : {}),
        ...(imagePath ? { product_image_path: imagePath } : {}),
      };
      const reportPayload = {
        script_count: 1,
        duration: estimateParams.duration,
        has_reference_assets: estimateParams.has_reference_assets,
        with_shots: enableStoryboardEditor,
      };

      console.log("📜 Generating Script with payload:", payload);
      let sawVariant = false;
      let streamFailedMessage: string | null = null;
      await videoApi.generateScriptStream(
        effectiveUserId,
        payload,
        {
          onStart: (event) => {
            if (generationSeq !== activeScriptGenerationSeqRef.current) return;
            const total = Number(event?.data?.total);
            if (Number.isFinite(total) && total > 0) {
              setScriptGenerationTotalCount(Math.max(1, Math.round(total)));
            }
          },
          onVariant: async (event) => {
            if (generationSeq !== activeScriptGenerationSeqRef.current) return;
            const data: any = event?.data || {};
            const scriptContent: any = data.script_content;
            if (!scriptContent) {
              console.warn('[ScriptDebug] onVariant missing script_content', data);
              return;
            }

            console.log('[ScriptDebug] onVariant payload', {
              index: data?.index,
              completed: data?.completed,
              total: data?.total,
              scriptContentKeys: Object.keys(scriptContent || {}),
              shotCount: Array.isArray(scriptContent?.shots) ? scriptContent.shots.length : 0,
              hasVideoMasterScript: Boolean(String(scriptContent?.video_master_script || '').trim()),
              hasCreativeCard: Boolean(scriptContent?.creative_card && typeof scriptContent.creative_card === 'object'),
            });

            const isFirstVariant = !sawVariant;
            sawVariant = true;
            const startedAt = scriptGenerationStartedAtRef.current;
            const elapsedSeconds = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 1000)) : null;
            shouldHideProgressImmediately = false;
            flushSync(() => {
              if (!isMountedRef.current) return;
              appendGeneratedScriptPage({ script_content: scriptContent }, { replaceExisting: isFirstVariant });
            });
            appendGeneratedScriptPageToWorkspace(generationProjectId, { script_content: scriptContent }, { replaceExisting: isFirstVariant });
            void finishScriptGenerationProgress();

            const completed = Number(data.completed);
            const total = Number(data.total);
            if (Number.isFinite(completed) && completed >= 0) {
              setScriptGenerationCompletedCount(Math.max(0, Math.round(completed)));
            }
            if (Number.isFinite(total) && total > 0) {
              setScriptGenerationTotalCount(Math.max(1, Math.round(total)));
            }

            if (elapsedSeconds) {
              const estimateKey = scriptGenerationEstimateKeyRef.current;
              if (estimateKey) {
                writeLocalScriptEstimate(estimateKey, elapsedSeconds);
              }
              void videoApi.reportScriptTime({
                ...reportPayload,
                elapsed_seconds: elapsedSeconds,
              }).catch((error) => {
                console.log('[ScriptEstimate] report failed', error);
              });
            }

            if ((Number.isFinite(total) ? Math.round(total) : totalScriptCount) > (Number.isFinite(completed) ? Math.round(completed) : 0)) {
              scriptGenerationStartedAtRef.current = Date.now();
              scriptGenerationFinishingRef.current = false;
              setScriptGenerationProgress(0);
            }
          },
          onDone: async (event) => {
            if (generationSeq !== activeScriptGenerationSeqRef.current) return;
            const completed = Number(event?.data?.completed);
            const total = Number(event?.data?.total);
            if (Number.isFinite(completed) && completed >= 0) {
              setScriptGenerationCompletedCount(Math.max(0, Math.round(completed)));
            }
            if (Number.isFinite(total) && total > 0) {
              setScriptGenerationTotalCount(Math.max(1, Math.round(total)));
            }
            updateTask(scriptQueueTaskId, {
              status: sawVariant ? 'success' : 'failed',
              result: sawVariant
                ? {
                  completed: Number.isFinite(completed) ? Math.round(completed) : undefined,
                  total: Number.isFinite(total) ? Math.round(total) : undefined,
                }
                : { error: 'NO_SCRIPT_VARIANT' },
              navigateTo: { view: 'workbench', focus: 'scripts' },
            });
            setIsScriptGenerationProgressVisible(false);
          },
          onErrorEvent: (event) => {
            streamFailedMessage = String(event?.message || t.wb_popup_script_unexpected || '生成失败');
          },
        },
        { signal: abortController.signal }
      );
      if (generationSeq !== activeScriptGenerationSeqRef.current) return;
      if (streamFailedMessage) {
        throw new Error(streamFailedMessage);
      }
      if (!sawVariant) {
        updateTask(scriptQueueTaskId, {
          status: 'failed',
          result: { error: 'NO_SCRIPT_VARIANT' },
          navigateTo: { view: 'workbench', focus: 'scripts' },
        });
        openInfo(popupTitles.notice, t.wb_popup_script_unexpected);
      }

    } catch (err: any) {
      if (isAbortError(err)) {
        return;
      }
      if (generationSeq !== activeScriptGenerationSeqRef.current) {
        return;
      }
      console.error("Script Gen Error:", err);
      const message = err instanceof Error && err.message.trim()
        ? err.message.trim()
        : (t.wb_popup_script_unexpected || '生成失败');
      updateTask(scriptQueueTaskId, {
        status: 'failed',
        result: { error: message },
        navigateTo: { view: 'workbench', focus: 'scripts' },
      });
      openErrorModal(err, { category: 'script_failed', onRetry: handleGenerateScripts });
    } finally {
      try {
        window.localStorage.removeItem(SCRIPT_GEN_IN_PROGRESS_KEY);
      } catch {
      }
      if (scriptGenerationAbortRef.current === abortController) {
        scriptGenerationAbortRef.current = null;
      }
      scriptGenerationStartedAtRef.current = null;
      scriptGenerationEstimateKeyRef.current = null;
      if (generationSeq === activeScriptGenerationSeqRef.current) {
        scriptGenerationProjectIdRef.current = null;
        setIsGeneratingScript(false);
        if (shouldHideProgressImmediately) {
          setIsScriptGenerationProgressVisible(false);
          setScriptGenerationProgress(0);
        }
        setScriptGenerationCompletedCount(0);
        setScriptGenerationTotalCount(0);
      }
      if (currentScriptQueueTaskIdRef.current === scriptQueueTaskId) {
        currentScriptQueueTaskIdRef.current = null;
      }
      scriptGenerationFinishingRef.current = false;
      scriptGenerationLockRef.current = false;
    }
  };

  handleGenerateScriptsRef.current = () => {
    void handleGenerateScripts();
  };

  const handleScriptPageChange = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= scriptPages.length) return;

    setScriptPages(prev => {
      const next = [...prev];
      next[activeScriptPage] = { ...next[activeScriptPage], scripts: scripts };
      return next;
    });

    setActiveScriptPage(nextIndex);

    setScripts(scriptPages[nextIndex]?.scripts || []);
    const nextPageId = scriptPages[nextIndex]?.id;
    const nextStoryboardEnabled = nextPageId ? !!storyboardEditorEnabledByPage[nextPageId] : false;
    const nextShotBreakdownOpen = nextPageId ? !!shotBreakdownOpenByPage[nextPageId] : false;
    setEnableStoryboardEditor(nextStoryboardEnabled);
    setIsShotBreakdownOpen(nextShotBreakdownOpen);
  };

  useEffect(() => {
    if (activeScriptPage >= scriptPages.length && scriptPages.length > 0) {
      const lastIndex = scriptPages.length - 1;
      setActiveScriptPage(lastIndex);
      setScripts(scriptPages[lastIndex].scripts || []);
    }
  }, [activeScriptPage, scriptPages]);

  useEffect(() => {
    if (!isDemoScriptsRef.current) return;
    const isDemo = scripts.length === 2 && scripts[0].id === 1 && scripts[1].id === 2;

    if (isDemo) {
      console.log('isDemo', isDemo);
      const newDemo = buildDemoScripts();
      setScripts(newDemo);
      setScriptPages(prev => {
        const next = [...prev];
        if (next[0]) {
          next[0] = { ...next[0], scripts: newDemo };
        }
        return next;
      });
    }
  }, [t, buildDemoScripts, scripts.length]);

  const formatI18nTemplate = (template: string, vars: Record<string, string | number>) =>
    template.replace(/\{(\w+)\}/g, (match, key) => (Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match));

  const validateGenerateRequirements = () => {
    const issues: string[] = [];

    if (reuseQueueEnabled) {
      if (selectedModel === 'kling') {
        issues.push('Kling 当前版本暂不支持批量复用队列生成。');
      }
      if (assetQueue.length === 0 && scriptQueue.length === 0) {
        issues.push(t.wb_reuse_queue_enable_hint || 'Batch mode is on: add both assets and scripts into queues before generating.');
      }
      if (assetQueue.length === 0 || scriptQueue.length === 0) {
        issues.push(t.wb_reuse_queue_pairing_hint || 'Reuse Queue: batch generation requires both asset queue and script queue.');
      }
      if (!user?.id) {
        issues.push(t.wb_gen_req_issue_login_batch || 'Account: please sign in before starting batch generation.');
      }
      return issues;
    }

    if (!selectedTemplate?.id && !selectedFileObj && !selectedAssetUrl && !uploadedFile) {
      issues.push(t.wb_gen_req_issue_asset_or_template || 'Assets: upload an asset or select a template first.');
    }
    if (selectedModel === 'kling') {
      const imageAssets = normalizeQueueSourcesForKlingMode(
        uploadDisplayAssets.filter((asset) => asset.mediaKind === 'image'),
        klingGenerateMode
      );
      const firstFrameCount = imageAssets.filter((asset) => asset.source === 'product').length;
      const tailFrameCount = imageAssets.filter((asset) => asset.source === 'tail').length;
      const subjectCount = imageAssets.filter((asset) => asset.source === 'subject').length;
      const referenceCount = imageAssets.filter((asset) => asset.source === 'preference').length;

      if (klingGenerateMode === 'first_frame' && firstFrameCount !== 1) {
        issues.push(t.wb_kling_validation_first_frame_exactly_one || 'Kling first-frame mode requires exactly 1 first-frame image.');
      }
      if (klingGenerateMode === 'subject' && subjectCount !== 1) {
        issues.push(t.wb_kling_validation_subject_exactly_one || 'Kling subject mode requires exactly 1 subject image.');
      }
      if (klingGenerateMode === 'first_last_frame' && (firstFrameCount !== 1 || tailFrameCount !== 1)) {
        issues.push(t.wb_kling_first_last_frame_need_generate || 'Please click "Generate First + Last Frames From Reference" and wait for both frames before generating the video.');
      }
      if (klingGenerateMode === 'subject' && referenceCount < 1) {
        issues.push(t.wb_kling_validation_subject_reference_range || 'Kling subject mode requires 1 to 3 additional reference images.');
      }
      if (klingGenerateMode === 'subject' && referenceCount > 3) {
        issues.push(t.wb_kling_validation_subject_reference_max || 'Kling subject mode allows at most 3 additional reference images.');
      }
      if (klingGenerateMode === 'first_frame' && firstFrameCount + referenceCount > 7) {
        issues.push(t.wb_kling_validation_reference_max || 'Kling allows at most 7 total reference images.');
      }
    }
    if (!hasActiveScriptConcept) {
      issues.push(t.wb_gen_req_issue_master_script_missing);
    }
    if (enableStoryboardEditor && !isDurationValid) {
      const template = t.wb_gen_req_issue_duration_mismatch || 'Storyboard: total shot duration ({scriptDuration}s) must match configured duration ({configDuration}s).';
      issues.push(
        formatI18nTemplate(template, {
          scriptDuration: currentScriptDuration.toFixed(1),
          configDuration: genDuration,
        })
      );
    }
    if (!selectedTemplate?.id && !user?.id) {
      issues.push(t.wb_gen_req_issue_login || 'Account: please sign in.');
    }

    return issues;
  };

  const showGenerateValidationIssues = (issues: string[]) => {
    if (issues.length === 0) return;
    const details = issues.map((item, index) => `${index + 1}. ${item}`).join('\n');
    const title = t.wb_gen_req_title || 'Generation requirements not met';
    const intro = t.wb_gen_req_intro || 'Please fix the following issues:';
    openInfo(title, `${intro}\n${details}`);
  };

  const computeDurationFromScripts = (items: ScriptItem[]) =>
    items.reduce((total, s) => total + (parseFloat(String(s.dur || '').replace('s', '')) || 0), 0);

  const buildQueuedScriptFromPage = (page: ScriptPage, storyboardEnabled = enableStoryboardEditor): QueuedScript => {
    const duration = storyboardEnabled ? computeDurationFromScripts(page.scripts || []) : genDuration;
    const idx = Math.max(0, scriptPages.findIndex((p) => p.id === page.id));
    return {
      id: page.id,
      name: formatScriptPageDisplayName(page.name, idx, t.wb_script_page_prefix),
      scripts: page.scripts || [],
      duration,
      fullScript: page.fullScript,
      creativeCard: page.creativeCard,
      creativeCardText: page.creativeCardText,
    };
  };

  const validateScriptPageBatchGenerateRequirements = (items: typeof scriptPageBatchGenerateItems) => {
    const issues: string[] = [];
    if (!selectedTemplate?.id && !selectedFileObj && !selectedAssetUrl && !uploadedFile && uploadDisplayAssets.length === 0) {
      issues.push(t.wb_gen_req_issue_asset_or_template || 'Assets: upload an asset or select a template first.');
    }
    if (!selectedTemplate?.id && !user?.id) {
      issues.push(t.wb_gen_req_issue_login || 'Account: please sign in.');
    }
    items.forEach((item) => {
      const hasScriptConcept = Boolean((item.page.fullScript || '').trim())
        || Boolean((item.page.creativeCardText || '').trim())
        || (item.page.scripts || []).some((script) => Boolean((script.visual || script.audio || '').trim()));
      if (!hasScriptConcept) {
        const name = formatScriptPageDisplayName(item.page.name, item.pageIndex, t.wb_script_page_prefix);
        issues.push(`${name}: ${t.wb_gen_req_issue_master_script_missing || 'Please generate or complete the script plan.'}`);
      }
      if (item.storyboardEnabled && Math.abs(item.duration - genDuration) >= 0.1) {
        const template = t.wb_gen_req_issue_duration_mismatch || 'Storyboard: total shot duration ({scriptDuration}s) must match configured duration ({configDuration}s).';
        const name = formatScriptPageDisplayName(item.page.name, item.pageIndex, t.wb_script_page_prefix);
        issues.push(`${name}: ${formatI18nTemplate(template, {
          scriptDuration: item.duration.toFixed(1),
          configDuration: genDuration,
        })}`);
      }
    });
    return issues;
  };

  const handleScriptPageBatchGenerateSubmit = async () => {
    if (scriptPageBatchGenerateItems.length === 0) {
      openInfo(popupTitles.notice, t.wb_generate_at_least_one_video || '请至少生成一个视频');
      return;
    }

    const issues = validateScriptPageBatchGenerateRequirements(scriptPageBatchGenerateItems);
    if (issues.length > 0) {
      showGenerateValidationIssues(issues);
      return;
    }

    const generationJobs = scriptPageBatchGenerateItems.flatMap((item) => (
      Array.from({ length: item.count }, (_, copyIndex) => ({ ...item, copyIndex }))
    ));

    setIsGenerating(true);
    setGeneratedVideoUrl(null);

    try {
      const basePayload = await buildSingleGeneratePayload();
      let createdCount = 0;

      for (let i = 0; i < generationJobs.length; i += 1) {
        const job = generationJobs[i];
        const page = job.page;
        const scriptPack = buildQueuedScriptFromPage(page, job.storyboardEnabled);

        let newProjectId: string | undefined;
        if (selectedTemplate?.id) {
          const cloneResp = await videoApi.cloneProject(selectedTemplate.id);
          newProjectId = cloneResp?.data?.new_project_id || cloneResp?.new_project_id || cloneResp?.data?.id;
          if (!newProjectId) throw new Error('Failed to clone project');
        } else {
          if (!user?.id) throw new Error('请先登录');
          const createResp = await videoApi.createProject(user.id, {
            title: (productName || '').trim() || `${fileName || 'Video'} × ${scriptPack.name}${job.count > 1 ? ` #${job.copyIndex + 1}` : ''}`,
            aspect_ratio: aspectRatio || selectedTemplate?.aspect_ratio || '9:16',
            script_content: {
              duration: scriptPack.duration,
              shots: job.storyboardEnabled ? scriptPack.scripts : [],
            },
          });
          newProjectId = createResp?.data?.id || createResp?.data?.project_id || createResp?.id;
          if (!newProjectId) throw new Error('Failed to create project');
        }

        const combinedScriptPrompt = buildCombinedScriptPrompt(
          scriptPack.fullScript || '',
          scriptPack.creativeCard,
          scriptPack.scripts,
          scriptPack.creativeCardText || ''
        );

        const requestPayload: GeneratePayload = {
          ...basePayload,
          prompt: combinedScriptPrompt,
          duration: scriptPack.duration,
          project_id: String(newProjectId),
        };

        const genResp = await generateWithAdaptiveImageConfirm(requestPayload);
        const taskId = genResp?.data?.task_id || genResp?.task_id;
        const projectId = genResp?.data?.project_id || newProjectId;

        if (genResp?.code === 0 && taskId) {
          const estimatedSeconds = await fetchEstimatedSeconds({
            model: backendModel,
            duration: Number(requestPayload.duration ?? genDuration),
            sound: String(requestPayload.sound || '') === 'off' ? 'off' : 'on',
            aspect_ratio: String(requestPayload.aspect_ratio || ''),
            resolution: String((requestPayload as any).resolution || (requestPayload as any).size || ''),
          });

          addTask({
            id: taskId,
            projectId: String(projectId),
            workbenchProjectId: projectStore.currentProjectId,
            estimatedSeconds,
            type: 'video_generation',
            status: 'processing',
            name: `${(productName || '').trim() || fileName || 'Video'} · ${scriptPack.name}${job.count > 1 ? ` #${job.copyIndex + 1}` : ''}`,
            thumbnail: uploadedFile || undefined,
            createdAt: Date.now(),
          });

          createdCount += 1;
        }
      }

      if (createdCount > 0) {
        openInfo(popupTitles.success, formatMessage(t.wb_popup_batch_success, { count: createdCount }));
      } else {
        openInfo(popupTitles.notice, t.wb_popup_batch_no_task_id);
      }
    } catch (err: any) {
      if (err?.message === USER_CANCELLED_ADAPT) {
        openInfo(popupTitles.notice, t.wb_popup_batch_cancelled);
      } else {
        openErrorModal(err, { category: 'generation_failed', onRetry: handleScriptPageBatchGenerateSubmit });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const patchReplayBatchItem = (itemId: string, patch: Partial<ReplayBatchItem>) => {
    setReplayBatchRun((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
      };
    });
  };

  const patchReplayReverse = (patch: Partial<ReplayBatchRun['reverse']>) => {
    setReplayBatchRun((prev) => prev ? { ...prev, reverse: { ...prev.reverse, ...patch } } : prev);
  };

  const buildReplayPrompt = (basePrompt: string, label: string) => {
    const productLabel = (productName || '').trim() || 'xx产品';
    return [
      String(basePrompt || '').replace(/xx产品/g, productLabel).trim(),
      productName.trim() ? `商品名称：${productName.trim()}` : '',
      productCategory.trim() ? `商品品类：${productCategory.trim()}` : '',
      coreSellingPoints.trim() ? `核心卖点：${coreSellingPoints.trim()}` : '',
      targetAudience.trim() ? `目标人群：${targetAudience.trim()}` : '',
      `生成来源：${label}`,
      '只使用用户上传的商品图片和已选虚拟模特作为视觉参考，不要把参考广告视频作为 Seedance 生成素材。',
    ].filter(Boolean).join('\n');
  };

  const resolveReplayGenerationAssets = async () => {
    const productImageAssets = uploadDisplayAssets.filter((asset) => asset.mediaKind === 'image' && asset.materialType !== 'model');
    const modelAssets = uploadDisplayAssets.filter((asset) => asset.mediaKind === 'image' && asset.materialType === 'model');
    const videoAssets = uploadDisplayAssets.filter((asset) => asset.mediaKind === 'video');
    const pathUpdates: Record<string, string> = {};
    const productImagePaths: string[] = [];
    const seedanceImagePaths: string[] = [];
    const imageAssetsMeta: Array<{ path: string; material_type: string; seedance_asset_id?: string; frame_role?: string | null }> = [];

    for (const imageAsset of productImageAssets) {
      let resolvedPath = imageAsset.uploadedPath || imageAsset.assetUrl || null;
      if (!resolvedPath && imageAsset.fileObj) {
        const uploadResp = await assetsApi.uploadTempAsset(imageAsset.fileObj);
        resolvedPath = extractUploadedAssetPath(uploadResp);
      }
      if (!resolvedPath) continue;
      productImagePaths.push(resolvedPath);
      seedanceImagePaths.push(resolvedPath);
      imageAssetsMeta.push({
        path: resolvedPath,
        material_type: imageAsset.materialType || 'product',
        frame_role: imageAsset.frameRole === '首帧' ? 'first_frame' : imageAsset.frameRole === '尾帧' ? 'last_frame' : null,
      });
      if (imageAsset.id && imageAsset.id !== 'current-upload') {
        pathUpdates[imageAsset.id] = resolvedPath;
      }
    }

    for (const modelAsset of modelAssets) {
      const seedanceAssetId = String(modelAsset.seedanceAssetId || '').trim();
      if (!seedanceAssetId) {
        throw new Error(t.wb_replay_error_model_missing_seedance_id || '该虚拟模特缺少 Seedance 资产 ID，无法用于爆款复刻生成。');
      }
      const resolvedPath = modelAsset.uploadedPath || modelAsset.assetUrl || modelAsset.previewUrl || `asset://${seedanceAssetId}`;
      seedanceImagePaths.push(resolvedPath);
      imageAssetsMeta.push({
        path: resolvedPath,
        material_type: 'model',
        seedance_asset_id: seedanceAssetId,
        frame_role: null,
      });
    }

    if (Object.keys(pathUpdates).length > 0) {
      setAssetQueue((prev) => prev.map((item) => pathUpdates[item.id] ? { ...item, uploadedPath: pathUpdates[item.id] } : item));
    }

    return {
      productImagePaths,
      seedanceImagePaths,
      imageAssetsMeta,
      modelAssetIds: modelAssets.map((asset) => String(asset.seedanceAssetId || '').trim()).filter(Boolean),
      referenceVideoAsset: videoAssets[0] || null,
    };
  };

  const buildReplayReversePayload = (referenceVideoAsset: QueuedAsset, debugTraceId: string) => {
    if (referenceVideoAsset.fileObj) {
      const formData = new FormData();
      formData.append('video_file', referenceVideoAsset.fileObj, referenceVideoAsset.fileObj.name || referenceVideoAsset.name || 'reference.mp4');
      formData.append('user_language', language);
      formData.append('debug_trace_id', debugTraceId);
      formData.append('debug', 'true');
      if (productName.trim()) formData.append('product_name', productName.trim());
      if (productCategory.trim()) formData.append('product_category', productCategory.trim());
      if (coreSellingPoints.trim()) formData.append('core_selling_points', coreSellingPoints.trim());
      if (targetAudience?.trim()) formData.append('target_audience', targetAudience.trim());
      return formData;
    }

    const videoPath = String(referenceVideoAsset.uploadedPath || referenceVideoAsset.assetUrl || '').trim();
    if (!videoPath) {
      throw new Error(t.wb_replay_error_reference_video_unreadable || '无法读取参考广告视频');
    }
    const productExtra = {
      ...(productName.trim() ? { product_name: productName.trim() } : {}),
      ...(productCategory.trim() ? { product_category: productCategory.trim() } : {}),
      ...(coreSellingPoints.trim() ? { core_selling_points: coreSellingPoints.trim() } : {}),
      ...(targetAudience?.trim() ? { target_audience: targetAudience.trim() } : {}),
    };
    if (/^https?:\/\//i.test(videoPath)) {
      return { video_url: videoPath, user_language: language, debug_trace_id: debugTraceId, debug: true, ...productExtra };
    }
    return { video_path: videoPath, user_language: language, debug_trace_id: debugTraceId, debug: true, ...productExtra };
  };

  const handleReplayBatchGenerateSubmit = async () => {
    if (!requireAuth()) return;

    const imageCount = uploadDisplayAssets.filter((asset) => asset.mediaKind === 'image' && asset.materialType !== 'model').length;
    const videoCount = uploadDisplayAssets.filter((asset) => asset.mediaKind === 'video').length;
    const issues: string[] = [];
    if (!productName.trim()) issues.push(t.wb_required_product_name || '请填写商品名称');
    if (!productCategory.trim()) issues.push(t.wb_required_product_category || '请填写商品品类');
    if (!coreSellingPoints.trim()) issues.push(t.wb_required_core_selling_points || '请填写核心卖点');
    if (imageCount <= 0) issues.push(t.wb_replay_error_missing_product_image || '请上传至少 1 张商品图片');
    if (videoCount <= 0) issues.push(t.wb_replay_error_missing_reference_video || '请上传 1 个参考广告视频');
    if (videoCount > 1) issues.push(t.wb_replay_error_single_reference_video || '爆款复刻模式只支持 1 个参考广告视频');
    if (seedanceReplayValidation.hasBlockingIssues) {
      issues.push(...seedanceReplayValidation.imageErrors, ...seedanceReplayValidation.videoErrors, ...seedanceReplayValidation.audioErrors, ...seedanceReplayValidation.globalErrors);
    }
    if (replayTotalGenerateCount <= 0) issues.push(t.wb_replay_error_zero_total || '请至少设置生成 1 条视频');

    if (issues.length > 0) {
      showGenerateValidationIssues(Array.from(new Set(issues.filter(Boolean))));
      if (imageCount <= 0) focusSeedanceReplayValidationTarget('image');
      else if (videoCount !== 1) focusSeedanceReplayValidationTarget('video');
      return;
    }

    setIsGenerating(true);
    setGeneratedVideoUrl(null);

    const runId = `replay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const templateJobs = REPLAY_SCRIPT_TEMPLATES.flatMap((template) => (
      Array.from({ length: normalizeBatchGenerateCount(replayTemplateCountsById[template.id]) }, (_, copyIndex) => ({ template, copyIndex }))
    ));
    const userReferenceJobs = Array.from({ length: normalizeBatchGenerateCount(replayUserReferenceGenerateCount) }, (_, copyIndex) => ({ copyIndex }));
    const initialItems: ReplayBatchItem[] = [
      ...templateJobs.map(({ template, copyIndex }) => ({
        id: `${runId}-tpl-${template.id}-${copyIndex}`,
        label: `${template.title}${templateJobs.length > 1 ? ` #${copyIndex + 1}` : ''}`,
        source: 'template' as const,
        templateId: template.id,
        copyIndex,
        status: 'queued' as const,
      })),
      ...userReferenceJobs.map(({ copyIndex }) => ({
        id: `${runId}-ref-${copyIndex}`,
        label: `${t.wb_replay_user_reference_generation || '用户参考脚本生成'} #${copyIndex + 1}`,
        source: 'user_reference' as const,
        copyIndex,
        status: 'queued' as const,
      })),
    ];

    setReplayBatchRun({
      id: runId,
      expanded: true,
      startedAt: Date.now(),
      totalVideos: replayTotalGenerateCount,
      userReferenceCount: userReferenceJobs.length,
      templateVideoCount: templateJobs.length,
      reverse: {
        status: userReferenceJobs.length > 0 ? 'queued' : 'idle',
        progress: 0,
        detail: userReferenceJobs.length > 0 ? (t.wb_replay_reverse_queued || '等待逆向解析参考广告') : undefined,
      },
      items: initialItems,
    });

    try {
      const { productImagePaths, seedanceImagePaths, imageAssetsMeta, modelAssetIds, referenceVideoAsset } = await resolveReplayGenerationAssets();
      if (productImagePaths.length === 0) throw new Error(t.wb_replay_error_missing_product_image || '请上传至少 1 张商品图片');
      if (!referenceVideoAsset) throw new Error(t.wb_replay_error_missing_reference_video || '请上传 1 个参考广告视频');

      const submitReplayVideo = async (params: {
        itemId: string;
        label: string;
        prompt: string;
        source: 'template' | 'user_reference';
        copyIndex: number;
        templateId?: string;
      }) => {
        patchReplayBatchItem(params.itemId, {
          status: 'submitting',
          detail: t.wb_replay_submitting || '提交中',
        });

        try {
          const createResp = await videoApi.createProject(user!.id, {
            title: `${(productName || '').trim() || 'Replay'} · ${params.label}`,
            aspect_ratio: aspectRatio,
            script_content: {
              duration: genDuration,
              shots: [],
              replay_source: params.source,
              prompt: params.source === 'template' ? params.prompt : '',
              prompt_hidden: params.source === 'user_reference',
              replay_template_id: params.templateId || null,
            },
          });
          const newProjectId = createResp?.data?.id || createResp?.data?.project_id || createResp?.id;
          if (!newProjectId) throw new Error('Failed to create project');

          const requestPayload: GeneratePayload = {
            model: 'seedance-2.0',
            prompt: params.prompt,
            product_name: productName,
            duration: Math.max(4, Math.min(15, Math.round(Number(genDuration) || 8))),
            aspect_ratio: aspectRatio,
            sound: soundSetting,
            asset_source: 'product',
            pricing_mode: 'replay',
            user_language: language,
            target_language: targetLanguage,
            debug: true,
            debug_trace_id: runId,
            replay_batch_role: params.source === 'template' ? 'template' : 'qwen_reverse',
            replay_template_id: params.templateId || null,
            replay_copy_index: params.copyIndex,
            replay_item_label: params.label,
            replay_model_asset_ids: modelAssetIds,
            reference_video_sent_to_seedance: false,
            model_asset_id: null,
            motion_asset_id: null,
            project_id: String(newProjectId),
            image_path: seedanceImagePaths[0],
            ...(seedanceImagePaths.length > 1 ? { image_paths: seedanceImagePaths } : {}),
            ...(imageAssetsMeta.length > 0 ? { image_assets_meta: imageAssetsMeta } : {}),
          };

          const genResp = await generateWithAdaptiveImageConfirm(requestPayload);
          const taskId = genResp?.data?.task_id || genResp?.task_id;
          const projectId = genResp?.data?.project_id || newProjectId;
          if (!taskId) throw new Error(t.wb_popup_batch_no_task_id || '任务提交成功但没有返回 task_id');

          const estimatedSeconds = await fetchEstimatedSeconds({
            model: 'seedance-2.0',
            duration: Number(requestPayload.duration ?? genDuration),
            sound: String(requestPayload.sound || '') === 'off' ? 'off' : 'on',
            aspect_ratio: String(requestPayload.aspect_ratio || ''),
            resolution: String((requestPayload as any).resolution || ''),
          });

          addTask({
            id: taskId,
            projectId: String(projectId),
            workbenchProjectId: projectStore.currentProjectId,
            estimatedSeconds,
            type: 'video_generation',
            status: 'processing',
            name: params.label,
            thumbnail: uploadDisplayAssets.find((asset) => asset.mediaKind === 'image')?.previewUrl || uploadedFile || undefined,
            createdAt: Date.now(),
            result: {
              replay_source: params.source,
              copyIndex: params.copyIndex,
            },
          });
          patchReplayBatchItem(params.itemId, {
            status: 'processing',
            taskId,
            projectId: String(projectId),
            detail: t.wb_status_processing || '进行中',
          });
        } catch (error: any) {
          const message = error?.message || String(error || t.wb_popup_submit_failed || '提交失败');
          patchReplayBatchItem(params.itemId, {
            status: 'failed',
            error: message,
            detail: message,
          });
        }
      };

      let reverseProgressTimer: number | null = null;
      const reversePromise = (async () => {
        if (userReferenceJobs.length === 0) return;
        patchReplayReverse({ status: 'processing', progress: 8, detail: t.wb_replay_reverse_processing || '正在逆向解析参考广告脚本' });
        reverseProgressTimer = window.setInterval(() => {
          setReplayBatchRun((prev) => {
            if (!prev || prev.reverse.status !== 'processing') return prev;
            return {
              ...prev,
              reverse: {
                ...prev.reverse,
                progress: Math.min(88, Math.max(prev.reverse.progress + 2, prev.reverse.progress * 1.03)),
              },
            };
          });
        }, 1000);

        try {
          const reverseResp = await videoApi.reverseScriptFromVideo(user!.id, buildReplayReversePayload(referenceVideoAsset, runId));
          const reverseData: any = reverseResp?.data || {};
          const reversePrompt = String(
            reverseData.seedancePrompt
            || reverseData.seedance_prompt
            || reverseData.suggestedPrompt
            || reverseData.styleReferenceText
            || ''
          ).trim();
          if (!reversePrompt) throw new Error(t.wb_replay_reverse_empty_prompt || '参考广告解析完成，但没有返回可用脚本');
          patchReplayReverse({ status: 'success', progress: 100, detail: t.wb_replay_reverse_done || '脚本逆向解析完成', scriptBrief: '' });

          for (const { copyIndex } of userReferenceJobs) {
            const itemId = `${runId}-ref-${copyIndex}`;
            await submitReplayVideo({
              itemId,
              label: `${t.wb_replay_user_reference_generation || '用户参考脚本生成'} #${copyIndex + 1}`,
              prompt: buildReplayPrompt(reversePrompt, t.wb_replay_user_reference_generation || '用户参考脚本生成'),
              source: 'user_reference',
              copyIndex,
            });
          }
        } catch (error: any) {
          const message = error?.message || String(error || t.wb_replay_reverse_failed || '参考广告解析失败');
          patchReplayReverse({ status: 'failed', progress: 100, error: message, detail: message });
          userReferenceJobs.forEach(({ copyIndex }) => {
            patchReplayBatchItem(`${runId}-ref-${copyIndex}`, {
              status: 'failed',
              error: message,
              detail: message,
            });
          });
        } finally {
          if (reverseProgressTimer !== null) {
            window.clearInterval(reverseProgressTimer);
          }
        }
      })();

      for (const { template, copyIndex } of templateJobs) {
        await submitReplayVideo({
          itemId: `${runId}-tpl-${template.id}-${copyIndex}`,
          label: `${template.title}${normalizeBatchGenerateCount(replayTemplateCountsById[template.id]) > 1 ? ` #${copyIndex + 1}` : ''}`,
          prompt: buildReplayPrompt(template.prompt, template.title),
          source: 'template',
          copyIndex,
          templateId: template.id,
        });
      }

      await reversePromise;
      openInfo(popupTitles.success, formatMessage(t.wb_replay_batch_submitted || '已提交 {count} 条视频生成任务。', { count: replayTotalGenerateCount }));
    } catch (error: any) {
      const message = error?.message || String(error || t.wb_popup_submit_failed || '提交失败');
      openErrorModal(error, { category: 'generation_failed', onRetry: handleReplayBatchGenerateSubmit });
      setReplayBatchRun((prev) => prev ? {
        ...prev,
        reverse: prev.reverse.status === 'processing' || prev.reverse.status === 'queued'
          ? { ...prev.reverse, status: 'failed', progress: 100, error: message, detail: message }
          : prev.reverse,
        items: prev.items.map((item) => item.status === 'queued' || item.status === 'submitting'
          ? { ...item, status: 'failed', error: message, detail: message }
          : item),
      } : prev);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!requireAuth()) return;
    if (isSeedanceReplayMode) {
      await handleReplayBatchGenerateSubmit();
      return;
    }
    await handleScriptPageBatchGenerateSubmit();
  };

  const handlePublishToTikTok = async () => {
    if (!generatedVideoUrl) {
      openInfo(popupTitles.notice, t.wb_popup_need_preview_video);
      return;
    }

    const targetProjectId = previewProjectId || lastGeneratedProjectId;
    if (!targetProjectId) {
      openInfo(popupTitles.notice, t.wb_popup_no_video_project);
      return;
    }

    const authPopup = openTikTokAuthPopup({
      loadingTitle: t.app_tiktok_popup_loading_title,
      loadingDescription: t.app_tiktok_popup_loading_desc,
    });

    setIsPostingTikTok(true);
    try {
      let isAuthorized = false;
      let tiktokUserInfo = null;
      try {
        const status = await tiktokApi.getStatus();
        isAuthorized = status?.data?.authorized || false;
        tiktokUserInfo = status?.data?.tiktok_user || null;
      } catch (err: any) {
        console.log('[TikTok] Status check failed, need authorization:', err);
        isAuthorized = false;
      }

      if (!isAuthorized) {
        const authUrl = await tiktokApi.getAuthUrl(targetProjectId);
        const popupWindow = navigateTikTokAuthPopup(authPopup, authUrl);
        if (!popupWindow) {
          openInfo(popupTitles.notice, t.app_tiktok_popup_blocked);
        }
        return;
      }

      let confirmMessage = '确认上传视频到TikTok草稿箱？\n\n';
      if (tiktokUserInfo && tiktokUserInfo.display_name) {
        confirmMessage += `当前授权账号: ${tiktokUserInfo.display_name}\n\n`;
        confirmMessage += '点击"确定"继续上传，点击"取消"可切换账号';
      } else {
        confirmMessage += '视频将上传到已授权的TikTok账号\n\n';
        confirmMessage += '点击"取消"可切换账号';
      }

      const userConfirmed = await openConfirm('Upload to TikTok', confirmMessage);
      if (!userConfirmed) {
        const switchAccount = await openConfirm(
          'Switch TikTok Account',
          '是否要切换TikTok账号？\n\n点击"确定"后：\n1. 系统将取消当前授权\n2. 跳转到TikTok授权页面\n3. 如需切换到其他账号，请在TikTok页面先退出当前账号，再登录新账号\n4. 授权成功后视频将自动上传到新账号的草稿箱'
        );
        if (switchAccount) {
          try {
            await tiktokApi.revokeAuth();
            const authUrl = await tiktokApi.getAuthUrl(targetProjectId);
            const popupWindow = navigateTikTokAuthPopup(authPopup, authUrl);
            if (!popupWindow) {
              openInfo(popupTitles.notice, t.app_tiktok_popup_blocked);
              return;
            }
            openInfo(popupTitles.notice, t.wb_popup_tiktok_switch_cancelled);
            return;
          } catch (err: any) {
            closeTikTokAuthPopup(authPopup);
            openErrorModal(err, { category: 'upload_failed' });
          }
        }
        closeTikTokAuthPopup(authPopup);
        setIsPostingTikTok(false);
        return;
      }

      const result = await tiktokApi.publishDraft(targetProjectId);
      if (result.requiresAuth) {
        const authUrl = result.authUrl || await tiktokApi.getAuthUrl(targetProjectId);
        const popupWindow = navigateTikTokAuthPopup(authPopup, authUrl);
        if (!popupWindow) {
          openInfo(popupTitles.notice, t.app_tiktok_popup_blocked);
        }
        return;
      }

      closeTikTokAuthPopup(authPopup);
      openInfo(popupTitles.success, t.wb_popup_tiktok_upload_success);
    } catch (err: any) {
      closeTikTokAuthPopup(authPopup);
      openErrorModal(err, { category: 'upload_failed', onRetry: handlePublishToTikTok });
    } finally {
      setIsPostingTikTok(false);
    }
  };

  const toggleVideoPlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      const p = video.play();
      if (p && typeof (p as Promise<void>).catch === 'function') p.catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  };

  const skipVideoTime = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;

    const next = Math.max(0, video.currentTime + seconds);
    if (Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = Math.min(next, video.duration);
    } else {
      video.currentTime = next;
    }
  };


  useEffect(() => {
    if (!isSeedanceReplayMode || !seedanceReplayValidation.hasBlockingIssues) {
      setSeedanceReplayFocusTarget(null);
    }
  }, [isSeedanceReplayMode, seedanceReplayValidation.hasBlockingIssues]);
  useEffect(() => () => {
    if (assetLibraryUploadSummaryToastTimerRef.current) {
      window.clearTimeout(assetLibraryUploadSummaryToastTimerRef.current);
      assetLibraryUploadSummaryToastTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setGenDuration((prev) => normalizeDurationForModel(prev, selectedModel));
  }, [normalizeDurationForModel, selectedModel]);

  const backendModel =
    selectedModel === 'sora2pro'
      ? 'sora-2-pro'
      : selectedModel === 'sora2'
        ? 'sora-2'
        : selectedModel === 'kling'
          ? 'kling'
          : 'seedance-2.0';

  const fetchEstimatedSeconds = useCallback(async (params: { model: string; duration: number; sound: 'on' | 'off'; aspect_ratio?: string; resolution?: string }) => {
    const model = String(params.model || '').trim();
    const duration = Number(params.duration);
    const sound = params.sound;
    const aspectRatioHint = String(params.aspect_ratio || '').trim();
    const resolutionHint = String(params.resolution || '').trim();

    const timeoutMs = 1200;

    try {
      const resp: any = await Promise.race([
        videoApi.estimateVideoTime({ model, duration, sound, aspect_ratio: aspectRatioHint || undefined, resolution: resolutionHint || undefined }),
        new Promise((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
      ]);

      const estimated = Number(resp?.data?.estimated_seconds);
      if (Number.isFinite(estimated) && estimated > 0) {
        const val = Math.round(estimated);
        console.log('[Estimate] from api', { model, duration, sound, aspect_ratio: aspectRatioHint, resolution: resolutionHint, estimated_seconds: val, sample_count: resp?.data?.sample_count });
        return val;
      }

      console.log('[Estimate] fallback default (invalid response)', { model, duration, sound, aspect_ratio: aspectRatioHint, resolution: resolutionHint, resp });
    } catch (err) {
      console.log('[Estimate] fallback default (error)', { model, duration, sound, aspect_ratio: aspectRatioHint, resolution: resolutionHint, err });
    }

    return 120;
  }, []);

  const isScriptGenerationForCurrentProject = (
    isGeneratingScript
    && !!scriptGenerationProjectIdRef.current
    && scriptGenerationProjectIdRef.current === projectStore.currentProjectId
  );
  const showScriptGenerationProgressForCurrentProject = (
    isScriptGenerationProgressVisible
    && !!scriptGenerationProjectIdRef.current
    && scriptGenerationProjectIdRef.current === projectStore.currentProjectId
  );

  const renderLeftColumn = () => {
    const segmentBase =
      'group/seg relative flex-1 py-2.5 rounded-lg text-[11px] tracking-tight font-bold transition select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60';
    const activeSegment = 'bg-gradient-to-r from-purple-600 to-orange-500 text-white shadow-lg shadow-orange-500/15';
    const inactiveSegment = 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5';

    const tooltipBase =
      'pointer-events-none absolute top-full mt-2 w-[250px] rounded-2xl border border-white/25 bg-zinc-950/90 p-3 text-left opacity-0 shadow-2xl shadow-black/40 backdrop-blur transition group-hover/seg:opacity-100 group-focus-visible/seg:opacity-100 z-[200]';

    const tooltipAlignClass = (align: 'left' | 'center' | 'right') => {
      if (align === 'left') return 'left-0 translate-x-0';
      if (align === 'right') return 'right-0 left-auto translate-x-0';
      return 'left-1/2 -translate-x-1/2';
    };

    const tooltip = (desc: string, align: 'left' | 'center' | 'right' = 'center') => (
      <div className={`${tooltipBase} ${tooltipAlignClass(align)}`}>
        <div className="text-[11px] font-bold text-white/90">{t.wb_model_tooltip_title}</div>
        <div className="mt-1 text-[10px] leading-relaxed text-zinc-200/80">{desc}</div>
      </div>
    );
    const audioModeIndex = soundSetting === 'off' ? 1 : 0;
    const klingModeIndex = klingGenerateMode === 'subject' ? 1 : klingGenerateMode === 'first_last_frame' ? 2 : 0;
    const boundaryModelIndex = imageGenModel === 'flux-2-flex' ? 1 : imageGenModel === 'gpt-image-1.5' ? 2 : 0;

    const legacyModelSelector = (
      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          <Cpu className="w-3 h-3" /> {t.wb_model_title}
        </h2>
        <div className="glass-panel rounded-xl p-1 border border-white/10 bg-black/20 relative z-[90]">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={selectedModel === 'kling'}
              onClick={() => setSelectedModel('kling')}
              className={`${segmentBase} ${language === 'zh' ? 'text-[10px]' : ''} ${selectedModel === 'kling' ? activeSegment : inactiveSegment}`}
            >
              {t.wb_model_kling_title || (language === 'zh' ? '可灵 o1' : 'Kling o1')}
              {tooltip(t.wb_model_tip_sora_kling, 'left')}
            </button>
            <button
              type="button"
              aria-pressed={selectedModel === 'sora2'}
              onClick={() => setSelectedModel('sora2')}
              className={`${segmentBase} ${selectedModel === 'sora2' ? activeSegment : inactiveSegment}`}
            >
              Sora 2
              {tooltip(t.wb_model_tip_sora_kling, 'center')}
            </button>
            <button
              type="button"
              aria-pressed={selectedModel === 'sora2pro'}
              onClick={() => setSelectedModel('sora2pro')}
              className={`${segmentBase} ${selectedModel === 'sora2pro' ? activeSegment : inactiveSegment}`}
            >
              Sora 2 Pro
              {tooltip(t.wb_model_tip_sora_kling, 'center')}
            </button>
            <button
              type="button"
              aria-pressed={selectedModel === 'seedance2.0'}
              onClick={() => setSelectedModel('seedance2.0')}
              className={`${segmentBase} ${selectedModel === 'seedance2.0' ? activeSegment : inactiveSegment}`}
            >
              Seedance 2.0
              {tooltip(t.wb_model_tip_seedance, 'right')}
            </button>
          </div>
        </div>
      </div>
    );

    const modelOptions: Array<{
      id: 'kling' | 'sora2' | 'sora2pro' | 'seedance2.0';
      title: string;
      desc: string;
      Icon: React.ComponentType<{ className?: string }>;
    }> = [
        {
          id: 'kling',
          title: t.wb_model_kling_title || (language === 'zh' ? '可灵 o1' : 'Kling o1'),
          desc: t.wb_model_kling_desc,
          Icon: Zap,
        },
        {
          id: 'sora2',
          title: 'Sora 2',
          desc: t.wb_model_sora2_desc,
          Icon: SoraStarIcon,
        },
        {
          id: 'sora2pro',
          title: 'Sora 2 Pro',
          desc: t.wb_model_sora2pro_desc,
          Icon: Sparkles,
        },
        {
          id: 'seedance2.0',
          title: 'Seedance 2.0',
          desc: t.wb_model_tip_seedance,
          Icon: Video,
        },

      ];

    const renderModelCard = (opt: typeof modelOptions[number]) => {
      const active = selectedModel === opt.id;
      const locked = false;  // Seedance 2.0 backend ready — unlock fast mode
      const rateLabel = formatVideoRateLabel(getVideoModelPricingEntry(billingPricing, opt.id, 'fast'));
      return (
        <button
          key={opt.id}
          type="button"
          onClick={() => {
            if (locked) return;
            setSelectedModel(opt.id);
          }}
          disabled={locked}
          className={[
            'wb-fast-model-card w-full text-left rounded-2xl border p-3 transition flex items-center gap-4',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
            active
              ? 'border-orange-500/70 bg-orange-500/10 shadow-lg shadow-orange-500/10'
              : 'border-white/10 bg-black/20 hover:bg-white/5',
            locked ? 'cursor-not-allowed opacity-70' : '',
          ].join(' ')}
          aria-pressed={active}
        >
          <div
            className={[
              'w-10 h-10 rounded-2xl flex items-center justify-center shrink-0',
              active
                ? 'bg-orange-500/20 border border-orange-500/30'
                : 'bg-zinc-900/60 border border-white/10',
            ].join(' ')}
          >
            <opt.Icon className={active ? 'w-5 h-5 text-orange-500' : 'w-5 h-5 text-zinc-400'} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="text-[14px] font-black tracking-wide text-zinc-200 truncate">{opt.title}</div>
              <span className="relative inline-flex items-center group/model-tip shrink-0">
                <Info className="h-3.5 w-3.5 text-zinc-500" />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 w-52 -translate-x-1/2 whitespace-normal break-words rounded-lg border border-white/10 bg-zinc-900/95 px-2 py-1 text-[11px] font-medium leading-snug text-zinc-100 opacity-0 shadow-xl backdrop-blur transition group-hover/model-tip:opacity-100">
                  {opt.desc}
                </span>
              </span>
            </div>
          </div>
          {locked ? (
            <Lock className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden="true" />
          ) : (
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div
                className={[
                  'model-check w-4 h-4 rounded-full border flex items-center justify-center',
                  active ? 'border-orange-500 bg-orange-500' : 'model-check--inactive border-white/25 bg-transparent',
                ].join(' ')}
                aria-hidden="true"
              >
                {active ? <Check className="w-2.5 h-2.5 text-white" /> : null}
              </div>
              <div
                className={[
                  'text-[8px] whitespace-nowrap',
                  active ? 'font-bold text-orange-500' : 'font-medium text-zinc-500',
                ].join(' ')}
              >
                {rateLabel}
              </div>
            </div>
          )}
        </button>
      );
    };

    const modelSelector = (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
            <Wand2 className="w-3 h-3" /> {t.wb_creation_mode_title}
          </h2>
          <button
            type="button"
            onClick={() => setIsModelSectionCollapsed(!isModelSectionCollapsed)}
            className="p-1.5 text-zinc-600 hover:text-zinc-300 transition rounded"
            title={isModelSectionCollapsed ? t.wb_expand : t.wb_collapse}
          >
            <ChevronsDown className={`w-4 h-4 transition-transform duration-200 ${isModelSectionCollapsed ? 'rotate-0' : 'rotate-180'}`} />
          </button>
        </div>

        <div
          className={[
            'grid overflow-hidden transition-[grid-template-rows,opacity] duration-300',
            'ease-[cubic-bezier(0.22,1,0.36,1)]',
            isModelSectionCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
          ].join(' ')}
          aria-hidden={isModelSectionCollapsed}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              className={[
                'flex flex-col gap-6 transition-[transform,opacity] duration-300',
                'ease-[cubic-bezier(0.22,1,0.36,1)]',
                isModelSectionCollapsed ? '-translate-y-3 opacity-0' : 'translate-y-0 opacity-100',
              ].join(' ')}
            >
              <div className="space-y-3">
                <div className="mb-3">
                  <h2 className="mx-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    <ArrowRight className="w-3 h-3 text-zinc-500" />
                    {t.wb_render_power_title}
                  </h2>
<<<<<<< HEAD
                  <div className="group w-full text-left rounded-2xl border border-orange-500/70 bg-orange-500/10 shadow-lg shadow-orange-500/10 p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-orange-500/20 border border-orange-500/30">
                      <Video className="w-5 h-5 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="text-[14px] font-black tracking-wide text-zinc-200 whitespace-nowrap">Seedance 2.0</div>
                        <div className="min-w-0 overflow-hidden">
                          <div className="flex max-w-0 items-center gap-1.5 whitespace-nowrap opacity-0 transition-all duration-300 ease-out group-hover:max-w-[176px] group-hover:opacity-100">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400">
                              <ImageIcon className="h-3.5 w-3.5" />
                            </span>
                            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400">
                              <Video className="h-3.5 w-3.5" />
                            </span>
                            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400">
                              <Music className="h-3.5 w-3.5" />
                            </span>
                            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400">
                              <Users className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <div
                        className="model-check w-4 h-4 rounded-full border border-orange-500 bg-orange-500 flex items-center justify-center"
                        aria-hidden="true"
                      >
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                      <div className="text-[8px] whitespace-nowrap font-bold text-orange-500">
                        {formatApproxVideoRateLabel(getVideoModelPricingEntry(billingPricing, 'seedance2.0', 'replay'))}
                      </div>
                    </div>
                  </div>

=======
>>>>>>> d043543ced6f3eb8cf25cd97ca80afdd3a6dedd5
                </div>
                <div className="flex flex-col gap-3">{modelOptions.map(renderModelCard)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );

    const renderLeftColumnSettings = () => (
      <div ref={configSectionRef} className={`wb-config-form flex flex-col gap-3 flex-1 scroll-mt-4 transition-opacity duration-500 ${getGuideFocusClass('config')}`}>
        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-4">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
            <Gift className="w-4 h-4 shrink-0" /> {t.wb_product_info_title || 'Product Info'}
          </h2>
          <button
            type="button"
            onClick={() => {
              if (isAiRecognizing) {
                openInfo(popupTitles.notice, t.wb_ai_recognizing_tip);
                return;
              }
              if (getProductRecognitionSources().length === 0) {
                openInfo(popupTitles.notice, t.wb_ai_need_product_image);
                return;
              }
              void handleAiRecognize();
            }}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-2 transition border ${isAiRecognizing || getProductRecognitionSources().length === 0 ? 'border-white/10 bg-black/30 text-zinc-600 opacity-70 hover:bg-black/30' : needsAiReRecognize ? 'border-amber-500/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20' : 'border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20'}`}
          >
            {isAiRecognizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {isAiRecognizing ? t.wb_ai_recognizing_btn : t.wb_ai_recognize_btn}
            {needsAiReRecognize && !isAiRecognizing && <AlertCircle className="w-3.5 h-3.5 text-amber-300" />}
          </button>
        </div>

        {needsAiReRecognize && (
          <div className="-mt-1 text-[10px] text-amber-300 font-medium">
            {t.wb_ai_recognize_dirty_hint || '素材已变更，请重新执行 AI 识别。'}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            <div ref={videoTypeFieldRef}>
              <label className="text-[12px] text-zinc-500 font-bold mb-2 block uppercase">
                {t.wb_field_product_name_label}
                <span className="ml-1 text-red-400">*</span>
              </label>
              <input
                ref={productNameFieldRef}
                value={productName}
                onChange={(e) => {
                  setProductName(e.target.value);
                  setProductInfoTouched((prev) => ({ ...prev, name: true }));
                  if (requiredErrors.productName && e.target.value.trim()) {
                    setRequiredErrors((prev) => ({ ...prev, productName: undefined }));
                  }
                }}
                placeholder={t.wb_field_product_name_placeholder}
                className="wb-workbench-field"
              />
              {requiredErrors.productName && (
                <div className="mt-1 text-[12px] text-red-400 font-medium">{requiredErrors.productName}</div>
              )}
            </div>

            <div ref={productCategoryFieldRef}>
              <label className="text-[12px] text-zinc-500 font-bold mb-2 block uppercase">
                {t.wb_field_product_category_label}
                <span className="ml-1 text-red-400">*</span>
              </label>
              <DropdownSelect
                value={productCategory}
                placeholder={t.wb_select_placeholder}
                options={[
                  { value: '服装鞋靴', label: t.wb_product_category_apparel },
                  { value: '美妆个护', label: t.wb_product_category_beauty },
                  { value: '食品饮料', label: t.wb_product_category_food },
                  { value: '3C数码', label: t.wb_product_category_digital },
                  { value: '家居百货', label: t.wb_product_category_home },
                ]}
                onChange={(v) => {
                  setProductCategory(v);
                  setProductInfoTouched((prev) => ({ ...prev, category: true }));
                  if (requiredErrors.productCategory && v.trim()) {
                    setRequiredErrors((prev) => ({ ...prev, productCategory: undefined }));
                  }
                }}
                buttonClassName="wb-workbench-field cursor-pointer text-left"
                labelClassName=""
                iconClassName="w-3 h-3 text-zinc-500"
                optionClassName="text-xs"
              />
              {requiredErrors.productCategory && (
                <div className="mt-1 text-[12px] text-red-400 font-medium">{requiredErrors.productCategory}</div>
              )}
            </div>

            <div>
              <label className="text-[12px] text-zinc-500 font-bold mb-2 block uppercase">
                {t.wb_field_core_selling_points_label}
                <span className="ml-1 text-red-400">*</span>
              </label>
              <textarea
                ref={coreSellingPointsFieldRef}
                value={coreSellingPoints}
                onChange={(e) => {
                  setCoreSellingPoints(e.target.value);
                  setProductInfoTouched((prev) => ({ ...prev, sellingPoints: true }));
                  if (requiredErrors.coreSellingPoints && e.target.value.trim()) {
                    setRequiredErrors((prev) => ({ ...prev, coreSellingPoints: undefined }));
                  }
                }}
                placeholder={t.wb_field_core_selling_points_placeholder}
                className="wb-workbench-field h-[96px] overflow-y-auto custom-scroll resize-none"
              />
              {requiredErrors.coreSellingPoints && (
                <div className="mt-1 text-[12px] text-red-400 font-medium">{requiredErrors.coreSellingPoints}</div>
              )}
            </div>

            <div>
              <label className="text-[12px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_field_target_audience_label}</label>
              <input
                value={targetAudience}
                onChange={(e) => {
                  setTargetAudience(e.target.value);
                  setProductInfoTouched((prev) => ({ ...prev, audience: true }));
                }}
                placeholder={t.wb_field_target_audience_placeholder}
                className="wb-workbench-field"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-4 mt-2">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4" /> {t.wb_generation_settings_title}
          </h2>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_field_delivery_region_label}</label>
                <DropdownSelect
                  value={deliveryRegion}
                  options={DELIVERY_REGION_OPTIONS.map((opt) => ({ value: opt.value, label: t[opt.labelKey] }))}
                  onChange={setDeliveryRegion}
                  buttonClassName="wb-workbench-field cursor-pointer text-left"
                  labelClassName=""
                  iconClassName="w-3 h-3 text-zinc-500"
                  optionClassName="text-xs"
                />
              </div>

              <div>
                <label className="text-[12px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_field_video_language_label}</label>
                <DropdownSelect
                  value={targetLanguage}
                  options={TARGET_LANGUAGE_OPTIONS.map((opt) => ({ value: opt.value, label: t[opt.labelKey] }))}
                  onChange={setTargetLanguage}
                  buttonClassName="wb-workbench-field cursor-pointer text-left"
                  labelClassName=""
                  iconClassName="w-3 h-3 text-zinc-500"
                  optionClassName="text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[12px] text-zinc-500 font-bold mb-2 block uppercase">
                  {t.wb_field_video_type_label}
                  <span className="ml-1 text-red-400">*</span>
                </label>
                <DropdownSelect
                  value={videoType}
                  placeholder={t.wb_select_placeholder}
                  options={[
                    { value: 'UGC种草', label: t.wb_video_type_ugc },
                    { value: '产品口播', label: t.wb_video_type_talking },
                    { value: '产品演示', label: t.wb_video_type_demo },
                    { value: '痛点-解决', label: t.wb_video_type_problem_solution },
                    { value: '前后对比', label: t.wb_video_type_before_after },
                    { value: '反应展示', label: t.wb_video_type_reaction },
                    { value: '故事讲述', label: t.wb_video_type_story },
                  ]}
                  onChange={(v) => {
                    setVideoType(v);
                    if (requiredErrors.videoType && v.trim()) {
                      setRequiredErrors((prev) => ({ ...prev, videoType: undefined }));
                    }
                  }}
                  buttonClassName="wb-workbench-field cursor-pointer text-left"
                  labelClassName=""
                  iconClassName="w-3 h-3 text-zinc-500"
                  optionClassName="text-xs"
                />
                {requiredErrors.videoType && (
                  <div className="mt-1 text-[12px] text-red-400 font-medium">{requiredErrors.videoType}</div>
                )}
              </div>

              {!(selectedModel === 'kling' && klingGenerateMode === 'first_frame') && (
                <div>
                  <label className="text-[12px] text-zinc-500 font-bold mb-2 block uppercase">{t.aspect_ratio}</label>
                  <DropdownSelect
                    value={aspectRatio}
                    options={selectedModel === 'seedance2.0'
                      ? [
                        { value: '16:9', label: '16:9' },
                        { value: '4:3', label: '4:3' },
                        { value: '1:1', label: '1:1' },
                        { value: '3:4', label: '3:4' },
                        { value: '9:16', label: '9:16' },
                        { value: '21:9', label: '21:9' },
                      ]
                      : [
                        { value: '9:16', label: t.mobile },
                        { value: '16:9', label: t.landscape },
                        ...(selectedModel === 'kling' && klingGenerateMode === 'subject'
                          ? [{ value: '1:1', label: t.square }]
                          : []),
                      ]}
                    onChange={(v) => setAspectRatio(normalizeWorkbenchAspectRatio(v))}
                    buttonClassName="wb-workbench-field cursor-pointer text-left"
                    labelClassName=""
                    iconClassName="w-3 h-3 text-zinc-500"
                    optionClassName="text-xs"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="text-[12px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_field_additional_requirements_label}</label>
              <textarea
                readOnly={!hasCurrentAsset}
                onFocus={() => {
                  if (!hasCurrentAsset) openInfo(popupTitles.notice, t.wb_additional_requirements_need_asset);
                }}
                onClick={() => {
                  if (!hasCurrentAsset) openInfo(popupTitles.notice, t.wb_additional_requirements_need_asset);
                }}
                className={`wb-workbench-field wb-workbench-field--textarea resize-y min-h-[80px] ${!hasCurrentAsset ? 'opacity-60 cursor-not-allowed' : ''}`}
                placeholder={t.wb_field_additional_requirements_placeholder}
                value={genPrompt}
                onChange={(e) => {
                  if (!hasCurrentAsset) return;
                  setGenPrompt(e.target.value);
                }}
              />
            </div>

            <div className="flex flex-col gap-4">
              <div>
                {selectedModel === 'kling' || selectedModel === 'seedance2.0' ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[12px] text-zinc-500 font-bold block uppercase">{t.wb_config_duration}</label>
                      <span className="text-[12px] font-bold text-orange-400">{genDuration}s</span>
                    </div>
                    <input
                      type="range"
                      min={selectedModel === 'kling' ? 3 : 4}
                      max={selectedModel === 'kling' ? 10 : 15}
                      step={1}
                      value={genDuration}
                      onChange={(e) => setGenDuration(normalizeDurationForModel(Number(e.target.value), selectedModel))}
                      className="wb-range w-full h-2 rounded-lg cursor-pointer accent-orange-500"
                    />
                  </div>
                ) : (
                  <>
                    <label className="text-[12px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_duration}</label>
                    <DropdownSelect
                      value={String(genDuration)}
                      options={selectedModel === 'sora2' || selectedModel === 'sora2pro'
                        ? [
                          { value: '4', label: '4s' },
                          { value: '8', label: '8s' },
                          { value: '12', label: '12s' },
                        ]
                        : [
                          { value: '5', label: '5s' },
                          { value: '10', label: '10s' },
                          { value: '15', label: '15s' },
                        ]}
                      onChange={(v) => setGenDuration(normalizeDurationForModel(Number(v), selectedModel))}
                      buttonClassName="wb-workbench-field cursor-pointer text-left"
                      labelClassName=""
                      iconClassName="w-3 h-3 text-zinc-500"
                      optionClassName="text-xs"
                    />
                  </>
                )}
              </div>

              <div ref={audioConfigSectionRef}>
                <label className="text-[12px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_audio}</label>
                <div className="wb-mode-toggle grid-cols-2">
                  <span
                    className="wb-mode-thumb w-1/2"
                    style={{ transform: `translateX(${audioModeIndex * 100}%)` }}
                  />
                  <button
                    type="button"
                    onClick={() => setSoundSetting('on')}
                    aria-pressed={soundSetting === 'on'}
                    className={[
                      'relative z-10 rounded-lg py-2 text-[11px] font-bold transition',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
                      soundSetting === 'on'
                        ? 'text-orange-200'
                        : 'bg-transparent text-zinc-500 hover:text-orange-300',
                    ].join(' ')}
                  >
                    {t.wb_config_audio_on}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSoundSetting('off')}
                    aria-pressed={soundSetting === 'off'}
                    className={[
                      'relative z-10 rounded-lg py-2 text-[11px] font-bold transition',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
                      soundSetting === 'off'
                        ? 'text-orange-200'
                        : 'bg-transparent text-zinc-500 hover:text-orange-300',
                    ].join(' ')}
                  >
                    {t.wb_config_audio_off}
                  </button>
                </div>
                {soundSetting === 'off' && (
                  <div className="mt-2 space-y-2">
                    <button
                      type="button"
                      onClick={() => setIsBackgroundAudioSourceOpen((prev) => !prev)}
                      className={`w-full rounded-lg border px-3 py-2 text-xs transition ${isBackgroundAudioSourceOpen
                        ? 'border-orange-500/60 bg-orange-500/10 text-orange-200'
                        : 'border-white/10 bg-black/30 text-zinc-200 hover:border-orange-500/50 hover:text-orange-300 hover:bg-orange-500/5'
                        }`}
                    >
                      <span className="flex items-center justify-center gap-2">
                        <span>
                          {selectedBackgroundAudio
                            ? (t.wb_config_change_audio || '更换音频')
                            : (t.wb_config_add_audio || '添加音频')}
                        </span>
                        {isBackgroundAudioSourceOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                    {isBackgroundAudioSourceOpen && (
                      <div className="rounded-lg border border-white/10 bg-black/25 p-1">
                        <button
                          type="button"
                          onClick={openBackgroundAudioPicker}
                          className="wb-upload-library-btn flex w-full items-center rounded-md border border-transparent px-3 py-2 text-left text-xs text-zinc-200 transition hover:border-zinc-400/30 hover:bg-zinc-500/10 hover:text-orange-200"
                        >
                          <span>{t.wb_btn_choose_from_library || '从素材库选择'}</span>
                        </button>
                        <div className="px-3 pb-1 pt-2 text-[10px] text-zinc-500">
                          {(t as any).wb_background_audio_hint_library || '可在素材库弹窗中本地上传音频并保存'}
                        </div>
                      </div>
                    )}
                    {selectedBackgroundAudio ? (
                      <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                        <div className="min-w-0">
                          <div className="text-[10px] text-zinc-500 uppercase">{t.wb_config_selected_audio || '已选音频'}</div>
                          <div className="text-xs text-zinc-200 truncate">{selectedBackgroundAudio.name}</div>
                          <div className="mt-1 text-[10px] text-zinc-500">
                            {selectedBackgroundAudio.source === 'local'
                              ? ((t as any).wb_background_audio_source_local || '来源：本地上传')
                              : ((t as any).wb_background_audio_source_library || '来源：素材库')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBackgroundAudio(null);
                            setIsBackgroundAudioSourceOpen(false);
                          }}
                          className="mt-2 w-full text-[10px] text-zinc-400 hover:text-red-300 rounded px-2 py-1 border border-white/10 hover:border-red-500/40"
                        >
                          {t.editor_model_clear || '移除'}
                        </button>
                      </div>
                    ) : (
                      <div className="text-[10px] text-zinc-500">{t.wb_config_audio_add_hint || '生成后会自动裁剪并附加到视频'}</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {!isSeedanceReplayMode && (
              <>
                <div className="space-y-2">
                  <label className="text-[12px] text-zinc-500 font-bold block uppercase">{t.wb_reference_script_label || '参考脚本（来自视频解析）'}</label>
                  <textarea
                    value={referenceScript}
                    onChange={(e) => {
                      setReferenceScript(e.target.value);
                      setReferenceScriptProductSignature(currentProductInfoSignature);
                    }}
                    rows={4}
                    placeholder={t.wb_reference_script_placeholder || '粘贴或使用“视频解析反向生成脚本”应用到工作台后的参考脚本'}
                    className="wb-workbench-field wb-workbench-field--textarea resize-y min-h-[86px]"
                  />
                  <div className="text-[11px] text-zinc-500">{t.wb_reference_script_hint || '该内容将作为风格参考一并输入脚本模型，帮助生成更接近参考风格的新脚本。'}</div>
                  {!isReferenceScriptFresh && referenceScript.trim() && (
                    <div className="text-[11px] text-amber-300 font-medium">
                      当前参考脚本对应的是旧商品信息，生成脚本时将自动忽略它。
                    </div>
                  )}
                </div>

                <div className="border-t border-white/5 my-1" />

                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[12px] text-zinc-500 font-bold block uppercase">{t.wb_script_count_label}</label>
                    <span className="text-[12px] font-bold text-orange-400">{scriptVariantCount} {t.wb_script_count_unit}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={scriptVariantCount}
                    onChange={(e) => setScriptVariantCount(Number(e.target.value))}
                    className="wb-range w-full h-2 rounded-lg cursor-pointer accent-orange-500"
                  />
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    );

    return (
      <div className="w-full flex flex-col gap-6 h-full overflow-y-auto overflow-x-visible custom-scroll px-2 py-2">
        <div ref={modeSectionRef} className={getGuideFocusClass('mode')}>
          {modelSelector}
        </div>
        {false && legacyModelSelector}
        {/* Upload Section */}
        <div ref={uploadSectionRef} className={`flex flex-col gap-3 border-t border-white/10 pt-4 ${getGuideFocusClass('upload')}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><UploadCloud className="w-4 h-4" /> {t.wb_upload_title}</h2>
            <div className="flex items-center gap-2">
              {isSeedanceMode && (
                <button
                  type="button"
                  onClick={handleSeedanceReplayOpenLibrary}
                  className="wb-upload-library-btn inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
                >
                  <Library className="h-3.5 w-3.5" />
                  {t.wb_seedance_replay_quick_add_button || '快速添加'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsUploadSectionCollapsed(!isUploadSectionCollapsed)}
                className="p-1.5 text-zinc-600 hover:text-zinc-300 transition rounded"
                title={isUploadSectionCollapsed ? t.wb_expand : t.wb_collapse}
              >
                <ChevronsDown className={`w-4 h-4 transition-transform duration-200 ${isUploadSectionCollapsed ? 'rotate-0' : 'rotate-180'}`} />
              </button>
            </div>
          </div>
          <div
            className={[
              'grid overflow-hidden transition-[grid-template-rows,opacity] duration-300',
              'ease-[cubic-bezier(0.22,1,0.36,1)]',
              isUploadSectionCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
            ].join(' ')}
            aria-hidden={isUploadSectionCollapsed}
          >
          <div className="min-h-0 overflow-hidden">
          {isSeedanceMode ? (
            <>
              <SeedanceReplayUploadPanel
                assets={seedanceReplayUploadAssets}
                validationSummary={seedanceReplayValidation}
                focusTarget={seedanceReplayFocusTarget}
                visibleKinds={isSeedanceReplayMode ? ['image', 'video', 'model'] : undefined}
                videoLimitOverride={isSeedanceReplayMode ? 1 : undefined}
                onAddVirtualModel={handleSeedanceReplayAddVirtualModel}
                onOpenLibraryForKind={handleSeedanceReplayAddFromLibrary}
                onPreview={handleSeedanceReplayPreview}
                onRemove={handleSeedanceReplayRemove}
                onSetFrameRole={handleSeedanceReplaySetFrameRole}
              />
            </>
          ) : (
            <div className="flex flex-col gap-3">
              {isKlingOmniMode && (
                <div className="wb-mode-toggle grid-cols-3">
                  <span
                    className="wb-mode-thumb w-1/3"
                    style={{ transform: `translateX(${klingModeIndex * 100}%)` }}
                  />
                  <button
                    type="button"
                    onClick={() => handleKlingGenerateModeChange('first_frame')}
                    aria-pressed={klingGenerateMode === 'first_frame'}
                    className={`relative z-10 flex items-center justify-center overflow-visible rounded-md border border-transparent px-3 py-2 text-center transition hover:z-20 ${klingGenerateMode === 'first_frame' ? 'text-orange-200' : 'text-zinc-300 hover:text-orange-300'}`}
                  >
                    <div className="flex items-center justify-center gap-1 text-xs font-bold">
                      <span>{t.wb_kling_mode_first_frame}</span>
                      <span className="relative z-10 inline-flex items-center group/info hover:z-20">
                        <Info className="h-3 w-3 text-zinc-400" />
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 ml-6 w-40 -translate-x-1/2 whitespace-normal break-words rounded-lg border border-white/10 bg-zinc-900/95 px-2 py-1 text-[12px] font-medium leading-snug text-zinc-100 opacity-0 shadow-xl backdrop-blur transition group-hover/info:opacity-100">
                          <span className="block">{t.wb_material_requirement_title}</span>
                          <span className="block">{t.wb_kling_first_frame_requirement}</span>
                          <span className="mt-1 block text-zinc-300">{t.wb_kling_first_frame_desc}</span>
                        </span>
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKlingGenerateModeChange('subject')}
                    aria-pressed={klingGenerateMode === 'subject'}
                    className={`relative z-10 flex items-center justify-center overflow-visible rounded-md border border-transparent px-3 py-2 text-center transition hover:z-20 ${klingGenerateMode === 'subject' ? 'text-orange-200' : 'text-zinc-300 hover:text-orange-300'}`}
                  >
                    <div className="flex items-center justify-center gap-1 text-xs font-bold">
                      <span>{t.wb_kling_mode_subject}</span>
                      <span className="relative z-10 inline-flex items-center group/info hover:z-20">
                        <Info className="h-3 w-3 text-zinc-400" />
                        <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-1 w-52 whitespace-normal break-words rounded-lg border border-white/10 bg-zinc-900/95 px-2 py-1 text-[12px] font-medium leading-snug text-zinc-100 opacity-0 shadow-xl backdrop-blur transition group-hover/info:opacity-100">
                          <span className="block">{t.wb_material_requirement_title}</span>
                          <span className="block">{t.wb_kling_subject_requirement}</span>
                          <span className="mt-1 block text-zinc-300">{t.wb_kling_subject_requirement_note}</span>
                          <span className="mt-1 block text-zinc-300">{t.wb_kling_subject_desc}</span>
                        </span>
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKlingGenerateModeChange('first_last_frame')}
                    aria-pressed={klingGenerateMode === 'first_last_frame'}
                    className={`relative z-10 flex items-center justify-center overflow-visible rounded-md border border-transparent px-3 py-2 text-center transition hover:z-20 ${klingGenerateMode === 'first_last_frame' ? 'text-orange-200' : 'text-zinc-300 hover:text-orange-300'}`}
                  >
                    <div className="flex items-center justify-center gap-1 text-xs font-bold">
                      <span>{t.wb_kling_mode_first_last_frame || 'First + Last Frame Mode'}</span>
                      <span className="relative z-10 inline-flex items-center group/info hover:z-20">
                        <Info className="h-3 w-3 text-zinc-400" />
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 ml-6 w-44 -translate-x-1/2 whitespace-normal break-words rounded-lg border border-white/10 bg-zinc-900/95 px-2 py-1 text-[12px] font-medium leading-snug text-zinc-100 opacity-0 shadow-xl backdrop-blur transition group-hover/info:opacity-100">
                          <span className="block">{t.wb_material_requirement_title}</span>
                          <span className="block">{t.wb_kling_first_last_frame_requirement || '1 first-frame image + 1 tail-frame image + 0-6 reference images'}</span>
                          <span className="mt-1 block text-zinc-300">{t.wb_kling_first_last_frame_desc || 'Constrain the beginning and ending of the video with first and last keyframes'}</span>
                        </span>
                      </span>
                    </div>
                  </button>
                </div>
              )}
              {isKlingOmniMode && klingGenerateMode === 'subject' && !isKlingSubjectModeHintDismissed && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <div className="flex items-center gap-2 text-[11px] text-zinc-300">
                    <button
                      type="button"
                      className="text-zinc-500 transition hover:text-zinc-300"
                      onClick={() => setIsKlingSubjectModeHintDismissed(true)}
                      aria-label={t.wb_close_tip}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <span>{t.wb_subject_need_create_hint}</span>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl border border-orange-500/70 bg-orange-500/10 px-3 py-1.5 text-[10px] font-bold text-orange-200 transition hover:bg-orange-500/20"
                    onClick={openSubjectCreationLibrary}
                  >
                    {t.wb_subject_create_now}
                  </button>
                </div>
              )}
              <div
                onDragOver={undefined}
                onDragEnter={undefined}
                onDragLeave={undefined}
                onDrop={undefined}
                className={`rounded-xl transition-colors min-h-32 relative group ${isKlingOmniMode || uploadDisplayAssets.length === 0
                  ? 'p-0 border-none bg-transparent'
                  : `glass-panel p-1 border-2 border-dashed ${uploadDisplayAssets.length > 0 ? 'border-none' : ''} ${isDragUploadActive ? 'border-orange-500/80 bg-orange-500/10' : 'border-zinc-800 hover:border-orange-500/50'}`
                  }`}
              >
                {!isKlingOmniMode && isDragUploadActive && (
                  <div className="absolute inset-1 rounded-lg border border-dashed border-orange-500/60 bg-orange-500/10 pointer-events-none" />
                )}
                <input type="file" ref={fileInputRef} className="hidden" accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.mkv,.webm,.avi" multiple onChange={handleWorkbenchUpload} />
                {!isKlingOmniMode && uploadDisplayAssets.length === 0 ? (
                  <div className="absolute inset-0 z-10">
                    <button
                      type="button"
                      onClick={() => openAssetLibraryPicker()}
                      className="wb-upload-library-btn group flex h-full w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-2 text-sm font-bold text-zinc-200 transition hover:border-orange-400/60 hover:bg-orange-500/10 hover:text-orange-200"
                    >
                      <FolderOpen className="h-5 w-5 text-zinc-400 transition group-hover:text-orange-300" />
                      <span>{t.wb_btn_choose_from_library || '从素材库选择'}</span>
                    </button>
                  </div>
                ) : (
                  <div className={isKlingOmniMode ? '' : 'rounded-lg bg-zinc-900/80 p-2'}>
                    {isKlingOmniMode ? (
                      klingGenerateMode === 'first_last_frame' ? (
                        klingPrimarySlotAsset && klingTailSlotAsset ? (
                          <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto bg-transparent custom-scroll pr-1">
                            <div className="rounded-xl border border-white/10 bg-black/25 p-1">
                              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">{t.wb_label_first_frame_short || t.wb_label_first_frame || 'First'}</div>
                              {renderUploadAssetCard(klingPrimarySlotAsset)}
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/25 p-1">
                              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">{t.wb_label_tail_frame || 'Tail Frame'}</div>
                              {renderUploadAssetCard(klingTailSlotAsset)}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <div className="wb-mode-toggle grid-cols-3">
                              <span
                                className="wb-mode-thumb w-1/3"
                                style={{ transform: `translateX(${boundaryModelIndex * 100}%)` }}
                              />
                              {([
                                { id: 'flux-2-pro', label: 'Flux 2 Pro' },
                                { id: 'flux-2-flex', label: 'Flux 2 Flex' },
                                { id: 'gpt-image-1.5', label: 'GPT Image 1.5' },
                              ] as const).map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => setImageGenModel(m.id)}
                                  aria-pressed={imageGenModel === m.id}
                                  className={`relative z-10 flex items-center justify-center rounded-md border border-transparent px-3 py-2 text-center text-[10px] font-bold leading-none transition hover:z-20 ${imageGenModel === m.id ? 'text-orange-200' : 'text-zinc-300 hover:text-orange-300'}`}
                                >
                                  {m.label}
                                </button>
                              ))}
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/25 p-2">
                              <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                                <span>{t.wb_label_reference_image || '参考图'}</span>
                                <button
                                  type="button"
                                  className="flex h-6 w-6 items-center justify-center rounded-md border border-white/20 bg-black/55 text-zinc-200 transition hover:border-orange-400/70 hover:bg-orange-500/20 hover:text-orange-200"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openAssetLibraryPicker('reference');
                                  }}
                                  aria-label={t.wb_upload_click || 'Click to Upload'}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              {klingReferenceSlotAssets.length > 0 ? (
                                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto custom-scroll pr-1">
                                  {klingReferenceSlotAssets.map((asset) => renderUploadAssetCard(asset))}
                                </div>
                              ) : (
                                <div className="h-28 rounded-lg border border-dashed border-white/10 bg-black/20" />
                              )}
                            </div>
                          </div>
                        )
                      ) : (
                        <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto custom-scroll pr-1">
                          <div
                            className="relative rounded-xl border border-white/10 bg-black/25 p-2"
                            onDragOver={(e) => {
                              if (!draggingWorkbenchAssetId) return;
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onDrop={(e) => {
                              if (!draggingWorkbenchAssetId) return;
                              e.preventDefault();
                              e.stopPropagation();
                              moveQueueAssetToSlot(draggingWorkbenchAssetId, 'primary');
                              clearWorkbenchDragState();
                            }}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                              <span className="inline-flex items-center gap-1">
                                {klingGenerateMode === 'subject' ? (t.wb_label_subject_image || 'Subject') : (t.wb_label_first_frame || 'First Frame')}
                                {klingGenerateMode === 'first_frame' ? (
                                  <span className="text-[10px] font-medium normal-case tracking-normal text-zinc-400">
                                    {klingPrimaryCountLabel}
                                  </span>
                                ) : null}
                              </span>
                              <button
                                type="button"
                                className="flex h-6 w-6 items-center justify-center rounded-md border border-white/20 bg-black/55 text-zinc-200 transition hover:border-orange-400/70 hover:bg-orange-500/20 hover:text-orange-200"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAssetLibraryPicker('primary');
                                }}
                                aria-label={t.wb_upload_click || 'Click to Upload'}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {klingPrimarySlotAsset ? renderUploadAssetCard(klingPrimarySlotAsset) : (
                              <div className="h-28 rounded-lg border border-dashed border-white/10 bg-black/20" />
                            )}
                          </div>
                          <div
                            className="relative rounded-xl border border-white/10 bg-black/25 p-2"
                            onDragOver={(e) => {
                              if (!draggingWorkbenchAssetId) return;
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onDrop={(e) => {
                              if (!draggingWorkbenchAssetId) return;
                              e.preventDefault();
                              e.stopPropagation();
                              moveQueueAssetToSlot(draggingWorkbenchAssetId, 'reference');
                              clearWorkbenchDragState();
                            }}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                              <span className="inline-flex items-center gap-1.5">
                                <span>{t.wb_label_reference_image || 'Reference'}</span>
                                <span className={`text-[10px] font-medium normal-case tracking-normal ${isKlingReferenceOverflow ? 'text-red-400' : 'text-zinc-400'}`}>
                                  {klingReferenceCountLabel}
                                </span>
                              </span>
                              <button
                                type="button"
                                className="flex h-6 w-6 items-center justify-center rounded-md border border-white/20 bg-black/55 text-zinc-200 transition hover:border-orange-400/70 hover:bg-orange-500/20 hover:text-orange-200"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAssetLibraryPicker('reference');
                                }}
                                aria-label={t.wb_upload_click || 'Click to Upload'}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {klingReferenceSlotAssets.length > 0 ? (
                              <div className="flex flex-col gap-2 max-h-60 overflow-y-auto custom-scroll pr-1">
                                {klingReferenceSlotAssets.map((asset) => (
                                  <div
                                    key={asset.id}
                                    onDragOver={(e) => {
                                      if (!draggingWorkbenchAssetId || draggingWorkbenchAssetId === asset.id) return;
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }}
                                    onDrop={(e) => {
                                      if (!draggingWorkbenchAssetId || draggingWorkbenchAssetId === asset.id) return;
                                      e.preventDefault();
                                      e.stopPropagation();
                                      moveQueueAssetToSlot(draggingWorkbenchAssetId, 'reference', asset.id);
                                      clearWorkbenchDragState();
                                    }}
                                  >
                                    {renderUploadAssetCard(asset, klingReferenceSlotAssets.length > 2)}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="h-28 rounded-lg border border-dashed border-white/10 bg-black/20" />
                            )}
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto custom-scroll pr-1">
                        {uploadDisplayAssets.map((asset) => {
                          const inQueue = assetQueue.find((item) => item.id === asset.id);
                          const selected = selectedQueueAssetId ? selectedQueueAssetId === asset.id : uploadedFile === asset.previewUrl;
                          return (
                            <div
                              key={asset.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                if (inQueue) {
                                  selectAssetFromQueue(inQueue);
                                  return;
                                }
                                setUploadedFile(asset.previewUrl || null);
                                setFileName(asset.name || '');
                                setSelectedFileObj(asset.fileObj || null);
                                setSelectedAssetUrl(asset.assetUrl || null);
                                setSelectedAssetSource(asset.source || null);
                                setCurrentMaterialType(asset.materialType || null);
                                setSelectedQueueAssetId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter' && e.key !== ' ') return;
                                e.preventDefault();
                                if (inQueue) {
                                  selectAssetFromQueue(inQueue);
                                  return;
                                }
                                setUploadedFile(asset.previewUrl || null);
                                setFileName(asset.name || '');
                                setSelectedFileObj(asset.fileObj || null);
                                setSelectedAssetUrl(asset.assetUrl || null);
                                setSelectedAssetSource(asset.source || null);
                                setCurrentMaterialType(asset.materialType || null);
                                setSelectedQueueAssetId(null);
                              }}
                              className={`relative w-full rounded-md overflow-hidden border text-left transition ${selected ? 'border-orange-500/70 ring-1 ring-orange-500/50' : 'border-white/10 hover:border-white/20'}`}
                            >
                              {asset.previewUrl ? (asset.mediaKind === 'video' ? (
                                <video src={asset.previewUrl} className="w-full h-auto max-h-[240px] object-contain bg-black/40 opacity-80" muted playsInline />
                              ) : (
                                <img src={asset.previewUrl} className="w-full h-auto max-h-[240px] object-contain bg-black/40 opacity-80" alt={asset.name} />
                              )) : (
                                <div className="w-full h-24 flex items-center justify-center text-[10px] text-zinc-500 bg-zinc-800">无预览</div>
                              )}
                              {!(isKlingOmniMode && (klingGenerateMode === 'first_frame' || klingGenerateMode === 'first_last_frame')) ? (
                                <div className="absolute top-1 left-1 z-10" onClick={(e) => e.stopPropagation()}>
                                  <select
                                    className="wb-workbench-field wb-workbench-field--compact cursor-pointer appearance-none shadow-sm"
                                    value={asset.materialType || (asset.mediaKind === 'video' ? 'motion' : asset.mediaKind === 'audio' ? 'audio' : 'product')}
                                    onChange={(e) => {
                                      const newType = e.target.value as AssetLibraryTab;
                                      setAssetQueue((prev) => {
                                        const next = prev.map((item): QueuedAsset =>
                                          item.id === asset.id ? { ...item, materialType: newType } : item
                                        );
                                        return isKlingOmniMode ? normalizeQueueSourcesForKlingMode(next, klingGenerateMode) : next;
                                      });
                                      if (selectedQueueAssetId === asset.id || uploadedFile === asset.previewUrl) {
                                        setCurrentMaterialType(newType);
                                      }
                                    }}
                                    style={{
                                      backgroundImage:
                                        'url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%230f172a\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")',
                                      backgroundRepeat: 'no-repeat',
                                      backgroundPosition: 'right 6px center',
                                    }}
                                  >
                                    <option value="product">{materialTypeLabelMap['product']}</option>
                                    <option value="model">{materialTypeLabelMap['model']}</option>
                                    <option value="scene">{materialTypeLabelMap['scene']}</option>
                                    <option value="motion">{materialTypeLabelMap['motion']}</option>
                                    <option value="audio">{materialTypeLabelMap['audio']}</option>
                                  </select>
                                </div>
                              ) : null}
                              <div className="absolute top-1 right-1 flex items-center gap-1 z-10">
                                {asset.mediaKind === 'image' && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const isHighlighted = isKlingOmniMode
                                        ? klingGenerateMode === 'subject'
                                          ? asset.source === 'subject' || (!asset.source && selected && selectedAssetSource === 'subject')
                                          : asset.source === 'product' || (!asset.source && selected && selectedAssetSource === 'product')
                                        : asset.source === 'product' || (!asset.source && selected && selectedAssetSource === 'product');
                                      const primarySource: QueuedAsset['source'] = isKlingOmniMode
                                        ? (klingGenerateMode === 'subject' ? 'subject' : 'product')
                                        : 'product';
                                      const nextSource: QueuedAsset['source'] = isHighlighted ? 'preference' : primarySource;

                                      if (inQueue) {
                                        if (isKlingOmniMode && nextSource !== 'preference') {
                                          applyKlingPrimarySelection(asset.id, nextSource);
                                        } else {
                                          setAssetQueue(prev => prev.map((item): QueuedAsset => (
                                            item.id === asset.id
                                              ? { ...item, source: 'preference', isPrimaryFrame: false }
                                              : item
                                          )));
                                        }
                                      }

                                      if (selected) {
                                        setSelectedAssetSource(nextSource);
                                      }
                                    }}
                                    className={`rounded border px-1.5 py-0.5 text-[10px] font-bold transition ${selectedModel === 'sora2' || selectedModel === 'sora2pro'
                                      ? ((
                                        isKlingOmniMode
                                          ? (
                                            klingGenerateMode === 'subject'
                                              ? asset.source === 'subject' || (!asset.source && selected && selectedAssetSource === 'subject')
                                              : asset.source === 'product' || (!asset.source && selected && selectedAssetSource === 'product')
                                          )
                                          : asset.source === 'product' || (!asset.source && selected && selectedAssetSource === 'product')
                                      )
                                        ? 'border-orange-500 bg-orange-500 text-white'
                                        : 'border-slate-600 bg-slate-600 text-white hover:bg-slate-500 hover:border-slate-500')
                                      : ((
                                        isKlingOmniMode
                                          ? (
                                            klingGenerateMode === 'subject'
                                              ? asset.source === 'subject' || (!asset.source && selected && selectedAssetSource === 'subject')
                                              : asset.source === 'product' || (!asset.source && selected && selectedAssetSource === 'product')
                                          )
                                          : asset.source === 'product' || (!asset.source && selected && selectedAssetSource === 'product')
                                      )
                                        ? 'border-orange-500/70 bg-orange-500/20 text-orange-300'
                                        : 'border-white/20 bg-black/45 text-zinc-200 hover:bg-black/65')
                                      }`}
                                  >
                                    {(
                                      isKlingOmniMode
                                        ? (
                                          klingGenerateMode === 'subject'
                                            ? asset.source === 'subject' || (!asset.source && selected && selectedAssetSource === 'subject')
                                            : asset.source === 'product' || (!asset.source && selected && selectedAssetSource === 'product')
                                        )
                                        : asset.source === 'product' || (!asset.source && selected && selectedAssetSource === 'product')
                                    )
                                      ? (isKlingOmniMode ? klingRoleLabel(klingGenerateMode === 'subject' ? 'subject' : 'product') : (t.wb_label_first_frame || 'First Frame'))
                                      : (isKlingOmniMode ? klingRoleLabel('preference') : (t.wb_label_reference_image || 'Reference'))}
                                  </button>
                                )}
                                <button onClick={(e) => removeUpload(e, asset.id)} className="p-1 bg-black/50 hover:bg-red-500 rounded text-white transition"><X className="w-2.5 h-2.5" /></button>
                              </div>
                              <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent pointer-events-none z-10">
                                <p className="text-[9px] text-white truncate drop-shadow-md">{asset.name}</p>
                                {selected && <p className="text-[9px] text-green-400 flex items-center gap-1 drop-shadow-md"><CheckCircle className="w-2 h-2" /> {t.wb_ready}</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className={`grid gap-2 grid-cols-1`}>
                <button
                  type="button"
                  onClick={openAiOptimizeDialog}
                  className="w-full rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs font-bold text-orange-200 hover:bg-orange-500/20"
                >
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <ImagePlus className="w-3.5 h-3.5" />
                    {t.wb_ai_opt_open_btn || 'AI智能优化'}
                  </span>
                </button>
                {isKlingOmniMode && klingGenerateMode === 'first_last_frame' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleGenerateKlingBoundaryFrames();
                    }}
                    disabled={isGeneratingKlingBoundaryFrames}
                    className={`w-full rounded-lg border px-3 py-2 text-xs font-bold transition ${isGeneratingKlingBoundaryFrames ? 'border-orange-500/30 bg-orange-500/10 text-orange-300/70' : 'border-orange-500/40 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20'}`}
                  >
                    {isGeneratingKlingBoundaryFrames
                      ? (t.wb_kling_boundary_frames_generating || t.wb_generating || 'Generating...')
                      : (t.wb_kling_generate_boundary_frames || 'Generate First + Last Frames From Reference')}
                  </button>
                )}
              </div>

              {getDebugModeEnabled() && (
                <div className="flex flex-col gap-3">
                  {/* ─── DEV: Error Modal 测试面板 ─── */}
                  <div className="rounded-xl border border-dashed border-red-500/30 bg-red-500/5 p-3">
                    <h2 className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2">🧪 Error Modal Test</h2>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ['generation_failed', '生成失败', 500, 'VIDEO_GENERATION_FAILED', 'trk_test_001'],
                          ['script_failed', '脚本生成失败', 500, 'SCRIPT_GENERATION_ERROR', 'trk_test_002'],
                          ['parse_failed', '数据解析失败', 400, 'PARSE_ERROR', undefined],
                          ['recognize_failed', '识别失败', 500, 'RECOGNIZE_FAILED', 'trk_test_003'],
                          ['upload_failed', '上传失败', 502, 'UPLOAD_FAILED', 'trk_test_004'],
                          ['network_error', '网络异常', 0, undefined, undefined],
                          ['auth_error', '认证失败', 401, 'AUTH_TOKEN_EXPIRED', undefined],
                          ['unknown_error', '未知错误', 503, 'UNKNOWN', 'trk_test_005'],
                        ] as const
                      ).map(([cat, label, status, errCode, tid]) => (
                        <button
                          key={cat}
                          className="px-2 py-1 rounded border border-red-500/30 text-[10px] text-red-300 hover:bg-red-500/20 transition"
                          onClick={() => {
                            const mockErr = new VideoApiError(`Mock: ${label}`, {
                              status,
                              errorCode: errCode,
                              trackingId: tid,
                            });
                            openErrorModal(mockErr, {
                              category: cat as ErrorCategory,
                              onRetry: cat !== 'parse_failed' && cat !== 'auth_error'
                                ? () => openInfo(popupTitles.notice, `[Test] 重试 "${label}" 被调用`)
                                : undefined,
                            });
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-4">
                    <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><FolderPlus className="w-4 h-4" /> {t.wb_reuse_queue}</h2>
                    <button
                      type="button"
                      onClick={() => setReuseQueueEnabled((prev) => !prev)}
                      className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold transition ${reuseQueueEnabled ? 'border-orange-500/60 bg-orange-500/15 text-orange-300' : 'border-white/10 bg-black/40 text-zinc-400 hover:bg-white/5'}`}
                    >
                      {reuseQueueEnabled ? (t.wb_reuse_queue_mode_on || '已开启') : (t.wb_reuse_queue_mode_off || '已关闭')}
                    </button>
                  </div>
                  <div className="glass-panel rounded-xl p-4 flex flex-col gap-4">
                    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                      <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-200">
                        <Info className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{t.wb_reuse_queue_explain_title || '复用队列怎么用？'}</span>
                      </div>
                      <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">
                        {t.wb_reuse_queue_explain_desc || '用于批量复用生成：系统会将素材队列和脚本队列做笛卡尔组合（素材 × 脚本）逐条提交任务。'}
                      </p>
                      <p className={`mt-1 text-[10px] ${reuseQueueEnabled ? 'text-orange-300' : 'text-zinc-500'}`}>
                        {reuseQueueEnabled
                          ? (t.wb_reuse_queue_enable_hint || '当前为批量模式：请把素材和脚本分别加入队列再生成。')
                          : (t.wb_reuse_queue_disable_hint || '当前为单次模式：开启后才显示队列内容，适合大量复用场景。')}
                      </p>
                    </div>

                    {!reuseQueueEnabled ? (
                      <div className="text-[10px] text-zinc-500 border border-dashed border-white/10 rounded-lg px-3 py-2.5">
                        {t.wb_reuse_queue_collapsed_hint || '复用队列已折叠。点击右上角按钮开启后即可维护队列。'}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] text-zinc-400 font-bold uppercase">{t.wb_asset_queue}</div>
                          <button
                            onClick={addCurrentAssetToQueue}
                            disabled={!uploadedFile && !selectedAssetUrl}
                            className={`text-[10px] px-2 py-1 rounded border border-white/10 ${!uploadedFile && !selectedAssetUrl ? 'text-zinc-600' : 'text-orange-500 hover:bg-white/5'}`}
                          >
                            {t.wb_add_asset_queue}
                          </button>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto custom-scroll pr-1">
                          {assetQueue.length === 0 ? <div className="text-[10px] text-zinc-600">{t.wb_empty_assets}</div> : assetQueue.map(item => (
                            <div
                              key={item.id}
                              onClick={() => selectAssetFromQueue(item)}
                              className={`flex items-center gap-2 rounded-lg p-2 border cursor-pointer transition ${selectedQueueAssetId === item.id ? 'bg-orange-500/10 border-orange-500/30' : 'bg-black/30 border-white/5 hover:bg-white/5'}`}
                            >
                              <div className="w-8 h-8 rounded bg-zinc-800 overflow-hidden shrink-0">
                                {item.previewUrl && (item.mediaKind === 'video' ? (
                                  <video src={item.previewUrl} className="w-full h-full object-cover" muted playsInline />
                                ) : (
                                  <img src={item.previewUrl} className="w-full h-full object-cover" />
                                ))}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-zinc-300">
                                    {materialTypeLabelMap[item.materialType || 'product']}
                                  </span>
                                  <div className="text-[10px] text-zinc-200 truncate">{item.name}</div>
                                </div>
                              </div>
                              <label
                                className={`shrink-0 flex items-center gap-1 text-[10px] px-1.5 py-1 rounded border transition ${item.mediaKind === 'image' ? 'border-white/10 text-zinc-300 hover:bg-white/5 cursor-pointer' : 'border-zinc-800 text-zinc-600 cursor-not-allowed'}`}
                                onClick={(e) => e.stopPropagation()}
                                title={item.mediaKind === 'image'
                                  ? (isKlingOmniMode
                                    ? (klingGenerateMode === 'subject' ? (t.wb_select_as_subject_reference || 'Use this asset as subject reference') : (t.wb_select_as_first_frame || 'Use this asset as first frame'))
                                    : (t.wb_select_as_first_frame || 'Use this asset as first frame'))
                                  : (t.wb_only_image_as_primary || 'Only image assets can be used as primary reference')}
                              >
                                <input
                                  type="checkbox"
                                  checked={isKlingOmniMode
                                    ? (klingGenerateMode === 'subject' ? item.source === 'subject' : item.source === 'product')
                                    : !!item.isPrimaryFrame}
                                  disabled={item.mediaKind !== 'image'}
                                  onChange={() => markQueueAssetAsPrimaryFrame(item.id)}
                                  className="accent-orange-500"
                                />
                                <span>{isKlingOmniMode ? (klingGenerateMode === 'subject' ? (t.wb_label_subject_short || 'Subject') : (t.wb_label_first_frame_short || 'First')) : (t.wb_label_first_frame_short || 'First')}</span>
                              </label>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeAssetFromQueue(item.id);
                                }}
                              >
                                <X className="w-3 h-3 text-zinc-600 hover:text-red-400" />
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="text-[10px] text-zinc-400 font-bold uppercase">{t.wb_script_queue}</div>
                          <button
                            onClick={addCurrentScriptToQueue}
                            className="text-[10px] px-2 py-1 rounded border border-white/10 text-orange-500 hover:bg-white/5"
                          >
                            {t.wb_add_script_queue}
                          </button>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto custom-scroll pr-1">
                          {scriptQueue.length === 0 ? <div className="text-[10px] text-zinc-600">{t.wb_empty_scripts}</div> : scriptQueue.map(item => (
                            <div key={item.id} className="flex items-center gap-2 bg-black/30 rounded-lg p-2 border border-white/5">
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] text-zinc-200 truncate">{item.name}</div>
                                <div className="text-[9px] text-zinc-500">{enableStoryboardEditor ? `${item.scripts.length} shots` : '完整脚本方案'}</div>
                              </div>
                              <button onClick={() => removeScriptFromQueue(item.id)}><X className="w-3 h-3 text-zinc-600 hover:text-red-400" /></button>
                            </div>
                          ))}
                        </div>

                        <div className="text-[10px] text-zinc-500 pt-2 border-t border-white/5">
                          {t.wb_estimated_generate}: {assetQueue.length} × {scriptQueue.length} = {expectedBatchCount}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
          </div>
        </div>

        {renderLeftColumnSettings()}

        <div className="pt-1">
          {!isSeedanceReplayMode && (
            <>
          {scriptGenerationNotice && !isScriptGenerationForCurrentProject && (
            <div className="mb-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-medium text-emerald-200 shadow-[0_8px_24px_rgba(16,185,129,0.12)]">
              {scriptGenerationNotice}
            </div>
          )}
          {showScriptGenerationProgressForCurrentProject && (
            <div className="mb-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-zinc-400">
                <span>{t.wb_waiting_progress || '进度'}</span>
                <div className="flex items-center gap-3">
                  <span>{formatMessage(t.wb_script_generation_count_status || '已生成 {current}/{total} 份', { current: scriptGenerationCompletedCount, total: Math.max(scriptGenerationTotalCount, scriptGenerationCompletedCount, 1) })}</span>
                  <span>{`${Math.max(0, Math.min(100, Math.round(scriptGenerationProgress)))}%`}</span>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-orange-200 transition-[width] duration-200 ease-out"
                  style={{ width: `${Math.max(3, Math.min(100, scriptGenerationProgress))}%` }}
                />
              </div>
            </div>
          )}
          {isScriptGenerationForCurrentProject ? (
            <div className="flex w-full gap-2">
              <button
                type="button"
                onClick={handleCancelGenerateScripts}
                className="w-1/3 rounded-xl border border-orange-500/35 bg-orange-500/10 px-2 py-3 text-[10px] font-semibold text-orange-100 transition hover:bg-orange-500/18 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60"
              >
                {t.wb_btn_cancel_script_generation || '取消生成'}
              </button>
              <div className="flex w-2/3 items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-xs font-bold text-zinc-200">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t.wb_generating}</span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (isScriptGenerationForCurrentProject) {
                  openInfo(popupTitles.notice, t.wb_generate_in_progress);
                  return;
                }
                if (!hasCurrentAsset) {
                  openInfo(popupTitles.notice, t.wb_generate_need_asset);
                  return;
                }
                void handleGenerateScripts();
              }}
              className={`w-full py-3 rounded-xl font-bold text-xs transition group border border-white/10 bg-black/30 text-zinc-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 ${!hasCurrentAsset ? 'opacity-40 hover:bg-black/30' : ''}`}
            >
              <span className="flex w-full items-center justify-center gap-2 px-3">
                <Wand2 className="w-4 h-4 shrink-0 group-hover:rotate-12 transition" />
                <span className="whitespace-nowrap">{t.wb_btn_gen_scripts}</span>
              </span>
            </button>
          )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`relative flex flex-col h-full overflow-hidden border border-white/10 bg-zinc-950/80 shadow-2xl backdrop-blur-xl ${isGuideOpen ? 'z-[80]' : 'z-10'}`}>
      <header className="flex justify-between items-center px-8 py-4 border-b border-white/5 bg-black/20 backdrop-blur-sm shrink-0 relative z-50">
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              ref={projectMenuButtonRef}
              type="button"
              title={projectUiText.listTooltip}
              onClick={() => {
                setProjectMenuOpen((prev) => !prev);
                setProjectActionMenuId(null);
              }}
              className="p-2 rounded-md border border-white/10 text-zinc-300 hover:text-white hover:border-white/30 hover:bg-white/10 transition"
            >
              <List className="w-4 h-4" />
            </button>

            {projectMenuOpen && (
              <div
                ref={projectMenuRef}
                onMouseDown={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest('[data-project-action-root="true"]')) return;
                  setProjectActionMenuId(null);
                }}
                className="absolute top-11 left-0 w-[360px] rounded-xl border border-white/10 bg-zinc-950/95 backdrop-blur-xl shadow-2xl shadow-black/60 p-3 text-sm"
              >
                <div className="text-sm font-bold text-zinc-100 px-2 pb-2">{projectUiText.switchTitle}</div>
                <div className="px-2">
                  <input
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder={projectUiText.searchPlaceholder}
                    className="w-full rounded-lg border border-white/10 bg-black/40 text-zinc-200 text-xs px-3 py-2 outline-none focus:border-orange-500"
                  />
                </div>
                <div className="h-px bg-white/10 my-3" />
                <div className="px-2 pb-1 flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-widest text-zinc-500">{projectUiText.recent}</div>
                  {isProjectManageMode && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const ids = filteredProjects.map((p) => p.id);
                          const allSelected = ids.length > 0 && ids.every((id) => selectedProjectIds.includes(id));
                          setSelectedProjectIds(allSelected ? [] : ids);
                        }}
                        className="text-[11px] px-2 py-1 rounded border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10"
                      >
                        {(() => {
                          const ids = filteredProjects.map((p) => p.id);
                          const allSelected = ids.length > 0 && ids.every((id) => selectedProjectIds.includes(id));
                          return allSelected ? projectUiText.manageUnselectAll : projectUiText.manageSelectAll;
                        })()}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsProjectManageMode(false);
                          setSelectedProjectIds([]);
                        }}
                        className="text-[11px] px-2 py-1 rounded border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10"
                      >
                        {projectUiText.manageCancel || projectUiText.cancel}
                      </button>
                      <button
                        type="button"
                        disabled={selectedProjectIds.length === 0}
                        onClick={() => setDeleteProjectIds(selectedProjectIds)}
                        className={`text-[11px] px-2 py-1 rounded text-white ${selectedProjectIds.length === 0 ? 'bg-red-600/40 cursor-not-allowed' : 'bg-red-600 hover:bg-red-500'}`}
                      >
                        {projectUiText.manageDelete || projectUiText.delete}
                      </button>
                    </div>
                  )}
                </div>
                <div
                  ref={projectListRef}
                  className="overflow-y-auto custom-scroll pr-1"
                  style={{ maxHeight: 256, paddingBottom: PROJECT_ACTION_MENU_RESERVED_SPACE }}
                >
                  {filteredProjects.length === 0 && (
                    <div className="px-2 py-3 text-xs text-zinc-500">{projectUiText.empty}</div>
                  )}
                  {filteredProjects.map((project) => {
                    const isCurrent = project.id === projectStore.currentProjectId;
                    const isRenaming = renamingProjectId === project.id;
                    return (
                      <div key={project.id} className="project-menu-item-row group relative flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5">
                        <button
                          type="button"
                          onClick={() => {
                            if (isProjectManageMode) {
                              toggleProjectSelection(project.id);
                              return;
                            }
                            switchProject(project.id);
                          }}
                          className="project-menu-item-btn flex-1 min-w-0 text-left bg-transparent border-0 appearance-none"
                        >
                          <div className="flex items-center gap-2">
                            {isProjectManageMode && (
                              <span
                                className={`w-4 h-4 rounded border shrink-0 inline-flex items-center justify-center ${selectedProjectIds.includes(project.id) ? 'bg-orange-500 border-orange-500 text-black' : 'border-white/30 text-transparent'}`}
                              >
                                <Check className="w-3 h-3" />
                              </span>
                            )}
                            <span className="shrink-0">
                              {isCurrent ? (
                                <span className="inline-flex items-center justify-center whitespace-nowrap leading-none px-2 py-1 rounded-md bg-orange-500 text-black text-[10px] font-black">
                                  {projectUiText.currentTag}
                                </span>
                              ) : null}
                            </span>
                            {isRenaming ? (
                              <input
                                autoFocus
                                value={renamingProjectName}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => setRenamingProjectName(event.target.value)}
                                onBlur={() => {
                                  const renameSuccess = commitProjectRename(project.id, renamingProjectName, {
                                    keepEditingOnFail: true,
                                    originalName: project.name,
                                  });
                                  if (renameSuccess) {
                                    setRenamingProjectId(null);
                                  } else {
                                    setRenamingProjectName(project.name);
                                  }
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    const renameSuccess = commitProjectRename(project.id, renamingProjectName, {
                                      keepEditingOnFail: true,
                                      originalName: project.name,
                                    });
                                    if (renameSuccess) {
                                      setRenamingProjectId(null);
                                    } else {
                                      setRenamingProjectName(project.name);
                                    }
                                  } else if (event.key === 'Escape') {
                                    setRenamingProjectId(null);
                                  }
                                }}
                                className="w-[180px] rounded border border-white/10 bg-black/40 text-zinc-100 text-xs px-2 py-1 outline-none focus:border-orange-500"
                              />
                            ) : (
                              <span className="text-sm text-zinc-100 truncate">{project.name}</span>
                            )}
                            <span className="text-[11px] text-zinc-500 shrink-0">{formatProjectLastEdited(project.updatedAt)}</span>
                          </div>
                        </button>
                        {!isProjectManageMode && <div className="relative" data-project-action-root="true">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              const nextId = project.id;
                              const isClosing = projectActionMenuId === nextId;
                              if (isClosing) {
                                setProjectActionMenuId(null);
                                return;
                              }

                              setProjectActionMenuId(nextId);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          {projectActionMenuId === project.id && (
                            <div data-project-action-menu="true" className="absolute right-0 top-7 w-28 rounded-lg border border-white/10 bg-zinc-900 shadow-xl p-1 z-20">
                              <button
                                type="button"
                                onClick={() => {
                                  setProjectActionMenuId(null);
                                  setRenamingProjectId(project.id);
                                  setRenamingProjectName(project.name);
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-zinc-200 hover:bg-white/10"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                {projectUiText.rename}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setProjectActionMenuId(null);
                                  setDeleteProjectTarget(project);
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-red-400 hover:bg-red-500/10"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                {projectUiText.delete}
                              </button>
                            </div>
                          )}
                        </div>}
                      </div>
                    );
                  })}
                </div>

                <div className="h-px bg-white/10 my-3" />
                <div className="flex items-center justify-end gap-2 px-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewProjectNameDraft(projectUiText.defaultProjectName);
                      setCreateProjectNameError('');
                      setIsCreateProjectOpen(true);
                    }}
                    className="text-xs px-2 py-1 rounded text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                  >
                    + {projectUiText.newProject}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsProjectManageMode(true);
                      setSelectedProjectIds([]);
                      setProjectActionMenuId(null);
                    }}
                    className="text-xs px-2 py-1 rounded text-zinc-300 hover:text-white hover:bg-white/10"
                  >
                    {projectUiText.manageProjects}
                  </button>
                </div>
              </div>
            )}
          </div>
          {isHeaderProjectEditing ? (
            <input
              autoFocus
              value={headerProjectNameDraft}
              onChange={(event) => setHeaderProjectNameDraft(event.target.value)}
              onBlur={() => {
                if (currentProject) commitProjectRename(currentProject.id, headerProjectNameDraft);
                setIsHeaderProjectEditing(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  if (currentProject) commitProjectRename(currentProject.id, headerProjectNameDraft);
                  setIsHeaderProjectEditing(false);
                } else if (event.key === 'Escape') {
                  setIsHeaderProjectEditing(false);
                }
              }}
              style={{ width: `${Math.max(1.2, Math.min(estimateProjectNameWidthEm(headerProjectNameDraft || currentProject?.name || ''), 22))}em` }}
              className="text-xl font-bold tracking-tight text-white bg-transparent border-b border-white/30 focus:border-orange-500 outline-none"
            />
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white cursor-text" onClick={beginHeaderRename}>
                {currentProject?.name || DEFAULT_PROJECT_NAME}
              </h1>
            </div>
          )}
          {ENABLE_PROMPT_LAB && (
            <>
              <button
                onClick={openPromptLab}
                className="flex items-center gap-1.5 px-2 py-1 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition"
                title="查看/编辑内置 prompts（临时功能）"
              >
                <FileJson className="w-4 h-4" />
                <span className="text-[12px] font-bold">Prompt</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setGuideStepIndex(0);
                  setIsGuideOpen(true);
                }}
                className="flex items-center gap-1.5 px-2 py-1 rounded border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 transition"
                title={t.wb_guide_button_title}
              >
                <Sparkles className="w-4 h-4" />
                <span className="text-[12px] font-bold">{t.wb_guide_button_label}</span>
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/privacy-policy"
            className="flex items-center px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition"
            title={t.login_agreement_privacy || '隐私政策'}
          >
            <span className="text-[11px] font-bold">{t.login_agreement_privacy || '隐私政策'}</span>
          </a>
          <a
            href="/terms-of-service"
            className="flex items-center px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition"
            title={t.login_agreement_user || '服务条款'}
          >
            <span className="text-[11px] font-bold">{t.login_agreement_user || '服务条款'}</span>
          </a>
          <div className="relative">
            <button
              ref={taskQueueButtonRef}
              type="button"
              onClick={() => setIsTaskQueueOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-200 transition"
              title={t.wb_queue_tooltip || '查看正在生成的视频队列'}
            >
              <List className="w-4 h-4" />
              <span className="text-[11px] font-bold">{t.wb_queue_label || '生成队列'}</span>
              {activeVideoTaskCount > 0 ? (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 text-[10px] font-black border border-orange-500/30">
                  {activeVideoTaskCount}
                </span>
              ) : null}
            </button>

            {isTaskQueueOpen && (
              <div
                ref={taskQueuePanelRef}
                className="absolute right-0 mt-2 w-96 rounded-xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/60 backdrop-blur p-3 z-50"
              >
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    {t.wb_queue_processing || '正在生成'} {activeVideoTaskCount > 0 ? `(${activeVideoTaskCount})` : ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTaskQueueOpen(false)}
                    className="text-zinc-400 hover:text-white"
                    title={t.wb_queue_close || '关闭'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {activeVideoTaskCount === 0 ? (
                  <div className="mt-3 text-xs text-zinc-500">{t.wb_queue_empty_processing || '暂无正在生成的任务'}</div>
                ) : (
                  <div className="mt-3 space-y-2 max-h-64 overflow-y-auto custom-scroll pr-1">
                    {activeVideoTasks.slice(0, 12).map((task) => {
                      const elapsed = Math.max(0, Math.floor((taskQueueNowTs - task.createdAt) / 1000));
                      const total = (() => {
                        const raw = Number((task as any)?.estimatedSeconds);
                        if (Number.isFinite(raw) && raw > 0) return Math.round(raw);
                        return 120;
                      })();
                      const left = Math.max(0, total - elapsed);
                      const remainingTpl = t.wb_queue_remaining || '预估剩余 {s}s';
                      const countdownText = left > 0 ? remainingTpl.replace('{s}', String(left)) : (t.wb_queue_soon_done || '马上完成');
                      const backendProjectId = String(task.projectId || '').trim();
                      const workbenchProjectId = String((task as any)?.workbenchProjectId || '').trim();
                      const displayProjectId = workbenchProjectId || backendProjectId;
                      const projectName = projectStore.projects.find((p) => p.id === displayProjectId)?.name || (displayProjectId ? `Project ${displayProjectId.slice(0, 6)}` : DEFAULT_PROJECT_NAME);
                      const baseName = task.name || `Task ${task.id}`;
                      const displayName = `${projectName} / ${baseName}`;

                      return (
                        <div key={task.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                          <Loader2 className="w-4 h-4 animate-spin text-orange-500 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-zinc-100 truncate" title={displayName}>
                              {displayName}
                            </div>
                            <div className="text-[10px] text-zinc-500 truncate">ID: {String(task.id)}</div>
                          </div>
                          <div className="text-[11px] text-zinc-300 shrink-0">{countdownText}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                      {t.wb_queue_completed || '生成完成'} {completedVideoTaskCount > 0 ? `(${completedVideoTaskCount})` : ''}
                    </div>
                    {completedVideoTaskCount > 3 && (
                      <button
                        type="button"
                        onClick={() => setIsCompletedCollapsed(prev => !prev)}
                        className="text-zinc-400 hover:text-white"
                        aria-label={isCompletedCollapsed ? (t.wb_expand || '展开') : (t.wb_collapse || '折叠')}
                        title={isCompletedCollapsed ? (t.wb_expand || '展开') : (t.wb_collapse || '折叠')}
                      >
                        {isCompletedCollapsed ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronUp className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>

                  {completedVideoTaskCount === 0 ? (
                    <div className="mt-2 text-xs text-zinc-500">{t.wb_queue_empty_completed || '暂无生成完成的任务'}</div>
                  ) : (isCompletedCollapsed && completedVideoTaskCount > 3) ? null : (
                    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto custom-scroll pr-1">
                      {completedVideoTasks.slice(0, 12).map((task) => {
                        const rawUrl = task.result?.video_url || task.result?.url;
                        const url = typeof rawUrl === 'string' ? rawUrl : '';
                        const canPreview = !!url;
                        const backendProjectId = String(task.projectId || '').trim();
                        const workbenchProjectId = String((task as any)?.workbenchProjectId || '').trim();
                        const displayProjectId = workbenchProjectId || backendProjectId;
                        const projectName = projectStore.projects.find((p) => p.id === displayProjectId)?.name || (displayProjectId ? `Project ${displayProjectId.slice(0, 6)}` : DEFAULT_PROJECT_NAME);
                        const baseName = task.name || `Task ${task.id}`;
                        const displayName = `${projectName} / ${baseName}`;

                        return (
                          <button
                            key={task.id}
                            onClick={() => {
                              const debugPayload = {
                                taskId: task.id,
                                backendProjectId: (task as any)?.projectId,
                                workbenchProjectId: (task as any)?.workbenchProjectId,
                                normalizedBackendProjectId: backendProjectId,
                                normalizedWorkbenchProjectId: workbenchProjectId,
                                displayProjectId,
                                hasUrl: !!url,
                              };
                              console.log('[TaskQueue] click completed item', debugPayload);
                              setToastMessage(`Task ${String(task.id)} → project ${displayProjectId.slice(0, 10)}`);

                              if (!canPreview) return;

                              if (workbenchProjectId && projectStore.projects.some((p) => p.id === workbenchProjectId)) {
                                setIsTaskQueueOpen(false);
                                goToProject(workbenchProjectId, () => {
                                  setGeneratedVideoUrl(url);
                                  setPreviewProjectId(workbenchProjectId);
                                  setLastGeneratedProjectId(backendProjectId || null);
                                  setTimeout(() => previewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
                                });
                                return;
                              }

                              console.warn('[TaskQueue] completed item has no mapped workbenchProjectId; skip creating placeholder project', debugPayload);
                              setToastMessage(t.wb_queue_unbound_toast || '该任务未绑定到工作台项目（旧数据），无法跳转项目');
                            }}
                            className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-2 ${canPreview ? 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-200' : 'border-white/5 bg-white/5 text-zinc-500 cursor-not-allowed'}`}
                            title={displayName}
                          >
                            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs truncate">{displayName}</div>
                              <div className="text-[10px] text-zinc-500 truncate">ID: {String(task.id)}</div>
                            </div>
                            <div className="text-[11px] text-zinc-400 shrink-0">{canPreview ? (t.wb_queue_preview || '预览') : (t.wb_queue_no_video || '暂无视频')}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <LanguageSwitcher />
        </div>
      </header>

      {ENABLE_PROMPT_LAB && isPromptLabOpen && (
        <PromptLabWindow
          templates={promptTemplates}
          loading={promptTemplatesLoading}
          error={promptTemplatesError}
          onReload={loadPromptLabTemplates}
          overrides={promptOverrides}
          onChangeOverrides={setPromptOverrides}
          debug={{
            isPreparing: isPreparingDebug,
            isSending: isSendingDebug,
            payloadText: debugPayloadText,
            onChangePayloadText: setDebugPayloadText,
            preview: debugPreview,
            onPrepare: handlePrepareDebug,
            onRefresh: handleRefreshDebugPreview,
            onSend: handleSendDebugPayload,
          }}
          onClose={() => setIsPromptLabOpen(false)}
        />
      )}

      {isGuideOpen && (
        <>
          <div
            className="fixed z-[90] rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/60 p-4"
            style={guidePanelStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-bold text-white">{t.wb_guide_title}</div>
                <div className="mt-1 text-xs text-zinc-400">{t.wb_guide_step} {guideStepIndex + 1} / {guideSteps.length}</div>
              </div>
              <button
                type="button"
                onClick={() => setIsGuideOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-3">
              <div className="text-sm font-bold text-orange-400">{activeGuideStep?.title}</div>
              <div className="mt-2 text-sm text-zinc-100">{activeGuideStep?.description}</div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={guideStepIndex <= 0}
                onClick={() => setGuideStepIndex((prev) => Math.max(0, prev - 1))}
              >
                {t.wb_guide_prev}
              </button>
              <button
                className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-600"
                onClick={() => {
                  if (guideStepIndex >= guideSteps.length - 1) {
                    setIsGuideOpen(false);
                    return;
                  }
                  setGuideStepIndex((prev) => Math.min(guideSteps.length - 1, prev + 1));
                }}
              >
                {guideStepIndex >= guideSteps.length - 1 ? t.wb_guide_finish : t.wb_guide_next}
              </button>
            </div>
          </div>
        </>
      )}

      {toastMessage && (
        <div className="fixed left-6 bottom-6 z-[140] max-w-[360px] rounded-xl border border-white/10 bg-black/70 px-4 py-3 text-xs text-zinc-200 shadow-lg shadow-black/30">
          {toastMessage}
        </div>
      )}

      {/* 中转站 */}
      <div className="fixed right-6 bottom-6 z-[132] flex flex-col items-end gap-2">
        {isTransferStationOpen && (
          <div className="w-[320px] max-h-[52vh] overflow-hidden rounded-2xl border border-orange-500/25 bg-zinc-950/92 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <div className="text-xs font-bold text-zinc-100">
                {t.wb_transfer_station_title || 'Transfer Station'}
              </div>
              <div className="flex items-center gap-2">
                {transferStationItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearTransferStationEntries}
                    className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-300 transition hover:bg-white/10 hover:text-white"
                  >
                    {t.wb_transfer_station_clear_btn || 'Clear'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsTransferStationOpen(false)}
                  className="text-zinc-400 transition hover:text-white"
                  title={t.wb_queue_close || 'Close'}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {transferStationItems.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-zinc-500">
                {t.wb_transfer_station_empty || 'No assets yet. Add assets or history items into the transfer station first.'}
              </div>
            ) : (
              <div className="max-h-[42vh] space-y-2 overflow-y-auto p-3 custom-scroll">
                {transferStationItems.map((item) => {
                  const mediaLabel = item.mediaKind === 'script'
                    ? (t.wb_transfer_station_media_script || 'Script')
                    : item.mediaKind === 'video'
                      ? (t.wb_upload_video || 'Video')
                      : item.mediaKind === 'audio'
                        ? (t.wb_upload_audio || 'Audio')
                        : (t.wb_upload_image || 'Image');
                  const sourceLabel = item.source === 'history'
                    ? (t.wb_transfer_station_source_history || 'History')
                    : item.source === 'replay'
                      ? (t.wb_transfer_station_source_replay || 'Replay')
                      : (t.wb_transfer_station_source_assets || 'Assets');

                  return (
                    <div key={item.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => handleTransferStationItemDragStart(item, event)}
                        onClick={() => handleUseTransferStationItem(item)}
                        className="group flex min-w-0 flex-1 items-center gap-2 text-left"
                        title={item.mediaKind === 'script'
                          ? (t.wb_transfer_station_drag_hint_script || 'Drag to scripts area, or click to apply')
                          : (t.wb_transfer_station_drag_hint || 'Drag to upload area, or click to apply')}
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                          {item.mediaKind === 'video' ? (
                            <video src={item.fileUrl} className="h-full w-full object-cover" muted playsInline />
                          ) : item.mediaKind === 'audio' ? (
                            <div className="flex h-full w-full items-center justify-center text-zinc-300">
                              <Music className="h-4 w-4" />
                            </div>
                          ) : item.mediaKind === 'script' ? (
                            <div className="flex h-full w-full items-center justify-center text-zinc-300">
                              <FileJson className="h-4 w-4" />
                            </div>
                          ) : (
                            <img src={item.fileUrl} alt={item.name} className="h-full w-full object-cover" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-zinc-100">{item.name}</div>
                          {item.mediaKind === 'script' && item.scriptContent ? (
                            <div className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-zinc-400">
                              {item.scriptContent}
                            </div>
                          ) : (
                            <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-400">
                              <span className="rounded border border-white/10 px-1.5 py-0.5">{mediaLabel}</span>
                              <span className="rounded border border-white/10 px-1.5 py-0.5">{sourceLabel}</span>
                            </div>
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveTransferStationEntry(item.id)}
                        className="rounded-md border border-white/10 p-1.5 text-zinc-400 transition hover:border-red-400/60 hover:text-red-300"
                        title={t.wb_transfer_station_remove_btn || 'Remove'}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsTransferStationOpen((prev) => !prev)}
          className="group relative flex h-14 w-14 items-center justify-center rounded-full border border-orange-400/50 bg-gradient-to-br from-orange-500/90 to-amber-500/80 text-white shadow-[0_16px_35px_rgba(251,146,60,0.35)] transition hover:scale-[1.04]"
          title={t.wb_transfer_station_title || 'Transfer Station'}
        >
          <FolderPlus className="h-6 w-6" />
          <span className="pointer-events-none absolute -right-1 -top-1 min-w-[20px] rounded-full border border-black/20 bg-black/75 px-1.5 py-0.5 text-[10px] font-black leading-none text-orange-200">
            {transferStationItems.length}
          </span>
          <span className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-md border border-white/10 bg-black/80 px-2 py-1 text-[10px] font-semibold text-zinc-100 opacity-0 transition group-hover:opacity-100">
            {t.wb_transfer_station_title || 'Transfer Station'}
          </span>
        </button>
      </div>

      {/* 结构化错误弹窗 —— 替代原有的 openInfo(error) 纯文本展示 */}
      {errorModalData && (
        <ErrorModal
          isOpen={true}
          title={errorModalData.title}
          code={errorModalData.code}
          message={errorModalData.message}
          details={errorModalData.details}
          suggestions={errorModalData.suggestions}
          actions={errorModalData.actions}
          trackingId={errorModalData.trackingId}
          onClose={closeErrorModal}
        />
      )}

      {isInfoOpen && (
        <AppDialog isOpen={isInfoOpen} title={infoTitle || 'Notice'} onClose={closeInfoDialog} footer={<><button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700" onClick={closeInfoDialog}>OK</button></>}>
          <div className="whitespace-pre-line text-sm text-zinc-300">{infoMessage}</div>
        </AppDialog>
      )}
      {pendingGuestMigration && (
        <AppDialog
          isOpen={!!pendingGuestMigration}
          title={language === 'zh' ? '检测到游客模式数据' : 'Guest mode data detected'}
          onClose={() => applyGuestMigrationChoice('discard')}
          widthClassName="max-w-lg"
          footer={
            <>
              <button
                className="px-4 py-2 rounded-lg bg-orange-500 text-black text-sm font-bold hover:bg-orange-400 transition"
                onClick={() => applyGuestMigrationChoice('merge')}
                type="button"
              >
                {language === 'zh' ? '合并到现有工作台' : 'Merge into current workspace'}
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-white/10 text-zinc-200 text-sm font-bold hover:bg-white/20 transition"
                onClick={() => applyGuestMigrationChoice('overwrite')}
                type="button"
              >
                {language === 'zh' ? '用游客内容覆盖' : 'Overwrite with guest content'}
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm font-bold hover:bg-zinc-700 transition"
                onClick={() => applyGuestMigrationChoice('discard')}
                type="button"
              >
                {language === 'zh' ? '丢弃游客内容' : 'Discard guest content'}
              </button>
            </>
          }
        >
          <div className="space-y-3 text-sm text-zinc-300">
            <p>
              {language === 'zh'
                ? '您在登录前以游客身份在这个浏览器上做了如下操作：'
                : "You made the following changes as a guest on this browser before logging in:"}
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-zinc-400">
              <li>
                {language === 'zh'
                  ? `项目数：${pendingGuestMigration.stats.projectCount}`
                  : `Projects: ${pendingGuestMigration.stats.projectCount}`}
              </li>
              <li>
                {language === 'zh'
                  ? `工作区：${pendingGuestMigration.stats.workspaceCount}`
                  : `Workspaces: ${pendingGuestMigration.stats.workspaceCount}`}
              </li>
              <li>
                {language === 'zh'
                  ? `已上传素材：${pendingGuestMigration.stats.uploadedFileCount}`
                  : `Uploaded assets: ${pendingGuestMigration.stats.uploadedFileCount}`}
              </li>
              <li>
                {language === 'zh'
                  ? `已生成脚本：${pendingGuestMigration.stats.totalScriptCount}`
                  : `Generated scripts: ${pendingGuestMigration.stats.totalScriptCount}`}
              </li>
            </ul>
            <p>
              {language === 'zh'
                ? '当前账号在这个浏览器也存有数据。请选择如何处理：'
                : 'This account already has data on this browser. Please choose how to handle it:'}
            </p>
            <ul className="list-none space-y-1 text-xs text-zinc-400">
              <li>
                <span className="text-orange-300 font-semibold">
                  {language === 'zh' ? '合并' : 'Merge'}
                </span>
                {language === 'zh'
                  ? '：游客的项目作为新项目并入现有工作台，原有项目保留。登录后第一眼会看到刚刚上传的内容。'
                  : ': Guest projects are added as new projects, your existing projects are kept. You\'ll land on the just-uploaded content.'}
              </li>
              <li>
                <span className="text-zinc-200 font-semibold">
                  {language === 'zh' ? '覆盖' : 'Overwrite'}
                </span>
                {language === 'zh'
                  ? '：用游客内容替换现有工作台，原有项目会被清空（请确认）。'
                  : ': Replace the existing workspace with guest content. Your existing projects will be removed.'}
              </li>
              <li>
                <span className="text-zinc-300 font-semibold">
                  {language === 'zh' ? '丢弃' : 'Discard'}
                </span>
                {language === 'zh'
                  ? '：保留现有工作台，游客上传的临时数据会被清空。'
                  : ': Keep the existing workspace; guest data will be discarded.'}
              </li>
            </ul>
          </div>
        </AppDialog>
      )}
      {isConfirmOpen && (
        <AppDialog
          isOpen={isConfirmOpen}
          title={confirmTitle || 'Confirm'}
          onClose={() => { setIsConfirmOpen(false); if (confirmResolveRef.current) { confirmResolveRef.current(false); confirmResolveRef.current = null; } }}
          footer={
            <>
              <button className="bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-600" onClick={() => { setIsConfirmOpen(false); if (confirmResolveRef.current) { confirmResolveRef.current(false); confirmResolveRef.current = null; } }}>{confirmCancelLabel || t.wb_confirm_cancel}</button>
              <button className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-600" onClick={() => { setIsConfirmOpen(false); if (confirmResolveRef.current) { confirmResolveRef.current(true); confirmResolveRef.current = null; } }}>{confirmOkLabel || t.wb_confirm_ok}</button>
            </>
          }
        >
          <div className="whitespace-pre-line text-sm text-zinc-300">{confirmMessage}</div>
        </AppDialog>
      )}
      <AiOverwriteDialog
        isOpen={isAiOverwriteOpen}
        fields={aiOverwriteFields}
        title={t.wb_ai_overwrite_dialog_title}
        applyLabel={t.wb_ai_overwrite_apply}
        cancelLabel={t.wb_ai_overwrite_confirm_cancel}
        currentLabel={t.wb_ai_overwrite_field_current}
        newLabel={t.wb_ai_overwrite_field_new}
        onConfirm={(selectedKeys) => {
          setIsAiOverwriteOpen(false);
          if (aiOverwriteResolveRef.current) {
            aiOverwriteResolveRef.current(selectedKeys);
            aiOverwriteResolveRef.current = null;
          }
        }}
        onCancel={() => {
          setIsAiOverwriteOpen(false);
          if (aiOverwriteResolveRef.current) {
            aiOverwriteResolveRef.current(null);
            aiOverwriteResolveRef.current = null;
          }
        }}
      />
      {isKlingSubjectGuideOpen && (
        <AppDialog
          isOpen={isKlingSubjectGuideOpen}
          title="提示"
          onClose={() => setIsKlingSubjectGuideOpen(false)}
          footer={
            <>
              <button
                className="rounded-xl border border-orange-500/70 bg-orange-500/10 px-4 py-2 text-sm font-bold text-orange-200 hover:bg-orange-500/20"
                onClick={() => {
                  setIsKlingSubjectGuideOpen(false);
                  openSubjectCreationLibrary();
                }}
              >
                去创建主体
              </button>
              <button
                className="bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-600"
                onClick={() => setIsKlingSubjectGuideOpen(false)}
              >
                取消
              </button>
            </>
          }
        >
          <div className="whitespace-pre-line text-sm text-zinc-300">{`主体模式不能直接使用单张图片。
请先去素材库创建“主体”，上传同一主体的多张不同角度图片，例如正面、侧面、背面或不同姿态。
创建完成后，再回到这里选择该主体。`}</div>
        </AppDialog>
      )}
      {deleteProjectTarget && (
        <AppDialog
          isOpen={!!deleteProjectTarget}
          title={projectUiText.deleteTitle}
          onClose={() => setDeleteProjectTarget(null)}
          footer={
            <>
              <button
                className="bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-600"
                onClick={() => setDeleteProjectTarget(null)}
              >
                {projectUiText.cancel}
              </button>
              <button
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-500"
                onClick={() => {
                  const target = deleteProjectTarget;
                  if (!target) return;
                  removeProjectsByIds([target.id]);
                  setDeleteProjectTarget(null);
                  setProjectMenuOpen(false);
                }}
              >
                {projectUiText.delete}
              </button>
            </>
          }
        >
          <div className="whitespace-pre-line text-sm text-zinc-300">{projectUiText.deleteDesc}</div>
        </AppDialog>
      )}
      {deleteProjectIds.length > 0 && (
        <AppDialog
          isOpen={deleteProjectIds.length > 0}
          title={projectUiText.bulkDeleteTitle || projectUiText.deleteTitle}
          onClose={() => setDeleteProjectIds([])}
          footer={
            <>
              <button
                className="bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-600"
                onClick={() => setDeleteProjectIds([])}
              >
                {projectUiText.cancel}
              </button>
              <button
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-500"
                onClick={() => {
                  removeProjectsByIds(deleteProjectIds);
                  setDeleteProjectIds([]);
                  setSelectedProjectIds([]);
                  setIsProjectManageMode(false);
                }}
              >
                {projectUiText.delete}
              </button>
            </>
          }
        >
          <div className="whitespace-pre-line text-sm text-zinc-300">{projectUiText.bulkDeleteDesc || projectUiText.deleteDesc}</div>
        </AppDialog>
      )}
      {isCreateProjectOpen && (
        <AppDialog
          isOpen={isCreateProjectOpen}
          title={projectUiText.createTitle || projectUiText.newProject}
          onClose={() => {
            setIsCreateProjectOpen(false);
            setCreateProjectNameError('');
          }}
          footer={
            <>
              <button
                className="bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-600"
                onClick={() => {
                  setIsCreateProjectOpen(false);
                  setCreateProjectNameError('');
                }}
              >
                {projectUiText.cancel}
              </button>
              <button
                className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-600"
                onClick={() => createNewProject(newProjectNameDraft)}
              >
                {projectUiText.createConfirm || projectUiText.newProject}
              </button>
            </>
          }
        >
          <div className="space-y-2">
            <div className="text-sm text-zinc-300">{projectUiText.createNameLabel || t.assets_name_label || 'Name'}</div>
            <input
              autoFocus
              value={newProjectNameDraft}
              onChange={(e) => {
                const nextName = e.target.value;
                setNewProjectNameDraft(nextName);
                if (createProjectNameError && nextName.trim().length <= MAX_PROJECT_NAME_LENGTH) {
                  setCreateProjectNameError('');
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createNewProject(newProjectNameDraft);
              }}
              placeholder={projectUiText.createNamePlaceholder || projectUiText.defaultProjectName}
              className={`w-full rounded-lg border bg-black/40 text-zinc-100 px-3 py-2 text-sm outline-none focus:border-orange-500 ${createProjectNameError ? 'border-red-500' : 'border-white/10'}`}
            />
            {createProjectNameError && (
              <div className="text-xs text-red-400">{createProjectNameError}</div>
            )}
          </div>
        </AppDialog>
      )}

      {isScriptSaveDialogOpen && (
        <AppDialog
          isOpen={isScriptSaveDialogOpen}
          title={t.wb_script_save_dialog_title || '保存到素材库'}
          onClose={() => setIsScriptSaveDialogOpen(false)}
          footer={
            <>
              <button
                className="bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-600"
                onClick={() => setIsScriptSaveDialogOpen(false)}
              >
                {t.wb_confirm_cancel}
              </button>
              <button
                className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-600"
                onClick={() => void confirmScriptSaveToLibrary()}
                disabled={isSavingScriptAsset}
              >
                {isSavingScriptAsset ? (t.assets_saving_description || '保存中...') : (t.wb_script_save_to_library || '保存到素材库')}
              </button>
            </>
          }
        >
          <div className="space-y-2">
            <div className="text-sm text-zinc-300">{t.wb_script_save_name_label || '脚本名称'}</div>
            <input
              autoFocus
              value={scriptSaveNameDraft}
              onChange={(e) => setScriptSaveNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void confirmScriptSaveToLibrary();
                }
              }}
              placeholder={t.wb_script_save_name_placeholder || '请输入脚本名称'}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-500"
            />
            <div className="text-xs text-zinc-500">{t.wb_script_save_name_hint || '保存后会以这个名称显示在素材库中。'}</div>
          </div>
        </AppDialog>
      )}

      {isAiOptimizeOpen && (
        <AppDialog
          isOpen={isAiOptimizeOpen}
          title={t.wb_ai_opt_title || 'AI智能优化'}
          onClose={() => setIsAiOptimizeOpen(false)}
          widthClassName="max-w-[min(92vw,980px)]"
          footer={
            <>
              <button
                className="bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-600"
                onClick={() => setIsAiOptimizeOpen(false)}
              >
                {t.wb_confirm_cancel}
              </button>
              <div className="relative group/cost-image">
                <button
                  type="button"
                  onClick={() => void handleGenerateOptimizedImages()}
                  disabled={isAiOptimizeGenerating}
                  className={`px-4 py-2 rounded-lg text-sm font-bold text-white transition ${isAiOptimizeGenerating ? 'bg-orange-500/70 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'}`}
                >
                  <span className="flex items-center gap-3 whitespace-nowrap">
                    <span>
                      {isAiOptimizeGenerating
                        ? (t.wb_ai_opt_generating || '生成中...')
                        : (t.wb_ai_opt_generate_btn || '生成优化图')}
                    </span>
                    {estimatedImageCostLabel ? (
                      <span className="text-[11px] font-semibold text-white/90">{estimatedImageCostLabel}</span>
                    ) : null}
                  </span>
                </button>
                <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 whitespace-nowrap rounded-md border border-white/10 bg-zinc-900/95 px-2 py-1 text-[10px] text-zinc-100 opacity-0 shadow-xl transition group-hover/cost-image:opacity-100">
                  {t.wb_cost_tip_generate_image || '生成图片会消耗点数，具体以实际扣费为准。'}
                </span>
              </div>
            </>
          }
        >
          <div className="w-full max-h-[72vh] overflow-y-auto custom-scroll pr-1 flex flex-col gap-4">
            <div className="space-y-2">
              <div className="text-sm font-bold text-zinc-200">{t.wb_ai_opt_reference_title || '选择参考图'}</div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {aiOptimizeImageCandidates.map((asset) => {
                  const active = asset.id === aiOptimizeReferenceId;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setAiOptimizeReferenceId(asset.id)}
                      className={`text-left rounded-lg border p-1 transition ${active ? 'border-orange-500/70 bg-orange-500/10' : 'border-white/10 bg-black/20 hover:border-orange-500/40'}`}
                    >
                      <div className="w-full aspect-[3/4] rounded-md overflow-hidden bg-zinc-900">
                        <img src={asset.previewUrl || ''} alt={asset.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="mt-1 text-[10px] text-zinc-200 truncate">{asset.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400">{t.wb_field_product_category_label}</label>
                <input
                  value={aiOptimizeCategory}
                  onChange={(e) => setAiOptimizeCategory(e.target.value)}
                  placeholder={t.wb_select_placeholder}
                  className="w-full rounded-lg border border-white/10 bg-black/30 text-zinc-100 px-3 py-2 text-sm outline-none focus:border-orange-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400">{t.wb_ai_opt_keywords_label || '关键词'}</label>
                <div className="flex flex-wrap gap-1.5">
                  {aiOptimizeKeywordChoices.map((keyword) => {
                    const active = aiOptimizeKeywords.includes(keyword);
                    return (
                      <button
                        key={keyword}
                        type="button"
                        onClick={() => {
                          setAiOptimizeKeywords((prev) => (
                            prev.includes(keyword)
                              ? prev.filter((item) => item !== keyword)
                              : [...prev, keyword]
                          ));
                        }}
                        className={`text-[11px] px-2 py-1 rounded-full border transition ${active ? 'border-orange-500/70 bg-orange-500/15 text-orange-200' : 'border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5'}`}
                      >
                        {keyword}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-zinc-400">{t.wb_ai_opt_prompt_label || '提示词脚本'}</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleBuildAiOptimizePromptScript()}
                    disabled={isAiOptimizePromptGenerating}
                    className={`text-[11px] px-2 py-1 rounded border transition ${isAiOptimizePromptGenerating ? 'border-orange-500/30 bg-orange-500/5 text-orange-200/70 cursor-not-allowed' : 'border-orange-500/60 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20'}`}
                  >
                    {isAiOptimizePromptGenerating
                      ? (t.wb_ai_opt_prompt_generating || '生成中...')
                      : (t.wb_prompt_script_generate_btn || '生成提示词脚本')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveAiOptimizePromptToLibrary()}
                    disabled={isAiOptimizePromptSaving}
                    className={`text-[11px] px-2 py-1 rounded border transition ${isAiOptimizePromptSaving ? 'border-sky-500/25 bg-sky-500/5 text-sky-200/70 cursor-not-allowed' : 'border-sky-500/55 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20'}`}
                  >
                    {isAiOptimizePromptSaving
                      ? (t.assets_saving_description || '保存中...')
                      : (t.wb_ai_opt_save_prompt_btn || '保存进素材库')}
                  </button>
                </div>
              </div>
              <textarea
                value={aiOptimizePrompt}
                onChange={(e) => setAiOptimizePrompt(e.target.value)}
                rows={6}
                placeholder={t.wb_ai_opt_prompt_placeholder || '请生成或手动编辑提示词脚本'}
                className="w-full rounded-lg border border-white/10 bg-black/30 text-zinc-100 px-3 py-2 text-sm outline-none focus:border-orange-500 resize-y"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400">{t.aspect_ratio || '视频比例'}</label>
                <DropdownSelect
                  value={aiOptimizeAspectRatio}
                  options={[
                    { value: '9:16', label: '9:16' },
                    { value: '16:9', label: '16:9' },
                    { value: '1:1', label: '1:1' },
                  ]}
                  onChange={(v) => {
                    if (v === '9:16' || v === '16:9' || v === '1:1') setAiOptimizeAspectRatio(v);
                  }}
                  buttonClassName="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-300"
                  iconClassName="w-3 h-3 text-zinc-500"
                  optionClassName="text-xs"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400">{t.wb_ai_opt_resolution_label || '分辨率'}</label>
                <DropdownSelect
                  value={aiOptimizeResolution}
                  options={[
                    { value: 'sd', label: t.wb_ai_opt_resolution_sd || '标清' },
                    { value: 'hd', label: t.wb_ai_opt_resolution_hd || '高清' },
                    { value: 'uhd', label: t.wb_ai_opt_resolution_uhd || '超清' },
                  ]}
                  onChange={(v) => {
                    if (v === 'sd' || v === 'hd' || v === 'uhd') setAiOptimizeResolution(v);
                  }}
                  buttonClassName="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-300"
                  iconClassName="w-3 h-3 text-zinc-500"
                  optionClassName="text-xs"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400">{t.wb_ai_opt_style_strength || '风格强度'}: {aiOptimizeStyleStrength}</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={aiOptimizeStyleStrength}
                  onChange={(e) => setAiOptimizeStyleStrength(Number(e.target.value))}
                  className="wb-range w-full h-2 rounded-lg cursor-pointer accent-orange-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400">{t.wb_ai_opt_generate_count || '生成数量'}</label>
                <DropdownSelect
                  value={String(aiOptimizeCount)}
                  options={[
                    { value: '1', label: '1' },
                    { value: '2', label: '2' },
                    { value: '3', label: '3' },
                    { value: '4', label: '4' },
                  ]}
                  onChange={(v) => {
                    const next = Number(v);
                    if (Number.isFinite(next)) setAiOptimizeCount(Math.max(1, Math.min(4, next)));
                  }}
                  buttonClassName="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-300"
                  iconClassName="w-3 h-3 text-zinc-500"
                  optionClassName="text-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-bold text-zinc-200">{t.wb_ai_opt_result_title || '生成结果'}</div>
              {aiOptimizeResults.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-3 py-6 text-center text-xs text-zinc-500">
                  {t.wb_ai_opt_result_empty || '生成后会在这里展示可一键替换的图片结果'}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {aiOptimizeResults.map((item) => (
                    <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 p-1.5">
                      <div className="w-full aspect-[3/4] rounded-md overflow-hidden bg-zinc-900">
                        <img src={item.url} alt={item.id} className="w-full h-full object-cover" />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleReplaceWithOptimizedImage(item.url)}
                        className="mt-2 w-full rounded-md border border-orange-500/60 bg-orange-500/15 px-2 py-1.5 text-[11px] font-bold text-orange-200 hover:bg-orange-500/25"
                      >
                        {t.wb_ai_opt_replace_btn || '一键替换'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </AppDialog>
      )}

      {isAssetLibraryOpen && (
        <AppDialog
          isOpen={isAssetLibraryOpen}
          titleClassName="text-lg"
          title={
            assetLibraryPickMode === 'background_audio'
              ? (t.wb_audio_picker_title || '选择音频素材')
              : assetLibraryPickMode === 'script_import'
                ? (t.wb_script_import_from_library || '从素材库导入脚本')
                : (t.wb_dialog_choose_from_library || '从素材库选择')
          }
          onClose={() => {
            setIsAssetLibraryOpen(false);
            setAssetLibraryPickMode('default');
            setSeedanceReplayLibraryIntent(null);
          }}
          widthClassName="max-w-[min(92vw,980px)]"
          footer={
            <>
              <button
                className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700"
                onClick={() => {
                  setIsAssetLibraryOpen(false);
                  setAssetLibraryPickMode('default');
                  setSeedanceReplayLibraryIntent(null);
                }}
              >
                关闭
              </button>
            </>
          }
        >
          <div className="w-full h-[62vh] max-h-[600px] min-h-[440px] flex flex-col gap-2.5">
            <input
              ref={assetLibraryUploadInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={handleAssetLibraryLocalUploadChange}
            />
            {assetLibraryPickMode === 'background_audio' ? (
              <div className="flex items-center justify-between gap-3 px-1">
                <div className="text-xs text-zinc-400">{t.wb_audio_picker_hint || '仅显示音频素材'}</div>
                <div className="flex items-center gap-2">
                  {!shouldHideAssetLibraryLocalUpload && assetLibraryTab !== 'subject' && (
                    <button
                      type="button"
                      onClick={triggerAssetLibraryLocalUpload}
                      disabled={isAssetLibraryUploading}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${isAssetLibraryUploading
                        ? 'cursor-not-allowed border-white/10 bg-white/5 text-zinc-200/70'
                        : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 hover:border-white/20'
                        }`}
                    >
                      {isAssetLibraryUploading
                        ? ((t as any).wb_uploading || '上传中...')
                        : ((t as any).wb_btn_upload_to_library || '上传素材')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={openSubjectCreationLibrary}
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 transition hover:border-orange-500/50 hover:bg-orange-500/10 hover:text-orange-200"
                  >
                    {(t as any).wb_btn_manage_assets_library || '前往素材库'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {assetLibraryVisibleTabs.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => {
                        setAssetLibraryTab(tab.value);
                        setAssetLibraryCurrentFolderId(null);
                      }}
                      className={`shrink-0 rounded-full border px-5 py-2 text-[14px] font-bold transition ${assetLibraryTab === tab.value ? 'border-orange-500/70 bg-orange-500/20 text-orange-300' : 'border-white/10 bg-black/30 text-zinc-300 hover:bg-white/5'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!shouldHideAssetLibraryLocalUpload && assetLibraryTab !== 'subject' && (
                    <button
                      type="button"
                      onClick={triggerAssetLibraryLocalUpload}
                      disabled={isAssetLibraryUploading}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${isAssetLibraryUploading
                        ? 'cursor-not-allowed border-white/10 bg-white/5 text-zinc-200/70'
                        : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 hover:border-white/20'
                        }`}
                    >
                      {isAssetLibraryUploading
                        ? ((t as any).wb_uploading || '上传中...')
                        : ((t as any).wb_btn_upload_to_library || '上传素材')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={openSubjectCreationLibrary}
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 transition hover:border-orange-500/50 hover:bg-orange-500/10 hover:text-orange-200"
                  >
                    {(t as any).wb_btn_manage_assets_library || '前往素材库'}
                  </button>
                </div>
              </div>
            )}
            {assetLibraryUploadSummaryToast && (
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-4 text-xs font-normal text-emerald-400/85">
                {formatMessage(
                  (t as any).wb_upload_library_summary_toast || 'Successfully uploaded and saved {uploadedCount} assets to library, and added {addedCount} assets to the current material area.',
                  {
                    uploadedCount: assetLibraryUploadSummaryToast.uploadedCount,
                    addedCount: assetLibraryUploadSummaryToast.addedCount,
                  }
                )}
              </div>
            )}
            {assetLibraryTab !== 'subject' && (
              <div className="flex items-center gap-2 text-sm text-zinc-500 min-w-0">
                <button
                  type="button"
                  onClick={() => setAssetLibraryCurrentFolderId(null)}
                  className={`wb-asset-library-crumb hover:text-white ${assetLibraryCurrentFolderId === null ? 'text-white' : ''}`}
                >
                  {t.assets_root || '根目录'}
                </button>
                {assetLibraryBreadcrumb.map((folder) => (
                  <div key={folder.id} className="flex items-center gap-2 min-w-0">
                    <span>/</span>
                    <button
                      type="button"
                      onClick={() => setAssetLibraryCurrentFolderId(folder.id)}
                      className={`wb-asset-library-crumb hover:text-white truncate ${assetLibraryCurrentFolderId === folder.id ? 'text-white' : ''}`}
                    >
                      {folder.name}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto custom-scroll pr-1">
              {assetLibraryLoading ? (
                <div className="h-52 flex items-center justify-center text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载中...
                </div>
              ) : assetLibraryError ? (
                <div className="h-52 flex items-center justify-center text-red-300 text-sm">
                  {assetLibraryError}
                </div>
              ) : assetLibraryTab === 'subject' ? (
                assetLibrarySubjects.length === 0 ? (
                  <div className="h-52 flex items-center justify-center text-zinc-500 text-sm">
                    暂无主体，请先在素材库中创建主体
                  </div>
                ) : (
                  <div className="grid grid-cols-6 gap-2">
                    {assetLibrarySubjects.map((subject) => (
                      <button
                        key={subject.id}
                        type="button"
                        onClick={() => selectSubjectFromLibraryPopup(subject)}
                        className="text-left rounded-lg border bg-black/30 p-1 transition border-white/10 hover:border-orange-500/50 hover:bg-white/5"
                      >
                        <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-zinc-800 relative">
                          {subject.primary_asset ? (
                            <img src={subject.primary_asset.file_url} className="w-full h-full object-cover" alt={subject.name} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-500">
                              <Layers3 className="w-6 h-6" />
                            </div>
                          )}
                          {subject.other_assets.length > 0 && (
                            <div className="absolute top-1.5 right-1.5 z-10 rounded-full bg-black/55 border border-white/15 p-1 text-white shadow-lg">
                              <Layers3 className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>
                        <div className="mt-1 text-[11px] font-bold text-zinc-200 truncate">{subject.name}</div>
                      </button>
                    ))}
                  </div>
                )
              ) : assetLibraryItems.length === 0 && assetLibraryFolders.length === 0 ? (
                <div className="h-52 flex flex-col items-center justify-center gap-3 text-zinc-500 text-sm">
                  <div>
                    {assetLibraryPickMode === 'background_audio'
                      ? (t.wb_audio_picker_empty || '暂无音频素材')
                      : assetLibraryPickMode === 'script_import'
                        ? (t.wb_script_library_empty || '暂无脚本素材')
                        : '暂无素材'}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-6 gap-2">
                  {assetLibraryFolders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => setAssetLibraryCurrentFolderId(folder.id)}
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
                  {assetLibraryItems.map((asset) => {
                    const alreadyAddedInSeedance = (
                      isSeedanceReplayMode
                      && assetLibraryPickMode === 'default'
                      && isSeedanceReplayAssetAlreadyAdded(asset)
                    );
                    const alreadyAddedInKling = (
                      isKlingOmniMode
                      && assetLibraryPickMode === 'default'
                      && isKlingAssetAlreadyAdded(asset)
                    );
                    const alreadyAddedInLibrary = alreadyAddedInSeedance || alreadyAddedInKling;

                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onMouseEnter={() => {
                          setAssetLibraryHoverAssetId(asset.id);
                          setAssetLibraryHoverClickedAssetId(null);
                        }}
                        onMouseLeave={() => {
                          setAssetLibraryHoverAssetId((prev) => (prev === asset.id ? null : prev));
                          setAssetLibraryHoverClickedAssetId((prev) => (prev === asset.id ? null : prev));
                        }}
                        onClick={() => {
                          if (alreadyAddedInLibrary) return;
                          const ok = selectAssetFromLibraryPopup(asset);
                          if (ok) setAssetLibraryHoverClickedAssetId(asset.id);
                        }}
                        className={`group text-left rounded-lg border bg-black/30 p-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 ${alreadyAddedInLibrary ? 'border-emerald-400/70 ring-1 ring-emerald-400/35' : 'border-white/10 hover:border-orange-500/50 hover:bg-white/5'}`}
                        title={alreadyAddedInLibrary ? (t.wb_seedance_replay_notice_duplicate_asset || 'This asset has already been added.') : undefined}
                      >
                        <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-zinc-800 relative">
                          {isKlingOmniMode && hasSubjectOtherViews(asset) && (
                            <div className="absolute top-1.5 right-1.5 z-10 rounded-full bg-black/55 border border-white/15 p-1 text-white shadow-lg">
                              <Layers3 className="w-3.5 h-3.5" />
                            </div>
                          )}
                          {alreadyAddedInLibrary && (
                            <div className="wb-seedance-replay-added-badge absolute left-1.5 top-1.5 z-10 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400/85">
                              {t.wb_seedance_replay_added_badge || '已添加'}
                            </div>
                          )}
                          {asset.media_kind === 'video' ? (
                            <video src={asset.file_url} className="w-full h-full object-cover" muted playsInline />
                          ) : asset.media_kind === 'audio' ? (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-zinc-200">
                              <Music className="w-5 h-5" />
                            </div>
                          ) : asset.media_kind === 'document' || asset.type === 'script' ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-zinc-900 text-zinc-200">
                              <FileJson className="w-5 h-5" />
                              <span className="text-[10px] text-zinc-400">{t.assets_tab_scripts || 'Script'}</span>
                            </div>
                          ) : (
                            <img src={asset.file_url} className="w-full h-full object-cover" alt={asset.name} />
                          )}

                          {!alreadyAddedInLibrary ? (
                            <>
                              <div
                                className={`pointer-events-none absolute inset-0 bg-black/45 transition-opacity duration-200 ${assetLibraryHoverAssetId === asset.id ? 'opacity-100' : 'opacity-0'}`}
                              />
                              <div
                                className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${assetLibraryHoverAssetId === asset.id ? 'opacity-100' : 'opacity-0'}`}
                              >
                                {assetLibraryHoverAssetId === asset.id && assetLibraryHoverClickedAssetId === asset.id ? (
                                  <Check className="h-7 w-7 text-white" />
                                ) : (
                                  <Plus className="h-8 w-8 text-white" />
                                )}
                              </div>
                            </>
                          ) : null}
                        </div>
                        <div className="mt-1 text-[11px] font-bold text-zinc-200 truncate">{asset.name}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </AppDialog>
      )}

      <AppDialog
        isOpen={!!seedanceReplayPreviewAsset}
        title={(
          <span className="inline-flex max-w-full items-center gap-3">
            <span className="truncate">{seedanceReplayPreviewAsset?.name || (t.wb_seedance_replay_preview_asset || 'Preview Asset')}</span>
            {seedanceReplayPreviewAsset?.sizeBytes ? (
              <span className="shrink-0 text-xs font-normal text-zinc-500">
                {formatAssetSize(seedanceReplayPreviewAsset.sizeBytes)}
              </span>
            ) : null}
          </span>
        )}
        onClose={() => setSeedanceReplayPreviewAsset(null)}
        widthClassName="max-w-[min(92vw,980px)]"
        titleClassName="text-base"
      >
        <div className="flex min-h-[320px] items-center justify-center">
          {seedanceReplayPreviewAsset?.mediaKind === 'audio' ? (
            <div className="w-full max-w-xl space-y-4">
              <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                {renderAudioArtwork(isLightTheme)}
              </div>
              <audio
                src={seedanceReplayPreviewSrc || undefined}
                className="w-full"
                controls
                autoPlay
                preload="metadata"
              />
            </div>
          ) : seedanceReplayPreviewAsset?.mediaKind === 'video' ? (
            <video
              src={seedanceReplayPreviewSrc || undefined}
              className="block max-h-[calc(100vh-12rem)] max-w-full rounded-lg object-contain"
              controls
              autoPlay
              loop
              playsInline
            />
          ) : (
            <img
              src={seedanceReplayPreviewSrc || ASSET_PLACEHOLDER_DATA_URL}
              alt={seedanceReplayPreviewAsset?.name || 'preview asset'}
              className="block max-h-[calc(100vh-12rem)] max-w-full rounded-lg object-contain"
              onError={(event) => {
                (event.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL;
              }}
            />
          )}
        </div>
      </AppDialog>

      <AppDialog
        isOpen={!!replayPreviewTemplate}
        title={replayPreviewTemplate?.title || (t.wb_replay_template_preview_title || '脚本模板预览')}
        onClose={() => setReplayPreviewTemplate(null)}
        widthClassName="max-w-[min(92vw,980px)]"
        titleClassName="text-base"
      >
        <div className="grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
          <div className="min-h-[280px] overflow-hidden rounded-xl border border-white/10 bg-black/30">
            {replayPreviewTemplate?.previewVideoUrl ? (
              <video
                src={replayPreviewTemplate.previewVideoUrl}
                className="h-full max-h-[calc(100vh-14rem)] w-full object-contain"
                controls
                autoPlay
                loop
                playsInline
              />
            ) : (
              <img
                src={replayPreviewTemplate?.previewImageUrl || ASSET_PLACEHOLDER_DATA_URL}
                alt={replayPreviewTemplate?.title || 'template'}
                className="h-full max-h-[calc(100vh-14rem)] w-full object-contain"
              />
            )}
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                {t.wb_replay_template_script_brief || '脚本简介'}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-zinc-200">{replayPreviewTemplate?.description}</p>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                {t.wb_replay_template_script_detail || '脚本信息'}
              </div>
              <p className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/25 p-3 text-xs leading-relaxed text-zinc-300">
                {replayPreviewTemplate?.fullScript}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {replayPreviewTemplate?.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-orange-300/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-200/85">{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </AppDialog>

      <div ref={workspaceRowRef} className="flex-1 flex overflow-hidden p-8 gap-6" style={rowStyle}>
        <div style={{ width: leftColumnWidth }} className="shrink-0 h-full min-w-[260px] max-w-[640px]">
          {renderLeftColumn()}
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={handleResizeMouseDown}
          className="group relative w-4 -mx-3 cursor-col-resize transition shrink-0 flex items-stretch justify-center hover:bg-white/5 rounded"
          title={t.wb_resize_layout_title || 'Drag to resize layout'}
        >
          <div className="h-full w-px bg-white/15 transition-all group-hover:w-0.5 group-hover:bg-orange-500/70 group-hover:shadow-[0_0_14px_rgba(249,115,22,0.35)]" />
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-4" />
        </div>

          <div
            ref={scriptsSectionRef}
            style={{ flex: scriptPreviewRatio }}
            onDragOver={handleScriptDragOver}
            onDragLeave={handleScriptDragLeave}
            onDrop={handleScriptDrop}
            className={`relative flex-auto flex flex-col gap-3 h-full min-w-[300px] ${getGuideFocusClass('scripts')}`}
          >
            {isScriptDropActive && (
              <div className="pointer-events-none absolute inset-0 z-[12] rounded-xl border-2 border-dashed border-sky-400/70 bg-sky-500/10" />
            )}
            <div className="flex justify-between items-center shrink-0 min-h-[32px] gap-3">
              <div className="flex items-center gap-3">
                <div className="relative group/scripts-title">
                  <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2" title={t.wb_col_scripts}>
                    <Clapperboard className="w-4 h-4" />
                    {!isScriptsHeaderCompact && <span>{t.wb_col_scripts}</span>}
                  </h2>
                  {isScriptsHeaderCompact && (
                    <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md border border-white/10 bg-zinc-900/95 px-2 py-1 text-[10px] text-zinc-100 opacity-0 shadow-xl transition group-hover/scripts-title:opacity-100">
                      {t.wb_col_scripts}
                    </span>
                  )}
                </div>
                <div className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDurationValid ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>{genDuration}s</div>
                {!isSeedanceReplayMode && (
                <div className="flex items-center gap-1 ml-2 border-l border-white/10 pl-3">
                  <div className="relative group/import-btn">
                    <button
                        onClick={openScriptLibraryPicker}
                        className={`h-9 ${isScriptsHeaderCompact ? 'px-2' : 'px-3'} rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-zinc-200 hover:bg-white/10 hover:border-white/20 transition inline-flex items-center gap-2`}
                        title={t.wb_script_import_from_library || '从素材库导入'}
                    >
                      <FolderOpen className="w-4 h-4" />
                      {!isScriptsHeaderCompact && (
                        <span>{t.wb_script_import_from_library || '从素材库导入'}</span>
                      )}
                    </button>
                    {isScriptsHeaderCompact && (
                      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md border border-white/10 bg-zinc-900/95 px-2 py-1 text-[10px] text-zinc-100 opacity-0 shadow-xl transition group-hover/import-btn:opacity-100">
                        {t.wb_script_import_from_library || '从素材库导入'}
                      </span>
                    )}
                  </div>
                </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative group/cost-video">
                  <button
                    onClick={handleGenerateVideo}
                    disabled={isGenerating}
                    className={`relative overflow-hidden rounded-xl px-4 py-2 text-xs font-extrabold text-white shadow-lg transition active:scale-[0.98] ${
                      isGenerating ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:brightness-110'
                    }`}
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600" />
                  <span className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover/cost-video:opacity-100 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.22),transparent_55%)]" />
                  <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      {isGenerating ? (
                        <Loader2 className="relative w-4 h-4 animate-spin" />
                      ) : (
                        <Clapperboard className="relative w-4 h-4" />
                      )}
                      <span className="relative">{isGenerating ? (language === 'zh' ? '生成中' : 'Generating') : (language === 'zh' ? '生成视频' : 'Generate')}</span>
                    </span>
                    {estimatedVideoCostLabel ? (
                      <span className="relative ml-auto text-[9px] font-semibold text-white/80 whitespace-nowrap">{estimatedVideoCostLabel}</span>
                    ) : null}
                  </span>
                </button>
                <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 whitespace-nowrap rounded-md border border-white/10 bg-zinc-900/95 px-2 py-1 text-[10px] text-zinc-100 opacity-0 shadow-xl transition group-hover/cost-video:opacity-100">
                  {t.wb_cost_tip_generate_video || '生成视频会消耗点数，具体以实际扣费为准。'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scroll pr-2 pl-1 pt-1 space-y-4 pb-10">
            {isSeedanceReplayMode ? (
              <>
                <section className="rounded-2xl border border-orange-300/25 bg-black/25 p-4 shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-widest text-orange-300/85">
                        {t.wb_replay_generation_formula || '生成数量'}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-black text-zinc-100">
                        <span>{t.wb_replay_user_reference_short || '用户参考'}</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={replayUserReferenceGenerateCount}
                          onChange={(e) => setReplayUserReferenceGenerateCount(normalizeBatchGenerateCount(e.target.value))}
                          className="h-8 w-16 rounded-lg border border-white/10 bg-black/45 px-2 text-right text-xs font-bold text-zinc-100 outline-none transition focus:border-orange-400/60"
                        />
                        <span className="text-zinc-500">+</span>
                        <span>{t.wb_replay_template_short || '网站脚本'}</span>
                        <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-100">{replayTemplateGenerateCount}</span>
                        <span className="text-zinc-500">=</span>
                        <span className="rounded-lg border border-orange-400/35 bg-orange-500/15 px-2 py-1 text-xs text-orange-200">
                          {formatMessage(t.wb_replay_total_videos || '共 {count} 条视频', { count: replayTotalGenerateCount })}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs leading-relaxed text-zinc-400">
                      {t.wb_replay_formula_hint || '参考广告只用于脚本逆向，Seedance 仅使用商品图片生成视频。'}
                    </div>
                  </div>
                </section>

                {replayBatchRun && replayBatchProgress && (
                  <section className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-md">
                    <button
                      type="button"
                      onClick={() => setReplayBatchRun((prev) => prev ? { ...prev, expanded: !prev.expanded } : prev)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                          {t.wb_replay_batch_progress || '复刻批次进度'}
                        </div>
                        <div className="mt-1 text-xs font-bold text-zinc-200">
                          {formatMessage(t.wb_replay_batch_progress_count || '已处理 {done}/{total}', {
                            done: replayBatchProgress.completedUnits,
                            total: replayBatchProgress.totalUnits,
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-bold text-orange-200">
                        <span>{replayBatchProgress.percent}%</span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${replayBatchRun.expanded ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-300 to-purple-300 transition-[width] duration-300"
                        style={{ width: `${Math.max(3, replayBatchProgress.percent)}%` }}
                      />
                    </div>
                    {replayBatchRun.expanded && (
                      <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
                        {replayBatchRun.userReferenceCount > 0 && (
                          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-zinc-200">{t.wb_replay_reverse_stage || 'Qwen 脚本逆向解析'}</span>
                              <span className={`font-bold ${replayBatchRun.reverse.status === 'failed' ? 'text-red-300' : replayBatchRun.reverse.status === 'success' ? 'text-emerald-300' : 'text-orange-300'}`}>
                                {replayBatchRun.reverse.status === 'success'
                                  ? (t.wb_status_success || '成功')
                                  : replayBatchRun.reverse.status === 'failed'
                                    ? (t.wb_status_failed || '失败')
                                    : (t.wb_status_processing || '进行中')}
                              </span>
                            </div>
                            {(replayBatchRun.reverse.detail || replayBatchRun.reverse.error || replayBatchRun.reverse.scriptBrief) && (
                              <div className="mt-1 line-clamp-3 text-zinc-500">
                                {replayBatchRun.reverse.error || replayBatchRun.reverse.scriptBrief || replayBatchRun.reverse.detail}
                              </div>
                            )}
                          </div>
                        )}
                        {replayBatchProgress.items.map((item) => {
                          const task = item.taskId ? replayTaskById.get(String(item.taskId)) : null;
                          const videoUrl = task?.result?.video_url || task?.result?.url;
                          return (
                            <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
                              <div className="min-w-0">
                                <div className="truncate font-bold text-zinc-200">{item.label}</div>
                                <div className="truncate text-[11px] text-zinc-500">{item.detail || item.error || (item.source === 'template' ? (t.wb_replay_template_generation || '模板脚本生成') : (t.wb_replay_user_reference_generation || '用户参考脚本生成'))}</div>
                              </div>
                              {item.status === 'success' && videoUrl ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewProjectId(item.projectId || task?.projectId || null);
                                    setLastGeneratedProjectId(item.projectId || task?.projectId || null);
                                    setGeneratedVideoUrl(videoUrl);
                                  }}
                                  className="shrink-0 text-orange-300 hover:text-orange-200"
                                >
                                  {t.wb_replay_preview_result || '预览'}
                                </button>
                              ) : (
                                <span className={`shrink-0 font-bold ${item.status === 'failed' ? 'text-red-300' : item.status === 'success' ? 'text-emerald-300' : 'text-zinc-500'}`}>
                                  {item.status === 'failed'
                                    ? (t.wb_status_failed || '失败')
                                    : item.status === 'success'
                                      ? (t.wb_status_success || '成功')
                                      : item.status === 'submitting'
                                        ? (t.wb_replay_submitting || '提交中')
                                        : item.status === 'processing'
                                          ? (t.wb_status_processing || '进行中')
                                          : (t.wb_status_pending || '排队')}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {REPLAY_SCRIPT_TEMPLATES.map((template) => {
                    const count = normalizeBatchGenerateCount(replayTemplateCountsById[template.id]);
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setReplayPreviewTemplate(template)}
                        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] text-left shadow-md transition hover:-translate-y-0.5 hover:border-orange-400/45 hover:bg-white/[0.07]"
                      >
                        <div className="relative aspect-video w-full overflow-hidden bg-zinc-900">
                          {template.previewVideoUrl ? (
                            <video src={template.previewVideoUrl} className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100" muted playsInline preload="metadata" />
                          ) : (
                            <img src={template.previewImageUrl} alt={template.title} className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100" />
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition group-hover:opacity-100">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white">
                              <Play className="h-4 w-4 fill-current" />
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-1 flex-col gap-3 p-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-black text-zinc-100">{template.title}</h3>
                              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{template.duration}s</span>
                            </div>
                            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-400">{template.description}</p>
                          </div>
                          <div className="mt-auto flex flex-wrap gap-1.5">
                            {template.tags.map((tag) => (
                              <span key={tag} className="rounded-full border border-orange-300/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-200/85">{tag}</span>
                            ))}
                          </div>
                          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                            <span className="text-[11px] font-bold text-zinc-500">{t.wb_replay_template_count_label || '使用该模板生成'}</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={count}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const next = normalizeBatchGenerateCount(e.target.value);
                                setReplayTemplateCountsById((prev) => ({ ...prev, [template.id]: next }));
                              }}
                              className="h-8 w-16 rounded-lg border border-white/10 bg-black/45 px-2 text-right text-xs font-bold text-zinc-100 outline-none transition focus:border-orange-400/60"
                            />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
            {scriptPages.map((page, index) => {
              const active = index === activeScriptPage;
              const pageScripts = active ? scripts : (page.scripts || []);
              const pageText = (page.creativeCardText ?? (active ? buildCreativeCardEditorText(activeCreativeCard) : '')) || page.fullScript || '';
              const displayName = formatScriptPageDisplayName(page.name, index, t.wb_script_page_prefix);
              const storyboardEnabled = storyboardEditorEnabledByPage[page.id] ?? (active ? enableStoryboardEditor : false);
              const shotBreakdownOpen = shotBreakdownOpenByPage[page.id] ?? (active ? isShotBreakdownOpen : false);
              const batchGenerateCountForPage = getScriptPageBatchGenerateCount(page.id, index);
              const pageGenerationDuration = getPageScriptDuration({ ...page, scripts: pageScripts }, index, storyboardEnabled);
              const hasStoryboardDurationMismatch = storyboardEnabled && Math.abs(pageGenerationDuration - genDuration) >= 0.1;
              const pageBatchCost = (() => {
                const rate = Number(selectedVideoPricing?.rate ?? 0);
                if (!Number.isFinite(rate) || rate <= 0 || batchGenerateCountForPage <= 0) return 0;
                return roundCreditTenths(rate * pageGenerationDuration * batchGenerateCountForPage);
              })();

              return (
                <section
                  key={page.id}
                  onMouseDownCapture={() => {
                    if (!active) handleScriptPageChange(index);
                  }}
                  className={`rounded-2xl border bg-white/5 backdrop-blur-xl p-5 shadow-md relative overflow-hidden transition ${active ? 'border-purple-300/50 ring-1 ring-purple-400/35 shadow-purple-950/25' : 'border-white/10 hover:border-purple-400/60 hover:ring-1 hover:ring-purple-400/25'}`}
                >
                  <div className="absolute -top-20 -right-20 w-72 h-72 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />
                  {active && <div className="absolute inset-0 bg-purple-500/1 pointer-events-none" />}
                  <div className="relative z-10 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${active ? 'border-purple-300/45 bg-purple-500/25' : 'border-purple-300/20 bg-purple-500/10'}`}>
                        <Sparkles className={`h-5 w-5 ${active ? 'text-purple-600' : 'text-purple-300/75'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className={`flex flex-wrap items-center gap-2 text-[13px] font-black tracking-wider ${isLightTheme ? 'text-slate-900' : 'text-zinc-100'}`}>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${active ? 'border-purple-300/45 bg-purple-500/15 text-purple-600' : 'border-purple-300/20 text-purple-300/75'}`}>
                            #{index + 1}
                          </span>
                          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-500">
                            {`${pageScripts.length} ${t.wb_shot || 'Shot'}`}
                          </span>
                          {hasStoryboardDurationMismatch && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-300/35 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-300">
                              <AlertCircle className="h-3 w-3" />
                              <span>{t.wb_storyboard_duration_mismatch_badge || '生成时间和分镜时长不匹配'}</span>
                            </span>
                          )}
                        </div>
                        <input
                          value={page.name || ''}
                          onChange={(e) => updateScriptPageNameAt(index, e.target.value)}
                          placeholder={displayName}
                          className={`mt-1 box-border w-[200px] max-w-full rounded-md border border-transparent bg-transparent px-2 py-0.5 text-[13px] font-bold placeholder:font-bold outline-none transition focus:border-purple-400/45 focus:bg-black/15 ${isLightTheme ? 'text-slate-700 placeholder:text-slate-500 focus:bg-white' : 'text-zinc-300 placeholder:text-zinc-600'}`}
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!active) {
                            handleScriptPageChange(index);
                            return;
                          }
                          openScriptSaveDialog();
                        }}
                        disabled={isSavingScriptAsset}
                        className={`h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-200 transition inline-flex items-center gap-2 ${isSavingScriptAsset ? 'cursor-not-allowed opacity-60' : 'hover:bg-white/10 hover:border-white/20'}`}
                        title={t.wb_script_save_to_library || '保存到素材库'}
                      >
                        {isSavingScriptAsset ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />}
                        <span>{t.wb_script_save_to_library || '保存到素材库'}</span>
                      </button>
                      {scriptPages.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeScriptPage(index); }}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-500 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
                          title={t.wb_delete || 'Delete'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="relative z-10 mt-4">
                    <div className={cardThemeClass.shell}>
                      <div className={cardThemeClass.panel}>
                        <textarea
                          rows={1}
                          data-card-autosize="true"
                          value={pageText}
                          onChange={(e) => updateScriptPageCreativeCardTextAt(index, e.target.value)}
                          onInput={(e) => autoResizeCardTextarea(e.currentTarget)}
                          className={`${cardThemeClass.textarea} w-full min-h-[180px]`}
                          style={{
                            color: isLightTheme ? '#1f2937' : '#f4f4f5',
                            WebkitTextFillColor: isLightTheme ? '#1f2937' : '#f4f4f5',
                          }}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <div className="flex items-center gap-2 text-[13px] font-bold text-zinc-300">
                          <Layers className="h-4 w-4 text-purple-300" />
                          <span>{t.wb_batch_generate_setting || 'Batch generation setting'}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {isSeedanceModel(selectedModel) && batchGenerateCountForPage > 0 ? (
                          <span className="text-[11px] font-semibold text-zinc-400">
                            {t.wb_usage_based_billing || '按量付费'}
                          </span>
                        ) : pageBatchCost > 0 ? (
                          <span className="text-[11px] font-semibold text-zinc-400">
                            {formatCreditAmount(pageBatchCost)} {t.v_points || 'V点'}
                          </span>
                        ) : null}
                        <label className="flex items-center gap-2 text-[12px] font-bold text-zinc-500">
                          <span>{t.wb_batch_generate_count_label || 'Videos'}</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={batchGenerateCountForPage}
                            onChange={(e) => {
                              const nextCount = normalizeBatchGenerateCount(e.target.value);
                              setBatchGenerateCountsByPage((prev) => ({ ...prev, [page.id]: nextCount }));
                            }}
                            className="h-8 w-16 rounded-lg border border-white/10 bg-black/40 px-2 text-right text-xs font-bold text-zinc-100 outline-none transition focus:border-purple-400/50"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="relative z-10 mt-4 border-t border-white/10 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-none bg-transparent px-3 py-2">
                      <div className="text-[13px] font-medium text-zinc-400">
                        {storyboardEnabled
                          ? (t.wb_storyboard_shot_mode_hint || 'Currently generating video from the shot structure.')
                          : t.wb_storyboard_master_mode_hint}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {storyboardEnabled && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const nextOpen = !shotBreakdownOpen;
                              setShotBreakdownOpenByPage((prev) => ({ ...prev, [page.id]: nextOpen }));
                              setIsShotBreakdownOpen(nextOpen);
                            }}
                            className="text-[13px] px-2 py-1 rounded border text-zinc-300 hover:border-orange-500/40 transition"
                            title={shotBreakdownOpen ? (t.wb_storyboard_collapse || 'Collapse storyboard') : (t.wb_storyboard_expand || 'Expand storyboard')}
                          >
                            <ChevronDown
                              className={[
                                'h-4 w-4 transition-transform duration-200',
                                shotBreakdownOpen ? 'rotate-180' : '',
                              ].join(' ')}
                            />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (storyboardEnabled) {
                              setStoryboardEditorEnabledByPage((prev) => ({ ...prev, [page.id]: false }));
                              setShotBreakdownOpenByPage((prev) => ({ ...prev, [page.id]: false }));
                              setEnableStoryboardEditor(false);
                              setIsShotBreakdownOpen(false);
                            } else {
                              setStoryboardEditorEnabledByPage((prev) => ({ ...prev, [page.id]: true }));
                              setShotBreakdownOpenByPage((prev) => ({ ...prev, [page.id]: true }));
                              setEnableStoryboardEditor(true);
                              setIsShotBreakdownOpen(true);
                            }
                          }}
                          className={`text-[12px] px-2.5 py-1 rounded border transition whitespace-nowrap ${storyboardEnabled ? 'border-orange-500/40 text-orange-400 hover:bg-orange-500/10' : 'wb-storyboard-enable-btn border-purple-500/40 text-purple-400 hover:border-purple-500/50'}`}
                        >
                          {storyboardEnabled ? (t.wb_disable_storyboard || 'Disable storyboard') : t.wb_enable_storyboard}
                        </button>
                      </div>
                    </div>

                    {!storyboardEnabled ? (
                      null
                    ) : (
                      <div className="mt-3 space-y-3">
                        {shotBreakdownOpen && pageScripts.length > 0 && (
                          <ShotTimelineBar scripts={pageScripts} onUpdateScripts={(nextScripts) => updateScriptPageScriptsAt(index, nextScripts)} t={t} />
                        )}
                        {shotBreakdownOpen ? (
                          pageScripts.length === 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                addScriptToPage(index);
                              }}
                              className="w-full py-4 border border-dashed border-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 hover:text-orange-500 gap-2"
                            >
                              <Plus className="w-4 h-4" />
                              <span className="text-xs font-bold">{t.wb_btn_add_shot}</span>
                            </button>
                          ) : (
                            <>
                              {pageScripts.map((script, shotIndex) => (
                                <div id={`shot-card-${page.id}-${script.id}`} key={`${page.id}-${script.id}`} className={`glass-card p-4 rounded-xl group relative !border-l-2 ${shotIndex % 2 === 0 ? '!border-l-purple-500' : '!border-l-orange-500'}`}>
                                  <div className="flex justify-between items-start mb-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className={`${shotIndex % 2 === 0 ? 'bg-purple-600' : 'bg-orange-500'} text-black text-[10px] font-bold px-1.5 py-0.5 rounded-sm`}>{t.wb_shot} {script.shot}</span>
                                      <select
                                        value={script.type}
                                        onChange={(e) => handleScriptTypeChangeForPage(index, script.id, e.target.value)}
                                        className="text-[10px] text-zinc-300 border border-white/10 px-1.5 py-0.5 rounded bg-black/40 focus:outline-none focus:border-orange-500"
                                        title={t.wb_shot_type_label || '镜头类型'}
                                      >
                                        {shotTypeOptions.map((option) => (
                                          <option key={option.value} value={option.value} className="bg-black text-zinc-100">
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                      <input type="number" min={0.1} step="0.1" className="w-10 bg-transparent text-[10px] text-zinc-300 text-right" value={parseFloat(script.dur.replace('s', ''))} onChange={(e) => handleDurationChangeForPage(index, script.id, e.target.value)} />
                                      <span className="text-[10px] text-zinc-500">s</span>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); removeScriptFromPage(index, script.id); }} className="text-zinc-600 hover:text-red-500 transition p-1"><X className="w-3.5 h-3.5" /></button>
                                  </div>
                                  <div className="grid grid-cols-1 gap-3">
                                    <div className="flex flex-col gap-1.5">
                                      <p className="text-[10px] text-zinc-500 uppercase font-bold ml-1">{t.wb_visual}</p>
                                      <textarea className="w-full bg-black/20 text-xs text-zinc-300 p-3 rounded-lg border border-white/5 resize-none min-h-[60px] focus:border-white/20 transition-colors outline-none custom-scroll" value={script.visual} onChange={(e) => { const ns = [...pageScripts]; ns[shotIndex].visual = e.target.value; updateScriptPageScriptsAt(index, ns); }} />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                      <p className="text-[10px] text-zinc-500 uppercase font-bold ml-1">{t.wb_audio}</p>
                                      <input
                                        type="text"
                                        disabled={soundSetting === 'off'}
                                        className={`w-full text-xs p-3 rounded-lg border italic transition-colors outline-none ${soundSetting === 'off' ? 'bg-zinc-900/60 text-zinc-500 border-zinc-800 cursor-not-allowed' : 'bg-black/20 text-zinc-400 border-white/5 focus:border-white/20'}`}
                                        value={soundSetting === 'off' ? '已关闭音频' : script.audio}
                                        onChange={(e) => {
                                          if (soundSetting === 'off') return;
                                          const ns = [...pageScripts];
                                          ns[shotIndex].audio = e.target.value;
                                          updateScriptPageScriptsAt(index, ns);
                                        }}
                                      />
                                    </div>
                                    {language !== targetLanguage && (
                                      <div className="flex flex-col gap-1">
                                        <div className="flex items-center justify-between">
                                          <p className="text-[10px] text-zinc-600 uppercase font-bold ml-1">{t.wb_audio_translation || 'Translation'}</p>
                                          {soundSetting !== 'off' && (
                                            <div className="relative group/translate">
                                              <button
                                                type="button"
                                                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-white/10 text-zinc-400 hover:text-orange-400 hover:border-orange-500/40 transition"
                                                disabled={!script.audioTranslation?.trim() || translatingShots[script.id]}
                                              >
                                                {translatingShots[script.id] ? (
                                                  <>
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    <span>{t.wb_translating || '翻译中...'}</span>
                                                  </>
                                                ) : (
                                                  <>
                                                    <Languages className="w-3 h-3" />
                                                    <span>{t.wb_btn_translate_to_target || '翻译成目标语言'}</span>
                                                  </>
                                                )}
                                              </button>
                                              {!translatingShots[script.id] && script.audioTranslation?.trim() && (
                                                <div className="absolute right-0 top-full pt-1 hidden group-hover/translate:flex flex-col z-50 min-w-[160px]">
                                                  <div className="flex flex-col gap-1 bg-zinc-900 border border-white/10 rounded-lg p-2 shadow-xl">
                                                    <button
                                                      type="button"
                                                      className="flex items-center justify-between gap-2 text-[11px] text-zinc-300 hover:text-orange-400 px-2 py-1.5 rounded hover:bg-white/5 transition whitespace-nowrap"
                                                      onClick={() => handleTranslateShotForPage(index, script, shotIndex, 'direct')}
                                                    >
                                                      <span>{t.wb_translate_direct || '直接翻译'}</span>
                                                      <span className="relative group/tip-d">
                                                        <HelpCircle className="w-3 h-3 text-zinc-500" />
                                                        <span className="absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/tip-d:block bg-black/90 text-zinc-300 text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap border border-white/10">
                                                          {t.wb_translate_direct_tip || '直接翻译，保持原文含义和语气'}
                                                        </span>
                                                      </span>
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="flex items-center justify-between gap-2 text-[11px] text-zinc-300 hover:text-purple-400 px-2 py-1.5 rounded hover:bg-white/5 transition whitespace-nowrap"
                                                      onClick={() => handleTranslateShotForPage(index, script, shotIndex, 'creative')}
                                                    >
                                                      <span>{t.wb_translate_creative || '创意翻译'}</span>
                                                      <span className="relative group/tip-c">
                                                        <HelpCircle className="w-3 h-3 text-zinc-500" />
                                                        <span className="absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/tip-c:block bg-black/90 text-zinc-300 text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap border border-white/10">
                                                          {t.wb_translate_creative_tip || '结合产品特点和画面进行创意翻译'}
                                                        </span>
                                                      </span>
                                                    </button>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                        <textarea
                                          className="w-full bg-black/20 text-xs text-zinc-400 p-3 rounded-lg border border-white/5 resize-none min-h-[40px] focus:border-white/20 transition-colors outline-none italic"
                                          value={script.audioTranslation}
                                          placeholder={t.wb_audio_translation || 'Translation'}
                                          onChange={(e) => {
                                            const ns = [...pageScripts];
                                            ns[shotIndex].audioTranslation = e.target.value;
                                            updateScriptPageScriptsAt(index, ns);
                                          }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                              <button onClick={(e) => { e.stopPropagation(); addScriptToPage(index); }} className="w-full py-4 border border-dashed border-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 hover:text-orange-500 gap-2"><Plus className="w-4 h-4" /><span className="text-xs font-bold">{t.wb_btn_add_shot}</span></button>
                            </>
                          )
                        ) : (
                          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-[12px] text-zinc-500">
                            {`${pageScripts.length} ${t.wb_shot || 'Shot'}`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}

            <button
              type="button"
              onClick={addScriptPage}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-xs font-bold text-zinc-500 transition hover:border-orange-500/45 hover:bg-orange-500/10 hover:text-orange-300"
              aria-label={language === 'zh' ? '新增脚本方案' : 'Add script plan'}
            >
              <Plus className="h-5 w-5" />
              <span>{language === 'zh' ? '新增脚本方案' : 'Add script plan'}</span>
            </button>
              </>
            )}
          </div>
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={handleScriptPreviewResize}
          className="group relative w-4 -mx-2 cursor-col-resize transition shrink-0 flex items-stretch justify-center hover:bg-white/5 rounded"
          title={t.wb_resize_script_preview_title || 'Drag to resize scripts and preview'}
        >
          <div className="h-full w-px bg-white/15 transition-all group-hover:w-0.5 group-hover:bg-orange-500/70 group-hover:shadow-[0_0_14px_rgba(249,115,22,0.35)]" />
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-4" />
        </div>

        {/* Right Column: Preview & Results */}
        <div ref={previewSectionRef} style={{ flex: 1 - scriptPreviewRatio }} className={`flex flex-col gap-3 shrink-0 h-full ${getGuideFocusClass('preview')}`}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><MonitorPlay className="w-4 h-4" /> {t.wb_col_preview}</h2>
          <button
              onClick={handlePublishToTikTok}
              disabled={!generatedVideoUrl || isPostingTikTok}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-2 transition border border-white/10 ${(!generatedVideoUrl || isPostingTikTok) ? 'opacity-40 cursor-not-allowed text-zinc-500' : 'text-white bg-gradient-to-r from-purple-600 to-orange-500 hover:brightness-110'}`}
            >
              {isPostingTikTok ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {isPostingTikTok ? t.wb_tiktok_uploading : t.wb_btn_tiktok_draft}
          </button>
        </div>
          {/* Video Player */}
          <div className="glass-panel flex-1 rounded-2xl p-1 relative flex flex-col overflow-hidden">
            <div className="flex-1 bg-black rounded-xl relative overflow-hidden group flex items-center justify-center">
              {generatedVideoUrl ? (
                <video
                  ref={videoRef}
                  src={generatedVideoUrl}
                  controls
                  autoPlay
                  loop
                  className="w-full h-full object-contain"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              ) : (
                isWaitingPreview ? (
                  <div className="relative h-full w-full">
                    {!waitingVideoFailed ? (
                      <video
                        className="h-full w-full object-cover"
                        src={WAITING_PREVIEW_VIDEO_SRC}
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="auto"
                        onError={() => setWaitingVideoFailed(true)}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-center opacity-30">
                        <Film className="w-12 h-12 mx-auto mb-2 text-zinc-600" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
                    <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pb-4 text-center">
                      <p className="text-xs text-white/80 font-semibold drop-shadow">{waitingPhaseMessage}</p>
                      <div className="text-2xl font-black text-orange-200 tabular-nums drop-shadow">{waitingProgressPercent}%</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center opacity-30"><Film className="w-12 h-12 mx-auto mb-2 text-zinc-600" /><p className="text-xs text-zinc-600">{isGenerating ? 'Submitting…' : t.wb_waiting}</p></div>
                )
              )}

            </div>
            <div className="h-14 flex items-center justify-between px-4 border-t border-white/5 bg-zinc-900/50">
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => skipVideoTime(-1)}
                  disabled={!generatedVideoUrl}
                  title="Rewind 1s"
                  className={`text-zinc-400 hover:text-white active:scale-95 transition ${!generatedVideoUrl ? 'opacity-40 cursor-not-allowed hover:text-zinc-400 active:scale-100' : ''}`}
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleVideoPlay}
                  disabled={!generatedVideoUrl}
                  title={isPlaying ? 'Pause' : 'Play'}
                  className={`text-white hover:text-orange-500 active:scale-95 transition ${!generatedVideoUrl ? 'opacity-40 cursor-not-allowed hover:text-white active:scale-100' : ''}`}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => skipVideoTime(1)}
                  disabled={!generatedVideoUrl}
                  title="Forward 1s"
                  className={`text-zinc-400 hover:text-white active:scale-95 transition ${!generatedVideoUrl ? 'opacity-40 cursor-not-allowed hover:text-zinc-400 active:scale-100' : ''}`}
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-4 border border-white/5 max-h-56 overflow-y-auto custom-scroll">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                {language === 'zh' ? '本项目视频队列' : 'Project Video Queue'}
              </div>
              <div className="text-[10px] font-bold text-zinc-600">{currentProjectVideoQueue.length}</div>
            </div>
            {currentProjectVideoQueue.length === 0 ? (
              <div className="text-[10px] text-zinc-600">{language === 'zh' ? '暂无队列任务' : 'No queued tasks'}</div>
            ) : (
              <div className="space-y-2">
                {currentProjectVideoQueue.map((task) => {
                  const status = task?.status;
                  const url = task?.result?.video_url || task?.result?.url;
                  return (
                    <div key={String(task.id)} className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="truncate text-zinc-300">{String(task.name || '').trim() || `#${String(task.id).slice(0, 8)}`}</span>
                      {status === 'success' && url ? (
                        <button
                          onClick={() => {
                            setPreviewProjectId(task.projectId || null);
                            setLastGeneratedProjectId(task.projectId || null);
                            setGeneratedVideoUrl(url);
                          }}
                          className="text-orange-400 hover:text-orange-300 transition whitespace-nowrap"
                        >
                          {language === 'zh' ? '预览' : 'Preview'}
                        </button>
                      ) : status === 'failed' ? (
                        <span className="text-red-400 whitespace-nowrap">{language === 'zh' ? '失败' : 'Failed'}</span>
                      ) : (
                        <span className="text-zinc-500 whitespace-nowrap">{language === 'zh' ? '生成中…' : 'Processing…'}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
