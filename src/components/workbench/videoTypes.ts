// 视频类型分类配置 —— 5 大家族 / 9 子类。
// 家族决定提示词约束基座，子类是家族基座上的薄覆盖。后端按 slug 反推家族。

export type VideoTypeId =
  | 'talking_head'
  | 'ugc'
  | 'unboxing'
  | 'review_compare'
  | 'creative_skit'
  | 'pain_solution'
  | 'storytelling'
  | 'aesthetic_film'
  | 'asmr';

export type VideoFamilyId = 'pitch' | 'demo_review' | 'creative' | 'narrative' | 'ambiance';

export type VideoFamilyLabelKey =
  | 'wb_video_family_pitch'
  | 'wb_video_family_demo_review'
  | 'wb_video_family_creative'
  | 'wb_video_family_narrative'
  | 'wb_video_family_ambiance';

export type VideoTypeLabelKey =
  | 'wb_video_type_talking'
  | 'wb_video_type_ugc'
  | 'wb_video_type_unboxing'
  | 'wb_video_type_review_compare'
  | 'wb_video_type_creative_skit'
  | 'wb_video_type_problem_solution'
  | 'wb_video_type_story'
  | 'wb_video_type_aesthetic_film'
  | 'wb_video_type_asmr';

export type VideoTooltipKey = 'wb_video_type_creative_skit_tooltip';

/** VideoTypePicker 所需的全部 i18n 文案；translations[lang] 可直接结构化赋值给它。 */
export type VideoTypeI18n = Record<
  VideoFamilyLabelKey | VideoTypeLabelKey | VideoTooltipKey | 'wb_video_type_default_suffix',
  string
>;

export type VideoTypeDef = {
  id: VideoTypeId;
  labelKey: VideoTypeLabelKey;
  /** 稳定中文标签，用于拼进送给脚本 LLM 的输入文本（与 UI 语言无关）。 */
  zhLabel: string;
  tooltipKey?: VideoTooltipKey;
};

export type VideoFamilyDef = {
  id: VideoFamilyId;
  labelKey: VideoFamilyLabelKey;
  types: VideoTypeDef[];
};

// 家族顺序：口播直陈 / 演示测评 / 创意 / 叙事 / 氛围质感
export const VIDEO_FAMILIES: VideoFamilyDef[] = [
  {
    id: 'pitch',
    labelKey: 'wb_video_family_pitch',
    types: [
      { id: 'talking_head', labelKey: 'wb_video_type_talking', zhLabel: '产品口播' },
      { id: 'ugc', labelKey: 'wb_video_type_ugc', zhLabel: 'UGC种草' },
    ],
  },
  {
    id: 'demo_review',
    labelKey: 'wb_video_family_demo_review',
    types: [
      { id: 'unboxing', labelKey: 'wb_video_type_unboxing', zhLabel: '开箱' },
      { id: 'review_compare', labelKey: 'wb_video_type_review_compare', zhLabel: '评测对比' },
    ],
  },
  {
    id: 'creative',
    labelKey: 'wb_video_family_creative',
    types: [
      {
        id: 'creative_skit',
        labelKey: 'wb_video_type_creative_skit',
        zhLabel: '趣味剧本',
        tooltipKey: 'wb_video_type_creative_skit_tooltip',
      },
    ],
  },
  {
    id: 'narrative',
    labelKey: 'wb_video_family_narrative',
    types: [
      { id: 'pain_solution', labelKey: 'wb_video_type_problem_solution', zhLabel: '痛点-解决' },
      { id: 'storytelling', labelKey: 'wb_video_type_story', zhLabel: '故事讲述' },
    ],
  },
  {
    id: 'ambiance',
    labelKey: 'wb_video_family_ambiance',
    types: [
      { id: 'aesthetic_film', labelKey: 'wb_video_type_aesthetic_film', zhLabel: '质感大片' },
      { id: 'asmr', labelKey: 'wb_video_type_asmr', zhLabel: 'ASMR感官' },
    ],
  },
];

export const ALL_VIDEO_TYPES: VideoTypeDef[] = VIDEO_FAMILIES.flatMap((f) => f.types);

export const getVideoTypeDef = (id: string): VideoTypeDef | undefined =>
  ALL_VIDEO_TYPES.find((t) => t.id === id);

/** 家族默认子类 = 第一个子类。 */
export const getFamilyDefaultTypeId = (family: VideoFamilyDef): VideoTypeId => family.types[0].id;

// 旧中文标签 -> 新 slug 迁移映射；已下线类型回退到最近的存续子类。
const LEGACY_LABEL_TO_ID: Record<string, VideoTypeId> = {
  'UGC种草': 'ugc',
  '产品口播': 'talking_head',
  '产品演示': 'unboxing', // 已下线 -> 演示测评家族
  '痛点-解决': 'pain_solution',
  '前后对比': 'pain_solution', // 已下线 -> 叙事家族
  '反应展示': 'storytelling', // 已下线 -> 叙事家族
  '故事讲述': 'storytelling',
  '趣味剧本': 'creative_skit',
};

/** 把存储值（新 slug 或旧中文标签）归一化为合法 VideoTypeId；无法识别返回空串。 */
export const migrateVideoType = (stored: string | null | undefined): VideoTypeId | '' => {
  const v = (stored || '').trim();
  if (!v) return '';
  if (getVideoTypeDef(v)) return v as VideoTypeId;
  return LEGACY_LABEL_TO_ID[v] ?? '';
};
