import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UploadCloud, Plus, X, CheckCircle, FolderPlus, Folder,
  Wand2, Loader2, Clapperboard, FileDown, FileUp, ArrowLeft, ArrowRight, PlayCircle,
  MonitorPlay, Film, SkipBack, Play, Pause, SkipForward, FileJson, Send, Cpu,
  Zap, Layers, Layers3, Video, Lock, Info, Check, Sparkles, List, MoreHorizontal, Pencil, Trash2, Gift, ImagePlus,
  SlidersHorizontal,Palette, MapPin, Activity, Camera, Lightbulb, Music, Scissors, Megaphone, AlignLeft,
  Languages, HelpCircle, AlertCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight
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
import { getWorkbenchPreferences, setWorkbenchPreferences } from '../../utils/preferences';
import { type ReplayReusePayload } from './ReplayScriptView';

const ENABLE_PROMPT_LAB = true;
const ENABLE_STORYBOARD_PROMPT = false;
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

type ReferenceSummaryItem = {
  type: 'model' | 'product' | 'scene';
  keywords: string[];
};

type ScriptPage = {
  id: string;
  name: string;
  scripts: ScriptItem[];
  referenceSummary?: ReferenceSummaryItem[];
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
};

type AssetLibraryTab = 'product' | 'model' | 'scene' | 'motion';
type AiOptimizeResolution = 'sd' | 'hd' | 'uhd';

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
  aspect_ratio?: '9:16' | '16:9' | '1:1';
  mode?: 'pro' | 'std';
  user_language: string;
  target_language: string;
  model_asset_id: string | number | null;
  motion_asset_id: string | number | null;
  negative_prompt?: string;
  [key: string]: unknown;
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
  aspectRatio: '9:16' | '16:9' | '1:1';
  hasAiRecognized: boolean;
  genPrompt: string;
  genDuration: number;
  soundSetting: 'on' | 'off';
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
  aspectRatio: prefs.aspectRatio === '16:9' ? '16:9' : (prefs.aspectRatio === '1:1' ? '1:1' : '9:16'),
    hasAiRecognized: false,
    genPrompt: '',
    genDuration: prefs.genDuration || 10,
    soundSetting: prefs.soundSetting === 'off' ? 'off' : 'on',
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
  onInitialLibraryAssetHandled?: () => void;
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
                                                              onInitialLibraryAssetHandled,
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
  const { user } = useAuth();
  const { tasks, addTask } = useTasks();
  const { model: selectedModel, setModel: setSelectedModel } = useWorkbenchModel();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scriptFileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const modeSectionRef = useRef<HTMLDivElement | null>(null);
  const uploadSectionRef = useRef<HTMLDivElement | null>(null);
  const configSectionRef = useRef<HTMLDivElement | null>(null);
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
  const [isDragUploadActive, setIsDragUploadActive] = useState(false);
  const [selectedAssetUrl, setSelectedAssetUrl] = useState<string | null>(initialFileUrl || null);
  const [lastUploadedUrl, setLastUploadedUrl] = useState<string | null>(initialFileUrl || null);
  const [lastGeneratedProjectId, setLastGeneratedProjectId] = useState<string | null>(null);
  const [previewProjectId, setPreviewProjectId] = useState<string | null>(null);
  const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false);
  const [assetLibraryTab, setAssetLibraryTab] = useState<AssetLibraryTab>('product');
  const [assetLibraryItems, setAssetLibraryItems] = useState<LibraryAsset[]>([]);
  const [assetLibraryFolders, setAssetLibraryFolders] = useState<AssetFolder[]>([]);
  const [assetLibraryBreadcrumb, setAssetLibraryBreadcrumb] = useState<AssetFolder[]>([]);
  const [assetLibraryCurrentFolderId, setAssetLibraryCurrentFolderId] = useState<string | null>(null);
  const [assetLibraryLoading, setAssetLibraryLoading] = useState(false);
  const [assetLibraryError, setAssetLibraryError] = useState<string | null>(null);
  const [draggingWorkbenchAssetId, setDraggingWorkbenchAssetId] = useState<string | null>(null);
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
    return numeric === 5 || numeric === 10 || numeric === 15 ? numeric : 10;
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
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>(() => (
    initialPrefs.aspectRatio === '16:9' ? '16:9' : (initialPrefs.aspectRatio === '1:1' ? '1:1' : '9:16')
  ));
  const [requiredErrors, setRequiredErrors] = useState<{
    productName?: string;
    productCategory?: string;
    coreSellingPoints?: string;
    videoType?: string;
  }>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!replayReusePayload) return;
    const nextCategory = String(replayReusePayload.productCategory || '').trim();
    const nextSellingPoints = String(replayReusePayload.coreSellingPoints || '').trim();
    const nextPrompt = String(replayReusePayload.prompt || '').trim();

    if (nextCategory) setProductCategory(nextCategory);
    if (nextSellingPoints) setCoreSellingPoints(nextSellingPoints);
    if (nextPrompt) setGenPrompt(nextPrompt);
    setCreationMode('replay');
    setSelectedModel('seedance2.0');

    setToastMessage(t.wb_replay_applied_to_workbench || '复刻结果已带入工作台，可继续上传图片并生成新脚本。');
    onReplayReusePayloadHandled?.();
  }, [onReplayReusePayloadHandled, replayReusePayload, setSelectedModel, t.wb_replay_applied_to_workbench]);

  const productNameFieldRef = useRef<HTMLInputElement | null>(null);
  const productCategoryFieldRef = useRef<HTMLDivElement | null>(null);
  const coreSellingPointsFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const videoTypeFieldRef = useRef<HTMLDivElement | null>(null);
  const [genPrompt, setGenPrompt] = useState('');
  const [genDuration, setGenDuration] = useState<number>(() => normalizeDurationForModel(initialPrefs.genDuration ?? selectedTemplate?.duration ?? 10, selectedModel));
  const [soundSetting, setSoundSetting] = useState<'on' | 'off'>(() => (initialPrefs.soundSetting === 'off' ? 'off' : 'on'));
  const [scriptVariantCount, setScriptVariantCount] = useState<number>(() =>
    typeof initialPrefs.scriptVariantCount === 'number' && initialPrefs.scriptVariantCount > 0 ? initialPrefs.scriptVariantCount : 1
  );
  const [targetLanguage, setTargetLanguage] = useState<string>(() => initialPrefs.targetLanguage || 'en');
  const [translatingShots, setTranslatingShots] = useState<Record<number, boolean>>({});
  const [creationMode, setCreationMode] = useState<'fast' | 'replay'>(() => (initialPrefs.creationMode === 'replay' ? 'replay' : 'fast'));
  const [reuseQueueEnabled, setReuseQueueEnabled] = useState(false);
  const [isModelSectionCollapsed, setIsModelSectionCollapsed] = useState(false);
  const [isAiRecognizing, setIsAiRecognizing] = useState(false);
  const [hasAiRecognized, setHasAiRecognized] = useState(false);
  const lastRecognizedSignatureRef = useRef<string>('');
  const isAutoRecognizePromptingRef = useRef(false);
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
  const [isShotBreakdownOpen, setIsShotBreakdownOpen] = useState(false);
  const [enableStoryboardEditor, setEnableStoryboardEditor] = useState(false);

  const [assetQueue, setAssetQueue] = useState<QueuedAsset[]>([]);
  const [scriptQueue, setScriptQueue] = useState<QueuedScript[]>([]);
  const [currentMaterialType, setCurrentMaterialType] = useState<AssetLibraryTab | null>(null);
  const [generatedBatch, setGeneratedBatch] = useState<Array<{ id: string; assetName: string; scriptName: string; taskId: string | number }>>([]);
  const [selectedQueueAssetId, setSelectedQueueAssetId] = useState<string | null>(null);
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
  const [aiOptimizeResults, setAiOptimizeResults] = useState<Array<{ id: string; url: string }>>([]);
  const [projectStore, setProjectStore] = useState<LocalProjectStore>(() => loadLocalProjectStore(user?.id ?? null));
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [isTaskQueueOpen, setIsTaskQueueOpen] = useState(false);
  const taskQueueButtonRef = useRef<HTMLButtonElement | null>(null);
  const taskQueuePanelRef = useRef<HTMLDivElement | null>(null);
  const [taskQueueNowTs, setTaskQueueNowTs] = useState<number>(Date.now());
  const taskQueueTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isCompletedCollapsed, setIsCompletedCollapsed] = useState(true);
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
    setAspectRatio(
      workspace.aspectRatio === '16:9'
        ? '16:9'
        : (workspace.aspectRatio === '1:1'
          ? '1:1'
          : (initialPrefs.aspectRatio === '16:9' ? '16:9' : (initialPrefs.aspectRatio === '1:1' ? '1:1' : '9:16')))
    );
    setHasAiRecognized(!!workspace.hasAiRecognized);
    setGenPrompt(workspace.genPrompt || '');
    setGenDuration(normalizeDurationForModel(
      workspace.genDuration ?? initialPrefs.genDuration ?? 10,
      restoredModelId
    ));
    setSoundSetting(workspace.soundSetting || (initialPrefs.soundSetting === 'off' ? 'off' : 'on'));
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

  useEffect(() => {
    if (!initialLibraryAsset || !initialLibraryAssetToken) return;
    if (isRestoring) return;
    if (injectedAssetSignaturesRef.current.has(initialLibraryAssetToken)) return;
    injectedAssetSignaturesRef.current.add(initialLibraryAssetToken);
    queueLibraryAssetIntoWorkbench(initialLibraryAsset, { preferLastModeRouting: true });
    onInitialLibraryAssetHandled?.();
  }, [initialLibraryAsset, initialLibraryAssetToken, isRestoring, onInitialLibraryAssetHandled, queueLibraryAssetIntoWorkbench]);

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
  }, [projectStore.currentProjectId, applyWorkspaceState, buildDemoScripts, t.wb_script_page_prefix]);

  useEffect(() => {
    localStorage.setItem(getLocalProjectStoreKey(user?.id ?? null), JSON.stringify(projectStore));
    window.dispatchEvent(new CustomEvent('vflow-workbench-projects-updated'));
  }, [projectStore, user?.id]);

  useEffect(() => {
    setProjectStore(loadLocalProjectStore(user?.id ?? null));
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
      genPrompt,
      genDuration,
      soundSetting,
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
    genPrompt,
    genDuration,
    soundSetting,
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
          setAssetLibraryItems(Array.isArray(items) ? items : []);
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
  }, [assetLibraryCurrentFolderId, assetLibraryTab, isAssetLibraryOpen]);

  const openAssetLibraryPicker = () => {
    setAssetLibraryTab(currentAssetMediaKind === 'video' ? 'motion' : 'product');
    setAssetLibraryCurrentFolderId(null);
    setIsAssetLibraryOpen(true);
  };
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

  const buildQueuedAssetFromLibrary = useCallback((asset: LibraryAsset, options?: { preferLastModeRouting?: boolean }): QueuedAsset | null => {
    const assetUrl = asset.file_url || null;
    if (!assetUrl) return null;

    const materialType: AssetLibraryTab = asset.media_kind === 'video'
      ? 'motion'
      : (asset.type === 'model' || asset.type === 'product' || asset.type === 'scene' || asset.type === 'motion'
        ? asset.type
        : 'product');
    const mediaKind: QueuedAsset['mediaKind'] =
      asset.media_kind === 'video'
        ? 'video'
        : asset.media_kind === 'audio'
          ? 'audio'
          : (asset.media_kind === 'image' ? 'image' : inferMediaKind({ name: asset.name || '', url: assetUrl }));

    let source: QueuedAsset['source'] = mediaKind === 'video' ? 'preference' : 'product';
    if (options?.preferLastModeRouting) {
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

  function queueLibraryAssetIntoWorkbench(asset: LibraryAsset, options?: { preferLastModeRouting?: boolean }) {
    const queuedAsset = buildQueuedAssetFromLibrary(asset, options);
    const assetUrl = queuedAsset?.assetUrl || null;
    if (!queuedAsset || !assetUrl) return null;

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
  const AUDIO_EXTS = ['mp3', 'wav', 'flac'];
  const imageFormats = IMAGE_EXTS.join('/');
  const videoFormats = VIDEO_EXTS.join('/');
  const audioFormats = AUDIO_EXTS.join('/');
  const formatHint = `图片(${imageFormats}) 视频(${videoFormats}) 音频(${audioFormats}) · ≤1GB`;
  const isBatchDebugMode = reuseQueueEnabled && hasAnyReuseQueue;
  const materialTypeLabelMap: Record<AssetLibraryTab, string> = {
    product: t.assets_tab_products || '商品',
    model: t.assets_tab_models || '模特',
    scene: t.assets_tab_scenes || '场景',
    motion: t.assets_tab_motion || '动作',
  };
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
      materialType: currentMaterialType || (currentAssetMediaKind === 'video' ? 'motion' : 'product'),
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
    setAiOptimizeAspectRatio(aspectRatio);
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
        output_language: language,
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
        openInfo(popupTitles.error, err?.message || t.wb_ai_opt_generate_failed || '图片优化失败，请稍后重试。');
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
    language,
    openInfo,
    popupTitles.error,
    popupTitles.notice,
    resolveAiOptimizeReferencePath,
    t.wb_ai_opt_backend_not_ready,
    t.wb_ai_opt_generate_failed,
    t.wb_ai_opt_need_image,
    t.wb_ai_opt_need_prompt,
    t.wb_ai_opt_no_result,
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
    if (source === 'tail') return 'Tail Frame';
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
        if ((wantsPrimary || !primaryAssigned) && !primaryAssigned) {
          primaryAssigned = true;
          return { ...item, source: 'product', isPrimaryFrame: true };
        }
        const wantsTail = item.source === 'tail';
        if ((wantsTail || !tailAssigned) && !tailAssigned) {
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
      const hasPrimary = existing.some((item) => item.mediaKind === 'image' && item.source === 'product');
      if (!hasPrimary) return 'product';
      const hasTail = existing.some((item) => item.mediaKind === 'image' && item.source === 'tail');
      if (!hasTail) return 'tail';
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
  const referencePreviewAssetsByType = useMemo(() => {
    const next: Partial<Record<'model' | 'product' | 'scene', QueuedAsset>> = {};
    for (const asset of uploadDisplayAssets) {
      if (asset.materialType !== 'model' && asset.materialType !== 'product' && asset.materialType !== 'scene') continue;
      next[asset.materialType] = asset;
    }
    return next;
  }, [uploadDisplayAssets]);
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
  const activeReferenceSummary = activeScriptPlan?.referenceSummary || [];
  const activeFullScript = activeScriptPlan?.fullScript || '';
  const activeCreativeCard = activeScriptPlan?.creativeCard;
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

  const hasActiveScriptConcept = Boolean((activeFullScript || '').trim()) || hasCreativeCardContent(activeCreativeCard);

  const buildCombinedScriptPrompt = (fullScript: string, card?: ScriptCreativeCard, inputScripts: ScriptItem[] = []) => {
    const creativeCardPrompt = buildCreativeCardPrompt(card);
    const masterScriptPrompt = (fullScript || '').trim() ? `[完整脚本]: ${(fullScript || '').trim()}` : '';
    const shotPrompt = inputScripts.map((script) => {
      const audioMarker = (soundSetting === 'on' && script.audio) ? `【音频|【[旁白]】${script.audio}】` : '';
      return `${script.visual || ''} ${audioMarker}`.trim();
    }).join(' ');
    const basePrompt = [masterScriptPrompt, creativeCardPrompt].filter(Boolean).join('\n\n');
    if (ENABLE_STORYBOARD_PROMPT && shotPrompt) {
      if (basePrompt) return `${basePrompt}\n\n[分镜指引]: ${shotPrompt}`;
      return `[分镜指引]: ${shotPrompt}`;
    }
    return basePrompt || shotPrompt;
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
    pushLine(t.wb_field_additional_requirements_label, genPrompt);

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

  const productImageSignature = useMemo(() => {
    const sources = getProductRecognitionSources();
    return sources
        .map((asset) => {
          if (asset.id) return String(asset.id);
          if (asset.fileObj) {
            return `${asset.fileObj.name}:${asset.fileObj.size}:${asset.fileObj.lastModified}`;
          }
          return String(asset.assetUrl || asset.previewUrl || '');
        })
        .filter(Boolean)
        .join('|');
  }, [getProductRecognitionSources]);

  const handleAiRecognize = useCallback(
      async (opts?: { skipOverwriteConfirm?: boolean }) => {
        if (!user?.id) {
          openInfo(popupTitles.notice, t.wb_popup_not_logged_in);
          return;
        }

        const imagePaths = await resolveProductRecognitionImagePaths();
        if (imagePaths.length === 0) {
          openInfo(popupTitles.notice, t.wb_popup_need_product_image_first);
          return;
        }

        const signature = imagePaths.join('|');

        const hasManualInput =
            (productInfoTouched.name && productName.trim()) ||
            (productInfoTouched.category && productCategory.trim()) ||
            (productInfoTouched.sellingPoints && coreSellingPoints.trim()) ||
            (productInfoTouched.audience && targetAudience.trim());

        if (!opts?.skipOverwriteConfirm && hasManualInput) {
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

          setHasAiRecognized(true);
          lastRecognizedSignatureRef.current = productImageSignature || signature;
        } catch (err: any) {
          openInfo(popupTitles.error, t.wb_ai_recognize_failed);
        } finally {
          setIsAiRecognizing(false);
        }
      },
      [
        coreSellingPoints,
        openConfirm,
        openInfo,
        productCategory,
        productImageSignature,
        productInfoTouched,
        productName,
        resolveProductRecognitionImagePaths,
        targetAudience,
        user?.id,
        t,
        language
      ]
  );

  useEffect(() => {
    if (isAiRecognizing) return;

    if (!productImageSignature) {
      lastRecognizedSignatureRef.current = '';
      return;
    }

    // Skip auto re-prompt during project workspace application or explicit project switching
    if (isApplyingProjectWorkspaceRef.current || isSwitchingProjectRef.current) {
      lastRecognizedSignatureRef.current = productImageSignature;
      return;
    }

    const prevSignature = lastRecognizedSignatureRef.current;

    if (!prevSignature) {
      lastRecognizedSignatureRef.current = productImageSignature;
      return;
    }

    if (prevSignature === productImageSignature) return;
    if (isAutoRecognizePromptingRef.current) return;

    isAutoRecognizePromptingRef.current = true;
    void (async () => {
      const ok = await openConfirm(t.wb_ai_reprompt_title, t.wb_ai_reprompt_message, {
        okLabel: t.wb_ai_reprompt_confirm_ok,
        cancelLabel: t.wb_ai_reprompt_confirm_cancel,
      });
      isAutoRecognizePromptingRef.current = false;

      if (!ok) {
        lastRecognizedSignatureRef.current = productImageSignature;
        return;
      }

      await handleAiRecognize({ skipOverwriteConfirm: true });
      lastRecognizedSignatureRef.current = productImageSignature;
    })();
  }, [handleAiRecognize, isAiRecognizing, openConfirm, productImageSignature, t]);

  const handleGenerateKlingBoundaryFrames = async () => {
    if (selectedModel !== 'kling') return;
    if (isGeneratingKlingBoundaryFrames) return;

    const imageAssets = uploadDisplayAssets.filter((asset) => asset.mediaKind === 'image');
    if (imageAssets.length === 0) {
      openInfo(popupTitles.notice, '请先上传至少 1 张参考图，再生成首尾帧');
      return;
    }

    setIsGeneratingKlingBoundaryFrames(true);
    try {
      const projectId = await ensureSingleProjectId();
      const resolvedImagePaths: string[] = [];
      for (const asset of imageAssets) {
        let path = asset.uploadedPath || asset.assetUrl || null;
        if (!path && asset.fileObj) {
          const uploadResp = await assetsApi.uploadTempAsset(asset.fileObj);
          path = extractUploadedAssetPath(uploadResp);
        }
        if (path) resolvedImagePaths.push(path);
      }

      if (resolvedImagePaths.length === 0) {
        throw new Error('参考图上传失败，请重试');
      }

      const basePrompt = buildCombinedScriptPrompt(activeFullScript, activeCreativeCard, scripts).trim()
        || coreSellingPoints.trim()
        || productName.trim()
        || '电商商品短视频';

      const [firstResp, lastResp] = await Promise.all([
        videoApi.generateFusionImage({
          project_id: projectId,
          image_paths: resolvedImagePaths,
          prompt: `${basePrompt}，生成视频开场首帧，主体清晰，构图完整，画面稳定`,
          aspect_ratio: aspectRatio,
          resolution: '2K',
        }),
        videoApi.generateFusionImage({
          project_id: projectId,
          image_paths: resolvedImagePaths,
          prompt: `${basePrompt}，生成视频结束尾帧，动作收束，主体清晰，构图完整`,
          aspect_ratio: aspectRatio,
          resolution: '2K',
        }),
      ]);

      const firstPath = String(firstResp?.data?.image_url || firstResp?.image_url || '').trim();
      const lastPath = String(lastResp?.data?.image_url || lastResp?.image_url || '').trim();
      if (!firstPath || !lastPath) {
        throw new Error('生图成功但未返回首尾帧地址');
      }

      const firstDisplay = toDisplayUrl(firstPath) || firstPath;
      const lastDisplay = toDisplayUrl(lastPath) || lastPath;
      const firstId = `kling-first-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const lastId = `kling-tail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      setKlingGenerateMode('first_last_frame');
      setAssetQueue((prev) => {
        const demoted = prev.map((item): QueuedAsset => (
          item.mediaKind === 'image' ? { ...item, source: 'preference', isPrimaryFrame: false } : item
        ));
        const next: QueuedAsset[] = [
          ...demoted,
          {
            id: firstId,
            name: 'AI首帧图',
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
            name: 'AI尾帧图',
            previewUrl: lastDisplay,
            fileObj: null,
            assetUrl: lastPath,
            source: 'tail',
            materialType: 'product',
            isPrimaryFrame: false,
            mediaKind: 'image',
            uploadedPath: lastPath,
          },
        ];
        return normalizeQueueSourcesForKlingMode(next, 'first_last_frame');
      });

      setSelectedQueueAssetId(firstId);
      setUploadedFile(firstDisplay);
      setFileName('AI首帧图');
      setSelectedFileObj(null);
      setSelectedAssetUrl(firstPath);
      setSelectedAssetSource('product');
      setCurrentMaterialType('product');
      setLastUploadedUrl(firstPath);
      openInfo(popupTitles.success, '已生成并写入首尾帧，可直接用于可灵首尾帧模式');
    } catch (err) {
      openInfo(popupTitles.error, formatWorkbenchError(err, '首尾帧生成失败'));
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
        throw new Error('可灵首帧模式需要且仅允许 1 张首帧图');
      }
      if (klingGenerateMode === 'subject' && subjectCount !== 1) {
        throw new Error('可灵主体模式仅允许不多于 1 张主体图');
      }
      if (klingGenerateMode === 'first_last_frame' && firstFrameCount !== 1) {
        throw new Error('可灵首尾帧模式需要且仅允许 1 张首帧图');
      }
      if (klingGenerateMode === 'first_last_frame' && tailFrameCount !== 1) {
        throw new Error('可灵首尾帧模式需要且仅允许 1 张尾帧图');
      }

      if (klingGenerateMode === 'subject' && referenceCount < 1) {
        throw new Error('可灵主体模式需要再提供 1 到 3 张其他参考图');
      }
      if (klingGenerateMode === 'subject' && referenceCount > 3) {
        throw new Error('可灵主体模式最多只允许 3 张其他参考图');
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
        prompt: buildCombinedScriptPrompt(activeFullScript, activeCreativeCard, scripts),
        product_name: productName,
        duration: genDuration,
        sound: 'off',
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

    const apiPath = await resolveCurrentSingleAssetPath();
    const payload: GeneratePayload = {
      model: backendModel,
      prompt: buildCombinedScriptPrompt(activeFullScript, activeCreativeCard, scripts),
      product_name: productName,
      duration: genDuration,
      sound: soundSetting,
      asset_source: selectedAssetSource,
      user_language: language,
      target_language: targetLanguage,
      model_asset_id: selectedTemplate?.default_model_asset?.id ?? null,
      motion_asset_id: currentAssetMediaKind === 'video' ? null : (selectedTemplate?.default_motion_asset?.id ?? null),
      ...(promptOverridesPayload ? { prompt_overrides: promptOverridesPayload } : {}),
    };

    if (apiPath) {
      if (currentAssetMediaKind === 'video') payload.motion_video_path = apiPath;
      else payload.image_path = apiPath;
    }

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
      addTask({
        id: taskId,
        projectId,
        workbenchProjectId: projectStore.currentProjectId,
        type: 'video_generation',
        status: 'processing',
        name: `${(productName || '').trim() || fileName || scriptPages[activeScriptPage]?.name || selectedTemplate?.name || 'Video'}`,
        thumbnail: uploadedFile || undefined,
        createdAt: Date.now(),
      });
      setLastGeneratedProjectId(projectId);
      openInfo(popupTitles.success, t.wb_popup_submit_success);
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
      if (err.trackingId) {
        return `${base}\nTracking ID: ${err.trackingId}`;
      }
      return base;
    }
    const raw = (err as any)?.message;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    return fallback;
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
      openInfo(popupTitles.error, formatWorkbenchError(err, t.wb_popup_generation_failed));
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
      openInfo(popupTitles.error, t.wb_debug_invalid_json);
      return;
    }

    setIsPreparingDebug(true);
    try {
      const preview = await refreshDebugPreview(parsed);
      setDebugPayloadText(JSON.stringify(preview.request_payload || parsed, null, 2));
    } catch (err: any) {
      openInfo(popupTitles.error, formatWorkbenchError(err, t.wb_popup_generation_failed));
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
      openInfo(popupTitles.error, t.wb_debug_invalid_json);
      return;
    }

    setIsSendingDebug(true);
    setGeneratedVideoUrl(null);
    try {
      await submitSingleGeneration(parsed);
    } catch (err: any) {
      openInfo(popupTitles.error, formatWorkbenchError(err, t.wb_popup_generation_failed));
    } finally {
      setIsSendingDebug(false);
    }
  };

  const validateUploadFile = (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) return `${t.assets_upload_error_too_large || '文件过大'}：${file.name}（>1GB）`;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = IMAGE_EXTS.includes(ext);
    const isVideo = VIDEO_EXTS.includes(ext);
    const isAudio = AUDIO_EXTS.includes(ext);

    if (!isImage && !isVideo && !isAudio) return `${t.assets_upload_error_unsupported || '格式不支持'}：${file.name}`;
    return null;
  };

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

    void (async () => {
      try {
        const uploadResp = await assetsApi.uploadTempAsset(latestFile);
        const rawPath = extractUploadedAssetPath(uploadResp);
        if (!rawPath) return;

        const displayUrl = toDisplayUrl(rawPath);

        setAssetQueue((prev) => prev.map((item) => (
            item.id === latestItem.id
                ? { ...item, uploadedPath: rawPath, previewUrl: displayUrl || item.previewUrl, fileObj: null }
                : item
        )));

        setLastUploadedUrl(rawPath);
        setSelectedFileObj(null);
        setUploadedFile((prev) => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
          return displayUrl || prev;
        });
      } catch {
        void 0;
      }
    })();

    void (async () => {
      try {
        const uploadResp = await assetsApi.uploadTempAsset(latestFile);
        const persistedPath = extractUploadedAssetPath(uploadResp);
        if (!persistedPath) return;

        setAssetQueue(prev => prev.map(item => (
            item.id === queueId
                ? {
                  ...item,
                  previewUrl: persistedPath,
                  assetUrl: persistedPath,
                  uploadedPath: persistedPath,
                }
                : item
        )));

        setUploadedFile((prev) => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
          return persistedPath;
        });
        setSelectedAssetUrl(persistedPath);
        setLastUploadedUrl(persistedPath);
      } catch (err) {
        console.warn('Failed to persist local upload for preview:', err);
      }
    })();
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

    const firstMediaKind = inferMediaKind({ name: validFiles[0].name, file: validFiles[0] });
    const defaultType = firstMediaKind === 'video' ? 'motion' : 'product';
    applySelectedUploadType(validFiles, defaultType);
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
    if (!e.dataTransfer.types?.includes('Files')) return;
    e.preventDefault();
    setIsDragUploadActive(true);
  };

  const handleUploadDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types?.includes('Files')) return;
    e.preventDefault();
    setIsDragUploadActive(false);
  };

  const handleUploadDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types?.includes('Files')) return;
    e.preventDefault();
    setIsDragUploadActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    handleLocalFiles(files);
  };

  const removeUpload = (e: React.MouseEvent, assetId?: string) => {
    e.stopPropagation();

    const removeTargetId = assetId || selectedQueueAssetId;
    if (removeTargetId) {
      const nextQueue = assetQueue.filter((item) => item.id !== removeTargetId);
      setAssetQueue(nextQueue);

      const fallback = nextQueue[0] || null;
      if (fallback) {
        setSelectedQueueAssetId(fallback.id);
        setUploadedFile(fallback.previewUrl || null);
        setSelectedFileObj(fallback.fileObj || null);
        setFileName(fallback.name || '');
        setSelectedAssetUrl(fallback.assetUrl || null);
        setSelectedAssetSource(fallback.source || null);
        setCurrentMaterialType(fallback.materialType || null);
      } else {
        setSelectedQueueAssetId(null);
        setUploadedFile(null);
        setSelectedFileObj(null);
        setFileName('');
        setSelectedAssetUrl(null);
        setLastUploadedUrl(null);
        setSelectedAssetSource(null);
        setCurrentMaterialType(null);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    if (uploadedFile) {
      URL.revokeObjectURL(uploadedFile);
    }
    setUploadedFile(null);
    setSelectedFileObj(null);
    setFileName('');
    setSelectedAssetUrl(null);
    setLastUploadedUrl(null);
    setSelectedAssetSource(null);
    setCurrentMaterialType(null);
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

  const updateActiveCreativeCardField = (field: keyof ScriptCreativeCard, value: string) => {
    updateActiveScriptPageMeta((page) => ({
      ...page,
      creativeCard: {
        ...(page.creativeCard || {}),
        [field]: value,
      },
    }));
  };

  const updateActiveCreativeCardActionsText = (value: string) => {
    updateActiveScriptPageMeta((page) => ({
      ...page,
      creativeCard: {
        ...(page.creativeCard || {}),
        actions: value.trim() ? [value] : [],
      },
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

  const removeAssetFromQueue = (id: string) => {
    setAssetQueue(prev => prev.filter(a => a.id !== id));
    setSelectedQueueAssetId(prev => (prev === id ? null : prev));
  };

  const selectAssetFromQueue = (asset: QueuedAsset) => {
    setSelectedQueueAssetId(asset.id);
    setUploadedFile(asset.previewUrl || null);
    setFileName(asset.name || '');
    setSelectedFileObj(asset.fileObj || null);
    setSelectedAssetUrl(asset.assetUrl || null);
    setSelectedAssetSource(asset.source || null);
    setCurrentMaterialType(asset.materialType || null);
    setGeneratedVideoUrl(null);
  };

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
                value={asset.materialType || (asset.mediaKind === 'video' ? 'motion' : 'product')}
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
      }
    ]));
  };

  const removeScriptFromQueue = (id: string) => {
    setScriptQueue(prev => prev.filter(s => s.id !== id));
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 10000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleGenerateScripts = async () => {
    if (!user?.id) {
      openInfo(popupTitles.notice, t.wb_popup_not_logged_in);
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

    setIsGeneratingScript(true);

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
        },
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

      console.log("📜 Generating Script with payload:", payload);

      const response = await videoApi.generateScript(user.id, payload);
      console.log("✅ Script Generated:", response);

      const buildScriptsFromShots = (shots: any[]) => shots.map((shot: any) => ({
        id: shot.shot_index,
        shot: shot.shot_index.toString(),
        type: shot.type || 'Medium',
        dur: `${shot.duration_sec}s`,
        visual: shot.visual,
        audio: shot.audio || shot.voiceover || '',
        audioTranslation: shot.voiceover_translation || '',
      }));
      const normalizeText = (value: any) => String(value || '').replace(/\s+/g, ' ').trim();
      const parseStringList = (value: any, maxLen = 5) => {
        if (!Array.isArray(value)) return [];
        const next: string[] = [];
        for (const item of value) {
          const text = normalizeText(item);
          if (!text) continue;
          if (next.includes(text)) continue;
          next.push(text);
          if (next.length >= maxLen) break;
        }
        return next;
      };
      const buildFullScriptFallback = (scriptsList: ScriptItem[]) => (
          scriptsList
              .map((item) => normalizeText(item.visual))
              .filter((text) => !!text)
              .join(' ')
      );
      const parseScriptPage = (raw: any, idx: number): ScriptPage => {
        const shots = buildScriptsFromShots(raw?.shots || raw?.script_content?.shots || []);
        const scriptContent = raw?.script_content || raw || {};
        const continuityAnchor = scriptContent?.continuity_anchor || {};
        const scriptStructure = scriptContent?.script_structure || {};
        const creativeCard = scriptContent?.creative_card || {};
        const fullScript = normalizeText(scriptContent?.video_master_script) || buildFullScriptFallback(shots);
        return {
          id: `page-${idx + 1}`,
          name: `${t.wb_script_page_prefix} ${idx + 1}`,
          scripts: shots,
          referenceSummary: parseReferenceSummary(
              scriptContent?.reference_assets_summary || raw?.reference_assets_summary
          ),
          fullScript,
          continuityAnchor: {
            subject: normalizeText(continuityAnchor?.subject),
            scene: normalizeText(continuityAnchor?.scene),
            style: normalizeText(continuityAnchor?.style),
          },
          scriptStructure: {
            hook: normalizeText(scriptStructure?.hook),
            development: normalizeText(scriptStructure?.development),
            payoff: normalizeText(scriptStructure?.payoff),
          },
          sellingPoints: parseStringList(scriptContent?.selling_points),
          sceneSuggestions: parseStringList(scriptContent?.scene_suggestions),
          styleTags: parseStringList(scriptContent?.style_tags),
          creativeCard: {
            style: normalizeText(creativeCard?.style),
            environment: normalizeText(creativeCard?.environment),
            tonePacing: normalizeText(creativeCard?.tone_pacing),
            camera: normalizeText(creativeCard?.camera),
            lighting: normalizeText(creativeCard?.lighting),
            actions: parseStringList(creativeCard?.actions, 8),
            backgroundSound: normalizeText(creativeCard?.background_sound),
            transitionEditing: normalizeText(creativeCard?.transition_editing),
            callToAction: normalizeText(creativeCard?.call_to_action),
          },
        };
      };
      const parseReferenceSummary = (summary: any): ReferenceSummaryItem[] => {
        if (!Array.isArray(summary)) return [];
        const allowedTypes = new Set(['model', 'product', 'scene']);
        const next: ReferenceSummaryItem[] = [];
        for (const item of summary) {
          if (!item || typeof item !== 'object') continue;
          const type = String(item.type || '').toLowerCase();
          if (!allowedTypes.has(type)) continue;
          if (!Array.isArray(item.keywords)) continue;
          const keywords = item.keywords
              .map((kw: any) => String(kw || '').trim())
              .filter((kw: string, idx: number, arr: string[]) => kw.length > 0 && arr.indexOf(kw) === idx)
              .slice(0, 3);
          if (keywords.length === 0) continue;
          next.push({ type: type as ReferenceSummaryItem['type'], keywords });
        }
        return next;
      };

      const unwrapScriptPayload = (data: any) => {
        if (!data || typeof data !== 'object') return data;
        if (data.data && typeof data.data === 'object') return data.data;
        return data;
      };

      const extractScriptPages = (data: any): ScriptPage[] => {
        const root = unwrapScriptPayload(data);
        if (!root) return [];
        if (Array.isArray(root.script_contents)) {
          return root.script_contents.map((sc: any, idx: number) => parseScriptPage(sc, idx));
        }
        if (Array.isArray(root.script_variants)) {
          return root.script_variants.map((variant: any, idx: number) => parseScriptPage(variant, idx));
        }
        if (Array.isArray(root.variants)) {
          return root.variants.map((variant: any, idx: number) => parseScriptPage(variant, idx));
        }
        if (root.script_content?.shots || root.script_content?.video_master_script || root.script_content?.creative_card) {
          return [parseScriptPage(root, 0)];
        }
        return [];
      };

      if (response.code === 0) {
        const pages = extractScriptPages(response.data);
        if (pages.length > 0) {
          setScriptPages(pages);
          setActiveScriptPage(0);
          setScripts(pages[0].scripts);
          setIsShotBreakdownOpen(false);
        } else {
          openInfo(popupTitles.notice, t.wb_popup_script_unexpected);
        }
      } else {
        openInfo(popupTitles.notice, t.wb_popup_script_unexpected);
      }

    } catch (err: any) {
      console.error("Script Gen Error:", err);
      let msg = err.message;
      try {
        const jsonPart = err.message.substring(err.message.indexOf('{'));
        const parsed = JSON.parse(jsonPart);
        if (parsed.message) msg = parsed.message;
      } catch (e) {}
      openInfo(popupTitles.error, `${t.wb_popup_script_failed}：${msg}`);
    } finally {
      setIsGeneratingScript(false);
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
        openInfo(popupTitles.error, t.wb_popup_parse_script_failed);
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
        issues.push('Kling首帧模式需要且仅允许1张首帧图。');
      }
      if (klingGenerateMode === 'subject' && subjectCount !== 1) {
        issues.push('Kling主体模式需要且仅允许1张主体图。');
      }
      if (klingGenerateMode === 'first_last_frame' && firstFrameCount !== 1) {
        issues.push('Kling首尾帧模式需要且仅允许1张首帧图。');
      }
      if (klingGenerateMode === 'first_last_frame' && tailFrameCount !== 1) {
        issues.push('Kling首尾帧模式需要且仅允许1张尾帧图。');
      }
      if (klingGenerateMode === 'subject' && referenceCount < 1) {
        issues.push('可灵主体模式需要再提供 1 到 3 张其他参考图。');
      }
      if (klingGenerateMode === 'subject' && referenceCount > 3) {
        issues.push('可灵主体模式最多只允许 3 张其他参考图。');
      }
      if (klingGenerateMode === 'first_frame' && firstFrameCount + referenceCount > 7) {
        issues.push('Kling参考图片数量不能超过7张。');
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

        for (const asset of preparedAssets) {
          for (const scriptPack of scriptQueue) {
            const combinedScriptPrompt = buildCombinedScriptPrompt(
                scriptPack.fullScript || '',
                scriptPack.creativeCard,
                scriptPack.scripts
            );

            let newProjectId: string | undefined;
            if (selectedTemplate?.id) {
              const cloneResp = await videoApi.cloneProject(selectedTemplate.id);
              newProjectId = cloneResp?.data?.new_project_id || cloneResp?.new_project_id || cloneResp?.data?.id;
              if (!newProjectId) throw new Error('Failed to clone project');
            } else {
              if (!user?.id) throw new Error('请先登录');
              const createResp = await videoApi.createProject(user.id, {
                title: (productName || '').trim() || `${asset.name} × ${scriptPack.name}`,
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
              ...(asset.mediaKind === 'video'
                  ? { motion_video_path: (asset as any).apiPath }
                  : { image_path: (asset as any).apiPath }),
              sound: soundSetting,
              asset_source: asset.source,
              user_language: language,
              target_language: targetLanguage,
              model_asset_id: selectedTemplate?.default_model_asset?.id ?? null,
              motion_asset_id: asset.mediaKind === 'video' ? null : (selectedTemplate?.default_motion_asset?.id ?? null),
              ...(promptOverridesPayload ? { prompt_overrides: promptOverridesPayload } : {}),
            };

            const genResp = await generateWithAdaptiveImageConfirm(payload);
            const taskId = genResp?.data?.task_id || genResp?.task_id;
            const projectId = genResp?.data?.project_id || newProjectId;

            if (genResp?.code === 0 && taskId) {
              addTask({
                id: taskId,
                projectId: String(projectId),
                workbenchProjectId: projectStore.currentProjectId,
                type: 'video_generation',
                status: 'processing',
                name: `${(productName || '').trim() || asset.name || `${asset.name} × ${scriptPack.name}`}`,
                thumbnail: asset.previewUrl || undefined,
                createdAt: Date.now(),
              });

              batchItems.push({
                id: `${asset.id}-${scriptPack.id}-${taskId}`,
                assetName: asset.name,
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
          openInfo(popupTitles.error, `${t.wb_popup_batch_failed}：${formatWorkbenchError(err, t.wb_popup_generation_failed)}`);
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
        openInfo(popupTitles.error, formatWorkbenchError(err, t.wb_popup_generation_failed));
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
            openInfo(popupTitles.error, err?.message || t.wb_popup_tiktok_switch_failed);
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
      openInfo(popupTitles.error, err?.message || t.wb_popup_tiktok_upload_failed);
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
      const locked = creationMode === 'fast' && opt.id === 'seedance2.0';
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
              <svg className={`w-4 h-4 transition-transform duration-200 ${isModelSectionCollapsed ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          </div>

          {!isModelSectionCollapsed && (
            <div className="flex flex-col gap-6">
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
                  {t.wb_recommend_engine_title}
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
                  <Lock className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
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
          )}
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
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-2 transition border ${isAiRecognizing || getProductRecognitionSources().length === 0 ? 'border-white/10 bg-black/30 text-zinc-600 opacity-70 hover:bg-black/30' : 'border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20'}`}
            >
              {isAiRecognizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {isAiRecognizing ? t.wb_ai_recognizing_btn : t.wb_ai_recognize_btn}
            </button>
          </div>

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

            <div className="grid grid-cols-2 gap-4">
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
                    options={[
                      { value: '9:16', label: t.mobile },
                      { value: '16:9', label: t.landscape },
                      ...(selectedModel === 'kling' && klingGenerateMode === 'subject'
                        ? [{ value: '1:1', label: t.square }]
                        : []),
                    ]}
                    onChange={(v) => setAspectRatio(v === '16:9' ? '16:9' : (v === '1:1' ? '1:1' : '9:16'))}
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                {selectedModel === 'kling' ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] text-zinc-500 font-bold block uppercase">{t.wb_config_duration}</label>
                      <span className="text-[12px] font-bold text-orange-400">{genDuration}s</span>
                    </div>
                    <input
                      type="range"
                      min={3}
                      max={10}
                      step={1}
                      value={genDuration}
                      onChange={(e) => setGenDuration(Number(e.target.value))}
                      className="w-full h-2 bg-black/30 rounded-lg appearance-none cursor-pointer accent-orange-500"
                    />
                  </div>
                ) : (
                  <>
                    <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_duration}</label>
                    <DropdownSelect
                      value={String(genDuration)}
                      options={[
                        { value: '5', label: '5s' },
                        { value: '10', label: '10s' },
                        { value: '15', label: '15s' },
                      ]}
                      onChange={(v) => {
                        const next = Number(v);
                        if (next === 5 || next === 10 || next === 15) {
                          setGenDuration(next);
                          return;
                        }
                        setGenDuration(10);
                      }}
                      buttonClassName="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-orange-500 transition cursor-pointer hover:bg-white/5"
                      labelClassName=""
                      iconClassName="w-3 h-3 text-zinc-500"
                      optionClassName="text-xs"
                    />
                  </>
                )}
              </div>

                <div>
                  <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_audio}</label>
                  <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                    <button onClick={() => setSoundSetting('on')} className={`wb-choice-btn flex-1 py-1.5 rounded-md text-[10px] font-medium transition ${soundSetting === 'on' ? 'wb-choice-btn--active' : 'wb-choice-btn--inactive'}`}>{t.wb_config_audio_on}</button>
                    <button onClick={() => setSoundSetting('off')} className={`wb-choice-btn flex-1 py-1.5 rounded-md text-[10px] font-medium transition ${soundSetting === 'off' ? 'wb-choice-btn--active' : 'wb-choice-btn--inactive'}`}>{t.wb_config_audio_off}</button>
                  </div>
                </div>
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
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><UploadCloud className="w-3 h-3" /> {t.wb_upload_title}</h2>
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
                      <span>首尾帧模式</span>
                      <span className="relative z-10 inline-flex items-center group/info hover:z-20">
                        <Info className="h-3 w-3 text-zinc-400" />
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 ml-6 w-44 -translate-x-1/2 whitespace-normal break-words rounded-lg border border-white/10 bg-zinc-900/95 px-2 py-1 text-[12px] font-medium leading-snug text-zinc-100 opacity-0 shadow-xl backdrop-blur transition group-hover/info:opacity-100">
                          <span className="block">素材要求：</span>
                          <span className="block">1张首帧图 + 1张尾帧图 + 0-6张参考图</span>
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-zinc-400">通过首尾关键帧约束视频开头与结尾</div>
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
              <input type="file" ref={fileInputRef} className="hidden" accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.mkv,.webm,.avi,.mp3,.wav,.flac" multiple onChange={handleWorkbenchUpload} />
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
                      <span className="relative group/item rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                  {t.wb_upload_audio}
                        <span className="absolute left-1/2 top-7 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-zinc-900/95 px-2 py-1 text-[9px] text-zinc-100 opacity-0 shadow-xl backdrop-blur transition group-hover/item:opacity-100 hover:opacity-100">
                    {audioFormats}
                  </span>
                </span>
                      <span className="text-zinc-400">{t.wb_upload_max_size}</span>
                    </div>
                  </div>
              ) : (
                  <div className="rounded-lg bg-zinc-900/80 p-2">
                    {isKlingOmniMode ? (
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
                          {klingGenerateMode === 'first_last_frame' && (
                            <div className="rounded-xl border border-white/10 bg-black/25 p-2 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                              <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                                <span>尾帧图</span>
                                <span className="text-[10px] font-medium normal-case tracking-normal text-zinc-500">必传1张</span>
                              </div>
                              {klingTailSlotAsset ? renderUploadAssetCard(klingTailSlotAsset) : (
                                  <div className="h-28 rounded-lg border border-dashed border-white/10 bg-black/20" />
                              )}
                            </div>
                          )}
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
                                    value={asset.materialType || (asset.mediaKind === 'video' ? 'motion' : 'product')}
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
          </div>
          <div className={`grid gap-2 ${isKlingOmniMode ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
                className="col-span-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-[10px] font-bold text-orange-200 hover:bg-orange-500/20"
            >
              <span className="inline-flex items-center justify-center gap-1.5">
                <ImagePlus className="w-3.5 h-3.5" />
                {t.wb_ai_opt_open_btn || 'AI智能优化'}
              </span>
            </button>
            {isKlingOmniMode && (
              <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleGenerateKlingBoundaryFrames();
                  }}
                  disabled={isGeneratingKlingBoundaryFrames}
                  className={`rounded-lg border px-3 py-2 text-[10px] font-bold transition ${isGeneratingKlingBoundaryFrames ? 'border-orange-500/30 bg-orange-500/10 text-orange-300/70' : 'border-orange-500/60 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20'}`}
              >
                {isGeneratingKlingBoundaryFrames ? '生成中...' : '参考图生首尾帧'}
              </button>
            )}
          </div>

          {getDebugModeEnabled() && (
          <div className="flex flex-col gap-3">
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

          {renderLeftColumnSettings()}

          <button
              type="button"
              onClick={() => {
                if (isGeneratingScript) {
                  openInfo(popupTitles.notice, t.wb_generate_in_progress);
                  return;
                }
                if (!hasCurrentAsset) {
                  openInfo(popupTitles.notice, t.wb_generate_need_asset);
                  return;
                }
                void handleGenerateScripts();
              }}
              className={`w-full py-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 group border border-white/10 bg-black/30 text-zinc-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 ${isGeneratingScript || !hasCurrentAsset ? 'opacity-40 hover:bg-black/30' : ''}`}
          >
            {isGeneratingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 group-hover:rotate-12 transition" />}
            {isGeneratingScript ? t.wb_generating : t.wb_btn_gen_scripts}
          </button>
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
                    onClick={goToPrevProject}
                    className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10"
                    title="上一项目"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <h1 className="text-xl font-bold tracking-tight text-white cursor-text" onClick={beginHeaderRename}>
                    {currentProject?.name || DEFAULT_PROJECT_NAME}
                  </h1>
                  <button
                    type="button"
                    onClick={goToNextProject}
                    className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10"
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
                title="查看正在生成的视频队列"
              >
                <List className="w-4 h-4" />
                <span className="text-[11px] font-bold">生成队列</span>
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
                      正在生成 {activeVideoTaskCount > 0 ? `(${activeVideoTaskCount})` : ''}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsTaskQueueOpen(false)}
                      className="text-zinc-400 hover:text-white"
                      title="关闭"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {activeVideoTaskCount === 0 ? (
                    <div className="mt-3 text-xs text-zinc-500">暂无正在生成的任务</div>
                  ) : (
                    <div className="mt-3 space-y-2 max-h-64 overflow-y-auto custom-scroll pr-1">
                      {activeVideoTasks.slice(0, 12).map((task) => {
                        const elapsed = Math.max(0, Math.floor((taskQueueNowTs - task.createdAt) / 1000));
                        const left = Math.max(0, 120 - elapsed);
                        const countdownText = left > 0 ? `剩余 ${left}s` : '马上完成';
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
                        生成完成 {completedVideoTaskCount > 0 ? `(${completedVideoTaskCount})` : ''}
                      </div>
                      {completedVideoTaskCount > 3 && (
                        <button
                          type="button"
                          onClick={() => setIsCompletedCollapsed(prev => !prev)}
                          className="text-zinc-400 hover:text-white"
                          aria-label={isCompletedCollapsed ? '展开' : '折叠'}
                          title={isCompletedCollapsed ? '展开' : '折叠'}
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
                      <div className="mt-2 text-xs text-zinc-500">暂无生成完成的任务</div>
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
                                setToastMessage('该任务未绑定到工作台项目（旧数据），无法跳转项目');
                              }}
                              className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-2 ${canPreview ? 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-200' : 'border-white/5 bg-white/5 text-zinc-500 cursor-not-allowed'}`}
                              title={displayName}
                            >
                              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs truncate">{displayName}</div>
                                <div className="text-[10px] text-zinc-500 truncate">ID: {String(task.id)}</div>
                              </div>
                              <div className="text-[11px] text-zinc-400 shrink-0">{canPreview ? '预览' : '暂无视频'}</div>
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
                        title={t.wb_ai_opt_coming_soon || '敬请期待。'}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 cursor-help"
                        // onClick={() => void handleGenerateOptimizedImages()}
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
                        onClick={() => {
                          const selected = aiOptimizeImageCandidates.find((item) => item.id === aiOptimizeReferenceId) || null;
                          setAiOptimizePrompt(buildAiOptimizePromptScript(selected));
                        }}
                        className="text-[11px] px-2 py-1 rounded border border-orange-500/60 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20"
                    >
                      {t.wb_ai_opt_build_prompt_btn || '生成提示词脚本'}
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
                title={t.wb_dialog_choose_from_library || '从素材库选择'}
                onClose={() => setIsAssetLibraryOpen(false)}
                widthClassName="max-w-[min(92vw,980px)]"
                footer={
                  <>
                    <button
                        className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700"
                        onClick={() => setIsAssetLibraryOpen(false)}
                    >
                      关闭
                    </button>
                  </>
                }
            >
              <div className="w-full h-[62vh] max-h-[600px] min-h-[440px] flex flex-col gap-2.5">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {([
                    { value: 'product', label: t.assets_tab_products || '商品' },
                    { value: 'model', label: t.assets_tab_models || '模特' },
                    { value: 'scene', label: t.assets_tab_scenes || '场景' },
                    { value: 'motion', label: t.assets_tab_motion || '动作' },
                  ] as Array<{ value: AssetLibraryTab; label: string }>).map((tab) => (
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
                        暂无素材
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
                        {assetLibraryItems.map((asset) => (
                            <button
                                key={asset.id}
                                type="button"
                                onClick={() => selectAssetFromLibraryPopup(asset)}
                                className="text-left rounded-lg border border-white/10 bg-black/30 p-1 hover:border-orange-500/50 hover:bg-white/5 transition"
                            >
                              <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-zinc-800 relative">
                                {isKlingOmniMode && hasSubjectOtherViews(asset) && (
                                  <div className="absolute top-1.5 right-1.5 z-10 rounded-full bg-black/55 border border-white/15 p-1 text-white shadow-lg">
                                    <Layers3 className="w-3.5 h-3.5" />
                                  </div>
                                )}
                                {asset.media_kind === 'video' ? (
                                    <video src={asset.file_url} className="w-full h-full object-cover" muted playsInline />
                                ) : (
                                    <img src={asset.file_url} className="w-full h-full object-cover" alt={asset.name} />
                                )}
                              </div>
                              <div className="mt-1 text-[11px] font-bold text-zinc-200 truncate">{asset.name}</div>
                            </button>
                        ))}
                      </div>
                  )}
                </div>
              </div>
            </AppDialog>
        )}

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
                              {String(language || '').toLowerCase().startsWith('zh') ? '可灵3.0提示词' : 'Kling 3.0 Prompt'}
                            </span>
                          </div>
                          <div className={`text-[10px] mt-0.5 font-medium ${isLightTheme ? 'text-slate-600' : 'text-zinc-500'}`}>{t.wb_script_page_prefix} {activeScriptPage + 1}</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 relative z-10">
                      <div className={cardThemeClass.shell}>
                        <div className={cardThemeClass.panel}>
                          <div className={`space-y-1 ${isLightTheme ? 'text-slate-800' : 'text-zinc-100'}`}>
                            <div className={cardThemeClass.row}>
                              <span className={cardThemeClass.subLabel}>{cardLabels.style}</span>
                              <textarea
                                  rows={1}
                                  data-card-autosize="true"
                                  value={activeCreativeCard?.style || ''}
                                  onChange={(e) => updateActiveCreativeCardField('style', e.target.value)}
                                  onInput={(e) => autoResizeCardTextarea(e.currentTarget)}
                                  className={cardThemeClass.textarea}
                              />
                            </div>

                            <div className={cardThemeClass.row}>
                              <span className={cardThemeClass.subLabel}>{cardLabels.environment}</span>
                              <textarea
                                  rows={1}
                                  data-card-autosize="true"
                                  value={activeCreativeCard?.environment || ''}
                                  onChange={(e) => updateActiveCreativeCardField('environment', e.target.value)}
                                  onInput={(e) => autoResizeCardTextarea(e.currentTarget)}
                                  className={cardThemeClass.textarea}
                              />
                            </div>

                            <div className={cardThemeClass.row}>
                              <span className={cardThemeClass.subLabel}>{cardLabels.tonePacing}</span>
                              <textarea
                                  rows={1}
                                  data-card-autosize="true"
                                  value={activeCreativeCard?.tonePacing || ''}
                                  onChange={(e) => updateActiveCreativeCardField('tonePacing', e.target.value)}
                                  onInput={(e) => autoResizeCardTextarea(e.currentTarget)}
                                  className={cardThemeClass.textarea}
                              />
                            </div>

                            <div className={cardThemeClass.row}>
                              <span className={cardThemeClass.subLabel}>{cardLabels.camera}</span>
                              <textarea
                                  rows={1}
                                  data-card-autosize="true"
                                  value={activeCreativeCard?.camera || ''}
                                  onChange={(e) => updateActiveCreativeCardField('camera', e.target.value)}
                                  onInput={(e) => autoResizeCardTextarea(e.currentTarget)}
                                  className={cardThemeClass.textarea}
                              />
                            </div>

                            <div className={cardThemeClass.row}>
                              <span className={cardThemeClass.subLabel}>{cardLabels.lighting}</span>
                              <textarea
                                  rows={1}
                                  data-card-autosize="true"
                                  value={activeCreativeCard?.lighting || ''}
                                  onChange={(e) => updateActiveCreativeCardField('lighting', e.target.value)}
                                  onInput={(e) => autoResizeCardTextarea(e.currentTarget)}
                                  className={cardThemeClass.textarea}
                              />
                            </div>

                            <div className={cardThemeClass.row}>
                              <span className={cardThemeClass.subLabel}>{cardLabels.actions}</span>
                              <textarea
                                  rows={1}
                                  data-card-autosize="true"
                                  value={(activeCreativeCard?.actions || []).join('\n')}
                                  onChange={(e) => updateActiveCreativeCardActionsText(e.target.value)}
                                  onInput={(e) => autoResizeCardTextarea(e.currentTarget)}
                                  className={cardThemeClass.textarea}
                              />
                            </div>

                            <div className={cardThemeClass.row}>
                              <span className={cardThemeClass.subLabel}>{cardLabels.backgroundSound}</span>
                              <textarea
                                  rows={1}
                                  data-card-autosize="true"
                                  value={activeCreativeCard?.backgroundSound || ''}
                                  onChange={(e) => updateActiveCreativeCardField('backgroundSound', e.target.value)}
                                  onInput={(e) => autoResizeCardTextarea(e.currentTarget)}
                                  className={cardThemeClass.textarea}
                              />
                            </div>

                            <div className={cardThemeClass.row}>
                              <span className={cardThemeClass.subLabel}>{cardLabels.transitionEditing}</span>
                              <textarea
                                  rows={1}
                                  data-card-autosize="true"
                                  value={activeCreativeCard?.transitionEditing || ''}
                                  onChange={(e) => updateActiveCreativeCardField('transitionEditing', e.target.value)}
                                  onInput={(e) => autoResizeCardTextarea(e.currentTarget)}
                                  className={cardThemeClass.textarea}
                              />
                            </div>

                            <div className={cardThemeClass.row}>
                              <span className={cardThemeClass.subLabel}>{cardLabels.callToAction}</span>
                              <textarea
                                  rows={1}
                                  data-card-autosize="true"
                                  value={activeCreativeCard?.callToAction || ''}
                                  onChange={(e) => updateActiveCreativeCardField('callToAction', e.target.value)}
                                  onInput={(e) => autoResizeCardTextarea(e.currentTarget)}
                                  className={cardThemeClass.textarea}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
              )}
              {activeReferenceSummary.length > 0 && (
                  <div className="glass-panel rounded-xl p-3 border border-white/10">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">{t.wb_upload_title}</div>
                    <div className="space-y-2">
                      {activeReferenceSummary.map((item, idx) => {
                        const previewAsset = referencePreviewAssetsByType[item.type];
                        const previewSrc = previewAsset?.previewUrl || previewAsset?.assetUrl || null;
                        return (
                            <div key={`${item.type}-${idx}`} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2">
                              <div className="w-10 h-10 rounded-md overflow-hidden border border-white/10 bg-zinc-900 shrink-0 flex items-center justify-center">
                                {previewSrc ? (
                                    <img src={previewSrc} alt={previewAsset?.name || item.type} className="w-full h-full object-cover" />
                                ) : (
                                    <Layers className="w-4 h-4 text-zinc-500" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-[10px] text-zinc-300 font-semibold">
                                  {materialTypeLabelMap[item.type]}
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {item.keywords.map((kw, kIdx) => (
                                      <span key={`${item.type}-${kIdx}-${kw}`} className="text-[10px] px-1.5 py-0.5 rounded border border-white/15 bg-white/5 text-zinc-200">
                                  {kw}
                                </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                        );
                      })}
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
                    <div className="text-center opacity-30"><Film className="w-12 h-12 mx-auto mb-2 text-zinc-600" /><p className="text-xs text-zinc-600">{isGenerating ? 'Submitting…' : t.wb_waiting}</p></div>
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
