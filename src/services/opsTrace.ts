type TracePayload = {
  trace_type: 'page_load' | 'api_request';
  metric_name: string;
  duration_ms: number;
  route?: string;
  api_path?: string;
  method?: string;
  status_code?: number | null;
  success?: boolean;
  metadata?: Record<string, unknown>;
};

const TRACE_ENDPOINT = '/api/auth/frontend-trace/';
const SLOW_API_THRESHOLD_MS = 1200;
const SLOW_PAGE_THRESHOLD_MS = 1800;

function clampDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
}

function shouldSampleSlowEvent(payload: TracePayload): boolean {
  if (payload.trace_type === 'api_request') {
    return payload.duration_ms >= SLOW_API_THRESHOLD_MS || payload.success === false;
  }
  return payload.duration_ms >= SLOW_PAGE_THRESHOLD_MS;
}

export async function reportFrontendTrace(payload: TracePayload): Promise<void> {
  if (!shouldSampleSlowEvent(payload)) return;

  const body = {
    ...payload,
    duration_ms: clampDuration(payload.duration_ms),
    route: payload.route || window.location.pathname,
    user_agent: navigator.userAgent,
    language: navigator.language,
    ts: new Date().toISOString(),
  };

  try {
    await fetch(TRACE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify(body),
    });
  } catch {
    // Best-effort reporting only.
  }
}

export async function traceApiRequest<T>(opts: {
  metricName: string;
  apiPath: string;
  method: string;
  fn: () => Promise<T>;
}): Promise<T> {
  const startedAt = performance.now();
  let statusCode: number | null = null;

  try {
    const result = await opts.fn();
    const elapsed = performance.now() - startedAt;
    await reportFrontendTrace({
      trace_type: 'api_request',
      metric_name: opts.metricName,
      duration_ms: elapsed,
      api_path: opts.apiPath,
      method: opts.method,
      status_code: statusCode,
      success: true,
    });
    return result;
  } catch (error) {
    const elapsed = performance.now() - startedAt;
    const maybeStatus = (error as { status?: unknown })?.status;
    statusCode = typeof maybeStatus === 'number' ? maybeStatus : null;
    await reportFrontendTrace({
      trace_type: 'api_request',
      metric_name: opts.metricName,
      duration_ms: elapsed,
      api_path: opts.apiPath,
      method: opts.method,
      status_code: statusCode,
      success: false,
      metadata: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export function setupPageLoadTrace(): void {
  const onLoaded = async () => {
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    let duration = 0;
    if (navEntry) {
      duration = navEntry.loadEventEnd > 0
        ? navEntry.loadEventEnd - navEntry.startTime
        : navEntry.domContentLoadedEventEnd - navEntry.startTime;
    } else {
      duration = performance.now();
    }

    await reportFrontendTrace({
      trace_type: 'page_load',
      metric_name: 'initial_page_load',
      duration_ms: duration,
      route: window.location.pathname,
      success: true,
      metadata: {
        dom_ready_state: document.readyState,
      },
    });
  };

  if (document.readyState === 'complete') {
    void onLoaded();
    return;
  }

  window.addEventListener('load', () => {
    void onLoaded();
  }, { once: true });
}
