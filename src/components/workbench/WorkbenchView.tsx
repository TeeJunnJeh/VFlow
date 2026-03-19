import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UploadCloud, Plus, X, CheckCircle, FolderPlus, Folder, SlidersHorizontal,
  Wand2, Loader2, Clapperboard, FileDown, FileUp, ArrowLeft, ArrowRight, PlayCircle,
  MonitorPlay, Film, SkipBack, Play, Pause, SkipForward, FileJson, Send, Cpu,
  Zap, Layers, Video, Lock, Info, Check, Sparkles, List, MoreHorizontal, Pencil, Trash2
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useTasks } from '../../context/TaskContext';
import { useWorkbenchModel } from '../../context/WorkbenchModelContext';
import { videoApi, VideoApiError, type GeneratePreviewData } from '../../services/video';
import { assetsApi, type Asset as LibraryAsset, type AssetFolder } from '../../services/assets';
import { tiktokApi } from '../../services/tiktok';
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

const ENABLE_PROMPT_LAB = true;
const ENABLE_STORYBOARD_PROMPT = false;
const ENABLE_STORYBOARD_EDITOR = false;


// Types specific to Workbench View
type ScriptItem = {
  id: number;
  shot: string;
  type: string;
  dur: string;
  visual: string;
  audio: string;
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
  source: 'product' | 'preference';
  materialType?: AssetLibraryTab;
  isPrimaryFrame?: boolean;
  mediaKind?: 'image' | 'video' | 'audio' | 'file';
  uploadedPath?: string | null;
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

type GeneratePayload = {
  model: string;
  prompt: string;
  duration: number;
  sound: 'on' | 'off';
  project_id?: string;
  image_path?: string | null;
  motion_video_path?: string | null;
  asset_source?: 'product' | 'preference' | null;
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

// What we persist to the backend for cross-refresh / cross-device restore.
// Keep it JSON-serializable (no File / Blob / functions).
type WorkbenchSnapshot = {
  version: 1;
  template_id: string | null;
  timestamp: number; // client timestamp (ms)
};

type ProjectWorkspaceState = {
  fileName: string;
  uploadedFile: string | null;
  selectedAssetUrl: string | null;
  lastUploadedUrl: string | null;
  selectedAssetSource: 'product' | 'preference' | null;
  currentMaterialType: AssetLibraryTab | null;
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
}): ProjectWorkspaceState => ({
  fileName: '',
  uploadedFile: null,
  selectedAssetUrl: null,
  lastUploadedUrl: null,
  selectedAssetSource: null,
  currentMaterialType: null,
  genPrompt: '',
  genDuration: 10,
  soundSetting: 'on',
  scriptVariantCount: 1,
  targetLanguage: 'en',
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
  selectedModelId: null,
  generatedVideoUrl: null,
});

const createDefaultProjectStore = (): LocalProjectStore => {
  const projectId = 'project_alpha_01';
  return {
    currentProjectId: projectId,
    projects: [{ id: projectId, name: DEFAULT_PROJECT_NAME, updatedAt: Date.now() }],
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
      projects: parsed.projects as LocalProjectMeta[],
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

// Helper constants
const RATIO_TO_RES: Record<string, string> = {
  '16:9': '1280*720',
  '9:16': '720*1280',
  '1:1': '1080*1080',
  '4:3': '1024*768',
};

const ICON_EMOJI_MAP: Record<string, string> = { 'flame': '🔥', 'gem': '💎', 'zap': '⚡' };
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

type LangLabelKey =
    | 'lang_en'
    | 'lang_zh'
    | 'lang_es'
    | 'lang_ja'
    | 'lang_ko'
    | 'lang_ms'
    | 'lang_vi';

type GuideStepKey = 'mode' | 'upload' | 'config' | 'scripts' | 'preview';

const TARGET_LANGUAGE_OPTIONS: Array<{ value: string; labelKey: LangLabelKey }> = [
  { value: 'en', labelKey: 'lang_en' },
  { value: 'zh', labelKey: 'lang_zh' },
  { value: 'es', labelKey: 'lang_es' },
  { value: 'ja', labelKey: 'lang_ja' },
  { value: 'ko', labelKey: 'lang_ko' },
  { value: 'ms', labelKey: 'lang_ms' },
  { value: 'vi', labelKey: 'lang_vi' },
];

interface WorkbenchViewProps {
  initialFileUrl?: string | null;
  initialFileName?: string;
  initialAssetSource?: 'product' | 'preference' | null;
  templateList: Template[];
  onSelectTemplate: (t: Template | null) => void;
  selectedTemplate: Template | null;
  generatedVideoUrl: string | null;
  setGeneratedVideoUrl: (url: string | null) => void;
  onExportToServer?: (data: any) => Promise<void>;
}

export const WorkbenchView: React.FC<WorkbenchViewProps> = ({
                                                              initialFileUrl,
                                                              initialFileName,
                                                              initialAssetSource,
                                                              templateList,
                                                              onSelectTemplate,
                                                              selectedTemplate,
                                                              generatedVideoUrl,
                                                              setGeneratedVideoUrl,
                                                              onExportToServer // ★ 接收新增的 prop
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

  // --- Prompt Lab (temporary, removable) ---
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
    [language]
  );

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
    if (!ENABLE_PROMPT_LAB) return;
    setIsPromptLabOpen(true);
    if (promptTemplates.length > 0) return;
    await loadPromptLabTemplates();
  };

  // --- Local State ---
  const [uploadedFile, setUploadedFile] = useState<string | null>(initialFileUrl || null);
  const [fileName, setFileName] = useState(initialFileName || '');
  const [selectedFileObj, setSelectedFileObj] = useState<File | null>(null);
  const [selectedAssetSource, setSelectedAssetSource] = useState<'product' | 'preference' | null>(initialAssetSource || null);
  const [isDragUploadActive, setIsDragUploadActive] = useState(false);
  // We use this to display the URL if provided initially
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

  // Draft restore / autosave
  const [isRestoring, setIsRestoring] = useState(true);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  // Track whether we actually restored a draft snapshot this session.
  // If true, we must NOT auto-pick a template (draft selection has priority, including "Custom Config").
  const [wasDraftRestored, setWasDraftRestored] = useState(false);
  // One-shot guard: don't keep forcing a template after the user intentionally switches back to "Custom Config".
  const hasAutoSelectedTemplateRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSnapshotRef = useRef<WorkbenchSnapshot | null>(null);
  const canAutoSaveRef = useRef(false);
  const skipTemplateDurationSyncRef = useRef(false);
  const restoredDraftRef = useRef(false);

  // Config State
  const [genPrompt, setGenPrompt] = useState('');
  const [genDuration, setGenDuration] = useState<number>(selectedTemplate?.duration || 10);
  const [soundSetting, setSoundSetting] = useState<'on' | 'off'>('on');
  const [scriptVariantCount, setScriptVariantCount] = useState<number>(1);
  const [targetLanguage, setTargetLanguage] = useState<string>('en');
  const [creationMode, setCreationMode] = useState<'fast' | 'replay'>('fast');
  const [reuseQueueEnabled, setReuseQueueEnabled] = useState(false);
  const lastFastModelRef = useRef<'kling' | 'sora2' | 'sora2pro' | 'seedance2.0'>('kling');
  const templateModelAsset = selectedTemplate?.default_model_asset ?? null;
  const templateMotionAsset = selectedTemplate?.default_motion_asset ?? null;
  const currentAssetMediaKind = inferMediaKind({ name: fileName, url: selectedAssetUrl || uploadedFile, file: selectedFileObj });
  
  // Processing State
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

  // Video Player State
  const [isPlaying, setIsPlaying] = useState(false);
  // Info dialog state to replace native alert()
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [infoTitle, setInfoTitle] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const openInfo = (title: string, message: string | null = null) => {
    setInfoTitle(title || '');
    setInfoMessage(message || null);
    setIsInfoOpen(true);
  };
  // Confirm dialog helper (returns a Promise<boolean>)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const confirmResolveRef = useRef<((v: boolean) => void) | null>(null);
  const openConfirm = (title: string, message: string) => {
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmTitle(title || '');
      setConfirmMessage(message || '');
      setIsConfirmOpen(true);
    });
  };

  // Script State
  const buildDemoScripts = () => ([
    { id: 1, shot: '1', type: 'Medium', dur: '2s', visual: t.demo_shot1_visual, audio: t.demo_shot1_audio },
    { id: 2, shot: '2', type: 'Detail', dur: '2s', visual: t.demo_shot2_visual, audio: t.demo_shot2_audio }
  ]);
  const [scripts, setScripts] = useState<ScriptItem[]>(buildDemoScripts);
  const [scriptPages, setScriptPages] = useState<ScriptPage[]>(() => ([{ id: 'page-1', name: `${t.wb_script_page_prefix} 1`, scripts: buildDemoScripts() }]));
  const [activeScriptPage, setActiveScriptPage] = useState(0);
  const [isShotBreakdownOpen, setIsShotBreakdownOpen] = useState(false);

  // Queue State
  const [assetQueue, setAssetQueue] = useState<QueuedAsset[]>([]);
  const [scriptQueue, setScriptQueue] = useState<QueuedScript[]>([]);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [isUploadTypeDialogOpen, setIsUploadTypeDialogOpen] = useState(false);
  const [pendingUploadType, setPendingUploadType] = useState<AssetLibraryTab>('product');
  const [currentMaterialType, setCurrentMaterialType] = useState<AssetLibraryTab | null>(null);
  const [generatedBatch, setGeneratedBatch] = useState<Array<{ id: string; assetName: string; scriptName: string; taskId: string | number }>>([]);
  const [selectedQueueAssetId, setSelectedQueueAssetId] = useState<string | null>(null);
  const [projectStore, setProjectStore] = useState<LocalProjectStore>(() => loadLocalProjectStore(user?.id ?? null));
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
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
  const isApplyingProjectWorkspaceRef = useRef(false);
  const currentProject = useMemo(
    () => projectStore.projects.find((project) => project.id === projectStore.currentProjectId) || null,
    [projectStore.currentProjectId, projectStore.projects]
  );

  const projectUiText = useMemo(() => ({
    listTooltip: t.wb_project_list_tooltip,
    switchTitle: t.wb_project_switch_title,
    searchPlaceholder: t.wb_project_search_placeholder,
    recent: t.wb_project_recent,
    empty: t.wb_project_empty,
    newProject: t.wb_project_new,
    manageProjects: t.wb_project_manage,
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
  const sortedProjects = useMemo(
    () => [...projectStore.projects].sort((a, b) => b.updatedAt - a.updatedAt),
    [projectStore.projects]
  );
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

  const applyWorkspaceState = (workspace: ProjectWorkspaceState) => {
    const normalizePersistedUrl = (value: string | null | undefined, fallback?: string | null | undefined) => {
      const primary = value || '';
      const backup = fallback || '';
      if (primary && !primary.startsWith('blob:')) return primary;
      if (backup && !backup.startsWith('blob:')) return backup;
      return primary || backup || null;
    };
    const normalizedUploadedFile = normalizePersistedUrl(workspace.uploadedFile, workspace.lastUploadedUrl);
    const normalizedSelectedAssetUrl = normalizePersistedUrl(workspace.selectedAssetUrl, workspace.lastUploadedUrl);
    const normalizedQueue = (Array.isArray(workspace.assetQueue) ? workspace.assetQueue : []).map((item) => {
      const persisted = normalizePersistedUrl(item.uploadedPath || item.assetUrl || null, null);
      const preview = normalizePersistedUrl(item.previewUrl || null, persisted);
      return {
        ...item,
        previewUrl: preview,
        assetUrl: normalizePersistedUrl(item.assetUrl || null, persisted),
        uploadedPath: normalizePersistedUrl(item.uploadedPath || null, persisted),
        fileObj: null,
      };
    });

    isApplyingProjectWorkspaceRef.current = true;
    setFileName(workspace.fileName || '');
    setUploadedFile(normalizedUploadedFile);
    setSelectedAssetUrl(normalizedSelectedAssetUrl);
    setLastUploadedUrl(workspace.lastUploadedUrl || null);
    setSelectedAssetSource(workspace.selectedAssetSource || null);
    setCurrentMaterialType(workspace.currentMaterialType || null);
    setSelectedFileObj(null);
    setGenPrompt(workspace.genPrompt || '');
    setGenDuration(typeof workspace.genDuration === 'number' ? workspace.genDuration : 10);
    setSoundSetting(workspace.soundSetting || 'on');
    setScriptVariantCount(typeof workspace.scriptVariantCount === 'number' ? workspace.scriptVariantCount : 1);
    setTargetLanguage(workspace.targetLanguage || 'en');
    setCreationMode(workspace.creationMode || 'fast');
    setReuseQueueEnabled(!!workspace.reuseQueueEnabled);
    setScripts(Array.isArray(workspace.scripts) ? workspace.scripts : []);
    setScriptPages(Array.isArray(workspace.scriptPages) && workspace.scriptPages.length > 0 ? workspace.scriptPages : [{ id: 'page-1', name: `${t.wb_script_page_prefix} 1`, scripts: [] }]);
    setActiveScriptPage(typeof workspace.activeScriptPage === 'number' ? workspace.activeScriptPage : 0);
    setIsShotBreakdownOpen(false);
    setAssetQueue(normalizedQueue);
    setScriptQueue(Array.isArray(workspace.scriptQueue) ? workspace.scriptQueue : []);
    setGeneratedVideoUrl(workspace.generatedVideoUrl || null);

    if (workspace.selectedTemplateId) {
      const matchedTemplate = templateList.find((tpl) => tpl.id === workspace.selectedTemplateId) || null;
      onSelectTemplate(matchedTemplate);
    } else {
      onSelectTemplate(null);
    }
    if (workspace.selectedModelId) setSelectedModel(workspace.selectedModelId as any);
    setTimeout(() => {
      isApplyingProjectWorkspaceRef.current = false;
    }, 0);
  };

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
    if (projectId === projectStore.currentProjectId) {
      setProjectMenuOpen(false);
      return;
    }
    setProjectStore((prev) => ({ ...prev, currentProjectId: projectId }));
    setProjectMenuOpen(false);
    setProjectActionMenuId(null);
    setIsProjectManageMode(false);
    setSelectedProjectIds([]);
    setRenamingProjectId(null);
  };

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
      });
      return {
        currentProjectId: projectId,
        projects: [{ id: projectId, name: projectName, updatedAt: Date.now() }, ...prev.projects],
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
        : [{ id: 'project_alpha_01', name: DEFAULT_PROJECT_NAME, updatedAt: Date.now() }];
      const nextCurrent = idSet.has(prev.currentProjectId) ? nextProjects[0].id : prev.currentProjectId;
      const nextWorkspaces = { ...prev.workspaces };
      ids.forEach((id) => { delete nextWorkspaces[id]; });
      if (!nextWorkspaces[nextCurrent]) {
        nextWorkspaces[nextCurrent] = createWorkspaceState({
          scripts: buildDemoScripts(),
          scriptPagePrefix: t.wb_script_page_prefix,
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

  // --- Effects ---

  // Inject an asset from the Asset Library ("用于工作台") into the workbench.
  // Because WorkbenchView is permanently mounted (shown/hidden via CSS), the
  // useState initial values for initialFileUrl are set only once at mount. We
  // need a useEffect that watches the prop and updates internal state whenever
  // a new asset URL is pushed in from the parent.
  useEffect(() => {
    if (!initialFileUrl) return;
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
        mediaKind: inferMediaKind({ name, url: initialFileUrl }),
        uploadedPath: initialFileUrl,
      }
    ]));
  }, [initialAssetSource, initialFileName, initialFileUrl]); 

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
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectStore.currentProjectId, templateList, t.wb_script_page_prefix, t.demo_shot1_visual, t.demo_shot1_audio, t.demo_shot2_visual, t.demo_shot2_audio]);

  useEffect(() => {
    localStorage.setItem(getLocalProjectStoreKey(user?.id ?? null), JSON.stringify(projectStore));
  }, [projectStore, user?.id]);

  useEffect(() => {
    setProjectStore(loadLocalProjectStore(user?.id ?? null));
  }, [user?.id]);

  useEffect(() => {
    if (isApplyingProjectWorkspaceRef.current) return;
    if (!projectStore.currentProjectId) return;

    const currentProjectId = projectStore.currentProjectId;
    const workspace: ProjectWorkspaceState = {
      fileName,
      uploadedFile,
      selectedAssetUrl,
      lastUploadedUrl,
      selectedAssetSource,
      currentMaterialType,
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
    currentMaterialType,
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
    if (projectMenuOpen) return;
    setRenamingProjectId(null);
    setRenamingProjectName('');
    setIsProjectManageMode(false);
    setSelectedProjectIds([]);
    setProjectActionMenuId(null);
  }, [projectMenuOpen]);

  useEffect(() => { 
    // Reset or update duration when template changes
    if (!selectedTemplate) {
      return;
    }

    // When we apply a restored template, keep the duration we restored from the snapshot.
    if (skipTemplateDurationSyncRef.current) {
      skipTemplateDurationSyncRef.current = false;
      return;
    }

    // During draft restore we may set duration from snapshot; don't override it.
    if (!isRestoring) setGenDuration(selectedTemplate.duration);

  }, [selectedTemplate, isRestoring]);

  // When the preview video changes, reset play state until we receive onPlay/onPause from the new element.
  useEffect(() => {
    setIsPlaying(false);
  }, [generatedVideoUrl]);

  // Debug: Log task changes
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

  // Keep a ref so unmount flush doesn't depend on hook dependency arrays.
  useEffect(() => {
    canAutoSaveRef.current = !!user?.id && !isRestoring;
  }, [user?.id, isRestoring]);

  // 1) Restore draft when entering workbench (mount) or after login
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
          // Template (may arrive before templateList is loaded)
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
    // Intentionally only tied to auth identity; template selection is handled in a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Apply restored template once templates are available
  useEffect(() => {
    if (!pendingTemplateId) return;
    if (isRestoring) return;

    // If user already selected something manually, don't override.
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

    // Template was deleted or otherwise unavailable. Clear pending so we can fall back.
    if (templateList.length > 0) setPendingTemplateId(null);
  }, [pendingTemplateId, isRestoring, selectedTemplate?.id, templateList, onSelectTemplate]);

  // If user has templates, "Custom Config" is not a valid/meaningful option:
  // - Hide it in the dropdown (render logic below)
  // - Ensure we always have a real template selected (default to the first)
  // - Don't interrupt draft restore (pendingTemplateId) or in-progress restore
  useEffect(() => {
    if (isRestoring) return;
    if (pendingTemplateId) return;
    if (templateList.length === 0) return;

    const selectedId = selectedTemplate?.id;
    const isValidSelection = !!selectedId && templateList.some(t => t.id === selectedId);
    if (isValidSelection) return;

    // If we just restored a draft snapshot (that may have been "Custom Config"),
    // preserve the restored duration instead of syncing to template default.
    if (restoredDraftRef.current) skipTemplateDurationSyncRef.current = true;

    onSelectTemplate(templateList[0]);
  }, [templateList, selectedTemplate?.id, pendingTemplateId, isRestoring, onSelectTemplate]);

  // Default template selection:
  // - If user has templates and there's NO restored draft, default to the first template (not "Custom Config").
  // - If user has no templates, keep showing "Custom Config".
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

  // Keep a best-effort "latest snapshot" for debounce + unmount flush.
  latestSnapshotRef.current = {
    version: 1,
    template_id: (selectedTemplate?.id as string | undefined) || null,
    timestamp: Date.now(),
  };

  // 2) Auto-save (debounced)
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

  // 3) Flush on unmount (e.g. leaving workbench tab) so we don't lose the last edits due to debounce cleanup
  useEffect(() => {
    return () => {
      if (!canAutoSaveRef.current) return;
      const snapshot = latestSnapshotRef.current;
      if (!snapshot) return;
      videoApi.saveDraft(snapshot).catch(() => {});
    };
  }, []);

  // 4) Best-effort save on page refresh/close (covers "F5" / tab close cases better than debounce alone)
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

  useEffect(() => {
    if (!generatedVideoUrl) return;
    const matched = tasks.find(t => (t.result?.video_url || t.result?.url) === generatedVideoUrl);
    if (matched?.projectId) setPreviewProjectId(matched.projectId);
  }, [generatedVideoUrl, tasks]);

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

  const selectAssetFromLibraryPopup = (asset: LibraryAsset) => {
    const assetUrl = asset.file_url || null;
    if (!assetUrl) return;
    const source: 'product' | 'preference' = asset.media_kind === 'video' ? 'preference' : 'product';
    const nextMaterialType: AssetLibraryTab = asset.media_kind === 'video' ? 'motion' : assetLibraryTab;
    const mediaKind: QueuedAsset['mediaKind'] =
      asset.media_kind === 'video'
        ? 'video'
        : asset.media_kind === 'audio'
          ? 'audio'
          : (asset.media_kind === 'image' ? 'image' : inferMediaKind({ name: asset.name || '', url: assetUrl }));
    const queueId = `lib-${asset.id}`;
    const queuedAsset: QueuedAsset = {
      id: queueId,
      name: asset.name || '未命名素材',
      previewUrl: assetUrl,
      fileObj: null,
      assetUrl,
      source,
      materialType: nextMaterialType,
      isPrimaryFrame: source === 'product',
      mediaKind,
      uploadedPath: assetUrl,
    };

    setAssetQueue(prev => {
      const next = prev.filter(item => item.materialType !== nextMaterialType);
      return [...next, queuedAsset];
    });

    setUploadedFile(assetUrl);
    setSelectedAssetUrl(assetUrl);
    setLastUploadedUrl(assetUrl);
    setSelectedFileObj(null);
    setFileName(queuedAsset.name);
    setSelectedAssetSource(source);
    setCurrentMaterialType(nextMaterialType);
    setSelectedQueueAssetId(queueId);
    setGeneratedVideoUrl(null);
  };

  // Duration Logic
  const currentScriptDuration = ENABLE_STORYBOARD_EDITOR
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

  const materialTypeCycle: AssetLibraryTab[] = ['product', 'model', 'scene', 'motion'];
  const getNextMaterialType = (current: AssetLibraryTab): AssetLibraryTab => {
    const idx = materialTypeCycle.indexOf(current);
    if (idx < 0) return materialTypeCycle[0];
    return materialTypeCycle[(idx + 1) % materialTypeCycle.length];
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
  const referencePreviewAssetsByType = useMemo(() => {
    const next: Partial<Record<'model' | 'product' | 'scene', QueuedAsset>> = {};
    for (const asset of uploadDisplayAssets) {
      if (asset.materialType !== 'model' && asset.materialType !== 'product' && asset.materialType !== 'scene') continue;
      next[asset.materialType] = asset;
    }
    return next;
  }, [uploadDisplayAssets]);
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

  const buildSingleGeneratePayload = async (): Promise<GeneratePayload> => {
    const apiPath = await resolveCurrentSingleAssetPath();
    const payload: GeneratePayload = {
      model: backendModel,
      prompt: buildCombinedScriptPrompt(activeFullScript, activeCreativeCard, scripts),
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

    // 为Sora模型添加size参数（Sora仅支持特定的分辨率）
    if (selectedModel === 'sora2' || selectedModel === 'sora2pro') {
      payload.size = '1280x720'; // Sora默认1280x720，用户可根据aspect_ratio调整
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
      title: fileName || 'Video',
      aspect_ratio: selectedTemplate?.aspect_ratio || '9:16',
      script_content: {
        duration: genDuration,
        shots: ENABLE_STORYBOARD_EDITOR ? scripts : [],
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
    const taskId = genResp?.data?.task_id || genResp?.task_id;

    if (genResp?.code === 0 && taskId) {
      addTask({
        id: taskId,
        projectId,
        type: 'video_generation',
        status: 'processing',
        name: `${selectedTemplate?.name || 'Video'} (${projectId.slice(0, 6)})`,
        thumbnail: uploadedFile || undefined,
        createdAt: Date.now(),
      });
      setLastGeneratedProjectId(projectId);
      openInfo('Success', '任务已提交到后台运行，您可以继续修改参数生成下一个！');
      return;
    }

    openInfo('Notice', '提交成功，但未返回任务ID。');
  };

  const getActionRequiredFromError = (err: unknown): ActionRequired => {
    if (err instanceof VideoApiError) {
      return err.actionRequired || null;
    }
    return null;
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

      // Avoid infinite retry loops when backend still rejects after user confirmation.
      if (payload[requestFlag]) {
        throw err;
      }

      const prompt =
        (typeof actionRequired?.prompt === 'string' && actionRequired.prompt.trim())
          ? actionRequired.prompt.trim()
          : (requestFlag === 'allow_image_resize'
            ? '当前图片不满足最小分辨率要求，是否自动放大后继续？'
            : '当前图片超过 10MB，是否自动压缩后继续？');

      const confirmed = await openConfirm('Image Adjustment', prompt);
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
      openInfo('Notice', t.wb_debug_batch_unsupported);
      return;
    }
    if (!selectedTemplate?.id && !selectedFileObj && !selectedAssetUrl && !uploadedFile) {
      openInfo('Notice', 'Please upload a reference asset or select a template first!');
      return;
    }
    if (!hasActiveScriptConcept) {
      openInfo('Notice', 'Please generate or complete a script concept card first!');
      return;
    }
    if (ENABLE_STORYBOARD_EDITOR && !isDurationValid) {
      openInfo('Warning', `Total script duration (${currentScriptDuration}s) must match requested duration (${genDuration}s)!`);
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
      openInfo('Error', String(err?.message || 'Failed to prepare debug payload'));
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
      openInfo('Error', t.wb_debug_invalid_json);
      return;
    }

    setIsPreparingDebug(true);
    try {
      const preview = await refreshDebugPreview(parsed);
      setDebugPayloadText(JSON.stringify(preview.request_payload || parsed, null, 2));
    } catch (err: any) {
      openInfo('Error', String(err?.message || 'Failed to refresh preview'));
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
      openInfo('Error', t.wb_debug_invalid_json);
      return;
    }

    setIsSendingDebug(true);
    setGeneratedVideoUrl(null);
    try {
      await submitSingleGeneration(parsed);
    } catch (err: any) {
      openInfo('Error', `Error: ${err.message || 'Generation failed'}`);
    } finally {
      setIsSendingDebug(false);
    }
  };

  const validateUploadFile = (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) return `文件过大：${file.name}（>1GB）`;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = file.type.startsWith('image/') || IMAGE_EXTS.includes(ext);
    const isVideo = file.type.startsWith('video/') || VIDEO_EXTS.includes(ext);
    const isAudio = file.type.startsWith('audio/') || AUDIO_EXTS.includes(ext);
    if (!isImage && !isVideo && !isAudio) return `格式不支持：${file.name}`;
    return null;
  };

  // --- Handlers ---

  const applySelectedUploadType = (files: File[], selectedType: AssetLibraryTab) => {
    if (files.length === 0) return;

    const latestFile = files[files.length - 1];
    const mediaKind = inferMediaKind({ name: latestFile.name, file: latestFile });
    const source: QueuedAsset['source'] = mediaKind === 'video' ? 'preference' : 'product';
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

    setAssetQueue(prev => {
      const next = prev.filter(item => item.materialType !== selectedType);
      return [...next, latestItem];
    });

    // Upload once to temp storage immediately so preview can survive refresh.
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

  const queueFilesWithTypePrompt = (files: File[]) => {
    if (files.length === 0) return;

    const errors: string[] = [];
    const validFiles: File[] = [];
    files.forEach((file) => {
      const err = validateUploadFile(file);
      if (err) errors.push(err);
      else validFiles.push(file);
    });

    if (errors.length > 0) {
      openInfo('Invalid file', `${errors.join('\n')}\n\n支持格式：${formatHint}`);
    }
    if (validFiles.length === 0) return;

    setPendingUploadFiles(validFiles);
    setPendingUploadType(validFiles[0].type.startsWith('video/') ? 'motion' : 'product');
    setIsUploadTypeDialogOpen(true);
  };

  const confirmUploadTypeSelection = () => {
    const files = [...pendingUploadFiles];
    const type = pendingUploadType;
    setIsUploadTypeDialogOpen(false);
    setPendingUploadFiles([]);
    if (files.length === 0) return;
    applySelectedUploadType(files, type);
  };

  const cancelUploadTypeSelection = () => {
    setIsUploadTypeDialogOpen(false);
    setPendingUploadFiles([]);
  };

  const markQueueAssetAsPrimaryFrame = (targetId: string) => {
    const target = assetQueue.find((item) => item.id === targetId);
    if (!target) return;
    if (target.mediaKind !== 'image') {
      openInfo('Notice', '只有图片素材可设为首帧图');
      return;
    }

    setAssetQueue(prev => prev.map(item => ({
      ...item,
      isPrimaryFrame: item.id === targetId,
      source: item.id === targetId ? 'product' : item.source,
    })));
    selectAssetFromQueue({ ...target, source: 'product', isPrimaryFrame: true });
  };

  const handleLocalFiles = (files: File[]) => {
    queueFilesWithTypePrompt(files);
  };

  // const applyAssetSource = (nextSource: 'product' | 'preference') => {
  //   setSelectedAssetSource(nextSource);
  //   if (!selectedQueueAssetId) return;
  //   setAssetQueue(prev => prev.map(asset => (asset.id === selectedQueueAssetId ? { ...asset, source: nextSource } : asset)));
  // };

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
    const newScripts = scripts.map(s => {
      if (s.id === id) {
        const num = parseFloat(newValue);
        return { ...s, dur: isNaN(num) ? '0s' : `${num}s` };
      }
      return s;
    });
    setScripts(newScripts);
  };

  const handleScriptTypeChange = (id: number, newType: string) => {
    const normalizedType = newType.trim() || 'Medium';
    const newScripts = scripts.map((item) => (item.id === id ? { ...item, type: normalizedType } : item));
    updateScripts(newScripts);
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

  const updateActiveCreativeCardAction = (index: number, value: string) => {
    updateActiveScriptPageMeta((page) => {
      const actions = [...(page.creativeCard?.actions || [])];
      actions[index] = value;
      return {
        ...page,
        creativeCard: {
          ...(page.creativeCard || {}),
          actions,
        },
      };
    });
  };

  const addActiveCreativeCardAction = () => {
    updateActiveScriptPageMeta((page) => ({
      ...page,
      creativeCard: {
        ...(page.creativeCard || {}),
        actions: [...(page.creativeCard?.actions || []), ''],
      },
    }));
  };

  const removeActiveCreativeCardAction = (index: number) => {
    updateActiveScriptPageMeta((page) => ({
      ...page,
      creativeCard: {
        ...(page.creativeCard || {}),
        actions: (page.creativeCard?.actions || []).filter((_, idx) => idx !== index),
      },
    }));
  };

  const addScript = () => {
    const newId = scripts.length > 0 ? Math.max(...scripts.map(s => s.id)) + 1 : 1;
    updateScripts([...scripts, { id: newId, shot: (scripts.length + 1).toString(), type: 'Medium', dur: '2s', visual: '', audio: '' }]);
  };

  const removeScript = (id: number) => {
    const remaining = scripts.filter(s => s.id !== id).map((s, idx) => ({ ...s, shot: (idx + 1).toString() }));
    updateScripts(remaining);
  };

  // --- Queue Handlers ---
  const addCurrentAssetToQueue = () => {
    if (!selectedFileObj && !selectedAssetUrl && !uploadedFile) {
      openInfo('Notice', '请先选择或上传素材');
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
      source: selectedAssetSource || (selectedFileObj ? 'product' : 'preference'),
      materialType: nextMaterialType,
      isPrimaryFrame: mediaKind === 'image',
      mediaKind,
      uploadedPath: null
    };

    setAssetQueue(prev => {
      const next = prev.filter(item => item.materialType !== nextMaterialType);
      return [...next, nextItem];
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

  const addCurrentScriptToQueue = () => {
    if (!hasActiveScriptConcept) {
      openInfo('Notice', '请先生成或完善脚本方案卡');
      return;
    }
    if (ENABLE_STORYBOARD_EDITOR && !isDurationValid) {
      openInfo('Warning', `脚本总时长(${currentScriptDuration.toFixed(1)}s)需要与配置时长(${genDuration}s)一致`);
      return;
    }

    const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = `${t.wb_script_page_prefix} ${scriptQueue.length + 1}`;
    // Deep copy scripts
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

  // --- API Handlers ---
  const handleGenerateScripts = async () => {
    if (!user?.id) { openInfo('Notice', 'Please log in first'); return; }

    setIsGeneratingScript(true);

    try {
      type ScriptReferenceAsset = {
        type: 'model' | 'product' | 'scene';
        name: string;
        image_path: string;
      };

      const referenceSources = uploadDisplayAssets;
      const latestByType = new Map<'model' | 'product' | 'scene', QueuedAsset>();
      for (const asset of referenceSources) {
        if (asset.mediaKind !== 'image') continue;
        if (asset.materialType !== 'model' && asset.materialType !== 'product' && asset.materialType !== 'scene') continue;
        latestByType.set(asset.materialType, asset);
      }

      const referenceAssets: ScriptReferenceAsset[] = [];
      const queuedPathUpdates: Record<string, string> = {};
      const orderedTypes: Array<'model' | 'product' | 'scene'> = ['model', 'product', 'scene'];
      for (const type of orderedTypes) {
        const asset = latestByType.get(type);
        if (!asset) continue;

        let resolvedPath = asset.uploadedPath || asset.assetUrl || null;
        if (!resolvedPath && asset.fileObj) {
          const uploadResp = await assetsApi.uploadTempAsset(asset.fileObj);
          resolvedPath = extractUploadedAssetPath(uploadResp);
        }
        if (!resolvedPath) continue;

        if (asset.id && asset.id !== 'current-upload') {
          queuedPathUpdates[asset.id] = resolvedPath;
        }
        if (selectedQueueAssetId && selectedQueueAssetId === asset.id) {
          setLastUploadedUrl(resolvedPath);
        }

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

      let imagePath = referenceAssets.find((item) => item.type === 'product')?.image_path || referenceAssets[0]?.image_path || '';

      // 2. Prepare Payload (Robust)
      const promptText = genPrompt || "产品推广";

      // Values from Selected Template or Default
      const category = selectedTemplate?.product_category || "相机";
      const style = selectedTemplate?.visual_style || "写实";
      const rawRatio = selectedTemplate?.aspect_ratio || "16:9";
      const resolution = RATIO_TO_RES[rawRatio] || rawRatio || "1280*720";
      const duration = genDuration || selectedTemplate?.duration || 10;
      const shots = selectedTemplate?.shot_number || 5;

      const payload = {
        model: backendModel,
        // Root level prompt for backend safety
        user_prompt: promptText,
        prompt: promptText,
        input: promptText,

        product_category: category,
        visual_style: style,
        aspect_ratio: resolution,
        script_count: scriptVariantCount,

        // Tell backend which language to use for script generation (UI language)
        user_language: language,
        sound: soundSetting,
        // Persist target audience language in payload for future backend extensions
        target_language: targetLanguage,

        script_content: {
          duration: duration,
          shot_number: shots,
          custom: selectedTemplate?.custom_config || "",
          // Inner level prompt
          input: promptText,
          prompt: promptText,
          user_prompt: promptText,
          sound: soundSetting,
          script_count: scriptVariantCount,
          shots: []
        },
        ...(referenceAssets.length > 0 ? { reference_assets: referenceAssets } : {}),
        ...(imagePath ? { product_image_path: imagePath } : {}),
        asset_source: selectedAssetSource || (selectedFileObj ? 'product' : 'preference'),
        ...(promptOverridesPayload ? { prompt_overrides: promptOverridesPayload } : {}),
      };

      console.log("📜 Generating Script with payload:", payload);

      const response = await videoApi.generateScript(user.id, payload);
      console.log("✅ Script Generated:", response);

      // 3. Helper to parse response
      const buildScriptsFromShots = (shots: any[]) => shots.map((shot: any) => ({
        id: shot.shot_index,
        shot: shot.shot_index.toString(),
        type: shot.type || 'Medium',
        dur: `${shot.duration_sec}s`,
        visual: shot.visual,
        audio: shot.audio || shot.voiceover || ''
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

      // 4. Handle various response formats from API
      const extractScriptPages = (data: any): ScriptPage[] => {
        if (!data) return [];
        if (Array.isArray(data.script_contents)) {
          return data.script_contents.map((sc: any, idx: number) => parseScriptPage(sc, idx));
        }
        if (Array.isArray(data.script_variants)) {
          return data.script_variants.map((variant: any, idx: number) => parseScriptPage(variant, idx));
        }
        if (Array.isArray(data.variants)) {
          return data.variants.map((variant: any, idx: number) => parseScriptPage(variant, idx));
        }
        if (data.script_content?.shots) {
          return [parseScriptPage(data, 0)];
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
          openInfo('Notice', "Script generation completed but returned unexpected data.");
        }
      } else {
        openInfo('Notice', "Script generation completed but returned unexpected data.");
      }

    } catch (err: any) {
      console.error("Script Gen Error:", err);
      let msg = err.message;
      try {
        const jsonPart = err.message.substring(err.message.indexOf('{'));
        const parsed = JSON.parse(jsonPart);
        if (parsed.message) msg = parsed.message;
      } catch (e) {}
      openInfo('Error', `Script Generation Failed: ${msg}`);
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // --- Script Import / Export Functions ---

  const handleExportScripts = async () => {
    if (scripts.length === 0) { openInfo('Notice', 'No scripts to export!'); return; }

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

      // 上传到服务器 (如果父组件传了这个方法 且 启用了 Supabase)
      // const enableSupabase = import.meta.env.VITE_ENABLE_SUPABASE === 'true';
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

        // Validation: Check if array and has some expected fields
        if (Array.isArray(parsed) && parsed.length > 0 && ('visual' in parsed[0] || 'shot' in parsed[0])) {
          const validScripts = parsed.map((item: any, idx: number) => ({
            id: item.id || Date.now() + idx,
            shot: item.shot || (idx + 1).toString(),
            type: item.type || 'Medium',
            dur: item.dur || '2s',
            visual: item.visual || '',
            audio: item.audio || ''
          }));
          // Update state
          setScripts(validScripts);
          setScriptPages(prev => {
            const next = [...prev];
            next[activeScriptPage] = { ...next[activeScriptPage], scripts: validScripts };
            return next;
          });

          // Optional: Update duration config to match imported script
          const newTotal = validScripts.reduce((acc: number, s: any) => acc + (parseFloat(s.dur.replace('s','')) || 0), 0);
          if (Math.abs(newTotal - genDuration) > 0.5) {
            setGenDuration(Math.ceil(newTotal));
          }
        } else {
          openInfo('Invalid file', 'Invalid script format. Please upload a valid JSON file.');
        }
      } catch (err) {
        console.error(err);
        openInfo('Error', 'Failed to parse script file.');
      }
    };
    reader.readAsText(file);
    // Reset file input so user can re-upload same file if needed
    e.target.value = '';
  };

  // --- Script Pagination Handler ---
  const handleScriptPageChange = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= scriptPages.length) return;

    // 1. Save current scripts to the current page before leaving
    setScriptPages(prev => {
      const next = [...prev];
      next[activeScriptPage] = { ...next[activeScriptPage], scripts: scripts };
      return next;
    });

    // 2. Change Page Index
    setActiveScriptPage(nextIndex);

    // 3. Load scripts from the new page
    setScripts(scriptPages[nextIndex]?.scripts || []);
    setIsShotBreakdownOpen(false);
  };

  // --- Safety: Sync Active Page if Pages Decrease ---
  useEffect(() => {
    if (activeScriptPage >= scriptPages.length && scriptPages.length > 0) {
      // If current page index is invalid, jump to the last valid page
      const lastIndex = scriptPages.length - 1;
      setActiveScriptPage(lastIndex);
      setScripts(scriptPages[lastIndex].scripts || []);
    }
  }, [activeScriptPage, scriptPages]);

  // --- Demo Script Auto-Translation ---
  useEffect(() => {
    // Only update if we are still looking at the default demo scripts (ID 1 & 2)
    const isDemo = scripts.length === 2 && scripts[0].id === 1 && scripts[1].id === 2;

    if (isDemo) {
      const newDemo = buildDemoScripts();
      setScripts(newDemo);
      setScriptPages(prev => {
        const next = [...prev];
        // Safely update the current page with translated scripts
        if (next[0]) {
          next[0] = { ...next[0], scripts: newDemo };
        }
        return next;
      });
    }
  }, [t]); // Re-run when language (t) changes

  const formatI18nTemplate = (template: string, vars: Record<string, string | number>) =>
    template.replace(/\{(\w+)\}/g, (match, key) => (Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match));

  const validateGenerateRequirements = () => {
    const issues: string[] = [];

    if (reuseQueueEnabled) {
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
    if (!hasActiveScriptConcept) {
      issues.push('脚本方案卡：请先生成或完善完整脚本内容。');
    }
    if (ENABLE_STORYBOARD_EDITOR && !isDurationValid) {
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

    // 1. Batch Generation (Reuse Queue)
    if (reuseQueueEnabled) {
      setIsGenerating(true);
      setGeneratedVideoUrl(null);

      try {
        const batchItems: Array<{ id: string; assetName: string; scriptName: string; taskId: string | number }> = [];

        // 1) 处理素材：上传或复用已有路径
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

            // 记录已上传路径，避免重复上传
            setAssetQueue(prev => prev.map(a => a.id === asset.id ? { ...a, uploadedPath: apiPath } : a));
          }

          if (!apiPath) throw new Error(`无法获取素材路径：${asset.name}`);

          return { ...asset, apiPath };
        }));

        // 2) 逐条提交任务（素材 × 脚本）
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
                title: `${asset.name} × ${scriptPack.name}`,
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
                type: 'video_generation',
                status: 'processing',
                name: `${asset.name} × ${scriptPack.name}`,
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
          openInfo('Success', `批量任务已提交，共 ${batchItems.length} 个`);
        } else {
          openInfo('Notice', '批量提交完成，但未返回有效任务ID');
        }
    } catch (err: any) {
      if (err?.message === USER_CANCELLED_ADAPT) {
        openInfo('Notice', '已取消图片自动处理，批量生成已停止。');
      } else {
        openInfo('Error', `批量生成失败：${err?.message || '未知错误'}`);
      }
      } finally {
        setIsGenerating(false);
      }

      return;
    }

    // 2. Single Video Generation

    setIsGenerating(true);
    setGeneratedVideoUrl(null);

    try {
      const payload = await buildSingleGeneratePayload();
      await submitSingleGeneration(payload);
      /*
      let apiPath = lastUploadedUrl; 
      const uploadType = currentAssetMediaKind === 'video' ? 'motion' : 'product';
      
      if (!apiPath && selectedFileObj) {
          console.log("🚀 Uploading reference image...");
        const uploadResp = await assetsApi.uploadAsset(selectedFileObj, uploadType);
          
          let rawPath = null;
          if (uploadResp.assets && Array.isArray(uploadResp.assets) && uploadResp.assets.length > 0) {
            rawPath = uploadResp.assets[0].url || uploadResp.assets[0].file_url || uploadResp.assets[0].path;
          } else {
            rawPath = uploadResp.url || uploadResp.file_url || uploadResp.path || uploadResp.data?.url;
          }

          if (!rawPath) throw new Error("Could not retrieve image path from upload response");

          setLastUploadedUrl(rawPath);
          apiPath = rawPath;
      } else if (!apiPath && selectedAssetUrl) {
        apiPath = selectedAssetUrl;
      }

      // It's valid to generate from a template or pure text-only prompt without an explicit image path.
      // If we don't have an apiPath, proceed and let the backend decide (it may use model_asset_id or pure-text generation).

      // Combine Scripts
      const combinedScriptPrompt = scripts.map(s => {
        const audioMarker = s.audio ? `【音频|【[旁白]】${s.audio}】` : '';
        return `${s.visual || ''} ${audioMarker}`.trim();
      }).join(' ');

      // Clone Project (if template selected) or Create Project from scripts
      let newProjectId: string | undefined;
      if (selectedTemplate?.id) {
        const cloneResp = await videoApi.cloneProject(selectedTemplate.id);
        newProjectId = cloneResp?.data?.new_project_id || cloneResp?.new_project_id || cloneResp?.data?.id;
        if (!newProjectId) throw new Error('Failed to clone project');
      } else {
        const createResp = await videoApi.createProject(user!.id, {
          title: fileName || 'Video',
          aspect_ratio: selectedTemplate?.aspect_ratio || '9:16',
          script_content: {
            duration: genDuration,
            shots: scripts
          }
        });
        newProjectId = createResp?.data?.id || createResp?.data?.project_id || createResp?.id;
        if (!newProjectId) throw new Error('Failed to create project');
      }

        const payload = {
          model: backendModel,
          prompt: combinedScriptPrompt,
          project_id: newProjectId,
          duration: genDuration,
          ...(currentAssetMediaKind === 'video' ? { motion_video_path: apiPath } : { image_path: apiPath }),
          sound: soundSetting,
          asset_source: selectedAssetSource,
          user_language: language,
          target_language: targetLanguage,
          model_asset_id: selectedTemplate?.default_model_asset?.id ?? null,
          motion_asset_id: currentAssetMediaKind === 'video' ? null : (selectedTemplate?.default_motion_asset?.id ?? null),
          ...(promptOverridesPayload ? { prompt_overrides: promptOverridesPayload } : {}),
        };

      console.log("🚀 Sending Generation Request:", payload);

      const genResp = await videoApi.generate(payload);
      const taskId = genResp?.data?.task_id || genResp?.task_id;
      const projectId = genResp?.data?.project_id || newProjectId;

      if (genResp?.code === 0 && taskId) {
        addTask({
          id: taskId,
          projectId: String(projectId),
          type: 'video_generation',
          status: 'processing',
          name: `${selectedTemplate?.name || 'Video'} (${String(projectId).slice(0, 6)})`,
          thumbnail: uploadedFile || undefined,
          createdAt: Date.now(),
        });
        setLastGeneratedProjectId(String(projectId));
        openInfo('Success', '任务已提交到后台运行，您可以继续修改参数生成下一个！');
      } else {
        openInfo('Notice', '提交成功，但未返回任务ID。');
      }
      */
    } catch (err: any) {
      if (err?.message === USER_CANCELLED_ADAPT) {
        openInfo('Notice', '已取消图片自动处理，未提交任务。');
      } else {
        openInfo('Error', `Error: ${err.message || 'Generation failed'}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublishToTikTok = async () => {
    if (!generatedVideoUrl) {
      openInfo('Notice', '请先生成并预览视频');
      return;
    }

    const targetProjectId = previewProjectId || lastGeneratedProjectId;
    if (!targetProjectId) {
      openInfo('Notice', '未找到视频对应的项目ID，请稍后重试');
      return;
    }

    setIsPostingTikTok(true);
    try {
      // 尝试检查授权状态
      let isAuthorized = false;
      let tiktokUserInfo = null;
      try {
        const status = await tiktokApi.getStatus();
        isAuthorized = status?.data?.authorized || false;
        tiktokUserInfo = status?.data?.tiktok_user || null;
      } catch (err: any) {
        // 如果 getStatus 失败（401 等），说明需要授权，继续跳转到授权页面
        console.log('[TikTok] Status check failed, need authorization:', err);
        isAuthorized = false;
      }

      // 如果未授权，跳转到授权页面
      if (!isAuthorized) {
        const authUrl = await tiktokApi.getAuthUrl(targetProjectId);
        window.location.href = authUrl;
        return;
      }

      // 显示当前授权的TikTok账号，让用户确认
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
        // 用户点击了取消，询问是否要切换账号
        const switchAccount = await openConfirm(
            'Switch TikTok Account',
            '是否要切换TikTok账号？\n\n点击"确定"后：\n1. 系统将取消当前授权\n2. 跳转到TikTok授权页面\n3. 如需切换到其他账号，请在TikTok页面先退出当前账号，再登录新账号\n4. 授权成功后视频将自动上传到新账号的草稿箱'
        );
        if (switchAccount) {
          try {
            await tiktokApi.revokeAuth();
            // 取消授权成功，跳转到授权页面
            openInfo('Notice', '当前授权已取消，即将跳转到TikTok授权页面。\n\n如需切换账号，请在TikTok页面先退出当前账号。');
            const authUrl = await tiktokApi.getAuthUrl(targetProjectId);
            window.location.href = authUrl;
            return;
          } catch (err: any) {
            openInfo('Error', err?.message || '切换账号失败');
          }
        }
        setIsPostingTikTok(false);
        return;
      }

      // 已授权，尝试发布
      const result = await tiktokApi.publishDraft(targetProjectId);
      if (result.requiresAuth) {
        const authUrl = result.authUrl || await tiktokApi.getAuthUrl(targetProjectId);
        window.location.href = authUrl;
        return;
      }

      openInfo('Success', '已上传到TikTok草稿箱，请在App中查看并发布');
    } catch (err: any) {
      openInfo('Error', err?.message || '上传失败');
    } finally {
      setIsPostingTikTok(false);
    }
  };
  // --- Video Controls ---
  const toggleVideoPlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      const p = video.play();
      // play() can reject (autoplay / permissions). Avoid unhandled promise rejection.
      if (p && typeof (p as Promise<void>).catch === 'function') p.catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  };

  const skipVideoTime = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;

    const next = Math.max(0, video.currentTime + seconds);
    // duration may be NaN/Infinity until metadata is loaded (or for live streams).
    if (Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = Math.min(next, video.duration);
    } else {
      video.currentTime = next;
    }
  };

  // --- Render Sections ---
  
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

  const backendModel =
    selectedModel === 'sora2pro'
      ? 'sora-2-pro'
      : selectedModel === 'sora2'
        ? 'sora-2'
        : selectedModel === 'kling'
          ? 'kling-v3'
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
              {language === 'zh' ? '可灵3.0' : 'Kling3.0'}
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
        title: language === 'zh' ? '可灵 3.0' : 'Kling 3.0',
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
        rate: 150,
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
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 mb-3">
            <Wand2 className="w-3 h-3" /> {t.wb_creation_mode_title}
          </h2>
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
    );

    return (
    <div className="w-[280px] xl:w-[320px] flex flex-col gap-6 shrink-0 h-full overflow-y-auto overflow-x-hidden custom-scroll pr-1">
      <div ref={modeSectionRef} className={getGuideFocusClass('mode')}>
        {modelSelector}
      </div>
      {false && legacyModelSelector}
      {/* Upload Section */}
      <div ref={uploadSectionRef} className={`flex flex-col gap-3 ${getGuideFocusClass('upload')}`}>
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><UploadCloud className="w-3 h-3" /> {t.wb_upload_title}</h2>
        <div
          onDragOver={handleUploadDragOver}
          onDragEnter={handleUploadDragOver}
          onDragLeave={handleUploadDragLeave}
          onDrop={handleUploadDrop}
          className={`glass-panel rounded-xl p-1 border-2 border-dashed transition-colors min-h-32 relative group ${uploadDisplayAssets.length > 0 ? 'border-none' : ''} ${isDragUploadActive ? 'border-orange-500/80 bg-orange-500/10' : 'border-zinc-800 hover:border-orange-500/50'}`}
        >
          {isDragUploadActive && (
            <div className="absolute inset-1 rounded-lg border border-dashed border-orange-500/60 bg-orange-500/10 pointer-events-none" />
          )}
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*,audio/*" multiple onChange={handleWorkbenchUpload} />
          {uploadDisplayAssets.length === 0 ? (
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
                            className={`relative w-full h-24 rounded-md overflow-hidden border text-left transition ${selected ? 'border-orange-500/70 ring-1 ring-orange-500/50' : 'border-white/10 hover:border-white/20'}`}
                          >
                            {asset.previewUrl ? (asset.mediaKind === 'video' ? (
                              <video src={asset.previewUrl} className="w-full h-full object-cover opacity-80" muted playsInline />
                            ) : (
                              <img src={asset.previewUrl} className="w-full h-full object-cover opacity-80" alt={asset.name} />
                            )) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-500 bg-zinc-800">无预览</div>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const currentType = asset.materialType || (asset.mediaKind === 'video' ? 'motion' : 'product');
                                const nextType = getNextMaterialType(currentType);
                                if (inQueue) {
                                  setAssetQueue(prev => prev.map(item => (item.id === asset.id ? { ...item, materialType: nextType } : item)));
                                  if (selected) setCurrentMaterialType(nextType);
                                } else {
                                  setCurrentMaterialType(nextType);
                                }
                              }}
                              className="absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-white/15 bg-black/60 text-zinc-100 hover:bg-black/75 transition"
                            >
                              {materialTypeLabelMap[asset.materialType || (asset.mediaKind === 'video' ? 'motion' : 'product')]}
                            </button>
                            <div className="absolute top-1 right-1 flex items-center gap-1">
                              {asset.mediaKind === 'image' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const nextSource = (asset.source === 'product' || (!asset.source && selectedAssetSource === 'product')) ? 'preference' : 'product';
                                    
                                    if (inQueue) {
                                      setAssetQueue(prev => prev.map(item => 
                                        item.id === asset.id ? { ...item, source: nextSource } : item
                                      ));
                                    }
                                    
                                    if (selected) {
                                      setSelectedAssetSource(nextSource);
                                    }
                                  }}
                                  className={`rounded border px-1.5 py-0.5 text-[9px] font-bold transition ${(asset.source === 'product' || (!asset.source && selected && selectedAssetSource === 'product')) ? 'border-orange-500/70 bg-orange-500/20 text-orange-300' : 'border-white/20 bg-black/45 text-zinc-200 hover:bg-black/65'}`}
                                >
                                  {(asset.source === 'product' || (!asset.source && selected && selectedAssetSource === 'product')) ? '首帧图' : '参考图'}
                                </button>
                              )}
                              <button onClick={(e) => removeUpload(e, asset.id)} className="p-1 bg-black/50 hover:bg-red-500 rounded text-white transition"><X className="w-2.5 h-2.5" /></button>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                              <p className="text-[9px] text-white truncate">{asset.name}</p>
                              {selected && <p className="text-[9px] text-green-400 flex items-center gap-1"><CheckCircle className="w-2 h-2" /> {t.wb_ready}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
          )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
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
          </div>

          {/* Reuse Queues Section (Restored Buttons) */}
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
              {/* Asset Queue */}
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
                        title={item.mediaKind === 'image' ? '选择此素材作为首帧图' : '仅图片可作为首帧图'}
                      >
                        <input
                          type="checkbox"
                          checked={!!item.isPrimaryFrame}
                          disabled={item.mediaKind !== 'image'}
                          onChange={() => markQueueAssetAsPrimaryFrame(item.id)}
                          className="accent-orange-500"
                        />
                        <span>首帧</span>
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

              {/* Script Queue */}
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
                        <div className="text-[9px] text-zinc-500">{ENABLE_STORYBOARD_EDITOR ? `${item.scripts.length} shots` : '完整脚本方案'}</div>
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

      {/* Config Panel (Restored Controls) */}
      <div ref={configSectionRef} className={`flex flex-col gap-3 flex-1 transition-opacity duration-500 ${getGuideFocusClass('config')}`}>
        <div className="flex justify-between items-center"><h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><SlidersHorizontal className="w-3 h-3" /> {t.wb_config_title}</h2></div>
        <div className="glass-panel rounded-xl p-5 flex flex-col gap-5">
           {/* Template Selector */}
           <div>
              <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_template_label}</label>
              <div className="relative">
	                <DropdownSelect
	                  value={selectedTemplate?.id || ''}
	                  options={
	                    templateList.length === 0
	                      ? [{ value: '', label: t.wb_config_custom }]
	                      : templateList.flatMap((tpl) =>
	                          tpl.id
	                            ? [
	                                {
	                                  value: tpl.id,
	                                  label: `${ICON_EMOJI_MAP[tpl.icon] || '🔥'} ${tpl.name}`
	                                }
	                              ]
	                            : []
	                        )
	                  }
	                  onChange={(id) => onSelectTemplate(templateList.find((t) => t.id === id) || null)}
	                  buttonClassName="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-orange-500 font-bold focus:outline-none focus:border-orange-500 transition cursor-pointer hover:bg-white/5"
	                  labelClassName=""
	                  iconClassName="w-3 h-3 text-zinc-500"
	                  optionClassName="text-xs"
	                />
              </div>
           </div>

           {/* Default Model Asset – selectable dropdown, refreshes on open */}
           <div>
             <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_model_label}</label>
             {templateModelAsset ? (
               <div className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2">
                 <div className="flex items-center gap-2">
                   <img
                     src={templateModelAsset.url}
                     alt={templateModelAsset.display_name}
                     className="w-6 h-6 rounded-md object-cover border border-white/10 shrink-0"
                   />
                   <span className="text-xs text-zinc-200 font-bold truncate">{templateModelAsset.display_name}</span>
                 </div>
               </div>
             ) : (
               <div className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-400 font-bold">
                 {t.wb_config_model_smart}
               </div>
             )}
           </div>

           <div>
             <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_motion_label || '参考动作'}</label>
             {templateMotionAsset ? (
               <div className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2">
                 <div className="flex items-center gap-2">
                   <video
                     src={templateMotionAsset.url}
                     className="w-8 h-8 rounded-md object-cover border border-white/10 shrink-0"
                     muted
                     playsInline
                   />
                   <span className="text-xs text-zinc-200 font-bold truncate">{templateMotionAsset.display_name}</span>
                 </div>
               </div>
             ) : (
               <div className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-400 font-bold">
                 {t.wb_config_motion_empty || '未绑定动作参考'}
               </div>
             )}
           </div>

              {/* Restored Inputs: Prompt, Duration, Audio, Count */}
              <hr className="border-white/5" />
              <div>
                <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_prompt_label}</label>
                <textarea
                    disabled={!hasCurrentAsset}
                    className={`w-full bg-black/40 text-xs p-3 rounded-lg border border-white/10 resize-none min-h-[80px] ${!hasCurrentAsset ? 'text-zinc-500 cursor-not-allowed opacity-60' : 'text-zinc-300 focus:border-orange-500 focus:outline-none'}`}
                    placeholder={t.wb_config_prompt_placeholder}
                    value={genPrompt}
                    onChange={(e) => setGenPrompt(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_duration}</label>
                <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                  {/* Sora模型使用4,8,12秒 | Kling使用5,10,15秒 */}
                  {(selectedModel === 'sora2' || selectedModel === 'sora2pro' ? [4, 8, 12] : [5, 10, 15]).map(d => (
                      <button key={d} onClick={() => setGenDuration(d)} className={`wb-choice-btn flex-1 py-1.5 rounded-md text-[10px] font-medium transition ${genDuration === d ? 'wb-choice-btn--active' : 'wb-choice-btn--inactive'}`}>{d}s</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_audio}</label>
                <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                  <button onClick={() => setSoundSetting('on')} className={`wb-choice-btn flex-1 py-1.5 rounded-md text-[10px] font-medium transition ${soundSetting === 'on' ? 'wb-choice-btn--active' : 'wb-choice-btn--inactive'}`}>{t.wb_config_audio_on}</button>
                  <button onClick={() => setSoundSetting('off')} className={`wb-choice-btn flex-1 py-1.5 rounded-md text-[10px] font-medium transition ${soundSetting === 'off' ? 'wb-choice-btn--active' : 'wb-choice-btn--inactive'}`}>{t.wb_config_audio_off}</button>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_script_count_label}</label>
                <div className="flex items-center gap-2 bg-black/40 p-2 rounded-lg border border-white/5">
                  <input type="number" min={1} max={10} value={scriptVariantCount} onChange={(e) => setScriptVariantCount(Number(e.target.value))} className="w-16 bg-transparent text-xs text-zinc-200 focus:outline-none text-center" />
                  <span className="text-[10px] text-zinc-500">{t.wb_script_count_unit}</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_target_audience_language}</label>
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

              <button onClick={handleGenerateScripts} disabled={isGeneratingScript || !hasCurrentAsset} className={`w-full py-3 rounded-xl font-bold text-xs transition shadow-lg shadow-white/5 mt-2 flex items-center justify-center gap-2 group ${isGeneratingScript || !hasCurrentAsset ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed' : 'bg-white text-black hover:bg-orange-500 hover:text-white'}`}>
                {isGeneratingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 group-hover:rotate-12 transition" />}
                {isGeneratingScript ? 'Generating...' : t.wb_btn_gen_scripts}
              </button>
            </div>
          </div>
        </div>
    );
  };

  return (
      <div className="flex flex-col h-full z-10 animate-in fade-in zoom-in-95 duration-300">
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
              <h1 className="text-xl font-bold tracking-tight text-white cursor-text" onClick={beginHeaderRename}>
                {currentProject?.name || DEFAULT_PROJECT_NAME}
              </h1>
            )}
            <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-white/5">{t.wb_header_draft}</span>
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
          <div className="flex items-center gap-4">
            <div className="text-xs text-zinc-500">{t.wb_header_save}</div>
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
                <button className="bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-600" onClick={() => { setIsConfirmOpen(false); if (confirmResolveRef.current) { confirmResolveRef.current(false); confirmResolveRef.current = null; } }}>Cancel</button>
                <button className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-600" onClick={() => { setIsConfirmOpen(false); if (confirmResolveRef.current) { confirmResolveRef.current(true); confirmResolveRef.current = null; } }}>OK</button>
              </>
            }
          >
            <div className="whitespace-pre-line text-sm text-zinc-300">{confirmMessage}</div>
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
        {isUploadTypeDialogOpen && (
          <AppDialog
            isOpen={isUploadTypeDialogOpen}
            title="请选择上传素材类别"
            onClose={cancelUploadTypeSelection}
            widthClassName="max-w-[min(92vw,700px)]"
            footer={
              <>
                <button
                  className="bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-600"
                  onClick={cancelUploadTypeSelection}
                >
                  取消
                </button>
                <button
                  className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-600"
                  onClick={confirmUploadTypeSelection}
                >
                  确认并上传
                </button>
              </>
            }
          >
            <div className="space-y-3 w-full">
              <div className="text-sm text-zinc-300">本次将上传 {pendingUploadFiles.length} 个文件，请先选择它们所属的素材类别。</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['product', 'model', 'scene', 'motion'] as AssetLibraryTab[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPendingUploadType(type)}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${pendingUploadType === type ? 'border-orange-500/70 bg-orange-500/20 text-orange-300' : 'border-white/10 bg-black/30 text-zinc-300 hover:bg-white/5'}`}
                  >
                    {materialTypeLabelMap[type]}
                  </button>
                ))}
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

      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        {renderLeftColumn()}
        
        <div ref={scriptsSectionRef} className={`flex-auto flex flex-col gap-3 h-full min-w-[300px] ${getGuideFocusClass('scripts')}`}>
           <div className="flex justify-between items-center shrink-0 h-[32px]">
              <div className="flex items-center gap-3">
                 <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Clapperboard className="w-3 h-3" /> {t.wb_col_scripts}</h2>
                 <div className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDurationValid ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>{currentScriptDuration.toFixed(1)}s / {genDuration}s</div>
                 {/* Icons for script handling */}
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
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4 fill-current" />}{isGenerating ? 'Generating...' : t.wb_btn_gen_video}
              </button>
              </div>
           </div>
           
           <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-4 pb-10">
              {activeScriptPlan && (
                <div className="rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/10 via-black/60 to-black/80 p-4 shadow-[0_12px_36px_rgba(16,185,129,0.12)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-400/20 border border-emerald-300/30 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-200/90">脚本方案卡</div>
                        <div className="text-[11px] text-zinc-400">{t.wb_script_page_prefix} {activeScriptPage + 1}</div>
                      </div>
                    </div>
                    <div className="text-[10px] px-2 py-1 rounded-full border border-emerald-300/30 bg-emerald-400/10 text-emerald-100">
                      可灵3.0提示词
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-black/35 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">完整脚本</div>
                    <textarea
                      value={activeFullScript}
                      onChange={(e) => updateActiveFullScript(e.target.value)}
                      placeholder="输入完整脚本方案..."
                      className="w-full min-h-[96px] bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-[12px] leading-6 text-zinc-100 placeholder:text-zinc-600 resize-y focus:outline-none focus:border-emerald-300/50"
                    />
                  </div>

                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                        <div className="text-[10px] text-emerald-200 mb-1">[风格]</div>
                        <textarea
                          value={activeCreativeCard?.style || ''}
                          onChange={(e) => updateActiveCreativeCardField('style', e.target.value)}
                          className="w-full min-h-[80px] bg-black/30 border border-white/10 rounded-md px-2 py-1.5 text-[11px] leading-5 text-zinc-200 placeholder:text-zinc-600 resize-y focus:outline-none focus:border-emerald-300/50"
                        />
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                        <div className="text-[10px] text-emerald-200 mb-1">[环境]</div>
                        <textarea
                          value={activeCreativeCard?.environment || ''}
                          onChange={(e) => updateActiveCreativeCardField('environment', e.target.value)}
                          className="w-full min-h-[80px] bg-black/30 border border-white/10 rounded-md px-2 py-1.5 text-[11px] leading-5 text-zinc-200 placeholder:text-zinc-600 resize-y focus:outline-none focus:border-emerald-300/50"
                        />
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                        <div className="text-[10px] text-emerald-200 mb-1">[语调与节奏]</div>
                        <textarea
                          value={activeCreativeCard?.tonePacing || ''}
                          onChange={(e) => updateActiveCreativeCardField('tonePacing', e.target.value)}
                          className="w-full min-h-[72px] bg-black/30 border border-white/10 rounded-md px-2 py-1.5 text-[11px] leading-5 text-zinc-200 placeholder:text-zinc-600 resize-y focus:outline-none focus:border-emerald-300/50"
                        />
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                        <div className="text-[10px] text-emerald-200 mb-1">[镜头]</div>
                        <textarea
                          value={activeCreativeCard?.camera || ''}
                          onChange={(e) => updateActiveCreativeCardField('camera', e.target.value)}
                          className="w-full min-h-[72px] bg-black/30 border border-white/10 rounded-md px-2 py-1.5 text-[11px] leading-5 text-zinc-200 placeholder:text-zinc-600 resize-y focus:outline-none focus:border-emerald-300/50"
                        />
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5 md:col-span-2">
                        <div className="text-[10px] text-emerald-200 mb-1">[光线]</div>
                        <textarea
                          value={activeCreativeCard?.lighting || ''}
                          onChange={(e) => updateActiveCreativeCardField('lighting', e.target.value)}
                          className="w-full min-h-[72px] bg-black/30 border border-white/10 rounded-md px-2 py-1.5 text-[11px] leading-5 text-zinc-200 placeholder:text-zinc-600 resize-y focus:outline-none focus:border-emerald-300/50"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] text-emerald-200">[动作]</div>
                        <button
                          type="button"
                          onClick={addActiveCreativeCardAction}
                          className="text-[10px] px-2 py-1 rounded border border-white/10 text-zinc-300 hover:bg-white/5 transition"
                        >
                          新增动作
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(activeCreativeCard?.actions && activeCreativeCard.actions.length > 0 ? activeCreativeCard.actions : ['']).map((item, idx) => (
                          <div key={`card-action-edit-${idx}`} className="flex gap-2">
                            <div className="w-5 h-5 mt-1 shrink-0 rounded-full border border-emerald-300/30 bg-emerald-400/10 text-[10px] text-emerald-100 flex items-center justify-center">
                              {idx + 1}
                            </div>
                            <textarea
                              value={item}
                              onChange={(e) => updateActiveCreativeCardAction(idx, e.target.value)}
                              className="flex-1 min-h-[56px] bg-black/30 border border-white/10 rounded-md px-2 py-1.5 text-[11px] leading-5 text-zinc-200 placeholder:text-zinc-600 resize-y focus:outline-none focus:border-emerald-300/50"
                            />
                            {(activeCreativeCard?.actions && activeCreativeCard.actions.length > 0) && (
                              <button
                                type="button"
                                onClick={() => removeActiveCreativeCardAction(idx)}
                                className="mt-1 h-8 px-2 rounded border border-white/10 text-zinc-400 hover:text-red-300 hover:border-red-400/40 transition"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                        <div className="text-[10px] text-emerald-200 mb-1">[背景音]</div>
                        <textarea
                          value={activeCreativeCard?.backgroundSound || ''}
                          onChange={(e) => updateActiveCreativeCardField('backgroundSound', e.target.value)}
                          className="w-full min-h-[72px] bg-black/30 border border-white/10 rounded-md px-2 py-1.5 text-[11px] leading-5 text-zinc-200 placeholder:text-zinc-600 resize-y focus:outline-none focus:border-emerald-300/50"
                        />
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                        <div className="text-[10px] text-emerald-200 mb-1">[转场 / 剪辑]</div>
                        <textarea
                          value={activeCreativeCard?.transitionEditing || ''}
                          onChange={(e) => updateActiveCreativeCardField('transitionEditing', e.target.value)}
                          className="w-full min-h-[72px] bg-black/30 border border-white/10 rounded-md px-2 py-1.5 text-[11px] leading-5 text-zinc-200 placeholder:text-zinc-600 resize-y focus:outline-none focus:border-emerald-300/50"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-orange-300/30 bg-orange-400/10 p-2.5">
                      <div className="text-[10px] text-orange-100 mb-1">[行动号召]</div>
                      <textarea
                        value={activeCreativeCard?.callToAction || ''}
                        onChange={(e) => updateActiveCreativeCardField('callToAction', e.target.value)}
                        className="w-full min-h-[72px] bg-black/20 border border-orange-300/25 rounded-md px-2 py-1.5 text-[11px] leading-5 text-zinc-100 placeholder:text-zinc-500 resize-y focus:outline-none focus:border-orange-200/60"
                      />
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
              {ENABLE_STORYBOARD_EDITOR ? (
                <>
                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <div className="text-[10px] text-zinc-400 uppercase tracking-widest">分镜结构（可编辑）</div>
                    <button
                      type="button"
                      onClick={() => setIsShotBreakdownOpen((prev) => !prev)}
                      className="text-[10px] px-2 py-1 rounded border border-white/10 text-zinc-300 hover:bg-white/5 transition"
                    >
                      {isShotBreakdownOpen ? '收起分镜' : '展开分镜'}
                    </button>
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
                            <input type="number" step="0.1" className="w-8 bg-transparent text-[10px] text-zinc-300 text-right" value={parseFloat(script.dur.replace('s',''))} onChange={(e) => handleDurationChange(script.id, e.target.value)} />
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
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-[11px] text-zinc-500">
                  分镜功能已临时关闭，当前仅使用完整脚本方案卡生成视频。
                </div>
              )}
           </div>
        </div>

          {/* Right Column: Preview & Results */}
          <div ref={previewSectionRef} className={`w-[300px] xl:w-[380px] flex flex-col gap-3 shrink-0 h-full ${getGuideFocusClass('preview')}`}>
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

            {/* Batch Results Panel (Restored) */}
            <div className="glass-panel rounded-2xl p-4 border border-white/5 max-h-56 overflow-y-auto custom-scroll">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">{t.wb_batch_results}</div>
              {generatedBatch.length === 0 ? <div className="text-[10px] text-zinc-600">{t.wb_batch_no_results}</div> : <div className="space-y-2">{generatedBatch.map(item => { 
                const task = tasks.find(t => t.id === item.taskId); 
                const status = task?.status; 
                const url = task?.result?.video_url || task?.result?.url;
                if (!task) {
                  console.warn(`[BatchResults] Task ${item.taskId} not found in tasks array`);
                } else {
                  console.log(`[BatchResults] Task ${item.taskId}: status=${status}, url=${url}, result=${JSON.stringify(task.result)}`);
                }
                return (<div key={item.id} className="flex items-center justify-between gap-2 text-[10px]"><span className="truncate text-zinc-300">{item.assetName} × {item.scriptName}</span>{status === 'success' && url ? (<button onClick={() => setGeneratedVideoUrl(url)} className="text-orange-400 hover:text-orange-300 transition">预览</button>) : status === 'failed' ? (<span className="text-red-400">失败</span>) : (<span className="text-zinc-500">生成中…</span>)}</div>); 
              })}</div>}
            </div>
          </div>
        </div>

      </div>
  );
};
