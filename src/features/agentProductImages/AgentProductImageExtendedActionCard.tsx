import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Images, Loader2, ScanSearch, Sparkles, Type, Wand2 } from 'lucide-react';
import { agentRuntimeApi, type AgentAction, type AgentRunReadiness, type AgentSuggestionLanguage } from '../../services/agentRuntime';
import { formatApiError } from '../../services/errors';
import { AgentProductImageAssetSelector } from './AgentProductImageAssetSelector';
import { getAgentProductImagesCopy } from './i18n';
import {
  assetFieldRole,
  canonicalProductImageToolName,
  getMissingProductImageFields,
  GALLERY_OUTPUT_TYPES,
  normalizeGalleryOutputItems,
  normalizeProductImageParams,
  PRODUCT_IMAGE_ASPECT_RATIOS,
  readAgentAssetRef,
  readAgentAssetRefs,
  type AgentConversationImage,
  type AgentGalleryOutputItem,
  type AgentGalleryOutputType,
} from './types';
import { useAgentProductRunDraft } from './useAgentProductRunDraft';

export interface AgentProductImageExtendedActionCardProps {
  action: AgentAction;
  conversationId: string;
  language: string;
  conversationImages: AgentConversationImage[];
  disabled?: boolean;
  submitting?: boolean;
  superseded?: boolean;
  highlighted?: boolean;
  onConfirm: (action: AgentAction, params: Record<string, unknown>) => void;
  onRunUpdated?: (runId: string, params: Record<string, unknown>, readiness?: AgentRunReadiness | null) => void;
}

const fieldClassName = 'w-full rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none transition focus:border-orange-500/60 disabled:cursor-not-allowed disabled:opacity-60';

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => (
  <label className={`block min-w-0 ${className}`}>
    <span className="mb-1.5 block text-xs font-semibold text-zinc-400">{label}</span>
    {children}
  </label>
);

const outputLabel = (type: AgentGalleryOutputType, copy: ReturnType<typeof getAgentProductImagesCopy>) => ({
  white_bg: copy.whiteBg,
  scene: copy.sceneImage,
  selling_point: copy.sellingPointImage,
  cover: copy.coverImage,
  poster: copy.posterImage,
})[type];

export const AgentProductImageExtendedActionCard: React.FC<AgentProductImageExtendedActionCardProps> = ({
  action,
  conversationId,
  language,
  conversationImages,
  disabled = false,
  submitting = false,
  superseded = false,
  highlighted = false,
  onConfirm,
  onRunUpdated,
}) => {
  const copy = getAgentProductImagesCopy(language);
  const toolName = canonicalProductImageToolName(action.type);
  const normalize = useMemo(() => (
    (raw: Record<string, unknown>) => toolName ? normalizeProductImageParams(toolName, raw) : raw
  ), [toolName]);
  const { params, updateParams, saveState } = useAgentProductRunDraft({
    action,
    disabled,
    submitting,
    normalize,
    onRunUpdated,
  });
  const [advancedOpen, setAdvancedOpen] = useState(() => Boolean(
    action.params?.generation_model && action.params.generation_model !== 'nano-banana-pro'
    || action.params?.target_scene
    || action.params?.style
    || action.params?.model_image
    || action.params?.scene_config,
  ));
  const [busyFields, setBusyFields] = useState<Record<string, boolean>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const analysisControllerRef = useRef<AbortController | null>(null);
  const analysisTokenRef = useRef(0);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => () => analysisControllerRef.current?.abort(), []);
  useEffect(() => {
    analysisControllerRef.current?.abort();
    analysisTokenRef.current += 1;
    setAnalyzing(false);
    setAnalysisError('');
  }, [action.run_id, conversationId]);

  if (toolName !== 'generate_product_gallery' && toolName !== 'edit_product_poster') return null;

  const setBusy = (field: string, busy: boolean) => setBusyFields((previous) => ({ ...previous, [field]: busy }));
  const anyAssetBusy = Object.values(busyFields).some(Boolean);
  const missingFields = getMissingProductImageFields(toolName, params);
  const canConfirm = missingFields.length === 0 && !disabled && !submitting && !anyAssetBusy && !analyzing;
  const title = toolName === 'generate_product_gallery' ? copy.productGallery : copy.posterEditor;

  const recognizeProduct = async () => {
    const productImages = readAgentAssetRefs(params.product_images);
    if (!action.run_id || !conversationId || productImages.length === 0 || analyzing) return;
    analysisControllerRef.current?.abort();
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    const token = ++analysisTokenRef.current;
    setAnalyzing(true);
    setAnalysisError('');
    try {
      const result = await agentRuntimeApi.analyzeProductImages(conversationId, {
        run_id: action.run_id,
        language: language as AgentSuggestionLanguage,
        product_images: productImages,
        existing_info: {
          product_name: String(params.product_name || ''),
          product_category: String(params.product_category || ''),
          core_selling_points: Array.isArray(params.core_selling_points) ? params.core_selling_points.map(String) : [],
        },
      }, { signal: controller.signal });
      if (token !== analysisTokenRef.current) return;
      const currentParams = paramsRef.current;
      const patch: Record<string, unknown> = {};
      if (!String(currentParams.product_name || '').trim() && result.product_name) patch.product_name = result.product_name;
      if (!String(currentParams.product_category || '').trim() && result.product_category) patch.product_category = result.product_category;
      if (!(Array.isArray(currentParams.core_selling_points) && currentParams.core_selling_points.length) && result.core_selling_points.length) {
        patch.core_selling_points = result.core_selling_points;
      }
      if (Object.keys(patch).length) updateParams(patch);
    } catch (error: unknown) {
      if (!controller.signal.aborted && token === analysisTokenRef.current) {
        setAnalysisError(formatApiError(error, copy.recognitionFailed));
      }
    } finally {
      if (token === analysisTokenRef.current) setAnalyzing(false);
    }
  };

  const galleryItems = normalizeGalleryOutputItems(params.output_items);
  const updateGalleryItem = (type: AgentGalleryOutputType, patch: Partial<AgentGalleryOutputItem>) => {
    const next = galleryItems.map((item) => item.output_type === type ? { ...item, ...patch } : item);
    updateParams({ output_items: normalizeGalleryOutputItems(next) });
  };
  const totalImages = galleryItems.filter((item) => item.enabled).reduce((sum, item) => sum + item.count, 0);
  const sceneConfig = params.scene_config && typeof params.scene_config === 'object'
    ? params.scene_config as Record<string, unknown>
    : {};
  const updateScene = (key: string, value: string) => updateParams({ scene_config: { ...sceneConfig, [key]: value } });

  return (
    <div
      id={action.run_id ? `agent-action-${action.run_id}` : undefined}
      className={`min-w-0 transition-shadow duration-300 ${highlighted ? 'rounded-md ring-2 ring-orange-400/80 shadow-[0_0_0_6px_rgba(251,146,60,0.12)]' : ''}`}
    >
      <div className="mb-4 flex items-center gap-2 text-zinc-300">
        {toolName === 'generate_product_gallery' ? <Images className="h-5 w-5" /> : <Type className="h-5 w-5" />}
        <span className="text-sm font-bold">{title}</span>
        <span className="ml-auto text-[11px] text-zinc-500">
          {saveState === 'saving' ? copy.saving : saveState === 'saved' ? copy.saved : saveState === 'error' ? copy.saveFailed : ''}
        </span>
      </div>
      {superseded && <div className="mb-3 text-xs font-medium text-amber-300/80">{copy.superseded}</div>}

      <div className="space-y-4">
        {toolName === 'generate_product_gallery' ? (
          <>
            <AgentProductImageAssetSelector
              label={copy.productImages}
              hint="1-3"
              language={language}
              assets={readAgentAssetRefs(params.product_images)}
              conversationImages={conversationImages}
              role={assetFieldRole('product_images')}
              libraryKind="product"
              maxItems={3}
              disabled={disabled || submitting}
              onChange={(assets) => {
                analysisControllerRef.current?.abort();
                analysisTokenRef.current += 1;
                setAnalyzing(false);
                setAnalysisError('');
                updateParams({ product_images: assets });
              }}
              onBusyChange={(busy) => setBusy('product_images', busy)}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={copy.productName}><input className={fieldClassName} disabled={disabled} value={String(params.product_name || '')} onChange={(event) => updateParams({ product_name: event.target.value })} /></Field>
              <Field label={copy.productCategory}><input className={fieldClassName} disabled={disabled} value={String(params.product_category || '')} onChange={(event) => updateParams({ product_category: event.target.value })} /></Field>
              <Field label={copy.sellingPoints} className="sm:col-span-2">
                <textarea className={`${fieldClassName} min-h-20 resize-y`} disabled={disabled} value={(Array.isArray(params.core_selling_points) ? params.core_selling_points : []).join('\n')} onChange={(event) => updateParams({ core_selling_points: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 5) })} />
              </Field>
            </div>
            <button type="button" disabled={disabled || submitting || analyzing || readAgentAssetRefs(params.product_images).length === 0} onClick={() => void recognizeProduct()} className="inline-flex items-center gap-2 rounded-md bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-200 ring-1 ring-blue-400/20 transition hover:bg-blue-500/20 disabled:opacity-50">
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
              {analyzing ? copy.recognizingProduct : copy.recognizeProduct}
            </button>
            {analysisError && <div className="text-xs text-red-300">{analysisError}</div>}

            <section>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">{copy.outputTypes}</span>
                <span className="text-[11px] text-zinc-500">{copy.totalImages}: {totalImages}/20</span>
              </div>
              <div className="space-y-2">
                {GALLERY_OUTPUT_TYPES.map((type) => {
                  const item = galleryItems.find((candidate) => candidate.output_type === type)!;
                  return (
                    <div key={type} className={`flex items-center gap-3 rounded-md border px-3 py-2 ${item.enabled ? 'border-orange-400/25 bg-orange-500/5' : 'border-white/10 bg-zinc-950/40'}`}>
                      <input type="checkbox" checked={item.enabled} disabled={disabled} onChange={(event) => updateGalleryItem(type, { enabled: event.target.checked })} className="h-4 w-4 accent-orange-500" />
                      <span className="min-w-0 flex-1 text-xs font-medium text-zinc-300">{outputLabel(type, copy)}</span>
                      <select className="rounded-md border border-white/10 bg-zinc-950 px-2 py-1 text-xs text-zinc-300" disabled={disabled || !item.enabled} value={item.count} onChange={(event) => updateGalleryItem(type, { count: Number(event.target.value) })}>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </section>

            <button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="flex w-full items-center justify-between border-t border-white/10 pt-3 text-xs font-semibold text-zinc-400 transition hover:text-zinc-200">
              <span>{copy.advanced}</span><ChevronDown className={`h-4 w-4 transition ${advancedOpen ? 'rotate-180' : ''}`} />
            </button>
            {advancedOpen && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={copy.generationModel}>
                    <select className={fieldClassName} disabled={disabled} value={String(params.generation_model || 'nano-banana-pro')} onChange={(event) => updateParams({ generation_model: event.target.value })}>
                      <option value="nano-banana-pro">Nano Banana Pro</option><option value="flux-2-pro">Flux 2 Pro</option><option value="gpt-image-1.5">GPT Image 1.5</option>
                    </select>
                  </Field>
                  <Field label={copy.visualStyle}><input className={fieldClassName} disabled={disabled} value={String(params.style || '')} onChange={(event) => updateParams({ style: event.target.value })} /></Field>
                  <Field label={copy.targetScene}><input className={fieldClassName} disabled={disabled} value={String(params.target_scene || '')} onChange={(event) => updateParams({ target_scene: event.target.value })} /></Field>
                  <Field label={copy.modelInfo}><input className={fieldClassName} disabled={disabled} value={String(params.model_info || '')} onChange={(event) => updateParams({ model_info: event.target.value })} /></Field>
                  <Field label={copy.sceneTheme}><input className={fieldClassName} disabled={disabled} value={String(sceneConfig.scene_theme || '')} onChange={(event) => updateScene('scene_theme', event.target.value)} /></Field>
                  <Field label={copy.sceneDescription}><input className={fieldClassName} disabled={disabled} value={String(sceneConfig.scene_description || '')} onChange={(event) => updateScene('scene_description', event.target.value)} /></Field>
                  <Field label={copy.sceneProps}><input className={fieldClassName} disabled={disabled} value={String(sceneConfig.scene_props || '')} onChange={(event) => updateScene('scene_props', event.target.value)} /></Field>
                  <Field label={copy.lighting}><input className={fieldClassName} disabled={disabled} value={String(sceneConfig.lighting || '')} onChange={(event) => updateScene('lighting', event.target.value)} /></Field>
                  <Field label={copy.mood}><input className={fieldClassName} disabled={disabled} value={String(sceneConfig.mood || '')} onChange={(event) => updateScene('mood', event.target.value)} /></Field>
                </div>
                <AgentProductImageAssetSelector
                  label={copy.modelImage}
                  language={language}
                  assets={[readAgentAssetRef(params.model_image)].filter(Boolean) as NonNullable<ReturnType<typeof readAgentAssetRef>>[]}
                  conversationImages={conversationImages}
                  role={assetFieldRole('model_image')}
                  libraryKind="model"
                  disabled={disabled || submitting}
                  onChange={(assets) => updateParams({ model_image: assets[0] || null })}
                  onBusyChange={(busy) => setBusy('model_image', busy)}
                />
                <div className="space-y-2">
                  {galleryItems.filter((item) => item.enabled).map((item) => (
                    <div key={item.output_type} className="grid grid-cols-[minmax(0,1fr)_110px_90px] items-end gap-2 rounded-md border border-white/10 bg-zinc-950/40 p-2">
                      <div className="pb-2 text-xs font-medium text-zinc-300">{outputLabel(item.output_type, copy)}</div>
                      <Field label={copy.aspectRatio}>
                        <select className={fieldClassName} disabled={disabled} value={item.aspect_ratio} onChange={(event) => updateGalleryItem(item.output_type, { aspect_ratio: event.target.value })}>
                          {PRODUCT_IMAGE_ASPECT_RATIOS.generate_product_gallery.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                        </select>
                      </Field>
                      <Field label={copy.resolution}>
                        <select className={fieldClassName} disabled={disabled} value={item.resolution} onChange={(event) => updateGalleryItem(item.output_type, { resolution: event.target.value })}>
                          <option value="1k">1K</option><option value="2k">2K</option><option value="4k">4K</option>
                        </select>
                      </Field>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <AgentProductImageAssetSelector
              label={copy.sourcePoster}
              language={language}
              assets={[readAgentAssetRef(params.source_image)].filter(Boolean) as NonNullable<ReturnType<typeof readAgentAssetRef>>[]}
              conversationImages={conversationImages}
              role={assetFieldRole('source_image')}
              libraryKind="product"
              disabled={disabled || submitting}
              onChange={(assets) => updateParams({ source_image: assets[0] || null })}
              onBusyChange={(busy) => setBusy('source_image', busy)}
            />
            <Field label={copy.posterTitle}><input className={fieldClassName} disabled={disabled} value={String(params.sample_title || '')} onChange={(event) => updateParams({ sample_title: event.target.value })} /></Field>
          </>
        )}

        {missingFields.length > 0 && <div className="text-xs font-medium text-amber-300/90">{copy.missing}</div>}
        <button type="button" disabled={!canConfirm} onClick={() => onConfirm({ ...action, type: toolName, params }, params)} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-orange-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50">
          {submitting || anyAssetBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : toolName === 'generate_product_gallery' ? <Sparkles className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
          {submitting ? copy.submitting : toolName === 'generate_product_gallery' ? copy.generate : copy.separatePoster}
        </button>
      </div>
    </div>
  );
};
