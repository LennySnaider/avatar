# Fallback a KIE cuando Gemini se cae — diseño

**Fecha:** 2026-08-01
**Estado:** aprobado por el usuario, pendiente de plan de implementación

## Problema

El 2026-08-01 Google cortó el proyecto de Gemini por facturación: la API devuelve
`403 PERMISSION_DENIED — "Lightning dunning decision is deny for project:
projects/583399317943"` a **cualquier** petición, incluida una de texto plano
("Say OK"). Con eso caen las 20 funciones de `GeminiService` y, con ellas, el
análisis de imagen del Studio, el Clone Ref y los captions.

Dos agravantes que ya se corrigieron aparte y que NO son este trabajo:

1. Los `catch` aplanaban cualquier fallo a `"Failed to describe image."`, así que
   un corte de cuenta se leía como un problema de la IMAGEN. Resuelto con
   `geminiFailureMessage` (`src/utils/geminiError.ts`).
2. Gemini veta los desnudos en la ENTRADA (`blockReason: OTHER`, no configurable).
   Resuelto con el fallback text-only desde `generations.prompt`
   (`src/utils/captionScene.ts`). **KIE no arregla esto**: por debajo es el mismo
   modelo de Google con la misma política.

Este spec cubre solo la **caída de proveedor**.

## Hechos verificados (2026-08-01, contra la API real)

Endpoint: `POST https://api.kie.ai/gemini-2.5-flash/v1/chat/completions`,
`Authorization: Bearer $KIE_API_KEY`. Es **síncrono y OpenAI-compatible** — no el
`createTask`/`recordInfo` asíncrono que usa el resto de KIE en este repo.

| Capacidad | Resultado |
|---|---|
| Texto puro | ✅ HTTP 200 |
| Imagen por URL http | ✅ HTTP 200 |
| Imagen por `data:` base64 | ✅ HTTP 200 — **no documentado**, medido |
| `response_format.json_schema` | ✅ devuelve JSON conforme |
| `safetySettings` | ❌ no existe en la API |

Que el `data:` base64 funcione es lo que decide la arquitectura: el describe del
Studio manda base64 desde el navegador y **no hay que subir bytes a ningún sitio**.
Como no está documentado, puede desaparecer sin aviso → el cliente cae a subir la
imagen solo si dejara de funcionar (ver Riesgos).

Fuente de la doc: <https://docs.kie.ai/market/gemini/gemini-2-5-flash>

## Arquitectura

Tres piezas. Ninguna toca un solo carácter de los prompts existentes: esto es
**transporte**, no contenido.

### 1. `src/lib/ai/kieChat.ts` (nuevo)

Único sitio que conoce el endpoint de KIE. Traduce la forma de Gemini a la de KIE:

| Gemini | KIE |
|---|---|
| `parts[].inlineData {mimeType, data}` | `content[] {type:'image_url', image_url:{url:'data:<mime>;base64,<data>'}}` |
| `parts[].text` | `content[] {type:'text', text}` |
| `config.responseSchema` | `response_format.json_schema.schema` |
| `response.text` | `choices[0].message.content` |

Interfaz: `kieChatCompletion({ images?, text, jsonSchema? }): Promise<string>`.
Lanza si HTTP no es 2xx o si la respuesta no trae contenido.

### 2. `isProviderOutage(e)` en `src/utils/geminiError.ts`

Devuelve `true` **solo** para `403`, `429`, `5xx` y fallos de red. Un rechazo de
contenido (`blockReason`, `finishReason: SAFETY`) **no** es una caída — reintentarlo
en KIE gastaría crédito para recibir el mismo rechazo.

### 3. `askGemini()` en `GeminiService`

Envoltura única sobre `ai.models.generateContent`. Ejecuta la llamada de siempre;
si falla con `isProviderOutage`, la repite contra `kieChatCompletion`.

```ts
type AskResult = {
    text: string
    blockReason?: string      // solo Google; KIE no lo expone
    finishReason?: string
    via: 'google' | 'kie'
}
```

`via` se registra en log en cada fallback. Sin eso, una caída larga de Google
drena el monedero de KIE en silencio.

## Alcance

**Dentro** (13 llamadas, imagen→texto y captions): `describeImageForPrompt`,
`analyzeImageForClone`, `analyzeFaceFromImages`, `analyzePoseFromImage`,
`detectFaceBox`, `analyzeImageForPlace`, `analyzeReelMotion`, `locateRefWatermark`,
`generateVideoPromptFromImage`, `analyzeVideoForPrompt`, `retryAnalysisNeutral`,
`generateSocialCaption`, `translateSocialCaption`.

**Fuera**: `generateAvatar`, `editImage`, `generateVideo` — esas **generan** media y
ya tienen sus propias rutas KIE. Tampoco entra el módulo del Agente: sus embeddings
pgvector no son intercambiables entre modelos y cambiarlos invalidaría lo indexado.

## Riesgos y decisiones

- **Clone Ref está congelado.** `analyzeImageForClone` entra en el alcance, pero el
  fallback no altera su prompt. Verificación: comparar el texto emitido antes y
  después del refactor y exigir igualdad exacta.
- **KIE no acepta `safetySettings`.** Hoy se manda `BLOCK_NONE` en las 4 categorías;
  por KIE se va con el default de Google, **más restrictivo**. Durante una caída,
  algún análisis de ref sugerente que hoy pasa puede rehusar. Es un modo degradado
  aceptado, no un reemplazo equivalente. Se documenta en el aviso al usuario.
- **`data:` base64 no está documentado.** Si KIE lo retira, el fallback empieza a
  dar 400. Mitigación: el error de `kieChat` se propaga con su detalle (vía
  `geminiFailureMessage`), y la ruta de subida a storage ya existe
  (`uploadBufferToGenerations`) si hubiera que cambiar a URL.
- **Doble gasto.** Un fallback cobra en Google (fallido) y en KIE (bueno). Acotado
  a caídas reales por `isProviderOutage`.

## Verificación

- Tests puros, sin red: traducción Gemini→KIE (imagen, multi-imagen, jsonSchema) y
  la tabla de `isProviderOutage` (403/429/5xx/red = sí; bloqueo de contenido = no).
- Script de verificación contra la API real: con el 403 activo de hoy, comprobar
  que las funciones del alcance devuelven resultado con `via: 'kie'`.
- Igualdad de prompt emitido en `analyzeImageForClone` antes/después.
- `npx tsc --noEmit` y `npm run lint` sin errores nuevos. **No `npm run build`**: el
  dev server está levantado y comparten `.next`.
