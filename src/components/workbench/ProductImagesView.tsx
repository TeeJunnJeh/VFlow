import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Plus, Upload, X, Wand2, Minus, Sparkles, RotateCw, Download, LayoutGrid } from 'lucide-react';
import type { ViewType } from './types';
import { useLanguage } from '../../context/LanguageContext';
import { DropdownSelect } from '../common/DropdownSelect';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { FirstFrameView, SmartRepairView } from '../productImages';
import { AppDialog } from '../common/AppDialog';
import GalleryBoardEditor from './GalleryBoardEditor';
import { assetsApi } from '../../services/assets';
import { videoApi } from '../../services/video';

interface ProductImagesViewProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
}

type GalleryHistorySettings = {
  targetScene: string;
  style: string;
  aspectRatio: string;
  resolution: string;
  productName: string;
  productCategory: string;
  sellingPoints: string[];
  typeSelections: Record<string, { enabled: boolean; count: number }>;
  sceneConfig?: GallerySceneConfig;
};

type GallerySceneConfig = {
  sceneTheme: string;
  sceneDescription: string;
  sceneProps: string;
  lighting: string;
  mood: string;
};

const GALLERY_SCENE_PRESETS: Array<GallerySceneConfig & { id: string; name: string }> = [
  {
    id: 'kitchen_counter',
    name: '厨房台面',
    sceneTheme: '现代厨房台面',
    sceneDescription: '干净的厨房石英台面，背景有轻微虚化的橱柜与餐具，整体整洁明亮。',
    sceneProps: '瓷盘，亚麻餐巾，玻璃杯，少量食材点缀',
    lighting: '侧前方自然柔光，明亮但不过曝',
    mood: '清新，日常，高品质生活感',
  },
  {
    id: 'vanity_desk',
    name: '梳妆台',
    sceneTheme: '精致梳妆台',
    sceneDescription: '米白色或浅木色梳妆台，背景简洁，高级但生活化。',
    sceneProps: '镜子，香氛，托盘，化妆刷，丝绸布料',
    lighting: '柔和漫射光，略带暖调',
    mood: '高级，女性化，精致护理感',
  },
  {
    id: 'living_room',
    name: '客厅茶几',
    sceneTheme: '现代客厅茶几',
    sceneDescription: '简洁现代客厅环境，茶几作为主要表面，背景为沙发和窗边虚化景深。',
    sceneProps: '杂志，咖啡杯，小型绿植，摆件',
    lighting: '窗边自然光，光线均匀柔和',
    mood: '松弛，温暖，居家品质感',
  },
  {
    id: 'bathroom_sink',
    name: '浴室台面',
    sceneTheme: '高级浴室洗手台',
    sceneDescription: '石材洗手台面，背景有镜面和简洁卫浴元素，整体干净利落。',
    sceneProps: '毛巾，托盘，香薰蜡烛，绿植',
    lighting: '顶部柔光加侧面补光，清爽高亮',
    mood: '洁净，护理感，高级氛围',
  },
  {
    id: 'outdoor_picnic',
    name: '户外野餐',
    sceneTheme: '户外草地野餐',
    sceneDescription: '自然草地或木桌环境，背景带户外虚化景色，画面通透轻松。',
    sceneProps: '野餐布，藤篮，水果，玻璃瓶，花束',
    lighting: '自然日光，通透明快',
    mood: '轻松，活力，生活方式感',
  },
];

type GalleryHistoryItem = {
  id: string;
  title: string;
  createdAt: string;
  images: string[];
  settings?: GalleryHistorySettings;
};

type GalleryCollageSlot = {
  id: string;
  rect: { x: number; y: number; w: number; h: number };
};

type GalleryCollagePreset = {
  id: string;
  name: string;
  aspectRatio: string;
  canvasWidth: number;
  canvasHeight: number;
  slots: GalleryCollageSlot[];
};

type GalleryCollageDraft = {
  presetId: string;
  title: string;
  subtitle: string;
  background: string;
  gap: number;
  slotAssignments: Record<string, string>;
};

type GalleryPreviewItem = {
  localId: string;
  requestId: string;
  status: 'created' | 'processing' | 'succeeded' | 'failed';
  imageUrl?: string;
  error?: string;
  layout?: any;
  outputLabel?: string;
};

const GALLERY_COLLAGE_PRESETS: GalleryCollagePreset[] = [
  {
    id: 'two_split',
    name: '2-Up Split',
    aspectRatio: '1:1',
    canvasWidth: 1200,
    canvasHeight: 1200,
    slots: [
      { id: 'slot_1', rect: { x: 0.06, y: 0.22, w: 0.41, h: 0.7 } },
      { id: 'slot_2', rect: { x: 0.53, y: 0.22, w: 0.41, h: 0.7 } },
    ],
  },
  {
    id: 'three_story',
    name: '3-Panel Story',
    aspectRatio: '4:5',
    canvasWidth: 1200,
    canvasHeight: 1500,
    slots: [
      { id: 'slot_1', rect: { x: 0.06, y: 0.23, w: 0.34, h: 0.28 } },
      { id: 'slot_2', rect: { x: 0.06, y: 0.56, w: 0.34, h: 0.28 } },
      { id: 'slot_3', rect: { x: 0.44, y: 0.23, w: 0.5, h: 0.61 } },
    ],
  },
  {
    id: 'quad_grid',
    name: '4-Grid Mosaic',
    aspectRatio: '1:1',
    canvasWidth: 1200,
    canvasHeight: 1200,
    slots: [
      { id: 'slot_1', rect: { x: 0.06, y: 0.22, w: 0.41, h: 0.31 } },
      { id: 'slot_2', rect: { x: 0.53, y: 0.22, w: 0.41, h: 0.31 } },
      { id: 'slot_3', rect: { x: 0.06, y: 0.58, w: 0.41, h: 0.31 } },
      { id: 'slot_4', rect: { x: 0.53, y: 0.58, w: 0.41, h: 0.31 } },
    ],
  },
];

const ProductImagesView: React.FC<ProductImagesViewProps> = ({ activeView, setActiveView }) => {
  const { language, t } = useLanguage();
  const isZh = language === 'zh';
  const zhTextByEnglish: Record<string, string> = {
    'AI Clothing Swap': 'AI 换装',
    'AI clothing swap is currently in development.': '商品服饰智能换装功能开发中',
    'Smart Repair': '智能修复',
    'Extensible smart-retouch workspace with three capability groups': '基于三类能力中心进行可扩展的智能修图',
    'Product Gallery': '商品套图',
    'Generate e-commerce image sets from product info and scene settings': '围绕商品信息与场景配置批量生成电商图',
    'AI First Frame Generation': 'AI 首帧图生成',
    'Create starting visuals for video generation': '为视频生成提供起始视觉素材',
    Notice: '提示',
    'Delete selected images?': '确定删除选中的图片吗？',
    'Delete confirmation': '删除确认',
    Delete: '删除',
    Cancel: '取消',
    Confirm: '确认',
    OK: '确定',
    'Unsupported file format. Only images are supported: .jpg .jpeg .png .webp': '文件格式不支持，仅支持图片：.jpg .jpeg .png .webp',
    'No editable layout. Fill selling points and generate styles, then generate gallery again.': '没有可编辑版式，请先生成爆款风格并填写卖点后再生成套图。',
    'Failed to download background': '下载背景图失败',
    'Failed to load background': '加载背景图失败',
    'Export failed': '导出失败',
    'Please fill selling points first': '请先填写核心卖点',
    'Please upload at least 1 product image.': '请先上传至少 1 张商品图片。',
    'Image upload failed': '图片上传失败',
    'AI response invalid': 'AI 返回格式不正确',
    'Analysis failed': '分析失败',
    'Analysis Failed': '分析失败',
    'Overwrite current fields with new AI results?': '是否使用新的识别结果覆盖当前内容？',
    'Overwrite confirmation': '覆盖确认',
    Overwrite: '覆盖',
    'Image upload failed. Please try again.': '图片上传失败，请重试。',
    'Recognition failed. Please try again.': '识别失败，请重试。',
    'Recognition failed': '识别失败',
    'Please select at least one generation type.': '请至少选择一种生成类型。',
    'Failed to create generation tasks.': '创建生成任务失败，请重试。',
    'Output is empty': '生成结果为空',
    Failed: '失败',
    'Succeeded but no output': '生成成功但无结果',
    Timeout: '生成超时',
    'Generation failed. Please try again.': '生成失败，请重试。',
    'Image Preview': '图片预览',
    Close: '关闭',
    'Preview image': '预览图片',
    'AI Clothing Swap (In Development)': 'AI 换装（开发中）',
    'Upload Product Images': '上传商品图',
    Clear: '清除',
    Remove: '移除',
    'Upload new images to replace': '上传新图片替换',
    'Product Info': '商品信息',
    'Analyzing...': '分析中...',
    'AI Analyze': 'AI分析',
    'Hot Style Analysis': '爆款风格分析',
    'Analyze Hot Styles': '爆款风格分析',
    'Upload images and fill selling points first': '需上传图片并填写核心卖点',
    'Style Ideas': '风格建议',
    Regenerate: '换一批风格',
    'Selected. Click again to unselect': '已选择，再次点击取消',
    'Click to select': '点击选择',
    'Generation Settings': '生成设置',
    Basics: '基础配置',
    Outputs: '输出类型',
    Specs: '规格',
    'Generating...': '生成中...',
    Generate: '开始生成',
    Preview: '预览',
    History: '历史记录',
    'Waiting for generation...': '等待生成...',
    Waiting: '等待中',
    Done: '已完成',
    Generating: '生成中',
    'Click to preview': '点击预览',
    'No history yet': '暂无历史记录',
    imgs: '张',
    'View Full Image': '查看大图',
    'Edit Text': '编辑文案',
    'Save Changes': '保存修改',
    'Exporting...': '导出中...',
    'Export PNG': '导出 PNG',
    'Canvas Preview': '画板预览',
    'Drag text on the canvas to reposition it': '可在画板中拖拽文字微调位置',
    'Text Layers': '文字图层',
    'No editable text': '暂无可编辑文字',
    'Text Block': '文字块',
    'Text Content': '文案内容',
    Alignment: '对齐方式',
    Left: '左对齐',
    Center: '居中',
    Right: '右对齐',
    'Text Color': '文字颜色',
    'Font Size': '字号',
    'Font Weight': '字重',
    Background: '背景色',
    'Example: rgba(0,0,0,0.2), optional': '例如 rgba(0,0,0,0.2)，可留空',
    'Position X': '横向位置',
    'Position Y': '纵向位置',
    Width: '宽度',
    Height: '高度',
    'Use 0-1 relative values': '使用 0-1 相对值',
    'Waiting...': '等待中...',
    'Fill Preview': '填充到预览区',
    'Loaded into preview': '已填充到预览区',
    'Clear Preview': '清空预览',
    'Generate at least 2 successful images before creating a collage.': '请至少先生成 2 张成功图片再进行拼图。',
    'Generate at least 1 successful image before opening the board.': '请先至少生成 1 张成功图片再进入画板。',
    'Collage Board': '拼图画板',
    'Export Collage PNG': '导出拼图 PNG',
    'Collage Preview': '拼图预览',
    'Compose the current generated images on a local board': '基于当前生成结果在本地画板排版',
    'Collage Layout': '拼图模板',
    Title: '标题',
    Subtitle: '副标题',
    'Background Color': '背景颜色',
    'Slot Gap': '图槽间距',
    'Slot Assignments': '图槽分配',
    Current: '当前使用',
    'Enter title': '输入标题',
    'Enter a subtitle or selling-point summary': '输入补充说明或卖点总结',
    Image: '图片',
    'Board Editor': '画板编辑器',
    'Scene Settings': '场景设定',
    'Scene Theme': '场景主题',
    'Scene Description': '场景描述',
    'Scene Props': '道具元素',
    Lighting: '光线设定',
    Mood: '氛围情绪',
    'Scene settings will guide scene, cover, and poster generation.': '这些场景设定会用于指导场景图、封面图和海报图生成。',
    'Enter a scene theme such as kitchen counter, vanity desk, outdoor picnic': '输入场景主题，例如厨房台面、梳妆桌、户外野餐',
    'Describe the environment, surface, background, and use context': '描述环境、台面、背景和使用语境',
    'List supporting props or visual elements separated by commas': '填写辅助道具或画面元素，使用逗号分隔',
    'Describe light direction, hardness, and color temperature': '描述光线方向、软硬程度和色温',
    'Describe the intended mood or brand feeling': '描述希望表达的情绪或品牌感受',
    'Please fill at least 1 selling point before generating selling-point images.': '开启卖点图前，请至少填写 1 条核心卖点。',
    'Save Preview': '保存预览',
    'Save to History': '保存到历史',
    'History Title': '记录标题',
    'Use a custom title for the current preview set': '为当前预览区设置一个标题后保存到历史记录',
    'Save current preview to history?': '是否将当前预览区保存到历史记录？',
    'Save Preview Confirmation': '保存预览确认',
    'Preview saved to history': '当前预览区已保存到历史记录',
    'Enter history title': '输入历史记录标题',
    'Apply Scene Preset': '场景预设',
    'Delete History': '删除历史',
  };
  const tr = (zhText: string, enText: string) => {
    if (!isZh) return enText;
    const safeZh = /[\u4e00-\u9fff]/.test(zhText) ? zhText : '';
    return zhTextByEnglish[enText] || safeZh || enText;
  };

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
  const [gallerySceneTheme, setGallerySceneTheme] = useState('');
  const [gallerySceneDescription, setGallerySceneDescription] = useState('');
  const [gallerySceneProps, setGallerySceneProps] = useState('');
  const [gallerySceneLighting, setGallerySceneLighting] = useState('');
  const [gallerySceneMood, setGallerySceneMood] = useState('');
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
  const [galleryHistoryItems, setGalleryHistoryItems] = useState<GalleryHistoryItem[]>([]);
  const [isGalleryHistoryManaging, setIsGalleryHistoryManaging] = useState(false);
  const [galleryHistorySelectedKeys, setGalleryHistorySelectedKeys] = useState<string[]>([]);
  const [isGalleryGenerating, setIsGalleryGenerating] = useState(false);
  const [galleryPreviewImageUrl, setGalleryPreviewImageUrl] = useState<string | null>(null);
  const [galleryPreviewImageLayout, setGalleryPreviewImageLayout] = useState<any | null>(null);
  // Backend image paths restored from history "re-generate" 鈥?allows skipping upload
  const [galleryRestoredImagePaths, setGalleryRestoredImagePaths] = useState<string[]>([]);
  const [galleryPreviewItems, setGalleryPreviewItems] = useState<
    GalleryPreviewItem[]
  >([]);
  const [galleryTextEditor, setGalleryTextEditor] = useState<{ open: boolean; localId: string; imageUrl: string; layout: any } | null>(null);
  const [galleryTextDraftLayout, setGalleryTextDraftLayout] = useState<any | null>(null);
  const [isGalleryTextExporting, setIsGalleryTextExporting] = useState(false);
  const [gallerySavePreviewDialog, setGallerySavePreviewDialog] = useState<{ open: boolean; title: string }>({
    open: false,
    title: '',
  });
  const [galleryCollageDraft, setGalleryCollageDraft] = useState<GalleryCollageDraft | null>(null);
  const [isGalleryCollageExporting, setIsGalleryCollageExporting] = useState(false);
  const dragTextRef = useRef<{
    index: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const galleryCanvasPreviewRef = useRef<HTMLDivElement | null>(null);

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
  const gallerySucceededItems = useMemo(
    () =>
      galleryPreviewItems.filter(
        (item) => item.status === 'succeeded' && Boolean(String(item.imageUrl || '').trim())
      ),
    [galleryPreviewItems]
  );

  const GALLERY_HISTORY_KEY = 'vflow_product_gallery_history';
  const galleryPollAbortRef = useRef(false);
  const galleryPollRunIdRef = useRef<number>(0);

  const closeGalleryAlert = () => setGalleryAlert((prev) => ({ ...prev, open: false }));
  const openGalleryAlert = (message: string, title?: string) =>
    setGalleryAlert({
      open: true,
      title: title || tr('鎻愮ず', 'Notice'),
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

  const closeGalleryImagePreview = () => {
    setGalleryPreviewImageUrl(null);
    setGalleryPreviewImageLayout(null);
  };
  const clearGalleryPreview = () => {
    setGalleryPreviewItems([]);
    setGalleryPreviewImageUrl(null);
    setGalleryPreviewImageLayout(null);
    setGalleryTextEditor(null);
    setGalleryTextDraftLayout(null);
    setGalleryRightPanel('preview');
  };
  const handleClearGalleryPreview = async () => {
    if (galleryPreviewItems.length < 1) return;
    const ok = await openGalleryConfirm(tr('确定清空当前预览吗？', 'Clear the current preview?'), {
      title: tr('清空确认', 'Clear confirmation'),
      okLabel: tr('清空', 'Clear'),
      cancelLabel: tr('取消', 'Cancel'),
    });
    if (!ok) return;
    clearGalleryPreview();
  };
  const openGalleryImagePreview = (url: string, layout?: any) => {
    const cleaned = String(url || '').trim();
    if (!cleaned) return;
    setGalleryPreviewImageUrl(cleaned);
    setGalleryPreviewImageLayout(layout || null);
  };

  const buildGalleryOutputLabels = (typeSelections: typeof galleryTypeSelections) => {
    const specs: Array<[keyof typeof galleryTypeSelections, string]> = [
      ['white_bg', tr('白底图', 'White Background')],
      ['scene', tr('场景图', 'Scene')],
      ['selling_point', tr('卖点图', 'Selling Point')],
      ['cover', tr('封面图', 'Cover')],
      ['poster', tr('海报图', 'Poster')],
    ];

    return specs.flatMap(([key, label]) => {
      const config = typeSelections[key];
      if (!config?.enabled || config.count < 1) return [];
      return Array.from({ length: config.count }, (_, index) => `${label}_图片${index + 1}`);
    });
  };

  const fillGalleryPreviewFromHistory = (item: GalleryHistoryItem) => {
    const images = Array.isArray(item.images) ? item.images.map((url) => String(url || '').trim()).filter(Boolean) : [];
    if (images.length === 0) return;

    setGalleryPreviewItems(
      (prev) => [
        ...prev,
        ...images.map((imageUrl, index) => ({
          localId: `history-preview-${item.id}-${Date.now()}-${index}`,
          requestId: `history-${item.id}-${index}`,
          status: 'succeeded' as const,
          imageUrl,
          layout: null,
          outputLabel: `${item.title || tr('输出类型', 'Output')}_图片${index + 1}`,
        })),
      ]
    );
    setGalleryRightPanel('preview');
    openGalleryAlert(tr('已填充到预览区', 'Loaded into preview'));
  };

  const persistGalleryHistoryItems = (items: GalleryHistoryItem[]) => {
    setGalleryHistoryItems(items);
    try {
      localStorage.setItem(GALLERY_HISTORY_KEY, JSON.stringify(items));
    } catch {
      void 0;
    }
  };

  const openSaveGalleryPreviewDialog = () => {
    if (galleryPreviewItems.length < 1) return;
    setGallerySavePreviewDialog({
      open: true,
      title: new Date().toLocaleString(),
    });
  };

  const closeSaveGalleryPreviewDialog = () => {
    setGallerySavePreviewDialog({ open: false, title: '' });
  };

  const saveCurrentPreviewToHistory = () => {
    const images = galleryPreviewItems
      .map((item) => String(item.imageUrl || '').trim())
      .filter(Boolean);
    if (images.length < 1) return;

    const title = String(gallerySavePreviewDialog.title || '').trim() || new Date().toLocaleString();
    const historyItem: GalleryHistoryItem = {
      id: `pg-manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      createdAt: new Date().toLocaleString(),
      images,
      settings: {
        targetScene: galleryTargetScene,
        style: galleryStyle,
        aspectRatio: galleryAspectRatio === 'default' ? '1:1' : galleryAspectRatio,
        resolution: galleryResolution,
        productName: galleryProductName.trim(),
        productCategory: galleryCategory.trim(),
        sellingPoints: gallerySellingPoints.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5),
        typeSelections: { ...galleryTypeSelections },
        sceneConfig: {
          sceneTheme: gallerySceneTheme.trim(),
          sceneDescription: gallerySceneDescription.trim(),
          sceneProps: gallerySceneProps.trim(),
          lighting: gallerySceneLighting.trim(),
          mood: gallerySceneMood.trim(),
        },
      },
    };

    const next = [historyItem, ...galleryHistoryItems].slice(0, 50);
    persistGalleryHistoryItems(next);
    closeSaveGalleryPreviewDialog();
    openGalleryAlert(tr('当前预览区已保存到历史记录', 'Preview saved to history'));
  };

  const getGalleryCollagePreset = (presetId: string) =>
    GALLERY_COLLAGE_PRESETS.find((preset) => preset.id === presetId) || GALLERY_COLLAGE_PRESETS[0];

  const buildGalleryCollageDraft = (
    presetId: string,
    sourceItems: Array<{ localId: string }>,
    previous?: GalleryCollageDraft | null
  ): GalleryCollageDraft => {
    const preset = getGalleryCollagePreset(presetId);
    const availableIds = sourceItems.map((item) => item.localId);
    const slotAssignments = preset.slots.reduce<Record<string, string>>((acc, slot, index) => {
      const reusedId = previous?.slotAssignments?.[slot.id];
      if (reusedId && availableIds.includes(reusedId)) {
        acc[slot.id] = reusedId;
        return acc;
      }
      acc[slot.id] = availableIds[index % Math.max(availableIds.length, 1)] || '';
      return acc;
    }, {});

    return {
      presetId: preset.id,
      title: previous?.title || galleryProductName.trim() || '标题',
      subtitle: previous?.subtitle || gallerySellingPoints.filter(Boolean).slice(0, 2).join(' 路 '),
      background: previous?.background || '#111111',
      gap: Number(previous?.gap) > 0 ? Number(previous?.gap) : 0.014,
      slotAssignments,
    };
  };

  const openGalleryCollageEditor = () => {
    if (gallerySucceededItems.length < 1) {
      openGalleryAlert(tr('请先至少生成 1 张成功图片再进入画板。', 'Generate at least 1 successful image before opening the board.'));
      return;
    }
    setGalleryCollageDraft((prev) => buildGalleryCollageDraft(prev?.presetId || GALLERY_COLLAGE_PRESETS[0].id, gallerySucceededItems, prev));
  };

  const closeGalleryCollageEditor = () => {
    setGalleryCollageDraft(null);
    setIsGalleryCollageExporting(false);
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

    setGalleryHistoryItems((prev) => {
      const next = prev
        .map((item) => {
          const images = item.images.filter((_, idx) => !selected.has(`${item.id}:${idx}`));
          if (images.length === 0) return null;
          if (images.length === item.images.length) return item;
          return { ...item, images };
        })
        .filter(Boolean) as GalleryHistoryItem[];

      try {
        localStorage.setItem(GALLERY_HISTORY_KEY, JSON.stringify(next));
      } catch {
        void 0;
      }

      return next;
    });

    setGalleryHistorySelectedKeys([]);
  };

  const handleGalleryHistoryDeleteOne = async (itemId: string) => {
    const id = String(itemId || '').trim();
    if (!id) return;

    const ok = await openGalleryConfirm(
      tr('确定删除这条历史记录吗？', 'Delete this history item?'),
      {
        title: tr('删除确认', 'Delete confirmation'),
        okLabel: tr('删除', 'Delete'),
        cancelLabel: tr('取消', 'Cancel'),
      }
    );

    if (!ok) return;

    const next = galleryHistoryItems.filter((item) => item.id !== id);
    persistGalleryHistoryItems(next);
    setGalleryHistorySelectedKeys((prev) => prev.filter((key) => !key.startsWith(`${id}:`)));
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
          const title = String(item?.title || item?.createdAt || '').trim();
          const createdAt = String(item?.createdAt || '').trim();
          const images = Array.isArray(item?.images)
            ? item.images.map((x: any) => String(x || '').trim()).filter(Boolean)
            : [];
          if (!id || !createdAt || images.length === 0) return null;
          const settings = item?.settings && typeof item.settings === 'object' ? item.settings : undefined;
          return { id, title: title || createdAt, createdAt, images, settings };
        })
        .filter(Boolean) as GalleryHistoryItem[];
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
      if (s.sceneConfig && typeof s.sceneConfig === 'object') {
        setGallerySceneTheme(String(s.sceneConfig.sceneTheme || ''));
        setGallerySceneDescription(String(s.sceneConfig.sceneDescription || ''));
        setGallerySceneProps(String(s.sceneConfig.sceneProps || ''));
        setGallerySceneLighting(String(s.sceneConfig.lighting || ''));
        setGallerySceneMood(String(s.sceneConfig.mood || ''));
      }
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

  const clampGalleryUnitValue = (value: number, min = 0, max = 1) => {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
  };

  const buildGalleryFetchOptions = (url: string): RequestInit => {
    const raw = String(url || '').trim();
    const isAbsolute = /^https?:\/\//i.test(raw);
    if (!isAbsolute) {
      return { method: 'GET', credentials: 'include' };
    }

    try {
      const parsed = new URL(raw, window.location.origin);
      if (parsed.origin === window.location.origin) {
        return { method: 'GET', credentials: 'include' };
      }
    } catch {
      return { method: 'GET', credentials: 'include' };
    }

    return { method: 'GET', credentials: 'omit', mode: 'cors' };
  };

  const startDragText = (index: number, e: React.PointerEvent) => {
    if (!galleryTextDraftLayout?.elements || !Array.isArray(galleryTextDraftLayout.elements)) return;
    const el = galleryTextDraftLayout.elements[index];
    if (!el) return;
    const rect = galleryCanvasPreviewRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

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

        const dx = (ev.clientX - state.startClientX) / rect.width;
        const dy = (ev.clientY - state.startClientY) / rect.height;
        const width = clampGalleryUnitValue(Number(current.w) || 0.4, 0.08, 1);
        const height = clampGalleryUnitValue(Number(current.h) || 0.12, 0.06, 1);
        current.w = width;
        current.h = height;
        current.x = clampGalleryUnitValue(state.startX + dx, 0, Math.max(0, 1 - width));
        current.y = clampGalleryUnitValue(state.startY + dy, 0, Math.max(0, 1 - height));
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
      const resp = await fetch(url, buildGalleryFetchOptions(url));
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

  const updateGalleryDraftElement = (index: number, patch: Record<string, any>) => {
    setGalleryTextDraftLayout((prev: any) => {
      if (!prev?.elements || !Array.isArray(prev.elements)) return prev;
      return {
        ...prev,
        elements: prev.elements.map((item: any, itemIndex: number) => {
          if (itemIndex !== index) return item;
          const nextItem = { ...item, ...patch };
          const width = clampGalleryUnitValue(Number(nextItem.w) || 0.4, 0.08, 1);
          const height = clampGalleryUnitValue(Number(nextItem.h) || 0.12, 0.06, 1);
          return {
            ...nextItem,
            w: width,
            h: height,
            x: clampGalleryUnitValue(Number(nextItem.x) || 0, 0, Math.max(0, 1 - width)),
            y: clampGalleryUnitValue(Number(nextItem.y) || 0, 0, Math.max(0, 1 - height)),
            font_size: clampGalleryUnitValue(Number(nextItem.font_size) || 0.03, 0.01, 0.2),
            font_weight: clampGalleryUnitValue(Number(nextItem.font_weight) || 600, 300, 900),
          };
        }),
      };
    });
  };

  const galleryDraftElements = Array.isArray(galleryTextDraftLayout?.elements)
    ? galleryTextDraftLayout.elements
    : [];

  const renderGalleryTextOverlay = (
    layout: any,
    options?: {
      fontBase?: number;
      interactive?: boolean;
      onPointerDown?: (index: number, event: React.PointerEvent<HTMLDivElement>) => void;
      selectedIndex?: number | null;
    }
  ) => {
    const elements = Array.isArray(layout?.elements) ? layout.elements : [];
    const fontBase = options?.fontBase || 560;
    const interactive = Boolean(options?.interactive);

    return (
      <div className={interactive ? 'absolute inset-0' : 'pointer-events-none absolute inset-0'}>
        {elements.map((element: any, index: number) => {
          const width = clampGalleryUnitValue(Number(element?.w) || 0.4, 0.08, 1);
          const height = clampGalleryUnitValue(Number(element?.h) || 0.12, 0.06, 1);
          const fontSize = Math.max(12, Math.round((Number(element?.font_size) || 0.03) * fontBase));
          const isSelected = options?.selectedIndex === index;

          return (
            <div
              key={String(element?.id || index)}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              onPointerDown={interactive && options?.onPointerDown ? (event) => options.onPointerDown?.(index, event) : undefined}
              onKeyDown={interactive ? () => void 0 : undefined}
              className={interactive ? 'absolute cursor-move rounded-lg border shadow-[0_0_0_1px_rgba(249,115,22,0.18)]' : 'pointer-events-none absolute overflow-hidden rounded-lg'}
              style={{
                left: `${clampGalleryUnitValue(Number(element?.x) || 0, 0, Math.max(0, 1 - width)) * 100}%`,
                top: `${clampGalleryUnitValue(Number(element?.y) || 0, 0, Math.max(0, 1 - height)) * 100}%`,
                width: `${width * 100}%`,
                height: `${height * 100}%`,
                background: String(element?.background || '').trim() || 'rgba(0,0,0,0.18)',
                borderColor: interactive ? (isSelected ? 'rgba(251,146,60,0.9)' : 'rgba(249,115,22,0.5)') : undefined,
              }}
            >
              <div
                className="h-full w-full overflow-hidden whitespace-pre-wrap break-words px-2 py-1"
                style={{
                  color: String(element?.color || '#111111'),
                  fontWeight: Number(element?.font_weight) || 600,
                  fontSize: `${fontSize}px`,
                  textAlign: String(element?.align || 'left') as any,
                  lineHeight: 1.25,
                }}
              >
                {String(element?.text || '')}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const getGalleryCollageAssignedItem = (slotId: string) => {
    const localId = galleryCollageDraft?.slotAssignments?.[slotId];
    if (!localId) return null;
    return gallerySucceededItems.find((item) => item.localId === localId) || null;
  };

  const getGalleryCollageSlotRect = (slot: GalleryCollageSlot) => {
    const gap = clampGalleryUnitValue(Number(galleryCollageDraft?.gap) || 0.014, 0, 0.06);
    const inset = gap / 2;
    return {
      x: clampGalleryUnitValue(slot.rect.x + inset, 0, 1),
      y: clampGalleryUnitValue(slot.rect.y + inset, 0, 1),
      w: clampGalleryUnitValue(slot.rect.w - gap, 0.08, 1),
      h: clampGalleryUnitValue(slot.rect.h - gap, 0.08, 1),
    };
  };

  const loadImageElementFromUrl = async (url: string) => {
    const resp = await fetch(url, buildGalleryFetchOptions(url));
    if (!resp.ok) throw new Error(tr('下载背景图失败', 'Failed to download background'));
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(tr('加载背景图失败', 'Failed to load background')));
        img.src = objUrl;
      });
      return img;
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  };

  const drawGalleryTextElementsToCanvas = (
    ctx: CanvasRenderingContext2D,
    elements: any[],
    width: number,
    height: number
  ) => {
    const base = Math.min(width, height);
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

      const px = x * width;
      const py = y * height;
      const pw = w * width;
      const ph = h * height;

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
  };

  const buildGalleryRenderedCanvas = async (url: string, layout?: any) => {
    const img = await loadImageElementFromUrl(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(tr('导出失败', 'Export failed'));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const elements = Array.isArray(layout?.elements) ? layout.elements : [];
    drawGalleryTextElementsToCanvas(ctx, elements, canvas.width, canvas.height);
    return canvas;
  };

  const downloadCanvasAsPng = async (canvas: HTMLCanvasElement, filename: string) => {
    const outBlob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!outBlob) throw new Error(tr('导出失败', 'Export failed'));
    const outUrl = URL.createObjectURL(outBlob);
    const a = document.createElement('a');
    a.href = outUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(outUrl);
  };

  const drawImageCover = (
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    targetX: number,
    targetY: number,
    targetW: number,
    targetH: number,
    sourceWidth: number,
    sourceHeight: number
  ) => {
    const sourceRatio = sourceWidth / Math.max(sourceHeight, 1);
    const targetRatio = targetW / Math.max(targetH, 1);
    let cropW = sourceWidth;
    let cropH = sourceHeight;
    let cropX = 0;
    let cropY = 0;

    if (sourceRatio > targetRatio) {
      cropW = sourceHeight * targetRatio;
      cropX = (sourceWidth - cropW) / 2;
    } else {
      cropH = sourceWidth / targetRatio;
      cropY = (sourceHeight - cropH) / 2;
    }

    ctx.drawImage(source, cropX, cropY, cropW, cropH, targetX, targetY, targetW, targetH);
  };

  const exportGalleryCollagePng = async () => {
    if (!galleryCollageDraft) return;
    const preset = getGalleryCollagePreset(galleryCollageDraft.presetId);
    setIsGalleryCollageExporting(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = preset.canvasWidth;
      canvas.height = preset.canvasHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(tr('导出失败', 'Export failed'));

      ctx.fillStyle = String(galleryCollageDraft.background || '#111111');
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const slot of preset.slots) {
        const item = getGalleryCollageAssignedItem(slot.id);
        const rect = getGalleryCollageSlotRect(slot);
        const px = rect.x * canvas.width;
        const py = rect.y * canvas.height;
        const pw = rect.w * canvas.width;
        const ph = rect.h * canvas.height;

        ctx.save();
        ctx.beginPath();
        const radius = Math.max(12, Math.round(Math.min(pw, ph) * 0.04));
        ctx.roundRect(px, py, pw, ph, radius);
        ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(px, py, pw, ph);

        if (item?.imageUrl) {
          const itemCanvas = await buildGalleryRenderedCanvas(item.imageUrl, item.layout);
          drawImageCover(ctx, itemCanvas, px, py, pw, ph, itemCanvas.width, itemCanvas.height);
        }
        ctx.restore();
      }

      if (String(galleryCollageDraft.title || '').trim()) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${Math.round(canvas.width * 0.055)}px system-ui`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(String(galleryCollageDraft.title).trim(), canvas.width * 0.06, canvas.height * 0.065);
      }

      if (String(galleryCollageDraft.subtitle || '').trim()) {
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.font = `500 ${Math.round(canvas.width * 0.024)}px system-ui`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(String(galleryCollageDraft.subtitle).trim(), canvas.width * 0.06, canvas.height * 0.13);
      }

      await downloadCanvasAsPng(canvas, `product_gallery_collage_${Date.now()}.png`);
    } catch (err: any) {
      openGalleryAlert(String(err?.message || err || tr('导出失败', 'Export failed')));
    } finally {
      setIsGalleryCollageExporting(false);
    }
  };

  const galleryCollagePreset = galleryCollageDraft
    ? getGalleryCollagePreset(galleryCollageDraft.presetId)
    : GALLERY_COLLAGE_PRESETS[0];

  const handleHotStyleAnalyze = async () => {
    if (!gallerySellingPoints.some((p) => String(p || '').trim())) {
      openGalleryAlert(tr('请至少填写 1 个卖点。', 'Please fill selling points first'));
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
      const msg = String(err?.message || err || tr('分析失败', 'Analysis failed')).trim();
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

    const aspectRatio = galleryAspectRatio === 'default' ? '1:1' : galleryAspectRatio;

    const sellingPoints = gallerySellingPoints
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .slice(0, 5);

    if (galleryTypeSelections.selling_point.enabled && sellingPoints.length < 1) {
      openGalleryAlert(
        tr(
          '开启卖点图前，请至少填写 1 条核心卖点。',
          'Please fill at least 1 selling point before generating selling-point images.'
        )
      );
      return;
    }

    const effectiveTypeSelections = {
      ...galleryTypeSelections,
      selling_point: {
        ...galleryTypeSelections.selling_point,
        count: galleryTypeSelections.selling_point.enabled ? Math.max(1, sellingPoints.length || 1) : galleryTypeSelections.selling_point.count,
      },
    };
    const totalCount = Object.values(effectiveTypeSelections)
      .filter((item) => item.enabled)
      .reduce((sum, item) => sum + (Number(item.count) || 0), 0);

    if (totalCount <= 0) {
      openGalleryAlert(tr('请至少选择一种生成类型。', 'Please select at least one generation type.'));
      return;
    }
    const sceneConfig: GallerySceneConfig = {
      sceneTheme: gallerySceneTheme.trim(),
      sceneDescription: gallerySceneDescription.trim(),
      sceneProps: gallerySceneProps.trim(),
      lighting: gallerySceneLighting.trim(),
      mood: gallerySceneMood.trim(),
    };

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const settingsSnapshot = {
      targetScene: galleryTargetScene,
      style: galleryStyle,
      aspectRatio: aspectRatio,
      resolution: galleryResolution,
      productName: galleryProductName.trim(),
      productCategory: galleryCategory.trim(),
      sellingPoints,
      typeSelections: { ...effectiveTypeSelections },
      sceneConfig,
      uploadedImagePaths: [] as string[],
    };

    const appendHistory = (urls: string[]) => {
      const images = urls.map((u) => String(u || '').trim()).filter(Boolean);
      if (images.length === 0) return;

      const now = new Date().toLocaleString();
      const nextItem: GalleryHistoryItem = {
        id: `pg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: now,
        createdAt: now,
        images,
        settings: settingsSnapshot,
      };

      persistGalleryHistoryItems([nextItem, ...galleryHistoryItems].slice(0, 50));
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
        // No new images but we have restored paths from history 鈫?reuse them
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
        scene_config: sceneConfig,
        style: galleryStyle,
        hot_style: hotStyleSelectedIndex !== null ? hotStyleItems[hotStyleSelectedIndex] : undefined,
        type_selections: effectiveTypeSelections as any,
      });

      const list = (createResp as any)?.data?.requests || (createResp as any)?.requests || [];
      const requests = Array.isArray(list) ? list : [];
      const outputLabels = buildGalleryOutputLabels(effectiveTypeSelections);

      const initial = requests
        .map((r: any, idx: number) => {
          const requestId = String(r?.request_id || r?.id || '').trim();
          if (!requestId) return null;
          return {
            localId: `pg-prev-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            requestId,
            status: 'created' as const,
            outputLabel: outputLabels[idx] || `${tr('输出类型', 'Output')}_图片${idx + 1}`,
          };
        })
        .filter(Boolean) as GalleryPreviewItem[];

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
        isOpen={gallerySavePreviewDialog.open}
        title={tr('保存预览', 'Save Preview')}
        onClose={closeSaveGalleryPreviewDialog}
        widthClassName="max-w-lg"
        footer={
          <>
            <button
              type="button"
              onClick={closeSaveGalleryPreviewDialog}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition"
            >
              {tr('取消', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={saveCurrentPreviewToHistory}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-black hover:bg-orange-400 transition"
            >
              {tr('保存到历史', 'Save to History')}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-zinc-300">
            {tr('为当前预览区设置一个标题后保存到历史记录', 'Use a custom title for the current preview set')}
          </div>
          <label className="block space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
              {tr('记录标题', 'History Title')}
            </div>
            <input
              type="text"
              value={gallerySavePreviewDialog.title}
              onChange={(event) => setGallerySavePreviewDialog((prev) => ({ ...prev, title: event.target.value }))}
              placeholder={tr('输入历史记录标题', 'Enter history title')}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
            />
          </label>
        </div>
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
            <div className="relative inline-block overflow-hidden rounded-xl border border-white/10">
              <img src={galleryPreviewImageUrl} alt={tr('图片预览', 'Preview image')} className="max-h-[70vh] w-auto object-contain" />
              {galleryPreviewImageLayout ? renderGalleryTextOverlay(galleryPreviewImageLayout, { fontBase: 820 }) : null}
            </div>
          </div>
        ) : null}
      </AppDialog>

      <AppDialog
        isOpen={Boolean(galleryTextEditor && galleryTextDraftLayout)}
        title={tr('编辑文字', 'Edit Text')}
        onClose={closeGalleryTextEditor}
        widthClassName="max-w-6xl"
        footer={
          <>
            <button
              type="button"
              onClick={closeGalleryTextEditor}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition"
            >
              {tr('取消', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={saveGalleryTextLayout}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-100 text-zinc-900 hover:bg-white transition"
            >
              {tr('保存修改', 'Save Changes')}
            </button>
            <button
              type="button"
              onClick={exportGalleryTextPng}
              disabled={isGalleryTextExporting}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-black hover:bg-orange-400 transition disabled:opacity-60"
            >
              {isGalleryTextExporting ? tr('正在导出...', 'Exporting...') : tr('导出 PNG', 'Export PNG')}
            </button>
          </>
        }
      >
        {galleryTextEditor && galleryTextDraftLayout ? (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{tr('画板预览', 'Canvas Preview')}</span>
                <span>{tr('可在画板中拖拽文字微调位置', 'Drag text on the canvas to reposition it')}</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div
                  ref={galleryCanvasPreviewRef}
                  className="relative mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/10 bg-black/60"
                  style={{ aspectRatio: parseAspectRatioCss(galleryTextDraftLayout.aspect_ratio) }}
                >
                  <img src={galleryTextEditor.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  {renderGalleryTextOverlay(galleryTextDraftLayout, {
                    fontBase: 560,
                    interactive: true,
                    onPointerDown: startDragText,
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                {tr('文字图层', 'Text Layers')}
              </div>
              <div className="max-h-[70vh] space-y-3 overflow-y-auto custom-scroll pr-1">
                {galleryDraftElements.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-zinc-500">
                    {tr('暂无可编辑文字', 'No editable text')}
                  </div>
                ) : (
                  galleryDraftElements.map((element: any, index: number) => (
                    <div key={String(element?.id || index)} className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="text-xs font-bold text-zinc-300">
                        {tr('文字块', 'Text Block')} {index + 1}
                      </div>
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                          {tr('文字内容', 'Text Content')}
                        </div>
                        <textarea
                          value={String(element?.text || '')}
                          onChange={(event) => updateGalleryDraftElement(index, { text: event.target.value })}
                          rows={4}
                          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                            {tr('横向位置', 'Position X')}
                          </div>
                          <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.01"
                            value={Number(element?.x) || 0}
                            onChange={(event) => updateGalleryDraftElement(index, { x: Number(event.target.value) || 0 })}
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                            {tr('竖向位置', 'Position Y')}
                          </div>
                          <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.01"
                            value={Number(element?.y) || 0}
                            onChange={(event) => updateGalleryDraftElement(index, { y: Number(event.target.value) || 0 })}
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                            {tr('宽度', 'Width')}
                          </div>
                          <input
                            type="number"
                            min="0.08"
                            max="1"
                            step="0.01"
                            value={Number(element?.w) || 0.4}
                            onChange={(event) => updateGalleryDraftElement(index, { w: Number(event.target.value) || 0.4 })}
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                            {tr('高度', 'Height')}
                          </div>
                          <input
                            type="number"
                            min="0.06"
                            max="1"
                            step="0.01"
                            value={Number(element?.h) || 0.12}
                            onChange={(event) => updateGalleryDraftElement(index, { h: Number(event.target.value) || 0.12 })}
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                          />
                        </div>
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {tr('使用 0-1 相对值', 'Use 0-1 relative values')}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                            {tr('对齐方式', 'Alignment')}
                          </div>
                          <DropdownSelect
                            value={String(element?.align || 'left')}
                            options={[
                              { value: 'left', label: tr('左对齐', 'Left') },
                              { value: 'center', label: tr('居中', 'Center') },
                              { value: 'right', label: tr('右对齐', 'Right') },
                            ]}
                            onChange={(value) => updateGalleryDraftElement(index, { align: value })}
                            buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                            iconClassName="w-4 h-4 text-zinc-500"
                            optionClassName="text-xs"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                            {tr('文字颜色', 'Text Color')}
                          </div>
                          <input
                            type="color"
                            value={String(element?.color || '#111111')}
                            onChange={(event) => updateGalleryDraftElement(index, { color: event.target.value })}
                            className="h-10 w-full rounded-xl border border-white/10 bg-black/30 p-1"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                            {tr('文字大小', 'Font Size')}
                          </div>
                          <input
                            type="number"
                            min="0.01"
                            max="0.2"
                            step="0.005"
                            value={Number(element?.font_size) || 0.03}
                            onChange={(event) => updateGalleryDraftElement(index, { font_size: Number(event.target.value) || 0.03 })}
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                            {tr('文字粗细', 'Font Weight')}
                          </div>
                          <input
                            type="number"
                            min="300"
                            max="900"
                            step="100"
                            value={Number(element?.font_weight) || 600}
                            onChange={(event) => updateGalleryDraftElement(index, { font_weight: Number(event.target.value) || 600 })}
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                          {tr('背景色', 'Background')}
                        </div>
                        <input
                          type="text"
                          value={String(element?.background || '')}
                          onChange={(event) => updateGalleryDraftElement(index, { background: event.target.value })}
                          placeholder={tr('例如 rgba(0,0,0,0.2)，可留空', 'Example: rgba(0,0,0,0.2), optional')}
                          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </AppDialog>

      <AppDialog
        isOpen={Boolean(galleryCollageDraft)}
        title={tr('画板编辑器', 'Board Editor')}
        onClose={closeGalleryCollageEditor}
        widthClassName="max-w-[96rem]"
      >
        {galleryCollageDraft ? (
          <GalleryBoardEditor
            assets={gallerySucceededItems}
            productName={galleryProductName}
            sellingPoints={gallerySellingPoints}
            tr={tr}
            initialTemplateId={galleryCollageDraft.presetId}
            initialTitle={galleryCollageDraft.title}
            initialSubtitle={galleryCollageDraft.subtitle}
            initialBackground={galleryCollageDraft.background}
            onClose={closeGalleryCollageEditor}
            onAlert={openGalleryAlert}
          />
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
                      <div className="text-xs text-zinc-600">{tr('空', 'Empty')}</div>
                    ) : (
                      <div className="space-y-2">
                        {gallerySellingPoints.map((val, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              value={val}
                              onChange={(e) => setGallerySellingPoints((prev) => prev.map((p, i) => (i === idx ? e.target.value : p)))}
                              className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                              placeholder={`${tr('卖点图', 'Selling Point')} ${idx + 1}`}
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
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('椋庢牸寤鸿', 'Style Ideas')}</div>
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
              <div className="rounded-2xl border border-white/5 bg-white/2 p-5 flex flex-col flex-1 min-h-0">
                <div className="text-sm font-bold text-zinc-200 shrink-0">{tr('生成设置', 'Generation Settings')}</div>

                <div className="mt-4 space-y-6 flex-1 min-h-0 overflow-y-auto custom-scroll pr-1">
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
                        ['white_bg', tr('白底图', 'White Background')],
                        ['scene', tr('场景图', 'Scene')],
                        ['selling_point', tr('卖点图', 'Selling Point')],
                        ['cover', tr('封面图', 'Cover')],
                        ['poster', tr('海报图', 'Poster')],
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
                    <div className="text-xs font-bold text-zinc-200">{tr('场景设定', 'Scene Settings')}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {tr(
                        '这些场景设定会用于指导场景图、封面图和海报图生成。',
                        'Scene settings will guide scene, cover, and poster generation.'
                      )}
                    </div>
                    <div className="mt-3">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('场景预设', 'Apply Scene Preset')}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {GALLERY_SCENE_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              setGallerySceneTheme(preset.sceneTheme);
                              setGallerySceneDescription(preset.sceneDescription);
                              setGallerySceneProps(preset.sceneProps);
                              setGallerySceneLighting(preset.lighting);
                              setGallerySceneMood(preset.mood);
                            }}
                            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:bg-white/5"
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 space-y-3">
                      <div className="space-y-1">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('场景主题', 'Scene Theme')}</div>
                        <input
                          type="text"
                          value={gallerySceneTheme}
                          onChange={(event) => setGallerySceneTheme(event.target.value)}
                          placeholder={tr(
                            '输入场景主题，例如厨房台面、梳妆桌、户外野餐',
                            'Enter a scene theme such as kitchen counter, vanity desk, outdoor picnic'
                          )}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('场景描述', 'Scene Description')}</div>
                        <textarea
                          rows={3}
                          value={gallerySceneDescription}
                          onChange={(event) => setGallerySceneDescription(event.target.value)}
                          placeholder={tr(
                            '描述环境、台面、背景和使用语境',
                            'Describe the environment, surface, background, and use context'
                          )}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-1">
                          <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('道具元素', 'Scene Props')}</div>
                          <input
                            type="text"
                            value={gallerySceneProps}
                            onChange={(event) => setGallerySceneProps(event.target.value)}
                            placeholder={tr(
                              '填写辅助道具或画面元素，使用逗号分隔',
                              'List supporting props or visual elements separated by commas'
                            )}
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('光线设定', 'Lighting')}</div>
                          <input
                            type="text"
                            value={gallerySceneLighting}
                            onChange={(event) => setGallerySceneLighting(event.target.value)}
                            placeholder={tr(
                              '描述光线方向、软硬程度和色温',
                              'Describe light direction, hardness, and color temperature'
                            )}
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('氛围情绪', 'Mood')}</div>
                          <input
                            type="text"
                            value={gallerySceneMood}
                            onChange={(event) => setGallerySceneMood(event.target.value)}
                            placeholder={tr(
                              '描述希望表达的情绪或品牌感受',
                              'Describe the intended mood or brand feeling'
                            )}
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                          />
                        </div>
                      </div>
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
                        <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('图片分辨率', 'Image Resolution')}</div>
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
                  {galleryRightPanel === 'preview' ? tr('预览', 'Preview') : tr('历史记录', 'History')}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openGalleryCollageEditor}
                    disabled={gallerySucceededItems.length < 1}
                    className="px-3 py-2 rounded-xl text-xs font-bold transition border border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-zinc-900 disabled:text-zinc-500 inline-flex items-center gap-2"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    {tr('拼图编辑', 'Collage Board')}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearGalleryPreview}
                    disabled={galleryPreviewItems.length < 1}
                    className="px-3 py-2 rounded-xl text-xs font-bold transition border border-white/10 bg-zinc-900/70 text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-500"
                  >
                    {tr('清空', 'Clear')}
                  </button>
                  <button
                    type="button"
                    onClick={openSaveGalleryPreviewDialog}
                    disabled={galleryPreviewItems.length < 1}
                    className="px-3 py-2 rounded-xl text-xs font-bold transition border border-white/10 bg-zinc-900/70 text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-500"
                  >
                    {tr('保存到历史', 'Save to History')}
                  </button>
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
                    {tr('预览', 'Preview')}
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
                      {galleryPreviewItems.map((item, index) => (
                        <div key={item.localId} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                          <div className="px-3 py-2 text-[11px] text-zinc-400 border-b border-white/10 bg-black/30 flex items-center justify-between">
                            <span className="font-semibold text-zinc-200">{item.outputLabel || `${tr('输出类型', 'Output')}_图片${index + 1}`}</span>
                            <span>{item.status === 'succeeded' ? tr('已完成', 'Done') : item.status === 'failed' ? tr('失败', 'Failed') : tr('生成中', 'Generating')}</span>
                          </div>
                          <div className="p-3">
                            {item.imageUrl ? (
                              <button
                                type="button"
                                onClick={() => openGalleryImagePreview(item.imageUrl as string, item.layout)}
                                className="relative rounded-lg overflow-hidden border border-white/10 bg-black/30 aspect-square cursor-pointer"
                                title={tr('点击预览', 'Click to preview')}
                              >
                                <img src={item.imageUrl} className="w-full h-full object-cover" alt={item.outputLabel || item.requestId} />
                                {item.layout ? renderGalleryTextOverlay(item.layout, { fontBase: 280 }) : null}
                              </button>
                            ) : (
                              <div className="rounded-lg border border-white/10 bg-black/30 aspect-square flex flex-col items-center justify-center text-zinc-500 gap-2">
                                <ImageIcon className={`w-8 h-8 ${item.status === 'failed' ? 'opacity-50' : 'opacity-60 animate-pulse'}`} />
                                <div className="text-xs text-zinc-500">{item.error || (item.status === 'failed' ? tr('失败', 'Failed') : tr('等待中...', 'Waiting...'))}</div>
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
                              <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-zinc-200">{item.title || item.createdAt}</div>
                                <div className="truncate text-[10px] text-zinc-500">{item.createdAt}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-zinc-500">{item.images.length} {tr('', 'imgs')}</span>
                                <button
                                  type="button"
                                  onClick={() => fillGalleryPreviewFromHistory(item)}
                                  className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[10px] font-semibold text-orange-300 transition hover:bg-orange-500/15"
                                >
                                  {tr('填充预览区域', 'Fill Preview')}
                                </button>
                              </div>
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
                            <div className="px-3 pb-3 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleGalleryHistoryDeleteOne(item.id)}
                                className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-200 transition hover:bg-red-500/15"
                              >
                                {tr('删除历史', 'Delete History')}
                              </button>
                            </div>
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

