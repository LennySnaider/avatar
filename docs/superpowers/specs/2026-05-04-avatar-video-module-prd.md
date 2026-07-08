# PRD: Módulo `avatar-video` — Generación automática de Reels con IA

> **Status**: Draft v1.0
> **Owner**: Don Lenny
> **Created**: 2026-05-04
> **Last updated**: 2026-05-04
> **Related specs**:
> - `docs/superpowers/specs/2026-04-07-prime-avatar-ecosystem-design.md` (spec original)
> - `docs/superpowers/plans/2026-04-15-video-flow-builder.md`
> - `docs/superpowers/plans/2026-04-07-voice-script-studio.md`
> - `agentsoft/docs/superpowers/plans/2026-04-20-social-media-scheduling.md`

---

## 1. Executive Summary

Construir el módulo CAPA 4 `avatar-video` dentro de AgentSoft, disponible para los super-tenants **SalesBot, Agentika y Eventika**. El módulo permite a las organizaciones generar Reels/TikToks automáticamente desde sus propios contenidos (fotos de propiedades, platillos, autos, antes-después, etc.) usando un avatar AI con voz clonada del agente, presentador o embajador de marca, y publicarlos automáticamente en redes sociales.

**Pivote estratégico**: NO se implementa Prime Avatar como super-tenant separado en Año 1. Se construye como módulo global con microservicio de generación independiente, permitiendo spin-off futuro a `primeavatar.com` cuando los datos validen ARPU lift y demand externa.

**Verticales target (Fase 1-3)**: real-estate, food, automotive, beauty, fitness, eventos, ecommerce. Verticales fuera del scope inicial (healthcare, education, professional-services, banca, legal) reciben features modificadas en fases posteriores o quedan excluidas.

**Unit economics esperados**:
- ARPU lift por org SalesBot Pro+: +$500-1,000 MXN/mes
- Costo marginal por video generado: ~$0.30 USD (~$5 MXN)
- Margen de contribución por video: 90-95%
- MRR objetivo Año 1: $182K MXN/mes ($2.19M MXN/año)

---

## 2. Context & Problem Statement

### 2.1 Problema del cliente final

Las PyMEs mexicanas que usan SalesBot/Agentika/Eventika enfrentan un cuello de botella idéntico: necesitan generar contenido visual constante para redes sociales pero **no tienen presupuesto para producción audiovisual** ni el tiempo para hacerlo manualmente.

Casos concretos por vertical:

| Vertical | Pain actual | Costo/tiempo manual |
|----------|-------------|---------------------|
| Real estate | Cada propiedad necesita un video tour publicado en IG/TikTok | 3-4 horas/video, $500-1,500 MXN editor freelance |
| Restaurantes | Especiales del día requieren contenido fresco diario | 1-2 horas/post, baja tasa de publicación |
| Beauty/estéticas | Antes-después visualmente potentes pero el estilista no edita video | 0 publicación o video amateur |
| Concesionarios | Cada unidad seminueva debe ser viralizada para mover inventario | $300-800 MXN/unidad si tercerizan |
| Gimnasios | Transformaciones de clientes son contenido oro pero requieren edición | Trainer no es editor |

### 2.2 Lo que ya existe en AgentSoft

- **Multi-tenant infrastructure** con RLS por `organization_id`
- **Plan-features matrix** con feature flags y categorías
- **Module system CAPA 4** (e-commerce, loyalty, marketing, social-media, reviews, landing-pages)
- **Social Media Scheduling Module** (publicación a 10 plataformas vía Upload-Post BSP) — *fundamento para auto-post*
- **WhatsApp + Voice Agents** para captura de input del usuario
- **Landing Builder** con 44 templates en 13 verticales
- **44 templates de landing** distribuidos en `landing-templates.config.ts`

### 2.3 Lo que falta (gap análisis)

| Capacidad | Existe en AgentSoft | Existe en Prime Avatar repo | Gap |
|-----------|---------------------|----------------------------|-----|
| Avatar consistency (multi-angle) | ❌ | ✅ FaceIdentityData + multi-angle refs | Migrar a AgentSoft |
| LoRA training pipeline | ❌ | ✅ Spec con Graydient | Implementar en microservicio |
| Voice cloning | ❌ | 🟡 Spec MiniMax | Implementar |
| Script generation por vertical | 🟡 Genérico | 🟡 Genérico | Crear templates por vertical |
| Image-to-video pan/zoom | ❌ | ❌ | Implementar (Ken Burns automation) |
| Avatar+B-roll merge | ❌ | 🟡 FFmpeg parcial | Implementar |
| Auto-publish a redes | ✅ | ❌ | Reusar `social-media` module |
| Property/Menu/Vehicle/etc. schemas | 🟡 Parcial | ❌ | Diseñar por vertical |

---

## 3. Goals & Non-Goals

### 3.1 Goals (qué SÍ hace este PRD)

- **G1**: Definir el módulo `avatar-video` con todas sus features, sub-features y feature flags consistentes con el patrón actual de `usePlanFeatures`.
- **G2**: Especificar el schema completo de Supabase (tablas + RLS) para las nuevas entidades.
- **G3**: Especificar los plan tiers diferenciados por super-tenant (SalesBot, Agentika, Eventika) con pricing y límites.
- **G4**: Definir los 7 verticales killer en alcance, sus templates de video y configuraciones.
- **G5**: Definir contratos API entre el módulo (frontend) y el microservicio de generación.
- **G6**: Definir métricas de éxito (NSM, activation, retention, ARPU lift) y triggers para spin-off a ST.
- **G7**: Especificar el orden de implementación con fases medibles.

### 3.2 Non-Goals (qué NO entra en este PRD)

- **NG1**: Implementación detallada del microservicio de generación (lo cubre el spec de 2026-04-07)
- **NG2**: Integración NSFW/Graydient (eliminada del roadmap principal por riesgo legal)
- **NG3**: Spin-off a primeavatar.com (decisión condicional Año 2)
- **NG4**: Verticales banca, legal, professional-services (no fit para Avatar+Video)
- **NG5**: API pública para clientes externos (Año 2)
- **NG6**: White label customizado por agencia (Año 2)

---

## 4. ICP & User Personas

### 4.1 Persona primaria: Agente individual

**"Carla, 34, broker inmobiliaria en Querétaro"**
- Vende 1-2 casas/mes a comisión $40-100K MXN
- Usuaria de SalesBot Pro ($999 MXN/mes)
- Tiene Instagram con 800-3K seguidores
- No sabe editar video, paga $500-1.5K MXN cuando quiere algo "bonito"
- Trigger de pago: si gasta menos de $2K MXN extra y obtiene 1 lead más al mes, ROI positivo

### 4.2 Persona secundaria: Dueño de negocio multi-empleado

**"Ricardo, 42, dueño de 2 restaurantes en CDMX"**
- 8 empleados, 2 cocineros principales
- Plan SalesBot Business ($1,999 MXN/mes)
- Necesita 2-3 posts diarios por restaurante
- Actualmente paga community manager $8K MXN/mes
- Trigger de pago: ahorro vs CM + más velocidad de publicación

### 4.3 Persona terciaria: Agencia (Agentika)

**"Sofía, 38, dueña agencia digital con 22 clientes PyME"**
- Plan Agentika Pro ($3,499 MXN/mes)
- Cada cliente requiere 8-15 posts/mes
- Equipo: 2 community managers + 1 video editor
- Trigger de pago: escalar a más clientes sin contratar más editores

### 4.4 Persona Eventika: Anfitrión de evento

**"Andrea & Pablo, 28-30, novios planeando boda"**
- Plan Eventika Premium ($899 MXN/mes)
- Quieren save-the-dates en video, recap del compromiso
- No tienen videógrafo full-time, solo para el día
- Trigger de pago: contenido viral para invitados antes y durante

---

## 5. User Stories (Jobs to be Done)

### 5.1 Onboarding (todos los verticales)

- **US-01**: Como agente, quiero crear mi avatar AI subiendo 5-15 fotos mías, para que el sistema aprenda mi rostro consistente.
- **US-02**: Como agente, quiero clonar mi voz subiendo 30 segundos de audio, para que los videos suenen como yo.
- **US-03**: Como agente, quiero ver una preview del avatar+voz antes de pagar, para validar la calidad.

### 5.2 Generación (real-estate)

- **US-10**: Como broker, quiero subir 8 fotos de una propiedad nueva por WhatsApp y recibir un Reel de 30s en mi inbox en menos de 5 minutos.
- **US-11**: Como broker, quiero aprobar el video antes de que se publique con un emoji de confirmación.
- **US-12**: Como broker, quiero que el video se publique automáticamente en mi IG, TikTok y Status WhatsApp.

### 5.3 Generación (food)

- **US-20**: Como dueño de restaurante, quiero subir 1 foto del platillo del día y recibir un Reel de 15s con el platillo girando, voz que lo describe y CTA.
- **US-21**: Como chef, quiero un avatar de "embajador" que no sea yo, sino una "host" que represente al restaurante.
- **US-22**: Como restaurante, quiero programar publicación automática diaria a las 11:00 (antes de comida) y 19:00 (antes de cena).

### 5.4 Generación (automotive)

- **US-30**: Como concesionario, quiero subir 8 fotos típicas de un auto seminuevo (frontal, ¾, interior, motor, etc.) y recibir un Reel 30s con pan/zoom inteligente.
- **US-31**: Como concesionario, quiero que el script incluya specs (marca, modelo, año, km) y mensualidad calculada automáticamente.

### 5.5 Generación (beauty)

- **US-40**: Como estilista, quiero subir foto antes y después de un servicio y recibir un Reel 15s con split-screen animado y beat drop.
- **US-41**: Como estilista, quiero que el video incluya CTA con WhatsApp.

### 5.6 Generación (fitness)

- **US-50**: Como trainer, quiero subir foto del cliente + foto de su rutina y recibir un Reel 20s testimonial.
- **US-51**: Como gym, quiero generar timelapse de transformaciones a partir de fotos en distintas fechas.

### 5.7 Generación (eventos)

- **US-60**: Como anfitrión de boda, quiero generar un save-the-date con avatar de los novios "invitando" personalizado.
- **US-61**: Como organizador de conferencia, quiero generar un teaser por speaker.

### 5.8 Generación (ecommerce)

- **US-70**: Como tienda, quiero que cada producto nuevo subido al catálogo SalesBot genere automáticamente un Reel de showcase.
- **US-71**: Como tienda, quiero usar plantilla "Lo nuevo de hoy" con voz del dueño.

### 5.9 Aprobación, edición y reposting

- **US-80**: Como cliente, quiero ver una galería con todos los videos generados (status: borrador, aprobado, publicado, archivado).
- **US-81**: Como cliente, quiero re-generar un video con prompt distinto sin pagar de nuevo si fue rechazo en preview.
- **US-82**: Como cliente, quiero pausar la publicación automática en cualquier momento.

### 5.10 Analytics y métricas

- **US-90**: Como cliente, quiero ver views/likes/comments de cada video por plataforma.
- **US-91**: Como cliente, quiero ver qué template performa mejor.
- **US-92**: Como agencia, quiero ver el dashboard de cada cliente desde mi vista de Agentika.

---

## 6. Solution Overview

### 6.1 Arquitectura del módulo

```
┌──────────────────────────────────────────────────────────┐
│ AgentSoft (existe)                                        │
│ ┌────────────────────────────────────────────────────┐   │
│ │ SalesBot ST   Agentika ST   Eventika ST           │   │
│ │ ┌──────────┐  ┌──────────┐  ┌──────────┐         │   │
│ │ │ avatar-  │  │ avatar-  │  │ avatar-  │ ← módulo │   │
│ │ │ video    │  │ video    │  │ video    │ activable│   │
│ │ │ module   │  │ module   │  │ module   │ por plan │   │
│ │ └──────────┘  └──────────┘  └──────────┘         │   │
│ └────────────────────────────────────────────────────┘   │
│ ┌────────────────────────────────────────────────────┐   │
│ │ social-media module (existente, reusado)           │   │
│ └────────────────────────────────────────────────────┘   │
└────────────────────────┬─────────────────────────────────┘
                         │ REST API + webhooks
                         ▼
┌──────────────────────────────────────────────────────────┐
│ Avatar Generation Microservice (NUEVO, repo separado)     │
│  /api/v1/avatars/train         (LoRA training)           │
│  /api/v1/voices/clone          (MiniMax voice clone)     │
│  /api/v1/voices/tts            (TTS con voz clonada)     │
│  /api/v1/scripts/generate      (Gemini script gen)        │
│  /api/v1/videos/generate       (full pipeline orchestr.)  │
│  /api/v1/jobs/{id}/status      (polling)                  │
│  /api/v1/jobs/{id}/result      (resultado)                │
└─────────┬────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────┐
│ Providers                                                  │
│  Gemini (script + safety check)                            │
│  Kling AI (avatar video SFW)                               │
│  MiniMax Speech 2.8 HD (voice clone + TTS)                 │
│  Flux + LoRA training (face consistency)                   │
│  FFmpeg WASM/server (audio merge, pan/zoom Ken Burns)     │
└──────────────────────────────────────────────────────────┘
```

### 6.2 Flujo end-to-end (real-estate como ejemplo)

1. **Onboarding (1 vez)**:
   - Carla activa avatar-video en SalesBot Pro+
   - Sube 8 fotos suyas → POST `/api/v1/avatars/train` → LoRA model entrenado en 30 min
   - Sube 30s de audio suyo → POST `/api/v1/voices/clone` → voz lista en 2 min
   - Define brand guidelines (logo inmobiliaria, color primario, CTA URL)

2. **Generación recurrente (cada propiedad)**:
   - Carla en WhatsApp: "Casa Juriquilla 4rec 3baños $4.5M" + 8 fotos
   - SalesBot AI agent extrae specs vía Gemini → guarda en tabla `properties`
   - Trigger automático crea `video_generation_job`
   - Microservicio:
     1. Genera script con Gemini usando template `realestate_showcase_30s`
     2. Genera 6 clips de 5s del avatar de Carla con Kling
     3. Genera audio con voz clonada (MiniMax)
     4. Pan/zoom inteligente sobre las 8 fotos (FFmpeg Ken Burns)
     5. Merge final: avatar intro 5s → fotos 20s → avatar CTA 5s
     6. Webhook a SalesBot con `result_url`
   - SalesBot envía preview por WhatsApp a Carla
   - Carla aprueba con ✅
   - Sistema usa social-media module para publicar a IG, TikTok, FB, WhatsApp Status

3. **Tracking**:
   - Métricas de redes sociales se llenan vía webhooks de Upload-Post (ya implementado)
   - Dashboard muestra performance por video/plataforma

### 6.3 Componentes UI principales

```
/avatar-studio                    → Editor de avatar (multi-angle refs, LoRA)
/avatar-studio/voice-clone        → Clonación de voz
/avatar-studio/avatars            → Lista de avatares de la org
/avatar-studio/gallery            → Galería de videos generados
/avatar-studio/templates          → Templates por vertical (read-only para tenant)

/avatar-flows                     → Flow Builder visual (Plan Business+)
/avatar-flows/[id]                → Edit flow

/properties                       → CRUD de propiedades (real-estate vertical)
/menu-items                       → CRUD de platillos (food vertical)
/vehicles                         → CRUD de unidades (automotive vertical)
/services                         → CRUD de servicios (beauty/fitness vertical)
/products                         → ya existe (ecommerce vertical)
/events                           → ya existe (eventos vertical)

[platform admin]
/platform/avatar-templates        → Gestión de templates globales por vertical
```

---

## 7. Functional Requirements

### 7.1 Avatar Studio

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AS-01 | Soportar upload de 5-15 fotos para entrenar LoRA | P0 |
| FR-AS-02 | Soportar multi-angle face refs (front, 3/4, profile, 3/4 back) | P1 |
| FR-AS-03 | Permitir hasta N avatares por org según plan | P0 |
| FR-AS-04 | Mostrar progreso de training en tiempo real | P0 |
| FR-AS-05 | Permitir editar `FaceIdentityData` manual para fine-tuning | P2 |
| FR-AS-06 | Permitir asignar avatar default por agente/usuario | P1 |
| FR-AS-07 | Generar test image antes de aprobar avatar (10 generaciones) | P0 |

### 7.2 Voice Clone

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-VC-01 | Aceptar audio de 30 segundos en m4a/mp3/wav | P0 |
| FR-VC-02 | Clonar via MiniMax Speech 2.8 HD | P0 |
| FR-VC-03 | Soportar cross-lingual (clonar ES → generar EN) | P2 |
| FR-VC-04 | Mostrar preview con script de prueba | P0 |
| FR-VC-05 | Permitir re-clonar reemplazando audio | P1 |
| FR-VC-06 | Asociar voice a avatar (1:1 o 1:N) | P0 |

### 7.3 Video Generation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-VG-01 | Soportar templates por vertical (5 universales mínimo) | P0 |
| FR-VG-02 | Pan/zoom Ken Burns automático sobre fotos | P0 |
| FR-VG-03 | Avatar intro + B-roll fotos + Avatar CTA | P0 |
| FR-VG-04 | Aspect ratios 9:16, 1:1, 16:9 | P0 |
| FR-VG-05 | Duraciones 15s, 20s, 25s, 30s, 60s | P0 |
| FR-VG-06 | Generación asíncrona con polling/webhook | P0 |
| FR-VG-07 | Re-generación gratis si user rechaza primer output | P1 |
| FR-VG-08 | Custom prompt overrides el template default | P2 |

### 7.4 Auto-publish

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AP-01 | Reusar `social-media` module existente | P0 |
| FR-AP-02 | Soportar IG Reels, TikTok, FB Reels, WhatsApp Status | P0 |
| FR-AP-03 | Permitir aprobación previa o publish inmediato (configurable) | P0 |
| FR-AP-04 | Soportar programación a hora específica | P1 |
| FR-AP-05 | Soportar slots queue (mejor hora) del social-media existente | P1 |

### 7.5 Analytics

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AN-01 | Métricas por video: views, likes, comments, shares | P1 |
| FR-AN-02 | Métricas agregadas por avatar/template/vertical | P1 |
| FR-AN-03 | Costo de generación tracking | P0 |
| FR-AN-04 | ROI por video (ej: leads atribuidos en SalesBot) | P2 |

### 7.6 Multi-tenant constraints

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-MT-01 | Cada avatar/voz/video aislado por `organization_id` | P0 |
| FR-MT-02 | RLS policies en TODAS las tablas | P0 |
| FR-MT-03 | Super-tenant override para superadmins | P0 |
| FR-MT-04 | Cuota de generaciones por plan, hard limit | P0 |
| FR-MT-05 | Agentika puede ver todos sus clientes (org_override pattern) | P0 |

---

## 8. Database Schema

> **Nota**: Schema diseñado siguiendo el patrón existente de AgentSoft (RLS helper functions, JWT-based auth, multi-tenant via `organization_id`). Migración ubicación: `agentsoft/supabase/migrations/2026MMDD_avatar_video_module.sql`.

### 8.1 Tablas nuevas

```sql
-- =============================================================================
-- 1) avatars — Avatares de la organización
-- =============================================================================
CREATE TABLE IF NOT EXISTS avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Identity
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  
  -- Visual identity
  identity_weight NUMERIC NOT NULL DEFAULT 50 CHECK (identity_weight BETWEEN 0 AND 100),
  face_identity_data JSONB,           -- FaceIdentityData estructurado
  measurements JSONB,                  -- height, age, body_type, etc.
  
  -- LoRA model
  lora_model_id TEXT,                 -- ID en provider (Graydient/Replicate)
  lora_provider TEXT DEFAULT 'graydient',
  lora_status TEXT DEFAULT 'pending'
    CHECK (lora_status IN ('pending', 'training', 'ready', 'failed')),
  lora_trigger_word TEXT,              -- palabra clave para activar
  
  -- Voice association
  default_voice_id UUID REFERENCES cloned_voices(id) ON DELETE SET NULL,
  
  -- Stats
  generation_count INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (organization_id, slug)
);

CREATE INDEX idx_avatars_org ON avatars(organization_id);
CREATE INDEX idx_avatars_user ON avatars(user_id);
CREATE INDEX idx_avatars_status ON avatars(lora_status);

-- =============================================================================
-- 2) avatar_references — Imágenes de referencia para entrenar/regenerar
-- =============================================================================
CREATE TABLE IF NOT EXISTS avatar_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avatar_id UUID NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  type TEXT NOT NULL 
    CHECK (type IN ('general', 'face_front', 'face_three_quarter', 'face_profile', 
                    'face_three_quarter_back', 'body', 'pose', 'angle')),
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_avatar_refs_avatar ON avatar_references(avatar_id);
CREATE INDEX idx_avatar_refs_org ON avatar_references(organization_id);

-- =============================================================================
-- 3) cloned_voices — Voces clonadas
-- =============================================================================
CREATE TABLE IF NOT EXISTS cloned_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  avatar_id UUID REFERENCES avatars(id) ON DELETE SET NULL,
  
  name TEXT NOT NULL,
  
  -- Provider info
  provider TEXT NOT NULL DEFAULT 'minimax',
  provider_voice_id TEXT NOT NULL,
  
  -- Source
  sample_audio_path TEXT NOT NULL,    -- Storage path
  sample_duration_sec NUMERIC,
  language TEXT NOT NULL DEFAULT 'es-MX',
  
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'cloning', 'ready', 'failed')),
  error_message TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_voices_org ON cloned_voices(organization_id);
CREATE INDEX idx_voices_avatar ON cloned_voices(avatar_id);

-- =============================================================================
-- 4) video_templates — Templates de video por vertical
-- =============================================================================
CREATE TABLE IF NOT EXISTS video_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Scope: NULL = global (definido por platform), UUID = custom de la org
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  super_tenant_id UUID REFERENCES super_tenants(id) ON DELETE CASCADE,
  
  slug TEXT NOT NULL,                  -- 'realestate_showcase_30s'
  name TEXT NOT NULL,                  -- 'Showcase Inmobiliario 30s'
  description TEXT,
  vertical TEXT NOT NULL,              -- 'real-estate' | 'food' | etc.
  
  -- Structure
  duration_seconds INTEGER NOT NULL,
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  scenes JSONB NOT NULL,               -- [{ scene: 'avatar_intro', duration: 5 }, ...]
  
  -- Prompt templates
  script_template TEXT NOT NULL,       -- Con variables {{property_title}} etc.
  prompt_template_image TEXT,
  prompt_template_video TEXT,
  
  -- Visual style
  style_preset JSONB,                  -- lighting, mood, film grain, etc.
  
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_premium BOOLEAN NOT NULL DEFAULT false,  -- requiere plan superior
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), slug)
);

CREATE INDEX idx_video_tpl_vertical ON video_templates(vertical);
CREATE INDEX idx_video_tpl_org ON video_templates(organization_id);
CREATE INDEX idx_video_tpl_st ON video_templates(super_tenant_id);

-- =============================================================================
-- 5) video_generations — Cada video generado
-- =============================================================================
CREATE TABLE IF NOT EXISTS video_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- References
  avatar_id UUID REFERENCES avatars(id) ON DELETE SET NULL,
  voice_id UUID REFERENCES cloned_voices(id) ON DELETE SET NULL,
  template_id UUID REFERENCES video_templates(id) ON DELETE SET NULL,
  
  -- Source entity (polymorphic)
  source_entity_type TEXT,             -- 'property' | 'menu_item' | 'vehicle' | 'product' | 'event' | 'service'
  source_entity_id UUID,
  
  -- Input
  input_photo_paths TEXT[] NOT NULL DEFAULT '{}',
  input_metadata JSONB NOT NULL DEFAULT '{}',
  custom_prompt TEXT,                  -- Override del template
  
  -- Output
  storage_path TEXT,                   -- Path al video final
  thumbnail_path TEXT,
  duration_seconds NUMERIC,
  aspect_ratio TEXT,
  resolution TEXT,
  
  -- Generation pipeline tracking
  microservice_job_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'generating_script',
                     'generating_avatar_clips', 'generating_voice',
                     'merging', 'completed', 'failed', 'cancelled')),
  progress_percent INTEGER DEFAULT 0,
  error_message TEXT,
  
  -- Costs (en créditos)
  credits_consumed INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC,                    -- Costo real en USD para tracking
  
  -- Generated metadata
  generated_script TEXT,
  full_api_prompts JSONB,              -- Para debugging
  
  -- Auto-post
  auto_post_targets TEXT[] DEFAULT '{}',  -- ['instagram', 'tiktok', ...]
  social_post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  
  -- Approval flow
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_video_gen_org ON video_generations(organization_id);
CREATE INDEX idx_video_gen_user ON video_generations(user_id);
CREATE INDEX idx_video_gen_avatar ON video_generations(avatar_id);
CREATE INDEX idx_video_gen_status ON video_generations(status);
CREATE INDEX idx_video_gen_source ON video_generations(source_entity_type, source_entity_id);
CREATE INDEX idx_video_gen_created ON video_generations(created_at DESC);

-- =============================================================================
-- 6) properties — Propiedades inmobiliarias (vertical real-estate)
-- =============================================================================
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  title TEXT NOT NULL,
  description TEXT,
  property_type TEXT,                  -- 'house' | 'apartment' | 'land' | 'commercial' | 'vacation'
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'sold', 'rented', 'paused', 'archived')),
  
  -- Specs
  bedrooms INTEGER,
  bathrooms NUMERIC,
  parking_spots INTEGER,
  built_area_m2 NUMERIC,
  lot_area_m2 NUMERIC,
  year_built INTEGER,
  
  -- Pricing
  price_amount NUMERIC NOT NULL,
  price_currency TEXT NOT NULL DEFAULT 'MXN',
  price_period TEXT NOT NULL DEFAULT 'sale',  -- 'sale' | 'rent_monthly'
  
  -- Location
  address TEXT,
  city TEXT,
  state TEXT,
  neighborhood TEXT,
  zip_code TEXT,
  geo_point GEOGRAPHY(POINT),
  
  -- Photos
  photo_paths TEXT[] NOT NULL DEFAULT '{}',
  primary_photo_path TEXT,
  
  -- AI defaults
  default_avatar_id UUID REFERENCES avatars(id) ON DELETE SET NULL,
  default_voice_id UUID REFERENCES cloned_voices(id) ON DELETE SET NULL,
  default_template_id UUID REFERENCES video_templates(id) ON DELETE SET NULL,
  
  -- Branding
  brand_guidelines JSONB,              -- logo, colors, CTA URL
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_properties_org ON properties(organization_id);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_city ON properties(city);

-- =============================================================================
-- 7) menu_items — Items de menú (vertical food)
-- =============================================================================
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,                       -- 'entrada' | 'plato_fuerte' | 'postre' | 'bebida'
  
  price_amount NUMERIC NOT NULL,
  price_currency TEXT NOT NULL DEFAULT 'MXN',
  
  -- Specs
  is_special BOOLEAN NOT NULL DEFAULT false,
  is_seasonal BOOLEAN NOT NULL DEFAULT false,
  available_days INTEGER[] DEFAULT '{1,2,3,4,5,6,7}',  -- 1=lunes
  
  -- Photos
  photo_paths TEXT[] NOT NULL DEFAULT '{}',
  primary_photo_path TEXT,
  
  -- AI defaults
  default_avatar_id UUID REFERENCES avatars(id) ON DELETE SET NULL,
  default_voice_id UUID REFERENCES cloned_voices(id) ON DELETE SET NULL,
  default_template_id UUID REFERENCES video_templates(id) ON DELETE SET NULL,
  
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_items_org ON menu_items(organization_id);

-- =============================================================================
-- 8) vehicles — Unidades automotrices (vertical automotive)
-- =============================================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Specs
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  trim_level TEXT,
  body_type TEXT,                      -- 'sedan' | 'suv' | 'pickup' | 'hatchback'
  transmission TEXT,                   -- 'manual' | 'automatic' | 'cvt'
  fuel_type TEXT,                      -- 'gasoline' | 'diesel' | 'hybrid' | 'electric'
  km_traveled INTEGER,
  color TEXT,
  
  -- Pricing
  price_amount NUMERIC NOT NULL,
  price_currency TEXT NOT NULL DEFAULT 'MXN',
  monthly_payment NUMERIC,             -- Mensualidad calculada
  down_payment_min NUMERIC,
  
  -- Inventory
  vin TEXT,
  stock_number TEXT,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'sold', 'in_transit', 'archived')),
  
  -- Photos (8 typical: front, 3/4, rear, interior, dashboard, motor, trunk, wheels)
  photo_paths TEXT[] NOT NULL DEFAULT '{}',
  primary_photo_path TEXT,
  
  -- AI defaults
  default_avatar_id UUID REFERENCES avatars(id) ON DELETE SET NULL,
  default_voice_id UUID REFERENCES cloned_voices(id) ON DELETE SET NULL,
  default_template_id UUID REFERENCES video_templates(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicles_org ON vehicles(organization_id);
CREATE INDEX idx_vehicles_status ON vehicles(status);

-- =============================================================================
-- 9) avatar_credits — Saldo de créditos por organización
-- =============================================================================
CREATE TABLE IF NOT EXISTS avatar_credits (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  
  balance INTEGER NOT NULL DEFAULT 0,
  total_purchased INTEGER NOT NULL DEFAULT 0,
  total_consumed INTEGER NOT NULL DEFAULT 0,
  total_refunded INTEGER NOT NULL DEFAULT 0,
  
  -- Monthly allowance (resets cada billing cycle)
  monthly_allowance INTEGER NOT NULL DEFAULT 0,
  monthly_consumed INTEGER NOT NULL DEFAULT 0,
  monthly_reset_at TIMESTAMPTZ,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 10) avatar_credit_transactions — Audit log de créditos
-- =============================================================================
CREATE TABLE IF NOT EXISTS avatar_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  type TEXT NOT NULL
    CHECK (type IN ('purchase', 'consumption', 'refund', 'monthly_grant', 'admin_adjust')),
  amount INTEGER NOT NULL,             -- Positivo o negativo
  balance_after INTEGER NOT NULL,
  
  description TEXT,
  reference_id UUID,                   -- video_generation_id, stripe_invoice_id, etc.
  reference_type TEXT,                 -- 'video_generation' | 'stripe_invoice' | 'admin'
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_tx_org ON avatar_credit_transactions(organization_id);
CREATE INDEX idx_credit_tx_ref ON avatar_credit_transactions(reference_id);
CREATE INDEX idx_credit_tx_created ON avatar_credit_transactions(created_at DESC);
```

### 8.2 RLS Policies

```sql
-- =============================================================================
-- Helper function (consistente con patrón de social-media)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rls_avatar_org_access(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT (
    p_org_id = COALESCE(
      (((auth.jwt() -> 'user_metadata') ->> 'organization_id'))::uuid,
      (((auth.jwt() -> 'app_metadata') ->> 'organization_id'))::uuid
    )
  )
  OR (((auth.jwt() -> 'user_metadata') ->> 'role') = 'superadmin')
  OR (((auth.jwt() -> 'app_metadata')  ->> 'role') = 'superadmin');
$$;

-- =============================================================================
-- Enable RLS en TODAS las tablas
-- =============================================================================
ALTER TABLE avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloned_voices ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_credit_transactions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Policies: avatars (representativo del patrón aplicado a todas)
-- =============================================================================
DROP POLICY IF EXISTS avatars_select_policy ON avatars;
DROP POLICY IF EXISTS avatars_insert_policy ON avatars;
DROP POLICY IF EXISTS avatars_update_policy ON avatars;
DROP POLICY IF EXISTS avatars_delete_policy ON avatars;

CREATE POLICY avatars_select_policy ON avatars
  FOR SELECT USING (public.rls_avatar_org_access(organization_id));
CREATE POLICY avatars_insert_policy ON avatars
  FOR INSERT WITH CHECK (public.rls_avatar_org_access(organization_id));
CREATE POLICY avatars_update_policy ON avatars
  FOR UPDATE USING (public.rls_avatar_org_access(organization_id));
CREATE POLICY avatars_delete_policy ON avatars
  FOR DELETE USING (public.rls_avatar_org_access(organization_id));

-- (Repetir el patrón anterior para: avatar_references, cloned_voices, 
--  video_generations, properties, menu_items, vehicles, avatar_credits, 
--  avatar_credit_transactions)

-- =============================================================================
-- Policy especial: video_templates (acceso global a templates platform-level)
-- =============================================================================
DROP POLICY IF EXISTS video_templates_select_policy ON video_templates;
DROP POLICY IF EXISTS video_templates_insert_policy ON video_templates;
DROP POLICY IF EXISTS video_templates_update_policy ON video_templates;
DROP POLICY IF EXISTS video_templates_delete_policy ON video_templates;

-- Templates globales (org_id IS NULL) son accesibles por todos
-- Templates de organización solo accesibles por su org
CREATE POLICY video_templates_select_policy ON video_templates
  FOR SELECT USING (
    organization_id IS NULL 
    OR public.rls_avatar_org_access(organization_id)
  );

-- Solo superadmin puede crear/modificar templates globales
CREATE POLICY video_templates_insert_policy ON video_templates
  FOR INSERT WITH CHECK (
    (organization_id IS NULL AND (
      ((auth.jwt() -> 'user_metadata') ->> 'role') = 'superadmin'
      OR ((auth.jwt() -> 'app_metadata') ->> 'role') = 'superadmin'
    ))
    OR (organization_id IS NOT NULL AND public.rls_avatar_org_access(organization_id))
  );
-- (similar para UPDATE y DELETE)
```

### 8.3 Realtime publication

```sql
-- Para que el dashboard refresque en vivo cuando un video pasa de
-- 'generating' → 'completed' o 'failed'
ALTER PUBLICATION supabase_realtime ADD TABLE video_generations;
ALTER PUBLICATION supabase_realtime ADD TABLE avatars;
ALTER PUBLICATION supabase_realtime ADD TABLE cloned_voices;
```

---

## 9. Feature Flags & Plan Tiers

### 9.1 Nuevos `FEATURE_KEYS` (en `usePlanFeatures.ts`)

```typescript
// =====================================================
// AVATAR VIDEO MODULE — NUEVAS
// =====================================================
AVATAR_VIDEO_BASIC: 'avatar_video_basic',          // Acceso al módulo
AVATAR_CREATOR: 'avatar_creator',                   // Crear/entrenar avatares
AVATAR_VOICE_CLONE: 'avatar_voice_clone',          // Clonar voz
AVATAR_VIDEO_GENERATION: 'avatar_video_generation', // Generar videos
AVATAR_VIDEO_TEMPLATES: 'avatar_video_templates',   // Acceso a templates premium
AVATAR_VIDEO_FLOWS: 'avatar_video_flows',           // Flow Builder visual
AVATAR_AUTO_PUBLISH: 'avatar_auto_publish',         // Publicación automática
AVATAR_VIDEO_ANALYTICS: 'avatar_video_analytics',   // Dashboard analytics
AVATAR_API_ACCESS: 'avatar_api_access',             // API pública (Año 2)

// =====================================================
// LIMITS — AVATAR VIDEO
// =====================================================
MAX_AVATARS: 'max_avatars',                         // # avatares por org
MAX_CLONED_VOICES: 'max_cloned_voices',             // # voces por org
MAX_VIDEOS_PER_MONTH: 'max_videos_per_month',       // # videos/mes
```

### 9.2 Nueva categoría en `FEATURE_CATEGORIES`

```typescript
avatar_video: {
  name: 'Avatar Video Studio',
  keys: [
    'avatar_video_basic',
    'avatar_creator',
    'avatar_voice_clone',
    'avatar_video_generation',
    'avatar_video_templates',
    'avatar_video_flows',
    'avatar_auto_publish',
    'avatar_video_analytics',
    'avatar_api_access',
    'max_avatars',
    'max_cloned_voices',
    'max_videos_per_month',
  ],
},
```

### 9.3 Plan tiers por super-tenant

#### SalesBot

| Plan | Precio MXN | Avatares | Voces | Videos/mes | Templates | Flows | Auto-publish | Analytics |
|------|-----------|----------|-------|------------|-----------|-------|--------------|-----------|
| Starter | $499 | ❌ | ❌ | 0 | ❌ | ❌ | ❌ | ❌ |
| Pro | $1,499 (+$500) | 1 | 1 | 30 | Básicos | ❌ | ✅ | Básico |
| Business | $2,999 (+$1,000) | 5 | 5 | 100 | Premium | ✅ | ✅ | Avanzado |
| Enterprise | $4,999 (+$1,000) | Ilimitado | Ilimitado | 300 | Premium + Custom | ✅ | ✅ | Avanzado + Export |

#### Agentika (multi-cliente)

| Plan | Precio MXN | Avatares | Voces | Videos/mes | Notas |
|------|-----------|----------|-------|------------|-------|
| Starter | $1,999 | ❌ | ❌ | 0 | — |
| Pro | $3,499 (+$1,500) | 5 (1/cliente max 5 clientes) | 5 | 200 | Vista cross-cliente |
| Business | $5,999 (+$2,500) | 25 | 25 | 500 | White label opcional |

#### Eventika

| Plan | Precio MXN | Avatares | Voces | Videos/mes | Notas |
|------|-----------|----------|-------|------------|-------|
| Básico | $399 | ❌ | ❌ | 0 | — |
| Premium | $899 (+$500) | 2 (novios) | 2 | 30 | Save-the-date, recap |
| Pro | $1,799 (+$900) | 10 | 10 | 100 | Multi-evento, custom branding |

### 9.4 Sistema de créditos (overflow)

Cuando una org excede su `max_videos_per_month`, puede comprar paquetes adicionales:

| Paquete | Precio MXN | Créditos | Costo/video |
|---------|-----------|----------|-------------|
| Starter | $199 | 10 | $19.90 |
| Value | $499 | 30 | $16.63 |
| Power | $999 | 75 | $13.32 |
| Bulk | $1,999 | 200 | $9.99 |

> **Nota**: Los precios son hipótesis iniciales. Validar con A/B testing en Fase 2.

### 9.5 Costo de operaciones (en créditos)

| Operación | Créditos | Costo real estimado |
|-----------|----------|---------------------|
| Generar video 15-30s | 1 | $0.30 USD |
| Re-generar (si rejected) | 0 | (incluido) |
| Entrenar LoRA avatar | 10 | $3.00 USD |
| Clonar voz | 3 | $3.00 USD |
| TTS solo (script existente) | 0.5 | $0.05 USD |
| Image-to-video Ken Burns | 0.5 | $0.05 USD |

---

## 10. Route Modules Configuration

### 10.1 Nuevas entradas en `ROUTE_MODULE_MAP`

```typescript
// ========================================
// AVATAR VIDEO MODULE
// ========================================
'/avatar-studio': { 
  module: 'avatar-video', 
  feature: 'avatar_video_basic' 
},
'/avatar-studio/avatars': { 
  module: 'avatar-video', 
  feature: 'avatar_creator' 
},
'/avatar-studio/voice-clone': { 
  module: 'avatar-video', 
  feature: 'avatar_voice_clone' 
},
'/avatar-studio/gallery': { 
  module: 'avatar-video', 
  feature: 'avatar_video_generation' 
},
'/avatar-studio/templates': { 
  module: 'avatar-video', 
  feature: 'avatar_video_templates' 
},
'/avatar-studio/analytics': { 
  module: 'avatar-video', 
  feature: 'avatar_video_analytics' 
},
'/avatar-flows': { 
  module: 'avatar-video', 
  feature: 'avatar_video_flows' 
},

// Vertical-specific entities
'/properties': { 
  module: 'avatar-video',  // o módulo independiente 'real-estate'
  feature: 'avatar_video_basic' 
},
'/menu-items': { 
  module: 'avatar-video',
  feature: 'avatar_video_basic' 
},
'/vehicles': { 
  module: 'avatar-video',
  feature: 'avatar_video_basic' 
},
```

### 10.2 Disponibilidad por super-tenant

En `super-tenant-blocks.config.ts` o equivalente, declarar que el módulo `avatar-video` está disponible en:
- `salesbot` ✅
- `agentika` ✅
- `eventika` ✅
- `promosoft` ⚠️ (decisión pendiente — útil para activaciones BTL pero requiere ajustes)
- `banca` ❌ (no fit)
- Default editorial STs ❌

---

## 11. API Contracts

### 11.1 Frontend ↔ Microservicio (REST)

#### POST `/api/v1/avatars/train`

```typescript
// Request
{
  organizationId: string
  userId: string
  name: string
  references: Array<{
    type: 'face_front' | 'face_three_quarter' | 'face_profile' | 'general'
    url: string  // Public/signed URL del Storage
  }>
  callbackUrl: string
}

// Response (202 Accepted)
{
  jobId: string
  status: 'queued'
  estimatedDurationSec: 1800  // 30 min típico
}

// Webhook callback (cuando completa)
POST {callbackUrl}
{
  jobId: string
  status: 'completed' | 'failed'
  result?: {
    loraModelId: string
    triggerWord: string
    sampleImageUrls: string[]
  }
  error?: string
}
```

#### POST `/api/v1/voices/clone`

```typescript
// Request
{
  organizationId: string
  userId: string
  name: string
  audioUrl: string         // 30s sample
  language: 'es-MX' | 'en-US' | etc.
  callbackUrl: string
}

// Response (202)
{
  jobId: string
  status: 'queued'
  estimatedDurationSec: 120
}
```

#### POST `/api/v1/videos/generate`

```typescript
// Request
{
  organizationId: string
  userId: string
  
  // Avatar + Voice
  avatarId: string         // ID local en AgentSoft
  loraModelId: string      // ID del provider
  voiceId: string          // ID local
  providerVoiceId: string
  
  // Template
  templateSlug: string     // 'realestate_showcase_30s'
  duration: 15 | 20 | 25 | 30 | 60
  aspectRatio: '9:16' | '1:1' | '16:9'
  
  // Source content
  sourcePhotos: string[]   // URLs públicas
  sourceMetadata: Record<string, any>  // {title, price, location, etc.}
  
  // Optional overrides
  customScript?: string
  customStylePreset?: object
  brandGuidelines?: {
    logoUrl?: string
    primaryColor?: string
    ctaText?: string
    ctaUrl?: string
  }
  
  callbackUrl: string
}

// Response (202)
{
  jobId: string
  status: 'queued'
  estimatedDurationSec: 240   // 4 min típico
  creditsReserved: 1
}
```

#### GET `/api/v1/jobs/{jobId}/status`

```typescript
// Response
{
  jobId: string
  status: 'queued' | 'generating_script' | 'generating_avatar_clips' 
        | 'generating_voice' | 'merging' | 'completed' | 'failed'
  progressPercent: 0-100
  result?: {
    videoUrl: string
    thumbnailUrl: string
    durationSec: number
    generatedScript: string
    fullPrompts: object  // debug
  }
  error?: string
}
```

### 11.2 Authentication

- Header: `x-api-key: {org_api_key}`
- API keys generadas vía `/api/avatar-keys` endpoint en AgentSoft
- Hashing con bcrypt en DB
- Prefix: `pa_live_xxxxxxxx` para identificación

### 11.3 Rate limiting

| Plan tier | Requests/min | Concurrent jobs |
|-----------|--------------|-----------------|
| SalesBot Pro | 10 | 2 |
| SalesBot Business | 30 | 5 |
| SalesBot Enterprise | 100 | 15 |
| Agentika Pro | 50 | 10 |
| Agentika Business | 200 | 25 |

---

## 12. UI/UX Specification

### 12.1 Avatar Studio (`/avatar-studio`)

**Layout**: ECME `Sidebar layout` con 6 sub-rutas.

**Componentes principales** (todos ECME, NUNCA Shadcn):
- `Card` para listings
- `Drawer` para edits inline
- `Dialog` para confirmations
- `Steps` para wizard de creación
- `Table` para gallery con sorts
- `Avatar` (componente ECME) para previews
- `Tag` para status badges

**Flujo de creación de avatar (Wizard 5 pasos)**:

```
Paso 1: Información básica
- Nombre del avatar
- Descripción opcional
- ¿A quién representa? (dropdown: usuario actual, otro miembro, marca)

Paso 2: Subir referencias frontales (5-15 fotos)
- Drag & drop area con preview
- Validación: caras claras, sin lentes oscuros, varias expresiones
- Tip card: "Para mejores resultados, mezcla fotos sonriendo y serias"

Paso 3: Multi-angle (opcional, premium)
- Subir foto front, 3/4, profile, 3/4 back
- Tip: "Mejora consistencia 3D del avatar"

Paso 4: Test generation
- Sistema genera 4 imágenes de prueba con LoRA recién entrenada
- User aprueba o pide re-train

Paso 5: Asignar voz
- Select existing voice OR ir a /avatar-studio/voice-clone
```

### 12.2 Voice Clone (`/avatar-studio/voice-clone`)

**Flujo simple (3 pasos)**:

```
Paso 1: Grabar o subir audio
- Componente: <AudioRecorder> custom 
  + alternativa: <Upload> de ECME para mp3/m4a/wav
- Indicador: 30 segundos exactos
- Tips: "Lee este texto neutro" (script sugerido)

Paso 2: Procesando
- Loading con progress (lleno desde polling al microservicio)
- ETA: 2 minutos

Paso 3: Preview + asignar
- TTS de prueba con script tipo "Hola, soy {nombre}, esta es mi voz clonada para Avatar Studio"
- Botón aprobar o re-clonar
- Asignar a avatar existente o standalone
```

### 12.3 Gallery (`/avatar-studio/gallery`)

**Vista**: Grid de cards de video con filtros.

**Filtros (Select ECME con `instanceId` único)**:
- Status: todos | borrador | aprobado | publicado | rechazado
- Avatar: lista de avatares de la org
- Template: lista de templates
- Vertical: lista de verticales (si aplica)
- Fecha: rango

**Por cada video card**:
- Thumbnail con play button overlay
- Título (auto-generado: "{template} — {source_title}")
- Status tag (color coded)
- Fecha
- Métricas mini (views, likes) si publicado
- Acciones: play, approve, regenerate, edit, archive

### 12.4 WhatsApp UX (canal alterno)

Para el agente individual (Carla persona), el flujo principal NO es el dashboard sino WhatsApp. Esto se implementa con SalesBot existente:

```
Carla: [foto1.jpg, foto2.jpg, ...] [audio: "Casa Juriquilla 4 rec, 3 baños, $4.5M"]

SalesBot: ✅ Recibí 8 fotos. Voy a generar tu Reel inmobiliario.
          ETA: 4 minutos. Te aviso cuando esté listo.

[4 minutos después]

SalesBot: 🎬 Tu Reel está listo. Mira:
          [video preview 30s]
          
          ¿Apruebas para publicar en IG, TikTok y Status?
          Responde con ✅ para publicar o ❌ para regenerar.

Carla: ✅

SalesBot: 📤 Publicando... Listo!
          • IG Reel: link
          • TikTok: link  
          • Status: WhatsApp
          
          Te aviso cuando lleguen primeras métricas.
```

### 12.5 Vertical-specific UI

Cada vertical tiene su sub-ruta CRUD:

- `/properties` — para real-estate
  - List view: tabla con foto, título, precio, ciudad, status, last video
  - Detail view: drawer con specs + photos + button "Generar Reel"
  
- `/menu-items` — para food
  - Grid view con thumbnails de platillos
  - Quick action: "Generar Reel del especial"
  
- `/vehicles` — para automotive
  - List view con specs auto-extraídas
  - 8-photo upload helper con guías por ángulo
  
- `/products` — ya existe (e-commerce)
- `/services` — ya existe en algunos STs
- `/events` — ya existe (Eventika)

### 12.6 Wireframes pendientes

> **Acción de seguimiento**: Antes de codear, generar wireframes HTML de:
> 1. Avatar Studio main screen
> 2. Avatar creation wizard
> 3. Voice clone flow
> 4. Gallery view
> 5. Property detail con CTA "Generar Reel"
> 6. WhatsApp conversation flow (mockup)
>
> Validar con 3 usuarios target (1 broker, 1 dueño restaurante, 1 estilista) antes de pasar a desarrollo.

---

## 13. Video Templates Library

### 13.1 Templates universales (5)

Construidos como rows en la tabla `video_templates` con `organization_id IS NULL` (globales).

| Slug | Duración | Aspect | Verticales | Estructura |
|------|----------|--------|-----------|------------|
| `showcase_30s` | 30s | 9:16 | real-estate, automotive, ecommerce, eventos | avatar_intro 5s + photos_carousel 20s + avatar_cta 5s |
| `special_15s` | 15s | 9:16 | food, beauty, fitness | photo_zoom_in 5s + voiceover_main 7s + cta_overlay 3s |
| `testimonial_25s` | 25s | 9:16 | fitness, beauty, healthcare, education | before_after 8s + avatar_speak 12s + cta 5s |
| `announcement_20s` | 20s | 9:16, 1:1 | eventos, ecommerce, food | hook_text_overlay 3s + avatar_main 12s + cta 5s |
| `brand_intro_15s` | 15s | 9:16 | TODOS | logo_reveal 2s + avatar_speak 10s + cta 3s |

### 13.2 Estructura JSONB de un template (ejemplo)

```jsonb
-- video_templates.scenes para 'showcase_30s'
[
  {
    "scene": "avatar_intro",
    "duration_sec": 5,
    "type": "avatar_speak",
    "voice_script_segment": "intro",
    "kling_motion": "subtle_smile_nod",
    "background": "solid_color_brand"
  },
  {
    "scene": "photos_carousel",
    "duration_sec": 20,
    "type": "ken_burns",
    "photos_per_scene": 8,
    "transition": "fade",
    "voice_overlay": true,
    "voice_script_segment": "body",
    "music_volume": 0.3
  },
  {
    "scene": "avatar_cta",
    "duration_sec": 5,
    "type": "avatar_speak",
    "voice_script_segment": "cta",
    "overlay_elements": ["logo", "phone", "cta_text"]
  }
]
```

### 13.3 Script template (ejemplo `realestate_showcase_30s`)

```text
INTRO (5s):
"Hola, soy {{user_name}}. Esta semana traigo {{property_type}} en {{neighborhood}}, {{city}}."

BODY (20s):
"{{bedrooms}} recámaras, {{bathrooms}} baños, {{built_area_m2}} metros cuadrados. 
Lo mejor: {{top_amenity}}. Precio: {{price_formatted}}."

CTA (5s):
"Mándame mensaje al WhatsApp para agendar tu visita. {{cta_text}}"
```

### 13.4 Variables por vertical

Cada vertical mapea a variables específicas:

| Vertical | Variables disponibles |
|----------|----------------------|
| real-estate | property_type, neighborhood, city, bedrooms, bathrooms, built_area_m2, price_formatted, top_amenity |
| food | dish_name, restaurant_name, key_ingredient, price, available_until |
| automotive | brand, model, year, km, monthly_payment, down_payment, location |
| beauty | service_name, duration, price, before_after_caption, salon_name |
| fitness | client_name, time_period, exercises, gym_name, first_class_offer |
| eventos | event_name, date, venue, dress_code, rsvp_link |
| ecommerce | product_name, key_benefit, price, shipping_offer, store_name |

---

## 14. Vertical Configurations

Cada vertical tiene su configuración registrada en código (TS) o tabla DB:

```typescript
// configs/avatar-video-verticals.config.ts
export const AVATAR_VIDEO_VERTICALS = {
  'real-estate': {
    enabled: true,
    sourceEntity: 'properties',
    minPhotosPerVideo: 5,
    maxPhotosPerVideo: 12,
    defaultTemplate: 'showcase_30s',
    availableTemplates: ['showcase_30s', 'announcement_20s', 'brand_intro_15s'],
    requiredFields: ['title', 'price_amount', 'city', 'bedrooms'],
    optionalFields: ['top_amenity', 'neighborhood', 'photos'],
    priorityScore: 10,  // 0-10 para priorizar en marketing
  },
  'food': {
    enabled: true,
    sourceEntity: 'menu_items',
    minPhotosPerVideo: 1,
    maxPhotosPerVideo: 4,
    defaultTemplate: 'special_15s',
    availableTemplates: ['special_15s', 'announcement_20s', 'brand_intro_15s'],
    requiredFields: ['name', 'price_amount'],
    priorityScore: 10,
  },
  'automotive': {
    enabled: true,
    sourceEntity: 'vehicles',
    minPhotosPerVideo: 6,
    maxPhotosPerVideo: 12,
    defaultTemplate: 'showcase_30s',
    availableTemplates: ['showcase_30s', 'announcement_20s'],
    requiredFields: ['brand', 'model', 'year', 'price_amount'],
    priorityScore: 9,
  },
  'beauty': {
    enabled: true,
    sourceEntity: 'services',  // tabla existente
    minPhotosPerVideo: 2,      // Antes/Después mínimo
    maxPhotosPerVideo: 8,
    defaultTemplate: 'testimonial_25s',
    availableTemplates: ['testimonial_25s', 'special_15s', 'brand_intro_15s'],
    priorityScore: 9,
  },
  'fitness': {
    enabled: true,
    sourceEntity: 'services',
    minPhotosPerVideo: 1,
    maxPhotosPerVideo: 6,
    defaultTemplate: 'testimonial_25s',
    availableTemplates: ['testimonial_25s', 'special_15s', 'brand_intro_15s'],
    priorityScore: 8,
  },
  'eventos': {
    enabled: true,
    sourceEntity: 'events',  // tabla existente Eventika
    minPhotosPerVideo: 1,
    maxPhotosPerVideo: 8,
    defaultTemplate: 'announcement_20s',
    availableTemplates: ['announcement_20s', 'showcase_30s', 'brand_intro_15s'],
    priorityScore: 9,
  },
  'ecommerce': {
    enabled: true,
    sourceEntity: 'products',  // tabla existente
    minPhotosPerVideo: 1,
    maxPhotosPerVideo: 6,
    defaultTemplate: 'showcase_30s',
    availableTemplates: ['showcase_30s', 'announcement_20s', 'special_15s'],
    priorityScore: 9,
  },
  // Verticales fuera de scope (Fase 4+)
  'veterinary': { enabled: false, priorityScore: 7 },
  'healthcare': { enabled: false, priorityScore: 6 },
  'education': { enabled: false, priorityScore: 5 },
  'professional-services': { enabled: false, priorityScore: 4 },
  'banca': { enabled: false, priorityScore: 3 },
  'legal': { enabled: false, priorityScore: 3 },
} as const
```

---

## 15. Pricing Strategy

### 15.1 Hipótesis iniciales (validar con A/B testing)

**ARPU lift target por plan upgrade**:
| Upgrade | Lift estimado | Confianza |
|---------|---------------|-----------|
| SalesBot Starter → Pro | +$500 MXN | Media |
| SalesBot Pro → Business | +$1,000 MXN | Media |
| Agentika Starter → Pro | +$1,500 MXN | Baja-Media |
| Agentika Pro → Business | +$2,500 MXN | Baja |
| Eventika Básico → Premium | +$500 MXN | Media |

**Triggers de upgrade**:
- Usuario llega a 80% de su `max_videos_per_month` → mostrar upsell modal
- Usuario intenta crear avatar #2 con plan que solo soporta 1 → upsell
- Usuario quiere clonar voz pero plan no incluye → upsell

### 15.2 Discounts y promociones (Fase 1 launch)

- **Lifetime deal primeros 100**: 30% off de por vida en plan Pro+
- **Migration bonus**: orgs existentes que upgrade en 30 días post-launch reciben +50% videos extra mes 1
- **Annual discount**: 20% off pagando anual

### 15.3 Mecánica de billing

- Reusar Stripe del AgentSoft existente
- Price IDs nuevos por plan x ST x intervalo (monthly/annual)
- Webhook handler agrega/quita feature flags al cambio de plan
- Monthly grant de créditos automático en `invoice.paid`

---

## 16. Success Metrics

### 16.1 North Star Metric (NSM)

**Videos publicados en redes sociales por org/mes**

> Razón: captura activación + engagement real + retention. Un video generado pero no publicado no genera valor para el cliente.

Target Año 1:
- Promedio: 15 videos/org/mes activa
- P50: 10 videos
- P90: 50 videos

### 16.2 Activation event

Nuevo cliente que activa el módulo se considera "activated" cuando:
1. ✅ Crea su primer avatar
2. ✅ Genera al menos 1 video
3. ✅ Publica al menos 1 video en redes

**Time-to-Activation target**: <30 minutos desde sign-up al feature.

### 16.3 Retention metrics

- **D7 retention**: % orgs que generan video en día 7 post-activation. Target: >60%
- **D30 retention**: % orgs que siguen generando en día 30. Target: >75%
- **D90 retention**: Target: >65%
- **Churn impact en SalesBot**: feature debe REDUCIR churn -15-25% en orgs Pro+

### 16.4 Business metrics

- **Attach rate Pro+**: % orgs Starter que upgrade a Pro+ post-launch. Target: 30% en 6 meses
- **ARPU lift consolidado**: $/org/mes incremental. Target: +$500 MXN promedio ponderado
- **MRR contribution**: dinero nuevo que el módulo genera. Target Año 1: $182K MXN/mes
- **Cost per video**: tracking real vs estimado. Target: mantener <$0.40 USD
- **Margen de contribución**: target >88%

### 16.5 Product quality metrics

- **First-try approval rate**: % videos aprobados sin regeneración. Target: >70%
- **Generation success rate**: % jobs que completan sin error. Target: >95%
- **P50 generation time**: Target: <4 minutos
- **P95 generation time**: Target: <10 minutos
- **NPS feature**: medido a 30 días post-activation. Target: >50

### 16.6 Triggers para spin-off a ST primeavatar.com

Spin-off ocurre **SI Y SÓLO SI** se cumplen TODOS:

1. ✅ Attach rate >40% en SalesBot Pro+ (6 meses sostenido)
2. ✅ ARPU lift consistente >$500 MXN promedio
3. ✅ NPS >50
4. ✅ >100 inbound de clientes externos no-SalesBot/Agentika/Eventika
5. ✅ Vertical específica explota (ej: 200+ orgs solo en real-estate)
6. ✅ Margen de contribución >85% sostenido

Si solo algunos cumplen → mantener módulo y ampliar features.

---

## 17. Implementation Phases

### Fase 0: Preparación (Semana 1-2)

**Entregables**:
- [ ] Validar PRD con stakeholder (Lenny)
- [ ] Wireframes de las 6 pantallas principales
- [ ] Schema migration revisado
- [ ] Setup de microservicio (repo nuevo)
- [ ] Setup de cuentas providers (MiniMax, Kling, Graydient/Replicate)

### Fase 1: Foundation + Avatar Creator (Semana 3-5)

**Entregables**:
- [ ] Migration aplicada en agentsoft Supabase
- [ ] RLS policies activas y testeadas
- [ ] Feature keys + categorías agregados a `usePlanFeatures.ts`
- [ ] Route modules entries
- [ ] Module activable en super-tenant blocks
- [ ] UI: `/avatar-studio` main + `/avatar-studio/avatars`
- [ ] Microservicio: endpoint `/api/v1/avatars/train`
- [ ] LoRA training E2E con Graydient/Replicate

**Definition of done**: SalesBot user con plan Pro+ puede crear su primer avatar funcional.

### Fase 2: Voice + Generación básica (Semana 6-8)

**Entregables**:
- [ ] UI: `/avatar-studio/voice-clone`
- [ ] Microservicio: `/api/v1/voices/clone` y `/tts`
- [ ] UI: `/avatar-studio/gallery`
- [ ] Microservicio: `/api/v1/videos/generate` con orquestación
- [ ] Templates universales (5) sembrados en DB
- [ ] Pipeline FFmpeg merge audio+video
- [ ] Sistema de créditos (deducción + balance)

**Definition of done**: Generar 1 video real estate end-to-end funciona.

### Fase 3: Auto-publish + Vertical UI (Semana 9-11)

**Entregables**:
- [ ] Integración con `social-media` module existente
- [ ] Aprobación previa via WhatsApp (SalesBot integration)
- [ ] UI: `/properties` (CRUD)
- [ ] UI: `/menu-items` (CRUD)
- [ ] UI: `/vehicles` (CRUD)
- [ ] Botón "Generar Reel" en cada entity detail
- [ ] Webhooks de social-media → `social_post_id` en video_generations

**Definition of done**: Real estate y food workflows completos. 5 inmobiliarias y 5 restaurantes en beta.

### Fase 4: Analytics + Más verticales (Semana 12-14)

**Entregables**:
- [ ] UI: `/avatar-studio/analytics`
- [ ] Tracking de métricas por video/template/avatar
- [ ] Dashboard Agentika cross-cliente
- [ ] Onboarding wizard para nuevos verticales (beauty, fitness, eventos, ecommerce)

**Definition of done**: 7 verticales killer activos. 50+ orgs paying.

### Fase 5: Polish + Scale (Semana 15-17)

**Entregables**:
- [ ] Monitoring (Sentry + Posthog)
- [ ] Cost dashboard interno
- [ ] Promo lifetime deal launch
- [ ] Public landing pages por vertical (reusar landing templates)
- [ ] Soporte tickets + KB

**Definition of done**: Public launch. Target $50K MXN MRR.

### Fase 6: Optimización (Mes 4-6)

- A/B testing pricing
- Refinement de templates basado en data
- Más verticales si datos lo justifican (veterinary, healthcare)
- Decisión de spin-off basado en métricas

---

## 18. Risks & Mitigations

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|----|--------|--------------|---------|------------|
| R-01 | Provider Kling/MiniMax/Graydient cierra o restringe | Media | Alto | Provider abstraction layer, fallbacks definidos (fal.ai, Replicate, Synthesia API) |
| R-02 | Costo real >$0.40/video erosiona margen | Media | Alto | Tracking semanal, ajuste de créditos por op si es necesario |
| R-03 | LoRA training falla en >5% de avatars | Media | Medio | Re-train automático con seeds distintos, manual review por superadmin |
| R-04 | Latencia de generación >10 min en P95 | Alta | Medio | Queue priority por plan, optimización de pipelines paralelos |
| R-05 | Adopción <20% en SalesBot Pro+ | Media | Alto | Onboarding agresivo, demo videos en signup, lifetime deal launch |
| R-06 | Auto-publish falla sin notificar | Baja | Alto | Realtime subscription en `video_generations` + alertas |
| R-07 | Right of publicity claims (avatar de empleado vs marca) | Media | Alto | Termos claros: cliente debe tener consentimiento del rostro/voz |
| R-08 | OnlyFans-style misuse del feature | Baja | Alto | Content policy explícita, ban TOS, Gemini safety check siempre activo |
| R-09 | Identidad federal/IFAI: voz clonada de no-empleado | Media | Alto | Validación de consentimiento del audio source en upload |
| R-10 | Race conditions en credits deduction | Media | Medio | Postgres `FOR UPDATE` lock + RPC atómica |
| R-11 | Vendor lock-in con Upload-Post (social) | Baja | Medio | Provider abstraction en social-media (ya existe) |
| R-12 | Spin-off prematuro a ST sin datos | Media | Alto | Triggers explícitos definidos, no decisión emocional |

---

## 19. Open Questions

> Estas preguntas deben resolverse antes o durante Fase 0.

1. **Provider de LoRA training**: ¿Graydient ($42 USD/mes ilimitado) vs Replicate (pay-per-train, más confiable)? Trade-off: costo fijo bajo vs riesgo de provider nuevo.

2. **Pricing absoluto**: ¿$1,499 SalesBot Pro+ es correcto, o muy alto vs HeyGen Creator $24 USD? Validar con 10 entrevistas de prospect.

3. **WhatsApp como UX primario**: ¿hacemos full WhatsApp first (Carla nunca abre dashboard) o WhatsApp es secundario? Decisión técnica afecta scope de Fase 3.

4. **Avatar de empleado vs marca**: ¿permitimos que SalesBot mismo cree avatares "marca" sin rostro humano (ej: solo logo animado)? Útil para banca/legal pero requiere arquitectura distinta.

5. **Fair use vs créditos**: ¿el plan Pro tiene 30 videos hard limit o "fair use unlimited"? Hard limit es más predecible pero más fricción.

6. **Vertical Promosoft**: ¿incluimos PromoSoft en Fase 1 (BTL Mundial 2026 es oportunidad masiva) o esperamos? Pros: timing único. Contras: scope más amplio.

7. **Storage de videos**: ¿quién paga storage de videos generados (Supabase Storage cost)? Plan tier debe contemplar storage limits.

8. **Webhook reliability**: si webhook de microservicio falla, ¿polling fallback? Decisión técnica para evitar generations "stuck".

9. **Multi-idioma de scripts**: ¿solo español MX en Fase 1, o también en/pt? MiniMax soporta ambos pero Gemini script templates necesitan curación humana.

10. **Auditoría legal**: ¿se requiere asesoría externa antes de launch (TAKE IT DOWN, Ley Olimpia, derechos de imagen)? Mi recomendación: SÍ, $30-50K MXN inversión one-time.

---

## 20. Appendices

### A. Stack tecnológico (consistente con preferencias del usuario)

- **Frontend**: Next.js 15 App Router, TypeScript strict, Tailwind CSS 4
- **UI**: ECME Template components ÚNICAMENTE (NUNCA Shadcn)
- **State**: Zustand
- **Forms**: react-hook-form + zod
- **Data**: SWR + Server Actions
- **Auth**: Supabase Auth (consistente con AgentSoft existente)
- **DB**: Supabase Postgres con RLS
- **i18n**: next-intl con archivos `messages/{lang}/avatar-video.json`
- **Realtime**: Supabase Realtime para `video_generations` updates
- **Monitoring**: Sentry + Posthog
- **PWA**: service workers para upload offline-resilient

### B. Naming conventions

- Tablas: snake_case, prefijo `avatar_` si es ambiguo
- Feature keys: snake_case, prefijo `avatar_*`
- Routes: kebab-case
- Componentes: PascalCase con docstring de versión
- Slugs de templates: snake_case con guión bajo (`realestate_showcase_30s`)

### C. Internationalization keys (sample)

```json
{
  "avatar_studio": {
    "title": "Avatar Studio",
    "create_avatar": "Crear avatar",
    "wizard": {
      "step_1_title": "Información básica",
      "step_2_title": "Sube tus referencias",
      "step_3_title": "Multi-ángulo",
      "step_4_title": "Generación de prueba",
      "step_5_title": "Asignar voz"
    }
  },
  "voice_clone": {
    "title": "Clonar voz",
    "duration_required": "Necesito 30 segundos de audio claro"
  },
  "video_gallery": {
    "status": {
      "pending": "Pendiente",
      "generating": "Generando",
      "completed": "Listo",
      "failed": "Falló",
      "approved": "Aprobado",
      "rejected": "Rechazado",
      "published": "Publicado"
    }
  }
}
```

### D. Files a crear/modificar (resumen)

#### En agentsoft (modificar):
- `src/configs/route-modules.config.ts` — agregar entries
- `src/configs/super-tenant-blocks.config.ts` — habilitar módulo
- `src/configs/navigation-modules.config.ts` — agregar items sidebar
- `src/hooks/usePlanFeatures.ts` — agregar FEATURE_KEYS y categoría
- `messages/{es,en,pt}/avatar-video.json` — i18n nuevo

#### En agentsoft (crear nuevo):
- `src/app/(protected-pages)/avatar-studio/` (8 sub-rutas)
- `src/app/(protected-pages)/properties/` (CRUD)
- `src/app/(protected-pages)/menu-items/` (CRUD)
- `src/app/(protected-pages)/vehicles/` (CRUD)
- `src/app/(protected-pages)/avatar-flows/` (Flow Builder)
- `src/components/avatar-video/` (componentes shared)
- `src/server/actions/avatar/` (server actions)
- `src/hooks/useAvatars.ts`, `useClonedVoices.ts`, `useVideoGenerations.ts`
- `src/lib/avatar-video/credits.ts` (lógica de créditos)
- `src/configs/avatar-video-verticals.config.ts`
- `supabase/migrations/2026MMDD_avatar_video_module.sql`

#### En microservicio (repo nuevo `prime-avatar-generation`):
- `src/app/api/v1/avatars/train/route.ts`
- `src/app/api/v1/voices/clone/route.ts`
- `src/app/api/v1/voices/tts/route.ts`
- `src/app/api/v1/scripts/generate/route.ts`
- `src/app/api/v1/videos/generate/route.ts`
- `src/app/api/v1/jobs/[id]/status/route.ts`
- `src/services/KlingService.ts` (migrado de prime-avatar)
- `src/services/GeminiService.ts` (migrado)
- `src/services/MiniMaxService.ts` (nuevo)
- `src/services/GraydientService.ts` (nuevo, sin NSFW)
- `src/services/FFmpegService.ts` (Ken Burns + merge)
- `src/services/ProviderRouter.ts`
- `src/middleware.ts` (API key validation)

### E. Referencias

- Spec original: `docs/superpowers/specs/2026-04-07-prime-avatar-ecosystem-design.md`
- Social Media Module pattern: `agentsoft/supabase/migrations/20260420_social_media_module.sql`
- ECME components reference: `prime-avatar/CLAUDE.md` y `agentsoft/.claude/CLAUDE.md`
- Plan features pattern: `agentsoft/src/hooks/usePlanFeatures.ts`

---

**End of PRD v1.0**

> Este documento es vivo. Cambios significativos deben incrementar versión y registrar en la sección de cambios al inicio.
