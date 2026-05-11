import { create } from 'zustand';
import { temporal } from 'zundo';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Viewport,
  type Connection,
} from '@xyflow/react';
import type {
  CanvasNode,
  CanvasEdge,
  CanvasNodeData,
  CanvasSnapshot,
  CanvasEdgeData,
} from './canvasTypes';
import { VALID_CONNECTIONS } from './canvasTypes';

// Simple throttle utility
// Use `any[]` so callers with overload-typed setters (e.g. zustand's `set`) match T.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let lastCall = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastCall = Date.now();
        timer = null;
        fn(...args);
      }, ms - (now - lastCall));
    }
  }) as T;
}

interface CanvasState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
  isDirty: boolean;
  lastSavedAt: number | null;

  // Selection
  selectedNodes: CanvasNode[];
  selectedEdges: CanvasEdge[];

  // Actions
  onNodesChange: OnNodesChange<CanvasNode>;
  onEdgesChange: OnEdgesChange<CanvasEdge>;
  onConnect: OnConnect;
  addNode: (node: CanvasNode) => void;
  updateNodeData: (nodeId: string, updates: Partial<CanvasNodeData>) => void;
  removeNodes: (nodeIds: string[]) => void;
  setViewport: (viewport: Viewport) => void;

  // Selection actions
  setSelection: (nodes: CanvasNode[], edges: CanvasEdge[]) => void;
  clearSelection: () => void;
  getSelectedNodesByKind: (kind: CanvasNodeData['kind']) => CanvasNode[];

  // Persistence
  toSnapshot: () => CanvasSnapshot;
  loadSnapshot: (snapshot: CanvasSnapshot) => void;
  markClean: () => void;
  clear: () => void;
}

export const useCanvasStore = create<CanvasState>()(
  temporal(
    (set, get) => ({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      isDirty: false,
      lastSavedAt: null,
      selectedNodes: [],
      selectedEdges: [],

      onNodesChange: (changes) => {
        set((state) => ({
          nodes: applyNodeChanges(changes, state.nodes),
          isDirty: true,
        }));
      },

      onEdgesChange: (changes) => {
        set((state) => ({
          edges: applyEdgeChanges(changes, state.edges),
          isDirty: true,
        }));
      },

      onConnect: (connection: Connection) => {
        const { nodes } = get();
        const sourceNode = nodes.find((n) => n.id === connection.source);
        const targetNode = nodes.find((n) => n.id === connection.target);
        if (!sourceNode || !targetNode) return;

        const sourceKind = (sourceNode.data as CanvasNodeData).kind;
        const targetKind = (targetNode.data as CanvasNodeData).kind;
        const allowed = VALID_CONNECTIONS[sourceKind] || [];
        if (!allowed.includes(targetKind)) return;

        const edgeData: CanvasEdgeData = { dataType: sourceKind as CanvasEdgeData['dataType'] };
        set((state) => ({
          edges: addEdge({ ...connection, type: 'data', data: edgeData }, state.edges),
          isDirty: true,
        }));
      },

      addNode: (node) => {
        set((state) => ({
          nodes: [...state.nodes, node],
          isDirty: true,
        }));
      },

      updateNodeData: (nodeId, updates) => {
        set((state) => ({
          // Merging `Partial<CanvasNodeData>` into a discriminated-union member widens
          // the `kind` discriminator; cast back to CanvasNode since we only merge into
          // an existing node of compatible kind.
          nodes: state.nodes.map((n) =>
            n.id === nodeId
              ? ({ ...n, data: { ...n.data, ...updates } } as CanvasNode)
              : n
          ),
          isDirty: true,
        }));
      },

      removeNodes: (nodeIds) => {
        const idSet = new Set(nodeIds);
        set((state) => ({
          nodes: state.nodes.filter((n) => !idSet.has(n.id)),
          edges: state.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
          selectedNodes: state.selectedNodes.filter((n) => !idSet.has(n.id)),
          isDirty: true,
        }));
      },

      setViewport: (viewport) => {
        set({ viewport });
      },

      // Selection
      setSelection: (nodes, edges) => {
        set({ selectedNodes: nodes, selectedEdges: edges });
      },

      clearSelection: () => {
        set({ selectedNodes: [], selectedEdges: [] });
      },

      getSelectedNodesByKind: (kind) => {
        return get().selectedNodes.filter((n) => (n.data as CanvasNodeData).kind === kind);
      },

      toSnapshot: () => {
        const { nodes, edges, viewport } = get();
        return {
          version: 1,
          nodes,
          edges,
          viewport,
          savedAt: new Date().toISOString(),
        };
      },

      loadSnapshot: (snapshot) => {
        set({
          nodes: snapshot.nodes || [],
          edges: snapshot.edges || [],
          viewport: snapshot.viewport || { x: 0, y: 0, zoom: 1 },
          isDirty: false,
          lastSavedAt: Date.now(),
          selectedNodes: [],
          selectedEdges: [],
        });
      },

      markClean: () => {
        set({ isDirty: false, lastSavedAt: Date.now() });
      },

      clear: () => {
        set({ nodes: [], edges: [], selectedNodes: [], selectedEdges: [], isDirty: true });
      },
    }),
    {
      // Only track nodes and edges in undo history
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
      }),
      limit: 50,
      equality: (a, b) => a.nodes === b.nodes && a.edges === b.edges,
      handleSet: (handleSet) => throttle(handleSet, 500),
    }
  )
);
