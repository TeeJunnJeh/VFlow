import React, { useState, useRef, useEffect } from 'react';
import { 
  Zap, Image as ImageIcon, LayoutTemplate, History, UploadCloud, Plus, X, 
  SlidersHorizontal, ChevronDown, Wand2, Clapperboard, PlayCircle, Undo2, 
  RefreshCw, Trash2, MonitorPlay, Film, Play, SkipBack, SkipForward, Download, 
  Maximize, Share2, Music2, Instagram, Youtube, Send, FolderPlus, Upload, 
  Flame, Gem, ArrowRight, Settings2, Video, HardDrive, Eye, Edit3, ArrowLeft, CheckCircle, Loader2, Folder, LogOut, User as UserIcon,
  // --- NEW ICONS ---
  FileJson, FileUp, FileDown 
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext'; 
import { useTasks } from '../context/TaskContext';
import { authApi } from '../services/auth'; 
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';
import { assetsApi, type Asset, type AssetFolder } from '../services/assets'; 
import { videoApi } from '../services/video';
import { templatesApi, type Template } from '../services/templates';
import type { Asset as LibraryAsset } from '../types';

// Types
type ViewType = 'workbench' | 'assets' | 'templates' | 'history' | 'editor' | 'profile';
type AssetType = 'model' | 'product' | 'scene';

type ScriptItem = {
  id: number;
  shot: string;
  type: string;
  dur: string;
  visual: string;
  audio: string;
};

type QueuedAsset = {
  id: string;
  name: string;
  previewUrl: string | null;
  fileObj?: File | null;
  assetUrl?: string | null;
  source: 'product' | 'preference';
  uploadedPath?: string | null;
};

type QueuedScript = {
  id: string;
  name: string;
  scripts: ScriptItem[];
  duration: number;
};

// Helper: Map icons to Emojis
const ICON_EMOJI_MAP: Record<string, string> = {
  'flame': '🔥',
  'gem': '💎',
  'zap': '⚡'
};

// Helper: Map simple ratio to resolution string
const RATIO_TO_RES: Record<string, string> = {
  '16:9': '1280*720',
  '9:16': '720*1280',
  '1:1': '1080*1080',
  '4:3': '1024*768',
};

const ASSET_PLACEHOLDER_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iNDAwIiB2aWV3Qm94PSIwIDAgMzAwIDQwMCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzFmMjkzNyIvPjx0ZXh0IHg9IjE1MCIgeT0iMjAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiBmaWxsPSIjOWNhM2FmIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjAiPk5vIFByZXZpZXc8L3RleHQ+PC9zdmc+';

const Workbench = () => {
  const { t } = useLanguage();
  const { user, updateUser, updateCredits, logout } = useAuth();
  const { tasks, addTask, removeTask } = useTasks();
  const location = useLocation();

  // --- Global State ---
  const [activeView, setActiveView] = useState<ViewType>('workbench');
  const [theme, setTheme] = useState<'dark' | 'light'>(user?.theme || 'dark');

  // Sync theme with user object
  useEffect(() => {
    if (user?.theme && user.theme !== theme) {
      setTheme(user.theme);
    }
  }, [user?.theme]);

  // Handle Theme Logic
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('theme-light');
    } else {
      document.documentElement.classList.remove('theme-light');
    }
  }, [theme]);
  
  const [currentUserId, setCurrentUserId] = useState<string | number | undefined>(user?.id);

  // --- Template State ---
  const [templateList, setTemplateList] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  
  // Editor Form State
  const [editorForm, setEditorForm] = useState<Template>({
    name: 'New Template',
    icon: 'flame',
    product_category: 'camera',
    visual_style: 'realistic',
    aspect_ratio: '16:9',
    duration: 10,
    shot_number: 5,
    custom_config: ''
  });
  const categoryOptions = ['camera', 'beauty', 'food', 'electronics'] as const;
  const styleOptions = ['realistic', 'cinematic', '3d', 'anime'] as const;
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [isCustomStyle, setIsCustomStyle] = useState(false);
  const [customStyle, setCustomStyle] = useState('');

  // --- Workbench State ---
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [selectedFileObj, setSelectedFileObj] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [selectedAssetUrl, setSelectedAssetUrl] = useState<string | null>(null);
  const [selectedAssetSource, setSelectedAssetSource] = useState<'product' | 'preference' | null>(null);
  const [lastUploadedUrl, setLastUploadedUrl] = useState<string | null>(null);
  
  // Generation Config
  const [genPrompt, setGenPrompt] = useState('');
  const [genDuration, setGenDuration] = useState<number>(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);

  // Scripts State
  const [scripts, setScripts] = useState<ScriptItem[]>([
    { id: 1, shot: '1', type: 'Medium', dur: '2s', visual: t.demo_shot1_visual, audio: t.demo_shot1_audio },
    { id: 2, shot: '2', type: 'Detail', dur: '2s', visual: t.demo_shot2_visual, audio: t.demo_shot2_audio }
  ]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // --- NEW: Reference for Script JSON Upload ---
  const scriptFileInputRef = useRef<HTMLInputElement>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [assetList, setAssetList] = useState<Asset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [activeAssetTab, setActiveAssetTab] = useState<AssetType>('product');
  const [isUploading, setIsUploading] = useState(false);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const [folderList, setFolderList] = useState<AssetFolder[]>([]);
  const [folderBreadcrumb, setFolderBreadcrumb] = useState<AssetFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [moveAsset, setMoveAsset] = useState<Asset | null>(null);
  const [moveFolders, setMoveFolders] = useState<AssetFolder[]>([]);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [isMovingAsset, setIsMovingAsset] = useState(false);
  const [isMoveDropdownOpen, setIsMoveDropdownOpen] = useState(false);

  const [isAssetPreviewOpen, setIsAssetPreviewOpen] = useState(false);
  const [assetPreview, setAssetPreview] = useState<Asset | null>(null);

  // Folder create/rename modal (replace window.prompt so it matches the app style)
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState<'create' | 'rename'>('create');
  const [folderModalTarget, setFolderModalTarget] = useState<AssetFolder | null>(null);
  const [folderNameInput, setFolderNameInput] = useState('');
  
  // Nickname editing state
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [newNickname, setNewNickname] = useState(user?.name || '');
  useEffect(() => {
    if (user?.name) setNewNickname(user.name);
  }, [user?.name]);
  const [isSavingFolder, setIsSavingFolder] = useState(false);
  const folderNameInputRef = useRef<HTMLInputElement>(null);

  // Confirm modal (replace window.confirm so it matches the app style)
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [confirmIsDanger, setConfirmIsDanger] = useState(false);
  const [confirmIsWorking, setConfirmIsWorking] = useState(false);
  const confirmActionRef = useRef<null | (() => Promise<void> | void)>(null);

  // --- Reuse Queues ---
  const [assetQueue, setAssetQueue] = useState<QueuedAsset[]>([]);
  const [scriptQueue, setScriptQueue] = useState<QueuedScript[]>([]);
  const [generatedBatch, setGeneratedBatch] = useState<Array<{ id: string; assetName: string; scriptName: string; taskId: string | number }>>([]);

  // --- Effects ---
  useEffect(() => {
    const initUser = async () => {
        if (user?.id) {
            setCurrentUserId(user.id);
        } else {
            try {
                const me = await authApi.getMe();
                setCurrentUserId(me.id || me.user_id);
            } catch (e) {
                console.error("Not logged in");
            }
        }
    };
    initUser();
  }, [user]);

  useEffect(() => {
    const state = location.state as { fromAssetLibrary?: boolean; selectedAsset?: LibraryAsset } | null;
    if (state?.fromAssetLibrary && state?.selectedAsset) {
      const asset = state.selectedAsset;
      setUploadedFile(getDisplayUrl(asset.previewUrl) || null);
      setFileName(asset.name || '');
      setSelectedFileObj(null);
      setSelectedAssetUrl(asset.previewUrl || null);
      setSelectedAssetSource('preference');
      setGeneratedVideoUrl(null);
      setActiveView('workbench');
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  useEffect(() => {
    if (activeView === 'assets') {
      loadAssets();
      loadFolders();
    }
    // Load templates in both template view AND workbench view (for dropdown)
    if ((activeView === 'templates' || activeView === 'workbench') && currentUserId) loadTemplates();
  }, [activeView, currentUserId, activeAssetTab, currentFolderId]);

  useEffect(() => {
    setCurrentFolderId(null);
    setOpenFolderMenuId(null);
  }, [activeAssetTab]);

  useEffect(() => {
    if (!isFolderModalOpen) return;
    // Focus after render so it behaves like a proper dialog.
    setTimeout(() => folderNameInputRef.current?.focus(), 0);
  }, [isFolderModalOpen]);

  // Sync Demo Scripts with Language (Only if untouched)
  useEffect(() => {
    setScripts(prevScripts => {
      const isDemo = prevScripts.length === 2 && prevScripts[0].id === 1 && prevScripts[1].id === 2;
      if (isDemo) {
        return [
          { id: 1, shot: '1', type: 'Medium', dur: '2s', visual: t.demo_shot1_visual, audio: t.demo_shot1_audio },
          { id: 2, shot: '2', type: 'Detail', dur: '2s', visual: t.demo_shot2_visual, audio: t.demo_shot2_audio }
        ];
      }
      return prevScripts;
    });
  }, [t]);

  // --- DURATION LOGIC & VALIDATION ---
  
  // 1. Calculate current total duration
  const currentScriptDuration = scripts.reduce((total, s) => {
    const durationVal = parseFloat(s.dur.replace('s', '')) || 0;
    return total + durationVal;
  }, 0);

  // 2. Validation Check (Allow small float margin < 0.1)
  const isDurationValid = Math.abs(currentScriptDuration - genDuration) < 0.1;

  // 3. Handler for editable duration input
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

  // --- NEW: SCRIPT IMPORT / EXPORT FUNCTIONS ---

  const handleDownloadScripts = () => {
    if (scripts.length === 0) return alert("No scripts to download!");
    
    // Create JSON blob
    const dataStr = JSON.stringify(scripts, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    // Trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = `scripts_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
              type: item.type || 'General',
              dur: item.dur || '2s',
              visual: item.visual || '',
              audio: item.audio || ''
           }));
           setScripts(validScripts);
           
           // Optional: Update duration config to match imported script
           const newTotal = validScripts.reduce((acc: number, s: any) => acc + (parseFloat(s.dur.replace('s','')) || 0), 0);
           if (Math.abs(newTotal - genDuration) > 0.5) {
               // Update genDuration to match script if significantly different
               setGenDuration(Math.ceil(newTotal));
           }
        } else {
          alert("Invalid script format. Please upload a valid JSON file.");
        }
      } catch (err) {
        console.error(err);
        alert("Failed to parse script file.");
      }
    };
    reader.readAsText(file);
    // Reset file input so user can re-upload same file if needed
    e.target.value = '';
  };

  // --- API Actions: Templates ---
  const loadTemplates = async () => {
    if (!currentUserId) return;
    try {
      const data = await templatesApi.getTemplates(currentUserId);
      setTemplateList(data);
    } catch (err) {
      console.error("Failed to load templates", err);
    }
  };

  const handleSaveTemplate = async () => {
    if (!currentUserId) return alert("Please log in first");
    try {
      if (editingTemplate && editingTemplate.id) {
        await templatesApi.updateTemplate(currentUserId, editingTemplate.id, editorForm);
        alert("Template updated successfully!");
      } else {
        await templatesApi.addTemplate(currentUserId, editorForm);
        alert("Template created successfully!");
      }
      setActiveView('templates'); 
      loadTemplates(); 
    } catch (err) {
      console.error("Save failed", err);
      alert("Failed to save template");
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!currentUserId) return;
    try {
      await templatesApi.deleteTemplate(currentUserId, templateId);
      setTemplateList(prev => prev.filter(t => t.id !== templateId));
    } catch (err) {
      alert("Failed to delete template");
    }
  };

  const openEditor = (template?: Template) => {
    if (template) {
      setEditingTemplate(template);
      setEditorForm(template);
      const categoryIsPreset = categoryOptions.includes(template.product_category as (typeof categoryOptions)[number]);
      setIsCustomCategory(!categoryIsPreset);
      setCustomCategory(categoryIsPreset ? '' : template.product_category);
      const styleIsPreset = styleOptions.includes(template.visual_style as (typeof styleOptions)[number]);
      setIsCustomStyle(!styleIsPreset);
      setCustomStyle(styleIsPreset ? '' : template.visual_style);
    } else {
      setEditingTemplate(null);
      setEditorForm({
        name: 'New Template',
        icon: 'flame',
        product_category: 'camera',
        visual_style: 'realistic',
        aspect_ratio: '16:9',
        duration: 10,
        shot_number: 5,
        custom_config: ''
      });
      setIsCustomCategory(false);
      setCustomCategory('');
      setIsCustomStyle(false);
      setCustomStyle('');
    }
    setActiveView('editor');
  };

  // --- API Actions: Assets ---
  const loadAssets = async () => {
    setIsLoadingAssets(true);
    try {
      const data = await assetsApi.getAssets({ type: activeAssetTab, folderId: currentFolderId });
      setAssetList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load assets", err);
    } finally {
      setIsLoadingAssets(false);
    }
  };

  const loadFolders = async () => {
    try {
      const result = await assetsApi.getFolders({ type: activeAssetTab, parentId: currentFolderId });
      setFolderList(result.folders);
      setFolderBreadcrumb(result.breadcrumb);
    } catch (err) {
      console.error("Failed to load folders", err);
    }
  };

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const uploadTasks = Array.from(files).map(file => assetsApi.uploadAsset(file, activeAssetTab, currentFolderId));
      await Promise.all(uploadTasks);
      await loadAssets(); 
      alert(`Successfully uploaded ${files.length} files!`);
    } catch (err) {
      alert("An error occurred during upload.");
    } finally {
      setIsUploading(false);
      if (assetInputRef.current) assetInputRef.current.value = '';
    }
  };

  const deleteAssetById = async (id: string) => {
    try {
      await assetsApi.deleteAsset(id);
      setAssetList(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      alert("Failed to delete asset");
    }
  };

  const openCreateFolderModal = () => {
    setFolderModalMode('create');
    setFolderModalTarget(null);
    setFolderNameInput('');
    setIsSavingFolder(false);
    setIsFolderModalOpen(true);
  };

  const handleRenameFolder = async (folder: AssetFolder) => {
    setOpenFolderMenuId(null);
    setFolderModalMode('rename');
    setFolderModalTarget(folder);
    setFolderNameInput(folder.name);
    setIsSavingFolder(false);
    setIsFolderModalOpen(true);
  };

  const closeFolderModal = () => {
    setIsFolderModalOpen(false);
    setFolderModalTarget(null);
    setFolderNameInput('');
    setIsSavingFolder(false);
  };

  const submitFolderModal = async () => {
    const name = folderNameInput.trim();
    if (!name) return;
    setIsSavingFolder(true);
    try {
      if (folderModalMode === 'create') {
        await assetsApi.createFolder(name, activeAssetTab, currentFolderId);
      } else if (folderModalMode === 'rename' && folderModalTarget) {
        await assetsApi.renameFolder(folderModalTarget.id, name);
      }
      await loadFolders();
      closeFolderModal();
    } catch (err) {
      alert((err as Error)?.message || "Failed to save folder");
      setIsSavingFolder(false);
    }
  };

  const handleDeleteFolder = async (folder: AssetFolder) => {
    try {
      await assetsApi.deleteFolder(folder.id);
      // If we deleted the folder we are currently in, go back to root.
      if (currentFolderId === folder.id) setCurrentFolderId(null);
      await loadFolders();
    } catch (err) {
      const msg = (err as Error)?.message || "Failed to delete folder";
      if (msg.includes('文件夹非空') || msg.toLowerCase().includes('not empty')) {
        alert(t.assets_folder_not_empty_hint);
      } else {
        alert(msg);
      }
    } finally {
      setOpenFolderMenuId(null);
    }
  };

  const closeConfirmModal = () => {
    if (confirmIsWorking) return;
    setIsConfirmModalOpen(false);
    setConfirmTitle('');
    setConfirmMessage(null);
    setConfirmIsDanger(false);
    setConfirmIsWorking(false);
    confirmActionRef.current = null;
  };

  const openConfirmModal = (opts: { title: string; message?: string; danger?: boolean; onConfirm: () => Promise<void> | void }) => {
    setConfirmTitle(opts.title);
    setConfirmMessage(opts.message || null);
    setConfirmIsDanger(Boolean(opts.danger));
    setConfirmIsWorking(false);
    confirmActionRef.current = opts.onConfirm;
    setIsConfirmModalOpen(true);
  };

  const runConfirmAction = async () => {
    if (!confirmActionRef.current) return;
    setConfirmIsWorking(true);
    try {
      await confirmActionRef.current();
      closeConfirmModal();
    } catch (err) {
      // The action handler should surface any meaningful errors itself.
      setConfirmIsWorking(false);
    }
  };

  const openMoveDialog = async (asset: Asset) => {
    setMoveAsset(asset);
    setMoveTargetFolderId(asset.folder_id ?? null);
    setIsMoveModalOpen(true);
    setIsMoveDropdownOpen(false);
    try {
      const folders = await assetsApi.getAllFolders(activeAssetTab);
      setMoveFolders(folders);
    } catch (err) {
      alert((err as Error)?.message || "Failed to load folders");
    }
  };

  const closeMoveDialog = () => {
    setIsMoveModalOpen(false);
    setMoveAsset(null);
    setMoveTargetFolderId(null);
    setMoveFolders([]);
    setIsMoveDropdownOpen(false);
  };

  const buildFolderOptions = (folders: AssetFolder[]) => {
    const byParent = new Map<string | null, AssetFolder[]>();
    for (const f of folders) {
      const key = f.parent_id ?? null;
      const list = byParent.get(key) || [];
      list.push(f);
      byParent.set(key, list);
    }
    for (const list of byParent.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    const out: Array<{ id: string; label: string }> = [];
    const walk = (parentId: string | null, depth: number) => {
      const children = byParent.get(parentId) || [];
      for (const child of children) {
        const prefix = depth > 0 ? `${'--'.repeat(depth)} ` : '';
        out.push({ id: child.id, label: `${prefix}${child.name}` });
        walk(child.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  };

  const handleConfirmMove = async () => {
    if (!moveAsset) return;
    setIsMovingAsset(true);
    try {
      await assetsApi.moveAsset(moveAsset.id, moveTargetFolderId);
      await loadAssets();
      closeMoveDialog();
    } catch (err) {
      alert((err as Error)?.message || "Failed to move asset");
    } finally {
      setIsMovingAsset(false);
    }
  };

  // Helper: Convert path to displayable URL
  const getDisplayUrl = (path: string | null): string | null => {
    if (!path) return null;
    // If it's already a full URL (http/https), use as-is
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    // If it's a relative path (/media/...), prepend API base URL
    if (path.startsWith('/')) {
      // In development, keep relative so Vite proxy (`/media`) can work.
      // In production, you can set VITE_MEDIA_BASE_URL to an absolute origin if needed.
      const mediaBaseUrl = import.meta.env.VITE_MEDIA_BASE_URL || '';
      return mediaBaseUrl ? `${mediaBaseUrl}${path}` : path;
    }
    // Otherwise (blob:..., data:...), use as-is
    return path;
  };

  const openAssetPreview = (asset: Asset) => {
    setAssetPreview(asset);
    setIsAssetPreviewOpen(true);
  };

  const closeAssetPreview = () => {
    setIsAssetPreviewOpen(false);
    setAssetPreview(null);
  };

  const buildCombinedScriptPrompt = (scriptList: ScriptItem[]) => {
    return scriptList
      .map(s => {
        const visual = s.visual || '';
        const audio = s.audio || '';
        const audioMarker = audio ? `【音频|【[旁白]】${audio}】` : '';
        return `${visual} ${audioMarker}`.trim();
      })
      .filter(v => v && v.trim().length > 0)
      .join(' ');
  };

  const addCurrentAssetToQueue = () => {
    if (!selectedFileObj && !selectedAssetUrl) {
      alert('请先选择或上传素材');
      return;
    }

    const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const previewUrl = uploadedFile || getDisplayUrl(selectedAssetUrl) || null;
    const name = fileName || '未命名素材';

    setAssetQueue(prev => ([
      ...prev,
      {
        id: newId,
        name,
        previewUrl,
        fileObj: selectedFileObj,
        assetUrl: selectedAssetUrl,
        source: selectedAssetSource || (selectedFileObj ? 'product' : 'preference'),
        uploadedPath: null
      }
    ]));
  };

  const removeAssetFromQueue = (id: string) => {
    setAssetQueue(prev => prev.filter(a => a.id !== id));
  };

  const addCurrentScriptToQueue = () => {
    if (scripts.length === 0) {
      alert('请先生成或添加脚本');
      return;
    }
    if (!isDurationValid) {
      alert(`脚本总时长(${currentScriptDuration.toFixed(1)}s)需要与配置时长(${genDuration}s)一致`);
      return;
    }

    const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = `脚本 ${scriptQueue.length + 1}`;
    const copiedScripts = scripts.map(s => ({ ...s }));

    setScriptQueue(prev => ([
      ...prev,
      {
        id: newId,
        name,
        scripts: copiedScripts,
        duration: genDuration
      }
    ]));
  };

  const removeScriptFromQueue = (id: string) => {
    setScriptQueue(prev => prev.filter(s => s.id !== id));
  };

  // --- Workbench Actions ---
  const handleWorkbenchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setUploadedFile(url);
      setFileName(file.name);
      setSelectedFileObj(file);
      setSelectedAssetUrl(null);
      setSelectedAssetSource('product');
      setGeneratedVideoUrl(null);
    }
  };

  const removeUpload = (e: React.MouseEvent) => {
    e.stopPropagation();
    setUploadedFile(null);
    setSelectedFileObj(null);
    setFileName('');
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const res = await authApi.updateProfile({ avatar: file });
        if (res.data?.avatar) {
          updateUser({ avatar: res.data.avatar });
        }
      } catch (err) {
        console.error("Avatar upload failed", err);
        alert("Failed to upload avatar");
      }
    }
  };

  const handleUseDefaultAvatar = async () => {
    // Note: If we want to truly clear it on backend, we might need a specific flag or null value
    // For now, let's just update local and perhaps backend with a placeholder if needed
    updateUser({ avatar: '' });
  };

  // --- Script Actions (Add/Remove) ---
  const addScript = () => {
    // Generate unique ID
    const newId = scripts.length > 0 ? Math.max(...scripts.map(s => s.id)) + 1 : 1;
    const nextShotNum = scripts.length + 1;
    // Default duration split evenly or just 2s
    setScripts([...scripts, { 
      id: newId, 
      shot: nextShotNum.toString(), 
      type: 'Medium', 
      dur: '2s', 
      visual: '', 
      audio: '' 
    }]);
  };

  const removeScript = (id: number) => {
    const remaining = scripts.filter(s => s.id !== id);
    // Re-index shots visually
    const reindexed = remaining.map((s, index) => ({
      ...s,
      shot: (index + 1).toString()
    }));
    setScripts(reindexed);
  };

  // --- API: Script Generation ---
  const handleGenerateScripts = async () => {
    if (!currentUserId) return alert("Please log in first");
    
    setIsGeneratingScript(true);

    try {
      let imagePath = "";

      // 1. Upload Image
      if (selectedFileObj) {
        console.log("🚀 Uploading reference image for script...");
        const uploadResp = await assetsApi.uploadAsset(selectedFileObj, 'product');
        
        let rawPath = null;
        if (uploadResp.assets && Array.isArray(uploadResp.assets) && uploadResp.assets.length > 0) {
            rawPath = uploadResp.assets[0].url || uploadResp.assets[0].file_url || uploadResp.assets[0].path;
        } else {
            rawPath = uploadResp.url || uploadResp.file_url || uploadResp.path || uploadResp.data?.url;
        }

        if (rawPath) {
          setLastUploadedUrl(rawPath);
          // Send raw path directly to backend (backend will handle URL vs path)
          imagePath = rawPath;
        }
      } else if (selectedAssetUrl) {
        setLastUploadedUrl(selectedAssetUrl);
        // Send raw URL directly to backend
        imagePath = selectedAssetUrl;
      }


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
        // Root level prompt for backend safety
        user_prompt: promptText,
        prompt: promptText,
        input: promptText, 

        product_category: category, 
        visual_style: style,
        aspect_ratio: resolution,
        
        script_content: {
            duration: duration,
            shot_number: shots,
            custom: selectedTemplate?.custom_config || "突出夜景拍摄",
            // Inner level prompt
            input: promptText,
            prompt: promptText,
            user_prompt: promptText,
            shots: [] 
        },
        product_image_path: imagePath || "http://1.95.137.119:8001/media/uploads/default.jpg",
        asset_source: selectedAssetSource || (selectedFileObj ? 'product' : 'preference')
      };

      console.log("📜 Generating Script with payload:", payload);

      const response = await videoApi.generateScript(currentUserId, payload);
      
      console.log("✅ Script Generated:", response);

      if (response.code === 0 && response.data?.script_content?.shots) {
        const newScripts = response.data.script_content.shots.map((shot: any) => ({
            id: shot.shot_index,
            shot: shot.shot_index.toString(),
            type: 'General', 
            dur: `${shot.duration_sec}s`,
            visual: shot.visual,
            audio: shot.audio || shot.voiceover || shot.beat 
        }));
        setScripts(newScripts);
      } else {
        alert("Script generation completed but returned unexpected data.");
      }

    } catch (err: any) {
      console.error("Script Gen Error:", err);
      let msg = err.message;
      try {
         const jsonPart = err.message.substring(err.message.indexOf('{'));
         const parsed = JSON.parse(jsonPart);
         if (parsed.message) msg = parsed.message;
      } catch (e) {}
      alert(`Script Generation Failed: ${msg}`);
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleBatchGenerate = async () => {
    if (!selectedTemplate?.id) {
      alert('请先在配置面板选择模板');
      return;
    }
    if (assetQueue.length === 0 || scriptQueue.length === 0) {
      alert('请先把素材和脚本都加入队列');
      return;
    }

    setIsGenerating(true);
    setGeneratedVideoUrl(null);
    setGeneratedBatch([]);

    const results: Array<{ id: string; assetName: string; scriptName: string; taskId: string | number }> = [];
    let errorCount = 0;

    const ensureAssetPath = async (asset: QueuedAsset) => {
      if (asset.uploadedPath) return asset.uploadedPath;

      let rawPath: string | null = null;
      if (asset.fileObj) {
        const uploadResp = await assetsApi.uploadAsset(asset.fileObj, 'product');
        if (uploadResp.assets && Array.isArray(uploadResp.assets) && uploadResp.assets.length > 0) {
          rawPath = uploadResp.assets[0].url || uploadResp.assets[0].file_url || uploadResp.assets[0].path;
        } else {
          rawPath = uploadResp.url || uploadResp.file_url || uploadResp.path || uploadResp.data?.url;
        }
      } else if (asset.assetUrl) {
        rawPath = asset.assetUrl;
      }

      if (!rawPath) throw new Error('无法获取素材路径');

      setAssetQueue(prev => prev.map(a => a.id === asset.id ? { ...a, uploadedPath: rawPath } : a));
      return rawPath;
    };

    const cloneProjectId = async () => {
      const cloneResp = await videoApi.cloneProject(selectedTemplate.id!);
      const newId = cloneResp?.data?.new_project_id || cloneResp?.new_project_id || cloneResp?.data?.id;
      if (!newId) throw new Error('克隆模板失败');
      return newId;
    };

    try {
      for (const asset of assetQueue) {
        let apiPath: string | null = null;
        try {
          apiPath = await ensureAssetPath(asset);
        } catch (e) {
          errorCount += 1;
          continue;
        }

        for (const scriptItem of scriptQueue) {
          try {
            const combinedScriptPrompt = buildCombinedScriptPrompt(scriptItem.scripts);
            if (!combinedScriptPrompt) throw new Error('脚本内容为空');

            const newProjectId = await cloneProjectId();

            const payload = {
              prompt: combinedScriptPrompt,
              project_id: newProjectId,
              duration: scriptItem.duration,
              image_path: apiPath,
              sound: "on" as const,
              asset_source: asset.source
            };

            const genResp = await videoApi.generate(payload);
            const taskId = genResp?.data?.task_id || genResp?.task_id;
            const projectId = genResp?.data?.project_id || newProjectId;

            if (genResp?.code === 0 && taskId) {
              addTask({
                id: taskId,
                projectId: String(projectId),
                type: 'video_generation',
                status: 'processing',
                name: `${asset.name} × ${scriptItem.name}`,
                thumbnail: asset.previewUrl || undefined,
                createdAt: Date.now(),
              });

              results.push({
                id: `${asset.id}-${scriptItem.id}`,
                assetName: asset.name,
                scriptName: scriptItem.name,
                taskId,
              });
            } else {
              errorCount += 1;
            }
          } catch (e) {
            errorCount += 1;
          }
        }
      }
    } finally {
      setGeneratedBatch(results);
      setIsGenerating(false);
      if (results.length === 0) {
        alert('未提交任何任务，请检查队列或网络状态');
      } else if (errorCount > 0) {
        alert(`已提交 ${results.length} 个任务，其中有 ${errorCount} 个提交失败`);
      } else {
        alert(`已提交 ${results.length} 个后台任务，正在生成中…`);
      }
    }
  };

  // --- API: Video Generation ---
  const handleGenerateVideo = async () => {
    if (assetQueue.length > 0 || scriptQueue.length > 0) {
      await handleBatchGenerate();
      return;
    }
    // Validation
    if (!selectedFileObj && !selectedAssetUrl) return alert("Please upload a reference image first!");
    if (scripts.length === 0) return alert("Please generate or add scripts first!");
    if (!selectedTemplate?.id) return alert("Please select a Template from the Config panel first!");
    if (!isDurationValid) return alert(`Total script duration (${currentScriptDuration}s) must match requested duration (${genDuration}s)!`);

    setIsGenerating(true);
    setGeneratedVideoUrl(null); 

    try {
      let rawPath: string | null = null;
      if (selectedFileObj) {
        console.log("🚀 Uploading reference image...");
        const uploadResp = await assetsApi.uploadAsset(selectedFileObj, 'product');
        if (uploadResp.assets && Array.isArray(uploadResp.assets) && uploadResp.assets.length > 0) {
          rawPath = uploadResp.assets[0].url || uploadResp.assets[0].file_url || uploadResp.assets[0].path;
        } else {
          rawPath = uploadResp.url || uploadResp.file_url || uploadResp.path || uploadResp.data?.url;
        }
        if (!rawPath) throw new Error("Could not find image path in response");
      } else if (selectedAssetUrl) {
        rawPath = selectedAssetUrl;
      }

      if (!rawPath) throw new Error("Could not find image path");
      setLastUploadedUrl(rawPath);

      // Send raw path directly to backend (backend will handle URL vs path)
      const apiPath = rawPath;


      // Combine Scripts into Prompt (with audio markers)
      const combinedScriptPrompt = scripts
        .map(s => {
          const visual = s.visual || '';
          const audio = s.audio || '';
          const audioMarker = audio ? `【音频|【[旁白]】${audio}】` : '';
          return `${visual} ${audioMarker}`.trim();
        })
        .filter(v => v && v.trim().length > 0)
        .join(' '); 

      if (!combinedScriptPrompt) throw new Error("Scripts are empty.");

      // Clone the selected template into a new Project, so each generation has its own history record.
      const cloneResp = await videoApi.cloneProject(selectedTemplate.id);
      const newProjectId =
        cloneResp?.data?.new_project_id ||
        cloneResp?.new_project_id ||
        cloneResp?.data?.id;
      if (!newProjectId) throw new Error('克隆模板失败');

      const payload = {
        prompt: combinedScriptPrompt,
        project_id: newProjectId,
        duration: genDuration,
        image_path: apiPath, 
        sound: "on" as const,
        asset_source: selectedAssetSource || (selectedFileObj ? 'product' : 'preference')
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
          name: `${selectedTemplate.name || 'Video'} (${String(projectId).slice(0, 6)})`,
          thumbnail: uploadedFile || apiPath || undefined,
          createdAt: Date.now(),
        });
        alert("任务已提交到后台运行，您可以继续修改参数生成下一个！");
      } else {
        alert("提交成功，但未返回任务ID。");
      }
    } catch (err: any) {
      alert(`Error: ${err.message || 'Generation failed'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const renderTaskQueue = () => {
    if (!tasks || tasks.length === 0) return null;

    const activeCount = tasks.filter(t => t.status === 'pending' || t.status === 'processing').length;
    const recentTasks = tasks.slice(0, 6);

    return (
      <div className="absolute bottom-4 right-4 bg-zinc-900/90 border border-white/10 rounded-xl p-3 shadow-2xl w-72 z-50 backdrop-blur">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            后台任务 {activeCount > 0 ? `(${activeCount} 进行中)` : ''}
          </h3>
        </div>

        <div className="space-y-2 max-h-52 overflow-y-auto custom-scroll pr-1">
          {recentTasks.map(t => {
            const url = t.result?.video_url || t.result?.url;
            const isActive = t.status === 'pending' || t.status === 'processing';

            return (
              <div key={t.id} className="flex items-center gap-2 text-[11px]">
                {isActive ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500 shrink-0" />
                ) : t.status === 'success' ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                ) : (
                  <X className="w-3.5 h-3.5 text-red-500 shrink-0" />
                )}

                <button
                  className="flex-1 text-left truncate text-zinc-200 hover:text-orange-400 transition"
                  onClick={() => {
                    if (url) {
                      setGeneratedVideoUrl(url);
                      setActiveView('workbench');
                    }
                  }}
                  title={t.name || `Task ${t.id}`}
                >
                  {t.name || `Task ${t.id}`}
                </button>

                <button
                  onClick={() => removeTask(t.id)}
                  className="text-zinc-500 hover:text-zinc-200 transition"
                  title="移除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // --- Components ---
  const InternalNav = ({ icon: Icon, view, label }: { icon: any, view: ViewType, label: string }) => (
    <div onClick={() => setActiveView(view)} className={`h-12 w-full rounded-xl flex items-center justify-center cursor-pointer transition group relative ${activeView === view ? 'text-orange-500 bg-orange-500/10' : 'text-zinc-500 hover:text-white'}`} title={label}>
      <Icon className={`w-5 h-5 transition-all ${activeView === view ? 'stroke-[2.5px]' : ''}`} />
      {activeView === view && (<div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-orange-500 rounded-r-full" />)}
    </div>
  );
  const filteredAssets = assetList.filter(a => a.type === activeAssetTab);
  const isReuseReady = assetQueue.length > 0 && scriptQueue.length > 0;
  const expectedBatchCount = isReuseReady ? assetQueue.length * scriptQueue.length : 0;

  // --- RENDER ---
  return (
    <div className="flex h-screen overflow-hidden bg-[#050505] text-zinc-100 font-sans">
      
      {/* Sidebar */}
      <aside className="w-16 lg:w-20 bg-zinc-950 border-r border-white/5 flex flex-col items-center py-6 gap-6 z-30 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-orange-500 flex items-center justify-center font-bold italic text-black mb-2 shadow-lg shadow-orange-500/20">VF</div>
        <div className="flex flex-col gap-4 w-full px-2">
          <InternalNav icon={Zap} view="workbench" label={t.wb_nav_workbench} />
          <InternalNav icon={ImageIcon} view="assets" label={t.wb_nav_assets} />
          <InternalNav icon={LayoutTemplate} view="templates" label={t.wb_nav_templates} />
          <InternalNav icon={History} view="history" label={t.wb_nav_history} />
        </div>
        
        {/* Profile / Logout Section */}
        <div className="mt-auto pb-6 w-full px-2 flex flex-col items-center gap-4">
          <div 
            onClick={() => setActiveView('profile')}
            className={`w-10 h-10 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300 border group relative overflow-hidden ${activeView === 'profile' ? 'border-orange-500 bg-orange-500/10 shadow-[0_0_15px_rgba(249,115,22,0.2)]' : 'border-white/5 bg-zinc-900/50 hover:border-white/20'}`}
            title={t.profile_title}
          >
            {user?.avatar ? (
              <img src={user.avatar} className="w-full h-full object-cover" alt="Profile" />
            ) : (
              <div className={`transition-colors ${activeView === 'profile' ? 'text-orange-500' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                <UserIcon className="w-5 h-5" />
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-orange-900/10 to-transparent pointer-events-none z-0" />
        
        {/* 1. WORKBENCH VIEW */}
        {activeView === 'workbench' && (
          <div className="flex flex-col h-full z-10 animate-in fade-in zoom-in-95 duration-300">
            <header className="flex justify-between items-center px-8 py-4 border-b border-white/5 bg-black/20 backdrop-blur-sm shrink-0 relative z-50">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-bold tracking-tight text-white">Project_Alpha_01</h1>
                <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-white/5">{t.wb_header_draft}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-xs text-zinc-500">{t.wb_header_save}</div>
                <LanguageSwitcher />
              </div>
            </header>

            <div className="flex-1 flex overflow-hidden p-6 gap-6">
              {/* Left Column */}
              <div className="w-[280px] xl:w-[320px] flex flex-col gap-6 shrink-0 h-full overflow-y-auto custom-scroll pr-1">
                {/* Upload */}
                <div className="flex flex-col gap-3">
                  <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><UploadCloud className="w-3 h-3" /> {t.wb_upload_title}</h2>
                  <div onClick={() => fileInputRef.current?.click()} className={`glass-panel rounded-xl p-1 border-2 border-dashed border-zinc-800 hover:border-orange-500/50 transition-colors h-32 relative group cursor-pointer ${uploadedFile ? 'border-none' : ''}`}>
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleWorkbenchUpload} />
                    {!uploadedFile ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
                        <div className="w-8 h-8 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center mb-2 group-hover:scale-110 transition duration-300"><Plus className="w-4 h-4 text-zinc-500 group-hover:text-orange-500" /></div>
                        <p className="text-[10px] font-medium text-zinc-400">{t.wb_upload_click}</p>
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-zinc-900 rounded-lg overflow-hidden group/preview">
                        <img src={uploadedFile} className="w-full h-full object-cover opacity-80" alt="Preview" />
                        <div className="absolute top-2 right-2 opacity-0 group-hover/preview:opacity-100 transition"><button onClick={removeUpload} className="p-1.5 bg-black/50 hover:bg-red-500 rounded-md text-white transition"><X className="w-3 h-3" /></button></div>
                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent"><p className="text-[10px] text-white truncate">{fileName}</p><p className="text-[10px] text-green-400 flex items-center gap-1"><CheckCircle className="w-2 h-2" /> {t.wb_ready}</p></div>
                      </div>
                    )}
                  </div>
                  {lastUploadedUrl && (
                    <div className="text-[10px] text-zinc-500 break-all">
                      Last uploaded URL: {lastUploadedUrl}
                    </div>
                  )}
                </div>

                {/* Reuse Queues */}
                <div className="flex flex-col gap-3">
                  <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><FolderPlus className="w-3 h-3" /> 复用队列</h2>
                  <div className="glass-panel rounded-xl p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-zinc-400 font-bold uppercase">素材队列</div>
                      <button
                        onClick={addCurrentAssetToQueue}
                        disabled={!uploadedFile && !selectedAssetUrl}
                        className={`text-[10px] px-2 py-1 rounded border border-white/10 ${!uploadedFile && !selectedAssetUrl ? 'text-zinc-600' : 'text-orange-500 hover:bg-white/5'}`}
                      >
                        加入素材队列
                      </button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scroll pr-1">
                      {assetQueue.length === 0 ? (
                        <div className="text-[10px] text-zinc-600">暂无素材</div>
                      ) : (
                        assetQueue.map(item => (
                          <div key={item.id} className="flex items-center gap-2 bg-black/30 rounded-lg p-2 border border-white/5">
                            <div className="w-8 h-8 rounded bg-zinc-800 overflow-hidden shrink-0">
                              {item.previewUrl ? (
                                <img src={item.previewUrl} alt={item.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-600 text-[8px]">无预览</div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] text-zinc-200 truncate">{item.name}</div>
                              <div className="text-[9px] text-zinc-500">来源：{item.source === 'product' ? '本地上传' : '素材库'}</div>
                            </div>
                            <button onClick={() => removeAssetFromQueue(item.id)} className="text-zinc-600 hover:text-red-400 p-1">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-zinc-400 font-bold uppercase">脚本队列</div>
                      <button
                        onClick={addCurrentScriptToQueue}
                        className="text-[10px] px-2 py-1 rounded border border-white/10 text-orange-500 hover:bg-white/5"
                      >
                        加入脚本队列
                      </button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scroll pr-1">
                      {scriptQueue.length === 0 ? (
                        <div className="text-[10px] text-zinc-600">暂无脚本</div>
                      ) : (
                        scriptQueue.map(item => (
                          <div key={item.id} className="flex items-center gap-2 bg-black/30 rounded-lg p-2 border border-white/5">
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] text-zinc-200 truncate">{item.name}</div>
                              <div className="text-[9px] text-zinc-500">镜头数：{item.scripts.length} · 时长：{item.duration}s</div>
                            </div>
                            <button onClick={() => removeScriptFromQueue(item.id)} className="text-zinc-600 hover:text-red-400 p-1">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="text-[10px] text-zinc-500">
                      预计生成：{assetQueue.length} × {scriptQueue.length} = {expectedBatchCount}
                    </div>
                  </div>
                </div>

                {/* Config */}
                <div className={`flex flex-col gap-3 flex-1 transition-opacity duration-500 ${!uploadedFile ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className="flex justify-between items-center"><h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><SlidersHorizontal className="w-3 h-3" /> {t.wb_config_title}</h2></div>
                  <div className="glass-panel rounded-xl p-5 flex flex-col gap-5">
                    <div>
                      <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase flex justify-between">{t.wb_config_template_label}</label>
                      <div className="relative">
                        <select 
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-orange-500 font-bold focus:outline-none focus:border-orange-500 transition appearance-none cursor-pointer hover:bg-white/5"
                            value={selectedTemplate?.id || ""}
                            onChange={(e) => {
                                const tpl = templateList.find(t => t.id === e.target.value);
                                if (tpl) {
                                    setSelectedTemplate(tpl);
                                    setGenDuration(tpl.duration); 
                                } else {
                                    setSelectedTemplate(null);
                                }
                            }}
                        >
                          <option value="">{t.wb_config_custom}</option>
                          {templateList.map(tpl => (
                              <option key={tpl.id} value={tpl.id}>
                                  {ICON_EMOJI_MAP[tpl.icon] || '🔥'} {tpl.name}
                              </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-3 top-2.5 pointer-events-none" />
                      </div>
                    </div>
                    <hr className="border-white/5" />
                    <div>
                      <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_prompt_label}</label>
                      <textarea className="w-full bg-black/40 text-xs text-zinc-300 p-3 rounded-lg border border-white/10 focus:border-orange-500 focus:outline-none resize-none min-h-[80px]" placeholder={t.wb_config_prompt_placeholder} value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_duration}</label>
                      <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                        {[5, 10, 15].map(d => (
                          <button key={d} onClick={() => setGenDuration(d)} className={`flex-1 py-1.5 rounded-md text-[10px] font-medium transition ${genDuration === d ? 'bg-zinc-800 text-white shadow' : 'text-zinc-400 hover:bg-zinc-800'}`}>{d}s</button>
                        ))}
                      </div>
                    </div>
                    <button 
                        onClick={handleGenerateScripts} 
                        disabled={isGeneratingScript}
                        className="w-full bg-white text-black py-3 rounded-xl font-bold text-xs hover:bg-orange-500 hover:text-white transition shadow-lg shadow-white/5 mt-2 flex items-center justify-center gap-2 group"
                    >
                        {isGeneratingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 group-hover:rotate-12 transition" />} 
                        {isGeneratingScript ? 'Generating...' : t.wb_btn_gen_scripts}
                    </button>
                  </div>
                </div>
              </div>

              {/* Middle Column */}
              <div className="flex-1 flex flex-col gap-3 h-full min-w-[300px]">
                {/* --- HEADER --- */}
                <div className="flex justify-between items-center shrink-0 h-[32px]">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Clapperboard className="w-3 h-3" /> {t.wb_col_scripts}</h2>
                    
                    {/* Duration Indicator */}
                    <div className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDurationValid ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                        {currentScriptDuration.toFixed(1)}s / {genDuration}s
                    </div>

                    {/* Import/Export Buttons */}
                    <div className="flex items-center gap-1 ml-2 border-l border-white/10 pl-3">
                        <button 
                            onClick={handleDownloadScripts} 
                            className="p-1 text-zinc-500 hover:text-white hover:bg-white/5 rounded transition"
                            title="Export Script (JSON)"
                        >
                            <FileDown className="w-3.5 h-3.5" />
                        </button>
                        <button 
                            onClick={() => scriptFileInputRef.current?.click()} 
                            className="p-1 text-zinc-500 hover:text-white hover:bg-white/5 rounded transition"
                            title="Import Script (JSON)"
                        >
                            <FileUp className="w-3.5 h-3.5" />
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

                  <button 
                    onClick={handleGenerateVideo} 
                    disabled={isGenerating || (!isReuseReady && (!uploadedFile || !isDurationValid))} 
                    className={`bg-gradient-to-r from-purple-600 to-orange-500 text-white px-4 py-1.5 rounded-lg font-bold text-xs hover:brightness-110 active:scale-95 transition flex items-center gap-2 shadow-lg shadow-orange-500/20 ${isGenerating || (!isReuseReady && !isDurationValid) ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                    title={!isReuseReady && !isDurationValid ? `Total duration must match ${genDuration}s` : ''}
                  >
                     {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4 fill-current" />}
                     {isGenerating ? 'Generating...' : t.wb_btn_gen_video}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-4 pb-10">
                  {scripts.length === 0 ? (
                      // --- EMPTY STATE ---
                      <div className="h-64 flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-zinc-800 rounded-xl bg-black/20">
                          <FileJson className="w-10 h-10 mb-2 opacity-50" />
                          <p className="text-xs">No scripts yet.</p>
                          <div className="flex gap-2 mt-3">
                              <button onClick={() => scriptFileInputRef.current?.click()} className="text-[10px] text-orange-500 hover:underline">Upload JSON</button>
                              <span className="text-[10px]">•</span>
                              <button onClick={handleGenerateScripts} className="text-[10px] text-orange-500 hover:underline">Generate AI Script</button>
                          </div>
                      </div>
                  ) : (
                      scripts.map((script, index) => (
                        <div key={script.id} className={`glass-card p-4 rounded-xl group relative border-l-2 ${index % 2 === 0 ? 'border-l-purple-500' : 'border-l-orange-500'}`}>
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                    <span className={`${index % 2 === 0 ? 'bg-purple-600' : 'bg-orange-500'} text-black text-[10px] font-bold px-1.5 py-0.5 rounded-sm`}>{t.wb_shot} {script.shot}</span>
                                    <span className="text-[10px] text-zinc-400 border border-white/10 px-1.5 rounded">{script.type}</span>
                                    {/* Editable Duration Input */}
                                    <div className="flex items-center bg-black/20 border border-white/10 rounded px-1.5 gap-0.5">
                                        <input type="number" step="0.1" min="0.1" className="w-8 bg-transparent text-[10px] text-zinc-300 focus:outline-none text-right" value={parseFloat(script.dur.replace('s',''))} onChange={(e) => handleDurationChange(script.id, e.target.value)} />
                                        <span className="text-[10px] text-zinc-500">s</span>
                                    </div>
                                </div>
                                <button onClick={() => removeScript(script.id)} className="text-zinc-600 hover:text-red-500 transition p-1 hover:bg-white/5 rounded"><X className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                                <div className="relative group/input">
                                    <p className="text-[9px] text-zinc-600 uppercase font-bold absolute top-2 left-2 pointer-events-none">{t.wb_visual}</p>
                                    <textarea className="w-full bg-black/20 text-xs text-zinc-300 p-2 pt-6 rounded-lg border border-white/5 focus:border-orange-500/50 focus:outline-none resize-none min-h-[60px]" value={script.visual} onChange={(e) => { const newScripts = scripts.map(s => s.id === script.id ? { ...s, visual: e.target.value } : s); setScripts(newScripts); }} />
                                </div>
                                <div className="relative group/input">
                                    <p className="text-[9px] text-zinc-600 uppercase font-bold absolute top-2 left-2 pointer-events-none">{t.wb_audio}</p>
                                    <input type="text" className="w-full bg-black/20 text-xs text-zinc-400 p-2 pl-12 rounded-lg border border-white/5 focus:border-orange-500/50 focus:outline-none italic" value={script.audio} onChange={(e) => { const newScripts = scripts.map(s => s.id === script.id ? { ...s, audio: e.target.value } : s); setScripts(newScripts); }} />
                                </div>
                            </div>
                        </div>
                      ))
                  )}
                  <button onClick={addScript} className="w-full py-4 border border-dashed border-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 hover:text-orange-500 gap-2"><Plus className="w-4 h-4" /><span className="text-xs font-bold">{t.wb_btn_add_shot}</span></button>
                </div>
              </div>

              {/* Right Column */}
              <div className="w-[300px] xl:w-[380px] flex flex-col gap-3 shrink-0 h-full">
                <div className="flex justify-between items-end shrink-0 h-[32px]">
                  <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><MonitorPlay className="w-3 h-3" /> {t.wb_col_preview}</h2>
                </div>
                <div className="glass-panel flex-1 rounded-2xl p-1 relative flex flex-col overflow-hidden">
                   <div className="flex-1 bg-black rounded-xl relative overflow-hidden group flex items-center justify-center">
                      {generatedVideoUrl ? (
                        <video src={generatedVideoUrl} controls autoPlay loop className="w-full h-full object-contain" />
                      ) : (
                        <>
                          <div className="text-center opacity-30"><Film className="w-12 h-12 mx-auto mb-2 text-zinc-600" /><p className="text-xs text-zinc-600">{isGenerating ? 'Submitting…' : t.wb_waiting}</p></div>
                          {isGenerating && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>}
                        </>
                      )}
                   </div>
                   <div className="h-14 flex items-center justify-between px-4 border-t border-white/5 bg-zinc-900/50">
                      <div className="flex gap-4"><button className="text-zinc-400 hover:text-white"><SkipBack className="w-4 h-4" /></button><button className="text-white hover:text-orange-500"><Play className="w-4 h-4 fill-current" /></button><button className="text-zinc-400 hover:text-white"><SkipForward className="w-4 h-4" /></button></div>
                   </div>
                </div>
                <div className="glass-panel rounded-2xl p-4 border border-white/5 max-h-56 overflow-y-auto custom-scroll">
                  <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">批量生成结果</div>
                  {generatedBatch.length === 0 ? <div className="text-[10px] text-zinc-600">暂无结果</div> : <div className="space-y-2">{generatedBatch.map(item => { const task = tasks.find(t => t.id === item.taskId); const status = task?.status; const url = task?.result?.video_url || task?.result?.url; return (<div key={item.id} className="flex items-center justify-between gap-2 text-[10px]"><span className="truncate text-zinc-300">{item.assetName} × {item.scriptName}</span>{status === 'success' && url ? (<button onClick={() => setGeneratedVideoUrl(url)} className="text-orange-400 hover:text-orange-300 transition">预览</button>) : status === 'failed' ? (<span className="text-red-400">失败</span>) : (<span className="text-zinc-500">生成中…</span>)}</div>); })}</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. ASSETS VIEW */}
        {activeView === 'assets' && (
           <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300" onClick={() => setOpenFolderMenuId(null)}>
             <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-50">
                <div><h1 className="text-2xl font-bold tracking-tighter flex items-center gap-3 text-zinc-200">{t.assets_title}</h1><p className="text-zinc-500 text-xs mt-1">{t.assets_subtitle}</p></div>
                <div className="flex gap-3 items-center">
                  <LanguageSwitcher />
                  <button onClick={openCreateFolderModal} className="bg-zinc-800 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-zinc-700 transition flex items-center gap-2"><FolderPlus className="w-4 h-4" /> {t.assets_btn_new_folder}</button>
                  <button onClick={() => assetInputRef.current?.click()} className="bg-orange-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-orange-500 transition flex items-center gap-2 shadow-lg shadow-orange-500/20" disabled={isUploading}>
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {t.assets_btn_upload}
                  </button>
                  <input type="file" ref={assetInputRef} className="hidden" multiple onChange={handleAssetUpload} />
                </div>
             </header>
             <div className="flex-1 flex flex-col p-10 overflow-hidden">
                <div className="flex gap-4 mb-8 border-b border-white/5 pb-2">
                    {(['model', 'product', 'scene'] as AssetType[]).map(type => (
                        <button key={type} onClick={() => setActiveAssetTab(type)} className={`text-sm font-bold px-6 py-2 rounded-full transition ${activeAssetTab === type ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>{type === 'model' ? t.assets_tab_models : type === 'product' ? t.assets_tab_products : t.assets_tab_scenes}</button>
                    ))}
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-4">
                  <button onClick={() => setCurrentFolderId(null)} className={`hover:text-white ${currentFolderId === null ? 'text-white' : ''}`}>{t.assets_root}</button>
                  {folderBreadcrumb.map(folder => (
                    <div key={folder.id} className="flex items-center gap-2"><span>/</span><button onClick={() => setCurrentFolderId(folder.id)} className={`hover:text-white ${currentFolderId === folder.id ? 'text-white' : ''}`}>{folder.name}</button></div>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto custom-scroll">
                    {isLoadingAssets ? (
                        <div className="flex justify-center py-20 text-zinc-500"><Loader2 className="animate-spin mr-2" /> Loading Assets...</div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-6">
                            {folderList.map(folder => (
                              <div key={folder.id} onClick={() => setCurrentFolderId(folder.id)} className="glass-card rounded-2xl aspect-[3/4] border border-zinc-800 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-orange-500/50 hover:bg-zinc-900/50 transition group relative">
                                <button onClick={(e) => { e.stopPropagation(); setOpenFolderMenuId(prev => (prev === folder.id ? null : folder.id)); }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-zinc-300 hover:text-white">...</button>
                                {openFolderMenuId === folder.id && (
                                  <div onClick={(e) => e.stopPropagation()} className="absolute top-10 right-2 bg-zinc-900/90 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden text-xs z-50 min-w-[140px]">
                                    <button className="w-full text-left px-3 py-2 hover:bg-white/5 text-zinc-200" onClick={() => handleRenameFolder(folder)}>{t.assets_folder_menu_rename}</button>
                                    <button className="w-full text-left px-3 py-2 hover:bg-white/5 text-red-300" onClick={() => { setOpenFolderMenuId(null); openConfirmModal({ title: t.assets_confirm_delete_folder, message: `${folder.name}\n\n${t.assets_confirm_body_irreversible}`, danger: true, onConfirm: () => handleDeleteFolder(folder) }); }}>{t.assets_folder_menu_delete}</button>
                                  </div>
                                )}
                                <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center group-hover:scale-110 transition"><Folder className="w-6 h-6 text-zinc-400 group-hover:text-orange-500" /></div>
                                <span className="text-xs font-bold text-zinc-300 truncate max-w-[120px]">{folder.name}</span>
                              </div>
                            ))}
                            <div onClick={() => assetInputRef.current?.click()} className="glass-card rounded-2xl aspect-[3/4] border-2 border-dashed border-zinc-800 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-orange-500/50 hover:bg-zinc-900/50 transition group">
                                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center group-hover:scale-110 transition"><Plus className="w-6 h-6 text-zinc-500 group-hover:text-orange-500" /></div>
                                <span className="text-xs font-medium text-zinc-500">{t.assets_upload_hint}</span>
                            </div>
                            {filteredAssets.map(asset => (
                                <div key={asset.id} className="glass-card rounded-2xl p-2 group relative">
                                    <div className="aspect-[3/4] bg-zinc-800 rounded-xl overflow-hidden relative cursor-zoom-in" onClick={() => openAssetPreview(asset)}>
                                        {asset.file_url ? <img src={getDisplayUrl(asset.file_url) || ASSET_PLACEHOLDER_DATA_URL} className="w-full h-full object-cover" alt={asset.name} onError={(e) => { (e.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL; }} /> : <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-center justify-center text-zinc-600">No Preview</div>}
                                        <div className="absolute bottom-3 left-3"><p className="text-xs font-bold text-white truncate w-24">{asset.name}</p><p className="text-[10px] text-zinc-400">{asset.size || '-- MB'}</p></div>
                                        <div className="absolute top-2 right-2 bg-black/40 px-2 py-0.5 rounded text-[9px] text-white backdrop-blur-sm capitalize">{asset.status}</div>
                                    </div>
                                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition rounded-2xl flex flex-col items-center justify-center gap-2">
                                        <button onClick={(e) => { e.stopPropagation(); setUploadedFile(getDisplayUrl(asset.file_url) || null); setFileName(asset.name || ''); setSelectedFileObj(null); setSelectedAssetUrl(asset.file_url || null); setSelectedAssetSource('preference'); setGeneratedVideoUrl(null); setActiveView('workbench'); }} className="bg-white text-black px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-500 hover:text-white transition">{t.assets_use_in_workbench}</button>
                                        <button onClick={(e) => { e.stopPropagation(); openAssetPreview(asset); }} className="bg-zinc-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-zinc-600 transition flex items-center gap-2"><Eye className="w-3.5 h-3.5" /> {t.assets_view_image}</button>
                                        <button onClick={(e) => { e.stopPropagation(); openMoveDialog(asset); }} className="bg-zinc-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-zinc-600 transition">{t.assets_move_asset}</button>
                                        <button onClick={(e) => { e.stopPropagation(); openConfirmModal({ title: t.assets_confirm_delete_asset, message: `${asset.name}\n\n${t.assets_confirm_body_irreversible}`, danger: true, onConfirm: () => deleteAssetById(asset.id) }); }} className="text-red-400 text-xs hover:text-red-300">{t.assets_delete}</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
             </div>
           </div>
        )}

        {isAssetPreviewOpen && assetPreview && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={closeAssetPreview}>
            <div className="glass-panel rounded-2xl p-4 md:p-6 border border-white/10 w-auto max-w-[calc(100vw-3rem)]" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-4 mb-4"><div className="min-w-0"><h3 className="text-sm font-bold text-zinc-200">{t.assets_preview_title}</h3><div className="text-xs text-zinc-500 truncate">{assetPreview.name}</div></div><button className="text-zinc-400 hover:text-white" onClick={closeAssetPreview}>x</button></div>
              <div className="flex items-center justify-center">{assetPreview.file_url ? <div className="inline-flex bg-black/30 rounded-xl border border-white/10 overflow-hidden"><img src={getDisplayUrl(assetPreview.file_url) || ASSET_PLACEHOLDER_DATA_URL} alt={assetPreview.name} className="block" style={{ maxWidth: 'calc(100vw - 6rem)', maxHeight: '72vh', width: 'auto', height: 'auto' }} onError={(e) => { (e.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL; }} /></div> : <div className="py-24 text-zinc-500">No Preview</div>}</div>
            </div>
          </div>
        )}

        {isMoveModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={closeMoveDialog}>
            <div className="w-full max-w-md glass-panel rounded-2xl p-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-zinc-200">{t.assets_move_title}</h3><button className="text-zinc-400 hover:text-white" onClick={closeMoveDialog}>x</button></div>
              <div className="text-xs text-zinc-500 mb-3 truncate">{moveAsset?.name}</div>
              <div className="relative">
                <button className={`w-full bg-black/30 text-zinc-200 text-sm rounded-lg border px-3 py-2 flex items-center justify-between focus:outline-none transition ${isMoveDropdownOpen ? 'border-orange-500/60' : 'border-white/10 hover:border-white/20'}`} onClick={() => setIsMoveDropdownOpen(v => !v)}>
                  <span className="truncate">{(() => { if (!moveTargetFolderId) return t.assets_move_root; const found = moveFolders.find(f => f.id === moveTargetFolderId); return found?.name || t.assets_move_root; })()}</span><span className="text-zinc-400">v</span>
                </button>
                {isMoveDropdownOpen && (
                  <div className="absolute mt-2 w-full max-h-64 overflow-auto rounded-lg border border-white/10 bg-zinc-950/90 backdrop-blur-sm shadow-xl z-[120]">
                    <button className={`w-full text-left px-3 py-2 text-sm hover:bg-white/5 ${moveTargetFolderId === null ? 'text-white' : 'text-zinc-200'}`} onClick={() => { setMoveTargetFolderId(null); setIsMoveDropdownOpen(false); }}>{t.assets_move_root}</button>
                    {buildFolderOptions(moveFolders).map(opt => (<button key={opt.id} className={`w-full text-left px-3 py-2 text-sm hover:bg-white/5 ${moveTargetFolderId === opt.id ? 'text-white' : 'text-zinc-200'}`} onClick={() => { setMoveTargetFolderId(opt.id); setIsMoveDropdownOpen(false); }}>{opt.label}</button>))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-5">
                <button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700" onClick={closeMoveDialog}>{t.assets_move_cancel}</button>
                <button className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-500 disabled:opacity-60" onClick={handleConfirmMove} disabled={isMovingAsset}>{t.assets_move_confirm}</button>
              </div>
            </div>
          </div>
        )}

        {isFolderModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={closeFolderModal}>
            <div className="w-full max-w-md glass-panel rounded-2xl p-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-zinc-200">{folderModalMode === 'create' ? t.assets_new_folder_title : t.assets_rename_folder_title}</h3><button className="text-zinc-400 hover:text-white" onClick={closeFolderModal}>x</button></div>
              <label className="block text-xs text-zinc-500 mb-2">{t.assets_name_label}</label>
              <input ref={folderNameInputRef} className="w-full bg-black/30 text-zinc-200 text-sm rounded-lg border border-white/10 px-3 py-2 focus:outline-none focus:border-orange-500/50" value={folderNameInput} onChange={(e) => setFolderNameInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitFolderModal(); if (e.key === 'Escape') closeFolderModal(); }} placeholder={t.assets_new_folder_prompt} />
              <div className="flex justify-end gap-3 mt-5">
                <button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700" onClick={closeFolderModal}>{t.assets_move_cancel}</button>
                <button className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-500 disabled:opacity-60" onClick={submitFolderModal} disabled={isSavingFolder}>{folderModalMode === 'create' ? t.assets_btn_new_folder : t.assets_save}</button>
              </div>
            </div>
          </div>
        )}

        {isConfirmModalOpen && (
          <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={closeConfirmModal}>
            <div className="w-full max-w-md glass-panel rounded-2xl p-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-zinc-200">{confirmTitle || t.assets_confirm_title}</h3><button className="text-zinc-400 hover:text-white" onClick={closeConfirmModal}>x</button></div>
              {confirmMessage && <div className="text-sm text-zinc-300 whitespace-pre-line">{confirmMessage}</div>}
              <div className="flex justify-end gap-3 mt-5">
                <button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700 disabled:opacity-60" onClick={closeConfirmModal} disabled={confirmIsWorking}>{t.assets_move_cancel}</button>
                <button className={`px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-60 ${confirmIsDanger ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-orange-600 hover:bg-orange-500 text-white'}`} onClick={runConfirmAction} disabled={confirmIsWorking}>{confirmIsWorking ? '...' : t.assets_delete}</button>
              </div>
            </div>
          </div>
        )}

        {/* 3. TEMPLATES VIEW */}
        {activeView === 'templates' && (
          <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
             <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-50">
                <div><h1 className="text-2xl font-bold tracking-tighter flex items-center gap-3 text-zinc-200">{t.tpl_title}</h1><p className="text-zinc-500 text-xs mt-1">{t.tpl_subtitle}</p></div>
                <div className="flex items-center gap-3"><LanguageSwitcher /><button onClick={() => openEditor()} className="bg-orange-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-orange-500 transition flex items-center gap-2 shadow-lg shadow-orange-500/20"><Plus className="w-4 h-4" /> {t.tpl_btn_new}</button></div>
             </header>
             <div className="flex-1 overflow-y-auto p-10">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                   {templateList.length === 0 && <div className="col-span-full text-center text-zinc-500 py-10">No templates found. Create one!</div>}
                   {templateList.map(tpl => (
                     <div key={tpl.id} className={`glass-card rounded-2xl p-6 relative group overflow-hidden border-t-4 flex flex-col justify-between h-96 ${tpl.icon === 'gem' ? 'border-t-orange-500' : 'border-t-purple-500'}`}>
                        <div className={`absolute -right-10 -top-10 w-32 h-32 rounded-full blur-2xl transition group-hover:opacity-40 opacity-20 ${tpl.icon === 'gem' ? 'bg-orange-500' : 'bg-purple-500'}`} />
                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-6">
                            <div className="w-12 h-12 rounded-xl bg-zinc-800/80 border border-white/5 flex items-center justify-center text-white shadow-lg">{tpl.icon === 'gem' ? <Gem className="w-6 h-6" /> : (tpl.icon === 'zap' ? <Zap className="w-6 h-6"/> : <Flame className="w-6 h-6"/>)}</div>
                            <button onClick={(e) => { e.stopPropagation(); openConfirmModal({ title: t.assets_confirm_delete_template ?? 'Delete template', message: `${tpl.name}\n\n${t.assets_confirm_body_irreversible}`, danger: true, onConfirm: () => handleDeleteTemplate(tpl.id!), }); }}><Trash2 className="w-4 h-4" /></button>
                          </div>
                          <h3 className="text-xl font-bold text-white mb-1">{tpl.name}</h3>
                          <p className="text-xs text-zinc-500 mb-6 font-mono capitalize">{tpl.product_category} • {tpl.visual_style}</p>
                          <div className="space-y-3 bg-zinc-900/50 p-4 rounded-xl border border-white/5">
                            <div className="flex items-center justify-between text-xs"><span className="text-zinc-500">Duration</span><span className="text-zinc-300 font-bold">{tpl.duration}s</span></div>
                            <div className="flex items-center justify-between text-xs"><span className="text-zinc-500">Ratio</span><span className="text-zinc-300 font-bold">{tpl.aspect_ratio}</span></div>
                          </div>
                        </div>
                        <button onClick={() => openEditor(tpl)} className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/5 text-xs font-bold text-zinc-300 rounded-xl mt-4 transition flex items-center justify-center gap-2 relative z-10">{t.tpl_btn_edit} <ArrowRight className="w-3 h-3" /></button>
                     </div>
                   ))}
                </div>
             </div>
          </div>
        )}

        {/* 4. EDITOR VIEW */}
        {activeView === 'editor' && (
           <div className="flex flex-col h-full z-20 bg-zinc-950 animate-in fade-in zoom-in-95 duration-200">
             <div className="px-10 py-6 border-b border-white/5 flex justify-between items-center gap-4 bg-zinc-900/30 relative z-50">
                <div className="flex items-center gap-4"><button onClick={() => setActiveView('templates')} className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 transition"><ArrowLeft className="w-5 h-5" /></button><div><h1 className="text-xl font-bold text-white">{editingTemplate ? 'Edit Template' : t.editor_title}</h1><p className="text-xs text-zinc-500">{t.editor_subtitle}</p></div></div>
                <LanguageSwitcher />
             </div>
             <div className="flex-1 overflow-y-auto p-10 max-w-5xl mx-auto w-full custom-scroll">
                <div className="glass-panel p-8 rounded-3xl border border-white/10 space-y-8">
                   <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-2"><label className="text-sm font-bold text-zinc-400">{t.editor_label_name}</label><input type="text" value={editorForm.name} onChange={e => setEditorForm({...editorForm, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white" /></div>
                      <div className="space-y-2"><label className="text-sm font-bold text-zinc-400">{t.editor_label_icon}</label><div className="flex gap-3">{['flame', 'gem', 'zap'].map(icon => (<button key={icon} onClick={() => setEditorForm({...editorForm, icon})} className={`w-12 h-12 rounded-xl border flex items-center justify-center transition ${editorForm.icon === icon ? 'bg-orange-500/20 border-orange-500 text-orange-500' : 'bg-zinc-800 border-white/5 text-zinc-500 hover:text-white'}`}>{icon === 'flame' && <Flame className="w-6 h-6" />}{icon === 'gem' && <Gem className="w-6 h-6" />}{icon === 'zap' && <Zap className="w-6 h-6" />}</button>))}</div></div>
                   </div>
                   <hr className="border-white/5" />
                   <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-2"><label className="text-sm font-bold text-zinc-400">{t.editor_label_category}</label><div className="relative"><select value={isCustomCategory ? '__custom__' : editorForm.product_category} onChange={e => { const value = e.target.value; if (value === '__custom__') { setIsCustomCategory(true); setEditorForm({ ...editorForm, product_category: customCategory }); } else { setIsCustomCategory(false); setCustomCategory(''); setEditorForm({ ...editorForm, product_category: value }); } }} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white appearance-none cursor-pointer"><option value="camera">{t.opt_cat_camera}</option><option value="beauty">{t.opt_cat_beauty}</option><option value="food">{t.opt_cat_food}</option><option value="electronics">{t.opt_cat_digital}</option><option value="__custom__">{t.opt_cat_custom}</option></select><ChevronDown className="absolute right-4 top-3.5 w-4 h-4 text-zinc-500 pointer-events-none" /></div>{isCustomCategory && (<input type="text" value={customCategory} onChange={e => { const value = e.target.value; setCustomCategory(value); setEditorForm({ ...editorForm, product_category: value }); }} placeholder={t.editor_ph_select} className="mt-3 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white" />)}</div>
                      <div className="space-y-2"><label className="text-sm font-bold text-zinc-400">{t.editor_label_style}</label><div className="relative"><select value={isCustomStyle ? '__custom__' : editorForm.visual_style} onChange={e => { const value = e.target.value; if (value === '__custom__') { setIsCustomStyle(true); setEditorForm({ ...editorForm, visual_style: customStyle }); } else { setIsCustomStyle(false); setCustomStyle(''); setEditorForm({ ...editorForm, visual_style: value }); } }} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white appearance-none cursor-pointer"><option value="realistic">{t.opt_style_real}</option><option value="cinematic">{t.opt_style_cine}</option><option value="3d">{t.opt_style_3d}</option><option value="anime">{t.opt_style_anime}</option><option value="__custom__">{t.opt_style_custom}</option></select><ChevronDown className="absolute right-4 top-3.5 w-4 h-4 text-zinc-500 pointer-events-none" /></div>{isCustomStyle && (<input type="text" value={customStyle} onChange={e => { const value = e.target.value; setCustomStyle(value); setEditorForm({ ...editorForm, visual_style: value }); }} placeholder={t.editor_ph_select} className="mt-3 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white" />)}</div>
                   </div>
                   <div className="grid grid-cols-3 gap-6">
                      <div className="space-y-2"><label className="text-sm font-bold text-zinc-400">{t.editor_label_ratio}</label><div className="relative"><select value={editorForm.aspect_ratio} onChange={e => setEditorForm({...editorForm, aspect_ratio: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white appearance-none cursor-pointer"><option value="16:9">16:9 (1280x720)</option><option value="9:16">9:16 (720x1280)</option><option value="1:1">1:1 (1080x1080)</option></select><ChevronDown className="absolute right-4 top-3.5 w-4 h-4 text-zinc-500 pointer-events-none" /></div></div>
                      <div className="space-y-2"><label className="text-sm font-bold text-zinc-400">{t.editor_label_duration}</label><input type="number" value={editorForm.duration} onChange={e => setEditorForm({...editorForm, duration: parseInt(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white" /></div>
                      <div className="space-y-2"><label className="text-sm font-bold text-zinc-400">{t.editor_label_shots}</label><input type="number" value={editorForm.shot_number} onChange={e => setEditorForm({...editorForm, shot_number: parseInt(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white" /></div>
                   </div>
                   <div className="space-y-2"><label className="text-sm font-bold text-zinc-400">{t.editor_label_custom}</label><textarea value={editorForm.custom_config} onChange={e => setEditorForm({...editorForm, custom_config: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white resize-none h-24" placeholder={t.editor_ph_custom}></textarea></div>
                   <hr className="border-white/5" />
                   <div className="pt-2 flex justify-end gap-4">
                      <button onClick={() => setActiveView('templates')} className="px-6 py-3 rounded-xl text-sm font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition">{t.editor_btn_cancel}</button>
                      <button onClick={handleSaveTemplate} className="px-8 py-3 rounded-xl text-sm font-bold bg-orange-600 text-white hover:bg-orange-500 shadow-lg shadow-orange-500/20 transition">{t.editor_btn_save}</button>
                   </div>
                </div>
             </div>
           </div>
        )}

        {/* 5. HISTORY VIEW */}
        {activeView === 'history' && (
           <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
             <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-50"><div><h1 className="text-2xl font-bold tracking-tighter flex items-center gap-3 text-zinc-200">{t.hist_title}</h1><p className="text-zinc-500 text-xs mt-1">{t.hist_subtitle}</p></div><LanguageSwitcher /></header>
             <div className="flex-1 overflow-y-auto p-10 custom-scroll">
               <div className="max-w-5xl mx-auto space-y-4">
                  <div className="glass-card p-4 rounded-xl flex items-center gap-6 group hover:border-orange-500/50 transition">
                      <div className="w-40 aspect-video bg-zinc-800 rounded-lg overflow-hidden relative shrink-0 flex items-center justify-center"><Video className="w-6 h-6 text-zinc-700" /></div>
                      <div className="flex-1 min-w-0"><h4 className="text-base font-bold text-white truncate group-hover:text-orange-500 transition">Project_Alpha_01</h4><p className="text-xs text-zinc-500 mb-3">2024-05-20 14:30</p><div className="flex gap-4 text-xs text-zinc-400"><span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> 15MB</span><span className="flex items-center gap-1"><Eye className="w-3 h-3" /> 24 Views</span></div></div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition px-2"><button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"><Download className="w-4 h-4" /></button><button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"><Edit3 className="w-4 h-4" /></button></div>
                  </div>
               </div>
             </div>
           </div>
        )}

        {/* 6. PROFILE VIEW */}
        {activeView === 'profile' && (
           <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
             <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-50"><div><h1 className="text-2xl font-bold tracking-tighter flex items-center gap-3 text-zinc-200">{t.profile_title}</h1><p className="text-zinc-500 text-xs mt-1">{t.profile_subtitle}</p></div><div className="flex items-center gap-6"><div className="flex items-center gap-2 bg-zinc-900/80 border border-white/5 p-1 rounded-xl"><div className="text-[10px] font-bold text-zinc-600 px-2 uppercase tracking-widest">{t.profile_debug || 'Debug'}</div><div className="flex gap-1">{['free', 'plus', 'pro'].map((p) => (<button key={p} onClick={async (e) => { e.stopPropagation(); const newPlan = p as any; let newCredits = user?.credits; if (newPlan === 'free') newCredits = 50; else if (newPlan === 'plus') newCredits = 200; else if (newPlan === 'pro') newCredits = 9999; try { const res = await authApi.updateProfile({ tier: newPlan, credits: newCredits }); let resolvedPlan: any = 'free'; if (res.data.tier === 'PRO') resolvedPlan = 'plus'; else if (res.data.tier === 'ENTERPRISE') resolvedPlan = 'pro'; updateUser({ plan: resolvedPlan, credits: res.data.balance }); } catch (err) { alert("Failed to update plan via debug"); } }} className={`px-2 py-0.5 rounded text-[9px] font-bold border transition ${user?.plan === p ? 'bg-orange-500/20 border-orange-500/50 text-orange-500' : 'bg-transparent border-white/5 text-zinc-500 hover:text-white'}`}>{p.toUpperCase()}</button>))}</div><div className="w-px h-3 bg-white/5 mx-1" /><div className="flex items-center gap-1 pr-1"><input type="number" className="w-12 bg-zinc-800 text-[10px] px-1 py-0.5 rounded text-white border border-white/10 outline-none focus:border-orange-500" defaultValue={100} onKeyDown={async (e) => { if (e.key === 'Enter') { const val = Number((e.currentTarget as HTMLInputElement).value); try { const res = await authApi.updateProfile({ credits: val }); updateUser({ credits: res.data.balance }); } catch (err) { alert("Failed to update credits via debug"); } } }} /><span className="text-[8px] text-zinc-600">V</span></div></div><LanguageSwitcher /></div></header>
             <div className="flex-1 overflow-y-auto p-10 custom-scroll">
               <div className="max-w-4xl mx-auto">
                 <div className="glass-panel p-12 rounded-[40px] border border-white/5 relative overflow-hidden group">
                   <div className={`absolute top-0 right-0 w-[400px] h-[400px] blur-[120px] rounded-full transition-all duration-1000 ${user?.plan === 'pro' ? 'bg-orange-500/10' : user?.plan === 'plus' ? 'bg-indigo-500/10' : 'bg-zinc-500/5'}`} />
                   <div className="flex flex-col md:flex-row items-center md:items-start gap-12 relative z-10 w-full">
                     <div className="flex flex-col items-center gap-6 w-48 shrink-0">
                        <div className="relative group/avatar"><input type="file" ref={avatarInputRef} className="hidden" onChange={handleAvatarUpload} accept="image/*" /><div onClick={() => avatarInputRef.current?.click()} className={`w-32 h-32 rounded-[32px] bg-zinc-900 border flex items-center justify-center overflow-hidden transition-all duration-700 cursor-pointer ${user?.plan === 'pro' ? 'border-orange-500/40 shadow-[0_0_30px_rgba(249,115,22,0.1)]' : user?.plan === 'plus' ? 'border-indigo-500/40 shadow-[0_0_30px_rgba(99,102,241,0.1)]' : 'border-white/10 shadow-none'}`}>{user?.avatar ? (<img src={user.avatar} className="w-full h-full object-cover" />) : (<UserIcon className="w-12 h-12 text-zinc-700" />)}<div className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]"><Edit3 className="w-8 h-8 text-white" /></div></div></div>
                        <div className="text-center group/name relative w-full">{isEditingNickname ? (<input type="text" value={newNickname} onChange={(e) => setNewNickname(e.target.value)} onBlur={async () => { setIsEditingNickname(false); if (newNickname.trim() && newNickname.trim() !== user?.name) { try { const res = await authApi.updateProfile({ name: newNickname.trim() }); updateUser({ name: res.data.name }); } catch (err) { alert("Failed to update nickname"); } } }} onKeyDown={async (e) => { if (e.key === 'Enter') { setIsEditingNickname(false); if (newNickname.trim() && newNickname.trim() !== user?.name) { try { const res = await authApi.updateProfile({ name: newNickname.trim() }); updateUser({ name: res.data.name }); } catch (err) { alert("Failed to update nickname"); } } } if (e.key === 'Escape') { setIsEditingNickname(false); setNewNickname(user?.name || ''); } }} autoFocus className="text-xl font-bold text-white bg-white/5 border border-orange-500/50 rounded-lg px-2 py-1 outline-none text-center w-full" />) : (<div className="flex items-center justify-center gap-2 group cursor-pointer" onClick={() => setIsEditingNickname(true)}><h2 className="text-2xl font-bold text-white tracking-tight break-words max-w-full">{user?.name || 'User'}</h2><Edit3 className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" /></div>)}<div className="mt-2 text-center"><button onClick={handleUseDefaultAvatar} className="text-[10px] font-bold text-zinc-500 hover:text-orange-500 transition-colors uppercase tracking-widest py-1 border-b border-white/5">{t.profile_use_default_avatar}</button></div></div>
                     </div>
                     <div className="flex-1 w-full space-y-10 py-2">
                       <div className="space-y-4"><div className="flex items-center gap-3"><div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-black tracking-[0.15em] border transition-all duration-700 ${user?.plan === 'pro' ? 'bg-orange-500/20 text-orange-500 border-orange-500/20' : user?.plan === 'plus' ? 'bg-indigo-500/20 text-indigo-500 border-indigo-500/20' : 'bg-zinc-800 text-zinc-400 border-white/5'}`}>{user?.plan === 'pro' ? <Flame className="w-3.5 h-3.5" /> : user?.plan === 'plus' ? <Gem className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}{(user?.plan === 'pro' ? (t.profile_plan_pro_name || 'pro user') : user?.plan === 'plus' ? (t.profile_plan_plus_name || 'plus user') : (t.profile_plan_free_name || 'free user')).toUpperCase()}</div></div><p className="text-sm text-zinc-500 leading-relaxed max-w-xl">{user?.plan === 'pro' ? (t.plan_desc_pro || t.profile_plan_pro || 'PRO') : user?.plan === 'plus' ? (t.plan_desc_plus || t.profile_plan_plus || 'PLUS') : (t.plan_desc_free || t.profile_plan_free || 'FREE')}</p></div>
                       <div className="space-y-4 bg-white/2 rounded-2xl p-6 border border-white/5 shadow-inner"><div className="flex items-end justify-between px-1"><div className="space-y-1"><div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t.profile_balance || 'Balance'}</div><div className="text-4xl font-black text-white italic tracking-tighter">{user?.plan === 'pro' ? '∞' : (user?.credits || 0)} <span className="text-[10px] not-italic text-zinc-500 font-bold uppercase ml-1">{t.v_points || 'V-Points'}</span></div></div><div className="text-xs font-bold text-zinc-600 mb-1">LIMIT: {user?.plan === 'pro' ? '∞' : user?.plan === 'plus' ? 500 : 100} V</div></div><div className="h-4 w-full bg-zinc-900 rounded-full border border-white/5 p-1 overflow-hidden"><div className={`h-full rounded-full transition-all duration-1000 ease-out relative ${user?.plan === 'pro' ? 'bg-gradient-to-r from-purple-600 via-orange-500 to-yellow-400' : user?.plan === 'plus' ? 'bg-gradient-to-r from-blue-700 via-indigo-500 to-cyan-400' : 'bg-gradient-to-r from-zinc-700 via-zinc-500 to-emerald-500/50'}`} style={{ width: `${user?.plan === 'pro' ? 100 : Math.min(((user?.credits || 0) / (user?.plan === 'plus' ? 500 : 100)) * 100, 100)}%` }}><div className="absolute inset-0 bg-white/10 animate-pulse" /></div></div></div>
                     </div>
                   </div>
                   <hr className="mt-6 mb-6 border-white/5" />
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-12">
                     <div onClick={async () => { const newTheme = theme === 'dark' ? 'light' : 'dark'; setTheme(newTheme); try { const res = await authApi.updateProfile({ theme: newTheme }); updateUser({ theme: res.data.theme }); } catch (err) { console.error("Failed to save theme preference", err); } }} className="flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition group/item cursor-pointer shadow-sm hover:shadow-orange-500/5"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover/item:text-orange-500 transition-colors"><Settings2 className="w-6 h-6" /></div><div className="text-left"><div className="text-base font-bold text-white">{t.profile_theme || 'Appearance'}</div><div className="text-xs text-zinc-600 mt-0.5 uppercase tracking-widest font-black">{theme === 'dark' ? t.profile_theme_dark : t.profile_theme_light}</div></div></div><ChevronDown className={`w-5 h-5 text-zinc-700 transition-transform ${theme === 'light' ? 'rotate-180' : ''}`} /></div>
                     <button onClick={logout} className="w-full flex items-center justify-between p-6 rounded-2xl bg-red-500/5 hover:bg-red-500/10 transition group/logout border border-red-500/10 hover:border-red-500/20"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500"><LogOut className="w-6 h-6" /></div><div className="text-left"><div className="text-base font-bold text-red-500">{t.sign_out}</div><div className="text-xs text-red-500/60 mt-0.5">{t.sign_out_subtitle || '退出当前账户，清除本地缓存'}</div></div></div><ArrowRight className="w-5 h-5 text-red-500/30 group-hover:text-red-500 group-hover:translate-x-1 transition-all" /></button>
                   </div>
                 </div>
               </div>
             </div>
           </div>
        )}

        {renderTaskQueue()}
      </main>
    </div>
  );
};

export default Workbench;