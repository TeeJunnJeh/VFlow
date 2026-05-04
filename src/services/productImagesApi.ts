import { getCookie } from './apiClient';
import { parseApiError } from './errors';
import type {
  FirstFrameParams,
  FirstFrameModel,
  FirstFrameOpeningScene,
  GenerationStatusResponse,
  ProductImageResult,
  SmartRepairAspectRatio,
  SmartRepairModel,
  SmartRepairParams,
  SmartRepairPendingItem,
  SmartRepairPollResult,
  SmartRepairPollStatus,
  SmartRepairStrength,
  SmartRepairSubmission,
  SmartRepairSubmissionItem,
  SmartRepairSubpage,
  SmartRepairToolCode,
  ClothingSwapParams,
  ClothingSwapResult,
  ClothingSwapBackground,
  ClothingSwapVideoResult,
} from '../types/productImages';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const PROJECTS_API_BASE = `${API_BASE}/projects`;
const ASSETS_API_BASE = '/api/assets';

function isApiDebugEnabled(): boolean {
  const isDev = Boolean((import.meta as any)?.env?.DEV);
  if (isDev) return true;
  if (typeof window === 'undefined') return false;
  const flag = String(window.localStorage.getItem('vflow_api_debug') || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
}

function debugApiLog(label: string, payload: Record<string, unknown>): void {
  if (!isApiDebugEnabled()) return;
  // Keep logs structured so browser console can inspect payloads easily.
  console.log(`[API DEBUG] ${label}`, payload);
}

function toDisplayUrl(pathOrUrl: string): string {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  const mediaBaseUrl = import.meta.env.VITE_MEDIA_BASE_URL || '';
  if (mediaBaseUrl && normalized.startsWith('/media/')) {
    return `${mediaBaseUrl}${normalized}`;
  }
  return normalized;
}

function styleToModel(style?: FirstFrameParams['style']): string {
  if (style === 'studio') return 'gpt-image-1.5';
  if (style === 'clean') return 'flux-2-flex';
  return 'nano-banana-pro';
}

const FIRST_FRAME_MODELS: FirstFrameModel[] = ['nano-banana-pro', 'flux-2-pro', 'flux-2-flex', 'gpt-image-2', 'gpt-image-1.5'];
const NANO_BANANA_FIRST_FRAME_MODEL: FirstFrameModel = 'nano-banana-pro';

function resolveFirstFrameModel(params: FirstFrameParams): FirstFrameModel {
  const selected = String(params.model || '').trim() as FirstFrameModel;
  if (FIRST_FRAME_MODELS.includes(selected)) {
    return selected;
  }

  return styleToModel(params.style) as FirstFrameModel;
}

function smartRepairStrengthToHint(strength?: SmartRepairParams['strength']): string {
  if (strength === 'light') return 'Preserve structure and details, only minimal local fixes.';
  if (strength === 'strong') return 'Allow stronger correction while keeping product identity recognizable.';
  return 'Balance repair quality and content consistency.';
}

async function uploadTempImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${ASSETS_API_BASE}/temp-upload/`, {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken') || '',
      'X-Requested-With': 'XMLHttpRequest',
    },
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to upload reference image');
  }

  const data = await response.json();
  const path =
    String(data?.data?.path || '').trim() ||
    String(data?.data?.url || '').trim() ||
    String(data?.url || '').trim();

  if (!path) {
    throw new Error('Temporary upload succeeded but no path was returned');
  }

  return path;
}

async function generateFirstFrameOnce(options: {
  referenceImagePaths: string[];
  aspectRatio?: string;
  projectId?: string;
  model: string;
  prompt?: string;
  openingScene?: string;
  category?: string;
  personType?: string;
  holdingStyle?: string;
  textWhitespace?: string;
  workspaceId?: string;
  workspaceOrder?: number;
  clientHistoryId?: string;
}): Promise<{ imagePath: string; projectId?: string }> {
  const payload: Record<string, unknown> = {
    reference_image_paths: options.referenceImagePaths,
    aspect_ratio: options.aspectRatio || '9:16',
    frame_type: 'first',
    model: options.model,
    prompt_override: options.prompt,
    opening_scene: options.openingScene,
    category: options.category,
    person_type: options.personType,
    holding_style: options.holdingStyle,
    text_whitespace: options.textWhitespace,
  };

  if (options.projectId) {
    payload.project_id = options.projectId;
  }
  if (options.workspaceId) {
    payload.workspace_id = options.workspaceId;
  }
  if (Number.isFinite(options.workspaceOrder)) {
    payload.workspace_order = options.workspaceOrder;
  }
  if (options.clientHistoryId) {
    payload.client_history_id = options.clientHistoryId;
  }

  const endpoint = `${PROJECTS_API_BASE}/generate_first_frame`;
  debugApiLog('request generate_first_frame', {
    endpoint,
    method: 'POST',
    payload,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCookie('csrftoken') || '',
      'X-Requested-With': 'XMLHttpRequest',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const responseClone = response.clone();

  let debugResponseBody: unknown = null;
  try {
    debugResponseBody = await responseClone.json();
  } catch {
    debugResponseBody = { nonJson: true };
  }
  debugApiLog('response generate_first_frame', {
    endpoint,
    status: response.status,
    ok: response.ok,
    body: debugResponseBody,
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to generate first-frame image');
  }

  const data = await response.json();
  const asyncRequests = Array.isArray(data?.data?.requests) ? data.data.requests : [];
  if (data?.data?.async && asyncRequests.length > 0) {
    const error = new Error('Async first-frame response returned from sync helper') as Error & { asyncData?: any };
    error.asyncData = data;
    throw error;
  }
  const imagePath = String(data?.data?.first_frame_path || '').trim();

  if (!imagePath) {
    throw new Error('Generation succeeded but first_frame_path was missing');
  }

  const projectId = String(data?.data?.project_id || '').trim() || undefined;
  return { imagePath, projectId };
}

async function createFirstFrameAsync(options: {
  referenceImagePaths: string[];
  aspectRatio?: string;
  projectId?: string;
  model: string;
  prompt?: string;
  openingScene?: string;
  category?: string;
  personType?: string;
  holdingStyle?: string;
  textWhitespace?: string;
  outputCount: number;
  workspaceId?: string;
  workspaceOrder?: number;
  clientHistoryId?: string;
}): Promise<GenerationStatusResponse> {
  const payload: Record<string, unknown> = {
    reference_image_paths: options.referenceImagePaths,
    aspect_ratio: options.aspectRatio || '9:16',
    frame_type: 'first',
    model: options.model,
    prompt_override: options.prompt,
    opening_scene: options.openingScene,
    category: options.category,
    person_type: options.personType,
    holding_style: options.holdingStyle,
    text_whitespace: options.textWhitespace,
    output_count: options.outputCount,
  };

  if (options.projectId) payload.project_id = options.projectId;
  if (options.workspaceId) payload.workspace_id = options.workspaceId;
  if (Number.isFinite(options.workspaceOrder)) payload.workspace_order = options.workspaceOrder;
  if (options.clientHistoryId) payload.client_history_id = options.clientHistoryId;

  const endpoint = `${PROJECTS_API_BASE}/generate_first_frame`;
  debugApiLog('request generate_first_frame async', {
    endpoint,
    method: 'POST',
    payload,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCookie('csrftoken') || '',
      'X-Requested-With': 'XMLHttpRequest',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const responseClone = response.clone();

  let debugResponseBody: unknown = null;
  try {
    debugResponseBody = await responseClone.json();
  } catch {
    debugResponseBody = { nonJson: true };
  }
  debugApiLog('response generate_first_frame async', {
    endpoint,
    status: response.status,
    ok: response.ok,
    body: debugResponseBody,
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to create first-frame generation tasks');
  }

  const data = await response.json();
  const rawRequests = Array.isArray(data?.data?.requests) ? data.data.requests : [];
  const requests = rawRequests
    .map((item: any, index: number) => {
      const requestId = String(item?.request_id || item?.requestId || item?.id || '').trim();
      if (!requestId) return null;
      return {
        requestId,
        status: String(item?.status || 'created'),
        outputIndex: Number.isFinite(Number(item?.output_index ?? item?.outputIndex)) ? Number(item?.output_index ?? item?.outputIndex) : index + 1,
        sortOrder: Number.isFinite(Number(item?.sort_order ?? item?.sortOrder)) ? Number(item?.sort_order ?? item?.sortOrder) : index,
        frameRole: String(item?.frame_role || item?.frameRole || ''),
        role: String(item?.role || ''),
      };
    })
    .filter(Boolean) as NonNullable<GenerationStatusResponse['requests']>;

  if (requests.length === 0) {
    throw new Error('Generation task creation succeeded but no request_id was returned');
  }

  return {
    id: `first-frame-task-${Date.now()}`,
    status: 'processing',
    progress: 2,
    isAsync: true,
    requests,
    projectId: String(data?.data?.project_id || '').trim() || undefined,
    historyRecordId: String(data?.data?.history_record_id || '').trim() || undefined,
  };
}

export const productImagesApi = {
  async generateFirstFrame(
    images: File[],
    params: FirstFrameParams,
    projectId?: string,
    workspaceMeta?: { workspaceId?: string; workspaceOrder?: number }
  ): Promise<GenerationStatusResponse> {
    if (!images || images.length === 0) {
      throw new Error('Please upload at least one product image');
    }

    const outputCount = params.outputCount || 1;
    const model = resolveFirstFrameModel(params);
    const referenceImagePaths = await Promise.all(images.map((image) => uploadTempImage(image)));
    const clientHistoryId =
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `first-frame-batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

    let resolvedProjectId = projectId;
    const outputImages: ProductImageResult[] = [];

    if (model === NANO_BANANA_FIRST_FRAME_MODEL) {
      return createFirstFrameAsync({
        referenceImagePaths,
        aspectRatio: params.aspectRatio,
        projectId: resolvedProjectId,
        model,
        prompt: params.prompt,
        openingScene: params.openingScene,
        category: params.category,
        personType: params.personType,
        holdingStyle: params.holdingStyle,
        textWhitespace: params.textWhitespace,
        outputCount,
        workspaceId: workspaceMeta?.workspaceId,
        workspaceOrder: workspaceMeta?.workspaceOrder,
        clientHistoryId,
      });
    }

    for (let i = 0; i < outputCount; i += 1) {
      const generated = await generateFirstFrameOnce({
        referenceImagePaths,
        aspectRatio: params.aspectRatio,
        projectId: resolvedProjectId,
        model,
        prompt: params.prompt,
        openingScene: params.openingScene,
        category: params.category,
        personType: params.personType,
        holdingStyle: params.holdingStyle,
        textWhitespace: params.textWhitespace,
        workspaceId: workspaceMeta?.workspaceId,
        workspaceOrder: workspaceMeta?.workspaceOrder,
        clientHistoryId,
      });

      if (!resolvedProjectId && generated.projectId) {
        resolvedProjectId = generated.projectId;
      }

      const displayUrl = toDisplayUrl(generated.imagePath);
      outputImages.push({
        id: `first-frame-${Date.now()}-${i}`,
        imageUrl: displayUrl,
        downloadUrl: displayUrl,
        format: 'jpg',
        generationStatus: 'succeeded',
      });
    }

    return {
      id: `first-frame-task-${Date.now()}`,
      status: 'completed',
      progress: 100,
      outputImages,
      completedAt: new Date().toISOString(),
    };
  },

  async getFirstFrameResult(requestId: string): Promise<{
    requestId: string;
    status: string;
    imageUrl: string;
    error: string;
    metadata?: Record<string, any>;
  }> {
    const id = String(requestId || '').trim();
    if (!id) throw new Error('requestId is required');

    const endpoint = `${PROJECTS_API_BASE}/generate_first_frame_result?request_id=${encodeURIComponent(id)}`;
    debugApiLog('request generate_first_frame_result', {
      endpoint,
      method: 'GET',
      requestId: id,
    });

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });
    const responseClone = response.clone();

    let debugResponseBody: unknown = null;
    try {
      debugResponseBody = await responseClone.json();
    } catch {
      debugResponseBody = { nonJson: true };
    }
    debugApiLog('response generate_first_frame_result', {
      endpoint,
      status: response.status,
      ok: response.ok,
      body: debugResponseBody,
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Failed to query first-frame generation result');
    }

    const data = await response.json();
    const payload = data?.data || {};
    return {
      requestId: String(payload?.request_id || id),
      status: String(payload?.status || ''),
      imageUrl: toDisplayUrl(String(payload?.image_url || payload?.first_frame_path || '').trim()),
      error: String(payload?.error || ''),
      metadata: {
        ...(payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}),
        historyRecordId: String(payload?.history_record_id || '').trim() || undefined,
        historyAssetId: String(payload?.asset_id || '').trim() || undefined,
        historyAssetIndex: Number.isFinite(Number(payload?.sort_order)) ? Number(payload.sort_order) : undefined,
      },
    };
  },

  async polishFirstFramePrompt(
    rawPrompt: string,
    openingScene: FirstFrameOpeningScene,
    outputLanguage: string,
  ): Promise<string> {
    const prompt = String(rawPrompt || '').trim();
    if (!prompt) {
      throw new Error('Please provide prompt requirements first');
    }
    const lang = String(outputLanguage || '').trim();
    if (!lang) {
      throw new Error('output_language is required');
    }

    const response = await fetch(`${PROJECTS_API_BASE}/polish_first_frame_image_prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCookie('csrftoken') || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify({
        raw_prompt: prompt,
        opening_scene: openingScene,
        output_language: lang,
      }),
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Failed to polish first-frame prompt');
    }

    const data = await response.json();
    const polished = String(data?.data?.polished_prompt || '').trim();
    if (!polished) {
      throw new Error('Prompt polish succeeded but no prompt text was returned');
    }

    return polished;
  },

  /**
   * 提交智能修复任务（异步）。立刻返回上游 request_id 数组，调用方需自行轮询
   * `getSmartRepairResult` 拿最终结果。所有图片同源在后端做幂等扣费 + 失败退款。
   */
  async submitSmartRepair(
    sourceImage: File,
    params: SmartRepairParams,
    options?: {
      projectId?: string;
      referenceImage?: File;
      clientHistoryId?: string;
    }
  ): Promise<SmartRepairSubmission> {
    if (!sourceImage) {
      throw new Error('Please upload a source image first');
    }

    const prompt = String(params.prompt || '').trim();
    if (!prompt) {
      throw new Error('Please provide repair instructions');
    }

    const sourceImagePath = await uploadTempImage(sourceImage);
    const referenceImagePath = options?.referenceImage ? await uploadTempImage(options.referenceImage) : undefined;

    const payload: Record<string, unknown> = {
      source_image_path: sourceImagePath,
      repair_prompt: prompt,
      strength: params.strength || 'medium',
      strength_hint: smartRepairStrengthToHint(params.strength),
      aspect_ratio: params.aspectRatio || '1:1',
      output_count: params.outputCount || 1,
      subpage: params.subpage || 'product_object',
      tool_code: params.toolCode || 'custom_retouch',
    };
    if (params.model) payload.model = params.model;
    if (options?.projectId) payload.project_id = options.projectId;
    if (referenceImagePath) payload.reference_image_path = referenceImagePath;
    if (options?.clientHistoryId) payload.client_history_id = options.clientHistoryId;

    const response = await fetch(`${PROJECTS_API_BASE}/generate_smart_repair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCookie('csrftoken') || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Failed to submit smart-repair task');
    }

    const data = await response.json();
    const rawRequests = Array.isArray(data?.data?.requests) ? data.data.requests : [];
    const requests: SmartRepairSubmissionItem[] = rawRequests
      .map((row: Record<string, unknown>, index: number): SmartRepairSubmissionItem | null => {
        const requestId = String(row?.request_id || row?.requestId || '').trim();
        if (!requestId) return null;
        const rawStatus = String(row?.status || 'created').trim().toLowerCase() as SmartRepairPollStatus;
        const status: SmartRepairPollStatus = (['created', 'processing', 'succeeded', 'failed'] as SmartRepairPollStatus[])
          .includes(rawStatus)
          ? rawStatus
          : 'created';
        return {
          requestId,
          status,
          sortOrder: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : index,
          role: String(row?.role || 'repair'),
        };
      })
      .filter((it: SmartRepairSubmissionItem | null): it is SmartRepairSubmissionItem => it !== null);

    if (requests.length === 0) {
      throw new Error('Submit succeeded but no request_ids were returned');
    }

    return {
      requests,
      historyRecordId: String(data?.data?.history_record_id || '').trim(),
      cost: Number(data?.data?.cost ?? 0),
      balance: Number(data?.data?.balance ?? 0),
      model: String(data?.data?.model || '').trim(),
    };
  },

  /**
   * 单次轮询智能修复任务状态。
   *  - 未完成 -> { status: 'created' | 'processing', imageUrl: '' }
   *  - 完成 -> { status: 'succeeded', imageUrl: '/media/...' }
   *  - 失败 -> { status: 'failed', error: 'xxx' }
   */
  async getSmartRepairResult(requestId: string): Promise<SmartRepairPollResult> {
    const safeId = String(requestId || '').trim();
    if (!safeId) {
      throw new Error('requestId is required');
    }
    const url = `${PROJECTS_API_BASE}/generate_smart_repair_result?request_id=${encodeURIComponent(safeId)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-CSRFToken': getCookie('csrftoken') || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });
    if (!response.ok) {
      throw await parseApiError(response, 'Failed to query smart-repair status');
    }
    const data = await response.json();
    const inner = data?.data || {};
    const rawStatus = String(inner?.status || 'created').trim().toLowerCase() as SmartRepairPollStatus;
    const status: SmartRepairPollStatus = (['created', 'processing', 'succeeded', 'failed'] as SmartRepairPollStatus[])
      .includes(rawStatus)
      ? rawStatus
      : 'created';
    const outputs = Array.isArray(inner?.outputs)
      ? inner.outputs
          .map((it: unknown) => toDisplayUrl(String(it || '').trim()))
          .filter(Boolean)
      : [];
    const rawImageUrl = String(inner?.image_url || '').trim();
    return {
      requestId: String(inner?.request_id || safeId),
      status,
      imageUrl: rawImageUrl ? toDisplayUrl(rawImageUrl) : '',
      outputs,
      error: String(inner?.error || ''),
      historyRecordId: String(inner?.history_record_id || ''),
      assetId: Number(inner?.asset_id ?? 0),
      sortOrder: Number(inner?.sort_order ?? 0),
    };
  },

  /**
   * 拉取当前用户名下还在 PROCESSING 的智能修复任务，用于挂载页面时 hydrate
   * 任务卡片并恢复轮询。
   */
  async listSmartRepairPending(): Promise<SmartRepairPendingItem[]> {
    const response = await fetch(`${PROJECTS_API_BASE}/smart_repair_pending`, {
      method: 'GET',
      headers: {
        'X-CSRFToken': getCookie('csrftoken') || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });
    if (!response.ok) {
      throw await parseApiError(response, 'Failed to load smart-repair pending tasks');
    }
    const data = await response.json();
    const rawItems = Array.isArray(data?.data?.items) ? data.data.items : [];
    return rawItems
      .map((row: Record<string, unknown>): SmartRepairPendingItem | null => {
        const requestId = String(row?.request_id || '').trim();
        if (!requestId) return null;
        const settings = (row?.settings && typeof row.settings === 'object')
          ? (row.settings as Record<string, unknown>)
          : ({} as Record<string, unknown>);
        const submittedAtMs = (() => {
          const raw = row?.submitted_at;
          if (!raw) return Date.now();
          const t = Date.parse(String(raw));
          return Number.isFinite(t) ? t : Date.now();
        })();
        const aspectRatioRaw = String(settings.aspectRatio || settings.aspect_ratio || '1:1') as SmartRepairAspectRatio;
        const strengthRaw = String(settings.strength || 'medium') as SmartRepairStrength;
        const subpageRaw = String(settings.subpage || 'product_object') as SmartRepairSubpage;
        const toolCodeRaw = String(settings.toolCode || settings.tool_code || 'custom_retouch') as SmartRepairToolCode;
        const outputCountRaw = (() => {
          const n = Number(settings.outputCount || settings.output_count || 1);
          if (n === 2 || n === 3 || n === 4) return n as 1 | 2 | 3 | 4;
          return 1 as 1 | 2 | 3 | 4;
        })();
        const modelRaw = String(settings.model || '').trim();
        const SUPPORTED_MODELS: ReadonlyArray<SmartRepairModel> = ['flux-2-pro', 'flux-2-max', 'flux-2-flex', 'flux-2-dev'];
        const modelNarrowed = (SUPPORTED_MODELS as ReadonlyArray<string>).includes(modelRaw)
          ? (modelRaw as SmartRepairModel)
          : undefined;
        return {
          requestId,
          historyRecordId: String(row?.history_record_id || '').trim(),
          assetId: Number(row?.asset_id ?? 0),
          sortOrder: Number(row?.sort_order ?? 0),
          role: String(row?.role || 'repair'),
          submittedAt: submittedAtMs,
          settings: {
            prompt: String(settings.prompt || ''),
            aspectRatio: aspectRatioRaw,
            strength: strengthRaw,
            outputCount: outputCountRaw,
            subpage: subpageRaw,
            toolCode: toolCodeRaw,
            sourceImagePath: String(settings.sourceImagePath || settings.source_image_path || ''),
            referenceImagePath: String(settings.referenceImagePath || settings.reference_image_path || ''),
            model: modelNarrowed,
          },
        };
      })
      .filter((it: SmartRepairPendingItem | null): it is SmartRepairPendingItem => it !== null);
  },

  async generateClothingSwap(
    modelImage: File,
    garmentImage: File,
    params: ClothingSwapParams,
    options?: {
      projectId?: string;
      workspaceId?: string;
      clientHistoryId?: string;
    }
  ): Promise<ClothingSwapResult> {
    if (!modelImage) {
      throw new Error('Please upload a model image first');
    }
    if (!garmentImage) {
      throw new Error('Please upload a garment image first');
    }

    const [modelImagePath, garmentImagePath] = await Promise.all([
      uploadTempImage(modelImage),
      uploadTempImage(garmentImage),
    ]);

    const payload: Record<string, unknown> = {
      model_image_path: modelImagePath,
      garment_image_path: garmentImagePath,
      category: params.category || 'Top',
      target_color: params.targetColor || 'Original',
      background: params.background || 'model',
      aspect_ratio: params.aspectRatio || '1:1',
      output_count: params.outputCount || 1,
    };
    if (options?.projectId) payload.project_id = options.projectId;
    if (options?.workspaceId) payload.workspace_id = options.workspaceId;
    if (options?.clientHistoryId) payload.client_history_id = options.clientHistoryId;

    const response = await fetch(`${PROJECTS_API_BASE}/generate_clothing_swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCookie('csrftoken') || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Failed to generate clothing-swap image');
    }

    const data = await response.json();
    const rawUrls = Array.isArray(data?.data?.image_urls) ? data.data.image_urls : [];
    const primaryUrl = String(data?.data?.image_url || rawUrls[0] || '').trim();
    if (!primaryUrl && rawUrls.length === 0) {
      throw new Error('Generation succeeded but image_url was missing');
    }

    const displayUrls = (rawUrls.length > 0 ? rawUrls : [primaryUrl])
      .map((u: unknown) => toDisplayUrl(String(u || '').trim()))
      .filter(Boolean);
    const displayPrimary = displayUrls[0] || toDisplayUrl(primaryUrl);

    const outputImages: ProductImageResult[] = displayUrls.map((url: string, index: number) => ({
      id: `clothing-swap-${Date.now()}-${index}`,
      imageUrl: url,
      downloadUrl: url,
      format: 'png',
    }));

    return {
      imageUrl: displayPrimary,
      imageUrls: displayUrls,
      downloadUrl: displayPrimary,
      outputImages,
      feedback: String(data?.data?.feedback || '').trim(),
      taskId: data?.data?.task_id,
      projectId: String(data?.data?.project_id || '').trim() || undefined,
      cost: typeof data?.data?.cost === 'number' ? data.data.cost : undefined,
      balance: typeof data?.data?.balance === 'number' ? data.data.balance : undefined,
      model: String(data?.data?.model || '').trim() || undefined,
    };
  },

  async generateClothingSwapVideo(
    imageUrl: string,
    background: ClothingSwapBackground,
    options?: { signal?: AbortSignal }
  ): Promise<ClothingSwapVideoResult> {
    const payload: Record<string, unknown> = {
      image_url: imageUrl,
      background,
    };
    const response = await fetch(`${PROJECTS_API_BASE}/generate_clothing_swap_video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCookie('csrftoken') || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      signal: options?.signal,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw await parseApiError(response, 'Failed to generate clothing-swap video');
    }
    const data = await response.json();
    const videoUrl = String(data?.data?.video_url || '').trim();
    if (!videoUrl) {
      throw new Error('Video generation succeeded but video_url was missing');
    }
    return { videoUrl, background };
  },

  async downloadImageByUrl(imageUrl: string): Promise<Blob> {
    const displayUrl = toDisplayUrl(imageUrl);

    let shouldProxy = false;
    try {
      const resolved = new URL(displayUrl, window.location.href);
      shouldProxy = resolved.origin !== window.location.origin;
    } catch {
      shouldProxy = false;
    }

    const fetchUrl = shouldProxy
      ? `${PROJECTS_API_BASE}/proxy_download?url=${encodeURIComponent(displayUrl)}`
      : displayUrl;

    const response = await fetch(fetchUrl, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw await parseApiError(response, 'Failed to download image');
    }

    return response.blob();
  },
};

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
