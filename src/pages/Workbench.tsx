import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { templatesApi, type Template } from '../services/templates';
import { assetsApi } from '../services/assets';

import { TaskQueueWidget } from '../components/workbench/TaskQueueWidget';
import { AppDialog } from '../components/common/AppDialog';
import { WorkbenchView } from '../components/workbench/WorkbenchView';
import { AssetsView } from '../components/workbench/AssetsView';
import { TemplatesView } from '../components/workbench/TemplatesView';
import { HistoryView } from '../components/workbench/HistoryView';
import { EditorView } from '../components/workbench/EditorView';
import { ProfileView } from '../components/workbench/ProfileView';
import { Sidebar } from '../components/workbench/Sidebar';
import type { ViewType } from '../components/workbench/types';
import { useLocation } from 'react-router-dom';
import { WorkbenchModelProvider } from '../context/WorkbenchModelContext';

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
  const { user } = useAuth();

  // --- Global State ---
  const [activeView, setActiveView] = useState<ViewType>('workbench');
  const [theme, setTheme] = useState<'dark' | 'light' | 'dim'>(user?.theme || 'light');

  // --- Data Passing State ---
  const [selectedAssetForWorkbench, setSelectedAssetForWorkbench] = useState<{
    url: string | null;
    name: string;
    source: 'product' | 'preference';
  } | null>(null);

  // --- Template State ---
  const [templateList, setTemplateList] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  // --- Asset State (Shared for Folder Persistency) ---
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // --- Preview State ---
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);

  // --- Effects ---
  useEffect(() => {
    if (user?.theme && user.theme !== theme) setTheme(user.theme);
  }, [user?.theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
    document.documentElement.classList.toggle('theme-dim', theme === 'dim');
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

      console.log('🚀 开始将导出的脚本同步到服务器...');
      const result = await assetsApi.uploadAsset(file, 'REFERENCE');

      if (result) {
        console.log('✅ 同步服务器成功:', result);
        setInfoTitle('Success');
        setInfoMessage('导出并保存到云端成功！');
        setIsInfoOpen(true);
      }
    } catch (error) {
      console.error('❌ 导出到服务器失败:', error);
      setInfoTitle('Error');
      setInfoMessage('保存失败，请检查控制台网络报错。');
      setIsInfoOpen(true);
    }
  };

  // --- Event Handlers ---
  const handleAssetSelect = (asset: any) => {
    setSelectedAssetForWorkbench({
      url: getDisplayUrl(asset.file_url) || null,
      name: asset.name || '',
      source: 'preference'
    });
    setGeneratedVideoUrl(null);
    setActiveView('workbench');
  };

  const location = useLocation();

  useEffect(() => {
    const state = location.state as { fromAssetLibrary?: boolean; selectedAsset?: any } | null;
    if (state?.fromAssetLibrary && state?.selectedAsset) {
      const asset = state.selectedAsset;
      setSelectedAssetForWorkbench({
        url: getDisplayUrl(asset.previewUrl || asset.file_url) || null,
        name: asset.name || '',
        source: 'preference'
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

  // Info dialog for this page
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [infoTitle, setInfoTitle] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleTaskPreview = (url: string) => {
    setGeneratedVideoUrl(url);
    setActiveView('workbench');
  };

  useEffect(() => {
    if (activeView === 'workbench' && selectedAssetForWorkbench) {
      setSelectedAssetForWorkbench(null);
    }
  }, [activeView, selectedAssetForWorkbench]);

  return (
      <WorkbenchModelProvider>
        <div className="flex h-screen overflow-hidden bg-[#050505] text-zinc-100 font-sans">

          <Sidebar activeView={activeView} setActiveView={setActiveView} />

          <main className="flex-1 flex flex-col overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-orange-900/10 to-transparent pointer-events-none z-0" />

            <div className={activeView === 'workbench' ? 'flex-1 h-full min-h-0' : 'hidden'}>
              <WorkbenchView
                  initialFileUrl={selectedAssetForWorkbench?.url}
                  initialFileName={selectedAssetForWorkbench?.name}
                  initialAssetSource={selectedAssetForWorkbench?.source}
                  templateList={templateList}
                  selectedTemplate={selectedTemplate}
                  onSelectTemplate={setSelectedTemplate}
                  generatedVideoUrl={generatedVideoUrl}
                  setGeneratedVideoUrl={setGeneratedVideoUrl}
                  onExportToServer={handleExportToServer}
              />
            </div>

            {activeView === 'assets' && (
                <AssetsView
                    onSelectAsset={handleAssetSelect}
                    currentFolderId={currentFolderId}
                    setCurrentFolderId={setCurrentFolderId}
                />
            )}

            {activeView === 'templates' && (
                <TemplatesView
                    templateList={templateList}
                    onEditTemplate={(t) => { setEditingTemplate(t); setActiveView('editor'); }}
                    onCreateTemplate={() => { setEditingTemplate(null); setActiveView('editor'); }}
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

            {activeView === 'profile' && <ProfileView theme={theme} setTheme={setTheme} />}

            <TaskQueueWidget onPreview={handleTaskPreview} />
            {isInfoOpen && (
              <AppDialog isOpen={isInfoOpen} title={infoTitle || 'Notice'} onClose={() => setIsInfoOpen(false)} footer={<><button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700" onClick={() => setIsInfoOpen(false)}>OK</button></>}>
                <div className="whitespace-pre-line text-sm text-zinc-300">{infoMessage}</div>
              </AppDialog>
            )}
          </main>
        </div>
      </WorkbenchModelProvider>
  );
};

export default Workbench;