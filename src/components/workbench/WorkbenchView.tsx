import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, Plus, X, CheckCircle, FolderPlus, SlidersHorizontal, ChevronDown, 
  Wand2, Loader2, Clapperboard, FileDown, FileUp, ArrowLeft, ArrowRight, PlayCircle,
  MonitorPlay, Film, SkipBack, Play, SkipForward, FileJson
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useTasks } from '../../context/TaskContext';
import { videoApi } from '../../services/video';
import { assetsApi } from '../../services/assets';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { type Template } from '../../services/templates';


// Types specific to Workbench View
type ScriptItem = {
  id: number;
  shot: string;
  type: string;
  dur: string;
  visual: string;
  audio: string;
};

type ScriptPage = {
  id: string;
  name: string;
  scripts: ScriptItem[];
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

// What we persist to the backend for cross-refresh / cross-device restore.
// Keep it JSON-serializable (no File / Blob / functions).
type WorkbenchSnapshot = {
  version: 1;
  asset_url: string | null; // URL or "/media/..." path (backend accepts both)
  file_name: string;
  asset_source: 'product' | 'preference' | null;
  prompt: string;
  duration: number;
  sound: 'on' | 'off';
  script_count: number;
  template_id: string | null;
  script_pages: ScriptPage[];
  active_page_index: number;
  timestamp: number; // client timestamp (ms)
};

// Helper constants
const RATIO_TO_RES: Record<string, string> = {
  '16:9': '1280*720',
  '9:16': '720*1280',
  '1:1': '1080*1080',
  '4:3': '1024*768',
};

const ICON_EMOJI_MAP: Record<string, string> = { 'flame': '🔥', 'gem': '💎', 'zap': '⚡' };

const toDisplayUrl = (path: string | null): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const mediaBaseUrl = (import.meta as any).env?.VITE_MEDIA_BASE_URL || '';
  return mediaBaseUrl ? `${mediaBaseUrl}${path}` : path;
};

interface WorkbenchViewProps {
  initialFileUrl?: string | null;
  initialFileName?: string;
  initialAssetSource?: 'product' | 'preference' | null;
  templateList: Template[];
  onSelectTemplate: (t: Template | null) => void;
  selectedTemplate: Template | null;
  generatedVideoUrl: string | null;
  setGeneratedVideoUrl: (url: string | null) => void;
}

export const WorkbenchView: React.FC<WorkbenchViewProps> = ({
  initialFileUrl,
  initialFileName,
  initialAssetSource,
  templateList,
  onSelectTemplate,
  selectedTemplate,
  generatedVideoUrl,
  setGeneratedVideoUrl
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { tasks, addTask } = useTasks();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scriptFileInputRef = useRef<HTMLInputElement>(null);

  // --- Local State ---
  const [uploadedFile, setUploadedFile] = useState<string | null>(initialFileUrl || null);
  const [fileName, setFileName] = useState(initialFileName || '');
  const [selectedFileObj, setSelectedFileObj] = useState<File | null>(null);
  const [selectedAssetSource, setSelectedAssetSource] = useState<'product' | 'preference' | null>(initialAssetSource || null);
  // We use this to display the URL if provided initially
  const [selectedAssetUrl, setSelectedAssetUrl] = useState<string | null>(initialFileUrl || null);
  const [lastUploadedUrl, setLastUploadedUrl] = useState<string | null>(initialFileUrl || null);

  // Draft restore / autosave
  const [isRestoring, setIsRestoring] = useState(true);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSnapshotRef = useRef<WorkbenchSnapshot | null>(null);
  const canAutoSaveRef = useRef(false);
  const skipTemplateDurationSyncRef = useRef(false);

  // Config State
  const [genPrompt, setGenPrompt] = useState('');
  const [genDuration, setGenDuration] = useState<number>(selectedTemplate?.duration || 10);
  const [soundSetting, setSoundSetting] = useState<'on' | 'off'>('on');
  const [scriptVariantCount, setScriptVariantCount] = useState<number>(1);
  
  // Processing State
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  // Script State
  const buildDemoScripts = () => ([
    { id: 1, shot: '1', type: 'Medium', dur: '2s', visual: t.demo_shot1_visual, audio: t.demo_shot1_audio },
    { id: 2, shot: '2', type: 'Detail', dur: '2s', visual: t.demo_shot2_visual, audio: t.demo_shot2_audio }
  ]);
  const [scripts, setScripts] = useState<ScriptItem[]>(buildDemoScripts);
  const [scriptPages, setScriptPages] = useState<ScriptPage[]>(() => ([{ id: 'page-1', name: '脚本 1', scripts: buildDemoScripts() }]));
  const [activeScriptPage, setActiveScriptPage] = useState(0);

  // Queue State
  const [assetQueue, setAssetQueue] = useState<QueuedAsset[]>([]);
  const [scriptQueue, setScriptQueue] = useState<QueuedScript[]>([]);
  const [generatedBatch, setGeneratedBatch] = useState<Array<{ id: string; assetName: string; scriptName: string; taskId: string | number }>>([]);

  // --- Effects ---
  useEffect(() => {
    // Reset or update duration when template changes
    if (!selectedTemplate) return;

    // When we apply a restored template, keep the duration we restored from the snapshot.
    if (skipTemplateDurationSyncRef.current) {
      skipTemplateDurationSyncRef.current = false;
      return;
    }

    // During draft restore we may set duration from snapshot; don't override it.
    if (!isRestoring) setGenDuration(selectedTemplate.duration);
  }, [selectedTemplate, isRestoring]);

  // Keep a ref so unmount flush doesn't depend on hook dependency arrays.
  useEffect(() => {
    canAutoSaveRef.current = !!user?.id && !isRestoring;
  }, [user?.id, isRestoring]);

  // 1) Restore draft when entering workbench (mount) or after login
  useEffect(() => {
    let cancelled = false;

    const restoreDraft = async () => {
      setIsRestoring(true);

      if (!user?.id) {
        setIsRestoring(false);
        return;
      }

      try {
        const res = await videoApi.getDraft();
        if (cancelled) return;

        const snap = (res && res.code === 0 ? res.data?.snapshot : null) as Partial<WorkbenchSnapshot> | null;
        if (snap && typeof snap === 'object') {
          // Asset
          const assetUrl = typeof snap.asset_url === 'string' ? snap.asset_url : null;
          const displayUrl = toDisplayUrl(assetUrl);
          setLastUploadedUrl(assetUrl);
          setUploadedFile(displayUrl);
          setSelectedAssetUrl(displayUrl);
          setSelectedFileObj(null); // can't restore File

          // Config
          if (typeof snap.file_name === 'string') setFileName(snap.file_name);
          if (snap.asset_source === 'product' || snap.asset_source === 'preference' || snap.asset_source === null) {
            setSelectedAssetSource(snap.asset_source);
          }
          if (typeof snap.prompt === 'string') setGenPrompt(snap.prompt);
          if (typeof snap.duration === 'number') setGenDuration(snap.duration);
          if (snap.sound === 'on' || snap.sound === 'off') setSoundSetting(snap.sound);
          if (typeof snap.script_count === 'number') setScriptVariantCount(snap.script_count);

          // Scripts
          if (Array.isArray(snap.script_pages) && snap.script_pages.length > 0) {
            const pages = snap.script_pages as ScriptPage[];
            const rawIdx = typeof snap.active_page_index === 'number' ? snap.active_page_index : 0;
            const idx = Math.min(Math.max(rawIdx, 0), pages.length - 1);
            setScriptPages(pages);
            setActiveScriptPage(idx);
            setScripts(pages[idx]?.scripts || []);
          }

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

        // If an asset is passed in (e.g. "Use in Workbench"), it should override the restored asset.
        if (initialFileUrl) {
          setUploadedFile(initialFileUrl);
          setSelectedAssetUrl(initialFileUrl);
          setLastUploadedUrl(initialFileUrl);
          if (initialFileName) setFileName(initialFileName);
          setSelectedFileObj(null);
          setSelectedAssetSource(initialAssetSource || 'preference');
          setGeneratedVideoUrl(null);
        }

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
    }
  }, [pendingTemplateId, selectedTemplate?.id, templateList, onSelectTemplate]);

  // Keep a best-effort "latest snapshot" for debounce + unmount flush.
  const normalizedScriptPages: ScriptPage[] = (scriptPages || []).map((p, idx) =>
    idx === activeScriptPage ? { ...p, scripts } : p
  );
  latestSnapshotRef.current = {
    version: 1,
    asset_url: lastUploadedUrl || selectedAssetUrl || null,
    file_name: fileName,
    asset_source: selectedAssetSource,
    prompt: genPrompt,
    duration: genDuration,
    sound: soundSetting,
    script_count: scriptVariantCount,
    template_id: (selectedTemplate?.id as string | undefined) || null,
    script_pages: normalizedScriptPages,
    active_page_index: activeScriptPage,
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
  }, [
    user?.id,
    isRestoring,
    lastUploadedUrl,
    selectedAssetUrl,
    fileName,
    selectedAssetSource,
    genPrompt,
    genDuration,
    soundSetting,
    scriptVariantCount,
    selectedTemplate?.id,
    scripts,
    scriptPages,
    activeScriptPage,
  ]);

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

  // Duration Logic
  const currentScriptDuration = scripts.reduce((total, s) => {
    return total + (parseFloat(s.dur.replace('s', '')) || 0);
  }, 0);
  const isDurationValid = Math.abs(currentScriptDuration - genDuration) < 0.1;
  const isReuseReady = assetQueue.length > 0 && scriptQueue.length > 0;
  const expectedBatchCount = isReuseReady ? assetQueue.length * scriptQueue.length : 0;

  // --- Handlers ---
  const handleWorkbenchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setUploadedFile(url);
      setFileName(file.name);
      setSelectedFileObj(file);
      setSelectedAssetSource('product');
      setSelectedAssetUrl(null);
      setGeneratedVideoUrl(null);
    }
  };

  const removeUpload = (e: React.MouseEvent) => {
    e.stopPropagation();
    setUploadedFile(null);
    setSelectedFileObj(null);
    setFileName('');
    setSelectedAssetUrl(null);
    setLastUploadedUrl(null);
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

  const updateScripts = (newScripts: ScriptItem[]) => {
     setScripts(newScripts);
     setScriptPages(prev => {
        const next = [...prev];
        next[activeScriptPage] = { ...next[activeScriptPage], scripts: newScripts };
        return next;
     });
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
      alert('请先选择或上传素材');
      return;
    }
    const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const previewUrl = uploadedFile || selectedAssetUrl || null;
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
    // Deep copy scripts
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

  // --- API Handlers ---
 const handleGenerateScripts = async () => {
    if (!user?.id) return alert("Please log in first");
    
    setIsGeneratingScript(true);

    try {
      let imagePath = "";

      // 1. Upload Image (if one is selected but not yet uploaded)
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
        script_count: scriptVariantCount,
        
        script_content: {
            duration: duration,
            shot_number: shots,
            custom: selectedTemplate?.custom_config || "突出夜景拍摄",
            // Inner level prompt
            input: promptText,
            prompt: promptText,
            user_prompt: promptText,
            script_count: scriptVariantCount,
            shots: [] 
        },
        product_image_path: imagePath || "http://1.95.137.119:8001/media/uploads/default.jpg",
        asset_source: selectedAssetSource || (selectedFileObj ? 'product' : 'preference')
      };

      console.log("📜 Generating Script with payload:", payload);

      const response = await videoApi.generateScript(user.id, payload);
      
      console.log("✅ Script Generated:", response);

      // 3. Helper to parse response
      const buildScriptsFromShots = (shots: any[]) => shots.map((shot: any) => ({
        id: shot.shot_index,
        shot: shot.shot_index.toString(),
        type: 'General', 
        dur: `${shot.duration_sec}s`,
        visual: shot.visual,
        audio: shot.audio || shot.voiceover || shot.beat 
      }));

      // 4. Handle various response formats from API
      const extractScriptPages = (data: any): ScriptPage[] => {
        if (!data) return [];
        if (Array.isArray(data.script_contents)) {
          return data.script_contents.map((sc: any, idx: number) => ({
            id: `page-${idx + 1}`,
            name: `脚本 ${idx + 1}`,
            scripts: buildScriptsFromShots(sc?.shots || [])
          }));
        }
        if (Array.isArray(data.script_variants)) {
          return data.script_variants.map((variant: any, idx: number) => ({
            id: `page-${idx + 1}`,
            name: `脚本 ${idx + 1}`,
            scripts: buildScriptsFromShots(variant?.script_content?.shots || variant?.shots || [])
          }));
        }
        if (Array.isArray(data.variants)) {
          return data.variants.map((variant: any, idx: number) => ({
            id: `page-${idx + 1}`,
            name: `脚本 ${idx + 1}`,
            scripts: buildScriptsFromShots(variant?.script_content?.shots || variant?.shots || [])
          }));
        }
        if (data.script_content?.shots) {
          return [{
            id: 'page-1',
            name: '脚本 1',
            scripts: buildScriptsFromShots(data.script_content.shots)
          }];
        }
        return [];
      };

      if (response.code === 0) {
        const pages = extractScriptPages(response.data);
        if (pages.length > 0) {
          setScriptPages(pages);
          setActiveScriptPage(0);
          setScripts(pages[0].scripts);
        } else {
          alert("Script generation completed but returned unexpected data.");
        }
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

  // --- Script Import / Export Functions ---

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

  const handleGenerateVideo = async () => {
      // 1. Batch Generation (Reuse Queue)
      if (assetQueue.length > 0 || scriptQueue.length > 0) {
        // ... (Keep the batch logic provided in the previous step) ...
        // (If you haven't added the batch logic from the previous answer yet, make sure to include it here)
        return;
      }

      // 2. Single Video Generation
      if (!selectedFileObj && !selectedAssetUrl && !uploadedFile) return alert("Please upload a reference image first!");
      if (scripts.length === 0) return alert("Please generate or add scripts first!");
      if (!selectedTemplate?.id) return alert("Please select a Template from the Config panel first!");
      if (!isDurationValid) return alert(`Total script duration (${currentScriptDuration}s) must match requested duration (${genDuration}s)!`);

      setIsGenerating(true);
      setGeneratedVideoUrl(null); 

      try {
        // --- FIX: Real Image Path Extraction Logic ---
        let apiPath = lastUploadedUrl; 
        
        if (!apiPath && selectedFileObj) {
            console.log("🚀 Uploading reference image...");
            const uploadResp = await assetsApi.uploadAsset(selectedFileObj, 'product');
            
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

        if (!apiPath) throw new Error("Could not determine image path");

        // Combine Scripts
        const combinedScriptPrompt = scripts.map(s => {
            const audioMarker = s.audio ? `【音频|【[旁白]】${s.audio}】` : '';
            return `${s.visual || ''} ${audioMarker}`.trim();
        }).join(' ');

        // Clone Project & Generate
        const cloneResp = await videoApi.cloneProject(selectedTemplate.id);
        const newProjectId = cloneResp?.data?.new_project_id || cloneResp?.new_project_id || cloneResp?.data?.id;
        
        if (!newProjectId) throw new Error('Failed to clone project');

        const payload = {
          prompt: combinedScriptPrompt,
          project_id: newProjectId,
          duration: genDuration,
          image_path: apiPath, 
          sound: soundSetting,
          asset_source: selectedAssetSource
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
            thumbnail: uploadedFile || undefined,
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

  // --- Render Sections ---
  
  const renderLeftColumn = () => (
    <div className="w-[280px] xl:w-[320px] flex flex-col gap-6 shrink-0 h-full overflow-y-auto custom-scroll pr-1">
      {/* Upload Section */}
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
      </div>

      {/* Reuse Queues Section (Restored Buttons) */}
      <div className="flex flex-col gap-3">
         <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><FolderPlus className="w-3 h-3" /> 复用队列</h2>
         <div className="glass-panel rounded-xl p-4 flex flex-col gap-4">
            {/* Asset Queue */}
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
               {assetQueue.length === 0 ? <div className="text-[10px] text-zinc-600">暂无素材</div> : assetQueue.map(item => (
                  <div key={item.id} className="flex items-center gap-2 bg-black/30 rounded-lg p-2 border border-white/5">
                     <div className="w-8 h-8 rounded bg-zinc-800 overflow-hidden shrink-0">{item.previewUrl && <img src={item.previewUrl} className="w-full h-full object-cover"/>}</div>
                     <div className="flex-1 min-w-0"><div className="text-[10px] text-zinc-200 truncate">{item.name}</div></div>
                     <button onClick={() => removeAssetFromQueue(item.id)}><X className="w-3 h-3 text-zinc-600 hover:text-red-400" /></button>
                  </div>
               ))}
            </div>

            {/* Script Queue */}
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
               {scriptQueue.length === 0 ? <div className="text-[10px] text-zinc-600">暂无脚本</div> : scriptQueue.map(item => (
                  <div key={item.id} className="flex items-center gap-2 bg-black/30 rounded-lg p-2 border border-white/5">
                     <div className="flex-1 min-w-0">
                       <div className="text-[10px] text-zinc-200 truncate">{item.name}</div>
                       <div className="text-[9px] text-zinc-500">{item.scripts.length} shots</div>
                     </div>
                     <button onClick={() => removeScriptFromQueue(item.id)}><X className="w-3 h-3 text-zinc-600 hover:text-red-400" /></button>
                  </div>
               ))}
            </div>

            <div className="text-[10px] text-zinc-500 pt-2 border-t border-white/5">
               预计生成：{assetQueue.length} × {scriptQueue.length} = {expectedBatchCount}
            </div>
         </div>
      </div>

      {/* Config Panel (Restored Controls) */}
      <div className={`flex flex-col gap-3 flex-1 transition-opacity duration-500 ${!uploadedFile && !lastUploadedUrl ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex justify-between items-center"><h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><SlidersHorizontal className="w-3 h-3" /> {t.wb_config_title}</h2></div>
        <div className="glass-panel rounded-xl p-5 flex flex-col gap-5">
           {/* Template Selector */}
           <div>
              <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_template_label}</label>
              <div className="relative">
                <select 
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-orange-500 font-bold focus:outline-none focus:border-orange-500 transition appearance-none cursor-pointer hover:bg-white/5"
                    value={selectedTemplate?.id || ""}
                    onChange={(e) => onSelectTemplate(templateList.find(t => t.id === e.target.value) || null)}
                >
                  <option value="">{t.wb_config_custom}</option>
                  {templateList.map(tpl => (
                      <option key={tpl.id} value={tpl.id}>{ICON_EMOJI_MAP[tpl.icon] || '🔥'} {tpl.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-3 top-2.5 pointer-events-none" />
              </div>
           </div>

           {/* Restored Inputs: Prompt, Duration, Audio, Count */}
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

           <div>
             <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">{t.wb_config_audio}</label>
             <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                <button onClick={() => setSoundSetting('on')} className={`flex-1 py-1.5 rounded-md text-[10px] font-medium transition ${soundSetting === 'on' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-400 hover:bg-zinc-800'}`}>{t.wb_config_audio_on}</button>
                <button onClick={() => setSoundSetting('off')} className={`flex-1 py-1.5 rounded-md text-[10px] font-medium transition ${soundSetting === 'off' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-400 hover:bg-zinc-800'}`}>{t.wb_config_audio_off}</button>
             </div>
           </div>

           <div>
              <label className="text-[10px] text-zinc-500 font-bold mb-2 block uppercase">生成脚本数量</label>
              <div className="flex items-center gap-2 bg-black/40 p-2 rounded-lg border border-white/5">
                <input type="number" min={1} max={10} value={scriptVariantCount} onChange={(e) => setScriptVariantCount(Number(e.target.value))} className="w-16 bg-transparent text-xs text-zinc-200 focus:outline-none text-center" />
                <span className="text-[10px] text-zinc-500">份</span>
              </div>
           </div>
           
           <button onClick={handleGenerateScripts} disabled={isGeneratingScript} className="w-full bg-white text-black py-3 rounded-xl font-bold text-xs hover:bg-orange-500 hover:text-white transition shadow-lg shadow-white/5 mt-2 flex items-center justify-center gap-2 group">
              {isGeneratingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 group-hover:rotate-12 transition" />} 
              {isGeneratingScript ? 'Generating...' : t.wb_btn_gen_scripts}
           </button>
        </div>
      </div>
    </div>
  );

  return (
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
        {renderLeftColumn()}
        
        {/* Middle Column: Scripts */}
        <div className="flex-auto flex flex-col gap-3 h-full min-w-[300px]">
           <div className="flex justify-between items-center shrink-0 h-[32px]">
              <div className="flex items-center gap-3">
                 <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Clapperboard className="w-3 h-3" /> {t.wb_col_scripts}</h2>
                 <div className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDurationValid ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>{currentScriptDuration.toFixed(1)}s / {genDuration}s</div>
                 {/* Icons for script handling */}
                 <div className="flex items-center gap-1 ml-2 border-l border-white/10 pl-3">
                  <button 
                    onClick={handleDownloadScripts} 
                    className="p-1 text-zinc-500 hover:text-white hover:bg-white/5 rounded transition" 
                    title="Export Scripts (JSON)"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                  </button>
                  
                  <button 
                    onClick={() => scriptFileInputRef.current?.click()} 
                    className="p-1 text-zinc-500 hover:text-white hover:bg-white/5 rounded transition" 
                    title="Import Scripts (JSON)"
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
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => handleScriptPageChange(activeScriptPage - 1)} 
                  disabled={scriptPages.length <= 1 || activeScriptPage === 0}
                  className={`p-1 rounded border border-white/10 text-zinc-400 hover:text-white hover:border-white/30 transition ${scriptPages.length <= 1 || activeScriptPage === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <ArrowLeft className="w-3 h-3" />
                </button>
                
                <div className="text-[10px] text-zinc-400 border border-white/10 px-2 py-0.5 rounded">
                  脚本 {activeScriptPage + 1} / {Math.max(scriptPages.length, 1)}
                </div>
                
                <button 
                  onClick={() => handleScriptPageChange(activeScriptPage + 1)} 
                  disabled={scriptPages.length <= 1 || activeScriptPage === scriptPages.length - 1}
                  className={`p-1 rounded border border-white/10 text-zinc-400 hover:text-white hover:border-white/30 transition ${scriptPages.length <= 1 || activeScriptPage === scriptPages.length - 1 ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <ArrowRight className="w-3 h-3" />
                </button>
            </div>
              <button onClick={handleGenerateVideo} disabled={isGenerating || (!isReuseReady && (!uploadedFile || !isDurationValid))} className={`bg-gradient-to-r from-purple-600 to-orange-500 text-white px-4 py-1.5 rounded-lg font-bold text-xs hover:brightness-110 active:scale-95 transition flex items-center gap-2 shadow-lg shadow-orange-500/20 ${isGenerating ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}>
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4 fill-current" />}{isGenerating ? 'Generating...' : t.wb_btn_gen_video}
              </button>
           </div>
           
           <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-4 pb-10">
              {scripts.length === 0 ? (
                 <div className="h-64 flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-zinc-800 rounded-xl bg-black/20">
                    <FileJson className="w-10 h-10 mb-2 opacity-50" />
                    <p className="text-xs">No scripts yet.</p>
                 </div>
              ) : (
                  scripts.map((script, index) => (
                    <div key={script.id} className={`glass-card p-4 rounded-xl group relative border-l-2 ${index % 2 === 0 ? 'border-l-purple-500' : 'border-l-orange-500'}`}>
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2">
                                <span className={`${index % 2 === 0 ? 'bg-purple-600' : 'bg-orange-500'} text-black text-[10px] font-bold px-1.5 py-0.5 rounded-sm`}>{t.wb_shot} {script.shot}</span>
                                <span className="text-[10px] text-zinc-400 border border-white/10 px-1.5 rounded">{script.type}</span>
                                <input type="number" step="0.1" className="w-8 bg-transparent text-[10px] text-zinc-300 text-right" value={parseFloat(script.dur.replace('s',''))} onChange={(e) => handleDurationChange(script.id, e.target.value)} />
                                <span className="text-[10px] text-zinc-500">s</span>
                            </div>
                            <button onClick={() => removeScript(script.id)} className="text-zinc-600 hover:text-red-500 transition p-1"><X className="w-3.5 h-3.5" /></button>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            <div className="relative"><p className="text-[9px] text-zinc-600 uppercase font-bold absolute top-2 left-2 pointer-events-none">{t.wb_visual}</p><textarea className="w-full bg-black/20 text-xs text-zinc-300 p-2 pt-6 rounded-lg border border-white/5 resize-none min-h-[60px]" value={script.visual} onChange={(e) => { const ns = [...scripts]; ns[index].visual = e.target.value; updateScripts(ns); }} /></div>
                            <div className="relative"><p className="text-[9px] text-zinc-600 uppercase font-bold absolute top-2 left-2 pointer-events-none">{t.wb_audio}</p><input type="text" className="w-full bg-black/20 text-xs text-zinc-400 p-2 pl-12 rounded-lg border border-white/5 italic" value={script.audio} onChange={(e) => { const ns = [...scripts]; ns[index].audio = e.target.value; updateScripts(ns); }} /></div>
                        </div>
                    </div>
                  ))
              )}
              <button onClick={addScript} className="w-full py-4 border border-dashed border-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 hover:text-orange-500 gap-2"><Plus className="w-4 h-4" /><span className="text-xs font-bold">{t.wb_btn_add_shot}</span></button>
           </div>
        </div>

        {/* Right Column: Preview & Results */}
        <div className="w-[300px] xl:w-[380px] flex flex-col gap-3 shrink-0 h-full">
            <div className="flex justify-between items-end shrink-0 h-[32px]">
               <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><MonitorPlay className="w-3 h-3" /> {t.wb_col_preview}</h2>
            </div>
            {/* Video Player */}
            <div className="glass-panel flex-1 rounded-2xl p-1 relative flex flex-col overflow-hidden">
                <div className="flex-1 bg-black rounded-xl relative overflow-hidden group flex items-center justify-center">
                    {generatedVideoUrl ? (
                        <video src={generatedVideoUrl} controls autoPlay loop className="w-full h-full object-contain" />
                    ) : (
                        <div className="text-center opacity-30"><Film className="w-12 h-12 mx-auto mb-2 text-zinc-600" /><p className="text-xs text-zinc-600">{isGenerating ? 'Submitting…' : t.wb_waiting}</p></div>
                    )}
                </div>
                <div className="h-14 flex items-center justify-between px-4 border-t border-white/5 bg-zinc-900/50">
                    <div className="flex gap-4"><button className="text-zinc-400 hover:text-white"><SkipBack className="w-4 h-4" /></button><button className="text-white hover:text-orange-500"><Play className="w-4 h-4 fill-current" /></button><button className="text-zinc-400 hover:text-white"><SkipForward className="w-4 h-4" /></button></div>
                </div>
            </div>
            
            {/* Batch Results Panel (Restored) */}
            <div className="glass-panel rounded-2xl p-4 border border-white/5 max-h-56 overflow-y-auto custom-scroll">
               <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">批量生成结果</div>
               {generatedBatch.length === 0 ? <div className="text-[10px] text-zinc-600">暂无结果</div> : <div className="space-y-2">{generatedBatch.map(item => { const task = tasks.find(t => t.id === item.taskId); const status = task?.status; const url = task?.result?.video_url || task?.result?.url; return (<div key={item.id} className="flex items-center justify-between gap-2 text-[10px]"><span className="truncate text-zinc-300">{item.assetName} × {item.scriptName}</span>{status === 'success' && url ? (<button onClick={() => setGeneratedVideoUrl(url)} className="text-orange-400 hover:text-orange-300 transition">预览</button>) : status === 'failed' ? (<span className="text-red-400">失败</span>) : (<span className="text-zinc-500">生成中…</span>)}</div>); })}</div>}
            </div>
        </div>
      </div>
    </div>
  );
};
