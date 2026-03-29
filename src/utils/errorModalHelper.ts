// src/utils/errorModalHelper.ts
// 将 ApiError 映射到 ErrorModal 的 props，供 WorkbenchView 使用
// 按 week5.pdf 要求：清晰主次、用户友好提示、重试/反馈引导

import { ApiError } from '../services/errors';

/* ─── 错误类别 ─── */
export type ErrorCategory =
  | 'generation_failed'   // 视频/图片生成失败
  | 'script_failed'       // 脚本生成失败
  | 'parse_failed'        // 数据解析失败
  | 'recognize_failed'    // AI 识别失败
  | 'upload_failed'       // 上传/发布失败
  | 'network_error'       // 网络异常
  | 'auth_error'          // 认证/授权失败
  | 'unknown_error';      // 未知错误

/* ─── ErrorModal 需要的结构化数据 ─── */
export interface ErrorModalData {
  title: string;
  code?: string;
  message: string;
  details?: string;
  suggestions: string[];
  trackingId?: string;
  actions: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
    /** 内部标记：此按钮是"反馈问题"，ErrorModal 会拦截并展开反馈面板 */
    _feedback?: boolean;
  }>;
}

/* ─── 国际化文本接口（从 t 对象中取） ─── */
export interface ErrorI18n {
  // 标题
  err_title_generation: string;
  err_title_script: string;
  err_title_parse: string;
  err_title_recognize: string;
  err_title_upload: string;
  err_title_network: string;
  err_title_auth: string;
  err_title_unknown: string;
  // 用户友好消息
  err_msg_generation: string;
  err_msg_script: string;
  err_msg_parse: string;
  err_msg_recognize: string;
  err_msg_upload: string;
  err_msg_network: string;
  err_msg_auth: string;
  err_msg_unknown: string;
  // 建议
  err_sug_retry: string;
  err_sug_check_network: string;
  err_sug_check_params: string;
  err_sug_relogin: string;
  err_sug_contact_support: string;
  err_sug_try_later: string;
  err_sug_manual_fill: string;
  // 按钮
  err_btn_retry: string;
  err_btn_feedback: string;
}

/* ─── 默认中文文本（fallback） ─── */
const DEFAULT_I18N: ErrorI18n = {
  err_title_generation: '生成失败',
  err_title_script: '脚本生成失败',
  err_title_parse: '数据解析失败',
  err_title_recognize: '识别失败',
  err_title_upload: '上传失败',
  err_title_network: '网络异常',
  err_title_auth: '认证失败',
  err_title_unknown: '操作异常',

  err_msg_generation: '视频生成过程中遇到问题，请稍后重试。',
  err_msg_script: '脚本生成过程中遇到问题，请检查参数后重试。',
  err_msg_parse: '当前内容暂时无法解析，请重试或检查输入格式。',
  err_msg_recognize: '识别失败，请重试或手动填写商品信息。',
  err_msg_upload: '内容上传过程中遇到问题，请稍后重试。',
  err_msg_network: '网络连接异常，请检查网络后重试。',
  err_msg_auth: '登录状态已过期，请重新登录后再试。',
  err_msg_unknown: '当前操作遇到异常，请稍后重试。',

  err_sug_retry: '点击"重试"再次尝试',
  err_sug_check_network: '请检查网络连接是否正常',
  err_sug_check_params: '请检查输入参数是否正确',
  err_sug_relogin: '请尝试退出后重新登录',
  err_sug_contact_support: '如问题持续，请点击"反馈问题"联系我们',
  err_sug_try_later: '请稍后再试',
  err_sug_manual_fill: '可尝试手动填写信息',

  err_btn_retry: '重试',
  err_btn_feedback: '反馈问题',
};

/* ─── 自动推断错误类别 ─── */
function inferCategory(err: unknown, category?: ErrorCategory): ErrorCategory {
  if (category) return category;

  if (err instanceof ApiError) {
    // 网络 / fetch 失败
    if (err.status === 0 || err.message?.toLowerCase().includes('network')
      || err.message?.toLowerCase().includes('fetch')) {
      return 'network_error';
    }
    // 认证失败
    if (err.status === 401 || err.status === 403
      || err.errorCode?.includes('AUTH')
      || err.errorCode?.includes('PERMISSION')
      || err.errorCode?.includes('TOKEN')) {
      return 'auth_error';
    }
    // 脚本相关
    if (err.errorCode?.includes('SCRIPT')) return 'script_failed';
    // 生成相关
    if (err.errorCode?.includes('GENERATION') || err.errorCode?.includes('VIDEO')) {
      return 'generation_failed';
    }
  }

  // 一般的 Error
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
      return 'network_error';
    }
    if (msg.includes('json') || msg.includes('parse')) return 'parse_failed';
  }

  return 'unknown_error';
}

/* ─── 根据类别获取标题 ─── */
function getTitle(cat: ErrorCategory, i18n: ErrorI18n): string {
  const map: Record<ErrorCategory, string> = {
    generation_failed: i18n.err_title_generation,
    script_failed: i18n.err_title_script,
    parse_failed: i18n.err_title_parse,
    recognize_failed: i18n.err_title_recognize,
    upload_failed: i18n.err_title_upload,
    network_error: i18n.err_title_network,
    auth_error: i18n.err_title_auth,
    unknown_error: i18n.err_title_unknown,
  };
  return map[cat];
}

/* ─── 根据类别获取用户友好消息 ─── */
function getUserMessage(cat: ErrorCategory, i18n: ErrorI18n): string {
  const map: Record<ErrorCategory, string> = {
    generation_failed: i18n.err_msg_generation,
    script_failed: i18n.err_msg_script,
    parse_failed: i18n.err_msg_parse,
    recognize_failed: i18n.err_msg_recognize,
    upload_failed: i18n.err_msg_upload,
    network_error: i18n.err_msg_network,
    auth_error: i18n.err_msg_auth,
    unknown_error: i18n.err_msg_unknown,
  };
  return map[cat];
}

/* ─── 根据类别获取建议列表 ─── */
function getSuggestions(cat: ErrorCategory, i18n: ErrorI18n): string[] {
  switch (cat) {
    case 'generation_failed':
      return [i18n.err_sug_retry, i18n.err_sug_check_params, i18n.err_sug_contact_support];
    case 'script_failed':
      return [i18n.err_sug_retry, i18n.err_sug_check_params, i18n.err_sug_contact_support];
    case 'parse_failed':
      return [i18n.err_sug_retry, i18n.err_sug_check_params, i18n.err_sug_contact_support];
    case 'recognize_failed':
      return [i18n.err_sug_retry, i18n.err_sug_manual_fill, i18n.err_sug_contact_support];
    case 'upload_failed':
      return [i18n.err_sug_retry, i18n.err_sug_check_network, i18n.err_sug_contact_support];
    case 'network_error':
      return [i18n.err_sug_check_network, i18n.err_sug_try_later, i18n.err_sug_contact_support];
    case 'auth_error':
      return [i18n.err_sug_relogin, i18n.err_sug_contact_support];
    case 'unknown_error':
    default:
      return [i18n.err_sug_retry, i18n.err_sug_try_later, i18n.err_sug_contact_support];
  }
}

/* ─── 构建技术详情（折叠区域） ─── */
function buildDetails(err: unknown): string | undefined {
  if (err instanceof ApiError) {
    const lines: string[] = [];
    if (err.status) lines.push(`HTTP ${err.status}`);
    if (err.errorCode) lines.push(`Error Code: ${err.errorCode}`);
    if (err.trackingId) lines.push(`Tracking ID: ${err.trackingId}`);
    // 原始 message 作为技术细节，仅当它与通用提示不同时
    if (err.message) lines.push(`Detail: ${err.message}`);
    return lines.length > 0 ? lines.join('\n') : undefined;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return undefined;
}

/* ─── 主函数：构建 ErrorModal 数据 ─── */
export interface BuildErrorModalOptions {
  /** 错误对象 */
  error: unknown;
  /** 显式指定错误类别（可选，不传则自动推断） */
  category?: ErrorCategory;
  /** 重试回调（不传则不显示重试按钮） */
  onRetry?: () => void;
  /** 国际化文本，从 t 中提取；不传则使用中文默认 */
  i18n?: Partial<ErrorI18n>;
  /** 覆盖用户友好消息（某些场景有更精确的文本） */
  messageOverride?: string;
}

export function buildErrorModalData(opts: BuildErrorModalOptions): ErrorModalData {
  const i18n: ErrorI18n = { ...DEFAULT_I18N, ...opts.i18n };
  const cat = inferCategory(opts.error, opts.category);

  const title = getTitle(cat, i18n);
  const message = opts.messageOverride || getUserMessage(cat, i18n);
  const suggestions = getSuggestions(cat, i18n);
  const details = buildDetails(opts.error);

  const code = opts.error instanceof ApiError ? opts.error.errorCode : undefined;
  const trackingId = opts.error instanceof ApiError ? opts.error.trackingId : undefined;

  const actions: ErrorModalData['actions'] = [];

  // 重试按钮（如果提供了回调）
  if (opts.onRetry) {
    actions.push({
      label: i18n.err_btn_retry,
      onClick: opts.onRetry,
      variant: 'primary',
    });
  }

  // 反馈问题按钮（始终提供）
  // _feedback 标记让 ErrorModal 拦截 onClick，展开反馈引导面板而非跳转
  actions.push({
    label: i18n.err_btn_feedback,
    onClick: () => { /* ErrorModal 会拦截此按钮，展开反馈面板 */ },
    variant: 'secondary',
    _feedback: true,
  });

  return { title, code, message, details, suggestions, trackingId, actions };
}
