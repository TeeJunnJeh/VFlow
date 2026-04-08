import { getCookie } from './apiClient';
import { parseApiError } from './errors';
import type {
  FirstFrameParams,
  FirstFrameModel,
  GenerationStatusResponse,
  ProductImageResult,
  SmartRepairParams,
} from '../types/productImages';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const PROJECTS_API_BASE = `${API_BASE}/projects`;
const ASSETS_API_BASE = '/api/assets';

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
  return 'flux-2-pro';
}

const FIRST_FRAME_MODELS: FirstFrameModel[] = ['flux-2-pro', 'flux-2-flex', 'gpt-image-1.5'];

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
  referenceImagePath: string;
  aspectRatio?: string;
  projectId?: string;
  model: string;
  workspaceId?: string;
  workspaceOrder?: number;
  clientHistoryId?: string;
}): Promise<{ imagePath: string; projectId?: string }> {
  const payload: Record<string, unknown> = {
    reference_image_path: options.referenceImagePath,
    aspect_ratio: options.aspectRatio || '9:16',
    frame_type: 'first',
    model: options.model,
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

  const response = await fetch(`${PROJECTS_API_BASE}/generate_first_frame`, {
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
    throw await parseApiError(response, 'Failed to generate first-frame image');
  }

  const data = await response.json();
  const imagePath = String(data?.data?.first_frame_path || '').trim();

  if (!imagePath) {
    throw new Error('Generation succeeded but first_frame_path was missing');
  }

  const projectId = String(data?.data?.project_id || '').trim() || undefined;
  return { imagePath, projectId };
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
    const referenceImagePath = await uploadTempImage(images[0]);
    const clientHistoryId =
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `first-frame-batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

    let resolvedProjectId = projectId;
    const outputImages: ProductImageResult[] = [];

    for (let i = 0; i < outputCount; i += 1) {
      const generated = await generateFirstFrameOnce({
        referenceImagePath,
        aspectRatio: params.aspectRatio,
        projectId: resolvedProjectId,
        model,
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

  async generateSmartRepair(
    sourceImage: File,
    params: SmartRepairParams,
    projectId?: string,
    referenceImage?: File
  ): Promise<GenerationStatusResponse> {
    if (!sourceImage) {
      throw new Error('Please upload a source image first');
    }

    const prompt = String(params.prompt || '').trim();
    if (!prompt) {
      throw new Error('Please provide repair instructions');
    }

    const sourceImagePath = await uploadTempImage(sourceImage);
    const referenceImagePath = referenceImage ? await uploadTempImage(referenceImage) : undefined;

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

    if (projectId) {
      payload.project_id = projectId;
    }
    if (referenceImagePath) {
      payload.reference_image_path = referenceImagePath;
    }

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
      throw await parseApiError(response, 'Failed to generate smart-repair image');
    }

    const data = await response.json();
    const imageUrls = Array.isArray(data?.data?.image_urls)
      ? data.data.image_urls.map((it: unknown) => String(it || '').trim()).filter(Boolean)
      : [];

    const fallbackSingle = String(data?.data?.image_url || '').trim();
    const resolved = imageUrls.length > 0 ? imageUrls : (fallbackSingle ? [fallbackSingle] : []);

    if (resolved.length === 0) {
      throw new Error('Generation succeeded but image_url was missing');
    }

    const outputImages: ProductImageResult[] = resolved.map((url: string, index: number) => {
      const displayUrl = toDisplayUrl(url);
      return {
        id: `smart-repair-${Date.now()}-${index}`,
        imageUrl: displayUrl,
        downloadUrl: displayUrl,
        format: 'png',
      };
    });

    return {
      id: `smart-repair-task-${Date.now()}`,
      status: 'completed',
      progress: 100,
      outputImages,
      completedAt: new Date().toISOString(),
    };
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
