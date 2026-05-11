/**
 * Canvas → Gallery cross-view bridge.
 *
 * When the user selects an ImageNode on the canvas and clicks "Open in Gallery",
 * we stash the source image URL here. ImagesGalleryView reads it on mount and
 * pre-fills its initial model image slot, then clears the bridge.
 *
 * 60s TTL guards against stale values (e.g. user closes Gallery without ever
 * visiting it, then opens it days later).
 */

const KEY = 'vflow_canvas_to_gallery_transfer';
const TTL_MS = 60_000;

export interface CanvasToGalleryPayload {
  productImageUrl: string;
  fromNodeId: string;
  ts: number;
}

export const setCanvasToGalleryTransfer = (payload: Omit<CanvasToGalleryPayload, 'ts'>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...payload, ts: Date.now() }));
  } catch {
    // Quota / SecurityError — ignore; the worst case is the bridge silently no-ops.
  }
};

export const readCanvasToGalleryTransfer = (): CanvasToGalleryPayload | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CanvasToGalleryPayload;
    if (!parsed || typeof parsed.productImageUrl !== 'string' || !parsed.productImageUrl) {
      return null;
    }
    if (Date.now() - (parsed.ts || 0) > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const clearCanvasToGalleryTransfer = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};
