import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Download, ExternalLink, Image as ImageIcon, Loader2, Send, Trash2, UserRound, Video } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTasks } from '../../context/TaskContext';
import { videoApi } from '../../services/video';
import type { Asset } from '../../services/assets';
import { CreativeAssetPickerDialog, type CreativeAssetPickerKind } from './CreativeAssetPickerDialog';
import {
  clearCreativeLabSession,
  loadCreativeLabSession,
  saveCreativeLabSession,
  snapshotAsset,
  type CreativeLabMessage,
} from './creativeLabHistory';
import { normalizeApiError, normalizeTaskError } from '../../utils/taskError';

const makeId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getSeedanceAssetId = (asset: Asset) => String(asset.meta_data?.seedance_asset_id || '').trim();

const parseProjectId = (response: any) => response?.data?.id || response?.data?.project_id || response?.id || '';
const parseTaskId = (response: any) => response?.data?.task_id || response?.task_id || '';
const parseVideoUrl = (result: any) => result?.video_url || result?.url || result?.videoFile || result?.video_file || '';
const parseCoverUrl = (result: any) => result?.cover_url || result?.coverImage || result?.cover_image || '';

const classifyRecovery = (result: any): CreativeLabMessage['recovery'] => {
  const category = String(result?.error_classification?.category || result?.error_code || '').toLowerCase();
  if (category.includes('reference_video') || category.includes('video_rejected')) return 'reference_video_rejected';
  if (category.includes('product') || category.includes('model') || category.includes('image') || category.includes('person')) return 'product_or_model_rejected';
  return 'none';
};

export const CreativeLabReplayView: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { tasks, addTask } = useTasks();
  const [referenceVideo, setReferenceVideo] = useState<Asset | null>(null);
  const [productImages, setProductImages] = useState<Asset[]>([]);
  const [modelAssets, setModelAssets] = useState<Asset[]>([]);
  const [input, setInput] = useState('');
  const [pickerKind, setPickerKind] = useState<CreativeAssetPickerKind | null>(null);
  const [messages, setMessages] = useState<CreativeLabMessage[]>(() => loadCreativeLabSession(user?.id, 'viral_replay').messages);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const session = loadCreativeLabSession(user?.id, 'viral_replay');
    setMessages(session.messages);
  }, [user?.id]);

  useEffect(() => {
    const session = loadCreativeLabSession(user?.id, 'viral_replay');
    saveCreativeLabSession(user?.id, { ...session, messages });
  }, [messages, user?.id]);

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
        const recovery = classifyRecovery(task.result || {});
        const error = normalizeTaskError(task.result, 'Seedance 生成失败。请检查商品图片/模特素材或账户状态后重试。');
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
      '基于 Seedance 2.0 生成一条商品广告视频。',
      `用户生成要求：${requirementText}`,
      '只展示用户提供的商品，不虚构品牌授权、价格承诺或夸张效果。',
      modelLine,
      '画质要求：商品形态稳定，细节清晰，无变形，无穿模，镜头节奏清楚，结尾有明确 CTA。',
    ];
    if (mode === 'direct') {
      base.splice(1, 0, '参考广告视频会作为 Seedance reference_video 输入；请迁移其节奏、镜头和广告结构，但不要复制人物身份或敏感人像。');
    }
    if (mode === 'script' && script) {
      base.splice(1, 0, `以下是从参考视频提取的 Seedance 脚本，请按它生成但不要再使用参考视频：\n${script}`);
    }
    return base.join('\n');
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
      model: 'seedance-2.0',
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
    if (!referenceVideo || productImages.length === 0 || !input.trim()) {
      setMessages((prev) => [...prev, { id: makeId(), role: 'system', content: '请至少选择 1 个参考视频、1 张商品图片，并输入生成要求。', createdAt: Date.now() }]);
      return;
    }
    const requirementText = input.trim();
    const assistantId = makeId();
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: 'user', content: requirementText, createdAt: Date.now(), assets: selectedSnapshots },
      { id: assistantId, role: 'assistant', content: '先按参考视频合规处理，直接提交 Seedance 复刻生成…', createdAt: Date.now(), status: 'pending' },
    ]);
    try {
      await submitSeedance(assistantId, 'direct', undefined, requirementText);
      setInput('');
    } catch (err: any) {
      const message = normalizeApiError(err, 'Seedance 任务提交失败。');
      setMessages((prev) => prev.map((item) => item.id === assistantId
        ? { ...item, status: 'failed', content: 'Seedance 任务提交失败。', error: message, recovery: /video|参考视频|视频中含有人像/i.test(message) ? 'reference_video_rejected' : 'none' }
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
    setMessages((prev) => prev.map((message) => message.id === messageId ? { ...message, status: 'extracting', content: '正在提取参考视频脚本…' } : message));
    try {
      const traceId = `creative-fallback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const resp = await videoApi.reverseScriptFromVideo(user.id, {
        video_path: referenceVideo.file_url,
        user_language: language,
        product_name: '创意实验室爆款复刻',
        core_selling_points: requirementText,
        debug_trace_id: traceId,
        debug: true,
      });
      const data: any = resp?.data || {};
      const script = String(data.seedancePrompt || data.seedance_prompt || data.suggestedPrompt || '').trim();
      if (!script) throw new Error('脚本逆向完成，但没有返回可用脚本');
      setMessages((prev) => prev.map((message) => message.id === messageId
        ? { ...message, script, scriptExpanded: false, content: '脚本已提取，正在用脚本兜底生成（不会再把参考视频传给 Seedance）…' }
        : message));
      await submitSeedance(messageId, 'script', script, requirementText);
    } catch (err: any) {
      const errorMessage = normalizeApiError(err, '脚本兜底失败，请更换参考视频或稍后重试。');
      setMessages((prev) => prev.map((message) => message.id === messageId
        ? { ...message, status: 'failed', content: '脚本兜底失败。', error: errorMessage }
        : message));
    }
  };

  const clearHistory = () => {
    clearCreativeLabSession(user?.id, 'viral_replay');
    setMessages([]);
  };

  const assetButton = (kind: CreativeAssetPickerKind, label: string, count: number, Icon: any) => (
    <button type="button" onClick={() => setPickerKind(kind)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10">
      <Icon className="h-4 w-4 text-orange-300" />
      {label}{count > 0 ? ` · ${count}` : ''}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <div className="border-b border-white/10 px-8 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-lg font-black">爆款复刻</div>
            <div className="mt-1 text-xs text-zinc-500">基于 Seedance。请优先选择不含人像的参考视频，或 30 天内由 Seedance 生成的历史视频。</div>
          </div>
          <button type="button" onClick={clearHistory} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-zinc-500 hover:bg-white/5 hover:text-zinc-200">
            <Trash2 className="h-4 w-4" />清空历史
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          {messages.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 px-6 text-center text-zinc-500">
              <Video className="mb-4 h-10 w-10 text-orange-400" />
              <div className="text-base font-black text-zinc-200">选择素材，然后像聊天一样提出生成要求</div>
              <div className="mt-2 max-w-xl text-xs leading-5">如果参考视频被 Seedance 人像审查拒绝，我会让你选择更换视频，或先提取脚本再用脚本生成。</div>
            </div>
          ) : messages.map((message) => (
            <div key={message.id} className={`rounded-2xl border p-4 ${message.role === 'user' ? 'ml-auto max-w-3xl border-orange-500/20 bg-orange-500/10' : message.role === 'system' ? 'mx-auto max-w-3xl border-yellow-500/20 bg-yellow-500/10' : 'mr-auto w-full max-w-5xl border-white/10 bg-black/25'}`}>
              <div className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">{message.content}</div>
              {message.assets?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.assets.map((asset) => <span key={`${message.id}-${asset.id}`} className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-zinc-300">{asset.name}</span>)}
                </div>
              ) : null}
              {message.status === 'pending' || message.status === 'processing' || message.status === 'extracting' ? <div className="mt-3 flex items-center gap-2 text-xs text-orange-300"><Loader2 className="h-4 w-4 animate-spin" />处理中</div> : null}
              {message.error ? <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{message.error}</div> : null}
              {message.videoUrl ? (
                <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/70">
                  <video
                    className="aspect-[9/16] max-h-[520px] w-full bg-black object-contain"
                    src={message.videoUrl}
                    poster={message.coverUrl}
                    controls
                    playsInline
                    preload="metadata"
                  />
                  <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-3">
                    <a href={message.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10">
                      <ExternalLink className="h-4 w-4" />打开预览
                    </a>
                    <a href={message.downloadUrl || message.videoUrl} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-xs font-black text-black hover:bg-orange-400">
                      <Download className="h-4 w-4" />下载视频
                    </a>
                  </div>
                </div>
              ) : null}
              {message.script ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-zinc-950/60">
                  <button
                    type="button"
                    onClick={() => setMessages((prev) => prev.map((item) => item.id === message.id ? { ...item, scriptExpanded: !item.scriptExpanded } : item))}
                    className="flex w-full items-center justify-between px-4 py-3 text-xs font-bold text-zinc-300 hover:bg-white/5"
                  >
                    逆向脚本
                    {message.scriptExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {message.scriptExpanded ? <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap border-t border-white/10 p-4 text-xs leading-6 text-zinc-200">{message.script}</pre> : null}
                </div>
              ) : null}
              {message.recovery === 'reference_video_rejected' ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setPickerKind('motion')} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10">更换参考视频</button>
                  <button type="button" onClick={() => void extractAndFallback(message.id)} className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-black text-black hover:bg-orange-400">提取脚本后生成</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 px-8 py-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {assetButton('motion', referenceVideo ? referenceVideo.name : '参考视频', referenceVideo ? 1 : 0, Video)}
            {assetButton('product', '商品图片', productImages.length, ImageIcon)}
            {assetButton('model', '虚拟模特', modelAssets.length, UserRound)}
          </div>
          <div className="flex items-end gap-3 rounded-2xl border border-white/10 bg-black/30 p-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="描述你希望生成的新广告：卖点、风格、场景、节奏、目标人群…"
              className="min-h-[72px] flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            <button type="button" onClick={() => void submit()} disabled={busy || !user?.id} className="mb-1 rounded-xl bg-orange-500 p-3 text-black hover:bg-orange-400 disabled:opacity-50" title="发送">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

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
