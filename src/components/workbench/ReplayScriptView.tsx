import React, { useMemo, useState } from 'react';
import { Clapperboard, Link2, UploadCloud, Wand2, Loader2, Sparkles } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { AppDialog } from '../common/AppDialog';
import { videoApi, type ReplayReverseScriptData } from '../../services/video';
import { addTransferStationItems } from '../../utils/workbenchTransferStation';
import {
  loadWorkbenchProjectStore,
  WORKBENCH_NEW_PROJECT_TARGET,
  type WorkbenchProjectMeta,
} from '../../utils/workbenchProjectStore';

export type ReplayReusePayload = {
  prompt: string;
  referenceScript: string;
  productCategory: string;
  coreSellingPoints: string;
  targetProjectId?: string | null;
  createNewProject?: boolean;
  newProjectName?: string;
};

type ReplayParseResult = {
  summary: string;
  styleTags: string[];
  styleReferenceText: string;
  suggestedPrompt: string;
  suggestedCategory: string;
  suggestedSellingPoints: string;
};

const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);

interface ReplayScriptViewProps {
  onReuseToWorkbench: (payload: ReplayReusePayload) => void;
}

export const ReplayScriptView: React.FC<ReplayScriptViewProps> = ({ onReuseToWorkbench }) => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [videoUrl, setVideoUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedName, setUploadedName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [result, setResult] = useState<ReplayParseResult | null>(null);
  const [isApplyDialogOpen, setIsApplyDialogOpen] = useState(false);
  const [applyProjectOptions, setApplyProjectOptions] = useState<WorkbenchProjectMeta[]>([]);
  const [applyCurrentProjectId, setApplyCurrentProjectId] = useState('');
  const [applyTargetProjectId, setApplyTargetProjectId] = useState('');
  const [applyProjectName, setApplyProjectName] = useState('');

  const canParse = useMemo(() => videoUrl.trim().length > 0 || Boolean(uploadedFile), [videoUrl, uploadedFile]);

  const scriptSectionLabels = useMemo(() => {
    const lang = String(language || '').trim().toLowerCase();
    if (lang.startsWith('en')) {
      return {
        fullScript: 'Complete Script',
        style: 'Style',
        environment: 'Environment',
        tonePacing: 'Tone & Pacing',
        camera: 'Camera',
        lighting: 'Lighting',
        action: 'Action',
        backgroundSound: 'Background Audio',
        transitionEditing: 'Transition / Editing',
        callToAction: 'Call To Action',
      };
    }
    if (lang.startsWith('ms')) {
      return {
        fullScript: 'Skrip Penuh',
        style: 'Gaya',
        environment: 'Persekitaran',
        tonePacing: 'Nada & Rentak',
        camera: 'Kamera',
        lighting: 'Pencahayaan',
        action: 'Aksi',
        backgroundSound: 'Audio Latar',
        transitionEditing: 'Transisi / Suntingan',
        callToAction: 'Seruan Tindakan',
      };
    }
    if (lang.startsWith('vi')) {
      return {
        fullScript: 'Kich Ban Day Du',
        style: 'Phong Cach',
        environment: 'Moi Truong',
        tonePacing: 'Giong Dieu & Nhip Do',
        camera: 'May Quay',
        lighting: 'Anh Sang',
        action: 'Hanh Dong',
        backgroundSound: 'Am Thanh Nen',
        transitionEditing: 'Chuyen Canh / Dung',
        callToAction: 'Loi Keu Goi Hanh Dong',
      };
    }
    if (lang.startsWith('ko')) {
      return {
        fullScript: '전체 스크립트',
        style: '스타일',
        environment: '환경',
        tonePacing: '톤과 리듬',
        camera: '카메라',
        lighting: '조명',
        action: '동작',
        backgroundSound: '배경음',
        transitionEditing: '전환 / 편집',
        callToAction: '행동 유도',
      };
    }

    return {
      fullScript: '完整脚本',
      style: '风格',
      environment: '环境',
      tonePacing: '语调与节奏',
      camera: '镜头',
      lighting: '光线',
      action: '动作',
      backgroundSound: '背景音',
      transitionEditing: '转场 / 剪辑',
      callToAction: '行动号召',
    };
  }, [language]);

  const buildStructuredReferenceScript = (parseResult: ReplayParseResult) => {
    const sellingPointLines = String(parseResult.suggestedSellingPoints || '')
      .split('\n')
      .map((line) => line.replace(/^\s*\d+[\.、]\s*/, '').trim())
      .filter(Boolean);

    const styleText = parseResult.styleTags.length > 0
      ? parseResult.styleTags.join(' / ')
      : (parseResult.styleReferenceText || parseResult.summary || '').trim();

    const ctaText = sellingPointLines[sellingPointLines.length - 1]
      || (parseResult.suggestedPrompt || '').trim();

    const blocks = [
      [scriptSectionLabels.fullScript, (parseResult.suggestedPrompt || '').trim()],
      [scriptSectionLabels.style, styleText],
      [scriptSectionLabels.environment, (parseResult.suggestedCategory || parseResult.summary || '').trim()],
      [scriptSectionLabels.tonePacing, (parseResult.styleReferenceText || styleText || '').trim()],
      [scriptSectionLabels.camera, (parseResult.styleReferenceText || styleText || '').trim()],
      [scriptSectionLabels.lighting, styleText],
      [scriptSectionLabels.action, sellingPointLines.slice(0, 2).join(' / ') || styleText],
      [scriptSectionLabels.backgroundSound, sellingPointLines[1] || styleText],
      [scriptSectionLabels.transitionEditing, (parseResult.styleReferenceText || styleText || '').trim()],
      [scriptSectionLabels.callToAction, ctaText],
    ];

    return blocks
      .map(([label, value]) => `[${label}]\n${String(value || '').trim() || '-'}`)
      .join('\n\n');
  };

  const buildReuseReferenceScript = (parseResult: ReplayParseResult) => buildStructuredReferenceScript(parseResult);

  const mimicPromptPrefix = t.replay_mimic_prompt_prefix || '模仿下面的语言风格，为xx产品生成相近风格的提示词：';

  const buildReusePayload = (parseResult: ReplayParseResult): ReplayReusePayload => ({
    prompt: parseResult.suggestedPrompt,
    referenceScript: buildReuseReferenceScript(parseResult),
    productCategory: parseResult.suggestedCategory,
    coreSellingPoints: parseResult.suggestedSellingPoints,
  });

  const handleAddToTransferStation = () => {
    if (!result) return;
    const scriptContent = buildStructuredReferenceScript(result);
    const resultLabel = t.replay_result_title || 'Analysis Result';

    const added = addTransferStationItems([
      {
        name: `${resultLabel} ${new Date().toLocaleString()}`,
        fileUrl: '',
        mediaKind: 'script',
        type: 'script',
        source: 'replay',
        scriptContent,
        scriptLanguage: language,
      },
    ], user?.id ?? null);

    if (added.addedCount > 0) {
      setFeedbackMessage(t.wb_transfer_station_add_success || 'Added to transfer station.');
      return;
    }

    setFeedbackMessage(t.wb_transfer_station_add_duplicate || 'Already exists in transfer station.');
  };

  const openReuseToWorkbenchDialog = () => {
    if (!result) return;
    const store = loadWorkbenchProjectStore(user?.id ?? null);
    const sortedProjects = [...store.projects].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    setApplyProjectOptions(sortedProjects);
    setApplyCurrentProjectId(store.currentProjectId || sortedProjects[0]?.id || '');
    setApplyTargetProjectId(store.currentProjectId || sortedProjects[0]?.id || '');
    setApplyProjectName('');
    setIsApplyDialogOpen(true);
  };

  const confirmReuseToWorkbench = () => {
    if (!result) return;

    const createNewProject = applyTargetProjectId === WORKBENCH_NEW_PROJECT_TARGET;
    const targetProjectId = createNewProject ? null : (String(applyTargetProjectId || '').trim() || null);

    onReuseToWorkbench({
      ...buildReusePayload(result),
      targetProjectId,
      createNewProject,
      newProjectName: createNewProject ? (String(applyProjectName || '').trim() || undefined) : undefined,
    });
    setIsApplyDialogOpen(false);
  };

  const normalizeReplayResult = (data: ReplayReverseScriptData, source: string): ReplayParseResult => {
    const fallbackTags = [
      t.replay_tag_rhythm || 'Fast rhythm',
      t.replay_tag_contrast || 'High contrast',
      t.replay_tag_cta || 'Strong CTA',
    ];
    const styleReferenceText = (data.styleReferenceText || '').trim();
    const rawPrompt =
      data.suggestedPrompt ||
      t.replay_mock_prompt ||
      'Follow a high-converting short-video structure: hook in the opening, strengthen trust in the middle, and end with a clear CTA.';
    const normalizedPrompt = rawPrompt.startsWith(mimicPromptPrefix)
      ? rawPrompt
      : `${mimicPromptPrefix}\n${rawPrompt}`;

    return {
      summary: data.summary || `${t.replay_result_summary_prefix || 'Analysis source'}: ${source}`,
      styleTags: Array.isArray(data.styleTags) && data.styleTags.length > 0 ? data.styleTags : fallbackTags,
      styleReferenceText,
      suggestedPrompt: normalizedPrompt,
      suggestedCategory: data.suggestedCategory || t.replay_mock_category || 'Replay video',
      suggestedSellingPoints:
        data.suggestedSellingPoints ||
        t.replay_mock_selling_points ||
        '1. Strong hook in the first 2 seconds\n2. Use close-ups for key selling points\n3. End with a clear CTA and offer',
    };
  };

  const handleParse = async () => {
    if (!canParse) {
      setErrorMessage(t.replay_error_no_input || 'Please provide a video URL or upload a video file.');
      return;
    }
    if (!user?.id) {
      setErrorMessage(t.replay_error_not_logged_in || 'Please sign in first.');
      return;
    }

    setIsParsing(true);
    setResult(null);
    setErrorMessage('');
    setFeedbackMessage('');

    const source = videoUrl.trim() || uploadedName;
    try {
      let response;
      if (videoUrl.trim()) {
        response = await videoApi.reverseScriptFromVideo(user.id, {
          video_url: videoUrl.trim(),
          user_language: language,
        });
      } else {
        const formData = new FormData();
        formData.append('video_file', uploadedFile as File);
        formData.append('user_language', language);
        response = await videoApi.reverseScriptFromVideo(user.id, formData);
      }

      const payload = response?.data;
      if (!payload) {
        throw new Error(t.replay_error_failed || 'Replay analysis failed.');
      }
      setResult(normalizeReplayResult(payload, source));
    } catch (error) {
      const fallback = t.replay_error_failed || 'Replay analysis failed.';
      if (error instanceof Error && error.message.trim()) {
        setErrorMessage(error.message.trim());
      } else {
        setErrorMessage(fallback);
      }
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto custom-scroll px-8 py-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-zinc-200">
              <Clapperboard className="w-5 h-5 text-orange-400" />
              <h1 className="text-lg font-black tracking-wide">{t.replay_page_title || '视频解析反向生成脚本'}</h1>
            </div>
            <LanguageSwitcher />
          </div>
          <p className="mt-2 text-sm text-zinc-400">{t.replay_page_desc || '上传视频或粘贴视频链接，解析其节奏与风格，生成可复用到工作台的脚本提示。'}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-3">{t.replay_video_url_label || '视频链接'}</div>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 focus-within:border-orange-500 transition">
              <Link2 className="w-4 h-4 text-zinc-500" />
              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder={t.replay_video_url_placeholder || '粘贴公开视频链接'}
                className="w-full bg-transparent text-sm text-zinc-200 outline-none"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-3">{t.replay_video_upload_label || '上传视频'}</div>
            <label className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/30 px-3 py-2 cursor-pointer hover:border-orange-500/60 transition">
              <UploadCloud className="w-4 h-4 text-zinc-500" />
              <input
                type="file"
                accept=".mp4,.mov,.mkv,.webm,.avi,.m4v"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) {
                    setUploadedFile(null);
                    setUploadedName('');
                    return;
                  }

                  const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
                  if (!ALLOWED_EXTENSIONS.has(ext)) {
                    setUploadedFile(null);
                    setUploadedName('');
                    setErrorMessage(t.replay_error_invalid_video_type || 'Unsupported video format.');
                    return;
                  }
                  if (file.size > MAX_UPLOAD_BYTES) {
                    setUploadedFile(null);
                    setUploadedName('');
                    setErrorMessage(t.replay_error_file_too_large || 'The uploaded video is too large.');
                    return;
                  }

                  setUploadedFile(file);
                  setUploadedName(file.name);
                  setErrorMessage('');
                }}
              />
              <span className="text-sm text-zinc-300 truncate">{uploadedName || t.replay_video_upload_placeholder || 'Choose a local video file'}</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => void handleParse()}
            disabled={!canParse || isParsing}
            className={`px-4 py-2 rounded-xl text-sm font-bold border transition flex items-center gap-2 ${!canParse || isParsing ? 'opacity-40 cursor-not-allowed border-white/10 text-zinc-500 bg-black/30' : 'border-orange-500/40 text-orange-300 bg-orange-500/10 hover:bg-orange-500/20'}`}
          >
            {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {isParsing ? (t.replay_parse_running || '解析中...') : (t.replay_parse_btn || '解析并生成复刻提示')}
          </button>
        </div>

        {errorMessage && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {errorMessage}
          </div>
        )}

        {feedbackMessage && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {feedbackMessage}
          </div>
        )}

        {result && (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5 space-y-4">
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">{t.replay_result_title || '解析结果'}</div>
            <div className="text-sm text-zinc-300">{result.summary}</div>

            <div className="flex flex-wrap gap-2">
              {result.styleTags.map((tag) => (
                <span key={tag} className="px-2 py-1 rounded-lg text-xs bg-orange-500/10 text-orange-300 border border-orange-500/30">
                  {tag}
                </span>
              ))}
            </div>

            {result.styleReferenceText && (
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="text-xs text-zinc-500 mb-2">{t.replay_result_style_reference_label || '语言风格参考'}</div>
                <div className="text-sm text-zinc-200 whitespace-pre-line">{result.styleReferenceText}</div>
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="text-xs text-zinc-500 mb-2">{t.replay_result_prompt_label || '建议提示词'}</div>
              <div className="text-sm text-zinc-200 whitespace-pre-line">{result.suggestedPrompt}</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="text-xs text-zinc-500 mb-2">{t.wb_reference_script_label || 'Reference Script'}</div>
              <div className="text-sm text-zinc-200 whitespace-pre-line">{buildStructuredReferenceScript(result)}</div>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                className="mr-2 px-4 py-2 rounded-xl text-sm font-bold border border-sky-500/40 text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 transition"
                onClick={handleAddToTransferStation}
              >
                {t.wb_transfer_station_add_btn || 'Add to Transfer Station'}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-sm font-bold border border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 transition flex items-center gap-2"
                onClick={openReuseToWorkbenchDialog}
              >
                <Sparkles className="w-4 h-4" />
                {t.replay_btn_reuse_to_workbench || '复用到工作台'}
              </button>
            </div>
          </div>
        )}
      </div>

      <AppDialog
        isOpen={isApplyDialogOpen}
        title={t.replay_btn_reuse_to_workbench || '复用到工作台'}
        onClose={() => setIsApplyDialogOpen(false)}
        widthClassName="max-w-md"
        footer={(
          <>
            <button
              type="button"
              className="bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-600"
              onClick={() => setIsApplyDialogOpen(false)}
            >
              {t.wb_confirm_cancel || 'Cancel'}
            </button>
            <button
              type="button"
              className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-500"
              onClick={confirmReuseToWorkbench}
            >
              {t.hist_img_apply_confirm || 'Apply'}
            </button>
          </>
        )}
      >
        <div className="space-y-4">
          <div>
            <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.hist_img_apply_select_workspace || '选择工作台'}</div>
            <select
              value={applyTargetProjectId}
              onChange={(e) => setApplyTargetProjectId(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
            >
              {applyProjectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}{project.id === applyCurrentProjectId ? ` (${t.hist_img_apply_current_workspace || '当前'})` : ''}
                </option>
              ))}
              <option value={WORKBENCH_NEW_PROJECT_TARGET}>{t.hist_img_apply_create_new_workspace || '新建工作台'}</option>
            </select>
          </div>

          {applyTargetProjectId === WORKBENCH_NEW_PROJECT_TARGET && (
            <div>
              <div className="text-[11px] text-zinc-500 font-bold mb-1">{t.hist_img_apply_project_name || '工程名称'}</div>
              <input
                value={applyProjectName}
                onChange={(e) => setApplyProjectName(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                maxLength={30}
              />
            </div>
          )}
        </div>
      </AppDialog>
    </div>
  );
};
