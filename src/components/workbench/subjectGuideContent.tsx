import type { ReactNode } from 'react';
import step1Png from '../../assets/guides/subject/ch_step1.png';
import step2Png from '../../assets/guides/subject/ch_step2.png';
import step3Png from '../../assets/guides/subject/ch_step3.png';
import step4Png from '../../assets/guides/subject/ch_step4.png';
import step5Png from '../../assets/guides/subject/ch_step5.png';

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

const ClickMarker = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <circle cx="6" cy="6" r="38" fill="#f97316" fillOpacity="0.18" />
    <circle cx="6" cy="6" r="22" fill="#f97316" fillOpacity="0.22" />
    <path
      d="M-24 -34L11 -8L-3 -4L9 24L-5 30L-17 2L-31 12L-24 -34Z"
      fill="#ffffff"
      stroke="#111827"
      strokeWidth="4"
      strokeLinejoin="round"
    />
  </g>
);

const HighlightRect = ({ x, y, width, height }: { x: number; y: number; width: number; height: number }) => (
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

export const subjectGuideContent: SubjectGuideContentItem[] = [
  {
    illustration: (
      <GuideSvg src={step1Png} width={2361} height={1088}>
        <ClickMarker x={1125} y={640} />
      </GuideSvg>
    ),
    title: '选择主视角素材',
    description: '点击你想作为主体主视角的素材，作为主体图组的起点。',
  },
  {
    illustration: (
      <GuideSvg src={step2Png} width={2364} height={1242}>
        <ClickMarker x={1368} y={1012} />
      </GuideSvg>
    ),
    title: '添加其他视图',
    description: '点击加号，可从素材库选择，或从本地上传同一主体的其他角度图片。',
  },
  {
    illustration: (
      <GuideSvg src={step3Png} width={1407} height={1162}>
        <HighlightRect x={1248} y={742} width={122} height={74} />
      </GuideSvg>
    ),
    title: '编辑和管理视图',
    description: '上传完成后，点击编辑，可管理主体图组中的视图。',
  },
  {
    illustration: (
      <GuideSvg src={step4Png} width={2346} height={979}>
        <HighlightRect x={1056} y={439} width={100} height={100} />
      </GuideSvg>
    ),
    title: '确认主体图组已创建',
    description: '主视图右上角出现该图标，表示当前素材已形成主体图组。',
  },
  {
    illustration: (
      <GuideSvg src={step5Png} width={2352} height={977}>
        <HighlightRect x={2110} y={350} width={140} height={100} />
      </GuideSvg>
    ),
    title: '切换主体素材显示',
    description: '点击右侧眼睛图标，可隐藏或显示已经收进主体图组中的素材。',
  },
];
