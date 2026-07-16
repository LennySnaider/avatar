# Flow Builder — Plan de extensión (triggers + nodos Fanvue/social/agente)

> Estado: PROPUESTA — revisar antes de codear.
> Decisión de arquitectura ya tomada (2026-07-16): Avatar Studio conserva su UX
> tal cual; el Flow Builder es la capa de flujos custom / automatización.
> Único puente previsto: "Enviar a flow" desde la galería del Studio.

## Qué ya existe (no reimplementar)

| Capacidad | Dónde vive | Nodo que la expone |
|---|---|---|
| Postear a Fanvue | `FanvueService.createFanvuePost` | Fanvue: Create Post |
| Postear a Instagram/social | `SocialService.createSocialPost` (Upload-Post) | Social: Publish |
| Contestar mensajes Fanvue | Agent Inbox completo: `lib/agent/*` (draftPipeline, autopilot, sendMessage), `AgentInboxService.syncFanvueInbox`, cron `agent-inbox-poll`, webhook `api/webhooks/fanvue` | Fanvue: Reply Unread |
| PPV / mass message | `AgentInboxService.sendPpvOffer`, `suggestPpvOffer` | Fanvue: PPV Offer (fase 2) |
| Generación img/video/tts | GeminiService, KlingService, MiniMaxService | ya son nodos |
| Guardar en galería | `apiCreateGenerationUploadUrl` + `apiSaveGeneration` | ya es nodo |

## Diseño: nodos Trigger

Idea (de Lenny): un nodo de disparo va SIEMPRE al inicio del flujo, conectado
al nodo de avatar. Manual o automático.

- Nueva categoría `trigger` (primera en la paleta, color propio).
- Nuevo tipo de puerto `trigger` (color propio) que transporta el contexto del
  disparo `{ firedAt, source, payload? }`.
- `Select Avatar` (y `From Gallery`) ganan un input OPCIONAL `trigger`.
- Canvas vacío se siembra con: `Manual Trigger → Select Avatar` conectados.

### Tipos de trigger

1. **Manual Trigger** (fase 1) — se dispara con el botón Run. Config: ninguna.
2. **Schedule Trigger** (fase 3) — cron (`cada N horas`, hora fija). Requiere
   ejecución server-side. Reusa la infra `api/cron/*` + `CRON_SECRET`.
3. **Fanvue Message Trigger** (fase 3) — se dispara al llegar mensaje nuevo
   (webhook `api/webhooks/fanvue` ya existe). Output extra: `message: text`,
   `chatId: any` — alimenta pipelines de respuesta.

### Semántica de ejecución

- Flow SIN nodos trigger → Run ejecuta todo (comportamiento actual, compat).
- Flow CON triggers → Run solo ejecuta las ramas aguas abajo de los triggers
  manuales; ramas de triggers no disparados quedan `skipped` (mismo mecanismo
  del branching de condition).
- La config del trigger vive EN el nodo (JSON del flow) — sin cambio de
  esquema en fase 1. Para schedule/event (fase 3) se añade columna indexable
  `triggers jsonb` a `video_flows` para que el executor server-side encuentre
  flujos suscritos sin parsear todos los grafos.

## Catálogo de nodos nuevos

### Fase 1 — Publicación (client-side, Run manual)

| Nodo | Inputs | Outputs | Backend |
|---|---|---|---|
| Manual Trigger | — | trigger | — |
| From Gallery | trigger? | media, avatar? | `apiGetGenerations` + picker UI (como AvatarPickerField) |
| Caption (AI) | media, avatar? | caption: text | Gemini (describe + tono del avatar) |
| Fanvue: Create Post | media, caption: text, avatar | postId: any | `createFanvuePost` (audiencia free/subs en config) |
| Social: Publish (IG) | media, caption: text, avatar | postId: any | `createSocialPost` (cuenta conectada del avatar; falla claro si no hay) |

Pipeline estrella fase 1:
`Manual Trigger → Select Avatar → Generate Image → Caption (AI) → Fanvue: Create Post` (+ rama a `Social: Publish`).

### Fase 2 — Agente / mensajes

| Nodo | Inputs | Outputs | Backend |
|---|---|---|---|
| Fanvue: Reply Unread | trigger, avatar | replied: any (count/resumen) | Un pase del pipeline existente: `syncFanvueInbox` → drafts → si autopilot del avatar está ON, `sendAgentMessage`; si OFF, deja drafts en Agent Inbox |
| Fanvue: PPV Offer | avatar, media | sent: any | `suggestPpvOffer` + `sendPpvOffer` |
| Create Avatar / Clone Voice / Persona Prompt | varios | avatar | AvatarForgeService + Voice Studio (fábrica de avatares) |

Decisión clave: **Reply Unread NO reimplementa el agente** — orquesta el que ya
existe y respeta la config de autopilot por avatar (draft vs auto-send).

### Fase 1.5 — Catálogo COMPLETO de paridad con el Studio (barrido exhaustivo 2026-07-16)

Inventario de TODA la funcionalidad existente en servicios/Studio que debe ser
alcanzable desde flujos. Regla de diseño: **selector de modelo/proveedor y
"modos" son CONFIG del nodo** (como el ProviderManager del Studio), no nodos
separados — menos nodos, misma potencia.

**A. Análisis / Prompt (media → texto)** — todo en GeminiService:

| Nodo | Inputs → Outputs | Backend |
|---|---|---|
| Image → Prompt | image → description: text | `describeImageForPrompt` |
| Clone Ref | image → clonePrompt: text | `analyzeImageForClone` |
| Pose from Image | image → posePrompt: text | `analyzePoseFromImage` |
| Place from Image | image → placePrompt: text | `analyzeImageForPlace` |
| Face Description | image → faceDesc: text | `analyzeFaceFromImages` |
| Prompt from Video | video → prompt: text | `analyzeVideoForPrompt` |
| Video-prompt from Image | image → videoPrompt: text | `generateVideoPromptFromImage` |
| Reel Motion | video → motionPrompt: text | `analyzeReelMotion` |
| Continuation Prompt | video → prompt: text | `generateContinuationPrompt` (= Continue Video del Studio) |
| Check Prompt Safety | prompt → safePrompt: text, isSafe: any | `analyzePromptSafety` — `isSafe` → Condition para ramificar/reintentar |
| Enhance Prompt (ya nodo) | text → text | `enhancePrompt` |
| Social Caption | media, avatar → caption: text | `generateSocialCaption` + `translateSocialCaption` (idioma en config) |
| Prompt from Library | — → prompt: text | `apiGetPrompts` (picker como AvatarPickerField) |

**B. Generación de IMAGEN — un solo nodo Generate Image, multi-proveedor:**

- Config `provider/model` con las mismas opciones del Studio: Gemini
  (`generateAvatar`), MiniMax (`MiniMaxService.generateImage`), KIE — FLUX /
  Seedream / Nano Banana (`generateImageKie`), Graydient
  (`generateImageWithGraydient`), Kling (`KlingService.generateImage`).
- Puertos opcionales de referencia (tipo image, se cablean desde Upload/From
  Gallery): `poseRef`, `sceneRef`, `assets (list)`, `bodyRef`, `angleRef`.
- Config cámara/estilo (paridad con CinemaCameraControls): Framing
  (`cameraShot`), Angle (`cameraAngle`), Lens/Focal/Aperture (`cinema*`),
  Lighting, identityWeight / styleWeight, faceDescription.
- Nodo aparte **Edit Image**: image + instrucción: text → image (`editImage`).

**C. Generación de VIDEO — nodo Generate Video multi-proveedor + nodos de modo:**

| Nodo | Inputs → Outputs | Backend |
|---|---|---|
| Generate Video (ya nodo; ampliar) | image, prompt → video. Config: provider (Kling std/pro, KIE Wan 2.2, MiniMax, Gemini Veo `generateVideoSafe`), duración, aspect, camera control (`generateVideoWithCameraControl`), native audio | `generateVideo*` de cada servicio |
| Talking Avatar | image, audio/script → video | `generateAvatarWithDialogue`, `submitTalkingVideoKieTask` |
| Lipsync | video, audio → video | `submitLipsyncVideoKieTask` (UI: LipsyncDialog) |
| Continue Video | video → video | Continuation Prompt + Generate Video encadenados (o nodo compuesto) |
| Video with Voice | image, prompt, voz → video | `generateVideoWithVoice` (Kling) |

⚠️ Motion Brush / Motion Control (`generateVideoWithMotionBrush`,
`generateMotionControlKie`) requieren editor de trazos (canvas interactivo del
Studio). Fase posterior: el nodo acepta un preset guardado desde el Studio, no
reimplementar el editor en el flow.

**D. Edición / Transform de media:**

| Nodo | Inputs → Outputs | Backend |
|---|---|---|
| Trim Video | video → video | `VideoEditService.trimVideo` |
| Crop Video | video → video | `cropVideo` |
| Remove Watermark | video → video | `removeWatermark` |
| Video Info | video → duration/size: any | `probeVideo` |
| **Mux Audio** | video, audio → video | `AudioMuxService.muxAudioIntoVideo` — CLAVE: cierra el pipeline TTS→video con voz |
| Extract Frame | video → image | UI ExtractFrameDialog (client-side) |
| Stitch (ya nodo) / Text Overlay (ya nodo) | | ffmpeg.wasm — solo manual hasta fase server |

**E. Voz / Audio:**

| Nodo | Inputs → Outputs | Backend |
|---|---|---|
| Text to Speech (ya nodo) | text → audio | `MiniMaxService.textToSpeech` |
| Clone Voice | audio → voiceId: any | `uploadAudioForCloning` + `cloneVoice` (fábrica de avatares) |
| Generate Script (ya nodo) + Translate Script | text → text | `ScriptService` |
| Speak Script | script, avatar → audio | = TTS con la voz del avatar (SpeakScriptDialog) |
| Trending Sound | — → soundUrl/meta: any | `TrendService.listTrendingSounds` |

**F. Plataforma / datos:**

| Nodo | Inputs → Outputs | Backend |
|---|---|---|
| From Gallery | trigger? → media, avatar | `apiGetGenerations` + picker |
| Assign Avatar | media, avatar → media | `apiSetGenerationAvatar` |
| Create Avatar | nombre, faceRef... → avatar | `apiCreateAvatar` + `apiAddAvatarReference`/`apiUploadReference` |
| Save to Gallery (ya nodo) / Webhook (ya nodo) | | |

Prioridad dentro de 1.5 (lo demás es backlog ordenado por uso real):
1) Puertos de referencia + config cámara en Generate Image (paridad de calidad)
2) Mux Audio + Speak Script (habilita el pipeline completo img→video→voz)
3) Image→Prompt / Prompt from Video / Check Safety (los analizadores más usados)
4) Multi-proveedor en Generate Image/Video
5) Edit Image, Trim/Crop/Watermark, Extract Frame
6) Talking Avatar / Lipsync
7) Caption, Prompt Library, Trending Sound, Clone Voice, Create Avatar

Esto convierte al flow builder en paridad real con el Studio: mismo motor,
mismos controles, pero encadenable.

### Paridad VISUAL — el flow builder debe verse como el Studio (pedido Lenny)

El usuario reconoce las funciones por su cara en el Studio; los nodos deben
usar los MISMOS nombres, iconos, colores y componentes. Regla: **extraer
componentes compartidos del Studio, no duplicarlos** (refactor solo-movimiento,
el Studio no cambia de comportamiento).

1. **Model Picker compartido** — extraer de `ProviderManagerDrawer`:
   - El mapa `PROVIDER_TRAITS` (face/permissive por modelo) sale del Drawer a
     un módulo compartido (`@/configs/` o `@/constants/`).
   - Componente `ModelPicker` reutilizable: lista de modelos con sus tags
     (🙂 Cara, 🔓 Permisivo/NSFW-off), chips de filtro (Todos / Favoritos /
     Cara / Permisivo), favoritos con estrella, descripciones en español y el
     mismo orden de prioridad (Cara+Permisivo primero).
   - Lo consumen: el Studio (como hoy) y el panel de propiedades de los nodos
     Generate Image / Generate Video.
2. **Slots de referencia compartidos** — extraer el dropzone punteado con
   icono de color de `BottomControlBar` como componente `RefDropzone`:
   - Mismas etiquetas EXACTAS del Studio: `Img→Prompt`, `Clone Ref`,
     `Pose Ref`, `Body Ref`, `Assets`, `Place Ref`, `Scene` — mismos iconos y
     mismos colores de acento por tipo.
   - El panel de propiedades de Generate Image muestra esa misma grilla de
     slots (subir imagen ahí = configurar la referencia del nodo); el puerto
     cableado tiene prioridad sobre el slot local.
3. **Chip de proveedor** — el nodo Generate Image/Video muestra en su cuerpo
   el chip `● <Modelo> ⚙` (mismo estilo del Studio); clic en ⚙ abre el
   ModelPicker. Así se ve de un vistazo qué modelo corre cada nodo del grafo.
4. **Nombres de nodos = nombres del Studio.** Los nodos de análisis se llaman
   como sus features: "Img→Prompt" (no "Image → Prompt"), "Clone Ref", etc.

### Fase 3 — Automatización desatendida (server-side)

1. **Executor server-side**: API route que corre el mismo grafo en el server.
   Requiere handlers isomorfos:
   - `FileReader`/`btoa` → `Buffer` (helpers duales)
   - text-overlay canvas → `sharp` (ya está en deps, ver mediaPersist)
   - upload a storage: browser signed-URL → server `uploadBufferToGenerations`
   - ⚠️ stitch usa ffmpeg.wasm de navegador → en server marcar el nodo como
     "solo manual" o evaluar ffmpeg en Node. NO bloquear la fase por esto.
2. **Schedule Trigger** activo (cron job que barre `video_flows.triggers`).
3. **Fanvue Message Trigger** activo (hook en el webhook existente).
4. Tabla `flow_runs` (id, flow_id, trigger, status, per-node log) → historial
   de ejecuciones visible en el editor.

## Riesgos / decisiones abiertas

1. **Costo de APIs en loops**: cuando haya schedule triggers, un flujo mal
   armado puede quemar créditos de Gemini/Kling cada hora. Mitigación fase 3:
   límite de runs/día por flow + confirmación al activar schedule.
2. **Reply Unread y doble control**: si el cron `agent-inbox-poll` ya hace
   autopilot, un flow con Reply Unread puede duplicar pases. Mitigación: el
   nodo usa el mismo lock/idempotencia del pipeline (solo actúa sobre rows en
   estado pendiente).
3. **Instagram requiere cuenta conectada por avatar** (Upload-Post): el nodo
   debe fallar con mensaje claro y link a Social Media si no hay conexión.
4. ¿El nodo Caption genera en el idioma del avatar/persona? (definir config).

## Orden de implementación propuesto

1. Categoría trigger + Manual Trigger + semilla `Trigger → Select Avatar`.
2. From Gallery (+ botón "Enviar a flow" en la galería del Studio).
3. **Extracción de componentes compartidos** (ModelPicker + PROVIDER_TRAITS +
   RefDropzone) — habilita la paridad visual de todo lo que sigue.
4. Generate Image con paridad total: multi-proveedor con tags (Cara/Permisivo/
   favoritos), slots de referencia del Studio, config de cámara/estilo.
5. Nodos de análisis prioritarios: Img→Prompt, Prompt from Video, Check
   Prompt Safety (+ Condition para reintentos).
6. Mux Audio + Speak Script (cierra el pipeline img→video→voz).
7. Fanvue: Create Post + Social: Publish + Caption (AI).
8. Fanvue: Reply Unread.
9. Resto del catálogo 1.5 (Edit Image, Trim/Crop/Watermark, Extract Frame,
   Talking Avatar/Lipsync, Prompt Library, Trending Sound).
10. Fábrica de avatares (Create Avatar / Clone Voice / Persona).
11. Fase 3 completa (server executor, schedule, event triggers, flow_runs).
