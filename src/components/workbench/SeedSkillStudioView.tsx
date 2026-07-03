import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  Clapperboard,
  FileText,
  ImagePlus,
  Library,
  Loader2,
  Play,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTasks } from '../../context/TaskContext';
import { assetsApi, type Asset as LibraryAsset } from '../../services/assets';
import { videoApi } from '../../services/video';

type AspectRatio = '9:16' | '16:9' | '1:1';

type MaterialItem = {
  id: string;
  file: File;
  name: string;
  previewUrl: string;
  kind: 'image' | 'video' | 'file';
  uploadedPath?: string;
};

type SeedSkill = {
  seed?: string;
  name?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  recipe?: Record<string, unknown>;
  [key: string]: unknown;
};

const aspectOptions: AspectRatio[] = ['9:16', '16:9', '1:1'];
const durationOptions = [5, 8, 10, 15];

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const toDisplayUrl = (pathOrUrl: string | null | undefined): string => {
  if (!pathOrUrl) return '';
  const raw = String(pathOrUrl).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  const mediaBaseUrl = (import.meta as any).env?.VITE_MEDIA_BASE_URL || '';
  if (mediaBaseUrl && normalized.startsWith('/media/')) return `${mediaBaseUrl}${normalized}`;
  return normalized;
};

const inferKind = (file: File): MaterialItem['kind'] => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
};

const extractUploadedPath = (response: any): string => {
  const data = response?.data || response?.asset || (Array.isArray(response?.assets) ? response.assets[0] : null) || response;
  return String(
    data?.path ||
    data?.url ||
    data?.file_url ||
    data?.media_url ||
    data?.relative_path ||
    ''
  ).trim();
};

const extractProjectId = (response: any): string => String(
  response?.data?.id ||
  response?.data?.project_id ||
  response?.project_id ||
  response?.id ||
  ''
).trim();

const extractTaskId = (response: any): string => String(
  response?.data?.task_id ||
  response?.task_id ||
  response?.data?.id ||
  ''
).trim();

const extractVideoUrl = (result: any): string => String(
  result?.video_url ||
  result?.url ||
  result?.output_url ||
  result?.data?.video_url ||
  result?.data?.url ||
  ''
).trim();

const extractScriptContent = (response: any): any => {
  const data = response?.data || response || {};
  const list = data?.script_contents || data?.scripts || response?.script_contents;
  if (Array.isArray(list) && list.length > 0) return list[0]?.script_content || list[0] || {};
  return data?.script_content || data || {};
};

const buildScriptText = (scriptContent: any): string => {
  const direct = String(
    scriptContent?.creative_card_text ||
    scriptContent?.seedance_motion_prompt ||
    scriptContent?.seedance_prompt ||
    scriptContent?.video_master_script ||
    scriptContent?.full_script ||
    ''
  ).trim();
  if (direct) return direct;

  const shots = Array.isArray(scriptContent?.shots) ? scriptContent.shots : [];
  if (shots.length > 0) {
    return shots
      .map((shot: any, index: number) => {
        const visual = String(shot?.visual || shot?.description || shot?.image_prompt || '').trim();
        const audio = String(shot?.audio || shot?.voiceover || shot?.subtitle || '').trim();
        return [`镜头 ${index + 1}`, visual, audio].filter(Boolean).join('：');
      })
      .join('\n');
  }
  return '';
};

const getSkillDescription = (skill: SeedSkill | null): string => {
  if (!skill) return '';
  return String(skill.description || skill.summary || '').trim();
};

const skillFromAsset = (asset: LibraryAsset): SeedSkill | null => {
  const meta = asset.meta_data || {};
  const seedSkill = meta.seed_skill;
  if (seedSkill && typeof seedSkill === 'object') return seedSkill as SeedSkill;
  if (meta.asset_subtype === 'seed_skill') {
    return {
      seed: String(meta.seed || ''),
      name: String(meta.skill_name || asset.name || 'Seed Skill'),
      summary: String(meta.skill_summary || ''),
      description: String(meta.skill_description || meta.skill_summary || ''),
      tags: Array.isArray(meta.skill_tags) ? meta.skill_tags.map(String) : [],
    };
  }
  return null;
};

export const SeedSkillStudioView: React.FC = () => {
  const { user } = useAuth();
  const { tasks, addTask } = useTasks();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [productText, setProductText] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [duration, setDuration] = useState(8);
  const [generationCount, setGenerationCount] = useState(1);
  const [seedSkill, setSeedSkill] = useState<SeedSkill | null>(null);
  const [scriptText, setScriptText] = useState('');
  const [statusText, setStatusText] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isSavingSkill, setIsSavingSkill] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [librarySkills, setLibrarySkills] = useState<LibraryAsset[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [isVideoPreviewOpen, setIsVideoPreviewOpen] = useState(false);
  const [submittedVideoTaskIds, setSubmittedVideoTaskIds] = useState<Array<string | number>>([]);
  const [activePreviewTaskId, setActivePreviewTaskId] = useState<string | number | null>(null);

  const canSubmit = Boolean(user?.id) && productText.trim().length > 0 && materials.length > 0;
  const imagePaths = materials
    .filter((item) => item.kind === 'image' && item.uploadedPath)
    .map((item) => item.uploadedPath as string);
  const videoPaths = materials
    .filter((item) => item.kind === 'video' && item.uploadedPath)
    .map((item) => item.uploadedPath as string);

  const skillTags = useMemo(() => (
    Array.isArray(seedSkill?.tags) ? seedSkill.tags.map(String).filter(Boolean).slice(0, 8) : []
  ), [seedSkill?.tags]);

  const submittedVideoTasks = useMemo(() => (
    submittedVideoTaskIds
      .map((id) => tasks.find((task) => String(task.id) === String(id)))
      .filter(Boolean) as typeof tasks
  ), [submittedVideoTaskIds, tasks]);

  const activePreviewTask = useMemo(() => {
    if (activePreviewTaskId !== null) {
      const matched = submittedVideoTasks.find((task) => String(task.id) === String(activePreviewTaskId));
      if (matched) return matched;
    }
    return submittedVideoTasks[0] || null;
  }, [activePreviewTaskId, submittedVideoTasks]);

  const activePreviewVideoUrl = extractVideoUrl(activePreviewTask?.result);

  const handleFiles = useCallback((fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const nextItems = files.map((file) => ({
      id: makeId(),
      file,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      kind: inferKind(file),
    }));
    setMaterials((prev) => [...prev, ...nextItems].slice(0, 8));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeMaterial = useCallback((id: string) => {
    setMaterials((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const uploadMaterials = useCallback(async () => {
    const uploaded: MaterialItem[] = [];
    for (const item of materials) {
      if (item.uploadedPath) {
        uploaded.push(item);
        continue;
      }
      setStatusText(`正在上传素材：${item.name}`);
      const response = await assetsApi.uploadTempAsset(item.file);
      const uploadedPath = extractUploadedPath(response);
      if (!uploadedPath) throw new Error(`素材上传成功但没有返回路径：${item.name}`);
      uploaded.push({ ...item, uploadedPath });
    }
    setMaterials(uploaded);
    return uploaded;
  }, [materials]);

  const handleShakeSkill = useCallback(async () => {
    setIsShaking(true);
    setStatusText('正在摇出创作 Skill...');
    try {
      const response = await videoApi.previewSeedSkill({
        product_category: productText.trim() || '当前素材',
        product_description: productText.trim(),
        video_type: 'UGC种草',
        duration,
        aspect_ratio: aspectRatio,
        language: 'zh',
      });
      const skill = response?.data?.seed_skill as SeedSkill | undefined;
      if (!skill?.seed) throw new Error('后端没有返回有效的 Skill');
      setSeedSkill(skill);
      setStatusText('Skill 已生成，可以保存到素材库或继续生成短剧本。');
    } catch (error: any) {
      setStatusText(String(error?.message || 'Skill 生成失败'));
    } finally {
      setIsShaking(false);
    }
  }, [aspectRatio, duration, productText]);

  const handleSaveSkill = useCallback(async () => {
    if (!seedSkill?.seed) {
      setStatusText('请先摇出一个 Skill。');
      return;
    }
    setIsSavingSkill(true);
    setStatusText('正在保存 Skill 到素材库...');
    try {
      await assetsApi.createSeedSkillAsset({
        seed: String(seedSkill.seed),
        seed_skill: seedSkill,
        display_name: String(seedSkill.name || 'Seed Skill'),
        video_type: 'UGC种草',
        product_category: productText.trim(),
        duration,
        aspect_ratio: aspectRatio,
        language: 'zh',
      });
      setStatusText('Skill 已保存到素材库。');
    } catch (error: any) {
      setStatusText(String(error?.message || '保存 Skill 失败，请确认已登录。'));
    } finally {
      setIsSavingSkill(false);
    }
  }, [aspectRatio, duration, productText, seedSkill]);

  const openSkillLibrary = useCallback(async () => {
    setIsLibraryOpen(true);
    setIsLoadingLibrary(true);
    try {
      const assets = await assetsApi.getAssets({ type: 'skill' });
      setLibrarySkills(assets.filter((asset) => Boolean(skillFromAsset(asset))));
    } catch (error: any) {
      setStatusText(String(error?.message || '读取素材库 Skill 失败'));
    } finally {
      setIsLoadingLibrary(false);
    }
  }, []);

  const generateScript = useCallback(async () => {
    if (!user?.id) throw new Error('请先登录。');
    if (!productText.trim()) throw new Error('请填写产品名称、类型和核心卖点。');
    if (materials.length === 0) throw new Error('请至少上传一张商品素材。');
    const uploaded = await uploadMaterials();
    const nextImagePaths = uploaded.filter((item) => item.kind === 'image' && item.uploadedPath).map((item) => item.uploadedPath as string);
    const nextVideoPaths = uploaded.filter((item) => item.kind === 'video' && item.uploadedPath).map((item) => item.uploadedPath as string);
    const activeSkill = seedSkill;

    setIsGeneratingScript(true);
    setStatusText('正在根据 Skill 和素材生成短剧本...');
    try {
      const response = await videoApi.generateScript(user.id, {
        product_category: productText.trim(),
        product_name: productText.trim(),
        visual_style: '写实自然',
        aspect_ratio: aspectRatio,
        user_language: 'zh',
        target_language: 'zh',
        sound: 'on',
        script_count: 1,
        video_type: 'UGC种草',
        reference_assets: uploaded.map((item, index) => ({
          name: item.name,
          material_type: item.kind === 'video' ? 'motion' : 'product',
          media_kind: item.kind,
          media_uri: item.uploadedPath,
          image_path: item.kind === 'image' ? item.uploadedPath : undefined,
          order: index,
        })),
        product_image_path: nextImagePaths[0] || '',
        image_paths: nextImagePaths,
        video_paths: nextVideoPaths,
        script_content: {
          duration,
          shot_number: duration <= 5 ? 3 : 5,
          input: productText.trim(),
          custom: productText.trim(),
          shots: [],
          seed_skill_enabled: Boolean(activeSkill?.seed),
          seed_skill_seed: activeSkill?.seed,
        },
        ...(activeSkill?.seed ? {
          seed_skill_enabled: true,
          seed_skill_seed: activeSkill.seed,
          seed_skill: activeSkill,
        } : {}),
      });
      const content = extractScriptContent(response);
      const text = buildScriptText(content);
      if (!text) throw new Error('短剧本生成完成，但没有解析到可提交给 Seedance 的文案。');
      if (content?.seed_skill && typeof content.seed_skill === 'object') setSeedSkill(content.seed_skill as SeedSkill);
      setScriptText(text);
      setStatusText('短剧本已生成，确认后可以直接生成视频。');
      return text;
    } finally {
      setIsGeneratingScript(false);
    }
  }, [aspectRatio, duration, materials.length, productText, seedSkill, uploadMaterials, user?.id]);

  const handleGenerateScript = useCallback(async () => {
    try {
      await generateScript();
    } catch (error: any) {
      setStatusText(String(error?.message || '生成短剧本失败'));
    }
  }, [generateScript]);

  const handleGenerateVideo = useCallback(async () => {
    if (!user?.id) {
      setStatusText('请先登录。');
      return;
    }
    if (!canSubmit) {
      setStatusText('请先上传素材，并填写产品名称、类型和核心卖点。');
      return;
    }
    setIsGeneratingVideo(true);
    setIsVideoPreviewOpen(true);
    setSubmittedVideoTaskIds([]);
    setActivePreviewTaskId(null);
    try {
      const prompt = scriptText.trim() || await generateScript();
      const uploaded = materials.every((item) => item.uploadedPath) ? materials : await uploadMaterials();
      const nextImagePaths = uploaded.filter((item) => item.kind === 'image' && item.uploadedPath).map((item) => item.uploadedPath as string);
      const nextVideoPaths = uploaded.filter((item) => item.kind === 'video' && item.uploadedPath).map((item) => item.uploadedPath as string);
      let createdCount = 0;
      for (let index = 0; index < generationCount; index += 1) {
        setStatusText(`正在提交 Seedance 2.0 视频任务 ${index + 1}/${generationCount}...`);
        const projectResponse = await videoApi.createProject(user.id, {
          title: `${productText.trim()} Skill 视频${generationCount > 1 ? ` #${index + 1}` : ''}`,
          aspect_ratio: aspectRatio,
          script_content: {
            duration,
            creative_card_text: prompt,
            seed_skill: seedSkill,
          },
        });
        const projectId = extractProjectId(projectResponse);
        if (!projectId) throw new Error('创建项目失败，后端没有返回项目 ID。');
        const response = await videoApi.generate({
          model: 'seedance-2.0',
          prompt,
          prompt_is_final: true,
          disable_prompt_mutation: true,
          product_name: productText.trim(),
          duration,
          aspect_ratio: aspectRatio,
          sound: 'on',
          project_id: projectId,
          image_path: nextImagePaths[0] || '',
          image_paths: nextImagePaths,
          video_paths: nextVideoPaths,
          seed_skill: seedSkill,
          pricing_mode: 'fast',
          user_language: 'zh',
          target_language: 'zh',
        });
        const taskId = extractTaskId(response);
        if (!taskId) throw new Error('视频任务已提交但没有返回 task_id。');
        addTask({
          id: taskId,
          projectId,
          type: 'video_generation',
          status: 'processing',
          name: `${productText.trim()} Skill 视频${generationCount > 1 ? ` #${index + 1}` : ''}`,
          thumbnail: uploaded[0]?.previewUrl,
          createdAt: Date.now(),
          navigateTo: { view: 'history' },
        });
        setSubmittedVideoTaskIds((prev) => [...prev, taskId]);
        setActivePreviewTaskId((prev) => prev ?? taskId);
        createdCount += 1;
      }
      setStatusText(`已提交 ${createdCount} 个 Seedance 2.0 视频任务，可在右下角任务队列或历史记录查看。`);
    } catch (error: any) {
      setStatusText(String(error?.message || '生成视频失败'));
    } finally {
      setIsGeneratingVideo(false);
    }
  }, [addTask, aspectRatio, canSubmit, duration, generateScript, generationCount, materials, productText, scriptText, seedSkill, uploadMaterials, user?.id]);

  return (
    <div className="relative z-10 flex h-full min-h-0 flex-col bg-[#050505] text-zinc-100">
      <header className="shrink-0 border-b border-white/10 px-6 py-5">
        <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-100">
              <Sparkles className="h-3.5 w-3.5" />
              Seedance 2.0
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">Skill 视频生成</h1>
            <p className="mt-1 whitespace-nowrap text-[13px] leading-relaxed text-zinc-400">
              面向非专业用户的简化工作台：上传素材、填写商品卖点，摇出一个可保存和复用的自然语言 Skill，再生成短剧本和视频。
            </p>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-auto px-6 py-5 xl:grid-cols-[minmax(360px,0.92fr)_minmax(420px,1.08fr)]">
        <section className="min-h-0 rounded-lg border border-white/10 bg-zinc-950/70 p-5 shadow-2xl shadow-black/25">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-zinc-500">产品信息</label>
              <textarea
                value={productText}
                onChange={(event) => setProductText(event.target.value)}
                rows={5}
                placeholder="例如：通勤保温杯，适合办公室和户外随身携带。核心卖点是长效保温、不漏水、杯身轻巧、有质感。"
                className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/40 focus:bg-black/45"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-xs font-black uppercase tracking-widest text-zinc-500">上传素材</label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-200 hover:bg-white/10"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  添加
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={(event) => handleFiles(event.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-32 w-full flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-4 py-6 text-center transition hover:border-emerald-300/35 hover:bg-emerald-500/[0.04]"
              >
                <UploadCloud className="mb-2 h-7 w-7 text-emerald-200/80" />
                <span className="text-sm font-bold text-zinc-200">上传商品图片或参考视频</span>
                <span className="mt-1 text-xs text-zinc-500">建议至少 1 张商品图，最多保留 8 个素材</span>
              </button>
              {materials.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {materials.map((item) => (
                    <div key={item.id} className="group relative aspect-[4/5] overflow-hidden rounded-md border border-white/10 bg-zinc-900">
                      {item.kind === 'image' ? (
                        <img src={toDisplayUrl(item.previewUrl)} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <video src={toDisplayUrl(item.previewUrl)} className="h-full w-full object-cover" muted />
                      )}
                      <button
                        type="button"
                        onClick={() => removeMaterial(item.id)}
                        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-black/70 text-zinc-100 opacity-0 transition group-hover:opacity-100"
                        title="移除素材"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                        <div className="truncate text-[10px] font-bold text-zinc-100">{item.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-zinc-500">画面比例</label>
                <div className="grid grid-cols-3 rounded-lg border border-white/10 bg-black/25 p-1">
                  {aspectOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setAspectRatio(option)}
                      className={`h-9 rounded-md text-xs font-black transition ${aspectRatio === option ? 'bg-emerald-400 text-zinc-950' : 'text-zinc-400 hover:bg-white/10 hover:text-zinc-100'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-zinc-500">时长</label>
                <select
                  value={duration}
                  onChange={(event) => setDuration(Number(event.target.value))}
                  className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm font-bold text-zinc-100 outline-none focus:border-emerald-300/40"
                >
                  {durationOptions.map((option) => (
                    <option key={option} value={option}>{option} 秒</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-zinc-500">生成数量</label>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={generationCount}
                  onChange={(event) => setGenerationCount(Math.max(1, Math.min(4, Number(event.target.value) || 1)))}
                  className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm font-bold text-zinc-100 outline-none focus:border-emerald-300/40"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-4 rounded-lg border border-white/10 bg-zinc-950/70 p-5 shadow-2xl shadow-black/25">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openSkillLibrary}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-bold text-zinc-100 transition hover:border-white/20 hover:bg-white/10"
            >
              <Library className="h-4 w-4" />
              从素材库应用 Skill
            </button>
            <button
              type="button"
              onClick={handleShakeSkill}
              disabled={isShaking}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isShaking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              随机摇出一个 Skill
            </button>
            <button
              type="button"
              onClick={handleSaveSkill}
              disabled={!seedSkill?.seed || isSavingSkill}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-bold text-zinc-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingSkill ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
              保存 Skill
            </button>
            <button
              type="button"
              onClick={handleGenerateScript}
              disabled={isGeneratingScript || !canSubmit}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-bold text-zinc-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              生成短剧本
            </button>
            <button
              type="button"
              onClick={handleGenerateVideo}
              disabled={isGeneratingVideo || !canSubmit}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-black text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              生成视频
            </button>
          </div>

          <div className="rounded-lg border border-emerald-300/15 bg-emerald-500/[0.04] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-black text-emerald-100">
                <Sparkles className="h-4 w-4" />
                Skill
              </div>
              {seedSkill?.seed && (
                <span className="rounded-full border border-emerald-300/20 bg-black/25 px-2 py-0.5 text-[10px] font-bold text-emerald-100">
                  #{String(seedSkill.seed).slice(-8)}
                </span>
              )}
            </div>
            {seedSkill ? (
              <div>
                <h2 className="text-base font-black text-white">{seedSkill.name || 'Seed Skill'}</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-200">{getSkillDescription(seedSkill)}</p>
                {skillTags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {skillTags.map((tag) => (
                      <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-zinc-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm leading-7 text-zinc-500">
                点击“随机摇出一个 Skill”后，这里会出现一段可读、可保存、可分享的自然语言创作经验包。
              </p>
            )}
          </div>

          <div className="flex min-h-[260px] flex-1 flex-col rounded-lg border border-white/10 bg-black/25 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-zinc-100">
              <Clapperboard className="h-4 w-4" />
              短剧本 / Seedance Prompt
            </div>
            <textarea
              value={scriptText}
              onChange={(event) => setScriptText(event.target.value)}
              placeholder="生成短剧本后会出现在这里；你也可以在确认后微调，再点击生成视频。"
              className="min-h-[210px] flex-1 resize-none rounded-md border border-white/10 bg-zinc-950/80 p-3 text-sm leading-7 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-300/35"
            />
          </div>

          <div className="min-h-10 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-zinc-400">
            {statusText || '准备就绪。建议演示顺序：上传素材 -> 填写卖点 -> 摇 Skill -> 保存 Skill -> 生成短剧本 -> 生成视频。'}
          </div>
        </section>
      </main>

      {isVideoPreviewOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="grid max-h-[82vh] w-full max-w-5xl grid-cols-1 overflow-hidden rounded-lg border border-white/10 bg-zinc-950 shadow-2xl md:grid-cols-[minmax(360px,1fr)_280px]">
            <div className="flex min-h-[420px] flex-col border-b border-white/10 md:border-b-0 md:border-r">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                <div>
                  <h2 className="text-base font-black text-white">视频预览</h2>
                  <p className="mt-1 text-xs text-zinc-500">Seedance 2.0 任务完成后会在这里显示结果。</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsVideoPreviewOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                  title="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-5">
                {activePreviewVideoUrl ? (
                  <video
                    src={toDisplayUrl(activePreviewVideoUrl)}
                    className="max-h-[58vh] max-w-full rounded-lg bg-black object-contain"
                    controls
                    autoPlay
                    loop
                    playsInline
                  />
                ) : (
                  <div className="flex max-w-sm flex-col items-center text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-500/10">
                      {isGeneratingVideo || activePreviewTask?.status === 'processing' || activePreviewTask?.status === 'pending'
                        ? <Loader2 className="h-6 w-6 animate-spin text-emerald-200" />
                        : <Clapperboard className="h-6 w-6 text-emerald-200" />}
                    </div>
                    <div className="text-sm font-black text-zinc-100">
                      {activePreviewTask?.status === 'failed'
                        ? '生成失败'
                        : activePreviewTask?.status === 'success'
                          ? '视频已生成，正在等待结果地址'
                          : submittedVideoTasks.length > 0
                            ? '视频生成中'
                            : '准备提交视频任务'}
                    </div>
                    <p className="mt-2 text-xs leading-6 text-zinc-500">
                      {statusText || '提交后这里会显示生成进度和最终视频预览。'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <aside className="flex min-h-0 flex-col">
              <div className="border-b border-white/10 px-4 py-4">
                <div className="text-sm font-black text-zinc-100">本次生成</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {submittedVideoTasks.length > 0 ? `${submittedVideoTasks.length} 个任务` : '尚未提交任务'}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-3">
                {submittedVideoTasks.length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-zinc-500">
                    点击“生成视频”后，任务会显示在这里。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {submittedVideoTasks.map((task, index) => {
                      const selected = activePreviewTask && String(activePreviewTask.id) === String(task.id);
                      const videoUrl = extractVideoUrl(task.result);
                      const statusLabel = task.status === 'success'
                        ? '已完成'
                        : task.status === 'failed'
                          ? '失败'
                          : '生成中';
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setActivePreviewTaskId(task.id)}
                          className={`w-full rounded-lg border p-3 text-left transition ${selected ? 'border-emerald-300/40 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-black text-zinc-100">视频 {index + 1}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${task.status === 'success' ? 'bg-emerald-500/15 text-emerald-200' : task.status === 'failed' ? 'bg-red-500/15 text-red-200' : 'bg-sky-500/15 text-sky-200'}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="mt-2 truncate text-[11px] text-zinc-500">{task.name || `Task ${task.id}`}</div>
                          {videoUrl && <div className="mt-2 text-[11px] font-bold text-emerald-200">可预览</div>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="border-t border-white/10 p-3">
                <button
                  type="button"
                  onClick={() => setIsVideoPreviewOpen(false)}
                  className="h-9 w-full rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-zinc-100 hover:bg-white/10"
                >
                  回到编辑
                </button>
              </div>
            </aside>
          </div>
        </div>
      )}

      {isLibraryOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="flex max-h-[78vh] w-full max-w-2xl flex-col rounded-lg border border-white/10 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-base font-black text-white">从素材库应用 Skill</h2>
                <p className="mt-1 text-xs text-zinc-500">仅显示保存为 Seed Skill 的脚本素材。</p>
              </div>
              <button
                type="button"
                onClick={() => setIsLibraryOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-auto p-4">
              {isLoadingLibrary ? (
                <div className="flex items-center gap-2 py-8 text-sm text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在读取素材库...
                </div>
              ) : librarySkills.length === 0 ? (
                <div className="py-8 text-sm text-zinc-500">素材库里还没有保存的 Skill。</div>
              ) : (
                <div className="space-y-2">
                  {librarySkills.map((asset) => {
                    const skill = skillFromAsset(asset);
                    if (!skill) return null;
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => {
                          setSeedSkill(skill);
                          setIsLibraryOpen(false);
                          setStatusText(`已应用素材库 Skill：${skill.name || asset.name}`);
                        }}
                        className="w-full rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-emerald-300/30 hover:bg-emerald-500/[0.05]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-black text-zinc-100">{skill.name || asset.name}</span>
                          <Check className="h-4 w-4 text-emerald-300" />
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-400">{getSkillDescription(skill)}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
