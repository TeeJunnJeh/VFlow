export const FIRST_FRAME_TO_VIDEO_TRANSFER_KEY = 'vflow_first_frame_to_video_transfer_v1';

export type FirstFrameVideoTargetModel = 'kling' | 'seedance2.5';

export interface FirstFrameToVideoTransferPayload {
  source: 'first_frame_result_to_video';
  imageUrl: string;
  imageName: string;
  targetModel: FirstFrameVideoTargetModel;
  timestamp: string;
  workspaceId?: string;
}

export function writeFirstFrameToVideoTransfer(payload: FirstFrameToVideoTransferPayload) {
  window.localStorage.setItem(FIRST_FRAME_TO_VIDEO_TRANSFER_KEY, JSON.stringify(payload));
}

export function readFirstFrameToVideoTransfer(): FirstFrameToVideoTransferPayload | null {
  const raw = window.localStorage.getItem(FIRST_FRAME_TO_VIDEO_TRANSFER_KEY);
  if (!raw) return null;

  const parsed = JSON.parse(raw) as Partial<FirstFrameToVideoTransferPayload>;
  const imageUrl = String(parsed.imageUrl || '').trim();
  const rawTargetModel = String(parsed.targetModel || '');
  const targetModel = rawTargetModel === 'seedance2.0' || rawTargetModel === 'seedance2.5'
    ? 'seedance2.5'
    : rawTargetModel === 'kling' ? 'kling' : null;
  if (parsed.source !== 'first_frame_result_to_video' || !imageUrl || !targetModel) {
    return null;
  }

  return {
    source: 'first_frame_result_to_video',
    imageUrl,
    imageName: String(parsed.imageName || 'AI First Frame').trim() || 'AI First Frame',
    targetModel,
    timestamp: String(parsed.timestamp || new Date().toISOString()),
    workspaceId: parsed.workspaceId ? String(parsed.workspaceId) : undefined,
  };
}

export function clearFirstFrameToVideoTransfer() {
  window.localStorage.removeItem(FIRST_FRAME_TO_VIDEO_TRANSFER_KEY);
}
