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
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import {
  aiCreatorApi,
  type AiCreatorAction,
  type AiCreatorMessage,
  type AiCreatorConversation,
} from '../../services/aiCreator';
import { videoApi } from '../../services/video';
import { assetsApi } from '../../services/assets';
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
  taskId?: number;
  error?: string;
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

export const AICreatorView: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
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

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, results]);

  // Load conversations on mount, and restore active conversation if any
  useEffect(() => {
    const restore = async () => {
      await loadConversations();
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          await loadConversation(saved);
        }
      } catch {
        // ignore
      }
    };
    void restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && activeConversationId) {
        void loadConversation(activeConversationId);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  const loadConversations = async () => {
    try {
      const list = await aiCreatorApi.listConversations();
      setConversations(list);
    } catch (e) {
      console.error('Failed to load conversations:', e);
    }
  };

  const startNewChat = async () => {
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

  const loadConversation = async (id: string) => {
    if (convoLoading) return;
    setConvoLoading(true);
    try {
      const data = await aiCreatorApi.getMessages(id);
      setActiveConversationId(data.id);
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages);
      } else {
        setMessages([isZh ? WELCOME_MESSAGE_ZH : WELCOME_MESSAGE]);
      }
      setResults([]);
      setUploadedImages([]);
      setEditingIdx(null);
      setEditText('');
    } catch (e: any) {
      openInfo('Error', e?.message || 'Failed to load conversation');
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

  const executeAction = async (action: AiCreatorAction) => {
    if (generatingType) return;
    const type = action.type;
    const params = action.params || {};
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
          addResult({ id: resultId, type, status: 'success', taskId, content: `Task #${taskId} queued` });
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
        const payload = {
          product_name: String(params.product_name || params.prompt || ''),
          product_description: String(params.product_description || params.prompt || ''),
          duration: Number(params.duration || 30),
          style: String(params.style || 'casual'),
          language: String(params.language || 'zh'),
        };
        const res = await videoApi.generateScript(user.id, payload);
        if (res?.code === 0) {
          const scripts = res?.data?.script_contents || [];
          const text = scripts.map((s: any) => s?.content || s?.script || String(s)).join('\n\n---\n\n');
          addResult({ id: resultId, type, status: 'success', content: text || 'Script generated successfully' });
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
            addResult({ id: resultId, type, status: 'success', imageUrl });
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
            addResult({ id: resultId, type, status: 'success', imageUrl });
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
            addResult({ id: resultId, type, status: 'success', imageUrl: firstFramePath });
          } else {
            throw new Error(res?.message || 'First frame generation failed');
          }
        } else {
          openInfo(
            (t as any).ai_creator_title || 'AI Creator',
            (t as any).ai_creator_first_frame_tip || 'First frame generation requires a reference product image. Please upload one.'
          );
          addResult({ id: resultId, type, status: 'failed', error: 'Reference image required' });
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
      addResult({ id: resultId, type, status: 'failed', error: err?.message || 'Generation failed' });
      openInfo(
        (t as any).ai_creator_title || 'AI Creator',
        err?.message || (t as any).ai_creator_error || 'Generation failed. Please try again.'
      );
    } finally {
      setGeneratingType(null);
    }
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
        <div className="mt-3 rounded-2xl overflow-hidden border border-white/10 bg-zinc-900">
          <div className="px-4 py-2 bg-zinc-950/50 text-xs text-zinc-400 flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5" />
            {getActionLabel(result.type)}
          </div>
          <img src={result.imageUrl} alt="Generated" className="w-full max-h-[400px] object-contain bg-black" />
        </div>
      );
    }
    if (result.type === 'generate_script' && result.content) {
      return (
        <div className="mt-3 rounded-2xl border border-white/10 bg-zinc-900 overflow-hidden">
          <div className="px-4 py-2 bg-zinc-950/50 text-xs text-zinc-400 flex items-center gap-2">
            <ScrollText className="w-3.5 h-3.5" />
            {getActionLabel(result.type)}
          </div>
          <div className="p-4 text-sm text-zinc-200 whitespace-pre-wrap max-h-[400px] overflow-y-auto">{result.content}</div>
        </div>
      );
    }
    if (result.type === 'generate_video') {
      return (
        <div className="mt-3 rounded-2xl border border-white/10 bg-zinc-900 overflow-hidden">
          <div className="px-4 py-2 bg-zinc-950/50 text-xs text-zinc-400 flex items-center gap-2">
            <Film className="w-3.5 h-3.5" />
            {getActionLabel(result.type)}
            {result.status === 'pending' && <span className="text-orange-400 ml-2">{(t as any).ai_creator_generating || 'Generating...'}</span>}
            {result.status === 'success' && <span className="text-emerald-400 ml-2">Queued #{result.taskId}</span>}
            {result.status === 'failed' && <span className="text-red-400 ml-2">Failed</span>}
          </div>
          {result.status === 'success' && (
            <div className="p-4 text-sm text-zinc-400">
              {(t as any).ai_creator_video_queued || 'Video generation started! You can check progress in the task queue.'}
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
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden opacity-0'
        }`}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/5">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            {(t as any).ai_creator_history || 'History'}
          </span>
          <button
            onClick={startNewChat}
            className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-orange-400 hover:bg-zinc-700 transition"
            title="New chat"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-2 space-y-0.5">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className={`group mx-2 flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition ${
                activeConversationId === conv.id
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
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
                  className="flex-1 min-w-0 bg-zinc-900 border border-white/10 rounded px-2 py-0.5 text-xs text-zinc-200 outline-none focus:border-orange-500/50"
                />
              ) : (
                <span className="flex-1 min-w-0 text-xs truncate">{conv.title}</span>
              )}

              {renamingId !== conv.id && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => startRename(conv, e)}
                    className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {conversations.length === 0 && (
            <div className="px-4 py-6 text-xs text-zinc-600 text-center">
              {(t as any).ai_creator_no_history || 'No conversations yet'}
            </div>
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex justify-between items-center px-6 py-4 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((s) => !s)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"
              title="Toggle sidebar"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-100">
                {(t as any).ai_creator_title || 'AI Creator'}
              </h1>
              <p className="text-zinc-500 text-xs mt-0.5">
                {(t as any).ai_creator_subtitle || 'Describe anything and generate with one click'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={startNewChat}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {(t as any).ai_creator_new_chat || 'New Chat'}
            </button>
            <div className="px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/40 text-xs text-orange-400 font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              AI
            </div>
          </div>
        </header>

        {/* Quick action buttons */}
        <div className="shrink-0 px-6 py-3 border-b border-white/5 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => quickSend('我想生成一段视频')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition whitespace-nowrap"
          >
            <Film className="w-3.5 h-3.5" />
            {(t as any).ai_creator_quick_video || '生成视频'}
          </button>
          <button
            onClick={() => quickSend('我想生成一张图片')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition whitespace-nowrap"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            {(t as any).ai_creator_quick_image || '生成图片'}
          </button>
          <button
            onClick={() => quickSend('我想生成一个脚本')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition whitespace-nowrap"
          >
            <ScrollText className="w-3.5 h-3.5" />
            {(t as any).ai_creator_quick_script || '生成脚本'}
          </button>
          <button
            onClick={() => quickSend('我想生成首帧图')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition whitespace-nowrap"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            {(t as any).ai_creator_quick_first_frame || '生成首帧图'}
          </button>
        </div>

        {/* Chat + Results area */}
        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {convoLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          )}

          {!convoLoading &&
            messages.map((msg, idx) => (
              <div key={idx}>
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-5 py-3 text-sm leading-relaxed group relative ${
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
                          className="w-full bg-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/50 outline-none resize-none"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={confirmEdit}
                            className="px-3 py-1 rounded-lg bg-white/20 text-xs font-semibold hover:bg-white/30 transition"
                          >
                            {(t as any).ai_creator_save || 'Save & Regenerate'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-3 py-1 rounded-lg bg-white/10 text-xs hover:bg-white/20 transition"
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
                      <div className="absolute -left-20 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(idx)}
                          className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-orange-400 hover:bg-zinc-700 transition"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteFrom(idx)}
                          className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Action card inside assistant message */}
                    {msg.role === 'assistant' && msg.action && msg.action.type !== 'chat' && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
                          {ACTION_ICONS[msg.action.type] || <Wand2 className="w-4 h-4" />}
                          <span className="font-semibold text-zinc-300">{getActionLabel(msg.action.type)}</span>
                        </div>
                        {msg.action.params && Object.keys(msg.action.params).length > 0 && (
                          <div className="text-[11px] text-zinc-500 mb-2 space-y-0.5">
                            {Object.entries(msg.action.params).map(([k, v]) => (
                              <div key={k}>
                                <span className="text-zinc-400">{k}:</span> {String(v)}
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={() => executeAction(msg.action!)}
                          disabled={generatingType !== null}
                          className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-xs text-white font-semibold hover:bg-orange-500 transition disabled:opacity-50"
                        >
                          {generatingType === msg.action.type ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Wand2 className="w-3.5 h-3.5" />
                          )}
                          {(t as any).ai_creator_generate || 'Generate'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Routing quick-reply buttons */}
                {msg.role === 'assistant' &&
                  idx === messages.length - 1 &&
                  showRoutingButtons && (
                    <div className="flex gap-2 mt-2 ml-1">
                      <button
                        onClick={() => quickSend('我想生成视频')}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-white/10 text-xs text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition"
                      >
                        🎬 {(t as any).ai_creator_quick_video || '生成视频'}
                      </button>
                      <button
                        onClick={() => quickSend('我想生成图片')}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-white/10 text-xs text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition"
                      >
                        🖼️ {(t as any).ai_creator_quick_image || '生成图片'}
                      </button>
                    </div>
                  )}
              </div>
            ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-zinc-900 border border-white/10 rounded-2xl px-5 py-3 text-sm text-zinc-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
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
        <footer className="shrink-0 px-6 py-4 border-t border-white/5 bg-zinc-950/50 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto">
            {/* Uploaded image thumbnails */}
            {uploadedImages.length > 0 && (
              <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
                {uploadedImages.map((img) => (
                  <div key={img.id} className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-white/10">
                    <img src={img.url} alt="uploaded" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeImage(img.id)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 rounded-2xl bg-zinc-900 border border-white/10 p-2 pr-3 focus-within:border-orange-500/50 transition">
              {/* + upload button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || loading}
                className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition disabled:opacity-50"
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
                className="flex-1 py-2.5 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none disabled:opacity-50 min-w-0"
              />

              {/* Send button */}
              <button
                onClick={() => handleSend()}
                disabled={loading || (!input.trim() && uploadedImages.length === 0)}
                className="shrink-0 w-9 h-9 rounded-full bg-orange-600 text-white flex items-center justify-center hover:bg-orange-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 mt-1.5 ml-1">
              AI may produce inaccurate content. Upload images as reference material.
            </p>
          </div>
        </footer>
      </div>

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
