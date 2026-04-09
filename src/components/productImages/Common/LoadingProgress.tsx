import React from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

interface LoadingProgressProps {
  progress: number;
  estimatedTime?: number;
  countdownStartSeconds?: number;
  startedAtMs?: number;
  currentStep?: string;
  totalSteps?: number;
  queuePosition?: number;
  title?: string;
  onCancel: () => void;
}

export const LoadingProgress: React.FC<LoadingProgressProps> = ({
  progress,
  title,
  onCancel,
}) => {
  const { t } = useLanguage();

  const blobs = [
    {
      size: '110%',
      top: '-10%',
      left: '-12%',
      duration: '6s',
      gradient: 'radial-gradient(circle, rgba(186,168,255,0.9) 0%, transparent 78%)',
    },
    {
      size: '96%',
      bottom: '-8%',
      right: '-8%',
      duration: '8s',
      direction: 'reverse' as const,
      gradient: 'radial-gradient(circle, rgba(165,220,255,0.82) 0%, transparent 80%)',
    },
    {
      size: '118%',
      top: '18%',
      right: '-14%',
      duration: '10s',
      gradient: 'radial-gradient(circle, rgba(255,210,180,0.76) 0%, transparent 80%)',
    },
    {
      size: '90%',
      bottom: '10%',
      left: '4%',
      duration: '7s',
      gradient: 'radial-gradient(circle, rgba(255,180,220,0.74) 0%, transparent 78%)',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl">
      <style>{`
        @keyframes ff-gradient-blob {
          0% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          33% { transform: translate3d(14%, 18%, 0) rotate(120deg) scale(1.18); }
          66% { transform: translate3d(-14%, 12%, 0) rotate(240deg) scale(0.86); }
          100% { transform: translate3d(0, 0, 0) rotate(360deg) scale(1); }
        }
      `}</style>

      <div className="mb-4 text-center">
        <h3 className="mb-2 text-lg font-semibold text-white">
          {title ? title : t.ff_loading_title}
        </h3>
        <p className="text-sm text-zinc-400">{t.ff_loading_keep_page_open}</p>
      </div>

      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-black/20" style={{ minHeight: '520px' }}>
        <div className="absolute inset-[-8%] blur-[78px]">
          {blobs.map((blob, index) => (
            <div
              key={index}
              className="absolute rounded-full"
              style={{
                width: blob.size,
                height: blob.size,
                top: blob.top,
                left: blob.left,
                right: blob.right,
                bottom: blob.bottom,
                background: blob.gradient,
                animationName: 'ff-gradient-blob',
                animationDuration: blob.duration,
                animationTimingFunction: 'linear',
                animationIterationCount: 'infinite',
                animationDirection: blob.direction || 'normal',
              }}
            />
          ))}
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_52%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.06),transparent_34%)]" />
        <div className="absolute right-5 top-5 rounded-full border border-orange-400/25 bg-black/30 px-3 py-1 text-sm font-semibold tabular-nums text-orange-300 backdrop-blur-sm">
          {progress}%
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={onCancel}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition-all hover:bg-red-500/30"
        >
          <X className="h-4 w-4" />
          {t.ff_cancel_generation}
        </button>
      </div>
    </div>
  );
};
