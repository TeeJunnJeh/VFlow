import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Download, Image as ImageIcon, LayoutGrid, Minus, PencilLine, Plus, RotateCw, Sparkles, UserRound } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { assetsApi } from '../../../../services/assets';
import { videoApi } from '../../../../services/video';
import { ModelSelectorChips, type ModelSelectorValue } from '../../Common/ModelSelectorChips';
import { GALLERY_RATIOS, ratioDescriptorsForLanguage } from '../../Common';

type InteractiveStep = 'start' | 'gallery_assets' | 'gallery_review' | 'gallery_output_config' | 'gallery_model' | 'gallery_generating' | 'gallery_result';

type OutputType = 'white_bg' | 'scene' | 'selling_point' | 'cover' | 'poster';

interface OutputTypeItem {
  outputType: OutputType;
  enabled: boolean;
  count: number;
  aspectRatio: string;
  resolution: '1k' | '2k' | '4k';
}

interface GeneratedImage {
  requestId: string;
  imageUrl: string;
  outputType: string;
}

const OUTPUT_TYPE_META: Record<OutputType, { zh: string; en: string; zhDesc: string; enDesc: string; accent: string }> = {
  white_bg:  { zh: '白底图', en: 'White Background', zhDesc: '适合主图、标准化电商展示。', enDesc: 'Clean hero shots for catalog use.', accent: 'border-sky-400/30 bg-sky-500/8 text-sky-300' },
  scene:     { zh: '场景图', en: 'Scene',          zhDesc: '带入使用环境与生活方式氛围。', enDesc: 'Contextual lifestyle scene.',      accent: 'border-emerald-400/30 bg-emerald-500/8 text-emerald-300' },
  selling_point: { zh: '卖点图', en: 'Selling Point', zhDesc: '一张图聚焦一个核心卖点。', enDesc: 'Focused on one key benefit.',        accent: 'border-amber-400/30 bg-amber-500/10 text-amber-300' },
  cover:     { zh: '封面图', en: 'Cover',          zhDesc: '适合详情页首屏或合集封面。', enDesc: 'Collection covers and top-of-page.',  accent: 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-300' },
  poster:    { zh: '海报图', en: 'Poster',         zhDesc: '适合促销、活动和长画幅传播。', enDesc: 'Campaign posters and promos.',       accent: 'border-orange-400/30 bg-orange-500/10 text-orange-300' },
};

const OUTPUT_TYPE_ORDER: OutputType[] = ['white_bg', 'scene', 'selling_point', 'cover', 'poster'];

const RESOLUTION_OPTIONS: { value: OutputTypeItem['resolution']; label: string }[] = [
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
];

interface GalleryInteractiveModeViewProps {
  onSelectBoardEditor: () => void;
}

export const GalleryInteractiveModeView: React.FC<GalleryInteractiveModeViewProps> = ({
  onSelectBoardEditor,
}) => {
  const { language } = useLanguage();
  const isZh = language === 'zh';
  const [step, setStep] = useState<InteractiveStep>('start');
  const [productImages, setProductImages] = useState<File[]>([]);
  const [modelImages, setModelImages] = useState<File[]>([]);
  const [sceneImages, setSceneImages] = useState<File[]>([]);
  const [productPreviewUrls, setProductPreviewUrls] = useState<string[]>([]);
  const [modelPreviewUrls, setModelPreviewUrls] = useState<string[]>([]);
  const [scenePreviewUrls, setScenePreviewUrls] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [recognized, setRecognized] = useState<{
    productName: string;
    productCategory: string;
    sellingPoints: string[];
    modelInfo: string;
  }>({
    productName: '',
    productCategory: '',
    sellingPoints: [],
    modelInfo: '',
  });
  const [generationModel, setGenerationModel] = useState<ModelSelectorValue>('nano-banana-pro');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [outputItems, setOutputItems] = useState<OutputTypeItem[]>(() =>
    OUTPUT_TYPE_ORDER.map((ot) => ({ outputType: ot, enabled: false, count: 1, aspectRatio: '1:1', resolution: '1k' }))
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const sceneInputRef = useRef<HTMLInputElement | null>(null);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return isZh ? '早上好' : 'Good morning';
    if (hour >= 12 && hour < 18) return isZh ? '下午好' : 'Good afternoon';
    return isZh ? '晚上好' : 'Good evening';
  }, [isZh]);

  const title = isZh
    ? `${greeting}，我们该从哪里开始？`
    : `${greeting}. Where should we start?`;

  const handleStartChoice = (choice: 'gallery' | 'board') => {
    if (choice === 'gallery') {
      setStep('gallery_assets');
    } else {
      onSelectBoardEditor();
    }
  };

  const handleToggleOutputType = (ot: OutputType) => {
    setOutputItems((prev) => prev.map((item) => (item.outputType === ot ? { ...item, enabled: !item.enabled } : item)));
  };

  const handleOutputCount = (ot: OutputType, delta: number) => {
    setOutputItems((prev) =>
      prev.map((item) => (item.outputType === ot ? { ...item, count: Math.max(1, Math.min(8, item.count + delta)) } : item))
    );
  };

  const handleOutputRatio = (ot: OutputType, ratio: string) => {
    setOutputItems((prev) => prev.map((item) => (item.outputType === ot ? { ...item, aspectRatio: ratio } : item)));
  };

  const handleOutputResolution = (ot: OutputType, resolution: OutputTypeItem['resolution']) => {
    setOutputItems((prev) => prev.map((item) => (item.outputType === ot ? { ...item, resolution } : item)));
  };

  const enabledOutputItems = useMemo(() => outputItems.filter((it) => it.enabled), [outputItems]);
  const hasEnabledOutputs = enabledOutputItems.length > 0;

  const assetsTitle = isZh ? '我们需要一些素材' : 'We need some assets.';
  const assetsSubtitle = isZh ? '点击卡片上传对应图片（可多选）。' : 'Click a card to upload (multi-select supported).';
  const reviewTitle = isZh ? '请确认识别结果' : 'Review the recognition result';
  const modelTitle = isZh ? '选择生成模型' : 'Choose the generation model';

  const hasProductImages = productImages.length > 0;
  const hasAnyAssets = hasProductImages || modelImages.length > 0 || sceneImages.length > 0;
  const hasRecognition = Boolean(
    String(recognized.productName || '').trim()
    || String(recognized.productCategory || '').trim()
    || (Array.isArray(recognized.sellingPoints) && recognized.sellingPoints.length > 0)
    || String(recognized.modelInfo || '').trim()
  );

  const cardBaseClass = [
    'group relative overflow-hidden rounded-3xl border bg-black/20 px-6 py-5 text-left transition',
    'border-white/10 hover:border-orange-500/40 hover:bg-black/30',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
  ].join(' ');

  const selectionBadge = (count: number) => {
    if (count < 1) return null;
    return (
      <span className="shrink-0 rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[11px] font-bold text-orange-200">
        {isZh ? `${count} 张` : `${count}`}
      </span>
    );
  };

  useEffect(() => {
    const urls = productImages.map((f) => URL.createObjectURL(f));
    setProductPreviewUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [productImages]);

  useEffect(() => {
    const urls = modelImages.map((f) => URL.createObjectURL(f));
    setModelPreviewUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [modelImages]);

  useEffect(() => {
    const urls = sceneImages.map((f) => URL.createObjectURL(f));
    setScenePreviewUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [sceneImages]);

  const extractUploadedAssetPath = (uploadResp: any): string | null => {
    if (uploadResp?.assets && Array.isArray(uploadResp.assets) && uploadResp.assets.length > 0) {
      return uploadResp.assets[0].url || uploadResp.assets[0].file_url || uploadResp.assets[0].path || null;
    }
    return uploadResp?.url || uploadResp?.file_url || uploadResp?.path || uploadResp?.data?.url || uploadResp?.data?.path || null;
  };

  const handleAnalyze = async () => {
    if (isAnalyzing) return;
    setAnalyzeError(null);

    if (!hasProductImages) {
      setAnalyzeError(isZh ? '请先上传至少 1 张商品图片' : 'Upload at least one product image');
      return;
    }

    setIsAnalyzing(true);
    try {
      const uploadTargets = productImages.slice(0, 4);
      const imagePaths: string[] = [];
      for (const file of uploadTargets) {
        const uploadResp = await assetsApi.uploadTempAsset(file);
        const path = extractUploadedAssetPath(uploadResp);
        if (path) imagePaths.push(String(path));
      }

      if (imagePaths.length === 0) {
        throw new Error(isZh ? '图片上传失败，请重试' : 'Upload failed, please retry');
      }

      const resp = await videoApi.recognizeProductInfo({ image_paths: imagePaths, output_language: language });
      const data = (resp as any)?.data || (resp as any)?.result || (resp as any)?.payload || resp;

      const nextName = String(data?.product_name || '').trim();
      const nextCategory = String(data?.product_category || '').trim();

      const rawSelling = data?.core_selling_points;
      const nextSellingPoints = Array.isArray(rawSelling)
        ? rawSelling.map((item: any) => String(item || '').trim()).filter(Boolean)
        : String(rawSelling || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

      const nextModelInfoRaw = data?.model_info ?? data?.modelInfo ?? data?.model ?? data?.model_description ?? '';
      const nextModelInfo = typeof nextModelInfoRaw === 'string'
        ? nextModelInfoRaw.trim()
        : Array.isArray(nextModelInfoRaw)
            ? nextModelInfoRaw.map((it: any) => String(it || '').trim()).filter(Boolean).slice(0, 6).join(' / ')
            : String(nextModelInfoRaw || '').trim();

      setRecognized({
        productName: nextName,
        productCategory: nextCategory,
        sellingPoints: nextSellingPoints.slice(0, 5),
        modelInfo: nextModelInfo,
      });
      setStep('gallery_review');
    } catch (err: any) {
      const msg = String(err?.message || '').trim() || (isZh ? '解析失败，请重试' : 'Analyze failed, please retry');
      setAnalyzeError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const collectOutputUrls = (payload: any): string[] => {
    const urls: string[] = [];
    const visited = new Set<any>();
    const queue = [payload];
    const pushUrl = (v: any) => {
      if (typeof v !== 'string') return;
      const raw = v.trim();
      if (!raw) return;
      const normalized = raw.startsWith('//')
        ? `${typeof window !== 'undefined' ? window.location.protocol : 'https:'}${raw}`
        : raw;
      if (
        (normalized.startsWith('http') || normalized.startsWith('/media/'))
        && !urls.includes(normalized)
      ) {
        urls.push(normalized);
      }
    };
    while (queue.length > 0 && urls.length < 8 && visited.size < 80) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      if (Array.isArray(current)) {
        current.forEach((item) => {
          if (typeof item === 'string') {
            pushUrl(item);
          } else if (item && typeof item === 'object') {
            queue.push(item);
          }
        });
        continue;
      }
      if (typeof current !== 'object') continue;
      pushUrl((current as any).url);
      pushUrl((current as any).image_url);
      pushUrl((current as any).file_url);
      pushUrl((current as any).src);
      pushUrl((current as any).path);
      for (const key of ['outputs', 'output', 'images', 'result', 'data']) {
        const v = (current as any)[key];
        if (v && typeof v === 'object') queue.push(v);
      }
    }
    return urls;
  };

  const handleStartGenerate = async () => {
    if (isGenerating) return;
    setGenerateError(null);
    setIsGenerating(true);
    setGeneratedImages([]);
    setStep('gallery_generating');

    try {
      // Upload product images
      const imagePaths: string[] = [];
      const uploadTargets = productImages.slice(0, 4);
      for (const file of uploadTargets) {
        const uploadResp = await assetsApi.uploadTempAsset(file);
        const path = extractUploadedAssetPath(uploadResp);
        if (path) imagePaths.push(String(path));
      }
      if (imagePaths.length === 0) {
        throw new Error(isZh ? '图片上传失败，请重试' : 'Upload failed, please retry');
      }

      const normalizedOutputItems = enabledOutputItems.map((item) => ({
        id: `${item.outputType}-${Date.now()}`,
        enabled: true,
        output_type: item.outputType,
        aspect_ratio: item.aspectRatio,
        resolution: item.resolution,
        count: item.count,
      }));

      const totalCount = enabledOutputItems.reduce((sum, it) => sum + it.count, 0);

      const createResp = await videoApi.generateProductGallery({
        imageModel: generationModel,
        image_paths: imagePaths,
        product_name: recognized.productName,
        product_category: recognized.productCategory,
        core_selling_points: recognized.sellingPoints,
        model_info: recognized.modelInfo || undefined,
        count: totalCount,
        aspect_ratio: enabledOutputItems[0]?.aspectRatio || '1:1',
        resolution: enabledOutputItems[0]?.resolution || '1k',
        output_mode: 'custom',
        output_items: normalizedOutputItems,
        target_language: language,
      });

      const list = (createResp as any)?.data?.requests || (createResp as any)?.requests || [];
      const requests: Array<{ requestId: string; outputType: string }> = (Array.isArray(list) ? list : []).map((r: any) => ({
        requestId: r.request_id || r.id || '',
        outputType: r.type || r.output_type || r.image_type || r.kind || '',
      })).filter((r: any) => r.requestId);
      // Poll each request
      const successStatuses = new Set(['ready', 'success', 'succeeded', 'completed', 'done']);
      const failureStatuses = new Set(['failed', 'error', 'canceled', 'cancelled', 'rejected']);


      const results: GeneratedImage[] = [];
      for (const req of requests) {
        for (let i = 0; i < 60; i += 1) {
          try {
            const statusResp = await videoApi.getProductGalleryResult(req.requestId);
            const data = (statusResp as any)?.data || statusResp;
            const status = String(data?.status || '').trim().toLowerCase();
            const urls = collectOutputUrls(data);
            const upstreamError = String(data?.error || '').trim();

            if (urls.length > 0) {
              results.push({ requestId: req.requestId, imageUrl: urls[0], outputType: req.outputType });
              break;
            }
            if (upstreamError && urls.length === 0) {
              break;
            }
            if (failureStatuses.has(status)) {
              break;
            }
            if (successStatuses.has(status) && urls.length === 0) {
              break;
            }
          } catch {
            // continue polling
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      if (results.length === 0) {
        throw new Error(isZh ? '生成失败，请重试' : 'Generation failed, please retry');
      }

      setGeneratedImages(results);
      setStep('gallery_result');
    } catch (err: any) {
      const msg = String(err?.message || '').trim() || (isZh ? '生成失败，请重试' : 'Generation failed, please retry');
      setGenerateError(msg);
      setStep('gallery_model');
    } finally {
      setIsGenerating(false);
    }
  };

  const PreviewGrid: React.FC<{ urls: string[]; onRemove?: (index: number) => void }> = ({ urls, onRemove }) => {
    if (!urls || urls.length < 1) return null;
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {urls.slice(0, 12).map((url, idx) => (
          <div key={url} className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/20">
            <img src={url} alt="" className="h-full w-full object-cover" />
            {onRemove && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(idx); }}
                className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-zinc-300 opacity-0 transition hover:bg-red-600/80 hover:text-white group-hover:opacity-100"
                aria-label={isZh ? '移除' : 'Remove'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  const handleSaveEdit = () => {
    if (editingField === 'productName') setRecognized((prev) => ({ ...prev, productName: editValue }));
    if (editingField === 'productCategory') setRecognized((prev) => ({ ...prev, productCategory: editValue }));
    if (editingField === 'modelInfo') setRecognized((prev) => ({ ...prev, modelInfo: editValue }));
    setEditingField(null);
  };

  const EditableField: React.FC<{
    label: string;
    fieldKey: string;
    value: string;
    placeholder: string;
    className?: string;
  }> = ({ label, fieldKey, value, placeholder, className }) => {
    const isEditing = editingField === fieldKey;
    return (
      <div className={`group rounded-2xl border border-white/10 bg-black/20 px-4 py-3 ${className ?? ''}`}>
        <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">{label}</div>
        {isEditing ? (
          <input
            autoFocus
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingField(null); }}
            onBlur={handleSaveEdit}
            className="mt-1 w-full rounded-lg border border-orange-500/40 bg-black/30 px-2 py-1 text-sm font-bold text-zinc-100 outline-none focus:border-orange-500/60"
          />
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm font-bold text-zinc-100">{value || placeholder}</span>
            <button
              type="button"
              onClick={() => { setEditingField(fieldKey); setEditValue(value); }}
              className="shrink-0 rounded-full p-1 text-zinc-500 opacity-0 transition hover:bg-white/10 hover:text-orange-300 group-hover:opacity-100 focus:opacity-100 focus:outline-none"
              aria-label={isZh ? '编辑' : 'Edit'}
            >
              <PencilLine className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const StepHeader: React.FC<{ onBack: () => void; title: string; subtitle: string }> = ({ onBack, title, subtitle }) => {
    return (
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={onBack}
          className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-zinc-300 transition hover:border-white/20 hover:bg-black/30 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
          aria-label={isZh ? '返回' : 'Back'}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-3xl font-black tracking-tight text-zinc-100">{title}</h2>
          <p className="text-sm text-zinc-500">{subtitle}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-4xl">
        <AnimatePresence mode="wait">
          {step === 'start' ? (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="min-h-[70vh] flex flex-col justify-center space-y-8"
            >
              <div className="space-y-3">
                <h2 className="text-3xl font-black tracking-tight text-zinc-100">{title}</h2>
                <p className="text-sm text-zinc-500">
                  {isZh ? '点击卡片选择起点，我们会一步步完成设置。' : 'Pick a card to start. We will guide you step by step.'}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleStartChoice('gallery')}
                  className={cardBaseClass}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-orange-300">
                      <LayoutGrid className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-black tracking-tight text-zinc-100">
                        {isZh ? '商品套图' : 'Product Gallery'}
                      </div>
                      <div className="mt-1 text-sm text-zinc-500">
                        {isZh ? '从套图生成开始：上传图片、选择风格、批量输出。' : 'Start with generating product images.'}
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleStartChoice('board')}
                  className={cardBaseClass}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-orange-300">
                      <PencilLine className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-black tracking-tight text-zinc-100">
                        {isZh ? '画板编辑' : 'Board Editor'}
                      </div>
                      <div className="mt-1 text-sm text-zinc-500">
                        {isZh ? '先进入画板，快速拼版、加文案并导出。' : 'Start from the board editor.'}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </motion.div>
          ) : step === 'gallery_assets' ? (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
              className="min-h-[70vh] flex flex-col justify-center space-y-8"
            >
              <div className="space-y-3"> 
                <StepHeader
                  onBack={() => setStep('start')}
                  title={assetsTitle}
                  subtitle={assetsSubtitle}
                />
              </div>

              <input
                ref={productInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const next = Array.from(e.target.files || []);
                  setProductImages((prev) => [...prev, ...next]);
                  e.target.value = '';
                }}
              />
              <input
                ref={modelInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const next = Array.from(e.target.files || []);
                  setModelImages((prev) => [...prev, ...next]);
                  e.target.value = '';
                }}
              />
              <input
                ref={sceneInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const next = Array.from(e.target.files || []);
                  setSceneImages((prev) => [...prev, ...next]);
                  e.target.value = '';
                }}
              />

              <div className="grid gap-4 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => productInputRef.current?.click()}
                  className={cardBaseClass}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-orange-300">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-black tracking-tight text-zinc-100">
                          {isZh ? '商品图片' : 'Product Images'}
                        </div>
                        {selectionBadge(productImages.length)}
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => modelInputRef.current?.click()}
                  className={cardBaseClass}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-orange-300">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-black tracking-tight text-zinc-100">
                          {isZh ? '模特图片' : 'Model Images'}
                        </div>
                        {selectionBadge(modelImages.length)}
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => sceneInputRef.current?.click()}
                  className={cardBaseClass}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-orange-300">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-black tracking-tight text-zinc-100">
                          {isZh ? '场景图片' : 'Scene Images'}
                        </div>
                        {selectionBadge(sceneImages.length)}
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              {hasAnyAssets ? (
                <div className="space-y-4 rounded-3xl border border-white/10 bg-black/10 px-6 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-zinc-200">{isZh ? '预览' : 'Preview'}</div>
                    <div className="text-xs text-zinc-500">
                      {isZh ? '最多展示 12 张缩略图' : 'Showing up to 12 thumbnails'}
                    </div>
                  </div>

                  {productPreviewUrls.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                        {isZh ? '商品图片' : 'Product'}
                      </div>
                      <PreviewGrid
                        urls={productPreviewUrls}
                        onRemove={(idx) => setProductImages((prev) => prev.filter((_, i) => i !== idx))}
                      />
                    </div>
                  ) : null}

                  {modelPreviewUrls.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                        {isZh ? '模特图片' : 'Model'}
                      </div>
                      <PreviewGrid
                        urls={modelPreviewUrls}
                        onRemove={(idx) => setModelImages((prev) => prev.filter((_, i) => i !== idx))}
                      />
                    </div>
                  ) : null}

                  {scenePreviewUrls.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                        {isZh ? '场景示例图' : 'Scene'}
                      </div>
                      <PreviewGrid
                        urls={scenePreviewUrls}
                        onRemove={(idx) => setSceneImages((prev) => prev.filter((_, i) => i !== idx))}
                      />
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between gap-4 pt-2">
                    <div className="min-w-0 text-sm text-zinc-500">
                      {analyzeError ? (
                        <span className="text-red-300">{analyzeError}</span>
                      ) : (
                        <span>{isZh ? '上传商品图片后，可开始解析识别信息。' : 'Upload product images, then start analyzing.'}</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleAnalyze}
                      disabled={!hasProductImages || isAnalyzing}
                      className={[
                        'shrink-0 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition',
                        'border border-orange-500/40 bg-orange-500/15 text-orange-200 hover:bg-orange-500/20',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
                      ].join(' ')}
                    >
                      <RotateCw className={['h-4 w-4', isAnalyzing ? 'animate-spin' : ''].join(' ')} />
                      {isZh ? '开始解析' : 'Analyze'}
                    </button>
                  </div>
                </div>
              ) : null}
            </motion.div>
          ) : step === 'gallery_review' ? (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
              className="space-y-8"
            >
              <div className="space-y-3">
                <StepHeader
                  onBack={() => setStep('gallery_assets')}
                  title={reviewTitle}
                  subtitle={isZh ? '确认无误后进入下一步。' : 'Confirm then continue.'}
                />
              </div>

              <div className="space-y-4 rounded-3xl border border-white/10 bg-black/10 px-6 py-5">
                {productPreviewUrls.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                      {isZh ? '商品图片' : 'Product'}
                    </div>
                    <PreviewGrid urls={productPreviewUrls} />
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <EditableField
                    label={isZh ? '商品名称' : 'Product Name'}
                    fieldKey="productName"
                    value={recognized.productName}
                    placeholder={isZh ? '未识别' : 'Not recognized'}
                  />
                  <EditableField
                    label={isZh ? '商品类目' : 'Category'}
                    fieldKey="productCategory"
                    value={recognized.productCategory}
                    placeholder={isZh ? '未识别' : 'Not recognized'}
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                    {isZh ? '商品卖点' : 'Selling Points'}
                  </div>
                  {recognized.sellingPoints.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {recognized.sellingPoints.map((sp) => (
                        <span
                          key={sp}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-zinc-200"
                        >
                          {sp}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-zinc-500">{isZh ? '未识别' : 'Not recognized'}</div>
                  )}
                </div>

                <EditableField
                  label={isZh ? '模特信息' : 'Model Info'}
                  fieldKey="modelInfo"
                  value={recognized.modelInfo}
                  placeholder={isZh ? '未识别' : 'Not recognized'}
                />

                <div className="flex items-center justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setStep('gallery_output_config')}
                    disabled={!hasRecognition}
                    className={[
                      'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition',
                      'border border-orange-500/40 bg-orange-500/15 text-orange-200 hover:bg-orange-500/20',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
                    ].join(' ')}
                  >
                    {isZh ? '确认无误，下一步' : 'Confirm & Next'}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : step === 'gallery_output_config' ? (
            <motion.div
              key="step-output-config"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
              className="space-y-8"
            >
              <div className="space-y-3">
                <StepHeader
                  onBack={() => setStep('gallery_review')}
                  title={isZh ? '选择输出类型' : 'Choose output types'}
                  subtitle={isZh ? '选择需要生成的图片类型并调整参数。' : 'Select types and adjust parameters.'}
                />
              </div>

              {/* Output type toggle cards */}
              <div className="grid gap-3 md:grid-cols-2">
                {OUTPUT_TYPE_ORDER.map((ot) => {
                  const meta = OUTPUT_TYPE_META[ot];
                  const item = outputItems.find((it) => it.outputType === ot)!;
                  const isEnabled = item.enabled;
                  return (
                    <div key={ot} className="space-y-3">
                      <button
                        type="button"
                        onClick={() => handleToggleOutputType(ot)}
                        className={[
                          'w-full rounded-2xl border px-4 py-3 text-left transition',
                          isEnabled
                            ? `${meta.accent} border-current/40 bg-current/5`
                            : 'border-white/10 bg-black/20 text-zinc-500 hover:border-white/20',
                        ].join(' ')}
                      >
                        <div className="flex items-center gap-3">
                          <div className={[
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                            isEnabled ? 'border-current/50 bg-current/20' : 'border-white/20 bg-white/5',
                          ].join(' ')}>
                            {isEnabled && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-black">{isZh ? meta.zh : meta.en}</div>
                            <div className="mt-0.5 text-xs opacity-70">{isZh ? meta.zhDesc : meta.enDesc}</div>
                          </div>
                        </div>
                      </button>

                      {/* Inline config for enabled items */}
                      {isEnabled && (
                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 space-y-3">
                          {/* Count stepper */}
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-zinc-400">{isZh ? '数量' : 'Count'}</span>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => handleOutputCount(ot, -1)} disabled={item.count <= 1}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-30">
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-6 text-center text-sm font-bold text-zinc-100">{item.count}</span>
                              <button type="button" onClick={() => handleOutputCount(ot, 1)} disabled={item.count >= 8}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-30">
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </div>

                          {/* Aspect ratio */}
                          <div className="space-y-1.5">
                            <span className="text-xs font-bold text-zinc-400">{isZh ? '比例' : 'Ratio'}</span>
                            <div className="flex flex-wrap gap-1.5">
                              {GALLERY_RATIOS.primary.map((ratio) => (
                                <button key={ratio} type="button" onClick={() => handleOutputRatio(ot, ratio)}
                                  className={[
                                    'rounded-lg border px-2.5 py-1 text-xs font-bold transition',
                                    item.aspectRatio === ratio
                                      ? 'border-orange-500/50 bg-orange-500/15 text-orange-200'
                                      : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20',
                                  ].join(' ')}>
                                  {ratio}
                                </button>
                              ))}
                              {GALLERY_RATIOS.more.map((ratio) => (
                                <button key={ratio} type="button" onClick={() => handleOutputRatio(ot, ratio)}
                                  className={[
                                    'rounded-lg border px-2.5 py-1 text-xs font-bold transition',
                                    item.aspectRatio === ratio
                                      ? 'border-orange-500/50 bg-orange-500/15 text-orange-200'
                                      : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20',
                                  ].join(' ')}>
                                  {ratio}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Resolution */}
                          <div className="space-y-1.5">
                            <span className="text-xs font-bold text-zinc-400">{isZh ? '分辨率' : 'Resolution'}</span>
                            <div className="flex gap-1.5">
                              {RESOLUTION_OPTIONS.map((opt) => (
                                <button key={opt.value} type="button" onClick={() => handleOutputResolution(ot, opt.value)}
                                  className={[
                                    'rounded-lg border px-3 py-1 text-xs font-bold transition',
                                    item.resolution === opt.value
                                      ? 'border-orange-500/50 bg-orange-500/15 text-orange-200'
                                      : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20',
                                  ].join(' ')}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setStep('gallery_model')}
                  disabled={!hasEnabledOutputs}
                  className={[
                    'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition',
                    'border border-orange-500/40 bg-orange-500/15 text-orange-200 hover:bg-orange-500/20',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
                  ].join(' ')}
                >
                  {isZh ? '下一步' : 'Next'}
                </button>
              </div>
            </motion.div>
          ) : step === 'gallery_model' ? (
            <motion.div
              key="step-model"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
              className="space-y-8"
            >
              <div className="space-y-3">
                <StepHeader
                  onBack={() => setStep('gallery_output_config')}
                  title={modelTitle}
                  subtitle={isZh ? '选择模型后点击开始生成。' : 'Pick a model then start generating.'}
                />
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/10 px-6 py-6 space-y-6">
                <ModelSelectorChips
                  value={generationModel}
                  onChange={setGenerationModel}
                  orientation="horizontal"
                  label={isZh ? '生成模型' : 'Model'}
                />

                {generateError && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">{generateError}</div>
                )}

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleStartGenerate}
                    disabled={isGenerating}
                    className={[
                      'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black transition',
                      'border border-orange-500/50 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
                    ].join(' ')}
                  >
                    <Sparkles className="h-4 w-4" />
                    {isZh ? '开始生成' : 'Generate'}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : step === 'gallery_generating' ? (
            <motion.div
              key="step-generating"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
              className="min-h-[60vh] flex flex-col items-center justify-center space-y-8"
            >
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  className="flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-500/30 bg-orange-500/10"
                >
                  <Sparkles className="h-8 w-8 text-orange-300" />
                </motion.div>
                <h2 className="text-2xl font-black tracking-tight text-zinc-100">
                  {isZh ? '精彩即将呈现' : 'Something amazing is coming...'}
                </h2>
                <p className="text-sm text-zinc-500">
                  {isZh
                    ? `正在生成 ${enabledOutputItems.reduce((s, it) => s + it.count, 0)} 张图片，请稍候…`
                    : `Generating ${enabledOutputItems.reduce((s, it) => s + it.count, 0)} images, please wait...`}
                </p>
                <div className="mt-4 flex gap-2">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="h-2 w-2 rounded-full bg-orange-400"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="step-result"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
              className="space-y-8"
            >
              <div className="space-y-3">
                <div className="flex items-start gap-4">
                  <button
                    type="button"
                    onClick={() => { setStep('start'); setGeneratedImages([]); }}
                    className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-zinc-300 transition hover:border-white/20 hover:bg-black/30 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
                    aria-label={isZh ? '返回' : 'Back'}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="min-w-0 flex-1 space-y-1">
                    <h2 className="text-3xl font-black tracking-tight text-zinc-100">
                      {isZh ? '生成完成' : 'Generation Complete'}
                    </h2>
                    <p className="text-sm text-zinc-500">
                      {isZh ? `共生成 ${generatedImages.length} 张图片。` : `Generated ${generatedImages.length} images.`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {generatedImages.map((img, idx) => {
                  const meta = OUTPUT_TYPE_META[img.outputType as OutputType];
                  return (
                    <div key={img.requestId || idx} className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/20">
                      <img src={img.imageUrl} alt={img.outputType} className="aspect-square w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
                        <span className="text-xs font-bold text-zinc-200">{meta ? (isZh ? meta.zh : meta.en) : img.outputType}</span>
                      </div>
                      <a
                        href={img.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-zinc-300 opacity-0 transition hover:bg-orange-500/80 hover:text-white group-hover:opacity-100"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => { setStep('gallery_model'); setGeneratedImages([]); setGenerateError(null); }}
                  className={[
                    'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition',
                    'border border-white/10 bg-black/20 text-zinc-300 hover:bg-black/30',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
                  ].join(' ')}
                >
                  <RotateCw className="h-4 w-4" />
                  {isZh ? '重新生成' : 'Regenerate'}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep('start'); setGeneratedImages([]); }}
                  className={[
                    'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition',
                    'border border-orange-500/40 bg-orange-500/15 text-orange-200 hover:bg-orange-500/20',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
                  ].join(' ')}
                >
                  {isZh ? '开始新的' : 'Start New'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
