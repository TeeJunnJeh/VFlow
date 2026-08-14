import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
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
  X,
  Pencil,
  Trash2,
  Plus,
  MessageSquare,
  Edit3,
  Save,
  Menu,
  Download,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  SquarePen,
  Square,
  Check,
  Paintbrush,
  UserRound,
  Images,
  Type,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import {
  agentRuntimeApi,
  type AgentAction as AiCreatorAction,
  type AgentMessage as AiCreatorMessage,
  type AgentConversation as AiCreatorConversation,
  type AgentAttachment,
  type AgentSkill,
  type AgentExperienceRecipe,
  type AgentRequestedHint,
  type AgentAssistantDelta,
  type AgentStreamStatus,
  type AgentNextSuggestion,
  type AgentContextUsage,
  type AgentRunReadiness,
} from '../../services/agentRuntime';
import { assetsApi } from '../../services/assets';
import { ApiError, formatApiError } from '../../services/errors';
import { AppDialog } from '../common/AppDialog';
import { SmartDurationToggle } from '../common/SmartDurationToggle';
import { AgentImageEditDialog } from '../../features/agentImageEditing/AgentImageEditDialog';
import { AgentImageEditButton } from '../../features/agentImageEditing/AgentImageEditButton';
import { AgentImageEditQueueCard } from '../../features/agentImageEditing/AgentImageEditQueueCard';
import { AgentImagePreview } from '../../features/agentImageEditing/AgentImagePreview';
import {
  getMessageEditableImageSources,
  getMessageRunIds,
  hasPendingAgentImageAssets as hasPendingToolAssets,
  isFailedAgentImageAsset as isFailedToolAsset,
  isPendingAgentImageAsset as isPendingToolAsset,
  readAgentAssetUrl as readAssetUrl,
} from '../../features/agentImageEditing/imageSources';
import { agentImageEditQueue } from '../../features/agentImageEditing/queueStore';
import { useAgentImageEditing } from '../../features/agentImageEditing/useAgentImageEditing';
import type {
  AgentImageEditQueueJob,
  AgentImageEditSource,
} from '../../features/agentImageEditing/types';
import { AgentProductImageActionCard } from '../../features/agentProductImages/AgentProductImageActionCard';
import { AgentProductImageResultCard } from '../../features/agentProductImages/AgentProductImageResultCard';
import { AgentPosterEditorDialog } from '../../features/agentProductImages/AgentPosterEditorDialog';
import type { AgentPosterEditorData } from '../../features/agentProductImages/posterEditorData';
import {
  canonicalProductImageToolName,
  isProductImageAction,
  normalizeGalleryOutputItems,
  PRODUCT_IMAGE_TOOL_NAMES,
  readAgentAssetRef,
  type AgentConversationImage,
} from '../../features/agentProductImages/types';

const ACTION_ICONS: Record<string, React.ReactNode> = {
  generate_video: <Film className="w-5 h-5" />,
  generate_script: <FileText className="w-5 h-5" />,
  generate_image: <ImageIcon className="w-5 h-5" />,
  generate_first_frame: <ImageIcon className="w-5 h-5" />,
  generate_clothing_swap: <Shirt className="w-5 h-5" />,
  clothing_swap: <Shirt className="w-5 h-5" />,
  generate_ai_model: <UserRound className="w-5 h-5" />,
  generate_product_gallery: <Images className="w-5 h-5" />,
  edit_product_poster: <Type className="w-5 h-5" />,
  chat: <Sparkles className="w-5 h-5" />,
};

const ACTION_LABELS_EN: Record<string, string> = {
  generate_video: 'Generate Video',
  generate_script: 'Generate Script',
  generate_image: 'Generate Image',
  generate_first_frame: 'Generate First Frame',
  generate_clothing_swap: 'AI Clothing Swap',
  clothing_swap: 'Clothing Swap',
  generate_ai_model: 'AI Model',
  generate_product_gallery: 'AI Product Gallery',
  edit_product_poster: 'AI Poster Editor',
  chat: 'Chat',
};

const ACTION_LABELS_ZH: Record<string, string> = {
  generate_video: '生成视频',
  generate_script: '生成脚本',
  generate_image: '生成图片',
  generate_first_frame: '生成首帧图',
  generate_clothing_swap: 'AI 换装',
  clothing_swap: 'AI 换装',
  generate_ai_model: 'AI 模特',
  generate_product_gallery: 'AI 商品套图',
  edit_product_poster: 'AI 海报编辑',
  chat: '对话',
};

interface UploadedImage {
  id: string;
  url: string;
  file?: File | null;
  name?: string;
  role?: AgentAttachment['role'];
}

type ImageToolGroupEntry = {
  message: AiCreatorMessage;
  index: number;
  key: string;
};

const PLANNER_GENERATION_TOOL_NAMES = new Set([
  'generate_script',
  'generate_image',
  'generate_first_frame',
  'generate_video',
  'generate_clothing_swap',
  'generate_ai_model',
  'generate_product_gallery',
  'edit_product_poster',
]);

type PlannerProcessEntry = {
  message: AiCreatorMessage;
  index: number;
  key: string;
};

type ChatRenderItem =
  | { type: 'message'; key: string; message: AiCreatorMessage; index: number }
  | { type: 'image_group'; key: string; entries: ImageToolGroupEntry[] }
  | { type: 'image_edit_job'; key: string; job: AgentImageEditQueueJob }
  | { type: 'process_group'; key: string; entries: PlannerProcessEntry[] };

const isImageEditAction = (action?: AiCreatorAction | null) => (
  action?.type === 'generate_image' && String(action.params?.mode || '') === 'edit'
);

const isLocalImageEditAction = (action?: AiCreatorAction | null) => (
  isImageEditAction(action) && String(action?.params?.edit_scope || 'local') === 'local'
);

const EMPTY_NEXT_SUGGESTION: AgentNextSuggestion = {
  status: 'ready',
  suggestion: null,
  source: 'none',
  stage: null,
  can_apply: false,
};

const EMPTY_CONTEXT_USAGE: AgentContextUsage = {
  input_tokens: 0,
  max_tokens: 256000,
  checkpoint_threshold: 200000,
  epoch: 1,
};

type ReferenceAnalysisStatus = 'idle' | 'analyzing' | 'ready' | 'error' | 'stale';

type ReferenceAnalysisState = {
  status: ReferenceAnalysisStatus;
  prompt: string;
  imageIds: string[];
  role: string;
  draft: string;
};

const EMPTY_REFERENCE_ANALYSIS: ReferenceAnalysisState = {
  status: 'idle',
  prompt: '',
  imageIds: [],
  role: 'reference_image',
  draft: '',
};

type SlashSkillRange = {
  start: number;
  end: number;
  query: string;
};

type SlashSelectableItem =
  | { kind: 'skill'; value: AgentSkill }
  | { kind: 'recipe'; value: AgentExperienceRecipe };

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

const isSupersededActionMessage = (message: AiCreatorMessage) =>
  message.run_status === 'cancelled' && message.run_finish_reason === 'superseded';

const isPlannerProcessMessage = (message: AiCreatorMessage) => {
  const messageType = String(message.metadata?.message_type || '');
  const itemType = String(message.metadata?.item_type || '');
  if (['reasoning', 'function_call', 'function_call_output', 'checkpoint', 'response_interrupted'].includes(itemType)) return true;
  if (messageType === 'planner_trace_tool') return true;
  return messageType === 'planner_trace_assistant'
    && Array.isArray(message.metadata?.tool_calls)
    && message.metadata.tool_calls.length > 0;
};

const getPlannerProcessKey = (message: AiCreatorMessage) => {
  const responseId = String(message.metadata?.response_id || '').trim();
  if (responseId) return `planner_response_${responseId}`;
  const turnId = String(message.metadata?.planner_turn_id || '').trim();
  const iteration = Number(message.metadata?.planner_iteration);
  if (String(message.metadata?.item_type || '') === 'checkpoint' && turnId) {
    return `planner_checkpoint_${turnId}_${message.id || 'pending'}`;
  }
  if (String(message.metadata?.item_type || '') === 'response_interrupted' && turnId) {
    return `planner_interrupted_${turnId}_${message.id || 'pending'}`;
  }
  if (!turnId || !Number.isInteger(iteration)) return '';
  return `planner_process_${turnId}_${iteration}`;
};

const buildSuggestionContextKey = (
  conversationId: string,
  language: string,
  items: AiCreatorMessage[],
) => JSON.stringify({
  conversationId,
  language,
  messages: items.slice(-12).map((message) => ({
    id: message.id || message.stream_key || '',
    role: message.role,
    content: message.content.slice(0, 160),
    action: message.action?.type || '',
    runId: message.run_id || message.action?.run_id || '',
    toolName: message.tool_result?.tool_name || '',
    toolStatus: message.tool_result?.status || '',
    assets: [
      ...(Array.isArray(message.tool_result?.assets) ? message.tool_result.assets : []),
      ...(Array.isArray(message.attachments) ? message.attachments : []),
    ].slice(0, 8).map((asset) => {
      const record = asset as Record<string, unknown>;
      return {
        requestId: String(record.request_id || record.requestId || record.external_task_id || ''),
        status: String(record.status || ''),
        type: String(record.media_kind || record.mediaKind || record.type || ''),
        hasUrl: Boolean(readAssetUrl(record)),
      };
    }),
  })),
});

const MarkdownMessage: React.FC<{ content: string }> = ({ content }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
      ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
      ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
      li: ({ children }) => <li className="pl-1">{children}</li>,
      h1: ({ children }) => <h1 className="mb-3 text-xl font-bold text-zinc-100">{children}</h1>,
      h2: ({ children }) => <h2 className="mb-2 text-lg font-bold text-zinc-100">{children}</h2>,
      h3: ({ children }) => <h3 className="mb-2 text-base font-bold text-zinc-100">{children}</h3>,
      a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noreferrer" className="text-orange-300 underline decoration-orange-400/40 underline-offset-4 hover:text-orange-200">
          {children}
        </a>
      ),
      code: ({ children, className }) => {
        const inline = !className;
        return inline ? (
          <code className="rounded bg-black/35 px-1.5 py-0.5 text-[0.9em] text-orange-100">{children}</code>
        ) : (
          <code className={`${className} block overflow-x-auto whitespace-pre rounded-lg bg-black/40 p-3 text-xs text-zinc-200`}>{children}</code>
        );
      },
      pre: ({ children }) => <pre className="mb-3 overflow-x-auto rounded-lg bg-black/40 last:mb-0">{children}</pre>,
      blockquote: ({ children }) => <blockquote className="mb-3 border-l-2 border-orange-400/50 pl-3 text-zinc-400 last:mb-0">{children}</blockquote>,
      table: ({ children }) => <div className="mb-3 overflow-x-auto rounded-lg border border-white/10"><table className="w-full text-left text-sm">{children}</table></div>,
      th: ({ children }) => <th className="border-b border-white/10 bg-white/5 px-3 py-2 font-semibold text-zinc-200">{children}</th>,
      td: ({ children }) => <td className="border-b border-white/5 px-3 py-2 text-zinc-300">{children}</td>,
    }}
  >
    {content}
  </ReactMarkdown>
);

export const AICreatorView: React.FC = () => {
  const { t, language } = useLanguage();
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
  const [availableSkills, setAvailableSkills] = useState<{ system_skills: AgentSkill[]; experience_recipes: AgentExperienceRecipe[] }>({ system_skills: [], experience_recipes: [] });
  const [selectedSkills, setSelectedSkills] = useState<AgentSkill[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<AgentExperienceRecipe | null>(null);
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);
  const [recipeSectionOpen, setRecipeSectionOpen] = useState(false);
  const [historySectionOpen, setHistorySectionOpen] = useState(true);
  const [recipePendingDisable, setRecipePendingDisable] = useState<AgentExperienceRecipe | null>(null);
  const [slashRange, setSlashRange] = useState<SlashSkillRange | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamStatus, setStreamStatus] = useState<AgentStreamStatus | null>(null);
  const [nextSuggestionResult, setNextSuggestionResult] = useState<AgentNextSuggestion>(EMPTY_NEXT_SUGGESTION);
  const [contextUsage, setContextUsage] = useState<AgentContextUsage>(EMPTY_CONTEXT_USAGE);
  const [highlightedRunId, setHighlightedRunId] = useState<string | null>(null);
  const [referenceAnalysis, setReferenceAnalysis] = useState<ReferenceAnalysisState>(EMPTY_REFERENCE_ANALYSIS);
  const [statusPhraseIndex, setStatusPhraseIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [productSubmittingRunIds, setProductSubmittingRunIds] = useState<Set<string>>(() => new Set());
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [previewImage, setPreviewImage] = useState<AgentAttachment | null>(null);
  const [previewImageSource, setPreviewImageSource] = useState<AgentImageEditSource | null>(null);
  const [savingPreviewAsset, setSavingPreviewAsset] = useState(false);
  const [posterEditorData, setPosterEditorData] = useState<AgentPosterEditorData | null>(null);

  // Sidebar editing states
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [convoLoading, setConvoLoading] = useState(false);

  // Action confirmation dialog
  const [confirmAction, setConfirmAction] = useState<AiCreatorAction | null>(null);
  const [confirmParams, setConfirmParams] = useState<Record<string, unknown>>({});
  const [selectedImageGroupItems, setSelectedImageGroupItems] = useState<Record<string, string>>({});
  const [expandedProcessGroups, setExpandedProcessGroups] = useState<Record<string, boolean>>({});

  const bottomRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const nextScrollBehaviorRef = useRef<ScrollBehavior>('smooth');
  const suppressNextScrollRef = useRef(false);
  const shouldFollowStreamRef = useRef(true);
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamRequestTokenRef = useRef(0);
  const streamBuffersRef = useRef<Map<string, string>>(new Map());
  const streamFrameRef = useRef<number | null>(null);
  const suggestionAbortRef = useRef<AbortController | null>(null);
  const suggestionRequestTokenRef = useRef(0);
  const suggestionContextKeyRef = useRef('');
  const referenceAnalysisAbortRef = useRef<AbortController | null>(null);
  const referenceAnalysisTokenRef = useRef(0);
  const inputHistoryIndexRef = useRef<number | null>(null);
  const inputHistoryDraftRef = useRef('');
  const pendingUploadRoleRef = useRef<AgentAttachment['role']>('reference_image');
  const pendingUploadMaxFilesRef = useRef(0);
  const highlightTimerRef = useRef<number | null>(null);
  const productSubmittingRunIdsRef = useRef<Set<string>>(new Set());

  // 按会话缓存临时状态（待发送上传图片），切回时恢复（持久化到 localStorage）
  const uploadedImagesRef = useRef<UploadedImage[]>([]);
  const activeConversationIdRef = useRef<string | null>(activeConversationId);

  useEffect(() => { uploadedImagesRef.current = uploadedImages; }, [uploadedImages]);
  useEffect(() => { activeConversationIdRef.current = activeConversationId; }, [activeConversationId]);
  useEffect(() => {
    setPreviewImage(null);
    setPreviewImageSource(null);
  }, [activeConversationId]);

  const referenceStatusText = referenceAnalysis.status === 'analyzing'
    ? (t.ai_creator_reference_analyzing || 'Understanding the reference images and preparing a prompt...')
    : referenceAnalysis.status === 'error'
      ? (t.ai_creator_reference_retry || 'Reference analysis failed. Press → or click to retry.')
      : referenceAnalysis.status === 'stale'
        ? (t.ai_creator_reference_stale || 'The draft or images changed. Click to analyze again.')
        : '';
  const nextSuggestion = referenceStatusText || nextSuggestionResult.suggestion || '';
  const canApplyNextSuggestion = Boolean(nextSuggestionResult.suggestion) && nextSuggestionResult.can_apply;
  const contextMaxTokens = Math.max(1, contextUsage.max_tokens || 256000);
  const contextPercent = Math.min(100, Math.max(0, (contextUsage.input_tokens / contextMaxTokens) * 100));
  const contextTooltip = `${contextUsage.input_tokens.toLocaleString()} / ${contextMaxTokens.toLocaleString()} tokens (${contextPercent.toFixed(1)}%)`;

  const resetNextSuggestion = (resetContext = true) => {
    suggestionRequestTokenRef.current += 1;
    suggestionAbortRef.current?.abort();
    suggestionAbortRef.current = null;
    if (resetContext) suggestionContextKeyRef.current = '';
    setNextSuggestionResult(EMPTY_NEXT_SUGGESTION);
  };

  const resetReferenceAnalysis = () => {
    referenceAnalysisTokenRef.current += 1;
    referenceAnalysisAbortRef.current?.abort();
    referenceAnalysisAbortRef.current = null;
    setReferenceAnalysis(EMPTY_REFERENCE_ANALYSIS);
  };

  const resetInputHistory = () => {
    inputHistoryIndexRef.current = null;
    inputHistoryDraftRef.current = '';
  };

  const upsertStreamDrafts = (
    current: AiCreatorMessage[],
    entries: Array<[string, string]>,
  ): AiCreatorMessage[] => {
    const next = [...current];
    entries.forEach(([streamKey, content]) => {
      const separatorIndex = streamKey.lastIndexOf(':');
      const plannerTurnId = separatorIndex > 0 ? streamKey.slice(0, separatorIndex) : streamKey;
      const plannerIteration = Number(separatorIndex > 0 ? streamKey.slice(separatorIndex + 1) : 0);
      const draft: AiCreatorMessage = {
        role: 'assistant',
        content,
        stream_key: streamKey,
        metadata: {
          message_type: 'planner_trace_draft',
          planner_turn_id: plannerTurnId,
          planner_iteration: Number.isInteger(plannerIteration) ? plannerIteration : 0,
          stream_key: streamKey,
          is_streaming: true,
        },
      };
      const index = next.findIndex((message) => message.stream_key === streamKey);
      if (index >= 0) {
        next[index] = { ...next[index], ...draft };
      } else {
        next.push(draft);
      }
    });
    return next;
  };

  const flushStreamDrafts = () => {
    streamFrameRef.current = null;
    const entries = Array.from(streamBuffersRef.current.entries());
    if (entries.length === 0) return;
    setMessages((prev) => upsertStreamDrafts(prev, entries));
  };

  const queueStreamDelta = (data: AgentAssistantDelta) => {
    const current = streamBuffersRef.current.get(data.stream_key) || '';
    streamBuffersRef.current.set(data.stream_key, current + data.delta);
    if (streamFrameRef.current === null) {
      streamFrameRef.current = window.requestAnimationFrame(flushStreamDrafts);
    }
  };

  const stopActiveStream = () => {
    const controller = streamAbortRef.current;
    if (!controller) return;
    streamRequestTokenRef.current += 1;
    controller.abort();
    streamAbortRef.current = null;
    if (streamFrameRef.current !== null) {
      window.cancelAnimationFrame(streamFrameRef.current);
      streamFrameRef.current = null;
    }
    const entries = Array.from(streamBuffersRef.current.entries());
    streamBuffersRef.current.clear();
    setMessages((prev) => upsertStreamDrafts(prev, entries).map((message) => (
      message.metadata?.is_streaming
        ? {
            ...message,
            metadata: {
              ...message.metadata,
              is_streaming: false,
              finish_reason: 'cancelled',
            },
          }
        : message
    )));
    setStreamStatus(null);
    setLoading(false);
    const conversationId = activeConversationIdRef.current;
    if (conversationId) {
      window.setTimeout(() => {
        void loadConversation(conversationId, { skipStateRestore: true, silent: true, preserveScroll: true });
      }, 400);
    }
  };

  const getSessionStorageKey = (conversationId: string) => `vflow_ai_creator_session_${user?.id || 'anon'}_${conversationId}`;

  const saveSessionState = (conversationId: string, state: { uploadedImages: UploadedImage[] }) => {
    try {
      localStorage.setItem(
        getSessionStorageKey(conversationId),
        JSON.stringify({
          uploadedImages: state.uploadedImages.map((img) => ({ id: img.id, url: img.url, name: img.name, role: img.role })),
        })
      );
    } catch {
      // ignore storage errors
    }
  };

  const loadSessionState = (conversationId: string): { uploadedImages: UploadedImage[] } | null => {
    try {
      const raw = localStorage.getItem(getSessionStorageKey(conversationId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const uploadedImages: UploadedImage[] = (Array.isArray(parsed.uploadedImages) ? parsed.uploadedImages : []).map(
        (img: any) => ({
          id: img.id || `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          url: img.url,
          name: img.name || '',
          role: img.role || 'reference_image',
          file: null as any,
        })
      );
      return { uploadedImages };
    } catch {
      return null;
    }
  };

  const scrollToBottom = () => {
    if (suppressNextScrollRef.current) {
      suppressNextScrollRef.current = false;
      return;
    }
    const behavior = nextScrollBehaviorRef.current;
    bottomRef.current?.scrollIntoView({ behavior });
    nextScrollBehaviorRef.current = 'smooth';
  };

  const handleChatScroll = () => {
    const element = chatScrollRef.current;
    if (!element) return;
    shouldFollowStreamRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  };

  useLayoutEffect(() => {
    if (shouldFollowStreamRef.current) {
      scrollToBottom();
    }
  }, [messages]);

  useLayoutEffect(() => {
    const textarea = textInputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [input, nextSuggestion]);

  // 自动保存当前会话尚未发送的上传图片
  useEffect(() => {
    if (activeConversationId) {
      saveSessionState(activeConversationId, { uploadedImages });
    }
  }, [uploadedImages, activeConversationId]);

  // Load conversations on mount. Default to empty new chat instead of restoring
  // the last active conversation.
  useEffect(() => {
    void loadConversations();
    void loadSkills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeConversationId) return;
    if (conversations.some((c) => c.id === activeConversationId)) return;
    setActiveConversationId(null);
    setMessages([isZh ? WELCOME_MESSAGE_ZH : WELCOME_MESSAGE]);
    setContextUsage(EMPTY_CONTEXT_USAGE);
    setUploadedImages([]);
    setSelectedSkills([]);
    setSelectedRecipe(null);
    setSlashRange(null);
    resetInputHistory();
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
      if (!document.hidden && !streamAbortRef.current && activeConversationId && conversations.some((c) => c.id === activeConversationId)) {
        void loadConversation(activeConversationId, { skipStateRestore: true, silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, conversations]);

  useEffect(() => {
    if (!activeConversationId || streamAbortRef.current || generatingType || !hasPendingToolAssets(messages) || document.hidden) return;
    const timer = window.setTimeout(() => {
      void loadConversation(activeConversationId, { skipStateRestore: true, silent: true, preserveScroll: true });
    }, 6000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, messages, generatingType]);

  useEffect(() => {
    const hasPersistedMessage = messages.some((message) => Boolean(message.id));
    const hasPendingAssets = hasPendingToolAssets(messages);
    if (loading || generatingType || hasPendingAssets) {
      suggestionRequestTokenRef.current += 1;
      suggestionAbortRef.current?.abort();
      suggestionAbortRef.current = null;
      referenceAnalysisTokenRef.current += 1;
      referenceAnalysisAbortRef.current?.abort();
      referenceAnalysisAbortRef.current = null;
      setReferenceAnalysis(EMPTY_REFERENCE_ANALYSIS);
      suggestionContextKeyRef.current = '';
      setNextSuggestionResult({
        ...EMPTY_NEXT_SUGGESTION,
        status: 'processing',
        suggestion: t.ai_creator_suggestion_processing || 'Content is being generated. The next suggestion will appear when it is ready.',
      });
      return;
    }
    const blocked = !activeConversationId
      || !hasPersistedMessage
      || convoLoading
      || document.hidden;
    if (blocked) {
      suggestionRequestTokenRef.current += 1;
      suggestionAbortRef.current?.abort();
      suggestionAbortRef.current = null;
      setNextSuggestionResult(EMPTY_NEXT_SUGGESTION);
      suggestionContextKeyRef.current = '';
      return;
    }

    const contextKey = buildSuggestionContextKey(activeConversationId, language, messages);
    if (suggestionContextKeyRef.current === contextKey) return;
    suggestionContextKeyRef.current = contextKey;
    suggestionAbortRef.current?.abort();
    const controller = new AbortController();
    const requestToken = suggestionRequestTokenRef.current + 1;
    suggestionRequestTokenRef.current = requestToken;
    suggestionAbortRef.current = controller;
    setNextSuggestionResult(EMPTY_NEXT_SUGGESTION);

    void agentRuntimeApi.getNextSuggestion(activeConversationId, language, { signal: controller.signal })
      .then((result) => {
        if (
          controller.signal.aborted
          || suggestionRequestTokenRef.current !== requestToken
          || activeConversationIdRef.current !== activeConversationId
        ) return;
        setNextSuggestionResult(result);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return;
        console.warn('Failed to load Agent next suggestion:', error);
      })
      .finally(() => {
        if (suggestionRequestTokenRef.current === requestToken) {
          suggestionAbortRef.current = null;
        }
      });

    return () => controller.abort();
  }, [activeConversationId, convoLoading, generatingType, language, loading, messages, t.ai_creator_suggestion_processing]);

  useEffect(() => {
    setStatusPhraseIndex(0);
    if (!loading || streamStatus?.phase === 'responding') return;
    const timer = window.setInterval(() => {
      setStatusPhraseIndex((current) => current + 1);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [loading, streamStatus?.phase, streamStatus?.stream_id]);

  // 组件卸载时保存当前会话状态
  useEffect(() => {
    return () => {
      streamRequestTokenRef.current += 1;
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      suggestionRequestTokenRef.current += 1;
      suggestionAbortRef.current?.abort();
      suggestionAbortRef.current = null;
      referenceAnalysisTokenRef.current += 1;
      referenceAnalysisAbortRef.current?.abort();
      referenceAnalysisAbortRef.current = null;
      if (streamFrameRef.current !== null) {
        window.cancelAnimationFrame(streamFrameRef.current);
      }
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      const convoId = activeConversationIdRef.current;
      if (convoId) {
        saveSessionState(convoId, { uploadedImages: uploadedImagesRef.current });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadConversations = async () => {
    try {
      const list = await agentRuntimeApi.listConversations();
      setConversations(list);
    } catch (e) {
      console.error('Failed to load conversations:', e);
    }
  };

  const loadSkills = async () => {
    try {
      const skills = await agentRuntimeApi.listSkills();
      setAvailableSkills(skills);
    } catch (e) {
      console.error('Failed to load skills:', e);
      setAvailableSkills({ system_skills: [], experience_recipes: [] });
    }
  };

  const ensureConversationInList = (id: string, title: string) => {
    const now = new Date().toISOString();
    setConversations((prev) => {
      if (prev.some((item) => item.id === id)) {
        return prev.map((item) => (item.id === id ? { ...item, updated_at: now } : item));
      }
      return [
        {
          id,
          title: title.slice(0, 30) || (isZh ? '新对话' : 'New chat'),
          created_at: now,
          updated_at: now,
        },
        ...prev,
      ];
    });
  };

  const startNewChat = async () => {
    stopActiveStream();
    resetNextSuggestion();
    resetReferenceAnalysis();
    resetInputHistory();
    if (activeConversationId) {
      saveSessionState(activeConversationId, { uploadedImages: [...uploadedImages] });
    }
    setActiveConversationId(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setMessages([isZh ? WELCOME_MESSAGE_ZH : WELCOME_MESSAGE]);
    setContextUsage(EMPTY_CONTEXT_USAGE);
    setUploadedImages([]);
    setSelectedSkills([]);
    setSelectedRecipe(null);
    setSlashRange(null);
    setEditingIdx(null);
    setEditText('');
    // Optionally auto-create on first message
  };

  const loadConversation = async (id: string, options?: { skipStateRestore?: boolean; silent?: boolean; instantScroll?: boolean; preserveScroll?: boolean }) => {
    if (convoLoading) return;
    const switchingConversation = id !== activeConversationIdRef.current;
    if (switchingConversation) {
      resetNextSuggestion();
      resetReferenceAnalysis();
      resetInputHistory();
    }
    if (streamAbortRef.current) {
      if (options?.silent && id === activeConversationIdRef.current) return;
      stopActiveStream();
    }
    const showLoading = !options?.silent;

    // 切走前先把当前会话的临时状态缓存下来
    if (activeConversationId) {
      saveSessionState(activeConversationId, { uploadedImages: [...uploadedImages] });
    }

    if (showLoading) {
      setConvoLoading(true);
    }
    try {
      const data = await agentRuntimeApi.getMessages(id);
      if (options?.preserveScroll) {
        suppressNextScrollRef.current = true;
      } else {
        shouldFollowStreamRef.current = true;
        nextScrollBehaviorRef.current = options?.instantScroll === false ? 'smooth' : 'auto';
      }
      setActiveConversationId(data.id);
      setContextUsage(data.context_usage || EMPTY_CONTEXT_USAGE);
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages);
      } else {
        setMessages([isZh ? WELCOME_MESSAGE_ZH : WELCOME_MESSAGE]);
      }

      if (!options?.skipStateRestore) {
        const cached = loadSessionState(data.id);
        const restoredImages: UploadedImage[] = cached?.uploadedImages ?? [];
        setUploadedImages(restoredImages);
      }

      setEditingIdx(null);
      setEditText('');
      setSelectedSkills([]);
      setSelectedRecipe(null);
      setSlashRange(null);
    } catch (e: any) {
      const isNotFound = (e instanceof ApiError && e.status === 404)
        || String(e?.message || '').includes('对话不存在');
      if (isNotFound) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        setActiveConversationId(null);
        setMessages([isZh ? WELCOME_MESSAGE_ZH : WELCOME_MESSAGE]);
        setUploadedImages([]);
        setSelectedSkills([]);
        setSelectedRecipe(null);
        setSlashRange(null);
        resetInputHistory();
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
      if (showLoading) {
        setConvoLoading(false);
      }
    }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(isZh ? '确定删除此对话？' : 'Delete this conversation?')) return;
    try {
      await agentRuntimeApi.deleteConversation(id);
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
      await agentRuntimeApi.updateConversation(id, title);
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

  const {
    copy: imageEditingCopy,
    dialog: imageEditDialog,
    jobs: imageEditQueueJobs,
    closeDialog: closeImageEditDialog,
    openForAction: openImageEditorForAction,
    openForSource: openImageEditorForSource,
    openResult: openQueuedImageEditResult,
    reopen: reopenQueuedImageEdit,
    submit: submitImageEdit,
  } = useAgentImageEditing({
    activeConversationId,
    messages,
    language,
    refreshConversation: (conversationId) => loadConversation(conversationId, {
      skipStateRestore: true,
      silent: true,
      preserveScroll: true,
    }),
    resetSuggestion: () => resetNextSuggestion(),
    showInfo: openInfo,
    closePreview: () => {
      setPreviewImage(null);
      setPreviewImageSource(null);
    },
    openPreview: (source) => {
      setPreviewImage({
        url: source.url,
        name: source.name,
        media_kind: 'image',
      });
      setPreviewImageSource(source);
    },
  });

  const conversationProductImages = React.useMemo<AgentConversationImage[]>(() => {
    const seen = new Set<string>();
    return [...messages].reverse().flatMap((message) => (
      getMessageEditableImageSources(message).flatMap((source) => {
        if (!source.messageId || !source.url || seen.has(source.url)) return [];
        seen.add(source.url);
        return [{
          source: 'conversation' as const,
          url: source.url,
          name: source.name,
          role: source.role,
          message_id: source.messageId,
        }];
      })
    ));
  }, [messages]);

  const getActionLabel = (type: string) => {
    const map = isZh ? ACTION_LABELS_ZH : ACTION_LABELS_EN;
    return map[type] || type;
  };

  const getStreamStatusLabel = (status: AgentStreamStatus | null) => {
    const phase = status?.phase || 'thinking';
    if (phase === 'searching_recipes') return isZh ? '正在检索可复用经验…' : 'Searching reusable experience...';
    if (phase === 'retrieving_recipes') return isZh ? '正在读取经验内容…' : 'Reading selected experience...';
    const fallback = phase === 'loading_skill'
      ? 'Looking through the creation cookbook...|Loading a specialist recipe...'
      : phase === 'preparing_action'
        ? 'Preparing the creation tools...|Calibrating {action}...|Checking the ingredient list...'
        : 'Cooking up a creative recipe...|Gathering creative sparks...|Mapping the next scene...|Tuning the story rhythm...';
    const rawPool = phase === 'loading_skill'
      ? t.ai_creator_status_loading_skill_pool
      : phase === 'preparing_action'
        ? t.ai_creator_status_preparing_action_pool
        : t.ai_creator_status_thinking_pool;
    const pool = String(rawPool || fallback).split('|').map((item) => item.trim()).filter(Boolean);
    const template = pool[statusPhraseIndex % Math.max(pool.length, 1)] || 'Thinking...';
    return template.replace('{action}', getActionLabel(status?.action_type || 'chat'));
  };

  const getSkillKey = (skill: AgentSkill) =>
    `${skill.source}:${skill.name}:${skill.version || ''}`;

  const getSkillLabel = (skill: AgentSkill) =>
    String(skill.label || skill.name || '').trim() || (isZh ? '未命名技能' : 'Untitled skill');

  const getRecipeKey = (recipe: AgentExperienceRecipe) => `experience_recipe:${recipe.id}`;

  const getRecipeLabel = (recipe: AgentExperienceRecipe) =>
    String(recipe.label || recipe.title || recipe.name || '').trim() || (isZh ? '未命名经验' : 'Untitled recipe');

  const getRecipeKindLabel = (recipe: AgentExperienceRecipe) =>
    recipe.recipe_kind === 'seed_skill'
      ? (isZh ? '种子配方' : 'Creative recipe')
      : (isZh ? '成功经验' : 'Successful run');

  const detectSlashSkillRange = (value: string, cursor: number | null | undefined): SlashSkillRange | null => {
    const end = typeof cursor === 'number' ? cursor : value.length;
    const beforeCursor = value.slice(0, end);
    const tokenStart = Math.max(
      beforeCursor.lastIndexOf(' '),
      beforeCursor.lastIndexOf('\n'),
      beforeCursor.lastIndexOf('\t')
    ) + 1;
    const token = beforeCursor.slice(tokenStart);
    if (!token.startsWith('/')) return null;
    return { start: tokenStart, end, query: token.slice(1).trim().toLowerCase() };
  };

  const updateSlashRange = (value: string, cursor: number | null | undefined) => {
    setSlashRange(detectSlashSkillRange(value, cursor));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (
      referenceAnalysis.status !== 'idle'
      && referenceAnalysis.imageIds.length > 0
      && value !== referenceAnalysis.draft
    ) {
      referenceAnalysisTokenRef.current += 1;
      referenceAnalysisAbortRef.current?.abort();
      referenceAnalysisAbortRef.current = null;
      setReferenceAnalysis((current) => ({ ...current, status: 'stale', prompt: '', draft: value }));
    }
    resetInputHistory();
    setInput(value);
    updateSlashRange(value, e.target.selectionStart);
  };

  const ensureReferenceConversation = async (draft: string): Promise<string> => {
    const currentId = activeConversationIdRef.current;
    if (currentId) return currentId;
    const title = draft.trim().slice(0, 30) || t.ai_creator_reference_chat_title || 'Reference image creation';
    const conversation = await agentRuntimeApi.createConversation(title);
    activeConversationIdRef.current = conversation.id;
    setActiveConversationId(conversation.id);
    ensureConversationInList(conversation.id, title);
    try {
      window.localStorage.setItem(STORAGE_KEY, conversation.id);
    } catch {
      // ignore
    }
    return conversation.id;
  };

  const setReferencePromptSuggestion = (prompt: string) => {
    setNextSuggestionResult((current) => {
      return {
        ...current,
        status: 'ready',
        source: 'model',
        suggestion: prompt,
        can_apply: true,
      };
    });
  };

  const analyzeReferenceImages = async (
    images: UploadedImage[],
    role: AgentAttachment['role'],
    draft: string,
  ) => {
    const candidates = images.filter((image) => image.url).slice(-3);
    if (candidates.length === 0) return;
    referenceAnalysisTokenRef.current += 1;
    referenceAnalysisAbortRef.current?.abort();
    const controller = new AbortController();
    const requestToken = referenceAnalysisTokenRef.current;
    referenceAnalysisAbortRef.current = controller;
    setReferenceAnalysis({
      status: 'analyzing',
      prompt: '',
      imageIds: candidates.map((image) => image.id),
      role: role || 'reference_image',
      draft,
    });
    try {
      const conversationId = await ensureReferenceConversation(draft);
      const result = await agentRuntimeApi.createReferencePrompt(
        conversationId,
        {
          language,
          image_urls: candidates.map((image) => image.url),
          role: role || 'reference_image',
          draft,
        },
        { signal: controller.signal },
      );
      if (
        controller.signal.aborted
        || referenceAnalysisTokenRef.current !== requestToken
        || activeConversationIdRef.current !== conversationId
      ) return;
      setReferenceAnalysis({
        status: 'ready',
        prompt: result.prompt,
        imageIds: candidates.map((image) => image.id),
        role: role || 'reference_image',
        draft,
      });
      setReferencePromptSuggestion(result.prompt);
    } catch (error: unknown) {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return;
      if (referenceAnalysisTokenRef.current !== requestToken) return;
      console.warn('Failed to analyze Agent reference images:', error);
      setReferenceAnalysis({
        status: 'error',
        prompt: '',
        imageIds: candidates.map((image) => image.id),
        role: role || 'reference_image',
        draft,
      });
    } finally {
      if (referenceAnalysisTokenRef.current === requestToken) {
        referenceAnalysisAbortRef.current = null;
      }
    }
  };

  const openImagePicker = (role: AgentAttachment['role'] = 'reference_image', maxFiles = 0) => {
    pendingUploadRoleRef.current = role;
    pendingUploadMaxFilesRef.current = maxFiles;
    if (fileInputRef.current) fileInputRef.current.value = '';
    fileInputRef.current?.click();
  };

  const applyNextSuggestion = () => {
    const suggestion = nextSuggestionResult.suggestion || '';
    if (!suggestion || !canApplyNextSuggestion || input.trim() || inputHistoryIndexRef.current !== null) return;
    resetInputHistory();
    setInput(suggestion);
    setSlashRange(null);
    window.requestAnimationFrame(() => {
      textInputRef.current?.focus();
      const end = suggestion.length;
      textInputRef.current?.setSelectionRange(end, end);
    });
  };

  const navigateInputHistory = (direction: -1 | 1): boolean => {
    const history = messages
      .filter((message) => message.role === 'user' && message.content.trim())
      .slice(-50)
      .map((message) => message.content);
    if (history.length === 0) return false;

    let index = inputHistoryIndexRef.current;
    let nextValue = input;
    if (index === null) {
      if (direction > 0) return false;
      inputHistoryDraftRef.current = input;
      index = history.length - 1;
      nextValue = history[index];
    } else if (direction < 0) {
      index = Math.max(0, index - 1);
      nextValue = history[index];
    } else if (index < history.length - 1) {
      index += 1;
      nextValue = history[index];
    } else {
      index = null;
      nextValue = inputHistoryDraftRef.current;
    }

    inputHistoryIndexRef.current = index;
    setInput(nextValue);
    setSlashRange(null);
    window.requestAnimationFrame(() => {
      textInputRef.current?.focus();
      textInputRef.current?.setSelectionRange(nextValue.length, nextValue.length);
    });
    return true;
  };

  const removeSelectedSkill = (skill: AgentSkill) => {
    const key = getSkillKey(skill);
    setSelectedSkills((prev) => prev.filter((item) => getSkillKey(item) !== key));
  };

  const removeSelectedRecipe = () => setSelectedRecipe(null);

  const clearSlashToken = () => {
    if (slashRange) {
      const before = input.slice(0, slashRange.start);
      const after = input.slice(slashRange.end);
      const needsSpace = before && after && !/\s$/.test(before) && !/^\s/.test(after);
      const nextInput = `${before}${needsSpace ? ' ' : ''}${after}`.replace(/[ \t]{2,}/g, ' ');
      const nextCursor = before.length + (needsSpace ? 1 : 0);
      setInput(nextInput);
      window.requestAnimationFrame(() => {
        textInputRef.current?.focus();
        textInputRef.current?.setSelectionRange(nextCursor, nextCursor);
      });
    }
    setSlashRange(null);
  };

  const selectSkill = (skill: AgentSkill) => {
    const key = getSkillKey(skill);
    const alreadySelected = selectedSkills.some((item) => getSkillKey(item) === key);
    if (!alreadySelected && selectedSkills.length >= 2) return;
    if (!alreadySelected) {
      setSelectedSkills((prev) => [...prev, skill].slice(0, 2));
    }
    clearSlashToken();
  };

  const selectRecipe = (recipe: AgentExperienceRecipe) => {
    setSelectedRecipe(recipe);
    clearSlashToken();
  };

  const skillMatchesQuery = (skill: AgentSkill, query: string) => {
    if (!query) return true;
    const haystack = [
      skill.label,
      skill.name,
      skill.description,
      ...(Array.isArray(skill.trigger_actions) ? skill.trigger_actions : []),
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  };

  const recipeMatchesQuery = (recipe: AgentExperienceRecipe, query: string) => {
    if (!query) return true;
    const haystack = [
      recipe.label,
      recipe.title,
      recipe.name,
      recipe.description,
      recipe.tool_name,
      ...(Array.isArray(recipe.tags) ? recipe.tags : []),
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  };

  const filteredSystemSkills = React.useMemo(
    () => availableSkills.system_skills.filter((skill) => skillMatchesQuery(skill, slashRange?.query || '')),
    [availableSkills.system_skills, slashRange]
  );

  const filteredRecipes = React.useMemo(
    () => availableSkills.experience_recipes.filter((recipe) => recipeMatchesQuery(recipe, slashRange?.query || '')),
    [availableSkills.experience_recipes, slashRange]
  );

  const firstSelectableItem = React.useMemo<SlashSelectableItem | null>(() => {
    const skill = filteredSystemSkills.find((candidate) => {
      const selected = selectedSkills.some((item) => getSkillKey(item) === getSkillKey(candidate));
      return selected || selectedSkills.length < 2;
    });
    if (skill) return { kind: 'skill', value: skill };
    const recipe = filteredRecipes.find((candidate) => !selectedRecipe || selectedRecipe.id === candidate.id);
    return recipe ? { kind: 'recipe', value: recipe } : null;
  }, [filteredSystemSkills, filteredRecipes, selectedSkills, selectedRecipe]);

  const renderSkillChip = (skill: AgentSkill, removable = false) => (
    <span
      key={getSkillKey(skill)}
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-orange-300/50 bg-orange-700/70 px-2.5 py-1 text-xs font-semibold text-orange-50 shadow-sm shadow-black/20"
      title={skill.description || getSkillLabel(skill)}
    >
      <Sparkles className="h-3 w-3 shrink-0" />
      <span className="truncate">{getSkillLabel(skill)}</span>
      {removable && (
        <button
          type="button"
          onClick={() => removeSelectedSkill(skill)}
          className="rounded p-0.5 text-orange-100/75 transition hover:bg-white/15 hover:text-white"
          title={isZh ? '移除技能' : 'Remove skill'}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );

  const renderRecipeChip = (recipe: AgentExperienceRecipe, removable = false) => (
    <span
      key={getRecipeKey(recipe)}
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-emerald-300/45 bg-emerald-700/75 px-2.5 py-1 text-xs font-semibold text-emerald-50 shadow-sm shadow-black/20"
      title={recipe.description || getRecipeLabel(recipe)}
    >
      <Save className="h-3 w-3 shrink-0" />
      <span className="truncate">{isZh ? `经验：${getRecipeLabel(recipe)}` : `Recipe: ${getRecipeLabel(recipe)}`}</span>
      {removable && (
        <button
          type="button"
          onClick={removeSelectedRecipe}
          className="rounded p-0.5 text-emerald-100/75 transition hover:bg-white/15 hover:text-white"
          title={isZh ? '移除经验' : 'Remove recipe'}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newImages: UploadedImage[] = [];
    const uploadRole = pendingUploadRoleRef.current || 'reference_image';
    const uploadLimit = pendingUploadMaxFilesRef.current;
    const selectedFiles = uploadLimit > 0 ? Array.from(files).slice(0, uploadLimit) : Array.from(files);

    for (const file of selectedFiles) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const resp = await assetsApi.uploadTempAsset(file);
        const url = String(resp?.data?.url || resp?.data?.path || resp?.url || '').trim();
        if (url) {
          newImages.push({ id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`, url, file, name: file.name, role: uploadRole });
        }
      } catch (err: any) {
        console.error('Upload failed:', err);
      }
    }

    if (newImages.length > 0) {
      const combinedImages = [...uploadedImagesRef.current, ...newImages];
      uploadedImagesRef.current = combinedImages;
      setUploadedImages(combinedImages);
      void analyzeReferenceImages(combinedImages.slice(-3), uploadRole, input);
    }
    setUploading(false);
    pendingUploadRoleRef.current = 'reference_image';
    pendingUploadMaxFilesRef.current = 0;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (id: string) => {
    const nextImages = uploadedImagesRef.current.filter((img) => img.id !== id);
    uploadedImagesRef.current = nextImages;
    setUploadedImages(nextImages);
    if (!referenceAnalysis.imageIds.includes(id)) return;
    referenceAnalysisTokenRef.current += 1;
    referenceAnalysisAbortRef.current?.abort();
    referenceAnalysisAbortRef.current = null;
    if (nextImages.length === 0) {
      setReferenceAnalysis(EMPTY_REFERENCE_ANALYSIS);
      resetNextSuggestion();
      return;
    }
    setReferenceAnalysis({
      status: 'stale',
      prompt: '',
      imageIds: nextImages.slice(-3).map((image) => image.id),
      role: referenceAnalysis.role,
      draft: input,
    });
  };

  const uploadedImagesToAttachments = (images: UploadedImage[]): AgentAttachment[] =>
    images.map((img) => ({
      url: img.url,
      name: img.name || img.file?.name || '',
      media_kind: 'image',
      role: img.role || 'reference_image',
    }));

  const handleSend = async (overrideText?: string, retryTurnId?: string) => {
    const isContextRetry = Boolean(retryTurnId);
    const text = (overrideText || input).trim();
    const attachments = isContextRetry ? [] : uploadedImagesToAttachments(uploadedImages);
    const requestedSkills = selectedSkills.slice(0, 2);
    const requestedRecipes: AgentExperienceRecipe[] = selectedRecipe ? [{
      source: 'experience_recipe',
      recipe_kind: selectedRecipe.recipe_kind,
      id: selectedRecipe.id,
      name: selectedRecipe.name,
      title: selectedRecipe.title,
      label: selectedRecipe.label,
      tool_name: selectedRecipe.tool_name,
    }] : [];
    const requestedHints: AgentRequestedHint[] = [...requestedSkills, ...requestedRecipes];
    if ((!isContextRetry && !text && attachments.length === 0) || loading || (isContextRetry && !activeConversationId)) return;

    resetNextSuggestion();
    resetReferenceAnalysis();
    resetInputHistory();

    if (!isContextRetry && !overrideText) {
      setInput('');
      setSlashRange(null);
    }

    const messageContent = isContextRetry ? '' : (text || (isZh ? '请根据我上传的素材继续创作。' : 'Please continue with the uploaded assets.'));
    const userMsg: AiCreatorMessage = {
      role: 'user',
      content: messageContent,
      attachments,
      metadata: requestedHints.length > 0 ? { requested_hints: requestedHints } : {},
    };
    if (!isContextRetry) {
      setMessages((prev) => [...prev, userMsg]);
      setUploadedImages([]);
    }
    shouldFollowStreamRef.current = true;
    streamBuffersRef.current.clear();
    setStreamStatus(null);
    setLoading(true);
    const controller = new AbortController();
    const requestToken = streamRequestTokenRef.current + 1;
    streamRequestTokenRef.current = requestToken;
    streamAbortRef.current = controller;
    let streamConversationId = activeConversationId || '';

    try {
      const res = await agentRuntimeApi.chatStream(
        {
          message: messageContent,
          conversation_id: activeConversationId || undefined,
          attachments,
          requested_hints: requestedHints,
          retry_turn_id: retryTurnId,
        },
        {
          onConversation: (data) => {
            if (streamRequestTokenRef.current !== requestToken) return;
            const conversationId = data.conversation_id || data.conversation?.id || '';
            if (!conversationId) return;
            streamConversationId = conversationId;
            if (data.conversation?.context_usage) {
              setContextUsage(data.conversation.context_usage);
            }
            if (conversationId !== activeConversationId) {
              ensureConversationInList(conversationId, messageContent);
              setActiveConversationId(conversationId);
              try {
                window.localStorage.setItem(STORAGE_KEY, conversationId);
              } catch {
                // ignore
              }
            }
          },
          onStatus: (status) => {
            if (streamRequestTokenRef.current !== requestToken) return;
            setStreamStatus(status);
            if (status.phase === 'iteration_finished' && status.stream_key) {
              const processKey = status.stream_key.startsWith('resp_')
                ? `planner_response_${status.stream_key}`
                : `planner_process_${status.stream_id}_${status.planner_iteration || 0}`;
              setExpandedProcessGroups((prev) => ({ ...prev, [processKey]: false }));
            }
          },
          onContextUsage: (usage) => {
            if (streamRequestTokenRef.current !== requestToken) return;
            setContextUsage(usage);
          },
          onDelta: (delta) => {
            if (streamRequestTokenRef.current !== requestToken) return;
            queueStreamDelta(delta);
          },
          onDiscard: ({ stream_key: streamKey }) => {
            if (streamRequestTokenRef.current !== requestToken) return;
            streamBuffersRef.current.delete(streamKey);
            setMessages((prev) => prev.filter((message) => message.stream_key !== streamKey));
          },
          onMessage: (message) => {
            if (streamRequestTokenRef.current !== requestToken) return;
            const streamKey = message.stream_key || '';
            if (streamKey) {
              streamBuffersRef.current.delete(streamKey);
            }
            if (isPlannerProcessMessage(message)) {
              const processKey = getPlannerProcessKey(message);
              if (processKey) {
                setExpandedProcessGroups((prev) => ({ ...prev, [processKey]: true }));
              }
            }
            setMessages((prev) => {
              const idIndex = message.id
                ? prev.findIndex((item) => item.id === message.id)
                : -1;
              if (idIndex >= 0) {
                const next = [...prev];
                next[idIndex] = message;
                return next;
              }
              const isAssistantMessage = String(message.metadata?.item_type || '') === 'message';
              const streamIndex = streamKey && isAssistantMessage
                ? prev.findIndex((item) => item.stream_key === streamKey && item.metadata?.is_streaming)
                : -1;
              if (streamIndex >= 0) {
                const next = [...prev];
                next[streamIndex] = message;
                return next;
              }
              return [...prev, message];
            });
          },
          onDone: () => {
            if (streamRequestTokenRef.current !== requestToken) return;
            setStreamStatus(null);
          },
        },
        { signal: controller.signal },
      );

      // Update active conversation if backend created/returned one
      if (res.conversation_id && res.conversation_id !== activeConversationId) {
        ensureConversationInList(res.conversation_id, messageContent);
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

      if (!isContextRetry) {
        setSelectedSkills([]);
        setSelectedRecipe(null);
      }
    } catch (err: any) {
      const wasAborted = controller.signal.aborted || err?.name === 'AbortError';
      if (!wasAborted && streamRequestTokenRef.current === requestToken) {
        openInfo(
          (t as any).ai_creator_title || 'AI Creator',
          formatApiError(err, (t as any).ai_creator_error || 'Something went wrong. Please try again.'),
        );
        streamAbortRef.current = null;
        if (streamConversationId) {
          await loadConversation(streamConversationId, { skipStateRestore: true, silent: true, preserveScroll: true });
        }
      }
    } finally {
      if (streamRequestTokenRef.current === requestToken) {
        streamAbortRef.current = null;
        streamBuffersRef.current.clear();
        setStreamStatus(null);
        setLoading(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (slashRange && e.key === 'Escape') {
      e.preventDefault();
      setSlashRange(null);
      return;
    }
    if (slashRange && e.key === 'Enter') {
      e.preventDefault();
      if (firstSelectableItem) {
        if (firstSelectableItem.kind === 'skill') {
          selectSkill(firstSelectableItem.value);
        } else {
          selectRecipe(firstSelectableItem.value);
        }
      }
      return;
    }
    if (slashRange && ['ArrowUp', 'ArrowDown', 'ArrowRight'].includes(e.key)) return;
    if (e.key === 'ArrowUp') {
      const textareaStyle = window.getComputedStyle(e.currentTarget);
      const singleLineHeight = parseFloat(textareaStyle.lineHeight)
        + parseFloat(textareaStyle.paddingTop)
        + parseFloat(textareaStyle.paddingBottom);
      const hasMultipleVisualLines = e.currentTarget.scrollHeight > singleLineHeight + 1;
      const selectionAtStart = e.currentTarget.selectionStart === 0
        && e.currentTarget.selectionEnd === 0;
      if ((!hasMultipleVisualLines || selectionAtStart) && navigateInputHistory(-1)) {
        e.preventDefault();
        return;
      }
    }
    if (e.key === 'ArrowDown' && inputHistoryIndexRef.current !== null && navigateInputHistory(1)) {
      e.preventDefault();
      return;
    }
    if (
      e.key === 'Tab'
      && !slashRange
      && !input
      && inputHistoryIndexRef.current === null
      && nextSuggestionResult.status === 'ready'
      && canApplyNextSuggestion
    ) {
      e.preventDefault();
      applyNextSuggestion();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const saveToolResultAsRecipe = async (msg: AiCreatorMessage) => {
    const runId = msg.tool_result?.run_id || msg.run_id || '';
    if (!runId) return;
    const toolName = String(msg.tool_result?.tool_name || msg.metadata?.tool_name || 'tool');
    try {
      await agentRuntimeApi.saveExperienceRecipe({
        run_id: runId,
        name: `${getActionLabel(toolName)}经验`,
        description: msg.content ? msg.content.slice(0, 200) : '',
      });
      await loadSkills();
      openInfo(isZh ? '已保存' : 'Saved', isZh ? '已保存为经验配方。' : 'Saved as an experience recipe.');
    } catch (err: any) {
      openInfo(isZh ? '保存失败' : 'Save failed', err?.message || 'Failed to save experience recipe');
    }
  };

  const executeAction = (action: AiCreatorAction) => {
    if (action.type === 'generate_image' && String(action.params?.mode || 'create') === 'edit') {
      openImageEditorForAction(action);
      return;
    }
    if (generatingType) return;
    // Show confirmation dialog before executing
    setConfirmAction(action);
    setConfirmParams(action.params || {});
  };

  const createPendingToolMessage = (action: AiCreatorAction, params: Record<string, unknown>): AiCreatorMessage => {
    const localId = `local_tool_${action.run_id || action.type}_${Date.now()}`;
    const productToolName = canonicalProductImageToolName(action.type);
    const isImageTool = action.type === 'generate_image' || Boolean(productToolName);
    const isVideoTool = action.type === 'generate_video';
    let pendingImageAssets: Array<Record<string, unknown>> = [];
    if (productToolName === 'generate_product_gallery') {
      let sortOrder = 0;
      pendingImageAssets = normalizeGalleryOutputItems(params.output_items)
        .filter((item) => item.enabled)
        .flatMap((item) => Array.from({ length: item.count }, () => {
          const index = sortOrder;
          sortOrder += 1;
          return {
            type: 'pending_image',
            media_kind: 'image',
            role: item.output_type,
            output_type: item.output_type,
            aspect_ratio: item.aspect_ratio,
            resolution: item.resolution,
            request_id: `${localId}_${index}`,
            status: 'running',
            sort_order: index,
          };
        }));
    } else if (productToolName === 'edit_product_poster') {
      const sourceImage = readAgentAssetRef(params.source_image);
      pendingImageAssets = [
        ...(sourceImage?.url ? [{
          type: 'image',
          media_kind: 'image',
          role: 'poster_original',
          url: sourceImage.url,
          name: sourceImage.name || '',
          asset_id: sourceImage.asset_id || '',
          request_id: `${localId}_original`,
          status: 'succeeded',
          sort_order: 0,
        }] : []),
        {
          type: 'pending_image',
          media_kind: 'image',
          role: 'poster_clean',
          request_id: `${localId}_clean`,
          status: 'running',
          sort_order: sourceImage?.url ? 1 : 0,
        },
      ];
    } else if (isImageTool) {
      const imageCount = productToolName
        ? Math.max(1, Math.min(4, Number(params.output_count || (productToolName === 'generate_first_frame' ? 4 : 1))))
        : 1;
      const imageRole = productToolName === 'generate_first_frame'
        ? 'first_frame'
        : productToolName === 'generate_clothing_swap'
          ? 'clothing_swap'
          : productToolName === 'generate_ai_model'
            ? (String(params.mode || 'virtual') === 'real' ? 'real_person' : 'ai_model')
            : String(params.mode || '') === 'edit'
              ? 'edited_image'
              : 'generated_image';
      pendingImageAssets = Array.from({ length: imageCount }, (_, index) => ({
        type: 'pending_image',
        media_kind: 'image',
        role: imageRole,
        request_id: `${localId}_${index}`,
        status: 'running',
        sort_order: index,
      }));
    }
    const pendingAsset = isImageTool
      ? pendingImageAssets
      : isVideoTool
        ? [{
            type: 'pending_video',
            media_kind: 'video',
            role: 'generated_video',
            request_id: localId,
            status: 'running',
          }]
      : [];
    return {
      id: localId,
      role: 'tool',
      content: productToolName === 'edit_product_poster'
        ? (isZh ? '正在分离海报文字…' : 'Separating poster text...')
        : isImageTool
          ? (isZh ? '正在生成图片…' : 'Generating image...')
        : action.type === 'generate_video'
          ? (isZh ? '正在生成视频…' : 'Generating video...')
        : (isZh ? '正在执行…' : 'Running...'),
      attachments: [],
      action: { ...action, params },
      run_id: action.run_id || null,
      metadata: {
        local_pending: true,
        tool_name: action.type,
        params,
      },
      tool_result: {
        run_id: action.run_id || localId,
        step_id: 0,
        tool_name: action.type,
        status: 'running',
        display_type: productToolName || (action.type === 'generate_image' ? 'image' : action.type === 'generate_video' ? 'video' : action.type),
        assets: pendingAsset,
        task_ids: [],
        project_id: '',
      },
    };
  };

  const markPendingToolMessageFailed = (id: string, message: string) => {
    setMessages((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      return {
        ...item,
        content: message,
        tool_result: item.tool_result
          ? {
              ...item.tool_result,
              status: 'failed',
              assets: [],
              error_message: message,
            }
          : item.tool_result,
        metadata: {
          ...(item.metadata || {}),
          local_pending: false,
          error_message: message,
        },
      };
    }));
  };

  const runGeneration = async (action: AiCreatorAction, params: Record<string, unknown>) => {
    const type = action.type;
    resetNextSuggestion();
    setGeneratingType(type);
    const pendingMessage = createPendingToolMessage(action, params);
    setMessages((prev) => [...prev, pendingMessage]);

    try {
      if (!action.run_id) {
        throw new Error(isZh ? '该动作没有可执行的 Agent Run，请重新发送需求。' : 'This action has no executable Agent run. Please send the request again.');
      }
      const run = await agentRuntimeApi.confirmRun(action.run_id, params);
      await loadConversation(run.conversation_id || activeConversationId || '', { skipStateRestore: true, silent: true });
    } catch (err: any) {
      const message = err?.message || (t as any).ai_creator_error || 'Generation failed. Please try again.';
      markPendingToolMessageFailed(pendingMessage.id || '', message);
      openInfo(
        (t as any).ai_creator_title || 'AI Creator',
        message
      );
    } finally {
      setGeneratingType(null);
    }
  };

  const handleProductRunUpdated = (
    runId: string,
    params: Record<string, unknown>,
    readiness?: AgentRunReadiness | null,
  ) => {
    setMessages((previous) => previous.map((message) => {
      if (message.action?.run_id !== runId) return message;
      return {
        ...message,
        action: { ...message.action, params },
        metadata: { ...(message.metadata || {}), run_readiness: readiness || null },
      };
    }));
  };

  const runProductImageGeneration = (action: AiCreatorAction, params: Record<string, unknown>) => {
    const runId = String(action.run_id || '').trim();
    if (!runId || productSubmittingRunIdsRef.current.has(runId)) return;
    resetNextSuggestion();
    productSubmittingRunIdsRef.current.add(runId);
    setProductSubmittingRunIds(new Set(productSubmittingRunIdsRef.current));
    const pendingMessage = createPendingToolMessage(action, params);
    const targetConversationId = activeConversationIdRef.current || '';
    setMessages((previous) => [...previous, pendingMessage]);

    void agentRuntimeApi.confirmRun(runId, params)
      .then(async (run) => {
        if (run.conversation_id && run.conversation_id === activeConversationIdRef.current) {
          await loadConversation(run.conversation_id, { skipStateRestore: true, silent: true, preserveScroll: true });
        }
        await loadConversations();
      })
      .catch((error) => {
        const message = formatApiError(error, t.ai_creator_error || 'Generation failed. Please try again.');
        if (!targetConversationId || targetConversationId === activeConversationIdRef.current) {
          markPendingToolMessageFailed(pendingMessage.id || '', message);
        }
      })
      .finally(() => {
        productSubmittingRunIdsRef.current.delete(runId);
        setProductSubmittingRunIds(new Set(productSubmittingRunIdsRef.current));
      });
  };

  const submitConfirmedAction = async () => {
    if (!confirmAction) return;
    setConfirmAction(null);
    setConfirmParams({});
    await runGeneration(confirmAction, confirmParams);
  };

  const executeActionDirectly = async (action: AiCreatorAction) => {
    if (action.type === 'generate_image' && String(action.params?.mode || 'create') === 'edit') {
      openImageEditorForAction(action);
      return;
    }
    if (isProductImageAction(action)) {
      runProductImageGeneration(action, action.params || {});
      return;
    }
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

    const target = messages[editingIdx];
    if (activeConversationId && target?.id) {
      try {
        await agentRuntimeApi.truncateMessages(activeConversationId, target.id);
      } catch (err: any) {
        openInfo(isZh ? '编辑失败' : 'Edit failed', err?.message || 'Failed to update conversation history');
        return;
      }
    }

    // Truncate messages after editingIdx (remove original user msg + assistant reply + everything after)
    const truncated = messages.slice(0, editingIdx);
    setMessages(truncated);
    setEditingIdx(null);

    // Re-send edited message
    await handleSend(editText.trim());
  };

  const deleteFrom = async (idx: number) => {
    const target = messages[idx];
    if (activeConversationId && target?.id) {
      try {
        await agentRuntimeApi.truncateMessages(activeConversationId, target.id);
      } catch (err: any) {
        openInfo(isZh ? '删除失败' : 'Delete failed', err?.message || 'Failed to update conversation history');
        return;
      }
    }
    // Delete this message and everything after it
    resetNextSuggestion();
    resetInputHistory();
    setMessages((prev) => prev.slice(0, idx));
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

  const getPreviewUrl = (item: any) => {
    const url = readAssetUrl(item);
    if (!url) return '';
    if (/^(https?:)?\/\//i.test(url) || /^(blob|data):/i.test(url) || url.startsWith('/')) return url;
    return `/${url}`;
  };

  const getPreviewMediaKind = (item: any) => {
    const rawKind = String(item?.media_kind || item?.mediaKind || item?.type || '').trim().toLowerCase();
    if (rawKind === 'pending_image') return 'image';
    if (rawKind === 'pending_video') return 'video';
    if (rawKind) return rawKind;
    const url = getPreviewUrl(item);
    if (/\.(png|jpe?g|webp|gif|bmp|avif|svg)(\?.*)?$/i.test(url)) return 'image';
    if (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url)) return 'video';
    return 'document';
  };

  const normalizePreviewAttachment = (item: any): AgentAttachment | null => {
    const url = getPreviewUrl(item);
    if (!url) return null;
    return {
      ...item,
      url,
      name: String(item?.name || item?.filename || '').trim(),
      media_kind: getPreviewMediaKind(item),
      role: String(item?.role || '').trim(),
    };
  };

  const getToolName = (msg: AiCreatorMessage) =>
    String(msg.tool_result?.tool_name || msg.metadata?.tool_name || 'tool');

  const getToolRawPreviewItems = (msg: AiCreatorMessage) => {
    const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
    const toolAssets = Array.isArray(msg.tool_result?.assets) ? msg.tool_result.assets : [];
    return [...attachments, ...toolAssets];
  };

  const getProductToolAssets = (msg: AiCreatorMessage): Array<Record<string, unknown>> => {
    const primary: unknown[] = Array.isArray(msg.tool_result?.assets) && msg.tool_result.assets.length > 0
      ? msg.tool_result.assets
      : Array.isArray(msg.attachments) ? msg.attachments : [];
    return primary
      .filter((asset): asset is Record<string, unknown> => Boolean(asset && typeof asset === 'object'))
      .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
  };

  const getToolVisualState = (msg: AiCreatorMessage): 'running' | 'failed' | 'succeeded' => {
    const status = String(msg.tool_result?.status || 'succeeded').trim().toLowerCase();
    const rawPreviewItems = getToolRawPreviewItems(msg);
    const productToolName = canonicalProductImageToolName(getToolName(msg));
    if (productToolName) {
      const productAssets = getProductToolAssets(msg);
      if (['pending', 'running'].includes(status) || productAssets.some(isPendingToolAsset)) return 'running';
      if (productAssets.some((asset) => Boolean(readAssetUrl(asset)))) return 'succeeded';
      if (status === 'failed' || productAssets.some(isFailedToolAsset)) return 'failed';
    }
    if (status === 'failed' || rawPreviewItems.some(isFailedToolAsset)) return 'failed';
    if (['pending', 'running'].includes(status) || rawPreviewItems.some(isPendingToolAsset)) return 'running';
    return 'succeeded';
  };

  const findProductActionForRun = (runId: string): AiCreatorAction | null => {
    const message = [...messages].reverse().find((item) => item.action?.run_id === runId && isProductImageAction(item.action));
    return message?.action || null;
  };

  const retryProductToolResult = (msg: AiCreatorMessage) => {
    const runId = String(msg.tool_result?.run_id || msg.run_id || '').trim();
    const action = findProductActionForRun(runId);
    const toolName = canonicalProductImageToolName(getToolName(msg));
    if (!runId || !action || !toolName) return;
    const failedAssets = getProductToolAssets(msg).filter(isFailedToolAsset);
    const failedCount = Math.max(1, failedAssets.length);
    let params: Record<string, unknown> = { ...(action.params || {}) };
    if (toolName === 'generate_product_gallery') {
      const grouped = new Map<string, { output_type: string; enabled: boolean; count: number; aspect_ratio: string; resolution: string }>();
      failedAssets.forEach((asset) => {
        const outputType = String(asset.output_type || asset.role || 'white_bg');
        const current = grouped.get(outputType);
        if (current) {
          current.count += 1;
        } else {
          grouped.set(outputType, {
            output_type: outputType,
            enabled: true,
            count: 1,
            aspect_ratio: String(asset.aspect_ratio || '1:1'),
            resolution: String(asset.resolution || '1k'),
          });
        }
      });
      if (grouped.size > 0) params = { ...params, output_items: Array.from(grouped.values()) };
    } else if (toolName !== 'generate_clothing_swap' && toolName !== 'edit_product_poster') {
      params = { ...params, output_count: failedCount };
    }
    runProductImageGeneration({ ...action, type: toolName, params }, params);
  };

  const getToolImageAttachments = (msg: AiCreatorMessage) => {
    const imageByUrl = new Map<string, AgentAttachment>();
    getToolRawPreviewItems(msg)
      .map(normalizePreviewAttachment)
      .filter((attachment): attachment is AgentAttachment => Boolean(attachment))
      .forEach((attachment) => {
        if (getPreviewMediaKind(attachment) === 'image' && attachment.url) {
          imageByUrl.set(attachment.url, attachment);
        }
      });
    return Array.from(imageByUrl.values());
  };

  const getToolVideoAttachments = (msg: AiCreatorMessage) => {
    const videoByUrl = new Map<string, AgentAttachment>();
    getToolRawPreviewItems(msg)
      .map(normalizePreviewAttachment)
      .filter((attachment): attachment is AgentAttachment => Boolean(attachment))
      .forEach((attachment) => {
        if (getPreviewMediaKind(attachment) === 'video' && attachment.url) {
          videoByUrl.set(attachment.url, attachment);
        }
      });
    return Array.from(videoByUrl.values());
  };

  const readScriptText = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
    if (Array.isArray(value)) return value.map(readScriptText).filter(Boolean).join(' / ');
    if (typeof value === 'object') {
      return ['text', 'content', 'description', 'value', 'line']
        .map((key) => readScriptText(value[key]))
        .find(Boolean) || '';
    }
    return '';
  };

  const renderScriptToolResult = (msg: AiCreatorMessage): React.ReactNode => {
    const data = msg.tool_result?.data || {};
    const primary = Array.isArray(data.script_contents) ? data.script_contents[0] : null;
    const scriptContent = primary?.script_content || {};
    const shots: any[] = Array.isArray(scriptContent?.shots) ? scriptContent.shots : [];
    const duration = scriptContent?.duration || '';
    const title = scriptContent?.video_master_script || scriptContent?.title || scriptContent?.input || scriptContent?.custom || '';
    const summary = scriptContent?.creative_card_text || scriptContent?.video_description || title || '';

    if (shots.length === 0) {
      const compact = summary || JSON.stringify(data, null, 2);
      if (!compact || compact === '{}') return null;
      return (
        <div className="border-t border-white/10 px-5 py-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">{isZh ? '脚本内容' : 'Script'}</div>
          <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/25 p-3 text-xs leading-relaxed text-zinc-300">
            {compact.length > 1600 ? `${compact.slice(0, 1600)}...` : compact}
          </div>
        </div>
      );
    }

    return (
      <div className="border-t border-white/10 px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">{isZh ? '脚本内容' : 'Script'}</div>
            {title && <div className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-100">{readScriptText(title)}</div>}
          </div>
          <div className="shrink-0 rounded-md bg-white/5 px-2 py-1 text-[11px] font-semibold text-zinc-400">
            {duration ? `${duration}s · ` : ''}{shots.length} {isZh ? '镜头' : 'shots'}
          </div>
        </div>
        {summary && summary !== title && (
          <div className="mb-3 line-clamp-3 rounded-lg bg-black/20 px-3 py-2 text-xs leading-relaxed text-zinc-400">
            {readScriptText(summary)}
          </div>
        )}
        <div className="space-y-2">
          {shots.slice(0, 8).map((shot, idx) => {
            const start = shot?.start_sec ?? shot?.start ?? '';
            const end = shot?.end_sec ?? shot?.end ?? '';
            const time = start !== '' || end !== '' ? `${start || 0}s-${end || ''}s` : '';
            const beat = readScriptText(shot?.beat || shot?.title || shot?.action);
            const visual = readScriptText(shot?.visual || shot?.visual_description || shot?.scene || shot?.picture);
            const voiceover = readScriptText(shot?.voiceover || shot?.audio || shot?.narration || shot?.line);
            return (
              <div key={`${idx}_${time}_${beat}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs">
                  <span className="rounded bg-orange-500/15 px-2 py-0.5 font-bold text-orange-200">#{shot?.shot_index || idx + 1}</span>
                  {time && <span className="text-zinc-500">{time}</span>}
                  {beat && <span className="min-w-0 truncate font-semibold text-zinc-300">{beat}</span>}
                </div>
                {visual && <div className="mb-1 text-xs leading-relaxed text-zinc-400"><span className="text-zinc-500">{isZh ? '画面：' : 'Visual: '}</span>{visual}</div>}
                {voiceover && <div className="text-xs leading-relaxed text-zinc-300"><span className="text-zinc-500">{isZh ? '旁白：' : 'Voiceover: '}</span>{voiceover}</div>}
              </div>
            );
          })}
          {shots.length > 8 && (
            <div className="text-center text-xs text-zinc-500">
              {isZh ? `还有 ${shots.length - 8} 个镜头未展开` : `${shots.length - 8} more shots`}
            </div>
          )}
        </div>
      </div>
    );
  };

  const isImageToolMessage = (msg: AiCreatorMessage) => {
    if (msg.role !== 'tool' && !(msg.role === 'developer' && msg.tool_result)) return false;
    const toolName = getToolName(msg);
    const displayType = String(msg.tool_result?.display_type || '').trim().toLowerCase();
    if (toolName === 'generate_image' || PRODUCT_IMAGE_TOOL_NAMES.has(toolName)) return true;
    if (displayType === 'image' || displayType === 'first_frame') return true;
    return getToolRawPreviewItems(msg).some((item) => getPreviewMediaKind(item) === 'image');
  };

  const getMessageIdentity = (msg: AiCreatorMessage, index: number) =>
    String(msg.id || msg.stream_key || `${msg.role}_${index}_${msg.run_id || ''}_${msg.created_at || ''}`);

  const getPreviewFileName = (attachment: AgentAttachment | null) => {
    const explicitName = String(attachment?.name || '').trim();
    if (explicitName) return explicitName;
    const urlPath = String(attachment?.url || '').split('?')[0].split('#')[0];
    const fromUrl = decodeURIComponent(urlPath.split('/').filter(Boolean).pop() || '').trim();
    if (fromUrl && /\.[a-z0-9]{2,5}$/i.test(fromUrl)) return fromUrl;
    return `ai-creator-image-${Date.now()}.png`;
  };

  const extensionFromMime = (mime: string) => {
    const lower = mime.toLowerCase();
    if (lower.includes('jpeg')) return 'jpg';
    if (lower.includes('png')) return 'png';
    if (lower.includes('webp')) return 'webp';
    if (lower.includes('gif')) return 'gif';
    return 'png';
  };

  const savePreviewImageToLibrary = async () => {
    if (!previewImage?.url || savingPreviewAsset) return;
    setSavingPreviewAsset(true);
    try {
      const response = await fetch(previewImage.url, { credentials: 'include' });
      if (!response.ok) throw new Error(isZh ? '图片下载失败，无法加入素材库。' : 'Failed to fetch image for library upload.');
      const blob = await response.blob();
      const mime = blob.type || 'image/png';
      let fileName = getPreviewFileName(previewImage);
      if (!/\.[a-z0-9]{2,5}$/i.test(fileName)) {
        fileName = `${fileName}.${extensionFromMime(mime)}`;
      }
      const file = new File([blob], fileName, { type: mime });
      await assetsApi.uploadAsset(file, 'product');
      setPreviewImage(null);
      setPreviewImageSource(null);
      openInfo(isZh ? '已添加' : 'Added', isZh ? '图片已添加到素材库。' : 'Image added to the asset library.');
    } catch (err: any) {
      openInfo(isZh ? '添加失败' : 'Add failed', err?.message || (isZh ? '无法添加到素材库。' : 'Failed to add image to the asset library.'));
    } finally {
      setSavingPreviewAsset(false);
    }
  };

  const renderToolMessage = (msg: AiCreatorMessage, options?: { embedded?: boolean }) => {
    const toolResult = msg.tool_result || null;
    const toolName = getToolName(msg);
    const productToolName = canonicalProductImageToolName(toolName);
    if (productToolName) {
      const runId = String(toolResult?.run_id || msg.run_id || '');
      return (
        <AgentProductImageResultCard
          message={msg}
          language={language}
          embedded={options?.embedded}
          submitting={Boolean(runId && productSubmittingRunIds.has(runId))}
          editLabel={imageEditingCopy.edit}
          loadFailedLabel={imageEditingCopy.resultLoadFailed}
          retryLoadLabel={imageEditingCopy.retry}
          openOriginalLabel={imageEditingCopy.openOriginal}
          onOpen={(attachment, source) => {
            setPreviewImage(attachment);
            setPreviewImageSource(source);
          }}
          onEdit={openImageEditorForSource}
          onRetry={() => retryProductToolResult(msg)}
          onSaveRecipe={() => void saveToolResultAsRecipe(msg)}
          onOpenPosterEditor={setPosterEditorData}
          onError={openInfo}
        />
      );
    }
    const visualState = getToolVisualState(msg);
    const isRunning = visualState === 'running';
    const isFailed = visualState === 'failed';
    const imageAttachments = getToolImageAttachments(msg);
    const videoAttachments = getToolVideoAttachments(msg);
    const hasPreviewAssets = imageAttachments.length > 0 || videoAttachments.length > 0;
    const hasScriptResult = toolName === 'generate_script' && !isRunning && !isFailed;
    const hasWorkflowRun = Boolean(toolResult?.run_id || msg.run_id);
    const statusLabel = isFailed
      ? (isZh ? '失败' : 'Failed')
      : isRunning
        ? (isZh ? '生成中' : 'Generating')
        : (isZh ? '已完成' : 'Done');
    const statusClass = isFailed
      ? 'bg-red-500/15 text-red-200 ring-1 ring-red-500/20'
      : isRunning
        ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
        : 'bg-emerald-500/10 text-emerald-300';
    const cardClass = isFailed
      ? 'border-red-500/25 bg-red-950/30 text-red-100'
      : isRunning
        ? 'border-amber-500/20 bg-zinc-900 text-zinc-300'
        : 'border-white/10 bg-zinc-900 text-zinc-300';
    const showContent = Boolean(msg.content) && (isFailed || isRunning);

    const card = (
      <div className={`w-full ${hasScriptResult ? 'max-w-[560px]' : 'max-w-[360px]'} overflow-hidden rounded-2xl border text-sm ${cardClass}`}>
          <div className="flex items-center gap-2 bg-zinc-950/60 px-5 py-3">
            {ACTION_ICONS[toolName] || <Wand2 className="w-4 h-4" />}
            <span className="font-semibold text-zinc-200">{getActionLabel(toolName)}</span>
            <span className={`ml-1 rounded-md px-2 py-0.5 text-[11px] ${statusClass}`}>
              {statusLabel}
            </span>
            {hasWorkflowRun && !isFailed && !isRunning && (
              <button
                onClick={() => saveToolResultAsRecipe(msg)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-700"
              >
                <Save className="h-3.5 w-3.5" />
                {isZh ? '保存为经验配方' : 'Save recipe'}
              </button>
            )}
          </div>
          {showContent && (
            <div className={`px-5 py-3 text-xs ${isFailed ? 'text-red-300' : 'text-zinc-400'}`}>
              {toolResult?.error_message || msg.content}
            </div>
          )}
          {isRunning && !hasPreviewAssets && (
            <div className="flex aspect-[4/3] items-center justify-center border-t border-white/10 bg-black/30">
              <div className="flex flex-col items-center gap-3 text-amber-400">
                <Loader2 className="h-7 w-7 animate-spin" />
                <span className="text-xs">
                  {toolName === 'generate_video'
                    ? (isZh ? '视频生成中…' : 'Generating video...')
                    : toolName === 'generate_script'
                      ? (isZh ? '脚本生成中…' : 'Generating script...')
                      : (isZh ? '图片生成中…' : 'Generating image...')}
                </span>
              </div>
            </div>
          )}
          {hasScriptResult && renderScriptToolResult(msg)}
          {videoAttachments.length > 0 && (
            <div>
              {videoAttachments.map((attachment, idx) => (
                <div
                  key={`${attachment.url}_${idx}`}
                  className="border-t border-white/10 bg-black first:border-t-0"
                  title={attachment.name || attachment.role || attachment.url}
                >
                  <video
                    src={attachment.url}
                    controls
                    playsInline
                    className="block aspect-[9/16] max-h-[560px] w-full bg-black object-contain"
                  />
                </div>
              ))}
            </div>
          )}
          {imageAttachments.length > 0 && (
            <div>
              {imageAttachments.map((attachment, idx) => {
                const source = getMessageEditableImageSources(msg).find((item) => item.url === attachment.url) || null;
                return (
                  <div key={`${attachment.url}_${idx}`} className="group relative border-t border-white/10 bg-black first:border-t-0">
                    <AgentImagePreview
                      src={attachment.url}
                      alt={attachment.name || 'tool result'}
                      imageClassName="block h-auto w-full"
                      fallbackClassName="aspect-[4/3] w-full"
                      loadFailedLabel={imageEditingCopy.resultLoadFailed}
                      retryLabel={imageEditingCopy.retry}
                      openOriginalLabel={imageEditingCopy.openOriginal}
                      onOpen={() => { setPreviewImage(attachment); setPreviewImageSource(source); }}
                    />
                    {source && (
                      <AgentImageEditButton
                        label={imageEditingCopy.edit}
                        onClick={() => openImageEditorForSource(source)}
                        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-md border border-white/15 bg-black/75 text-white opacity-100 shadow-lg backdrop-blur transition hover:bg-blue-600 sm:opacity-0 sm:group-hover:opacity-100"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
      </div>
    );

    if (options?.embedded) return card;
    return (
      <div className="flex justify-start">
        {card}
      </div>
    );
  };

  const renderEventMessage = (msg: AiCreatorMessage) => (
    <div className="flex justify-center">
      <div className="inline-flex max-w-[80%] items-center gap-2 rounded-lg border border-orange-400/40 bg-orange-950/80 px-3.5 py-2 text-xs font-semibold text-orange-100 shadow-sm shadow-black/20">
        <Sparkles className="h-3.5 w-3.5" />
        <span className="truncate">{msg.content}</span>
      </div>
    </div>
  );

  const getMessageRequestedSkills = (msg: AiCreatorMessage): AgentSkill[] => {
    const raw = Array.isArray(msg.metadata?.requested_hints)
      ? msg.metadata?.requested_hints
      : msg.metadata?.requested_skills;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is AgentSkill => item && typeof item === 'object' && item.source === 'system' && typeof item.name === 'string')
      .slice(0, 2);
  };

  const getMessageRequestedRecipes = (msg: AiCreatorMessage): AgentExperienceRecipe[] => {
    const raw = Array.isArray(msg.metadata?.requested_hints)
      ? msg.metadata?.requested_hints
      : msg.metadata?.requested_recipes;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is AgentExperienceRecipe => item && typeof item === 'object' && item.source === 'experience_recipe' && typeof item.id === 'string')
      .slice(0, 1);
  };

  const chatRenderItems = React.useMemo<ChatRenderItem[]>(() => {
    const items: ChatRenderItem[] = [];
    const activeJobs = imageEditQueueJobs
      .filter((job) => job.conversationId === activeConversationId)
      .sort((a, b) => a.createdAt - b.createdAt);
    const jobsByRunId = new Map(
      activeJobs.flatMap((job) => (job.runId ? [[job.runId, job] as const] : [])),
    );
    const placedJobIds = new Set<string>();
    const latestMessageIndexByJobId = new Map<string, number>();
    messages.forEach((message, index) => {
      if (message.role !== 'tool' && !(message.role === 'developer' && message.tool_result)) return;
      getMessageRunIds(message).forEach((runId) => {
        const job = jobsByRunId.get(runId);
        if (job) latestMessageIndexByJobId.set(job.clientSubmissionId, index);
      });
    });
    let imageGroup: ImageToolGroupEntry[] = [];
    const processGroups = new Map<string, PlannerProcessEntry[]>();
    const processAssistantContent = new Map<string, string>();
    messages.forEach((message, index) => {
      if (!isPlannerProcessMessage(message)) return;
      const processKey = getPlannerProcessKey(message);
      if (!processKey) return;
      const entries = processGroups.get(processKey) || [];
      entries.push({ message, index, key: getMessageIdentity(message, index) });
      processGroups.set(processKey, entries);
      if (message.metadata?.message_type === 'planner_trace_assistant' && message.content.trim()) {
        processAssistantContent.set(processKey, message.content.trim());
      }
    });
    const emittedProcessGroups = new Set<string>();
    const latestRunStateByRun = new Map<string, AiCreatorMessage>();
    const firstVisibleRunStateIndex = new Map<string, number>();
    messages.forEach((message, index) => {
      if (message.metadata?.item_type !== 'run_state' || !message.run_id) return;
      latestRunStateByRun.set(message.run_id, message);
      if (message.metadata?.run_state !== 'confirmed' && !firstVisibleRunStateIndex.has(message.run_id)) {
        firstVisibleRunStateIndex.set(message.run_id, index);
      }
    });

    const flushImageGroup = () => {
      if (imageGroup.length === 1) {
        const entry = imageGroup[0];
        items.push({ type: 'message', key: entry.key, message: entry.message, index: entry.index });
      } else if (imageGroup.length > 1) {
        const first = imageGroup[0];
        const last = imageGroup[imageGroup.length - 1];
        items.push({
          type: 'image_group',
          key: `image_group_${first.key}_${last.key}_${imageGroup.length}`,
          entries: imageGroup,
        });
      }
      imageGroup = [];
    };

    messages.forEach((rawMessage, index) => {
      let message = rawMessage;
      if (message.metadata?.item_type === 'context_state') return;
      if (message.metadata?.item_type === 'run_state' && message.run_id) {
        if (message.metadata?.run_state === 'confirmed') return;
        if (firstVisibleRunStateIndex.get(message.run_id) !== index) return;
        message = latestRunStateByRun.get(message.run_id) || message;
      }
      const key = getMessageIdentity(message, index);
      const matchingJob = (message.role === 'tool' || (message.role === 'developer' && message.tool_result))
        ? getMessageRunIds(message).map((runId) => jobsByRunId.get(runId)).find(Boolean)
        : undefined;
      if (matchingJob) {
        if (latestMessageIndexByJobId.get(matchingJob.clientSubmissionId) !== index) return;
        flushImageGroup();
        placedJobIds.add(matchingJob.clientSubmissionId);
        items.push({
          type: 'image_edit_job',
          key: `image_edit_job_${matchingJob.clientSubmissionId}`,
          job: matchingJob,
        });
        return;
      }
      const processKey = isPlannerProcessMessage(message) ? getPlannerProcessKey(message) : '';
      if (processKey) {
        flushImageGroup();
        if (message.metadata?.message_type === 'planner_trace_assistant' && message.content.trim()) {
          items.push({ type: 'message', key: `${key}_content`, message, index });
        }
        if (!emittedProcessGroups.has(processKey)) {
          emittedProcessGroups.add(processKey);
          items.push({ type: 'process_group', key: processKey, entries: processGroups.get(processKey) || [] });
        }
        if (message.action && message.action.type !== 'chat') {
          items.push({
            type: 'message',
            key: `${key}_action`,
            message: { ...message, role: 'assistant', content: '' },
            index,
          });
        }
        return;
      }
      if (isImageToolMessage(message)) {
        imageGroup.push({ message, index, key });
        return;
      }
      flushImageGroup();
      const messageProcessKey = getPlannerProcessKey(message);
      const duplicateActionContent = message.metadata?.message_type === 'planner_action'
        && message.content.trim()
        && processAssistantContent.get(messageProcessKey) === message.content.trim();
      items.push({
        type: 'message',
        key,
        message: duplicateActionContent ? { ...message, content: '' } : message,
        index,
      });
    });
    flushImageGroup();
    activeJobs.forEach((job) => {
      if (placedJobIds.has(job.clientSubmissionId)) return;
      items.push({
        type: 'image_edit_job',
        key: `image_edit_job_${job.clientSubmissionId}`,
        job,
      });
    });
    return items;
  }, [activeConversationId, imageEditQueueJobs, messages]);

  const renderImageToolGroup = (item: Extract<ChatRenderItem, { type: 'image_group' }>) => {
    const savedKey = selectedImageGroupItems[item.key];
    const fallbackEntry = [...item.entries].reverse().find((entry) => getToolVisualState(entry.message) === 'running') || item.entries[item.entries.length - 1];
    const selectedEntry = item.entries.find((entry) => entry.key === savedKey) || fallbackEntry;

    return (
      <div className="flex justify-start">
        <div className="flex max-w-[452px] items-start gap-3">
          <div className="min-w-0 flex-1">
            {renderToolMessage(selectedEntry.message, { embedded: true })}
          </div>
          <div className="flex w-16 shrink-0 flex-col gap-2">
            {item.entries.map((entry, idx) => {
              const visualState = getToolVisualState(entry.message);
              const image = getToolImageAttachments(entry.message)[0] || null;
              const isSelected = entry.key === selectedEntry.key;
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setSelectedImageGroupItems((prev) => ({ ...prev, [item.key]: entry.key }))}
                  className={`relative flex aspect-square w-16 items-center justify-center overflow-hidden rounded-lg border bg-zinc-950 transition ${
                    isSelected
                      ? 'border-orange-400 ring-2 ring-orange-500/40'
                      : 'border-white/10 hover:border-orange-500/40'
                  }`}
                  title={`${getActionLabel(getToolName(entry.message))} ${idx + 1}`}
                >
                  {image?.url ? (
                    <AgentImagePreview
                      src={image.url}
                      alt={image.name || 'generated'}
                      imageClassName="h-full w-full object-cover"
                      fallbackClassName="h-full w-full"
                      loadFailedLabel={imageEditingCopy.resultLoadFailed}
                      retryLabel={imageEditingCopy.retry}
                      openOriginalLabel={imageEditingCopy.openOriginal}
                      compact
                    />
                  ) : visualState === 'running' ? (
                    <div className="flex h-full w-full items-center justify-center bg-amber-950/40 text-amber-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : visualState === 'failed' ? (
                    <div className="flex h-full w-full items-center justify-center bg-red-950/60 text-red-300">
                      <X className="h-4 w-4" />
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-zinc-500">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const readPlannerToolResult = (message: AiCreatorMessage): Record<string, any> => {
    try {
      const parsed = JSON.parse(message.content || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  const plannerToolLabel = (toolName: string) => {
    if (toolName === 'search_recipes') return isZh ? '检索经验' : 'Search recipes';
    if (toolName === 'retrieve_recipes') return isZh ? '读取经验' : 'Read recipes';
    if (toolName === 'load_system_skill') return isZh ? '加载技能' : 'Load skill';
    if (PLANNER_GENERATION_TOOL_NAMES.has(toolName)) {
      return isZh ? `准备${getActionLabel(toolName)}` : `Prepare ${getActionLabel(toolName)}`;
    }
    return toolName || (isZh ? '工具调用' : 'Tool call');
  };

  const renderPlannerProcessGroup = (item: Extract<ChatRenderItem, { type: 'process_group' }>) => {
    const assistant = item.entries.find((entry) => entry.message.metadata?.message_type === 'planner_trace_assistant')?.message;
    const functionEntries = item.entries.filter((entry) => entry.message.metadata?.item_type === 'function_call');
    const toolEntries = item.entries.filter((entry) => (
      entry.message.metadata?.message_type === 'planner_trace_tool'
      || entry.message.metadata?.item_type === 'function_call_output'
    ));
    const legacyToolCalls = Array.isArray(assistant?.metadata?.tool_calls) ? assistant!.metadata!.tool_calls : [];
    const toolCalls = functionEntries.length > 0
      ? functionEntries.map((entry) => {
          const apiItem = entry.message.metadata?.api_item || {};
          return {
            id: apiItem.call_id || entry.message.metadata?.call_id,
            function: { name: apiItem.name || entry.message.metadata?.tool_name, arguments: apiItem.arguments || '{}' },
          };
        })
      : legacyToolCalls;
    const toolNames = toolCalls.map((call: any) => String(call?.function?.name || '')).filter(Boolean);
    const labels = toolNames.map((toolName: string) => {
      if (toolName !== 'retrieve_recipes') return plannerToolLabel(toolName);
      const resultEntry = toolEntries.find((entry) => entry.message.metadata?.tool_call_id === toolCalls.find((call: any) => call?.function?.name === toolName)?.id);
      const count = Number(resultEntry ? readPlannerToolResult(resultEntry.message).count : 0);
      return count > 0 ? `${plannerToolLabel(toolName)} ${count} ${isZh ? '条' : ''}`.trim() : plannerToolLabel(toolName);
    });
    const hasCheckpoint = item.entries.some((entry) => entry.message.metadata?.item_type === 'checkpoint');
    const hasInterrupted = item.entries.some((entry) => entry.message.metadata?.item_type === 'response_interrupted');
    const hasReasoning = item.entries.some((entry) => entry.message.metadata?.item_type === 'reasoning');
    const summary = hasInterrupted
      ? (isZh ? '对话上下文处理中断' : 'Context processing interrupted')
      : hasCheckpoint
        ? (item.entries.some((entry) => entry.message.metadata?.recovered) ? (isZh ? '已恢复对话上下文' : 'Conversation context restored') : (isZh ? '已整理上下文' : 'Context compacted'))
        : Array.from(new Set(labels)).join(' · ') || (hasReasoning ? (isZh ? '模型思考' : 'Model reasoning') : (isZh ? 'Agent 过程' : 'Agent process'));
    const failed = toolEntries.some((entry) => ['failed', 'cancelled'].includes(String(entry.message.metadata?.status || '')));
    const expectedCallIds = new Set(toolCalls.map((call: any) => String(call?.id || '')).filter(Boolean));
    const actualCallIds = new Set(toolEntries.map((entry) => String(entry.message.metadata?.tool_call_id || '')).filter(Boolean));
    const incomplete = expectedCallIds.size > actualCallIds.size;
    const first = item.entries[0]?.message;
    const iteration = Number(first?.metadata?.planner_iteration || 0);
    const active = loading
      && streamStatus?.stream_id === first?.metadata?.planner_turn_id
      && streamStatus?.planner_iteration === iteration
      && streamStatus?.phase !== 'iteration_finished';
    const expanded = active || Boolean(expandedProcessGroups[item.key]);
    const statusLabel = active
      ? (isZh ? '进行中' : 'Running')
      : hasInterrupted
        ? (isZh ? '已中断' : 'Interrupted')
        : incomplete
        ? (isZh ? '已中断' : 'Interrupted')
        : failed
          ? (isZh ? '部分失败' : 'Partial failure')
          : '';

    const toolSummary = (message: AiCreatorMessage) => {
      const toolName = String(message.metadata?.tool_name || '');
      const result = readPlannerToolResult(message);
      if (!result.ok) return String(result.error || (isZh ? '调用失败' : 'Call failed'));
      if (toolName === 'search_recipes') return isZh ? `发现 ${Number(result.count || 0)} 条候选经验` : `Found ${Number(result.count || 0)} candidates`;
      if (toolName === 'retrieve_recipes') {
        const names = (Array.isArray(result.recipes) ? result.recipes : []).map((recipe: any) => recipe?.title || recipe?.name).filter(Boolean);
        return names.length > 0 ? names.join('、') : (isZh ? '已读取经验' : 'Recipes loaded');
      }
      if (toolName === 'load_system_skill') return String(result.skill?.label || result.skill?.name || (isZh ? '技能已加载' : 'Skill loaded'));
      return result.pending_action ? (isZh ? '已准备待确认参数' : 'Confirmation parameters prepared') : (isZh ? '调用完成' : 'Call completed');
    };

    return (
      <div className="flex justify-start">
        <div className="ai-creator-process-group w-full max-w-[80%]">
          <button
            type="button"
            onClick={() => setExpandedProcessGroups((prev) => ({ ...prev, [item.key]: !expanded }))}
            className="ai-creator-process-toggle flex max-w-full items-center gap-2 py-1.5 text-left text-zinc-400 transition hover:text-zinc-200"
          >
            {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />}
            <span className="min-w-0 truncate text-sm font-semibold text-zinc-300">{summary}</span>
            {statusLabel && (
              <span className={`shrink-0 text-[11px] font-semibold ${active ? 'text-amber-400' : 'text-red-300'}`}>
                {active && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                {statusLabel}
              </span>
            )}
          </button>
          {expanded && (
            <div className="ml-6 space-y-3 py-2">
              {item.entries.map((entry) => {
                const messageType = String(entry.message.metadata?.message_type || '');
                const itemType = String(entry.message.metadata?.item_type || '');
                if (itemType === 'reasoning') {
                  return (
                    <details key={entry.key} className="text-xs text-zinc-500">
                      <summary className="cursor-pointer hover:text-zinc-300">{isZh ? '查看思考内容' : 'View reasoning'}</summary>
                      <div className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap pl-3 text-sm text-zinc-400">{entry.message.content || (isZh ? '模型返回了不可读的思考数据' : 'The model returned opaque reasoning data')}</div>
                    </details>
                  );
                }
                if (itemType === 'function_call') {
                  const apiItem = entry.message.metadata?.api_item || {};
                  return (
                    <details key={entry.key} className="text-xs text-zinc-500">
                      <summary className="cursor-pointer hover:text-zinc-300">{plannerToolLabel(String(apiItem.name || entry.message.metadata?.tool_name || ''))}</summary>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap pl-3 text-[11px] text-zinc-400">{typeof apiItem.arguments === 'string' ? apiItem.arguments : JSON.stringify(apiItem.arguments || {}, null, 2)}</pre>
                    </details>
                  );
                }
                if (itemType === 'checkpoint' || itemType === 'response_interrupted') {
                  const retryTurnId = String(entry.message.metadata?.retry_turn_id || '');
                  return (
                    <div key={entry.key} className={String(entry.message.metadata?.status) === 'failed' ? 'text-sm text-red-300' : 'text-sm text-zinc-400'}>
                      <div>{entry.message.content}</div>
                      {retryTurnId && (
                        <button type="button" onClick={() => handleSend(undefined, retryTurnId)} className="mt-2 text-xs font-semibold text-orange-400 hover:text-orange-300">
                          {isZh ? '重试上下文整理' : 'Retry context recovery'}
                        </button>
                      )}
                    </div>
                  );
                }
                if (messageType === 'planner_trace_assistant') {
                  const calls = Array.isArray(entry.message.metadata?.tool_calls) ? entry.message.metadata?.tool_calls : [];
                  if (calls.length === 0) return null;
                  return (
                    <details key={entry.key} className="text-xs text-zinc-500">
                      <summary className="cursor-pointer hover:text-zinc-300">{isZh ? '查看调用参数' : 'View call arguments'}</summary>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap pl-3 text-[11px] text-zinc-400">{JSON.stringify(calls, null, 2)}</pre>
                    </details>
                  );
                }
                const result = readPlannerToolResult(entry.message);
                const recipes = Array.isArray(result.recipes) ? result.recipes : [];
                return (
                  <div key={entry.key}>
                    <div className="flex items-start gap-2">
                      <span className="min-w-24 text-[11px] font-bold uppercase text-zinc-500">{plannerToolLabel(String(entry.message.metadata?.tool_name || ''))}</span>
                      <span className={`min-w-0 flex-1 text-sm ${result.ok ? 'text-zinc-300' : 'text-red-300'}`}>{toolSummary(entry.message)}</span>
                    </div>
                    {recipes.some((recipe: any) => recipe?.content) && (
                      <div className="mt-3 space-y-3 pl-3">
                        {recipes.map((recipe: any) => recipe?.content ? (
                          <div key={String(recipe.id || recipe.title)}>
                            <div className="mb-1 text-xs font-semibold text-zinc-300">{recipe.title || recipe.name}</div>
                            <div className="max-h-72 overflow-y-auto text-xs text-zinc-400"><MarkdownMessage content={String(recipe.content)} /></div>
                          </div>
                        ) : null)}
                      </div>
                    )}
                    <details className="mt-2 text-xs text-zinc-500">
                      <summary className="cursor-pointer hover:text-zinc-300">{isZh ? '查看原始结果' : 'View raw result'}</summary>
                      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap pl-3 text-[11px] text-zinc-400">{JSON.stringify(result, null, 2)}</pre>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSkillMenuGroup = (title: string, skills: AgentSkill[]) => {
    if (skills.length === 0) return null;
    return (
      <div className="py-1">
        <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500">{title}</div>
        <div className="space-y-1">
          {skills.map((skill) => {
            const key = getSkillKey(skill);
            const selected = selectedSkills.some((item) => getSkillKey(item) === key);
            const disabled = !selected && selectedSkills.length >= 2;
            return (
              <button
                key={key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (!disabled) selectSkill(skill);
                }}
                disabled={disabled}
                className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition ${
                  selected
                    ? 'bg-orange-700/55 text-orange-50 shadow-sm shadow-black/20 ring-1 ring-orange-300/25'
                    : disabled
                      ? 'cursor-not-allowed text-zinc-600'
                      : 'text-zinc-200 hover:bg-zinc-800 hover:text-orange-100 hover:ring-1 hover:ring-orange-400/25'
                }`}
                title={disabled ? (isZh ? '最多选择 2 个技能' : 'Select up to 2 skills') : skill.description || getSkillLabel(skill)}
              >
                <Sparkles className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? 'text-orange-300' : 'text-zinc-500'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{getSkillLabel(skill)}</span>
                  {skill.description && (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-zinc-500">{skill.description}</span>
                  )}
                </span>
                {selected && <span className="text-xs font-semibold text-orange-300">{isZh ? '已选' : 'Selected'}</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderRecipeMenuGroup = (title: string, recipes: AgentExperienceRecipe[]) => {
    if (recipes.length === 0) return null;
    return (
      <div className="py-1">
        <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500">{title}</div>
        <div className="space-y-1">
          {recipes.map((recipe) => {
            const selected = selectedRecipe?.id === recipe.id;
            const disabled = !selected && Boolean(selectedRecipe);
            return (
              <button
                key={getRecipeKey(recipe)}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (!disabled) selectRecipe(recipe);
                }}
                disabled={disabled}
                className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition ${
                  selected
                    ? 'bg-emerald-700/60 text-emerald-50 shadow-sm shadow-black/20 ring-1 ring-emerald-300/25'
                    : disabled
                      ? 'cursor-not-allowed text-zinc-600'
                      : 'text-zinc-200 hover:bg-zinc-800 hover:text-emerald-100 hover:ring-1 hover:ring-emerald-400/25'
                }`}
                title={disabled ? (isZh ? '每次最多选择 1 个经验配方' : 'Select up to 1 recipe') : recipe.description || getRecipeLabel(recipe)}
              >
                <Save className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? 'text-emerald-300' : 'text-zinc-500'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{getRecipeLabel(recipe)}</span>
                  <span className="mt-0.5 block text-[10px] font-semibold text-zinc-500">{getRecipeKindLabel(recipe)}</span>
                  {recipe.description && (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-zinc-500">{recipe.description}</span>
                  )}
                </span>
                {selected && <span className="text-xs font-semibold text-emerald-300">{isZh ? '已选' : 'Selected'}</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSkillMenu = () => {
    if (!slashRange) return null;
    const hasSkills = filteredSystemSkills.length > 0 || filteredRecipes.length > 0;
    return (
      <div className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-zinc-950 p-2 shadow-2xl shadow-black/40">
        {hasSkills ? (
          <>
            {renderSkillMenuGroup(isZh ? '系统技能' : 'System skills', filteredSystemSkills)}
            {renderRecipeMenuGroup(isZh ? '我的经验' : 'My recipes', filteredRecipes)}
          </>
        ) : (
          <div className="px-4 py-5 text-center text-sm text-zinc-500">
            {isZh ? '没有匹配的技能' : 'No matching skills'}
          </div>
        )}
        {selectedSkills.length >= 2 && (
          <div className="border-t border-white/10 px-3 py-2 text-xs text-amber-400">
            {isZh ? '最多选择 2 个技能。' : 'Select up to 2 skills.'}
          </div>
        )}
        {selectedRecipe && (
          <div className="border-t border-white/10 px-3 py-2 text-xs text-emerald-300">
            {isZh ? '每次最多选择 1 个经验配方。' : 'Select up to 1 recipe.'}
          </div>
        )}
      </div>
    );
  };

  const disableRecipe = async (recipe: AgentExperienceRecipe) => {
    try {
      await agentRuntimeApi.updateExperienceRecipe(recipe.id, { is_active: false });
      if (selectedRecipe?.id === recipe.id) setSelectedRecipe(null);
      if (expandedRecipeId === recipe.id) setExpandedRecipeId(null);
      setRecipePendingDisable(null);
      await loadSkills();
    } catch (err: any) {
      openInfo(isZh ? '停用失败' : 'Disable failed', err?.message || 'Failed to disable recipe');
    }
  };

  const renderSidebarSectionHeader = (title: string, count: number, open: boolean, onToggle: () => void) => (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500 transition hover:bg-zinc-900/60 hover:text-zinc-300"
    >
      <span>{title}</span>
      <span className="flex items-center gap-2">
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] tracking-normal text-zinc-600">{count}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </span>
    </button>
  );

  const renderRecipeManager = () => {
    const recipes = availableSkills.experience_recipes;
    return (
      <div className="border-b border-white/5">
        {renderSidebarSectionHeader('RECIPE', recipes.length, recipeSectionOpen, () => setRecipeSectionOpen((open) => !open))}
        {recipeSectionOpen && (
          <div className="space-y-1.5 px-3 pb-3">
            {recipes.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-xs leading-relaxed text-zinc-600">
                {isZh ? '成功结果可保存为经验配方。' : 'Save successful results as recipes.'}
              </div>
            ) : (
              recipes.slice(0, 8).map((recipe) => {
                const selected = selectedRecipe?.id === recipe.id;
                const expanded = expandedRecipeId === recipe.id;
                return (
                  <div
                    key={recipe.id}
                    className={`overflow-hidden rounded-md border transition ${
                      selected ? 'border-emerald-400/45 bg-emerald-950/30' : 'border-white/5 bg-zinc-900/35 hover:border-emerald-500/25 hover:bg-zinc-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setExpandedRecipeId(expanded ? null : recipe.id)}
                        className="min-w-0 flex-1 px-3 py-2 text-left"
                        title={recipe.description || getRecipeLabel(recipe)}
                      >
                        <span className={`block truncate text-xs font-semibold ${selected ? 'text-emerald-100' : 'text-zinc-300'}`}>
                          {getRecipeLabel(recipe)}
                        </span>
                        <span className="mt-1 inline-flex rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">
                          {getRecipeKindLabel(recipe)}
                        </span>
                        {recipe.description && <span className="mt-0.5 line-clamp-1 block text-[11px] text-zinc-600">{recipe.description}</span>}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRecipe(selected ? null : recipe);
                        }}
                        className={`mr-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition ${
                          selected ? 'bg-emerald-500/20 text-emerald-200' : 'text-zinc-500 hover:bg-emerald-500/10 hover:text-emerald-300'
                        }`}
                        title={selected ? (isZh ? '取消选择' : 'Unselect recipe') : (isZh ? '添加到本次发送' : 'Use for next send')}
                      >
                        {selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRecipePendingDisable(recipe);
                        }}
                        className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-600 transition hover:bg-red-500/10 hover:text-red-300"
                        title={isZh ? '删除经验' : 'Delete recipe'}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {expanded && (
                      <div className="space-y-2 border-t border-white/5 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
                        {recipe.content && (
                          <div className="max-h-72 overflow-y-auto text-zinc-400">
                            <MarkdownMessage content={recipe.content} />
                          </div>
                        )}
                        {recipe.params_template && Object.keys(recipe.params_template).length > 0 && (
                          <div>
                            <span className="text-zinc-400">{isZh ? '参数：' : 'Params: '}</span>
                            {Object.entries(recipe.params_template).slice(0, 3).map(([key, value]) => `${key}: ${String(value)}`).join(' / ')}
                          </div>
                        )}
                        {Array.isArray(recipe.tags) && recipe.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {recipe.tags.slice(0, 4).map((tag) => (
                              <span key={tag} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-500">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    );
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
        <div className="flex items-center justify-end px-5 py-4 border-b border-white/5">
          <button
            onClick={startNewChat}
            className="p-2 rounded-lg bg-zinc-900 text-zinc-300 hover:text-orange-400 hover:bg-zinc-800 transition"
            title="New chat"
          >
            <SquarePen className="w-4 h-4" />
          </button>
        </div>

        {renderRecipeManager()}

        <div className="flex min-h-0 flex-1 flex-col">
          {renderSidebarSectionHeader('HISTORY', conversations.length, historySectionOpen, () => setHistorySectionOpen((open) => !open))}
          {historySectionOpen && (
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
              <SquarePen className="w-4 h-4" />
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

        {/* Chat area */}
        <main
          ref={chatScrollRef}
          onScroll={handleChatScroll}
          className="flex-1 overflow-y-auto px-8 py-8 space-y-8"
        >
          {convoLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          )}

          {!convoLoading &&
            chatRenderItems.map((item) => (
              <div key={item.key}>
                {item.type === 'process_group' ? (
                  renderPlannerProcessGroup(item)
                ) : item.type === 'image_group' ? (
                  renderImageToolGroup(item)
                ) : item.type === 'image_edit_job' ? (
                  <div className="flex justify-start">
                    <AgentImageEditQueueCard
                      job={item.job}
                      language={language}
                      onRetry={() => agentImageEditQueue.retry(item.job.clientSubmissionId)}
                      onReopen={() => reopenQueuedImageEdit(item.job)}
                      onOpenResult={() => openQueuedImageEditResult(item.job)}
                      onEditResult={() => {
                        if (item.job.resultSource) openImageEditorForSource(item.job.resultSource);
                      }}
                    />
                  </div>
                ) : item.message.role === 'tool' || (item.message.role === 'developer' && item.message.tool_result) ? (
                  renderToolMessage(item.message)
                ) : item.message.role === 'event' ? (
                  renderEventMessage(item.message)
                ) : (
                  <>
                <div className={`flex ${item.message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex max-w-[80%] flex-col gap-2 ${item.message.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {item.message.role === 'user' && Array.isArray(item.message.attachments) && item.message.attachments.length > 0 && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {item.message.attachments.map((attachment, attachmentIdx) => {
                          const isImage = String(attachment.media_kind || '').toLowerCase() === 'image';
                          const source = getMessageEditableImageSources(item.message).find((candidate) => candidate.url === attachment.url) || null;
                          return (
                            <div
                              key={`${attachment.url}_${attachmentIdx}`}
                              className="group relative overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80 shadow-lg shadow-black/20"
                            >
                              <a href={attachment.url} target="_blank" rel="noreferrer" className="block" title={attachment.name || attachment.url}>
                                {isImage ? (
                                  <img src={attachment.url} alt={attachment.name || 'attachment'} className="h-24 w-24 object-cover" />
                                ) : (
                                  <div className="h-24 w-24 truncate px-3 py-2 text-xs text-zinc-300">{attachment.name || attachment.url}</div>
                                )}
                              </a>
                              {isImage && source && (
                                <AgentImageEditButton
                                  label={imageEditingCopy.edit}
                                  iconClassName="h-3.5 w-3.5"
                                  onClick={() => openImageEditorForSource(source)}
                                  className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md bg-black/75 text-white opacity-100 backdrop-blur transition hover:bg-blue-600 sm:opacity-0 sm:group-hover:opacity-100"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  <div
                    className={`w-fit max-w-full rounded-2xl px-6 py-4 text-base leading-relaxed group relative ${
                      item.message.role === 'user'
                        ? 'bg-orange-500 text-white'
                        : 'bg-zinc-900 border border-white/10 text-zinc-200'
                    }`}
                  >
                    {editingIdx === item.index ? (
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
                      <div className="space-y-3">
                        {item.message.role === 'user' && (getMessageRequestedSkills(item.message).length > 0 || getMessageRequestedRecipes(item.message).length > 0) && (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {getMessageRequestedSkills(item.message).map((skill) => renderSkillChip(skill))}
                            {getMessageRequestedRecipes(item.message).map((recipe) => renderRecipeChip(recipe))}
                          </div>
                        )}
                        {item.message.content && !isLocalImageEditAction(item.message.action) && (
                          item.message.role === 'assistant' ? (
                            <div className="min-w-0">
                              <MarkdownMessage content={item.message.content} />
                              {item.message.metadata?.is_streaming && (
                                <span className="ml-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-orange-400 align-text-bottom" />
                              )}
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap">{item.message.content}</div>
                          )
                        )}
                        {item.message.role === 'assistant' && item.message.metadata?.finish_reason === 'cancelled' && (
                          <div className="text-xs text-zinc-500">
                            {(t as any).ai_creator_stopped || 'Stopped'}
                          </div>
                        )}
                        {item.message.role !== 'user' && Array.isArray(item.message.attachments) && item.message.attachments.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {item.message.attachments.map((attachment, attachmentIdx) => {
                              const isImage = String(attachment.media_kind || '').toLowerCase() === 'image';
                              const source = getMessageEditableImageSources(item.message).find((candidate) => candidate.url === attachment.url) || null;
                              return (
                                <div
                                  key={`${attachment.url}_${attachmentIdx}`}
                                  className={`group relative overflow-hidden rounded-lg border ${
                                    item.message.role === 'user' ? 'border-white/25 bg-white/10' : 'border-white/10 bg-black/20'
                                  }`}
                                >
                                  <a href={attachment.url} target="_blank" rel="noreferrer" className="block" title={attachment.name || attachment.role || attachment.url}>
                                    {isImage ? (
                                      <img src={attachment.url} alt={attachment.name || attachment.role || 'attachment'} className="h-24 w-full object-cover" />
                                    ) : (
                                      <div className="truncate px-3 py-2 text-xs text-zinc-300">{attachment.name || attachment.url}</div>
                                    )}
                                    {attachment.name && (
                                      <div className={`truncate px-2 py-1 text-[11px] ${item.message.role === 'user' ? 'text-orange-50/80' : 'text-zinc-400'}`}>{attachment.name}</div>
                                    )}
                                  </a>
                                  {isImage && source && (
                                    <AgentImageEditButton
                                      label={imageEditingCopy.edit}
                                      iconClassName="h-3.5 w-3.5"
                                      onClick={() => openImageEditorForSource(source)}
                                      className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md bg-black/75 text-white opacity-100 backdrop-blur transition hover:bg-blue-600 sm:opacity-0 sm:group-hover:opacity-100"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Edit / Delete buttons on user messages */}
                    {item.message.role === 'user' && editingIdx !== item.index && (
                      <div className="absolute -left-24 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(item.index)}
                          className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-orange-400 hover:bg-zinc-700 transition"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteFrom(item.index)}
                          className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Action card inside assistant message */}
                    {item.message.role === 'assistant' && item.message.action && item.message.action.type !== 'chat' && (
                      isProductImageAction(item.message.action) ? (
                        <div className={item.message.content ? 'mt-4 border-t border-white/10 pt-4' : ''}>
                          <AgentProductImageActionCard
                            action={item.message.action}
                            conversationId={activeConversationId || ''}
                            language={language}
                            conversationImages={conversationProductImages}
                            submitting={Boolean(item.message.action.run_id && productSubmittingRunIds.has(item.message.action.run_id))}
                            superseded={isSupersededActionMessage(item.message)}
                            highlighted={Boolean(item.message.action.run_id && highlightedRunId === item.message.action.run_id)}
                            disabled={
                              !item.message.action.run_id
                              || isSupersededActionMessage(item.message)
                              || Boolean(item.message.run_status && item.message.run_status !== 'waiting_confirmation')
                            }
                            onRunUpdated={handleProductRunUpdated}
                            onConfirm={runProductImageGeneration}
                          />
                        </div>
                      ) : (
                        <div
                        id={item.message.action.run_id ? `agent-action-${item.message.action.run_id}` : undefined}
                        className={`${item.message.content && !isLocalImageEditAction(item.message.action) ? 'mt-4 pt-4 border-t border-white/10' : ''} rounded-lg transition-shadow duration-300 ${
                          item.message.action.run_id && highlightedRunId === item.message.action.run_id
                            ? 'ring-2 ring-orange-400/80 shadow-[0_0_0_6px_rgba(251,146,60,0.12)]'
                            : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                          {ACTION_ICONS[item.message.action.type] || <Wand2 className="w-5 h-5" />}
                          <span className="font-bold text-zinc-300">
                            {isImageEditAction(item.message.action)
                              ? (isLocalImageEditAction(item.message.action) ? imageEditingCopy.local : imageEditingCopy.global)
                              : getActionLabel(item.message.action.type)}
                          </span>
                        </div>
                        {isLocalImageEditAction(item.message.action) && (
                          <div className="mb-3 text-xs font-medium text-blue-300">{imageEditingCopy.maskPriority}</div>
                        )}
                        {isSupersededActionMessage(item.message) && (
                          <div className="mb-3 text-xs font-medium text-amber-300/80">
                            {t.ai_creator_action_superseded || 'Replaced by a newer request'}
                          </div>
                        )}
                        {item.message.action.params && Object.keys(item.message.action.params).length > 0 && (
                          <div className="text-xs text-zinc-500 mb-3 space-y-1">
                            {Object.entries(item.message.action.params)
                              .filter(([key]) => !['mode', 'edit_scope', 'source_message_id', 'source_image_url', 'mask_url'].includes(key))
                              .map(([k, v]) => (
                              <div key={k}>
                                <span className="text-zinc-400">
                                  {k === 'prompt'
                                    ? (isLocalImageEditAction(item.message.action) ? imageEditingCopy.effect : imageEditingCopy.prompt)
                                    : k}:
                                </span>{' '}
                                {String(v)}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-2">
                          <button
                            onClick={() => executeActionDirectly(item.message.action!)}
                            disabled={generatingType !== null || isSupersededActionMessage(item.message)}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 text-sm text-white font-bold hover:bg-orange-500 transition disabled:opacity-50"
                          >
                            {generatingType === item.message.action.type ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Wand2 className="w-4 h-4" />
                            )}
                            {generatingType === item.message.action.type
                              ? (isZh ? '正在生成…' : 'Generating…')
                              : item.message.action.type === 'generate_image' && String(item.message.action.params?.mode || '') === 'edit'
                                ? (String(item.message.action.params?.edit_scope || 'local') === 'global' ? imageEditingCopy.edit : imageEditingCopy.selectArea)
                                : (isZh ? '立即生成' : 'Generate')}
                          </button>
                          {!(item.message.action.type === 'generate_image' && String(item.message.action.params?.mode || '') === 'edit') && (
                            <button
                              onClick={() => executeAction(item.message.action!)}
                              disabled={generatingType !== null || isSupersededActionMessage(item.message)}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 text-sm text-zinc-300 font-medium hover:bg-zinc-700 transition disabled:opacity-50"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              {isZh ? '编辑参数' : 'Edit Parameters'}
                            </button>
                          )}
                          {item.message.action.type === 'generate_first_frame' && (
                            <button
                              onClick={() => quickSend(isZh ? '跳过首帧，直接生成视频' : 'Skip the first frame and generate the video directly')}
                              disabled={generatingType !== null || loading || isSupersededActionMessage(item.message)}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 text-sm text-zinc-300 font-medium hover:bg-zinc-700 transition disabled:opacity-50"
                            >
                              <Film className="w-3.5 h-3.5" />
                              {isZh ? '跳过首帧' : 'Skip first frame'}
                            </button>
                          )}
                        </div>
                        </div>
                      )
                    )}
                  </div>
                  </div>
                </div>
                  </>
                )}

                {/* Routing quick-reply buttons */}
                {item.type === 'message' &&
                  item.message.role === 'assistant' &&
                  item.index === messages.length - 1 &&
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

          {loading && streamStatus?.phase !== 'responding' && (
            <div className="flex justify-start">
              <div className="bg-zinc-900 border border-white/10 rounded-2xl px-6 py-4 text-base text-zinc-400 flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                {getStreamStatusLabel(streamStatus)}
              </div>
            </div>
          )}

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

            <div className="relative">
              {(selectedSkills.length > 0 || selectedRecipe) && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {selectedRecipe && renderRecipeChip(selectedRecipe, true)}
                  {selectedSkills.map((skill) => renderSkillChip(skill, true))}
                </div>
              )}
              {renderSkillMenu()}
            <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-end gap-3 rounded-2xl bg-zinc-900 border border-white/10 p-3 pr-4 focus-within:border-orange-500/50 transition">
              {/* + upload button */}
              <button
                onClick={() => openImagePicker('reference_image')}
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
              <textarea
                ref={textInputRef}
                rows={1}
                value={input}
                onChange={handleInputChange}
                onClick={(e) => updateSlashRange(e.currentTarget.value, e.currentTarget.selectionStart)}
                onKeyUp={(e) => {
                  if (e.key !== 'Enter' && e.key !== 'Escape') {
                    updateSlashRange(e.currentTarget.value, e.currentTarget.selectionStart);
                  }
                }}
                onBlur={() => window.setTimeout(() => setSlashRange(null), 120)}
                onKeyDown={handleKeyDown}
                placeholder={nextSuggestion || t.ai_creator_placeholder || 'Describe what you want to create...'}
                disabled={loading}
                className="flex-1 min-w-0 max-h-40 resize-none overflow-y-auto py-3 bg-transparent text-base leading-6 text-zinc-100 placeholder-zinc-500 focus:outline-none disabled:opacity-50"
              />

              {/* Send button */}
              <button
                onClick={() => loading ? stopActiveStream() : handleSend()}
                disabled={!loading && !input.trim() && uploadedImages.length === 0}
                title={loading ? ((t as any).ai_creator_stop_generation || 'Stop generating') : undefined}
                aria-label={loading ? ((t as any).ai_creator_stop_generation || 'Stop generating') : undefined}
                className={`shrink-0 w-10 h-10 rounded-full text-white flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed ${
                  loading ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-orange-600 hover:bg-orange-500'
                }`}
              >
                {loading ? <Square className="w-4 h-4 fill-current" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
              <div
                className="group/context relative flex h-9 w-9 shrink-0 items-center justify-center"
                tabIndex={0}
                aria-label={contextTooltip}
              >
                <svg viewBox="0 0 32 32" className="h-7 w-7 -rotate-90" aria-hidden="true">
                  <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="3" className="text-zinc-700" />
                  <circle
                    cx="16"
                    cy="16"
                    r="11"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    pathLength="100"
                    strokeDasharray="100"
                    strokeDashoffset={100 - contextPercent}
                    className="text-orange-400 transition-[stroke-dashoffset] duration-300"
                  />
                </svg>
                <div role="tooltip" className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 hidden whitespace-nowrap rounded-md border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 shadow-lg group-hover/context:block group-focus/context:block">
                  {contextTooltip}
                </div>
              </div>
            </div>
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
                      value={String(confirmParams.model || 'seedance2.5')}
                      onChange={(e) => {
                        const newModel = e.target.value;
                        let newDuration = Number(confirmParams.duration || 10);
                        if (newModel.startsWith('sora')) {
                          const soraOptions = [4, 8, 12];
                          newDuration = soraOptions.reduce((prev, curr) =>
                            Math.abs(curr - newDuration) < Math.abs(prev - newDuration) ? curr : prev
                          );
                        } else if (newModel.startsWith('seedance')) {
                          newDuration = newDuration === -1 ? -1 : Math.max(4, Math.min(30, newDuration));
                        } else {
                          newDuration = newDuration <= 7 ? 5 : 10;
                        }
                        setConfirmParams({ ...confirmParams, model: newModel, duration: newDuration });
                      }}
                    >
                      <option value="kling">Kling</option>
                      <option value="sora2" disabled>{isZh ? 'Sora 2（已下线）' : 'Sora 2 (Discontinued)'}</option>
                      <option value="sora2pro" disabled>{isZh ? 'Sora 2 Pro（已下线）' : 'Sora 2 Pro (Discontinued)'}</option>
                      <option value="seedance2.5">Seedance 2.5</option>
                    </select>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {isZh ? 'Sora 系列产品已经下线。' : 'Sora models are discontinued.'}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label className="block text-xs text-zinc-500">{isZh ? '时长（秒）' : 'Duration (seconds)'}</label>
                      {String(confirmParams.model || 'seedance2.5').startsWith('seedance') && (
                        <SmartDurationToggle
                          checked={Number(confirmParams.duration) === -1}
                          onChange={(checked) => setConfirmParams({ ...confirmParams, duration: checked ? -1 : 10 })}
                          label={isZh ? '智能时长' : 'Smart duration'}
                        />
                      )}
                    </div>
                    {String(confirmParams.model || 'seedance2.5').startsWith('sora') ? (
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
                        min={String(confirmParams.model || 'seedance2.5').startsWith('seedance') ? 4 : 5}
                        max={String(confirmParams.model || 'seedance2.5').startsWith('seedance') ? 30 : 10}
                        step={String(confirmParams.model || 'seedance2.5').startsWith('seedance') ? 1 : 5}
                        disabled={Number(confirmParams.duration) === -1}
                        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                        value={Number(confirmParams.duration) === -1 ? 10 : Number(confirmParams.duration || 10)}
                        onChange={(e) => {
                          const model = String(confirmParams.model || 'seedance2.5');
                          const raw = Number(e.target.value);
                          const min = model.startsWith('seedance') ? 4 : 5;
                          const max = model.startsWith('seedance') ? 30 : 10;
                          setConfirmParams({ ...confirmParams, duration: Math.max(min, Math.min(max, raw || min)) });
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
                      <option value="adaptive">{isZh ? '智能适配' : 'Adaptive'}</option>
                      <option value="21:9">21:9</option>
                      <option value="9:16">9:16</option>
                      <option value="16:9">16:9</option>
                      <option value="1:1">1:1</option>
                      <option value="4:3">4:3</option>
                      <option value="3:4">3:4</option>
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
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{isZh ? '分辨率' : 'Resolution'}</label>
                    <select
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-orange-500/50"
                      value={String(confirmParams.resolution || '720p')}
                      onChange={(e) => setConfirmParams({ ...confirmParams, resolution: e.target.value })}
                    >
                      <option value="480p">480p</option>
                      <option value="720p">720p</option>
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

      {posterEditorData && (
        <AgentPosterEditorDialog
          data={posterEditorData}
          isZh={isZh}
          onClose={() => setPosterEditorData(null)}
        />
      )}

      {previewImage && (
        <AppDialog
          isOpen={true}
          title={previewImage.name || (isZh ? '图片预览' : 'Image preview')}
          onClose={() => {
            if (!savingPreviewAsset) {
              setPreviewImage(null);
              setPreviewImageSource(null);
            }
          }}
          widthClassName="max-w-5xl"
          contentClassName="overflow-hidden"
          footer={
            <div className="flex w-full items-center justify-between gap-3">
              <div className="min-w-0 truncate text-xs text-zinc-500">
                {previewImage.name || getPreviewFileName(previewImage)}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {previewImageSource && (
                  <button
                    type="button"
                    onClick={() => openImageEditorForSource(previewImageSource)}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
                  >
                    <Paintbrush className="h-4 w-4" />
                    {imageEditingCopy.edit}
                  </button>
                )}
                <a
                  href={previewImage.url}
                  download={getPreviewFileName(previewImage)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-200 transition hover:bg-zinc-700"
                >
                  <Download className="h-4 w-4" />
                  {isZh ? '下载' : 'Download'}
                </a>
                <button
                  type="button"
                  onClick={() => void savePreviewImageToLibrary()}
                  disabled={savingPreviewAsset}
                  className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingPreviewAsset ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
                  {isZh ? '添加到素材库' : 'Add to library'}
                </button>
              </div>
            </div>
          }
        >
          <div className="flex max-h-[72vh] items-center justify-center overflow-hidden rounded-xl bg-black">
            <AgentImagePreview
              src={previewImage.url}
              alt={previewImage.name || 'preview'}
              imageClassName="max-h-[72vh] w-auto max-w-full object-contain"
              fallbackClassName="min-h-[360px] w-full"
              loadFailedLabel={imageEditingCopy.resultLoadFailed}
              retryLabel={imageEditingCopy.retry}
              openOriginalLabel={imageEditingCopy.openOriginal}
            />
          </div>
        </AppDialog>
      )}

      {imageEditDialog && (
        <AgentImageEditDialog
          isOpen={true}
          language={language}
          sources={imageEditDialog.sources}
          initialSourceUrl={imageEditDialog.initialSourceUrl}
          initialScope={imageEditDialog.initialScope}
          initialPrompt={imageEditDialog.initialPrompt}
          onClose={closeImageEditDialog}
          onSubmit={submitImageEdit}
        />
      )}

      {recipePendingDisable && (
        <AppDialog
          isOpen={true}
          title={isZh ? '删除经验配方' : 'Delete recipe'}
          onClose={() => setRecipePendingDisable(null)}
          footer={
            <div className="flex items-center gap-2">
              <button
                className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700"
                onClick={() => setRecipePendingDisable(null)}
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-500"
                onClick={() => void disableRecipe(recipePendingDisable)}
              >
                {isZh ? '删除' : 'Delete'}
              </button>
            </div>
          }
        >
          <div className="text-sm leading-relaxed text-zinc-300">
            {isZh
              ? `确认隐藏经验配方“${getRecipeLabel(recipePendingDisable)}”？隐藏后不会再出现在我的经验列表中。`
              : `Hide recipe "${getRecipeLabel(recipePendingDisable)}"? It will no longer appear in your recipe list.`}
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
