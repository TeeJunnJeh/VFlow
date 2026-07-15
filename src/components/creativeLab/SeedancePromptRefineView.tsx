import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Copy,
  FileText,
  ImagePlus,
  Loader2,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  videoApi,
  type SeedSkillPromptRefineResponse,
} from '../../services/video';
import {
  makeCreativePromptMaterial,
  revokeCreativePromptMaterials,
  toCreativePromptDisplayUrl,
  uploadCreativePromptMaterials,
  type CreativePromptMaterial,
} from './creativePromptMaterials';

type PromptFormat = 'short' | 'storyboard' | 'one_shot';
type AspectRatio = '9:16' | '16:9' | '1:1';
type Language = '中文' | '英语' | '日语';

const formatOptions: Array<{ value: PromptFormat; label: string }> = [
  { value: 'short', label: '短提示词' },
  { value: 'storyboard', label: '分镜' },
  { value: 'one_shot', label: '一镜到底' },
];
const aspectRatios: AspectRatio[] = ['9:16', '16:9', '1:1'];
const languages: Language[] = ['中文', '英语', '日语'];

type SubmittedTurn = {
  script: string;
  materials: CreativePromptMaterial[];
  format: PromptFormat;
  aspectRatio: AspectRatio;
  duration: number;
  language: Language;
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

const UserTurn = ({ turn }: { turn: SubmittedTurn }) => (
  <div className="flex w-full justify-end">
    <div className="max-w-[720px] rounded-lg bg-zinc-800 px-4 py-3 text-sm leading-6 text-zinc-100">
      <div className="whitespace-pre-wrap">{turn.script}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {turn.materials.map((item) => (
          <span key={item.id} className="inline-flex max-w-[200px] items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-1 text-[11px] text-zinc-300">
            {item.kind === 'video' ? <Video className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
            <span className="truncate">{item.name}</span>
          </span>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-zinc-500">
        {formatOptions.find((item) => item.value === turn.format)?.label} · {turn.aspectRatio} · {turn.duration} 秒 · {turn.language}
      </div>
    </div>
  </div>
);

export const SeedancePromptRefineView: React.FC = () => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const materialsRef = useRef<CreativePromptMaterial[]>([]);

  const [materials, setMaterials] = useState<CreativePromptMaterial[]>([]);
  const [initialScript, setInitialScript] = useState('');
  const [promptFormat, setPromptFormat] = useState<PromptFormat>('storyboard');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [duration, setDuration] = useState(10);
  const [language, setLanguage] = useState<Language>('中文');
  const [submittedTurn, setSubmittedTurn] = useState<SubmittedTurn | null>(null);
  const [result, setResult] = useState<SeedSkillPromptRefineResponse | null>(null);
  const [promptDraft, setPromptDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState('');

  const replaceMaterials = useCallback((next: CreativePromptMaterial[]) => {
    const retained = new Set(next.map((item) => item.previewUrl));
    setMaterials((previous) => {
      previous.forEach((item) => {
        if (item.previewUrl.startsWith('blob:') && !retained.has(item.previewUrl)) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
      return next;
    });
  }, []);

  useEffect(() => { materialsRef.current = materials; }, [materials]);
  useEffect(() => () => revokeCreativePromptMaterials(materialsRef.current), []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [busy, result, statusText]);

  const resetSession = useCallback(() => {
    replaceMaterials([]);
    setInitialScript('');
    setSubmittedTurn(null);
    setResult(null);
    setPromptDraft('');
    setStatusText('');
  }, [replaceMaterials]);

  const handleFiles = useCallback((files: FileList | null) => {
    const next = Array.from(files || []).map((file) => makeCreativePromptMaterial(file));
    if (next.length) {
      setMaterials((previous) => {
        const combined = [...previous, ...next];
        combined.slice(8).forEach((item) => {
          if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
        });
        return combined.slice(0, 8);
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeMaterial = useCallback((id: string) => {
    setMaterials((previous) => {
      const target = previous.find((item) => item.id === id);
      if (target?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
      return previous.filter((item) => item.id !== id);
    });
  }, []);

  const submit = useCallback(async () => {
    if (!user?.id) return setStatusText('请先登录。');
    const script = initialScript.trim();
    if (!script) return setStatusText('请先输入初始脚本。');
    if (!materials.length) return setStatusText('请先上传素材。');

    setBusy(true);
    setStatusText('');
    try {
      const uploaded = await uploadCreativePromptMaterials(materials, setStatusText);
      replaceMaterials(uploaded.materials);
      const response = await videoApi.refineSeedancePrompt({
        assets: uploaded.assets,
        initial_script: script,
        prompt_format: promptFormat,
        aspect_ratio: aspectRatio,
        duration,
        language,
      });
      if (!response.data) throw new Error('Prompt 精修没有返回内容');

      setSubmittedTurn({
        script,
        materials: uploaded.materials,
        format: promptFormat,
        aspectRatio,
        duration,
        language,
      });
      setResult(response.data);
      setPromptDraft(response.data.final_prompt || '');
      setStatusText('');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Prompt 精修失败');
    } finally {
      setBusy(false);
    }
  }, [aspectRatio, duration, initialScript, language, materials, promptFormat, replaceMaterials, user?.id]);

  const hasConversation = Boolean(submittedTurn || result);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <header className="shrink-0 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <h1 className="truncate text-base font-black">prompt精修</h1>
          <button
            type="button"
            onClick={resetSession}
            disabled={busy}
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 disabled:opacity-40"
            title="新建"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="cs-gray-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex min-h-full max-w-4xl flex-col gap-6">
          {!hasConversation ? (
            <div className="flex flex-1 items-center justify-center py-20">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
                <Sparkles className="h-5 w-5 text-zinc-300" />
              </div>
            </div>
          ) : null}

          {submittedTurn ? <UserTurn turn={submittedTurn} /> : null}

          {result ? (
            <AssistantTurn>
              <div className="max-w-3xl">
                <div className="mb-2 text-[11px] font-bold uppercase text-zinc-500">主体声明</div>
                <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-300">
                  {result.subject_statement || '主体声明已生成。'}
                </p>
              </div>
            </AssistantTurn>
          ) : null}

          {result ? (
            <AssistantTurn>
              <div className="max-w-3xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-black">完整 Prompt</div>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(promptDraft)}
                    className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white"
                    title="复制"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <textarea
                  value={promptDraft}
                  onChange={(event) => setPromptDraft(event.target.value)}
                  className="min-h-[300px] w-full resize-y bg-transparent text-sm leading-7 text-zinc-200 outline-none"
                />
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
                    ) : item.kind === 'image' ? (
                      <img src={toCreativePromptDisplayUrl(item.previewUrl)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center"><FileText className="h-5 w-5 text-zinc-500" /></div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeMaterial(item.id)}
                      className="absolute right-1 top-1 rounded-md bg-black/70 p-1 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      title="移除"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <textarea
              value={initialScript}
              onChange={(event) => setInitialScript(event.target.value)}
              placeholder="输入初始脚本"
              className="min-h-[76px] w-full resize-none bg-transparent px-1 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600"
            />

            <div className="mt-2 grid gap-2 border-t border-white/10 pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="min-w-0">
                <div className="grid grid-cols-3 rounded-lg bg-black/30 p-1">
                  {formatOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPromptFormat(option.value)}
                      className={`min-w-0 rounded-md px-2 py-2 text-xs font-bold transition ${
                        promptFormat === option.value
                          ? 'bg-white text-zinc-950'
                          : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
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
                    className="rounded-full p-2 text-zinc-400 hover:bg-white/5 hover:text-white"
                    title="添加素材"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as AspectRatio)} className="h-8 rounded-lg border border-white/10 bg-zinc-950 px-2 text-[11px] font-bold text-zinc-300 outline-none">
                    {aspectRatios.map((item) => <option key={item}>{item}</option>)}
                  </select>
                  <select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="h-8 rounded-lg border border-white/10 bg-zinc-950 px-2 text-[11px] font-bold text-zinc-300 outline-none">
                    <option value={5}>5 秒</option>
                    <option value={10}>10 秒</option>
                  </select>
                  <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} className="h-8 rounded-lg border border-white/10 bg-zinc-950 px-2 text-[11px] font-bold text-zinc-300 outline-none">
                    {languages.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !initialScript.trim() || !materials.length}
                className="flex h-10 w-10 shrink-0 items-center justify-center justify-self-end rounded-full bg-white text-zinc-950 hover:bg-zinc-200 disabled:opacity-40"
                title="精修 Prompt"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SeedancePromptRefineView;
