import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, ImagePlus, Loader2, Minus, Plus, RotateCcw, UserRound, Wand2, X } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { assetsApi } from '../../../../services/assets';
import { downloadBlob, productImagesApi } from '../../../../services/productImagesApi';
import type { AIModelAspectRatio, AIModelGender, AIModelParams, AIModelStyle, AIRealPersonBodyFraming, ProductImageResult } from '../../../../types/productImages';
import { notifyImageHistoryUpdated, readImageHistoryByFeature, refreshImageHistory, subscribeImageHistory, type ImageHistoryItem } from '../../../../utils/imageHistory';
import { useRequireAuth } from '../../../../utils/useRequireAuth';
import { ImageUploader } from '../../Common';

type AIModelTaskStatus = 'processing' | 'succeeded' | 'failed';
type AIModelWorkspaceMode = 'virtual' | 'real';
type AIModelLibraryKind = 'virtual' | 'real';

interface AIModelTask {
  localId: string;
  requestId: string;
  status: AIModelTaskStatus;
  outputs: ProductImageResult[];
  error: string;
  prompt: string;
  submittedAt: number;
  modelKind: AIModelLibraryKind;
}

interface AIModelHistoryEntry {
  id: string;
  createdAt: string;
  outputImages: ProductImageResult[];
  modelKind: AIModelLibraryKind;
  settings?: Record<string, any>;
}

interface AIModelPreviewTarget {
  image: ProductImageResult;
  modelKind: AIModelLibraryKind;
  title: string;
}

interface AIModelViewProps {
  embedded?: boolean;
  projectId?: string;
  isVisible?: boolean;
}

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 120;
const OUTPUT_COUNT_MIN = 1;
const OUTPUT_COUNT_MAX = 4;

const ASPECT_RATIOS: AIModelAspectRatio[] = ['3:4', '4:5', '2:3', '1:1', '9:16', '16:9'];
const REAL_PERSON_BODY_FRAMINGS: AIRealPersonBodyFraming[] = ['full_body', 'half_body', 'upper_body'];

const generateLocalId = () => `ai-model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const inferHistoryModelKind = (item: ImageHistoryItem): AIModelLibraryKind => {
  const settingsMode = String(item.settings?.mode || '').trim().toLowerCase();
  const metadataMode = String(item.metadata?.mode || '').trim().toLowerCase();
  if (settingsMode === 'real_person' || metadataMode === 'real_person') return 'real';
  return 'virtual';
};

const mapImageHistoryToAIModelEntry = (item: ImageHistoryItem): AIModelHistoryEntry | null => {
  const modelKind = inferHistoryModelKind(item);
  const outputImages = (Array.isArray(item.metadata?.outputImages)
    ? item.metadata.outputImages
        .map((image: any, index: number) => {
          const imageUrl = String(image?.imageUrl || image?.downloadUrl || item.images[index] || '').trim();
          if (!imageUrl) return null;
          return {
            id: String(image?.id || `ai-model-history-${item.id}-${index}`),
            imageUrl,
            downloadUrl: String(image?.downloadUrl || imageUrl),
            format: String(image?.format || 'jpg'),
            metadata: {
              ...(image?.metadata && typeof image.metadata === 'object' ? image.metadata : {}),
              historyRecordId: item.id,
              aiModelKind: modelKind,
            },
          } as ProductImageResult;
        })
        .filter(Boolean)
    : item.images.map((imageUrl, index) => ({
        id: `ai-model-history-${item.id}-${index}`,
        imageUrl,
        downloadUrl: imageUrl,
        format: 'jpg',
        metadata: {
          historyRecordId: item.id,
          aiModelKind: modelKind,
        },
      } as ProductImageResult))
  ) as ProductImageResult[];

  if (outputImages.length === 0) return null;
  return {
    id: item.id,
    createdAt: item.createdAt,
    outputImages,
    modelKind,
    settings: item.settings,
  };
};

export const AIModelView: React.FC<AIModelViewProps> = ({ embedded = false, projectId }) => {
  const { language } = useLanguage();
  const { requireAuth } = useRequireAuth();
  const isZh = language === 'zh';
  const mountedRef = useRef(true);

  const [workspaceMode, setWorkspaceMode] = useState<AIModelWorkspaceMode>('virtual');
  const [prompt, setPrompt] = useState('');
  const [gender, setGender] = useState<AIModelGender>('female');
  const [style, setStyle] = useState<AIModelStyle>('commercial');
  const [ageRange, setAgeRange] = useState('25-35');
  const [outfit, setOutfit] = useState('');
  const [background, setBackground] = useState('');
  const [negativePrompt, setNegativePrompt] = useState(isZh ? '畸形手指、夸张五官、低清晰度、文字、水印、logo' : 'deformed hands, exaggerated facial features, low resolution, text, watermark, logo');
  const [aspectRatio, setAspectRatio] = useState<AIModelAspectRatio>('3:4');
  const [outputCount, setOutputCount] = useState<1 | 2 | 3 | 4>(1);
  const [realPersonImage, setRealPersonImage] = useState<File | null>(null);
  const [realPersonPrompt, setRealPersonPrompt] = useState('');
  const [realPersonOutfit, setRealPersonOutfit] = useState('');
  const [realPersonBackground, setRealPersonBackground] = useState('');
  const [realPersonStyling, setRealPersonStyling] = useState('');
  const [realPersonBodyFraming, setRealPersonBodyFraming] = useState<AIRealPersonBodyFraming>('full_body');
  const [realPersonNegativePrompt, setRealPersonNegativePrompt] = useState(isZh ? '改变身份特征、脸部变形、肢体畸形、低清晰度、文字、水印、logo' : 'identity drift, distorted face, deformed limbs, low resolution, text, watermark, logo');
  const [tasks, setTasks] = useState<AIModelTask[]>([]);
  const [historyItems, setHistoryItems] = useState<AIModelHistoryEntry[]>([]);
  const [previewTarget, setPreviewTarget] = useState<AIModelPreviewTarget | null>(null);
  const [addingAssetKey, setAddingAssetKey] = useState('');
  const [addedAssetKeys, setAddedAssetKeys] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const labels = useMemo(() => ({
    modeTitle: isZh ? '素材类型' : 'Asset type',
    virtualModel: isZh ? '虚拟模特' : 'Virtual model',
    realPerson: isZh ? '真人素材' : 'Real person',
    prompt: isZh ? '模特要求' : 'Model brief',
    promptPlaceholder: isZh ? '描述模特的性别、年龄、气质、姿态、场景和适合展示的商品类型' : 'Describe gender, age, look, pose, scene, and product fit',
    realUpload: isZh ? '真人图片' : 'Real person image',
    realPrompt: isZh ? '调整要求' : 'Edit brief',
    realPromptPlaceholder: isZh ? '描述需要保留的人物特征，以及希望调整的服饰、背景、姿态或画面风格' : 'Describe what to preserve and how to adjust outfit, background, pose, or visual style',
    realBodyFraming: isZh ? '画面范围' : 'Framing',
    realBodyFramingFull: isZh ? '全身' : 'Full body',
    realBodyFramingHalf: isZh ? '半身' : 'Half body',
    realBodyFramingUpper: isZh ? '上半身' : 'Upper body',
    gender: isZh ? '性别' : 'Gender',
    style: isZh ? '风格' : 'Style',
    ageRange: isZh ? '年龄段' : 'Age range',
    outfit: isZh ? '服装/造型' : 'Outfit / styling',
    background: isZh ? '背景' : 'Background',
    negative: isZh ? '负向提示' : 'Negative prompt',
    ratio: isZh ? '比例' : 'Aspect',
    count: isZh ? '张数' : 'Count',
    generate: isZh ? '生成 AI 模特' : 'Generate AI Model',
    generateReal: isZh ? '生成真人素材' : 'Generate Real Person Asset',
    generating: isZh ? '提交中...' : 'Submitting...',
    emptyTitle: isZh ? '结果会显示在这里' : 'Results will appear here',
    emptyDesc: isZh ? '填写模特要求后点击生成。' : 'Enter a model brief and start generation.',
    processing: isZh ? '生成中...' : 'Generating...',
    failed: isZh ? '生成失败' : 'Generation failed',
    history: isZh ? '历史记录' : 'History',
    noHistory: isZh ? '暂无 AI 模特历史记录' : 'No AI model history yet',
    addToModelLibrary: isZh ? '添加到模特库' : 'Add to Model Library',
    addingToModelLibrary: isZh ? '添加中...' : 'Adding...',
    addedToModelLibrary: isZh ? '已添加' : 'Added',
    addToModelLibrarySuccess: isZh ? '已添加到模特库' : 'Added to model library',
    download: isZh ? '下载' : 'Download',
    clear: isZh ? '清空' : 'Clear',
  }), [isZh]);

  const fieldClassName = 'wb-workbench-field';
  const selectClassName = 'wb-workbench-field cursor-pointer';
  const textareaClassName = 'wb-workbench-field wb-workbench-field--textarea h-36 resize-none overflow-y-auto custom-scroll';
  const workspaceModeIndex = workspaceMode === 'real' ? 1 : 0;
  const realPersonBodyFramingLabelMap: Record<AIRealPersonBodyFraming, string> = {
    full_body: labels.realBodyFramingFull,
    half_body: labels.realBodyFramingHalf,
    upper_body: labels.realBodyFramingUpper,
  };
  const taskImageUrls = useMemo(() => new Set(
    tasks
      .flatMap((task) => task.outputs)
      .map((image) => String(image.downloadUrl || image.imageUrl || '').trim())
      .filter(Boolean)
  ), [tasks]);
  const visibleHistoryItems = useMemo(() => historyItems.filter((item) => {
    const firstImageUrl = String(item.outputImages[0]?.downloadUrl || item.outputImages[0]?.imageUrl || '').trim();
    return !firstImageUrl || !taskImageUrls.has(firstImageUrl);
  }), [historyItems, taskImageUrls]);

  const updateTask = useCallback((localId: string, updater: (task: AIModelTask) => AIModelTask) => {
    setTasks((prev) => prev.map((task) => (task.localId === localId ? updater(task) : task)));
  }, []);

  const loadHistory = useCallback(async () => {
    await refreshImageHistory();
    const nextItems = readImageHistoryByFeature('ai_model')
      .map((item) => mapImageHistoryToAIModelEntry(item))
      .filter((item): item is AIModelHistoryEntry => item !== null);
    setHistoryItems(nextItems);
  }, []);

  useEffect(() => {
    void loadHistory();
    return subscribeImageHistory(() => {
      void loadHistory();
    });
  }, [loadHistory]);

  const pollTask = useCallback(async (localId: string, requestId: string, modelKind: AIModelLibraryKind) => {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
      await delay(POLL_INTERVAL_MS);
      if (!mountedRef.current) return;
      try {
        const result = await productImagesApi.getAIModelResult(requestId);
        if (result.status === 'succeeded') {
          const urls = (result.outputs.length > 0 ? result.outputs : [result.imageUrl]).filter(Boolean);
          const outputs = urls.map((url, index) => ({
            id: `ai-model-${requestId}-${index}`,
            imageUrl: url,
            downloadUrl: url,
            format: 'jpg',
            generationStatus: 'succeeded' as const,
            metadata: {
              historyRecordId: result.historyRecordId || undefined,
              assetId: result.assetId || undefined,
              sortOrder: result.sortOrder,
              aiModelKind: modelKind,
            },
          }));
          updateTask(localId, (task) => ({
            ...task,
            status: outputs.length > 0 ? 'succeeded' : 'failed',
            outputs,
            error: outputs.length > 0 ? '' : (isZh ? '任务完成但没有返回图片' : 'Task completed but no image was returned'),
          }));
          if (outputs.length > 0) {
            void refreshImageHistory().finally(() => notifyImageHistoryUpdated());
          }
          return;
        }
        if (result.status === 'failed') {
          updateTask(localId, (task) => ({
            ...task,
            status: 'failed',
            error: result.error || (isZh ? '上游生成失败' : 'Upstream generation failed'),
          }));
          return;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateTask(localId, (task) => ({
          ...task,
          status: 'failed',
          error: message,
        }));
        return;
      }
    }
    updateTask(localId, (task) => ({
      ...task,
      status: 'failed',
      error: isZh ? '生成超时，请稍后查看历史或重试' : 'Generation timed out. Check history later or retry.',
    }));
  }, [isZh, updateTask]);

  const handleAddToModelLibrary = async (image: ProductImageResult, modelKind: AIModelLibraryKind) => {
    if (!requireAuth()) return;
    const imageUrl = String(image.downloadUrl || image.imageUrl || '').trim();
    if (!imageUrl) return;
    const assetKey = `${modelKind}:${imageUrl}`;
    setError('');
    setNotice('');
    setAddingAssetKey(assetKey);
    try {
      await assetsApi.createAIModelAsset({
        imageUrl,
        modelKind,
        displayName: `${modelKind === 'virtual' ? (isZh ? 'AI虚拟模特' : 'AI Virtual Model') : (isZh ? 'AI真人素材' : 'AI Real Person')} ${new Date().toLocaleDateString()}`,
        historyRecordId: String(image.metadata?.historyRecordId || '').trim(),
        historyAssetId: image.metadata?.assetId,
      });
      setAddedAssetKeys((prev) => new Set(prev).add(assetKey));
      setNotice(labels.addToModelLibrarySuccess);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingAssetKey('');
    }
  };

  const handleGenerate = async () => {
    if (!requireAuth()) return;
    if (workspaceMode === 'real') {
      if (!realPersonImage) {
        setError(isZh ? '请先上传真人图片' : 'Please upload a real person image first');
        return;
      }
      if (!realPersonPrompt.trim()) {
        setError(isZh ? '请先填写调整要求' : 'Please enter an edit brief first');
        return;
      }
      setError('');
      setIsSubmitting(true);
      try {
        const clientHistoryId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `ai-real-person-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const submission = await productImagesApi.submitAIRealPerson({
          image: realPersonImage,
          prompt: realPersonPrompt.trim(),
          outfit: realPersonOutfit,
          background: realPersonBackground,
          styling: realPersonStyling,
          bodyFraming: realPersonBodyFraming,
          negativePrompt: realPersonNegativePrompt,
          aspectRatio,
          outputCount,
        }, {
          projectId,
          clientHistoryId,
        });
        const nextTasks = submission.requests.map((request) => ({
          localId: generateLocalId(),
          requestId: request.requestId,
          status: 'processing' as const,
          outputs: [],
          error: '',
          prompt: realPersonPrompt.trim(),
          submittedAt: Date.now(),
          modelKind: 'real' as const,
        }));
        setTasks((prev) => [...nextTasks, ...prev]);
        nextTasks.forEach((task) => {
          void pollTask(task.localId, task.requestId, task.modelKind);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const safePrompt = prompt.trim();
    if (!safePrompt) {
      setError(isZh ? '请先填写模特要求' : 'Please enter a model brief first');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const clientHistoryId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `ai-model-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const params: AIModelParams = {
        prompt: safePrompt,
        gender,
        style,
        ageRange,
        outfit,
        background,
        negativePrompt,
        aspectRatio,
        outputCount,
      };
      const submission = await productImagesApi.submitAIModel(params, {
        projectId,
        clientHistoryId,
      });
      const nextTasks = submission.requests.map((request) => ({
        localId: generateLocalId(),
        requestId: request.requestId,
        status: 'processing' as const,
        outputs: [],
        error: '',
        prompt: safePrompt,
        submittedAt: Date.now(),
        modelKind: 'virtual' as const,
      }));
      setTasks((prev) => [...nextTasks, ...prev]);
      nextTasks.forEach((task) => {
        void pollTask(task.localId, task.requestId, task.modelKind);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = async (image: ProductImageResult, index: number) => {
    try {
      const blob = await productImagesApi.downloadImageByUrl(image.downloadUrl || image.imageUrl);
      downloadBlob(blob, `ai-model-${Date.now()}-${index + 1}.jpg`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const resetForm = () => {
    setPrompt('');
    setGender('female');
    setStyle('commercial');
    setAgeRange('25-35');
    setOutfit('');
    setBackground('');
    setNegativePrompt(isZh ? '畸形手指、夸张五官、低清晰度、文字、水印、logo' : 'deformed hands, exaggerated facial features, low resolution, text, watermark, logo');
    setAspectRatio('3:4');
    setOutputCount(1);
    setRealPersonImage(null);
    setRealPersonPrompt('');
    setRealPersonOutfit('');
    setRealPersonBackground('');
    setRealPersonStyling('');
    setRealPersonBodyFraming('full_body');
    setRealPersonNegativePrompt(isZh ? '改变身份特征、脸部变形、肢体畸形、低清晰度、文字、水印、logo' : 'identity drift, distorted face, deformed limbs, low resolution, text, watermark, logo');
    setError('');
  };

  const rootClassName = embedded
    ? 'h-full min-h-[720px] bg-transparent text-zinc-100'
    : 'min-h-screen bg-transparent text-zinc-100';

  return (
    <div className={rootClassName}>
      <div className="grid h-full min-h-0 grid-cols-[minmax(340px,420px)_minmax(0,1fr)] gap-6">
        <section className="flex min-h-0 flex-col bg-transparent p-5">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 custom-scroll">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-400">{labels.modeTitle}</div>
              <div className="wb-mode-toggle grid-cols-2">
                <span
                  className="wb-mode-thumb w-1/2"
                  style={{
                    transform: `translateX(${workspaceModeIndex * 100}%)`,
                    backgroundColor: 'rgba(168, 85, 247, 0.28)',
                    boxShadow: '0 1px 8px rgba(168, 85, 247, 0.20)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceMode('virtual');
                    setError('');
                  }}
                  aria-pressed={workspaceMode === 'virtual'}
                  className={[
                    'relative z-10 flex items-center justify-center gap-2 rounded-lg py-2 font-black tracking-wide transition',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50',
                    workspaceMode === 'virtual' ? 'text-purple-100' : 'bg-transparent text-zinc-500 hover:text-purple-300',
                  ].join(' ')}
                >
                  <UserRound className={workspaceMode === 'virtual' ? 'h-4 w-4 text-purple-300' : 'h-4 w-4 text-zinc-500'} />
                  <span className="text-sm">{labels.virtualModel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceMode('real');
                    setError('');
                  }}
                  aria-pressed={workspaceMode === 'real'}
                  className={[
                    'relative z-10 flex items-center justify-center gap-2 rounded-lg py-2 font-black tracking-wide transition',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50',
                    workspaceMode === 'real' ? 'text-purple-100' : 'bg-transparent text-zinc-500 hover:text-purple-300',
                  ].join(' ')}
                >
                  <ImagePlus className={workspaceMode === 'real' ? 'h-4 w-4 text-purple-300' : 'h-4 w-4 text-zinc-500'} />
                  <span className="text-sm">{labels.realPerson}</span>
                </button>
              </div>
            </div>

            {workspaceMode === 'virtual' ? (
              <>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-400">{labels.prompt}</span>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder={labels.promptPlaceholder}
                    className={textareaClassName}
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-zinc-400">{labels.gender}</span>
                    <select
                      value={gender}
                      onChange={(event) => setGender(event.target.value as AIModelGender)}
                      className={selectClassName}
                    >
                      <option value="female">{isZh ? '女性' : 'Female'}</option>
                      <option value="male">{isZh ? '男性' : 'Male'}</option>
                      <option value="neutral">{isZh ? '中性' : 'Neutral'}</option>
                      <option value="no_limit">{isZh ? '不限' : 'No limit'}</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-zinc-400">{labels.style}</span>
                    <select
                      value={style}
                      onChange={(event) => setStyle(event.target.value as AIModelStyle)}
                      className={selectClassName}
                    >
                      <option value="commercial">{isZh ? '电商商业' : 'Commercial'}</option>
                      <option value="studio">{isZh ? '棚拍' : 'Studio'}</option>
                      <option value="lifestyle">{isZh ? '生活方式' : 'Lifestyle'}</option>
                      <option value="fashion">{isZh ? '高级时装' : 'Fashion'}</option>
                      <option value="street">{isZh ? '街拍' : 'Street'}</option>
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-400">{labels.ageRange}</span>
                  <input
                    value={ageRange}
                    onChange={(event) => setAgeRange(event.target.value)}
                    className={fieldClassName}
                    placeholder={isZh ? '例如 25-35' : 'e.g. 25-35'}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-400">{labels.outfit}</span>
                  <input
                    value={outfit}
                    onChange={(event) => setOutfit(event.target.value)}
                    className={fieldClassName}
                    placeholder={isZh ? '例如 简约中性色服装，适合展示商品' : 'e.g. minimal neutral outfit for product display'}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-400">{labels.background}</span>
                  <input
                    value={background}
                    onChange={(event) => setBackground(event.target.value)}
                    className={fieldClassName}
                    placeholder={isZh ? '例如 干净浅色摄影棚背景' : 'e.g. clean light studio background'}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-400">{labels.negative}</span>
                  <input
                    value={negativePrompt}
                    onChange={(event) => setNegativePrompt(event.target.value)}
                    className={fieldClassName}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-400">{labels.realUpload}</span>
                  <ImageUploader
                    maxFiles={1}
                    multiple={false}
                    size="compact"
                    value={realPersonImage ? [realPersonImage] : []}
                    onFilesSelected={(files) => setRealPersonImage(files[0] || null)}
                    onError={setError}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-400">{labels.realPrompt}</span>
                  <textarea
                    value={realPersonPrompt}
                    onChange={(event) => setRealPersonPrompt(event.target.value)}
                    placeholder={labels.realPromptPlaceholder}
                    className={textareaClassName}
                  />
                </label>

                <div className="space-y-2">
                  <div className="text-sm font-semibold text-zinc-400">{labels.realBodyFraming}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {REAL_PERSON_BODY_FRAMINGS.map((framing) => (
                      <button
                        key={framing}
                        type="button"
                        onClick={() => setRealPersonBodyFraming(framing)}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                          realPersonBodyFraming === framing
                            ? 'border-purple-400/70 bg-purple-500/20 text-purple-100'
                            : 'border-white/10 bg-black/20 text-zinc-400 hover:border-purple-400/40 hover:text-zinc-200'
                        }`}
                      >
                        {realPersonBodyFramingLabelMap[framing]}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-400">{labels.outfit}</span>
                  <input
                    value={realPersonOutfit}
                    onChange={(event) => setRealPersonOutfit(event.target.value)}
                    className={fieldClassName}
                    placeholder={isZh ? '例如 更换为浅色西装，保留人物脸部和身形' : 'e.g. switch to a light suit while preserving face and body shape'}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-400">{labels.background}</span>
                  <input
                    value={realPersonBackground}
                    onChange={(event) => setRealPersonBackground(event.target.value)}
                    className={fieldClassName}
                    placeholder={isZh ? '例如 干净摄影棚、街拍场景、品牌空间' : 'e.g. clean studio, street scene, brand space'}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-400">{labels.style}</span>
                  <input
                    value={realPersonStyling}
                    onChange={(event) => setRealPersonStyling(event.target.value)}
                    className={fieldClassName}
                    placeholder={isZh ? '例如 商业棚拍、自然生活方式、时装大片' : 'e.g. commercial studio, natural lifestyle, fashion editorial'}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-400">{labels.negative}</span>
                  <input
                    value={realPersonNegativePrompt}
                    onChange={(event) => setRealPersonNegativePrompt(event.target.value)}
                    className={fieldClassName}
                  />
                </label>
              </>
            )}

            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-400">{labels.ratio}</div>
              <div className="grid grid-cols-3 gap-2">
                {ASPECT_RATIOS.map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      aspectRatio === ratio
                        ? 'border-purple-400/70 bg-purple-500/20 text-purple-100'
                        : 'border-white/10 bg-black/20 text-zinc-400 hover:border-purple-400/40 hover:text-zinc-200'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <span className="text-sm font-semibold text-zinc-400">{labels.count}</span>
              <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-white/10 bg-black/30">
                <button
                  type="button"
                  onClick={() => setOutputCount((Math.max(OUTPUT_COUNT_MIN, outputCount - 1) as 1 | 2 | 3 | 4))}
                  disabled={outputCount <= OUTPUT_COUNT_MIN}
                  className="px-2 text-zinc-400 transition hover:bg-white/5 hover:text-purple-200 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={isZh ? '减少' : 'Decrease'}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  type="number"
                  min={OUTPUT_COUNT_MIN}
                  max={OUTPUT_COUNT_MAX}
                  step={1}
                  value={outputCount}
                  onChange={(event) => {
                    const raw = Number(event.target.value);
                    if (!Number.isFinite(raw)) return;
                    const clamped = Math.min(OUTPUT_COUNT_MAX, Math.max(OUTPUT_COUNT_MIN, Math.round(raw)));
                    setOutputCount(clamped as 1 | 2 | 3 | 4);
                  }}
                  className="w-10 bg-transparent text-center text-sm text-zinc-100 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => setOutputCount((Math.min(OUTPUT_COUNT_MAX, outputCount + 1) as 1 | 2 | 3 | 4))}
                  disabled={outputCount >= OUTPUT_COUNT_MAX}
                  className="px-2 text-zinc-400 transition hover:bg-white/5 hover:text-purple-200 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={isZh ? '增加' : 'Increase'}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                <RotateCcw className="h-4 w-4" />
                {labels.clear}
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isSubmitting || (workspaceMode === 'virtual' && !prompt.trim())}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-purple-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {isSubmitting ? labels.generating : (workspaceMode === 'real' ? labels.generateReal : labels.generate)}
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {notice}
            </div>
          ) : null}
        </section>

        <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-zinc-950/60 p-5">
          <div className="mb-4 flex items-center justify-end gap-3">
            <h2 className="text-lg font-semibold text-white">{labels.history}</h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scroll">
            {tasks.length === 0 && visibleHistoryItems.length === 0 ? (
              <div className="flex h-full min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center">
                <div>
                  <UserRound className="mx-auto mb-4 h-12 w-12 text-zinc-700" />
                  <div className="text-base font-semibold text-zinc-300">{labels.noHistory}</div>
                  <div className="mt-1 text-sm text-zinc-600">{labels.emptyDesc}</div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {tasks.map((task) => {
                  const image = task.outputs[0];
                  const assetKey = image ? `${task.modelKind}:${image.downloadUrl || image.imageUrl}` : '';
                  const isAdding = addingAssetKey === assetKey;
                  const isAdded = assetKey ? addedAssetKeys.has(assetKey) : false;
                  return (
                    <div key={task.localId} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20 transition hover:border-purple-400/30">
                      {task.status === 'processing' ? (
                        <div className="flex aspect-square items-center justify-center bg-black/30">
                          <div className="flex flex-col items-center gap-2 text-zinc-300">
                            <Loader2 className="h-7 w-7 animate-spin text-purple-300" />
                            <div className="text-sm">{labels.processing}</div>
                            <div className="text-sm text-zinc-600">{new Date(task.submittedAt).toLocaleTimeString()}</div>
                          </div>
                        </div>
                      ) : null}

                      {task.status === 'succeeded' && image ? (
                        <button
                          type="button"
                          onClick={() => setPreviewTarget({ image, modelKind: task.modelKind, title: task.prompt })}
                          className="block aspect-square w-full overflow-hidden bg-black/40 text-left"
                        >
                          <img
                            src={image.imageUrl}
                            alt="AI model generation result"
                            className="h-full w-full origin-top object-cover object-top transition duration-300 hover:scale-105"
                          />
                        </button>
                      ) : null}

                      {task.status === 'failed' ? (
                        <div className="flex aspect-square items-center justify-center bg-red-950/30 p-5 text-center">
                          <div>
                            <div className="text-sm font-semibold text-red-200">{labels.failed}</div>
                            <div className="mt-2 line-clamp-4 text-sm text-red-200/70">{task.error || (isZh ? '未知错误' : 'Unknown error')}</div>
                          </div>
                        </div>
                      ) : null}

                      <div className="p-3">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div className="line-clamp-2 text-xs leading-5 text-zinc-500">{task.prompt}</div>
                          <span className="shrink-0 rounded-full border border-purple-400/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-200">
                            {task.modelKind === 'real' ? labels.realPerson : labels.virtualModel}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {task.status === 'succeeded' && image ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleAddToModelLibrary(image, task.modelKind)}
                                disabled={isAdding || isAdded}
                                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-purple-400/30 bg-purple-500/15 px-3 py-2 text-sm font-semibold text-purple-100 transition hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                {isAdded ? labels.addedToModelLibrary : isAdding ? labels.addingToModelLibrary : labels.addToModelLibrary}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownload(image, 0)}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-purple-400"
                                title={labels.download}
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setTasks((prev) => prev.filter((item) => item.localId !== task.localId))}
                            className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-200"
                            aria-label={isZh ? '移除任务卡片' : 'Remove task card'}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {visibleHistoryItems.slice(0, 24).map((item) => {
                  const image = item.outputImages[0];
                  const assetKey = `${item.modelKind}:${image.downloadUrl || image.imageUrl}`;
                  const isAdding = addingAssetKey === assetKey;
                  const isAdded = addedAssetKeys.has(assetKey);
                  return (
                    <div key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20 transition hover:border-purple-400/30">
                      <button
                        type="button"
                        onClick={() => setPreviewTarget({ image, modelKind: item.modelKind, title: new Date(item.createdAt).toLocaleString() })}
                        className="block aspect-square w-full overflow-hidden bg-black/40 text-left"
                      >
                          <img
                            src={image.imageUrl}
                            alt="AI model history result"
                            className="h-full w-full origin-top object-cover object-top transition duration-300 hover:scale-105"
                          />
                      </button>
                      <div className="p-3">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div className="text-xs text-zinc-500">{new Date(item.createdAt).toLocaleDateString()}</div>
                          <span className="rounded-full border border-purple-400/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-200">
                            {item.modelKind === 'real' ? labels.realPerson : labels.virtualModel}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleAddToModelLibrary(image, item.modelKind)}
                            disabled={isAdding || isAdded}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-purple-400/30 bg-purple-500/15 px-3 py-2 text-sm font-semibold text-purple-100 transition hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            {isAdded ? labels.addedToModelLibrary : isAdding ? labels.addingToModelLibrary : labels.addToModelLibrary}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownload(image, 0)}
                            className="inline-flex items-center justify-center rounded-lg bg-purple-500 px-3 py-2 text-white transition hover:bg-purple-400"
                            title={labels.download}
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {previewTarget ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm" onClick={() => setPreviewTarget(null)}>
          <div className="relative max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewTarget(null)}
              className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
              aria-label={isZh ? '关闭预览' : 'Close preview'}
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={previewTarget.image.imageUrl}
              alt="AI model full preview"
              className="max-h-[86vh] max-w-[88vw] rounded-2xl object-contain shadow-2xl"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};
