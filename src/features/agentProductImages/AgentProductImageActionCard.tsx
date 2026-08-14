import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  FolderOpen,
  ImagePlus,
  Loader2,
  MessageSquare,
  Shirt,
  Sparkles,
  Upload,
  UserRound,
  Wand2,
  X,
} from 'lucide-react';
import { AppDialog } from '../../components/common/AppDialog';
import { CreativeAssetPickerDialog, type CreativeAssetPickerKind } from '../../components/creativeLab/CreativeAssetPickerDialog';
import { agentRuntimeApi, type AgentAction, type AgentAssetRef, type AgentRunReadiness } from '../../services/agentRuntime';
import { assetsApi, type Asset } from '../../services/assets';
import { AgentProductImageExtendedActionCard } from './AgentProductImageExtendedActionCard';
import { getAgentProductImagesCopy } from './i18n';
import {
  assetFieldRole,
  canonicalProductImageToolName,
  getMissingProductImageFields,
  normalizeProductImageParams,
  PRODUCT_IMAGE_ASPECT_RATIOS,
  type AgentConversationImage,
  type AgentProductImageAssetField,
  type AgentProductImageToolName,
} from './types';

type PickerState = {
  field: AgentProductImageAssetField;
  kind: CreativeAssetPickerKind;
  multiple: boolean;
} | null;

export interface AgentProductImageActionCardProps {
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
const labelClassName = 'mb-1.5 block text-xs font-semibold text-zinc-400';

const readAsset = (value: unknown): AgentAssetRef | null => {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const url = String(item.url || '').trim();
  const assetId = String(item.asset_id || '').trim();
  if (!url && !assetId) return null;
  return {
    source: (['conversation', 'library', 'temp_upload'].includes(String(item.source))
      ? item.source
      : assetId ? 'library' : 'conversation') as AgentAssetRef['source'],
    url,
    name: String(item.name || ''),
    role: String(item.role || ''),
    message_id: String(item.message_id || ''),
    asset_id: assetId,
  };
};

const readAssets = (value: unknown) => (
  Array.isArray(value) ? value.map(readAsset).filter((item): item is AgentAssetRef => Boolean(item)) : []
);

const toolTitle = (toolName: AgentProductImageToolName, copy: ReturnType<typeof getAgentProductImagesCopy>) => {
  if (toolName === 'generate_clothing_swap') return copy.clothingSwap;
  if (toolName === 'generate_first_frame') return copy.firstFrame;
  return copy.aiModel;
};

const toolIcon = (toolName: AgentProductImageToolName) => {
  if (toolName === 'generate_clothing_swap') return <Shirt className="h-5 w-5" />;
  if (toolName === 'generate_first_frame') return <ImagePlus className="h-5 w-5" />;
  return <UserRound className="h-5 w-5" />;
};

const hasNonDefaultAdvancedParams = (toolName: AgentProductImageToolName, raw: Record<string, unknown>) => {
  if (toolName === 'generate_clothing_swap') {
    return String(raw.aspect_ratio || '16:9') !== '16:9' || Number(raw.output_count || 1) !== 1;
  }
  if (toolName === 'generate_first_frame') {
    return String(raw.aspect_ratio || '9:16') !== '9:16' || String(raw.resolution || '1k') !== '1k';
  }
  return String(raw.aspect_ratio || '3:4') !== '3:4'
    || Number(raw.output_count || 1) !== 1
    || Boolean(String(raw.negative_prompt || '').trim());
};

const Field: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <label className="block min-w-0">
    <span className={labelClassName}>{label}</span>
    {children}
  </label>
);

const AssetSlot: React.FC<{
  label: string;
  assets: AgentAssetRef[];
  multiple?: boolean;
  hint?: string;
  disabled?: boolean;
  copy: ReturnType<typeof getAgentProductImagesCopy>;
  onConversation: () => void;
  onLibrary: () => void;
  onUpload: () => void;
  onRemove: (index: number) => void;
}> = ({ label, assets, multiple, hint, disabled, copy, onConversation, onLibrary, onUpload, onRemove }) => (
  <section className="border-b border-white/10 pb-4 last:border-b-0">
    <div className="mb-2 flex items-center justify-between gap-3">
      <div>
        <div className="text-xs font-semibold text-zinc-300">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-zinc-500">{hint}</div>}
      </div>
      {assets.length > 0 && (
        <span className="text-[11px] font-medium text-emerald-400">{copy.selected} {assets.length}</span>
      )}
    </div>
    {assets.length > 0 && (
      <div className={`mb-2 grid gap-2 ${multiple ? 'grid-cols-4' : 'grid-cols-1'}`}>
        {assets.map((asset, index) => (
          <div key={`${asset.source}_${asset.asset_id || asset.url}_${index}`} className="group relative min-w-0 overflow-hidden rounded-md border border-white/10 bg-black">
            <img src={asset.url} alt={asset.name || label} className={`block w-full object-cover ${multiple ? 'aspect-square' : 'h-28'}`} />
            <button
              type="button"
              title={copy.remove}
              disabled={disabled}
              onClick={() => onRemove(index)}
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-black/75 text-zinc-200 opacity-100 transition hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="truncate px-2 py-1 text-[10px] text-zinc-400">{asset.name || asset.role || label}</div>
          </div>
        ))}
      </div>
    )}
    <div className="flex flex-wrap gap-1.5">
      <button type="button" disabled={disabled} onClick={onConversation} className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-50">
        <MessageSquare className="h-3.5 w-3.5" />{copy.chooseConversation}
      </button>
      <button type="button" disabled={disabled} onClick={onLibrary} className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-50">
        <FolderOpen className="h-3.5 w-3.5" />{copy.chooseLibrary}
      </button>
      <button type="button" disabled={disabled} onClick={onUpload} className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-50">
        <Upload className="h-3.5 w-3.5" />{copy.upload}
      </button>
    </div>
  </section>
);

const AgentProductImageCoreActionCard: React.FC<AgentProductImageActionCardProps> = ({
  action,
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
  const [params, setParams] = useState<Record<string, unknown>>(() => (
    toolName ? normalizeProductImageParams(toolName, action.params || {}) : { ...(action.params || {}) }
  ));
  const [advancedOpen, setAdvancedOpen] = useState(() => (
    toolName ? hasNonDefaultAdvancedParams(toolName, action.params || {}) : false
  ));
  const [picker, setPicker] = useState<PickerState>(null);
  const [conversationField, setConversationField] = useState<AgentProductImageAssetField | null>(null);
  const [uploadField, setUploadField] = useState<AgentProductImageAssetField | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [dirtyVersion, setDirtyVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const runIdRef = useRef(action.run_id || '');
  const saveTokenRef = useRef(0);

  useEffect(() => {
    const nextRunId = action.run_id || '';
    if (runIdRef.current === nextRunId || !toolName) return;
    runIdRef.current = nextRunId;
    setParams(normalizeProductImageParams(toolName, action.params || {}));
    setDirtyVersion(0);
    setSaveState('idle');
  }, [action.params, action.run_id, toolName]);

  useEffect(() => {
    if (!action.run_id || dirtyVersion === 0 || disabled || submitting) return;
    const token = ++saveTokenRef.current;
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      void agentRuntimeApi.updateRun(action.run_id!, params)
        .then((run) => {
          if (saveTokenRef.current !== token) return;
          setSaveState('saved');
          setDirtyVersion(0);
          onRunUpdated?.(action.run_id!, params, run.readiness);
        })
        .catch(() => {
          if (saveTokenRef.current === token) setSaveState('error');
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [action.run_id, dirtyVersion, disabled, onRunUpdated, params, submitting]);

  if (!toolName) return null;

  const updateParams = (patch: Record<string, unknown>) => {
    setParams((previous) => ({ ...previous, ...patch }));
    setDirtyVersion((version) => version + 1);
  };

  const fieldAssets = (field: AgentProductImageAssetField): AgentAssetRef[] => (
    field === 'reference_images' ? readAssets(params[field]) : [readAsset(params[field])].filter((item): item is AgentAssetRef => Boolean(item))
  );

  const setFieldAssets = (field: AgentProductImageAssetField, values: AgentAssetRef[]) => {
    updateParams({ [field]: field === 'reference_images' ? values.slice(0, 4) : (values[0] || null) });
  };

  const pickerForField = (field: AgentProductImageAssetField) => {
    const kind: CreativeAssetPickerKind = ['model_image', 'person_image'].includes(field) ? 'model' : 'product';
    setPicker({ field, kind, multiple: field === 'reference_images' });
  };

  const selectConversationAssets = (field: AgentProductImageAssetField, selected: AgentConversationImage[], close = true) => {
    const role = assetFieldRole(field);
    setFieldAssets(field, selected.map((asset) => ({ ...asset, role })));
    if (close) setConversationField(null);
  };

  const handleLibrarySelection = (assets: Asset[]) => {
    if (!picker) return;
    const role = assetFieldRole(picker.field);
    setFieldAssets(picker.field, assets.map((asset) => ({
      source: 'library',
      asset_id: asset.id,
      url: asset.file_url,
      name: asset.name,
      role,
    })));
    setPicker(null);
  };

  const openUpload = (field: AgentProductImageAssetField) => {
    setUploadField(field);
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const field = uploadField;
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!field || files.length === 0) return;
    setUploading(true);
    try {
      const max = field === 'reference_images' ? Math.max(0, 4 - fieldAssets(field).length) : 1;
      const next: AgentAssetRef[] = [];
      for (const file of files.slice(0, max)) {
        // Uploads stay temporary until the user explicitly adds a result to a library.
        const response = await assetsApi.uploadTempAsset(file);
        const data = response?.data || response;
        const url = String(data?.url || data?.path || response?.url || '').trim();
        if (!url) throw new Error(copy.uploadFailed);
        next.push({ source: 'temp_upload', url, name: file.name, role: assetFieldRole(field) });
      }
      setFieldAssets(field, field === 'reference_images' ? [...fieldAssets(field), ...next] : next);
    } catch {
      setSaveState('error');
    } finally {
      setUploading(false);
      setUploadField(null);
    }
  };

  const missingFields = getMissingProductImageFields(toolName, params);
  const promptMissing = missingFields.includes('prompt');
  const canConfirm = missingFields.length === 0 && !disabled && !submitting && !uploading;
  const mode = String(params.mode || 'virtual');

  const renderSlot = (field: AgentProductImageAssetField, label: string, multiple = false, hint?: string) => (
    <AssetSlot
      label={label}
      assets={fieldAssets(field)}
      multiple={multiple}
      hint={hint}
      disabled={disabled || submitting || uploading}
      copy={copy}
      onConversation={() => setConversationField(field)}
      onLibrary={() => pickerForField(field)}
      onUpload={() => openUpload(field)}
      onRemove={(index) => setFieldAssets(field, fieldAssets(field).filter((_, itemIndex) => itemIndex !== index))}
    />
  );

  return (
    <div
      id={action.run_id ? `agent-action-${action.run_id}` : undefined}
      className={`min-w-0 transition-shadow duration-300 ${highlighted ? 'rounded-md ring-2 ring-orange-400/80 shadow-[0_0_0_6px_rgba(251,146,60,0.12)]' : ''}`}
    >
      <div className="mb-4 flex items-center gap-2 text-zinc-300">
        {toolIcon(toolName)}
        <span className="text-sm font-bold">{toolTitle(toolName, copy)}</span>
        <span className="ml-auto text-[11px] text-zinc-500">
          {saveState === 'saving' ? copy.saving : saveState === 'saved' ? copy.saved : saveState === 'error' ? copy.saveFailed : ''}
        </span>
      </div>

      {superseded && <div className="mb-3 text-xs font-medium text-amber-300/80">{copy.superseded}</div>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={uploadField === 'reference_images'}
        className="hidden"
        onChange={handleUpload}
      />

      <div className="space-y-4">
        {toolName === 'generate_clothing_swap' && (
          <>
            {renderSlot('model_image', copy.modelImage)}
            {renderSlot('garment_image', copy.garmentImage)}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={copy.category}>
                <select className={fieldClassName} disabled={disabled} value={String(params.category || 'Top')} onChange={(event) => updateParams({ category: event.target.value })}>
                  <option value="Top">{copy.top}</option><option value="Bottom">{copy.bottom}</option><option value="Full Body">{copy.fullBodyGarment}</option>
                </select>
              </Field>
              <Field label={copy.background}>
                <select className={fieldClassName} disabled={disabled} value={String(params.background || 'model')} onChange={(event) => updateParams({ background: event.target.value })}>
                  <option value="model">{copy.modelBackground}</option><option value="runway">{copy.runway}</option><option value="street">{copy.street}</option><option value="white_wall">{copy.whiteWall}</option><option value="custom">{copy.custom}</option><option value="background_image">{copy.imageBackground}</option>
                </select>
              </Field>
            </div>
            {params.background === 'custom' && (
              <Field label={copy.customBackground}>
                <textarea className={`${fieldClassName} min-h-20 resize-y`} disabled={disabled} value={String(params.custom_background_prompt || '')} onChange={(event) => updateParams({ custom_background_prompt: event.target.value })} />
              </Field>
            )}
            {params.background === 'background_image' && renderSlot('background_image', copy.backgroundImage)}
            <Field label={`${copy.targetColor}: ${String(params.target_color || 'Original')}`}>
              <div className="flex flex-wrap gap-2">
                {[
                  ['Original', '#d4d4d8'], ['Red', '#ef4444'], ['Orange', '#f97316'], ['Yellow', '#eab308'], ['Green', '#22c55e'],
                  ['Blue', '#3b82f6'], ['Purple', '#a855f7'], ['Pink', '#ec4899'], ['Black', '#09090b'], ['White', '#fafafa'],
                ].map(([name, color]) => (
                  <button
                    key={name}
                    type="button"
                    title={name === 'Original' ? copy.original : name}
                    disabled={disabled}
                    onClick={() => updateParams({ target_color: name })}
                    className={`h-7 w-7 rounded-full border border-white/20 transition ${params.target_color === name ? 'ring-2 ring-orange-400 ring-offset-2 ring-offset-zinc-900' : 'hover:scale-105'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </Field>
          </>
        )}

        {toolName === 'generate_first_frame' && (
          <>
            {renderSlot('reference_images', copy.references, true, `${copy.maxReferences} · ${copy.fixedModel}`)}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={copy.openingScene}>
                <select className={fieldClassName} disabled={disabled} value={String(params.opening_scene || 'person_selling')} onChange={(event) => updateParams({ opening_scene: event.target.value })}>
                  <option value="person_selling">{copy.personSelling}</option><option value="product_showcase">{copy.productShowcase}</option><option value="usage_demo">{copy.usageDemo}</option><option value="brand_ad">{copy.brandAd}</option>
                </select>
              </Field>
              <Field label={copy.outputCount}>
                <select className={fieldClassName} disabled={disabled} value={Number(params.output_count || 4)} onChange={(event) => updateParams({ output_count: Number(event.target.value) })}>
                  {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </Field>
            </div>
          </>
        )}

        {toolName === 'generate_ai_model' && (
          <>
            <Field label={copy.mode}>
              <div className="grid grid-cols-2 rounded-md bg-zinc-950 p-1">
                {(['virtual', 'real'] as const).map((value) => (
                  <button key={value} type="button" disabled={disabled} onClick={() => updateParams({ mode: value })} className={`rounded px-3 py-2 text-xs font-semibold transition ${mode === value ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:bg-zinc-800'}`}>
                    {value === 'virtual' ? copy.virtual : copy.real}
                  </button>
                ))}
              </div>
            </Field>
            {mode === 'real' && renderSlot('person_image', copy.personImage)}
            {mode === 'virtual' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={copy.gender}>
                  <select className={fieldClassName} disabled={disabled} value={String(params.gender || 'female')} onChange={(event) => updateParams({ gender: event.target.value })}>
                    <option value="female">{copy.female}</option><option value="male">{copy.male}</option><option value="neutral">{copy.neutral}</option><option value="no_limit">{copy.noLimit}</option>
                  </select>
                </Field>
                <Field label={copy.ageRange}><input className={fieldClassName} disabled={disabled} value={String(params.age_range || '')} onChange={(event) => updateParams({ age_range: event.target.value })} /></Field>
                <Field label={copy.style}>
                  <select className={fieldClassName} disabled={disabled} value={String(params.style || 'commercial')} onChange={(event) => updateParams({ style: event.target.value })}>
                    <option value="commercial">{copy.commercial}</option><option value="studio">{copy.studio}</option><option value="lifestyle">{copy.lifestyle}</option><option value="fashion">{copy.fashion}</option><option value="street">{copy.street}</option>
                  </select>
                </Field>
                <Field label={copy.outfit}><input className={fieldClassName} disabled={disabled} value={String(params.outfit || '')} onChange={(event) => updateParams({ outfit: event.target.value })} /></Field>
                <Field label={copy.background}><input className={fieldClassName} disabled={disabled} value={String(params.background || '')} onChange={(event) => updateParams({ background: event.target.value })} /></Field>
              </div>
            )}
            {mode === 'real' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={copy.outfit}><input className={fieldClassName} disabled={disabled} value={String(params.outfit || '')} onChange={(event) => updateParams({ outfit: event.target.value })} /></Field>
                <Field label={copy.background}><input className={fieldClassName} disabled={disabled} value={String(params.background || '')} onChange={(event) => updateParams({ background: event.target.value })} /></Field>
                <Field label={copy.styling}><input className={fieldClassName} disabled={disabled} value={String(params.styling || '')} onChange={(event) => updateParams({ styling: event.target.value })} /></Field>
                <Field label={copy.bodyFraming}>
                  <select className={fieldClassName} disabled={disabled} value={String(params.body_framing || 'full_body')} onChange={(event) => updateParams({ body_framing: event.target.value })}>
                    <option value="full_body">{copy.fullBody}</option><option value="half_body">{copy.halfBody}</option><option value="upper_body">{copy.upperBody}</option>
                  </select>
                </Field>
              </div>
            )}
          </>
        )}

        <button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="flex w-full items-center justify-between border-t border-white/10 pt-3 text-xs font-semibold text-zinc-400 transition hover:text-zinc-200">
          <span>{copy.advanced}</span><ChevronDown className={`h-4 w-4 transition ${advancedOpen ? 'rotate-180' : ''}`} />
        </button>
        {advancedOpen && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={copy.aspectRatio}>
              <select className={fieldClassName} disabled={disabled} value={String(params.aspect_ratio || (toolName === 'generate_clothing_swap' ? '16:9' : toolName === 'generate_first_frame' ? '9:16' : '3:4'))} onChange={(event) => updateParams({ aspect_ratio: event.target.value })}>
                {PRODUCT_IMAGE_ASPECT_RATIOS[toolName].map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
              </select>
            </Field>
            {toolName === 'generate_first_frame' && (
              <Field label={copy.resolution}>
                <select className={fieldClassName} disabled={disabled} value={String(params.resolution || '1k')} onChange={(event) => updateParams({ resolution: event.target.value })}>
                  <option value="1k">1K</option><option value="2k">2K</option><option value="4k">4K</option>
                </select>
              </Field>
            )}
            <Field label={copy.outputCount}>
              <select className={fieldClassName} disabled={disabled} value={Number(params.output_count || 1)} onChange={(event) => updateParams({ output_count: Number(event.target.value) })}>
                {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
            </Field>
            {toolName === 'generate_ai_model' && (
              <div className="sm:col-span-2"><Field label={copy.negativePrompt}><textarea className={`${fieldClassName} min-h-20 resize-y`} disabled={disabled} value={String(params.negative_prompt || '')} onChange={(event) => updateParams({ negative_prompt: event.target.value })} /></Field></div>
            )}
          </div>
        )}

        {missingFields.length > 0 && (
          <div className="text-xs font-medium text-amber-300/90">{promptMissing ? copy.hiddenPromptMissing : copy.missing}</div>
        )}
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => onConfirm({ ...action, type: toolName, params }, params)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-orange-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {submitting ? copy.submitting : copy.generate}
        </button>
      </div>

      {conversationField && (
        <AppDialog
          isOpen
          title={copy.selectImages}
          onClose={() => setConversationField(null)}
          widthClassName="max-w-3xl"
          footer={<button type="button" onClick={() => setConversationField(null)} className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700">{copy.close}</button>}
        >
          {conversationImages.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-500">{copy.noConversationImages}</div>
          ) : (
            <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-4">
              {conversationImages.map((asset) => {
                const selectedUrls = new Set(fieldAssets(conversationField).map((item) => item.url));
                const selected = selectedUrls.has(asset.url);
                return (
                  <button
                    key={`${asset.message_id}_${asset.url}`}
                    type="button"
                    onClick={() => {
                      if (conversationField !== 'reference_images') {
                        selectConversationAssets(conversationField, [asset]);
                        return;
                      }
                      const current = fieldAssets(conversationField);
                      const next = selected
                        ? current.filter((item) => item.url !== asset.url)
                        : [...current, { ...asset, role: assetFieldRole(conversationField) }].slice(0, 4);
                      setFieldAssets(conversationField, next);
                    }}
                    className={`relative overflow-hidden rounded-md border bg-black text-left transition ${selected ? 'border-orange-400 ring-2 ring-orange-400/20' : 'border-white/10 hover:border-white/30'}`}
                  >
                    <img src={asset.url} alt={asset.name || copy.references} className="aspect-square w-full object-cover" />
                    <div className="truncate px-2 py-1.5 text-[11px] text-zinc-400">{asset.name || asset.role || copy.references}</div>
                    {selected && <Sparkles className="absolute right-2 top-2 h-5 w-5 rounded bg-orange-500 p-1 text-white" />}
                  </button>
                );
              })}
            </div>
          )}
        </AppDialog>
      )}

      {picker && (
        <CreativeAssetPickerDialog
          isOpen
          kind={picker.kind}
          multiple={picker.multiple}
          selectedIds={fieldAssets(picker.field).map((asset) => asset.asset_id || '').filter(Boolean)}
          requireSeedanceId={false}
          imageOnly
          onConfirm={handleLibrarySelection}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
};

export const AgentProductImageActionCard: React.FC<AgentProductImageActionCardProps> = (props) => {
  const toolName = canonicalProductImageToolName(props.action.type);
  if (toolName === 'generate_product_gallery' || toolName === 'edit_product_poster') {
    return <AgentProductImageExtendedActionCard key={props.action.run_id || props.action.type} {...props} />;
  }
  return <AgentProductImageCoreActionCard {...props} />;
};
