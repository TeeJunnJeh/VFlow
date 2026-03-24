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

import { useCanvasStore } from './canvasStore';
import { TextNode } from './nodes/TextNode';
import { ImageNode } from './nodes/ImageNode';
import { VideoNode } from './nodes/VideoNode';
import { ScriptNode } from './nodes/ScriptNode';
import { DataEdge } from './edges/DataEdge';
import { CanvasToolbar } from './panels/CanvasToolbar';
import { SelectionActionBar } from './panels/SelectionActionBar';
import { ContextMenu, type ContextMenuPosition } from './panels/ContextMenu';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useTasks } from '../../context/TaskContext';
import { videoApi } from '../../services/video';
import { assetsApi } from '../../services/assets';
import { generateScriptForCanvas } from './canvasScriptService';
import type { CanvasSnapshot, CanvasNode, CanvasNodeData, ImageNodeData, VideoNodeData, TextNodeData, ScriptNodeData } from './canvasTypes';

// Register custom node/edge types
const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  video: VideoNode,
  script: ScriptNode,
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

function CanvasEditorInner() {
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
  const { user } = useAuth();
  const { addTask, tasks } = useTasks();
  const { screenToFlowPosition } = useReactFlow();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    type: 'pane' | 'node';
    nodeId?: string;
    nodeKind?: string;
  } | null>(null);

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

  // Selection change handler
  const onSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      setSelection(params.nodes as CanvasNode[], params.edges as unknown as import('./canvasTypes').CanvasEdge[]);
    },
    [setSelection]
  );

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
      imageNodes.forEach((n) => {
        const d = n.data as ImageNodeData;
        if (d.imageUrl) imagePaths.push(d.imageUrl);
      });
      const avgY = sumY / allNodes.length;

      // Collect text content from text nodes
      const textContent = textNodes
        .map((n) => (n.data as TextNodeData).content)
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
      const imagePaths: string[] = [];
      allSourceNodes.forEach((n) => {
        if (n.position.x > maxX) maxX = n.position.x;
        sumY += n.position.y;
      });
      imageNodes.forEach((n) => {
        const d = n.data as ImageNodeData;
        if (d.imageUrl) imagePaths.push(d.imageUrl);
      });
      const avgY = sumY / allSourceNodes.length;

      // Combine prompt: script/text context + user input
      const fullPrompt = [scriptTextContext, prompt].filter(Boolean).join('\n\n');

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
        // Model mapping (WV:4114-4121)
        const backendModel = model === 'sora2pro' ? 'sora-2-pro'
          : model === 'sora2' ? 'sora-2'
          : model; // 'kling' stays as-is
        const isKling = backendModel === 'kling';

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

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-950 text-zinc-500 font-mono text-sm">
        {t.canvas_loading}
      </div>
    );
  }

  return (
    <div className="w-full h-full relative" onKeyDown={onKeyDown} tabIndex={0}>
      <CanvasToolbar onSave={handleSave} isSaving={isSaving} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onViewportChange={onViewportChange}
        onSelectionChange={onSelectionChange}
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

      {/* Selection action bar */}
      <SelectionActionBar onBatchGenerate={handleBatchGenerate} onGenerateScript={handleGenerateScript} />

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
          onDeleteNode={handleContextDeleteNode}
          onCopyNode={handleContextCopyNode}
          onGenerateVideo={handleContextGenerateVideo}
          onGenerateScript={handleContextGenerateScript}
        />
      )}
    </div>
  );
}

export const CanvasEditor: React.FC = () => {
  return (
    <ReactFlowProvider>
      <CanvasEditorInner />
    </ReactFlowProvider>
  );
};
