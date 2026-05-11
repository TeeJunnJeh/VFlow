/**
 * Image generation handlers shared by all ImageNode modes.
 *
 * Each `run*` function follows the same contract:
 *   - Reads the relevant fields off `data: ImageNodeData`
 *   - Marks the node `running`, clears prior outputs
 *   - Submits to `productImagesApi.*` and writes back the result(s)
 *   - Persists `pendingRequestIds` so that `hydratePending()` can resume polling
 *     after a page refresh or view switch
 *
 * Multi-output handling: parallel polls would clobber each other if each call
 * to `updateNodeData({outputs: [...]})` overwrote the array (the underlying
 * canvasStore does shallow merge). We work around this by re-reading the
 * current outputs from the store inside each poll callback via
 * `useCanvasStore.getState()`, then appending and writing back.
 *
 * Failure mode: each handler catches its own errors and writes `{ status: 'failed',
 * error }` to the node. They do NOT throw, so callers don't need try/catch.
 */
import { productImagesApi } from '../../../../../services/productImagesApi';
import { useCanvasStore } from '../../canvasStore';
import type {
  ImageNodeData,
  ImageNodeOutput,
} from '../../canvasTypes';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ImageGenDeps {
  updateNodeData: (nodeId: string, partial: Partial<ImageNodeData>) => void;
}

const POLL_INTERVAL_SHORT_MS = 1500;
const POLL_INTERVAL_LONG_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Outputs merge — re-read current outputs from store, splice in by sortOrder,
// then write back. Survives parallel polls without race-stomping.
// ---------------------------------------------------------------------------

function mergeOutputAndMarkComplete(
  nodeId: string,
  sortOrder: number,
  newOutput: ImageNodeOutput,
  expectedTotal: number,
  deps: ImageGenDeps,
): void {
  const state = useCanvasStore.getState();
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const data = node.data as ImageNodeData;
  const currentOutputs = Array.isArray(data.outputs) ? [...data.outputs] : [];
  currentOutputs[sortOrder] = newOutput;
  const filled = currentOutputs.filter(Boolean) as ImageNodeOutput[];

  const allDone = filled.length >= expectedTotal;
  const primary = filled[0] || newOutput;

  deps.updateNodeData(nodeId, {
    outputs: currentOutputs.map((o) => o || ({ imageUrl: '' } as ImageNodeOutput)).filter((o) => o.imageUrl),
    imageUrl: primary.imageUrl,
    source: 'generated',
    status: allDone ? 'completed' : 'running',
  });
}

// ---------------------------------------------------------------------------
// URL → File helper (FirstFrame / AIRealPerson require File; SmartRepair and
// ClothingSwap accept a server path discriminator).
// ---------------------------------------------------------------------------

async function urlToFile(url: string, suggestedName?: string): Promise<File> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch image ${url}`);
  const blob = await resp.blob();
  const ext = (blob.type.split('/')[1] || 'jpg').replace('+xml', '');
  const name = suggestedName || `canvas_${Date.now()}.${ext}`;
  return new File([blob], name, { type: blob.type });
}

function isServerPath(url: string): boolean {
  return url.startsWith('/media/') || /^https?:/.test(url);
}

// ---------------------------------------------------------------------------
// SmartRepair — async
// ---------------------------------------------------------------------------

async function pollSmartRepair(
  requestId: string,
  nodeId: string,
  sortOrder: number,
  expectedTotal: number,
  deps: ImageGenDeps,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_SHORT_MS));
    try {
      const result = await productImagesApi.getSmartRepairResult(requestId);
      const status = String(result.status || '').toLowerCase();
      if (status === 'succeeded' || status === 'success') {
        mergeOutputAndMarkComplete(nodeId, sortOrder, {
          imageUrl: result.imageUrl,
          assetId: result.assetId ? String(result.assetId) : null,
          metadata: { sortOrder },
        }, expectedTotal, deps);
        return;
      }
      if (status === 'failed' || status === 'error') {
        deps.updateNodeData(nodeId, {
          status: 'failed',
          error: result.error || 'Smart repair failed',
        });
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Poll error';
      deps.updateNodeData(nodeId, { status: 'failed', error: msg });
      return;
    }
  }
  deps.updateNodeData(nodeId, { status: 'failed', error: 'Smart repair poll timeout' });
}

export async function runSmartRepair(
  nodeId: string,
  data: ImageNodeData,
  deps: ImageGenDeps,
): Promise<void> {
  if (!data.smartRepairSourceUrl) {
    deps.updateNodeData(nodeId, { status: 'failed', error: 'Source image required' });
    return;
  }
  if (!data.smartRepairPrompt || !data.smartRepairPrompt.trim()) {
    deps.updateNodeData(nodeId, { status: 'failed', error: 'Repair instructions required' });
    return;
  }

  deps.updateNodeData(nodeId, {
    status: 'running',
    error: undefined,
    outputs: [],
    pendingRequestIds: [],
  });

  try {
    const sourceUrl = data.smartRepairSourceUrl;
    let submission;
    if (isServerPath(sourceUrl)) {
      submission = await productImagesApi.submitSmartRepair(
        null,
        {
          prompt: data.smartRepairPrompt,
          model: data.smartRepairModel || 'flux-2-pro',
          strength: data.smartRepairStrength || 'medium',
          outputCount: data.outputCount || 1,
        },
        { sourceImagePath: sourceUrl },
      );
    } else {
      const file = await urlToFile(sourceUrl, 'smart_repair_source.jpg');
      submission = await productImagesApi.submitSmartRepair(file, {
        prompt: data.smartRepairPrompt,
        model: data.smartRepairModel || 'flux-2-pro',
        strength: data.smartRepairStrength || 'medium',
        outputCount: data.outputCount || 1,
      });
    }

    const reqs = submission.requests;
    const pendingIds = reqs.map((r) => r.requestId);
    deps.updateNodeData(nodeId, { pendingRequestIds: pendingIds });

    reqs.forEach((req, idx) => {
      void pollSmartRepair(req.requestId, nodeId, idx, reqs.length, deps);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Smart repair submit failed';
    deps.updateNodeData(nodeId, { status: 'failed', error: msg });
  }
}

// ---------------------------------------------------------------------------
// ClothingSwap — sync (one round trip, no polling)
// ---------------------------------------------------------------------------

export async function runClothingSwap(
  nodeId: string,
  data: ImageNodeData,
  deps: ImageGenDeps,
): Promise<void> {
  if (!data.clothingSwapModelUrl) {
    deps.updateNodeData(nodeId, { status: 'failed', error: 'Model image required' });
    return;
  }
  if (!data.clothingSwapGarmentUrl) {
    deps.updateNodeData(nodeId, { status: 'failed', error: 'Garment image required' });
    return;
  }

  deps.updateNodeData(nodeId, {
    status: 'running',
    error: undefined,
    outputs: [],
  });

  try {
    const modelInput = isServerPath(data.clothingSwapModelUrl)
      ? { path: data.clothingSwapModelUrl }
      : await urlToFile(data.clothingSwapModelUrl, 'cs_model.jpg');
    const garmentInput = isServerPath(data.clothingSwapGarmentUrl)
      ? { path: data.clothingSwapGarmentUrl }
      : await urlToFile(data.clothingSwapGarmentUrl, 'cs_garment.jpg');

    const categoryRaw = data.clothingSwapCategory || 'top';
    // Backend's ClothingSwapCategory = 'Top' | 'Bottom' | 'Full Body'.
    const category = (categoryRaw === 'full_body'
      ? 'Full Body'
      : (categoryRaw.charAt(0).toUpperCase() + categoryRaw.slice(1))) as 'Top' | 'Bottom' | 'Full Body';

    const result = await productImagesApi.generateClothingSwap(
      modelInput,
      garmentInput,
      {
        category,
        targetColor: 'Original',
        background: 'model',
        aspectRatio: '1:1',
        outputCount: data.outputCount || 1,
      },
    );

    const outputs: ImageNodeOutput[] = (result.outputImages || []).map((img) => ({
      imageUrl: img.imageUrl,
      assetId: null,
      metadata: { downloadUrl: img.downloadUrl },
    }));

    deps.updateNodeData(nodeId, {
      status: 'completed',
      imageUrl: result.imageUrl,
      source: 'generated',
      outputs: outputs.length > 0 ? outputs : [{ imageUrl: result.imageUrl }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Clothing swap failed';
    deps.updateNodeData(nodeId, { status: 'failed', error: msg });
  }
}

// ---------------------------------------------------------------------------
// AIModel — async (virtual or real-person mode)
// ---------------------------------------------------------------------------

async function pollAIModel(
  requestId: string,
  nodeId: string,
  sortOrder: number,
  expectedTotal: number,
  deps: ImageGenDeps,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_SHORT_MS));
    try {
      const result = await productImagesApi.getAIModelResult(requestId);
      const status = String(result.status || '').toLowerCase();
      if (status === 'succeeded' || status === 'success') {
        mergeOutputAndMarkComplete(nodeId, sortOrder, {
          imageUrl: result.imageUrl,
          assetId: result.assetId ? String(result.assetId) : null,
          metadata: { sortOrder },
        }, expectedTotal, deps);
        return;
      }
      if (status === 'failed' || status === 'error') {
        deps.updateNodeData(nodeId, { status: 'failed', error: result.error || 'AI Model failed' });
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Poll error';
      deps.updateNodeData(nodeId, { status: 'failed', error: msg });
      return;
    }
  }
  deps.updateNodeData(nodeId, { status: 'failed', error: 'AI Model poll timeout' });
}

export async function runAIModel(
  nodeId: string,
  data: ImageNodeData,
  deps: ImageGenDeps,
): Promise<void> {
  const mode = data.aiModelMode || 'virtual';
  deps.updateNodeData(nodeId, {
    status: 'running',
    error: undefined,
    outputs: [],
    pendingRequestIds: [],
  });

  try {
    let submission;
    if (mode === 'virtual') {
      const prompt = (data.aiModelPrompt || '').trim();
      if (!prompt) {
        deps.updateNodeData(nodeId, { status: 'failed', error: 'Prompt required' });
        return;
      }
      submission = await productImagesApi.submitAIModel({
        prompt,
        gender: data.aiModelGender || 'no_limit',
        style: data.aiModelStyle || 'commercial',
        outputCount: data.outputCount || 1,
        aspectRatio: '3:4',
      });
    } else {
      if (!data.aiModelRealSourceUrl) {
        deps.updateNodeData(nodeId, { status: 'failed', error: 'Real person image required' });
        return;
      }
      if (!data.aiModelRealBrief || !data.aiModelRealBrief.trim()) {
        deps.updateNodeData(nodeId, { status: 'failed', error: 'Edit brief required' });
        return;
      }
      const realFile = await urlToFile(data.aiModelRealSourceUrl, 'ai_real_person.jpg');
      submission = await productImagesApi.submitAIRealPerson({
        image: realFile,
        prompt: data.aiModelRealBrief,
        outputCount: data.outputCount || 1,
        aspectRatio: '3:4',
        bodyFraming: 'full_body',
      });
    }

    const reqs = submission.requests;
    const pendingIds = reqs.map((r) => r.requestId);
    deps.updateNodeData(nodeId, { pendingRequestIds: pendingIds });

    reqs.forEach((req, idx) => {
      void pollAIModel(req.requestId, nodeId, idx, reqs.length, deps);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI Model submit failed';
    deps.updateNodeData(nodeId, { status: 'failed', error: msg });
  }
}

// ---------------------------------------------------------------------------
// FirstFrame — async (Nano Banana branch) or sync (Flux/GPT). We treat both
// the same way: poll for each request_id and merge.
// ---------------------------------------------------------------------------

async function pollFirstFrame(
  requestId: string,
  nodeId: string,
  sortOrder: number,
  expectedTotal: number,
  deps: ImageGenDeps,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_LONG_MS));
    try {
      const result = await productImagesApi.getFirstFrameResult(requestId);
      const status = String(result.status || '').toUpperCase();
      if (status === 'SUCCESS' || status === 'SUCCEEDED' || status === 'COMPLETED') {
        mergeOutputAndMarkComplete(nodeId, sortOrder, {
          imageUrl: result.imageUrl,
          assetId: result.metadata?.historyAssetId || null,
          metadata: { sortOrder },
        }, expectedTotal, deps);
        return;
      }
      if (status === 'FAILED' || status === 'ERROR') {
        deps.updateNodeData(nodeId, { status: 'failed', error: result.error || 'First frame generation failed' });
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Poll error';
      deps.updateNodeData(nodeId, { status: 'failed', error: msg });
      return;
    }
  }
  deps.updateNodeData(nodeId, { status: 'failed', error: 'First frame poll timeout' });
}

export async function runFirstFrame(
  nodeId: string,
  data: ImageNodeData,
  deps: ImageGenDeps,
): Promise<void> {
  const refs = data.firstFrameReferenceUrls || [];
  if (refs.length === 0) {
    deps.updateNodeData(nodeId, { status: 'failed', error: 'At least one reference product image is required' });
    return;
  }
  if (!data.firstFramePrompt || !data.firstFramePrompt.trim()) {
    deps.updateNodeData(nodeId, { status: 'failed', error: 'Prompt required' });
    return;
  }

  deps.updateNodeData(nodeId, {
    status: 'running',
    error: undefined,
    outputs: [],
    pendingRequestIds: [],
  });

  try {
    const files = await Promise.all(refs.map((url, idx) => urlToFile(url, `firstframe_ref_${idx}.jpg`)));
    const submission = await productImagesApi.generateFirstFrame(files, {
      prompt: data.firstFramePrompt,
      model: data.firstFrameModel || 'nano-banana-pro',
      aspectRatio: '9:16',
      outputCount: data.outputCount || 1,
    } as Parameters<typeof productImagesApi.generateFirstFrame>[1]);

    const reqs = submission?.requests || [];
    if (reqs.length === 0) {
      deps.updateNodeData(nodeId, { status: 'failed', error: 'No request IDs returned' });
      return;
    }

    const pendingIds = reqs.map((r) => r.requestId);
    deps.updateNodeData(nodeId, { pendingRequestIds: pendingIds });

    reqs.forEach((req, idx) => {
      void pollFirstFrame(req.requestId, nodeId, idx, reqs.length, deps);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'First frame submit failed';
    deps.updateNodeData(nodeId, { status: 'failed', error: msg });
  }
}

// ---------------------------------------------------------------------------
// Hydrate — resume polling for pendingRequestIds after a page refresh.
// ---------------------------------------------------------------------------

export function hydratePending(
  nodeId: string,
  data: ImageNodeData,
  deps: ImageGenDeps,
): void {
  const pending = data.pendingRequestIds || [];
  if (pending.length === 0) return;
  const mode = data.mode || 'upload';
  pending.forEach((reqId, idx) => {
    if (mode === 'smart_repair') void pollSmartRepair(reqId, nodeId, idx, pending.length, deps);
    else if (mode === 'ai_model') void pollAIModel(reqId, nodeId, idx, pending.length, deps);
    else if (mode === 'first_frame') void pollFirstFrame(reqId, nodeId, idx, pending.length, deps);
  });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function runGeneration(
  nodeId: string,
  data: ImageNodeData,
  deps: ImageGenDeps,
): Promise<void> {
  switch (data.mode || 'upload') {
    case 'first_frame':
      return runFirstFrame(nodeId, data, deps);
    case 'smart_repair':
      return runSmartRepair(nodeId, data, deps);
    case 'clothing_swap':
      return runClothingSwap(nodeId, data, deps);
    case 'ai_model':
      return runAIModel(nodeId, data, deps);
    default:
      // upload mode has no generation
      return Promise.resolve();
  }
}
