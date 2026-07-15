import React from 'react';
import {
  AlertCircle,
  Check,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Paintbrush,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { AgentImagePreview } from './AgentImagePreview';
import { AgentImageEditButton } from './AgentImageEditButton';
import { getAgentImageEditingCopy } from './i18n';
import type { AgentImageEditQueueJob } from './types';

interface AgentImageEditQueueCardProps {
  job: AgentImageEditQueueJob;
  language: string;
  onRetry: () => void;
  onReopen: () => void;
  onOpenResult?: () => void;
  onEditResult?: () => void;
}

const RESULT_IMAGE_RETRY_DELAYS = [750, 1500, 3000, 5000];

const resultImageAttemptUrl = (url: string, attempt: number) => {
  if (!url || attempt <= 0 || !url.startsWith('/media/')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}vflow_image_retry=${attempt}`;
};

export const AgentImageEditQueueCard: React.FC<AgentImageEditQueueCardProps> = ({
  job,
  language,
  onRetry,
  onReopen,
  onOpenResult,
  onEditResult,
}) => {
  const copy = getAgentImageEditingCopy(language);
  const resultUrl = job.resultSource?.url || '';
  const [resultLoadState, setResultLoadState] = React.useState({
    src: resultUrl,
    loaded: false,
    failed: false,
    attempt: 0,
  });
  const activeResultState = resultLoadState.src === resultUrl
    ? resultLoadState
    : { src: resultUrl, loaded: false, failed: false, attempt: 0 };
  const resultReady = Boolean(resultUrl && activeResultState.loaded);
  const retryDelay = RESULT_IMAGE_RETRY_DELAYS[activeResultState.attempt];
  const autoRetrying = Boolean(resultUrl && activeResultState.failed && retryDelay !== undefined);
  const resultLoadFailed = Boolean(resultUrl && activeResultState.failed && !autoRetrying);

  React.useEffect(() => {
    if (!autoRetrying || retryDelay === undefined) return;
    const timer = window.setTimeout(() => {
      setResultLoadState({
        src: resultUrl,
        loaded: false,
        failed: false,
        attempt: activeResultState.attempt + 1,
      });
    }, retryDelay);
    return () => window.clearTimeout(timer);
  }, [activeResultState.attempt, autoRetrying, resultUrl, retryDelay]);
  const queueStatusText = {
    arranging: copy.generating,
    queued: copy.queued,
    uploading: copy.uploadingMask,
    submitting: copy.submittingTask,
    processing: copy.processingImage,
    completed: copy.processingImage,
    failed: copy.failed,
  }[job.status];
  const failed = job.status === 'failed';
  const visualFailed = failed || resultLoadFailed;
  const statusText = resultReady
    ? copy.completed
    : resultLoadFailed
      ? copy.resultLoadFailed
      : queueStatusText;
  const error = job.error === 'mask_missing_after_reload' ? copy.maskLost : job.error;

  return (
    <div
      className={`w-full max-w-[360px] overflow-hidden rounded-2xl border bg-zinc-900 ${visualFailed ? 'border-red-500/30' : 'border-white/10'}`}
      data-testid="agent-image-edit-queue-card"
      data-status={resultReady ? 'ready' : visualFailed ? 'failed' : 'loading'}
    >
      <div className="flex items-center gap-2 border-b border-white/10 bg-zinc-950/60 px-4 py-3" aria-live="polite">
        {visualFailed ? (
          <AlertCircle className="h-4 w-4 shrink-0 text-red-300" />
        ) : resultReady ? (
          <Check className="h-4 w-4 shrink-0 text-emerald-300" />
        ) : (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-orange-400" />
        )}
        <span className={`text-sm font-semibold ${visualFailed ? 'text-red-300' : resultReady ? 'text-emerald-300' : 'text-zinc-200'}`}>
          {statusText}
        </span>
      </div>

      <div className="relative aspect-[4/3] overflow-hidden bg-black">
        {job.source.url ? (
          <AgentImagePreview
            src={job.source.url}
            alt={copy.sourceOriginal}
            imageClassName="absolute inset-0 h-full w-full object-contain opacity-30"
            fallbackClassName="absolute inset-0 h-full w-full"
            loadFailedLabel={copy.loadFailed}
            retryLabel={copy.retry}
            openOriginalLabel={copy.openOriginal}
            compact
          />
        ) : (
          <ImageIcon className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-zinc-700" />
        )}
        {resultUrl && (
          <img
            key={`${resultUrl}_${activeResultState.attempt}`}
            src={resultImageAttemptUrl(resultUrl, activeResultState.attempt)}
            alt={job.resultSource?.name || copy.sourceEdited}
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${resultReady ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setResultLoadState({ ...activeResultState, loaded: true, failed: false })}
            onError={() => setResultLoadState({ ...activeResultState, loaded: false, failed: true })}
          />
        )}

        {!resultReady && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center ${visualFailed ? 'bg-red-950/55' : 'bg-zinc-950/55'}`}>
            {visualFailed ? (
              <AlertCircle className="h-9 w-9 text-red-300" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-orange-400/30 bg-black/50">
                <Loader2 className="h-6 w-6 animate-spin text-orange-400" />
              </div>
            )}
            <div>
              <div className={`text-sm font-semibold ${visualFailed ? 'text-red-200' : 'text-zinc-100'}`}>{statusText}</div>
              {!visualFailed && <div className="mt-1 text-xs text-zinc-400">{copy.resultPending}</div>}
            </div>
            {resultLoadFailed && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setResultLoadState({
                    src: resultUrl,
                    loaded: false,
                    failed: false,
                    attempt: activeResultState.attempt + 1,
                  })}
                  className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {copy.retry}
                </button>
                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {copy.openOriginal}
                </a>
              </div>
            )}
          </div>
        )}

        {resultReady && onOpenResult && (
          <button
            type="button"
            onClick={onOpenResult}
            className="agent-image-edit-result-trigger absolute inset-0 z-10 cursor-zoom-in appearance-none border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-400"
            aria-label={copy.openOriginal}
          />
        )}
        {resultReady && onEditResult && (
          <AgentImageEditButton
            label={copy.edit}
            onClick={onEditResult}
            className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-md border border-white/15 bg-black/75 text-white shadow-lg backdrop-blur transition hover:bg-blue-600"
          />
        )}
      </div>

      <div className="px-4 py-3">
        <p className="line-clamp-2 text-xs leading-relaxed text-zinc-400">{job.prompt}</p>
        {failed && error && <p className="mt-2 line-clamp-2 text-xs text-red-300/80">{error}</p>}
      </div>
      {failed && (
        <div className="flex gap-2 border-t border-white/10 px-4 py-3">
          {job.error !== 'mask_missing_after_reload' && (
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-500">
              <RotateCcw className="h-3.5 w-3.5" />
              {copy.retry}
            </button>
          )}
          <button type="button" onClick={onReopen} className="inline-flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700">
            <Paintbrush className="h-3.5 w-3.5" />
            {copy.reopenEditor}
          </button>
        </div>
      )}
    </div>
  );
};
