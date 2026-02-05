import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { templatesApi, type Template } from '../services/templates';
import { TaskQueueWidget } from '../components/workbench/TaskQueueWidget';
import { WorkbenchView } from '../components/workbench/WorkbenchView';
import { AssetsView } from '../components/workbench/AssetsView';
import { TemplatesView } from '../components/workbench/TemplatesView';
import { HistoryView } from '../components/workbench/HistoryView';
import { EditorView } from '../components/workbench/EditorView';
import { ProfileView } from '../components/workbench/ProfileView';
import { Sidebar } from '../components/workbench/Sidebar'; // Remove ViewType from here
import type { ViewType } from '../components/workbench/types'; // Import ViewType from the new file
import { useLocation } from 'react-router-dom';

// Helper to get display URL for asset passing
const getDisplayUrl = (path: string | null): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const mediaBaseUrl = import.meta.env.VITE_MEDIA_BASE_URL || '';
  return mediaBaseUrl ? `${mediaBaseUrl}${path}` : path;
};

const Workbench = () => {
  const { user } = useAuth();
  
  // --- Global State ---
  const [activeView, setActiveView] = useState<ViewType>('workbench');
  const [theme, setTheme] = useState<'dark' | 'light'>(user?.theme || 'dark');
  
  // --- Data Passing State ---
  // When selecting an asset from Library to use in Workbench
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

  // --- Event Handlers ---

  const handleAssetSelect = (asset: any) => {
    // User clicked "Use in Workbench" in Assets View
    setSelectedAssetForWorkbench({
      url: getDisplayUrl(asset.file_url) || null,
      name: asset.name || '',
      source: 'preference'
    });
    setGeneratedVideoUrl(null);
    setActiveView('workbench');
  };

  const location = useLocation();

  // --- Handle Incoming Navigation State ---
  useEffect(() => {
    // Allows external pages to redirect here with a pre-selected asset
    const state = location.state as { fromAssetLibrary?: boolean; selectedAsset?: any } | null;
    
    if (state?.fromAssetLibrary && state?.selectedAsset) {
      const asset = state.selectedAsset;
      // Pre-fill the workbench with the passed asset
      setSelectedAssetForWorkbench({
        url: getDisplayUrl(asset.previewUrl || asset.file_url) || null,
        name: asset.name || '',
        source: 'preference'
      });
      setGeneratedVideoUrl(null);
      setActiveView('workbench');
      
      // Clear history state so refresh doesn't trigger it again
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tiktok = params.get('tiktok');
    const message = params.get('message');
    const code = params.get('code');
    const state = params.get('state');

    /* logic moved to App.tsx to avoid duplicate execution
    if (code && state) { ... } 
    */

    if (tiktok) {
      if (tiktok === 'success') {
        alert('TikTok 授权成功');
      } else {
        alert(`TikTok 授权失败：${message || '未知错误'}`);
      }
      window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location.pathname, location.search]);
  
  const handleTaskPreview = (url: string) => {
    setGeneratedVideoUrl(url);
    setActiveView('workbench');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#050505] text-zinc-100 font-sans">
      
      {/* 1. Sidebar */}
      <Sidebar activeView={activeView} setActiveView={setActiveView} />

      {/* 2. Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-orange-900/10 to-transparent pointer-events-none z-0" />
        
        {/* Router Switch */}
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

        {/* 3. Floating Widget */}
        <TaskQueueWidget onPreview={handleTaskPreview} />
      </main>
    </div>
  );
};

export default Workbench;