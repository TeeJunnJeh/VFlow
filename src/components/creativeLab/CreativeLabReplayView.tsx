import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Clipboard, Download, ExternalLink, History, Image as ImageIcon, Loader2, Pencil, Plus, Send, Trash2, UserRound, Video, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTasks } from '../../context/TaskContext';
import { videoApi } from '../../services/video';
import type { Asset } from '../../services/assets';
import { CreativeAssetPickerDialog, type CreativeAssetPickerKind } from './CreativeAssetPickerDialog';
import { ApiError } from '../../services/errors';
import {
  createCreativeLabSession,
  deleteCreativeLabSession,
  getLastActiveCreativeLabSessionId,
  listCreativeLabSessions,
  loadCreativeLabSessionById,
  saveCreativeLabSessionById,
  setLastActiveCreativeLabSessionId,
  snapshotAsset,
  type CreativeLabMessage,
  type CreativeLabSession,
  type CreativeLabSessionMeta,
} from './creativeLabHistory';
import { pickReplayScripts } from './replayReverseScript';
import { normalizeApiError, normalizeTaskError } from '../../utils/taskError';

const FEATURE = 'viral_replay' as const;
const ASSISTANT_AVATAR = '/vite.svg';
const DEMO_REFERENCE_VIDEO = '/cs-guide/ai_clothing_swap_video_clothing_swap_37fc10d4ca.mp4';
const DEMO_REPLAY_VIDEOS = [
  '/cs-guide/seedance_2c0f1cb518e6.mp4',
  '/cs-guide/seedance_a808fa9c8161.mp4',
  '/cs-guide/seedance_c21ef383aea6.mp4',
] as const;
const REPLAY_CAROUSEL_INTERVAL_MS = 4600;
const REPLAY_FILM_TRANSITION_MS = 760;
const COMPOSER_FLIGHT_MS = 420;
const INITIAL_REPLAY_ORDER = [0, 1, 2];

type ComposerFlightRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ComposerFlight = {
  from: ComposerFlightRect;
  to: ComposerFlightRect;
  phase: 'from' | 'to';
};

type ReplayFilmState = {
  order: number[];
  previousOrder: number[];
  phase: 'idle' | 'sliding';
  cycle: number;
};

const makeId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const getSeedanceAssetId = (asset: Asset) => String(asset.meta_data?.seedance_asset_id || '').trim();
const parseProjectId = (response: any) => response?.data?.id || response?.data?.project_id || response?.id || '';
const parseTaskId = (response: any) => response?.data?.task_id || response?.task_id || '';
const parseVideoUrl = (result: any) => result?.video_url || result?.url || result?.videoFile || result?.video_file || '';
const parseCoverUrl = (result: any) => result?.cover_url || result?.coverImage || result?.cover_image || '';

const getApiErrorData = (error: unknown) => {
  if (error instanceof ApiError) {
    return {
      ...(error.data || {}),
      error_code: error.errorCode || (error.data as any)?.error_code,
      message: error.message,
    };
  }
  return (error as any)?.response?.data || {};
};

const classifyRecovery = (result: any, fallbackText = ''): CreativeLabMessage['recovery'] => {
  const classification = result?.error_classification || {};
  const category = String(classification?.category || result?.error_code || '').toLowerCase();
  const recoveryActions = [
    ...(Array.isArray(result?.recovery_actions) ? result.recovery_actions : []),
    ...(Array.isArray(classification?.recovery_actions) ? classification.recovery_actions : []),
  ].map((action) => String(action).toLowerCase());
  const text = [
    category,
    result?.error_code,
    result?.message,
    result?.error,
    result?.user_error,
    classification?.user_message,
    classification?.safe_message,
    fallbackText,
  ].map((value) => String(value || '').toLowerCase()).join('\n');
  if (category.includes('timeout') || category === 'image_resource_unreachable') return 'none';
  if (recoveryActions.includes('extract_script_fallback')) return 'reference_video_rejected';
  if (category.includes('reference_video') || category.includes('video_rejected')) return 'reference_video_rejected';
  if (
    text.includes('inputvideosensitivecontentdetected') ||
    text.includes('reference_video_rejected') ||
    text.includes('video_rejected') ||
    text.includes('extract_script_fallback') ||
    text.includes('提取脚本后生成') ||
    text.includes('参考视频中含有真人') ||
    (text.includes('参考视频') && text.includes('seedance') && text.includes('审核'))
  ) return 'reference_video_rejected';
  if (category.includes('product') || category.includes('model') || category.includes('image') || category.includes('person')) return 'product_or_model_rejected';
  return 'none';
};

const titleFromMessages = (session: CreativeLabSession, messages: CreativeLabMessage[]) => {
  const firstUserText = messages.find((message) => message.role === 'user')?.content.trim();
  if (!firstUserText) return session.title || '爆款复刻';
  if (session.title && !/^爆款复刻/.test(session.title)) return session.title;
  return firstUserText.length > 24 ? `${firstUserText.slice(0, 24)}...` : firstUserText;
};

const messageCopyText = (message: CreativeLabMessage) => {
  if (message.role === 'user') return message.content;
  return message.seedancePrompt || message.script || message.content;
};

const normalizeReplayOrder = (order?: number[]) => {
  const seen = new Set<number>();
  const normalized: number[] = [];
  (Array.isArray(order) ? order : []).forEach((value) => {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= DEMO_REPLAY_VIDEOS.length || seen.has(index)) return;
    seen.add(index);
    normalized.push(index);
  });
  INITIAL_REPLAY_ORDER.forEach((index) => {
    if (!seen.has(index)) normalized.push(index);
  });
  return normalized.slice(0, INITIAL_REPLAY_ORDER.length);
};

const rotateReplayOrder = (order: number[]) => {
  const safeOrder = normalizeReplayOrder(order);
  return [
    safeOrder[2] ?? INITIAL_REPLAY_ORDER[2],
    safeOrder[0] ?? INITIAL_REPLAY_ORDER[0],
    safeOrder[1] ?? INITIAL_REPLAY_ORDER[1],
  ];
};

const getReplayVideoSrc = (index: number) => DEMO_REPLAY_VIDEOS[index] || DEMO_REPLAY_VIDEOS[0];

export const CreativeLabReplayView: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { tasks, addTask } = useTasks();

  const [referenceVideo, setReferenceVideo] = useState<Asset | null>(null);
  const [productImages, setProductImages] = useState<Asset[]>([]);
  const [modelAssets, setModelAssets] = useState<Asset[]>([]);
  const [input, setInput] = useState('');
  const [pickerKind, setPickerKind] = useState<CreativeAssetPickerKind | null>(null);
  const [sessionMetas, setSessionMetas] = useState<CreativeLabSessionMeta[]>(() => listCreativeLabSessions(user?.id, FEATURE));
  const [activeSession, setActiveSession] = useState<CreativeLabSession | null>(() => {
    const metas = listCreativeLabSessions(user?.id, FEATURE);
    const activeId = getLastActiveCreativeLabSessionId(user?.id, FEATURE) || metas[0]?.id || '';
    return activeId ? loadCreativeLabSessionById(user?.id, FEATURE, activeId) : null;
  });
  const [messages, setMessages] = useState<CreativeLabMessage[]>(() => activeSession?.messages || []);
  const [viewMode, setViewMode] = useState<'home' | 'chat'>(() => (activeSession?.messages.length ? 'chat' : 'home'));
  const [showSessions, setShowSessions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [replayFilm, setReplayFilm] = useState<ReplayFilmState>(() => ({
    order: INITIAL_REPLAY_ORDER,
    previousOrder: INITIAL_REPLAY_ORDER,
    phase: 'idle',
    cycle: 0,
  }));
  const [composerFlight, setComposerFlight] = useState<ComposerFlight | null>(null);
  const [hideLiveComposer, setHideLiveComposer] = useState(false);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const replayFilmTimerRef = useRef<number | null>(null);
  const replayVideoReadyRef = useRef<Record<string, boolean>>({});
  const composerFlightTimerRef = useRef<number | null>(null);
  const composerFlightFrameRef = useRef<number | null>(null);
  const composerFlightMeasureFrameRef = useRef<number | null>(null);

  const refreshSessions = () => setSessionMetas(listCreativeLabSessions(user?.id, FEATURE));

  const clearReplayFilmTimer = useCallback(() => {
    if (replayFilmTimerRef.current !== null) {
      window.clearTimeout(replayFilmTimerRef.current);
      replayFilmTimerRef.current = null;
    }
  }, []);

  const markReplayVideoReady = useCallback((src: string) => {
    replayVideoReadyRef.current = { ...replayVideoReadyRef.current, [src]: true };
  }, []);

  const areReplayVideosReady = useCallback((order: number[]) => (
    normalizeReplayOrder(order).every((index) => replayVideoReadyRef.current[getReplayVideoSrc(index)])
  ), []);

  useEffect(() => {
    const metas = listCreativeLabSessions(user?.id, FEATURE);
    const activeId = getLastActiveCreativeLabSessionId(user?.id, FEATURE) || metas[0]?.id || '';
    const session = activeId ? loadCreativeLabSessionById(user?.id, FEATURE, activeId) : null;
    setSessionMetas(metas);
    setActiveSession(session);
    setMessages(session?.messages || []);
    setViewMode(session?.messages.length ? 'chat' : 'home');
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
    setEditingMessageId(null);
    setComposerFlight(null);
    setHideLiveComposer(false);
  }, [user?.id]);

  useEffect(() => () => {
    clearReplayFilmTimer();
    if (composerFlightTimerRef.current !== null) window.clearTimeout(composerFlightTimerRef.current);
    if (composerFlightFrameRef.current !== null) window.cancelAnimationFrame(composerFlightFrameRef.current);
    if (composerFlightMeasureFrameRef.current !== null) window.cancelAnimationFrame(composerFlightMeasureFrameRef.current);
  }, [clearReplayFilmTimer]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const preloaders = DEMO_REPLAY_VIDEOS.map((src) => {
      const video = document.createElement('video');
      const markReady = () => markReplayVideoReady(src);
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.addEventListener('loadeddata', markReady, { once: true });
      video.addEventListener('canplay', markReady, { once: true });
      video.src = src;
      video.load();
      return { video, markReady };
    });
    return () => {
      preloaders.forEach(({ video, markReady }) => {
        video.removeEventListener('loadeddata', markReady);
        video.removeEventListener('canplay', markReady);
        video.removeAttribute('src');
        video.load();
      });
    };
  }, [markReplayVideoReady]);

  useEffect(() => {
    if (viewMode !== 'home') {
      clearReplayFilmTimer();
      setReplayFilm((prev) => {
        if (prev.phase !== 'sliding') return prev;
        const safeOrder = normalizeReplayOrder(prev.order);
        return { ...prev, order: safeOrder, previousOrder: safeOrder, phase: 'idle' };
      });
      return;
    }
    const timer = window.setInterval(() => {
      setReplayFilm((prev) => {
        if (prev.phase === 'sliding') return prev;
        const currentOrder = normalizeReplayOrder(prev.order);
        const nextOrder = rotateReplayOrder(currentOrder);
        if (!areReplayVideosReady(nextOrder)) {
          return { ...prev, order: currentOrder, previousOrder: currentOrder, phase: 'idle' };
        }
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          return { order: nextOrder, previousOrder: nextOrder, phase: 'idle', cycle: prev.cycle + 1 };
        }
        clearReplayFilmTimer();
        replayFilmTimerRef.current = window.setTimeout(() => {
          replayFilmTimerRef.current = null;
          setReplayFilm((current) => ({
            order: normalizeReplayOrder(current.order),
            previousOrder: normalizeReplayOrder(current.order),
            phase: 'idle',
            cycle: current.cycle,
          }));
        }, REPLAY_FILM_TRANSITION_MS + 80);
        return { order: nextOrder, previousOrder: currentOrder, phase: 'sliding', cycle: prev.cycle + 1 };
      });
    }, REPLAY_CAROUSEL_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      clearReplayFilmTimer();
    };
  }, [areReplayVideosReady, clearReplayFilmTimer, viewMode]);

  useEffect(() => {
    if (!activeSession) return;
    const nextSession = {
      ...activeSession,
      title: titleFromMessages(activeSession, messages),
      messages,
    };
    saveCreativeLabSessionById(user?.id, nextSession);
    setSessionMetas(listCreativeLabSessions(user?.id, FEATURE));
  }, [messages, user?.id, activeSession?.id]);

  useEffect(() => {
    if (!selectionMode) setSelectedMessageIds(new Set());
  }, [selectionMode]);

  useEffect(() => {
    if (viewMode === 'chat' && messages.length === 0 && !busy) {
      setViewMode('home');
      setSelectionMode(false);
    }
  }, [busy, messages.length, viewMode]);

  useEffect(() => {
    setMessages((prev) => prev.map((message) => {
      if (!message.taskId || message.status !== 'processing') return message;
      const task = tasks.find((item) => String(item.id) === String(message.taskId));
      if (!task) return message;
      if (task.status === 'success') {
        const url = parseVideoUrl(task.result);
        const coverUrl = parseCoverUrl(task.result);
        return {
          ...message,
          status: 'success',
          content: url ? '生成完成，已在当前会话中生成预览。' : '生成完成，可在任务队列或历史中查看结果。',
          videoUrl: url || undefined,
          downloadUrl: url || undefined,
          coverUrl: coverUrl || undefined,
          result: task.result || undefined,
        };
      }
      if (task.status === 'failed') {
        const error = normalizeTaskError(task.result, 'Seedance 生成失败。请检查商品图片/模特素材或账户状态后重试。');
        const recovery = classifyRecovery(task.result || {}, error);
        return {
          ...message,
          status: 'failed',
          recovery,
          content: recovery === 'reference_video_rejected'
            ? 'Seedance 拒绝了参考视频。你可以更换参考视频，或让我先提取脚本再用脚本生成。'
            : 'Seedance 生成失败。请检查商品图片/模特素材或账户状态后重试。',
          error,
        };
      }
      return message;
    }));
  }, [tasks]);

  const selectedSnapshots = useMemo(() => [
    ...(referenceVideo ? [snapshotAsset(referenceVideo)] : []),
    ...productImages.map(snapshotAsset),
    ...modelAssets.map(snapshotAsset),
  ], [modelAssets, productImages, referenceVideo]);

  const clearComposerFlightTimers = () => {
    if (composerFlightTimerRef.current !== null) window.clearTimeout(composerFlightTimerRef.current);
    if (composerFlightFrameRef.current !== null) window.cancelAnimationFrame(composerFlightFrameRef.current);
    if (composerFlightMeasureFrameRef.current !== null) window.cancelAnimationFrame(composerFlightMeasureFrameRef.current);
    composerFlightTimerRef.current = null;
    composerFlightFrameRef.current = null;
    composerFlightMeasureFrameRef.current = null;
  };

  const readComposerRect = (): ComposerFlightRect | null => {
    const rect = composerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  };

  const startComposerFlight = (fromRect: ComposerFlightRect | null) => {
    if (!fromRect || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setComposerFlight(null);
      setHideLiveComposer(false);
      return;
    }
    clearComposerFlightTimers();
    setHideLiveComposer(true);
    setComposerFlight({ from: fromRect, to: fromRect, phase: 'from' });
    composerFlightFrameRef.current = window.requestAnimationFrame(() => {
      composerFlightMeasureFrameRef.current = window.requestAnimationFrame(() => {
        const toRect = readComposerRect();
        if (!toRect) {
          setComposerFlight(null);
          setHideLiveComposer(false);
          return;
        }
        setComposerFlight({ from: fromRect, to: toRect, phase: 'to' });
        composerFlightTimerRef.current = window.setTimeout(() => {
          setComposerFlight(null);
          setHideLiveComposer(false);
          clearComposerFlightTimers();
        }, COMPOSER_FLIGHT_MS);
      });
    });
  };

  const buildImagePayload = () => {
    const imagePaths = [
      ...productImages.map((asset) => asset.file_url),
      ...modelAssets.map((asset) => asset.file_url),
    ];
    const imageAssetsMeta = [
      ...productImages.map((asset) => ({ path: asset.file_url, material_type: 'product', asset_id: asset.id })),
      ...modelAssets.map((asset) => ({
        path: asset.file_url,
        material_type: 'model',
        asset_id: asset.id,
        seedance_asset_id: getSeedanceAssetId(asset),
      })),
    ];
    return { imagePaths, imageAssetsMeta };
  };

  const buildPrompt = (mode: 'direct' | 'script', script?: string, requirementText = input.trim()) => {
    const modelLine = modelAssets.length > 0 ? '可使用已选虚拟模特展示穿着/使用效果；虚拟模特以 Seedance asset:// 资产提供。' : '未选择虚拟模特，仅使用商品图片作为视觉参考。';
    const base = [
      '基于 Seedance 2.5 生成一条商品广告视频。',
      `用户生成要求：${requirementText}`,
      '只展示用户提供的商品，不虚构品牌授权、价格承诺或夸张效果。',
      modelLine,
      '画质要求：商品形态稳定，细节清晰，无变形，无穿模，镜头节奏清楚，结尾有明确 CTA。',
    ];
    if (mode === 'direct') {
      base.splice(1, 0, '参考广告视频会作为 Seedance reference_video 输入；请迁移其节奏、镜头和广告结构，但不要复制人物身份或敏感人像。');
    }
    if (mode === 'script' && script) {
      base.splice(1, 0, `以下是从参考视频提取的连续动作幕 Seedance 提示词，请按它生成但不要再使用参考视频：\n${script}`);
    }
    return base.join('\n');
  };

  const ensureActiveSession = () => {
    if (activeSession) {
      setViewMode('chat');
      return activeSession;
    }
    const session = createCreativeLabSession(user?.id, FEATURE, {
      title: `爆款复刻 ${new Date().toLocaleString()}`,
      messages: [],
    });
    setActiveSession(session);
    setSessionMetas(listCreativeLabSessions(user?.id, FEATURE));
    setViewMode('chat');
    return session;
  };

  const submitSeedance = async (assistantId: string, mode: 'direct' | 'script', script?: string, requirementText = input.trim()) => {
    if (!user?.id) throw new Error('请先登录');
    const { imagePaths, imageAssetsMeta } = buildImagePayload();
    const traceId = `creative-replay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createResp = await videoApi.createProject(user.id, {
      title: `创意实验室爆款复刻 ${new Date().toLocaleString()}`,
      aspect_ratio: '9:16',
      script_content: { duration: 8, shots: [], creative_lab_mode: mode },
    });
    const projectId = parseProjectId(createResp);
    if (!projectId) throw new Error('创建项目失败');

    const payload: any = {
      model: 'seedance-2.5',
      prompt: buildPrompt(mode, script, requirementText),
      product_name: '创意实验室爆款复刻',
      duration: 8,
      aspect_ratio: '9:16',
      sound: 'on',
      pricing_mode: 'replay',
      creative_lab_mode: mode === 'direct' ? 'viral_replay_direct' : 'viral_replay_script_fallback',
      user_language: language,
      debug: true,
      debug_trace_id: traceId,
      replay_batch_role: mode === 'direct' ? 'creative_lab_direct' : 'creative_lab_script_fallback',
      replay_item_label: mode === 'direct' ? '创意实验室直传复刻' : '创意实验室脚本兜底',
      replay_model_asset_ids: modelAssets.map(getSeedanceAssetId).filter(Boolean),
      reference_video_sent_to_seedance: mode === 'direct',
      project_id: String(projectId),
      image_path: imagePaths[0],
      image_paths: imagePaths,
      image_assets_meta: imageAssetsMeta,
    };
    if (mode === 'direct' && referenceVideo) payload.video_paths = [referenceVideo.file_url];

    const genResp = await videoApi.generate(payload);
    const taskId = parseTaskId(genResp);
    if (!taskId) throw new Error('任务提交成功但没有返回 task_id');
    addTask({
      id: taskId,
      projectId: String(projectId),
      type: 'video_generation',
      status: 'processing',
      name: mode === 'direct' ? '创意实验室爆款复刻' : '脚本兜底生成',
      createdAt: Date.now(),
      navigateTo: { view: 'creative_lab_replay' },
    });
    setMessages((prev) => prev.map((message) => message.id === assistantId
      ? { ...message, status: 'processing', taskId, projectId: String(projectId), content: 'Seedance 任务已提交，正在生成视频…' }
      : message));
  };

  const submit = async () => {
    if (busy) return;
    if (!user?.id) {
      setSubmitError('请先登录');
      return;
    }
    if (!referenceVideo || productImages.length === 0 || !input.trim()) {
      setSubmitError('请至少选择 1 个参考视频、1 张商品图片，并输入生成要求。');
      return;
    }
    setSubmitError('');
    const requirementText = input.trim();
    const editingId = editingMessageId;
    const assistantId = makeId();
    setBusy(true);
    setSelectionMode(false);
    const composerFromRect = viewMode === 'home' ? readComposerRect() : null;
    ensureActiveSession();
    startComposerFlight(composerFromRect);
    setMessages((prev) => {
      const editedIndex = editingId ? prev.findIndex((message) => message.id === editingId) : -1;
      const prefix = editedIndex >= 0 ? prev.slice(0, editedIndex) : prev;
      return [
        ...prefix,
        { id: editingId || makeId(), role: 'user', content: requirementText, createdAt: Date.now(), assets: selectedSnapshots },
        { id: assistantId, role: 'assistant', content: '先按参考视频合规处理，直接提交 Seedance 复刻生成…', createdAt: Date.now(), status: 'pending' },
      ];
    });
    try {
      await submitSeedance(assistantId, 'direct', undefined, requirementText);
      setInput('');
      setEditingMessageId(null);
    } catch (err: any) {
      const message = normalizeApiError(err, 'Seedance 任务提交失败。');
      const recovery = classifyRecovery(getApiErrorData(err), message);
      setMessages((prev) => prev.map((item) => item.id === assistantId
        ? { ...item, status: 'failed', content: recovery === 'reference_video_rejected' ? 'Seedance 拒绝了参考视频。你可以更换参考视频，或让我先提取脚本再用脚本生成。' : 'Seedance 任务提交失败。', error: message, recovery }
        : item));
    } finally {
      setBusy(false);
    }
  };

  const extractAndFallback = async (messageId: string) => {
    if (!user?.id || !referenceVideo) return;
    const assistantIndex = messages.findIndex((message) => message.id === messageId);
    const requirementText = assistantIndex >= 0
      ? [...messages.slice(0, assistantIndex)].reverse().find((message) => message.role === 'user')?.content || input.trim()
      : input.trim();
    setMessages((prev) => prev.map((message) => message.id === messageId ? { ...message, status: 'extracting', recovery: 'none', content: '正在提取参考视频脚本…' } : message));
    try {
      const traceId = `creative-fallback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const resp = await videoApi.reverseScriptFromVideo(user.id, {
        video_path: referenceVideo.file_url,
        user_language: language,
        product_name: '创意实验室爆款复刻',
        product_focus: requirementText,
        core_selling_points: requirementText,
        debug_trace_id: traceId,
        debug: true,
      });
      const data: any = resp?.data || {};
      const { displayScript, seedanceScript } = pickReplayScripts(data);
      if (!seedanceScript) throw new Error('脚本逆向完成，但没有返回可用脚本');
      setMessages((prev) => prev.map((message) => message.id === messageId
        ? { ...message, script: displayScript || seedanceScript, seedancePrompt: seedanceScript, scriptExpanded: false, recovery: 'none', content: '脚本已提取，正在用连续动作幕提示词兜底生成（不会再把参考视频传给 Seedance）…' }
        : message));
      await submitSeedance(messageId, 'script', seedanceScript, requirementText);
    } catch (err: any) {
      const errorMessage = normalizeApiError(err, '脚本兜底失败，请更换参考视频或稍后重试。');
      setMessages((prev) => prev.map((message) => message.id === messageId
        ? { ...message, status: 'failed', content: '脚本兜底失败。', error: errorMessage }
        : message));
    }
  };

  const startBlankSession = () => {
    setLastActiveCreativeLabSessionId(user?.id, FEATURE, '');
    setActiveSession(null);
    setMessages([]);
    setInput('');
    setEditingMessageId(null);
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
    setSubmitError('');
    setComposerFlight(null);
    setHideLiveComposer(false);
    setViewMode('home');
  };

  const openSession = (sessionId: string) => {
    const session = loadCreativeLabSessionById(user?.id, FEATURE, sessionId);
    if (!session) return;
    setLastActiveCreativeLabSessionId(user?.id, FEATURE, sessionId);
    setActiveSession(session);
    setMessages(session.messages);
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
    setEditingMessageId(null);
    setComposerFlight(null);
    setHideLiveComposer(false);
    setViewMode(session.messages.length ? 'chat' : 'home');
    setShowSessions(false);
  };

  const removeSession = (sessionId: string) => {
    deleteCreativeLabSession(user?.id, FEATURE, sessionId);
    const metas = listCreativeLabSessions(user?.id, FEATURE);
    setSessionMetas(metas);
    if (activeSession?.id === sessionId) {
      const next = metas[0] ? loadCreativeLabSessionById(user?.id, FEATURE, metas[0].id) : null;
      setActiveSession(next);
      setMessages(next?.messages || []);
      setComposerFlight(null);
      setHideLiveComposer(false);
      setViewMode(next?.messages.length ? 'chat' : 'home');
    }
  };

  const toggleMessageSelected = (messageId: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const selectAllMessages = () => setSelectedMessageIds(new Set(messages.map((message) => message.id)));

  const invertSelection = () => {
    setSelectedMessageIds((prev) => new Set(messages.filter((message) => !prev.has(message.id)).map((message) => message.id)));
  };

  const deleteMessage = (messageId: string) => {
    setMessages((prev) => prev.filter((message) => message.id !== messageId));
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      next.delete(messageId);
      return next;
    });
    if (editingMessageId === messageId) {
      setEditingMessageId(null);
      setInput('');
    }
  };

  const deleteSelectedMessages = () => {
    setMessages((prev) => prev.filter((message) => !selectedMessageIds.has(message.id)));
    if (editingMessageId && selectedMessageIds.has(editingMessageId)) {
      setEditingMessageId(null);
      setInput('');
    }
    setSelectedMessageIds(new Set());
    setSelectionMode(false);
  };

  const copyMessage = async (message: CreativeLabMessage) => {
    await navigator.clipboard.writeText(messageCopyText(message));
  };

  const copySelectedMessages = async () => {
    const text = messages
      .filter((message) => selectedMessageIds.has(message.id))
      .map((message) => `${message.role === 'user' ? '用户' : message.role === 'assistant' ? '助手' : '系统'}：${messageCopyText(message)}`)
      .join('\n\n');
    if (text) await navigator.clipboard.writeText(text);
  };

  const startEditingMessage = (message: CreativeLabMessage) => {
    if (message.role !== 'user' || busy) return;
    setEditingMessageId(message.id);
    setInput(message.content);
    setViewMode('chat');
  };

  const assetButton = (kind: CreativeAssetPickerKind, label: string, count: number, Icon: any) => (
    <button type="button" onClick={() => setPickerKind(kind)} className="inline-flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10">
      <Icon className="h-4 w-4 shrink-0 text-orange-300" />
      <span className="truncate">{label}{count > 0 ? ` · ${count}` : ''}</span>
    </button>
  );

  const renderComposerGhost = () => (
    <div className="creative-replay-composer-ghost-content flex h-full w-full flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <span className="creative-replay-ghost-pill"><Video className="h-4 w-4 shrink-0 text-orange-300" />{referenceVideo ? `${referenceVideo.name} · 1` : '参考视频'}</span>
        <span className="creative-replay-ghost-pill"><ImageIcon className="h-4 w-4 shrink-0 text-orange-300" />商品图片{productImages.length > 0 ? ` · ${productImages.length}` : ''}</span>
        <span className="creative-replay-ghost-pill"><UserRound className="h-4 w-4 shrink-0 text-orange-300" />虚拟模特{modelAssets.length > 0 ? ` · ${modelAssets.length}` : ''}</span>
      </div>
      <div className="creative-replay-ghost-input flex min-h-[98px] items-end gap-3 rounded-[28px] border border-white/10 bg-black/35 p-3 shadow-sm">
        <div className={`min-h-[72px] flex-1 px-2 py-1 text-sm leading-6 ${input.trim() ? 'text-zinc-100' : 'text-zinc-600'}`}>
          {input.trim() || '描述新广告的卖点、风格、场景、节奏、目标人群'}
        </div>
        <div className="mb-1 rounded-full bg-orange-500 p-3 text-black">
          <Send className="h-5 w-5" />
        </div>
      </div>
    </div>
  );

  const renderComposer = (placement: 'home' | 'footer') => (
    <div ref={composerRef} className={`creative-replay-composer creative-replay-composer-${placement} ${hideLiveComposer ? 'creative-replay-composer-hidden' : ''} mx-auto flex w-full flex-col gap-3`}>
      <div className="flex flex-wrap gap-2">
        {assetButton('motion', referenceVideo ? referenceVideo.name : '参考视频', referenceVideo ? 1 : 0, Video)}
        {assetButton('product', '商品图片', productImages.length, ImageIcon)}
        {assetButton('model', '虚拟模特', modelAssets.length, UserRound)}
      </div>
      {editingMessageId ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-xs text-orange-100">
          <span>正在修改已发消息，发送后会从该处重新生成。</span>
          <button type="button" onClick={() => { setEditingMessageId(null); setInput(''); }} className="rounded-lg p-1 hover:bg-white/10" title="取消修改">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {submitError ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{submitError}</div> : null}
      <div className="creative-replay-composer-input flex items-end gap-3 rounded-[28px] border border-white/10 bg-black/35 p-3 shadow-sm">
        <textarea
          value={input}
          onChange={(event) => { setInput(event.target.value); setSubmitError(''); }}
          placeholder="描述新广告的卖点、风格、场景、节奏、目标人群"
          className="min-h-[72px] flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600"
        />
        <button type="button" onClick={() => void submit()} disabled={busy || !user?.id} className="mb-1 rounded-full bg-orange-500 p-3 text-black hover:bg-orange-400 disabled:opacity-50" title="发送">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );

  const renderSelectionToolbar = () => selectionMode ? (
    <div className="border-b border-white/10 bg-zinc-950/95 px-8 py-3">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-bold text-zinc-300">已选 {selectedMessageIds.size} / {messages.length}</div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={selectAllMessages} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10">全选</button>
          <button type="button" onClick={invertSelection} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10">反选</button>
          <button type="button" onClick={() => void copySelectedMessages()} disabled={selectedMessageIds.size === 0} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10 disabled:opacity-40">复制选中</button>
          <button type="button" onClick={deleteSelectedMessages} disabled={selectedMessageIds.size === 0} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-500/15 disabled:opacity-40">删除选中</button>
          <button type="button" onClick={() => setSelectionMode(false)} className="rounded-xl px-3 py-2 text-xs font-bold text-zinc-500 hover:bg-white/5 hover:text-zinc-200">取消</button>
        </div>
      </div>
    </div>
  ) : null;

  const renderMessage = (message: CreativeLabMessage) => {
    const isUserMessage = message.role === 'user';
    const isAssistantMessage = message.role === 'assistant';
    const isSystemMessage = message.role === 'system';
    const isSelected = selectedMessageIds.has(message.id);
    const bubbleClass = isUserMessage
      ? 'max-w-[720px] rounded-[26px] rounded-br-lg border-white/10 bg-zinc-800/80'
      : isSystemMessage
        ? 'mx-auto max-w-[680px] rounded-[24px] border-yellow-500/20 bg-yellow-500/10'
        : 'max-w-[760px] rounded-[26px] rounded-bl-lg border-white/10 bg-zinc-900/55';

    return (
      <div key={message.id} className={`group flex w-full items-start gap-2 ${isUserMessage ? 'justify-end' : isSystemMessage ? 'justify-center' : 'justify-start'}`}>
        {isAssistantMessage ? <img src={ASSISTANT_AVATAR} alt="" className="mt-1 h-8 w-8 rounded-full border border-white/10 bg-white p-1" /> : null}
        {selectionMode && !isUserMessage ? (
          <button
            type="button"
            onClick={() => toggleMessageSelected(message.id)}
            className={`mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${isSelected ? 'border-orange-400 bg-orange-500 text-black' : 'border-white/15 bg-white/5 hover:border-orange-400/70'}`}
            title={isSelected ? '取消选择' : '选择消息'}
          >
            {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
          </button>
        ) : null}
        <div className={`flex min-w-0 flex-col ${isUserMessage ? 'items-end' : isSystemMessage ? 'items-center' : 'items-start'}`}>
          <div
            onClick={() => selectionMode && toggleMessageSelected(message.id)}
            className={`min-w-0 border px-4 py-3 shadow-sm transition ${bubbleClass} ${selectionMode ? 'cursor-pointer' : ''} ${isSelected ? 'ring-2 ring-orange-500/40' : ''}`}
          >
            <div className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">{message.content}</div>
            {message.assets?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.assets.map((asset) => <span key={`${message.id}-${asset.id}`} className="max-w-[180px] truncate rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-zinc-300">{asset.name}</span>)}
              </div>
            ) : null}
            {message.status === 'pending' || message.status === 'processing' || message.status === 'extracting' ? <div className="mt-3 flex items-center gap-2 text-xs text-orange-300"><Loader2 className="h-4 w-4 animate-spin" />处理中</div> : null}
            {message.error ? <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{message.error}</div> : null}
            {message.videoUrl ? (
              <div className="mt-4 max-w-[280px] overflow-hidden rounded-xl border border-white/10 bg-zinc-950/70">
                <video className="aspect-[9/16] max-h-[360px] w-full bg-black object-contain" src={message.videoUrl} poster={message.coverUrl} controls playsInline preload="metadata" />
                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-2">
                  <a href={message.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 hover:bg-white/10">
                    <ExternalLink className="h-3.5 w-3.5" />打开
                  </a>
                  <a href={message.downloadUrl || message.videoUrl} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-2.5 py-1.5 text-[11px] font-black text-black hover:bg-orange-400">
                    <Download className="h-3.5 w-3.5" />下载
                  </a>
                </div>
              </div>
            ) : null}
            {message.script ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-zinc-950/60">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMessages((prev) => prev.map((item) => item.id === message.id ? { ...item, scriptExpanded: !item.scriptExpanded } : item));
                  }}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/5"
                >
                  完整逆向分析
                  {message.scriptExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {message.scriptExpanded ? <pre className="creative-script-output cs-gray-scrollbar max-h-[260px] overflow-auto whitespace-pre-wrap border-t p-3 text-xs leading-6">{message.script}</pre> : null}
              </div>
            ) : null}
            {message.recovery === 'reference_video_rejected' && message.status === 'failed' && !message.script ? (
              <div className="mt-4 flex flex-col gap-3">
                <div className="creative-replay-fallback-note rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs leading-5 text-yellow-100">
                  提示：脚本逆向会根据视频抽帧与模型理解重建动作，分析结果不一定准确，新视频可能与原视频存在较大差距。
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={(event) => { event.stopPropagation(); setPickerKind('motion'); }} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10">更换参考视频</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); void extractAndFallback(message.id); }} className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-black text-black hover:bg-orange-400">提取脚本后生成</button>
                </div>
              </div>
            ) : null}
          </div>
          {!selectionMode ? (
            <div className={`mt-1 flex items-center gap-1 text-zinc-500 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100 ${isUserMessage ? 'self-start' : 'self-end'}`}>
              <button type="button" onClick={() => void copyMessage(message)} className="rounded-lg p-1.5 hover:bg-white/5 hover:text-zinc-200" title="复制">
                <Clipboard className="h-4 w-4" />
              </button>
              {isUserMessage ? (
                <button type="button" onClick={() => startEditingMessage(message)} disabled={busy} className="rounded-lg p-1.5 hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40" title="修改并重新生成">
                  <Pencil className="h-4 w-4" />
                </button>
              ) : null}
              <button type="button" onClick={() => deleteMessage(message.id)} className="rounded-lg p-1.5 hover:bg-red-500/10 hover:text-red-200" title="删除">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
        {selectionMode && isUserMessage ? (
          <button
            type="button"
            onClick={() => toggleMessageSelected(message.id)}
            className={`mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${isSelected ? 'border-orange-400 bg-orange-500 text-black' : 'border-white/15 bg-white/5 hover:border-orange-400/70'}`}
            title={isSelected ? '取消选择' : '选择消息'}
          >
            {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
          </button>
        ) : null}
      </div>
    );
  };

  const renderDemoReplaySlot = (slotIndex: number, slot: 'large' | 'small', direction: 'up' | 'down') => {
    const currentOrder = normalizeReplayOrder(replayFilm.order);
    const previousOrder = normalizeReplayOrder(replayFilm.previousOrder);
    const currentVideoIndex = currentOrder[slotIndex] ?? INITIAL_REPLAY_ORDER[slotIndex] ?? 0;
    const previousVideoIndex = previousOrder[slotIndex] ?? currentVideoIndex;
    const currentSrc = getReplayVideoSrc(currentVideoIndex);

    return (
      <div className={`creative-replay-replay-card creative-replay-replay-card-${slot} creative-replay-film-slot creative-replay-film-slot-${direction}`} data-current-video={currentVideoIndex + 1}>
        <div className="creative-replay-film-viewport" aria-label="复刻视频轮换展示">
          {DEMO_REPLAY_VIDEOS.map((src, videoIndex) => {
            const frameState = replayFilm.phase === 'sliding'
              ? videoIndex === currentVideoIndex
                ? 'incoming'
                : videoIndex === previousVideoIndex
                  ? 'outgoing'
                  : 'parked'
              : videoIndex === currentVideoIndex
                ? 'active'
                : 'parked';
            return (
              <video
                key={`replay-film-${slotIndex}-${src}`}
                className={`creative-replay-film-frame creative-replay-film-frame-${frameState} creative-replay-film-frame-${direction}-${frameState}`}
                data-film-frame={videoIndex + 1}
                data-film-cycle={replayFilm.cycle}
                src={src}
                muted
                autoPlay
                loop
                playsInline
                preload="auto"
                onCanPlay={() => markReplayVideoReady(src)}
                onLoadedData={() => markReplayVideoReady(src)}
              />
            );
          })}
        </div>
        <a href={currentSrc} download target="_blank" rel="noreferrer" className="creative-replay-demo-download creative-replay-film-download" title="下载当前复刻视频" aria-label="下载当前复刻视频">
          <Download className="h-4 w-4" />
        </a>
      </div>
    );
  };

  const renderHome = () => (
    <div className="cs-gray-scrollbar flex-1 overflow-y-auto px-6 py-8 sm:px-8">
      <div className="creative-replay-home-shell mx-auto grid min-h-full w-full max-w-[1100px]">
        <div className="creative-replay-stage-zone">
          <div className="creative-replay-demo-stage">
            <div className="creative-replay-source-card">
              <div className="creative-replay-demo-label">
                原视频
                <Video className="h-4 w-4 text-orange-300" />
              </div>
              <video className="creative-replay-demo-video" src={DEMO_REFERENCE_VIDEO} muted autoPlay loop playsInline preload="metadata" />
            </div>
            {renderDemoReplaySlot(0, 'large', 'up')}
            <div className="creative-replay-replay-rail" aria-label="复刻视频轮换展示">
              {renderDemoReplaySlot(1, 'small', 'down')}
              {renderDemoReplaySlot(2, 'small', 'down')}
            </div>
          </div>
        </div>
        <div className="creative-replay-home-composer-slot">
          {renderComposer('home')}
        </div>
      </div>
    </div>
  );

  const renderChat = () => (
    <>
      {renderSelectionToolbar()}
      <div className="cs-gray-scrollbar flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          {messages.length === 0 ? renderHome() : messages.map(renderMessage)}
        </div>
      </div>
      <div className="border-t border-white/10 px-8 py-4">
        {renderComposer('footer')}
      </div>
    </>
  );

  const activeComposerFlightRect = composerFlight ? (composerFlight.phase === 'to' ? composerFlight.to : composerFlight.from) : null;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <div className="border-b border-white/10 px-8 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-lg font-black">爆款复刻</div>
            <div className="mt-1 text-xs text-zinc-500">基于 Seedance。请优先选择不含人像的参考视频，或 30 天内由 Seedance 生成的历史视频。</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {viewMode === 'chat' && messages.length > 0 ? (
              <button type="button" onClick={() => setSelectionMode((value) => !value)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${selectionMode ? 'border-orange-500/40 bg-orange-500/15 text-orange-100' : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'}`}>
                多选{selectionMode && selectedMessageIds.size > 0 ? ` · ${selectedMessageIds.size}` : ''}
              </button>
            ) : null}
            {activeSession ? (
              <button type="button" onClick={() => removeSession(activeSession.id)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-zinc-500 hover:bg-white/5 hover:text-zinc-200">
                <Trash2 className="h-4 w-4" />删除会话
              </button>
            ) : null}
            <button type="button" onClick={startBlankSession} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-white/10">
              <Plus className="h-4 w-4" />新建
            </button>
            <button type="button" onClick={() => { refreshSessions(); setShowSessions((value) => !value); }} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-white/10">
              <History className="h-4 w-4" />会话记录
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'home' ? renderHome() : renderChat()}

      {composerFlight && activeComposerFlightRect ? (
        <div
          className={`creative-replay-composer-ghost ${composerFlight.phase === 'to' ? 'creative-replay-composer-ghost-active' : ''}`}
          style={{
            left: activeComposerFlightRect.left,
            top: activeComposerFlightRect.top,
            width: activeComposerFlightRect.width,
            height: activeComposerFlightRect.height,
          }}
          aria-hidden="true"
        >
          {renderComposerGhost()}
        </div>
      ) : null}

      {showSessions ? (
        <div className="creative-session-drawer absolute inset-y-0 right-0 z-50 flex w-full max-w-[380px] flex-col border-l border-zinc-800 bg-zinc-900 shadow-2xl">
          <div className="creative-session-header flex items-center justify-between border-b border-zinc-800 px-4 py-4">
            <div className="creative-session-title text-sm font-black text-zinc-100">会话记录</div>
            <button type="button" onClick={() => setShowSessions(false)} className="creative-session-icon-button rounded-lg bg-transparent p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200" title="关闭">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {sessionMetas.length === 0 ? (
              <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-zinc-700 text-xs font-bold text-zinc-500">暂无会话</div>
            ) : sessionMetas.map((meta) => (
              <div key={meta.id} className={`creative-session-item mb-2 rounded-xl border p-3 transition ${activeSession?.id === meta.id ? 'creative-session-item-active border-orange-500/40 bg-orange-500/10' : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-750'}`}>
                <button type="button" onClick={() => openSession(meta.id)} className="creative-session-open-button block w-full bg-transparent text-left">
                  <div className="creative-session-item-title truncate text-sm font-bold text-zinc-100">{meta.title}</div>
                  <div className="creative-session-item-preview mt-1 truncate text-xs text-zinc-400">{meta.lastMessagePreview || meta.referenceVideoName || '空会话'}</div>
                  <div className="creative-session-item-time mt-2 text-[11px] text-zinc-500">{new Date(meta.updatedAt).toLocaleString()}</div>
                </button>
                <div className="mt-2 flex justify-end bg-transparent">
                  <button type="button" onClick={() => removeSession(meta.id)} className="creative-session-icon-button rounded-lg bg-transparent p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-300" title="删除会话">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <CreativeAssetPickerDialog
        isOpen={pickerKind !== null}
        kind={pickerKind || 'product'}
        multiple={pickerKind !== 'motion'}
        selectedIds={pickerKind === 'motion' ? (referenceVideo ? [referenceVideo.id] : []) : pickerKind === 'model' ? modelAssets.map((asset) => asset.id) : productImages.map((asset) => asset.id)}
        onClose={() => setPickerKind(null)}
        onConfirm={(assets) => {
          if (pickerKind === 'motion') setReferenceVideo(assets[0] || null);
          if (pickerKind === 'product') setProductImages(assets);
          if (pickerKind === 'model') setModelAssets(assets);
          setPickerKind(null);
        }}
      />
    </div>
  );
};
