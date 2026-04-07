# Prime Avatar — Ecosystem Design Spec

## Context

Prime Avatar es una plataforma de generacion de avatares y videos con IA que actualmente existe como app Next.js standalone. Este spec define la estrategia para convertirla en un producto monetizable dentro del ecosistema AgentSoft, aprovechando la infraestructura multi-tenant, billing, y auth existente.

**Problema:** Prime Avatar tiene tecnologia funcional (Kling AI, Gemini, FFmpeg) pero cero usuarios, cero revenue, y cero infraestructura de negocio (auth, billing, multi-tenancy).

**Solucion:** Integrar Prime Avatar como super-tenant de AgentSoft (hereda 20+ semanas de infraestructura) + mantener el engine de generacion como microservicio independiente.

---

## 1. Arquitectura de Alto Nivel

### 1.1 Super-Tenant dentro de AgentSoft

Prime Avatar se convierte en el 4to (o 5to) super-tenant:

```
AgentSoft Core (Auth, Billing, Multi-tenant, ECME UI)
├── SalesBot ST    → salesbot.mx
├── Eventika ST    → eventika.app
├── PromoSoft ST   → promosoft.mx
└── PrimeAvatar ST → primeavatar.com  ← NUEVO
```

**Hereda sin codigo nuevo:**
- Supabase Auth + middleware de proteccion de rutas
- Deteccion de ST por dominio con cache + fallback
- Stripe billing (plans, checkout, webhooks, auto-suspend)
- Trial de 7 dias
- Onboarding flow
- Landing page builder
- Domain org isolation
- Role-based access (superadmin, admin, user)
- i18n (en, es, zh, ar) con RTL
- ECME UI components, temas, layouts
- Platform admin (/platform/*)
- File manager
- Contacts system

### 1.2 Video Generation Microservice

El engine de generacion vive como API REST independiente:

```
┌──────────────────────────────────────────────┐
│  Video Generation API (microservicio)         │
│                                               │
│  POST /api/v1/generate/image                  │
│  POST /api/v1/generate/video                  │
│  POST /api/v1/generate/avatar-video           │
│  POST /api/v1/flows/execute                   │
│  GET  /api/v1/tasks/{taskId}/status           │
│  GET  /api/v1/tasks/{taskId}/result           │
│  POST /api/v1/prompts/enhance                 │
│  POST /api/v1/prompts/safety-check            │
│  POST /api/v1/lora/train                      │
│  GET  /api/v1/lora/{modelId}/status           │
│  POST /api/v1/voice/clone                     │
│  POST /api/v1/voice/tts                       │
│  POST /api/v1/script/generate                 │
│  POST /api/v1/audio/merge                     │
│                                               │
│  Auth: API Key per organization               │
│  Callback: webhook URL on completion          │
│                                               │
│  Providers:                                   │
│  ├── Kling AI (SFW video/avatar, v1-v2.6)     │
│  ├── Google Gemini (prompt enhance, safety)    │
│  ├── Graydient AI (NSFW imagen + video)        │
│  │   ├── Flux (imagen NSFW, top-tier)          │
│  │   ├── SkyReels V4 (video NSFW, #2 global)  │
│  │   ├── HunYuan 1.5 (video alt, 96.4% VQ)    │
│  │   └── LoRA Training (avatar cloning)        │
│  ├── MiniMax Speech 2.8 HD (voice clone + TTS) │
│  │   ├── Voice Clone (99%+ con 5s de audio)    │
│  │   ├── TTS 40+ idiomas inc. español          │
│  │   └── Cross-lingual (clona ES → genera EN)  │
│  ├── fal.ai (NSFW fallback)                    │
│  └── FFmpeg WASM (stitch, resize)             │
└──────────────────────────────────────────────┘
```

**Deployment:** Mismo stack que AgentSoft — Next.js 15 en Vercel (o similar). Repo separado, deployment separado. Puede ser un app Next.js con solo API routes (sin frontend).

**Consumers:**
1. Prime Avatar ST (frontend directo)
2. SalesBot ST (nodo GenerateVideoNode en Flow Builder)
3. Eventika ST (nodo GenerateVideoNode en Flow Builder)
4. API publica (clientes externos, futuro)

### 1.3 Comunicacion entre sistemas

```
AgentSoft (cualquier ST)
    │
    │  POST /api/v1/generate/avatar-video
    │  Headers: { x-api-key: org_api_key }
    │  Body: { avatarId, prompt, type, callbackUrl, ... }
    │
    ▼
Video Generation API
    │
    │  1. Valida API key → identifica org + plan → verifica creditos
    │  2. Encola generacion
    │  3. Responde: { taskId, status: "processing" }
    │  4. Genera con Kling/Gemini/Graydient
    │  5. Almacena resultado en Supabase Storage
    │  6. POST callbackUrl → { taskId, status: "completed", resultUrl }
    │
    ▼
AgentSoft recibe webhook → continua flow/muestra en gallery
```

---

## 2. Modulos Nuevos para Prime Avatar ST

### 2.1 Video Studio (migrar de Prime Avatar actual)

**Ruta:** `/concepts/avatar-forge/avatar-studio/` → `/video-studio/`

Migrar los componentes existentes de Prime Avatar al repo de AgentSoft:
- AvatarStudioMain
- AvatarEditDrawer
- PromptTextareaWithTags
- GalleryPanel
- ReferencePanel
- BottomControlBar
- Kling controls (voice, camera, motion)
- avatarStudioStore.ts (Zustand)

**Adaptaciones necesarias:**
- Reemplazar auth de NextAuth → Supabase Auth (ya en AgentSoft)
- Reemplazar llamadas directas a Kling/Gemini → llamadas al microservicio API
- Agregar organization_id a todas las queries
- Usar file-manager existente de AgentSoft para media

### 2.2 Video Flow Builder (NUEVO)

**Ruta:** `/video-flows/`

Clonar la arquitectura del Flow Builder de AgentSoft con nodos especificos de video:

**Archivos a clonar y adaptar:**
```
src/components/flow-builder/          →  src/components/video-flow-builder/
├── FlowBuilder.tsx                   →  VideoFlowBuilder.tsx
├── FlowBuilderContext.tsx            →  VideoFlowBuilderContext.tsx
├── FlowToolbar.tsx                   →  VideoFlowToolbar.tsx
├── nodes/BaseNode.tsx                →  nodes/VideoBaseNode.tsx
├── hooks/useFlowBuilder.ts          →  hooks/useVideoFlowBuilder.ts
├── hooks/useFlowActions.ts          →  hooks/useVideoFlowActions.ts
├── hooks/useFlowDragDrop.ts         →  hooks/useVideoFlowDragDrop.ts
├── hooks/useFlowValidation.ts       →  hooks/useVideoFlowValidation.ts
├── shared/types.ts                  →  shared/videoFlowTypes.ts
├── categoryColors.ts                →  videoCategoryColors.ts
├── properties/                      →  properties/ (nuevo dispatcher)
└── node-templates/categories/       →  node-templates/categories/ (nuevas)
```

**Categorias de nodos:**

| Categoria | Color | Nodos |
|-----------|-------|-------|
| **video-input** | #10b981 (green) | UploadImage, UploadVideo, SelectAvatar, URLInput, CatalogInput |
| **ai-processing** | #8b5cf6 (purple) | PromptEnhance, FaceAnalysis, SafetyCheck, DescribeImage, TranslatePrompt |
| **generation** | #f43f5e (rose) | GenerateImage, GenerateVideo, ImageToVideo, AvatarVideo, MotionTransfer |
| **transform** | #3b82f6 (blue) | Resize, Stitch, AddTextOverlay, AddMusic, Trim, Transition |
| **logic** | #f59e0b (amber) | Condition, Loop, ApprovalGate, Delay, Variable |
| **output** | #14b8a6 (teal) | SaveToGallery, ExportFile, Webhook, PublishSocial, SendWhatsApp |

**Execution Engine:**
Clonar WorkflowExecutionEngine de AgentSoft. Mismo patron handler-based:

```typescript
type VideoNodeHandler = (
  node: VideoFlowNode,
  context: VideoExecutionContext
) => Promise<VideoNodeResult>

// Los handlers llaman al microservicio API:
handlers = {
  'generate-image':   → POST /api/v1/generate/image
  'generate-video':   → POST /api/v1/generate/video
  'avatar-video':     → POST /api/v1/generate/avatar-video
  'enhance-prompt':   → POST /api/v1/prompts/enhance
  'stitch':           → FFmpeg local (client-side) o server-side
  'publish-instagram': → Meta Graph API
  'publish-tiktok':   → TikTok Content Posting API
  'approval-gate':    → Pausa ejecucion, notifica usuario
  'webhook':          → POST al callbackUrl configurado
}
```

### 2.3 Social Publisher (NUEVO — compartido)

**Componente reutilizable** entre Prime Avatar ST y potencialmente otros STs.

**APIs a integrar:**
- **Instagram Reels/Posts:** Meta Graph API (Content Publishing API)
- **Facebook Video:** Meta Graph API
- **TikTok:** TikTok Content Posting API v2
- **YouTube Shorts:** YouTube Data API v3

**Flujo de conexion de cuentas:**
1. Usuario va a Settings → Social Accounts
2. Conecta cuenta via OAuth (Meta Login, TikTok Login, Google OAuth)
3. Tokens se almacenan encriptados en `social_accounts` table
4. Al publicar, el sistema usa el token para postear via API

**Funcionalidades:**
- Publicacion inmediata o programada
- Content Calendar (vista calendario con posts programados)
- Multi-plataforma en un click (CrossPost)
- Metricas basicas (views, likes, shares) via API de cada plataforma
- Reutiliza patron poll-scheduled de AgentSoft para scheduling exacto

### 2.4 Voice & Script Studio (NUEVO)

**Ruta:** `/voice-studio/`

Modulo completo de voz y guiones que cierra el pipeline de contenido. Sin esto, los avatar videos son mudos o con voz generica.

**Pipeline completo:**
```
Input (tema/producto/contexto)
    ↓
Script Generator (Gemini) → Guion con hook, body, CTA
    ↓
Voice Clone (MiniMax 2.8 HD) → Voz personalizada del usuario (5s de audio)
    ↓
TTS (MiniMax 2.8 HD) → Audio con la voz clonada leyendo el guion
    ↓
Audio Merge (FFmpeg) → Combina audio + video generado
    ↓
Video final con voz personalizada
```

**Script Generator:**
- Powered by Gemini (ya integrado) con prompt templates especializados
- Templates por caso de uso: property-tour, product-review, ugc-ad, greeting, tutorial
- Parametros: tono (profesional/casual/divertido), duracion target, idioma, CTA
- Multi-idioma: genera guion en español → traduce a inglés manteniendo naturalidad

**Voice Cloning (MiniMax Speech 2.8 HD):**
- Clona voz con solo 5 segundos de audio (99%+ similitud)
- "Fluent LoRA": pule audio con acento imperfecto automaticamente
- Cross-lingual: clona voz en español → genera audio en inglés/portugués/etc. con la misma voz
- Costo: $3 USD por voz clonada, $0.10/1K chars para TTS HD
- 40+ idiomas con code-switching natural
- #1 en Hugging Face TTS Arena y Artificial Analysis Speech Arena (ELO 1164)

**Funcionalidades UI:**
- Voice Library: lista de voces clonadas por la organizacion
- Script Editor: editor de guiones con preview de audio en tiempo real
- Audio Preview: escuchar TTS antes de generar video
- Batch TTS: generar multiples audios de golpe (para series de videos)

**Nodos nuevos para Video Flow Builder:**

| Nodo | Categoria | Funcion |
|------|-----------|---------|
| ScriptGenerator | voice (#ec4899 pink) | Genera guion con Gemini segun contexto |
| VoiceClone | voice | Clona voz desde audio de referencia |
| TextToSpeech | voice | Convierte guion a audio con voz clonada |
| AudioOverlay | transform (#3b82f6 blue) | Merge audio + video en video final |

### 2.5 Video Analytics Dashboard (NUEVO)

**Metricas por generacion:**
- Creditos consumidos, costo estimado
- Tiempo de generacion promedio
- Tasa de exito/fallo por provider
- Tipos de contenido generado (imagen vs video, aspect ratios)

**Metricas sociales (si Social Publisher activo):**
- Views, likes, comments, shares por plataforma
- Best performing content
- Engagement rate trending
- Optimal posting times

---

## 3. Base de Datos

### 3.1 Tablas nuevas (en Supabase compartido de AgentSoft)

```sql
-- Avatares del usuario
avatars (
  id uuid PK,
  organization_id uuid FK → organizations,
  user_id uuid FK → users,
  name text,
  identity_weight float,
  measurements jsonb,
  face_description text,
  created_at, updated_at
)

-- Imagenes de referencia de avatares
avatar_references (
  id uuid PK,
  avatar_id uuid FK → avatars,
  type text, -- face, angle, body, general
  storage_path text,
  created_at
)

-- Generaciones (imagenes/videos generados)
generations (
  id uuid PK,
  organization_id uuid FK,
  user_id uuid FK,
  avatar_id uuid FK → avatars (nullable),
  media_type text, -- IMAGE, VIDEO
  prompt text,
  provider text, -- kling, gemini, graydient, fal
  model text, -- kling-v2.6, flux-1, skyreels-v4, hunyuan-1.5, etc.
  storage_path text,
  metadata jsonb, -- aspect_ratio, duration, resolution, etc.
  is_nsfw boolean DEFAULT false,
  cost_credits integer,
  status text, -- pending, processing, completed, failed
  task_id text, -- ID del provider para polling
  created_at
)

-- Video Flows (recetas de video)
video_flows (
  id uuid PK,
  organization_id uuid FK,
  user_id uuid FK,
  name text,
  description text,
  nodes jsonb, -- ReactFlow nodes
  edges jsonb, -- ReactFlow edges
  trigger_config jsonb,
  status text, -- draft, published
  is_template boolean DEFAULT false,
  template_category text, -- property-tour, ugc-ad, content-calendar, etc.
  execution_count integer DEFAULT 0,
  created_at, updated_at
)

-- Ejecuciones de flows
video_flow_executions (
  id uuid PK,
  flow_id uuid FK → video_flows,
  organization_id uuid FK,
  status text, -- running, completed, failed, paused (approval gate)
  input_data jsonb,
  output_data jsonb,
  credits_consumed integer,
  started_at, completed_at,
  error_message text
)

-- Cuentas sociales conectadas
social_accounts (
  id uuid PK,
  organization_id uuid FK,
  platform text, -- instagram, tiktok, youtube, facebook
  platform_user_id text,
  platform_username text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[],
  is_active boolean DEFAULT true,
  created_at, updated_at
)

-- Posts publicados
social_posts (
  id uuid PK,
  organization_id uuid FK,
  social_account_id uuid FK → social_accounts,
  generation_id uuid FK → generations (nullable),
  flow_execution_id uuid FK (nullable),
  platform text,
  platform_post_id text,
  caption text,
  media_url text,
  status text, -- draft, scheduled, publishing, published, failed
  scheduled_at timestamptz,
  published_at timestamptz,
  metrics jsonb, -- { views, likes, comments, shares }
  created_at
)

-- Creditos por organizacion
credit_balances (
  id uuid PK,
  organization_id uuid FK,
  balance integer DEFAULT 0,
  total_purchased integer DEFAULT 0,
  total_consumed integer DEFAULT 0,
  updated_at
)

-- Transacciones de creditos
credit_transactions (
  id uuid PK,
  organization_id uuid FK,
  type text, -- purchase, consumption, refund, bonus
  amount integer, -- positivo o negativo
  description text,
  reference_id uuid, -- generation_id, flow_execution_id, etc.
  created_at
)

-- API keys para acceso externo
api_keys (
  id uuid PK,
  organization_id uuid FK,
  key_hash text, -- hash del API key (nunca se guarda en texto plano)
  key_prefix text, -- primeros 8 chars para identificacion (pa_live_xxxx...)
  name text,
  scopes text[], -- generate, flows, publish
  is_active boolean DEFAULT true,
  last_used_at timestamptz,
  created_at
)

-- Voces clonadas
cloned_voices (
  id uuid PK,
  organization_id uuid FK,
  user_id uuid FK,
  avatar_id uuid FK → avatars (nullable), -- vincular voz a avatar
  name text, -- "Voz de Carlos", "Voz profesional"
  provider text, -- minimax
  provider_voice_id text, -- ID de la voz en MiniMax
  sample_audio_url text, -- URL del audio original usado para clonar
  language text, -- idioma principal (es, en, etc.)
  status text, -- cloning, ready, failed
  created_at, updated_at
)

-- Guiones generados
audio_scripts (
  id uuid PK,
  organization_id uuid FK,
  user_id uuid FK,
  generation_id uuid FK → generations (nullable),
  title text,
  script_text text,
  language text,
  tone text, -- professional, casual, funny, persuasive
  duration_target_seconds integer,
  template_type text, -- property-tour, ugc-ad, greeting, tutorial, etc.
  context jsonb, -- datos del producto/servicio para generar el guion
  created_at
)

-- Modelos LoRA entrenados (avatar cloning via Graydient)
lora_models (
  id uuid PK,
  organization_id uuid FK,
  user_id uuid FK,
  avatar_id uuid FK → avatars (nullable),
  name text,
  graydient_model_id text, -- ID del modelo en Graydient
  status text, -- training, ready, failed
  training_images text[], -- URLs de imagenes usadas para entrenar
  trigger_word text, -- palabra clave para activar el LoRA en prompts
  created_at, updated_at
)

-- Prompts guardados
saved_prompts (
  id uuid PK,
  organization_id uuid FK,
  user_id uuid FK,
  name text,
  prompt_text text,
  media_type text,
  category text,
  is_pinned boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  created_at
)
```

### 3.2 RLS Policies

Todas las tablas nuevas siguen el patron existente de AgentSoft:
- `organization_id = auth.uid() → users.organization_id`
- Superadmin bypasses via org_override cookie
- Service role para operaciones del microservicio

---

## 4. Monetizacion

### 4.1 Plans de Prime Avatar ST

| Plan | Precio MXN/mes | USD aprox. | Creditos/mes | Social Accounts | Flows | API |
|------|----------------|-----------|-------------|-----------------|-------|-----|
| **Creator** | $499 | $29 | 50 | 2 | 5 | No |
| **Pro** | $1,299 | $75 | 200 | 5 | 20 | No |
| **Business** | $2,499 | $145 | 1,000 | Unlimited | Unlimited | Si |
| **Agency** | $4,999 | $290 | 5,000 | Unlimited | Unlimited | Si + White Label |

### 4.2 Creditos adicionales (pay-per-use)

| Paquete | Precio MXN | Creditos |
|---------|-----------|----------|
| Starter Pack | $99 | 20 |
| Value Pack | $399 | 100 |
| Power Pack | $999 | 300 |
| Bulk Pack | $1,999 | 750 |

### 4.3 Costos de API por operacion (creditos)

| Operacion | Creditos | Costo real API aprox. |
|-----------|----------|----------------------|
| Generar imagen SFW (Kling) | 1 | ~$0.03 |
| Generar imagen NSFW (Graydient/Flux) | 2 | ~$0.00* |
| Generar video 5s SFW (Kling) | 5 | ~$0.15 |
| Generar video 10s SFW (Kling) | 8 | ~$0.30 |
| Generar video NSFW (Graydient/SkyReels) | 6 | ~$0.00* |
| Avatar video con voz (Kling) | 10 | ~$0.40 |
| Avatar clone via LoRA (Graydient) | 20 | ~$0.00* |
| Voice Clone (MiniMax 2.8) | 5 | ~$3.00 |
| TTS 30s script (MiniMax 2.8 HD) | 2 | ~$0.05 |
| Script generation (Gemini) | 1 | ~$0.02 |
| Audio merge (FFmpeg) | 0 | $0 (server-side) |
| Enhance prompt (Gemini) | 0.5 | ~$0.01 |
| Safety check (Gemini) | 0.5 | ~$0.01 |
| Video stitch (FFmpeg) | 0 | $0 (client-side) |
| Publicar en social | 0 | $0 (API gratuita) |

\* Graydient es plan fijo $42 USD/mes con generaciones ilimitadas. El costo marginal por generacion es ~$0.00, lo que significa que cada credito NSFW vendido es **ganancia pura** despues de cubrir la suscripcion fija.

**Markup promedio SFW: ~300-500% sobre costo real.**
**Markup NSFW: ~infinito** (costo fijo $42/mes, revenue por creditos ilimitado).

### 4.4 Revenue por ST cruzado

Cuando SalesBot o Eventika usan el engine de generacion:
- El credito se descuenta del balance de la org dentro de ese ST
- Se agrega como "modulo premium" a los planes de SalesBot/Eventika
- Ejemplo: Plan Pro de SalesBot (+$599 MXN/mes add-on "Video AI", incluye 30 creditos)

---

## 5. Fases de Implementacion

### Fase 1: Foundation (Semanas 1-3)
**Objetivo:** Prime Avatar como super-tenant funcional con Video Studio

- Crear super-tenant "primeavatar" en DB de AgentSoft
- Configurar dominio primeavatar.com → AgentSoft
- Agregar `DOMAIN_TO_ST` entry en middleware
- Migrar Avatar Studio components de prime-avatar repo → agentsoft repo
- Adaptar a Supabase Auth (reemplazar NextAuth)
- Crear tablas nuevas (avatars, generations, credit_balances, etc.)
- Configurar navigation modules para Prime Avatar ST
- Landing page custom via landing-builder existente

### Fase 2: Video Generation API + Voice Engine (Semanas 3-6)
**Objetivo:** Microservicio API funcionando con video Y voz

- Extraer KlingService, GeminiService de prime-avatar → microservicio independiente
- Implementar API REST (generate/image, generate/video, generate/avatar-video)
- Sistema de API keys y autenticacion
- Sistema de creditos (deduccion, validacion de balance)
- Webhook callbacks
- Adaptar Video Studio frontend para llamar al API en vez de servicios directos
- **Voice Engine:**
  - MiniMaxService: voice clone (Speech 2.8 HD) + TTS con 40+ idiomas
  - ScriptService: generacion de guiones con Gemini + templates por caso de uso
  - AudioMergeService: merge audio + video via FFmpeg server-side
  - Tablas: cloned_voices, audio_scripts
  - Voice Studio UI: voice library, script editor, audio preview

### Fase 3: Video Flow Builder (Semanas 6-9)
**Objetivo:** Flow builder visual para pipelines de video

- Clonar flow-builder de AgentSoft → video-flow-builder
- Implementar nodos de video (Input, AI, Generation, Transform, Logic, Output)
- VideoWorkflowExecutionEngine con handlers para cada nodo
- Properties panels para configuracion de cada nodo
- Guardar/cargar flows (video_flows table)
- Templates pre-hechos (Property Tour, UGC Ad, Content Calendar)

### Fase 4: Social Publisher (Semanas 9-11)
**Objetivo:** Publicacion automatica en IG/TT/YT/FB

- OAuth connection flow para Meta, TikTok, Google
- Social accounts management UI
- Publish nodes en Video Flow Builder
- Scheduling con patron poll-scheduled
- Content Calendar UI (vista calendario)
- Basic social metrics

### Fase 5: Cross-ST Integration (Semanas 11-13)
**Objetivo:** SalesBot y Eventika pueden generar video

- Agregar nodo GenerateVideoNode al flow builder de AgentSoft
- Nodo consume Video Generation API con API key de la org
- UI de configuracion del nodo (seleccionar avatar, prompt, etc.)
- Creditos como add-on a planes de SalesBot/Eventika

### Fase 6: Vertical Adulto (Semanas 13-15)
**Objetivo:** Provider NSFW con Graydient AI y plan premium

- Integrar Graydient AI como provider en microservicio ($42 USD/mes plan ilimitado)
  - **Imagen NSFW:** Flux (Black Forest Labs) — mejor modelo open-source de imagen
  - **Video NSFW:** SkyReels V4 (#2 global, ELO 1129) y HunYuan 1.5 (96.4% visual quality)
  - **LoRA Training:** Entrenamiento de modelos personalizados para avatar cloning sin conocimiento tecnico
  - **API REST:** `https://cloud.graydient.ai/api/` con endpoints para generate, train, status
- fal.ai como fallback NSFW (por si Graydient tiene downtime)
- Feature flag "nsfw" en plans (Pro+ solamente)
- Ajustar safety check: SFW → Gemini safety, NSFW → skip safety + route a Graydient
- ConditionNode en Video Flow Builder: detecta SFW/NSFW y rutea al provider correcto
- Payment processor alternativo si Stripe bloquea contenido adulto (Epoch, CCBill)

### Fase 7: API Publica + White Label (Semanas 15-17)
**Objetivo:** Abrir API para clientes externos

- Documentacion de API publica
- Dashboard de API usage
- Rate limiting por plan
- White label para plan Agency (branding custom)

---

## 6. Verificacion

### Como probar end-to-end:

1. **Super-tenant:** Navegar a primeavatar.com → ver landing page → registrarse → trial 7 dias → onboarding → llegar al dashboard
2. **Video Studio:** Crear avatar → subir referencias → escribir prompt → generar imagen/video → ver en gallery
3. **Video Flow Builder:** Crear flow → arrastrar nodos → conectar → ejecutar → ver resultado en gallery
4. **Social Publisher:** Conectar cuenta IG → crear video → publicar → verificar en Instagram
5. **Voice & Script:** Clonar voz (5s audio) → generar guion → TTS con voz clonada → merge con video → reproducir
6. **Creditos:** Verificar deduccion correcta → comprar paquete extra → verificar balance
7. **Cross-ST:** En SalesBot, crear flow con nodo GenerateVideo → ejecutar → recibir video en WhatsApp
8. **API:** Generar API key → hacer POST desde Postman → recibir resultado via webhook
9. **Billing:** Plan expira → auto-suspend → renovar → reactivar

### Tests automatizados a implementar:
- Unit tests para credit system (deduccion, balance, validacion)
- Integration tests para API de generacion (mock providers)
- E2E test: registro → generacion → publicacion social
- Load test: multiples generaciones simultaneas

---

## 7. Archivos Criticos

### En AgentSoft (modificar):
- `src/middleware.ts` — agregar DOMAIN_TO_ST para primeavatar.com
- `src/configs/navigation-modules.config.ts` — agregar modulos video-studio, video-flows, voice-studio, social-publisher
- `src/configs/super-tenant-blocks.config.ts` — agregar PRIMEAVATAR_CUSTOM_BLOCKS
- `src/configs/routes.config/` — agregar rutas de Prime Avatar

### En AgentSoft (crear nuevo):
- `src/app/(protected-pages)/video-studio/` — migrado de prime-avatar
- `src/app/(protected-pages)/video-flows/` — Video Flow Builder
- `src/app/(protected-pages)/voice-studio/` — Voice & Script Studio
- `src/app/(protected-pages)/social-publisher/` — Social Publisher
- `src/components/video-flow-builder/` — componentes del flow builder
- `src/services/video-generation/` — client para el microservicio API

### En Video Generation Microservice (nuevo repo):
- `src/app/api/v1/generate/` — endpoints de generacion
- `src/services/KlingService.ts` — migrado de prime-avatar (SFW avatar/video)
- `src/services/GeminiService.ts` — migrado de prime-avatar (prompt enhance, safety)
- `src/services/GraydientService.ts` — NUEVO, provider NSFW principal
  - Endpoints: generate image (Flux), generate video (SkyReels/HunYuan), train LoRA
  - API base: `https://cloud.graydient.ai/api/`
  - Auth: API key header
  - Costo fijo: $42 USD/mes (generaciones ilimitadas)
- `src/services/MiniMaxService.ts` — NUEVO, voice clone + TTS (Speech 2.8 HD)
  - Endpoints: clone voice, generate TTS, list voices
  - API: MiniMax Platform API o via fal.ai/Replicate
  - Costo: $3/clone, $0.10/1K chars HD
- `src/services/ScriptService.ts` — NUEVO, generacion de guiones con Gemini
  - Templates por caso de uso, tono configurable, multi-idioma
- `src/services/AudioMergeService.ts` — NUEVO, merge audio + video (FFmpeg server-side)
- `src/services/FalService.ts` — NSFW fallback
- `src/services/VideoStitchService.ts` — migrado
- `src/services/ProviderRouter.ts` — NUEVO, rutea SFW→Kling, NSFW→Graydient
- `src/middleware.ts` — API key validation
- `src/lib/credits.ts` — sistema de creditos

### De prime-avatar repo (reutilizar):
- `src/services/KlingService.ts` (1,146 lineas) → microservicio
- `src/services/GeminiService.ts` (1,707 lineas) → microservicio
- `src/services/VideoStitchService.ts` (245 lineas) → microservicio
- `src/services/AvatarForgeService.ts` (439 lineas) → adaptar para AgentSoft
- `src/app/.../avatar-studio/_store/avatarStudioStore.ts` (754 lineas) → AgentSoft
- `src/app/.../avatar-studio/_components/*` → AgentSoft
- `src/@types/kling.ts` (300 lineas) → microservicio
