import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Wand2 } from 'lucide-react';
import { AppDialog } from '../../components/common/AppDialog';
import { getAgentImageEditingCopy } from './i18n';
import { MaskCanvas, type MaskCanvasHandle } from './MaskCanvas';
import type { AgentImageEditScope, AgentImageEditSource, AgentImageEditSubmission } from './types';

interface AgentImageEditDialogProps {
  isOpen: boolean;
  language: string;
  sources: AgentImageEditSource[];
  initialSourceUrl?: string;
  initialScope?: AgentImageEditScope;
  initialPrompt?: string;
  onClose: () => void;
  onSubmit: (submission: AgentImageEditSubmission) => Promise<void>;
}

export const AgentImageEditDialog: React.FC<AgentImageEditDialogProps> = ({
  isOpen,
  language,
  sources,
  initialSourceUrl,
  initialScope = 'local',
  initialPrompt = '',
  onClose,
  onSubmit,
}) => {
  const copy = getAgentImageEditingCopy(language);
  const maskRef = useRef<MaskCanvasHandle>(null);
  const submitTokenRef = useRef(0);
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl || sources[0]?.url || '');
  const [scope, setScope] = useState<AgentImageEditScope>(initialScope);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [hasSelection, setHasSelection] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSourceUrl(initialSourceUrl || sources[0]?.url || '');
    setScope(initialScope);
    setPrompt(initialPrompt);
    setHasSelection(false);
    setError('');
  }, [initialPrompt, initialScope, initialSourceUrl, isOpen, sources]);

  const source = sources.find((item) => item.url === sourceUrl) || sources[0];

  const submit = async () => {
    if (!source || submitting) return;
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setError(copy.promptRequired);
      return;
    }
    if (scope === 'local' && !hasSelection) {
      setError(copy.selectionRequired);
      return;
    }
    setSubmitting(true);
    setError('');
    const submitToken = ++submitTokenRef.current;
    try {
      const maskBlob = scope === 'local' ? await maskRef.current?.exportMask() : undefined;
      if (submitToken !== submitTokenRef.current) return;
      await onSubmit({ source, scope, prompt: cleanPrompt, maskBlob });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    submitTokenRef.current += 1;
    setSubmitting(false);
    onClose();
  };

  return (
    <AppDialog
      isOpen={isOpen}
      title={copy.title}
      subtitle={scope === 'local' ? copy.localHint : copy.globalHint}
      onClose={close}
      widthClassName="max-w-6xl"
      overlayClassName="z-[400]"
      contentClassName="overflow-y-auto"
      footer={(
        <div className="flex w-full items-center justify-between gap-3">
          <div className="min-w-0 text-xs text-red-300">{error}</div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={close} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-700">
              {copy.cancel}
            </button>
            <button type="button" onClick={() => void submit()} disabled={submitting || !source} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2 text-sm font-bold text-white hover:bg-orange-500 disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {submitting ? copy.generating : copy.generate}
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-white/10 bg-zinc-950 p-1">
            {(['local', 'global'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => { setScope(value); setError(''); }}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${scope === value ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {value === 'local' ? copy.local : copy.global}
              </button>
            ))}
          </div>
          {sources.length > 1 && (
            <div className="flex max-w-full items-center gap-2 overflow-x-auto">
              <span className="shrink-0 text-xs text-zinc-500">{copy.selectSource}</span>
              {sources.map((item) => (
                <button
                  key={`${item.messageId}_${item.url}`}
                  type="button"
                  onClick={() => { setSourceUrl(item.url); setHasSelection(false); setError(''); }}
                  className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md border ${source?.url === item.url ? 'border-orange-400 ring-2 ring-orange-500/30' : 'border-white/10'}`}
                  title={`${item.versionKind === 'edited' ? copy.sourceEdited : copy.sourceOriginal}${item.versionNumber ? ` ${item.versionNumber}` : ''}`}
                >
                  <img src={item.url} alt={item.name || 'source'} className="h-full w-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/75 px-1 py-0.5 text-[9px] font-semibold text-white">
                    {item.versionKind === 'edited' ? copy.sourceEdited : copy.sourceOriginal}
                    {item.versionNumber ? ` ${item.versionNumber}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {source ? (
          scope === 'local' ? (
            <MaskCanvas
              key={source.url}
              ref={maskRef}
              imageUrl={source.url}
              language={language}
              onSelectionChange={setHasSelection}
              onLoadError={() => setError(copy.loadFailed)}
            />
          ) : (
            <div className="flex h-[min(56vh,620px)] min-h-[320px] items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/70">
              <img src={source.url} alt={source.name || 'source'} className="max-h-full max-w-full object-contain" />
            </div>
          )
        ) : (
          <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-white/10 text-zinc-500">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}

        <label className="block space-y-2">
          <span className="text-xs font-semibold text-zinc-400">{scope === 'local' ? copy.effect : copy.prompt}</span>
          <textarea
            value={prompt}
            onChange={(event) => { setPrompt(event.target.value); setError(''); }}
            rows={3}
            placeholder={copy.promptPlaceholder}
            className="w-full resize-y rounded-lg border border-white/10 bg-zinc-950 px-4 py-3 text-sm leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-orange-500/60"
          />
        </label>
      </div>
    </AppDialog>
  );
};
