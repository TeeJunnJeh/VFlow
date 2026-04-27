import React from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import type { LoadingTheme } from '../../../utils/loadingTheme';

interface LoadingProgressProps {
  progress: number;
  estimatedTime?: number;
  countdownStartSeconds?: number;
  startedAtMs?: number;
  currentStep?: string;
  totalSteps?: number;
  queuePosition?: number;
  title?: string;
  onCancel?: () => void;
  theme?: LoadingTheme;
  backgroundImageSrc?: string;
}

const hexToRgba = (hex: string, alpha: number) => {
  const cleaned = String(hex || '').trim().replace('#', '');
  const normalized = cleaned.length === 3
    ? cleaned.split('').map((char) => char + char).join('')
    : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(255,255,255,${alpha})`;
  }
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const LoadingProgress: React.FC<LoadingProgressProps> = ({
  progress,
  title,
  onCancel,
  theme,
  backgroundImageSrc,
}) => {
  const { t } = useLanguage();
  const palette = theme || {
    mode: 'vivid' as const,
    primary: '#baa8ff',
    secondary: '#a5dcff',
    accent: '#ffd2b4',
    quaternary: '#ffb4dc',
    surface: '#ffffff',
  };

  const blobs = [
    {
      size: '100%',
      top: '-10%',
      left: '-10%',
      duration: '6s',
      gradient: `radial-gradient(circle, ${hexToRgba(palette.primary, 0.92)} 0%, transparent 78%)`,
    },
    {
      size: '90%',
      bottom: '-5%',
      right: '-5%',
      duration: '8s',
      direction: 'reverse' as const,
      gradient: `radial-gradient(circle, ${hexToRgba(palette.secondary, 0.9)} 0%, transparent 78%)`,
    },
    {
      size: '110%',
      top: '20%',
      right: '-15%',
      duration: '10s',
      gradient: `radial-gradient(circle, ${hexToRgba(palette.accent, 0.9)} 0%, transparent 78%)`,
    },
    {
      size: '85%',
      bottom: '15%',
      left: '5%',
      duration: '7s',
      gradient: `radial-gradient(circle, ${hexToRgba(palette.quaternary, 0.9)} 0%, transparent 78%)`,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-xl">
      <style>{`
        @keyframes ff-gradient-blob {
          0% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          33% { transform: translate3d(15%, 20%, 0) rotate(120deg) scale(1.2); }
          66% { transform: translate3d(-15%, 15%, 0) rotate(240deg) scale(0.85); }
          100% { transform: translate3d(0, 0, 0) rotate(360deg) scale(1); }
        }
      `}</style>

      <div className="mb-4 text-center">
        <h3 className="mb-2 text-lg font-semibold text-white">
          {title ? title : t.ff_loading_title}
        </h3>
        <p className="text-sm text-zinc-400">{t.ff_loading_keep_page_open}</p>
      </div>

      <div
        className="relative overflow-hidden rounded-[40px]"
        style={{
          minHeight: '420px',
          background: `linear-gradient(180deg, ${hexToRgba(palette.primary, 0.08)} 0%, ${palette.surface} 18%, ${palette.surface} 100%)`,
          boxShadow: `0 20px 40px rgba(0, 0, 0, 0.05), inset 0 1px 0 ${hexToRgba(palette.primary, 0.16)}`,
        }}
      >
        {backgroundImageSrc ? (
          <div
            className="absolute inset-[-10%] opacity-[0.1] blur-[1400px]"
            style={{
              backgroundImage: `url("${backgroundImageSrc}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'saturate(0.7) contrast(0.26) brightness(1.14)',
            }}
          />
        ) : null}
        <div className="absolute inset-0 blur-[45px] [transform:scale(1.3)]">
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
        <div
          className="absolute right-5 top-5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums backdrop-blur-sm"
          style={{
            border: `1px solid ${hexToRgba(palette.primary, 0.24)}`,
            backgroundColor: 'rgba(255,255,255,0.58)',
            color: '#1a1a1a',
            boxShadow: `0 10px 28px ${hexToRgba(palette.primary, 0.18)}`,
          }}
        >
          {progress}%
        </div>
      </div>

      {onCancel ? (
        <div className="mt-4 flex justify-end">
          <button
            onClick={onCancel}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition-all hover:bg-red-500/30"
          >
            <X className="h-4 w-4" />
            {t.ff_cancel_generation}
          </button>
        </div>
      ) : null}
    </div>
  );
};
