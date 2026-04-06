import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UploadCloud, Plus, X, CheckCircle, FolderPlus, Folder,
  Wand2, Loader2, Clapperboard, FileDown, FileUp, ArrowLeft, ArrowRight, PlayCircle,
  MonitorPlay, Film, SkipBack, Play, Pause, SkipForward, FileJson, Send, Cpu,
  Zap, Layers, Layers3, Video, Lock, Info, Check, Sparkles, List, MoreHorizontal, Pencil, Trash2, Gift, ImagePlus,
  SlidersHorizontal,Palette, MapPin, Activity, Camera, Lightbulb, Music, Scissors, Megaphone, AlignLeft,
  Languages, HelpCircle, AlertCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ChevronsDown
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useTasks } from '../../context/TaskContext';
import { useWorkbenchModel } from '../../context/WorkbenchModelContext';
import { videoApi, VideoApiError, type GeneratePreviewData } from '../../services/video';
import { assetsApi, type Asset as LibraryAsset, type AssetFolder } from '../../services/assets';
import { tiktokApi } from '../../services/tiktok';
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
import { ErrorModal } from './workflow/ErrorModal';
import type { ErrorModalProps } from './workflow/ErrorModal';
import { buildErrorModalData, type ErrorCategory, type ErrorI18n } from '../../utils/errorModalHelper';
import { getWorkbenchPreferences, setWorkbenchPreferences } from '../../utils/preferences';
import {
  clearTransferStationItems,
  loadTransferStationItems,
  removeTransferStationItem,
  type TransferStationItem,
} from '../../utils/workbenchTransferStation';
import { type ReplayReusePayload } from './ReplayScriptView';
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

const ENABLE_PROMPT_LAB = true;
const ENABLE_STORYBOARD_PROMPT = false;
const WAIT_PROGRESS_SIM_DURATION_MS = 90_000;
const WAIT_PROGRESS_MAX_BEFORE_HOLD = 90;
const WAIT_PROGRESS_HOLD_MIN = 92;
const WAIT_PROGRESS_HOLD_MAX = 98;
const SCRIPT_PROGRESS_MAX_BEFORE_HOLD = 88;
const SCRIPT_PROGRESS_HOLD_MAX = 96;
const SCRIPT_ESTIMATE_STORAGE_KEY_PREFIX = 'vflow_script_eta_v1';
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

const getSeedanceReplayLocalAccept = (mediaKind?: SeedanceReplayMediaKind | null) => {
  if (mediaKind === 'image') return SEEDANCE_REPLAY_IMAGE_EXTS.map((ext) => `.${ext}`).join(',');
  if (mediaKind === 'video') return SEEDANCE_REPLAY_VIDEO_EXTS.map((ext) => `.${ext}`).join(',');
  if (mediaKind === 'audio') return SEEDANCE_REPLAY_AUDIO_EXTS.map((ext) => `.${ext}`).join(',');
  return SEEDANCE_REPLAY_UPLOAD_ACCEPT;
};
// Storyboard editor is now a user-toggleable runtime setting (no longer a compile-time constant).
// The state `enableStoryboardEditor` replaces the old `enableStoryboardEditor` const.

// Types specific to Workbench View
type ScriptItem = {
  id: number;
  shot: string;
  type: string;
  dur: string;
  visual: string;
  audio: string;
  audioTranslation: string;
};

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

type ScriptCreativeCard = {
  style?: string;
  environment?: string;
  tonePacing?: string;
  camera?: string;
  lighting?: string;
  actions?: string[];
  backgroundSound?: string;
  transitionEditing?: string;
  callToAction?: string;
};

type ScriptPage = {
  id: string;
  name: string;
  scripts: ScriptItem[];
  fullScript?: string;
  continuityAnchor?: {
    subject?: string;
    scene?: string;
    style?: string;
  };
  scriptStructure?: {
    hook?: string;
    development?: string;
    payoff?: string;
  };
  sellingPoints?: string[];
  sceneSuggestions?: string[];
  styleTags?: string[];
  creativeCard?: ScriptCreativeCard;
  creativeCardText?: string;
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

type AssetLibraryTab = 'product' | 'model' | 'scene' | 'motion' | 'audio';
type AssetLibraryPickMode = 'default' | 'background_audio';
type AiOptimizeResolution = 'sd' | 'hd' | 'uhd';
type WaitProgressPhase = 'idle' | 'simulating' | 'holding' | 'finishing' | 'done';

type ScriptEstimateCacheEntry = {
  avgSeconds: number;
  sampleCount: number;
};

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
const SCRIPT_GENERATION_CANCEL_WINDOW_MS = 60_000;
const SCRIPT_GENERATION_CANCEL_LIMIT = 3;
const SCRIPT_GENERATION_CANCEL_STORAGE_KEY_PREFIX = 'vflow_script_generation_cancels_v1';

const buildScriptGenerationCancelStorageKey = (userId?: string | number | null) => {
  const normalized = userId === null || userId === undefined || userId === '' ? 'guest' : String(userId);
  return `${SCRIPT_GENERATION_CANCEL_STORAGE_KEY_PREFIX}_${normalized}`;
};

const readRecentScriptGenerationCancelTimestamps = (userId?: string | number | null): number[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(buildScriptGenerationCancelStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const next = Array.isArray(parsed)
      ? parsed
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && now - value < SCRIPT_GENERATION_CANCEL_WINDOW_MS)
      : [];

    if (next.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
      window.localStorage.setItem(buildScriptGenerationCancelStorageKey(userId), JSON.stringify(next));
    }

    return next;
  } catch {
    return [];
  }
};

const recordScriptGenerationCancelTimestamp = (userId?: string | number | null): number[] => {
  if (typeof window === 'undefined') return [];

  const next = [
    ...readRecentScriptGenerationCancelTimestamps(userId),
    Date.now(),
  ];

  try {
    window.localStorage.setItem(buildScriptGenerationCancelStorageKey(userId), JSON.stringify(next));
  } catch {
    // Ignore localStorage failures and keep cancellation non-blocking.
  }

  return next;
};

const getScriptGenerationCooldownRemainingMs = (userId?: string | number | null): number => {
  const timestamps = readRecentScriptGenerationCancelTimestamps(userId);
  if (timestamps.length < SCRIPT_GENERATION_CANCEL_LIMIT) return 0;

  const oldestRelevant = timestamps[timestamps.length - SCRIPT_GENERATION_CANCEL_LIMIT];
  if (!Number.isFinite(oldestRelevant)) return 0;

  return Math.max(0, oldestRelevant + SCRIPT_GENERATION_CANCEL_WINDOW_MS - Date.now());
};

const isAbortError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  return (error as { name?: string }).name === 'AbortError';
};

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
    genDuration: prefs.genDuration || 10,
    soundSetting: prefs.soundSetting === 'off' ? 'off' : 'on',
    selectedBackgroundAudio: null,
    scriptVariantCount:
      typeof prefs.scriptVariantCount === 'number' && prefs.scriptVariantCount > 0 ? prefs.scriptVariantCount : 1,
    targetLanguage: prefs.targetLanguage || 'en',
    creationMode: prefs.creationMode === 'replay' ? 'replay' : 'fast',
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
  initialLibraryAssetMode?: 'library_asset' | 'background_audio';
  initialLibraryAssetTargetProjectId?: string | null;
  initialLibraryAssetForceFirstFrame?: boolean;
  onInitialLibraryAssetHandled?: () => void;
  initialTransferRole?: 'first_frame' | 'asset_apply' | 'replay_apply' | null;
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
  replayReusePayload?: ReplayReusePayload | null;
  onReplayReusePayloadHandled?: () => void;
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
                                                              onNavigateToAssetsLibrary,
                                                              replayReusePayload,
                                                              onReplayReusePayloadHandled
                                                            }) => {
  const { t, language } = useLanguage();
    const uiLanguageCode = useMemo(() => normalizeUiLanguageCode(language), [language]);
  const { user } = useAuth();
  const { tasks, addTask } = useTasks();
  const { model: selectedModel, setModel: setSelectedModel } = useWorkbenchModel();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seedanceReplayFileInputRef = useRef<HTMLInputElement>(null);
  const backgroundAudioInputRef = useRef<HTMLInputElement>(null);
  const scriptFileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const modeSectionRef = useRef<HTMLDivElement | null>(null);
  const uploadSectionRef = useRef<HTMLDivElement | null>(null);
  const configSectionRef = useRef<HTMLDivElement | null>(null);
  const audioConfigSectionRef = useRef<HTMLDivElement | null>(null);
  const scriptsSectionRef = useRef<HTMLDivElement | null>(null);
  const previewSectionRef = useRef<HTMLDivElement | null>(null);

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
  const [assetLibraryError, setAssetLibraryError] = useState<string | null>(null);
  const [seedanceReplayLibraryIntent, setSeedanceReplayLibraryIntent] = useState<SeedanceReplayLibraryIntent | null>(null);
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
  const activeScriptGenerationSeqRef = useRef(0);
  const scriptGenerationProjectIdRef = useRef<string | null>(null);
  const transferStationOwnerId = user?.id ?? null;
  const refreshTransferStationItems = useCallback(() => {
    setTransferStationItems(loadTransferStationItems(transferStationOwnerId));
  }, [transferStationOwnerId]);

  useEffect(() => {
    refreshTransferStationItems();
  }, [refreshTransferStationItems]);

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

  useEffect(() => {
    if (!replayReusePayload) return;
    if (initialTransferRole === 'replay_apply') return;

    const applyReplayPayload = () => {
      const nextCategory = String(replayReusePayload.productCategory || '').trim();
      const nextSellingPoints = String(replayReusePayload.coreSellingPoints || '').trim();
      const nextPrompt = String(replayReusePayload.prompt || '').trim();
      const nextReferenceScript = String(replayReusePayload.referenceScript || replayReusePayload.prompt || '').trim();

      if (nextCategory) setProductCategory(nextCategory);
      if (nextSellingPoints) setCoreSellingPoints(nextSellingPoints);
      if (nextPrompt) setGenPrompt(nextPrompt);
      if (nextReferenceScript) setReferenceScript(nextReferenceScript);
      setCreationMode('replay');
      setSelectedModel('seedance2.0');

      setToastMessage(t.wb_replay_applied_to_workbench || '复刻结果已带入工作台，可继续上传图片并生成新脚本。');
      onReplayReusePayloadHandled?.();
    };

    const targetProjectId = String(replayReusePayload.targetProjectId || '').trim();
    if (targetProjectId && targetProjectId !== projectStore.currentProjectId) {
      setProjectStore((prev) => {
        const now = Date.now();
        const hasProject = prev.projects.some((project) => project.id === targetProjectId);
        const hasWorkspace = !!prev.workspaces[targetProjectId];

        const projects = hasProject
          ? prev.projects
          : [{
            id: targetProjectId,
            name: ensureUniqueProjectName(`Project ${targetProjectId.slice(0, 6)}`, prev.projects),
            updatedAt: now,
            createdAt: now,
          }, ...prev.projects];

        const workspaces = hasWorkspace
          ? prev.workspaces
          : {
            ...prev.workspaces,
            [targetProjectId]: createWorkspaceState({
              scriptPagePrefix: t.wb_script_page_prefix,
              userId: user?.id ?? null,
            }),
          };

        return {
          ...prev,
          currentProjectId: targetProjectId,
          projects,
          workspaces,
        };
      });

      let elapsed = 0;
      const MIN_WAIT_MS = 180;
      const MAX_WAIT_MS = 5000;
      const POLL_INTERVAL_MS = 50;

      const timer = window.setInterval(() => {
        elapsed += POLL_INTERVAL_MS;

        const shouldWaitForWorkspaceRestore = elapsed < MIN_WAIT_MS || isApplyingProjectWorkspaceRef.current;
        if (shouldWaitForWorkspaceRestore && elapsed < MAX_WAIT_MS) return;

        window.clearInterval(timer);
        applyReplayPayload();
      }, POLL_INTERVAL_MS);

      return () => window.clearInterval(timer);
    }

    applyReplayPayload();
  }, [
    initialTransferRole,
    onReplayReusePayloadHandled,
    replayReusePayload,
    setSelectedModel,
    t.wb_replay_applied_to_workbench,
    t.wb_script_page_prefix,
    user?.id,
  ]);

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
  const [creationMode, setCreationMode] = useState<'fast' | 'replay'>(() => (initialPrefs.creationMode === 'replay' ? 'replay' : 'fast'));
  const [seedanceReplayUploadIntent, setSeedanceReplayUploadIntent] = useState<SeedanceReplayUploadIntent>({ targetMediaKind: null });
  const [reuseQueueEnabled, setReuseQueueEnabled] = useState(false);
  const [isModelSectionCollapsed, setIsModelSectionCollapsed] = useState(false);
  const [isAiRecognizing, setIsAiRecognizing] = useState(false);
  const [hasAiRecognized, setHasAiRecognized] = useState(false);
  const [recognizedProductSourceSignature, setRecognizedProductSourceSignature] = useState('');
  const [needsAiReRecognize, setNeedsAiReRecognize] = useState(false);

  useEffect(() => {
    if (soundSetting !== 'off') {
      setIsBackgroundAudioSourceOpen(false);
    }
  }, [soundSetting]);

  const LEFT_COLUMN_MIN_WIDTH = 260;
  const SCRIPT_COLUMN_MIN_WIDTH = 320;
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
  const lastFastModelRef = useRef<'kling' | 'sora2' | 'sora2pro' | 'seedance2.0'>('kling');
  const currentAssetMediaKind = inferMediaKind({ name: fileName, url: selectedAssetUrl || uploadedFile, file: selectedFileObj });

  useEffect(() => {
    if (isRestoring) return;
    if (isApplyingProjectWorkspaceRef.current) return;

    if (prefSyncTimerRef.current) window.clearTimeout(prefSyncTimerRef.current);

    prefSyncTimerRef.current = window.setTimeout(() => {
      const effectiveModel = creationMode === 'replay' ? 'seedance2.0' : selectedModel;

      setWorkbenchPreferences({
        deliveryRegion,
        targetLanguage,
        videoType,
        aspectRatio,
        genDuration,
        soundSetting,
        scriptVariantCount,
        creationMode,
        selectedModelId: effectiveModel,
      }, user?.id ?? null);
    }, 400);

    return () => {
      if (prefSyncTimerRef.current) window.clearTimeout(prefSyncTimerRef.current);
    };
  }, [
    aspectRatio,
    creationMode,
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
  const [isExporting, setIsExporting] = useState(false);
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
  const [infoTitle, setInfoTitle] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const openInfo = (title: string, message: string | null = null) => {
    setInfoTitle(title || '');
    setInfoMessage(message || null);
    setIsInfoOpen(true);
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
  const [scripts, setScripts] = useState<ScriptItem[]>(buildDemoScripts);
  const [scriptPages, setScriptPages] = useState<ScriptPage[]>(() => ([{ id: 'page-1', name: `${t.wb_script_page_prefix} 1`, scripts: buildDemoScripts() }]));
  const [activeScriptPage, setActiveScriptPage] = useState(0);
  const scriptPagesRef = useRef<ScriptPage[]>([]);
  const [isShotBreakdownOpen, setIsShotBreakdownOpen] = useState(false);
  const [enableStoryboardEditor, setEnableStoryboardEditor] = useState(false);

  const [assetQueue, setAssetQueue] = useState<QueuedAsset[]>([]);
  const [scriptQueue, setScriptQueue] = useState<QueuedScript[]>([]);
  const [currentMaterialType, setCurrentMaterialType] = useState<AssetLibraryTab | null>(null);
  const [generatedBatch, setGeneratedBatch] = useState<Array<{ id: string; assetName: string; scriptName: string; taskId: string | number }>>([]);
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
  const [aiOptimizeResults, setAiOptimizeResults] = useState<Array<{ id: string; url: string }>>([]);
  const [projectStore, setProjectStore] = useState<LocalProjectStore>(() => loadLocalProjectStore(user?.id ?? null));
  const [projectStoreOwner, setProjectStoreOwner] = useState<string>(() => getLocalProjectStoreOwner(user?.id ?? null));
  const [projectStoreLoadVersion, setProjectStoreLoadVersion] = useState(0);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [isTaskQueueOpen, setIsTaskQueueOpen] = useState(false);
  const taskQueueButtonRef = useRef<HTMLButtonElement | null>(null);
  const taskQueuePanelRef = useRef<HTMLDivElement | null>(null);
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
    setCreationMode(workspace.creationMode || (initialPrefs.creationMode === 'replay' ? 'replay' : 'fast'));
    setReuseQueueEnabled(!!workspace.reuseQueueEnabled);
    setScripts(Array.isArray(workspace.scripts) ? workspace.scripts : []);
    setScriptPages(Array.isArray(workspace.scriptPages) && workspace.scriptPages.length > 0 ? workspace.scriptPages : [{ id: 'page-1', name: `${t.wb_script_page_prefix} 1`, scripts: [] }]);
    setActiveScriptPage(typeof workspace.activeScriptPage === 'number' ? workspace.activeScriptPage : 0);
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
    if (initialLibraryAssetMode === 'background_audio') return;
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

    if (
      isGeneratingScript
      && scriptGenerationProjectIdRef.current
      && scriptGenerationProjectIdRef.current !== currentProjectId
    ) {
      // Keep the remote generation running, but detach UI from the previous project.
      activeScriptGenerationSeqRef.current += 1;
      scriptGenerationAbortRef.current = null;
      scriptGenerationStartedAtRef.current = null;
      scriptGenerationEstimateKeyRef.current = null;
      scriptGenerationFinishingRef.current = false;
      scriptGenerationProjectIdRef.current = null;
      setIsGeneratingScript(false);
      setIsScriptGenerationProgressVisible(false);
      setScriptGenerationProgress(0);
      setScriptGenerationCompletedCount(0);
      setScriptGenerationTotalCount(0);
    }

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
    isGeneratingScript,
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

  useEffect(() => {
    setProjectStore(loadLocalProjectStore(user?.id ?? null));
    setProjectStoreOwner(getLocalProjectStoreOwner(user?.id ?? null));
    setProjectStoreLoadVersion((prev) => prev + 1);
  }, [user?.id]);

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
      genDuration,
      soundSetting,
      selectedBackgroundAudio,
      scriptVariantCount,
      targetLanguage,
      creationMode,
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
    genDuration,
    soundSetting,
    selectedBackgroundAudio,
    scriptVariantCount,
    targetLanguage,
    creationMode,
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
    if (generatedBatch.length > 0) {
      console.log('[WorkbenchView] generatedBatch updated:', generatedBatch);
      generatedBatch.forEach(item => {
        const task = tasks.find(t => t.id === item.taskId);
        console.log(`[WorkbenchView] Batch item ${item.id} (taskId=${item.taskId}):`, {
          found: !!task,
          status: task?.status,
          result: task?.result,
          hasUrl: !!(task?.result?.video_url || task?.result?.url),
          url: task?.result?.video_url || task?.result?.url
        });
      });
    }
  }, [generatedBatch, tasks]);

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
      videoApi.saveDraft(snapshot).catch(() => {});
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
    setPreviewProjectId(picked.task.projectId);
  }, [tasks, lastGeneratedProjectId, projectStore.currentProjectId, setGeneratedVideoUrl]);

  useEffect(() => {
    if (!isAssetLibraryOpen) return;
    let cancelled = false;

    const loadAssetLibraryItems = async () => {
      setAssetLibraryLoading(true);
      setAssetLibraryError(null);
      try {
        const [items, folderData] = await Promise.all([
          assetsApi.getAssets({ type: assetLibraryTab, folderId: assetLibraryCurrentFolderId }),
          assetsApi.getFolders({ type: assetLibraryTab, parentId: assetLibraryCurrentFolderId }),
        ]);
        if (!cancelled) {
          const normalizedItems = Array.isArray(items) ? items : [];
          const filteredItems = seedanceReplayLibraryIntent
            ? normalizedItems.filter((item) => {
                const itemTab: AssetLibraryTab = item.media_kind === 'video'
                  ? 'motion'
                  : item.media_kind === 'audio'
                    ? 'audio'
                    : 'product';
                return seedanceReplayLibraryIntent.allowedTabs.includes(itemTab);
              })
            : assetLibraryPickMode === 'background_audio'
              ? normalizedItems.filter((item) => item.media_kind === 'audio')
              : normalizedItems.filter((item) => item.media_kind !== 'audio');
          setAssetLibraryItems(
            filteredItems
          );
          setAssetLibraryFolders(Array.isArray(folderData.folders) ? folderData.folders : []);
          setAssetLibraryBreadcrumb(Array.isArray(folderData.breadcrumb) ? folderData.breadcrumb : []);
        }
      } catch (err: any) {
        console.error('Failed to load asset library items:', err);
        if (!cancelled) {
          setAssetLibraryItems([]);
          setAssetLibraryFolders([]);
          setAssetLibraryBreadcrumb([]);
          setAssetLibraryError(String(err?.message || '加载素材失败'));
        }
      } finally {
        if (!cancelled) setAssetLibraryLoading(false);
      }
    };

    void loadAssetLibraryItems();
    return () => {
      cancelled = true;
    };
  }, [assetLibraryCurrentFolderId, assetLibraryPickMode, assetLibraryTab, isAssetLibraryOpen, seedanceReplayLibraryIntent]);

  const openAssetLibraryPicker = () => {
    setSeedanceReplayLibraryIntent(null);
    setAssetLibraryPickMode('default');
    setAssetLibraryTab(currentAssetMediaKind === 'video' ? 'motion' : currentAssetMediaKind === 'audio' ? 'audio' : 'product');
    setAssetLibraryCurrentFolderId(null);
    setIsAssetLibraryOpen(true);
  };

  const openBackgroundAudioPicker = () => {
    setSeedanceReplayLibraryIntent(null);
    setAssetLibraryPickMode('background_audio');
    setAssetLibraryTab('audio');
    setAssetLibraryCurrentFolderId(null);
    setIsAssetLibraryOpen(true);
    setIsBackgroundAudioSourceOpen(false);
  };
  const getSeedanceReplayLibraryIntent = useCallback((targetMediaKind?: SeedanceReplayMediaKind | null): SeedanceReplayLibraryIntent => {
    if (targetMediaKind === 'image') {
      return {
        targetMediaKind: 'image',
        allowedTabs: ['model', 'product', 'scene'],
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
      return {
        targetMediaKind: 'audio',
        allowedTabs: ['audio'],
        preferredTab: 'audio',
      };
    }
    return {
      targetMediaKind: null,
      allowedTabs: ['product', 'model', 'scene', 'motion', 'audio'],
      preferredTab: 'product',
    };
  }, []);
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

  const hasSubjectOtherViews = useCallback((asset: LibraryAsset | QueuedAsset | null | undefined) => {
    if (!asset) return false;
    if (typeof (asset as QueuedAsset).hasSubjectOtherViews === 'boolean') {
      return Boolean((asset as QueuedAsset).hasSubjectOtherViews);
    }
    const raw = (asset as LibraryAsset).meta_data?.kling_subject;
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
      source: candidate.mediaKind === 'image' ? 'product' : 'preference',
      materialType: candidate.mediaKind === 'video' ? 'motion' : candidate.mediaKind === 'audio' ? 'audio' : 'product',
      isPrimaryFrame: candidate.mediaKind === 'image',
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

  const selectAssetFromLibraryPopup = (asset: LibraryAsset) => {
    if (assetLibraryPickMode === 'background_audio') {
      if (asset.media_kind !== 'audio') {
        openInfo(popupTitles.notice, t.wb_audio_picker_only_audio || '请选择音频素材');
        return;
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
      return;
    }
    if (isSeedanceReplayMode && seedanceReplayLibraryIntent) {
      const queuedAsset = buildSeedanceReplayQueuedAssetFromLibrary(asset);
      const candidate = buildSeedanceReplayLibraryCandidate(asset);
      if (!queuedAsset || !candidate) {
        openInfo(
          popupTitles.notice,
          t.wb_seedance_replay_notice_unsupported_library_asset || 'The selected asset is not supported as a Seedance reference asset.',
        );
        return;
      }
      if (!seedanceReplayLibraryIntent.allowedTabs.includes(queuedAsset.materialType || 'product')) {
        openInfo(
          popupTitles.notice,
          t.wb_seedance_replay_notice_unsupported_library_category || 'This entry does not support the selected asset category.',
        );
        return;
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
        return;
      }
      const validationMessage = validateSeedanceReplayParsedAsset(candidate, t);
      if (validationMessage) {
        openInfo(popupTitles.notice, validationMessage);
        return;
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
        return;
      }

      const currentCount = uploadDisplayAssets.filter((item) => item.mediaKind === queuedAsset.mediaKind).length;
      const limit = queuedAsset.mediaKind === 'image'
        ? SEEDANCE_REPLAY_IMAGE_LIMIT
        : queuedAsset.mediaKind === 'video'
          ? SEEDANCE_REPLAY_VIDEO_LIMIT
          : SEEDANCE_REPLAY_AUDIO_LIMIT;
      if (currentCount >= limit) {
        const kindLabel = queuedAsset.mediaKind === 'image'
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
        return;
      }

      setAssetQueue((prev) => [...prev, queuedAsset]);
      applyWorkbenchAssetSelection(queuedAsset);
      setLastUploadedUrl(queuedAsset.assetUrl || null);
      return;
    }
    queueLibraryAssetIntoWorkbench(asset);
  };

  const currentScriptDuration = enableStoryboardEditor
      ? scripts.reduce((total, s) => total + (parseFloat(s.dur.replace('s', '')) || 0), 0)
      : genDuration;
  const isDurationValid = Math.abs(currentScriptDuration - genDuration) < 0.1;
  const hasAnyReuseQueue = assetQueue.length > 0 || scriptQueue.length > 0;
  const isReuseReady = assetQueue.length > 0 && scriptQueue.length > 0;
  const expectedBatchCount = isReuseReady ? assetQueue.length * scriptQueue.length : 0;
  const hasCurrentAsset = Boolean(uploadedFile || selectedAssetUrl || selectedFileObj);
  const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
  const VIDEO_EXTS = ['mp4', 'mov', 'mkv', 'webm', 'avi'];
  const imageFormats = IMAGE_EXTS.join('/');
  const videoFormats = VIDEO_EXTS.join('/');
  const formatHint = `图片(${imageFormats}) 视频(${videoFormats}) · ≤1GB`;
  const isBatchDebugMode = reuseQueueEnabled && hasAnyReuseQueue;
  const materialTypeLabelMap: Record<AssetLibraryTab, string> = {
    product: t.assets_tab_products || '商品',
    model: t.assets_tab_models || '模特',
    scene: t.assets_tab_scenes || '场景',
    motion: t.assets_tab_motion || '动作',
    audio: t.assets_tab_audio || '音频',
  };
  const defaultAssetLibraryTabs = useMemo<Array<{ value: AssetLibraryTab; label: string }>>(() => ([
    { value: 'product', label: materialTypeLabelMap.product },
    { value: 'model', label: materialTypeLabelMap.model },
    { value: 'scene', label: materialTypeLabelMap.scene },
    { value: 'motion', label: materialTypeLabelMap.motion },
  ]), [materialTypeLabelMap]);
  const seedanceReplayAssetLibraryTabs = useMemo<Array<{ value: AssetLibraryTab; label: string }>>(() => (
    seedanceReplayLibraryIntent
      ? seedanceReplayLibraryIntent.allowedTabs.map((tab) => ({ value: tab, label: materialTypeLabelMap[tab] }))
      : []
  ), [materialTypeLabelMap, seedanceReplayLibraryIntent]);
  const assetLibraryVisibleTabs = seedanceReplayLibraryIntent ? seedanceReplayAssetLibraryTabs : defaultAssetLibraryTabs;
  const isSeedanceReplayMode = creationMode === 'replay' && selectedModel === 'seedance2.0';
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
  const seedanceReplayUploadAssets = useMemo<SeedanceReplayUploadAsset[]>(() => (
    uploadDisplayAssets.flatMap((asset) => {
      if (asset.mediaKind !== 'image' && asset.mediaKind !== 'video' && asset.mediaKind !== 'audio') {
        return [];
      }
      return [{
        id: asset.id,
        name: asset.name || '未命名素材',
        mediaKind: asset.mediaKind,
        source: asset.assetId && !asset.fileObj ? 'library' : 'local',
        previewUrl: asset.previewUrl || null,
        durationSeconds: asset.durationSeconds ?? null,
      }];
    })
  ), [uploadDisplayAssets]);
  const seedanceReplayValidation = useMemo(
    () => buildSeedanceReplayValidationSummary(uploadDisplayAssets, t),
    [t, uploadDisplayAssets]
  );
  const normalizeSeedanceAssetUrl = useCallback((raw: string | null | undefined) => {
    const normalized = String(raw || '').trim();
    if (!normalized) return '';
    return normalized.split('#', 1)[0].split('?', 1)[0].trim().toLowerCase();
  }, []);
  const seedanceReplaySelectedAssetSignatures = useMemo(() => {
    const signatures = new Set<string>();
    for (const item of uploadDisplayAssets) {
      const id = String(item.assetId || '').trim();
      if (id) signatures.add(`id:${id}`);

      const normalizedUrl = normalizeSeedanceAssetUrl(item.assetUrl || item.uploadedPath || item.previewUrl || '');
      if (normalizedUrl) signatures.add(`url:${normalizedUrl}`);
    }
    return signatures;
  }, [normalizeSeedanceAssetUrl, uploadDisplayAssets]);
  const isSeedanceReplayAssetAlreadyAdded = useCallback((asset: LibraryAsset) => {
    const assetId = String(asset.id || '').trim();
    if (assetId && seedanceReplaySelectedAssetSignatures.has(`id:${assetId}`)) return true;

    const normalizedUrl = normalizeSeedanceAssetUrl(asset.file_url);
    if (normalizedUrl && seedanceReplaySelectedAssetSignatures.has(`url:${normalizedUrl}`)) return true;

    return false;
  }, [normalizeSeedanceAssetUrl, seedanceReplaySelectedAssetSignatures]);
  const toLibraryAssetFromTransferStationItem = (item: TransferStationItem): LibraryAsset | null => {
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
    lines.push(`${t.wb_ai_opt_prompt_goal || '目标'}: ${t.wb_ai_opt_prompt_goal_default || '保留主体形态与核心卖点，提升电商展示质感和清晰度。'}`);
    lines.push(`${t.wb_ai_opt_prompt_constraints || '约束'}: ${t.wb_ai_opt_prompt_constraints_default || '仅输出商品图，不添加文字水印，不改变商品结构。'}`);
    return lines.join('\n');
  }, [
    aiOptimizeCategory,
    aiOptimizeKeywords,
    coreSellingPoints,
    productCategory,
    productName,
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
      openInfo(popupTitles.notice, t.wb_ai_opt_need_prompt || '请先生成或填写提示词脚本。');
      return;
    }

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
        openInfo(popupTitles.notice, t.wb_ai_opt_no_result || '后端未返回可用图片，请稍后重试。');
        return;
      }
      setAiOptimizeResults(nextImages);
    } catch (err: any) {
      if (err instanceof VideoApiError && err.status === 404) {
        openInfo(popupTitles.notice, t.wb_ai_opt_backend_not_ready || '后端暂未接入图生图接口。');
      } else {
        openErrorModal(err, { category: 'generation_failed', onRetry: handleGenerateOptimizedImages });
      }
    } finally {
      setIsAiOptimizeGenerating(false);
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
    uiLanguageCode,
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
      return sortKlingQueueAssets(normalized);
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
  const getGuideFocusClass = (key: GuideStepKey) => (
      isGuideFocused(key)
          ? 'relative z-[85] ring-2 ring-orange-400/80 ring-offset-2 ring-offset-black/60 shadow-[0_0_24px_rgba(251,146,60,0.35)] rounded-xl'
          : ''
  );

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

    if (!target) {
      setGuidePanelStyle({
        width: `${panelWidth}px`,
        left: `${Math.max(viewportPadding, Math.round((window.innerWidth - panelWidth) / 2))}px`,
        top: `${Math.max(viewportPadding, Math.round((window.innerHeight - panelHeight) / 2))}px`,
      });
      return;
    }

    const rect = target.getBoundingClientRect();
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
  }, [guideStepIndex, isGuideOpen, getGuideTargetElement, updateGuidePanelPosition]);

  const extractUploadedAssetPath = (uploadResp: any): string | null => {
    if (uploadResp?.assets && Array.isArray(uploadResp.assets) && uploadResp.assets.length > 0) {
      return uploadResp.assets[0].url || uploadResp.assets[0].file_url || uploadResp.assets[0].path || null;
    }
    return uploadResp?.url || uploadResp?.file_url || uploadResp?.path || uploadResp?.data?.url || null;
  };

  const buildCreativeCardPrompt = (card?: ScriptCreativeCard) => {
    if (!card) return '';
    const sections: string[] = [];
    if (card.style) sections.push(`[风格]: ${card.style}`);
    if (card.environment) sections.push(`[环境]: ${card.environment}`);
    if (card.tonePacing) sections.push(`[语调与节奏]: ${card.tonePacing}`);
    if (card.camera) sections.push(`[镜头]: ${card.camera}`);
    if (card.lighting) sections.push(`[光线]: ${card.lighting}`);
    if (Array.isArray(card.actions) && card.actions.length > 0) {
      const actions = card.actions.map((item, idx) => `- ${idx + 1}. ${item}`).join('\n');
      sections.push(`[动作]:\n${actions}`);
    }
    if (card.backgroundSound) sections.push(`[背景音]: ${card.backgroundSound}`);
    if (card.transitionEditing) sections.push(`[转场 / 剪辑]: ${card.transitionEditing}`);
    if (card.callToAction) sections.push(`[行动号召]: ${card.callToAction}`);
    return sections.join('\n');
  };

  const buildCreativeCardEditorText = (card?: ScriptCreativeCard) => {
    const text = buildCreativeCardPrompt(card).trim();
    return text;
  };

  const hasCreativeCardContent = (card?: ScriptCreativeCard) => {
    if (!card) return false;
    if ((card.style || '').trim()) return true;
    if ((card.environment || '').trim()) return true;
    if ((card.tonePacing || '').trim()) return true;
    if ((card.camera || '').trim()) return true;
    if ((card.lighting || '').trim()) return true;
    if ((card.backgroundSound || '').trim()) return true;
    if ((card.transitionEditing || '').trim()) return true;
    if ((card.callToAction || '').trim()) return true;
    if ((card.actions || []).some((item) => String(item || '').trim().length > 0)) return true;
    return false;
  };

  const hasActiveScriptConcept =
      Boolean((activeFullScript || '').trim())
      || Boolean((activeCreativeCardText || '').trim())
      || hasCreativeCardContent(activeCreativeCard);

  const buildCombinedScriptPrompt = (
      fullScript: string,
      card?: ScriptCreativeCard,
      inputScripts: ScriptItem[] = [],
      cardText?: string
  ) => {
    const creativeCardPrompt = (cardText || '').trim() || buildCreativeCardPrompt(card);
    const masterScriptPrompt = (fullScript || '').trim() ? `[完整脚本]: ${(fullScript || '').trim()}` : '';
    const shotPrompt = inputScripts.map((script) => {
      const audioMarker = (soundSetting === 'on' && script.audio) ? `【音频|【[旁白]】${script.audio}】` : '';
      return `${script.visual || ''} ${audioMarker}`.trim();
    }).join(' ');
    const basePrompt = [masterScriptPrompt, creativeCardPrompt].filter(Boolean).join('\n\n');
    const storyboardSupplement = '[分镜补充要求]: 仅采用站立口播式出镜，人物始终站立并面向镜头，用手持商品进行展示与讲解；不要出现脚部穿戴、脚部特写、脚接触商品，避免把手误生成成脚。';
    const firstLastFrameAudioSupplement = selectedModel === 'kling' && klingGenerateMode === 'first_last_frame' && soundSetting === 'on'
      ? '【音频|【[旁白]】全程保留清晰自然的人声口播讲解与轻微环境声，不要输出静音视频；口播需与站立手持展示动作一致，语气自然，避免无声片段。】'
      : '';
    if (ENABLE_STORYBOARD_PROMPT && shotPrompt) {
      if (basePrompt) return `${basePrompt}\n\n[分镜指引]: ${shotPrompt}\n${storyboardSupplement}${firstLastFrameAudioSupplement ? `\n${firstLastFrameAudioSupplement}` : ''}`;
      return `[分镜指引]: ${shotPrompt}\n${storyboardSupplement}${firstLastFrameAudioSupplement ? `\n${firstLastFrameAudioSupplement}` : ''}`;
    }
    return [basePrompt || shotPrompt, storyboardSupplement, firstLastFrameAudioSupplement].filter(Boolean).join('\n\n');
  };

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
    const normalizedReferenceScript = (referenceScript || '').trim();

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
        if (!user?.id) {
          openInfo(popupTitles.notice, t.wb_popup_not_logged_in);
          return;
        }

        const imagePaths = await resolveProductRecognitionImagePaths();
        if (imagePaths.length === 0) {
          openInfo(popupTitles.notice, t.wb_popup_need_product_image_first);
          return;
        }

        const hasManualInput =
            (productInfoTouched.name && productName.trim()) ||
            (productInfoTouched.category && productCategory.trim()) ||
            (productInfoTouched.sellingPoints && coreSellingPoints.trim()) ||
            (productInfoTouched.audience && targetAudience.trim());

        if (hasManualInput) {
          const ok = await openConfirm(t.wb_ai_overwrite_title, t.wb_ai_overwrite_message, {
            okLabel: t.wb_ai_overwrite_confirm_ok,
            cancelLabel: t.wb_ai_overwrite_confirm_cancel,
          });
          if (!ok) return;
        }

        setIsAiRecognizing(true);
        try {
          const resp = await videoApi.recognizeProductInfo({ image_paths: imagePaths, output_language: language });
          const data = resp?.data || resp?.result || resp?.payload || resp;

          const nextName = String(data?.product_name || '').trim();
          const nextCategory = String(data?.product_category || '').trim();
          const nextSelling = Array.isArray(data?.core_selling_points)
              ? data.core_selling_points.filter(Boolean).join('\n')
              : String(data?.core_selling_points || '').trim();
          const nextAudience = String(data?.target_audience || '').trim();

          setProductName(nextName);
          setProductCategory(nextCategory);
          setCoreSellingPoints(nextSelling);
          setTargetAudience(nextAudience);
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
        openConfirm,
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
    for (const imgAsset of imageAssetsInQueue) {
      const p = await resolveQueueAssetPath(imgAsset);
      if (p) {
        allImagePaths.push(p);
        if (!resolvedImagePath) resolvedImagePath = p;
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
      user_language: language,
      target_language: targetLanguage,
      model_asset_id: selectedTemplate?.default_model_asset?.id ?? null,
      motion_asset_id: hasVisualAsset ? null : (selectedTemplate?.default_motion_asset?.id ?? null),
      ...(resolvedImagePath ? { image_path: resolvedImagePath } : {}),
      ...(allImagePaths.length > 1 ? { image_paths: allImagePaths } : {}),
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
      const raw = e.dataTransfer.getData(TRANSFER_STATION_DRAG_MIME);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<TransferStationItem>;
          const droppedItemId = String(parsed?.id || '').trim();
          const droppedItem = droppedItemId
            ? transferStationItems.find((item) => item.id === droppedItemId)
            : null;
          if (droppedItem) {
            applyTransferStationItemToWorkbench(droppedItem);
            return;
          }
        } catch {
          // Fallback to file processing if parsing fails.
        }
      }
    }

    if (!supportsFiles) return;
    const files = Array.from(e.dataTransfer.files || []);
    handleLocalFiles(files);
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

  const handleDurationChange = (id: number, newValue: string) => {
    const raw = newValue.trim();
    const newScripts = scripts.map(s => {
      if (s.id !== id) return s;

      if (!raw) return s;

      const num = Number(raw);
      if (!Number.isFinite(num)) return s;

      const clamped = Math.max(0.1, num);
      const rounded = Math.round(clamped * 10) / 10;
      return { ...s, dur: `${rounded}s` };
    });
    setScripts(newScripts);
  };

  const handleScriptTypeChange = (id: number, newType: string) => {
    const normalizedType = newType.trim() || 'Medium';
    const newScripts = scripts.map((item) => (item.id === id ? { ...item, type: normalizedType } : item));
    updateScripts(newScripts);
  };

  // 台词翻译处理（直接翻译 / 创意翻译）
  const handleTranslateShot = async (script: ScriptItem, index: number, mode: 'direct' | 'creative') => {
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
        const ns = [...scripts];
        ns[index].audio = resp.data.translated_text;
        updateScripts(ns);
      }
    } catch (err) {
      console.error('[handleTranslateShot] 翻译失败:', err);
    } finally {
      setTranslatingShots(prev => ({ ...prev, [script.id]: false }));
    }
  };

  const updateScripts = (newScripts: ScriptItem[]) => {
    setScripts(newScripts);
    setScriptPages(prev => {
      const next = [...prev];
      next[activeScriptPage] = { ...next[activeScriptPage], scripts: newScripts };
      return next;
    });
  };

  const updateActiveScriptPageMeta = (updater: (page: ScriptPage) => ScriptPage) => {
    setScriptPages((prev) => {
      if (activeScriptPage < 0 || activeScriptPage >= prev.length) return prev;
      const next = [...prev];
      next[activeScriptPage] = updater(next[activeScriptPage]);
      return next;
    });
  };

  const updateActiveFullScript = (value: string) => {
    updateActiveScriptPageMeta((page) => ({
      ...page,
      fullScript: value,
    }));
  };

  const updateActiveCreativeCardText = (value: string) => {
    updateActiveScriptPageMeta((page) => ({
      ...page,
      creativeCardText: value,
    }));
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
        panel: 'rounded-xl border border-slate-500/35 bg-slate-950/45 p-1.5',
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
        textarea: 'flex-1 bg-transparent border-0 p-0 text-[12px] leading-5 focus:outline-none resize-none text-slate-100 placeholder:text-slate-500',
      };
    }
    return {
      shell: 'rounded-2xl px-0 py-0 text-zinc-100',
      panel: 'rounded-xl border border-zinc-600/40 bg-zinc-950/45 p-1.5',
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
      textarea: 'flex-1 bg-transparent border-0 p-0 text-[12px] leading-5 focus:outline-none resize-none text-zinc-100 placeholder:text-zinc-500',
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

  const addScript = () => {
    const newId = scripts.length > 0 ? Math.max(...scripts.map(s => s.id)) + 1 : 1;
    updateScripts([...scripts, { id: newId, shot: (scripts.length + 1).toString(), type: 'Medium', dur: '2s', visual: '', audio: '', audioTranslation: '' }]);
  };

  const removeScript = (id: number) => {
    const remaining = scripts.filter(s => s.id !== id).map((s, idx) => ({ ...s, shot: (idx + 1).toString() }));
    updateScripts(remaining);
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
    seedanceReplayFileInputRef.current.accept = getSeedanceReplayLocalAccept(intent.targetMediaKind);
    seedanceReplayFileInputRef.current.click();
  }, []);

  const handleSeedanceReplayAddFromLocal = useCallback((targetMediaKind?: SeedanceReplayMediaKind) => {
    openSeedanceReplayLocalPicker({ targetMediaKind: targetMediaKind || null });
  }, [openSeedanceReplayLocalPicker]);

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
          ? SEEDANCE_REPLAY_VIDEO_LIMIT
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
        { limit: SEEDANCE_REPLAY_VIDEO_LIMIT, kind: t.wb_seedance_replay_media_video || 'Video', count: overflow.video },
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
        { limit: SEEDANCE_REPLAY_VIDEO_LIMIT, kind: t.wb_seedance_replay_media_video || 'Video', count: overflow.video },
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
      seedanceReplayFileInputRef.current.accept = SEEDANCE_REPLAY_UPLOAD_ACCEPT;
    }
  }, [handleSeedanceReplayLocalFiles, seedanceReplayUploadIntent]);

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
  const klingPrimarySlotHint = klingPrimarySlotAsset ? (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium normal-case tracking-normal text-green-400">
        1/1
        <CheckCircle className="h-3 w-3" />
      </span>
  ) : (
      <span className="text-[10px] font-medium normal-case tracking-normal text-zinc-500">
        {klingGenerateMode === 'subject'
          ? (t.wb_kling_primary_slot_subject_required || '必传1个主体')
          : (t.wb_kling_primary_slot_first_frame_required || '必传1张')}
      </span>
  );
  const klingReferenceLimit = klingGenerateMode === 'subject' ? 3 : 6;
  const isKlingReferenceOverflow = klingReferenceSlotAssets.length > klingReferenceLimit;
  const klingReferenceSlotHint = klingReferenceSlotAssets.length > 0 ? (
      <span className={`inline-flex items-center gap-1 text-[10px] font-medium normal-case tracking-normal ${isKlingReferenceOverflow ? 'text-red-400' : 'text-green-400'}`}>
        {klingReferenceSlotAssets.length}/{klingReferenceLimit}
        {!isKlingReferenceOverflow ? <CheckCircle className="h-3 w-3" /> : null}
        {isKlingReferenceOverflow ? (
          <span>
            {klingGenerateMode === 'subject'
              ? (t.wb_kling_reference_slot_subject_max || '最多3张')
              : (t.wb_kling_reference_slot_first_frame_max || '最多6张')}
          </span>
        ) : null}
      </span>
  ) : (
      <span className="text-[10px] font-medium normal-case tracking-normal text-zinc-500">
        {klingGenerateMode === 'subject'
          ? (t.wb_kling_reference_slot_subject_range || '1~3张')
          : (t.wb_kling_reference_slot_first_frame_optional || '可选 · ≤6张')}
      </span>
  );
  const renderUploadAssetCard = useCallback((asset: QueuedAsset, compact = false) => {
    const inQueue = assetQueue.find((item) => item.id === asset.id);
    const selected = selectedQueueAssetId ? selectedQueueAssetId === asset.id : uploadedFile === asset.previewUrl;
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
          <div className="absolute top-1 left-1 z-10 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {isKlingOmniMode && klingGenerateMode === 'subject' && hasSubjectOtherViews(asset) && (asset.materialType === 'product' || asset.materialType === 'model') && (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm">
                  <Layers3 className="h-3 w-3" />
                </span>
            )}
            <select
                className="text-[9px] font-bold px-2 py-1 pr-5 rounded-full border border-white/15 bg-black/80 text-zinc-100 cursor-pointer focus:outline-none focus:border-orange-500 appearance-none shadow-sm"
                value={asset.materialType || (asset.mediaKind === 'video' ? 'motion' : asset.mediaKind === 'audio' ? 'audio' : 'product')}
                onChange={(e) => {
                  const newType = e.target.value as AssetLibraryTab;
                  setAssetQueue(prev => {
                    const next = prev.map((item): QueuedAsset => item.id === asset.id ? { ...item, materialType: newType } : item);
                    return isKlingOmniMode ? normalizeQueueSourcesForKlingMode(next, klingGenerateMode) : next;
                  });
                  if (selectedQueueAssetId === asset.id || uploadedFile === asset.previewUrl) {
                    setCurrentMaterialType(newType);
                  }
                }}
                style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23ffffff\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
            >
              <option value="product">{materialTypeLabelMap['product']}</option>
              <option value="model">{materialTypeLabelMap['model']}</option>
              <option value="scene">{materialTypeLabelMap['scene']}</option>
              <option value="motion">{materialTypeLabelMap['motion']}</option>
              <option value="audio">{materialTypeLabelMap['audio']}</option>
            </select>
          </div>
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
                    className={`rounded border px-1.5 py-0.5 text-[9px] font-bold transition ${
                        highlighted
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
          <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent pointer-events-none z-10">
            <p className="text-[9px] text-white truncate drop-shadow-md">{asset.name}</p>
          </div>
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
    t.wb_ready,
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

  const buildScriptEstimateStorageKey = useCallback((params: { script_count: number; duration: number; has_reference_assets: boolean }) => {
    const userPart = user?.id ?? 'guest';
    return [
      SCRIPT_ESTIMATE_STORAGE_KEY_PREFIX,
      userPart,
      params.script_count,
      params.duration,
      params.has_reference_assets ? 1 : 0,
    ].join('_');
  }, [user?.id]);

  const readLocalScriptEstimate = useCallback((storageKey: string): ScriptEstimateCacheEntry | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<ScriptEstimateCacheEntry>;
      const avgSeconds = Number(parsed.avgSeconds);
      const sampleCount = Number(parsed.sampleCount);
      if (!Number.isFinite(avgSeconds) || avgSeconds <= 0) return null;
      if (!Number.isFinite(sampleCount) || sampleCount < 1) return null;
      return {
        avgSeconds,
        sampleCount: Math.max(1, Math.round(sampleCount)),
      };
    } catch {
      return null;
    }
  }, []);

  const writeLocalScriptEstimate = useCallback((storageKey: string, elapsedSeconds: number) => {
    const seconds = Math.max(1, Math.round(elapsedSeconds));
    const prev = readLocalScriptEstimate(storageKey);
    const nextCount = (prev?.sampleCount || 0) + 1;
    const nextAvg = prev
      ? ((prev.avgSeconds * prev.sampleCount) + seconds) / nextCount
      : seconds;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        avgSeconds: nextAvg,
        sampleCount: nextCount,
      }));
    } catch {
      // ignore storage failures
    }
  }, [readLocalScriptEstimate]);

  const normalizeScriptText = useCallback((value: any) => String(value || '').replace(/\s+/g, ' ').trim(), []);

  const parseScriptStringList = useCallback((value: any, maxLen = 5) => {
    if (!Array.isArray(value)) return [];
    const next: string[] = [];
    for (const item of value) {
      const text = normalizeScriptText(item);
      if (!text) continue;
      if (next.includes(text)) continue;
      next.push(text);
      if (next.length >= maxLen) break;
    }
    return next;
  }, [normalizeScriptText]);

  const buildScriptsFromShots = useCallback((shots: any[]) => shots.map((shot: any) => ({
    id: shot.shot_index,
    shot: String(shot.shot_index),
    type: shot.type || 'Medium',
    dur: `${shot.duration_sec}s`,
    visual: shot.visual,
    audio: shot.audio || shot.voiceover || '',
    audioTranslation: shot.voiceover_translation || '',
  })), []);

  const buildFullScriptFallback = useCallback((scriptsList: ScriptItem[]) => (
    scriptsList
      .map((item) => normalizeScriptText(item.visual))
      .filter((text) => !!text)
      .join(' ')
  ), [normalizeScriptText]);

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
    const fullScript = normalizeScriptText(scriptContent?.video_master_script) || buildFullScriptFallback(shots);
    return {
      id: `page-${idx + 1}`,
      name: `${t.wb_script_page_prefix} ${idx + 1}`,
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
      creativeCardText: buildCreativeCardEditorText(normalizedCreativeCard),
    };
  }, [buildCreativeCardEditorText, buildFullScriptFallback, buildScriptsFromShots, normalizeScriptText, parseScriptStringList, t.wb_script_page_prefix]);

  const appendGeneratedScriptPage = useCallback((raw: any) => {
    const appendedIndex = scriptPagesRef.current.length;
    const appendedPage = parseScriptPage(raw, appendedIndex);
    scriptPagesRef.current = [...scriptPagesRef.current, appendedPage];
    setScriptPages((prev) => [...prev, appendedPage]);
    setActiveScriptPage(appendedIndex);
    setScripts(appendedPage.scripts);
    setIsShotBreakdownOpen(false);
  }, [parseScriptPage]);

  const finishScriptGenerationProgress = useCallback(async () => {
    scriptGenerationFinishingRef.current = true;
    const from = Math.max(0, Math.min(100, scriptGenerationProgress));
    if (from < 100) {
      await new Promise<void>((resolve) => {
        const startedAt = performance.now();
        const durationMs = 380;
        const animate = (now: number) => {
          const ratio = Math.min(1, (now - startedAt) / durationMs);
          const eased = 1 - Math.pow(1 - ratio, 3);
          setScriptGenerationProgress(from + (100 - from) * eased);
          if (ratio < 1) {
            window.requestAnimationFrame(animate);
            return;
          }
          setScriptGenerationProgress(100);
          resolve();
        };
        window.requestAnimationFrame(animate);
      });
    } else {
      setScriptGenerationProgress(100);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }, [scriptGenerationProgress]);

  useEffect(() => {
    if (!isGeneratingScript || !scriptGenerationStartedAtRef.current) return;

    const tick = () => {
      if (scriptGenerationFinishingRef.current) return;
      const startedAt = scriptGenerationStartedAtRef.current;
      if (!startedAt) return;
      const elapsed = Math.max(0, (Date.now() - startedAt) / 1000);
      const estimated = Math.max(1, scriptGenerationEstimatedSeconds || 45);
      let nextProgress = 0;
      if (elapsed <= estimated) {
        const ratio = Math.min(1, elapsed / estimated);
        nextProgress = Math.pow(ratio, 0.85) * SCRIPT_PROGRESS_MAX_BEFORE_HOLD;
      } else {
        const overflow = elapsed - estimated;
        nextProgress = Math.min(
          SCRIPT_PROGRESS_HOLD_MAX,
          SCRIPT_PROGRESS_MAX_BEFORE_HOLD + Math.log1p(overflow) * 3
        );
      }
      setScriptGenerationProgress(Math.max(0, Math.min(100, nextProgress)));
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [isGeneratingScript, scriptGenerationEstimatedSeconds]);

  const handleCancelGenerateScripts = useCallback(() => {
    const controller = scriptGenerationAbortRef.current;
    if (!controller) return;

    activeScriptGenerationSeqRef.current += 1;
    scriptGenerationAbortRef.current = null;
    scriptGenerationStartedAtRef.current = null;
    scriptGenerationEstimateKeyRef.current = null;
    scriptGenerationFinishingRef.current = false;
    scriptGenerationProjectIdRef.current = null;
    controller.abort();
    setIsGeneratingScript(false);
    setIsScriptGenerationProgressVisible(false);
    setScriptGenerationProgress(0);
    setScriptGenerationCompletedCount(0);
    setScriptGenerationTotalCount(0);
    recordScriptGenerationCancelTimestamp(user?.id ?? null);
    setScriptGenerationNotice(t.wb_popup_script_generation_cancelled || '已成功取消脚本');
  }, [t.wb_popup_script_generation_cancelled, user?.id]);

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
    if (!user?.id) {
      openInfo(popupTitles.notice, t.wb_popup_not_logged_in);
      return;
    }

    const cooldownRemainingMs = getScriptGenerationCooldownRemainingMs(user.id);
    if (cooldownRemainingMs > 0) {
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

      return;
    }

    if (Object.keys(requiredErrors).length > 0) setRequiredErrors({});

    const totalScriptCount = Math.max(1, scriptVariantCount || 1);
    const estimateParams = {
      script_count: 1,
      duration: Math.max(1, genDuration || 10),
      has_reference_assets: uploadDisplayAssets.some((asset) => asset.mediaKind === 'image'),
    };
    const estimateStorageKey = buildScriptEstimateStorageKey(estimateParams);
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

    setIsGeneratingScript(true);
    setIsScriptGenerationProgressVisible(true);
    setScriptGenerationEstimatedSeconds(estimatedSeconds);
    setScriptGenerationProgress(0);
    setScriptGenerationCompletedCount(0);
    setScriptGenerationTotalCount(totalScriptCount);
    scriptGenerationStartedAtRef.current = Date.now();
    scriptGenerationEstimateKeyRef.current = estimateStorageKey;
    scriptGenerationFinishingRef.current = false;
    scriptGenerationProjectIdRef.current = projectStore.currentProjectId;
    const generationSeq = activeScriptGenerationSeqRef.current + 1;
    activeScriptGenerationSeqRef.current = generationSeq;
    const abortController = new AbortController();
    scriptGenerationAbortRef.current = abortController;
    let shouldHideProgressImmediately = true;

    try {
      type ScriptReferenceAsset = {
        type: 'model' | 'product' | 'scene';
        name: string;
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
      const imageReferenceSources = referenceSources.filter((asset) => asset.mediaKind === 'image');
      const resolvedImagePaths = new Map<string, string>();
      for (const asset of imageReferenceSources) {
        const resolvedPath = await resolveQueuedAssetPath(asset);
        if (resolvedPath) {
          resolvedImagePaths.set(asset.id, resolvedPath);
        }
      }
      const normalizedImageAssets = selectedModel === 'kling'
        ? normalizeQueueSourcesForKlingMode(imageReferenceSources, klingGenerateMode)
        : imageReferenceSources;
      const latestByType = new Map<'model' | 'product' | 'scene', QueuedAsset>();
      for (const asset of normalizedImageAssets) {
        if (asset.mediaKind !== 'image') continue;
        if (asset.materialType !== 'model' && asset.materialType !== 'product' && asset.materialType !== 'scene') continue;
        if (selectedModel === 'kling' && asset.source !== 'preference') continue;
        latestByType.set(asset.materialType, asset);
      }

      const referenceAssets: ScriptReferenceAsset[] = [];
      const orderedTypes: Array<'model' | 'product' | 'scene'> = ['model', 'product', 'scene'];
      for (const type of orderedTypes) {
        const asset = latestByType.get(type);
        if (!asset) continue;

        let resolvedPath = resolvedImagePaths.get(asset.id) || null;
        if (!resolvedPath) {
          resolvedPath = await resolveQueuedAssetPath(asset);
        }
        if (!resolvedPath) continue;

        referenceAssets.push({
          type,
          name: asset.name || '',
          image_path: resolvedPath,
        });
      }
      if (Object.keys(queuedPathUpdates).length > 0) {
        setAssetQueue(prev => prev.map(item => (
            queuedPathUpdates[item.id] ? { ...item, uploadedPath: queuedPathUpdates[item.id] } : item
        )));
      }

      let imagePath = selectedModel === 'kling'
        ? ''
        : (referenceAssets.find((item) => item.type === 'product')?.image_path || referenceAssets[0]?.image_path || '');

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
            const primaryPath = resolvedImagePaths.get(primaryAsset.id) || '';
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
      const normalizedReferenceScript = referenceScript.trim();

      const payload = {
        product_category: category,
        visual_style: style,
        aspect_ratio: rawRatio,
        user_language: language,
        target_language: targetLanguage,
        sound: soundSetting,
        script_count: scriptVariantCount,
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
        ...(promptOverridesPayload ? { prompt_overrides: promptOverridesPayload } : {}),
      };
      const reportPayload = {
        script_count: 1,
        duration: estimateParams.duration,
        has_reference_assets: estimateParams.has_reference_assets,
      };

      console.log("📜 Generating Script with payload:", payload);
      let sawVariant = false;
      let streamFailedMessage: string | null = null;
      await videoApi.generateScriptStream(
        user.id,
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
            const data = event?.data || {};
            const scriptContent = data.script_content;
            if (!scriptContent) return;

            sawVariant = true;
            const startedAt = scriptGenerationStartedAtRef.current;
            const elapsedSeconds = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 1000)) : null;
            shouldHideProgressImmediately = false;
            await finishScriptGenerationProgress();
            appendGeneratedScriptPage({ script_content: scriptContent });

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
      openErrorModal(err, { category: 'script_failed', onRetry: handleGenerateScripts });
    } finally {
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
      scriptGenerationFinishingRef.current = false;
    }
  };

  const handleExportScripts = async () => {
    if (scripts.length === 0) { openInfo(popupTitles.notice, t.wb_popup_no_scripts); return; }

    setIsExporting(true);

    try {
      const dataStr = JSON.stringify(scripts, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `scripts_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const enableSupabase = false;
      if (onExportToServer && enableSupabase) {
        await onExportToServer(scripts);
      }
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleUploadScripts = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);

        if (Array.isArray(parsed) && parsed.length > 0 && ('visual' in parsed[0] || 'shot' in parsed[0])) {
          const validScripts = parsed.map((item: any, idx: number) => ({
            id: item.id || Date.now() + idx,
            shot: item.shot || (idx + 1).toString(),
            type: item.type || 'Medium',
            dur: item.dur || '2s',
            visual: item.visual || '',
            audio: item.audio || '',
            audioTranslation: item.audioTranslation || ''
          }));
          setScripts(validScripts);
          setScriptPages(prev => {
            const next = [...prev];
            next[activeScriptPage] = { ...next[activeScriptPage], scripts: validScripts };
            return next;
          });

          const newTotal = validScripts.reduce((acc: number, s: any) => acc + (parseFloat(s.dur.replace('s','')) || 0), 0);
          if (Math.abs(newTotal - genDuration) > 0.5) {
            setGenDuration(normalizeDurationForModel(Math.ceil(newTotal), selectedModel));
          }
        } else {
          openInfo('Invalid file', 'Invalid script format. Please upload a valid JSON file.');
        }
      } catch (err) {
        console.error(err);
        openErrorModal(err, { category: 'parse_failed' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
    setIsShotBreakdownOpen(false);
  };

  useEffect(() => {
    if (activeScriptPage >= scriptPages.length && scriptPages.length > 0) {
      const lastIndex = scriptPages.length - 1;
      setActiveScriptPage(lastIndex);
      setScripts(scriptPages[lastIndex].scripts || []);
    }
  }, [activeScriptPage, scriptPages]);

  useEffect(() => {
    const isDemo = scripts.length === 2 && scripts[0].id === 1 && scripts[1].id === 2;

    if (isDemo) {
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

  const handleGenerateVideo = async () => {
    const issues = validateGenerateRequirements();
    if (issues.length > 0) {
      showGenerateValidationIssues(issues);
      return;
    }

    if (reuseQueueEnabled) {
      setIsGenerating(true);
      setGeneratedVideoUrl(null);

      try {
        const batchItems: Array<{ id: string; assetName: string; scriptName: string; taskId: string | number }> = [];

        const preparedAssets = await Promise.all(assetQueue.map(async (asset) => {
          let apiPath = asset.uploadedPath || asset.assetUrl || null;

          if (!apiPath && asset.fileObj) {
            const uploadResp = await assetsApi.uploadTempAsset(asset.fileObj);
            let rawPath = null;
            if (uploadResp.assets && Array.isArray(uploadResp.assets) && uploadResp.assets.length > 0) {
              rawPath = uploadResp.assets[0].url || uploadResp.assets[0].file_url || uploadResp.assets[0].path;
            } else {
              rawPath = uploadResp.url || uploadResp.file_url || uploadResp.path || uploadResp.data?.url;
            }
            if (!rawPath) throw new Error("素材上传后未返回路径");
            apiPath = rawPath;

            setAssetQueue(prev => prev.map(a => a.id === asset.id ? { ...a, uploadedPath: apiPath } : a));
          }

          if (!apiPath) throw new Error(`无法获取素材路径：${asset.name}`);

          return { ...asset, apiPath };
        }));

        // 收集所有音频素材的路径，用于 Seedance reference_audio
        const audioPaths = preparedAssets
            .filter((a) => a.mediaKind === 'audio')
            .map((a) => (a as any).apiPath as string);

        // 非音频素材才参与 asset × script 矩阵生成
        const nonAudioAssets = preparedAssets.filter((a) => a.mediaKind !== 'audio');

        // 如果全部是音频（无图片/视频），仍走 text-to-video，用空数组兜底
        const effectiveAssets = nonAudioAssets.length > 0 ? nonAudioAssets : [null];

        for (const asset of effectiveAssets) {
          for (const scriptPack of scriptQueue) {
            const combinedScriptPrompt = buildCombinedScriptPrompt(
                scriptPack.fullScript || '',
                scriptPack.creativeCard,
                scriptPack.scripts,
                scriptPack.creativeCardText || ''
            );

            let newProjectId: string | undefined;
            if (selectedTemplate?.id) {
              const cloneResp = await videoApi.cloneProject(selectedTemplate.id);
              newProjectId = cloneResp?.data?.new_project_id || cloneResp?.new_project_id || cloneResp?.data?.id;
              if (!newProjectId) throw new Error('Failed to clone project');
            } else {
              if (!user?.id) throw new Error('请先登录');
              const createResp = await videoApi.createProject(user.id, {
                title: (productName || '').trim() || `${asset?.name || 'Text'} × ${scriptPack.name}`,
                aspect_ratio: '9:16',
                script_content: {
                  duration: scriptPack.duration,
                  shots: scriptPack.scripts
                }
              });
              newProjectId = createResp?.data?.id || createResp?.data?.project_id || createResp?.id;
              if (!newProjectId) throw new Error('Failed to create project');
            }

            const payload = {
              model: backendModel,
              prompt: combinedScriptPrompt,
              product_name: productName,
              project_id: newProjectId,
              duration: scriptPack.duration,
              aspect_ratio: aspectRatio,
              ...(asset
                  ? (asset.mediaKind === 'video'
                      ? { motion_video_path: (asset as any).apiPath }
                      : { image_path: (asset as any).apiPath })
                  : {}),
              sound: soundSetting,
              ...(audioPaths.length > 0 ? { audio_paths: audioPaths } : {}),
              ...(selectedBackgroundAudio && soundSetting === 'off'
                ? {
                  background_audio_asset_id: selectedBackgroundAudio.id,
                  background_audio_url: selectedBackgroundAudio.file_url,
                  background_audio_name: selectedBackgroundAudio.name,
                }
                : {}),
              asset_source: asset?.source ?? null,
              user_language: language,
              target_language: targetLanguage,
              model_asset_id: selectedTemplate?.default_model_asset?.id ?? null,
              motion_asset_id: asset?.mediaKind === 'video' ? null : (selectedTemplate?.default_motion_asset?.id ?? null),
              ...(promptOverridesPayload ? { prompt_overrides: promptOverridesPayload } : {}),
            };

            const genResp = await generateWithAdaptiveImageConfirm(payload);
            const taskId = genResp?.data?.task_id || genResp?.task_id;
            const projectId = genResp?.data?.project_id || newProjectId;

            if (genResp?.code === 0 && taskId) {
              const estimatedSeconds = await fetchEstimatedSeconds({
                model: backendModel,
                duration: scriptPack.duration,
                sound: soundSetting,
                aspect_ratio: String(payload.aspect_ratio || ''),
                resolution: String((payload as any).resolution || (payload as any).size || ''),
              });
              console.log('[Estimate] batchGeneration', { taskId, projectId: String(projectId), estimatedSeconds });

              addTask({
                id: taskId,
                projectId: String(projectId),
                workbenchProjectId: projectStore.currentProjectId,
                estimatedSeconds,
                type: 'video_generation',
                status: 'processing',
                name: `${(productName || '').trim() || asset?.name || 'Text-to-Video'}`,
                thumbnail: asset?.previewUrl || undefined,
                createdAt: Date.now(),
              });

              batchItems.push({
                id: `${asset?.id || 'text'}-${scriptPack.id}-${taskId}`,
                assetName: asset?.name || 'Text',
                scriptName: scriptPack.name,
                taskId,
              });
            } else {
              console.warn('Batch generation response invalid', genResp);
            }
          }
        }

        if (batchItems.length > 0) {
          setGeneratedBatch(prev => [...batchItems, ...prev]);
          openInfo(popupTitles.success, formatMessage(t.wb_popup_batch_success, { count: batchItems.length }));
        } else {
          openInfo(popupTitles.notice, t.wb_popup_batch_no_task_id);
        }
      } catch (err: any) {
        if (err?.message === USER_CANCELLED_ADAPT) {
          openInfo(popupTitles.notice, t.wb_popup_batch_cancelled);
        } else {
          openErrorModal(err, { category: 'generation_failed', onRetry: handleGenerateVideo });
        }
      } finally {
        setIsGenerating(false);
      }

      return;
    }

    setIsGenerating(true);
    setGeneratedVideoUrl(null);

    try {
      const payload = await buildSingleGeneratePayload();
      await submitSingleGeneration(payload);
    } catch (err: any) {
      if (err?.message === USER_CANCELLED_ADAPT) {
        openInfo(popupTitles.notice, t.wb_popup_batch_cancelled);
      } else {
        openErrorModal(err, { category: 'generation_failed', onRetry: handleGenerateVideo });
      }
    } finally {
      setIsGenerating(false);
    }
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
        window.location.href = authUrl;
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
            openInfo(popupTitles.notice, t.wb_popup_tiktok_switch_cancelled);
            const authUrl = await tiktokApi.getAuthUrl(targetProjectId);
            window.location.href = authUrl;
            return;
          } catch (err: any) {
            openErrorModal(err, { category: 'upload_failed' });
          }
        }
        setIsPostingTikTok(false);
        return;
      }

      const result = await tiktokApi.publishDraft(targetProjectId);
      if (result.requiresAuth) {
        const authUrl = result.authUrl || await tiktokApi.getAuthUrl(targetProjectId);
        window.location.href = authUrl;
        return;
      }

      openInfo(popupTitles.success, t.wb_popup_tiktok_upload_success);
    } catch (err: any) {
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
    if (creationMode !== 'fast') return;
    if (
        selectedModel === 'kling' ||
        selectedModel === 'sora2' ||
        selectedModel === 'sora2pro' ||
        selectedModel === 'seedance2.0'
    ) {
      lastFastModelRef.current = selectedModel;
    }
  }, [creationMode, selectedModel]);

  useEffect(() => {
    if (creationMode !== 'replay') return;
    if (selectedModel !== 'seedance2.0') setSelectedModel('seedance2.0');
  }, [creationMode, selectedModel, setSelectedModel]);

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
        'group/seg relative flex-1 py-2.5 rounded-lg text-[10px] tracking-tight font-bold transition select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60';
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

    const handleSetCreationMode = (next: 'fast' | 'replay') => {
      if (next === creationMode) return;
      if (next === 'replay') {
        if (
            selectedModel === 'kling' ||
            selectedModel === 'sora2' ||
            selectedModel === 'sora2pro' ||
            selectedModel === 'seedance2.0'
        ) {
          lastFastModelRef.current = selectedModel;
        }
        setCreationMode('replay');
        setSelectedModel('seedance2.0');
        return;
      }
      setCreationMode('fast');
      setSelectedModel(lastFastModelRef.current || 'kling');
    };

    const modelOptions: Array<{
      id: 'kling' | 'sora2' | 'sora2pro' | 'seedance2.0';
      title: string;
      desc: string;
      rate: number;
      Icon: React.ComponentType<{ className?: string }>;
    }> = [
      {
        id: 'kling',
        title: t.wb_model_kling_title || (language === 'zh' ? '可灵 o1' : 'Kling o1'),
        desc: t.wb_model_kling_desc,
        rate: 20,
        Icon: Zap,
      },
      {
        id: 'sora2',
        title: 'Sora 2',
        desc: t.wb_model_sora2_desc,
        rate: 100,
        Icon: SoraStarIcon,
      },
      {
        id: 'sora2pro',
        title: 'Sora 2 Pro',
        desc: t.wb_model_sora2pro_desc,
        rate: 300,
        Icon: Sparkles,
      },
      {
        id: 'seedance2.0',
        title: 'Seedance 2.0',
        desc: t.wb_model_seedance_desc,
        rate: 50,
        Icon: Video,
      },
    ];

    const renderModelCard = (opt: typeof modelOptions[number]) => {
      const active = selectedModel === opt.id;
      const locked = false;  // Seedance 2.0 backend ready — unlock fast mode
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
                'w-full text-left rounded-2xl border p-3 transition flex items-center gap-4',
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
              <div className="text-[12px] font-black tracking-wide text-zinc-200 truncate">{opt.title}</div>
              <div
                  className={
                    language === 'zh'
                        ? 'mt-1 text-[9px] font-medium text-zinc-400 truncate'
                        : 'mt-1 text-[8px] font-medium text-zinc-400 whitespace-normal break-words leading-snug'
                  }
              >
                {opt.desc}
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
                    {opt.rate}{t.wb_vpoints_per_sec}
                  </div>
                </div>
            )}
          </button>
      );
    };

    const modelSelector = (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
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
              <div>
                <div className="creation-mode-toggle mx-3 rounded-2xl bg-white/5 border border-white/10 p-1 flex items-center gap-1">
                  <button
                      type="button"
                      onClick={() => handleSetCreationMode('fast')}
                      aria-pressed={creationMode === 'fast'}
                      className={[
                        'flex-1 rounded-xl py-2 flex items-center justify-center gap-2 font-black tracking-wide transition',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
                        creationMode === 'fast'
                            ? 'bg-white text-zinc-900 shadow-md'
                            : 'bg-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
                      ].join(' ')}
                  >
                    <Zap className={creationMode === 'fast' ? 'w-4 h-4 text-orange-500' : 'w-4 h-4 text-zinc-500'} />
                    <span className="text-[12px]">{t.wb_creation_mode_fast}</span>
                  </button>
                  <button
                      type="button"
                      onClick={() => handleSetCreationMode('replay')}
                      aria-pressed={creationMode === 'replay'}
                      className={[
                        'flex-1 rounded-xl py-2 flex items-center justify-center gap-2 font-black tracking-wide transition',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
                        creationMode === 'replay'
                            ? 'bg-white text-zinc-900 shadow-md'
                            : 'bg-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
                      ].join(' ')}
                  >
                    <Layers className={creationMode === 'replay' ? 'w-4 h-4 text-orange-500' : 'w-4 h-4 text-zinc-500'} />
                    <span className="text-[12px]">{t.wb_creation_mode_replay}</span>
                  </button>
                </div>
              </div>

              {creationMode === 'fast' ? (
                  <div className="glass-panel rounded-2xl p-3 border border-white/10 bg-black/20">
                    <div className="mb-3">
                      <h2 className="mx-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <ArrowRight className="w-3 h-3 text-zinc-500" />
                        {t.wb_render_power_title}
                      </h2>
                    </div>
                    <div className="flex flex-col gap-3">{modelOptions.map(renderModelCard)}</div>
                  </div>
              ) : (
              <div className="glass-panel rounded-2xl p-3 border border-white/10 bg-black/20">
                <h2 className="mx-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <ArrowRight className="w-3 h-3 text-zinc-500" />
                  {t.wb_render_power_title}
                </h2>
                <div className="w-full text-left rounded-2xl border border-orange-500/70 bg-orange-500/10 shadow-lg shadow-orange-500/10 p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-orange-500/20 border border-orange-500/30">
                    <Video className="w-5 h-5 text-orange-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={language === 'vi' ? 'flex items-center gap-1.5' : 'flex items-center gap-2'}>
                      <div className="text-[12px] font-black tracking-wide text-zinc-200 whitespace-nowrap">Seedance 2.0</div>
                      <span
                          className={[
                            'rounded-full font-black bg-emerald-500 text-black whitespace-nowrap shrink-0',
                            language === 'vi' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]',
                          ].join(' ')}
                      >
                    {t.wb_engine_dedicated}
                  </span>
                    </div>
                    <div
                        className={
                          language === 'zh'
                              ? 'mt-1 text-[9px] font-medium text-zinc-400 truncate'
                              : 'mt-1 text-[8px] font-medium text-zinc-400 whitespace-normal break-words leading-snug'
                        }
                    >
                      {t.wb_recommend_engine_desc}
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
                      300v点
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 flex items-start gap-2">
                  <Info className="w-3 h-3 text-zinc-400 mt-0.5 shrink-0" />
                  <div className="text-[10px] font-normal text-zinc-400 leading-relaxed">
                    {t.wb_replay_seedance_only}
                  </div>
                </div>
              </div>
              )}
              </div>
            </div>
          </div>
        </div>
    );

    const renderLeftColumnSettings = () => (
        <div ref={configSectionRef} className={`flex flex-col gap-3 flex-1 transition-opacity duration-500 ${getGuideFocusClass('config')}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Gift className="w-3 h-3" /> 商品信息
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
            <div className="glass-panel rounded-xl p-5 flex flex-col gap-4">
              <div ref={videoTypeFieldRef}>
                <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">
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
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 transition"
                />
                {requiredErrors.productName && (
                    <div className="mt-1 text-[10px] text-red-400 font-medium">{requiredErrors.productName}</div>
                )}
              </div>

              <div ref={productCategoryFieldRef}>
                <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">
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
                    buttonClassName="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-orange-500 transition cursor-pointer hover:bg-white/5"
                    labelClassName=""
                    iconClassName="w-3 h-3 text-zinc-500"
                    optionClassName="text-xs"
                />
                {requiredErrors.productCategory && (
                    <div className="mt-1 text-[10px] text-red-400 font-medium">{requiredErrors.productCategory}</div>
                )}
              </div>

            <div>
              <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">
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
                className="w-full h-[96px] overflow-y-auto custom-scroll bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 transition resize-none"
              />
              {requiredErrors.coreSellingPoints && (
                <div className="mt-1 text-[10px] text-red-400 font-medium">{requiredErrors.coreSellingPoints}</div>
              )}
            </div>

              <div>
                <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_field_target_audience_label}</label>
                <input
                    value={targetAudience}
                    onChange={(e) => {
                      setTargetAudience(e.target.value);
                      setProductInfoTouched((prev) => ({ ...prev, audience: true }));
                    }}
                    placeholder={t.wb_field_target_audience_placeholder}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 transition"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 mt-2">
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <SlidersHorizontal className="w-3 h-3" /> {t.wb_generation_settings_title}
            </h2>
          </div>

          <div className="flex flex-col gap-4">
            <div className="glass-panel rounded-xl p-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_field_delivery_region_label}</label>
                  <DropdownSelect
                      value={deliveryRegion}
                      options={DELIVERY_REGION_OPTIONS.map((opt) => ({ value: opt.value, label: t[opt.labelKey] }))}
                      onChange={setDeliveryRegion}
                      buttonClassName="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-orange-500 transition cursor-pointer hover:bg-white/5"
                      labelClassName=""
                      iconClassName="w-3 h-3 text-zinc-500"
                      optionClassName="text-xs"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_field_video_language_label}</label>
                  <DropdownSelect
                      value={targetLanguage}
                      options={TARGET_LANGUAGE_OPTIONS.map((opt) => ({ value: opt.value, label: t[opt.labelKey] }))}
                      onChange={setTargetLanguage}
                      buttonClassName="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-orange-500 transition cursor-pointer hover:bg-white/5"
                      labelClassName=""
                      iconClassName="w-3 h-3 text-zinc-500"
                      optionClassName="text-xs"
                  />
                </div>
              </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">
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
                  buttonClassName="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-orange-500 transition cursor-pointer hover:bg-white/5"
                  labelClassName=""
                  iconClassName="w-3 h-3 text-zinc-500"
                  optionClassName="text-xs"
                />
                {requiredErrors.videoType && (
                  <div className="mt-1 text-[10px] text-red-400 font-medium">{requiredErrors.videoType}</div>
                )}
              </div>

              {!(selectedModel === 'kling' && klingGenerateMode === 'first_frame') && (
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.aspect_ratio}</label>
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
                    buttonClassName="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-orange-500 transition cursor-pointer hover:bg-white/5"
                    labelClassName=""
                    iconClassName="w-3 h-3 text-zinc-500"
                    optionClassName="text-xs"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_field_additional_requirements_label}</label>
              <textarea
                readOnly={!hasCurrentAsset}
                onFocus={() => {
                  if (!hasCurrentAsset) openInfo(popupTitles.notice, t.wb_additional_requirements_need_asset);
                }}
                onClick={() => {
                  if (!hasCurrentAsset) openInfo(popupTitles.notice, t.wb_additional_requirements_need_asset);
                }}
                className={`w-full bg-black/40 text-xs p-3 rounded-lg border border-white/10 resize-y min-h-[80px] ${!hasCurrentAsset ? 'text-zinc-500 opacity-60' : 'text-zinc-300 focus:border-orange-500 focus:outline-none'}`}
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
                      <label className="text-[10px] text-zinc-500 font-bold block uppercase">{t.wb_config_duration}</label>
                      <span className="text-[12px] font-bold text-orange-400">{genDuration}s</span>
                    </div>
                    <input
                      type="range"
                      min={selectedModel === 'kling' ? 3 : 4}
                      max={selectedModel === 'kling' ? 10 : 15}
                      step={1}
                      value={genDuration}
                      onChange={(e) => setGenDuration(normalizeDurationForModel(Number(e.target.value), selectedModel))}
                      className="w-full h-2 bg-black/30 rounded-lg appearance-none cursor-pointer accent-orange-500"
                    />
                  </div>
                ) : (
                  <>
                    <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_duration}</label>
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
                      buttonClassName="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-orange-500 transition cursor-pointer hover:bg-white/5"
                      labelClassName=""
                      iconClassName="w-3 h-3 text-zinc-500"
                      optionClassName="text-xs"
                    />
                  </>
                )}
              </div>

                <div ref={audioConfigSectionRef}>
                  <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_audio}</label>
                  <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                    <button onClick={() => setSoundSetting('on')} className={`wb-choice-btn flex-1 py-1.5 rounded-md text-[10px] font-medium transition ${soundSetting === 'on' ? 'wb-choice-btn--active' : 'wb-choice-btn--inactive'}`}>{t.wb_config_audio_on}</button>
                    <button onClick={() => setSoundSetting('off')} className={`wb-choice-btn flex-1 py-1.5 rounded-md text-[10px] font-medium transition ${soundSetting === 'off' ? 'wb-choice-btn--active' : 'wb-choice-btn--inactive'}`}>{t.wb_config_audio_off}</button>
                  </div>
                  {soundSetting === 'off' && (
                    <div className="mt-2 space-y-2">
                      <input
                        type="file"
                        ref={backgroundAudioInputRef}
                        className="hidden"
                        accept=".mp3,.wav,.flac,audio/mpeg,audio/wav,audio/x-wav,audio/flac"
                        onChange={handleBackgroundAudioFileChange}
                      />
                      <button
                        type="button"
                        onClick={() => setIsBackgroundAudioSourceOpen((prev) => !prev)}
                        className={`w-full rounded-lg border px-3 py-2 text-xs transition ${
                          isBackgroundAudioSourceOpen
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
                            className="flex w-full items-center rounded-md border border-transparent px-3 py-2 text-left text-xs text-zinc-200 transition hover:border-zinc-400/30 hover:bg-zinc-500/10 hover:text-orange-200"
                          >
                            <span>{t.wb_btn_choose_from_library || '从素材库选择'}</span>
                          </button>
                          <div className="mx-3 h-px scale-y-50 bg-zinc-500/18" />
                          <button
                            type="button"
                            onClick={() => backgroundAudioInputRef.current?.click()}
                            className="mt-1 flex w-full items-center rounded-md border border-transparent px-3 py-2 text-left text-xs text-zinc-200 transition hover:border-zinc-400/30 hover:bg-zinc-500/10 hover:text-orange-200"
                          >
                            <span>{(t as any).wb_background_audio_upload || '上传本地音频'}</span>
                          </button>
                          <div className="px-3 pb-1 pt-2 text-[10px] text-zinc-500">
                            {(t as any).wb_background_audio_hint || 'mp3 / wav / flac · ≤ 1GB'}
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

              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 font-bold block uppercase">{t.wb_reference_script_label || '参考脚本（来自视频解析）'}</label>
                <textarea
                  value={referenceScript}
                  onChange={(e) => setReferenceScript(e.target.value)}
                  rows={4}
                  placeholder={t.wb_reference_script_placeholder || '粘贴或使用“视频解析反向生成脚本”应用到工作台后的参考脚本'}
                  className="w-full bg-black/40 text-xs p-3 rounded-lg border border-white/10 resize-y min-h-[86px] text-zinc-300 focus:border-orange-500 focus:outline-none"
                />
                <div className="text-[10px] text-zinc-500">{t.wb_reference_script_hint || '该内容将作为风格参考一并输入脚本模型，帮助生成更接近参考风格的新脚本。'}</div>
              </div>

              <div className="border-t border-white/5 my-1" />

              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] text-zinc-500 font-bold block uppercase">{t.wb_script_count_label}</label>
                  <span className="text-[12px] font-bold text-orange-400">{scriptVariantCount} {t.wb_script_count_unit}</span>
                </div>
                <input
                    type="range"
                    min={1}
                    max={10}
                    value={scriptVariantCount}
                    onChange={(e) => setScriptVariantCount(Number(e.target.value))}
                    className="w-full h-2 bg-black/30 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
            </div>
          </div>

        </div>
    );

    return (
        <div className="w-full flex flex-col gap-6 h-full overflow-y-auto overflow-x-hidden custom-scroll pr-1">
          <div ref={modeSectionRef} className={getGuideFocusClass('mode')}>
            {modelSelector}
          </div>
          {false && legacyModelSelector}
          {/* Upload Section */}
          <div ref={uploadSectionRef} className={`flex flex-col gap-3 ${getGuideFocusClass('upload')}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><UploadCloud className="w-3 h-3" /> {t.wb_upload_title}</h2>
            </div>
            {isSeedanceReplayMode ? (
              <>
                <SeedanceReplayUploadPanel
                  assets={seedanceReplayUploadAssets}
                  validationSummary={seedanceReplayValidation}
                  onAddFromLibrary={handleSeedanceReplayAddFromLibrary}
                  onAddFromLocal={handleSeedanceReplayAddFromLocal}
                  onPreview={handleSeedanceReplayPreview}
                  onRemove={handleSeedanceReplayRemove}
                />
                <input
                  type="file"
                  ref={seedanceReplayFileInputRef}
                  className="hidden"
                  accept={SEEDANCE_REPLAY_UPLOAD_ACCEPT}
                  multiple
                  onChange={handleSeedanceReplayFileChange}
                />
              </>
            ) : (
            <div className="flex flex-col gap-3">
            {isKlingOmniMode && (
                <div className="grid grid-cols-3 gap-2">
                  <button
                      type="button"
                      onClick={() => handleKlingGenerateModeChange('first_frame')}
                      className={`relative overflow-visible rounded-xl border px-3 py-2 text-left transition hover:z-20 ${klingGenerateMode === 'first_frame' ? 'border-orange-500/70 bg-orange-500/10 text-orange-200 z-20' : 'border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5'}`}
                  >
                    <div className="flex items-center gap-1 text-[11px] font-bold">
                      <span>{t.wb_kling_mode_first_frame}</span>
                      <span className="relative z-10 inline-flex items-center group/info hover:z-20">
                        <Info className="h-3 w-3 text-zinc-400" />
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 ml-6 w-40 -translate-x-1/2 whitespace-normal break-words rounded-lg border border-white/10 bg-zinc-900/95 px-2 py-1 text-[12px] font-medium leading-snug text-zinc-100 opacity-0 shadow-xl backdrop-blur transition group-hover/info:opacity-100">
                          <span className="block">{t.wb_material_requirement_title}</span>
                          <span className="block">{t.wb_kling_first_frame_requirement}</span>
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-zinc-400">{t.wb_kling_first_frame_desc}</div>
                  </button>
                  <button
                      type="button"
                      onClick={() => handleKlingGenerateModeChange('subject')}
                      className={`relative overflow-visible rounded-xl border px-3 py-2 text-left transition hover:z-20 ${klingGenerateMode === 'subject' ? 'border-orange-500/70 bg-orange-500/10 text-orange-200 z-20' : 'border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5'}`}
                  >
                    <div className="flex items-center gap-1 text-[11px] font-bold">
                      <span>{t.wb_kling_mode_subject}</span>
                      <span className="relative z-10 inline-flex items-center group/info hover:z-20">
                        <Info className="h-3 w-3 text-zinc-400" />
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 ml-6 w-44 -translate-x-1/2 whitespace-normal break-words rounded-lg border border-white/10 bg-zinc-900/95 px-2 py-1 text-[12px] font-medium leading-snug text-zinc-100 opacity-0 shadow-xl backdrop-blur transition group-hover/info:opacity-100">
                          <span className="block">{t.wb_material_requirement_title}</span>
                          <span className="block">{t.wb_kling_subject_requirement}</span>
                          <span className="mt-1 block text-zinc-300">{t.wb_kling_subject_requirement_note}</span>
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-zinc-400">{t.wb_kling_subject_desc}</div>
                  </button>
                  <button
                      type="button"
                      onClick={() => handleKlingGenerateModeChange('first_last_frame')}
                      className={`relative overflow-visible rounded-xl border px-3 py-2 text-left transition hover:z-20 ${klingGenerateMode === 'first_last_frame' ? 'border-orange-500/70 bg-orange-500/10 text-orange-200 z-20' : 'border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5'}`}
                  >
                    <div className="flex items-center gap-1 text-[11px] font-bold">
                      <span>{t.wb_kling_mode_first_last_frame || 'First + Last Frame Mode'}</span>
                      <span className="relative z-10 inline-flex items-center group/info hover:z-20">
                        <Info className="h-3 w-3 text-zinc-400" />
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 ml-6 w-44 -translate-x-1/2 whitespace-normal break-words rounded-lg border border-white/10 bg-zinc-900/95 px-2 py-1 text-[12px] font-medium leading-snug text-zinc-100 opacity-0 shadow-xl backdrop-blur transition group-hover/info:opacity-100">
                          <span className="block">{t.wb_material_requirement_title}</span>
                          <span className="block">{t.wb_kling_first_last_frame_requirement || '1 first-frame image + 1 tail-frame image + 0-6 reference images'}</span>
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-zinc-400">{t.wb_kling_first_last_frame_desc || 'Constrain the beginning and ending of the video with first and last keyframes'}</div>
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
                onDragOver={isKlingOmniMode ? undefined : handleUploadDragOver}
                onDragEnter={isKlingOmniMode ? undefined : handleUploadDragOver}
                onDragLeave={isKlingOmniMode ? undefined : handleUploadDragLeave}
                onDrop={isKlingOmniMode ? undefined : handleUploadDrop}
                className={`glass-panel rounded-xl p-1 border-2 border-dashed transition-colors min-h-32 relative group ${uploadDisplayAssets.length > 0 ? 'border-none' : ''} ${isKlingOmniMode ? 'border-none' : (isDragUploadActive ? 'border-orange-500/80 bg-orange-500/10' : 'border-zinc-800 hover:border-orange-500/50')}`}
            >
              {!isKlingOmniMode && isDragUploadActive && (
                  <div className="absolute inset-1 rounded-lg border border-dashed border-orange-500/60 bg-orange-500/10 pointer-events-none" />
              )}
              <input type="file" ref={fileInputRef} className="hidden" accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.mkv,.webm,.avi" multiple onChange={handleWorkbenchUpload} />
              {!isKlingOmniMode && uploadDisplayAssets.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-10 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <div className="w-8 h-8 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center mb-2 group-hover:scale-110 transition duration-300"><Plus className="w-4 h-4 text-zinc-500 group-hover:text-orange-500" /></div>
                    <p className="text-[10px] font-medium text-zinc-400">{t.wb_upload_click}</p>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[10px] text-zinc-300">
                      <span className="text-zinc-500">{t.wb_upload_support}</span>
                      <span className="relative group/item rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                  {t.wb_upload_image}
                        <span className="absolute left-1/2 top-7 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-zinc-900/95 px-2 py-1 text-[9px] text-zinc-100 opacity-0 shadow-xl backdrop-blur transition group-hover/item:opacity-100 hover:opacity-100">
                    {imageFormats}
                  </span>
                </span>
                      <span className="relative group/item rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                  {t.wb_upload_video}
                        <span className="absolute left-1/2 top-7 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-zinc-900/95 px-2 py-1 text-[9px] text-zinc-100 opacity-0 shadow-xl backdrop-blur transition group-hover/item:opacity-100 hover:opacity-100">
                    {videoFormats}
                  </span>
                </span>
                      <span className="text-zinc-400">{t.wb_upload_max_size}</span>
                    </div>
                  </div>
              ) : (
                  <div className="rounded-lg bg-zinc-900/80 p-2">
                    {isKlingOmniMode ? (
                        klingGenerateMode === 'first_last_frame' ? (
                          klingPrimarySlotAsset && klingTailSlotAsset ? (
                            <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto custom-scroll pr-1">
                              <div className="rounded-xl border border-white/10 bg-black/25 p-2">
                                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{t.wb_label_first_frame_short || t.wb_label_first_frame || 'First'}</div>
                                {renderUploadAssetCard(klingPrimarySlotAsset)}
                              </div>
                              <div className="rounded-xl border border-white/10 bg-black/25 p-2">
                                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{t.wb_label_tail_frame || 'Tail Frame'}</div>
                                {renderUploadAssetCard(klingTailSlotAsset)}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <div className="flex gap-1.5 flex-wrap">
                                {([
                                  { id: 'flux-2-pro', label: 'Flux 2 Pro' },
                                  { id: 'flux-2-flex', label: 'Flux 2 Flex' },
                                  { id: 'gpt-image-1.5', label: 'GPT Image 1.5' },
                                ] as const).map((m) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => setImageGenModel(m.id)}
                                    className={`rounded-md px-2 py-1 text-[10px] font-bold transition border ${imageGenModel === m.id ? 'border-orange-400/60 bg-orange-500/20 text-orange-200' : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'}`}
                                  >
                                    {m.label}
                                  </button>
                                ))}
                              </div>
                              <div
                                  className="rounded-xl border border-white/10 bg-black/25 p-2 cursor-pointer"
                                  onClick={() => fileInputRef.current?.click()}
                              >
                                <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                                  <span>{t.wb_label_reference_image || '参考图'}</span>
                                  <UploadCloud className="w-3.5 h-3.5 text-zinc-500" />
                                </div>
                                {klingReferenceSlotAssets.length > 0 ? (
                                    <div className="flex flex-col gap-2 max-h-60 overflow-y-auto custom-scroll pr-1">
                                      {klingReferenceSlotAssets.map((asset) => renderUploadAssetCard(asset))}
                                    </div>
                                ) : (
                                    <div className="h-28 rounded-lg border border-dashed border-white/10 bg-black/20 flex flex-col items-center justify-center gap-2">
                                      <UploadCloud className="w-5 h-5 text-zinc-600" />
                                      <span className="text-[10px] text-zinc-500">{t.wb_kling_reference_upload_hint || 'Click to upload a product reference image'}</span>
                                    </div>
                                )}
                              </div>
                            </div>
                          )
                        ) : (
                        <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto custom-scroll pr-1">
                          <div
                              className="rounded-xl border border-white/10 bg-black/25 p-2 cursor-pointer"
                              onClick={() => fileInputRef.current?.click()}
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
                            <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                              <span>{klingGenerateMode === 'subject' ? (t.wb_label_subject_image || 'Subject') : (t.wb_label_first_frame || 'First Frame')}</span>
                              {klingPrimarySlotHint}
                            </div>
                            {klingPrimarySlotAsset ? renderUploadAssetCard(klingPrimarySlotAsset) : (
                                <div className="h-28 rounded-lg border border-dashed border-white/10 bg-black/20" />
                            )}
                          </div>
                          <div
                              className="rounded-xl border border-white/10 bg-black/25 p-2 cursor-pointer"
                              onClick={() => fileInputRef.current?.click()}
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
                            <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                              <span>{t.wb_label_reference_image || 'Reference'}</span>
                              {klingReferenceSlotHint}
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
                              <div className="absolute top-1 left-1 z-10" onClick={(e) => e.stopPropagation()}>
                                <select
                                    className="text-[9px] font-bold px-2 py-1 pr-5 rounded-full border border-white/15 bg-black/80 text-zinc-100 cursor-pointer focus:outline-none focus:border-orange-500 appearance-none shadow-sm"
                                    value={asset.materialType || (asset.mediaKind === 'video' ? 'motion' : asset.mediaKind === 'audio' ? 'audio' : 'product')}
                                    onChange={(e) => {
                                      const newType = e.target.value as AssetLibraryTab;
                                      setAssetQueue(prev => {
                                        const next = prev.map((item): QueuedAsset => item.id === asset.id ? { ...item, materialType: newType } : item);
                                        return isKlingOmniMode ? normalizeQueueSourcesForKlingMode(next, klingGenerateMode) : next;
                                      });
                                      if (selectedQueueAssetId === asset.id || uploadedFile === asset.previewUrl) {
                                        setCurrentMaterialType(newType);
                                      }
                                    }}
                                    style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23ffffff\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
                                >
                                  <option value="product">{materialTypeLabelMap['product']}</option>
                                  <option value="model">{materialTypeLabelMap['model']}</option>
                                  <option value="scene">{materialTypeLabelMap['scene']}</option>
                                  <option value="motion">{materialTypeLabelMap['motion']}</option>
                                  <option value="audio">{materialTypeLabelMap['audio']}</option>
                                </select>
                              </div>
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
                                        className={`rounded border px-1.5 py-0.5 text-[9px] font-bold transition ${
                                            selectedModel === 'sora2' || selectedModel === 'sora2pro'
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
          <div className={`grid gap-2  'grid-cols-2'`}>
            <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[10px] font-bold text-zinc-200 hover:bg-white/5"
            >
              {t.wb_btn_upload_local_asset || '从本地上传素材'}
            </button>
            <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openAssetLibraryPicker();
                }}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[10px] font-bold text-zinc-200 hover:bg-white/5"
            >
              {t.wb_btn_choose_from_library || '从素材库选择素材'}
            </button>
            <button
                type="button"
                onClick={openAiOptimizeDialog}
                className={`${isKlingOmniMode ? 'col-span-2' : 'col-span-2'} w-full rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-[10px] font-bold text-orange-200 hover:bg-orange-500/20`}
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
                  className={`rounded-lg border px-3 py-2 text-[10px] font-bold transition ${isGeneratingKlingBoundaryFrames ? 'border-orange-500/30 bg-orange-500/10 text-orange-300/70' : 'border-orange-500/60 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20'}`}
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

            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><FolderPlus className="w-3 h-3" /> {t.wb_reuse_queue}</h2>
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
                                className={`shrink-0 flex items-center gap-1 text-[9px] px-1.5 py-1 rounded border transition ${item.mediaKind === 'image' ? 'border-white/10 text-zinc-300 hover:bg-white/5 cursor-pointer' : 'border-zinc-800 text-zinc-600 cursor-not-allowed'}`}
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

          {renderLeftColumnSettings()}

          <div className="pt-1">
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
                  className={`w-full py-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 group border border-white/10 bg-black/30 text-zinc-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 ${!hasCurrentAsset ? 'opacity-40 hover:bg-black/30' : ''}`}
              >
                <Wand2 className="w-4 h-4 group-hover:rotate-12 transition" />
                {t.wb_btn_gen_scripts}
              </button>
            )}
          </div>
        </div>
    );
  };

  return (
      <div className="relative flex flex-col h-full z-10 rounded-3xl overflow-hidden border border-white/10 bg-zinc-950/80 shadow-2xl backdrop-blur-xl">
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
                  <button
                    type="button"
                    onClick={canGoToPrevProject ? goToPrevProject : undefined}
                    aria-disabled={!canGoToPrevProject}
                    className={`p-1 rounded transition ${canGoToPrevProject ? 'text-zinc-400 hover:text-white hover:bg-white/10' : 'text-zinc-400 opacity-35 cursor-not-allowed'}`}
                    title="上一项目"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <h1 className="text-xl font-bold tracking-tight text-white cursor-text" onClick={beginHeaderRename}>
                    {currentProject?.name || DEFAULT_PROJECT_NAME}
                  </h1>
                  <button
                    type="button"
                    onClick={canGoToNextProject ? goToNextProject : undefined}
                    aria-disabled={!canGoToNextProject}
                    className={`p-1 rounded transition ${canGoToNextProject ? 'text-zinc-400 hover:text-white hover:bg-white/10' : 'text-zinc-400 opacity-35 cursor-not-allowed'}`}
                    title="下一项目"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
            )}
            {ENABLE_PROMPT_LAB && (
                <>
                  <button
                      onClick={openPromptLab}
                      className="flex items-center gap-1.5 px-2 py-1 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition"
                      title="查看/编辑内置 prompts（临时功能）"
                  >
                    <FileJson className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold">Prompt</span>
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
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold">{t.wb_guide_button_label}</span>
                  </button>
                </>
            )}
          </div>
          <div className="flex items-center gap-3">
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
              <div className="fixed inset-0 z-[70] bg-black/35 backdrop-blur-[1px]" onClick={() => setIsGuideOpen(false)} />
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
                  <div className="text-sm font-bold text-orange-200">{activeGuideStep?.title}</div>
                  <div className="mt-2 text-sm text-zinc-100">{activeGuideStep?.description}</div>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
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

                <div className="mt-4 flex justify-end gap-2">
                  <button
                      className="bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-600"
                      onClick={() => setIsGuideOpen(false)}
                  >
                    {t.wb_guide_close}
                  </button>
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
                    const mediaLabel = item.mediaKind === 'video'
                      ? (t.wb_upload_video || 'Video')
                      : item.mediaKind === 'audio'
                        ? (t.wb_upload_audio || 'Audio')
                        : (t.wb_upload_image || 'Image');
                    const sourceLabel = item.source === 'history'
                      ? (t.wb_transfer_station_source_history || 'History')
                      : (t.wb_transfer_station_source_assets || 'Assets');

                    return (
                      <div key={item.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                        <button
                          type="button"
                          draggable
                          onDragStart={(event) => handleTransferStationItemDragStart(item, event)}
                          onClick={() => handleUseTransferStationItem(item)}
                          className="group flex min-w-0 flex-1 items-center gap-2 text-left"
                          title={t.wb_transfer_station_drag_hint || 'Drag to upload area, or click to apply'}
                        >
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                            {item.mediaKind === 'video' ? (
                              <video src={item.fileUrl} className="h-full w-full object-cover" muted playsInline />
                            ) : item.mediaKind === 'audio' ? (
                              <div className="flex h-full w-full items-center justify-center text-zinc-300">
                                <Music className="h-4 w-4" />
                              </div>
                            ) : (
                              <img src={item.fileUrl} alt={item.name} className="h-full w-full object-cover" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-semibold text-zinc-100">{item.name}</div>
                            <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-400">
                              <span className="rounded border border-white/10 px-1.5 py-0.5">{mediaLabel}</span>
                              <span className="rounded border border-white/10 px-1.5 py-0.5">{sourceLabel}</span>
                            </div>
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
                    <button
                        type="button"
                        onClick={() => void handleGenerateOptimizedImages()}
                        disabled={isAiOptimizeGenerating}
                        className={`px-4 py-2 rounded-lg text-sm font-bold text-white transition ${isAiOptimizeGenerating ? 'bg-orange-500/70 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'}`}
                    >
                      {isAiOptimizeGenerating
                        ? (t.wb_ai_opt_generating || '生成中...')
                        : (t.wb_ai_opt_generate_btn || '生成优化图')}
                    </button>
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
                    <button
                        type="button"
                        onClick={() => void handleBuildAiOptimizePromptScript()}
                        disabled={isAiOptimizePromptGenerating}
                        className={`text-[11px] px-2 py-1 rounded border transition ${isAiOptimizePromptGenerating ? 'border-orange-500/30 bg-orange-500/5 text-orange-200/70 cursor-not-allowed' : 'border-orange-500/60 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20'}`}
                    >
                      {isAiOptimizePromptGenerating
                        ? (t.wb_ai_opt_prompt_generating || '生成中...')
                        : (t.wb_ai_opt_build_prompt_btn || '生成提示词脚本')}
                    </button>
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
                        className="w-full h-2 bg-black/30 rounded-lg appearance-none cursor-pointer accent-orange-500"
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
                title={assetLibraryPickMode === 'background_audio' ? (t.wb_audio_picker_title || '选择音频素材') : (t.wb_dialog_choose_from_library || '从素材库选择')}
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
                {assetLibraryPickMode === 'background_audio' ? (
                  <div className="text-xs text-zinc-400 px-1">{t.wb_audio_picker_hint || '仅显示音频素材'}</div>
                ) : (
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
                )}
                <div className="flex items-center gap-2 text-xs text-zinc-500 min-w-0">
                  <button
                      type="button"
                      onClick={() => setAssetLibraryCurrentFolderId(null)}
                      className={`hover:text-white ${assetLibraryCurrentFolderId === null ? 'text-white' : ''}`}
                  >
                    {t.assets_root || '根目录'}
                  </button>
                  {assetLibraryBreadcrumb.map((folder) => (
                      <div key={folder.id} className="flex items-center gap-2 min-w-0">
                        <span>/</span>
                        <button
                            type="button"
                            onClick={() => setAssetLibraryCurrentFolderId(folder.id)}
                            className={`hover:text-white truncate ${assetLibraryCurrentFolderId === folder.id ? 'text-white' : ''}`}
                        >
                          {folder.name}
                        </button>
                      </div>
                  ))}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scroll pr-1">
                  {assetLibraryLoading ? (
                      <div className="h-52 flex items-center justify-center text-zinc-400">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载中...
                      </div>
                  ) : assetLibraryError ? (
                      <div className="h-52 flex items-center justify-center text-red-300 text-sm">
                        {assetLibraryError}
                      </div>
                  ) : assetLibraryItems.length === 0 && assetLibraryFolders.length === 0 ? (
                      <div className="h-52 flex items-center justify-center text-zinc-500 text-sm">
                        {assetLibraryPickMode === 'background_audio' ? (t.wb_audio_picker_empty || '暂无音频素材') : '暂无素材'}
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

                          return (
                            <button
                                key={asset.id}
                                type="button"
                                onClick={() => {
                                  if (alreadyAddedInSeedance) return;
                                  selectAssetFromLibraryPopup(asset);
                                }}
                                className={`text-left rounded-lg border bg-black/30 p-1 transition ${alreadyAddedInSeedance ? 'border-emerald-400/70 ring-1 ring-emerald-400/35' : 'border-white/10 hover:border-orange-500/50 hover:bg-white/5'}`}
                                title={alreadyAddedInSeedance ? (t.wb_seedance_replay_notice_duplicate_asset || 'This asset has already been added.') : undefined}
                            >
                              <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-zinc-800 relative">
                                {isKlingOmniMode && hasSubjectOtherViews(asset) && (
                                  <div className="absolute top-1.5 right-1.5 z-10 rounded-full bg-black/55 border border-white/15 p-1 text-white shadow-lg">
                                    <Layers3 className="w-3.5 h-3.5" />
                                  </div>
                                )}
                                {alreadyAddedInSeedance && (
                                  <div className="absolute left-1.5 top-1.5 z-10 rounded-full border border-emerald-400/70 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200">
                                    {t.wb_seedance_replay_added_badge || '已添加'}
                                  </div>
                                )}
                                {asset.media_kind === 'video' ? (
                                    <video src={asset.file_url} className="w-full h-full object-cover" muted playsInline />
                                ) : asset.media_kind === 'audio' ? (
                                  <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-zinc-200">
                                    <Music className="w-5 h-5" />
                                  </div>
                                ) : (
                                    <img src={asset.file_url} className="w-full h-full object-cover" alt={asset.name} />
                                )}
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

        <div ref={workspaceRowRef} className="flex-1 flex overflow-hidden p-6 gap-6" style={rowStyle}>
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
            className={`flex-auto flex flex-col gap-3 h-full min-w-[300px] ${getGuideFocusClass('scripts')}`}
          >
            <div className="flex justify-between items-center shrink-0 h-[32px]">
              <div className="flex items-center gap-3">
                <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Clapperboard className="w-3 h-3" /> {t.wb_col_scripts}</h2>
                <div className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDurationValid ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>{currentScriptDuration.toFixed(1)}s / {genDuration}s</div>
                <div className="flex items-center gap-1 ml-2 border-l border-white/10 pl-3">
                  <button
                      onClick={handleExportScripts}
                      disabled={isExporting}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded transition ${isExporting ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}
                      title={t.wb_export_scripts}
                  >
                    {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                    <span className="text-[10px] font-medium">{t.wb_export_scripts}</span>
                  </button>

                  <button
                      onClick={() => scriptFileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-2 py-1 text-zinc-500 hover:text-white hover:bg-white/5 rounded transition"
                      title={t.wb_import_scripts}
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-medium">{t.wb_import_scripts}</span>
                  </button>

                  <input
                      type="file"
                      ref={scriptFileInputRef}
                      className="hidden"
                      accept=".json"
                      onChange={handleUploadScripts}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                    onClick={() => handleScriptPageChange(activeScriptPage - 1)}
                    disabled={scriptPages.length <= 1 || activeScriptPage === 0}
                    className={`p-1 rounded border border-white/10 text-zinc-400 hover:text-white hover:border-white/30 transition ${scriptPages.length <= 1 || activeScriptPage === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <ArrowLeft className="w-3 h-3" />
                </button>

                <div className="text-[10px] text-zinc-400 border border-white/10 px-2 py-0.5 rounded">
                  {t.wb_script_page_prefix} {activeScriptPage + 1} / {Math.max(scriptPages.length, 1)}
                </div>

                <button
                    onClick={() => handleScriptPageChange(activeScriptPage + 1)}
                    disabled={scriptPages.length <= 1 || activeScriptPage === scriptPages.length - 1}
                    className={`p-1 rounded border border-white/10 text-zinc-400 hover:text-white hover:border-white/30 transition ${scriptPages.length <= 1 || activeScriptPage === scriptPages.length - 1 ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleGenerateVideo} disabled={isGenerating} className={`bg-gradient-to-r from-purple-600 to-orange-500 text-white px-4 py-1.5 rounded-lg font-bold text-xs hover:brightness-110 active:scale-95 transition flex items-center gap-2 shadow-lg shadow-orange-500/20 ${isGenerating ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}>
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4 fill-current" />}{isGenerating ? t.wb_generating : t.wb_btn_gen_video}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-4 pb-10">
              {activeScriptPlan && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-2xl relative overflow-hidden">
                    {/* 装饰性背景光晕：极微弱的紫色透出 */}
                    <div className="absolute -top-20 -right-20 w-72 h-72 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

                    {/* 头部 */}
                    <div className={`flex items-center justify-between gap-3 relative z-10 mb-6 pb-4 ${isLightTheme ? 'border-b border-slate-300/80' : 'border-b border-white/10'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                          <Sparkles className="w-4 h-4 text-purple-400" />
                        </div>
                        <div>
                          <div className={`text-[13px] font-black tracking-wider flex items-center gap-2 ${isLightTheme ? 'text-slate-900' : 'text-zinc-100'}`}>
                            {String(language || '').toLowerCase().startsWith('zh') ? '脚本方案卡' : 'Script Plan Card'}
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-normal tracking-normal ${isLightTheme
                              ? 'border border-purple-300 bg-purple-100 text-purple-800'
                              : 'border border-purple-500/30 bg-purple-500/20 text-purple-200'
                            }`}>
                              {String(language || '').toLowerCase().startsWith('zh') ? '可灵提示词' : 'Kling Prompt'}
                            </span>
                          </div>
                          <div className={`text-[10px] mt-0.5 font-medium ${isLightTheme ? 'text-slate-600' : 'text-zinc-500'}`}>{t.wb_script_page_prefix} {activeScriptPage + 1}</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 relative z-10">
                      <div className={cardThemeClass.shell}>
                        <div className={cardThemeClass.panel}>
                          <textarea
                              rows={1}
                              data-card-autosize="true"
                              value={activeScriptPlan?.creativeCardText ?? buildCreativeCardEditorText(activeCreativeCard)}
                              onChange={(e) => updateActiveCreativeCardText(e.target.value)}
                              onInput={(e) => autoResizeCardTextarea(e.currentTarget)}
                              className={`${cardThemeClass.textarea} w-full min-h-[220px]`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
              )}
              {enableStoryboardEditor ? (
                  <>
                    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <div className="text-[10px] text-zinc-400 uppercase tracking-widest">分镜结构（可编辑）</div>
                      <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setIsShotBreakdownOpen((prev) => !prev)}
                            className="text-[10px] px-2 py-1 rounded border border-white/10 text-zinc-300 hover:bg-white/5 transition"
                        >
                          {isShotBreakdownOpen ? '收起分镜' : '展开分镜'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setEnableStoryboardEditor(false); setIsShotBreakdownOpen(false); }}
                            className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-500/40 transition"
                        >
                          关闭分镜
                        </button>
                      </div>
                    </div>
                    {!isShotBreakdownOpen ? (
                        <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-[11px] text-zinc-500">
                          当前默认展示完整脚本方案。点击“展开分镜”进行镜头级精修。
                        </div>
                    ) : scripts.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-zinc-800 rounded-xl bg-black/20">
                          <FileJson className="w-10 h-10 mb-2 opacity-50" />
                          <p className="text-xs">No scripts yet.</p>
                        </div>
                    ) : (
                        scripts.map((script, index) => (
                            <div key={script.id} className={`glass-card p-4 rounded-xl group relative !border-l-2 ${index % 2 === 0 ? '!border-l-purple-500' : '!border-l-orange-500'}`}>
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                  <span className={`${index % 2 === 0 ? 'bg-purple-600' : 'bg-orange-500'} text-black text-[10px] font-bold px-1.5 py-0.5 rounded-sm`}>{t.wb_shot} {script.shot}</span>
                                  <select
                                      value={script.type}
                                      onChange={(e) => handleScriptTypeChange(script.id, e.target.value)}
                                      className="text-[10px] text-zinc-300 border border-white/10 px-1.5 py-0.5 rounded bg-black/40 focus:outline-none focus:border-orange-500"
                                      title={t.wb_shot_type_label || '镜头类型'}
                                  >
                                    {shotTypeOptions.map((option) => (
                                        <option key={option.value} value={option.value} className="bg-black text-zinc-100">
                                          {option.label}
                                        </option>
                                    ))}
                                  </select>
                                  <input type="number" min={0.1} step="0.1" className="w-8 bg-transparent text-[10px] text-zinc-300 text-right" value={parseFloat(script.dur.replace('s',''))} onChange={(e) => handleDurationChange(script.id, e.target.value)} />
                                  <span className="text-[10px] text-zinc-500">s</span>
                                </div>
                                <button onClick={() => removeScript(script.id)} className="text-zinc-600 hover:text-red-500 transition p-1"><X className="w-3.5 h-3.5" /></button>
                              </div>
                              <div className="grid grid-cols-1 gap-3">
                                <div className="flex flex-col gap-1.5">
                                  <p className="text-[10px] text-zinc-500 uppercase font-bold ml-1">{t.wb_visual}</p>
                                  <textarea className="w-full bg-black/20 text-xs text-zinc-300 p-3 rounded-lg border border-white/5 resize-none min-h-[60px] focus:border-white/20 transition-colors outline-none custom-scroll" value={script.visual} onChange={(e) => { const ns = [...scripts]; ns[index].visual = e.target.value; updateScripts(ns); }} />
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
                                        const ns = [...scripts];
                                        ns[index].audio = e.target.value;
                                        updateScripts(ns);
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
                                          {/* 悬浮弹出菜单：直接翻译 / 创意翻译 */}
                                          {!translatingShots[script.id] && script.audioTranslation?.trim() && (
                                            <div className="absolute right-0 top-full pt-1 hidden group-hover/translate:flex flex-col z-50 min-w-[160px]">
                                            <div className="flex flex-col gap-1 bg-zinc-900 border border-white/10 rounded-lg p-2 shadow-xl">
                                              <button
                                                type="button"
                                                className="flex items-center justify-between gap-2 text-[11px] text-zinc-300 hover:text-orange-400 px-2 py-1.5 rounded hover:bg-white/5 transition whitespace-nowrap"
                                                onClick={() => handleTranslateShot(script, index, 'direct')}
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
                                                onClick={() => handleTranslateShot(script, index, 'creative')}
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
                                        const ns = [...scripts];
                                        ns[index].audioTranslation = e.target.value;
                                        updateScripts(ns);
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                        ))
                    )}
                    {isShotBreakdownOpen && (
                        <button onClick={addScript} className="w-full py-4 border border-dashed border-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 hover:text-orange-500 gap-2"><Plus className="w-4 h-4" /><span className="text-xs font-bold">{t.wb_btn_add_shot}</span></button>
                    )}
                  </>
              ) : (
                  <>
                  <div className="flex items-center justify-between rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-3">
                    <span className="text-[11px] text-zinc-500">{t.wb_storyboard_master_mode_hint}</span>
                    <button
                        type="button"
                        onClick={() => setEnableStoryboardEditor(true)}
                        className="text-[10px] px-2.5 py-1 rounded border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 transition whitespace-nowrap"
                    >
                      {t.wb_enable_storyboard}
                    </button>
                  </div>
                  {!isShotBreakdownOpen ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-[11px] text-zinc-500">
                      {t.wb_storyboard_hint_default_master}
                    </div>
                  ) : scripts.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-zinc-800 rounded-xl bg-black/20">
                      <FileJson className="w-10 h-10 mb-2 opacity-50" />
                      <p className="text-xs">{t.wb_empty_scripts}</p>
                    </div>
                  ) : (
                    scripts.map((script, index) => (
                      <div key={script.id} className={`glass-card p-4 rounded-xl group relative !border-l-2 ${index % 2 === 0 ? '!border-l-purple-500' : '!border-l-orange-500'}`}>
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2">
                                <span className={`${index % 2 === 0 ? 'bg-purple-600' : 'bg-orange-500'} text-black text-[10px] font-bold px-1.5 py-0.5 rounded-sm`}>{t.wb_shot} {script.shot}</span>
                                <select
                                  value={script.type}
                                  onChange={(e) => handleScriptTypeChange(script.id, e.target.value)}
                                  className="text-[10px] text-zinc-300 border border-white/10 px-1.5 py-0.5 rounded bg-black/40 focus:outline-none focus:border-orange-500"
                                  title={t.wb_shot_type_label || '镜头类型'}
                                >
                                  {shotTypeOptions.map((option) => (
                                    <option key={option.value} value={option.value} className="bg-black text-zinc-100">
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                <input type="number" min={0.1} step="0.1" className="w-8 bg-transparent text-[10px] text-zinc-300 text-right" value={parseFloat(script.dur.replace('s',''))} onChange={(e) => handleDurationChange(script.id, e.target.value)} />
                                <span className="text-[10px] text-zinc-500">s</span>
                              </div>
                              <button onClick={() => removeScript(script.id)} className="text-zinc-600 hover:text-red-500 transition p-1"><X className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                              <div className="flex flex-col gap-1.5">
                                <p className="text-[10px] text-zinc-500 uppercase font-bold ml-1">{t.wb_visual}</p>
                                <textarea className="w-full bg-black/20 text-xs text-zinc-300 p-3 rounded-lg border border-white/5 resize-none min-h-[60px] focus:border-white/20 transition-colors outline-none custom-scroll" value={script.visual} onChange={(e) => { const ns = [...scripts]; ns[index].visual = e.target.value; updateScripts(ns); }} />
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
                                    const ns = [...scripts];
                                    ns[index].audio = e.target.value;
                                    updateScripts(ns);
                                  }}
                                />
                            </div>
                        </div>
                      </div>
                    ))
                  )}
                  {isShotBreakdownOpen && (
                    <button onClick={addScript} className="w-full py-4 border border-dashed border-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 hover:text-orange-500 gap-2"><Plus className="w-4 h-4" /><span className="text-xs font-bold">{t.wb_btn_add_shot}</span></button>
                  )}
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
            <div className="flex justify-between items-end shrink-0 h-[32px]">
              <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><MonitorPlay className="w-3 h-3" /> {t.wb_col_preview}</h2>
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

            <div className="glass-panel rounded-2xl p-3 border border-white/5 flex items-center justify-between">
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest">{t.wb_tiktok_draft_title}</div>
              <button
                  onClick={handlePublishToTikTok}
                  disabled={!generatedVideoUrl || isPostingTikTok}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-2 transition border border-white/10 ${(!generatedVideoUrl || isPostingTikTok) ? 'opacity-40 cursor-not-allowed text-zinc-500' : 'text-white bg-gradient-to-r from-purple-600 to-orange-500 hover:brightness-110'}`}
              >
                {isPostingTikTok ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {isPostingTikTok ? t.wb_tiktok_uploading : t.wb_btn_tiktok_draft}
              </button>
            </div>

            <div className="glass-panel rounded-2xl p-4 border border-white/5 max-h-56 overflow-y-auto custom-scroll">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">{t.wb_batch_results}</div>
              {generatedBatch.length === 0 ? <div className="text-[10px] text-zinc-600">{t.wb_batch_no_results}</div> : <div className="space-y-2">{generatedBatch.map(item => {
                const task = tasks.find(t => t.id === item.taskId);
                const status = task?.status;
                const url = task?.result?.video_url || task?.result?.url;
                return (<div key={item.id} className="flex items-center justify-between gap-2 text-[10px]"><span className="truncate text-zinc-300">{item.assetName} × {item.scriptName}</span>{status === 'success' && url ? (<button onClick={() => setGeneratedVideoUrl(url)} className="text-orange-400 hover:text-orange-300 transition">预览</button>) : status === 'failed' ? (<span className="text-red-400">失败</span>) : (<span className="text-zinc-500">生成中…</span>)}</div>);
              })}</div>}
            </div>
          </div>
        </div>
      </div>
  );
};
