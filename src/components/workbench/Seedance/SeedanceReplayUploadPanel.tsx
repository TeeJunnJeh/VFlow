import React, { useEffect, useRef, useState } from 'react';
import {
  Eye,
  Image as ImageIcon,
  Library,
  Music,
  Play,
  Plus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import {
  SEEDANCE_REPLAY_AUDIO_MAX_BYTES,
  SEEDANCE_REPLAY_AUDIO_LIMIT,
  SEEDANCE_REPLAY_AUDIO_TOTAL_BYTES_LIMIT,
  SEEDANCE_REPLAY_DIMENSION_MAX,
  SEEDANCE_REPLAY_DIMENSION_MIN,
  SEEDANCE_REPLAY_DURATION_MIN,
  SEEDANCE_REPLAY_DURATION_MAX,
  SEEDANCE_REPLAY_IMAGE_EXTS,
  SEEDANCE_REPLAY_IMAGE_MAX_BYTES,
  SEEDANCE_REPLAY_IMAGE_LIMIT,
  SEEDANCE_REPLAY_IMAGE_TOTAL_BYTES_LIMIT,
  SEEDANCE_REPLAY_RATIO_MAX,
  SEEDANCE_REPLAY_RATIO_MIN,
  SEEDANCE_REPLAY_VIDEO_EXTS,
  SEEDANCE_REPLAY_VIDEO_FPS_MAX,
  SEEDANCE_REPLAY_VIDEO_FPS_MIN,
  SEEDANCE_REPLAY_VIDEO_MAX_BYTES,
  SEEDANCE_REPLAY_VIDEO_LIMIT,
  SEEDANCE_REPLAY_VIDEO_PIXELS_MAX,
  SEEDANCE_REPLAY_VIDEO_PIXELS_MIN,
  type SeedanceReplayMediaKind,
  type SeedanceReplayValidationSummary,
} from './seedanceReplayUploadRules';

type SourceType = 'library' | 'local';
type MediaKind = 'image' | 'video' | 'audio' | 'model';
type TooltipAlign = 'left' | 'center' | 'right';

export type SeedanceReplayUploadAsset = {
  id: string;
  name: string;
  mediaKind: MediaKind;
  source: SourceType;
  previewUrl?: string | null;
  durationSeconds?: number | null;
  frameRole?: string | null;
};

type SeedanceReplayUploadPanelProps = {
  assets: SeedanceReplayUploadAsset[];
  validationSummary?: SeedanceReplayValidationSummary;
  focusTarget?: 'top' | SeedanceReplayMediaKind | null;
  onAddVirtualModel?: () => void;
  onOpenLibraryForKind?: (kind: SeedanceReplayMediaKind) => void;
  onPreview?: (assetId: string) => void;
  onRemove?: (assetId: string) => void;
  onSetFrameRole?: (assetId: string, role: 'firstFrame' | 'lastFrame' | null) => void;
  onOpenLibrary?: () => void;
};

const noop = () => {};
const FILE_SIZE_MB = 1024 * 1024;
const tooltipBaseClass = 'pointer-events-none absolute top-full mt-2 w-[240px] rounded-2xl border border-white/20 bg-zinc-950/90 p-3 text-left opacity-0 shadow-2xl shadow-black/40 backdrop-blur transition group-hover:opacity-100 group-focus-visible:opacity-100 z-20';
const normalizedFormatLabelMap: Record<string, string> = {
  jpg: 'jpeg',
  tif: 'tiff',
};

function formatSeconds(value: number) {
  return `${value.toFixed(1)}s`;
}

function formatMegabytes(value: number) {
  return `${Math.round(value / FILE_SIZE_MB)}MB`;
}

function formatExtensions(exts: string[]) {
  return Array.from(new Set(exts.map((ext) => normalizedFormatLabelMap[ext] || ext))).join('/');
}

function formatText(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}

function getMediaTooltipItems(t: any): Record<MediaKind, string[]> {
  return {
    image: [
      formatText(t.wb_seedance_replay_tip_format || 'Format: {formats}', { formats: formatExtensions(SEEDANCE_REPLAY_IMAGE_EXTS) }),
      formatText(t.wb_seedance_replay_tip_single_size_lt || 'Single item < {size}', { size: formatMegabytes(SEEDANCE_REPLAY_IMAGE_MAX_BYTES) }),
      formatText(t.wb_seedance_replay_tip_dimensions || 'Dimensions {min}-{max}', { min: SEEDANCE_REPLAY_DIMENSION_MIN, max: SEEDANCE_REPLAY_DIMENSION_MAX }),
      formatText(t.wb_seedance_replay_tip_ratio || 'Aspect ratio {min}-{max}', { min: SEEDANCE_REPLAY_RATIO_MIN, max: SEEDANCE_REPLAY_RATIO_MAX }),
      formatText(t.wb_seedance_replay_tip_total_size || 'Total size <= {size}', { size: formatMegabytes(SEEDANCE_REPLAY_IMAGE_TOTAL_BYTES_LIMIT) }),
    ],
    video: [
      formatText(t.wb_seedance_replay_tip_format || 'Format: {formats}', { formats: formatExtensions(SEEDANCE_REPLAY_VIDEO_EXTS) }),
      formatText(t.wb_seedance_replay_tip_single_size_lte || 'Single item <= {size}', { size: formatMegabytes(SEEDANCE_REPLAY_VIDEO_MAX_BYTES) }),
      formatText(t.wb_seedance_replay_tip_duration || 'Duration {min}-{max}s', { min: SEEDANCE_REPLAY_DURATION_MIN, max: SEEDANCE_REPLAY_DURATION_MAX }),
      formatText(t.wb_seedance_replay_tip_dimensions || 'Dimensions {min}-{max}', { min: SEEDANCE_REPLAY_DIMENSION_MIN, max: SEEDANCE_REPLAY_DIMENSION_MAX }),
      formatText(t.wb_seedance_replay_tip_ratio || 'Aspect ratio {min}-{max}', { min: SEEDANCE_REPLAY_RATIO_MIN, max: SEEDANCE_REPLAY_RATIO_MAX }),
      formatText(t.wb_seedance_replay_tip_pixels || 'Total pixels {min}-{max}', { min: SEEDANCE_REPLAY_VIDEO_PIXELS_MIN, max: SEEDANCE_REPLAY_VIDEO_PIXELS_MAX }),
      formatText(t.wb_seedance_replay_tip_fps || 'FPS {min}-{max}', { min: SEEDANCE_REPLAY_VIDEO_FPS_MIN, max: SEEDANCE_REPLAY_VIDEO_FPS_MAX }),
      formatText(t.wb_seedance_replay_tip_total_duration || 'Total duration <= {duration}s', { duration: SEEDANCE_REPLAY_DURATION_MAX }),
    ],
    audio: [
      formatText(t.wb_seedance_replay_tip_format || 'Format: {formats}', { formats: 'wav/mp3' }),
      formatText(t.wb_seedance_replay_tip_single_size_lte || 'Single item <= {size}', { size: formatMegabytes(SEEDANCE_REPLAY_AUDIO_MAX_BYTES) }),
      formatText(t.wb_seedance_replay_tip_duration || 'Duration {min}-{max}s', { min: SEEDANCE_REPLAY_DURATION_MIN, max: SEEDANCE_REPLAY_DURATION_MAX }),
      formatText(t.wb_seedance_replay_tip_total_duration || 'Total duration <= {duration}s', { duration: SEEDANCE_REPLAY_DURATION_MAX }),
      formatText(t.wb_seedance_replay_tip_total_size || 'Total size <= {size}', { size: formatMegabytes(SEEDANCE_REPLAY_AUDIO_TOTAL_BYTES_LIMIT) }),
    ],
    model: [
      t.wb_seedance_replay_virtual_model_icon_tooltip
        || 'Reference images containing recognizable real human faces cannot be uploaded directly. Choose materials from the virtual portrait library to create.',
    ],
  };
}

function tooltipAlignClass(align: TooltipAlign) {
  if (align === 'left') return 'left-0 translate-x-0';
  if (align === 'right') return 'right-0 left-auto translate-x-0';
  return 'left-1/2 -translate-x-1/2';
}

const shakeAnimationStyle: React.CSSProperties = {
  animation: 'seedanceReplayShake 520ms ease-in-out 2',
};

export function SeedanceReplayUploadPanel({
  assets,
  validationSummary,
  focusTarget = null,
  onAddVirtualModel = noop,
  onOpenLibraryForKind,
  onPreview = noop,
  onRemove = noop,
  onSetFrameRole,
  onOpenLibrary,
}: SeedanceReplayUploadPanelProps) {
  const { t } = useLanguage();
  const topRef = useRef<HTMLDivElement>(null);
  const imageCardRef = useRef<HTMLDivElement>(null);
  const videoCardRef = useRef<HTMLDivElement>(null);
  const audioCardRef = useRef<HTMLDivElement>(null);
  const [flashTarget, setFlashTarget] = useState<'top' | SeedanceReplayMediaKind | null>(null);
  const imageAssets = assets.filter((asset) => asset.mediaKind === 'image');
  const videoAssets = assets.filter((asset) => asset.mediaKind === 'video');
  const audioAssets = assets.filter((asset) => asset.mediaKind === 'audio');
  const modelAssets = assets.filter((asset) => asset.mediaKind === 'model');
  const mediaTooltipItems = getMediaTooltipItems(t);

  const imageCount = imageAssets.length;
  const videoCount = videoAssets.length;
  const audioCount = audioAssets.length;
  const videoTotalDuration = videoAssets.reduce((sum, asset) => sum + (asset.durationSeconds || 0), 0);
  const audioTotalDuration = audioAssets.reduce((sum, asset) => sum + (asset.durationSeconds || 0), 0);

  const hasContent = assets.length > 0;
  const imageErrors = validationSummary?.imageErrors || [];
  const videoErrors = validationSummary?.videoErrors || [];
  const audioErrors = validationSummary?.audioErrors || [];
  const globalErrors = validationSummary?.globalErrors || [];
  const hasMinimumAssets = validationSummary?.hasMinimumAssets ?? (imageCount > 0 || videoCount > 0);
  const hasBlockingIssues = validationSummary?.hasBlockingIssues ?? (globalErrors.length > 0 || imageErrors.length > 0 || videoErrors.length > 0 || audioErrors.length > 0);
  const hasSatisfiedConditions = hasMinimumAssets && !hasBlockingIssues;
  const imageOverLimit = imageErrors.length > 0;
  const videoOverLimit = videoErrors.length > 0;
  const audioOverLimit = audioErrors.length > 0;

  useEffect(() => {
    if (!focusTarget) return;
    const targetRef = focusTarget === 'top'
      ? topRef
      : focusTarget === 'image'
        ? imageCardRef
        : focusTarget === 'video'
          ? videoCardRef
          : audioCardRef;
    targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashTarget(focusTarget);
    const timer = window.setTimeout(() => {
      setFlashTarget((current) => (current === focusTarget ? null : current));
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [focusTarget]);

  return (
    <div className="flex flex-col gap-3">
      <style>{`
        @keyframes seedanceReplayShake {
          0% { transform: translate3d(0, 0, 0); }
          18% { transform: translate3d(-5px, 0, 0); }
          36% { transform: translate3d(5px, 0, 0); }
          54% { transform: translate3d(-4px, 0, 0); }
          72% { transform: translate3d(4px, 0, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
      `}</style>
      {!hasContent ? (
        <div className="glass-panel relative z-10 rounded-xl border border-dashed border-white/10 p-5 sm:p-6">
          <div className="mx-auto flex max-w-lg flex-col items-center text-center">
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
              <RoundIcon icon={<ImageIcon className="h-4 w-4" />} label={t.wb_seedance_replay_media_image || 'Image'} tooltipItems={mediaTooltipItems.image} />
              <RoundIcon icon={<Video className="h-4 w-4" />} label={t.wb_seedance_replay_media_video || 'Video'} tooltipItems={mediaTooltipItems.video} />
              <RoundIcon icon={<Music className="h-4 w-4" />} label={t.wb_seedance_replay_media_audio || 'Audio'} tooltipItems={mediaTooltipItems.audio} />
              <RoundIcon icon={<Users className="h-4 w-4" />} label={t.wb_seedance_replay_virtual_models || 'Virtual Models'} tooltipItems={mediaTooltipItems.model} />
            </div>

            <h3 className="text-base font-bold text-zinc-100">{t.wb_seedance_replay_add_reference_title || 'Add Reference Assets'}</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              {t.wb_seedance_replay_add_reference_desc_auto || '从左侧素材库拖入素材，系统将根据素材类别自动识别分类。'}
            </p>
            {onOpenLibrary && (
              <button
                type="button"
                onClick={onOpenLibrary}
                className="wb-upload-library-btn mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.04] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:border-white/30 hover:bg-white/[0.08]"
              >
                <Library className="h-3.5 w-3.5" />
                {t.wb_seedance_replay_open_library || '从素材库选择'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-xl border border-white/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-zinc-500">
              {t.wb_seedance_replay_quick_add || 'Quick Add'}
              <span className="ml-1 font-medium text-zinc-500/80">
                {t.wb_seedance_replay_quick_add_hint_auto || '(从素材库选择素材，系统自动按类别归类)'}
              </span>
            </span>
            {onOpenLibrary && (
              <button
                type="button"
                onClick={onOpenLibrary}
                className="wb-upload-library-btn ml-auto inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-bold text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
              >
                <Library className="h-3 w-3" />
                {t.wb_seedance_replay_open_library || '从素材库选择'}
              </button>
            )}
          </div>
        </div>
      )}

      <div
        ref={topRef}
        style={flashTarget === 'top' ? shakeAnimationStyle : undefined}
        className={`glass-panel rounded-xl border px-3 py-3 transition-all duration-300 ${
          flashTarget === 'top'
            ? 'border-orange-400/70 ring-2 ring-orange-400/40 shadow-[0_0_0_1px_rgba(251,146,60,0.35),0_0_28px_rgba(251,146,60,0.14)]'
            : 'border-white/10'
        }`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300 lg:gap-5">
            <StatusMetric icon={<ImageIcon className="h-3.5 w-3.5 text-zinc-500" />} label={t.wb_seedance_replay_media_image || 'Image'} value={imageCount} limit={SEEDANCE_REPLAY_IMAGE_LIMIT} error={imageOverLimit} />
            <MetricDivider />
            <StatusMetric
              icon={<Video className="h-3.5 w-3.5 text-zinc-500" />}
              label={t.wb_seedance_replay_media_video || 'Video'}
              value={videoCount}
              limit={SEEDANCE_REPLAY_VIDEO_LIMIT}
              duration={formatSeconds(videoTotalDuration)}
              durationLimit={`${SEEDANCE_REPLAY_DURATION_MAX}s`}
              error={videoOverLimit}
            />
            <MetricDivider />
            <StatusMetric
              icon={<Music className="h-3.5 w-3.5 text-zinc-500" />}
              label={t.wb_seedance_replay_media_audio || 'Audio'}
              value={audioCount}
              limit={SEEDANCE_REPLAY_AUDIO_LIMIT}
              duration={formatSeconds(audioTotalDuration)}
              durationLimit={`${SEEDANCE_REPLAY_DURATION_MAX}s`}
              error={audioOverLimit}
            />
          </div>

          <div className={`flex items-center gap-2 text-xs font-medium ${hasSatisfiedConditions ? 'text-emerald-400' : 'text-zinc-500'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${hasSatisfiedConditions ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
            {hasSatisfiedConditions
              ? (t.wb_seedance_replay_conditions_ready || 'Requirements Met')
              : (t.wb_seedance_replay_conditions_pending || 'Requirements Pending')}
          </div>
        </div>

        {(globalErrors.length > 0 || imageErrors.length > 0 || videoErrors.length > 0 || audioErrors.length > 0) && (
          <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
            {globalErrors.map((message) => (
              <p key={message} className="flex items-center gap-2 text-xs text-orange-300">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                {message}
              </p>
            ))}
            {imageErrors.map((message) => (
              <p key={message} className="flex items-center gap-2 text-xs text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                {message}
              </p>
            ))}
            {videoErrors.map((message) => (
              <p key={message} className="flex items-center gap-2 text-xs text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                {message}
              </p>
            ))}
            {audioErrors.map((message) => (
              <p key={message} className="flex items-center gap-2 text-xs text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                {message}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        <CategoryCard
          containerRef={imageCardRef}
          highlighted={flashTarget === 'image'}
          title={t.wb_seedance_replay_ref_images || 'Reference Images'}
          icon={<ImageIcon className="h-4 w-4" />}
          items={imageAssets}
          count={imageCount}
          limit={SEEDANCE_REPLAY_IMAGE_LIMIT}
          exceedsLimit={imageOverLimit}
          errorMessages={imageErrors}
          onPreview={onPreview}
          onRemove={onRemove}
          onSetFrameRole={onSetFrameRole}
          onOpenLibrary={onOpenLibraryForKind ? () => onOpenLibraryForKind('image') : undefined}
        />
        <CategoryCard
          containerRef={videoCardRef}
          highlighted={flashTarget === 'video'}
          title={t.wb_seedance_replay_ref_videos || 'Reference Videos'}
          icon={<Video className="h-4 w-4" />}
          items={videoAssets}
          count={videoCount}
          limit={SEEDANCE_REPLAY_VIDEO_LIMIT}
          totalDuration={videoTotalDuration}
          durationLimit={SEEDANCE_REPLAY_DURATION_MAX}
          exceedsLimit={videoOverLimit}
          errorMessages={videoErrors}
          onPreview={onPreview}
          onRemove={onRemove}
          onOpenLibrary={onOpenLibraryForKind ? () => onOpenLibraryForKind('video') : undefined}
        />
        <CategoryCard
          containerRef={audioCardRef}
          highlighted={flashTarget === 'audio'}
          title={t.wb_seedance_replay_ref_audio || 'Reference Audio'}
          icon={<Music className="h-4 w-4" />}
          items={audioAssets}
          count={audioCount}
          limit={SEEDANCE_REPLAY_AUDIO_LIMIT}
          totalDuration={audioTotalDuration}
          durationLimit={SEEDANCE_REPLAY_DURATION_MAX}
          exceedsLimit={audioOverLimit}
          errorMessages={audioErrors}
          onPreview={onPreview}
          onRemove={onRemove}
          onOpenLibrary={onOpenLibraryForKind ? () => onOpenLibraryForKind('audio') : undefined}
        />

        {/* Virtual Model Zone */}
        <div className="glass-panel rounded-xl border border-white/10 p-3.5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="text-zinc-400"><Users className="h-4 w-4" /></div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-zinc-100">{t.wb_seedance_replay_virtual_models || '虚拟模特'}</h3>
                  <span className="text-xs text-zinc-500">{modelAssets.length}/3</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <MiniIconButton onClick={onAddVirtualModel}>
                <Plus className="h-3.5 w-3.5" />
              </MiniIconButton>
            </div>
          </div>
          {modelAssets.length === 0 ? (
            <div className="flex min-h-[4.25rem] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-3 text-center text-xs leading-snug text-zinc-500">
              {t.wb_seedance_replay_virtual_models_empty || 'Click the "+" icon to add from the virtual model library.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {modelAssets.map((item) => (
                <ImageCard key={item.id} item={item} onPreview={onPreview} onRemove={onRemove} />
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

function RoundIcon({
  icon,
  label,
  tooltipItems,
  tooltipAlign = 'center',
}: {
  icon: React.ReactNode;
  label?: string;
  tooltipItems?: string[];
  tooltipAlign?: TooltipAlign;
}) {
  const hasTooltip = Boolean(label && tooltipItems?.length);

  return (
    <div className="group relative">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"
        tabIndex={hasTooltip ? 0 : -1}
        aria-label={label}
      >
        {icon}
      </div>
      {hasTooltip && (
        <div className={`${tooltipBaseClass} ${tooltipAlignClass(tooltipAlign)}`}>
          <div className="text-[11px] font-bold text-white/90">{label}</div>
          <div className="mt-1 space-y-1 text-[10px] leading-relaxed text-zinc-200/80">
            {tooltipItems!.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition hover:border-white/30 hover:bg-white/[0.08]"
    >
      {children}
    </button>
  );
}

function StatusMetric({
  icon,
  label,
  value,
  limit,
  duration,
  durationLimit,
  error,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  limit: number;
  duration?: string;
  durationLimit?: string;
  error?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-xs text-zinc-300">
        {label} <span className={value > limit || error ? 'text-orange-300' : 'text-zinc-100'}>{value}</span>/{limit}
      </span>
      {duration && durationLimit && (
        <span className="text-[11px] text-zinc-500">
          <span className={error ? 'text-red-400' : 'text-zinc-400'}>{duration}</span>/{durationLimit}
        </span>
      )}
    </div>
  );
}

function MetricDivider() {
  return <div className="hidden h-3.5 w-px bg-white/10 sm:block" />;
}

type CategoryCardProps = {
  title: string;
  icon: React.ReactNode;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  highlighted?: boolean;
  items: SeedanceReplayUploadAsset[];
  count: number;
  limit: number;
  totalDuration?: number;
  durationLimit?: number;
  exceedsLimit?: boolean;
  errorMessages?: string[];
  onPreview: (assetId: string) => void;
  onRemove: (assetId: string) => void;
  onSetFrameRole?: (assetId: string, role: 'firstFrame' | 'lastFrame' | null) => void;
  onOpenLibrary?: () => void;
};

function CategoryCard({
  title,
  icon,
  containerRef,
  highlighted = false,
  items,
  count,
  limit,
  totalDuration,
  durationLimit,
  exceedsLimit,
  errorMessages = [],
  onPreview,
  onRemove,
  onSetFrameRole,
  onOpenLibrary,
}: CategoryCardProps) {
  const { t } = useLanguage();
  const isEmpty = items.length === 0;

  return (
    <div
      ref={containerRef}
      style={highlighted ? shakeAnimationStyle : undefined}
      className={`glass-panel rounded-xl border p-3.5 transition-all duration-300 ${
        highlighted
          ? 'border-orange-400/70 ring-2 ring-orange-400/40 shadow-[0_0_0_1px_rgba(251,146,60,0.35),0_0_28px_rgba(251,146,60,0.14)]'
          : exceedsLimit
            ? 'border-red-500/40'
            : 'border-white/10'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="text-zinc-400">{icon}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-100">{title}</h3>
              <span className="text-xs text-zinc-500">
                {count}/{limit}
                {typeof totalDuration === 'number' && typeof durationLimit === 'number' ? (
                  <span className="ml-2">
                    <span className={exceedsLimit ? 'text-red-400' : 'text-zinc-400'}>{formatSeconds(totalDuration)}</span>/{durationLimit}s
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        </div>
        {onOpenLibrary ? (
          <div className="flex items-center gap-1.5">
            <MiniIconButton onClick={onOpenLibrary}>
              <Plus className="h-3.5 w-3.5" />
            </MiniIconButton>
          </div>
        ) : null}
      </div>

      {isEmpty ? (
        <div className="flex min-h-[4.25rem] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-3 text-center text-xs leading-snug text-zinc-500">
          {onOpenLibrary
            ? (t.wb_seedance_replay_empty_hint_library || 'Click the "+" icon to add from the material library.')
            : (t.wb_seedance_replay_empty_hint || 'Choose from the material library.')}
        </div>
      ) : items[0].mediaKind === 'image' ? (
        <StackedImageDisplay items={items} onPreview={onPreview} onRemove={onRemove} onSetFrameRole={onSetFrameRole} />
      ) : items[0].mediaKind === 'video' ? (
        <StackedVideoDisplay items={items} onPreview={onPreview} onRemove={onRemove} />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <AudioCard key={item.id} item={item} onPreview={onPreview} onRemove={onRemove} />
          ))}
        </div>
      )}

      {errorMessages.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
          {errorMessages.map((message) => (
            <p key={message} className="flex items-center gap-2 text-xs text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              {message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniIconButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
    >
      {children}
    </button>
  );
}

/* ======== Stacked Image Display (Card-pile effect) ======== */
function StackedImageDisplay({
  items,
  onPreview,
  onRemove,
  onSetFrameRole,
}: {
  items: SeedanceReplayUploadAsset[];
  onPreview: (assetId: string) => void;
  onRemove: (assetId: string) => void;
  onSetFrameRole?: (assetId: string, role: 'firstFrame' | 'lastFrame' | null) => void;
}) {
  const { t } = useLanguage();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hasFirstFrame = items.some((i) => i.frameRole === '首帧');
  const hasLastFrame = items.some((i) => i.frameRole === '尾帧');

  const getFrameLabel = (item: SeedanceReplayUploadAsset) => {
    if (item.frameRole === '首帧') return t.wb_seedance_replay_first_frame || '首帧';
    if (item.frameRole === '尾帧') return t.wb_seedance_replay_last_frame || '尾帧';
    return t.wb_seedance_replay_ref_image_label || '参考图';
  };

  const getFrameColor = (item: SeedanceReplayUploadAsset) => {
    if (item.frameRole === '首帧') return { border: 'border-blue-500/40', bg: 'bg-blue-500/20', text: 'text-blue-200' };
    if (item.frameRole === '尾帧') return { border: 'border-orange-500/40', bg: 'bg-orange-500/20', text: 'text-orange-200' };
    return { border: 'border-white/15', bg: 'bg-white/10', text: 'text-zinc-300' };
  };

  // Single item: just show directly
  if (items.length === 1) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        <ImageCard item={items[0]} onPreview={onPreview} onRemove={onRemove} onSetFrameRole={onSetFrameRole} hasFirstFrame={hasFirstFrame} hasLastFrame={hasLastFrame} />
      </div>
    );
  }

  return (
    <div className="relative flex items-start gap-0 overflow-x-auto custom-scroll pb-2" style={{ minHeight: '140px' }}>
      {items.map((item, idx) => {
        const isHovered = hoveredId === item.id;
        const baseOffset = idx * 88;
        const zBase = idx + 1;
        const zIndex = isHovered ? items.length + 10 : zBase;
        const color = getFrameColor(item);

        return (
          <div
            key={item.id}
            className="absolute transition-all duration-200 ease-out"
            style={{
              left: `${baseOffset}px`,
              zIndex,
              transform: isHovered ? 'translateY(-6px) scale(1.04)' : 'translateY(0) scale(1)',
            }}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {/* Card */}
            <div className={`relative w-[100px] overflow-hidden rounded-xl border shadow-lg transition-shadow duration-200 ${
              isHovered ? 'border-white/30 shadow-xl shadow-black/40' : 'border-white/10 shadow-md shadow-black/20'
            }`}>
              {/* Image */}
              <div className="aspect-[3/4] bg-zinc-900">
                {item.previewUrl ? (
                  <img src={item.previewUrl} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-white/5 flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-zinc-600" />
                  </div>
                )}
              </div>

              {/* Hover overlay: preview + remove + frame role buttons */}
              <div className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 backdrop-blur-[2px] transition-opacity duration-150 ${
                isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}>
                <div className="flex items-center gap-1">
                  <OverlayActionButton tone="neutral" onClick={() => onPreview(item.id)}>
                    <Eye className="h-3.5 w-3.5" />
                  </OverlayActionButton>
                  <OverlayActionButton tone="danger" onClick={() => onRemove(item.id)}>
                    <X className="h-3.5 w-3.5" />
                  </OverlayActionButton>
                </div>
                {onSetFrameRole && (
                  <div className="flex items-center gap-1 mt-1">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSetFrameRole(item.id, item.frameRole === '首帧' ? null : 'firstFrame'); }}
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold border transition ${
                        item.frameRole === '首帧' ? 'border-blue-400/50 bg-blue-500/40 text-blue-100' : 'border-white/20 bg-black/40 text-zinc-300 hover:bg-blue-500/20 hover:text-blue-200'
                      }`}
                    >
                      {t.wb_seedance_replay_first_frame || '首帧'}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!hasFirstFrame && item.frameRole !== '首帧') return;
                        onSetFrameRole(item.id, item.frameRole === '尾帧' ? null : 'lastFrame');
                      }}
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold border transition ${
                        item.frameRole === '尾帧' ? 'border-orange-400/50 bg-orange-500/40 text-orange-100'
                          : !hasFirstFrame && item.frameRole !== '首帧' ? 'border-white/5 bg-black/20 text-zinc-600 cursor-not-allowed'
                          : 'border-white/20 bg-black/40 text-zinc-300 hover:bg-orange-500/20 hover:text-orange-200'
                      }`}
                    >
                      {t.wb_seedance_replay_last_frame || '尾帧'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Label tab peeking from bottom */}
            <div className={`mt-1 text-center rounded-b-lg border-x border-b px-1 py-0.5 text-[9px] font-bold leading-tight backdrop-blur ${color.border} ${color.bg} ${color.text}`}>
              {getFrameLabel(item)}
            </div>
          </div>
        );
      })}
      {/* Spacer to ensure parent has correct width */}
      <div style={{ width: `${(items.length - 1) * 88 + 100}px`, minHeight: '1px' }} />
    </div>
  );
}

/* ======== Stacked Video Display ======== */
function StackedVideoDisplay({
  items,
  onPreview,
  onRemove,
}: {
  items: SeedanceReplayUploadAsset[];
  onPreview: (assetId: string) => void;
  onRemove: (assetId: string) => void;
}) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  if (items.length <= 2 || expanded) {
    return (
      <div>
        {items.length > 2 && (
          <button type="button" onClick={() => setExpanded(false)} className="mb-2 text-[10px] text-zinc-400 hover:text-orange-300 transition">
            {t.wb_seedance_replay_collapse || '收起'}
          </button>
        )}
        <div className="space-y-2">
          {items.map((item) => (
            <VideoCard key={item.id} item={item} onPreview={onPreview} onRemove={onRemove} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-2">
        {items.slice(0, 2).map((item) => (
          <VideoCard key={item.id} item={item} onPreview={onPreview} onRemove={onRemove} />
        ))}
      </div>
      <button type="button" onClick={() => setExpanded(true)} className="mt-2 w-full text-center text-[10px] text-zinc-400 hover:text-orange-300 transition">
        {t.wb_seedance_replay_expand || '展开全部'} ({items.length})
      </button>
    </div>
  );
}

/* ======== Image Card with Frame Role ======== */
function ImageCard({
  item,
  onPreview,
  onRemove,
  onSetFrameRole,
  hasFirstFrame,
  hasLastFrame,
}: {
  item: SeedanceReplayUploadAsset;
  onPreview: (assetId: string) => void;
  onRemove: (assetId: string) => void;
  onSetFrameRole?: (assetId: string, role: 'firstFrame' | 'lastFrame' | null) => void;
  hasFirstFrame?: boolean;
  hasLastFrame?: boolean;
}) {
  const { t } = useLanguage();
  const isFirstFrame = item.frameRole === '首帧';
  const isLastFrame = item.frameRole === '尾帧';

  const handleToggleFirstFrame = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSetFrameRole) return;
    if (isFirstFrame) {
      onSetFrameRole(item.id, null);
    } else {
      onSetFrameRole(item.id, 'firstFrame');
    }
  };

  const handleToggleLastFrame = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSetFrameRole) return;
    if (isLastFrame) {
      onSetFrameRole(item.id, null);
    } else {
      // Cannot set last frame if no first frame exists (unless this item is the first frame being replaced)
      if (!hasFirstFrame && !isFirstFrame) return;
      onSetFrameRole(item.id, 'lastFrame');
    }
  };

  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/20">
      {item.previewUrl ? (
        <img src={item.previewUrl} alt={item.name} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-white/5" />
      )}

      {item.frameRole ? (
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold backdrop-blur ${
            isFirstFrame ? 'border-blue-500/30 bg-blue-500/20 text-blue-200' : 'border-orange-500/30 bg-orange-500/20 text-orange-200'
          }`}>
            {item.frameRole}
          </span>
        </div>
      ) : null}

      {/* Frame role toggle buttons in top-right */}
      {onSetFrameRole && (
        <div className="absolute right-1.5 top-1.5 flex flex-col gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={handleToggleFirstFrame}
            title={t.wb_seedance_replay_set_first_frame || '设为首帧'}
            className={`flex h-6 items-center rounded border px-1.5 text-[9px] font-bold transition ${
              isFirstFrame ? 'border-blue-400/50 bg-blue-500/30 text-blue-200' : 'border-white/10 bg-black/40 text-zinc-300 hover:bg-blue-500/20 hover:text-blue-200'
            }`}
          >
            {t.wb_seedance_replay_first_frame || '首帧'}
          </button>
          <button
            type="button"
            onClick={handleToggleLastFrame}
            title={
              !hasFirstFrame && !isFirstFrame
                ? (t.wb_seedance_replay_need_first_frame || '需先设置首帧')
                : (t.wb_seedance_replay_set_last_frame || '设为尾帧')
            }
            className={`flex h-6 items-center rounded border px-1.5 text-[9px] font-bold transition ${
              isLastFrame ? 'border-orange-400/50 bg-orange-500/30 text-orange-200'
                : !hasFirstFrame && !isFirstFrame ? 'border-white/5 bg-black/20 text-zinc-600 cursor-not-allowed'
                : 'border-white/10 bg-black/40 text-zinc-300 hover:bg-orange-500/20 hover:text-orange-200'
            }`}
          >
            {t.wb_seedance_replay_last_frame || '尾帧'}
          </button>
        </div>
      )}

      {/* Hover overlay: preview + remove */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent py-2 opacity-0 transition group-hover:opacity-100">
        <OverlayActionButton tone="neutral" onClick={() => onPreview(item.id)}>
          <Eye className="h-3.5 w-3.5" />
        </OverlayActionButton>
        <OverlayActionButton tone="danger" onClick={() => onRemove(item.id)}>
          <X className="h-3.5 w-3.5" />
        </OverlayActionButton>
      </div>
    </div>
  );
}

function VideoCard({
  item,
  onPreview,
  onRemove,
}: {
  item: SeedanceReplayUploadAsset;
  onPreview: (assetId: string) => void;
  onRemove: (assetId: string) => void;
}) {
  return (
    <div className="group rounded-xl border border-white/10 bg-black/20 p-3 transition hover:bg-white/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex h-20 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5 sm:w-32">
          {item.previewUrl ? (
            <video src={item.previewUrl} className="h-full w-full object-cover opacity-80" muted playsInline />
          ) : null}
          <Play className="absolute h-6 w-6 text-zinc-300" />
          <div className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {formatSeconds(item.durationSeconds || 0)}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-zinc-100">{item.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
            <span>{formatSeconds(item.durationSeconds || 0)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
          <OverlayActionButton tone="neutral" onClick={() => onPreview(item.id)}>
            <Eye className="h-3.5 w-3.5" />
          </OverlayActionButton>
          <OverlayActionButton tone="danger" onClick={() => onRemove(item.id)}>
            <X className="h-3.5 w-3.5" />
          </OverlayActionButton>
        </div>
      </div>
    </div>
  );
}

function AudioCard({
  item,
  onPreview,
  onRemove,
}: {
  item: SeedanceReplayUploadAsset;
  onPreview: (assetId: string) => void;
  onRemove: (assetId: string) => void;
}) {
  return (
    <div className="group rounded-xl border border-white/10 bg-black/20 p-3 transition hover:bg-white/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
          <Music className="h-5 w-5 text-zinc-300" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-zinc-100">{item.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
            <span>{formatSeconds(item.durationSeconds || 0)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
          <OverlayActionButton tone="neutral" onClick={() => onPreview(item.id)}>
            <Play className="h-3.5 w-3.5" />
          </OverlayActionButton>
          <OverlayActionButton tone="danger" onClick={() => onRemove(item.id)}>
            <X className="h-3.5 w-3.5" />
          </OverlayActionButton>
        </div>
      </div>
    </div>
  );
}

function OverlayActionButton({
  children,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  tone: 'neutral' | 'danger';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex h-8 w-8 items-center justify-center rounded-lg border transition',
        tone === 'danger'
          ? 'border-red-500/30 bg-red-500/20 text-red-200 hover:bg-red-500 hover:text-white'
          : 'border-white/10 bg-black/40 text-white hover:bg-white/20',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
