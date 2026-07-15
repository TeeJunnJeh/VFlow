import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  Copy,
  Dices,
  History,
  ImagePlus,
  Loader2,
  Paperclip,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { agentRuntimeApi } from '../../services/agentRuntime';
import { assetsApi } from '../../services/assets';
import {
  videoApi,
  type SeedSkillPreview,
  type SeedSkillWorkflow,
} from '../../services/video';
import {
  makeCreativePromptMaterial,
  materialFromWorkflowAsset,
  revokeCreativePromptMaterials,
  toCreativePromptDisplayUrl,
  uploadCreativePromptMaterials,
  type CreativePromptMaterial,
} from './creativePromptMaterials';

type AspectRatio = '9:16' | '16:9' | '1:1';
type Language = '中文' | '英语' | '日语';
type VideoType = 'UGC种草' | '产品开箱' | '对比测评' | '质感大片' | '口播' | '趣味剧本';

const videoTypes: VideoType[] = ['UGC种草', '产品开箱', '对比测评', '质感大片', '口播', '趣味剧本'];
const languages: Language[] = ['中文', '英语', '日语'];
const aspectRatios: AspectRatio[] = ['9:16', '16:9', '1:1'];
const recipeReadyStatuses = new Set<SeedSkillWorkflow['status']>([
  'prompt_ready',
  'video_submitting',
  'video_submitted',
  'video_processing',
  'video_succeeded',
  'video_failed',
  'video_cancelled',
]);
const exampleSellingPoint = '清爽护肤产品，快速吸收、补水提亮，突出自然使用感';
const exampleAssetSpecs = [
  { url: '/product-gallery-examples/1/product_1.png', name: 'product_1.png', type: 'image/png' },
  { url: '/product-gallery-examples/1/product_2.png', name: 'product_2.png', type: 'image/png' },
  { url: '/cs-guide/seedance_2c0f1cb518e6.mp4', name: 'reference.mp4', type: 'video/mp4' },
];

const isTerminalStatus = (status: unknown) => (
  ['success', 'succeed', 'succeeded', 'failed', 'failure', 'error', 'cancelled', 'canceled']
    .includes(String(status || '').trim().toLowerCase())
);

const isSuccessfulStatus = (status: unknown) => (
  ['success', 'succeed', 'succeeded'].includes(String(status || '').trim().toLowerCase())
);

const unwrapWorkflow = (response: any): SeedSkillWorkflow | null => {
  const data = response?.data || response || {};
  return (data.workflow || data) as SeedSkillWorkflow | null;
};

const extractTaskId = (response: any) => String(
  response?.data?.task_id || response?.data?.task?.id || response?.task_id || '',
).trim();

const extractVideoUrl = (value: any) => String(
  value?.video_url || value?.url || value?.output_url || value?.data?.video_url || '',
).trim();

const fallbackSkill = (workflow: SeedSkillWorkflow): SeedSkillPreview => {
  const recipe = workflow.recipe || {};
  const narrative = (recipe.narrative && typeof recipe.narrative === 'object')
    ? recipe.narrative as Record<string, unknown>
    : {};
  const title = `${String(narrative.template_name || '创作')} · ${String(narrative.style_name || '创作')}`;
  return {
    token: String(workflow.creative_number || ''),
    title,
    text: String(workflow.skill_markdown || '').split('\n').filter(Boolean).slice(0, 8).join(' '),
    recipe,
  };
};

const AssistantTurn = ({ children }: { children: React.ReactNode }) => (
  <div className="flex w-full items-start gap-3">
    <img
      src="/vflow-logo-transparent.png"
      alt=""
      className="mt-1 h-8 w-8 shrink-0 rounded-full border border-white/10 bg-white object-contain p-1"
    />
    <div className="min-w-0 flex-1 py-1">{children}</div>
  </div>
);

const UserTurn = ({ prompt, materials }: { prompt: string; materials: CreativePromptMaterial[] }) => (
  <div className="flex w-full justify-end">
    <div className="max-w-[720px] rounded-lg bg-zinc-800 px-4 py-3 text-sm leading-6 text-zinc-100">
      <div className="whitespace-pre-wrap">{prompt}</div>
      {materials.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {materials.map((item) => (
            <span key={item.id} className="inline-flex max-w-[200px] items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-1 text-[11px] text-zinc-300">
              {item.kind === 'video' ? <Video className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
              <span className="truncate">{item.name}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  </div>
);

const Segmented = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) => (
  <div className="grid grid-flow-col auto-cols-fr rounded-lg bg-black/30 p-1">
    {options.map((option) => (
      <button
        key={option}
        type="button"
        onClick={() => onChange(option)}
        className={`min-w-0 rounded-md px-2 py-2 text-xs font-bold transition ${
          value === option ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
        }`}
      >
        {option}
      </button>
    ))}
  </div>
);

export const SkillVideoGenerationView: React.FC = () => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const materialsRef = useRef<CreativePromptMaterial[]>([]);
  const pollTimerRef = useRef<number | null>(null);
  const activeWorkflowIdRef = useRef('');
  const submitInFlightRef = useRef(false);

  const [materials, setMaterials] = useState<CreativePromptMaterial[]>([]);
  const [prompt, setPrompt] = useState('');
  const [videoType, setVideoType] = useState<VideoType>('UGC种草');
  const [language, setLanguage] = useState<Language>('中文');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [duration, setDuration] = useState(10);
  const [selectedSkill, setSelectedSkill] = useState<SeedSkillPreview | null>(null);
  const [workflow, setWorkflow] = useState<SeedSkillWorkflow | null>(null);
  const [scriptDraft, setScriptDraft] = useState('');
  const [finalPrompt, setFinalPrompt] = useState('');
  const [history, setHistory] = useState<SeedSkillWorkflow[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState<'roll' | 'workflow' | 'finalize' | 'video' | 'example' | 'save' | 'recipe' | ''>('');
  const [statusText, setStatusText] = useState('');

  const replaceMaterials = useCallback((next: CreativePromptMaterial[]) => {
    const retained = new Set(next.map((item) => item.previewUrl));
    setMaterials((previous) => {
      previous.forEach((item) => {
        if (item.previewUrl.startsWith('blob:') && !retained.has(item.previewUrl)) URL.revokeObjectURL(item.previewUrl);
      });
      return next;
    });
  }, []);

  useEffect(() => { materialsRef.current = materials; }, [materials]);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearPollTimer();
    revokeCreativePromptMaterials(materialsRef.current);
  }, [clearPollTimer]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [busy, finalPrompt, selectedSkill, statusText, workflow]);

  const loadHistory = useCallback(async () => {
    if (!user?.id) return;
    try {
      const response = await videoApi.getSeedSkillHistory();
      setHistory(Array.isArray(response?.data?.items) ? response.data.items : []);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '读取历史失败');
    }
  }, [user?.id]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const applyWorkflow = useCallback((next: SeedSkillWorkflow, keepMaterials = true) => {
    clearPollTimer();
    activeWorkflowIdRef.current = String(next.id || '');
    setWorkflow(next);
    setSelectedSkill(next.skill || fallbackSkill(next));
    setPrompt(String(next.selling_point || ''));
    setScriptDraft(String((next.stage1 as any)?.natural_script || ''));
    setFinalPrompt(String(next.final_prompt || ''));
    setVideoType((next.video_type as VideoType) || 'UGC种草');
    setLanguage((next.language as Language) || '中文');
    setAspectRatio((next.aspect_ratio as AspectRatio) || '9:16');
    setDuration(Number(next.duration || 10));
    if (!keepMaterials) {
      replaceMaterials((next.assets || []).map(materialFromWorkflowAsset));
    }
  }, [clearPollTimer, replaceMaterials]);

  const resetGeneratedSteps = useCallback(() => {
    clearPollTimer();
    activeWorkflowIdRef.current = '';
    setWorkflow(null);
    setScriptDraft('');
    setFinalPrompt('');
  }, [clearPollTimer]);

  const resetSession = useCallback(() => {
    resetGeneratedSteps();
    setSelectedSkill(null);
    setPrompt('');
    replaceMaterials([]);
    setStatusText('');
  }, [replaceMaterials, resetGeneratedSteps]);

  const handleFiles = useCallback((files: FileList | null) => {
    const next = Array.from(files || []).map((file) => makeCreativePromptMaterial(file));
    if (next.length) setMaterials((previous) => [...previous, ...next].slice(0, 8));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeMaterial = useCallback((id: string) => {
    setMaterials((previous) => {
      const target = previous.find((item) => item.id === id);
      if (target?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
      return previous.filter((item) => item.id !== id);
    });
  }, []);

  const rollSkill = useCallback(async () => {
    if (!user?.id) return setStatusText('请先登录。');
    if (!prompt.trim()) return setStatusText('请先输入简短提示词。');
    if (!materials.length) return setStatusText('请先上传素材。');
    setBusy('roll');
    setStatusText('');
    try {
      const response = await videoApi.rollSeedSkill({
        video_type: videoType,
        language,
        aspect_ratio: aspectRatio,
        duration,
      });
      if (!response.data?.skill) throw new Error('skill 生成没有返回内容');
      resetGeneratedSteps();
      setSelectedSkill(response.data.skill);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'skill 生成失败');
    } finally {
      setBusy('');
    }
  }, [aspectRatio, duration, language, materials.length, prompt, resetGeneratedSteps, user?.id, videoType]);

  const confirmSkill = useCallback(async () => {
    if (!selectedSkill) return;
    setBusy('workflow');
    setStatusText('');
    try {
      const uploaded = await uploadCreativePromptMaterials(materials, setStatusText);
      replaceMaterials(uploaded.materials);
      const response = await videoApi.createSeedSkillWorkflow({
        assets: uploaded.assets,
        selling_point: prompt.trim(),
        video_type: videoType,
        skill_token: selectedSkill.token,
        language,
        aspect_ratio: aspectRatio,
        duration,
      });
      const next = unwrapWorkflow(response);
      if (!next) throw new Error('工作流没有返回内容');
      applyWorkflow(next);
      setStatusText('');
      await loadHistory();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '生成短剧本失败');
    } finally {
      setBusy('');
    }
  }, [applyWorkflow, aspectRatio, duration, language, loadHistory, materials, prompt, replaceMaterials, selectedSkill, videoType]);

  const finalizeWorkflow = useCallback(async () => {
    if (!workflow?.id) return;
    setBusy('finalize');
    setStatusText('');
    try {
      const response = await videoApi.finalizeSeedSkillWorkflow(workflow.id, {
        edited_script: scriptDraft.trim(),
        aspect_ratio: aspectRatio,
        duration,
        language,
      });
      const next = unwrapWorkflow(response);
      if (!next) throw new Error('完整 Prompt 没有返回');
      applyWorkflow(next);
      await loadHistory();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '生成完整 Prompt 失败');
    } finally {
      setBusy('');
    }
  }, [applyWorkflow, aspectRatio, duration, language, loadHistory, scriptDraft, workflow]);

  const pollWorkflowVideo = useCallback((workflowId: string, attempts = 100) => {
    clearPollTimer();
    activeWorkflowIdRef.current = workflowId;
    const tick = async (remaining: number) => {
      if (!remaining || activeWorkflowIdRef.current !== workflowId) return;
      try {
        const response = await videoApi.pollSeedSkillWorkflowVideo(workflowId);
        if (activeWorkflowIdRef.current !== workflowId) return;
        const next = unwrapWorkflow(response);
        const task = (response?.data?.task || next?.video_task || {}) as Record<string, unknown>;
        const status = String(task.status || '').toLowerCase();
        if (next) {
          setWorkflow(next);
          setFinalPrompt(String(next.final_prompt || ''));
        }
        if (isTerminalStatus(status)) {
          pollTimerRef.current = null;
          setStatusText(isSuccessfulStatus(status) ? '' : '视频生成未成功。');
          await loadHistory();
          return;
        }
        pollTimerRef.current = window.setTimeout(() => void tick(remaining - 1), 3500);
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : '读取视频状态失败');
      }
    };
    void tick(attempts);
  }, [clearPollTimer, loadHistory]);

  const generateVideo = useCallback(async () => {
    if (!workflow?.id || submitInFlightRef.current) return;
    const text = String(finalPrompt || workflow.final_prompt || '').trim();
    if (!text) return setStatusText('完整 Prompt 为空。');
    const currentStatus = workflow.video_task?.status;
    if (workflow.video_task && !isTerminalStatus(currentStatus)) return;
    submitInFlightRef.current = true;
    setBusy('video');
    setStatusText('');
    try {
      const response = await videoApi.submitSeedSkillWorkflowVideo(workflow.id, { final_prompt: text });
      if (!extractTaskId(response)) throw new Error('视频任务没有返回任务编号');
      const next = unwrapWorkflow(response);
      if (next) setWorkflow(next);
      pollWorkflowVideo(workflow.id);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '视频生成提交失败');
    } finally {
      submitInFlightRef.current = false;
      setBusy('');
    }
  }, [finalPrompt, pollWorkflowVideo, workflow]);

  const saveSkill = useCallback(async () => {
    if (!workflow || !selectedSkill) return;
    setBusy('save');
    try {
      await assetsApi.createSeedSkillAsset({
        display_name: `${selectedSkill.title} skill`,
        summary: workflow.video_type,
        description: workflow.skill_markdown,
        skill_markdown: workflow.skill_markdown,
        skill_document: workflow as unknown as Record<string, unknown>,
        workflow: workflow as unknown as Record<string, unknown>,
        creative_number: workflow.creative_number,
        video_type: workflow.video_type,
        aspect_ratio: workflow.aspect_ratio,
        duration: workflow.duration,
        language: workflow.language,
      });
      setStatusText('已保存到素材库。');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy('');
    }
  }, [selectedSkill, workflow]);

  const saveAgentRecipe = useCallback(async () => {
    if (!workflow?.id || !recipeReadyStatuses.has(workflow.status) || !workflow.skill_markdown.trim()) return;
    setBusy('recipe');
    setStatusText('');
    try {
      const recipe = await agentRuntimeApi.saveExperienceRecipe({ seed_skill_workflow_id: workflow.id });
      setWorkflow((current) => current?.id === workflow.id
        ? { ...current, agent_recipe_id: recipe.id }
        : current);
      setStatusText('已加入 Agent 经验。');
      await loadHistory();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '保存为 Agent 经验失败');
    } finally {
      setBusy('');
    }
  }, [loadHistory, workflow]);

  const loadExample = useCallback(async () => {
    setBusy('example');
    setStatusText('');
    try {
      const files: File[] = [];
      for (const spec of exampleAssetSpecs) {
        const response = await fetch(spec.url);
        if (!response.ok) throw new Error(`示例素材读取失败：${spec.name}`);
        const blob = await response.blob();
        files.push(new File([blob], spec.name, { type: blob.type || spec.type }));
      }
      replaceMaterials(files.map((file) => makeCreativePromptMaterial(file, 'example')));
      setPrompt(exampleSellingPoint);
      setSelectedSkill(null);
      resetGeneratedSteps();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '示例素材读取失败');
    } finally {
      setBusy('');
    }
  }, [replaceMaterials, resetGeneratedSteps]);

  const openHistory = useCallback((item: SeedSkillWorkflow) => {
    applyWorkflow(item, false);
    setShowHistory(false);
    setStatusText('');
  }, [applyWorkflow]);

  const taskStatus = String(workflow?.video_task?.status || '').toLowerCase();
  const canSaveAgentRecipe = Boolean(
    workflow
    && recipeReadyStatuses.has(workflow.status)
    && workflow.skill_markdown.trim(),
  );
  const videoUrl = useMemo(() => {
    if (!workflow || !isSuccessfulStatus(taskStatus || (workflow.status === 'video_succeeded' ? 'success' : ''))) return '';
    return extractVideoUrl(workflow.video_result) || extractVideoUrl(workflow.video_task?.result);
  }, [taskStatus, workflow]);
  const hasConversation = Boolean(selectedSkill || workflow || finalPrompt);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <header className="shrink-0 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-black">skill视频生成</h1>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => void loadExample()} disabled={Boolean(busy)} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 disabled:opacity-40" title="使用示例素材">
              {busy === 'example' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            </button>
            <button type="button" onClick={resetSession} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-100" title="新建">
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => { void loadHistory(); setShowHistory(true); }} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-100" title="历史">
              <History className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="cs-gray-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex min-h-full max-w-4xl flex-col gap-6">
          {!hasConversation ? (
            <div className="flex flex-1 items-center justify-center py-20">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
                <Dices className="h-5 w-5 text-zinc-300" />
              </div>
            </div>
          ) : null}

          {selectedSkill ? <UserTurn prompt={prompt} materials={materials} /> : null}

          {selectedSkill ? (
            <AssistantTurn>
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-white">{selectedSkill.title}</div>
                    <div className="mt-1 text-[11px] font-bold uppercase text-zinc-500">skill</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => void rollSkill()} disabled={Boolean(busy)} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40" title="换一个 skill">
                      {busy === 'roll' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Dices className="h-4 w-4" />}
                    </button>
                    {workflow ? (
                      <>
                        <button type="button" onClick={() => void saveSkill()} disabled={Boolean(busy)} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40" title="保存到素材库">
                          {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveAgentRecipe()}
                          disabled={Boolean(busy) || !canSaveAgentRecipe || Boolean(workflow.agent_recipe_id)}
                          className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40"
                          title={workflow.agent_recipe_id
                            ? '已加入 Agent 经验'
                            : canSaveAgentRecipe
                              ? '保存为 Agent 经验'
                              : '确认脚本后可保存为 Agent 经验'}
                        >
                          {busy === 'recipe'
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : workflow.agent_recipe_id
                              ? <Check className="h-4 w-4 text-emerald-400" />
                              : <Sparkles className="h-4 w-4" />}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-300">{selectedSkill.text}</p>
                {!workflow ? (
                  <button type="button" onClick={() => void confirmSkill()} disabled={Boolean(busy)} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-white px-4 text-xs font-black text-zinc-950 hover:bg-zinc-200 disabled:opacity-50">
                    {busy === 'workflow' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    使用这个 skill
                  </button>
                ) : null}
              </div>
            </AssistantTurn>
          ) : null}

          {workflow ? (
            <AssistantTurn>
              <div className="max-w-3xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="text-sm font-black">短剧本与参数</div>
                  <span className="text-[11px] text-zinc-500">{scriptDraft.length} / 100</span>
                </div>
                <textarea
                  value={scriptDraft}
                  onChange={(event) => setScriptDraft(event.target.value.slice(0, 100))}
                  className="min-h-[132px] w-full resize-none bg-transparent text-sm leading-7 text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-3">
                  <div>
                    <div className="mb-1.5 text-[11px] font-bold text-zinc-500">比例</div>
                    <Segmented value={aspectRatio} options={aspectRatios} onChange={setAspectRatio} />
                  </div>
                  <div>
                    <div className="mb-1.5 text-[11px] font-bold text-zinc-500">时长</div>
                    <Segmented value={String(duration) as '5' | '10'} options={['5', '10'] as const} onChange={(value) => setDuration(Number(value))} />
                  </div>
                  <div>
                    <div className="mb-1.5 text-[11px] font-bold text-zinc-500">语言</div>
                    <Segmented value={language} options={languages} onChange={setLanguage} />
                  </div>
                </div>
                {workflow.status === 'needs_script_review' ? (
                  <button type="button" onClick={() => void finalizeWorkflow()} disabled={Boolean(busy) || !scriptDraft.trim()} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-white px-4 text-xs font-black text-zinc-950 hover:bg-zinc-200 disabled:opacity-50">
                    {busy === 'finalize' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    确认
                  </button>
                ) : (
                  <div className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-emerald-300"><Check className="h-4 w-4" />已确认</div>
                )}
              </div>
            </AssistantTurn>
          ) : null}

          {finalPrompt ? (
            <AssistantTurn>
              <div className="max-w-3xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-black">完整 Prompt</div>
                  <button type="button" onClick={() => void navigator.clipboard?.writeText(finalPrompt)} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white" title="复制">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <textarea value={finalPrompt} onChange={(event) => setFinalPrompt(event.target.value)} className="min-h-[260px] w-full resize-y bg-transparent text-sm leading-7 text-zinc-200 outline-none" />
                <button type="button" onClick={() => void generateVideo()} disabled={Boolean(busy) || Boolean(workflow?.video_task && !isTerminalStatus(taskStatus))} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-400 px-4 text-xs font-black text-zinc-950 hover:bg-emerald-300 disabled:opacity-50">
                  {busy === 'video' || (workflow?.video_task && !isTerminalStatus(taskStatus)) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {workflow?.video_task && !isTerminalStatus(taskStatus) ? '生成中' : '生成视频'}
                </button>
              </div>
            </AssistantTurn>
          ) : null}

          {workflow?.video_task ? (
            <AssistantTurn>
              <div className="max-w-[360px]">
                {videoUrl ? (
                  <video src={toCreativePromptDisplayUrl(videoUrl)} controls playsInline className="max-h-[520px] w-full bg-black object-contain" />
                ) : (
                  <div className="flex items-center gap-3 py-3 text-sm text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" />视频生成中
                  </div>
                )}
              </div>
            </AssistantTurn>
          ) : null}

          {statusText ? <div className="mx-auto max-w-xl text-center text-xs leading-5 text-amber-200">{statusText}</div> : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-lg border border-white/10 bg-zinc-900/80 p-3 shadow-xl">
            {materials.length > 0 ? (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {materials.map((item) => (
                  <div key={item.id} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black">
                    {item.kind === 'video' ? (
                      <video src={toCreativePromptDisplayUrl(item.previewUrl)} muted className="h-full w-full object-cover" />
                    ) : (
                      <img src={toCreativePromptDisplayUrl(item.previewUrl)} alt="" className="h-full w-full object-cover" />
                    )}
                    <button type="button" onClick={() => removeMaterial(item.id)} className="absolute right-1 top-1 rounded-md bg-black/70 p-1 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100" title="移除">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="描述商品、卖点和想要的画面"
              className="min-h-[64px] w-full resize-none bg-transparent px-1 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(event) => handleFiles(event.target.files)} />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-full p-2 text-zinc-400 hover:bg-white/5 hover:text-white" title="添加素材">
                  <Paperclip className="h-4 w-4" />
                </button>
                <select value={videoType} onChange={(event) => { setVideoType(event.target.value as VideoType); setSelectedSkill(null); resetGeneratedSteps(); }} className="h-8 max-w-[112px] rounded-lg border border-white/10 bg-zinc-950 px-2 text-[11px] font-bold text-zinc-300 outline-none">
                  {videoTypes.map((item) => <option key={item}>{item}</option>)}
                </select>
                <select value={language} onChange={(event) => { setLanguage(event.target.value as Language); setSelectedSkill(null); resetGeneratedSteps(); }} className="h-8 rounded-lg border border-white/10 bg-zinc-950 px-2 text-[11px] font-bold text-zinc-300 outline-none">
                  {languages.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <button type="button" onClick={() => void rollSkill()} disabled={Boolean(busy) || !prompt.trim() || !materials.length} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-zinc-950 hover:bg-zinc-200 disabled:opacity-40" title={selectedSkill ? '换一个 skill' : '生成 skill'}>
                {busy === 'roll' ? <Loader2 className="h-5 w-5 animate-spin" /> : selectedSkill ? <RefreshCw className="h-5 w-5" /> : <Dices className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showHistory ? (
        <div className="absolute inset-y-0 right-0 z-50 flex w-full max-w-[380px] flex-col border-l border-white/10 bg-zinc-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
            <div className="text-sm font-black">历史</div>
            <button type="button" onClick={() => setShowHistory(false)} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white" title="关闭"><X className="h-4 w-4" /></button>
          </div>
          <div className="cs-gray-scrollbar flex-1 overflow-y-auto p-3">
            {history.map((item) => {
              const skill = item.skill || fallbackSkill(item);
              return (
                <button key={item.id} type="button" onClick={() => openHistory(item)} className="mb-2 block w-full border border-white/10 bg-white/[0.03] p-3 text-left hover:bg-white/[0.06]">
                  <div className="truncate text-sm font-bold text-zinc-100">{skill.title}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{item.selling_point}</div>
                  <div className="mt-2 text-[11px] text-zinc-600">{item.aspect_ratio} · {item.duration} 秒</div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default SkillVideoGenerationView;
