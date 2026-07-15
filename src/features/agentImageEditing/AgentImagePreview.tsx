import React, { useState } from 'react';
import { ExternalLink, ImageOff, RefreshCw } from 'lucide-react';

type AgentImagePreviewProps = {
  src: string;
  alt: string;
  imageClassName: string;
  fallbackClassName: string;
  loadFailedLabel: string;
  retryLabel: string;
  openOriginalLabel: string;
  onOpen?: () => void;
  compact?: boolean;
};

export const AgentImagePreview: React.FC<AgentImagePreviewProps> = ({
  src,
  alt,
  imageClassName,
  fallbackClassName,
  loadFailedLabel,
  retryLabel,
  openOriginalLabel,
  onOpen,
  compact = false,
}) => {
  const [loadState, setLoadState] = useState({ src, failed: false, attempt: 0 });
  const activeState = loadState.src === src
    ? loadState
    : { src, failed: false, attempt: 0 };

  if (activeState.failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-zinc-950 text-zinc-400 ${fallbackClassName}`}
        role={compact ? 'img' : 'alert'}
        aria-label={compact ? loadFailedLabel : undefined}
      >
        <ImageOff className={compact ? 'h-4 w-4' : 'h-7 w-7'} />
        {!compact && (
          <>
            <span className="px-4 text-center text-xs">{loadFailedLabel}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setLoadState({ src, failed: false, attempt: activeState.attempt + 1 });
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {retryLabel}
              </button>
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {openOriginalLabel}
              </a>
            </div>
          </>
        )}
      </div>
    );
  }

  const image = (
    <img
      key={`${src}_${activeState.attempt}`}
      src={src}
      alt={alt}
      className={imageClassName}
      onError={() => setLoadState({ ...activeState, failed: true })}
    />
  );

  if (!onOpen) return image;
  return (
    <button type="button" onClick={onOpen} className="block w-full cursor-zoom-in text-left">
      {image}
    </button>
  );
};
