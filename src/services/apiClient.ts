// src/services/apiClient.ts
// 统一 HTTP 客户端 —— 所有 service 层通过此模块发请求
// 功能：自动附加 CSRF token / credentials / 统一错误解析

import { ApiError, parseApiError } from './errors';

// ─── CSRF Cookie 读取（全局复用，不再在各 service 中重复） ───

export function getCookie(name: string): string | null {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === name + '=') {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

// ─── 请求配置类型 ───

export interface ApiRequestOptions {
  /** 请求方法，默认 GET */
  method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

  /** 请求体（会自动 JSON.stringify，除非是 FormData） */
  body?: unknown;

  /** 额外请求头（会与默认头合并） */
  headers?: Record<string, string>;

  /** 请求失败时的兜底错误信息 */
  fallbackMessage?: string;

  /**
   * 如果为 true，response.ok 为 false 时不抛 ApiError，
   * 而是原样返回 Response（适用于如 getRechargeStatus 这种需要自行处理的场景）
   */
  rawOnError?: boolean;

  /** fetch 的额外选项（如 keepalive） */
  fetchOptions?: Partial<RequestInit>;
}

// ─── 核心请求函数 ───

/**
 * 统一 API 请求函数
 *
 * 自动处理：
 * 1. CSRF token（POST/PUT/PATCH/DELETE 自动附加）
 * 2. credentials: 'include'
 * 3. Content-Type + X-Requested-With 头
 * 4. 非 2xx 响应自动解析为 ApiError 并抛出
 * 5. 401/403 检测（可被全局错误边界捕获）
 *
 * @returns 解析后的 JSON 对象
 */
export async function apiRequest<T = any>(
  url: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    headers: extraHeaders = {},
    fallbackMessage = 'Request failed',
    rawOnError = false,
    fetchOptions = {},
  } = options;

  // 构建请求头
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    ...extraHeaders,
  };

  // 需要 CSRF token 的方法
  const needsCsrf = method !== 'GET' && method !== 'HEAD';
  if (needsCsrf) {
    const csrftoken = getCookie('csrftoken');
    if (csrftoken) {
      headers['X-CSRFToken'] = csrftoken;
    }
  }

  // 序列化 body
  let serializedBody: BodyInit | undefined;
  if (body instanceof FormData) {
    serializedBody = body;
    // FormData 不需要设置 Content-Type，浏览器会自动添加 boundary
  } else if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    serializedBody = JSON.stringify(body);
  } else {
    // GET 请求也设置 Content-Type 以兼容现有后端行为
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  // 如果 extraHeaders 中有 Accept，保留；否则默认 JSON
  if (!headers['Accept'] && !(body instanceof FormData)) {
    headers['Accept'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: serializedBody,
    ...fetchOptions,
  });

  // 成功路径
  if (response.ok) {
    // 某些 DELETE 接口可能没有 body
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      return (await response.json()) as T;
    }
    // 非 JSON 成功响应，返回 null（让调用方处理）
    return null as T;
  }

  // 失败路径：如果调用方要求原始处理，直接返回（这只用于极少数场景）
  if (rawOnError) {
    return response as unknown as T;
  }

  // 统一解析错误并抛出
  throw await parseApiError(response, fallbackMessage);
}
