# Cost Routing — KIE vs Directo vs Vercel AI Gateway

> Referencia de costos por modelo para decidir a qué proveedor rutear cada
> generación. Datos reales recopilados 2026-05-31 (pricing público de KIE,
> Google Vertex y la lista del Vercel AI Gateway). Verificar periódicamente —
> los precios cambian.

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
