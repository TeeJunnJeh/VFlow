import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Image as ImageIcon, LayoutGrid, PencilLine, RotateCw, Sparkles, UserRound } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { assetsApi } from '../../../../services/assets';
import { videoApi } from '../../../../services/video';
import { ModelSelectorChips, type ModelSelectorValue } from '../../Common/ModelSelectorChips';

type InteractiveStep = 'start' | 'gallery_assets' | 'gallery_review' | 'gallery_model' | 'gallery_next';
type InteractivePendingAction = 'to_gallery_assets' | 'to_board' | null;

interface GalleryInteractiveModeViewProps {
  onSelectBoardEditor: () => void;
}

export const GalleryInteractiveModeView: React.FC<GalleryInteractiveModeViewProps> = ({
  onSelectBoardEditor,
}) => {
  const { language } = useLanguage();
  const isZh = language === 'zh';
  const [step, setStep] = useState<InteractiveStep>('start');
  const [pendingAction, setPendingAction] = useState<InteractivePendingAction>(null);
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
    setPendingAction(choice === 'gallery' ? 'to_gallery_assets' : 'to_board');
  };

  const assetsTitle = isZh ? '我们需要哪些素材？' : 'What assets do we need?';
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

  const PreviewGrid: React.FC<{ urls: string[] }> = ({ urls }) => {
    if (!urls || urls.length < 1) return null;
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {urls.slice(0, 12).map((url) => (
          <div key={url} className="aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/20">
            <img src={url} alt="" className="h-full w-full object-cover" />
          </div>
        ))}
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
        <AnimatePresence
          mode="wait"
          onExitComplete={() => {
            if (pendingAction === 'to_gallery_assets') setStep('gallery_assets');
            if (pendingAction === 'to_board') onSelectBoardEditor();
            setPendingAction(null);
          }}
        >
          {pendingAction !== null ? (
            <motion.div
              key="step-transition"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="flex items-center justify-center py-20"
            >
              <div className="rounded-2xl border border-white/10 bg-black/20 px-6 py-4 text-sm text-zinc-400">
                {isZh ? '正在进入…' : 'Entering…'}
              </div>
            </motion.div>
          ) : step === 'start' ? (
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
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-orange-300">
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
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-orange-300">
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
              className="space-y-8"
            >
              <div className="space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                  {isZh ? '商品套图 · 素材' : 'Gallery · Assets'}
                </div>
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
                  setProductImages(next);
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
                  setModelImages(next);
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
                  setSceneImages(next);
                  e.target.value = '';
                }}
              />

              <div className="grid gap-4 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => productInputRef.current?.click()}
                  className={cardBaseClass}
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-orange-300">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-black tracking-tight text-zinc-100">
                          {isZh ? '上传商品图片' : 'Product Images'}
                        </div>
                        {selectionBadge(productImages.length)}
                      </div>
                      <div className="text-sm text-zinc-500">
                        {isZh ? '建议上传 1–6 张主图/细节图。' : 'Upload 1–6 images.'}
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => modelInputRef.current?.click()}
                  className={cardBaseClass}
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-orange-300">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-black tracking-tight text-zinc-100">
                          {isZh ? '上传模特图片' : 'Model Images'}
                        </div>
                        {selectionBadge(modelImages.length)}
                      </div>
                      <div className="text-sm text-zinc-500">
                        {isZh ? '可选：用于上身/场景融入等效果。' : 'Optional.'}
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => sceneInputRef.current?.click()}
                  className={cardBaseClass}
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-orange-300">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-black tracking-tight text-zinc-100">
                          {isZh ? '上传场景示例图' : 'Scene Examples'}
                        </div>
                        {selectionBadge(sceneImages.length)}
                      </div>
                      <div className="text-sm text-zinc-500">
                        {isZh ? '可选：用于参考氛围/构图。' : 'Optional.'}
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
                      <PreviewGrid urls={productPreviewUrls} />
                    </div>
                  ) : null}

                  {modelPreviewUrls.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                        {isZh ? '模特图片' : 'Model'}
                      </div>
                      <PreviewGrid urls={modelPreviewUrls} />
                    </div>
                  ) : null}

                  {scenePreviewUrls.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                        {isZh ? '场景示例图' : 'Scene'}
                      </div>
                      <PreviewGrid urls={scenePreviewUrls} />
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
                <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                  {isZh ? '商品套图 · 识别' : 'Gallery · Recognition'}
                </div>
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
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                      {isZh ? '商品名称' : 'Product Name'}
                    </div>
                    <div className="mt-1 text-sm font-bold text-zinc-100">
                      {recognized.productName || (isZh ? '未识别' : 'Not recognized')}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                      {isZh ? '商品类目' : 'Category'}
                    </div>
                    <div className="mt-1 text-sm font-bold text-zinc-100">
                      {recognized.productCategory || (isZh ? '未识别' : 'Not recognized')}
                    </div>
                  </div>
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

                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                    {isZh ? '模特信息' : 'Model Info'}
                  </div>
                  <div className="mt-1 text-sm text-zinc-200">
                    {recognized.modelInfo || (isZh ? '未识别' : 'Not recognized')}
                  </div>
                </div>

                <div className="flex items-center justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setStep('gallery_model')}
                    disabled={!hasRecognition}
                    className={[
                      'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition',
                      'border border-orange-500/40 bg-orange-500/15 text-orange-200 hover:bg-orange-500/20',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
                    ].join(' ')}
                  >
                    {isZh ? '确认无误' : 'Confirm'}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : step === 'gallery_model' ? (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
              className="space-y-8"
            >
              <div className="space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                  {isZh ? '商品套图 · 模型' : 'Gallery · Model'}
                </div>
                <StepHeader
                  onBack={() => setStep('gallery_review')}
                  title={modelTitle}
                  subtitle={isZh ? '选择一个生成模型继续。' : 'Pick a model to continue.'}
                />
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/10 px-6 py-6 space-y-6">
                <ModelSelectorChips
                  value={generationModel}
                  onChange={setGenerationModel}
                  orientation="horizontal"
                  label={isZh ? '生成模型' : 'Model'}
                />

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setStep('gallery_next')}
                    className={[
                      'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition',
                      'border border-orange-500/40 bg-orange-500/15 text-orange-200 hover:bg-orange-500/20',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
                    ].join(' ')}
                  >
                    {isZh ? '下一步' : 'Next'}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="step-5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
              className="space-y-8"
            >
              <div className="space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                  {isZh ? '商品套图 · 下一步' : 'Gallery · Next'}
                </div>
                <StepHeader
                  onBack={() => setStep('gallery_model')}
                  title={isZh ? '下一步（待定）' : 'Next (TBD)'}
                  subtitle={isZh ? '这里留给后续流程继续扩展。' : 'Reserved for the next flow.'}
                />
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/10 px-6 py-6 text-sm text-zinc-400">
                {isZh ? '已选择生成模型：' : 'Selected model: '}
                <span className="ml-2 font-bold text-zinc-200">{generationModel}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
