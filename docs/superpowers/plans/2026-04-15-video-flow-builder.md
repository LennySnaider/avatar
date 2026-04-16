# Video Flow Builder MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a visual pipeline editor (ReactFlow) that lets users chain avatar generation operations (image, video, voice, AI) into reusable flows executed client-side.

**Architecture:** Canvas-first layout with @xyflow/react. Nodes map 1:1 to existing services (GeminiService, KlingService, etc.) via a handler registry. Client-side execution engine runs topological sort then sequential node execution. Flows persist in Supabase `video_flows` table.

**Tech Stack:** @xyflow/react v12, Zustand 5, React 19, Next.js 15, Supabase, react-icons/hi, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-04-15-video-flow-builder-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/page.tsx` | Page entry: auth + canvas mount |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_constants/categoryColors.ts` | Color map per node category |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_engine/types.ts` | Shared types: NodeStatus, ExecutionContext, VideoNodeTemplate, etc. |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_nodes/templates.ts` | 13 node template definitions (type, label, icon, I/O) |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_nodes/VideoBaseNode.tsx` | Base node component with handles, status badge, category label |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_nodes/registry.ts` | nodeTypes map for ReactFlow |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_store/videoFlowStore.ts` | Zustand store: nodes, edges, execution state, CRUD actions |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/VideoFlowCanvas.tsx` | ReactFlow wrapper, drag-drop, minimap, controls |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/NodePalette.tsx` | Draggable node palette grouped by category |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/FlowToolbar.tsx` | Floating toolbar: Run, Save, Load, Clear, Zoom |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/NodePropertiesPanel.tsx` | Config panel for selected node |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/FlowStatusBar.tsx` | Bottom bar: execution status, node count |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_engine/executeFlow.ts` | Topological sort + sequential execution loop |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/index.ts` | Handler registry: nodeType → handler |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/inputHandlers.ts` | select-avatar, upload-image handlers |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/aiHandlers.ts` | prompt-enhance, describe-image handlers |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/generationHandlers.ts` | generate-image, generate-video handlers |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/transformHandlers.ts` | stitch, text-overlay handlers |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/voiceHandlers.ts` | script-generator, text-to-speech handlers |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/logicHandlers.ts` | condition handler |
| Create | `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/outputHandlers.ts` | save-to-gallery, webhook handlers |
| Migrate | Supabase | Create `video_flows` table with RLS |

---

### Task 1: Install @xyflow/react and Create Foundation Types

**Files:**
- Modify: `package.json`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_engine/types.ts`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_constants/categoryColors.ts`

- [ ] **Step 1: Install @xyflow/react**

```bash
npm install @xyflow/react
```

- [ ] **Step 2: Verify installation**

```bash
grep "@xyflow/react" package.json
```
Expected: `"@xyflow/react": "^12.x.x"`

- [ ] **Step 3: Create engine types**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_engine/types.ts`:

```typescript
import type { Node, Edge } from '@xyflow/react'

// ─── Node Status ─────────────────────────────────────────────
export type NodeStatus = 'idle' | 'running' | 'completed' | 'error' | 'pending'

// ─── Node Categories ─────────────────────────────────────────
export type NodeCategory =
    | 'input'
    | 'ai'
    | 'generation'
    | 'transform'
    | 'voice'
    | 'logic'
    | 'output'

// ─── Node Template (defines what a node type IS) ─────────────
export interface VideoNodeTemplate {
    type: string
    label: string
    category: NodeCategory
    icon: string // react-icons component name
    description: string
    inputs: string[]
    outputs: string[]
    defaultData: Record<string, unknown>
}

// ─── Node Data (runtime state attached to each node instance) ─
export interface VideoNodeData extends Record<string, unknown> {
    type: string
    label: string
    category: NodeCategory
    icon: string
    status: NodeStatus
    config: Record<string, unknown>
}

// ─── Typed ReactFlow Node ────────────────────────────────────
export type VideoFlowNode = Node<VideoNodeData>

// ─── Execution ───────────────────────────────────────────────
export type ExecutionContext = Map<string, Record<string, unknown>>

export interface NodeResult {
    output: Record<string, unknown>
}

export type VideoNodeHandler = (
    node: VideoFlowNode,
    inputs: Record<string, unknown>,
    context: ExecutionContext
) => Promise<NodeResult>
```

- [ ] **Step 4: Create category colors**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_constants/categoryColors.ts`:

```typescript
import type { NodeCategory } from '../_engine/types'

export const CATEGORY_COLORS: Record<NodeCategory, { border: string; bg: string; label: string }> = {
    input:      { border: '#10b981', bg: '#10b98115', label: 'Input' },
    ai:         { border: '#8b5cf6', bg: '#8b5cf615', label: 'AI' },
    generation: { border: '#f43f5e', bg: '#f43f5e15', label: 'Generation' },
    transform:  { border: '#3b82f6', bg: '#3b82f615', label: 'Transform' },
    voice:      { border: '#ec4899', bg: '#ec489915', label: 'Voice' },
    logic:      { border: '#f59e0b', bg: '#f59e0b15', label: 'Logic' },
    output:     { border: '#14b8a6', bg: '#14b8a615', label: 'Output' },
}
```

- [ ] **Step 5: Verify build compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: No errors in the new files.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/app/\(protected-pages\)/concepts/avatar-forge/video-flows/
git commit -m "feat(video-flows): install @xyflow/react, add foundation types and category colors"
```

---

### Task 2: Create Node Templates (13 Node Definitions)

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_nodes/templates.ts`

- [ ] **Step 1: Create all 13 node templates**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_nodes/templates.ts`:

```typescript
import type { VideoNodeTemplate, NodeCategory } from '../_engine/types'

export const NODE_TEMPLATES: VideoNodeTemplate[] = [
    // ─── Input ───────────────────────────────────────────────
    {
        type: 'select-avatar',
        label: 'Select Avatar',
        category: 'input',
        icon: 'HiOutlineUser',
        description: 'Pick an avatar from your gallery',
        inputs: [],
        outputs: ['avatarId', 'references', 'faceRef', 'measurements'],
        defaultData: { avatarId: null },
    },
    {
        type: 'upload-image',
        label: 'Upload Image',
        category: 'input',
        icon: 'HiOutlineUpload',
        description: 'Upload an image from your device',
        inputs: [],
        outputs: ['imageUrl', 'imageBase64'],
        defaultData: {},
    },

    // ─── AI Processing ───────────────────────────────────────
    {
        type: 'prompt-enhance',
        label: 'Enhance Prompt',
        category: 'ai',
        icon: 'HiOutlineSparkles',
        description: 'Improve prompt with AI details',
        inputs: ['basePrompt'],
        outputs: ['enhancedPrompt'],
        defaultData: { basePrompt: '', style: 'photorealistic', intensity: 'medium' },
    },
    {
        type: 'describe-image',
        label: 'Describe Image',
        category: 'ai',
        icon: 'HiOutlineEye',
        description: 'Generate text description from image',
        inputs: ['imageUrl'],
        outputs: ['description'],
        defaultData: { detailLevel: 'detailed' },
    },

    // ─── Generation ──────────────────────────────────────────
    {
        type: 'generate-image',
        label: 'Generate Image',
        category: 'generation',
        icon: 'HiOutlinePhotograph',
        description: 'Generate avatar image with Gemini',
        inputs: ['prompt', 'references', 'faceRef'],
        outputs: ['imageUrl', 'fullApiPrompt'],
        defaultData: { aspectRatio: '1:1', model: 'gemini' },
    },
    {
        type: 'generate-video',
        label: 'Generate Video',
        category: 'generation',
        icon: 'HiOutlineFilm',
        description: 'Generate video from image with Kling',
        inputs: ['imageUrl'],
        outputs: ['videoUrl', 'taskId'],
        defaultData: { duration: '5', mode: 'standard' },
    },

    // ─── Transform ───────────────────────────────────────────
    {
        type: 'stitch',
        label: 'Stitch Videos',
        category: 'transform',
        icon: 'HiOutlineScissors',
        description: 'Concatenate multiple videos into one',
        inputs: ['videoUrls'],
        outputs: ['stitchedVideoUrl'],
        defaultData: { transition: 'none' },
    },
    {
        type: 'text-overlay',
        label: 'Text Overlay',
        category: 'transform',
        icon: 'HiOutlineAnnotation',
        description: 'Add text overlay to image or video',
        inputs: ['imageUrl', 'videoUrl'],
        outputs: ['outputUrl'],
        defaultData: { text: '', position: 'bottom-center', fontSize: 24, color: '#ffffff' },
    },

    // ─── Voice ───────────────────────────────────────────────
    {
        type: 'script-generator',
        label: 'Generate Script',
        category: 'voice',
        icon: 'HiOutlineDocumentText',
        description: 'AI-generated script for video narration',
        inputs: ['topic'],
        outputs: ['script', 'duration'],
        defaultData: { tone: 'professional', language: 'es', template: 'general', durationSeconds: 30 },
    },
    {
        type: 'text-to-speech',
        label: 'Text to Speech',
        category: 'voice',
        icon: 'HiOutlineMicrophone',
        description: 'Convert text to speech with MiniMax',
        inputs: ['text'],
        outputs: ['audioUrl', 'duration'],
        defaultData: { voiceId: '', speed: 1.0, language: 'es' },
    },

    // ─── Logic ───────────────────────────────────────────────
    {
        type: 'condition',
        label: 'Condition',
        category: 'logic',
        icon: 'HiOutlineSwitchHorizontal',
        description: 'Branch flow based on a condition',
        inputs: ['value'],
        outputs: ['result'],
        defaultData: { field: '', operator: 'equals', compareValue: '' },
    },

    // ─── Output ──────────────────────────────────────────────
    {
        type: 'save-to-gallery',
        label: 'Save to Gallery',
        category: 'output',
        icon: 'HiOutlineSave',
        description: 'Save generated media to avatar gallery',
        inputs: ['imageUrl', 'videoUrl'],
        outputs: ['galleryItemId', 'savedUrl'],
        defaultData: { collection: 'default' },
    },
    {
        type: 'webhook',
        label: 'Webhook',
        category: 'output',
        icon: 'HiOutlineLink',
        description: 'Send results to external URL',
        inputs: ['data'],
        outputs: ['responseStatus'],
        defaultData: { url: '', method: 'POST', headers: {} },
    },
]

export const TEMPLATES_BY_CATEGORY = NODE_TEMPLATES.reduce(
    (acc, template) => {
        if (!acc[template.category]) acc[template.category] = []
        acc[template.category].push(template)
        return acc
    },
    {} as Record<string, VideoNodeTemplate[]>
)

export function getTemplate(type: string): VideoNodeTemplate | undefined {
    return NODE_TEMPLATES.find((t) => t.type === type)
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/video-flows/_nodes/templates.ts
git commit -m "feat(video-flows): define 13 node templates with I/O specs"
```

---

### Task 3: Create VideoBaseNode Component

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_nodes/VideoBaseNode.tsx`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_nodes/registry.ts`

- [ ] **Step 1: Create VideoBaseNode**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_nodes/VideoBaseNode.tsx`:

```tsx
'use client'

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import {
    HiOutlineUser,
    HiOutlineUpload,
    HiOutlineSparkles,
    HiOutlineEye,
    HiOutlinePhotograph,
    HiOutlineFilm,
    HiOutlineScissors,
    HiOutlineAnnotation,
    HiOutlineDocumentText,
    HiOutlineMicrophone,
    HiOutlineSwitchHorizontal,
    HiOutlineSave,
    HiOutlineLink,
    HiOutlineCheck,
    HiOutlineX,
} from 'react-icons/hi'
import type { VideoNodeData, NodeStatus } from '../_engine/types'
import { CATEGORY_COLORS } from '../_constants/categoryColors'

// ─── Icon Map ────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    HiOutlineUser,
    HiOutlineUpload,
    HiOutlineSparkles,
    HiOutlineEye,
    HiOutlinePhotograph,
    HiOutlineFilm,
    HiOutlineScissors,
    HiOutlineAnnotation,
    HiOutlineDocumentText,
    HiOutlineMicrophone,
    HiOutlineSwitchHorizontal,
    HiOutlineSave,
    HiOutlineLink,
}

// ─── Status Badge ────────────────────────────────────────────
function StatusBadge({ status }: { status: NodeStatus }) {
    if (status === 'idle') return null

    const config: Record<string, { bg: string; color: string }> = {
        running:   { bg: '#f43f5e20', color: '#f43f5e' },
        completed: { bg: '#10b98120', color: '#10b981' },
        error:     { bg: '#ef444420', color: '#ef4444' },
        pending:   { bg: '#33415530', color: '#64748b' },
    }

    const { bg, color } = config[status] ?? config.pending

    return (
        <div
            className="flex items-center justify-center rounded-full shrink-0"
            style={{ width: 18, height: 18, background: bg }}
        >
            {status === 'running' && (
                <svg className="animate-spin" width={10} height={10} viewBox="0 0 16 16">
                    <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8z" fill={color} opacity={0.2} />
                    <path d="M8 0a8 8 0 018 8h-1.5A6.5 6.5 0 008 1.5V0z" fill={color} />
                </svg>
            )}
            {status === 'completed' && <HiOutlineCheck style={{ width: 10, height: 10, color }} />}
            {status === 'error' && <HiOutlineX style={{ width: 10, height: 10, color }} />}
            {status === 'pending' && (
                <svg width={10} height={10} viewBox="0 0 16 16">
                    <rect x={4} y={3} width={3} height={10} rx={0.75} fill={color} />
                    <rect x={9} y={3} width={3} height={10} rx={0.75} fill={color} />
                </svg>
            )}
        </div>
    )
}

// ─── VideoBaseNode ───────────────────────────────────────────
function VideoBaseNode({ data }: NodeProps<VideoNodeData>) {
    const { type, label, category, icon, status, config } = data
    const colors = CATEGORY_COLORS[category]
    const IconComponent = ICON_MAP[icon]

    const isInputNode = category === 'input'
    const isOutputNode = category === 'output'

    return (
        <div
            className="relative rounded-[10px] p-3 min-w-[180px] shadow-lg"
            style={{
                background: '#1e293b',
                border: `2px solid ${status === 'running' ? colors.border : status === 'error' ? '#ef4444' : colors.border}`,
                boxShadow: status === 'running'
                    ? `0 0 24px ${colors.border}40`
                    : status === 'completed'
                        ? `0 0 16px ${colors.border}20`
                        : 'none',
                opacity: status === 'pending' ? 0.6 : 1,
            }}
        >
            {/* Category label */}
            <div
                className="absolute -top-2.5 left-3 text-white text-[8px] px-2 py-px rounded-full font-semibold uppercase tracking-wide"
                style={{ background: colors.border }}
            >
                {colors.label}
            </div>

            {/* Header: icon + title + status badge */}
            <div className="flex items-center justify-between mt-1 mb-2">
                <div className="flex items-center gap-1.5">
                    {IconComponent && <IconComponent className="w-4 h-4" style={{ color: colors.border }} />}
                    <span className="text-slate-200 text-xs font-bold">{label}</span>
                </div>
                <StatusBadge status={status} />
            </div>

            {/* Config preview */}
            <div className="bg-slate-900 rounded-md p-2 text-[10px]">
                <div className="text-slate-500 mb-0.5">Config:</div>
                <div className="text-slate-400 font-mono text-[8px] truncate max-w-[160px]">
                    {Object.entries(config)
                        .filter(([, v]) => v !== null && v !== '' && v !== undefined)
                        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
                        .join(', ') || 'default'}
                </div>
            </div>

            {/* Handles */}
            {!isInputNode && (
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!w-2.5 !h-2.5 !bg-slate-500 !border-2 !border-slate-700"
                />
            )}
            {!isOutputNode && (
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!w-2.5 !h-2.5 !border-2 !border-slate-700"
                    style={{ background: colors.border }}
                />
            )}
        </div>
    )
}

export default memo(VideoBaseNode)
```

- [ ] **Step 2: Create node type registry**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_nodes/registry.ts`:

```typescript
import type { NodeTypes } from '@xyflow/react'
import VideoBaseNode from './VideoBaseNode'

// All 13 node types use the same VideoBaseNode component.
// Differentiation happens via `data.type` and `data.category`.
export const nodeTypes: NodeTypes = {
    videoNode: VideoBaseNode,
}
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/video-flows/_nodes/
git commit -m "feat(video-flows): create VideoBaseNode with SVG status badges and LTR handles"
```

---

### Task 4: Create Zustand Store

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_store/videoFlowStore.ts`

- [ ] **Step 1: Create the store**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_store/videoFlowStore.ts`:

```typescript
import { create } from 'zustand'
import {
    applyNodeChanges,
    applyEdgeChanges,
    addEdge,
    type OnNodesChange,
    type OnEdgesChange,
    type OnConnect,
    type XYPosition,
    type Edge,
} from '@xyflow/react'
import type { VideoFlowNode, VideoNodeData, NodeStatus } from '../_engine/types'
import { getTemplate } from '../_nodes/templates'

interface VideoFlowStore {
    // Canvas state
    nodes: VideoFlowNode[]
    edges: Edge[]
    onNodesChange: OnNodesChange<VideoFlowNode>
    onEdgesChange: OnEdgesChange
    onConnect: OnConnect

    // Flow metadata
    flowId: string | null
    flowName: string
    isDirty: boolean

    // Execution state
    executionStatus: 'idle' | 'running' | 'completed' | 'error'
    nodeStatuses: Record<string, NodeStatus>
    executionError: { nodeId: string; message: string } | null

    // Selection
    selectedNodeId: string | null
    setSelectedNodeId: (id: string | null) => void

    // Node CRUD
    addNode: (type: string, position: XYPosition) => void
    removeNode: (id: string) => void
    setNodeData: (id: string, updates: Partial<VideoNodeData>) => void
    setNodeConfig: (id: string, config: Record<string, unknown>) => void

    // Execution
    setNodeStatus: (id: string, status: NodeStatus) => void
    setExecutionStatus: (status: 'idle' | 'running' | 'completed' | 'error') => void
    setExecutionError: (nodeId: string, message: string) => void
    resetExecution: () => void

    // Flow persistence
    setFlowMeta: (id: string | null, name: string) => void
    setIsDirty: (dirty: boolean) => void
    clearCanvas: () => void
    loadFlowData: (nodes: VideoFlowNode[], edges: Edge[]) => void
}

export const useVideoFlowStore = create<VideoFlowStore>()((set, get) => ({
    // ─── Canvas state ────────────────────────────────────────
    nodes: [],
    edges: [],

    onNodesChange: (changes) => {
        set({ nodes: applyNodeChanges(changes, get().nodes), isDirty: true })
    },
    onEdgesChange: (changes) => {
        set({ edges: applyEdgeChanges(changes, get().edges), isDirty: true })
    },
    onConnect: (connection) => {
        set({ edges: addEdge(connection, get().edges), isDirty: true })
    },

    // ─── Flow metadata ───────────────────────────────────────
    flowId: null,
    flowName: 'Untitled Flow',
    isDirty: false,

    // ─── Execution state ─────────────────────────────────────
    executionStatus: 'idle',
    nodeStatuses: {},
    executionError: null,

    // ─── Selection ───────────────────────────────────────────
    selectedNodeId: null,
    setSelectedNodeId: (id) => set({ selectedNodeId: id }),

    // ─── Node CRUD ───────────────────────────────────────────
    addNode: (type, position) => {
        const template = getTemplate(type)
        if (!template) return

        const id = `${type}-${Date.now()}`
        const newNode: VideoFlowNode = {
            id,
            type: 'videoNode',
            position,
            data: {
                type: template.type,
                label: template.label,
                category: template.category,
                icon: template.icon,
                status: 'idle',
                config: { ...template.defaultData },
            },
        }
        set((state) => ({
            nodes: [...state.nodes, newNode],
            isDirty: true,
        }))
    },

    removeNode: (id) => {
        set((state) => ({
            nodes: state.nodes.filter((n) => n.id !== id),
            edges: state.edges.filter((e) => e.source !== id && e.target !== id),
            selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
            isDirty: true,
        }))
    },

    setNodeData: (id, updates) => {
        set((state) => ({
            nodes: state.nodes.map((n) =>
                n.id === id ? { ...n, data: { ...n.data, ...updates } } : n
            ),
            isDirty: true,
        }))
    },

    setNodeConfig: (id, config) => {
        set((state) => ({
            nodes: state.nodes.map((n) =>
                n.id === id
                    ? { ...n, data: { ...n.data, config: { ...n.data.config, ...config } } }
                    : n
            ),
            isDirty: true,
        }))
    },

    // ─── Execution ───────────────────────────────────────────
    setNodeStatus: (id, status) => {
        set((state) => ({
            nodeStatuses: { ...state.nodeStatuses, [id]: status },
            nodes: state.nodes.map((n) =>
                n.id === id ? { ...n, data: { ...n.data, status } } : n
            ),
        }))
    },

    setExecutionStatus: (executionStatus) => set({ executionStatus }),

    setExecutionError: (nodeId, message) => set({ executionError: { nodeId, message } }),

    resetExecution: () => {
        set((state) => ({
            executionStatus: 'idle',
            nodeStatuses: {},
            executionError: null,
            nodes: state.nodes.map((n) => ({
                ...n,
                data: { ...n.data, status: 'idle' as const },
            })),
        }))
    },

    // ─── Flow persistence ────────────────────────────────────
    setFlowMeta: (id, name) => set({ flowId: id, flowName: name }),
    setIsDirty: (dirty) => set({ isDirty: dirty }),

    clearCanvas: () =>
        set({
            nodes: [],
            edges: [],
            flowId: null,
            flowName: 'Untitled Flow',
            isDirty: false,
            executionStatus: 'idle',
            nodeStatuses: {},
            executionError: null,
            selectedNodeId: null,
        }),

    loadFlowData: (nodes, edges) =>
        set({ nodes, edges, isDirty: false }),
}))
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/video-flows/_store/
git commit -m "feat(video-flows): create Zustand store with canvas, execution, and CRUD state"
```

---

### Task 5: Create VideoFlowCanvas + Page Entry

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/VideoFlowCanvas.tsx`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/page.tsx`

- [ ] **Step 1: Create VideoFlowCanvas**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/VideoFlowCanvas.tsx`:

```tsx
'use client'

import { useCallback, useRef, type DragEvent } from 'react'
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    MiniMap,
    Controls,
    type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useVideoFlowStore } from '../_store/videoFlowStore'
import { nodeTypes } from '../_nodes/registry'
import { CATEGORY_COLORS } from '../_constants/categoryColors'
import type { VideoFlowNode } from '../_engine/types'
import NodePalette from './NodePalette'
import FlowToolbar from './FlowToolbar'
import NodePropertiesPanel from './NodePropertiesPanel'
import FlowStatusBar from './FlowStatusBar'

export default function VideoFlowCanvas() {
    const reactFlowWrapper = useRef<HTMLDivElement>(null)
    const reactFlowInstance = useRef<ReactFlowInstance<VideoFlowNode> | null>(null)

    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        addNode,
        selectedNodeId,
        setSelectedNodeId,
    } = useVideoFlowStore()

    const onInit = useCallback((instance: ReactFlowInstance<VideoFlowNode>) => {
        reactFlowInstance.current = instance
    }, [])

    const onDragOver = useCallback((event: DragEvent) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
    }, [])

    const onDrop = useCallback(
        (event: DragEvent) => {
            event.preventDefault()
            const type = event.dataTransfer.getData('application/video-flow-node')
            if (!type || !reactFlowInstance.current || !reactFlowWrapper.current) return

            const bounds = reactFlowWrapper.current.getBoundingClientRect()
            const position = reactFlowInstance.current.screenToFlowPosition({
                x: event.clientX - bounds.left,
                y: event.clientY - bounds.top,
            })
            addNode(type, position)
        },
        [addNode]
    )

    const onNodeClick = useCallback(
        (_: React.MouseEvent, node: VideoFlowNode) => {
            setSelectedNodeId(node.id)
        },
        [setSelectedNodeId]
    )

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null)
    }, [setSelectedNodeId])

    return (
        <div className="relative w-full h-full" ref={reactFlowWrapper}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onInit={onInit}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
                fitView
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{
                    type: 'smoothstep',
                    animated: true,
                    style: { stroke: '#475569', strokeWidth: 2 },
                }}
            >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334155" />
                <MiniMap
                    nodeColor={(node) => {
                        const category = (node.data as Record<string, unknown>)?.category as string
                        return CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS]?.border ?? '#475569'
                    }}
                    maskColor="rgba(15, 23, 42, 0.8)"
                    style={{ background: '#1e293b' }}
                />
                <Controls
                    showInteractive={false}
                    className="!bg-slate-800 !border-slate-700 !shadow-lg [&>button]:!bg-slate-800 [&>button]:!border-slate-700 [&>button]:!text-slate-300 [&>button:hover]:!bg-slate-700"
                />
            </ReactFlow>

            {/* Floating panels */}
            <NodePalette />
            <FlowToolbar />
            {selectedNodeId && <NodePropertiesPanel />}
            <FlowStatusBar />
        </div>
    )
}
```

- [ ] **Step 2: Create page entry**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/page.tsx`:

```tsx
import { auth } from '@/auth'
import Container from '@/components/shared/Container'
import VideoFlowCanvas from './_components/VideoFlowCanvas'

export default async function VideoFlowsPage() {
    const session = await auth()

    return (
        <Container className="h-[calc(100vh-theme(spacing.16))] p-0">
            <VideoFlowCanvas />
        </Container>
    )
}
```

Note: Steps 3-4 create placeholder files so the build passes. These will be fully implemented in Tasks 6-9.

- [ ] **Step 3: Create placeholder NodePalette**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/NodePalette.tsx`:

```tsx
'use client'

export default function NodePalette() {
    return null // Implemented in Task 6
}
```

- [ ] **Step 4: Create placeholder FlowToolbar, NodePropertiesPanel, FlowStatusBar**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/FlowToolbar.tsx`:

```tsx
'use client'

export default function FlowToolbar() {
    return null // Implemented in Task 7
}
```

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/NodePropertiesPanel.tsx`:

```tsx
'use client'

export default function NodePropertiesPanel() {
    return null // Implemented in Task 8
}
```

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/FlowStatusBar.tsx`:

```tsx
'use client'

export default function FlowStatusBar() {
    return null // Implemented in Task 9
}
```

- [ ] **Step 5: Verify build**

```bash
npm run build 2>&1 | tail -20
```
Expected: Build succeeds. Page at `/concepts/avatar-forge/video-flows` renders an empty ReactFlow canvas.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/video-flows/
git commit -m "feat(video-flows): create VideoFlowCanvas with ReactFlow, drag-drop, and page entry"
```

---

### Task 6: Implement NodePalette

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/NodePalette.tsx`

- [ ] **Step 1: Implement full NodePalette**

Replace `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/NodePalette.tsx`:

```tsx
'use client'

import { useState, type DragEvent } from 'react'
import {
    HiOutlineUser,
    HiOutlineUpload,
    HiOutlineSparkles,
    HiOutlineEye,
    HiOutlinePhotograph,
    HiOutlineFilm,
    HiOutlineScissors,
    HiOutlineAnnotation,
    HiOutlineDocumentText,
    HiOutlineMicrophone,
    HiOutlineSwitchHorizontal,
    HiOutlineSave,
    HiOutlineLink,
    HiOutlineChevronDown,
    HiOutlineChevronRight,
    HiOutlineViewGrid,
} from 'react-icons/hi'
import { TEMPLATES_BY_CATEGORY } from '../_nodes/templates'
import { CATEGORY_COLORS } from '../_constants/categoryColors'
import type { NodeCategory } from '../_engine/types'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    HiOutlineUser,
    HiOutlineUpload,
    HiOutlineSparkles,
    HiOutlineEye,
    HiOutlinePhotograph,
    HiOutlineFilm,
    HiOutlineScissors,
    HiOutlineAnnotation,
    HiOutlineDocumentText,
    HiOutlineMicrophone,
    HiOutlineSwitchHorizontal,
    HiOutlineSave,
    HiOutlineLink,
}

const CATEGORY_ORDER: NodeCategory[] = ['input', 'ai', 'generation', 'transform', 'voice', 'logic', 'output']

export default function NodePalette() {
    const [isOpen, setIsOpen] = useState(true)
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(CATEGORY_ORDER))

    const toggleCategory = (cat: string) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev)
            if (next.has(cat)) next.delete(cat)
            else next.add(cat)
            return next
        })
    }

    const onDragStart = (event: DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/video-flow-node', nodeType)
        event.dataTransfer.effectAllowed = 'move'
    }

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="absolute top-4 left-4 z-10 bg-slate-800 border border-slate-700 rounded-lg p-2 shadow-lg hover:bg-slate-700 text-slate-300"
                title="Open node palette"
            >
                <HiOutlineViewGrid className="w-5 h-5" />
            </button>
        )
    }

    return (
        <div className="absolute top-4 left-4 z-10 w-56 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
                <span className="text-slate-200 text-xs font-semibold">Nodes</span>
                <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-200">
                    <HiOutlineChevronDown className="w-4 h-4 rotate-180" />
                </button>
            </div>

            {/* Categories */}
            <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-1.5">
                {CATEGORY_ORDER.map((cat) => {
                    const templates = TEMPLATES_BY_CATEGORY[cat] ?? []
                    const colors = CATEGORY_COLORS[cat]
                    const isExpanded = expandedCategories.has(cat)

                    return (
                        <div key={cat} className="mb-1">
                            <button
                                onClick={() => toggleCategory(cat)}
                                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-slate-700/50"
                            >
                                <div
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ background: colors.border }}
                                />
                                <span className="text-[11px] font-semibold text-slate-300 flex-1">
                                    {colors.label}
                                </span>
                                {isExpanded
                                    ? <HiOutlineChevronDown className="w-3 h-3 text-slate-500" />
                                    : <HiOutlineChevronRight className="w-3 h-3 text-slate-500" />
                                }
                            </button>

                            {isExpanded && (
                                <div className="ml-2 space-y-0.5">
                                    {templates.map((t) => {
                                        const Icon = ICON_MAP[t.icon]
                                        return (
                                            <div
                                                key={t.type}
                                                draggable
                                                onDragStart={(e) => onDragStart(e, t.type)}
                                                className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab hover:bg-slate-700/50 active:cursor-grabbing"
                                                title={t.description}
                                            >
                                                {Icon && (
                                                    <Icon
                                                        className="w-3.5 h-3.5 shrink-0"
                                                        style={{ color: colors.border }}
                                                    />
                                                )}
                                                <span className="text-[10px] text-slate-400">
                                                    {t.label}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/video-flows/_components/NodePalette.tsx
git commit -m "feat(video-flows): implement NodePalette with drag-drop, categories, and collapsible sections"
```

---

### Task 7: Implement FlowToolbar

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/FlowToolbar.tsx`

- [ ] **Step 1: Implement FlowToolbar**

Replace `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/FlowToolbar.tsx`:

```tsx
'use client'

import { useState } from 'react'
import {
    HiOutlinePlay,
    HiOutlineSave,
    HiOutlineTrash,
    HiOutlineFolder,
} from 'react-icons/hi'
import { useVideoFlowStore } from '../_store/videoFlowStore'
import { supabase } from '@/lib/supabase'
import type { VideoFlowNode } from '../_engine/types'
import type { Edge } from '@xyflow/react'

export default function FlowToolbar() {
    const {
        nodes,
        edges,
        flowId,
        flowName,
        isDirty,
        executionStatus,
        setFlowMeta,
        setIsDirty,
        clearCanvas,
        loadFlowData,
        setExecutionStatus,
        resetExecution,
    } = useVideoFlowStore()

    const [saving, setSaving] = useState(false)
    const [showLoadMenu, setShowLoadMenu] = useState(false)
    const [savedFlows, setSavedFlows] = useState<{ id: string; name: string }[]>([])

    // ─── Save ────────────────────────────────────────────────
    const handleSave = async () => {
        setSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const payload = {
                user_id: user.id,
                name: flowName,
                nodes: JSON.parse(JSON.stringify(nodes)),
                edges: JSON.parse(JSON.stringify(edges)),
                updated_at: new Date().toISOString(),
            }

            if (flowId) {
                await supabase.from('video_flows').update(payload).eq('id', flowId)
            } else {
                const { data } = await supabase
                    .from('video_flows')
                    .insert(payload)
                    .select('id')
                    .single()
                if (data) setFlowMeta(data.id, flowName)
            }
            setIsDirty(false)
        } finally {
            setSaving(false)
        }
    }

    // ─── Load ────────────────────────────────────────────────
    const handleLoadMenu = async () => {
        if (showLoadMenu) {
            setShowLoadMenu(false)
            return
        }
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
            .from('video_flows')
            .select('id, name')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(20)
        setSavedFlows(data ?? [])
        setShowLoadMenu(true)
    }

    const handleLoadFlow = async (id: string) => {
        const { data } = await supabase.from('video_flows').select('*').eq('id', id).single()
        if (data) {
            loadFlowData(data.nodes as VideoFlowNode[], data.edges as Edge[])
            setFlowMeta(data.id, data.name)
        }
        setShowLoadMenu(false)
    }

    // ─── Run (placeholder — wired in Task 10) ───────────────
    const handleRun = async () => {
        // Will be connected to executeFlow in Task 10
        const { executeFlow } = await import('../_engine/executeFlow')
        resetExecution()
        setExecutionStatus('running')
        try {
            await executeFlow()
            setExecutionStatus('completed')
        } catch {
            setExecutionStatus('error')
        }
    }

    const isRunning = executionStatus === 'running'

    return (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg px-2 py-1.5 shadow-xl">
            {/* Flow name */}
            <input
                className="bg-transparent text-slate-200 text-xs font-medium w-32 outline-none border-b border-transparent focus:border-slate-500 mr-2"
                value={flowName}
                onChange={(e) => setFlowMeta(flowId, e.target.value)}
                placeholder="Flow name..."
            />

            {/* Run */}
            <button
                onClick={handleRun}
                disabled={isRunning || nodes.length === 0}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                title="Run flow"
            >
                <HiOutlinePlay className="w-3.5 h-3.5" />
                {isRunning ? 'Running...' : 'Run'}
            </button>

            {/* Save */}
            <button
                onClick={handleSave}
                disabled={saving || !isDirty}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                title="Save flow"
            >
                <HiOutlineSave className="w-3.5 h-3.5" />
                {saving ? '...' : 'Save'}
            </button>

            {/* Load */}
            <div className="relative">
                <button
                    onClick={handleLoadMenu}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-slate-300 hover:bg-slate-700"
                    title="Load flow"
                >
                    <HiOutlineFolder className="w-3.5 h-3.5" />
                    Load
                </button>
                {showLoadMenu && (
                    <div className="absolute top-full right-0 mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                        {savedFlows.length === 0 ? (
                            <div className="px-3 py-2 text-[10px] text-slate-500">No saved flows</div>
                        ) : (
                            savedFlows.map((f) => (
                                <button
                                    key={f.id}
                                    onClick={() => handleLoadFlow(f.id)}
                                    className="block w-full text-left px-3 py-1.5 text-[10px] text-slate-300 hover:bg-slate-700"
                                >
                                    {f.name}
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Clear */}
            <button
                onClick={clearCanvas}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-slate-400 hover:bg-slate-700 hover:text-red-400"
                title="Clear canvas"
            >
                <HiOutlineTrash className="w-3.5 h-3.5" />
            </button>
        </div>
    )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/video-flows/_components/FlowToolbar.tsx
git commit -m "feat(video-flows): implement FlowToolbar with save, load, run, and clear actions"
```

---

### Task 8: Implement NodePropertiesPanel

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/NodePropertiesPanel.tsx`

- [ ] **Step 1: Implement NodePropertiesPanel**

Replace `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/NodePropertiesPanel.tsx`:

```tsx
'use client'

import {
    HiOutlineX,
    HiOutlineTrash,
} from 'react-icons/hi'
import { useVideoFlowStore } from '../_store/videoFlowStore'
import { CATEGORY_COLORS } from '../_constants/categoryColors'
import { getTemplate } from '../_nodes/templates'
import type { VideoNodeData, NodeCategory } from '../_engine/types'

export default function NodePropertiesPanel() {
    const { nodes, selectedNodeId, setSelectedNodeId, setNodeConfig, removeNode } =
        useVideoFlowStore()

    const node = nodes.find((n) => n.id === selectedNodeId)
    if (!node) return null

    const data = node.data as VideoNodeData
    const template = getTemplate(data.type)
    const colors = CATEGORY_COLORS[data.category as NodeCategory]

    const handleConfigChange = (key: string, value: unknown) => {
        setNodeConfig(node.id, { [key]: value })
    }

    return (
        <div className="absolute top-4 right-72 z-10 w-64 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg shadow-xl overflow-hidden">
            {/* Header */}
            <div
                className="flex items-center justify-between px-3 py-2 border-b"
                style={{ borderColor: `${colors.border}40` }}
            >
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: colors.border }} />
                    <span className="text-slate-200 text-xs font-semibold">{data.label}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => {
                            removeNode(node.id)
                            setSelectedNodeId(null)
                        }}
                        className="text-slate-500 hover:text-red-400 p-0.5"
                        title="Delete node"
                    >
                        <HiOutlineTrash className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => setSelectedNodeId(null)}
                        className="text-slate-400 hover:text-slate-200 p-0.5"
                    >
                        <HiOutlineX className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Config fields */}
            <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
                {template && Object.entries(template.defaultData).map(([key, defaultVal]) => {
                    const currentVal = data.config[key] ?? defaultVal

                    // Render select for known enum fields
                    if (key === 'style' || key === 'intensity' || key === 'detailLevel' || key === 'tone' || key === 'language' || key === 'template' || key === 'method' || key === 'position' || key === 'transition' || key === 'mode' || key === 'operator') {
                        const options = getOptionsForField(key)
                        return (
                            <label key={key} className="block">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wide">{key}</span>
                                <select
                                    className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-slate-500"
                                    value={String(currentVal)}
                                    onChange={(e) => handleConfigChange(key, e.target.value)}
                                >
                                    {options.map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            </label>
                        )
                    }

                    // Number fields
                    if (typeof defaultVal === 'number') {
                        return (
                            <label key={key} className="block">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wide">{key}</span>
                                <input
                                    type="number"
                                    className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-slate-500"
                                    value={Number(currentVal)}
                                    onChange={(e) => handleConfigChange(key, Number(e.target.value))}
                                />
                            </label>
                        )
                    }

                    // String / text fields
                    if (typeof defaultVal === 'string') {
                        const isLongText = key === 'text' || key === 'basePrompt' || key === 'url'
                        return (
                            <label key={key} className="block">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wide">{key}</span>
                                {isLongText ? (
                                    <textarea
                                        className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-slate-500 resize-none"
                                        rows={3}
                                        value={String(currentVal)}
                                        onChange={(e) => handleConfigChange(key, e.target.value)}
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-slate-500"
                                        value={String(currentVal)}
                                        onChange={(e) => handleConfigChange(key, e.target.value)}
                                    />
                                )}
                            </label>
                        )
                    }

                    return null
                })}

                {/* I/O info */}
                {template && (
                    <div className="pt-2 border-t border-slate-700">
                        {template.inputs.length > 0 && (
                            <div className="mb-2">
                                <span className="text-[9px] text-slate-600 uppercase tracking-wide">Inputs:</span>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                    {template.inputs.map((i) => (
                                        <span key={i} className="px-1.5 py-0.5 bg-slate-900 rounded text-[8px] text-slate-500 font-mono">{i}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div>
                            <span className="text-[9px] text-slate-600 uppercase tracking-wide">Outputs:</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                                {template.outputs.map((o) => (
                                    <span key={o} className="px-1.5 py-0.5 bg-slate-900 rounded text-[8px] text-slate-500 font-mono">{o}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function getOptionsForField(key: string): string[] {
    const options: Record<string, string[]> = {
        style: ['photorealistic', 'cinematic', 'anime', 'illustration', 'editorial'],
        intensity: ['low', 'medium', 'high'],
        detailLevel: ['brief', 'detailed', 'exhaustive'],
        tone: ['professional', 'casual', 'energetic', 'calm'],
        language: ['es', 'en', 'pt', 'fr', 'de', 'zh'],
        template: ['general', 'property-tour', 'product-review', 'ugc-ad', 'greeting'],
        method: ['POST', 'PUT', 'PATCH'],
        position: ['top-center', 'center', 'bottom-center', 'bottom-left', 'bottom-right'],
        transition: ['none', 'fade', 'dissolve'],
        mode: ['standard', 'pro'],
        operator: ['equals', 'not-equals', 'contains', 'greater-than', 'less-than'],
    }
    return options[key] ?? []
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/video-flows/_components/NodePropertiesPanel.tsx
git commit -m "feat(video-flows): implement NodePropertiesPanel with dynamic config fields"
```

---

### Task 9: Implement FlowStatusBar

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/FlowStatusBar.tsx`

- [ ] **Step 1: Implement FlowStatusBar**

Replace `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_components/FlowStatusBar.tsx`:

```tsx
'use client'

import { useVideoFlowStore } from '../_store/videoFlowStore'

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
    idle:      { text: 'Idle', color: '#64748b' },
    running:   { text: 'Running...', color: '#f43f5e' },
    completed: { text: 'Completed', color: '#10b981' },
    error:     { text: 'Error', color: '#ef4444' },
}

export default function FlowStatusBar() {
    const { nodes, edges, executionStatus, executionError } = useVideoFlowStore()
    const statusInfo = STATUS_LABELS[executionStatus] ?? STATUS_LABELS.idle

    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg px-4 py-1.5 shadow-xl">
            <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusInfo.color }} />
                <span className="text-[10px] font-medium" style={{ color: statusInfo.color }}>
                    {statusInfo.text}
                </span>
            </div>
            <span className="text-[10px] text-slate-500">
                Nodes: {nodes.length}
            </span>
            <span className="text-[10px] text-slate-500">
                Edges: {edges.length}
            </span>
            {executionError && (
                <span className="text-[10px] text-red-400 truncate max-w-[200px]">
                    {executionError.message}
                </span>
            )}
        </div>
    )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/video-flows/_components/FlowStatusBar.tsx
git commit -m "feat(video-flows): implement FlowStatusBar with execution status and node count"
```

---

### Task 10: Create Execution Engine

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_engine/executeFlow.ts`

- [ ] **Step 1: Implement execution engine with topological sort**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_engine/executeFlow.ts`:

```typescript
import type { Edge } from '@xyflow/react'
import type { VideoFlowNode, ExecutionContext, VideoNodeHandler } from './types'
import { useVideoFlowStore } from '../_store/videoFlowStore'
import { handlers } from '../_handlers'

// ─── Topological Sort (Kahn's algorithm) ─────────────────────
function topologicalSort(nodes: VideoFlowNode[], edges: Edge[]): VideoFlowNode[] {
    const inDegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()
    const nodeMap = new Map<string, VideoFlowNode>()

    for (const node of nodes) {
        inDegree.set(node.id, 0)
        adjacency.set(node.id, [])
        nodeMap.set(node.id, node)
    }

    for (const edge of edges) {
        inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
        adjacency.get(edge.source)?.push(edge.target)
    }

    const queue: string[] = []
    for (const [id, degree] of inDegree) {
        if (degree === 0) queue.push(id)
    }

    const sorted: VideoFlowNode[] = []
    while (queue.length > 0) {
        const id = queue.shift()!
        const node = nodeMap.get(id)
        if (node) sorted.push(node)

        for (const neighbor of adjacency.get(id) ?? []) {
            const newDegree = (inDegree.get(neighbor) ?? 1) - 1
            inDegree.set(neighbor, newDegree)
            if (newDegree === 0) queue.push(neighbor)
        }
    }

    if (sorted.length !== nodes.length) {
        throw new Error('Flow contains a cycle — cannot execute')
    }

    return sorted
}

// ─── Merge inputs from upstream nodes ────────────────────────
function mergeInputs(
    nodeId: string,
    edges: Edge[],
    context: ExecutionContext
): Record<string, unknown> {
    const incoming = edges.filter((e) => e.target === nodeId)
    const merged: Record<string, unknown> = {}

    for (const edge of incoming) {
        const upstreamOutput = context.get(edge.source)
        if (upstreamOutput) {
            Object.assign(merged, upstreamOutput)
        }
    }

    return merged
}

// ─── Execute Flow ────────────────────────────────────────────
export async function executeFlow(): Promise<void> {
    const store = useVideoFlowStore.getState()
    const { nodes, edges } = store

    if (nodes.length === 0) return

    // Mark all nodes as pending
    for (const node of nodes) {
        store.setNodeStatus(node.id, 'pending')
    }

    const sorted = topologicalSort(nodes, edges)
    const context: ExecutionContext = new Map()

    for (const node of sorted) {
        store.setNodeStatus(node.id, 'running')

        const inputs = mergeInputs(node.id, edges, context)

        // Merge node's own config into inputs (config acts as defaults)
        const mergedInputs = { ...node.data.config, ...inputs }

        const handler = handlers[node.data.type] as VideoNodeHandler | undefined
        if (!handler) {
            store.setNodeStatus(node.id, 'error')
            store.setExecutionError(node.id, `No handler for node type: ${node.data.type}`)
            store.setExecutionStatus('error')
            return
        }

        try {
            const result = await handler(node, mergedInputs, context)
            context.set(node.id, result.output)
            store.setNodeStatus(node.id, 'completed')
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            store.setNodeStatus(node.id, 'error')
            store.setExecutionError(node.id, message)
            store.setExecutionStatus('error')
            return
        }
    }

    store.setExecutionStatus('completed')
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/video-flows/_engine/executeFlow.ts
git commit -m "feat(video-flows): implement execution engine with topological sort and input merging"
```

---

### Task 11: Create Node Handlers

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/index.ts`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/inputHandlers.ts`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/aiHandlers.ts`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/generationHandlers.ts`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/transformHandlers.ts`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/voiceHandlers.ts`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/logicHandlers.ts`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/outputHandlers.ts`

- [ ] **Step 1: Create input handlers**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/inputHandlers.ts`:

```typescript
import type { VideoNodeHandler } from '../_engine/types'

export const selectAvatar: VideoNodeHandler = async (node) => {
    const { avatarId } = node.data.config
    if (!avatarId) throw new Error('No avatar selected')

    // In MVP, avatar data comes from node config (user picks in properties panel)
    return {
        output: {
            avatarId,
            references: node.data.config.references ?? [],
            faceRef: node.data.config.faceRef ?? null,
            measurements: node.data.config.measurements ?? {},
        },
    }
}

export const uploadImage: VideoNodeHandler = async (node) => {
    const { imageUrl, imageBase64 } = node.data.config
    if (!imageUrl && !imageBase64) throw new Error('No image uploaded')

    return {
        output: {
            imageUrl: imageUrl ?? '',
            imageBase64: imageBase64 ?? '',
        },
    }
}
```

- [ ] **Step 2: Create AI handlers**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/aiHandlers.ts`:

```typescript
import type { VideoNodeHandler } from '../_engine/types'
import * as GeminiService from '@/services/GeminiService'

export const promptEnhance: VideoNodeHandler = async (node, inputs) => {
    const basePrompt = (inputs.enhancedPrompt as string) ?? (inputs.basePrompt as string) ?? (node.data.config.basePrompt as string) ?? ''
    if (!basePrompt) throw new Error('No prompt to enhance')

    const enhancedPrompt = await GeminiService.enhancePrompt(basePrompt)

    return {
        output: { enhancedPrompt },
    }
}

export const describeImage: VideoNodeHandler = async (_node, inputs) => {
    const imageUrl = inputs.imageUrl as string
    if (!imageUrl) throw new Error('No image to describe')

    const description = await GeminiService.describeImageForPrompt({
        url: imageUrl,
        base64: (inputs.imageBase64 as string) ?? '',
        mimeType: 'image/png',
    })

    return {
        output: { description },
    }
}
```

- [ ] **Step 3: Create generation handlers**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/generationHandlers.ts`:

```typescript
import type { VideoNodeHandler } from '../_engine/types'
import * as GeminiService from '@/services/GeminiService'
import * as KlingService from '@/services/KlingService'

export const generateImage: VideoNodeHandler = async (node, inputs) => {
    const prompt = (inputs.enhancedPrompt as string) ?? (inputs.prompt as string) ?? ''
    if (!prompt) throw new Error('No prompt for image generation')

    const references = (inputs.references as Array<{ url: string; base64: string; mimeType: string }>) ?? []
    const faceRef = inputs.faceRef as { url: string; base64: string; mimeType: string } | null

    const result = await GeminiService.generateAvatar({
        prompt,
        avatarReferences: references,
        faceReference: faceRef ?? undefined,
        aspectRatio: (node.data.config.aspectRatio as string) ?? '1:1',
    })

    return {
        output: {
            imageUrl: result.imageUrl ?? '',
            fullApiPrompt: result.fullApiPrompt ?? '',
        },
    }
}

export const generateVideo: VideoNodeHandler = async (node, inputs) => {
    const imageUrl = inputs.imageUrl as string
    if (!imageUrl) throw new Error('No image for video generation')

    const result = await KlingService.generateVideo({
        prompt: (inputs.enhancedPrompt as string) ?? (inputs.description as string) ?? 'Generate a video from this image',
        imageInput: { url: imageUrl, base64: '', mimeType: 'image/png' },
        duration: (node.data.config.duration as string) ?? '5',
        mode: (node.data.config.mode as string) ?? 'standard',
    })

    return {
        output: {
            videoUrl: result.videoUrl ?? '',
            taskId: result.taskId ?? '',
        },
    }
}
```

- [ ] **Step 4: Create transform handlers**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/transformHandlers.ts`:

```typescript
import type { VideoNodeHandler } from '../_engine/types'
import * as VideoStitchService from '@/services/VideoStitchService'

export const stitch: VideoNodeHandler = async (_node, inputs) => {
    const videoUrls = (inputs.videoUrls as string[]) ?? []

    // Collect any single videoUrl from upstream and combine
    const singleUrl = inputs.videoUrl as string
    const allUrls = singleUrl ? [...videoUrls, singleUrl] : videoUrls

    if (allUrls.length < 2) throw new Error('Need at least 2 videos to stitch')

    const stitchedVideoUrl = await VideoStitchService.stitchVideos(allUrls)

    return {
        output: { stitchedVideoUrl },
    }
}

export const textOverlay: VideoNodeHandler = async (node, inputs) => {
    // MVP: pass through the URL with overlay config for downstream processing
    const mediaUrl = (inputs.imageUrl as string) ?? (inputs.videoUrl as string) ?? ''
    if (!mediaUrl) throw new Error('No media for text overlay')

    return {
        output: {
            outputUrl: mediaUrl,
            overlayConfig: {
                text: node.data.config.text ?? '',
                position: node.data.config.position ?? 'bottom-center',
                fontSize: node.data.config.fontSize ?? 24,
                color: node.data.config.color ?? '#ffffff',
            },
        },
    }
}
```

- [ ] **Step 5: Create voice handlers**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/voiceHandlers.ts`:

```typescript
import type { VideoNodeHandler } from '../_engine/types'
import * as ScriptService from '@/services/ScriptService'
import * as MiniMaxService from '@/services/MiniMaxService'

export const scriptGenerator: VideoNodeHandler = async (node, inputs) => {
    const topic = (inputs.topic as string) ?? (inputs.description as string) ?? ''
    const config = node.data.config

    const script = await ScriptService.generateScript({
        template: (config.template as string) ?? 'general',
        tone: (config.tone as string) ?? 'professional',
        language: (config.language as string) ?? 'es',
        durationSeconds: (config.durationSeconds as number) ?? 30,
        context: topic,
    })

    return {
        output: {
            script,
            duration: config.durationSeconds ?? 30,
        },
    }
}

export const textToSpeech: VideoNodeHandler = async (node, inputs) => {
    const text = (inputs.script as string) ?? (inputs.text as string) ?? ''
    if (!text) throw new Error('No text for speech generation')

    const config = node.data.config
    const voiceId = config.voiceId as string
    if (!voiceId) throw new Error('No voice selected')

    const result = await MiniMaxService.textToSpeech({
        text,
        voiceId,
        speed: (config.speed as number) ?? 1.0,
    })

    return {
        output: {
            audioUrl: result.audioUrl ?? '',
            duration: result.duration ?? 0,
        },
    }
}
```

- [ ] **Step 6: Create logic handlers**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/logicHandlers.ts`:

```typescript
import type { VideoNodeHandler } from '../_engine/types'

export const condition: VideoNodeHandler = async (node, inputs) => {
    const { field, operator, compareValue } = node.data.config
    const value = inputs[field as string]

    let result = false
    switch (operator) {
        case 'equals':
            result = String(value) === String(compareValue)
            break
        case 'not-equals':
            result = String(value) !== String(compareValue)
            break
        case 'contains':
            result = String(value).includes(String(compareValue))
            break
        case 'greater-than':
            result = Number(value) > Number(compareValue)
            break
        case 'less-than':
            result = Number(value) < Number(compareValue)
            break
    }

    return {
        output: { result, value },
    }
}
```

- [ ] **Step 7: Create output handlers**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/outputHandlers.ts`:

```typescript
import type { VideoNodeHandler } from '../_engine/types'
import { supabase } from '@/lib/supabase'

export const saveToGallery: VideoNodeHandler = async (node, inputs) => {
    const mediaUrl = (inputs.imageUrl as string) ?? (inputs.videoUrl as string) ?? (inputs.stitchedVideoUrl as string) ?? ''
    if (!mediaUrl) throw new Error('No media to save')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase.from('avatar_gallery').insert({
        user_id: user.id,
        url: mediaUrl,
        type: mediaUrl.includes('.mp4') || (inputs.videoUrl as string) ? 'video' : 'image',
        prompt: (inputs.fullApiPrompt as string) ?? '',
        collection: (node.data.config.collection as string) ?? 'default',
    }).select('id, url').single()

    if (error) throw new Error(`Failed to save: ${error.message}`)

    return {
        output: {
            galleryItemId: data?.id ?? '',
            savedUrl: data?.url ?? mediaUrl,
        },
    }
}

export const webhook: VideoNodeHandler = async (node, inputs) => {
    const url = node.data.config.url as string
    if (!url) throw new Error('No webhook URL configured')

    const method = (node.data.config.method as string) ?? 'POST'
    const headers = (node.data.config.headers as Record<string, string>) ?? {}

    const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(inputs),
    })

    return {
        output: {
            responseStatus: response.status,
        },
    }
}
```

- [ ] **Step 8: Create handler registry (index)**

Create `src/app/(protected-pages)/concepts/avatar-forge/video-flows/_handlers/index.ts`:

```typescript
import type { VideoNodeHandler } from '../_engine/types'
import * as inputHandlers from './inputHandlers'
import * as aiHandlers from './aiHandlers'
import * as generationHandlers from './generationHandlers'
import * as transformHandlers from './transformHandlers'
import * as voiceHandlers from './voiceHandlers'
import * as logicHandlers from './logicHandlers'
import * as outputHandlers from './outputHandlers'

export const handlers: Record<string, VideoNodeHandler> = {
    'select-avatar':    inputHandlers.selectAvatar,
    'upload-image':     inputHandlers.uploadImage,
    'prompt-enhance':   aiHandlers.promptEnhance,
    'describe-image':   aiHandlers.describeImage,
    'generate-image':   generationHandlers.generateImage,
    'generate-video':   generationHandlers.generateVideo,
    'stitch':           transformHandlers.stitch,
    'text-overlay':     transformHandlers.textOverlay,
    'script-generator': voiceHandlers.scriptGenerator,
    'text-to-speech':   voiceHandlers.textToSpeech,
    'condition':        logicHandlers.condition,
    'save-to-gallery':  outputHandlers.saveToGallery,
    'webhook':          outputHandlers.webhook,
}
```

- [ ] **Step 9: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 10: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/video-flows/_handlers/
git commit -m "feat(video-flows): implement all 13 node handlers wired to existing services"
```

---

### Task 12: Create Supabase Migration

**Files:**
- Supabase migration for `video_flows` table

- [ ] **Step 1: Apply migration via Supabase MCP**

Run the following SQL via the Supabase MCP `apply_migration` tool:

```sql
create table if not exists video_flows (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) not null,
    name text not null,
    description text,
    nodes jsonb not null default '[]',
    edges jsonb not null default '[]',
    thumbnail_url text,
    is_template boolean default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table video_flows enable row level security;

create policy "Users can CRUD own flows"
    on video_flows for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create index if not exists idx_video_flows_user
    on video_flows(user_id, updated_at desc);
```

- [ ] **Step 2: Verify table exists**

Run via Supabase MCP `execute_sql`:

```sql
select column_name, data_type from information_schema.columns
where table_name = 'video_flows' order by ordinal_position;
```

Expected: 9 columns (id, user_id, name, description, nodes, edges, thumbnail_url, is_template, created_at, updated_at).

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "feat(video-flows): create video_flows table with RLS in Supabase"
```

---

### Task 13: Full Build Verification + Navigation Link

**Files:**
- Modify: navigation config to add Video Flows link (location depends on existing nav structure)

- [ ] **Step 1: Run full build**

```bash
npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```
Expected: No lint errors in new files.

- [ ] **Step 3: Verify dev server**

```bash
npm run dev
```

Open `http://localhost:3001/concepts/avatar-forge/video-flows` in browser.

Expected:
- ReactFlow canvas with dark background and dot grid
- NodePalette on the left with 7 categories and 13 nodes
- FlowToolbar on the top-right with Run, Save, Load, Clear
- FlowStatusBar at bottom showing "Idle | Nodes: 0 | Edges: 0"
- Can drag a node from palette onto canvas
- Nodes show category label, icon, title, config preview
- Can connect nodes by dragging handles
- Can click a node to see NodePropertiesPanel
- Can edit config fields in the panel

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "feat(video-flows): final build verification and fixes"
```

---

## Self-Review Checklist

| Spec Section | Plan Task | Status |
|---|---|---|
| 1. Decisiones de Diseno | Task 1 (types, colors), all tasks | Covered |
| 2. Arquitectura de Archivos | All tasks match file structure | Covered |
| 3.1 VideoBaseNode | Task 3 | Covered |
| 3.2 Node Templates | Task 2 | Covered |
| 3.3 Categorias y Nodos (13) | Task 2 (templates) + Task 11 (handlers) | Covered |
| 4. Data Flow | Task 10 (mergeInputs) | Covered |
| 5. Motor de Ejecucion | Task 10 | Covered |
| 5.2 Topological Sort | Task 10 | Covered |
| 5.3 Handler Registry | Task 11 (index.ts) | Covered |
| 6.1 Layout Canvas-First | Task 5 (VideoFlowCanvas) | Covered |
| 6.2 Interacciones | Tasks 5-9 | Covered |
| 6.3 Drag & Drop | Task 5 (onDrop) + Task 6 (NodePalette) | Covered |
| 7.1 Tabla video_flows | Task 12 | Covered |
| 7.2 Zustand Store | Task 4 | Covered |
| 8. Nodos Detalle I/O | Task 2 (templates) + Task 11 (handlers) | Covered |
| LTR direction + handles | Task 3 (Position.Left/Right) | Covered |
| Status badge (SVG, no text) | Task 3 (StatusBadge) | Covered |
