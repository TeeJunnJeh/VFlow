export const TIKTOK_AUTH_POPUP_WINDOW_NAME = 'vflow_tiktok_auth_popup';
export const TIKTOK_AUTH_RESULT_STORAGE_KEY = 'vflow:tiktok-auth-result';
export const TIKTOK_AUTH_COMPLETE_EVENT = 'vflow:tiktok-auth-complete';

export type TikTokAuthResult = {
  status: 'success' | 'error';
  message: string;
  ts: number;
};

type TikTokAuthPopupCopy = {
  loadingTitle: string;
  loadingDescription: string;
};

const escapeHtml = (value: string) => (
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
);

const buildPopupHtml = ({ loadingTitle, loadingDescription }: TikTokAuthPopupCopy) => {
  const title = escapeHtml(loadingTitle);
  const description = escapeHtml(loadingDescription);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background:
          radial-gradient(circle at top, rgba(251, 146, 60, 0.18), transparent 36%),
          linear-gradient(180deg, #111111 0%, #050505 100%);
        color: #f4f4f5;
      }
      main {
        width: min(460px, calc(100vw - 48px));
        padding: 32px 28px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 24px;
        background: rgba(24, 24, 27, 0.82);
        backdrop-filter: blur(18px);
        box-shadow: 0 20px 80px rgba(0, 0, 0, 0.35);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(251, 146, 60, 0.12);
        color: #fdba74;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: currentColor;
        animation: pulse 1.2s ease-in-out infinite;
      }
      h1 {
        margin: 18px 0 10px;
        font-size: 24px;
        line-height: 1.2;
      }
      p {
        margin: 0;
        color: rgba(244, 244, 245, 0.72);
        font-size: 14px;
        line-height: 1.6;
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.35; transform: scale(0.92); }
        50% { opacity: 1; transform: scale(1); }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="badge">
        <span class="dot"></span>
        VFlow
      </div>
      <h1>${title}</h1>
      <p>${description}</p>
    </main>
  </body>
</html>`;
};

export const isTikTokAuthPopupWindow = () => (
  typeof window !== 'undefined' && window.name === TIKTOK_AUTH_POPUP_WINDOW_NAME
);

export const openTikTokAuthPopup = (copy: TikTokAuthPopupCopy): Window | null => {
  if (typeof window === 'undefined') return null;

  const popup = window.open('', TIKTOK_AUTH_POPUP_WINDOW_NAME);
  if (!popup) return null;

  try {
    popup.document.open();
    popup.document.write(buildPopupHtml(copy));
    popup.document.close();
  } catch {
    // Ignore document write failures; we'll still try to navigate this window later.
  }

  try {
    popup.focus();
    window.focus();
  } catch {
    // Ignore focus failures.
  }

  return popup;
};

export const navigateTikTokAuthPopup = (popup: Window | null, authUrl: string): Window | null => {
  if (typeof window === 'undefined') return null;

  const target = popup && !popup.closed
    ? popup
    : window.open('', TIKTOK_AUTH_POPUP_WINDOW_NAME);

  if (!target) return null;

  try {
    target.location.href = authUrl;
    target.focus();
    return target;
  } catch {
    return null;
  }
};

export const closeTikTokAuthPopup = (popup: Window | null | undefined) => {
  if (!popup || popup.closed) return;
  try {
    popup.close();
  } catch {
    // Ignore close failures.
  }
};

export const emitTikTokAuthComplete = (result: TikTokAuthResult) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<TikTokAuthResult>(TIKTOK_AUTH_COMPLETE_EVENT, {
    detail: result,
  }));
};

export const broadcastTikTokAuthResult = (result: TikTokAuthResult) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TIKTOK_AUTH_RESULT_STORAGE_KEY, JSON.stringify(result));
  } catch {
    // Ignore storage failures; the popup flow will just skip parent sync.
  }
};

export const parseTikTokAuthResult = (raw: string | null | undefined): TikTokAuthResult | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<TikTokAuthResult>;
    if (parsed?.status !== 'success' && parsed?.status !== 'error') return null;
    return {
      status: parsed.status,
      message: typeof parsed.message === 'string' ? parsed.message : '',
      ts: typeof parsed.ts === 'number' ? parsed.ts : Date.now(),
    };
  } catch {
    return null;
  }
};
