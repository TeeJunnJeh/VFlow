import type { Node, Edge, Viewport } from '@xyflow/react';

// --- Node Status ---
export type NodeStatus = 'idle' | 'running' | 'completed' | 'failed';

// --- Base Node Data ---
// Index signature satisfies @xyflow/react v12's `Node<TData extends Record<string, unknown>>`.
interface BaseNodeData {
  label: string;
  status: NodeStatus;
  error?: string;
  [key: string]: unknown;
}

// --- Text Node ---
export interface TextNodeData extends BaseNodeData {
  kind: 'text';
  content: string;
  role: 'prompt' | 'note' | 'product_info';
  // When true (default), this node's content flows into downstream prompts via
  // `collectUpstreamInputs` along incoming-edge paths. When false, the node is
  // skipped AND its upstream beyond this point is also pruned (the path is cut
  // here). Older snapshots without this field fall back to `true` at read time.
  useAsInput?: boolean;
}

// --- Image Node ---
// Unified image source on the canvas. `mode` indicates HOW the image came to be.
// Each mode reads only the subset of optional fields it needs; downstream
// consumers always read `imageUrl` / `outputs`. Old ImageNodes (no mode field)
// render as mode='upload' for backward compat.
export type ImageNodeMode =
  | 'upload'
  | 'first_frame'
  | 'smart_repair'
  | 'clothing_swap'
  | 'ai_model';

export type ImageNodeOutput = {
  imageUrl: string;
  assetId?: string | null;
  metadata?: Record<string, unknown>;
};

export interface ImageNodeData extends BaseNodeData {
  kind: 'image';

  // Primary output indirection (downstream consumers read these)
  imageUrl: string | null;
  assetId: string | null;
  source: 'upload' | 'generated' | 'library';

  // Same semantics as TextNodeData.useAsInput — controls whether this image
  // (its url and optional caption) flows into downstream prompts. Default true.
  useAsInput?: boolean;
  // Optional short caption appended to downstream prompt text when this image
  // is collected as input (e.g. "[Reference: 冰丝 T 恤实拍]"). The imageUrl
  // is always passed as a reference path regardless of this field.
  inputCaption?: string;

  // Mode switcher (default 'upload' if absent for backward compat)
  mode?: ImageNodeMode;

  // Multi-output store + async polling reanimation
  outputs?: ImageNodeOutput[];
  pendingRequestIds?: string[];
  outputCount?: 1 | 2 | 3 | 4;

  // -- mode === 'first_frame' --
  firstFramePrompt?: string;
  firstFrameModel?: 'nano-banana-pro' | 'flux-2-pro' | 'gpt-image-1.5';
  firstFrameReferenceUrls?: string[];

  // -- mode === 'smart_repair' --
  smartRepairSourceUrl?: string | null;
  smartRepairPrompt?: string;
  smartRepairModel?: 'nano-banana-pro' | 'flux-2-pro' | 'gpt-image-1.5';
  smartRepairStrength?: 'light' | 'medium' | 'strong';

  // -- mode === 'clothing_swap' --
  clothingSwapModelUrl?: string | null;
  clothingSwapGarmentUrl?: string | null;
  // Matches backend `ClothingSwapCategory` (Top / Bottom / Full Body) but in
  // lowercase + snake; capitalized at call time inside the handler.
  clothingSwapCategory?: 'top' | 'bottom' | 'full_body';

  // -- mode === 'ai_model' --
  aiModelMode?: 'virtual' | 'real';
  aiModelPrompt?: string;
  aiModelGender?: 'female' | 'male' | 'no_limit';
  aiModelStyle?: 'commercial' | 'fashion' | 'lifestyle';
  aiModelRealSourceUrl?: string | null;
  aiModelRealBrief?: string;
}

// --- Video Node ---
export interface VideoNodeData extends BaseNodeData {
  kind: 'video';
  videoUrl: string | null;
  thumbnailUrl: string | null;
  taskId: string | null;
  projectId: string | null;
  prompt: string;
  model: string;
  duration: number;
  aspectRatio: '9:16' | '16:9' | '1:1';
  imageInputPath?: string[];
}

// --- Script Shot ---
export interface ScriptShot {
  shot_index: number;
  type: string;
  duration_sec: number;
  visual: string;
  audio: string;
  voiceover: string;
}

// --- Script Node ---
export interface ScriptNodeData extends BaseNodeData {
  kind: 'script';
  shots: ScriptShot[];
  productCategory: string;
  visualStyle: string;
  aspectRatio: '9:16' | '16:9' | '1:1';
  totalDuration: number;
  shotCount: number;
  sourceImagePaths: string[];
}

// --- Video Analysis Node (Video → Storyboard reverse, LibTV-style) ---
export interface VideoAnalysisNodeData extends BaseNodeData {
  kind: 'video_analysis';
  sourceVideoUrl: string | null;
  sourceVideoPath: string | null;   // server-resolved /media/... path after upload
  extractedScript: string;          // formatted text via formatReplayReverseScript
  seedancePrompt: string;
  styleTags: string[];
}

// --- Upload Resource Node ---
// Pure source — no target handle. Lets users drop in a single image / video /
// audio asset that downstream nodes consume via edges. The user picks the
// resource kind on first use (hover reveals 3 buttons), after which the node
// renders the relevant uploader. Path-walking semantics in `canvasInputs.ts`:
// resourceKind='image' behaves like an ImageNode (hard wall, contributes
// imageUrl + caption); 'video' and 'audio' are stored on the node but not yet
// folded into prompt collection (kept for visual graph + future generators).
export type UploadResourceKind = 'image' | 'video' | 'audio';

export interface UploadResourceNodeData extends BaseNodeData {
  kind: 'upload';
  resourceKind: UploadResourceKind | null;
  useAsInput?: boolean;
  // resourceKind === 'image'
  imageUrl?: string | null;
  imageCaption?: string;
  // resourceKind === 'video'
  videoUrl?: string | null;
  videoName?: string;
  videoDurationSec?: number;
  // resourceKind === 'audio'
  audioUrl?: string | null;
  audioName?: string;
  audioDurationSec?: number;
}

// --- Union ---
export type CanvasNodeData =
  | TextNodeData
  | ImageNodeData
  | VideoNodeData
  | ScriptNodeData
  | VideoAnalysisNodeData
  | UploadResourceNodeData;

// --- Edge Data ---
export interface CanvasEdgeData {
  dataType: 'image' | 'video' | 'text' | 'script' | 'upload';
  [key: string]: unknown;
}

// --- Typed aliases ---
export type CanvasNode = Node<CanvasNodeData>;
export type CanvasEdge = Edge<CanvasEdgeData>;

// --- Snapshot for persistence ---
export interface CanvasSnapshot {
  version: 1;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
  savedAt: string;
}

// --- Connection validation ---
// text/image can chain into each other (text→text, text→image, image→text,
// image→image) so that "upstream prompt collection" walks (see
// `canvasInputs.ts`) can express the V←T←P example. text→image is also
// allowed because image generation modes (first_frame / smart_repair /
// clothing_swap / ai_model) carry their own prompt fields that benefit from
// upstream text context. The new `upload` kind is a pure source that can
// feed any prompt-aware downstream.
export const VALID_CONNECTIONS: Record<string, string[]> = {
  text: ['video', 'script', 'text', 'image'],
  image: ['video', 'script', 'text', 'image'],
  video: ['video'],
  script: ['video'],
  audio: ['video'],
  upload: ['video', 'script', 'text', 'image'],
};
