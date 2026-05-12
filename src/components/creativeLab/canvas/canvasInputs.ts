/**
 * Path-walk upstream input collector for canvas generation.
 *
 * Semantics (from product spec):
 *  - For each direct incoming edge into `targetId`, walk that single path
 *    upstream independently. Each path may contribute at most 1 text + 1 image.
 *  - Multiple direct paths union their contributions.
 *  - Image nodes are "hard walls": once collected, the walk stops and their
 *    upstream is ignored (even if it would otherwise be in-quota).
 *  - Text nodes are pass-through: after recording text content (if not already
 *    taken on this path), the walk continues one step further up.
 *  - `useAsInput=false` on any node cuts that path immediately (the node is
 *    skipped AND its upstream is no longer walked).
 *  - Cycle protection via a visited set; depth-capped at `maxDepthPerPath`.
 *  - Final result is de-duplicated by `nodeId` (the same node reachable via
 *    multiple paths only contributes once).
 *
 * Other node kinds (video / script / video_analysis) terminate a path silently
 * — they are valid graph nodes but not "input source" nodes.
 */
import type {
  CanvasNode,
  CanvasEdge,
  CanvasNodeData,
  TextNodeData,
  ImageNodeData,
  UploadResourceNodeData,
} from './canvasTypes';

export interface CollectedTextInput {
  nodeId: string;
  content: string;
}

export interface CollectedImageInput {
  nodeId: string;
  imageUrl: string;
  caption?: string;
}

export interface CollectedInputs {
  texts: CollectedTextInput[];
  images: CollectedImageInput[];
}

const DEFAULT_MAX_DEPTH = 8;

/**
 * Returns true when this node should be treated as an active input source.
 * Older snapshots (and explicitly-set `true`) both pass.
 */
function isUseAsInput(data: TextNodeData | ImageNodeData | UploadResourceNodeData): boolean {
  return data.useAsInput !== false; // default true
}

/**
 * Shared decision for an UploadResourceNode: image uploads contribute to
 * downstream prompts (imageUrl + caption, hard-walls the path). Video / audio
 * uploads are stored on the canvas but currently not folded into prompts.
 * Returns `null` when this upload should not contribute.
 */
function uploadAsPromptContribution(
  data: UploadResourceNodeData,
): { kind: 'image'; imageUrl: string; caption?: string } | null {
  if (!isUseAsInput(data)) return null;
  if (data.resourceKind === 'image' && data.imageUrl) {
    return {
      kind: 'image',
      imageUrl: data.imageUrl,
      caption: data.imageCaption?.trim() || undefined,
    };
  }
  // 'video' / 'audio' / unconfigured: not folded into prompt collection (yet).
  return null;
}

export function collectUpstreamInputs(
  targetId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  opts?: { maxDepthPerPath?: number },
): CollectedInputs {
  const maxDepth = opts?.maxDepthPerPath ?? DEFAULT_MAX_DEPTH;
  const nodeById = new Map<string, CanvasNode>(nodes.map((n) => [n.id, n]));

  // Precompute incoming-edge map: target -> source ids
  const incomingMap = new Map<string, string[]>();
  for (const edge of edges) {
    if (!edge.source || !edge.target) continue;
    const arr = incomingMap.get(edge.target) || [];
    arr.push(edge.source);
    incomingMap.set(edge.target, arr);
  }

  // Aggregate results across paths, dedup by nodeId.
  const collectedTexts = new Map<string, CollectedTextInput>();
  const collectedImages = new Map<string, CollectedImageInput>();

  /**
   * Walk a single path. `kindTaken` is per-path (cloned on each branch); the
   * `visited` set is also per-path so different paths can revisit the same node
   * (but each path itself is acyclic).
   */
  function walk(
    nodeId: string,
    kindTaken: { text: boolean; image: boolean },
    visited: Set<string>,
    depth: number,
  ): void {
    if (depth >= maxDepth) return;
    if (visited.has(nodeId)) return;
    const node = nodeById.get(nodeId);
    if (!node) return;
    const data = node.data as CanvasNodeData;

    if (data.kind === 'image') {
      const imgData = data as ImageNodeData;
      if (!isUseAsInput(imgData)) return; // path cut
      if (!kindTaken.image && imgData.imageUrl) {
        collectedImages.set(node.id, {
          nodeId: node.id,
          imageUrl: imgData.imageUrl,
          caption: imgData.inputCaption?.trim() || undefined,
        });
      }
      // Image is a hard wall regardless of whether it was kind-taken.
      return;
    }

    if (data.kind === 'text') {
      const txtData = data as TextNodeData;
      if (!isUseAsInput(txtData)) return; // path cut
      if (!kindTaken.text) {
        const content = (txtData.content || '').trim();
        if (content) {
          collectedTexts.set(node.id, { nodeId: node.id, content });
        }
        // Mark slot taken on THIS path even if content was empty — empty text
        // nodes still consume the text slot on the path (matches the spec's
        // "at most one text per path" rule literally).
      }

      const nextKindTaken = { text: true, image: kindTaken.image };
      const nextVisited = new Set(visited);
      nextVisited.add(node.id);
      const upstreams = incomingMap.get(node.id) || [];
      for (const upId of upstreams) {
        walk(upId, nextKindTaken, nextVisited, depth + 1);
      }
      return;
    }

    if (data.kind === 'upload') {
      // UploadResourceNode has no upstream (`hasTarget=false`), so it always
      // terminates the path. Image-uploads behave like ImageNode (hard wall +
      // caption); video / audio uploads are stored on the node but not yet
      // folded into prompts here.
      const upData = data as UploadResourceNodeData;
      const contrib = uploadAsPromptContribution(upData);
      if (contrib && !kindTaken.image) {
        collectedImages.set(node.id, {
          nodeId: node.id,
          imageUrl: contrib.imageUrl,
          caption: contrib.caption,
        });
      }
      return;
    }

    // video / script / video_analysis / unknown: not an input source
    return;
  }

  const directUpstreams = incomingMap.get(targetId) || [];
  for (const sourceId of directUpstreams) {
    walk(sourceId, { text: false, image: false }, new Set<string>([targetId]), 0);
  }

  return {
    texts: Array.from(collectedTexts.values()),
    images: Array.from(collectedImages.values()),
  };
}

/**
 * Variant used by the SelectionActionBar: each Bar-selected node IS itself a
 * starting point on its own path (not the target). For each start, we visit
 * the start node directly with a fresh per-path `kindTaken`, which means:
 *   - Image starts: record the image, stop (hard wall).
 *   - Text starts: record the text, then walk up (Image hard wall still applies
 *     to any image encountered upstream of the text).
 * This matches "explicit Bar selection → those nodes feed V_new" with the
 * same path semantics as collectUpstreamInputs (which targets an existing V).
 */
export function collectFromStartNodes(
  startIds: string[],
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  opts?: { maxDepthPerPath?: number },
): CollectedInputs {
  const maxDepth = opts?.maxDepthPerPath ?? DEFAULT_MAX_DEPTH;
  const nodeById = new Map<string, CanvasNode>(nodes.map((n) => [n.id, n]));
  const incomingMap = new Map<string, string[]>();
  for (const edge of edges) {
    if (!edge.source || !edge.target) continue;
    const arr = incomingMap.get(edge.target) || [];
    arr.push(edge.source);
    incomingMap.set(edge.target, arr);
  }

  const collectedTexts = new Map<string, CollectedTextInput>();
  const collectedImages = new Map<string, CollectedImageInput>();

  function walk(
    nodeId: string,
    kindTaken: { text: boolean; image: boolean },
    visited: Set<string>,
    depth: number,
  ): void {
    if (depth >= maxDepth) return;
    if (visited.has(nodeId)) return;
    const node = nodeById.get(nodeId);
    if (!node) return;
    const data = node.data as CanvasNodeData;
    if (data.kind === 'image') {
      const imgData = data as ImageNodeData;
      if (!isUseAsInput(imgData)) return;
      if (!kindTaken.image && imgData.imageUrl) {
        collectedImages.set(node.id, {
          nodeId: node.id,
          imageUrl: imgData.imageUrl,
          caption: imgData.inputCaption?.trim() || undefined,
        });
      }
      return; // hard wall
    }
    if (data.kind === 'text') {
      const txtData = data as TextNodeData;
      if (!isUseAsInput(txtData)) return;
      if (!kindTaken.text) {
        const content = (txtData.content || '').trim();
        if (content) collectedTexts.set(node.id, { nodeId: node.id, content });
      }
      const nextKindTaken = { text: true, image: kindTaken.image };
      const nextVisited = new Set(visited);
      nextVisited.add(node.id);
      for (const upId of incomingMap.get(node.id) || []) {
        walk(upId, nextKindTaken, nextVisited, depth + 1);
      }
      return;
    }
    if (data.kind === 'upload') {
      const upData = data as UploadResourceNodeData;
      const contrib = uploadAsPromptContribution(upData);
      if (contrib && !kindTaken.image) {
        collectedImages.set(node.id, {
          nodeId: node.id,
          imageUrl: contrib.imageUrl,
          caption: contrib.caption,
        });
      }
      return;
    }
    // script / video / video_analysis at start: ignore
    return;
  }

  for (const id of startIds) {
    walk(id, { text: false, image: false }, new Set<string>(), 0);
  }

  return {
    texts: Array.from(collectedTexts.values()),
    images: Array.from(collectedImages.values()),
  };
}

/**
 * Helper used by every generation entry point: merge a node's own prompt with
 * collected upstream text + image-caption contributions.
 * Returns trimmed string suitable for direct prompt submission.
 */
export function buildEffectivePrompt(
  ownPrompt: string | undefined,
  collected: CollectedInputs,
  options?: { captionFormat?: (caption: string) => string },
): string {
  const fmt =
    options?.captionFormat || ((c: string) => `[Reference: ${c}]`);
  const parts: string[] = [];
  const own = (ownPrompt || '').trim();
  if (own) parts.push(own);
  for (const t of collected.texts) {
    if (t.content) parts.push(t.content);
  }
  for (const img of collected.images) {
    if (img.caption) parts.push(fmt(img.caption));
  }
  return parts.join('\n\n');
}

/**
 * Merge a node's own reference-image list with image URLs collected upstream.
 * Preserves order: own refs first, then upstream additions; dedups by URL.
 */
export function mergeReferenceImagePaths(
  ownPaths: string[] | undefined,
  collected: CollectedInputs,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of ownPaths || []) {
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  for (const img of collected.images) {
    if (img.imageUrl && !seen.has(img.imageUrl)) {
      seen.add(img.imageUrl);
      out.push(img.imageUrl);
    }
  }
  return out;
}
