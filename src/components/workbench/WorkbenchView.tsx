import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, Plus, X, CheckCircle, FolderPlus, SlidersHorizontal, 
  Wand2, Loader2, Clapperboard, FileDown, FileUp, ArrowLeft, ArrowRight, PlayCircle,
  MonitorPlay, Film, SkipBack, Play, Pause, SkipForward, FileJson, Send, Cpu,
  Zap, Layers, Video, Lock, Info, Check, Sparkles
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useTasks } from '../../context/TaskContext';
import { useWorkbenchModel } from '../../context/WorkbenchModelContext';
import { videoApi } from '../../services/video';
import { assetsApi } from '../../services/assets';
import { tiktokApi } from '../../services/tiktok';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { DropdownSelect } from '../common/DropdownSelect';
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
  template_id: string | null;
  timestamp: number; // client timestamp (ms)
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

type LangLabelKey =
  | 'lang_en'
  | 'lang_zh'
  | 'lang_es'
  | 'lang_ja'
  | 'lang_ko'
  | 'lang_ms'
  | 'lang_vi';

const TARGET_LANGUAGE_OPTIONS: Array<{ value: string; labelKey: LangLabelKey }> = [
  { value: 'en', labelKey: 'lang_en' },
  { value: 'zh', labelKey: 'lang_zh' },
  { value: 'es', labelKey: 'lang_es' },
  { value: 'ja', labelKey: 'lang_ja' },
  { value: 'ko', labelKey: 'lang_ko' },
  { value: 'ms', labelKey: 'lang_ms' },
  { value: 'vi', labelKey: 'lang_vi' },
];

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
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { tasks, addTask } = useTasks();
  const { model: selectedModel, setModel: setSelectedModel } = useWorkbenchModel();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scriptFileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
  const lastFastModelRef = useRef<'kling' | 'sora2' | 'sora2pro' | 'seedance2.0'>('kling');
  
  // Processing State
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isPostingTikTok, setIsPostingTikTok] = useState(false);

  // Video Player State
  const [isPlaying, setIsPlaying] = useState(false);

  // Script State
  const buildDemoScripts = () => ([
    { id: 1, shot: '1', type: 'Medium', dur: '2s', visual: t.demo_shot1_visual, audio: t.demo_shot1_audio },
    { id: 2, shot: '2', type: 'Detail', dur: '2s', visual: t.demo_shot2_visual, audio: t.demo_shot2_audio }
  ]);
  const [scripts, setScripts] = useState<ScriptItem[]>(buildDemoScripts);
  const [scriptPages, setScriptPages] = useState<ScriptPage[]>(() => ([{ id: 'page-1', name: `${t.wb_script_page_prefix} 1`, scripts: buildDemoScripts() }]));
  const [activeScriptPage, setActiveScriptPage] = useState(0);

  // Queue State
  const [assetQueue, setAssetQueue] = useState<QueuedAsset[]>([]);
  const [scriptQueue, setScriptQueue] = useState<QueuedScript[]>([]);
  const [generatedBatch, setGeneratedBatch] = useState<Array<{ id: string; assetName: string; scriptName: string; taskId: string | number }>>([]);
  const [selectedQueueAssetId, setSelectedQueueAssetId] = useState<string | null>(null);

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

  // When the preview video changes, reset play state until we receive onPlay/onPause from the new element.
  useEffect(() => {
    setIsPlaying(false);
  }, [generatedVideoUrl]);

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

  // Duration Logic
  const currentScriptDuration = scripts.reduce((total, s) => {
    return total + (parseFloat(s.dur.replace('s', '')) || 0);
  }, 0);
  const isDurationValid = Math.abs(currentScriptDuration - genDuration) < 0.1;
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
  const handleWorkbenchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateUploadFile(file);
    if (err) {
      alert(`${err}\n\n支持格式：${formatHint}`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const url = URL.createObjectURL(file);
    setUploadedFile(url);
    setFileName(file.name);
    setSelectedFileObj(file);
    setSelectedAssetSource('product');
    setSelectedAssetUrl(null);
    setGeneratedVideoUrl(null);
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
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const err = validateUploadFile(file);
    if (err) {
      alert(`${err}\n\n支持格式：${formatHint}`);
      return;
    }
    const url = URL.createObjectURL(file);
    setUploadedFile(url);
    setFileName(file.name);
    setSelectedFileObj(file);
    setSelectedAssetSource('product');
    setSelectedAssetUrl(null);
    setGeneratedVideoUrl(null);
  };

  const removeUpload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (uploadedFile) {
      URL.revokeObjectURL(uploadedFile);
    }
    setUploadedFile(null);
    setSelectedFileObj(null);
    setFileName('');
    setSelectedAssetUrl(null);
    setLastUploadedUrl(null);
    setSelectedAssetSource(null);
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
    setGeneratedVideoUrl(null);
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
    const name = `${t.wb_script_page_prefix} ${scriptQueue.length + 1}`;
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
        // Persist target audience language in payload for future backend extensions
        target_language: targetLanguage,
        
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
            name: `${t.wb_script_page_prefix} ${idx + 1}`,
            scripts: buildScriptsFromShots(sc?.shots || [])
          }));
        }
        if (Array.isArray(data.script_variants)) {
          return data.script_variants.map((variant: any, idx: number) => ({
            id: `page-${idx + 1}`,
            name: `${t.wb_script_page_prefix} ${idx + 1}`,
            scripts: buildScriptsFromShots(variant?.script_content?.shots || variant?.shots || [])
          }));
        }
        if (Array.isArray(data.variants)) {
          return data.variants.map((variant: any, idx: number) => ({
            id: `page-${idx + 1}`,
            name: `${t.wb_script_page_prefix} ${idx + 1}`,
            scripts: buildScriptsFromShots(variant?.script_content?.shots || variant?.shots || [])
          }));
        }
        if (data.script_content?.shots) {
          return [{
            id: 'page-1',
            name: `${t.wb_script_page_prefix} 1`,
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
        if (assetQueue.length === 0 || scriptQueue.length === 0) {
          alert("批量生成需要同时加入素材队列和脚本队列");
          return;
        }
        if (!user?.id) {
          alert("请先登录");
          return;
        }

        setIsGenerating(true);
        setGeneratedVideoUrl(null);

        try {
          const batchItems: Array<{ id: string; assetName: string; scriptName: string; taskId: string | number }> = [];

          // 1) 处理素材：上传或复用已有路径
          const preparedAssets = await Promise.all(assetQueue.map(async (asset) => {
            let apiPath = asset.uploadedPath || asset.assetUrl || null;

            if (!apiPath && asset.fileObj) {
              const uploadResp = await assetsApi.uploadAsset(asset.fileObj, 'product');
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
              const combinedScriptPrompt = scriptPack.scripts.map(s => {
                const audioMarker = s.audio ? `【音频|【[旁白]】${s.audio}】` : '';
                return `${s.visual || ''} ${audioMarker}`.trim();
              }).join(' ');

              let newProjectId: string | undefined;
              if (selectedTemplate?.id) {
                const cloneResp = await videoApi.cloneProject(selectedTemplate.id);
                newProjectId = cloneResp?.data?.new_project_id || cloneResp?.new_project_id || cloneResp?.data?.id;
                if (!newProjectId) throw new Error('Failed to clone project');
              } else {
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
                image_path: (asset as any).apiPath,
                sound: soundSetting,
                asset_source: asset.source,
                user_language: language,
                target_language: targetLanguage,
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
            alert(`批量任务已提交，共 ${batchItems.length} 个`);
          } else {
            alert('批量提交完成，但未返回有效任务ID');
          }
        } catch (err: any) {
          alert(`批量生成失败：${err?.message || '未知错误'}`);
        } finally {
          setIsGenerating(false);
        }

        return;
      }

      // 2. Single Video Generation
      if (!selectedFileObj && !selectedAssetUrl && !uploadedFile) return alert("Please upload a reference image first!");
      if (scripts.length === 0) return alert("Please generate or add scripts first!");
      if (!isDurationValid) return alert(`Total script duration (${currentScriptDuration}s) must match requested duration (${genDuration}s)!`);
      if (!selectedTemplate?.id && !user?.id) return alert("请先登录");

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
          image_path: apiPath, 
          sound: soundSetting,
          asset_source: selectedAssetSource,
          user_language: language,
          target_language: targetLanguage,
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

  const handlePublishToTikTok = async () => {
    if (!generatedVideoUrl) {
      alert('请先生成并预览视频');
      return;
    }

    const targetProjectId = previewProjectId || lastGeneratedProjectId;
    if (!targetProjectId) {
      alert('未找到视频对应的项目ID，请稍后重试');
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

      const userConfirmed = confirm(confirmMessage);
      if (!userConfirmed) {
        // 用户点击了取消，询问是否要切换账号
        const switchAccount = confirm(
          '是否要切换TikTok账号？\n\n' +
          '点击"确定"后：\n' +
          '1. 系统将取消当前授权\n' +
          '2. 跳转到TikTok授权页面\n' +
          '3. 如需切换到其他账号，请在TikTok页面先退出当前账号，再登录新账号\n' +
          '4. 授权成功后视频将自动上传到新账号的草稿箱'
        );
        if (switchAccount) {
          try {
            await tiktokApi.revokeAuth();
            // 取消授权成功，跳转到授权页面
            alert('当前授权已取消，即将跳转到TikTok授权页面。\n\n如需切换账号，请在TikTok页面先退出当前账号。');
            const authUrl = await tiktokApi.getAuthUrl(targetProjectId);
            window.location.href = authUrl;
            return;
          } catch (err: any) {
            alert(err?.message || '切换账号失败');
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

      alert('已上传到TikTok草稿箱，请在App中查看并发布');
    } catch (err: any) {
      alert(err?.message || '上传失败');
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
          ? 'kling-v2-6'
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
              {language === 'zh' ? '可灵2.5Turbo' : 'Kling2.5Turbo'}
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
        title: language === 'zh' ? '可灵 2.5Turbo' : 'Kling 2.5Turbo',
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
      {modelSelector}
      {false && legacyModelSelector}
      {/* Upload Section */}
      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><UploadCloud className="w-3 h-3" /> {t.wb_upload_title}</h2>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleUploadDragOver}
          onDragEnter={handleUploadDragOver}
          onDragLeave={handleUploadDragLeave}
          onDrop={handleUploadDrop}
          className={`glass-panel rounded-xl p-1 border-2 border-dashed transition-colors h-32 relative group cursor-pointer ${uploadedFile ? 'border-none' : ''} ${isDragUploadActive ? 'border-orange-500/80 bg-orange-500/10' : 'border-zinc-800 hover:border-orange-500/50'}`}
        >
          {isDragUploadActive && (
            <div className="absolute inset-1 rounded-lg border border-dashed border-orange-500/60 bg-orange-500/10 pointer-events-none" />
          )}
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*,audio/*" onChange={handleWorkbenchUpload} />
          {!uploadedFile ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
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
         <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><FolderPlus className="w-3 h-3" /> {t.wb_reuse_queue}</h2>
         <div className="glass-panel rounded-xl p-4 flex flex-col gap-4">
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
                     <div className="w-8 h-8 rounded bg-zinc-800 overflow-hidden shrink-0">{item.previewUrl && <img src={item.previewUrl} className="w-full h-full object-cover"/>}</div>
                     <div className="flex-1 min-w-0"><div className="text-[10px] text-zinc-200 truncate">{item.name}</div></div>
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
                       <div className="text-[9px] text-zinc-500">{item.scripts.length} shots</div>
                     </div>
                     <button onClick={() => removeScriptFromQueue(item.id)}><X className="w-3 h-3 text-zinc-600 hover:text-red-400" /></button>
                  </div>
               ))}
            </div>

            <div className="text-[10px] text-zinc-500 pt-2 border-t border-white/5">
               {t.wb_estimated_generate}: {assetQueue.length} × {scriptQueue.length} = {expectedBatchCount}
            </div>
         </div>
      </div>

      {/* Config Panel (Restored Controls) */}
      <div className="flex flex-col gap-3 flex-1 transition-opacity duration-500">
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
        
        <div className="flex-auto flex flex-col gap-3 h-full min-w-[300px]">
           <div className="flex justify-between items-center shrink-0 h-[32px]">
              <div className="flex items-center gap-3">
                 <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Clapperboard className="w-3 h-3" /> {t.wb_col_scripts}</h2>
                 <div className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDurationValid ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>{currentScriptDuration.toFixed(1)}s / {genDuration}s</div>
                 {/* Icons for script handling */}
                 <div className="flex items-center gap-1 ml-2 border-l border-white/10 pl-3">
                  <button 
                    onClick={handleDownloadScripts} 
                    className="flex items-center gap-1.5 px-2 py-1 text-zinc-500 hover:text-white hover:bg-white/5 rounded transition" 
                    title={t.wb_export_scripts}
                  >
                    <FileDown className="w-3.5 h-3.5" />
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
                    <div key={script.id} className={`glass-card p-4 rounded-xl group relative !border-l-2 ${index % 2 === 0 ? '!border-l-purple-500' : '!border-l-orange-500'}`}>
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
                            <div className="flex flex-col gap-1.5">
                                <p className="text-[10px] text-zinc-500 uppercase font-bold ml-1">{t.wb_visual}</p>
                                <textarea className="w-full bg-black/20 text-xs text-zinc-300 p-3 rounded-lg border border-white/5 resize-none min-h-[60px] focus:border-white/20 transition-colors outline-none custom-scroll" value={script.visual} onChange={(e) => { const ns = [...scripts]; ns[index].visual = e.target.value; updateScripts(ns); }} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <p className="text-[10px] text-zinc-500 uppercase font-bold ml-1">{t.wb_audio}</p>
                                <input type="text" className="w-full bg-black/20 text-xs text-zinc-400 p-3 rounded-lg border border-white/5 italic focus:border-white/20 transition-colors outline-none" value={script.audio} onChange={(e) => { const ns = [...scripts]; ns[index].audio = e.target.value; updateScripts(ns); }} />
                            </div>
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
               {generatedBatch.length === 0 ? <div className="text-[10px] text-zinc-600">{t.wb_batch_no_results}</div> : <div className="space-y-2">{generatedBatch.map(item => { const task = tasks.find(t => t.id === item.taskId); const status = task?.status; const url = task?.result?.video_url || task?.result?.url; return (<div key={item.id} className="flex items-center justify-between gap-2 text-[10px]"><span className="truncate text-zinc-300">{item.assetName} × {item.scriptName}</span>{status === 'success' && url ? (<button onClick={() => setGeneratedVideoUrl(url)} className="text-orange-400 hover:text-orange-300 transition">预览</button>) : status === 'failed' ? (<span className="text-red-400">失败</span>) : (<span className="text-zinc-500">生成中…</span>)}</div>); })}</div>}
            </div>
        </div>
      </div>
    </div>
  );
};
