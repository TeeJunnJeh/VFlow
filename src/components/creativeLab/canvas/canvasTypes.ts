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
}

// --- Image Node ---
export interface ImageNodeData extends BaseNodeData {
  kind: 'image';
  imageUrl: string | null;
  assetId: string | null;
  source: 'upload' | 'generated' | 'library';
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

// --- Union ---
export type CanvasNodeData = TextNodeData | ImageNodeData | VideoNodeData | ScriptNodeData | VideoAnalysisNodeData;

// --- Edge Data ---
export interface CanvasEdgeData {
  dataType: 'image' | 'video' | 'text' | 'script';
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
export const VALID_CONNECTIONS: Record<string, string[]> = {
  text: ['video', 'script'],
  image: ['video', 'script'],
  video: ['video'],
  script: ['video'],
  audio: ['video'],
};
