// src/services/errors.ts
// 统一 API 错误类 —— 前端所有 service 层抛出的 HTTP 错误都走这个类型

/**
 * 后端统一返回的 action_required 结构
 * 用于告诉前端：这个错误需要用户做什么（充值、确认图片调整等）
 */
export type ApiActionRequired = {
  type?: string;
  prompt?: string;
  request_flag?: string | null;
} | null;

/**
 * 统一 API 错误类
 *
 * 字段说明：
 * - status:       HTTP 状态码 (401, 403, 500…)
 * - errorCode:    后端 error_code 字符串 (如 "CREDITS_INSUFFICIENT", "SYSTEM_ERROR")
 * - trackingId:   后端分配的追踪 ID，方便用户反馈定位问题
 * - data:         后端返回的 data 字段（可选）
 * - actionRequired: 后端要求前端引导用户执行的动作
 */
export class ApiError extends Error {
  status: number;
  errorCode?: string;
  trackingId?: string;
  data?: Record<string, unknown> | null;
  actionRequired?: ApiActionRequired;

  constructor(
    message: string,
    opts: {
      status: number;
      errorCode?: string;
      trackingId?: string;
      data?: Record<string, unknown> | null;
      actionRequired?: ApiActionRequired;
    },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.errorCode = opts.errorCode;
    this.trackingId = opts.trackingId;
    this.data = opts.data;
    this.actionRequired = opts.actionRequired;
  }
}

// ─── 从 Response 中解析出 ApiError 的工具函数 ───

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

/**
 * 从一个非 200 Response 中解析出统一的 ApiError
 *
 * 解析优先级：
 * 1. JSON body 中的 message / error 字段
 * 2. 纯文本 body（截断到 300 字符）
 * 3. fallbackMessage
 */
export async function parseApiError(
  response: Response,
  fallbackMessage: string,
): Promise<ApiError> {
  let message = fallbackMessage;
  let errorCode: string | undefined;
  let trackingId: string | undefined;
  let data: Record<string, unknown> | null = null;
  let actionRequired: ApiActionRequired = null;

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const json: unknown = await response.json();
      const rec = asRecord(json);
      if (rec) {
        // 提取 message
        const msg = rec.message ?? rec.error;
        if (typeof msg === 'string' && msg.trim()) message = msg.trim();

        // 提取 error_code (后端统一错误格式)
        if (typeof rec.error_code === 'string' && rec.error_code.trim()) {
          errorCode = rec.error_code.trim();
        }
        // 兼容旧的 error_type 字段
        if (!errorCode && typeof rec.error_type === 'string' && rec.error_type.trim()) {
          errorCode = rec.error_type.trim();
        }

        // 提取 tracking_id
        if (typeof rec.tracking_id === 'string' && rec.tracking_id.trim()) {
          trackingId = rec.tracking_id.trim();
        }

        // 提取 data 和 action_required
        data = asRecord(rec.data);
        const userMessage = data?.user_error;
        const classification = asRecord(data?.error_classification);
        const classifiedMessage = classification?.user_message ?? classification?.safe_message;
        if (typeof userMessage === 'string' && userMessage.trim()) {
          message = userMessage.trim();
        } else if (typeof classifiedMessage === 'string' && classifiedMessage.trim()) {
          message = classifiedMessage.trim();
        }
        const action = data ? asRecord(data.action_required) : null;
        actionRequired = action as ApiActionRequired;
      }
    } catch {
      // JSON 解析失败，尝试文本
    }
  }

  // 如果 JSON 没解出有意义的 message，尝试文本
  if (message === fallbackMessage) {
    try {
      const text = await response.text();
      const compact = text.replace(/\s+/g, ' ').trim();
      if (compact) message = compact.slice(0, 300);
    } catch {
      // 忽略
    }
  }

  return new ApiError(message, {
    status: response.status,
    errorCode,
    trackingId,
    data,
    actionRequired,
  });
}

/**
 * 格式化错误信息，供 UI 展示
 *
 * 会附带 Tracking ID（如果有），方便用户截图反馈
 */
export function formatApiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const base = String(err.message || fallback);
    if (err.trackingId) {
      return `${base}\nTracking ID: ${err.trackingId}`;
    }
    return base;
  }
  const raw = (err as any)?.message;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return fallback;
}

/**
 * 从错误中提取 actionRequired，供 UI 根据不同类型展示不同按钮
 */
export function getActionRequired(err: unknown): ApiActionRequired {
  if (err instanceof ApiError) {
    return err.actionRequired || null;
  }
  return null;
}
