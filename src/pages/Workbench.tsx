import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { templatesApi, type Template } from '../services/templates';
import { assetsApi, type Asset as LibraryAsset } from '../services/assets';
import { authApi } from '../services/auth';
import { getDebugModeEnabled, setDebugModeEnabled, clearDebugModeEnabled, debugLog, debugWarn } from '../services/debugMode';

/** ErrorBoundary – catches render errors in child tree and shows a fallback */
class ViewErrorBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ViewErrorBoundary${this.props.label ? ` ${this.props.label}` : ''}]`, error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10 text-zinc-300">
          <div className="text-lg font-bold text-red-400">页面渲染出错 {this.props.label ? `(${this.props.label})` : ''}</div>
          <pre className="max-w-2xl overflow-auto rounded-xl bg-zinc-900 p-4 text-xs text-red-300 border border-red-500/30 whitespace-pre-wrap">
            {this.state.error.message}{'\n'}{this.state.error.stack}
          </pre>
          <button onClick={() => this.setState({ error: null })} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700">重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { TaskQueueWidget } from '../components/workbench/TaskQueueWidget';
import { AppDialog } from '../components/common/AppDialog';
import { InviteRewardDialog } from '../components/common/InviteRewardDialog';
import { SourceSurveyDialog } from '../components/auth/SourceSurveyDialog';
import { PromoModal } from '../components/promo/PromoModal';
import { PROMO_DEBUG_ALWAYS_SHOW, usePromoEligibility } from '../components/promo/usePromoEligibility';

/**
 * 当前主推的限时活动 ID。以后想换 / 加活动只要改这个常量（或扩成数组按优先级显示）。
 * 配套图片放在 `public/promo-events/<id>/{modal.jpg,banner.png}`。
 */
const ACTIVE_PROMO_CAMPAIGN_ID = 'promo_39_9_598v';
import { WorkbenchView } from '../components/workbench/WorkbenchView';
import { AssetsView } from '../components/workbench/AssetsView';
import { TemplatesView } from '../components/workbench/TemplatesView';
import { HistoryView } from '../components/workbench/HistoryView';
import { AgentView } from '../components/workbench/AgentView_v2';
import { EditorView } from '../components/workbench/EditorView';
import { ProfileView } from '../components/workbench/ProfileView';
import { BillingView } from '../components/workbench/BillingView';
import { AICreatorView } from '../components/workbench/AICreatorView';
import { CommunityView } from '../components/community/CommunityView';
import { CreativeLabReplayView } from '../components/creativeLab/CreativeLabReplayView';
import { CreativeLabScriptExtractView } from '../components/creativeLab/CreativeLabScriptExtractView';
import { SkillVideoGenerationView } from '../components/creativeLab/SkillVideoGenerationView';
import { SeedancePromptRefineView } from '../components/creativeLab/SeedancePromptRefineView';
import { CanvasComingSoon } from '../components/creativeLab/CanvasComingSoon';
import { Sidebar } from '../components/workbench/Sidebar';
import ProductImagesView from '../components/workbench/ProductImagesView';
import type { ViewType } from '../components/workbench/types';
import { useLocation, useNavigate } from 'react-router-dom';
import { WorkbenchModelProvider } from '../context/WorkbenchModelContext';
import { normalizeThemeMode, type ThemeMode } from '../utils/theme';
import { setMetaDescription } from '../utils/seo';
import {
  clearFirstFrameToVideoTransfer,
  readFirstFrameToVideoTransfer,
  type FirstFrameToVideoTransferPayload,
} from '../components/productImages/Functions/FirstFrame/firstFrameToVideoTransfer';

const WORKBENCH_VIEW_TITLES: Record<ViewType, string> = {
  workbench: 'VFLOW AI - 工作台 - GenViewTech',
  assets: 'VFLOW AI - 素材库 - GenViewTech',
  product_images_clothing_swap: 'VFLOW AI - 商品图 - 换装 - GenViewTech',
  product_images_first_frame: 'VFLOW AI - 商品图 - 首帧图 - GenViewTech',
  product_images_smart_repair: 'VFLOW AI - 商品图 - 智能修复 - GenViewTech',
  product_images_gallery: 'VFLOW AI - 商品图 - 商品套图 - GenViewTech',
  product_images_text_separation: 'VFLOW AI - 商品图 - 文本分离 - GenViewTech',
  product_images_ai_model: 'VFLOW AI - 商品图 - AI 模特 - GenViewTech',
  creative_lab_replay: 'VFLOW AI - 创意实验室 - 爆款复刻 - GenViewTech',
  creative_lab_script_extract: 'VFLOW AI - 创意实验室 - 脚本提取 - GenViewTech',
  creative_lab_skill_video: 'VFLOW AI - 创意实验室 - skill视频生成 - GenViewTech',
  creative_lab_prompt_refine: 'VFLOW AI - 创意实验室 - prompt精修 - GenViewTech',
  creative_lab_canvas: 'VFLOW AI - 创意实验室 - 无限画布 - GenViewTech',
  templates: 'VFLOW AI - 模板 - GenViewTech',
  history: 'VFLOW AI - 历史记录 - GenViewTech',
  agent: 'VFLOW AI - Agent - GenViewTech',
  editor: 'VFLOW AI - 模板编辑 - GenViewTech',
  profile: 'VFLOW AI - 设置 - GenViewTech',
  billing: 'VFLOW AI - 计费 - GenViewTech',
  ai_creator: 'VFLOW AI - AI 创作 - GenViewTech',
  community: 'VFLOW AI - 创作者社区 - GenViewTech',
};

const WORKBENCH_VIEW_DESCRIPTIONS: Record<ViewType, string> = {
  workbench:
    'Use the VFLOW AI workspace to generate product videos and images, manage assets and templates, monitor tasks in real time, and export results for publishing.',
  assets:
    'Manage your asset library—products, backgrounds, audio, and virtual models—and reuse them across workflows for faster generation and consistent branding.',
  product_images_clothing_swap:
    'AI Clothing Swap: upload a garment photo and apply it to a model or scene while preserving fabric details to create clean, shop-ready product visuals.',
  product_images_first_frame:
    'Generate a high-quality first-frame product image for video covers and ads. Control style, scene, composition, and resolution to match your brand and platform.',
  product_images_smart_repair:
    'Fix imperfect product photos with AI Smart Repair. Remove artifacts, improve clarity, and restore details while keeping the original look for natural listings.',
  product_images_gallery:
    'Create AI product photo sets with virtual models or local uploads. Define scenes, ratios, and styles, preview outputs, and export a consistent store gallery.',
  product_images_text_separation:
    'Extract clean text layers from product images for faster editing. Automatically separate captions, labels, and design elements while keeping backgrounds intact.',
  creative_lab_replay:
    'Use Creative Lab viral replay to select reference videos, product images, and virtual models, then generate Seedance-ready product ads with safe fallback paths.',
  creative_lab_script_extract:
    'Extract Seedance-ready advertising scripts from reference videos, including reusable structure, shot rhythm, style tags, and selling point suggestions.',
  creative_lab_skill_video:
    'Generate a deterministic creative skill, review an editable short script and parameters, refine a complete Seedance Prompt, and generate the final video.',
  creative_lab_prompt_refine:
    'Refine uploaded materials and an initial script into subject declarations and an editable Seedance Prompt in short, storyboard, or one-shot format.',
  creative_lab_canvas:
    'Compose viral video ideas on an infinite LibLib-style node canvas — drop products, models, prompts, and scripts as nodes, then batch-generate Seedance scripts or videos from any selection.',
  product_images_ai_model:
    'Generate AI model assets from natural-language requirements for product photos, using asynchronous 302AI image generation and result polling.',
  templates:
    'Browse templates for TikTok/Reels ads. Customize scenes, scripts, style, and branding to generate product videos faster and consistently across channels.',
  history:
    'Review your generation history, preview outputs, download results, and track task status across videos and product images in a searchable timeline dashboard.',
  agent:
    'Use Agent tools to experiment with advanced workflows and debugging features inside VFLOW AI, designed for power users, testing, and internal iteration.',
  editor:
    'Edit templates in detail—scenes, scripts, timing, and assets—so you can build reusable workflows in VFLOW AI that match your brand and publishing needs.',
  profile:
    'Update your profile, preferences, and security options. Manage account settings and integrations to keep your VFLOW AI workspace configured the way you want.',
  billing:
    'View your plan, balance, invoices, and usage. Manage payments and understand how credits are consumed for video and product image generation in one place.',
  ai_creator:
    'Chat with AI to generate anything — videos, scripts, images, and more. Describe what you want in natural language and create with one click.',
  community:
    'Browse creator posts, share videos and creative notes, save assets into your library, and collect reusable inspiration inside the VFLOW AI creator community.',
};

const isWorkbenchViewType = (value: string | null | undefined): value is ViewType => (
  typeof value === 'string'
  && Object.prototype.hasOwnProperty.call(WORKBENCH_VIEW_TITLES, value)
);

type AssetsNavigationIntent =
  | 'open_assets_for_subject_creation'
  | 'open_assets_for_subject_creation_first_time'
  | { type: 'open_assets_tab'; tab: 'model' | 'product' | 'scene' | 'motion' | 'audio' | 'script' | 'subject' }
  | null;

type WorkbenchAssetSelectionMode = 'library_asset' | 'background_audio' | 'script_import';
type WorkbenchApplyOptions = {
  targetProjectId?: string | null;
  createNewProject?: boolean;
  newProjectName?: string;
};
const FIRST_FRAME_TRANSFER_KEY = 'vflow_apply_first_frame';

// Helper to get display URL for asset passing
const getDisplayUrl = (path: string | null): string | null => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
  const mediaBaseUrl = import.meta.env.VITE_MEDIA_BASE_URL || '';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (mediaBaseUrl && normalized.startsWith('/media/')) return `${mediaBaseUrl}${normalized}`;
  return normalized;
};

const Workbench = () => {
  const { user, theme, setTheme, justLoggedIn, consumeJustLoggedIn, updateUser } = useAuth();

  // --- Global State ---
  const [activeView, setActiveView] = useState<ViewType>('workbench');
  const [isInviteRewardOpen, setIsInviteRewardOpen] = useState(false);
  const [isSourceSurveyOpen, setIsSourceSurveyOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('vflow_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('vflow_sidebar_collapsed', isSidebarCollapsed ? '1' : '0');
    } catch {
    }
  }, [isSidebarCollapsed]);

  // 限时活动包：默认点击 sidebar「计费」时若用户没买过且 24h 内没关掉，弹活动弹窗。
  // 调试模式（PROMO_DEBUG_ALWAYS_SHOW=true）下：挂载即弹，且不受 24h 去抖约束；
  // 但「买过」依然永远不弹（hook 内部 shouldShowModal 把住）。
  const promoEligibility = usePromoEligibility(ACTIVE_PROMO_CAMPAIGN_ID);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  useEffect(() => {
    if (!user || promoEligibility.loading) return;
    if (!promoEligibility.shouldShowModal(user.id)) return;
    if (!PROMO_DEBUG_ALWAYS_SHOW && activeView !== 'billing') return;
    setIsPromoModalOpen(true);
  }, [activeView, user, promoEligibility.loading, promoEligibility.shouldShowModal]);

  useEffect(() => {
    const nextTitle = WORKBENCH_VIEW_TITLES[activeView] || 'VFLOW AI - 工作台 - GenViewTech';
    if (typeof document !== 'undefined' && document.title !== nextTitle) {
      document.title = nextTitle;
    }
  }, [activeView]);

  useEffect(() => {
    const nextDesc = WORKBENCH_VIEW_DESCRIPTIONS[activeView] || WORKBENCH_VIEW_DESCRIPTIONS.workbench;
    setMetaDescription(nextDesc);
  }, [activeView]);

  // Post-login reward popup: triggered only when the user has just logged in in this session,
  // NOT when the session is restored via /api/auth/me/ on page reload.
  // Honors the per-user "don't show again" flag stored in localStorage.
  useEffect(() => {
    if (!justLoggedIn || !user) return;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(`invite_reward_dismissed_${user.id}`) === '1';
    } catch {
      // localStorage unavailable (private mode etc.) → fall back to showing the dialog
    }

    const willShowInviteReward = !dismissed;
    if (willShowInviteReward) setIsInviteRewardOpen(true);

    consumeJustLoggedIn();
  }, [justLoggedIn, user, consumeJustLoggedIn]);

  const handleInviteRewardDismissPermanent = () => {
    if (!user) return;
    try {
      localStorage.setItem(`invite_reward_dismissed_${user.id}`, '1');
    } catch {
      // best-effort: if storage fails, user will simply see the dialog again next login
    }
  };

  // 新用户来源调查弹窗：用户首次进入工作台时弹一次。后端用 User.source_survey_responded_at
  // 控制是否弹（无论提交还是跳过都设置）；存量老用户在迁移时已被标为已答过。
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { should_prompt } = await authApi.getSourceSurveyStatus();
        if (!cancelled && should_prompt) {
          setIsSourceSurveyOpen(true);
        }
      } catch {
        // 静默失败：拿不到状态时不强弹，避免在网络抖动时打扰用户
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);





  // --- Data Passing State ---
  const [selectedAssetForWorkbench, setSelectedAssetForWorkbench] = useState<{
    asset: LibraryAsset;
    token: string;
    mode: WorkbenchAssetSelectionMode;
    targetProjectId?: string | null;
    forceFirstFrame?: boolean;
  } | null>(null);

  // --- Template State ---
  const [templateList, setTemplateList] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  // --- Asset State (Shared for Folder Persistency) ---
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // --- Preview State ---
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [isDebugModeEnabled, setIsDebugModeEnabledState] = useState(getDebugModeEnabled());
  const [isDebugModeUpdating, setIsDebugModeUpdating] = useState(false);
  const [assetsNavigationIntent, setAssetsNavigationIntent] = useState<AssetsNavigationIntent>(null);

  // --- Effects ---
  useEffect(() => {
    let mounted = true;
    const syncDebugMode = async () => {
      try {
        const enabled = await authApi.getDebugModeStatus();
        if (!mounted) return;
        setIsDebugModeEnabledState(enabled);
        setDebugModeEnabled(enabled);
      } catch (err) {
        if (!mounted) return;
        debugWarn('Failed to sync debug mode status, using local state only:', err);
        setIsDebugModeEnabledState(getDebugModeEnabled());
      }
    };

    if (user?.id) {
      void syncDebugMode();
    }

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) loadTemplates();
  }, [user?.id, activeView]);

  const loadTemplates = async () => {
    if (!user?.id) return;
    try {
      const data = await templatesApi.getTemplates(user.id);
      setTemplateList(data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    setSelectedTemplate((prev) => {
      const prevId = prev?.id;
      if (!prevId) return prev;

      const latest = templateList.find((t) => t.id === prevId);
      if (!latest) return null;

      const isSame =
        latest.name === prev.name &&
        latest.icon === prev.icon &&
        latest.product_category === prev.product_category &&
        latest.visual_style === prev.visual_style &&
        latest.aspect_ratio === prev.aspect_ratio &&
        latest.duration === prev.duration &&
        latest.shot_number === prev.shot_number &&
        (latest.custom_config ?? '') === (prev.custom_config ?? '') &&
        (latest.default_model_asset?.id ?? null) === (prev.default_model_asset?.id ?? null) &&
        (latest.default_model_asset?.display_name ?? '') === (prev.default_model_asset?.display_name ?? '') &&
        (latest.default_model_asset?.url ?? '') === (prev.default_model_asset?.url ?? '') &&
        (latest.default_motion_asset?.id ?? null) === (prev.default_motion_asset?.id ?? null) &&
        (latest.default_motion_asset?.display_name ?? '') === (prev.default_motion_asset?.display_name ?? '') &&
        (latest.default_motion_asset?.url ?? '') === (prev.default_motion_asset?.url ?? '');

      return isSame ? prev : latest;
    });
  }, [templateList]);

  const handleExportToServer = async (projectData: any) => {
    try {
      const jsonString = JSON.stringify(projectData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const fileName = `script_export_${Date.now()}.json`;
      const file = new File([blob], fileName, { type: 'application/json' });

      debugLog('开始将导出的脚本同步到服务器...');
      const result = await assetsApi.uploadAsset(file, 'REFERENCE');

      if (result) {
        debugLog('同步服务器成功:', result);
        setInfoTitle('Success');
        setInfoMessage('导出并保存到云端成功！');
        setIsInfoOpen(true);
      }
    } catch (error) {
      debugWarn('导出到服务器失败:', error);
      setInfoTitle('Error');
      setInfoMessage('保存失败，请检查控制台网络报错。');
      setIsInfoOpen(true);
    }
  };

  // --- Event Handlers ---
  const handleAssetSelect = (asset: LibraryAsset, options?: WorkbenchApplyOptions) => {
    const createNewProject = options?.createNewProject === true;
    const normalizedTargetProjectId = String(options?.targetProjectId || '').trim() || null;
    const normalizedNewProjectName = String(options?.newProjectName || '').trim();
    const forceFirstFrame = !createNewProject && asset.media_kind !== 'audio';

    if (createNewProject) {
      setTransferRole('asset_apply');
      setTransferProjectName(normalizedNewProjectName || null);
      setTransferModel(null);
    } else {
      setTransferRole(null);
      setTransferProjectName(null);
      setTransferModel(null);
    }

    setSelectedAssetForWorkbench({
      asset: {
        ...asset,
        file_url: getDisplayUrl(asset.file_url) || asset.file_url || '',
      },
      token: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      mode: asset.media_kind === 'audio' ? 'background_audio' : asset.type === 'script' ? 'script_import' : 'library_asset',
      targetProjectId: createNewProject ? null : normalizedTargetProjectId,
      forceFirstFrame,
    });
    setGeneratedVideoUrl(null);
    setActiveView('workbench');
  };

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const state = location.state as {
      fromAssetLibrary?: boolean;
      selectedAsset?: LibraryAsset;
      mode?: WorkbenchAssetSelectionMode;
    } | null;
    if (state?.fromAssetLibrary && state?.selectedAsset) {
      const asset = state.selectedAsset;
      const mode = state.mode || (asset.media_kind === 'audio' ? 'background_audio' : 'library_asset');
      setSelectedAssetForWorkbench({
        asset: {
          ...asset,
          file_url: getDisplayUrl((asset as any).previewUrl || asset.file_url) || asset.file_url || '',
        },
        token: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        mode,
      });
      setGeneratedVideoUrl(null);
      setActiveView('workbench');
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tiktok = params.get('tiktok');
    const message = params.get('message');

    if (tiktok) {
      if (tiktok === 'success') {
        setInfoTitle('Success');
        setInfoMessage('TikTok 授权成功');
        setIsInfoOpen(true);
      } else {
        setInfoTitle('Error');
        setInfoMessage(`TikTok 授权失败：${message || '未知错误'}`);
        setIsInfoOpen(true);
      }
      window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const viewParam = params.get('view');
    const shouldOpenPosterEditor = params.get('poster_editor') === '1';
    const nextView: ViewType | null = isWorkbenchViewType(viewParam)
      ? viewParam
      : (shouldOpenPosterEditor ? 'product_images_gallery' : null);

    if (!nextView) return;

    setActiveView(nextView);

    params.delete('view');
    params.delete('poster_editor');
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true }
    );

    if (shouldOpenPosterEditor) {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('vflow:open_poster_editor'));
      }, 60);
    }
  }, [location.pathname, location.search, navigate]);

  // Listen for custom navigation events from child components (e.g. ImageHistoryPanel)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ view: ViewType }>).detail;
      if (detail?.view) setActiveView(detail.view);
    };
    window.addEventListener('vflow:navigate', handler);
    return () => window.removeEventListener('vflow:navigate', handler);
  }, []);

  useEffect(() => {
    if (activeView !== 'workbench') return;

    try {
      const raw = window.localStorage.getItem(FIRST_FRAME_TRANSFER_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        // New format (multi-image + model selection)
        imageUrls?: string[];
        model?: string;
        newProjectName?: string;
        targetProjectId?: string;
        createNewProject?: boolean;
        // Legacy format (single image)
        imageUrl?: string;
        imageName?: string;
      };

      // Support both new array format and legacy single-url format
      const urls = Array.isArray(parsed.imageUrls) && parsed.imageUrls.length > 0
        ? parsed.imageUrls.map((u) => String(u || '').trim()).filter(Boolean)
        : [String(parsed?.imageUrl || '').trim()].filter(Boolean);

      if (urls.length === 0) {
        window.localStorage.removeItem(FIRST_FRAME_TRANSFER_KEY);
        return;
      }

      // Use the first image as the workbench asset
      const primaryUrl = urls[0];
      const displayUrl = getDisplayUrl(primaryUrl) || primaryUrl;
      const requestedTargetProjectId = String(parsed.targetProjectId || '').trim() || null;
      const shouldCreateProject =
        parsed.createNewProject === true
        || (!requestedTargetProjectId && !!String(parsed.newProjectName || '').trim());

      setSelectedAssetForWorkbench({
        asset: {
          id: `first-frame-${Date.now()}`,
          name: parsed.newProjectName || parsed.imageName || 'AI首帧图',
          type: 'product',
          file_url: displayUrl,
          media_kind: 'image',
          size: '0.00 MB',
          status: 'ready',
          created_at: new Date().toISOString(),
        },
        token: `first-frame-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        mode: 'library_asset',
        targetProjectId: shouldCreateProject ? null : requestedTargetProjectId,
        forceFirstFrame: !shouldCreateProject,
      });

      // Transfer signal: create new project only when explicitly requested (or legacy payload with newProjectName only).
      if (shouldCreateProject) {
        setTransferRole('first_frame');
        setTransferProjectName(String(parsed.newProjectName || '').trim() || null);
      } else {
        setTransferRole(null);
        setTransferProjectName(null);
      }

      // Transfer model selection (Sora-family only)
      if (parsed.model && ['sora2', 'sora2pro', 'seedance2.0', 'seedance2.5'].includes(parsed.model)) {
        setTransferModel((parsed.model === 'seedance2.0' ? 'seedance2.5' : parsed.model) as 'sora2' | 'sora2pro' | 'seedance2.5');
      } else {
        setTransferModel(null);
      }

      setGeneratedVideoUrl(null);
      window.localStorage.removeItem(FIRST_FRAME_TRANSFER_KEY);
    } catch {
      window.localStorage.removeItem(FIRST_FRAME_TRANSFER_KEY);
    }
  }, [activeView]);

  // Info dialog for this page
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [infoTitle, setInfoTitle] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [transferRole, setTransferRole] = useState<'first_frame' | 'asset_apply' | null>(null);
  const [transferProjectName, setTransferProjectName] = useState<string | null>(null);
  const [transferModel, setTransferModel] = useState<'sora2' | 'sora2pro' | 'seedance2.5' | null>(null);
  const [firstFrameVideoTransfer, setFirstFrameVideoTransfer] = useState<FirstFrameToVideoTransferPayload | null>(null);

  useEffect(() => {
    if (activeView !== 'workbench') return;

    try {
      const payload = readFirstFrameToVideoTransfer();
      if (!payload) return;
      setFirstFrameVideoTransfer(payload);
      setGeneratedVideoUrl(null);
      clearFirstFrameToVideoTransfer();
    } catch {
      clearFirstFrameToVideoTransfer();
    }
  }, [activeView]);

  const handleTaskPreview = (url: string) => {
    setGeneratedVideoUrl(url);
    setActiveView('workbench');
  };

  const handleTaskNavigate = useCallback((target: { view?: string; focus?: string }) => {
    const targetViewRaw = String(target?.view || '').trim();
    const targetFocusRaw = String(target?.focus || '').trim();

    const targetView = (targetViewRaw || 'workbench') as ViewType;
    setActiveView(targetView);

    if (targetFocusRaw) {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('vflow:queue-focus', { detail: { focus: targetFocusRaw } }));
      }, 50);
    }
  }, []);

  const getSubjectGuideSeenKey = useCallback(() => `vflow_subject_guide_seen_${user?.id ?? 'guest'}`, [user?.id]);

  const hasSeenSubjectGuide = useCallback(() => {
    try {
      return window.localStorage.getItem(getSubjectGuideSeenKey()) === '1';
    } catch {
      return false;
    }
  }, [getSubjectGuideSeenKey]);

  const markSubjectGuideSeen = useCallback(() => {
    try {
      window.localStorage.setItem(getSubjectGuideSeenKey(), '1');
    } catch {
      // Ignore localStorage failures and keep the guide non-blocking.
    }
  }, [getSubjectGuideSeenKey]);

  const handleAssetsNavigationIntentHandled = useCallback(() => {
    setAssetsNavigationIntent(null);
  }, []);

  const handleNavigateToAssetsLibrary = useCallback((tab?: 'model' | 'product' | 'scene' | 'motion' | 'audio' | 'script' | 'subject') => {
    setAssetsNavigationIntent(tab
      ? { type: 'open_assets_tab', tab }
      : (
        hasSeenSubjectGuide()
          ? 'open_assets_for_subject_creation'
          : 'open_assets_for_subject_creation_first_time'
      )
    );
    setActiveView('assets');
  }, [hasSeenSubjectGuide]);

  const handleDisableDebugMode = async () => {
    setIsDebugModeUpdating(true);
    try {
      const enabled = await authApi.setDebugMode({ enabled: false });
      setIsDebugModeEnabledState(enabled);
      clearDebugModeEnabled();
      if (activeView === 'agent') setActiveView('workbench');
    } catch (err) {
      debugWarn('Failed to disable debug mode:', err);
    } finally {
      setIsDebugModeUpdating(false);
    }
  };

  useEffect(() => {
    if (!isDebugModeEnabled && activeView === 'agent') {
      setActiveView('workbench');
    }
  }, [activeView, isDebugModeEnabled]);

  const shouldShowSidebar = activeView !== 'templates' && activeView !== 'editor';
  const isProductImagesActive =
    activeView === 'product_images_clothing_swap'
    || activeView === 'product_images_first_frame'
    || activeView === 'product_images_smart_repair'
    || activeView === 'product_images_gallery'
    || activeView === 'product_images_text_separation'
    || activeView === 'product_images_ai_model';

  return (
    <WorkbenchModelProvider>
      <div className="flex h-screen overflow-hidden bg-[#050505] text-zinc-100 font-sans">
        {shouldShowSidebar && (
            <Sidebar
              activeView={activeView}
              setActiveView={setActiveView}
              isDebugModeEnabled={isDebugModeEnabled}
              theme={theme}
              setTheme={setTheme}
              collapsed={isSidebarCollapsed}
              onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
            />
        )}

        <main className="flex-1 flex flex-col overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-orange-900/10 to-transparent pointer-events-none z-0" />

          {isDebugModeEnabled && (
            <div className="absolute top-4 right-4 z-40">
              <div className="flex items-center gap-3 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-100 backdrop-blur-sm">
                <span className="font-bold tracking-widest uppercase">调试模式</span>
                <button
                  onClick={() => void handleDisableDebugMode()}
                  disabled={isDebugModeUpdating}
                  className="rounded-full bg-emerald-500/20 px-3 py-1 font-bold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-60"
                >
                  {isDebugModeUpdating ? '关闭中...' : '退出'}
                </button>
              </div>
            </div>
          )}

          <div className={activeView === 'workbench' ? 'flex-1 h-full min-h-0' : 'hidden'}>
            <ViewErrorBoundary label="WorkbenchView">
            <WorkbenchView
              initialFileUrl={selectedAssetForWorkbench?.mode === 'background_audio' ? null : (selectedAssetForWorkbench?.asset?.file_url || null)}
              initialFileName={selectedAssetForWorkbench?.mode === 'background_audio' ? '' : selectedAssetForWorkbench?.asset?.name}
              initialLibraryAsset={selectedAssetForWorkbench?.asset || null}
              initialLibraryAssetToken={selectedAssetForWorkbench?.token || null}
              initialLibraryAssetMode={selectedAssetForWorkbench?.mode || 'library_asset'}
              initialLibraryAssetTargetProjectId={selectedAssetForWorkbench?.targetProjectId || null}
              initialLibraryAssetForceFirstFrame={selectedAssetForWorkbench?.forceFirstFrame === true}
              onInitialLibraryAssetHandled={() => setSelectedAssetForWorkbench(null)}
              initialTransferRole={transferRole}
              initialTransferProjectName={transferProjectName}
              initialTransferModel={transferModel}
              onTransferRoleHandled={() => { setTransferRole(null); setTransferProjectName(null); setTransferModel(null); }}
              initialFirstFrameVideoTransfer={firstFrameVideoTransfer}
              onFirstFrameVideoTransferHandled={() => setFirstFrameVideoTransfer(null)}
              templateList={templateList}
              selectedTemplate={selectedTemplate}
              onSelectTemplate={setSelectedTemplate}
              generatedVideoUrl={generatedVideoUrl}
              setGeneratedVideoUrl={setGeneratedVideoUrl}
              onExportToServer={handleExportToServer}
              onNavigateToAssetsLibrary={handleNavigateToAssetsLibrary}
              onNavigateToProfile={() => setActiveView('profile')}
            />
            </ViewErrorBoundary>
          </div>

          <div className={activeView === 'creative_lab_skill_video' ? 'flex-1 h-full min-h-0' : 'hidden'}>
            <ViewErrorBoundary label="SkillVideoGenerationView">
              <SkillVideoGenerationView />
            </ViewErrorBoundary>
          </div>

          <div className={activeView === 'creative_lab_prompt_refine' ? 'flex-1 h-full min-h-0' : 'hidden'}>
            <ViewErrorBoundary label="SeedancePromptRefineView">
              <SeedancePromptRefineView />
            </ViewErrorBoundary>
          </div>

          <div className={activeView === 'creative_lab_replay' ? 'flex-1 h-full min-h-0' : 'hidden'}>
            <ViewErrorBoundary label="CreativeLabReplayView">
              <CreativeLabReplayView />
            </ViewErrorBoundary>
          </div>

          <div className={activeView === 'creative_lab_script_extract' ? 'flex-1 h-full min-h-0' : 'hidden'}>
            <ViewErrorBoundary label="CreativeLabScriptExtractView">
              <CreativeLabScriptExtractView />
            </ViewErrorBoundary>
          </div>

          {activeView === 'creative_lab_canvas' && (
            <ViewErrorBoundary label="CanvasComingSoon">
              <CanvasComingSoon />
            </ViewErrorBoundary>
          )}

          {activeView === 'assets' && (
            <ViewErrorBoundary label="AssetsView">
            <AssetsView
              currentFolderId={currentFolderId}
              setCurrentFolderId={setCurrentFolderId}
              navigationIntent={assetsNavigationIntent}
              onNavigationIntentHandled={handleAssetsNavigationIntentHandled}
              onSubjectGuideCompleted={markSubjectGuideSeen}
            />
            </ViewErrorBoundary>
          )}

          <div className={isProductImagesActive ? 'flex-1 min-h-0' : 'hidden'}>
            <ProductImagesView activeView={activeView} setActiveView={setActiveView} />
          </div>

          {activeView === 'templates' && (
            <TemplatesView
              templateList={templateList}
              onEditTemplate={(t) => { setEditingTemplate(t); setActiveView('editor'); }}
              onCreateTemplate={() => { setEditingTemplate(null); setActiveView('editor'); }}
              onClose={() => setActiveView('workbench')}
              refreshTemplates={loadTemplates}
            />
          )}

          {activeView === 'editor' && (
            <EditorView
              initialData={editingTemplate}
              onClose={() => setActiveView('templates')}
              onSaveSuccess={() => { loadTemplates(); setActiveView('templates'); }}
            />
          )}

          {activeView === 'history' && <HistoryView onNavigateToProfile={() => setActiveView('profile')} />}

          {activeView === 'agent' && isDebugModeEnabled && <AgentView />}

          {activeView === 'billing' && <BillingView />}

          <div className={activeView === 'ai_creator' ? 'flex-1 h-full min-h-0' : 'hidden'}>
            <AICreatorView />
          </div>

          <div className={activeView === 'community' ? 'flex-1 h-full min-h-0' : 'hidden'}>
            <ViewErrorBoundary label="CommunityView">
              <CommunityView />
            </ViewErrorBoundary>
          </div>

          {activeView === 'profile' && (
            <ProfileView
              theme={theme}
              setTheme={setTheme}
              isDebugModeEnabled={isDebugModeEnabled}
            />
          )}

          <TaskQueueWidget onPreview={handleTaskPreview} onNavigate={handleTaskNavigate} />

          <InviteRewardDialog
            isOpen={isInviteRewardOpen}
            onClose={() => setIsInviteRewardOpen(false)}
            onDismissPermanent={handleInviteRewardDismissPermanent}
          />

          <SourceSurveyDialog
            isOpen={isSourceSurveyOpen}
            onSubmitted={() => setIsSourceSurveyOpen(false)}
            onSkipped={() => setIsSourceSurveyOpen(false)}
          />

          {promoEligibility.campaign && (
            <PromoModal
              isOpen={isPromoModalOpen}
              campaign={promoEligibility.campaign}
              onClose={() => {
                setIsPromoModalOpen(false);
                if (user) promoEligibility.markDismissed(user.id);
              }}
              onPurchase={() => {
                setIsPromoModalOpen(false);
                // 标记"本会话已通过弹窗跳到计费"——之后切到 billing 时弹窗不会再次弹
                if (user) promoEligibility.markPurchaseNavigated(user.id);
                // 跳到计费页 + 用 hash 通知 BillingView 触发抢购流程（避免 Workbench 直接持有充值逻辑）
                setActiveView('billing');
                if (typeof window !== 'undefined') {
                  window.location.hash = `promo_purchase=${ACTIVE_PROMO_CAMPAIGN_ID}`;
                }
              }}
            />
          )}


          {isInfoOpen && (
            <AppDialog
              isOpen={isInfoOpen}
              title={infoTitle || 'Notice'}
              onClose={() => setIsInfoOpen(false)}
              footer={<><button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700" onClick={() => setIsInfoOpen(false)}>OK</button></>}
            >
              <div className="whitespace-pre-line text-sm text-zinc-300">{infoMessage}</div>
            </AppDialog>
          )}
        </main>
      </div>
    </WorkbenchModelProvider>
  );
};

export default Workbench;
