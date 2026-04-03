import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Plus, Upload, X, Wand2, Minus } from 'lucide-react';
import type { ViewType } from './types';
import { useLanguage } from '../../context/LanguageContext';
import { DropdownSelect } from '../common/DropdownSelect';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { FirstFrameView, SmartRepairView } from '../productImages';
import { AppDialog } from '../common/AppDialog';
import { assetsApi } from '../../services/assets';
import { videoApi } from '../../services/video';

interface ProductImagesViewProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
}

const ProductImagesView: React.FC<ProductImagesViewProps> = ({ activeView, setActiveView }) => {
  const { language, t } = useLanguage();
  const isZh = language === 'zh';
  const tr = (zhText: string, enText: string) => (isZh ? zhText : enText);

  const isProductView =
    activeView === 'product_images_clothing_swap' ||
    activeView === 'product_images_first_frame' ||
    activeView === 'product_images_smart_repair' ||
    activeView === 'product_images_gallery';

  const currentValue: ViewType = isProductView ? activeView : 'product_images_first_frame';
  const panelClassName = (view: ViewType) => (currentValue === view ? 'block' : 'hidden');
  const [firstFrameHeaderActionsContainer, setFirstFrameHeaderActionsContainer] = useState<HTMLDivElement | null>(null);

  const currentHeader = useMemo(() => {
    switch (currentValue) {
      case 'product_images_clothing_swap':
        return {
          title: tr('AI 换装', 'AI Clothing Swap'),
          subtitle: tr('商品服饰智能换装功能开发中', 'AI clothing swap is currently in development.'),
        };
      case 'product_images_smart_repair':
        return {
          title: tr('智能修复', 'Smart Repair'),
          subtitle: tr('基于三类能力中心进行可扩展的智能修图', 'Extensible smart-retouch workspace with three capability groups'),
        };
      case 'product_images_gallery':
        return {
          title: tr('商品套图', 'Product Gallery'),
          subtitle: tr('围绕商品信息与场景配置批量生成电商图', 'Generate e-commerce image sets from product info and scene settings'),
        };
      case 'product_images_first_frame':
      default:
        return {
          title: t.ff_page_title || tr('AI 首帧图生成', 'AI First Frame Generation'),
          subtitle: t.ff_page_subtitle || tr('为视频生成提供起始视觉素材', 'Create starting visuals for video generation'),
        };
    }
  }, [currentValue, t, isZh]);

  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [galleryProductName, setGalleryProductName] = useState('');
  const [galleryCategory, setGalleryCategory] = useState('');
  const [gallerySellingPoints, setGallerySellingPoints] = useState<string[]>([]);
  const [galleryTargetScene, setGalleryTargetScene] = useState<'detail' | 'xiaohongshu' | 'douyin' | 'poster' | 'ads'>('detail');
  const [galleryStyle, setGalleryStyle] = useState<'ecom_clean' | 'lifestyle' | 'premium' | 'festival'>('ecom_clean');
  const [galleryTypeSelections, setGalleryTypeSelections] = useState<Record<'white_bg' | 'scene' | 'selling_point' | 'cover' | 'poster', { enabled: boolean; count: number }>>({
    white_bg: { enabled: true, count: 4 },
    scene: { enabled: false, count: 4 },
    selling_point: { enabled: false, count: 4 },
    cover: { enabled: false, count: 4 },
    poster: { enabled: false, count: 4 },
  });
  const [galleryAspectRatio, setGalleryAspectRatio] = useState<string>('1:1');
  const [galleryResolution, setGalleryResolution] = useState<'1k' | '2k' | '4k'>('1k');
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);
  const [galleryPreviewUrls, setGalleryPreviewUrls] = useState<string[]>([]);
  const [isGalleryAnalyzing, setIsGalleryAnalyzing] = useState(false);
  const [galleryAlert, setGalleryAlert] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });
  const [galleryRightPanel, setGalleryRightPanel] = useState<'preview' | 'history'>('preview');
  const [galleryHistoryItems, setGalleryHistoryItems] = useState<Array<{ id: string; createdAt: string; images: string[]; settings?: { targetScene: string; style: string; aspectRatio: string; resolution: string; productName: string; productCategory: string; sellingPoints: string[]; typeSelections: Record<string, { enabled: boolean; count: number }>; uploadedImagePaths?: string[] } }>>([]);
  const [isGalleryGenerating, setIsGalleryGenerating] = useState(false);
  const [galleryPreviewImageUrl, setGalleryPreviewImageUrl] = useState<string | null>(null);
  // Backend image paths restored from history "re-generate" — allows skipping upload
  const [galleryRestoredImagePaths, setGalleryRestoredImagePaths] = useState<string[]>([]);
  const [galleryPreviewItems, setGalleryPreviewItems] = useState<
    Array<{ localId: string; requestId: string; status: 'created' | 'processing' | 'succeeded' | 'failed'; imageUrl?: string; error?: string }>
  >([]);

  const GALLERY_HISTORY_KEY = 'vflow_product_gallery_history';
  const galleryPollAbortRef = useRef(false);
  const galleryPollRunIdRef = useRef<number>(0);

  const closeGalleryAlert = () => setGalleryAlert((prev) => ({ ...prev, open: false }));
  const openGalleryAlert = (message: string, title?: string) =>
    setGalleryAlert({
      open: true,
      title: title || tr('提示', 'Notice'),
      message,
    });

  const galleryConfirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const [galleryConfirm, setGalleryConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
    okLabel: string;
    cancelLabel: string;
  }>({
    open: false,
    title: '',
    message: '',
    okLabel: '',
    cancelLabel: '',
  });

  const closeGalleryConfirm = (value: boolean) => {
    setGalleryConfirm((prev) => ({ ...prev, open: false }));
    const resolver = galleryConfirmResolverRef.current;
    galleryConfirmResolverRef.current = null;
    if (resolver) resolver(value);
  };

  const closeGalleryImagePreview = () => setGalleryPreviewImageUrl(null);
  const openGalleryImagePreview = (url: string) => {
    const cleaned = String(url || '').trim();
    if (!cleaned) return;
    setGalleryPreviewImageUrl(cleaned);
  };

  const openGalleryConfirm = (message: string, opts?: { title?: string; okLabel?: string; cancelLabel?: string }) =>
    new Promise<boolean>((resolve) => {
      galleryConfirmResolverRef.current = resolve;
      setGalleryConfirm({
        open: true,
        title: opts?.title || tr('确认', 'Confirm'),
        message,
        okLabel: opts?.okLabel || tr('确定', 'OK'),
        cancelLabel: opts?.cancelLabel || tr('取消', 'Cancel'),
      });
    });

  useEffect(() => {
    const urls = galleryImages.map((f) => URL.createObjectURL(f));
    setGalleryPreviewUrls(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [galleryImages]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GALLERY_HISTORY_KEY);
      if (!raw) {
        setGalleryHistoryItems([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setGalleryHistoryItems([]);
        return;
      }
      const normalized = parsed
        .map((item: any) => {
          const id = String(item?.id || '').trim();
          const createdAt = String(item?.createdAt || '').trim();
          const images = Array.isArray(item?.images)
            ? item.images.map((x: any) => String(x || '').trim()).filter(Boolean)
            : [];
          if (!id || !createdAt || images.length === 0) return null;
          const settings = item?.settings && typeof item.settings === 'object' ? item.settings : undefined;
          return { id, createdAt, images, settings };
        })
        .filter(Boolean) as Array<{ id: string; createdAt: string; images: string[]; settings?: { targetScene: string; style: string; aspectRatio: string; resolution: string; productName: string; productCategory: string; sellingPoints: string[]; typeSelections: Record<string, { enabled: boolean; count: number }> } }>;
      setGalleryHistoryItems(normalized);
    } catch {
      setGalleryHistoryItems([]);
    }
  }, []);

  useEffect(() => {
    galleryPollAbortRef.current = false;
    return () => {
      galleryPollAbortRef.current = true;
    };
  }, []);

  // Restore settings from history "re-generate" flow
  const GALLERY_RESTORE_KEY = 'vflow_gallery_restore_settings';
  useEffect(() => {
    if (activeView !== 'product_images_gallery') return;
    try {
      const raw = localStorage.getItem(GALLERY_RESTORE_KEY);
      if (!raw) return;
      localStorage.removeItem(GALLERY_RESTORE_KEY);
      const s = JSON.parse(raw) as Record<string, any>;
      if (s.targetScene) setGalleryTargetScene(s.targetScene);
      if (s.style) setGalleryStyle(s.style);
      if (s.aspectRatio) setGalleryAspectRatio(s.aspectRatio);
      if (s.resolution) setGalleryResolution(s.resolution);
      if (s.productName) setGalleryProductName(s.productName);
      if (s.productCategory) setGalleryCategory(s.productCategory);
      if (Array.isArray(s.sellingPoints) && s.sellingPoints.length > 0) setGallerySellingPoints(s.sellingPoints);
      if (s.typeSelections && typeof s.typeSelections === 'object') setGalleryTypeSelections(s.typeSelections);
      // Restore backend image paths so generation can skip the upload step
      if (Array.isArray(s.uploadedImagePaths) && s.uploadedImagePaths.length > 0) {
        const paths = s.uploadedImagePaths.map((p: any) => String(p || '').trim()).filter(Boolean);
        setGalleryRestoredImagePaths(paths);
      }
      // Switch right-panel to preview so user sees the form ready to generate
      setGalleryRightPanel('preview');
    } catch { /* ignore */ }
  }, [activeView]);

  const gallerySupportedFormatTip = tr(
    '文件格式不支持，仅支持图片：.jpg .jpeg .png .webp',
    'Unsupported file format. Only images are supported: .jpg .jpeg .png .webp'
  );

  const isSupportedGalleryImageFile = (file: File) => {
    const name = String(file?.name || '').toLowerCase();
    if (!name) return false;
    if (!/\.(jpe?g|png|webp)$/i.test(name)) return false;
    const type = String(file?.type || '');
    if (type && !type.startsWith('image/')) return false;
    return true;
  };

  const extractUploadedAssetPath = (uploadResp: any): string | null => {
    if (uploadResp?.assets && Array.isArray(uploadResp.assets) && uploadResp.assets.length > 0) {
      return uploadResp.assets[0].url || uploadResp.assets[0].file_url || uploadResp.assets[0].path || null;
    }
    return uploadResp?.url || uploadResp?.file_url || uploadResp?.path || uploadResp?.data?.url || uploadResp?.data?.path || null;
  };

  const handleGalleryAiAnalyze = async () => {
    if (isGalleryAnalyzing) return;

    const hasNewImages = galleryImages.length > 0;
    const hasRestoredPaths = galleryRestoredImagePaths.length > 0;

    if (!hasNewImages && !hasRestoredPaths) {
      openGalleryAlert(tr('请先上传至少 1 张商品图片。', 'Please upload at least 1 product image.'));
      return;
    }

    const hasExisting = Boolean(
      galleryProductName.trim() ||
      galleryCategory.trim() ||
      gallerySellingPoints.some((p) => String(p || '').trim())
    );

    if (hasExisting) {
      const ok = await openGalleryConfirm(
        tr('是否使用新的识别结果覆盖当前内容？', 'Overwrite current fields with new AI results?'),
        {
          title: tr('覆盖确认', 'Overwrite confirmation'),
          okLabel: tr('覆盖', 'Overwrite'),
          cancelLabel: tr('取消', 'Cancel'),
        }
      );
      if (!ok) return;
    }

    setIsGalleryAnalyzing(true);
    try {
      let imagePaths: string[] = [];

      if (hasNewImages) {
        const uploadTargets = galleryImages.slice(0, 4);
        if (uploadTargets.some((f) => !isSupportedGalleryImageFile(f))) {
          openGalleryAlert(gallerySupportedFormatTip);
          setIsGalleryAnalyzing(false);
          return;
        }
        for (const file of uploadTargets) {
          const uploadResp = await assetsApi.uploadTempAsset(file);
          const path = extractUploadedAssetPath(uploadResp);
          if (path) imagePaths.push(String(path));
        }
      } else {
        // Use restored backend paths directly
        imagePaths = [...galleryRestoredImagePaths];
      }

      if (imagePaths.length === 0) {
        throw new Error(tr('图片上传失败，请重试。', 'Image upload failed. Please try again.'));
      }

      const resp = await videoApi.recognizeProductInfo({ image_paths: imagePaths, output_language: language });
      const data = resp?.data || resp?.result || resp?.payload || resp;

      const nextName = String(data?.product_name || '').trim();
      const nextCategory = String(data?.product_category || '').trim();

      const rawSelling = data?.core_selling_points;
      const nextSellingPoints = Array.isArray(rawSelling)
        ? rawSelling.map((item: any) => String(item || '').trim()).filter(Boolean)
        : String(rawSelling || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

      setGalleryProductName(nextName);
      setGalleryCategory(nextCategory);
      setGallerySellingPoints(nextSellingPoints.slice(0, 5));
    } catch (err: any) {
      const rawMsg = String(err?.message || '').trim();
      const isTypeInvalid = rawMsg.includes('文件格式不支持') || rawMsg.toLowerCase().includes('file_type_invalid');
      const message = isTypeInvalid
        ? gallerySupportedFormatTip
        : String(rawMsg || tr('识别失败，请重试。', 'Recognition failed. Please try again.'));

      openGalleryAlert(message, tr('识别失败', 'Recognition failed'));
    } finally {
      setIsGalleryAnalyzing(false);
    }
  };

  const handleGalleryGenerate = async () => {
    if (isGalleryGenerating) return;

    // Determine whether we have new uploaded images or restored backend paths
    const hasNewImages = galleryImages.length > 0;
    const hasRestoredPaths = galleryRestoredImagePaths.length > 0;

    if (!hasNewImages && !hasRestoredPaths) {
      openGalleryAlert(tr('请先上传至少 1 张商品图片。', 'Please upload at least 1 product image.'));
      return;
    }

    const uploadTargets = galleryImages.slice(0, 3);
    if (hasNewImages && uploadTargets.some((f) => !isSupportedGalleryImageFile(f))) {
      openGalleryAlert(gallerySupportedFormatTip);
      return;
    }

    const totalCount = Object.values(galleryTypeSelections)
      .filter((item) => item.enabled)
      .reduce((sum, item) => sum + (Number(item.count) || 0), 0);

    if (totalCount <= 0) {
      openGalleryAlert(tr('请至少选择一种生成类型。', 'Please select at least one generation type.'));
      return;
    }

    const aspectRatio = galleryAspectRatio === 'default' ? '1:1' : galleryAspectRatio;

    const sellingPoints = gallerySellingPoints
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .slice(0, 5);

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const settingsSnapshot = {
      targetScene: galleryTargetScene,
      style: galleryStyle,
      aspectRatio: aspectRatio,
      resolution: galleryResolution,
      productName: galleryProductName.trim(),
      productCategory: galleryCategory.trim(),
      sellingPoints,
      typeSelections: { ...galleryTypeSelections },
      uploadedImagePaths: [] as string[],
    };

    const appendHistory = (urls: string[]) => {
      const images = urls.map((u) => String(u || '').trim()).filter(Boolean);
      if (images.length === 0) return;

      const nextItem = {
        id: `pg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toLocaleString(),
        images,
        settings: settingsSnapshot,
      };

      setGalleryHistoryItems((prev) => {
        const next = [nextItem, ...prev].slice(0, 50);
        try {
          localStorage.setItem(GALLERY_HISTORY_KEY, JSON.stringify(next));
        } catch {
          void 0;
        }
        return next;
      });
    };

    // Collect all successful image URLs across all poll tasks
    const collectedImageUrls: string[] = [];

    const runId = Date.now();
    galleryPollRunIdRef.current = runId;

    setIsGalleryGenerating(true);
    setGalleryRightPanel('preview');
    setGalleryPreviewItems([]);

    try {
      let imagePaths: string[] = [];

      if (hasNewImages) {
        // User uploaded new images → upload them to get backend paths
        for (const file of uploadTargets) {
          const uploadResp = await assetsApi.uploadTempAsset(file);
          const path = extractUploadedAssetPath(uploadResp);
          if (path) imagePaths.push(String(path));
        }
      } else {
        // No new images but we have restored paths from history → reuse them
        imagePaths = [...galleryRestoredImagePaths];
      }

      if (imagePaths.length === 0) {
        throw new Error(tr('图片上传失败，请重试。', 'Image upload failed. Please try again.'));
      }

      // Save uploaded paths into the snapshot so history re-generate can reference them
      settingsSnapshot.uploadedImagePaths = [...imagePaths];
      // Clear restored paths once consumed
      setGalleryRestoredImagePaths([]);

      const createResp = await videoApi.generateProductGallery({
        image_paths: imagePaths,
        aspect_ratio: aspectRatio,
        resolution: galleryResolution,
        count: totalCount,
        product_name: galleryProductName.trim(),
        product_category: galleryCategory.trim(),
        core_selling_points: sellingPoints,
        target_scene: galleryTargetScene,
        style: galleryStyle,
        type_selections: galleryTypeSelections as any,
      });

      const list = (createResp as any)?.data?.requests || (createResp as any)?.requests || [];
      const requests = Array.isArray(list) ? list : [];

      const initial = requests
        .map((r: any, idx: number) => {
          const requestId = String(r?.request_id || r?.id || '').trim();
          if (!requestId) return null;
          return {
            localId: `pg-prev-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            requestId,
            status: 'created' as const,
          };
        })
        .filter(Boolean) as Array<{ localId: string; requestId: string; status: 'created' | 'processing' | 'succeeded' | 'failed'; imageUrl?: string; error?: string }>;

      if (initial.length === 0) {
        throw new Error(tr('创建生成任务失败，请重试。', 'Failed to create generation tasks.'));
      }

      setGalleryPreviewItems(initial);

      const pollOne = async (requestId: string) => {
        setGalleryPreviewItems((prev) =>
          prev.map((it) => (it.requestId === requestId ? { ...it, status: 'processing' as const } : it))
        );

        for (let i = 0; i < 120; i += 1) {
          if (galleryPollAbortRef.current) return;
          if (galleryPollRunIdRef.current !== runId) return;

          const statusResp = await videoApi.getProductGalleryResult(requestId);
          const data = (statusResp as any)?.data || statusResp;
          const status = String(data?.status || '').trim().toLowerCase();
          const outputs = Array.isArray(data?.outputs) ? data.outputs : [];

          if (outputs.length > 0 && status !== 'failed' && status !== 'error') {
            const url = String(outputs[0] || '').trim();
            setGalleryPreviewItems((prev) =>
              prev.map((it) => (it.requestId === requestId ? { ...it, status: 'succeeded' as const, imageUrl: url } : it))
            );
            // Collect URL for batch history write
            outputs.forEach((o: any) => {
              const u = String(o || '').trim();
              if (u) collectedImageUrls.push(u);
            });
            return;
          }

          if (['failed', 'error', 'canceled', 'cancelled'].includes(status)) {
            setGalleryPreviewItems((prev) =>
              prev.map((it) => (it.requestId === requestId ? { ...it, status: 'failed' as const, error: tr('生成失败', 'Failed') } : it))
            );
            return;
          }

          await sleep(1500);
        }

        setGalleryPreviewItems((prev) =>
          prev.map((it) => (it.requestId === requestId ? { ...it, status: 'failed' as const, error: tr('生成超时', 'Timeout') } : it))
        );
      };

      await Promise.all(initial.map((it) => pollOne(it.requestId)));

      // Write one history entry for the entire generation task
      if (collectedImageUrls.length > 0) {
        appendHistory(collectedImageUrls);
      }
    } catch (err: any) {
      openGalleryAlert(String(err?.message || tr('生成失败，请重试。', 'Generation failed. Please try again.')));
    } finally {
      if (galleryPollRunIdRef.current === runId) {
        setIsGalleryGenerating(false);
      }
    }
  };

  return (
    <div className="flex flex-col h-full z-10">
      <AppDialog
        isOpen={galleryAlert.open}
        title={galleryAlert.title}
        onClose={closeGalleryAlert}
        widthClassName="max-w-sm"
        footer={
          <button
            type="button"
            onClick={closeGalleryAlert}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-black hover:bg-orange-400 transition"
          >
            {tr('确定', 'OK')}
          </button>
        }
      >
        {galleryAlert.message}
      </AppDialog>

      <AppDialog
        isOpen={galleryConfirm.open}
        title={galleryConfirm.title}
        onClose={() => closeGalleryConfirm(false)}
        widthClassName="max-w-sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => closeGalleryConfirm(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition"
            >
              {galleryConfirm.cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => closeGalleryConfirm(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-black hover:bg-orange-400 transition"
            >
              {galleryConfirm.okLabel}
            </button>
          </>
        }
      >
        {galleryConfirm.message}
      </AppDialog>

      <AppDialog
        isOpen={Boolean(galleryPreviewImageUrl)}
        title={tr('图片预览', 'Image Preview')}
        onClose={closeGalleryImagePreview}
        widthClassName="max-w-5xl"
        footer={
          <button
            type="button"
            onClick={closeGalleryImagePreview}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition"
          >
            {tr('关闭', 'Close')}
          </button>
        }
      >
        {galleryPreviewImageUrl ? (
          <div className="w-full flex items-center justify-center">
            <img src={galleryPreviewImageUrl} alt={tr('预览图片', 'Preview image')} className="max-h-[70vh] w-auto object-contain rounded-xl border border-white/10" />
          </div>
        ) : null}
      </AppDialog>

      <header className="flex justify-between gap-6 px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            {currentHeader.title}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            {currentHeader.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <LanguageSwitcher />
          {currentValue === 'product_images_first_frame' && <div ref={setFirstFrameHeaderActionsContainer} className="flex items-center gap-3" />}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto custom-scroll px-10 py-6">
        <div className={panelClassName('product_images_clothing_swap')}>
          <div className="rounded-2xl border border-white/5 bg-white/2 h-full flex items-center justify-center text-zinc-500">
            <div>{tr('AI 换装（开发中）', 'AI Clothing Swap (In Development)')}</div>
          </div>
        </div>

        <div className={panelClassName('product_images_first_frame')}>
          <FirstFrameView
            embedded
            headerActionsContainer={firstFrameHeaderActionsContainer}
            onApplyToWorkbench={() => setActiveView('workbench')}
          />
        </div>

        <div className={panelClassName('product_images_smart_repair')}>
          <SmartRepairView embedded />
        </div>

        <div className={panelClassName('product_images_gallery')}>
          <div className="h-full flex gap-6">
            <div className="w-[30%] min-w-[360px] max-w-[520px] flex flex-col gap-4">
              <div className="rounded-2xl border border-white/5 bg-white/2 p-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-zinc-200">{tr('上传商品图', 'Upload Product Images')}</div>
                </div>

                <div className="mt-4">
                  <input
                    ref={galleryFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const picked = Array.from(e.target.files || []);
                      if (picked.length === 0) return;

                      const supported = picked.filter((f) => isSupportedGalleryImageFile(f));
                      const hasUnsupported = supported.length !== picked.length;
                      if (hasUnsupported) {
                        openGalleryAlert(gallerySupportedFormatTip);
                      }

                      if (supported.length === 0) {
                        e.target.value = '';
                        return;
                      }

                      setGalleryImages((prev) => [...prev, ...supported].slice(0, 3));
                      // Clear restored paths since user is uploading new images
                      setGalleryRestoredImagePaths([]);
                      e.target.value = '';
                    }}
                  />

                  {galleryImages.length === 0 && galleryRestoredImagePaths.length > 0 ? (
                    <>
                      <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300 flex items-center justify-between gap-2">
                        <span>{tr(
                          `已从历史记录恢复 ${galleryRestoredImagePaths.length} 张原始商品图`,
                          `${galleryRestoredImagePaths.length} image(s) restored from history`
                        )}</span>
                        <button
                          type="button"
                          onClick={() => setGalleryRestoredImagePaths([])}
                          className="text-emerald-400 hover:text-emerald-200 shrink-0"
                          title={tr('清除', 'Clear')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        {galleryRestoredImagePaths.map((p, idx) => (
                          <div key={p} className="relative rounded-xl overflow-hidden border border-emerald-500/20 bg-black/30 aspect-square">
                            <img src={p} className="w-full h-full object-cover" alt={`restored-${idx}`} />
                            <button
                              type="button"
                              onClick={() => setGalleryRestoredImagePaths((prev) => prev.filter((_, i) => i !== idx))}
                              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 border border-white/10 text-zinc-200 hover:text-white hover:bg-black/80 transition flex items-center justify-center"
                              title={tr('移除', 'Remove')}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        {galleryRestoredImagePaths.length < 3 && (
                          <button
                            type="button"
                            onClick={() => galleryFileInputRef.current?.click()}
                            className="group relative rounded-xl border border-dashed border-white/10 bg-black/20 text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition flex items-center justify-center aspect-square"
                            title={tr('上传新图片替换', 'Upload new images to replace')}
                          >
                            <Plus className="w-6 h-6 transition-opacity duration-150 group-hover:opacity-0" />
                            <Upload className="absolute w-6 h-6 opacity-0 transition-opacity duration-150 group-hover:opacity-80" />
                          </button>
                        )}
                      </div>
                    </>
                  ) : galleryImages.length === 0 ? (
                    <>
                    <button
                      type="button"
                      onClick={() => galleryFileInputRef.current?.click()}
                      className="group mt-3 w-full rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition"
                    >
                      <div className="relative w-10 h-10 mx-auto mb-2">
                        <ImageIcon className="w-10 h-10 opacity-50 transition-opacity duration-150 group-hover:opacity-0" />
                        <Upload className="absolute inset-0 w-10 h-10 opacity-0 transition-opacity duration-150 group-hover:opacity-60" />
                      </div>
                      <div className="text-sm font-semibold">点击上传 1~3 张商品图</div>
                      <div className="text-[11px] mt-1">支持 JPG / PNG / WEBP</div>
                    </button>
                    </>
                  ) : (
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {galleryPreviewUrls.map((url, idx) => (
                        <div key={url} className="relative rounded-xl overflow-hidden border border-white/10 bg-black/30 aspect-square">
                          <img src={url} className="w-full h-full object-cover" alt={`product-${idx}`} />
                          <button
                            type="button"
                            onClick={() => setGalleryImages((prev) => prev.filter((_, i) => i !== idx))}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 border border-white/10 text-zinc-200 hover:text-white hover:bg-black/80 transition flex items-center justify-center"
                            title="移除"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {galleryImages.length < 3 && (
                        <button
                          type="button"
                          onClick={() => galleryFileInputRef.current?.click()}
                          className="group relative rounded-xl border border-dashed border-white/10 bg-black/20 text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition flex items-center justify-center aspect-square"
                          title="添加图片"
                        >
                          <Plus className="w-6 h-6 transition-opacity duration-150 group-hover:opacity-0" />
                          <Upload className="absolute w-6 h-6 opacity-0 transition-opacity duration-150 group-hover:opacity-80" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/2 p-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-zinc-200">{tr('商品信息', 'Product Info')}</div>
                  <button
                    type="button"
                    onClick={handleGalleryAiAnalyze}
                    disabled={isGalleryAnalyzing}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 disabled:opacity-60 disabled:hover:bg-zinc-900/70 transition"
                  >
                    {isGalleryAnalyzing ? tr('分析中...', 'Analyzing...') : tr('AI分析', 'AI Analyze')}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">商品名称</div>
                    <input
                      value={galleryProductName}
                      onChange={(e) => setGalleryProductName(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                      placeholder="例如：便携榨汁杯"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">商品类目</div>
                    <input
                      value={galleryCategory}
                      onChange={(e) => setGalleryCategory(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                      placeholder="例如：小家电 / 美妆 / 食品"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">核心卖点（2~5 条）</div>
                      <button
                        type="button"
                        onClick={() => setGallerySellingPoints((prev) => (prev.length >= 5 ? prev : [...prev, '']))}
                        className="px-2 py-1 rounded-lg text-[11px] font-bold border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-60"
                        disabled={gallerySellingPoints.length >= 5}
                      >
                        + 添加
                      </button>
                    </div>
                    {gallerySellingPoints.length === 0 ? (
                      <div className="text-xs text-zinc-600">未填写</div>
                    ) : (
                      <div className="space-y-2">
                        {gallerySellingPoints.map((val, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              value={val}
                              onChange={(e) => setGallerySellingPoints((prev) => prev.map((p, i) => (i === idx ? e.target.value : p)))}
                              className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                              placeholder={`卖点 ${idx + 1}`}
                            />
                            <button
                              type="button"
                              onClick={() => setGallerySellingPoints((prev) => prev.filter((_, i) => i !== idx))}
                              className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 flex items-center justify-center"
                              title="移除"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </div>
            <div className="w-[32%] min-w-[420px] max-w-[640px] flex flex-col gap-4">
              <div className="rounded-2xl border border-white/5 bg-white/2 p-5">
                <div className="text-sm font-bold text-zinc-200">{tr('生成设置', 'Generation Settings')}</div>

                <div className="mt-4 space-y-6">
                  <div>
                    <div className="text-xs font-bold text-zinc-200">{tr('基础配置', 'Basics')}</div>
                    <div className="mt-3 grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">目标场景</div>
                        <DropdownSelect
                          value={galleryTargetScene}
                          options={[
                            { value: 'detail', label: '详情页' },
                            { value: 'xiaohongshu', label: '小红书' },
                            { value: 'douyin', label: '抖音' },
                            { value: 'poster', label: '海报' },
                            { value: 'ads', label: '广告投流' },
                          ]}
                          onChange={(v) => setGalleryTargetScene(v as any)}
                          buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                          iconClassName="w-4 h-4 text-zinc-500"
                          optionClassName="text-xs"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">风格</div>
                        <DropdownSelect
                          value={galleryStyle}
                          options={[
                            { value: 'ecom_clean', label: '简洁电商风' },
                            { value: 'lifestyle', label: '生活方式风' },
                            { value: 'premium', label: '高级质感风' },
                            { value: 'festival', label: '节日营销风' },
                          ]}
                          onChange={(v) => setGalleryStyle(v as any)}
                          buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                          iconClassName="w-4 h-4 text-zinc-500"
                          optionClassName="text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold text-zinc-200">{tr('输出类型', 'Outputs')}</div>
                    <div className="mt-3 space-y-3">
                      {([
                        ['white_bg', '白底图'],
                        ['scene', '场景图'],
                        ['selling_point', '卖点图'],
                        ['cover', '封面图'],
                        ['poster', '海报图'],
                      ] as Array<[keyof typeof galleryTypeSelections, string]>).map(([key, label]) => (
                        <div key={key} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                          <label className="flex items-center gap-2 text-xs text-zinc-200">
                            <input
                              type="checkbox"
                              checked={galleryTypeSelections[key].enabled}
                              onChange={(e) => setGalleryTypeSelections((prev) => ({ ...prev, [key]: { ...prev[key], enabled: e.target.checked } }))}
                              className="accent-orange-500"
                            />
                            <span>{label}</span>
                          </label>
                          <div className="flex items-center">
                            <button
                              type="button"
                              onClick={() => setGalleryTypeSelections((prev) => ({ ...prev, [key]: { ...prev[key], count: Math.max(1, prev[key].count - 1) } }))}
                              disabled={!galleryTypeSelections[key].enabled || galleryTypeSelections[key].count <= 1}
                              className="w-8 h-8 rounded-l-lg border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 disabled:opacity-50 flex items-center justify-center"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <div className="w-10 h-8 flex items-center justify-center border-t border-b border-white/10 bg-black/30 text-xs text-zinc-200">
                              {galleryTypeSelections[key].count}
                            </div>
                            <button
                              type="button"
                              onClick={() => setGalleryTypeSelections((prev) => ({ ...prev, [key]: { ...prev[key], count: Math.min(8, prev[key].count + 1) } }))}
                              disabled={!galleryTypeSelections[key].enabled || galleryTypeSelections[key].count >= 8}
                              className="w-8 h-8 rounded-r-lg border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 disabled:opacity-50 flex items-center justify-center"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold text-zinc-200">{tr('规格', 'Specs')}</div>
                    <div className="mt-3 space-y-4">
                      <div className="space-y-2">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">横版</div>
                        <div className="flex flex-wrap gap-2">
                          {([
                            ['21:9', '21:9 超宽'],
                            ['16:9', '16:9 宽屏'],
                            ['4:3', '4:3 标准'],
                            ['3:2', '3:2 经典'],
                          ] as Array<[string, string]>).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setGalleryAspectRatio(value)}
                              className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${
                                galleryAspectRatio === value
                                  ? 'border-orange-500 bg-orange-500/10 text-orange-300'
                                  : 'border-white/10 bg-black/20 text-zinc-200 hover:bg-white/5'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">方形</div>
                        <div className="flex flex-wrap gap-2">
                          {([
                            ['1:1', '1:1 方形'],
                            ['default', '默认比例'],
                          ] as Array<[string, string]>).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setGalleryAspectRatio(value)}
                              className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${
                                galleryAspectRatio === value
                                  ? 'border-orange-500 bg-orange-500/10 text-orange-300'
                                  : 'border-white/10 bg-black/20 text-zinc-200 hover:bg-white/5'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">竖版</div>
                        <div className="flex flex-wrap gap-2">
                          {([
                            ['9:16', '9:16 竖屏'],
                            ['3:4', '3:4 竖版'],
                            ['2:3', '2:3 竖版经典'],
                          ] as Array<[string, string]>).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setGalleryAspectRatio(value)}
                              className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${
                                galleryAspectRatio === value
                                  ? 'border-orange-500 bg-orange-500/10 text-orange-300'
                                  : 'border-white/10 bg-black/20 text-zinc-200 hover:bg-white/5'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">灵活</div>
                        <div className="flex flex-wrap gap-2">
                          {([
                            ['5:4', '5:4 近方'],
                            ['4:5', '4:5 近竖'],
                          ] as Array<[string, string]>).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setGalleryAspectRatio(value)}
                              className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${
                                galleryAspectRatio === value
                                  ? 'border-orange-500 bg-orange-500/10 text-orange-300'
                                  : 'border-white/10 bg-black/20 text-zinc-200 hover:bg-white/5'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 pt-2">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">图片分辨率</div>
                        <div className="flex flex-wrap gap-2">
                          {([
                            ['1k', '1K'],
                            ['2k', '2K'],
                            ['4k', '4K'],
                          ] as Array<['1k' | '2k' | '4k', string]>).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setGalleryResolution(value)}
                              className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${
                                galleryResolution === value
                                  ? 'border-orange-500 bg-orange-500/10 text-orange-300'
                                  : 'border-white/10 bg-black/20 text-zinc-200 hover:bg-white/5'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGalleryGenerate}
                disabled={isGalleryGenerating}
                className="mt-3 w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-black hover:bg-orange-400 disabled:opacity-60 disabled:hover:bg-orange-500 transition flex items-center justify-center gap-2 mb-3"
              >
                <Wand2 className="w-4 h-4" />
                {isGalleryGenerating ? tr('生成中...', 'Generating...') : tr('开始生成', 'Generate')}
              </button>
            </div>

            <div className="flex-1 min-w-0 rounded-2xl border border-white/5 bg-white/2 p-5 flex flex-col">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-zinc-200">
                  {galleryRightPanel === 'preview' ? tr('预览区', 'Preview') : tr('历史记录', 'History')}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setGalleryRightPanel('preview')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition border ${
                      galleryRightPanel === 'preview'
                        ? 'bg-orange-500/10 border-orange-500 text-orange-300'
                        : 'bg-zinc-900/70 border-white/10 text-zinc-200 hover:bg-zinc-800'
                    }`}
                  >
                    {tr('预览区', 'Preview')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryRightPanel('history')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition border ${
                      galleryRightPanel === 'history'
                        ? 'bg-orange-500/10 border-orange-500 text-orange-300'
                        : 'bg-zinc-900/70 border-white/10 text-zinc-200 hover:bg-zinc-800'
                    }`}
                  >
                    {tr('历史记录', 'History')}
                  </button>
                </div>
              </div>

              {galleryRightPanel === 'preview' ? (
                <div className="flex-1 mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 overflow-y-auto">
                  {galleryPreviewItems.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-500">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <ImageIcon className="w-10 h-10 opacity-60" />
                        <div className="text-sm font-semibold text-zinc-400">
                          {isGalleryGenerating ? tr('生成中...', 'Generating...') : tr('等待生成...', 'Waiting for generation...')}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 grid grid-cols-2 gap-3">
                      {galleryPreviewItems.map((item) => (
                        <div key={item.localId} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                          <div className="px-3 py-2 text-[11px] text-zinc-400 border-b border-white/10 bg-black/30 flex items-center justify-between">
                            <span>{item.status === 'succeeded' ? tr('已完成', 'Done') : item.status === 'failed' ? tr('失败', 'Failed') : tr('生成中', 'Generating')}</span>
                            <span className="text-zinc-500">{item.requestId.slice(0, 8)}</span>
                          </div>
                          <div className="p-3">
                            {item.imageUrl ? (
                              <button
                                type="button"
                                onClick={() => openGalleryImagePreview(item.imageUrl as string)}
                                className="rounded-lg overflow-hidden border border-white/10 bg-black/30 aspect-square cursor-pointer"
                                title={tr('点击预览', 'Click to preview')}
                              >
                                <img src={item.imageUrl} className="w-full h-full object-cover" alt={item.requestId} />
                              </button>
                            ) : (
                              <div className="rounded-lg border border-white/10 bg-black/30 aspect-square flex flex-col items-center justify-center text-zinc-500 gap-2">
                                <ImageIcon className={`w-8 h-8 ${item.status === 'failed' ? 'opacity-50' : 'opacity-60 animate-pulse'}`} />
                                <div className="text-xs text-zinc-500">{item.error || (item.status === 'failed' ? tr('生成失败', 'Failed') : tr('等待生成...', 'Waiting...'))}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 overflow-y-auto">
                  {galleryHistoryItems.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                      {tr('暂无历史记录', 'No history yet')}
                    </div>
                  ) : (
                    <div className="p-4 space-y-3">
                      {galleryHistoryItems
                        .slice()
                        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
                        .map((item) => (
                          <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                            <div className="px-3 py-2 text-[11px] text-zinc-400 border-b border-white/10 bg-black/30 flex items-center justify-between">
                              <span>{item.createdAt}</span>
                              <span className="text-zinc-500">{item.images.length} {tr('张', 'imgs')}</span>
                            </div>
                            <div className="p-3 grid grid-cols-4 gap-2">
                              {item.images.slice(0, 4).map((url, idx) => (
                                <button
                                  type="button"
                                  key={`${item.id}-${idx}`}
                                  onClick={() => openGalleryImagePreview(url)}
                                  className="rounded-lg overflow-hidden border border-white/10 bg-black/30 aspect-square cursor-pointer"
                                  title={tr('点击预览', 'Click to preview')}
                                >
                                  <img src={url} className="w-full h-full object-cover" alt={`history-${item.id}-${idx}`} />
                                </button>
                              ))}
                              {item.images.length > 4 && (
                                <div className="rounded-lg border border-white/10 bg-black/30 aspect-square flex items-center justify-center text-zinc-500 text-xs font-bold">
                                  +{item.images.length - 4}
                                </div>
                              )}
                            </div>
                            {item.settings && (
                              <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{item.settings.targetScene}</span>
                                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{item.settings.style}</span>
                                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{item.settings.aspectRatio}</span>
                                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{item.settings.resolution}</span>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ProductImagesView;
