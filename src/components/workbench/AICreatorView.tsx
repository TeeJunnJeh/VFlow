import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Wand2,
  Film,
  FileText,
  Image as ImageIcon,
  Shirt,
  Sparkles,
  Loader2,
  ImagePlus,
  ScrollText,
  Upload,
  X,
  Pencil,
  Trash2,
  Plus,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Check,
  Menu,
  CheckCircle,
  Download,
  ExternalLink,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useTasks } from '../../context/TaskContext';
import {
  aiCreatorApi,
  type AiCreatorAction,
  type AiCreatorMessage,
  type AiCreatorConversation,
} from '../../services/aiCreator';
import { videoApi } from '../../services/video';
import { assetsApi } from '../../services/assets';
import { ApiError } from '../../services/errors';
import { AppDialog } from '../common/AppDialog';

const ACTION_ICONS: Record<string, React.ReactNode> = {
  generate_video: <Film className="w-5 h-5" />,
  generate_script: <FileText className="w-5 h-5" />,
  generate_image: <ImageIcon className="w-5 h-5" />,
  generate_first_frame: <ImageIcon className="w-5 h-5" />,
  clothing_swap: <Shirt className="w-5 h-5" />,
  chat: <Sparkles className="w-5 h-5" />,
};

const ACTION_LABELS_EN: Record<string, string> = {
  generate_video: 'Generate Video',
  generate_script: 'Generate Script',
  generate_image: 'Generate Image',
  generate_first_frame: 'Generate First Frame',
  clothing_swap: 'Clothing Swap',
  chat: 'Chat',
};

const ACTION_LABELS_ZH: Record<string, string> = {
  generate_video: '生成视频',
  generate_script: '生成脚本',
  generate_image: '生成图片',
  generate_first_frame: '生成首帧图',
  clothing_swap: 'AI 换装',
  chat: '对话',
};

interface GenerationResult {
  id: string;
  type: string;
  status: 'pending' | 'success' | 'failed';
  content?: string;
  imageUrl?: string;
  videoUrl?: string;
  taskId?: string | number;
  error?: string;
  model?: string;
}

interface UploadedImage {
  id: string;
  url: string;
  file: File;
}

const WELCOME_MESSAGE: AiCreatorMessage = {
  role: 'assistant',
  content:
    "👋 Hi! I'm your AI Creator. Just tell me what you want to make — a video, a script, an image, or anything else — and I'll generate it for you with one click.",
};

const WELCOME_MESSAGE_ZH: AiCreatorMessage = {
  role: 'assistant',
  content:
    "👋 你好！我是你的 AI 创作助手。告诉我你想制作什么——视频、脚本、图片，或其他任何内容——我会一键为你生成。",
};

type WaitProgressPhase = 'idle' | 'simulating' | 'holding' | 'finishing' | 'done';

const WAIT_PROGRESS_SIM_DURATION_MS = 90_000;
const WAIT_PROGRESS_MAX_BEFORE_HOLD = 90;
const WAITING_PREVIEW_VIDEO_SRC = (import.meta.env.VITE_WAITING_PREVIEW_VIDEO_URL || 'https://vflow.genviewtech.com/media/vedio.mp4').toString();

export const AICreatorView: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { tasks, addTask } = useTasks();
  const isZh = (t as any).ai_creator_title === 'AI 创作助手';

  const STORAGE_KEY = 'vflow_ai_creator_active_conversation';

  const [conversations, setConversations] = useState<AiCreatorConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [messages, setMessages] = useState<AiCreatorMessage[]>([isZh ? WELCOME_MESSAGE_ZH : WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  // Sidebar editing states
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [convoLoading, setConvoLoading] = useState(false);

  // Action confirmation dialog
  const [confirmAction, setConfirmAction] = useState<AiCreatorAction | null>(null);
  const [confirmParams, setConfirmParams] = useState<Record<string, unknown>>({});

  // Track which result ids are linked to global tasks so we don't duplicate updates
  const linkedTaskIdsRef = useRef<Set<string | number>>(new Set());

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 按会话缓存临时状态（生成结果、上传图片），切回时恢复（持久化到 localStorage）
  const resultsRef = useRef<GenerationResult[]>([]);
  const uploadedImagesRef = useRef<UploadedImage[]>([]);
  const activeConversationIdRef = useRef<string | null>(activeConversationId);

  useEffect(() => { resultsRef.current = results; }, [results]);
  useEffect(() => { uploadedImagesRef.current = uploadedImages; }, [uploadedImages]);
  useEffect(() => { activeConversationIdRef.current = activeConversationId; }, [activeConversationId]);

  const getSessionStorageKey = (conversationId: string) => `vflow_ai_creator_session_${user?.id || 'anon'}_${conversationId}`;

  const saveSessionState = (conversationId: string, state: { results: GenerationResult[]; uploadedImages: UploadedImage[] }) => {
    try {
      localStorage.setItem(
        getSessionStorageKey(conversationId),
        JSON.stringify({
          results: state.results,
          uploadedImages: state.uploadedImages.map((img) => ({ id: img.id, url: img.url })),
        })
      );
    } catch {
      // ignore storage errors
    }
  };

  const loadSessionState = (conversationId: string): { results: GenerationResult[]; uploadedImages: UploadedImage[] } | null => {
    try {
      const raw = localStorage.getItem(getSessionStorageKey(conversationId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const results: GenerationResult[] = Array.isArray(parsed.results) ? parsed.results : [];
      const uploadedImages: UploadedImage[] = (Array.isArray(parsed.uploadedImages) ? parsed.uploadedImages : []).map(
        (img: any) => ({
          id: img.id || `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          url: img.url,
          file: null as any,
        })
      );
      return { results, uploadedImages };
    } catch {
      return null;
    }
  };

  // === Wait Progress Simulation (Workbench-style loading) ===
  const [waitProgress, setWaitProgress] = useState(0);
  const [waitProgressPhase, setWaitProgressPhase] = useState<WaitProgressPhase>('idle');
  const [waitingVideoFailed, setWaitingVideoFailed] = useState(false);

  const waitProgressTimerRef = useRef<number | null>(null);
  const waitProgressStartedAtRef = useRef<number | null>(null);
  const waitProgressValueRef = useRef(0);
  const waitProgressPhaseRef = useRef<WaitProgressPhase>('idle');
  const waitProgressHoldValueRef = useRef<number | null>(null);
  const waitProgressDebugPrintedRef = useRef(false);
  const waitProgressSimDurationMsRef = useRef<number>(WAIT_PROGRESS_SIM_DURATION_MS);
  const waitProgressTrackedTaskIdRef = useRef<string | number | null>(null);
  const waitProgressRafRef = useRef<number | null>(null);

  const clearWaitProgressTimers = () => {
    if (waitProgressTimerRef.current) {
      window.clearTimeout(waitProgressTimerRef.current);
      waitProgressTimerRef.current = null;
    }
    if (waitProgressRafRef.current) {
      window.cancelAnimationFrame(waitProgressRafRef.current);
      waitProgressRafRef.current = null;
    }
  };

  const setWaitProgressWithRef = (value: number) => {
    const clamped = Math.max(0, Math.min(100, value));
    waitProgressValueRef.current = clamped;
    setWaitProgress(clamped);
  };

  const setWaitProgressPhaseWithRef = (phase: WaitProgressPhase) => {
    waitProgressPhaseRef.current = phase;
    setWaitProgressPhase(phase);
  };

  const tickWaitSimulation = () => {
    const phase = waitProgressPhaseRef.current;
    if (phase === 'idle' || phase === 'finishing' || phase === 'done') return;

    const startedAt = waitProgressStartedAtRef.current;
    if (!startedAt) return;

    const elapsedMs = Date.now() - startedAt;
    const simDurationMs = waitProgressSimDurationMsRef.current || WAIT_PROGRESS_SIM_DURATION_MS;

    if (!waitProgressDebugPrintedRef.current) {
      const estSec = Math.round(simDurationMs / 1000);
      const ratioRaw = simDurationMs > 0 ? elapsedMs / simDurationMs : 0;
      console.log('[AICreatorWaitDebug]', {
        taskId: waitProgressTrackedTaskIdRef.current,
        estimatedSeconds: estSec,
        simDurationMs,
        elapsedMs,
        ratio: ratioRaw,
        percentApprox: Math.round(ratioRaw * 100),
      });
      waitProgressDebugPrintedRef.current = true;
    }

    if (phase === 'holding') {
      if (waitProgressHoldValueRef.current === null) {
        waitProgressHoldValueRef.current = 96;
      }
      setWaitProgressWithRef(waitProgressHoldValueRef.current);
      return;
    }

    const ratio = Math.max(0, Math.min(1, elapsedMs / simDurationMs));
    const eased = 1 - Math.pow(1 - ratio, 3);
    const next = eased * WAIT_PROGRESS_MAX_BEFORE_HOLD;

    if (ratio >= 1) {
      if (waitProgressHoldValueRef.current === null) {
        waitProgressHoldValueRef.current = 96;
      }
      setWaitProgressPhaseWithRef('holding');
      setWaitProgressWithRef(waitProgressHoldValueRef.current);
      return;
    }

    setWaitProgressPhaseWithRef('simulating');
    setWaitProgressWithRef(next);
  };

  const scheduleWaitSimulationTick = () => {
    if (waitProgressTimerRef.current) {
      window.clearTimeout(waitProgressTimerRef.current);
      waitProgressTimerRef.current = null;
    }

    const delay = waitProgressPhaseRef.current === 'holding'
      ? 1200 + Math.random() * 500
      : 320 + Math.random() * 900;

    waitProgressTimerRef.current = window.setTimeout(() => {
      tickWaitSimulation();
      if (waitProgressPhaseRef.current === 'simulating' || waitProgressPhaseRef.current === 'holding') {
        scheduleWaitSimulationTick();
      }
    }, delay);
  };

  const startWaitProgressSimulation = (taskId: string | number, estimatedSeconds?: number | null) => {
    clearWaitProgressTimers();
    waitProgressTrackedTaskIdRef.current = taskId;
    waitProgressStartedAtRef.current = Date.now();
    waitProgressHoldValueRef.current = null;
    waitProgressDebugPrintedRef.current = false;

    const est = Number(estimatedSeconds);
    const durationMs = Number.isFinite(est) && est > 0 ? Math.round(est * 1000) : 120_000;
    waitProgressSimDurationMsRef.current = Math.max(30_000, Math.min(900_000, durationMs));

    setWaitingVideoFailed(false);
    setWaitProgressWithRef(0);
    setWaitProgressPhaseWithRef('simulating');
    tickWaitSimulation();
    scheduleWaitSimulationTick();
  };

  const finishWaitProgressSimulation = () => {
    if (waitProgressPhaseRef.current === 'finishing' || waitProgressPhaseRef.current === 'done') return;

    clearWaitProgressTimers();
    const from = Math.max(0, Math.min(100, waitProgressValueRef.current));

    if (from >= 100) {
      setWaitProgressWithRef(100);
      setWaitProgressPhaseWithRef('done');
      return;
    }

    setWaitProgressPhaseWithRef('finishing');
    const startedAt = performance.now();
    const durationMs = 480;

    const animate = (now: number) => {
      const ratio = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - ratio, 3);
      setWaitProgressWithRef(from + (100 - from) * eased);

      if (ratio < 1) {
        waitProgressRafRef.current = window.requestAnimationFrame(animate);
      } else {
        setWaitProgressWithRef(100);
        setWaitProgressPhaseWithRef('done');
      }
    };

    waitProgressRafRef.current = window.requestAnimationFrame(animate);
  };

  const resetWaitProgressSimulation = () => {
    clearWaitProgressTimers();
    waitProgressTrackedTaskIdRef.current = null;
    waitProgressStartedAtRef.current = null;
    waitProgressHoldValueRef.current = null;
    setWaitProgressWithRef(0);
    setWaitProgressPhaseWithRef('idle');
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, results]);

  // 自动保存当前会话的生成结果和上传图片
  useEffect(() => {
    if (activeConversationId) {
      saveSessionState(activeConversationId, { results, uploadedImages });
    }
  }, [results, uploadedImages, activeConversationId]);

  // 当恢复结果中有进行中的视频任务时，重启进度条模拟
  useEffect(() => {
    if (results.length === 0) return;
    const pendingVideo = results.find((r) => r.type === 'generate_video' && r.status === 'pending');
    if (pendingVideo?.taskId && waitProgressPhaseRef.current === 'idle') {
      startWaitProgressSimulation(pendingVideo.taskId, 120);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  // Load conversations on mount. Default to empty new chat instead of restoring
  // the last active conversation to avoid polluting the chat area with stale
  // generation results / pending video tasks.
  useEffect(() => {
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeConversationId) return;
    if (conversations.some((c) => c.id === activeConversationId)) return;
    setActiveConversationId(null);
    setMessages([isZh ? WELCOME_MESSAGE_ZH : WELCOME_MESSAGE]);
    setResults([]);
    setUploadedImages([]);
    setEditingIdx(null);
    setEditText('');
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, [activeConversationId, conversations, isZh]);

  useEffect(() => {
    // Persist active conversation id so it survives tab switch / refresh
    try {
      if (activeConversationId) {
        window.localStorage.setItem(STORAGE_KEY, activeConversationId);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, [activeConversationId]);

  // 当页面从后台切回前台时，自动刷新当前会话消息（多设备同步 / 防丢）
  // 只刷新消息，不恢复缓存，避免覆盖当前正在编辑的状态
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && activeConversationId && conversations.some((c) => c.id === activeConversationId)) {
        void loadConversation(activeConversationId, { skipStateRestore: true, silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, conversations]);

  // 监听全局任务队列，当 AI Creator 生成的视频任务完成时更新结果卡片
  useEffect(() => {
    if (tasks.length === 0) return;

    // 追踪的 wait-progress 任务完成时结束模拟
    const trackedTaskId = waitProgressTrackedTaskIdRef.current;
    if (trackedTaskId) {
      const trackedTask = tasks.find((t) => String(t.id) === String(trackedTaskId));
      if (!trackedTask) {
        resetWaitProgressSimulation();
      } else if (trackedTask.status === 'success' || trackedTask.status === 'failed') {
        finishWaitProgressSimulation();
      }
    }

    setResults((prev) =>
      prev.map((result) => {
        if (result.type !== 'generate_video' || !result.taskId) return result;
        const task = tasks.find((t) => String(t.id) === String(result.taskId));
        if (!task) return result;

        // 任务完成且有视频 URL
        if (task.status === 'success' && (task.result?.video_url || task.result?.url)) {
          return {
            ...result,
            status: 'success',
            videoUrl: task.result.video_url || task.result.url,
          };
        }
        // 任务失败
        if (task.status === 'failed') {
          return {
            ...result,
            status: 'failed',
            error: task.result?.error || 'Generation failed',
          };
        }
        // 仍在处理中
        if (task.status === 'processing' || task.status === 'pending') {
          return { ...result, status: 'pending' };
        }
        return result;
      })
    );
  }, [tasks]);

  // 组件卸载时清理 wait-progress 定时器并保存当前会话状态
  useEffect(() => {
    return () => {
      clearWaitProgressTimers();
      const convoId = activeConversationIdRef.current;
      if (convoId) {
        saveSessionState(convoId, { results: resultsRef.current, uploadedImages: uploadedImagesRef.current });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadConversations = async () => {
    try {
      const list = await aiCreatorApi.listConversations();
      setConversations(list);
    } catch (e) {
      console.error('Failed to load conversations:', e);
    }
  };

  const startNewChat = async () => {
    if (activeConversationId) {
      saveSessionState(activeConversationId, { results: [...results], uploadedImages: [...uploadedImages] });
    }
    setActiveConversationId(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setMessages([isZh ? WELCOME_MESSAGE_ZH : WELCOME_MESSAGE]);
    setResults([]);
    setUploadedImages([]);
    setEditingIdx(null);
    setEditText('');
    // Optionally auto-create on first message
  };

  const loadConversation = async (id: string, options?: { skipStateRestore?: boolean; silent?: boolean }) => {
    if (convoLoading) return;

    // 切走前先把当前会话的临时状态缓存下来
    if (activeConversationId) {
      saveSessionState(activeConversationId, { results: [...results], uploadedImages: [...uploadedImages] });
    }

    setConvoLoading(true);
    try {
      const data = await aiCreatorApi.getMessages(id);
      setActiveConversationId(data.id);
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages);
      } else {
        setMessages([isZh ? WELCOME_MESSAGE_ZH : WELCOME_MESSAGE]);
      }

      if (!options?.skipStateRestore) {
        const cached = loadSessionState(data.id);
        let restoredResults: GenerationResult[] = cached?.results ?? [];
        let restoredImages: UploadedImage[] = cached?.uploadedImages ?? [];

        // 将全局任务队列的最新状态同步到已恢复的 results 上（防止组件卸载期间任务完成导致状态不同步）
        restoredResults = restoredResults.map((result) => {
          if (result.type !== 'generate_video' || !result.taskId) return result;
          const task = tasks.find((t) => String(t.id) === String(result.taskId));
          if (!task) return result;
          if (task.status === 'success' && (task.result?.video_url || task.result?.url)) {
            return { ...result, status: 'success', videoUrl: task.result.video_url || task.result.url };
          }
          if (task.status === 'failed') {
            return { ...result, status: 'failed', error: task.result?.error || 'Generation failed' };
          }
          if (task.status === 'processing' || task.status === 'pending') {
            return { ...result, status: 'pending' };
          }
          return result;
        });

        setResults(restoredResults);
        setUploadedImages(restoredImages);
      }

      setEditingIdx(null);
      setEditText('');
    } catch (e: any) {
      const isNotFound = (e instanceof ApiError && e.status === 404)
        || String(e?.message || '').includes('对话不存在');
      if (isNotFound) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        setActiveConversationId(null);
        setMessages([isZh ? WELCOME_MESSAGE_ZH : WELCOME_MESSAGE]);
        setResults([]);
        setUploadedImages([]);
        setEditingIdx(null);
        setEditText('');
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore storage errors
        }
        if (!options?.silent) {
          openInfo(
            isZh ? '提示' : 'Notice',
            isZh ? '该对话已不存在，已为你创建新对话。' : 'This conversation no longer exists. A new chat has been started.',
          );
        }
        return;
      }
      if (!options?.silent) {
        openInfo('Error', e?.message || 'Failed to load conversation');
      } else {
        console.error('Failed to refresh conversation:', e);
      }
    } finally {
      setConvoLoading(false);
    }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(isZh ? '确定删除此对话？' : 'Delete this conversation?')) return;
    try {
      await aiCreatorApi.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        startNewChat();
      }
    } catch (e: any) {
      openInfo('Error', e?.message || 'Failed to delete conversation');
    }
  };

  const startRename = (conv: AiCreatorConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(conv.id);
    setRenameText(conv.title);
  };

  const confirmRename = async (id: string) => {
    const title = renameText.trim();
    if (!title) {
      setRenamingId(null);
      return;
    }
    try {
      await aiCreatorApi.updateConversation(id, title);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c))
      );
    } catch (e: any) {
      openInfo('Error', e?.message || 'Failed to rename');
    } finally {
      setRenamingId(null);
    }
  };

  const openInfo = (title: string, message: string) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogOpen(true);
  };

  const getActionLabel = (type: string) => {
    const map = isZh ? ACTION_LABELS_ZH : ACTION_LABELS_EN;
    return map[type] || type;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newImages: UploadedImage[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const resp = await assetsApi.uploadTempAsset(file);
        const url = String(resp?.data?.url || resp?.data?.path || resp?.url || '').trim();
        if (url) {
          newImages.push({ id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`, url, file });
        }
      } catch (err: any) {
        console.error('Upload failed:', err);
      }
    }

    if (newImages.length > 0) {
      setUploadedImages((prev) => [...prev, ...newImages]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (id: string) => {
    setUploadedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || loading) return;

    if (!overrideText) setInput('');

    // Build message with image references
    let messageContent = text;
    if (uploadedImages.length > 0) {
      const imageDesc = uploadedImages.map((img, i) => `[参考图${i + 1}: ${img.url}]`).join('\n');
      messageContent = `${text}\n\n${imageDesc}`;
    }

    const userMsg: AiCreatorMessage = { role: 'user', content: messageContent };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await aiCreatorApi.chat(text, history, activeConversationId || undefined);

      // Update active conversation if backend created/returned one
      if (res.conversation_id && res.conversation_id !== activeConversationId) {
        setActiveConversationId(res.conversation_id);
        // 同步落盘，防止切页/刷新时还没触发 useEffect
        try {
          window.localStorage.setItem(STORAGE_KEY, res.conversation_id);
        } catch {
          // ignore
        }
        // Refresh conversation list to show the new one
        loadConversations();
      } else if (activeConversationId) {
        // Refresh list to update "updated_at" ordering
        loadConversations();
      }

      const assistantMsg: AiCreatorMessage = {
        role: 'assistant',
        content: res.reply,
        action: res.action || null,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      openInfo(
        (t as any).ai_creator_title || 'AI Creator',
        err?.message || (t as any).ai_creator_error || 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addResult = (result: GenerationResult) => {
    setResults((prev) => [...prev, result]);
  };

  const updateResult = (id: string, updates: Partial<GenerationResult>) => {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const executeAction = (action: AiCreatorAction) => {
    if (generatingType) return;
    // Show confirmation dialog before executing
    setConfirmAction(action);
    setConfirmParams(action.params || {});
  };

  const runGeneration = async (action: AiCreatorAction, params: Record<string, unknown>) => {
    const type = action.type;
    setGeneratingType(type);

    const resultId = `${type}_${Date.now()}`;
    const imageUrls = uploadedImages.map((img) => img.url);

    try {
      if (type === 'generate_video') {
        addResult({ id: resultId, type, status: 'pending', taskId: undefined });
        const payload: any = {
          prompt: String(params.prompt || ''),
          model: String(params.model || 'kling'),
          duration: Number(params.duration || 5),
          aspect_ratio: String(params.aspect_ratio || '9:16'),
          sound: String(params.sound || 'off'),
        };
        if (imageUrls.length > 0) {
          payload.image_path = imageUrls[0];
        }
        const res = await videoApi.generate(payload);
        if (res?.code === 0) {
          const taskId = res?.data?.task_id;
          const projectId = res?.data?.project_id;
          updateResult(resultId, { taskId, content: `Task #${taskId} queued` });

          // 将视频任务加入全局任务队列，实时追踪进度并在完成后显示视频
          if (taskId && !linkedTaskIdsRef.current.has(taskId)) {
            linkedTaskIdsRef.current.add(taskId);
            addTask({
              id: taskId,
              projectId: projectId || undefined,
              type: 'video_generation',
              status: 'processing',
              name: String(params.prompt || '').slice(0, 60) || (isZh ? 'AI Creator 视频' : 'AI Creator Video'),
              thumbnail: imageUrls[0] || undefined,
              createdAt: Date.now(),
            });
            // 启动工作台风格的等待进度模拟
            startWaitProgressSimulation(taskId, 120);
          }

          openInfo(
            (t as any).ai_creator_title || 'AI Creator',
            (t as any).ai_creator_video_queued || 'Video generation started! Check the task queue for progress.'
          );
        } else {
          throw new Error(res?.message || 'Video generation failed');
        }
      } else if (type === 'generate_script') {
        addResult({ id: resultId, type, status: 'pending' });
        if (!user?.id) throw new Error('User not authenticated');
        const promptText = String(params.product_name || params.prompt || '');
        const descText = String(params.product_description || params.prompt || '');
        const duration = Number(params.duration || 30);
        const payload = {
          product_category: promptText.slice(0, 100),
          visual_style: String(params.style || 'casual'),
          aspect_ratio: '9:16',
          user_language: String(params.language || 'zh'),
          script_content: {
            duration,
            shot_number: Math.max(3, Math.min(20, Math.round(duration / 5))),
            input: promptText,
            custom: descText,
          },
        };
        const res = await videoApi.generateScript(user.id, payload);
        if (res?.code === 0) {
          const scripts = res?.data?.script_contents || [];
          const text = scripts.map((s: any) => {
            if (!s || typeof s !== 'object') return String(s || '');
            // 优先使用 video_master_script（完整脚本文本）
            if (s.video_master_script) return String(s.video_master_script);
            // 其次使用 creative_card_text
            if (s.creative_card_text) return String(s.creative_card_text);
            // 有 shots 时格式化为分镜文本
            if (Array.isArray(s.shots) && s.shots.length > 0) {
              return s.shots.map((shot: any, idx: number) => {
                const lines = [`【镜头 ${idx + 1}】`];
                if (shot.beat) lines.push(`节奏：${shot.beat}`);
                if (shot.visual) lines.push(`画面：${shot.visual}`);
                if (shot.voiceover) lines.push(`旁白：${shot.voiceover}`);
                return lines.join('\n');
              }).join('\n\n');
            }
            // 兜底：拼接其他文本字段
            const parts: string[] = [];
            if (s.material_usage_text) parts.push(String(s.material_usage_text));
            if (s.continuity_anchor) parts.push(String(s.continuity_anchor));
            if (s.script_structure) parts.push(String(s.script_structure));
            return parts.join('\n\n') || JSON.stringify(s, null, 2);
          }).join('\n\n---\n\n');
          updateResult(resultId, { status: 'success', content: text || 'Script generated successfully' });
        } else {
          throw new Error(res?.message || 'Script generation failed');
        }
      } else if (type === 'generate_image') {
        addResult({ id: resultId, type, status: 'pending' });
        if (imageUrls.length > 0) {
          // Use image fusion with uploaded references
          const projectRes = await videoApi.createProject(user?.id || 0, { title: 'AI Creator 图片项目' });
          const projectId = projectRes?.data?.project_id || projectRes?.data?.id;
          if (!projectId) throw new Error('Failed to create project');
          const payload = {
            project_id: projectId,
            image_paths: imageUrls,
            prompt: String(params.prompt || ''),
            aspect_ratio: (String(params.aspect_ratio || '9:16') as any),
            resolution: (String(params.resolution || '2K') as any),
          };
          const res = await videoApi.generateFusionImage(payload);
          if (res?.code === 0) {
            const imageUrl = res?.data?.image_url;
            updateResult(resultId, { status: 'success', imageUrl });
          } else {
            throw new Error(res?.message || 'Image generation failed');
          }
        } else {
          // Pure text-to-image
          const payload = {
            prompt: String(params.prompt || ''),
            aspect_ratio: String(params.aspect_ratio || '9:16'),
            resolution: String(params.resolution || '2K'),
          };
          const res = await aiCreatorApi.generateImage(payload);
          if (res?.code === 0) {
            const imageUrl = res?.data?.image_url;
            const model = res?.data?.model;
            updateResult(resultId, { status: 'success', imageUrl, model });
          } else {
            throw new Error(res?.message || 'Image generation failed');
          }
        }
      } else if (type === 'generate_first_frame') {
        addResult({ id: resultId, type, status: 'pending' });
        if (imageUrls.length > 0) {
          const payload = {
            reference_image_path: imageUrls[0],
            aspect_ratio: String(params.aspect_ratio || '9:16'),
            prompt_override: String(params.prompt || ''),
          };
          const res = await videoApi.generateFirstFrame(payload);
          if (res?.code === 0) {
            const firstFramePath = res?.data?.first_frame_path;
            updateResult(resultId, { status: 'success', imageUrl: firstFramePath });
          } else {
            throw new Error(res?.message || 'First frame generation failed');
          }
        } else {
          openInfo(
            (t as any).ai_creator_title || 'AI Creator',
            (t as any).ai_creator_first_frame_tip || 'First frame generation requires a reference product image. Please upload one.'
          );
          updateResult(resultId, { status: 'failed', error: 'Reference image required' });
        }
      } else if (type === 'clothing_swap') {
        if (imageUrls.length >= 2) {
          openInfo(
            (t as any).ai_creator_title || 'AI Creator',
            'Clothing swap images uploaded. Please go to Product Images → Clothing Swap to process.'
          );
        } else {
          openInfo(
            (t as any).ai_creator_title || 'AI Creator',
            (t as any).ai_creator_clothing_swap_tip || 'Please upload both garment and model images, then go to Product Images → Clothing Swap.'
          );
        }
      } else {
        openInfo(
          (t as any).ai_creator_title || 'AI Creator',
          (t as any).ai_creator_unsupported || 'This feature is not yet supported for one-click generation.'
        );
      }
    } catch (err: any) {
      updateResult(resultId, { status: 'failed', error: err?.message || 'Generation failed' });
      openInfo(
        (t as any).ai_creator_title || 'AI Creator',
        err?.message || (t as any).ai_creator_error || 'Generation failed. Please try again.'
      );
    } finally {
      setGeneratingType(null);
    }
  };

  const submitConfirmedAction = async () => {
    if (!confirmAction) return;
    setConfirmAction(null);
    setConfirmParams({});
    await runGeneration(confirmAction, confirmParams);
  };

  const executeActionDirectly = async (action: AiCreatorAction) => {
    if (generatingType) return;
    await runGeneration(action, action.params || {});
  };

  const quickSend = (text: string) => {
    handleSend(text);
  };

  const startEdit = (idx: number) => {
    const msg = messages[idx];
    if (msg.role !== 'user') return;
    setEditingIdx(idx);
    setEditText(msg.content);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setEditText('');
  };

  const confirmEdit = async () => {
    if (editingIdx === null || !editText.trim()) return;

    // Truncate messages after editingIdx (remove original user msg + assistant reply + everything after)
    const truncated = messages.slice(0, editingIdx);
    setMessages(truncated);
    setResults([]); // Also clear generation results after edit point
    setEditingIdx(null);

    // Re-send edited message
    await handleSend(editText.trim());
  };

  const deleteFrom = (idx: number) => {
    // Delete this message and everything after it
    setMessages((prev) => prev.slice(0, idx));
    setResults([]);
  };

  // Detect if the last assistant message is asking for a choice (routing)
  const lastAssistantMessage = messages.filter((m) => m.role === 'assistant').pop();
  const showRoutingButtons =
    lastAssistantMessage &&
    !lastAssistantMessage.action &&
    (lastAssistantMessage.content.includes('视频') ||
      lastAssistantMessage.content.includes('图片') ||
      lastAssistantMessage.content.includes('video') ||
      lastAssistantMessage.content.includes('image'));

  const renderResult = (result: GenerationResult) => {
    if ((result.type === 'generate_image' || result.type === 'generate_first_frame') && result.imageUrl) {
      return (
        <div className="mt-4 rounded-2xl overflow-hidden border border-white/10 bg-zinc-900">
          <div className="px-5 py-3 bg-zinc-950/50 text-sm text-zinc-400 flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            <span className="font-medium">{getActionLabel(result.type)}</span>
            {result.model && (
              <span className="ml-2 px-2 py-0.5 rounded-md bg-zinc-800 text-[10px] text-zinc-500 border border-white/5">
                {result.model}
              </span>
            )}
          </div>
          <img src={result.imageUrl} alt="Generated" className="w-full max-h-[400px] object-contain bg-black" />
        </div>
      );
    }
    if (result.type === 'generate_script' && result.content) {
      return (
        <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900 overflow-hidden">
          <div className="px-5 py-3 bg-zinc-950/50 text-sm text-zinc-400 flex items-center gap-2">
            <ScrollText className="w-4 h-4" />
            <span className="font-medium">{getActionLabel(result.type)}</span>
          </div>
          <div className="p-5 text-base text-zinc-200 whitespace-pre-wrap max-h-[400px] overflow-y-auto">{result.content}</div>
        </div>
      );
    }
    if (result.type === 'generate_video') {
      const task = tasks.find((t) => String(t.id) === String(result.taskId));
      const videoUrl = result.videoUrl || task?.result?.video_url || task?.result?.url;
      const isProcessing = !videoUrl && result.status !== 'failed';

      return (
        <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900 overflow-hidden">
          <div className="px-5 py-3 bg-zinc-950/50 text-sm text-zinc-400 flex items-center gap-2">
            <Film className="w-4 h-4" />
            <span className="font-medium">{getActionLabel(result.type)}</span>
            {isProcessing && (
              <span className="text-orange-400 ml-2 flex items-center gap-1">
                <Loader2 className="w-4 h-4 animate-spin" />
                {(t as any).ai_creator_generating || 'Generating...'}
              </span>
            )}
            {result.status === 'success' && videoUrl && (
              <span className="text-emerald-400 ml-2 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                {(t as any).ai_creator_done || 'Done'}
              </span>
            )}
            {result.status === 'failed' && (
              <span className="text-red-400 ml-2 flex items-center gap-1">
                <X className="w-4 h-4" />
                {(t as any).ai_creator_failed || 'Failed'}
              </span>
            )}
          </div>

          {/* 进度条 + 等待动画 (Workbench 风格) */}
          {isProcessing && (
            <div className="relative h-56 w-full overflow-hidden bg-black">
              {!waitingVideoFailed ? (
                <video
                  className="h-full w-full object-cover"
                  src={WAITING_PREVIEW_VIDEO_SRC}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  onError={() => setWaitingVideoFailed(true)}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                  <Film className="w-12 h-12 text-zinc-600" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pb-4 text-center">
                <p className="text-xs text-white/80 font-semibold drop-shadow">
                  {waitProgressPhase === 'holding'
                    ? (isZh ? '生成时间比预期稍长，正在进行最终渲染…' : 'Taking longer than expected, waiting for final render...')
                    : (isZh ? '正在生成视频，请稍候…' : 'Generating video, please wait...')}
                </p>
                <div className="text-2xl font-black text-orange-200 tabular-nums drop-shadow">
                  {Math.max(0, Math.min(100, Math.round(waitProgress)))}%
                </div>
                <div className="w-full max-w-[200px] h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(0, Math.min(100, waitProgress))}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 视频预览 + 操作按钮 */}
          {videoUrl && (
            <div className="p-5 space-y-4">
              <video
                src={videoUrl}
                controls
                className="w-full rounded-xl bg-black max-h-[400px]"
              />
              <div className="flex items-center gap-3">
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 text-sm text-zinc-300 hover:bg-zinc-700 transition"
                >
                  <Download className="w-4 h-4" />
                  {(t as any).ai_creator_download || 'Download'}
                </a>
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('vflow:navigate', { detail: { view: 'history' } }));
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 text-sm text-zinc-300 hover:bg-zinc-700 transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  {(t as any).ai_creator_view_history || 'View in History'}
                </button>
              </div>
            </div>
          )}

          {/* 失败状态 */}
          {result.status === 'failed' && (
            <div className="p-5 text-base text-red-400">
              {result.error || (t as any).ai_creator_error || 'Generation failed'}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex h-full animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Sidebar — Conversation list */}
      <aside
        className={`shrink-0 border-r border-white/5 bg-zinc-950/80 backdrop-blur-sm flex flex-col transition-all duration-300 ${
          sidebarOpen ? 'w-72' : 'w-0 overflow-hidden opacity-0'
        }`}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <span className="text-sm font-bold text-zinc-300 uppercase tracking-wider">
            {(t as any).ai_creator_history || 'History'}
          </span>
          <button
            onClick={startNewChat}
            className="p-2 rounded-lg bg-zinc-800 text-zinc-300 hover:text-orange-400 hover:bg-zinc-700 transition"
            title="New chat"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-3 space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className={`group mx-3 flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition ${
                activeConversationId === conv.id
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0 opacity-60" />
              {renamingId === conv.id ? (
                <input
                  autoFocus
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename(conv.id);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  onBlur={() => confirmRename(conv.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 bg-zinc-900 border border-white/10 rounded-lg px-3 py-1 text-sm text-zinc-200 outline-none focus:border-orange-500/50"
                />
              ) : (
                <span className="flex-1 min-w-0 text-sm font-medium truncate">{conv.title}</span>
              )}

              {renamingId !== conv.id && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => startRename(conv, e)}
                    className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {conversations.length === 0 && (
            <div className="px-4 py-8 text-sm text-zinc-600 text-center">
              {(t as any).ai_creator_no_history || 'No conversations yet'}
            </div>
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex justify-between items-center px-8 py-5 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen((s) => !s)}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"
              title="Toggle sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                {(t as any).ai_creator_title || 'AI Creator'}
              </h1>
              <p className="text-zinc-500 text-sm mt-1">
                {(t as any).ai_creator_subtitle || 'Describe anything and generate with one click'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={startNewChat}
              className="px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-sm text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {(t as any).ai_creator_new_chat || 'New Chat'}
            </button>
            <div className="px-4 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/40 text-sm text-orange-400 font-bold flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              AI
            </div>
          </div>
        </header>

        {/* Quick action buttons */}
        <div className="shrink-0 px-8 py-4 border-b border-white/5 flex items-center gap-3 overflow-x-auto">
          <button
            onClick={() => quickSend('我想生成一段视频')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-sm text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition whitespace-nowrap"
          >
            <Film className="w-4 h-4" />
            {(t as any).ai_creator_quick_video || '生成视频'}
          </button>
          <button
            onClick={() => quickSend('我想生成一张图片')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-sm text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition whitespace-nowrap"
          >
            <ImageIcon className="w-4 h-4" />
            {(t as any).ai_creator_quick_image || '生成图片'}
          </button>
          <button
            onClick={() => quickSend('我想生成一个脚本')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-sm text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition whitespace-nowrap"
          >
            <ScrollText className="w-4 h-4" />
            {(t as any).ai_creator_quick_script || '生成脚本'}
          </button>
          <button
            onClick={() => quickSend('我想生成首帧图')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-sm text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition whitespace-nowrap"
          >
            <ImagePlus className="w-4 h-4" />
            {(t as any).ai_creator_quick_first_frame || '生成首帧图'}
          </button>
        </div>

        {/* Chat + Results area */}
        <main className="flex-1 overflow-y-auto px-8 py-8 space-y-8">
          {convoLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          )}

          {!convoLoading &&
            messages.map((msg, idx) => (
              <div key={idx}>
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-6 py-4 text-base leading-relaxed group relative ${
                      msg.role === 'user'
                        ? 'bg-orange-600 text-white'
                        : 'bg-zinc-900 border border-white/10 text-zinc-200'
                    }`}
                  >
                    {editingIdx === idx ? (
                      <div className="space-y-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.metaKey) confirmEdit();
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className="w-full bg-white/10 rounded-xl px-4 py-3 text-base text-white placeholder-white/50 outline-none resize-none"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={confirmEdit}
                            className="px-4 py-1.5 rounded-xl bg-white/20 text-sm font-semibold hover:bg-white/30 transition"
                          >
                            {(t as any).ai_creator_save || 'Save & Regenerate'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-4 py-1.5 rounded-xl bg-white/10 text-sm hover:bg-white/20 transition"
                          >
                            {(t as any).ai_creator_cancel || 'Cancel'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}

                    {/* Edit / Delete buttons on user messages */}
                    {msg.role === 'user' && editingIdx !== idx && (
                      <div className="absolute -left-24 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(idx)}
                          className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-orange-400 hover:bg-zinc-700 transition"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteFrom(idx)}
                          className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Action card inside assistant message */}
                    {msg.role === 'assistant' && msg.action && msg.action.type !== 'chat' && (
                      <div className="mt-4 pt-4 border-t border-white/10">
                        <div className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                          {ACTION_ICONS[msg.action.type] || <Wand2 className="w-5 h-5" />}
                          <span className="font-bold text-zinc-300">{getActionLabel(msg.action.type)}</span>
                        </div>
                        {msg.action.params && Object.keys(msg.action.params).length > 0 && (
                          <div className="text-xs text-zinc-500 mb-3 space-y-1">
                            {Object.entries(msg.action.params).map(([k, v]) => (
                              <div key={k}>
                                <span className="text-zinc-400">{k}:</span> {String(v)}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-2">
                          <button
                            onClick={() => executeActionDirectly(msg.action!)}
                            disabled={generatingType !== null}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 text-sm text-white font-bold hover:bg-orange-500 transition disabled:opacity-50"
                          >
                            {generatingType === msg.action.type ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Wand2 className="w-4 h-4" />
                            )}
                            {generatingType === msg.action.type
                              ? (isZh ? '正在生成…' : 'Generating…')
                              : (isZh ? '立即生成' : 'Generate')}
                          </button>
                          <button
                            onClick={() => executeAction(msg.action!)}
                            disabled={generatingType !== null}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 text-sm text-zinc-300 font-medium hover:bg-zinc-700 transition disabled:opacity-50"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            {isZh ? '编辑参数' : 'Edit Parameters'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Routing quick-reply buttons */}
                {msg.role === 'assistant' &&
                  idx === messages.length - 1 &&
                  showRoutingButtons && (
                    <div className="flex gap-3 mt-3 ml-1">
                      <button
                        onClick={() => quickSend('我想生成视频')}
                        className="px-4 py-2 rounded-xl bg-zinc-800 border border-white/10 text-sm text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition"
                      >
                        🎬 {(t as any).ai_creator_quick_video || '生成视频'}
                      </button>
                      <button
                        onClick={() => quickSend('我想生成图片')}
                        className="px-4 py-2 rounded-xl bg-zinc-800 border border-white/10 text-sm text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition"
                      >
                        🖼️ {(t as any).ai_creator_quick_image || '生成图片'}
                      </button>
                    </div>
                  )}
              </div>
            ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-zinc-900 border border-white/10 rounded-2xl px-6 py-4 text-base text-zinc-400 flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                {(t as any).ai_creator_thinking || 'Thinking...'}
              </div>
            </div>
          )}

          {/* Render generation results */}
          {results.map((result) => (
            <div key={result.id} className="flex justify-start">
              <div className="max-w-[80%] w-full">
                {renderResult(result)}
              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </main>

        {/* Input area — Gemini-style */}
        <footer className="shrink-0 px-8 py-5 border-t border-white/5 bg-zinc-950/50 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto">
            {/* Uploaded image thumbnails */}
            {uploadedImages.length > 0 && (
              <div className="flex items-center gap-3 mb-3 overflow-x-auto pb-1">
                {uploadedImages.map((img) => (
                  <div key={img.id} className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-white/10">
                    <img src={img.url} alt="uploaded" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeImage(img.id)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-3 rounded-2xl bg-zinc-900 border border-white/10 p-3 pr-4 focus-within:border-orange-500/50 transition">
              {/* + upload button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || loading}
                className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition disabled:opacity-50"
                title="Add image"
              >
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Text input */}
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={(t as any).ai_creator_placeholder || 'Describe what you want to generate...'}
                disabled={loading}
                className="flex-1 py-3 bg-transparent text-base text-zinc-100 placeholder-zinc-500 focus:outline-none disabled:opacity-50 min-w-0"
              />

              {/* Send button */}
              <button
                onClick={() => handleSend()}
                disabled={loading || (!input.trim() && uploadedImages.length === 0)}
                className="shrink-0 w-10 h-10 rounded-full bg-orange-600 text-white flex items-center justify-center hover:bg-orange-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-zinc-600 mt-2 ml-1">
              AI may produce inaccurate content. Upload images as reference material.
            </p>
          </div>
        </footer>
      </div>

      {/* Action Confirmation Dialog */}
      {confirmAction && (
        <AppDialog
          isOpen={true}
          title={isZh ? '确认生成参数' : 'Confirm Generation Parameters'}
          onClose={() => { setConfirmAction(null); setConfirmParams({}); }}
          footer={
            <div className="flex items-center gap-2">
              <button
                className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700"
                onClick={() => { setConfirmAction(null); setConfirmParams({}); }}
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-500"
                onClick={() => void submitConfirmedAction()}
              >
                {isZh ? '确认生成' : 'Confirm & Generate'}
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            {confirmAction.type === 'generate_video' && (
              <>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">{isZh ? '提示词' : 'Prompt'}</label>
                  <textarea
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50 resize-none"
                    rows={3}
                    value={String(confirmParams.prompt || '')}
                    onChange={(e) => setConfirmParams({ ...confirmParams, prompt: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{isZh ? '模型' : 'Model'}</label>
                    <select
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50"
                      value={String(confirmParams.model || 'kling')}
                      onChange={(e) => {
                        const newModel = e.target.value;
                        let newDuration = Number(confirmParams.duration || 5);
                        if (newModel.startsWith('sora')) {
                          const soraOptions = [4, 8, 12];
                          newDuration = soraOptions.reduce((prev, curr) =>
                            Math.abs(curr - newDuration) < Math.abs(prev - newDuration) ? curr : prev
                          );
                        } else if (newModel.startsWith('seedance')) {
                          newDuration = Math.max(4, Math.min(15, newDuration));
                        } else {
                          newDuration = newDuration <= 7 ? 5 : 10;
                        }
                        setConfirmParams({ ...confirmParams, model: newModel, duration: newDuration });
                      }}
                    >
                      <option value="kling">Kling</option>
                      <option value="sora2">Sora 2</option>
                      <option value="sora2pro">Sora 2 Pro</option>
                      <option value="seedance2.0">Seedance 2.0</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{isZh ? '时长（秒）' : 'Duration (seconds)'}</label>
                    {String(confirmParams.model || 'kling').startsWith('sora') ? (
                      <select
                        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50"
                        value={Number(confirmParams.duration || 8)}
                        onChange={(e) => setConfirmParams({ ...confirmParams, duration: Number(e.target.value) })}
                      >
                        {[4, 8, 12].map((d) => (
                          <option key={d} value={d}>{d}s</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        min={String(confirmParams.model || 'kling').startsWith('seedance') ? 4 : 5}
                        max={String(confirmParams.model || 'kling').startsWith('seedance') ? 15 : 10}
                        step={String(confirmParams.model || 'kling').startsWith('seedance') ? 1 : 5}
                        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50"
                        value={Number(confirmParams.duration || 5)}
                        onChange={(e) => {
                          const model = String(confirmParams.model || 'kling');
                          const min = model.startsWith('seedance') ? 4 : 5;
                          const max = model.startsWith('seedance') ? 15 : 10;
                          setConfirmParams({ ...confirmParams, duration: Math.max(min, Math.min(max, Number(e.target.value) || min)) });
                        }}
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{isZh ? '比例' : 'Aspect Ratio'}</label>
                    <select
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50"
                      value={String(confirmParams.aspect_ratio || '9:16')}
                      onChange={(e) => setConfirmParams({ ...confirmParams, aspect_ratio: e.target.value })}
                    >
                      <option value="9:16">9:16</option>
                      <option value="16:9">16:9</option>
                      <option value="1:1">1:1</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{isZh ? '音效' : 'Sound'}</label>
                    <select
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50"
                      value={String(confirmParams.sound || 'off')}
                      onChange={(e) => setConfirmParams({ ...confirmParams, sound: e.target.value })}
                    >
                      <option value="off">Off</option>
                      <option value="on">On</option>
                    </select>
                  </div>
                </div>
              </>
            )}
            {confirmAction.type === 'generate_image' && (
              <>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">{isZh ? '提示词' : 'Prompt'}</label>
                  <textarea
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50 resize-none"
                    rows={3}
                    value={String(confirmParams.prompt || '')}
                    onChange={(e) => setConfirmParams({ ...confirmParams, prompt: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{isZh ? '比例' : 'Aspect Ratio'}</label>
                    <select
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50"
                      value={String(confirmParams.aspect_ratio || '9:16')}
                      onChange={(e) => setConfirmParams({ ...confirmParams, aspect_ratio: e.target.value })}
                    >
                      <option value="9:16">9:16</option>
                      <option value="16:9">16:9</option>
                      <option value="1:1">1:1</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{isZh ? '分辨率' : 'Resolution'}</label>
                    <select
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50"
                      value={String(confirmParams.resolution || '2K')}
                      onChange={(e) => setConfirmParams({ ...confirmParams, resolution: e.target.value })}
                    >
                      <option value="2K">2K</option>
                      <option value="1K">1K</option>
                    </select>
                  </div>
                </div>
              </>
            )}
            {confirmAction.type === 'generate_first_frame' && (
              <>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">{isZh ? '提示词' : 'Prompt'}</label>
                  <textarea
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50 resize-none"
                    rows={3}
                    value={String(confirmParams.prompt || '')}
                    onChange={(e) => setConfirmParams({ ...confirmParams, prompt: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">{isZh ? '比例' : 'Aspect Ratio'}</label>
                  <select
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50"
                    value={String(confirmParams.aspect_ratio || '9:16')}
                    onChange={(e) => setConfirmParams({ ...confirmParams, aspect_ratio: e.target.value })}
                  >
                    <option value="9:16">9:16</option>
                    <option value="16:9">16:9</option>
                    <option value="1:1">1:1</option>
                  </select>
                </div>
              </>
            )}
            {confirmAction.type === 'generate_script' && (
              <>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">{isZh ? '产品名称' : 'Product Name'}</label>
                  <input
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50"
                    value={String(confirmParams.product_name || confirmParams.prompt || '')}
                    onChange={(e) => setConfirmParams({ ...confirmParams, product_name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{isZh ? '时长' : 'Duration'}</label>
                    <select
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50"
                      value={Number(confirmParams.duration || 30)}
                      onChange={(e) => setConfirmParams({ ...confirmParams, duration: Number(e.target.value) })}
                    >
                      <option value={15}>15s</option>
                      <option value={30}>30s</option>
                      <option value={60}>60s</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{isZh ? '风格' : 'Style'}</label>
                    <select
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50"
                      value={String(confirmParams.style || 'casual')}
                      onChange={(e) => setConfirmParams({ ...confirmParams, style: e.target.value })}
                    >
                      <option value="casual">{isZh ? ' casual' : 'Casual'}</option>
                      <option value="professional">{isZh ? ' professional' : 'Professional'}</option>
                      <option value="humorous">{isZh ? ' humorous' : 'Humorous'}</option>
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>
        </AppDialog>
      )}

      {/* Dialog */}
      {dialogOpen && (
        <AppDialog
          isOpen={dialogOpen}
          title={dialogTitle || 'Notice'}
          onClose={() => setDialogOpen(false)}
          footer={
            <button
              className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700"
              onClick={() => setDialogOpen(false)}
            >
              {t.btn_ok || 'OK'}
            </button>
          }
        >
          <div className="whitespace-pre-line text-sm text-zinc-300">{dialogMessage}</div>
        </AppDialog>
      )}
    </div>
  );
};
