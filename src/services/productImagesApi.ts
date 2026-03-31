/**
 * 商品图片生成API服务
 */

import type {
  FirstFrameParams,
  ProductImageGenerationRequest,
  GenerationCreateResponse,
  GenerationStatusResponse,
  ProductImageResult,
} from '../types/productImages';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

/**
 * 上传文件到FormData
 */
function filesToFormData(
  files: File[],
  generationType: string,
  parameters: Record<string, any>
): FormData {
  const formData = new FormData();
  
  files.forEach((file) => {
    formData.append('images', file);
  });
  
  formData.append('generation_type', generationType);
  formData.append('parameters', JSON.stringify(parameters));
  
  return formData;
}

/**
 * 错误转换
 */
async function handleApiError(response: Response): Promise<Error> {
  try {
    const data = await response.json();
    return new Error(data.error?.message || `API Error: ${response.status}`);
  } catch {
    return new Error(`API Error: ${response.status}`);
  }
}

/**
 * 商品图片生成API
 */
export const productImagesApi = {
  /**
   * 生成首帧图
   */
  async generateFirstFrame(
    images: File[],
    params: FirstFrameParams,
    projectId?: string
  ): Promise<GenerationCreateResponse> {
    const formData = filesToFormData(
      images,
      'first_frame_image',
      params
    );

    if (projectId) {
      formData.append('project_id', projectId);
    }

    const response = await fetch(`${API_BASE}/product-images/generate`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
      },
    });

    if (!response.ok) {
      throw await handleApiError(response);
    }

    return response.json();
  },

  /**
   * 查询生成状态
   */
  async getGenerationStatus(taskId: string): Promise<GenerationStatusResponse> {
    const response = await fetch(`${API_BASE}/product-images/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
      },
    });

    if (!response.ok) {
      throw await handleApiError(response);
    }

    return response.json();
  },

  /**
   * 下载单张结果
   */
  async downloadImage(taskId: string, imageId: string): Promise<Blob> {
    const response = await fetch(
      `${API_BASE}/product-images/${taskId}/download/${imageId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
      }
    );

    if (!response.ok) {
      throw await handleApiError(response);
    }

    return response.blob();
  },

  /**
   * 下载所有结果（ZIP）
   */
  async downloadAllResults(taskId: string): Promise<Blob> {
    const response = await fetch(`${API_BASE}/product-images/${taskId}/download`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
      },
    });

    if (!response.ok) {
      throw await handleApiError(response);
    }

    return response.blob();
  },

  /**
   * 取消生成任务
   */
  async cancelGeneration(taskId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/product-images/${taskId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
      },
    });

    if (!response.ok) {
      throw await handleApiError(response);
    }
  },

  /**
   * 提交质量反馈
   */
  async submitFeedback(
    taskId: string,
    score: number,
    notes?: string
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/product-images/${taskId}/feedback`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        score,
        notes,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw await handleApiError(response);
    }
  },
};

/**
 * 工具函数：生成图片下载链接
 */
export function getDownloadUrl(taskId: string, imageId?: string): string {
  if (imageId) {
    return `${API_BASE}/product-images/${taskId}/download/${imageId}`;
  }
  return `${API_BASE}/product-images/${taskId}/download`;
}

/**
 * 工具函数：轮询任务状态
 */
export async function pollTaskStatus(
  taskId: string,
  maxAttempts: number = 120,
  intervalMs: number = 1000,
  onProgress?: (status: GenerationStatusResponse) => void
): Promise<GenerationStatusResponse> {
  let attempts = 0;

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      attempts++;

      try {
        const status = await productImagesApi.getGenerationStatus(taskId);

        if (onProgress) {
          onProgress(status);
        }

        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(interval);
          resolve(status);
        }

        if (attempts >= maxAttempts) {
          clearInterval(interval);
          reject(new Error('Task polling timeout'));
        }
      } catch (error) {
        clearInterval(interval);
        reject(error);
      }
    }, intervalMs);
  });
}

/**
 * 工具函数：下载文件
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
