# Video Flow Builder MVP — Design Spec

## Context

Prime Avatar necesita un pipeline visual para encadenar operaciones de generacion de contenido (imagen, video, audio, texto) en flujos reutilizables. Actualmente cada operacion (generar imagen, generar video, TTS, etc.) se ejecuta manualmente una a una desde Avatar Studio. El Flow Builder permite automatizar secuencias completas: seleccionar avatar → mejorar prompt → generar imagen → generar video → guardar.

**Scope:** Este spec cubre **Sub-proyecto 1: Video Flow Builder MVP**. El Sub-proyecto 2 (Marketing & Social Publisher con nodos de publicacion automatica) sera un spec separado.

**Referencia:** Sigue la arquitectura definida en `docs/superpowers/specs/2026-04-07-prime-avatar-ecosystem-design.md` seccion 2.2.

---

## 1. Decisiones de Diseno

| Decision | Eleccion | Razon |
|----------|----------|-------|
| Scope | 2 sub-proyectos (Flow Builder MVP primero, Marketing despues) | Evitar scope creep, entregar valor rapido |
| Nodos MVP | 13 nodos en 7 categorias | Cubrir el pipeline completo sin exceso |
| Ejecucion | Hibrida (client-side MVP, server-side despues) | No requiere infraestructura nueva ahora |
| Persistencia | Supabase directo (tabla `video_flows`) | Consistente con el stack existente |
| Layout UI | Canvas-first con paneles flotantes | Sin sidebar fijo, maximo espacio para el canvas |
| Libreria | @xyflow/react v12 (misma que AgentSoft) | Consistencia, conocimiento existente |
| Status en nodos | Badge circular SVG dentro del nodo (sin texto) | Limpio, compacto, profesional |

---

## 2. Arquitectura de Archivos

```
src/app/(protected-pages)/concepts/avatar-forge/video-flows/
├── page.tsx                          # Pagina principal con ReactFlow canvas
├── _components/
│   ├── VideoFlowCanvas.tsx           # Wrapper de ReactFlow + controles
│   ├── FlowToolbar.tsx               # Toolbar flotante (run, save, clear, zoom)
│   ├── NodePalette.tsx               # Panel flotante de nodos arrastrables
│   ├── NodePropertiesPanel.tsx       # Panel flotante de propiedades del nodo seleccionado
│   └── FlowStatusBar.tsx            # Barra inferior con status de ejecucion
├── _nodes/
│   ├── VideoBaseNode.tsx             # Nodo base con layout, handles, status badge SVG
│   ├── registry.ts                   # Mapa nodeType → componente React
│   └── templates.ts                  # Definiciones de nodos (id, label, icon, category, defaults)
├── _handlers/
│   ├── index.ts                      # Registry: nodeType → handler function
│   ├── inputHandlers.ts              # select-avatar, upload-image
│   ├── aiHandlers.ts                 # prompt-enhance, describe-image
│   ├── generationHandlers.ts         # generate-image, generate-video
│   ├── transformHandlers.ts          # stitch, text-overlay
│   ├── voiceHandlers.ts             # script-generator, text-to-speech
│   ├── logicHandlers.ts             # condition
│   └── outputHandlers.ts            # save-to-gallery, webhook
├── _engine/
│   ├── executeFlow.ts                # Topological sort + sequential execution loop
│   └── types.ts                      # ExecutionContext, NodeResult, FlowStatus
├── _store/
│   └── videoFlowStore.ts            # Zustand store (nodes, edges, execution state)
└── _constants/
    └── categoryColors.ts             # Colores por categoria
```

---

## 3. Sistema de Nodos

### 3.1 VideoBaseNode

Cada nodo en el canvas es un `VideoBaseNode` que renderiza:

```
┌─────────────────────────────────┐
│ [CATEGORY]          [status ●]  │  ← cat-label (badge color) + status icon SVG circular
│ [icon] Node Title               │  ← SVG icon + nombre
│ ┌─────────────────────────────┐ │
│ │ Config preview              │ │  ← resumen de la configuracion actual
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ OUTPUT                      │ │  ← preview de outputs esperados
│ │ key1, key2, key3            │ │
│ └─────────────────────────────┘ │
│ ○                             ○ │  ← handles (input left, output right)
└─────────────────────────────────┘
```

**Status badge:** Circulo de 18px con icono SVG:
- `idle` → sin badge (estado default)
- `running` → spinner animado (rosa, con CSS spin animation)
- `completed` → check icon (verde)
- `error` → X icon (rojo)
- `pending` → pause icon (gris, nodos en cola)

**Iconos:** Todos SVG inline (no emojis). Definidos como `<symbol>` en un sprite SVG global.

### 3.2 Node Templates

Cada tipo de nodo se define como un template:

```typescript
interface VideoNodeTemplate {
  type: string              // 'generate-image', 'prompt-enhance', etc.
  label: string             // 'Generate Image'
  category: NodeCategory    // 'generation', 'ai', 'input', etc.
  icon: string              // ID del SVG symbol ('ico-image', 'ico-sparkles')
  description: string       // Descripcion corta para el palette
  inputs: string[]          // Keys que espera recibir de nodos anteriores
  outputs: string[]         // Keys que produce
  defaultData: Record<string, unknown>  // Config inicial del nodo
}
```

### 3.3 Categorias y Nodos (13 MVP)

| Categoria | Color | Nodos | Service que invoca |
|-----------|-------|-------|--------------------|
| **Input** (#10b981 green) | SelectAvatar | — (lee del store/Supabase) |
| | UploadImage | — (file picker local) |
| **AI Processing** (#8b5cf6 purple) | PromptEnhance | GeminiService.enhancePrompt() |
| | DescribeImage | GeminiService.describeImageForPrompt() |
| **Generation** (#f43f5e rose) | GenerateImage | GeminiService.generateAvatar() |
| | GenerateVideo | KlingService.generateVideo() |
| **Transform** (#3b82f6 blue) | Stitch | VideoStitchService.stitchVideos() |
| | TextOverlay | (client-side canvas rendering) |
| **Voice** (#ec4899 pink) | ScriptGenerator | ScriptService.generateScript() |
| | TextToSpeech | MiniMaxService.textToSpeech() |
| **Logic** (#f59e0b amber) | Condition | (client-side branching) |
| **Output** (#14b8a6 teal) | SaveToGallery | server action → Supabase insert |
| | Webhook | fetch POST a URL configurada |

**Nodos que quedan para fase 2 (Marketing sub-proyecto):**
- PublishInstagram, PublishTikTok, PublishYouTube
- ContentCalendar, CrossPost
- ApprovalGate, Loop, Delay

---

## 4. Data Flow entre Nodos

Los nodos se comunican via un `ExecutionContext` — un mapa `nodeId → output`:

```typescript
type ExecutionContext = Map<string, Record<string, unknown>>

// Ejemplo de flujo:
// SelectAvatar produce: { avatarId, references, faceRef, measurements }
// PromptEnhance recibe: { basePrompt } (de su config) + { faceRef } (del nodo anterior)
// PromptEnhance produce: { enhancedPrompt }
// GenerateImage recibe: { enhancedPrompt, references, faceRef } (merge de anteriores)
// GenerateImage produce: { imageUrl, fullApiPrompt }
```

**Resolucion de inputs:** Cuando un nodo tiene multiples conexiones entrantes, sus inputs son el merge de todos los outputs de nodos conectados. Si hay colision de keys, el nodo conectado mas recientemente gana.

---

## 5. Motor de Ejecucion

### 5.1 Client-Side (MVP)

```typescript
async function executeFlow(
  nodes: VideoFlowNode[],
  edges: Edge[],
  store: VideoFlowStore
): Promise<void> {
  const sorted = topologicalSort(nodes, edges)
  const context: ExecutionContext = new Map()

  for (const node of sorted) {
    store.setNodeStatus(node.id, 'running')

    // Recolectar inputs de nodos anteriores conectados
    const incomingEdges = edges.filter(e => e.target === node.id)
    const inputs = mergeInputs(incomingEdges, context)

    try {
      const handler = handlers[node.data.type]
      const result = await handler(node, inputs, context)
      context.set(node.id, result.output)
      store.setNodeStatus(node.id, 'completed')
    } catch (error) {
      store.setNodeStatus(node.id, 'error')
      store.setExecutionError(node.id, error.message)
      break  // Detener ejecucion en primer error
    }
  }
}
```

### 5.2 Topological Sort

Standard Kahn's algorithm. Detecta ciclos y los rechaza antes de ejecutar.

### 5.3 Handler Registry

```typescript
const handlers: Record<string, VideoNodeHandler> = {
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

Cada handler es un `async function` que recibe `(node, inputs, context)` y retorna `{ output: Record<string, unknown> }`. Los handlers de generacion (image, video, TTS) llaman a los server actions/services existentes — no hay API nueva.

---

## 6. UI e Interacciones

### 6.1 Layout Canvas-First

```
┌──────────────────────────────────────────────────┐
│ ┌─ FlowToolbar (flotante top-left) ────────────┐ │
│ │ [Run ▶] [Save] [Clear] [+Zoom] [-Zoom] [Fit] │ │
│ └───────────────────────────────────────────────┘ │
│                                                    │
│              ReactFlow Canvas                      │
│         (nodos + edges + minimap)                  │
│                                                    │
│ ┌─ NodePalette ─┐  ┌─ NodeProperties ──────────┐ │
│ │ (flotante      │  │ (flotante derecha,        │ │
│ │  izquierda,    │  │  aparece al seleccionar   │ │
│ │  colapsable)   │  │  un nodo)                 │ │
│ └────────────────┘  └──────────────────────────┘ │
│ ┌─ FlowStatusBar (bottom) ─────────────────────┐ │
│ │ Status: Idle | Nodes: 4 | Last run: 2m ago   │ │
│ └───────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 6.2 Interacciones Principales

1. **Agregar nodo:** Drag from NodePalette → drop en canvas. O doble-click en palette item.
2. **Conectar nodos:** Drag desde handle de output → handle de input de otro nodo. Validacion: solo permite conexiones compatibles (output keys → input keys).
3. **Configurar nodo:** Click en nodo → abre NodePropertiesPanel flotante a la derecha con los campos de configuracion especificos del tipo de nodo.
4. **Ejecutar flow:** Click "Run" → ejecuta secuencialmente, badges de status se actualizan en tiempo real.
5. **Guardar flow:** Click "Save" → serializa nodes + edges + config → upsert en Supabase `video_flows`.
6. **Cargar flow:** Selector en toolbar para elegir un flow guardado.

### 6.3 Drag & Drop

Usar el patron de ReactFlow `onDragOver` + `onDrop`:
- NodePalette items tienen `draggable` con `dataTransfer.setData('nodeType', type)`
- Canvas `onDrop` lee el tipo, crea el nodo en la posicion del drop

---

## 7. Persistencia (Supabase)

### 7.1 Tabla `video_flows`

```sql
create table video_flows (
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

-- RLS: usuarios solo ven sus propios flows
alter table video_flows enable row level security;

create policy "Users can CRUD own flows"
  on video_flows for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index para listar flows del usuario
create index idx_video_flows_user on video_flows(user_id, updated_at desc);
```

### 7.2 Zustand Store (client-side)

```typescript
interface VideoFlowStore {
  // Canvas state
  nodes: Node[]
  edges: Edge[]
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect

  // Flow metadata
  flowId: string | null
  flowName: string
  isDirty: boolean

  // Execution state
  executionStatus: 'idle' | 'running' | 'completed' | 'error'
  nodeStatuses: Map<string, NodeStatus>
  executionError: { nodeId: string; message: string } | null

  // Actions
  addNode: (type: string, position: XYPosition) => void
  removeNode: (id: string) => void
  setNodeData: (id: string, data: Partial<NodeData>) => void
  setNodeStatus: (id: string, status: NodeStatus) => void
  executeFlow: () => Promise<void>
  saveFlow: () => Promise<void>
  loadFlow: (id: string) => Promise<void>
  clearCanvas: () => void
}
```

**No se persiste en sessionStorage** — los flows viven en Supabase. El store es solo runtime.

---

## 8. Nodos — Detalle de I/O

| Nodo | Inputs | Outputs | Config |
|------|--------|---------|--------|
| SelectAvatar | — | avatarId, references[], faceRef, measurements | avatar picker |
| UploadImage | — | imageUrl, imageBase64 | file upload |
| PromptEnhance | basePrompt (config o upstream) | enhancedPrompt | style, intensity |
| DescribeImage | imageUrl | description | detail level |
| GenerateImage | prompt, references?, faceRef? | imageUrl, fullApiPrompt | model, aspect, camera, cinema |
| GenerateVideo | imageUrl | videoUrl, taskId | duration, mode, motion |
| Stitch | videoUrls[] | stitchedVideoUrl | transition type |
| TextOverlay | imageUrl or videoUrl | outputUrl | text, position, font, color |
| ScriptGenerator | topic (config) | script, duration | tone, language, template |
| TextToSpeech | text (script or config) | audioUrl, duration | voiceId, speed, language |
| Condition | any upstream value | (routes to true/false branch) | field, operator, value |
| SaveToGallery | imageUrl or videoUrl | galleryItemId, savedUrl | collection name |
| Webhook | any upstream data | responseStatus | url, method, headers |

---

## 9. Fuera de Scope (MVP)

- Nodos de publicacion social (Instagram, TikTok, YouTube) → Sub-proyecto 2
- Ejecucion server-side / scheduled flows
- Templates de flujos pre-armados (marketplace)
- Colaboracion multi-usuario en tiempo real
- Versionado de flows
- Nodos Loop, Delay, ApprovalGate
- Analytics de ejecucion
