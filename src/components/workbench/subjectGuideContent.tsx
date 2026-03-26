import type { ReactNode } from 'react';

export type SubjectGuideContentItem = {
  illustration: ReactNode;
  title: string;
  description: string;
};

type GuideSvgProps = {
  src: string;
  width: number;
  height: number;
  children?: ReactNode;
};

type GuideTextMap = Record<string, string | undefined>;
type MarkerConfig = { x: number; y: number; label?: string };
type RectConfig = { x: number; y: number; width: number; height: number };

const guideImages = import.meta.glob('../../assets/guides/*/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const guideImagePresets = {
  zh: {
    step1: { width: 2361, height: 1088 },
    step2: { width: 2364, height: 1242 },
    step3: { width: 1407, height: 1162 },
    step4: { width: 2346, height: 979 },
    step5: { width: 2352, height: 977 },
  },
  en: {
    step1: { width: 2361, height: 1088 },
    step2: { width: 2364, height: 1242 },
    step3: { width: 1407, height: 1162 },
    step4: { width: 2346, height: 979 },
    step5: { width: 2352, height: 977 },
  },
  ko: {
    step1: { width: 2361, height: 1088 },
    step2: { width: 2364, height: 1242 },
    step3: { width: 1407, height: 1162 },
    step4: { width: 2346, height: 979 },
    step5: { width: 2352, height: 977 },
  },
  ms: {
    step1: { width: 2361, height: 1088 },
    step2: { width: 2364, height: 1242 },
    step3: { width: 1407, height: 1162 },
    step4: { width: 2346, height: 979 },
    step5: { width: 2352, height: 977 },
  },
  vi: {
    step1: { width: 2361, height: 1088 },
    step2: { width: 2364, height: 1242 },
    step3: { width: 1407, height: 1162 },
    step4: { width: 2346, height: 979 },
    step5: { width: 2352, height: 977 },
  },
} as const;

const guideOverlayPresets = {
  zh: {
    step1: [{ x: 1125, y: 640 }],
    step2: [
      { x: 1748, y: 424, label: '1' },
      { x: 1758, y: 724, label: '2' },
      { x: 1368, y: 1012, label: '3' },
    ],
    step3: { x: 1248, y: 742, width: 122, height: 74 },
    step4: { x: 1056, y: 439, width: 100, height: 100 },
    step5: { x: 2110, y: 350, width: 140, height: 100 },
  },
  en: {
    step1: [{ x: 1125, y: 840 }],
    step2: [
      { x: 1928, y: 404, label: '1' },
      { x: 1928, y: 744, label: '2' },
      { x: 1488, y: 1082, label: '3' },
    ],
    step3: { x: 1248, y: 742, width: 122, height: 74 },
    step4: { x: 1056, y: 439, width: 100, height: 100 },
    step5: { x: 2070, y: 350, width: 140, height: 100 },
  },
  ko: {
    step1: [{ x: 1125, y: 840 }],
    step2: [
      { x: 1908, y: 404, label: '1' },
      { x: 1908, y: 744, label: '2' },
      { x: 1468, y: 1082, label: '3' },
    ],
    step3: { x: 1248, y: 742, width: 122, height: 74 },
    step4: { x: 1056, y: 439, width: 100, height: 100 },
    step5: { x: 2120, y: 320, width: 140, height: 100 },
  },
  ms: {
    step1: [{ x: 1125, y: 840 }],
    step2: [
      { x: 1928, y: 394, label: '1' },
      { x: 1928, y: 734, label: '2' },
      { x: 1488, y: 1082, label: '3' },
    ],
    step3: { x: 1248, y: 742, width: 122, height: 74 },
    step4: { x: 1056, y: 389, width: 100, height: 100 },
    step5: { x: 2090, y: 320, width: 140, height: 100 },
  },
  vi: {
    step1: [{ x: 1125, y: 840 }],
    step2: [
      { x: 1948, y: 384, label: '1' },
      { x: 1948, y: 744, label: '2' },
      { x: 1488, y: 1082, label: '3' },
    ],
    step3: { x: 1208, y: 719, width: 122, height: 74 },
    step4: { x: 1056, y: 412, width: 100, height: 100 },
    step5: { x: 2100, y: 320, width: 140, height: 100 },
  },
} as const satisfies Record<string, {
  step1: MarkerConfig[];
  step2: MarkerConfig[];
  step3: RectConfig;
  step4: RectConfig;
  step5: RectConfig;
}>;

const GuideSvg = ({ src, width, height, children }: GuideSvgProps) => (
  <svg
    viewBox={`0 0 ${width} ${height}`}
    className="w-full rounded-2xl border border-white/10 bg-black/20"
    role="img"
    aria-hidden="true"
  >
    <image href={src} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
    {children}
  </svg>
);

const ClickMarker = ({ x, y, label }: MarkerConfig) => (
  <g transform={`translate(${x} ${y})`}>
    <circle cx="6" cy="6" r="38" fill="#f97316" fillOpacity="0.18" />
    <circle cx="6" cy="6" r="22" fill="#f97316" fillOpacity="0.22" />
    {label ? (
      <text
        x="16"
        y="-22"
        fill="#ffffff"
        fontSize="36"
        fontWeight="700"
        textAnchor="middle"
        stroke="#111827"
        strokeWidth="6"
        paintOrder="stroke"
      >
        {label}
      </text>
    ) : null}
    <path
      d="M-24 -34L11 -8L-3 -4L9 24L-5 30L-17 2L-31 12L-24 -34Z"
      fill="#ffffff"
      stroke="#111827"
      strokeWidth="4"
      strokeLinejoin="round"
    />
  </g>
);

const HighlightRect = ({ x, y, width, height }: RectConfig) => (
  <rect
    x={x}
    y={y}
    width={width}
    height={height}
    rx="16"
    fill="none"
    stroke="#ef4444"
    strokeWidth="8"
    strokeLinejoin="round"
  />
);

const getGuideImageLanguage = (language: string) => {
  if (language === 'zh') return 'zh';
  if (language === 'ko') return 'ko';
  if (language === 'ms') return 'ms';
  if (language === 'vi') return 'vi';
  return 'en';
};

const getGuideImage = (imageLanguage: string, index: 1 | 2 | 3 | 4 | 5) => (
  guideImages[`../../assets/guides/${imageLanguage}/${index}.png`]
  || guideImages[`../../assets/guides/en/${index}.png`]
);

export const getSubjectGuideContent = (t: GuideTextMap, language: string): SubjectGuideContentItem[] => {
  const imageLanguage = getGuideImageLanguage(language);
  const imagePreset = guideImagePresets[imageLanguage];
  const overlayPreset = guideOverlayPresets[imageLanguage];

  return [
    {
      illustration: (
        <GuideSvg src={getGuideImage(imageLanguage, 1)} width={imagePreset.step1.width} height={imagePreset.step1.height}>
          {overlayPreset.step1.map((marker, index) => <ClickMarker key={`step1-${index}`} {...marker} />)}
        </GuideSvg>
      ),
      title: t.assets_subject_guide_step1_title || 'Select the main view asset',
      description: t.assets_subject_guide_step1_desc || 'Click the asset you want to use as the main subject view as the starting point of the subject set.',
    },
    {
      illustration: (
        <GuideSvg src={getGuideImage(imageLanguage, 2)} width={imagePreset.step2.width} height={imagePreset.step2.height}>
          {overlayPreset.step2.map((marker, index) => <ClickMarker key={`step2-${index}`} {...marker} />)}
        </GuideSvg>
      ),
      title: t.assets_subject_guide_step2_title || 'Generate and save the subject description, then add other views',
      description: t.assets_subject_guide_step2_desc || 'Generate and save the subject description, then click the plus button to choose from the asset library or upload other angles of the same subject locally.',
    },
    {
      illustration: (
        <GuideSvg src={getGuideImage(imageLanguage, 3)} width={imagePreset.step3.width} height={imagePreset.step3.height}>
          <HighlightRect {...overlayPreset.step3} />
        </GuideSvg>
      ),
      title: t.assets_subject_guide_step3_title || 'Edit and manage views',
      description: t.assets_subject_guide_step3_desc || 'After upload, click Edit to manage the views in the subject set.',
    },
    {
      illustration: (
        <GuideSvg src={getGuideImage(imageLanguage, 4)} width={imagePreset.step4.width} height={imagePreset.step4.height}>
          <HighlightRect {...overlayPreset.step4} />
        </GuideSvg>
      ),
      title: t.assets_subject_guide_step4_title || 'Confirm the subject set has been created',
      description: t.assets_subject_guide_step4_desc || 'When this icon appears at the top-right of the main view, the current asset has formed a subject set.',
    },
    {
      illustration: (
        <GuideSvg src={getGuideImage(imageLanguage, 5)} width={imagePreset.step5.width} height={imagePreset.step5.height}>
          <HighlightRect {...overlayPreset.step5} />
        </GuideSvg>
      ),
      title: t.assets_subject_guide_step5_title || 'Toggle subject asset visibility',
      description: t.assets_subject_guide_step5_desc || 'Click the eye icon on the right to hide or show assets that have already been added into the subject set.',
    },
  ];
};
