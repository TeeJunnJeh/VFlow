import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Plus, Upload, X, Wand2, Minus, Sparkles, RotateCw, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ViewType } from './types';
import { useLanguage } from '../../context/LanguageContext';
import { DropdownSelect } from '../common/DropdownSelect';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { FirstFrameView, SmartRepairView } from '../productImages';
import { AppDialog } from '../common/AppDialog';
import TextSeparationDemoView, { type TextSeparationBlock } from './TextSeparationDemoView';
import { assetsApi } from '../../services/assets';
import { videoApi } from '../../services/video';
import { downloadBlob, productImagesApi } from '../../services/productImagesApi';
import { appendImageHistoryItem, readImageHistoryByFeature, subscribeImageHistory, updateImageHistoryItem, type ImageHistoryItem } from '../../utils/imageHistory';

interface ProductImagesViewProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
}

interface TextSeparationSession {
  sampleTitle: string;
  originalImageUrl: string;
  backgroundImageUrl: string;
  textBlocks: TextSeparationBlock[];
}

interface TextSeparationRecordItem {
  id: string;
  createdAt: string;
  sampleTitle: string;
  originalImageUrl: string;
  backgroundImageUrl?: string;
  textBlocks?: TextSeparationBlock[];
  status: 'processing' | 'succeeded';
  progress: number;
  startedAtMs?: number;
}

interface DemoLibraryItem {
  id: string;
  title: string;
  subtitle: string;
  previewUrl: string;
}

type GalleryHistorySettings = {
  targetScene: string;
  style: string;
  aspectRatio: string;
  resolution: string;
  copyLanguage?: string;
  productName: string;
  productCategory: string;
  sellingPoints: string[];
  typeSelections: Record<string, { enabled: boolean; count: number }>;
  uploadedImagePaths?: string[];
};

type GalleryHistoryItem = {
  id: string;
  createdAt: string;
  images: string[];
  settings?: GalleryHistorySettings;
};

type GalleryCopyLanguageLabelKey = 'lang_en' | 'lang_zh' | 'lang_es' | 'lang_ja' | 'lang_ko' | 'lang_ms' | 'lang_vi' | 'lang_id';

const GALLERY_COPY_LANGUAGE_OPTIONS: Array<{ value: string; labelKey: GalleryCopyLanguageLabelKey }> = [
  { value: 'en', labelKey: 'lang_en' },
  { value: 'zh', labelKey: 'lang_zh' },
  { value: 'es', labelKey: 'lang_es' },
  { value: 'ja', labelKey: 'lang_ja' },
  { value: 'ko', labelKey: 'lang_ko' },
  { value: 'ms', labelKey: 'lang_ms' },
  { value: 'vi', labelKey: 'lang_vi' },
  { value: 'id', labelKey: 'lang_id' },
];

const ProductImagesView: React.FC<ProductImagesViewProps> = ({ activeView, setActiveView }) => {
  const { language, t } = useLanguage();
  const isZh = language === 'zh';
  const tr = (zhText: string, enText: string) => (isZh ? zhText : enText);
  const isProductView =
    activeView === 'product_images_clothing_swap' ||
    activeView === 'product_images_first_frame' ||
    activeView === 'product_images_smart_repair' ||
    activeView === 'product_images_gallery' ||
    activeView === 'product_images_text_separation';

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
          title: tr('AI智能修复', 'AI Smart Repair'),
          subtitle: tr('基于三类能力中心进行可扩展的智能修图', 'Extensible smart-retouch workspace with three capability groups'),
        };
      case 'product_images_gallery':
        return {
          title: tr('商品套图', 'Product Gallery'),
          subtitle: tr('围绕商品信息与场景配置批量生成电商图', 'Generate e-commerce image sets from product info and scene settings'),
        };
      case 'product_images_text_separation':
        return {
          title: tr('文本分离', 'Text Separation'),
          subtitle: tr('上传海报，或复用商品套图历史图片，提取文本并生成去字底图', 'Upload a poster or reuse Product Gallery history to extract text and generate a clean background'),
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
  const [galleryCopyLanguage, setGalleryCopyLanguage] = useState<string>(() => {
    const defaultLang = language === 'zh' || language === 'ms' || language === 'vi' || language === 'ko' ? language : 'en';
    return GALLERY_COPY_LANGUAGE_OPTIONS.some((opt) => opt.value === defaultLang) ? defaultLang : 'en';
  });
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);
  const [galleryPreviewUrls, setGalleryPreviewUrls] = useState<string[]>([]);
  const [isGalleryDragActive, setIsGalleryDragActive] = useState(false);
  const [isGalleryAnalyzing, setIsGalleryAnalyzing] = useState(false);
  const [galleryAlert, setGalleryAlert] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });
  const [galleryRightPanel, setGalleryRightPanel] = useState<'preview' | 'history'>('preview');
  const [galleryHistoryItems, setGalleryHistoryItems] = useState<GalleryHistoryItem[]>([]);
  const [isGalleryHistoryManaging, setIsGalleryHistoryManaging] = useState(false);
  const [galleryHistorySelectedKeys, setGalleryHistorySelectedKeys] = useState<string[]>([]);
  const [isGalleryGenerating, setIsGalleryGenerating] = useState(false);
  const [galleryPreviewImageUrl, setGalleryPreviewImageUrl] = useState<string | null>(null);
  const [isTextSeparationLoading, setIsTextSeparationLoading] = useState(false);
  const [textSeparationSession, setTextSeparationSession] = useState<TextSeparationSession | null>(null);
  const textSeparationFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isTextSeparationDragActive, setIsTextSeparationDragActive] = useState(false);
  const [textSeparationUploadPreviewUrl, setTextSeparationUploadPreviewUrl] = useState<string | null>(null);
  const [textSeparationUploadName, setTextSeparationUploadName] = useState<string>('');
  const [isTextSeparationHistoryPickerOpen, setIsTextSeparationHistoryPickerOpen] = useState(false);
  const [textSeparationSelectedImagePath, setTextSeparationSelectedImagePath] = useState<string | null>(null);
  const [textSeparationSelectedOriginalUrl, setTextSeparationSelectedOriginalUrl] = useState<string | null>(null);
  const [textSeparationRecords, setTextSeparationRecords] = useState<TextSeparationRecordItem[]>([]);
  // Backend image paths restored from history "re-generate" — allows skipping upload
  const [galleryRestoredImagePaths, setGalleryRestoredImagePaths] = useState<string[]>([]);
  const [galleryPreviewItems, setGalleryPreviewItems] = useState<
    Array<{
      localId: string;
      requestId: string;
      status: 'created' | 'processing' | 'succeeded' | 'failed';
      imageUrl?: string;
      error?: string;
      layout?: any;
    }>
  >([]);
  const [galleryTextEditor, setGalleryTextEditor] = useState<{ open: boolean; localId: string; imageUrl: string; layout: any } | null>(null);
  const [galleryTextDraftLayout, setGalleryTextDraftLayout] = useState<any | null>(null);
  const [isGalleryTextExporting, setIsGalleryTextExporting] = useState(false);
  const dragTextRef = useRef<{
    index: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const [hotStyleLoading, setHotStyleLoading] = useState(false);
  const [hotStyleItems, setHotStyleItems] = useState<Array<{ name: string; tones: string[]; description: string }>>([]);
  const [hotStyleSelectedIndex, setHotStyleSelectedIndex] = useState<number | null>(null);
  const [hotStyleError, setHotStyleError] = useState<string | null>(null);

  const galleryHistoryAllKeys = useMemo(
    () => galleryHistoryItems.flatMap((item) => item.images.map((_, idx) => `${item.id}:${idx}`)),
    [galleryHistoryItems]
  );
  const galleryHistorySelectedSet = useMemo(() => new Set(galleryHistorySelectedKeys), [galleryHistorySelectedKeys]);
  const isGalleryHistoryAllSelected =
    galleryHistoryAllKeys.length > 0 && galleryHistoryAllKeys.every((key) => galleryHistorySelectedSet.has(key));

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

  type GalleryPreviewSource =
    | { kind: 'preview_item'; localId: string }
    | { kind: 'history_item'; itemId: string; index: number }
    | null;

  const [isGalleryPreviewDownloading, setIsGalleryPreviewDownloading] = useState(false);
  const [isGalleryPreviewExportingPdf, setIsGalleryPreviewExportingPdf] = useState(false);
  const [galleryPreviewSource, setGalleryPreviewSource] = useState<GalleryPreviewSource>(null);

  const [galleryInpaint, setGalleryInpaint] = useState<{
    open: boolean;
    prompt: string;
    rect: { x: number; y: number; w: number; h: number } | null;
    isDragging: boolean;
    dragStart: { x: number; y: number } | null;
    isGenerating: boolean;
    resultUrl: string | null;
    error: string | null;
  }>({
    open: false,
    prompt: '',
    rect: null,
    isDragging: false,
    dragStart: null,
    isGenerating: false,
    resultUrl: null,
    error: null,
  });

  const galleryInpaintBoxRef = useRef<HTMLDivElement | null>(null);
  const galleryInpaintImgRef = useRef<HTMLImageElement | null>(null);

  const closeGalleryImagePreview = () => {
    setGalleryPreviewImageUrl(null);
    setGalleryPreviewSource(null);
  };

  const openGalleryImagePreview = (url: string, source: GalleryPreviewSource = null) => {
    const cleaned = String(url || '').trim();
    if (!cleaned) return;
    setGalleryPreviewImageUrl(cleaned);
    setGalleryPreviewSource(source);
  };

  const galleryPreviewNav = useMemo<
    | null
    | { kind: 'preview'; index: number; total: number; items: Array<{ localId: string; imageUrl: string }> }
    | { kind: 'history'; index: number; total: number; itemId: string; urls: string[] }
  >(() => {
    if (!galleryPreviewImageUrl || !galleryPreviewSource) return null;

    if (galleryPreviewSource.kind === 'preview_item') {
      const items = galleryPreviewItems
        .filter((it) => typeof it.imageUrl === 'string' && String(it.imageUrl).trim())
        .map((it) => ({ localId: it.localId, imageUrl: String(it.imageUrl) }));
      const index = items.findIndex((it) => it.localId === galleryPreviewSource.localId);
      if (index < 0) return null;
      return { kind: 'preview', index, total: items.length, items };
    }

    if (galleryPreviewSource.kind === 'history_item') {
      const item = galleryHistoryItems.find((it) => it.id === galleryPreviewSource.itemId);
      const urls = (item?.images || []).map((u) => String(u || '').trim()).filter(Boolean);
      if (urls.length === 0) return null;
      const index = Math.max(0, Math.min(galleryPreviewSource.index, urls.length - 1));
      return { kind: 'history', index, total: urls.length, itemId: galleryPreviewSource.itemId, urls };
    }

    return null;
  }, [galleryHistoryItems, galleryPreviewImageUrl, galleryPreviewItems, galleryPreviewSource]);

  const handleGalleryPreviewPrev = () => {
    if (!galleryPreviewNav || galleryPreviewNav.total <= 1 || galleryPreviewNav.index <= 0) return;
    const nextIndex = galleryPreviewNav.index - 1;

    if (galleryPreviewNav.kind === 'preview') {
      const next = galleryPreviewNav.items[nextIndex];
      setGalleryPreviewImageUrl(next.imageUrl);
      setGalleryPreviewSource({ kind: 'preview_item', localId: next.localId });
      return;
    }

    const nextUrl = galleryPreviewNav.urls[nextIndex];
    setGalleryPreviewImageUrl(nextUrl);
    setGalleryPreviewSource({ kind: 'history_item', itemId: galleryPreviewNav.itemId, index: nextIndex });
  };

  const handleGalleryPreviewNext = () => {
    if (!galleryPreviewNav || galleryPreviewNav.total <= 1 || galleryPreviewNav.index >= galleryPreviewNav.total - 1) return;
    const nextIndex = galleryPreviewNav.index + 1;

    if (galleryPreviewNav.kind === 'preview') {
      const next = galleryPreviewNav.items[nextIndex];
      setGalleryPreviewImageUrl(next.imageUrl);
      setGalleryPreviewSource({ kind: 'preview_item', localId: next.localId });
      return;
    }

    const nextUrl = galleryPreviewNav.urls[nextIndex];
    setGalleryPreviewImageUrl(nextUrl);
    setGalleryPreviewSource({ kind: 'history_item', itemId: galleryPreviewNav.itemId, index: nextIndex });
  };

  const buildGalleryPreviewFilename = (url: string, extFallback = 'png') => {
    const cleaned = String(url || '').trim();
    const safeExt = /^[a-z0-9]+$/i.test(extFallback) ? extFallback : 'png';
    const match = cleaned.match(/\.(png|jpe?g|webp)(?:\?|#|$)/i);
    const ext = (match?.[1] || safeExt).toLowerCase();
    return `product_gallery_${Date.now()}.${ext}`;
  };

  const handleDownloadGalleryPreviewImage = async () => {
    if (!galleryPreviewImageUrl || isGalleryPreviewDownloading) return;

    setIsGalleryPreviewDownloading(true);
    try {
      const blob = await productImagesApi.downloadImageByUrl(galleryPreviewImageUrl);
      downloadBlob(blob, buildGalleryPreviewFilename(galleryPreviewImageUrl));
    } catch (err: any) {
      openGalleryAlert(String(err?.message || tr('下载失败，请重试。', 'Download failed. Please try again.')));
    } finally {
      setIsGalleryPreviewDownloading(false);
    }
  };

  const handleExportGalleryPreviewAsPdf = async () => {
    if (!galleryPreviewImageUrl || isGalleryPreviewExportingPdf) return;

    setIsGalleryPreviewExportingPdf(true);
    try {
      const blob = await productImagesApi.downloadImageByUrl(galleryPreviewImageUrl);
      const objectUrl = URL.createObjectURL(blob);

      const win = window.open('', '_blank');
      if (!win) {
        URL.revokeObjectURL(objectUrl);
        openGalleryAlert(tr('浏览器阻止了弹窗，请允许弹窗后重试。', 'Popup blocked by browser. Please allow popups and try again.'));
        return;
      }

      const title = tr('导出为PDF', 'Export as PDF');
      win.document.open();
      win.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title><style>@page{size:A4;margin:12mm;}html,body{height:100%;}body{margin:0;display:flex;align-items:center;justify-content:center;}img{max-width:100%;max-height:100%;object-fit:contain;}</style></head><body><img id="img" src="${objectUrl}" /><script>const img=document.getElementById('img');img.onload=()=>{setTimeout(()=>{window.focus();window.print();},50)};window.onafterprint=()=>{window.close();};</script></body></html>`);
      win.document.close();

      const cleanup = () => URL.revokeObjectURL(objectUrl);
      try {
        win.addEventListener('beforeunload', cleanup);
      } catch {
        const timer = window.setInterval(() => {
          if (win.closed) {
            window.clearInterval(timer);
            cleanup();
          }
        }, 400);
      }
    } catch (err: any) {
      openGalleryAlert(String(err?.message || tr('导出失败，请重试。', 'Export failed. Please try again.')));
    } finally {
      setIsGalleryPreviewExportingPdf(false);
    }
  };

  const closeGalleryInpaint = () =>
    setGalleryInpaint({
      open: false,
      prompt: '',
      rect: null,
      isDragging: false,
      dragStart: null,
      isGenerating: false,
      resultUrl: null,
      error: null,
    });

  const openGalleryInpaint = () => {
    if (!galleryPreviewImageUrl) return;
    setGalleryInpaint((prev) => ({
      ...prev,
      open: true,
      prompt: prev.prompt || '',
      rect: null,
      isDragging: false,
      dragStart: null,
      isGenerating: false,
      resultUrl: null,
      error: null,
    }));
  };

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  const updateInpaintRectFromPoints = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);

    const w = Math.max(0.001, right - left);
    const h = Math.max(0.001, bottom - top);

    setGalleryInpaint((prev) => ({
      ...prev,
      rect: {
        x: clamp01(left),
        y: clamp01(top),
        w: clamp01(w),
        h: clamp01(h),
      },
    }));
  };

  const handleInpaintPointerDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!galleryInpaint.open || galleryInpaint.isGenerating) return;
    const box = galleryInpaintBoxRef.current;
    const img = galleryInpaintImgRef.current;
    if (!box) return;

    const rect = box.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    let x = clamp01(localX / rect.width);
    let y = clamp01(localY / rect.height);

    if (img && img.naturalWidth > 0 && img.naturalHeight > 0 && rect.width > 0 && rect.height > 0) {
      const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const offsetX = (rect.width - drawW) / 2;
      const offsetY = (rect.height - drawH) / 2;

      const clampedX = Math.min(offsetX + drawW, Math.max(offsetX, localX));
      const clampedY = Math.min(offsetY + drawH, Math.max(offsetY, localY));

      x = clamp01(clampedX / rect.width);
      y = clamp01(clampedY / rect.height);
    }

    setGalleryInpaint((prev) => ({ ...prev, isDragging: true, dragStart: { x, y }, rect: { x, y, w: 0.001, h: 0.001 } }));
  };

  const handleInpaintPointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!galleryInpaint.isDragging || !galleryInpaint.dragStart) return;
    const box = galleryInpaintBoxRef.current;
    const img = galleryInpaintImgRef.current;
    if (!box) return;

    const rect = box.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    let x = clamp01(localX / rect.width);
    let y = clamp01(localY / rect.height);

    if (img && img.naturalWidth > 0 && img.naturalHeight > 0 && rect.width > 0 && rect.height > 0) {
      const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const offsetX = (rect.width - drawW) / 2;
      const offsetY = (rect.height - drawH) / 2;

      const clampedX = Math.min(offsetX + drawW, Math.max(offsetX, localX));
      const clampedY = Math.min(offsetY + drawH, Math.max(offsetY, localY));

      x = clamp01(clampedX / rect.width);
      y = clamp01(clampedY / rect.height);
    }

    updateInpaintRectFromPoints(galleryInpaint.dragStart, { x, y });
  };

  const handleInpaintPointerUp = () => {
    if (!galleryInpaint.isDragging) return;
    setGalleryInpaint((prev) => ({ ...prev, isDragging: false, dragStart: null }));
  };

  const buildMaskDataUrl = (width: number, height: number, rectPx: { x: number; y: number; w: number; h: number }) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas context unavailable');

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#fff';
    ctx.fillRect(
      Math.max(0, Math.floor(rectPx.x)),
      Math.max(0, Math.floor(rectPx.y)),
      Math.max(1, Math.floor(rectPx.w)),
      Math.max(1, Math.floor(rectPx.h))
    );

    return canvas.toDataURL('image/png');
  };

  const applyGalleryPreviewOverwrite = (nextUrl: string) => {
    setGalleryPreviewImageUrl(nextUrl);

    if (!galleryPreviewSource) return;

    if (galleryPreviewSource.kind === 'preview_item') {
      const localId = galleryPreviewSource.localId;
      setGalleryPreviewItems((prev) => prev.map((it) => (it.localId === localId ? { ...it, imageUrl: nextUrl } : it)));
      return;
    }

    if (galleryPreviewSource.kind === 'history_item') {
      const { itemId, index } = galleryPreviewSource;
      updateImageHistoryItem(itemId, (current) => {
        if (current.featureType !== 'gallery') return current;
        const images = current.images.slice();
        if (index >= 0 && index < images.length) images[index] = nextUrl;
        return { ...current, images };
      });
    }
  };

  const handleRunInpaint = async () => {
    if (!galleryPreviewImageUrl) return;
    if (galleryInpaint.isGenerating) return;
    if (!galleryInpaint.rect) {
      setGalleryInpaint((prev) => ({ ...prev, error: tr('请先框选要修改的区域', 'Please select an area to edit') }));
      return;
    }

    const img = galleryInpaintImgRef.current;
    const box = galleryInpaintBoxRef.current;
    if (!img || !box || !img.naturalWidth || !img.naturalHeight) {
      setGalleryInpaint((prev) => ({ ...prev, error: tr('图片未加载完成', 'Image not ready') }));
      return;
    }

    const boxRect = box.getBoundingClientRect();
    const containerW = boxRect.width;
    const containerH = boxRect.height;

    const scale = Math.min(containerW / img.naturalWidth, containerH / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const offsetX = (containerW - drawW) / 2;
    const offsetY = (containerH - drawH) / 2;

    const rect = galleryInpaint.rect;

    const imgX = clamp01((rect.x * containerW - offsetX) / drawW);
    const imgY = clamp01((rect.y * containerH - offsetY) / drawH);
    const imgW = clamp01((rect.w * containerW) / drawW);
    const imgH = clamp01((rect.h * containerH) / drawH);

    const rectPx = {
      x: imgX * img.naturalWidth,
      y: imgY * img.naturalHeight,
      w: Math.max(1, imgW * img.naturalWidth),
      h: Math.max(1, imgH * img.naturalHeight),
    };

    const prompt = String(galleryInpaint.prompt || '').trim();
    if (!prompt) {
      setGalleryInpaint((prev) => ({ ...prev, error: tr('请填写修改指令', 'Please enter an edit instruction') }));
      return;
    }

    setGalleryInpaint((prev) => ({ ...prev, isGenerating: true, error: null, resultUrl: null }));

    try {
      const maskDataUrl = buildMaskDataUrl(img.naturalWidth, img.naturalHeight, rectPx);

      const apiBase = (import.meta as any).env?.VITE_API_BASE || '/api';
      const resp = await fetch(`${apiBase}/projects/inpaint_image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          image_url: galleryPreviewImageUrl,
          mask_data_url: maskDataUrl,
          prompt,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || (data && data.code && data.code !== 0)) {
        throw new Error(String(data?.message || data?.error?.message || 'request failed'));
      }

      const requestId = String(data?.data?.request_id || '').trim();
      if (!requestId) throw new Error(tr('创建任务失败', 'Failed to create task'));

      let outputUrl: string | null = null;
      for (let i = 0; i < 40; i += 1) {
        const res = await videoApi.getProductGalleryResult(requestId);
        const status = String((res as any)?.data?.status || (res as any)?.status || '').toLowerCase();
        const outputs = (res as any)?.data?.outputs || (res as any)?.outputs || [];
        const list = Array.isArray(outputs) ? outputs : [];
        if (list.length > 0) {
          outputUrl = String(list[0] || '').trim() || null;
        }
        if (outputUrl) break;
        if (status && ['failed', 'canceled', 'cancelled', 'error'].includes(status)) break;
        await new Promise<void>((r) => setTimeout(r, 1500));
      }

      if (!outputUrl) {
        throw new Error(tr('生成失败，请重试。', 'Generation failed. Please try again.'));
      }

      setGalleryInpaint((prev) => ({ ...prev, isGenerating: false, resultUrl: outputUrl, error: null }));

      const ok = await openGalleryConfirm(t.pi_gallery_inpaint_overwrite_confirm || tr('是否用修改后的图片覆盖原图？', 'Replace the original image with the edited one?'), {
        title: t.pi_gallery_inpaint_title || tr('局部修改', 'Local Edit'),
        okLabel: tr('覆盖原图', 'Replace'),
        cancelLabel: tr('取消', 'Cancel'),
      });

      if (ok) {
        applyGalleryPreviewOverwrite(outputUrl);
        closeGalleryInpaint();
      }
    } catch (err: any) {
      setGalleryInpaint((prev) => ({ ...prev, isGenerating: false, error: String(err?.message || err), resultUrl: null }));
    }
  };

  const openTextSeparationHistoryItem = (item: TextSeparationRecordItem) => {
    if (item.status !== 'succeeded' || !item.backgroundImageUrl || !item.textBlocks) return;
    setTextSeparationSession({
      sampleTitle: item.sampleTitle,
      originalImageUrl: item.originalImageUrl,
      backgroundImageUrl: item.backgroundImageUrl,
      textBlocks: item.textBlocks,
    });
  };

  const clearSelectedTextSeparationSource = (revokePreview = true) => {
    if (revokePreview && textSeparationUploadPreviewUrl && textSeparationUploadPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(textSeparationUploadPreviewUrl);
    }
    setTextSeparationUploadPreviewUrl(null);
    setTextSeparationUploadName('');
    setTextSeparationSelectedImagePath(null);
    setTextSeparationSelectedOriginalUrl(null);
  };

  const selectTextSeparationSource = (imagePath: string, sampleTitle: string, originalImageUrl?: string) => {
    const cleaned = String(imagePath || '').trim();
    if (!cleaned) return;
    if (originalImageUrl) {
      if (textSeparationUploadPreviewUrl && textSeparationUploadPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(textSeparationUploadPreviewUrl);
      }
      setTextSeparationUploadPreviewUrl(originalImageUrl);
    }
    setTextSeparationUploadName(sampleTitle);
    setTextSeparationSelectedImagePath(cleaned);
    setTextSeparationSelectedOriginalUrl(originalImageUrl || cleaned);
  };

  const openTextSeparationDemo = async (item: DemoLibraryItem | null) => {
    if (!item || isTextSeparationLoading) return;

    setIsTextSeparationLoading(true);
    try {
      const parsed = await videoApi.textSeparation({ sample_id: item.id });
      const rawBlocks = Array.isArray(parsed?.text_blocks) ? parsed.text_blocks : [];
      const textBlocks = rawBlocks
        .map((block: any) => {
          const bbox = Array.isArray(block?.bbox) ? block.bbox.map((n: any) => Number(n)) : [];
          if (bbox.length !== 4 || bbox.some((n: number) => !Number.isFinite(n))) return null;
          const color = Array.isArray(block?.color) ? block.color.map((n: any) => Number(n)) : null;
          const outlineColor = Array.isArray(block?.outline?.color) ? block.outline.color.map((n: any) => Number(n)) : null;
          const shadowColor = Array.isArray(block?.shadow?.color) ? block.shadow.color.map((n: any) => Number(n)) : null;
          return {
            id: String(block?.id || '').trim() || `txt_${Math.random().toString(36).slice(2, 8)}`,
            text: String(block?.text || '').trim(),
            bbox: [bbox[0], bbox[1], bbox[2], bbox[3]] as [number, number, number, number],
            font_size: Number.isFinite(Number(block?.font_size)) ? Number(block.font_size) : undefined,
            color:
              color && color.length === 3 && color.every((n: number) => Number.isFinite(n))
                ? ([color[0], color[1], color[2]] as [number, number, number])
                : undefined,
            bold: typeof block?.bold === 'boolean' ? block.bold : undefined,
            outline:
              typeof block?.outline === 'boolean'
                ? block.outline
                : block?.outline && typeof block.outline === 'object'
                  ? {
                      color:
                        outlineColor && outlineColor.length === 3 && outlineColor.every((n: number) => Number.isFinite(n))
                          ? ([outlineColor[0], outlineColor[1], outlineColor[2]] as [number, number, number])
                          : undefined,
                      width: Number.isFinite(Number(block.outline.width)) ? Number(block.outline.width) : undefined,
                    }
                  : undefined,
            shadow:
              typeof block?.shadow === 'boolean'
                ? block.shadow
                : block?.shadow && typeof block.shadow === 'object'
                  ? {
                      color:
                        shadowColor && shadowColor.length === 3 && shadowColor.every((n: number) => Number.isFinite(n))
                          ? ([shadowColor[0], shadowColor[1], shadowColor[2]] as [number, number, number])
                          : undefined,
                      blur: Number.isFinite(Number(block.shadow.blur)) ? Number(block.shadow.blur) : undefined,
                      offsetX: Number.isFinite(Number(block.shadow.offsetX)) ? Number(block.shadow.offsetX) : undefined,
                      offsetY: Number.isFinite(Number(block.shadow.offsetY)) ? Number(block.shadow.offsetY) : undefined,
                    }
                  : undefined,
          };
        })
        .filter(Boolean) as TextSeparationBlock[];


      setTextSeparationSession({
        sampleTitle: item.title,
        originalImageUrl: String(parsed.original_image_url || item.previewUrl),
        backgroundImageUrl: String(parsed.clean_image_url || ''),
        textBlocks,
      });
    } catch (err: any) {
      openGalleryAlert(String(err?.message || tr('打开文本分离失败', 'Failed to open text separation')));
    } finally {
      setIsTextSeparationLoading(false);
    }
  };

  const normalizeTextSeparationBlocks = (rawBlocks: any[]): TextSeparationBlock[] =>
    rawBlocks
      .map((block: any) => {
        const bbox = Array.isArray(block?.bbox) ? block.bbox.map((n: any) => Number(n)) : [];
        if (bbox.length !== 4 || bbox.some((n: number) => !Number.isFinite(n))) return null;
        const color = Array.isArray(block?.color) ? block.color.map((n: any) => Number(n)) : null;
        const outlineColor = Array.isArray(block?.outline?.color) ? block.outline.color.map((n: any) => Number(n)) : null;
        const shadowColor = Array.isArray(block?.shadow?.color) ? block.shadow.color.map((n: any) => Number(n)) : null;
        return {
          id: String(block?.id || '').trim() || `txt_${Math.random().toString(36).slice(2, 8)}`,
          text: String(block?.text || '').trim(),
          bbox: [bbox[0], bbox[1], bbox[2], bbox[3]] as [number, number, number, number],
          font_size: Number.isFinite(Number(block?.font_size)) ? Number(block.font_size) : undefined,
          color:
            color && color.length === 3 && color.every((n: number) => Number.isFinite(n))
              ? ([color[0], color[1], color[2]] as [number, number, number])
              : undefined,
          bold: typeof block?.bold === 'boolean' ? block.bold : undefined,
          outline:
            typeof block?.outline === 'boolean'
              ? block.outline
              : block?.outline && typeof block.outline === 'object'
                ? {
                    color:
                      outlineColor && outlineColor.length === 3 && outlineColor.every((n: number) => Number.isFinite(n))
                        ? ([outlineColor[0], outlineColor[1], outlineColor[2]] as [number, number, number])
                        : undefined,
                    width: Number.isFinite(Number(block.outline.width)) ? Number(block.outline.width) : undefined,
                  }
                : undefined,
          shadow:
            typeof block?.shadow === 'boolean'
              ? block.shadow
              : block?.shadow && typeof block.shadow === 'object'
                ? {
                    color:
                      shadowColor && shadowColor.length === 3 && shadowColor.every((n: number) => Number.isFinite(n))
                        ? ([shadowColor[0], shadowColor[1], shadowColor[2]] as [number, number, number])
                        : undefined,
                    blur: Number.isFinite(Number(block.shadow.blur)) ? Number(block.shadow.blur) : undefined,
                    offsetX: Number.isFinite(Number(block.shadow.offsetX)) ? Number(block.shadow.offsetX) : undefined,
                    offsetY: Number.isFinite(Number(block.shadow.offsetY)) ? Number(block.shadow.offsetY) : undefined,
                  }
                : undefined,
        };
      })
      .filter(Boolean) as TextSeparationBlock[];

  const loadGalleryHistoryFromStore = (): GalleryHistoryItem[] =>
    readImageHistoryByFeature('gallery')
      .map((item) => {
        const images = Array.isArray(item.images)
          ? item.images.map((value) => String(value || '').trim()).filter(Boolean)
          : [];
        if (images.length === 0) return null;
        return {
          id: item.id,
          createdAt: item.createdAt,
          images,
          settings: item.settings as GalleryHistorySettings | undefined,
        } satisfies GalleryHistoryItem;
      })
      .filter(Boolean) as GalleryHistoryItem[];

  const mapImageHistoryToTextSeparationRecord = (item: ImageHistoryItem): TextSeparationRecordItem | null => {
    if (item.featureType !== 'text_separation') return null;
    const backgroundImageUrl = String(item.metadata?.backgroundImageUrl || item.images[0] || '').trim();
    const originalImageUrl = String(item.metadata?.originalImageUrl || backgroundImageUrl).trim();
    if (!backgroundImageUrl || !originalImageUrl) return null;
    return {
      id: item.id,
      createdAt: item.createdAt,
      sampleTitle: String(item.metadata?.sampleTitle || tr('未命名图片', 'Untitled image')).trim(),
      originalImageUrl,
      backgroundImageUrl,
      textBlocks: normalizeTextSeparationBlocks(Array.isArray(item.metadata?.textBlocks) ? item.metadata.textBlocks : []),
      status: 'succeeded',
      progress: 100,
    } as TextSeparationRecordItem;
  };

  const mergeTextSeparationRecords = (persisted: TextSeparationRecordItem[], current: TextSeparationRecordItem[]): TextSeparationRecordItem[] => {
    const byId = new Map<string, TextSeparationRecordItem>();

    for (const item of persisted) {
      byId.set(item.id, item);
    }

    for (const item of current) {
      if (item.status === 'processing' || !byId.has(item.id)) {
        byId.set(item.id, item);
      }
    }

    return [...byId.values()].sort((a, b) => {
      const aMs = new Date(a.createdAt).getTime() || 0;
      const bMs = new Date(b.createdAt).getTime() || 0;
      return bMs - aMs;
    });
  };

  const openTextSeparationByImagePath = async (imagePath: string, sampleTitle: string, originalImageUrl?: string) => {
    const cleaned = String(imagePath || '').trim();
    if (!cleaned || isTextSeparationLoading) return;

    setIsTextSeparationLoading(true);
    try {
      const parsed = await videoApi.textSeparation({ image_path: cleaned });
      const textBlocks = normalizeTextSeparationBlocks(Array.isArray(parsed?.text_blocks) ? parsed.text_blocks : []);
      return {
        sampleTitle,
        originalImageUrl: String(originalImageUrl || parsed.original_image_url || cleaned),
        backgroundImageUrl: String(parsed.clean_image_url || ''),
        textBlocks,
      };
    } catch (err: any) {
      openGalleryAlert(String(err?.message || tr('打开文本分离失败', 'Failed to open text separation')));
      return null;
    } finally {
      setIsTextSeparationLoading(false);
    }
  };

  const handleStartTextSeparation = async () => {
    if (!textSeparationSelectedImagePath || isTextSeparationLoading || !textSeparationUploadPreviewUrl) return;
    const recordId = `ts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sampleTitle = textSeparationUploadName || tr('未命名图片', 'Untitled image');
    const originalImageUrl = textSeparationSelectedOriginalUrl || textSeparationUploadPreviewUrl;
    const imagePath = textSeparationSelectedImagePath;
    const createdAt = new Date().toISOString();

    setTextSeparationRecords((prev) => [
      {
        id: recordId,
        createdAt,
        sampleTitle,
        originalImageUrl,
        status: 'processing',
        progress: 0,
        startedAtMs: Date.now(),
      },
      ...prev,
    ]);

    clearSelectedTextSeparationSource(false);

    const result = await openTextSeparationByImagePath(imagePath, sampleTitle, originalImageUrl);
    if (!result) {
      setTextSeparationRecords((prev) => prev.filter((item) => item.id !== recordId));
      return;
    }

    appendImageHistoryItem({
      id: recordId,
      featureType: 'text_separation',
      createdAt,
      status: 'succeeded',
      images: [result.backgroundImageUrl],
      metadata: {
        sampleTitle,
        originalImageUrl,
        backgroundImageUrl: result.backgroundImageUrl,
        textBlocks: result.textBlocks,
      },
    });

    setTextSeparationRecords((prev) =>
      prev.map((item) =>
        item.id === recordId
          ? {
              ...item,
              status: 'succeeded' as const,
              progress: 100,
              backgroundImageUrl: result.backgroundImageUrl,
              textBlocks: result.textBlocks,
              startedAtMs: undefined,
            }
          : item
      )
    );
  };

  const handleTextSeparationUpload = async (file: File) => {
    if (isTextSeparationLoading) return;
    const objectUrl = URL.createObjectURL(file);
    if (textSeparationUploadPreviewUrl && textSeparationUploadPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(textSeparationUploadPreviewUrl);
    }
    setTextSeparationUploadPreviewUrl(objectUrl);
    setTextSeparationUploadName(file.name);

    try {
      const uploadResp = await assetsApi.uploadTempAsset(file);
      const imagePath = String(uploadResp?.data?.path || uploadResp?.data?.url || uploadResp?.path || uploadResp?.url || '').trim();
      const originalUrl = String(uploadResp?.data?.url || uploadResp?.url || imagePath || '').trim();
      if (!imagePath) {
        throw new Error(tr('上传成功但未返回图片路径', 'Upload succeeded but no image path was returned'));
      }
      setTextSeparationSelectedImagePath(imagePath);
      setTextSeparationSelectedOriginalUrl(originalUrl || objectUrl);
    } catch (err: any) {
      openGalleryAlert(String(err?.message || tr('上传图片失败', 'Failed to upload image')));
    }
  };

  const toggleGalleryHistoryKey = (key: string) => {
    setGalleryHistorySelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleGalleryHistorySelectAll = () => {
    if (galleryHistoryAllKeys.length === 0) return;
    setGalleryHistorySelectedKeys(isGalleryHistoryAllSelected ? [] : galleryHistoryAllKeys);
  };

  const handleGalleryHistoryDeleteSelected = async () => {
    if (galleryHistorySelectedKeys.length === 0) return;

    const ok = await openGalleryConfirm(
      tr('确定删除选中的图片吗？', 'Delete selected images?'),
      {
        title: tr('删除确认', 'Delete confirmation'),
        okLabel: tr('删除', 'Delete'),
        cancelLabel: tr('取消', 'Cancel'),
      }
    );

    if (!ok) return;

    const selected = new Set(galleryHistorySelectedKeys);

    galleryHistoryItems.forEach((item) => {
      if (!item.images.some((_, idx) => selected.has(`${item.id}:${idx}`))) return;
      updateImageHistoryItem(item.id, (current) => {
        if (current.featureType !== 'gallery') return current;
        const images = current.images.filter((_, idx) => !selected.has(`${item.id}:${idx}`));
        if (images.length === 0) return null;
        if (images.length === current.images.length) return current;
        return { ...current, images };
      });
    });

    setGalleryHistorySelectedKeys([]);
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
    const syncGalleryHistory = () => {
      setGalleryHistoryItems(loadGalleryHistoryFromStore());
    };

    syncGalleryHistory();
    return subscribeImageHistory(syncGalleryHistory);
  }, []);

  useEffect(() => {
    galleryPollAbortRef.current = false;
    return () => {
      galleryPollAbortRef.current = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (textSeparationUploadPreviewUrl && textSeparationUploadPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(textSeparationUploadPreviewUrl);
      }
    };
  }, [textSeparationUploadPreviewUrl]);

  useEffect(() => {
    const hasProcessing = textSeparationRecords.some((item) => item.status === 'processing' && item.startedAtMs);
    if (!hasProcessing) return;

    const timer = window.setInterval(() => {
      setTextSeparationRecords((prev) =>
        prev.map((item) => {
          if (item.status !== 'processing' || !item.startedAtMs) return item;
          const elapsed = Date.now() - item.startedAtMs;
          const progress = Math.min(90, (elapsed / 15000) * 90);
          return progress > item.progress ? { ...item, progress } : item;
        })
      );
    }, 200);

    return () => window.clearInterval(timer);
  }, [textSeparationRecords]);

  useEffect(() => {
    const syncTextSeparationHistory = () => {
      const persisted = readImageHistoryByFeature('text_separation')
        .map((item) => mapImageHistoryToTextSeparationRecord(item))
        .filter(Boolean) as TextSeparationRecordItem[];
      setTextSeparationRecords((prev) => mergeTextSeparationRecords(persisted, prev));
    };

    syncTextSeparationHistory();
    return subscribeImageHistory(syncTextSeparationHistory);
  }, [language]);

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
      if (s.copyLanguage) setGalleryCopyLanguage(String(s.copyLanguage));
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

  const appendGalleryFiles = (picked: File[]) => {
    if (picked.length === 0) return;

    const supported = picked.filter((f) => isSupportedGalleryImageFile(f));
    const hasUnsupported = supported.length !== picked.length;
    if (hasUnsupported) {
      openGalleryAlert(gallerySupportedFormatTip);
    }

    if (supported.length === 0) {
      return;
    }

    setGalleryImages((prev) => [...prev, ...supported].slice(0, 3));
    setGalleryRestoredImagePaths([]);
  };

  const handleTextSeparationFileSelection = (picked: File[]) => {
    const file = picked[0];
    if (!file) return;
    if (!isSupportedGalleryImageFile(file)) {
      openGalleryAlert(gallerySupportedFormatTip);
      return;
    }
    void handleTextSeparationUpload(file);
  };

  const preventDragDefaults = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const extractUploadedAssetPath = (uploadResp: any): string | null => {
    if (uploadResp?.assets && Array.isArray(uploadResp.assets) && uploadResp.assets.length > 0) {
      return uploadResp.assets[0].url || uploadResp.assets[0].file_url || uploadResp.assets[0].path || null;
    }
    return uploadResp?.url || uploadResp?.file_url || uploadResp?.path || uploadResp?.data?.url || uploadResp?.data?.path || null;
  };

  const openGalleryTextEditor = (item: { localId: string; imageUrl?: string; layout?: any }) => {
    const url = String(item.imageUrl || '').trim();
    if (!url) return;
    if (!item.layout || !item.layout.elements) {
      openGalleryAlert(tr('没有可编辑版式，请先生成爆款风格并填写卖点后再生成套图。', 'No editable layout. Fill selling points and generate styles, then generate gallery again.'));
      return;
    }
    const draft = JSON.parse(JSON.stringify(item.layout));
    setGalleryTextDraftLayout(draft);
    setGalleryTextEditor({ open: true, localId: item.localId, imageUrl: url, layout: item.layout });
  };

  const closeGalleryTextEditor = () => {
    setGalleryTextEditor(null);
    setGalleryTextDraftLayout(null);
    dragTextRef.current = null;
  };

  const parseAspectRatioCss = (value: string | undefined) => {
    const raw = String(value || '').trim();
    const m = raw.match(/^(\d+)\s*:\s*(\d+)$/);
    if (!m) return '1 / 1';
    const w = Number(m[1]) || 1;
    const h = Number(m[2]) || 1;
    return `${w} / ${h}`;
  };

  const startDragText = (index: number, e: React.PointerEvent) => {
    if (!galleryTextDraftLayout?.elements || !Array.isArray(galleryTextDraftLayout.elements)) return;
    const el = galleryTextDraftLayout.elements[index];
    if (!el) return;

    dragTextRef.current = {
      index,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: Number(el.x) || 0,
      startY: Number(el.y) || 0,
    };

    const onMove = (ev: PointerEvent) => {
      const state = dragTextRef.current;
      if (!state) return;
      setGalleryTextDraftLayout((prev: any) => {
        if (!prev?.elements || !Array.isArray(prev.elements)) return prev;
        const next = { ...prev, elements: prev.elements.map((x: any) => ({ ...x })) };
        const current = next.elements[state.index];
        if (!current) return prev;

        const dx = (ev.clientX - state.startClientX) / 560;
        const dy = (ev.clientY - state.startClientY) / 560;
        current.x = Math.max(0, Math.min(1, state.startX + dx));
        current.y = Math.max(0, Math.min(1, state.startY + dy));
        return next;
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragTextRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const saveGalleryTextLayout = () => {
    if (!galleryTextEditor || !galleryTextDraftLayout) return;
    setGalleryPreviewItems((prev) => prev.map((it) => (it.localId === galleryTextEditor.localId ? { ...it, layout: galleryTextDraftLayout } : it)));
    closeGalleryTextEditor();
  };

  const exportGalleryTextPng = async () => {
    if (!galleryTextEditor || !galleryTextDraftLayout) return;
    const url = galleryTextEditor.imageUrl;

    setIsGalleryTextExporting(true);
    try {
      const resp = await fetch(url, { method: 'GET', credentials: 'include' });
      if (!resp.ok) throw new Error(tr('下载背景图失败', 'Failed to download background'));
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);

      const img = new Image();
      const imgLoaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(tr('加载背景图失败', 'Failed to load background')));
      });
      img.src = objUrl;
      await imgLoaded;

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(tr('导出失败', 'Export failed'));

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const elements = Array.isArray(galleryTextDraftLayout.elements) ? galleryTextDraftLayout.elements : [];
      const base = Math.min(canvas.width, canvas.height);

      for (const el of elements) {
        if (!el || el.type !== 'text') continue;
        const x = Number(el.x) || 0;
        const y = Number(el.y) || 0;
        const w = Number(el.w) || 0.5;
        const h = Number(el.h) || 0.2;
        const fontSize = (Number(el.font_size) || 0.03) * base;
        const fontWeight = Number(el.font_weight) || 600;
        const color = String(el.color || '#111111');
        const align = String(el.align || 'left');
        const bg = String(el.background || '').trim();

        const px = x * canvas.width;
        const py = y * canvas.height;
        const pw = w * canvas.width;
        const ph = h * canvas.height;

        if (bg) {
          ctx.fillStyle = bg;
          ctx.globalAlpha = 0.95;
          ctx.fillRect(px, py, pw, ph);
          ctx.globalAlpha = 1;
        }

        ctx.fillStyle = color;
        ctx.font = `${fontWeight} ${Math.max(10, Math.round(fontSize))}px system-ui`;
        ctx.textBaseline = 'top';
        ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';

        const text = String(el.text || '');
        const lines = text.split(/\r?\n/);
        const lineHeight = Math.round(fontSize * 1.25);
        let ty = py + 8;
        const tx = align === 'center' ? px + pw / 2 : align === 'right' ? px + pw - 8 : px + 8;
        for (const line of lines) {
          ctx.fillText(line, tx, ty);
          ty += lineHeight;
          if (ty > py + ph - lineHeight) break;
        }
      }

      const outBlob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!outBlob) throw new Error(tr('导出失败', 'Export failed'));
      const outUrl = URL.createObjectURL(outBlob);
      const a = document.createElement('a');
      a.href = outUrl;
      a.download = `product_gallery_edit_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(outUrl);
      URL.revokeObjectURL(objUrl);
    } catch (err: any) {
      openGalleryAlert(String(err?.message || err || tr('导出失败', 'Export failed')));
    } finally {
      setIsGalleryTextExporting(false);
    }
  };

  const handleHotStyleAnalyze = async () => {
    if (!gallerySellingPoints.some((p) => String(p || '').trim())) {
      openGalleryAlert(tr('请先填写核心卖点', 'Please fill selling points first'));
      return;
    }
    if (galleryImages.length === 0) {
      openGalleryAlert(tr('请先上传至少 1 张商品图片。', 'Please upload at least 1 product image.'));
      return;
    }

    setHotStyleLoading(true);
    setHotStyleError(null);
    setHotStyleSelectedIndex(null);

    try {
      const uploadTargets = galleryImages.slice(0, 3);
      const imagePaths: string[] = [];
      for (const f of uploadTargets) {
        const resp = await assetsApi.uploadTempAsset(f);
        const p = extractUploadedAssetPath(resp);
        if (p) imagePaths.push(p);
      }
      if (imagePaths.length === 0) throw new Error(tr('图片上传失败', 'Image upload failed'));

      const selling = gallerySellingPoints.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 5);
      const apiResp = await videoApi.hotStyleAnalysis({
        image_paths: imagePaths,
        product_name: galleryProductName.trim(),
        product_category: galleryCategory.trim(),
        selling_points: selling,
        output_language: isZh ? 'zh' : 'en',
      });

      const raw = (apiResp as any)?.data?.styles || (apiResp as any)?.styles || [];
      const styles = Array.isArray(raw)
        ? raw.map((it: any) => ({
            name: String(it?.name || '').slice(0, 20),
            tones: Array.isArray(it?.tones) ? it.tones.map((c: any) => String(c || '').trim()).filter(Boolean).slice(0, 5) : [],
            description: String(it?.description || '').slice(0, 60),
          })).filter((x: any) => x.name && x.description).slice(0, 4)
        : [];

      if (styles.length === 0) throw new Error(tr('AI 返回格式不正确', 'AI response invalid'));
      setHotStyleItems(styles);
      setHotStyleSelectedIndex(null);
    } catch (err: any) {
      const msg = String(err?.message || err || tr('分析失败，请重试。', 'Analysis failed')).trim();
      setHotStyleError(msg);
      openGalleryAlert(msg, tr('分析失败', 'Analysis Failed'));
    } finally {
      setHotStyleLoading(false);
    }
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
      copyLanguage: galleryCopyLanguage,
      productName: galleryProductName.trim(),
      productCategory: galleryCategory.trim(),
      sellingPoints,
      typeSelections: { ...galleryTypeSelections },
      uploadedImagePaths: [] as string[],
    };

    const appendHistory = (urls: string[]) => {
      const images = urls.map((u) => String(u || '').trim()).filter(Boolean);
      if (images.length === 0) return;

      appendImageHistoryItem({
        id: `pg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        featureType: 'gallery',
        createdAt: new Date().toISOString(),
        status: 'succeeded',
        images,
        settings: settingsSnapshot,
      });
      setGalleryHistoryItems(loadGalleryHistoryFromStore());
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
        target_language: galleryCopyLanguage,
        hot_style: hotStyleSelectedIndex !== null ? hotStyleItems[hotStyleSelectedIndex] : undefined,
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
        .filter(Boolean) as Array<{ localId: string; requestId: string; status: 'created' | 'processing' | 'succeeded' | 'failed'; imageUrl?: string; error?: string; layout?: any }>;

      if (initial.length === 0) {
        throw new Error(tr('创建生成任务失败，请重试。', 'Failed to create generation tasks.'));
      }

      setGalleryPreviewItems(initial);

      const collectOutputUrls = (payload: any): string[] => {
        const urls: string[] = [];
        const queue: any[] = [payload];
        let visited = 0;

        const pushUrl = (value: any) => {
          if (typeof value !== 'string') return;
          const cleaned = value.trim();
          if (!cleaned) return;
          if (cleaned.startsWith('http://') || cleaned.startsWith('https://') || cleaned.startsWith('/media/')) {
            if (!urls.includes(cleaned)) urls.push(cleaned);
          }
        };

        while (queue.length > 0 && visited < 80 && urls.length < 8) {
          const current = queue.shift();
          visited += 1;
          if (current == null) continue;

          if (typeof current === 'string') {
            pushUrl(current);
            continue;
          }

          if (Array.isArray(current)) {
            queue.push(...current.slice(0, 12));
            continue;
          }

          if (typeof current === 'object') {
            pushUrl((current as any).url);
            pushUrl((current as any).image_url);
            pushUrl((current as any).file_url);
            pushUrl((current as any).src);
            pushUrl((current as any).path);

            queue.push((current as any).outputs);
            queue.push((current as any).output);
            queue.push((current as any).images);
            queue.push((current as any).result);
            queue.push((current as any).data);
          }
        }

        return urls;
      };

      const successStatuses = new Set(['ready', 'success', 'succeeded', 'completed', 'done']);
      const failureStatuses = new Set(['failed', 'error', 'canceled', 'cancelled', 'rejected']);

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
          const outputs = collectOutputUrls(data);

          if (outputs.length > 0) {
            const url = String(outputs[0] || '').trim();
            if (!url) {
              throw new Error(tr('生成结果为空', 'Output is empty'));
            }

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

          if (failureStatuses.has(status)) {
            setGalleryPreviewItems((prev) =>
              prev.map((it) => (it.requestId === requestId ? { ...it, status: 'failed' as const, error: tr('生成失败', 'Failed') } : it))
            );
            return;
          }

          if (successStatuses.has(status)) {
            setGalleryPreviewItems((prev) =>
              prev.map((it) => (it.requestId === requestId ? { ...it, status: 'failed' as const, error: tr('生成成功但无结果', 'Succeeded but no output') } : it))
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
        overlayClassName="z-[160]"
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
          <div className="w-full flex flex-col items-center justify-center">
            <div className="relative w-full flex items-center justify-center">
              {galleryPreviewNav && galleryPreviewNav.total > 1 ? (
                <button
                  type="button"
                  onClick={handleGalleryPreviewPrev}
                  disabled={galleryPreviewNav.index <= 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/10 text-zinc-200 hover:bg-black/75 disabled:opacity-40 disabled:hover:bg-black/60 transition flex items-center justify-center"
                  aria-label={tr('上一张', 'Previous')}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              ) : null}

              <img src={galleryPreviewImageUrl} alt={tr('预览图片', 'Preview image')} className="max-h-[70vh] w-auto object-contain rounded-xl border border-white/10" />

              {galleryPreviewNav && galleryPreviewNav.total > 1 ? (
                <button
                  type="button"
                  onClick={handleGalleryPreviewNext}
                  disabled={galleryPreviewNav.index >= galleryPreviewNav.total - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/10 text-zinc-200 hover:bg-black/75 disabled:opacity-40 disabled:hover:bg-black/60 transition flex items-center justify-center"
                  aria-label={tr('下一张', 'Next')}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              ) : null}
            </div>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleDownloadGalleryPreviewImage}
                disabled={isGalleryPreviewDownloading}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 disabled:opacity-60 transition flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {isGalleryPreviewDownloading ? tr('下载中...', 'Downloading...') : (t.pi_gallery_preview_download_image || tr('下载图片', 'Download Image'))}
              </button>
              <button
                type="button"
                onClick={handleExportGalleryPreviewAsPdf}
                disabled={isGalleryPreviewExportingPdf}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-black hover:bg-orange-400 disabled:opacity-60 transition"
              >
                {isGalleryPreviewExportingPdf ? tr('导出中...', 'Exporting...') : (t.pi_gallery_preview_export_pdf || tr('导出为PDF', 'Export as PDF'))}
              </button>
              <button
                type="button"
                onClick={openGalleryInpaint}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/10 text-zinc-200 hover:bg-white/10 transition"
              >
                {t.pi_gallery_inpaint_title || tr('局部修改', 'Local Edit')}
              </button>
            </div>
            <div className="mt-2 text-[11px] text-zinc-500 text-center">
              {t.pi_gallery_preview_export_pdf_hint || tr('将打开浏览器打印窗口，可选择“保存为 PDF”。', 'A browser print dialog will open — choose “Save as PDF”.')}
            </div>
          </div>
        ) : null}
      </AppDialog>

      <AppDialog
        isOpen={galleryInpaint.open}
        title={t.pi_gallery_inpaint_title || tr('局部修改', 'Local Edit')}
        onClose={closeGalleryInpaint}
        widthClassName="max-w-none w-[980px]"
        footer={
          <button
            type="button"
            onClick={closeGalleryInpaint}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition"
          >
            {tr('关闭', 'Close')}
          </button>
        }
      >
        {galleryPreviewImageUrl ? (
          <div className="w-full h-[680px] flex flex-col">
            <div className="text-xs text-zinc-500">
              {t.pi_gallery_inpaint_hint || tr('拖拽框选需要修改的区域（矩形）。', 'Drag to select an area to edit (rectangle).')}
            </div>

            <div
              ref={galleryInpaintBoxRef}
              className="mt-3 relative w-full flex-1 min-h-0 rounded-xl border border-white/10 bg-black/30 overflow-hidden select-none"
              onMouseDown={handleInpaintPointerDown}
              onMouseMove={handleInpaintPointerMove}
              onMouseUp={handleInpaintPointerUp}
              onMouseLeave={handleInpaintPointerUp}
            >
              <img
                ref={galleryInpaintImgRef}
                src={galleryInpaint.resultUrl || galleryPreviewImageUrl}
                alt={tr('预览图片', 'Preview image')}
                className="w-full h-full object-contain"
                draggable={false}
              />

              {galleryInpaint.rect ? (
                <>
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: 'rgba(0,0,0,0.55)',
                      clipPath: `polygon(0 0, 0 100%, ${galleryInpaint.rect.x * 100}% 100%, ${galleryInpaint.rect.x * 100}% ${galleryInpaint.rect.y * 100}%, ${(galleryInpaint.rect.x + galleryInpaint.rect.w) * 100}% ${galleryInpaint.rect.y * 100}%, ${(galleryInpaint.rect.x + galleryInpaint.rect.w) * 100}% ${(galleryInpaint.rect.y + galleryInpaint.rect.h) * 100}%, ${galleryInpaint.rect.x * 100}% ${(galleryInpaint.rect.y + galleryInpaint.rect.h) * 100}%, ${galleryInpaint.rect.x * 100}% 100%, 100% 100%, 100% 0)`
                    }}
                  />
                  <div
                    className="absolute border-2 border-orange-500 pointer-events-none"
                    style={{
                      left: `${galleryInpaint.rect.x * 100}%`,
                      top: `${galleryInpaint.rect.y * 100}%`,
                      width: `${galleryInpaint.rect.w * 100}%`,
                      height: `${galleryInpaint.rect.h * 100}%`,
                    }}
                  />
                </>
              ) : (
                <div className="absolute inset-0 pointer-events-none bg-black/35" />
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2">
              <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pi_gallery_inpaint_prompt_label || tr('修改指令', 'Edit instruction')}</div>
              <textarea
                value={galleryInpaint.prompt}
                onChange={(e) => setGalleryInpaint((prev) => ({ ...prev, prompt: e.target.value }))}
                placeholder={t.pi_gallery_inpaint_prompt_placeholder || tr('例如：把选中区域替换成一束橙色花朵，风格与原图一致。', 'E.g. Replace the selected area with a bouquet of orange flowers, keep style consistent.')}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20 min-h-[88px]"
              />
            </div>

            {galleryInpaint.error ? <div className="mt-2 text-[11px] text-red-400">{galleryInpaint.error}</div> : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setGalleryInpaint((prev) => ({ ...prev, rect: null, resultUrl: null, error: null }))}
                disabled={galleryInpaint.isGenerating}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 disabled:opacity-60 transition"
              >
                {t.pi_gallery_inpaint_clear || tr('清除框选', 'Clear')}
              </button>
              <button
                type="button"
                onClick={handleRunInpaint}
                disabled={galleryInpaint.isGenerating}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-black hover:bg-orange-400 disabled:opacity-60 transition"
              >
                {galleryInpaint.isGenerating ? (t.pi_gallery_inpaint_generating || tr('生成中...', 'Generating...')) : (t.pi_gallery_inpaint_generate || tr('开始生成', 'Generate'))}
              </button>
            </div>
          </div>
        ) : null}
      </AppDialog>

      <AppDialog
        isOpen={isTextSeparationHistoryPickerOpen}
        title={tr('选择商品套图历史图片', 'Choose Product Gallery History')}
        onClose={() => setIsTextSeparationHistoryPickerOpen(false)}
        widthClassName="max-w-6xl"
        footer={
          <button
            type="button"
            onClick={() => setIsTextSeparationHistoryPickerOpen(false)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition"
          >
            {tr('关闭', 'Close')}
          </button>
        }
      >
        {galleryHistoryItems.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-zinc-500">
            {tr('暂无可用的商品套图历史图片', 'No Product Gallery history available')}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto pr-1">
            {galleryHistoryItems
              .slice()
              .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
              .flatMap((item) =>
                item.images.map((url, idx) => (
                  <div key={`${item.id}-${idx}`} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                    <button
                      type="button"
                      onClick={() => {
                        setIsTextSeparationHistoryPickerOpen(false);
                        selectTextSeparationSource(url, `${tr('历史图片', 'History Image')} ${item.createdAt}`, url);
                      }}
                      disabled={isTextSeparationLoading}
                      className="block w-full disabled:opacity-70"
                    >
                      <img src={url} alt={`${item.id}-${idx}`} className="aspect-square w-full object-cover" />
                    </button>
                    <div className="border-t border-white/10 px-3 py-3">
                      <div className="text-[11px] text-zinc-500">{item.createdAt}</div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => openGalleryImagePreview(url)}
                          className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:bg-zinc-800"
                        >
                          {tr('预览', 'Preview')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsTextSeparationHistoryPickerOpen(false);
                            selectTextSeparationSource(url, `${tr('历史图片', 'History Image')} ${item.createdAt}`, url);
                          }}
                          disabled={isTextSeparationLoading}
                          className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-black transition hover:bg-orange-400 disabled:opacity-60"
                        >
                          {isTextSeparationLoading ? tr('处理中...', 'Processing...') : tr('文本分离', 'Text Separation')}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
          </div>
        )}
      </AppDialog>

      <header className="relative z-[220] flex justify-between gap-6 px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm">
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

        <div className={panelClassName('product_images_text_separation')}>
          {textSeparationSession ? (
            <TextSeparationDemoView
              backgroundImageUrl={textSeparationSession.backgroundImageUrl}
              originalImageUrl={textSeparationSession.originalImageUrl}
              sampleTitle={textSeparationSession.sampleTitle}
              textBlocks={textSeparationSession.textBlocks}
              isZh={isZh}
              onBack={() => setTextSeparationSession(null)}
            />
          ) : (
            <div className="h-full flex gap-6">
              <div className="w-[30%] min-w-[360px] max-w-[420px]">
                <div className="rounded-2xl border border-white/5 bg-white/2 p-5">
                  <input
                    ref={textSeparationFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      handleTextSeparationFileSelection(Array.from(e.target.files || []));
                      e.target.value = '';
                    }}
                  />
                  <div
                    className="transition-colors"
                    onDragEnter={(e) => {
                      preventDragDefaults(e);
                      setIsTextSeparationDragActive(true);
                    }}
                    onDragOver={(e) => {
                      preventDragDefaults(e);
                      setIsTextSeparationDragActive(true);
                    }}
                    onDragLeave={(e) => {
                      preventDragDefaults(e);
                      setIsTextSeparationDragActive(false);
                    }}
                    onDrop={(e) => {
                      preventDragDefaults(e);
                      setIsTextSeparationDragActive(false);
                      handleTextSeparationFileSelection(Array.from(e.dataTransfer.files || []));
                    }}
                  >
                  {textSeparationUploadPreviewUrl ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-zinc-200">{tr('当前处理图片', 'Current Image')}</div>
                          <div className="mt-2 truncate text-sm font-bold text-zinc-200">
                            {textSeparationUploadName || tr('最近上传', 'Latest upload')}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {isTextSeparationLoading
                              ? tr('正在处理文本分离...', 'Text separation in progress...')
                              : tr('点击“开始文本分离”后再发起处理', 'Start processing after you click "Start Text Separation"')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => clearSelectedTextSeparationSource()}
                          disabled={isTextSeparationLoading}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/50 text-zinc-300 transition hover:bg-black/80 hover:text-white disabled:opacity-60"
                          title={tr('删除并重新选择', 'Remove and choose again')}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <img
                        src={textSeparationUploadPreviewUrl}
                        alt={textSeparationUploadName || 'upload'}
                        className="mt-3 w-full rounded-xl border border-white/10 object-cover"
                      />
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={handleStartTextSeparation}
                          disabled={isTextSeparationLoading || !textSeparationSelectedImagePath}
                          className="flex-1 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-black transition hover:bg-orange-400 disabled:opacity-60"
                        >
                          {isTextSeparationLoading ? tr('处理中...', 'Processing...') : tr('开始文本分离', 'Start Text Separation')}
                        </button>
                        <button
                          type="button"
                          onClick={() => openGalleryImagePreview(textSeparationUploadPreviewUrl)}
                          className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800"
                        >
                          {tr('查看', 'View')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-bold text-zinc-200">{tr('上传图片', 'Upload Image')}</div>
                      <div className="mt-2 text-xs text-zinc-500">
                        {tr('上传文件后会先转换成真实 image_path，确认预览后再开始文本分离', 'Uploaded files are converted to a real image_path before processing')}
                      </div>
                      <button
                        type="button"
                        onClick={() => textSeparationFileInputRef.current?.click()}
                        disabled={isTextSeparationLoading}
                        className={`mt-4 w-full rounded-2xl border border-dashed px-4 py-10 text-center transition disabled:opacity-60 ${
                          isTextSeparationDragActive
                            ? 'border-orange-500/70 bg-orange-500/10 text-orange-100'
                            : 'border-white/10 bg-black/20 text-zinc-500 hover:border-white/20 hover:text-zinc-300'
                        }`}
                      >
                        <Upload className="mx-auto mb-3 h-10 w-10 opacity-70" />
                        <div className="text-sm font-semibold">{tr('选择一张海报图片', 'Choose one poster image')}</div>
                        <div className="mt-1 text-[11px]">{tr('支持拖拽或点击上传，格式：JPG / PNG / WEBP', 'Drag and drop or click to upload. Formats: JPG / PNG / WEBP')}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsTextSeparationHistoryPickerOpen(true)}
                        disabled={isTextSeparationLoading}
                        className="mt-3 w-full rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60"
                      >
                        {tr('从商品套图历史记录选择', 'Choose from Product Gallery History')}
                      </button>
                    </>
                  )}
                  </div>
                </div>
              </div>

              <div className="flex-1 min-w-0 rounded-2xl border border-white/5 bg-white/2 p-5 flex flex-col min-h-0 max-h-[calc(100vh-220px)]">
                <div className="text-sm font-bold text-zinc-200">{tr('生成记录', 'Generation Records')}</div>
                <div className="flex-1 mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 overflow-y-auto">
                  {textSeparationRecords.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                      {tr('暂无生成记录', 'No generation records yet')}
                    </div>
                  ) : (
                    <div className="p-4 grid grid-cols-2 gap-3">
                      {textSeparationRecords.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => openTextSeparationHistoryItem(item)}
                          disabled={item.status !== 'succeeded'}
                          className="overflow-hidden rounded-xl border border-white/10 bg-black/20 text-left transition hover:border-orange-500/40 disabled:hover:border-white/10 disabled:cursor-default"
                        >
                          <div className="aspect-video overflow-hidden border-b border-white/10 bg-black/30 relative">
                            <img
                              src={(item.status === 'succeeded' && item.backgroundImageUrl) ? item.backgroundImageUrl : item.originalImageUrl}
                              alt={item.sampleTitle}
                              className={`h-full w-full object-cover ${item.status === 'processing' ? 'opacity-70' : ''}`}
                            />
                            {item.status === 'processing' ? (
                              <div className="absolute inset-x-3 bottom-3">
                                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-orange-500 transition-[width] duration-200"
                                    style={{ width: `${Math.max(6, item.progress)}%` }}
                                  />
                                </div>
                              </div>
                            ) : null}
                          </div>
                          <div className="p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="truncate text-sm font-bold text-zinc-200">{item.sampleTitle}</div>
                              <div className={`text-[11px] font-bold ${item.status === 'processing' ? 'text-orange-300' : 'text-emerald-300'}`}>
                                {item.status === 'processing' ? tr('生成中', 'Processing') : tr('已完成', 'Done')}
                              </div>
                            </div>
                            <div className="mt-1 text-[11px] text-zinc-500">{item.createdAt}</div>
                            <div className="mt-2 text-xs text-zinc-400">
                              {item.status === 'processing'
                                ? tr(`进度 ${Math.round(item.progress)}%`, `${Math.round(item.progress)}% complete`)
                                : tr(`文本框 ${item.textBlocks?.length || 0} 个`, `${item.textBlocks?.length || 0} text blocks`)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
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
                      appendGalleryFiles(Array.from(e.target.files || []));
                      e.target.value = '';
                    }}
                  />
                  <div
                    className="transition-colors"
                    onDragEnter={(e) => {
                      preventDragDefaults(e);
                      setIsGalleryDragActive(true);
                    }}
                    onDragOver={(e) => {
                      preventDragDefaults(e);
                      setIsGalleryDragActive(true);
                    }}
                    onDragLeave={(e) => {
                      preventDragDefaults(e);
                      setIsGalleryDragActive(false);
                    }}
                    onDrop={(e) => {
                      preventDragDefaults(e);
                      setIsGalleryDragActive(false);
                      appendGalleryFiles(Array.from(e.dataTransfer.files || []));
                    }}
                  >
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
                      className={`group mt-3 w-full rounded-2xl border border-dashed px-4 py-10 text-center transition ${
                        isGalleryDragActive
                          ? 'border-orange-500/70 bg-orange-500/10 text-orange-100'
                          : 'border-white/10 bg-black/20 text-zinc-500 hover:text-zinc-300 hover:border-white/20'
                      }`}
                    >
                      <div className="relative w-10 h-10 mx-auto mb-2">
                        <ImageIcon className="w-10 h-10 opacity-50 transition-opacity duration-150 group-hover:opacity-0" />
                        <Upload className="absolute inset-0 w-10 h-10 opacity-0 transition-opacity duration-150 group-hover:opacity-60" />
                      </div>
                      <div className="text-sm font-semibold">{t.pi_gallery_upload_title}</div>
                      <div className="text-[11px] mt-1">
                        {tr('支持拖拽或点击上传，最多 3 张图片', 'Drag and drop or click to upload, up to 3 images')}
                      </div>
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
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.hist_img_setting_product}</div>
                    <input
                      value={galleryProductName}
                      onChange={(e) => setGalleryProductName(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                      placeholder={t.pi_gallery_placeholder_product_name}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.hist_img_setting_category}</div>
                    <input
                      value={galleryCategory}
                      onChange={(e) => setGalleryCategory(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                      placeholder={t.pi_gallery_placeholder_category}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pi_gallery_selling_points_label}</div>
                      <button
                        type="button"
                        onClick={() => setGallerySellingPoints((prev) => (prev.length >= 5 ? prev : [...prev, '']))}
                        className="px-2 py-1 rounded-lg text-[11px] font-bold border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-60"
                        disabled={gallerySellingPoints.length >= 5}
                      >
                        {t.ui_add}
                      </button>
                    </div>
                    {gallerySellingPoints.length === 0 ? (
                      <div className="text-xs text-zinc-600">{t.ui_not_filled}</div>
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

              <div className="rounded-2xl border border-white/5 bg-white/2 p-5">
                <div className="text-sm font-bold text-zinc-200">{tr('爆款风格分析', 'Hot Style Analysis')}</div>

                {hotStyleLoading ? (
                  <div className="mt-4 h-28 rounded-xl border border-white/10 bg-white/5 flex flex-col items-center justify-center gap-3 text-zinc-400">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-zinc-400/70 animate-pulse" />
                      <span className="w-2 h-2 rounded-full bg-zinc-400/70 animate-pulse [animation-delay:150ms]" />
                      <span className="w-2 h-2 rounded-full bg-zinc-400/70 animate-pulse [animation-delay:300ms]" />
                    </div>
                    <div className="text-xs">{tr('爆款风格生成中...', 'Analyzing styles...')}</div>
                  </div>
                ) : hotStyleItems.length === 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={handleHotStyleAnalyze}
                      disabled={!(galleryImages.length > 0 && gallerySellingPoints.some((p) => String(p || '').trim()))}
                      className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-zinc-300 hover:bg-white/10 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />{tr('爆款风格分析', 'Analyze Hot Styles')}
                    </button>
                    {!(galleryImages.length > 0 && gallerySellingPoints.some((p) => String(p || '').trim())) && (
                      <div className="mt-2 text-[11px] text-zinc-500">{tr('需上传图片并填写核心卖点', 'Upload images and fill selling points first')}</div>
                    )}
                    {hotStyleError ? <div className="mt-2 text-[11px] text-red-400">{hotStyleError}</div> : null}
                  </>
                ) : (
                  <>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('风格建议', 'Style Ideas')}</div>
                      <button
                        type="button"
                        onClick={handleHotStyleAnalyze}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
                      >
                        <RotateCw className="w-4 h-4" />{tr('换一批风格', 'Regenerate')}
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {hotStyleItems.map((s, idx) => {
                        const isSelected = hotStyleSelectedIndex === idx;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setHotStyleSelectedIndex((prev) => (prev === idx ? null : idx))}
                            className={`relative text-left rounded-xl border bg-black/20 p-3 transition ${
                              isSelected
                                ? 'border-orange-500'
                                : 'border-white/10 hover:border-white/20'
                            }`}
                            title={isSelected ? tr('已选择，再次点击取消', 'Selected. Click again to unselect') : tr('点击选择', 'Click to select')}
                          >
                            <div className="flex items-center gap-1 mb-2">
                              {s.tones.slice(0, 4).map((c, i) => (
                                <span key={i} className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: c }} />
                              ))}
                            </div>
                            <div className="text-sm font-bold text-zinc-200">{s.name}</div>
                            <div className="mt-1 text-xs text-zinc-400">{s.description}</div>
                            <div
                              className={`absolute top-2 right-2 w-5 h-5 rounded-md border flex items-center justify-center text-[11px] font-bold ${
                                isSelected
                                  ? 'bg-orange-500 border-orange-500 text-black'
                                  : 'bg-black/40 border-white/20 text-transparent'
                              }`}
                            >
                              ✓
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="w-[32%] min-w-[420px] max-w-[640px] flex flex-col gap-4 min-h-0">
              <div className="rounded-2xl border border-white/5 bg-white/2 p-5 flex flex-col min-h-0">
                <div className="text-sm font-bold text-zinc-200 shrink-0">{t.hist_img_settings_title}</div>

                <div className="mt-4 space-y-6">
                  <div>
                    <div className="text-xs font-bold text-zinc-200">{t.pi_gallery_settings_section_basics}</div>
                    <div className="mt-3 grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.hist_img_setting_scene}</div>
                        <DropdownSelect
                          value={galleryTargetScene}
                          options={[
                            { value: 'detail', label: t.pi_gallery_target_scene_detail },
                            { value: 'xiaohongshu', label: t.pi_gallery_target_scene_xiaohongshu },
                            { value: 'douyin', label: t.pi_gallery_target_scene_douyin },
                            { value: 'poster', label: t.pi_gallery_target_scene_poster },
                            { value: 'ads', label: t.pi_gallery_target_scene_ads },
                          ]}
                          onChange={(v) => setGalleryTargetScene(v as any)}
                          buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                          iconClassName="w-4 h-4 text-zinc-500"
                          optionClassName="text-xs"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.hist_img_setting_style}</div>
                        <DropdownSelect
                          value={galleryStyle}
                          options={[
                            { value: 'ecom_clean', label: t.pi_gallery_style_ecom_clean },
                            { value: 'lifestyle', label: t.pi_gallery_style_lifestyle },
                            { value: 'premium', label: t.pi_gallery_style_premium },
                            { value: 'festival', label: t.pi_gallery_style_festival },
                          ]}
                          onChange={(v) => setGalleryStyle(v as any)}
                          buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                          iconClassName="w-4 h-4 text-zinc-500"
                          optionClassName="text-xs"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pi_gallery_copy_language_label}</div>
                        <DropdownSelect
                          value={galleryCopyLanguage}
                          options={GALLERY_COPY_LANGUAGE_OPTIONS.map((opt) => ({ value: opt.value, label: t[opt.labelKey] }))}
                          onChange={(v) => setGalleryCopyLanguage(String(v || 'en'))}
                          buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                          iconClassName="w-4 h-4 text-zinc-500"
                          optionClassName="text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold text-zinc-200">{t.hist_img_setting_types}</div>
                    <div className="mt-3 space-y-3">
                      {([
                        ['white_bg', t.pi_gallery_output_white_bg],
                        ['scene', t.pi_gallery_output_scene],
                        ['selling_point', t.pi_gallery_output_selling_point],
                        ['cover', t.pi_gallery_output_cover],
                        ['poster', t.pi_gallery_output_poster],
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
                    <div className="text-xs font-bold text-zinc-200">{t.pi_gallery_settings_section_specs}</div>
                    <div className="mt-3 grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.hist_img_setting_ratio}</div>
                        <DropdownSelect
                          value={galleryAspectRatio}
                          options={[
                            { value: '21:9', label: `${t.pi_gallery_ratio_group_landscape} · ${t.pi_gallery_ratio_21_9}` },
                            { value: '16:9', label: `${t.pi_gallery_ratio_group_landscape} · ${t.pi_gallery_ratio_16_9}` },
                            { value: '4:3', label: `${t.pi_gallery_ratio_group_landscape} · ${t.pi_gallery_ratio_4_3}` },
                            { value: '3:2', label: `${t.pi_gallery_ratio_group_landscape} · ${t.pi_gallery_ratio_3_2}` },
                            { value: '1:1', label: `${t.pi_gallery_ratio_group_square} · ${t.pi_gallery_ratio_1_1}` },
                            { value: 'default', label: `${t.pi_gallery_ratio_group_square} · ${t.pi_gallery_ratio_default}` },
                            { value: '9:16', label: `${t.pi_gallery_ratio_group_vertical} · ${t.pi_gallery_ratio_9_16}` },
                            { value: '3:4', label: `${t.pi_gallery_ratio_group_vertical} · ${t.pi_gallery_ratio_3_4}` },
                            { value: '2:3', label: `${t.pi_gallery_ratio_group_vertical} · ${t.pi_gallery_ratio_2_3}` },
                            { value: '5:4', label: `${t.pi_gallery_ratio_group_flexible} · ${t.pi_gallery_ratio_5_4}` },
                            { value: '4:5', label: `${t.pi_gallery_ratio_group_flexible} · ${t.pi_gallery_ratio_4_5}` },
                          ]}
                          onChange={(v) => setGalleryAspectRatio(String(v))}
                          buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                          iconClassName="w-4 h-4 text-zinc-500"
                          optionClassName="text-xs"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pi_gallery_resolution_label}</div>
                        <DropdownSelect
                          value={galleryResolution}
                          options={[
                            { value: '1k', label: '1K' },
                            { value: '2k', label: '2K' },
                            { value: '4k', label: '4K' },
                          ]}
                          onChange={(v) => setGalleryResolution(v as any)}
                          buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                          iconClassName="w-4 h-4 text-zinc-500"
                          optionClassName="text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGalleryGenerate}
                  disabled={isGalleryGenerating}
                  className="mt-4 w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-black hover:bg-orange-400 disabled:opacity-60 disabled:hover:bg-orange-500 transition flex items-center justify-center gap-2 shrink-0"
                >
                  <Wand2 className="w-4 h-4" />
                  {isGalleryGenerating ? tr('生成中...', 'Generating...') : tr('开始生成', 'Generate')}
                </button>
              </div>
            </div>

            <div className="flex-1 min-w-0 rounded-2xl border border-white/5 bg-white/2 p-5 flex flex-col min-h-0 max-h-[calc(100vh-220px)]">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-zinc-200">
                  {galleryRightPanel === 'preview' ? tr('预览区', 'Preview') : tr('历史记录', 'History')}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setGalleryRightPanel('preview');
                      setIsGalleryHistoryManaging(false);
                      setGalleryHistorySelectedKeys([]);
                    }}
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
                    onClick={() => {
                      setGalleryRightPanel('history');
                      setIsGalleryHistoryManaging(false);
                      setGalleryHistorySelectedKeys([]);
                    }}
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

                <div className="flex-1 min-h-0 mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 overflow-y-auto custom-scroll">
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
                                onClick={() => openGalleryImagePreview(item.imageUrl as string, { kind: 'preview_item', localId: item.localId })}
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
                                  onClick={() => openGalleryImagePreview(url, { kind: 'history_item', itemId: item.id, index: idx })}
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
