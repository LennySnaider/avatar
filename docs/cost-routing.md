# Cost Routing — KIE vs Directo vs Vercel AI Gateway

> Referencia de costos por modelo para decidir a qué proveedor rutear cada
> generación. Datos reales recopilados 2026-05-31 (pricing público de KIE,
> Google Vertex y la lista del Vercel AI Gateway). Verificar periódicamente —
> los precios cambian.

## ✅ Conclusión validada (avatares con identidad)

Se validó en producción que **Nano Banana Pro · KIE = Gemini 3 Pro Image**
(MISMO modelo). Enviándole el prompt-harness completo de Gemini (vía
`@/utils/avatarPromptBuilder`) + las referencias etiquetadas (FACE_ANCHOR,
ANGLE_SHEET, BODY_SHAPE, POSE_REF), **clona la identidad igual que el path
directo de Gemini, a ~30% menos costo**. Ruta de producción para identidad.

Los dos motores de identidad funcionan; se elige según la foto.

| Modelo | Cómo clona | Identidad | Veredicto |
|---|---|---|---|
| **Nano Banana Pro · KIE** | harness rico + refs (de **texto/refs**) | ✅ = Gemini | **Ruta principal** (barato) |
| **Gemini 3 Pro Image (directo)** | harness rico (de **texto**) | ✅ campeón | Respaldo premium / no-tattoo |
| **GPT Image 2 · KIE** | **face-swap EDIT** (de **imagen**) | ✅ con el flujo correcto | **Funciona** según la foto |
| **Flux.1 Kontext Pro/Max · KIE** | **face-swap EDIT** (clone=canvas, cara por `[FACE:]` texto) | ✅ (single-input) | clona pose/outfit/escena, bleed bajo |
| **Kling v3 Omni · KIE/Kling** | **GENERACIÓN multi-ref** (`image_list`: cara=slot1, clone=slot2, guard mannequin) | ✅ con guard | único Kling que clona; bleed medio |
| GPT 4o Image (KIE) | — | ⚠️ flojo | secundario (no cableado al clone) |
| MiniMax image-01 / Kling v3 base | **solo texto** (`[CLONE:]` en prosa) | ⚠️ techo de texto | API: 1 sola ref=cara, NO reciben la imagen del clone |
| Seedream 4.0 · Gateway | — | ❌ | bug 404 Vercel/ByteDance con imágenes; text-only |

### Receta de cada motor (lo que lo hizo funcionar)

**Nano Banana Pro (= Gemini 3 Pro Image, vía KIE):** mismo modelo que el directo.
Recibe el **harness completo** de `avatarPromptBuilder` (systemPreamble + identity
+ body specs + REFERENCE MAPPING etiquetado) + refs (face/angle/body/pose/scene).
Clona de **texto+refs**. Es el que mejor respeta "no tattoos" (strip de texto).
- **Clone Ref → nano-banana (rol `clone`/`CLONE_REF`):** si hay Clone Ref cargado,
  la IMAGEN también se le manda a nano-banana (antes solo iba a GPT Image 2), como
  última ref. El harness la trata de mannequin SIN cara: *"copia pose/outfit/
  manos/objeto-en-mano/encuadre/escena EXACTOS; la cara SOLO de [FACE_ANCHOR]"*.
  Así clona la pose como GPT Image 2. ⚠️ Blindaje identity-bleed: `buildIdentityInstructions`
  nombra `[CLONE_REF]` junto a POSE_REF/STYLE_REF como mannequin sin identidad,
  más cláusula FORBIDDEN explícita — si no, copiaría la cara de la persona original.
  (Soporta hasta 8 image_input; face/angle/body/pose/scene + clone = 6.)

**GPT Image 2 (OpenAI, vía KIE):** NO le sirve el harness de Gemini (su lenguaje
"DEEPFAKE/FACE SWAP" dispara moderación y lo confunde). Funciona como **face-swap
EDIT**, imitando ChatGPT consumer:
- **2 imágenes:** Clone/original PRIMERO (canvas a recrear: pose/outfit/cuerpo/
  escena) + cara SEGUNDO (se reemplaza solo el rostro). Sin hoja de ángulos.
- **Prompt limpio y natural** (`buildLeanIdentityPrompt`, no el harness):
  *"Image 1 = foto a recrear exacta; Image 2 = cara a swapear; funde la cara con
  la luz/piel de Image 1; manos anatómicas."*
- **STRIP del harness (`stripHarnessForFaceSwap`):** en un EDIT la imagen es la
  fuente de verdad del cuerpo/pose/escena. Las tags `[BODY:]` (medidas en cm) y
  `[CLONE:]` (re-descripción automática, incompleta) **pelean contra "copiá
  Image 1 exacta"** → deforma el cuerpo, reencuadra (corta pies) y tira detalles
  que solo viven en la foto (celular, collar). Se borran `[BODY:]`+`[CLONE:]`,
  se mantiene `[FACE:]` + el texto del usuario, y se agrega una **lista de
  preservación GENÉRICA** ("cualquier objeto en las manos, cualquier collar…").
  ⚠️ Genérica a propósito: nombrar "el celular" haría que lo **alucine** en
  fotos que no lo tienen. Guía oficial de OpenAI para edits: *"cambia solo X,
  mantén todo lo demás idéntico"* (NO re-describir la escena).
- **Resolución 1K** — KIE's gpt-image-2 i2i a 2K **se cuelga** (3 refs → 500/15min;
  2 refs → "running" indefinido). 1K completa rápido.
- Clona de **imagen** (no de texto). Por eso necesita el **Clone Ref cargado**.
- **Relighting (cara "sobrepuesta"):** el face-swap dejaba la cara como pegada
  (luz/color/grano no coincidían con el cuerpo). La cláusula de blend en L46 se
  reforzó con el phrasing exacto de OpenAI (*"match lighting, shadows and color
  temperature … not pasted on"*) + 4 sub-cláusulas **solo-para-la-cara**:
  (1) reiluminar a la luz/dirección/temperatura de Image 1; (2) fundir bordes
  con feathering en cabello/orejas/mandíbula/cuello (sin costura); (3) **preservar
  la TEZ propia del avatar** (de Image 2/`[FACE:]`) e igualar solo la LUZ, NUNCA el
  pigmento del cuerpo del clone — y resolver la costura del cuello **hacia la tez
  del sujeto** (como Gemini, que no la pisa); (4) igualar grano/ruido/foco/DOF. Marco
  "una sola foto, no un sticker". ⚠️ El re-light va con scope "For the new face
  only" para no contradecir el "keep EXACT lighting" global de la escena.
  ⚠️ Ojo: la versión vieja decía "igualar la tez al cuerpo de Image 1" → corría la
  tez del avatar hacia la del clone. Se invirtió para respetar la config del avatar.
- **NO hay param de fidelidad en KIE:** verificado en la docu — gpt-image-2 i2i
  solo acepta `{prompt, input_urls, aspect_ratio, resolution}`. `input_fidelity`
  era de gpt-image-1 (API directa de OpenAI); **no agregarlo** (el request fallaría),
  y de existir *empeoraría* (preserva la cara original vs reiluminar). Fix = 100% prompt.

### Reglas generales (todos los KIE)
- **Errores como dato, no throw:** `generateImageKie` devuelve `{success,error}`
  para que el motivo real sobreviva el boundary server→cliente (sino, 500 genérico
  en prod oculta el mensaje).
- **Moderación:** 2 intentos (sanitize ligero → `aggressiveSanitize`) ante
  "flagged as sensitive".
- **"No tattoos":** los modelos de imagen **dibujan lo que mencionas e ignoran "no X"**
  → `stripNegatedTattoos` (en `getFullPrompt`, todos los providers) borra la mención.
  ⚠️ Si el tatuaje está en la **imagen** de referencia (no en texto), el strip no
  basta — hay que editar esa imagen (afecta a GPT Image 2 que clona de imagen).
- **Poll budget 600s** (avatar-studio `maxDuration = 800`).

### Límite real: ChatGPT consumer ≠ KIE gpt-image-2
La app de chatgpt.com corre un pipeline más sofisticado que el modelo crudo de la
API que expone KIE. KIE's gpt-image-2 **funciona** (face-swap), pero su techo de
calidad/manos/piel lo pone OpenAI. Para máxima fidelidad estilo-ChatGPT habría que
ir a la **API directa de OpenAI** (descartado por decisión: se va con KIE).

## Cómo cobra cada proveedor

| Proveedor | Modelo de cobro | Implicación |
|---|---|---|
| **KIE** | Reseller con **descuento bajo el precio oficial**. Cobra en créditos: **1 crédito = $0.005**. +10% bonus en recargas altas (≈ −10% efectivo). | Suele ser el **más barato**, sobre todo en modelos de Google (Veo, Gemini image). |
| **Directo** (Google/Kling/MiniMax con tu propia key) | Precio **oficial** del proveedor. | Caro en Google (Veo $0.75/s). Pero los servicios propios (KlingService, GeminiService) implementan **features ricas**. |
| **Vercel AI Gateway** | **Zero-markup = precio de lista exacto** + créditos gratis mensuales. Nunca baja de la lista. | Bueno para failover/observabilidad; rara vez el más barato. **Backup** hoy. |

## ⚠️ Regla de oro: "el más barato" NO es gratis

Varios modelos corren por **servicios dedicados** con features que KIE (acceso "pelado") no replica:
- **KlingService:** motion control, camera control, **voz/lip-sync**, Omni multi-ref.
- **GeminiService:** Veo con audio nativo + multi-ref + first frame; imagen con face/body/angle refs separados + identity weight.

Mover esos modelos a KIE por precio puede **degradar identidad/quitar features**. Cheapest ≠ best para avatares.

## 🧬 Las features de identidad son PROMPT-ENGINEERING, no del proveedor

Aclaración clave para no confundirse a futuro: **face/body/angle refs separados, "identity weight" y "scene composite" NO son parámetros de API de ningún modelo ni del Vercel Gateway.** Son un harness de prompt que vive en [`GeminiService`](../src/services/GeminiService.ts):

- **Identity weight** = texto literal en el prompt (`FACE IDENTITY: HIGH CONSISTENCY (Identity Weight: N%)`) + ramas de comportamiento según el valor. No hay "knob" nativo.
- **Face/body/angle** = varias imágenes inline, cada una con una **etiqueta de rol en texto** (`FACE_ANCHOR`, `ANGLE_SHEET`, `BODY_SHAPE`).
- **Scene composite** = imagen de escena + instrucciones según `styleWeight`.

Implicaciones:

| Ruta | ¿Puede replicar el harness? |
|---|---|
| **Directo (GeminiService)** | ✅ Ya lo hace. |
| **KIE `nano-banana-pro`** | ✅ Acepta `image_input[]` (hasta 8 imgs); las etiquetas de rol e identity-weight van **en el texto del prompt** (hay que portar la lógica). |
| **Vercel Gateway · `experimental_generateImage`** | ❌ NO acepta imágenes de entrada (solo texto→imagen). |
| **Vercel Gateway · `generateText` multimodal** | ✅ Técnicamente sí, pero reimplementando el harness sobre el AI SDK. |

**Conclusión:** la ventaja de identidad es **código tuyo (portable)**, no un lock-in de proveedor. Quien rutee mantiene la calidad **solo si mantiene ese harness**. El Gateway **no aporta nada** para esto — su primitiva de imagen ni siquiera acepta refs.

## 🖼️ Imagen (por imagen)

| Modelo | KIE | Directo (oficial) | Vercel Gateway | Ruteo recomendado |
|---|---|---|---|---|
| **Nano Banana Pro** (Gemini 3 Pro Image) | **$0.09** (1K/2K) · $0.12 (4K) | ~$0.13 (1K/2K) · ~$0.24 (4K) | ~$0.13 | **KIE** (A/B vs directo; −30%) |
| Nano Banana (Gemini 2.5 Flash) | $0.02 | ~$0.039 | ~$0.039 | KIE |
| GPT Image 2 | $0.03 (1K) · $0.05 (2K) · $0.08 (4K) | token-based | ~$0.04–0.13 (+ top-up gate) | **KIE** (fijo, sin gate) |
| Flux Kontext Pro/Max | "mitad de precio" (marketing) | — | $0.04 / $0.08 | **KIE** (ya en uso) |
| Seedream 4.0 | ~$0.03 | — | $0.03 | empate |
| **Kling v3 Omni (Image O1)** | ❌ **KIE NO tiene Kling imagen** (solo video) | **$0.028** (2K, multi-ref incl.) · $0.056 (4K Image-3O) | — | **DEJAR DIRECTO** (no migrable; ver abajo) |

> **Kling Omni imagen → NO migrable a KIE.** Verificado (jun-2026): en `docs.kie.ai`
> TODO lo de Kling es **video** (kling-3.0/video, i2v, motion-control, avatar). La
> generación de imagen Omni (`POST /v1/images/omni-image`, `kling-v3-omni`, multi-ref
> `image_list[]`) solo existe en fal.ai / WaveSpeed / Freepik / PiAPI, NO en KIE. Es
> brecha de **capacidad**, no de precio. Además el directo ($0.028/2K) es **más barato**
> que la única alternativa en KIE (cambiar a Nano Banana Pro $0.09 → más caro + ya lo
> tenemos). Se queda en **Kling directo** (KlingService, tu key de Kling).

## 🎬 Video (por segundo)

| Modelo | KIE | Directo (oficial) | Vercel Gateway | Ruteo recomendado |
|---|---|---|---|---|
| **Veo 3** | Fast **$0.05/s** ($0.40/8s) · Quality $0.25/s | Vertex **$0.75/s** | fast $0.10/s · full $0.20/s | **KIE si el costo manda**; directo si necesitas audio/multi-ref de GeminiService |
| **Kling** (i2v / motion / v2v) | v3 sin audio $0.07 (720p)·$0.09 (1080p) · con audio $0.10/$0.135 · 4K $0.335 · motion-ctrl v2v $0.10–0.135 · v2.6 ~$0.04–0.07 | **oficial Kling API ≈ $0.014/cr:** 720p $0.084 · 1080p $0.112 (s/audio)/$0.168 (audio) · 4K $0.42 · motion $0.126–0.168 | v2.6-i2v $0.07/s · v3.0-i2v $0.17/s | **DEJAR DIRECTO por features, NO por precio** — KIE es −16% a −21% (ver nota ▼) |
| **Seedance 2.0** | 480p $0.0575/s · 720p $0.125/s · 1080p $0.31/s | — | **$0.07/s** (base) | Vercel a 720p · KIE a 480p |
| **Wan 2.7 / 2.6** | 720p ~$0.08/s · 1080p ~$0.12/s | — | wan-2.6 $0.05–0.10/s | empate (versiones distintas) |
| MiniMax Hailuo 2.3 | — | oficial MiniMax | — | **DEJAR DIRECTO** (subject reference / avatar lock) |

> **Kling video — KIE es −16% a −21% más barato, y es apples-to-apples.** Verificado
> (jun-2026, pricing público de KIE + guide oficial Kling 3.0 de feb-2026). El guide
> oficial cobra en **créditos/s** (720p 6·1080p 8 sin audio; 9·12 con audio; +2 voice-
> control). El crédito **oficial de Kling API es $0.0125 (volumen) a $0.0151 (top-up
> chico)**; KIE benchmarkea contra **~$0.014/cr** (= 12 cr × $0.014 = $0.168 a 1080p
> con audio, que cuadra exacto con su columna "Official/Fal"). KIE cobra el equivalente
> a **~$0.011/cr-Kling** (27 cr-KIE × $0.005 = $0.135 ÷ 12 cr-Kling). Tabla real $/s:
>
> | Variante (Kling 3.0) | Oficial / directo | KIE | Δ |
> |---|---|---|---|
> | 720p sin audio | $0.084 | $0.07 | −16.7% |
> | 720p con audio | $0.112 | $0.10 | −10.7% |
> | 1080p sin audio | $0.112 | $0.09 | −19.6% |
> | 1080p con audio | $0.168 | $0.135 | −19.6% |
> | 4K (con/sin audio) | $0.42 | $0.335 | −20.2% |
> | motion-control v2v 720p | $0.126 | $0.10 | −20.6% |
> | motion-control v2v 1080p | $0.168 | $0.135 | −19.6% |
>
> **Por qué se queda directo igual:** el ahorro es real, pero el motivo de ruteo es
> **features**, no precio. Dos matices honestos: (1) **KIE SÍ expone `kling 3.0 motion
> control` (v2v)** — el gap real frente a KlingService no es el motion control sino
> **voz/lip-sync** y **Omni multi-ref**; (2) el "oficial" de la tabla es el rate
> **API pay-as-you-go**; si compras créditos Kling en **volumen ($0.0125/cr)** el
> descuento de KIE se encoge a **~−10%**. Regla: i2v/t2v plano sin voz/Omni → KIE es
> migrable (~−20%, ~−10% si compras Kling en volumen); con voz/lip-sync/Omni → directo.

## Por qué Veo y Nano Banana ganan en KIE

Google cobra caro en oficial. **Directo = oficial (caro). Vercel = lista (= oficial, caro, nunca baja). KIE = subsidia por debajo del oficial (barato).** Para modelos de Google, KIE le gana a ambos.

## Estado actual / decisiones

- **Nano Banana Pro → KIE:** implementado como provider **`Nano Banana Pro · KIE`** (model `nano-banana-pro`, 2K al precio de 1K, 9:16 nativo). Convive con el directo para **A/B**. Si la identidad se mantiene, hacerlo default.
- **GPT-4o image / Flux:** ya por KIE.
- **Kling / MiniMax:** se quedan **directo** (features).
- **Veo:** directo por ahora (features GeminiService); evaluar KIE si el costo domina.
- **Vercel AI Gateway:** queda como **backup/failover** (providers `GPT Image 2 · Gateway`, `Seedream 4.0 · Gateway`). No es la ruta primaria.

## Pendientes operativos

- `KIE_API_KEY` y `AI_GATEWAY_API_KEY` están en Vercel solo en **Production + Preview**. Para probar en local hay que agregarlas también al entorno **Development** (o `.env` local).
- 🔒 **Rotar `AI_GATEWAY_API_KEY`** (quedó expuesta en chat).
- Nano Banana Pro vía KIE **no se ha probado en vivo** (no hay KIE key local) — validar en prod o con la key en Development.
