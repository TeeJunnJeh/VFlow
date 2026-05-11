/**
 * Canvas pricing helpers — single-source-of-truth for "how much will this cost".
 *
 * Mirrors workbench (WorkbenchView.tsx) and ProductImages forms exactly:
 *   - Pulls pricing from `billingApi.getOverview()` once per session (module
 *     singleton; deduped concurrent calls)
 *   - Uses the same VIDEO_MODEL_PRICING_ALIASES / IMAGE_MODEL_PRICING_ALIASES
 *     mapping so canvas costs are byte-identical to workbench costs
 *   - Seedance: returns "usage-based" sentinel (workbench shows 按量付费)
 *
 * Image cost formula:  rate * outputCount  → roundCreditTenths
 * Video cost formula:  rate * duration_sec → roundCreditTenths
 *                       (except seedance: usage-based, not predictable)
 */
import { useEffect, useState } from 'react';
import { billingApi } from '../../../services/billing';
import { formatCreditAmount, roundCreditTenths } from '../../../utils/credits';

// Same aliases as WorkbenchView.tsx:156-167 (intentionally byte-identical).
const VIDEO_MODEL_PRICING_ALIASES: Record<string, string> = {
  kling: 'kling',
  sora2: 'sora-2',
  sora2pro: 'sora-2-pro',
  'seedance2.0': 'seedance-2.0',
};

const IMAGE_MODEL_PRICING_ALIASES: Record<string, string> = {
  'gpt-image-1.5': 'gpt-image-1.5',
  'flux-2-pro': 'flux-2-pro',
  'flux-2-flex': 'flux-2-flex',
  // NanoBanana Pro on FirstFrame pricing key (see FirstFrameForm:97-99).
  'nano-banana-pro': 'gemini-3-pro-image-preview',
  // Feature-level pricing keys (used when canvas mode is fixed to a single
  // backend slug rather than picking via chip):
  'clothing-swap': 'gemini-2.5-flash-image',  // mirrors ClothingSwapForm:60
};

const isSeedance = (modelId: string) => {
  const n = String(modelId || '').toLowerCase();
  return n === 'seedance2.0' || n === 'seedance-2.0';
};

export interface CanvasPricingState {
  imageModelRates: Record<string, number>;   // keyed by FRONTEND model id
  videoModelRates: Record<string, number>;   // keyed by FRONTEND model id
  loaded: boolean;
}

// --- Module-level cache + dedup (load once per page session) ---
let cachedState: CanvasPricingState | null = null;
let inflightPromise: Promise<CanvasPricingState> | null = null;

async function fetchPricing(): Promise<CanvasPricingState> {
  if (cachedState) return cachedState;
  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    try {
      const res = await billingApi.getOverview();
      const pricing = (res?.data as any)?.pricing || {};
      const imageModels: Record<string, any> = pricing?.image?.models || {};
      const videoModels: Record<string, any> = (() => {
        // Try fast mode first (matches workbench default), fall back to flat models.
        const modes = pricing?.video?.modes;
        if (modes?.fast?.models) return modes.fast.models;
        if (modes?.replay?.models) return modes.replay.models;
        return pricing?.video?.models || {};
      })();

      const imageModelRates: Record<string, number> = {};
      Object.entries(IMAGE_MODEL_PRICING_ALIASES).forEach(([frontendId, backendKey]) => {
        const rate = Number(imageModels[backendKey]?.rate || 0);
        if (Number.isFinite(rate) && rate > 0) imageModelRates[frontendId] = rate;
      });

      const videoModelRates: Record<string, number> = {};
      Object.entries(VIDEO_MODEL_PRICING_ALIASES).forEach(([frontendId, backendKey]) => {
        const rate = Number(videoModels[backendKey]?.rate || 0);
        if (Number.isFinite(rate) && rate > 0) videoModelRates[frontendId] = rate;
      });

      cachedState = { imageModelRates, videoModelRates, loaded: true };
      return cachedState;
    } catch {
      cachedState = { imageModelRates: {}, videoModelRates: {}, loaded: true };
      return cachedState;
    } finally {
      inflightPromise = null;
    }
  })();

  return inflightPromise;
}

export function useCanvasPricing(): CanvasPricingState {
  const [state, setState] = useState<CanvasPricingState>(
    cachedState || { imageModelRates: {}, videoModelRates: {}, loaded: false },
  );

  useEffect(() => {
    if (cachedState) {
      setState(cachedState);
      return;
    }
    let alive = true;
    void fetchPricing().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

// --- Cost computation helpers ---

export interface CostLabelInput {
  kind: 'image' | 'video';
  model: string;
  outputCount?: number;       // for image
  durationSec?: number;       // for video
}

export interface CostLabelOutput {
  /** Display string. Empty when rate unknown (then caller hides the chip). */
  label: string;
  /** Numeric amount (V points). 0 when not predictable (e.g. Seedance). */
  amount: number;
  /** True when this is a usage-based billing (e.g. Seedance). */
  usageBased: boolean;
}

export function computeCanvasCostLabel(
  input: CostLabelInput,
  pricing: CanvasPricingState,
  i18n?: { vPoints?: string; usageBased?: string },
): CostLabelOutput {
  const vp = i18n?.vPoints || 'V点';
  const usageBasedText = i18n?.usageBased || '按量付费';

  if (input.kind === 'video' && isSeedance(input.model)) {
    return { label: usageBasedText, amount: 0, usageBased: true };
  }

  const rates = input.kind === 'image' ? pricing.imageModelRates : pricing.videoModelRates;
  const rate = Number(rates[input.model] || 0);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { label: '', amount: 0, usageBased: false };
  }

  const units = input.kind === 'image'
    ? Math.max(1, Number(input.outputCount || 1))
    : Math.max(1, Number(input.durationSec || 0));

  const amount = Math.max(0, roundCreditTenths(rate * units));
  return {
    label: amount > 0 ? `-${formatCreditAmount(amount)} ${vp}` : '',
    amount,
    usageBased: false,
  };
}
