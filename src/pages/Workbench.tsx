import React, { useState, useRef, useEffect } from 'react';
import { 
  Zap, Image as ImageIcon, LayoutTemplate, History, UploadCloud, Plus, X, 
  SlidersHorizontal, ChevronDown, Wand2, Clapperboard, PlayCircle, Undo2, 
  RefreshCw, Trash2, MonitorPlay, Film, Play, SkipBack, SkipForward, Download, 
  Maximize, Share2, Music2, Instagram, Youtube, Send, FolderPlus, Upload, 
  Flame, Gem, ArrowRight, Settings2, Video, HardDrive, Eye, Edit3, ArrowLeft, CheckCircle, Loader2,
  LogOut // [Added] Import LogOut icon
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext'; 
import { authApi } from '../services/auth'; 
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';
import { assetsApi, type Asset } from '../services/assets'; 
import { videoApi } from '../services/video';
import { templatesApi, type Template } from '../services/templates';
import type { Asset as LibraryAsset } from '../types';

// Types
type ViewType = 'workbench' | 'assets' | 'templates' | 'history' | 'editor';
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

const Workbench = () => {
  const { t } = useLanguage();
  const { user, logout } = useAuth(); // [Modified] Get logout function
  const location = useLocation();

  // --- Global State ---
  const [activeView, setActiveView] = useState<ViewType>('workbench');
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
  const [assetList, setAssetList] = useState<Asset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [activeAssetTab, setActiveAssetTab] = useState<AssetType>('product');
  const [isUploading, setIsUploading] = useState(false);
  const assetInputRef = useRef<HTMLInputElement>(null);

  // --- Reuse Queues ---
  const [assetQueue, setAssetQueue] = useState<QueuedAsset[]>([]);
  const [scriptQueue, setScriptQueue] = useState<QueuedScript[]>([]);
  const [generatedBatch, setGeneratedBatch] = useState<Array<{ id: string; assetName: string; scriptName: string; url: string }>>([]);

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
    if (activeView === 'assets') loadAssets();
    // Load templates in both template view AND workbench view (for dropdown)
    if ((activeView === 'templates' || activeView === 'workbench') && currentUserId) loadTemplates();
  }, [activeView, currentUserId]);

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

  const handleDeleteTemplate = async (templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) return;
    if (!confirm("Delete this template?")) return;
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
      const data = await assetsApi.getAssets();
      setAssetList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load assets", err);
    } finally {
      setIsLoadingAssets(false);
    }
  };

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const uploadTasks = Array.from(files).map(file => assetsApi.uploadAsset(file, activeAssetTab));
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

  const handleDeleteAsset = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this asset?")) return;
    try {
      await assetsApi.deleteAsset(id);
      setAssetList(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      alert("Failed to delete asset");
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
      // In production, relative paths work directly with nginx
      // In development, use env variable or default to localhost
      const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
      return baseUrl ? `${baseUrl}${path}` : path;
    }
    // Otherwise (blob:..., data:...), use as-is
    return path;
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

    const results: Array<{ id: string; assetName: string; scriptName: string; url: string }> = [];
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
            const videoUrl = genResp.video_url || genResp.url || genResp.data?.video_url || genResp.data?.url;

            if (videoUrl) {
              results.push({
                id: `${asset.id}-${scriptItem.id}`,
                assetName: asset.name,
                scriptName: scriptItem.name,
                url: videoUrl
              });
              setGeneratedVideoUrl(videoUrl);
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
        alert('未生成任何视频，请检查队列或网络状态');
      } else if (errorCount > 0) {
        alert(`已完成批量生成，其中有 ${errorCount} 个任务失败`);
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

      const payload = {
        prompt: combinedScriptPrompt,
        project_id: selectedTemplate.id, // Dynamic ID
        duration: genDuration,
        image_path: apiPath, 
        sound: "on" as const,
        asset_source: selectedAssetSource || (selectedFileObj ? 'product' : 'preference')
      };

      console.log("🚀 Sending Generation Request:", payload);

      const genResp = await videoApi.generate(payload);
      const videoUrl = genResp.video_url || genResp.url || genResp.data?.video_url || genResp.data?.url;

      if (videoUrl) {
        setGeneratedVideoUrl(videoUrl);
      } else {
        alert("Video generated, but no URL found.");
      }
    } catch (err: any) {
      alert(`Error: ${err.message || 'Generation failed'}`);
    } finally {
      setIsGenerating(false);
    }
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
        
        {/* Logout Button */}
        <div className="mt-auto pb-6 w-full px-2">
          <button
            onClick={logout}
            className="h-12 w-full rounded-xl flex items-center justify-center cursor-pointer transition text-zinc-500 hover:text-red-500 hover:bg-white/5 group relative"
            title={t.sign_out}
          >
            <LogOut className="w-5 h-5" />
          </button>
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
                <div className="flex justify-between items-center shrink-0 h-[32px]">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Clapperboard className="w-3 h-3" /> {t.wb_col_scripts}</h2>
                    {/* Duration Validation Indicator */}
                    <div className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDurationValid ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                        {currentScriptDuration.toFixed(1)}s / {genDuration}s
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
                  {scripts.map((script, index) => (
                     <div key={script.id} className={`glass-card p-4 rounded-xl group relative border-l-2 ${index % 2 === 0 ? 'border-l-purple-500' : 'border-l-orange-500'}`}>
                        <div className="flex justify-between items-start mb-3">
                           <div className="flex items-center gap-2">
                              <span className={`${index % 2 === 0 ? 'bg-purple-600' : 'bg-orange-500'} text-black text-[10px] font-bold px-1.5 py-0.5 rounded-sm`}>{t.wb_shot} {script.shot}</span>
                              <span className="text-[10px] text-zinc-400 border border-white/10 px-1.5 rounded">{script.type}</span>
                              
                              {/* Editable Duration Input */}
                              <div className="flex items-center bg-black/20 border border-white/10 rounded px-1.5 gap-0.5">
                                <input 
                                    type="number" 
                                    step="0.1"
                                    min="0.1"
                                    className="w-8 bg-transparent text-[10px] text-zinc-300 focus:outline-none text-right"
                                    value={parseFloat(script.dur.replace('s',''))}
                                    onChange={(e) => handleDurationChange(script.id, e.target.value)}
                                />
                                <span className="text-[10px] text-zinc-500">s</span>
                              </div>
                           </div>
                           <button onClick={() => removeScript(script.id)} className="text-zinc-600 hover:text-red-500 transition p-1 hover:bg-white/5 rounded"><X className="w-3.5 h-3.5" /></button>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                           <div className="relative group/input">
                                <p className="text-[9px] text-zinc-600 uppercase font-bold absolute top-2 left-2 pointer-events-none">{t.wb_visual}</p>
                                <textarea 
                                  className="w-full bg-black/20 text-xs text-zinc-300 p-2 pt-6 rounded-lg border border-white/5 focus:border-orange-500/50 focus:outline-none resize-none min-h-[60px]" 
                                  value={script.visual} 
                                  onChange={(e) => { const newScripts = scripts.map(s => s.id === script.id ? { ...s, visual: e.target.value } : s); setScripts(newScripts); }} 
                                />
                           </div>
                           <div className="relative group/input">
                                <p className="text-[9px] text-zinc-600 uppercase font-bold absolute top-2 left-2 pointer-events-none">{t.wb_audio}</p>
                                <input 
                                  type="text" 
                                  className="w-full bg-black/20 text-xs text-zinc-400 p-2 pl-12 rounded-lg border border-white/5 focus:border-orange-500/50 focus:outline-none italic" 
                                  value={script.audio} 
                                  onChange={(e) => { const newScripts = scripts.map(s => s.id === script.id ? { ...s, audio: e.target.value } : s); setScripts(newScripts); }} 
                                />
                           </div>
                        </div>
                     </div>
                  ))}
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
                          <div className="text-center opacity-30"><Film className="w-12 h-12 mx-auto mb-2 text-zinc-600" /><p className="text-xs text-zinc-600">{isGenerating ? 'Generating Video...' : t.wb_waiting}</p></div>
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
                  {generatedBatch.length === 0 ? (
                    <div className="text-[10px] text-zinc-600">暂无结果</div>
                  ) : (
                    <div className="space-y-2">
                      {generatedBatch.map(item => (
                        <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="block text-[10px] text-zinc-300 hover:text-orange-400 transition">
                          {item.assetName} × {item.scriptName}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. ASSETS VIEW */}
        {activeView === 'assets' && (
           <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
             <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-50">
                <div><h1 className="text-2xl font-bold tracking-tighter flex items-center gap-3 text-zinc-200">{t.assets_title}</h1><p className="text-zinc-500 text-xs mt-1">{t.assets_subtitle}</p></div>
                <div className="flex gap-3 items-center">
                  <LanguageSwitcher />
                  <button className="bg-zinc-800 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-zinc-700 transition flex items-center gap-2"><FolderPlus className="w-4 h-4" /> {t.assets_btn_new_folder}</button>
                  <button onClick={() => assetInputRef.current?.click()} className="bg-orange-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-orange-500 transition flex items-center gap-2 shadow-lg shadow-orange-500/20" disabled={isUploading}>
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {t.assets_btn_upload}
                  </button>
                  <input type="file" ref={assetInputRef} className="hidden" multiple onChange={handleAssetUpload} />
                </div>
             </header>
             <div className="flex-1 flex flex-col p-10 overflow-hidden">
                <div className="flex gap-4 mb-8 border-b border-white/5 pb-2">
                    {(['model', 'product', 'scene'] as AssetType[]).map(type => (
                        <button key={type} onClick={() => setActiveAssetTab(type)} className={`text-sm font-bold px-6 py-2 rounded-full transition ${activeAssetTab === type ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>{type.charAt(0).toUpperCase() + type.slice(1)}s</button>
                    ))}
                </div>
                <div className="flex-1 overflow-y-auto custom-scroll">
                    {isLoadingAssets ? (
                        <div className="flex justify-center py-20 text-zinc-500"><Loader2 className="animate-spin mr-2" /> Loading Assets...</div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-6">
                            <div onClick={() => assetInputRef.current?.click()} className="glass-card rounded-2xl aspect-[3/4] border-2 border-dashed border-zinc-800 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-orange-500/50 hover:bg-zinc-900/50 transition group">
                                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center group-hover:scale-110 transition"><Plus className="w-6 h-6 text-zinc-500 group-hover:text-orange-500" /></div>
                                <span className="text-xs font-medium text-zinc-500">{t.assets_upload_hint}</span>
                            </div>
                            {filteredAssets.map(asset => (
                                <div key={asset.id} className="glass-card rounded-2xl p-2 group relative">
                                    <div className="aspect-[3/4] bg-zinc-800 rounded-xl overflow-hidden relative">
                                        {asset.file_url ? (
                                            <img src={getDisplayUrl(asset.file_url) || 'https://via.placeholder.com/300x400?text=No+Image'} className="w-full h-full object-cover" alt={asset.name} onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300x400?text=Error'; }} />
                                        ) : (
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-center justify-center text-zinc-600">No Preview</div>
                                        )}
                                        <div className="absolute bottom-3 left-3"><p className="text-xs font-bold text-white truncate w-24">{asset.name}</p><p className="text-[10px] text-zinc-400">{asset.size || '-- MB'}</p></div>
                                        <div className="absolute top-2 right-2 bg-black/40 px-2 py-0.5 rounded text-[9px] text-white backdrop-blur-sm capitalize">{asset.status}</div>
                                    </div>
                                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition rounded-2xl flex flex-col items-center justify-center gap-2">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setUploadedFile(getDisplayUrl(asset.file_url) || null);
                                          setFileName(asset.name || '');
                                          setSelectedFileObj(null);
                                              setSelectedAssetUrl(asset.file_url || null);
                                              setSelectedAssetSource('preference');
                                          setGeneratedVideoUrl(null);
                                          setActiveView('workbench');
                                        }}
                                        className="bg-white text-black px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-500 hover:text-white transition"
                                      >
                                        Use in Workbench
                                      </button>
                                      <button className="bg-zinc-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-zinc-600 transition">Details</button>
                                      <button onClick={(e) => handleDeleteAsset(asset.id, e)} className="text-red-400 text-xs hover:text-red-300">Delete</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
             </div>
           </div>
        )}

        {/* 3. TEMPLATES VIEW */}
        {activeView === 'templates' && (
          <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
             <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-50">
                <div><h1 className="text-2xl font-bold tracking-tighter flex items-center gap-3 text-zinc-200">{t.tpl_title}</h1><p className="text-zinc-500 text-xs mt-1">{t.tpl_subtitle}</p></div>
                <div className="flex items-center gap-3">
                    <LanguageSwitcher />
                    <button onClick={() => openEditor()} className="bg-orange-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-orange-500 transition flex items-center gap-2 shadow-lg shadow-orange-500/20"><Plus className="w-4 h-4" /> {t.tpl_btn_new}</button>
                </div>
             </header>
             <div className="flex-1 overflow-y-auto p-10">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                   {templateList.length === 0 && <div className="col-span-full text-center text-zinc-500 py-10">No templates found. Create one!</div>}
                   {templateList.map(tpl => (
                     <div key={tpl.id} className={`glass-card rounded-2xl p-6 relative group overflow-hidden border-t-4 flex flex-col justify-between h-96 ${tpl.icon === 'gem' ? 'border-t-orange-500' : 'border-t-purple-500'}`}>
                        <div className={`absolute -right-10 -top-10 w-32 h-32 rounded-full blur-2xl transition group-hover:opacity-40 opacity-20 ${tpl.icon === 'gem' ? 'bg-orange-500' : 'bg-purple-500'}`} />
                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-6">
                            <div className="w-12 h-12 rounded-xl bg-zinc-800/80 border border-white/5 flex items-center justify-center text-white shadow-lg">
                              {tpl.icon === 'gem' ? <Gem className="w-6 h-6" /> : (tpl.icon === 'zap' ? <Zap className="w-6 h-6"/> : <Flame className="w-6 h-6"/>)}
                            </div>
                            <button onClick={(e) => handleDeleteTemplate(tpl.id!, e)} className="p-2 hover:bg-zinc-800 rounded text-zinc-500 hover:text-red-500 transition cursor-pointer"><Trash2 className="w-4 h-4" /></button>
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
                <div className="flex items-center gap-4">
                    <button onClick={() => setActiveView('templates')} className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 transition"><ArrowLeft className="w-5 h-5" /></button>
                    <div><h1 className="text-xl font-bold text-white">{editingTemplate ? 'Edit Template' : t.editor_title}</h1><p className="text-xs text-zinc-500">{t.editor_subtitle}</p></div>
                </div>
                <LanguageSwitcher />
             </div>
             <div className="flex-1 overflow-y-auto p-10 max-w-5xl mx-auto w-full custom-scroll">
                <div className="glass-panel p-8 rounded-3xl border border-white/10 space-y-8">
                   <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-zinc-400">{t.editor_label_name}</label>
                        <input type="text" value={editorForm.name} onChange={e => setEditorForm({...editorForm, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-zinc-400">{t.editor_label_icon}</label>
                        <div className="flex gap-3">
                            {['flame', 'gem', 'zap'].map(icon => (
                              <button key={icon} onClick={() => setEditorForm({...editorForm, icon})} className={`w-12 h-12 rounded-xl border flex items-center justify-center transition ${editorForm.icon === icon ? 'bg-orange-500/20 border-orange-500 text-orange-500' : 'bg-zinc-800 border-white/5 text-zinc-500 hover:text-white'}`}>
                                {icon === 'flame' && <Flame className="w-6 h-6" />}
                                {icon === 'gem' && <Gem className="w-6 h-6" />}
                                {icon === 'zap' && <Zap className="w-6 h-6" />}
                              </button>
                            ))}
                        </div>
                      </div>
                   </div>
                   <hr className="border-white/5" />
                   <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-zinc-400">{t.editor_label_category}</label>
                        <div className="relative">
                            <select
                              value={isCustomCategory ? '__custom__' : editorForm.product_category}
                              onChange={e => {
                                const value = e.target.value;
                                if (value === '__custom__') {
                                  setIsCustomCategory(true);
                                  setEditorForm({ ...editorForm, product_category: customCategory });
                                } else {
                                  setIsCustomCategory(false);
                                  setCustomCategory('');
                                  setEditorForm({ ...editorForm, product_category: value });
                                }
                              }}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white appearance-none cursor-pointer"
                            >
                                <option value="camera">{t.opt_cat_camera}</option>
                                <option value="beauty">{t.opt_cat_beauty}</option>
                                <option value="food">{t.opt_cat_food}</option>
                                <option value="electronics">{t.opt_cat_digital}</option>
                                <option value="__custom__">{t.opt_cat_custom}</option>
                            </select>
                            <ChevronDown className="absolute right-4 top-3.5 w-4 h-4 text-zinc-500 pointer-events-none" />
                        </div>
                        {isCustomCategory && (
                          <input
                            type="text"
                            value={customCategory}
                            onChange={e => {
                              const value = e.target.value;
                              setCustomCategory(value);
                              setEditorForm({ ...editorForm, product_category: value });
                            }}
                            placeholder={t.editor_ph_select}
                            className="mt-3 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white"
                          />
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-zinc-400">{t.editor_label_style}</label>
                        <div className="relative">
                            <select
                              value={isCustomStyle ? '__custom__' : editorForm.visual_style}
                              onChange={e => {
                                const value = e.target.value;
                                if (value === '__custom__') {
                                  setIsCustomStyle(true);
                                  setEditorForm({ ...editorForm, visual_style: customStyle });
                                } else {
                                  setIsCustomStyle(false);
                                  setCustomStyle('');
                                  setEditorForm({ ...editorForm, visual_style: value });
                                }
                              }}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white appearance-none cursor-pointer"
                            >
                                <option value="realistic">{t.opt_style_real}</option>
                                <option value="cinematic">{t.opt_style_cine}</option>
                                <option value="3d">{t.opt_style_3d}</option>
                                <option value="anime">{t.opt_style_anime}</option>
                                <option value="__custom__">{t.opt_style_custom}</option>
                            </select>
                            <ChevronDown className="absolute right-4 top-3.5 w-4 h-4 text-zinc-500 pointer-events-none" />
                        </div>
                        {isCustomStyle && (
                          <input
                            type="text"
                            value={customStyle}
                            onChange={e => {
                              const value = e.target.value;
                              setCustomStyle(value);
                              setEditorForm({ ...editorForm, visual_style: value });
                            }}
                            placeholder={t.editor_ph_select}
                            className="mt-3 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white"
                          />
                        )}
                      </div>
                   </div>
                   <div className="grid grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-zinc-400">{t.editor_label_ratio}</label>
                        <div className="relative">
                            <select value={editorForm.aspect_ratio} onChange={e => setEditorForm({...editorForm, aspect_ratio: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white appearance-none cursor-pointer">
                                <option value="16:9">16:9 (1280x720)</option>
                                <option value="9:16">9:16 (720x1280)</option>
                                <option value="1:1">1:1 (1080x1080)</option>
                            </select>
                            <ChevronDown className="absolute right-4 top-3.5 w-4 h-4 text-zinc-500 pointer-events-none" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-zinc-400">{t.editor_label_duration}</label>
                        <input type="number" value={editorForm.duration} onChange={e => setEditorForm({...editorForm, duration: parseInt(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-zinc-400">{t.editor_label_shots}</label>
                        <input type="number" value={editorForm.shot_number} onChange={e => setEditorForm({...editorForm, shot_number: parseInt(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white" />
                      </div>
                   </div>
                   <div className="space-y-2">
                      <label className="text-sm font-bold text-zinc-400">{t.editor_label_custom}</label>
                      <textarea value={editorForm.custom_config} onChange={e => setEditorForm({...editorForm, custom_config: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white resize-none h-24" placeholder={t.editor_ph_custom}></textarea>
                   </div>
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
             <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-50">
                <div><h1 className="text-2xl font-bold tracking-tighter flex items-center gap-3 text-zinc-200">{t.hist_title}</h1><p className="text-zinc-500 text-xs mt-1">{t.hist_subtitle}</p></div>
                <LanguageSwitcher />
             </header>
             <div className="flex-1 overflow-y-auto p-10 custom-scroll">
               <div className="max-w-5xl mx-auto space-y-4">
                  <div className="glass-card p-4 rounded-xl flex items-center gap-6 group hover:border-orange-500/50 transition">
                      <div className="w-40 aspect-video bg-zinc-800 rounded-lg overflow-hidden relative shrink-0 flex items-center justify-center"><Video className="w-6 h-6 text-zinc-700" /></div>
                      <div className="flex-1 min-w-0">
                          <h4 className="text-base font-bold text-white truncate group-hover:text-orange-500 transition">Project_Alpha_01</h4>
                          <p className="text-xs text-zinc-500 mb-3">2024-05-20 14:30</p>
                          <div className="flex gap-4 text-xs text-zinc-400"><span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> 15MB</span><span className="flex items-center gap-1"><Eye className="w-3 h-3" /> 24 Views</span></div>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition px-2"><button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"><Download className="w-4 h-4" /></button><button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"><Edit3 className="w-4 h-4" /></button></div>
                  </div>
               </div>
             </div>
           </div>
        )}

      </main>
    </div>
  );
};

export default Workbench;
