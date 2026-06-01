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
| GPT 4o Image (KIE) | — | ⚠️ flojo | secundario |

### Receta de cada motor (lo que lo hizo funcionar)

**Nano Banana Pro (= Gemini 3 Pro Image, vía KIE):** mismo modelo que el directo.
Recibe el **harness completo** de `avatarPromptBuilder` (systemPreamble + identity
+ body specs + REFERENCE MAPPING etiquetado) + refs (face/angle/body/pose/scene).
Clona de **texto+refs**. Es el que mejor respeta "no tattoos" (strip de texto).

**GPT Image 2 (OpenAI, vía KIE):** NO le sirve el harness de Gemini (su lenguaje
"DEEPFAKE/FACE SWAP" dispara moderación y lo confunde). Funciona como **face-swap
EDIT**, imitando ChatGPT consumer:
- **2 imágenes:** Clone/original PRIMERO (canvas a recrear: pose/outfit/cuerpo/
  escena) + cara SEGUNDO (se reemplaza solo el rostro). Sin hoja de ángulos.
- **Prompt limpio y natural** (`buildLeanIdentityPrompt`, no el harness):
  *"Image 1 = foto a recrear exacta; Image 2 = cara a swapear; funde la cara con
  la luz/piel de Image 1; manos anatómicas."*
- **Resolución 1K** — KIE's gpt-image-2 i2i a 2K **se cuelga** (3 refs → 500/15min;
  2 refs → "running" indefinido). 1K completa rápido.
- Clona de **imagen** (no de texto). Por eso necesita el **Clone Ref cargado**.

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

## 🎬 Video (por segundo)

| Modelo | KIE | Directo (oficial) | Vercel Gateway | Ruteo recomendado |
|---|---|---|---|---|
| **Veo 3** | Fast **$0.05/s** ($0.40/8s) · Quality $0.25/s | Vertex **$0.75/s** | fast $0.10/s · full $0.20/s | **KIE si el costo manda**; directo si necesitas audio/multi-ref de GeminiService |
| **Kling** (i2v / motion) | v2.6 ~$0.04–0.07/s · v3 motion $0.10–0.135/s | oficial Kling | v2.6-i2v $0.07/s · v3.0-i2v $0.17/s | **DEJAR DIRECTO** (KlingService: motion control, voz, Omni) |
| **Seedance 2.0** | 480p $0.0575/s · 720p $0.125/s · 1080p $0.31/s | — | **$0.07/s** (base) | Vercel a 720p · KIE a 480p |
| **Wan 2.7 / 2.6** | 720p ~$0.08/s · 1080p ~$0.12/s | — | wan-2.6 $0.05–0.10/s | empate (versiones distintas) |
| MiniMax Hailuo 2.3 | — | oficial MiniMax | — | **DEJAR DIRECTO** (subject reference / avatar lock) |

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
