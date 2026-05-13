import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  SelectionMode,
  type Viewport,
  type OnSelectionChangeParams,
  type NodeMouseHandler,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Wallet } from 'lucide-react';

import { useCanvasStore } from './canvasStore';
import { TextNode } from './nodes/TextNode';
import { ImageNode } from './nodes/ImageNode';
import { VideoNode } from './nodes/VideoNode';
import { ScriptNode } from './nodes/ScriptNode';
import { VideoAnalysisNode } from './nodes/VideoAnalysisNode';
import { UploadResourceNode } from './nodes/UploadResourceNode';
import { DataEdge } from './edges/DataEdge';
import { CanvasToolbar } from './panels/CanvasToolbar';
import { SelectionActionBar } from './panels/SelectionActionBar';
import { ContextMenu, type ContextMenuPosition } from './panels/ContextMenu';
import { MagicComposeDialog } from './panels/MagicComposeDialog';
import { AgentSidebar } from './panels/AgentSidebar';
import { BottomInputPanel } from './panels/BottomInputPanel';
import { runGeneration as runImageGeneration } from './nodes/imageModes/imageGenHandlers';
import type { CanvasAgentAction } from '../../../services/canvasAgent';
import { useLanguage } from '../../../context/LanguageContext';
import { useAuth } from '../../../context/AuthContext';
import { useTasks } from '../../../context/TaskContext';
import { videoApi } from '../../../services/video';
import { assetsApi } from '../../../services/assets';
import { productImagesApi } from '../../../services/productImagesApi';
import { billingApi } from '../../../services/billing';
import { generateScriptForCanvas } from './canvasScriptService';
import { formatCreditAmount } from '../../../utils/credits';
import {
  collectUpstreamInputs,
  collectFromStartNodes,
  buildEffectivePrompt,
  mergeReferenceImagePaths,
} from './canvasInputs';
import type { CanvasSnapshot, CanvasNode, CanvasNodeData, ImageNodeData, VideoNodeData, TextNodeData, ScriptNodeData, VideoAnalysisNodeData } from './canvasTypes';

// Register custom node/edge types
const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  video: VideoNode,
  script: ScriptNode,
  video_analysis: VideoAnalysisNode,
  upload: UploadResourceNode,
};

const edgeTypes = {
  data: DataEdge,
};

// Draft API helpers (reuse existing videoApi pattern)
const API_BASE_URL = '/api/projects';

function getCookie(name: string) {
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

async function loadCanvasFromDraft(): Promise<CanvasSnapshot | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/draft/`, { credentials: 'include' });
    if (!response.ok) return null;
    const json = await response.json();
    return json?.data?.snapshot?.canvas || null;
  } catch {
    return null;
  }
}

async function saveCanvasToDraft(canvas: CanvasSnapshot): Promise<void> {
  let existingSnapshot: Record<string, unknown> = {};
  try {
    const response = await fetch(`${API_BASE_URL}/draft/`, { credentials: 'include' });
    if (response.ok) {
      const json = await response.json();
      existingSnapshot = json?.data?.snapshot || {};
    }
  } catch {
    // ignore
  }

  const mergedSnapshot = { ...existingSnapshot, canvas };

  await fetch(`${API_BASE_URL}/draft/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCookie('csrftoken') || '',
    },
    body: JSON.stringify({ snapshot: mergedSnapshot }),
  });
}

// Node ID generator
let nodeIdCounter = 0;
function nextId() {
  return `node_${Date.now()}_${++nodeIdCounter}`;
}

/** Upload a blob/object URL to the server, return the server path. Non-blob URLs pass through. */
async function resolveImagePath(url: string): Promise<string> {
  if (!url.startsWith('blob:')) return url;
  const resp = await fetch(url);
  const blob = await resp.blob();
  const ext = blob.type.split('/')[1] || 'jpg';
  const file = new File([blob], `canvas_${Date.now()}.${ext}`, { type: blob.type });
  const uploadResp = await assetsApi.uploadTempAsset(file);
  const path = uploadResp?.url || uploadResp?.data?.url || uploadResp?.file_url || uploadResp?.path;
  if (!path) throw new Error('Failed to upload image');
  return path;
}

interface CanvasEditorProps {
  // Optional cross-view navigator (Workbench → setActiveView). Used by
  // SelectionActionBar to launch the Gallery workspace with the canvas's
  // current image preloaded.
  onNavigate?: (view: string) => void;
}

function CanvasEditorInner({ onNavigate }: CanvasEditorProps) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setViewport,
    toSnapshot,
    loadSnapshot,
    markClean,
    isDirty,
    setSelection,
    addNode,
    removeNodes,
    updateNodeData,
  } = useCanvasStore();

  const { t, language } = useLanguage();
  const { user, updateUser } = useAuth();
  const { addTask, tasks } = useTasks();
  const { screenToFlowPosition } = useReactFlow();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refresh balance once on mount so the top-right badge reflects the current
  // backend value (in case the user landed on the canvas without going through
  // Workbench/Billing first). Pricing is already cached by useCanvasPricing,
  // but balance is volatile so we re-fetch every time the canvas opens.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await billingApi.getOverview();
        if (!alive) return;
        // BillingView reads `overview.balance` straight (see BillingView.tsx:170);
        // accept either shape for resilience.
        const nextBalance = Number(
          (res as { balance?: number; data?: { balance?: number } })?.balance
          ?? (res as { data?: { balance?: number } })?.data?.balance
          ?? NaN,
        );
        if (Number.isFinite(nextBalance)) {
          updateUser({ credits: nextBalance });
        }
      } catch {
        // silently skip; badge falls back to local cached credits
      }
    })();
    return () => {
      alive = false;
    };
  }, [updateUser]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    type: 'pane' | 'node';
    nodeId?: string;
    nodeKind?: string;
  } | null>(null);

  // Magic Compose dialog
  const [magicOpen, setMagicOpen] = useState(false);

  // Agent Sidebar
  const [agentOpen, setAgentOpen] = useState(false);

  // Bottom input panel state — driven by single-selection node click
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  // Load canvas state on mount
  useEffect(() => {
    loadCanvasFromDraft().then((snapshot) => {
      if (snapshot) {
        loadSnapshot(snapshot);
      }
      setIsLoaded(true);
      // Clear undo history so user can't undo past the load point
      useCanvasStore.temporal.getState().clear();
    });
  }, [loadSnapshot]);

  // Auto-save with 5s debounce
  useEffect(() => {
    if (!isLoaded || !isDirty) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await saveCanvasToDraft(toSnapshot());
        markClean();
      } catch {
        // silent fail for auto-save
      }
    }, 5000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isDirty, isLoaded, nodes, edges, toSnapshot, markClean]);

  // Manual save
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await saveCanvasToDraft(toSnapshot());
      markClean();
    } catch (err) {
      console.error('Failed to save canvas:', err);
    } finally {
      setIsSaving(false);
    }
  }, [toSnapshot, markClean]);

  const onViewportChange = useCallback(
    (viewport: Viewport) => {
      setViewport(viewport);
    },
    [setViewport]
  );

  // Selection change handler — also drives the bottom panel: 1 node → active,
  // 0 or 2+ → closed. The panel is for single-node configuration; multi-select
  // batch ops still flow through SelectionActionBar.
  const onSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      const selNodes = params.nodes as CanvasNode[];
      setSelection(selNodes, params.edges as unknown as import('./canvasTypes').CanvasEdge[]);
      if (selNodes.length === 1) setActiveNodeId(selNodes[0].id);
      else setActiveNodeId(null);
    },
    [setSelection]
  );

  // Node-click handler — opens the panel even when ReactFlow's selection state
  // is already on this node (re-click should re-open if user closed it).
  const onNodeClick: NodeMouseHandler<CanvasNode> = useCallback((_e, node) => {
    setActiveNodeId(node.id);
  }, []);

  // Click on empty pane → close the panel (still keep selection state alone).
  const onPaneClick = useCallback(() => {
    setActiveNodeId(null);
  }, []);

  // Keyboard shortcuts: Undo/Redo + Delete
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Don't handle shortcuts if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      // Undo: Cmd+Z (Mac) / Ctrl+Z (Win)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        useCanvasStore.temporal.getState().undo();
        return;
      }

      // Redo: Cmd+Shift+Z (Mac) / Ctrl+Shift+Z (Win) / Ctrl+Y
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        useCanvasStore.temporal.getState().redo();
        return;
      }
      if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        useCanvasStore.temporal.getState().redo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = nodes.filter((n) => n.selected).map((n) => n.id);
        if (selected.length > 0) {
          removeNodes(selected);
        }
      }

      // Esc closes the bottom panel without affecting selection.
      if (e.key === 'Escape') {
        setActiveNodeId(null);
      }
    },
    [nodes, removeNodes]
  );

  // Context menu handlers
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      setContextMenu({
        position: { x: event.clientX, y: event.clientY },
        type: 'pane',
      });
    },
    []
  );

  const onNodeContextMenu: NodeMouseHandler<CanvasNode> = useCallback(
    (event, node) => {
      event.preventDefault();
      const data = node.data as CanvasNodeData;
      setContextMenu({
        position: { x: event.clientX, y: event.clientY },
        type: 'node',
        nodeId: node.id,
        nodeKind: data.kind,
      });
    },
    []
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Helper to create node at context menu position
  const createNodeAtMenuPos = useCallback(
    (type: string, data: CanvasNodeData) => {
      if (!contextMenu) return;
      const position = screenToFlowPosition({
        x: contextMenu.position.x,
        y: contextMenu.position.y,
      });
      addNode({ id: nextId(), type, position, data } as CanvasNode);
    },
    [contextMenu, screenToFlowPosition, addNode]
  );

  const handleContextAddText = useCallback(() => {
    createNodeAtMenuPos('text', {
      kind: 'text', label: 'Text', status: 'idle', content: '', role: 'prompt',
    } as TextNodeData);
  }, [createNodeAtMenuPos]);

  const handleContextAddImage = useCallback(() => {
    createNodeAtMenuPos('image', {
      kind: 'image', label: 'Image', status: 'idle', imageUrl: null, assetId: null, source: 'upload',
    } as ImageNodeData);
  }, [createNodeAtMenuPos]);

  const handleContextAddVideo = useCallback(() => {
    createNodeAtMenuPos('video', {
      kind: 'video', label: 'Video', status: 'idle',
      videoUrl: null, thumbnailUrl: null, taskId: null, projectId: null,
      prompt: '', model: 'kling', duration: 5, aspectRatio: '9:16',
    } as VideoNodeData);
  }, [createNodeAtMenuPos]);

  const handleContextAddVideoAnalysis = useCallback(() => {
    createNodeAtMenuPos('video_analysis', {
      kind: 'video_analysis', label: 'Video Analysis', status: 'idle',
      sourceVideoUrl: null, sourceVideoPath: null,
      extractedScript: '', seedancePrompt: '', styleTags: [],
    } as VideoAnalysisNodeData);
  }, [createNodeAtMenuPos]);

  const handleContextAddUpload = useCallback(() => {
    createNodeAtMenuPos('upload', {
      kind: 'upload', label: 'Upload', status: 'idle',
      resourceKind: null,
    } as CanvasNodeData);
  }, [createNodeAtMenuPos]);

  const handleContextDeleteNode = useCallback(() => {
    if (contextMenu?.nodeId) {
      removeNodes([contextMenu.nodeId]);
    }
  }, [contextMenu, removeNodes]);

  const handleContextCopyNode = useCallback(() => {
    if (!contextMenu?.nodeId) return;
    const node = nodes.find((n) => n.id === contextMenu.nodeId);
    if (!node) return;
    addNode({
      ...node,
      id: nextId(),
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      selected: false,
    });
  }, [contextMenu, nodes, addNode]);

  const handleContextGenerateVideo = useCallback(() => {
    if (!contextMenu?.nodeId) return;
    const sourceNode = nodes.find((n) => n.id === contextMenu.nodeId);
    if (!sourceNode) return;

    const pos = { x: sourceNode.position.x + 350, y: sourceNode.position.y };
    const videoData: VideoNodeData = {
      kind: 'video', label: 'Video', status: 'idle',
      videoUrl: null, thumbnailUrl: null, taskId: null, projectId: null,
      prompt: '', model: 'kling', duration: 5, aspectRatio: '9:16',
    };

    // Pre-fill prompt from text node
    if (contextMenu.nodeKind === 'text') {
      const textData = sourceNode.data as TextNodeData;
      videoData.prompt = textData.content;
    }

    const newId = nextId();
    addNode({ id: newId, type: 'video', position: pos, data: videoData } as CanvasNode);

    // Auto-connect source to new video node
    useCanvasStore.getState().onConnect({
      source: contextMenu.nodeId,
      target: newId,
      sourceHandle: null,
      targetHandle: null,
    });
  }, [contextMenu, nodes, addNode]);

  // Context menu: generate script from single node
  const handleContextGenerateScript = useCallback(() => {
    if (!contextMenu?.nodeId) return;
    const sourceNode = nodes.find((n) => n.id === contextMenu.nodeId);
    if (!sourceNode) return;

    const pos = { x: sourceNode.position.x + 350, y: sourceNode.position.y };
    const imgData = sourceNode.data as ImageNodeData;
    const scriptData: ScriptNodeData = {
      kind: 'script', label: 'Script', status: 'idle',
      shots: [], productCategory: '', visualStyle: 'realistic',
      aspectRatio: '16:9', totalDuration: 10, shotCount: 5,
      sourceImagePaths: imgData.imageUrl ? [imgData.imageUrl] : [],
    };

    const newId = nextId();
    addNode({ id: newId, type: 'script', position: pos, data: scriptData } as CanvasNode);

    useCanvasStore.getState().onConnect({
      source: contextMenu.nodeId,
      target: newId,
      sourceHandle: null,
      targetHandle: null,
    });
  }, [contextMenu, nodes, addNode]);

  // Batch generate script: create ScriptNode, connect images, call API
  const handleGenerateScript = useCallback(
    async (
      imageNodes: CanvasNode[],
      textNodes: CanvasNode[],
      config: {
        category: string;
        style: string;
        shotCount: number;
        duration: number;
        aspectRatio: VideoNodeData['aspectRatio'];
        notes: string;
      }
    ) => {
      if (imageNodes.length === 0 && textNodes.length === 0) return;

      // Compute position
      const allNodes = [...imageNodes, ...textNodes];
      let maxX = -Infinity;
      let sumY = 0;
      const imagePaths: string[] = [];
      allNodes.forEach((n) => {
        if (n.position.x > maxX) maxX = n.position.x;
        sumY += n.position.y;
      });
      // Image Bar nodes terminal — collect their imageUrl + caption (toggle-aware).
      const imageCaptionParts: string[] = [];
      imageNodes.forEach((n) => {
        const d = n.data as ImageNodeData;
        if (d.useAsInput === false) return;
        if (d.imageUrl) imagePaths.push(d.imageUrl);
        const cap = d.inputCaption?.trim();
        if (cap) imageCaptionParts.push(`[Reference: ${cap}]`);
      });
      const avgY = sumY / allNodes.length;

      // Path-walk text Bar nodes (text is pass-through; any upstream image hits
      // its own hard wall). Discovered images fold into the same path list.
      const stateNow = useCanvasStore.getState();
      const collected = collectFromStartNodes(
        textNodes.map((n) => n.id),
        stateNow.nodes,
        stateNow.edges,
      );
      collected.images.forEach((img) => {
        if (img.imageUrl && !imagePaths.includes(img.imageUrl)) {
          imagePaths.push(img.imageUrl);
        }
        if (img.caption) imageCaptionParts.push(`[Reference: ${img.caption}]`);
      });

      // Combine all text content (collected.texts already includes the Bar's
      // own text nodes, since they are start nodes).
      const textContent = [
        ...collected.texts.map((t) => t.content),
        ...imageCaptionParts,
      ]
        .filter(Boolean)
        .join('\n');

      // Create ScriptNode in running state
      const scriptData: ScriptNodeData = {
        kind: 'script', label: 'Script', status: 'running',
        shots: [],
        productCategory: config.category,
        visualStyle: config.style,
        aspectRatio: config.aspectRatio,
        totalDuration: config.duration,
        shotCount: config.shotCount,
        sourceImagePaths: imagePaths,
      };
      const newId = nextId();
      addNode({ id: newId, type: 'script', position: { x: maxX + 350, y: avgY }, data: scriptData } as CanvasNode);

      // Connect all source nodes → script node
      allNodes.forEach((n) => {
        useCanvasStore.getState().onConnect({
          source: n.id,
          target: newId,
          sourceHandle: null,
          targetHandle: null,
        });
      });

      // Call API via encapsulated service
      try {
        const userId = user?.id;
        if (!userId) throw new Error('User not authenticated');

        const parsedShots = await generateScriptForCanvas(
          userId, config, imagePaths, textContent, language
        );

        updateNodeData(newId, { status: 'completed', shots: parsedShots } as Partial<ScriptNodeData>);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Script generation failed';
        updateNodeData(newId, { status: 'failed', error: msg } as Partial<ScriptNodeData>);
      }
    },
    [addNode, updateNodeData, user, language]
  );

  // Batch generate: create ONE Video node, call API, add to TaskContext
  const handleBatchGenerate = useCallback(
    async (
      imageNodes: CanvasNode[],
      scriptNodes: CanvasNode[],
      textNodes: CanvasNode[],
      prompt: string,
      model: string,
      duration: number,
      aspectRatio: VideoNodeData['aspectRatio'],
      sound: boolean,
      scriptTextContext: string
    ) => {
      if (imageNodes.length === 0) return;

      // Compute position: right of rightmost source node, vertically centered
      const allSourceNodes = [...imageNodes, ...scriptNodes, ...textNodes];
      let maxX = -Infinity;
      let sumY = 0;
      allSourceNodes.forEach((n) => {
        if (n.position.x > maxX) maxX = n.position.x;
        sumY += n.position.y;
      });
      const avgY = sumY / allSourceNodes.length;

      // Path-walk:
      //   * Image Bar nodes are terminal — contribute imageUrl + (caption if any),
      //     do NOT walk further upstream (matches "V←P" rule).
      //   * Text Bar nodes are path starts — contribute their content AND walk
      //     one step up, where any encountered image is hard-walled.
      const stateNow = useCanvasStore.getState();
      const collected = collectFromStartNodes(
        textNodes.map((n) => n.id),
        stateNow.nodes,
        stateNow.edges,
      );

      // Image Bar inputs (terminal); honor `useAsInput` toggle.
      const imagePaths: string[] = [];
      const imageCaptionParts: string[] = [];
      imageNodes.forEach((n) => {
        const d = n.data as ImageNodeData;
        if (d.useAsInput === false) return;
        if (d.imageUrl) imagePaths.push(d.imageUrl);
        const cap = d.inputCaption?.trim();
        if (cap) imageCaptionParts.push(`[Reference: ${cap}]`);
      });
      // Fold upstream-discovered images into the same path/caption pools.
      collected.images.forEach((img) => {
        if (img.imageUrl && !imagePaths.includes(img.imageUrl)) {
          imagePaths.push(img.imageUrl);
        }
        if (img.caption) imageCaptionParts.push(`[Reference: ${img.caption}]`);
      });

      // Combine prompt: script/text context + user input + collected text chain
      // + any image captions discovered along the way.
      const fullPrompt = [
        scriptTextContext,
        prompt,
        ...collected.texts.map((t) => t.content),
        ...imageCaptionParts,
      ]
        .filter(Boolean)
        .join('\n\n');

      // Create VideoNode in running state
      const videoData: VideoNodeData = {
        kind: 'video', label: 'Video', status: 'running',
        videoUrl: null, thumbnailUrl: null, taskId: null, projectId: null,
        prompt: fullPrompt,
        model,
        duration,
        aspectRatio,
        imageInputPath: imagePaths.length > 0 ? imagePaths : undefined,
      };
      const newId = nextId();
      addNode({ id: newId, type: 'video', position: { x: maxX + 350, y: avgY }, data: videoData } as CanvasNode);

      // Connect ALL source nodes → single video node
      allSourceNodes.forEach((n) => {
        useCanvasStore.getState().onConnect({
          source: n.id,
          target: newId,
          sourceHandle: null,
          targetHandle: null,
        });
      });

      // Call API
      try {
        const userId = user?.id;
        if (!userId) throw new Error('User not authenticated');

        // Step 1: Create project
        const createResp = await videoApi.createProject(userId, {
          title: fullPrompt.slice(0, 50) || 'Canvas Video',
          aspect_ratio: aspectRatio,
        });
        const respData = createResp?.data || createResp;
        const projectId = String(respData?.id || respData?.project_id || '');
        if (!projectId) throw new Error('Failed to create project');

        updateNodeData(newId, { projectId } as Partial<VideoNodeData>);

        // Step 2: Upload all images to server (blob URLs → /media/... paths)
        const uploadedPaths: string[] = [];
        for (const path of imagePaths) {
          const serverPath = await resolveImagePath(path);
          uploadedPaths.push(serverPath);
        }

        // Step 3: Build payload aligned with workbench (WV:2264-2329)
        // Model mapping (WV:4114-4121, 9303 for seedance)
        const backendModel = model === 'sora2pro' ? 'sora-2-pro'
          : model === 'sora2' ? 'sora-2'
          : model === 'seedance2.0' ? 'seedance-2.0'
          : model; // 'kling' stays as-is
        const isKling = backendModel === 'kling';
        const isSeedance = backendModel === 'seedance-2.0';

        let generatePayload: Record<string, unknown>;

        if (isKling && uploadedPaths.length > 0) {
          // Kling payload — match workbench exactly (WV:2312-2329)
          generatePayload = {
            model: backendModel,
            prompt: fullPrompt,
            duration,
            sound: 'off',                      // Kling always 'off' (WV:2317)
            kling_mode: 'first_frame',
            omni_assets: uploadedPaths.map((url, i) => ({
              role: i === 0 ? 'first_frame' : 'reference',
              image_url: url,
              asset_id: null,
              name: `canvas_image_${i}`,
            })),
            user_language: language,
            target_language: language,
            model_asset_id: null,
            motion_asset_id: null,
            aspect_ratio: aspectRatio,
            mode: 'pro',
            project_id: projectId,
          };
        } else if (isSeedance) {
          // Seedance 2.0 payload (mirrors WorkbenchView.tsx:9302-9327 minimal subset).
          // Seedance prefers image_path + optional image_paths for multi-frame, and
          // accepts standard sound/aspect_ratio. Duration clamped to its own range.
          const seedanceDuration = Math.max(4, Math.min(15, Math.round(duration)));
          generatePayload = {
            model: backendModel,
            prompt: fullPrompt,
            duration: seedanceDuration,
            sound: sound ? 'on' : 'off',
            aspect_ratio: aspectRatio,
            asset_source: 'product',
            user_language: language,
            target_language: language,
            project_id: projectId,
            model_asset_id: null,
            motion_asset_id: null,
            mode: 'pro',
          };
          if (uploadedPaths[0]) {
            generatePayload.image_path = uploadedPaths[0];
          }
          if (uploadedPaths.length > 1) {
            generatePayload.image_paths = uploadedPaths;
          }
        } else {
          // Sora / other models payload (WV:2332-2356)
          generatePayload = {
            model: backendModel,
            prompt: fullPrompt,
            duration,
            sound: sound ? 'on' : 'off',
            project_id: projectId,
            aspect_ratio: aspectRatio,
            user_language: language,
            target_language: language,
            mode: 'pro',
            model_asset_id: null,
            motion_asset_id: null,
          };
          if (uploadedPaths[0]) {
            generatePayload.image_path = uploadedPaths[0];
          }
          if (backendModel.startsWith('sora')) {
            generatePayload.size = aspectRatio === '9:16' ? '720x1280' : '1280x720';
          }
        }

        const genResp = await videoApi.generate(generatePayload);
        const genData = genResp?.data || genResp;
        const taskId = genData?.task_id;
        if (!taskId) throw new Error('No task_id returned from generate');

        updateNodeData(newId, { taskId: String(taskId) } as Partial<VideoNodeData>);

        // Step 4: Add to TaskContext for polling
        addTask({
          id: taskId,
          projectId,
          type: 'video_generation',
          status: 'processing',
          name: fullPrompt.slice(0, 30) || 'Canvas Video',
          thumbnail: imagePaths[0] || undefined,
          createdAt: Date.now(),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Video generation failed';
        updateNodeData(newId, { status: 'failed', error: msg } as Partial<VideoNodeData>);
      }
    },
    [addNode, updateNodeData, user, language, addTask]
  );

  // Batch generate image: collect upstream image refs + text prompts, call generateFirstFrame,
  // create N PROCESSING ImageNode placeholders, poll each request_id, backfill on completion.
  const handleBatchGenerateImage = useCallback(
    async (
      imageNodes: CanvasNode[],
      textNodes: CanvasNode[],
      prompt: string,
      model: string,
      aspectRatio: VideoNodeData['aspectRatio'],
      outputCount: number
    ) => {
      if (imageNodes.length === 0) return;

      // Anchor position: right of rightmost source
      const allSourceNodes = [...imageNodes, ...textNodes];
      let maxX = -Infinity;
      let sumY = 0;
      allSourceNodes.forEach((n) => {
        if (n.position.x > maxX) maxX = n.position.x;
        sumY += n.position.y;
      });
      const baseY = sumY / allSourceNodes.length;

      // Path-walk: text Bar nodes are starts, image Bar nodes are terminals.
      // Honors `useAsInput` toggle and "Image hard wall" rule.
      const stateNow = useCanvasStore.getState();
      const collected = collectFromStartNodes(
        textNodes.map((n) => n.id),
        stateNow.nodes,
        stateNow.edges,
      );

      // Image Bar inputs (terminal); honor toggle and collect caption text.
      const referenceUrls: string[] = [];
      const imageCaptionParts: string[] = [];
      imageNodes.forEach((n) => {
        const d = n.data as ImageNodeData;
        if (d.useAsInput === false) return;
        if (d.imageUrl) referenceUrls.push(d.imageUrl);
        const cap = d.inputCaption?.trim();
        if (cap) imageCaptionParts.push(`[Reference: ${cap}]`);
      });
      collected.images.forEach((img) => {
        if (img.imageUrl && !referenceUrls.includes(img.imageUrl)) {
          referenceUrls.push(img.imageUrl);
        }
        if (img.caption) imageCaptionParts.push(`[Reference: ${img.caption}]`);
      });
      if (referenceUrls.length === 0) {
        // Cannot generate without at least one reference image (generateFirstFrame requires it)
        return;
      }

      const fullPrompt = [
        prompt,
        ...collected.texts.map((t) => t.content),
        ...imageCaptionParts,
      ]
        .filter(Boolean)
        .join('\n\n');

      // Convert blob/local URLs → uploadable Files via fetch
      const refFiles: File[] = [];
      try {
        for (let i = 0; i < referenceUrls.length; i += 1) {
          const url = referenceUrls[i];
          const resp = await fetch(url);
          const blob = await resp.blob();
          const ext = (blob.type.split('/')[1] || 'jpg').replace('+xml', '');
          refFiles.push(new File([blob], `canvas_ref_${Date.now()}_${i}.${ext}`, { type: blob.type }));
        }
      } catch (err) {
        console.error('Failed to fetch reference image for canvas image gen', err);
        return;
      }

      // Create N PROCESSING ImageNode placeholders horizontally. Each one is
      // marked mode='first_frame' with the full config snapshot so that:
      //   - The node renders the FirstFrameMode UI on completion
      //   - Per-node regenerate (P0-4) can replay this exact call
      const placeholderIds: string[] = [];
      const firstFrameModelValue = (['nano-banana-pro', 'flux-2-pro', 'gpt-image-1.5'].includes(model)
        ? model
        : 'nano-banana-pro') as ImageNodeData['firstFrameModel'];
      const safeOutputCount = (Math.max(1, Math.min(4, outputCount)) as 1 | 2 | 3 | 4);
      for (let i = 0; i < outputCount; i += 1) {
        const newId = nextId();
        placeholderIds.push(newId);
        const imageData: ImageNodeData = {
          kind: 'image',
          label: 'Image',
          status: 'running',
          imageUrl: null,
          assetId: null,
          source: 'generated',
          mode: 'first_frame',
          firstFramePrompt: fullPrompt,
          firstFrameModel: firstFrameModelValue,
          firstFrameReferenceUrls: referenceUrls,
          outputCount: safeOutputCount,
        };
        addNode({
          id: newId,
          type: 'image',
          position: { x: maxX + 350, y: baseY - 60 + i * 220 },
          data: imageData,
        } as CanvasNode);
        // Connect upstream sources to each placeholder
        allSourceNodes.forEach((src) => {
          useCanvasStore.getState().onConnect({
            source: src.id,
            target: newId,
            sourceHandle: null,
            targetHandle: null,
          });
        });
      }

      // Submit to backend
      try {
        const submission = await productImagesApi.generateFirstFrame(
          refFiles,
          {
            prompt: fullPrompt,
            model,
            aspectRatio,
            outputCount,
          } as Parameters<typeof productImagesApi.generateFirstFrame>[1]
        );

        const requests = submission?.requests || [];

        if (requests.length === 0) {
          // No request_ids → mark all placeholders failed
          placeholderIds.forEach((pid) =>
            updateNodeData(pid, { status: 'failed', error: 'No requests created' } as Partial<ImageNodeData>)
          );
          return;
        }

        // Poll each request → backfill matching placeholder
        const pollOne = async (requestId: string, nodeId: string) => {
          const start = Date.now();
          const TIMEOUT_MS = 5 * 60 * 1000;
          while (Date.now() - start < TIMEOUT_MS) {
            await new Promise((r) => setTimeout(r, 4000));
            try {
              const result = await productImagesApi.getFirstFrameResult(requestId);
              const status = String(result.status || '').toUpperCase();
              if (status === 'SUCCESS' || status === 'SUCCEEDED' || status === 'COMPLETED') {
                updateNodeData(nodeId, {
                  status: 'completed',
                  imageUrl: result.imageUrl,
                  assetId: result.metadata?.historyAssetId || null,
                } as Partial<ImageNodeData>);
                return;
              }
              if (status === 'FAILED' || status === 'ERROR') {
                updateNodeData(nodeId, {
                  status: 'failed',
                  error: result.error || 'Image generation failed',
                } as Partial<ImageNodeData>);
                return;
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Poll error';
              updateNodeData(nodeId, { status: 'failed', error: msg } as Partial<ImageNodeData>);
              return;
            }
          }
          updateNodeData(nodeId, { status: 'failed', error: 'Timeout' } as Partial<ImageNodeData>);
        };

        requests.forEach((req, idx) => {
          const nodeId = placeholderIds[idx];
          if (!nodeId) return;
          void pollOne(req.requestId, nodeId);
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Image generation failed';
        placeholderIds.forEach((pid) =>
          updateNodeData(pid, { status: 'failed', error: msg } as Partial<ImageNodeData>)
        );
      }
    },
    [addNode, updateNodeData]
  );

  // Per-node "regenerate" — listens for the `canvas:regenerate` CustomEvent dispatched
  // from RegenerateButton. Routes to the right batch-gen handler based on node type,
  // gathering upstream nodes via incoming edges so the regen runs with the same context.
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ nodeId: string }>;
      const targetId = ce.detail?.nodeId;
      if (!targetId) return;
      const state = useCanvasStore.getState();
      const node = state.nodes.find((n) => n.id === targetId);
      if (!node) return;

      const upstreamIds = state.edges
        .filter((edge) => edge.target === targetId)
        .map((edge) => edge.source);
      const upstreamNodes = state.nodes.filter((n) => upstreamIds.includes(n.id));
      const imageNodes = upstreamNodes.filter((n) => (n.data as CanvasNodeData).kind === 'image');
      const textNodes = upstreamNodes.filter((n) => (n.data as CanvasNodeData).kind === 'text');
      const scriptNodes = upstreamNodes.filter((n) => (n.data as CanvasNodeData).kind === 'script');

      // Path-walk so V←T←P (image only reachable via text chain) still surfaces
      // an effective image reference list. If direct upstream has images, prefer
      // those; otherwise fall back to walked images.
      const walked = collectUpstreamInputs(targetId, state.nodes, state.edges);
      const walkedImageNodes = walked.images
        .map((img) => state.nodes.find((n) => n.id === img.nodeId))
        .filter((n): n is CanvasNode => !!n);

      if (node.type === 'video') {
        const d = node.data as VideoNodeData;
        const effectiveImageNodes = imageNodes.length > 0 ? imageNodes : walkedImageNodes;
        handleBatchGenerate(
          effectiveImageNodes,
          scriptNodes,
          textNodes,
          d.prompt,
          d.model,
          d.duration,
          d.aspectRatio,
          false,
          ''
        );
      } else if (node.type === 'image') {
        // For regenerated image, use upstream image+text refs and current source's settings.
        // Source ImageNode itself can serve as an additional reference.
        const refs = imageNodes.length > 0
          ? imageNodes
          : walkedImageNodes.length > 0
            ? walkedImageNodes
            : [node];
        handleBatchGenerateImage(refs, textNodes, '', 'nano-banana-pro', '9:16', 1);
      } else if (node.type === 'script') {
        // Reuse the script handler with current node config — note: this re-runs generation
        // with the same upstream nodes; output is a new ScriptNode at default position.
        const d = node.data as ScriptNodeData;
        handleGenerateScript(imageNodes, textNodes, {
          category: d.productCategory || '',
          style: d.visualStyle || 'realistic',
          shotCount: d.shotCount || 5,
          duration: d.totalDuration || 10,
          aspectRatio: d.aspectRatio || '9:16',
          notes: '',
        });
      }
    };
    window.addEventListener('canvas:regenerate', handler);
    return () => window.removeEventListener('canvas:regenerate', handler);
  }, [handleBatchGenerate, handleBatchGenerateImage, handleGenerateScript]);

  // Concatenate selected VideoNodes via the backend ffmpeg endpoint.
  // Creates a PROCESSING placeholder VideoNode to the right of the input set,
  // then fills it on success. On 400 FORMAT_MISMATCH, surfaces the error
  // (backend payload includes mismatched indices).
  const handleConcatenateVideos = useCallback(
    async (videoSourceNodes: CanvasNode[], orderedVideoUrls: string[]) => {
      if (videoSourceNodes.length < 2 || orderedVideoUrls.length < 2) return;

      // Anchor position to the right of rightmost input
      let maxX = -Infinity;
      let sumY = 0;
      videoSourceNodes.forEach((n) => {
        if (n.position.x > maxX) maxX = n.position.x;
        sumY += n.position.y;
      });
      const avgY = sumY / videoSourceNodes.length;

      // Carry over aspect ratio from first input (it's the validation key anyway).
      const firstData = videoSourceNodes[0].data as VideoNodeData;
      const newId = nextId();
      const placeholderData: VideoNodeData = {
        kind: 'video',
        label: 'Concatenated Video',
        status: 'running',
        videoUrl: null,
        thumbnailUrl: firstData.thumbnailUrl,
        taskId: null,
        projectId: null,
        prompt: `Concat of ${orderedVideoUrls.length} clips`,
        model: 'concat',
        duration: 0,
        aspectRatio: firstData.aspectRatio,
      };
      addNode({
        id: newId,
        type: 'video',
        position: { x: maxX + 350, y: avgY },
        data: placeholderData,
      } as CanvasNode);
      videoSourceNodes.forEach((src) => {
        useCanvasStore.getState().onConnect({
          source: src.id,
          target: newId,
          sourceHandle: null,
          targetHandle: null,
        });
      });

      try {
        const result = await videoApi.concatVideos(orderedVideoUrls);
        updateNodeData(newId, {
          status: 'completed',
          videoUrl: result.video_url,
          duration: result.duration,
        } as Partial<VideoNodeData>);
      } catch (err: any) {
        // Backend uses error_code='FORMAT_MISMATCH' for resolution mismatches;
        // we surface a friendly message with the offending indices when available.
        let msg = 'Concatenation failed';
        if (err?.errorCode === 'FORMAT_MISMATCH') {
          const mm = (err?.data?.mismatched || []) as Array<{ index: number; width: number; height: number }>;
          const expected = `${err?.data?.expected_width || '?'}×${err?.data?.expected_height || '?'}`;
          const offenders = mm.map((m) => `#${m.index + 1} (${m.width}×${m.height})`).join(', ');
          msg = `Resolution mismatch. Expected ${expected}. Offenders: ${offenders}`;
        } else if (err instanceof Error) {
          msg = err.message;
        }
        updateNodeData(newId, { status: 'failed', error: msg } as Partial<VideoNodeData>);
      }
    },
    [addNode, updateNodeData],
  );

  // Sync task status from TaskContext → VideoNode status
  useEffect(() => {
    nodes.forEach((node) => {
      if (node.type !== 'video') return;
      const vData = node.data as VideoNodeData;
      if (!vData.taskId) return;

      const task = tasks.find((t) => String(t.id) === String(vData.taskId));
      if (!task) return;

      if (task.status === 'success' && vData.status !== 'completed') {
        updateNodeData(node.id, {
          status: 'completed',
          videoUrl: task.result?.video_url || task.result?.output_url || null,
          thumbnailUrl: task.result?.cover_url || task.result?.thumbnail_url || null,
        } as Partial<VideoNodeData>);
      } else if (task.status === 'failed' && vData.status !== 'failed') {
        updateNodeData(node.id, {
          status: 'failed',
          error: task.result?.error || 'Generation failed',
        } as Partial<VideoNodeData>);
      }
    });
  }, [tasks, nodes, updateNodeData]);

  // Inline video generation — fired by VideoNode's in-node Generate button via
  // `canvas:generate-inline` CustomEvent. Unlike `canvas:regenerate`, this does
  // NOT spawn a new node; it mutates the targeted VideoNode (status='running',
  // taskId set). The existing TaskContext sync useEffect (line ~972) flips the
  // node to completed when the task finishes.
  useEffect(() => {
    const handler = async (e: Event) => {
      const ce = e as CustomEvent<{ nodeId: string }>;
      const targetId = ce.detail?.nodeId;
      if (!targetId) return;
      const state = useCanvasStore.getState();
      const targetNode = state.nodes.find((n) => n.id === targetId);
      if (!targetNode || targetNode.type !== 'video') return;
      const targetData = targetNode.data as VideoNodeData;

      const userId = user?.id;
      if (!userId) return;

      // Collect upstream inputs along each incoming-edge path (Image is hard wall,
      // Text passes through; honors per-node `useAsInput`). Used to build the
      // final prompt and reference-image list.
      const collected = collectUpstreamInputs(targetId, state.nodes, state.edges);
      const prompt = buildEffectivePrompt(targetData.prompt, collected);

      // Require either an own prompt or at least some upstream content; otherwise
      // there's nothing to generate from.
      if (!prompt && collected.images.length === 0) {
        return;
      }

      const upstreamImageUrls: string[] = mergeReferenceImagePaths([], collected);

      // Mark running immediately so the button flips to 生成中
      updateNodeData(targetId, { status: 'running', error: undefined } as Partial<VideoNodeData>);

      try {
        // Step 1: Create project (mirrors handleBatchGenerate path)
        const createResp = await videoApi.createProject(userId, {
          title: prompt.slice(0, 50) || 'Canvas Video',
          aspect_ratio: targetData.aspectRatio,
        });
        const respData = createResp?.data || createResp;
        const projectId = String(respData?.id || respData?.project_id || '');
        if (!projectId) throw new Error('Failed to create project');
        updateNodeData(targetId, { projectId } as Partial<VideoNodeData>);

        // Step 2: Resolve upstream image URLs to server paths
        const uploadedPaths: string[] = [];
        for (const url of upstreamImageUrls) {
          uploadedPaths.push(await resolveImagePath(url));
        }

        // Step 3: Build per-model payload (identical to handleBatchGenerate)
        const model = targetData.model;
        const duration = targetData.duration;
        const aspectRatio = targetData.aspectRatio;
        const backendModel = model === 'sora2pro' ? 'sora-2-pro'
          : model === 'sora2' ? 'sora-2'
          : model === 'seedance2.0' ? 'seedance-2.0'
          : model;
        const isKling = backendModel === 'kling';
        const isSeedance = backendModel === 'seedance-2.0';

        let generatePayload: Record<string, unknown>;
        if (isKling && uploadedPaths.length > 0) {
          generatePayload = {
            model: backendModel,
            prompt,
            duration,
            sound: 'off',
            kling_mode: 'first_frame',
            omni_assets: uploadedPaths.map((url, i) => ({
              role: i === 0 ? 'first_frame' : 'reference',
              image_url: url,
              asset_id: null,
              name: `canvas_image_${i}`,
            })),
            user_language: language,
            target_language: language,
            model_asset_id: null,
            motion_asset_id: null,
            aspect_ratio: aspectRatio,
            mode: 'pro',
            project_id: projectId,
          };
        } else if (isSeedance) {
          const seedanceDuration = Math.max(4, Math.min(15, Math.round(duration)));
          generatePayload = {
            model: backendModel,
            prompt,
            duration: seedanceDuration,
            sound: 'on',
            aspect_ratio: aspectRatio,
            asset_source: 'product',
            user_language: language,
            target_language: language,
            project_id: projectId,
            model_asset_id: null,
            motion_asset_id: null,
            mode: 'pro',
          };
          if (uploadedPaths[0]) generatePayload.image_path = uploadedPaths[0];
          if (uploadedPaths.length > 1) generatePayload.image_paths = uploadedPaths;
        } else {
          generatePayload = {
            model: backendModel,
            prompt,
            duration,
            sound: 'on',
            project_id: projectId,
            aspect_ratio: aspectRatio,
            user_language: language,
            target_language: language,
            mode: 'pro',
            model_asset_id: null,
            motion_asset_id: null,
          };
          if (uploadedPaths[0]) generatePayload.image_path = uploadedPaths[0];
          if (backendModel.startsWith('sora')) {
            generatePayload.size = aspectRatio === '9:16' ? '720x1280' : '1280x720';
          }
        }

        const genResp = await videoApi.generate(generatePayload);
        const genData = genResp?.data || genResp;
        const taskId = genData?.task_id;
        if (!taskId) throw new Error('No task_id returned from generate');

        updateNodeData(targetId, { taskId: String(taskId) } as Partial<VideoNodeData>);

        // Hand off to TaskContext so the existing sync useEffect (line ~972)
        // will flip the node to 'completed' once the polling finishes.
        addTask({
          id: taskId,
          projectId,
          type: 'video_generation',
          status: 'processing',
          name: prompt.slice(0, 30) || 'Canvas Video',
          thumbnail: uploadedPaths[0] || undefined,
          createdAt: Date.now(),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Video generation failed';
        updateNodeData(targetId, { status: 'failed', error: msg } as Partial<VideoNodeData>);
      }
    };
    window.addEventListener('canvas:generate-inline', handler);
    return () => window.removeEventListener('canvas:generate-inline', handler);
  }, [updateNodeData, user, language, addTask]);

  // MagicCompose: drop a TextNode carrying the user prompt and trigger script generation
  // against it. The existing handleGenerateScript path connects them and fans out shots.
  // NOTE: must be declared BEFORE the `if (!isLoaded)` early return so React sees the
  // same hook count on every render — otherwise it throws "Rendered more hooks than during
  // the previous render".
  const handleMagicCompose = useCallback(
    async (config: {
      prompt: string;
      shotCount: number;
      style: string;
      duration: number;
      aspectRatio: VideoNodeData['aspectRatio'];
    }) => {
      const textId = nextId();
      const textNode: CanvasNode = {
        id: textId,
        type: 'text',
        position: { x: 100, y: 100 },
        data: {
          kind: 'text',
          label: 'Magic Prompt',
          status: 'idle',
          content: config.prompt,
          role: 'prompt',
        } as TextNodeData,
      } as CanvasNode;
      addNode(textNode);

      // Hand off to the existing script gen path; it will create a ScriptNode connected
      // from this text node and fill the shots asynchronously.
      handleGenerateScript([], [textNode], {
        category: '',
        style: config.style,
        shotCount: config.shotCount,
        duration: config.duration,
        aspectRatio: config.aspectRatio,
        notes: '',
      });
    },
    [addNode, handleGenerateScript]
  );

  // Apply an agent-driven action to the canvas. Mirrors the backend parser's
  // CanvasAction schema. Only the explicitly supported ops are wired; unknown
  // ops are silently ignored (assistant text bubble still renders).
  const handleApplyAgentAction = useCallback(
    (action: CanvasAgentAction) => {
      const params = (action?.params || {}) as Record<string, unknown>;

      if (action.op === 'magic_compose') {
        const prompt = String(params.prompt || '').trim();
        if (!prompt) return;
        const shotCount = Number(params.shot_count) || 3;
        const style = String(params.style || 'realistic');
        const duration = Number(params.duration) || 10;
        const aspectRatioRaw = String(params.aspect_ratio || '9:16');
        const aspectRatio = (['9:16', '16:9', '1:1'].includes(aspectRatioRaw)
          ? aspectRatioRaw
          : '9:16') as VideoNodeData['aspectRatio'];

        void handleMagicCompose({ prompt, shotCount, style, duration, aspectRatio });
        return;
      }

      if (action.op === 'add_node') {
        const kind = String(params.kind || '');
        const id = nextId();
        const pos = { x: 100, y: 100 };
        if (kind === 'text') {
          addNode({
            id,
            type: 'text',
            position: pos,
            data: {
              kind: 'text',
              label: 'Agent Note',
              status: 'idle',
              content: String(params.content || ''),
              role: 'prompt',
            } as TextNodeData,
          } as CanvasNode);
        } else if (kind === 'image') {
          addNode({
            id,
            type: 'image',
            position: pos,
            data: {
              kind: 'image',
              label: 'Image',
              status: 'idle',
              imageUrl: null,
              assetId: null,
              source: 'upload',
            } as ImageNodeData,
          } as CanvasNode);
        } else if (kind === 'video') {
          addNode({
            id,
            type: 'video',
            position: pos,
            data: {
              kind: 'video',
              label: 'Video',
              status: 'idle',
              videoUrl: null,
              thumbnailUrl: null,
              taskId: null,
              projectId: null,
              prompt: '',
              model: 'kling',
              duration: 5,
              aspectRatio: '9:16',
            } as VideoNodeData,
          } as CanvasNode);
        }
      }
      // 'echo' and unknown ops: no canvas mutation needed
    },
    [addNode, handleMagicCompose]
  );

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-950 text-zinc-500 font-mono text-sm">
        {t.canvas_loading}
      </div>
    );
  }

  return (
    <div className="w-full h-full relative" onKeyDown={onKeyDown} tabIndex={0}>
      {/* Dev-notice banner — fixed at the very top of the canvas surface */}
      <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none flex justify-center">
        <div className="mt-0 w-full text-center py-1.5 bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-[11px] font-medium tracking-wide">
          {t.canvas_banner_dev_notice}
        </div>
      </div>
      {/* Balance badge — top-right corner, sits above the banner so it stays
          legible on the amber background. Reads `user.credits` from AuthContext
          which is refreshed at canvas mount and after each generation. */}
      <div className="absolute top-1 right-3 z-30 pointer-events-none">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900/80 backdrop-blur-md border border-emerald-500/30 text-emerald-300 text-[11px] font-medium shadow-lg">
          <Wallet className="w-3.5 h-3.5" />
          <span>
            {(t as Record<string, string | undefined>).canvas_balance_label || 'Balance'}:
            {' '}
            <span className="text-emerald-200 font-semibold">
              {user ? formatCreditAmount(user.credits ?? 0) : '—'}
            </span>
            {' '}
            <span className="text-emerald-400/70">{(t as Record<string, string | undefined>).billing_credit_unit || 'V'}</span>
          </span>
        </div>
      </div>
      <CanvasToolbar
        onSave={handleSave}
        isSaving={isSaving}
        onMagicCompose={() => setMagicOpen(true)}
        onToggleAgent={() => setAgentOpen((v) => !v)}
        agentOpen={agentOpen}
      />
      <MagicComposeDialog
        open={magicOpen}
        onClose={() => setMagicOpen(false)}
        onCompose={handleMagicCompose}
      />
      <AgentSidebar
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        onApplyAction={handleApplyAgentAction}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onViewportChange={onViewportChange}
        onSelectionChange={onSelectionChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'data', animated: false }}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        deleteKeyCode={null}
        className="bg-zinc-950"
        proOptions={{ hideAttribution: true }}
        // Mildly wider zoom + pan range than ReactFlow defaults (0.5~2) so users
        // can plan a longer pipeline without feeling cramped — but not so wide
        // that nodes become tiny dots on first zoom-out.
        minZoom={0.3}
        maxZoom={2.5}
        translateExtent={[[-8000, -8000], [8000, 8000]]}
        nodeExtent={[[-8000, -8000], [8000, 8000]]}
        // Touchpad gestures
        panOnScroll={true}
        panOnScrollSpeed={0.8}
        zoomOnPinch={true}
        panOnDrag={[1, 2]}
        // Selection
        selectionOnDrag={true}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode="Meta"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
        <MiniMap
          className="!bg-zinc-900 !border-white/10"
          nodeColor="#3f3f46"
          maskColor="rgba(0, 0, 0, 0.6)"
        />
      </ReactFlow>

      {/* Bottom config panel (single-node selection) — see logic below. */}
      <BottomInputPanelGate
        activeNodeId={activeNodeId}
        onClose={() => setActiveNodeId(null)}
        onGenerateImage={(nodeId) => {
          const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId);
          if (!node) return;
          void runImageGeneration(nodeId, node.data as ImageNodeData, { updateNodeData });
        }}
        onGenerateVideo={(nodeId) => {
          window.dispatchEvent(new CustomEvent('canvas:generate-inline', { detail: { nodeId } }));
        }}
        onGenerateScript={(textNode, cfg) => {
          void handleGenerateScript(
            [],
            [textNode],
            {
              category: '',
              style: cfg.style,
              shotCount: cfg.shotCount,
              duration: cfg.duration,
              aspectRatio: cfg.aspectRatio,
              notes: '',
            },
          );
        }}
      />

      {/* Selection action bar (multi-select batch ops) */}
      <SelectionActionBar
        onBatchGenerate={handleBatchGenerate}
        onGenerateScript={handleGenerateScript}
        onBatchGenerateImage={handleBatchGenerateImage}
        onOpenInGallery={onNavigate ? () => onNavigate('product_images_gallery') : undefined}
        onConcatenateVideos={handleConcatenateVideos}
      />

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          position={contextMenu.position}
          type={contextMenu.type}
          nodeKind={contextMenu.nodeKind}
          onClose={closeContextMenu}
          onAddTextNode={handleContextAddText}
          onAddImageNode={handleContextAddImage}
          onAddVideoNode={handleContextAddVideo}
          onAddVideoAnalysisNode={handleContextAddVideoAnalysis}
          onAddUploadNode={handleContextAddUpload}
          onDeleteNode={handleContextDeleteNode}
          onCopyNode={handleContextCopyNode}
          onGenerateVideo={handleContextGenerateVideo}
          onGenerateScript={handleContextGenerateScript}
        />
      )}
    </div>
  );
}

/**
 * Reactive gate around BottomInputPanel — subscribes to canvasStore so that
 * (a) selection count changes flip panel visibility and (b) `nodes` mutations
 * (status/imageUrl/outputs flips) reflow the panel's bound data.
 */
function BottomInputPanelGate({
  activeNodeId,
  onClose,
  onGenerateImage,
  onGenerateVideo,
  onGenerateScript,
}: {
  activeNodeId: string | null;
  onClose: () => void;
  onGenerateImage: (nodeId: string) => void;
  onGenerateVideo: (nodeId: string) => void;
  onGenerateScript: (sourceTextNode: CanvasNode, cfg: {
    withShots: boolean;
    style: string;
    shotCount: number;
    duration: number;
    aspectRatio: VideoNodeData['aspectRatio'];
  }) => void;
}) {
  const selectedNodes = useCanvasStore((s) => s.selectedNodes);
  const liveNodes = useCanvasStore((s) => s.nodes);
  if (selectedNodes.length > 1) return null;
  const activeNode = activeNodeId
    ? liveNodes.find((n) => n.id === activeNodeId) || null
    : null;
  return (
    <BottomInputPanel
      activeNode={activeNode}
      onClose={onClose}
      onGenerateImage={onGenerateImage}
      onGenerateVideo={onGenerateVideo}
      onGenerateScript={onGenerateScript}
    />
  );
}

export const CanvasEditor: React.FC<CanvasEditorProps> = ({ onNavigate }) => {
  return (
    <ReactFlowProvider>
      <CanvasEditorInner onNavigate={onNavigate} />
    </ReactFlowProvider>
  );
};
