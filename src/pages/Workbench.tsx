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
import { WorkbenchView } from '../components/workbench/WorkbenchView';
import { AssetsView } from '../components/workbench/AssetsView';
import { TemplatesView } from '../components/workbench/TemplatesView';
import { HistoryView } from '../components/workbench/HistoryView';
import { AgentView } from '../components/workbench/AgentView_v2';
import { EditorView } from '../components/workbench/EditorView';
import { ProfileView } from '../components/workbench/ProfileView';
import { BillingView } from '../components/workbench/BillingView';
import { ReplayScriptView, type ReplayReusePayload } from '../components/workbench/ReplayScriptView';
import { Sidebar } from '../components/workbench/Sidebar';
import ProductImagesView from '../components/workbench/ProductImagesView';
import type { ViewType } from '../components/workbench/types';
import { useLocation } from 'react-router-dom';
import { WorkbenchModelProvider } from '../context/WorkbenchModelContext';

type AssetsNavigationIntent =
  | 'open_assets_for_subject_creation'
  | 'open_assets_for_subject_creation_first_time'
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
  const { user, justLoggedIn, consumeJustLoggedIn } = useAuth();

  // --- Global State ---
  const [activeView, setActiveView] = useState<ViewType>('workbench');
  const [theme, setTheme] = useState<'dark' | 'light' | 'dim' | 'system'>(user?.theme || 'system');
  const [isInviteRewardOpen, setIsInviteRewardOpen] = useState(false);

  // Post-login reward popup: triggered only when the user has just logged in in this session,
  // NOT when the session is restored via /api/auth/me/ on page reload.
  useEffect(() => {
    if (!justLoggedIn || !user) return;
    setIsInviteRewardOpen(true);
    consumeJustLoggedIn();
  }, [justLoggedIn, user, consumeJustLoggedIn]);

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
  const [replayReusePayload, setReplayReusePayload] = useState<ReplayReusePayload | null>(null);

  // --- Effects ---
  useEffect(() => {
    if (user?.theme && user.theme !== theme) setTheme(user.theme);
  }, [user?.theme]);

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
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: light)');

    const applyTheme = () => {
      const effectiveTheme: 'light' | 'dark' | 'dim' =
        theme === 'system'
          ? (media.matches ? 'light' : 'dark')
          : theme;
      root.classList.toggle('theme-light', effectiveTheme === 'light');
      root.classList.toggle('theme-dim', effectiveTheme === 'dim');
    };

    applyTheme();

    if (theme !== 'system') return;

    const cleanup = () => {
      root.classList.remove('theme-light', 'theme-dim');
    };

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', applyTheme);
      return () => { media.removeEventListener('change', applyTheme); cleanup(); };
    }
    media.addListener(applyTheme);
    return () => { media.removeListener(applyTheme); cleanup(); };
  }, [theme]);

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
      if (parsed.model && ['sora2', 'sora2pro', 'seedance2.0'].includes(parsed.model)) {
        setTransferModel(parsed.model as 'sora2' | 'sora2pro' | 'seedance2.0');
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
  const [transferRole, setTransferRole] = useState<'first_frame' | 'asset_apply' | 'replay_apply' | null>(null);
  const [transferProjectName, setTransferProjectName] = useState<string | null>(null);
  const [transferModel, setTransferModel] = useState<'sora2' | 'sora2pro' | 'seedance2.0' | null>(null);

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

  const handleNavigateToAssetsLibrary = useCallback(() => {
    setAssetsNavigationIntent(
      hasSeenSubjectGuide()
        ? 'open_assets_for_subject_creation'
        : 'open_assets_for_subject_creation_first_time'
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
    || activeView === 'product_images_text_separation';

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

          {activeView === 'workbench' && (
            <div className="flex-1 h-full min-h-0">
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
                templateList={templateList}
                selectedTemplate={selectedTemplate}
                onSelectTemplate={setSelectedTemplate}
                generatedVideoUrl={generatedVideoUrl}
                setGeneratedVideoUrl={setGeneratedVideoUrl}
                onExportToServer={handleExportToServer}
                onNavigateToAssetsLibrary={handleNavigateToAssetsLibrary}
                replayReusePayload={replayReusePayload}
                onReplayReusePayloadHandled={() => setReplayReusePayload(null)}
              />
              </ViewErrorBoundary>
            </div>
          )}

          <div className={activeView === 'replay_lab' ? 'flex-1 h-full min-h-0' : 'hidden'}>
            <ReplayScriptView
              onReuseToWorkbench={(payload) => {
                if (payload.createNewProject) {
                  setTransferRole('replay_apply');
                  setTransferProjectName(String(payload.newProjectName || '').trim() || null);
                  setTransferModel(null);
                } else {
                  setTransferRole(null);
                  setTransferProjectName(null);
                  setTransferModel(null);
                }
                setReplayReusePayload(payload);
                setActiveView('workbench');
              }}
            />
          </div>

          {activeView === 'assets' && (
            <ViewErrorBoundary label="AssetsView">
            <AssetsView
              currentFolderId={currentFolderId}
              setCurrentFolderId={setCurrentFolderId}
              navigationIntent={assetsNavigationIntent}
              onNavigationIntentHandled={() => setAssetsNavigationIntent(null)}
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

          {activeView === 'history' && <HistoryView />}

          {activeView === 'agent' && isDebugModeEnabled && <AgentView />}

          {activeView === 'billing' && <BillingView />}

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
          />

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
