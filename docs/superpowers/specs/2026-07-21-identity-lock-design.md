# Identity Lock — Scene Prompt Sanitizer + Negative Guard

**Fecha:** 2026-07-21
**Estado:** Diseño aprobado (pendiente review del usuario)

## Problema

La consistencia del avatar (cara, cuerpo, pelo, piel) se rompe en la generación de
contenido normal porque **el prompt de escena describe a otra persona**. Los prompts
(sobre todo los JSON estructurados que el usuario pega) traen atributos de identidad
—color de pelo, físico, tono de piel, ojos, edad, tatuajes— que **compiten con y
sobreescriben** la configuración del avatar y su body ref.

Evidencia reproducida:
- **Cuerpo:** un prompt con `physique: "fit, toned abdomen, visible ribcage"` salía
  delgado aunque el avatar es curvy. (Mitigado con el `[BODY:]` autoritativo.)
- **Pelo:** un prompt con `hair.color: "golden blonde"` (repetido 3× en
  `hair.color` + `description` + `must_keep`) salía rubio aunque el avatar no lo es.
  Solo Seedream lo respetaba a veces; Wan por volumen de menciones; **Qwen nunca**
  (stripea `[BODY:]`/`[FACE:]` y no tenía override de pelo).

Cada motor inyecta la identidad distinto, así que reforzarla motor por motor es
whack-a-mole. La causa raíz es única: **la escena no debería dictar identidad**.

## Objetivo

El prompt de escena solo lleva **escena** (pose, outfit, lugar, luz, encuadre, mood).
Toda la **identidad** (pelo, cuerpo, piel, ojos, edad, tatuajes) la define el avatar
—config + body ref— y gana el 100% de las veces, salvo override explícito del usuario.

## Alcance (identity lock completo)

Se quitan de la escena: **color de pelo, cuerpo/físico, tono de piel, color de ojos,
edad, tatuajes**. Se **conserva** el peinado/estilo (`wavy`, `ponytail`, `center part`)
—eso es escena, no color— y todo lo no-identidad (pose, ropa, fondo, cámara, luz, vibe).

## Arquitectura

Dos componentes en el choke point compartido `getFullPrompt()`
(`src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_store/avatarStudioStore.ts`),
donde ya se ensamblan `[BODY:]`/`[FACE:]` + la escena del usuario, y que alimenta a las
3 rutas KIE vía `kiePrompt`.

```
prompt de escena del usuario
   │
   ├─ ¿contiene [LOOK: …]? ── sí ──▶ pasa INTACTO (override intencional del usuario)
   │                          no
   ▼
stripSceneIdentity(prompt)  ──▶ escena SIN atributos de identidad
   │
   ▼
getFullPrompt ensambla:
   [BODY: autoritativo] [FACE:] {escena saneada} {anti-watermark clause}
   │
   ▼
rutas KIE (seedream/wan/qwen)  +  negativePrompt = buildIdentityNegative(measurements)
```

### Componente 1 — `stripSceneIdentity(prompt: string): string`

Archivo nuevo: `src/utils/sceneSanitizer.ts`. Enfoque **C** (JSON-aware + regex fallback):

1. **Escape:** si `prompt` contiene `[LOOK:` (case-insensitive) → devuelve `prompt` sin
   tocar. El usuario toma control total (peluca, disfraz, shoot temático).
2. **JSON path:** intenta `JSON.parse(prompt.trim())`. Si parsea a objeto:
   - Borra las keys de identidad de nivel superior y anidadas:
     `hair`, `body`, `physique`, `skin`, `demographics`, `tattoos`.
   - En `subject` (si existe objeto): borra `age`, `face`, `physique`, `demographics`,
     `hair`, `body`, `skin`. Conserva `description` pero le pasa el regex de prosa
     (puede traer "blonde hair" embebido).
   - En `constraints.must_keep` / `constraints.avoid` (si son arrays): filtra las
     entradas que matcheen el regex de identidad; conserva el resto.
   - Re-serializa con `JSON.stringify(obj)` (sin indentación — es prompt, no archivo).
3. **Prosa path** (parse falla): aplica el regex de identidad sobre el texto.
4. Colapsa espacios/comas dobles resultantes del borrado y trim.

**Regex de identidad** (compartidos entre must_keep-filter y prosa), constantes
exportadas para test:
- Pelo (color, no estilo):
  `/\b(golden|dark|light|dirty|platinum|strawberry|jet)?[-\s]?(blonde|blond|brunette|brown|black|red|auburn|ginger|redhead|silver|grey|gray|raven)\b[^.,;:\n]{0,15}\bhair\b/gi`
  y la forma inversa `/\bhair\b[^.,;:\n]{0,15}\b(blonde|blond|brunette|brown|black|red|auburn|ginger|redhead|silver|grey|gray|raven)\b/gi`
- Físico:
  `/\b(voluptuous|hourglass|slim|slender|petite|curvy|thick|toned|fit|athletic|muscular|lean|plus[-\s]?size|slender)\b[^.,;:\n]{0,40}\b(figure|body|frame|waist|thighs|abdomen|physique|build|bust|hips)\b/gi`
  y descriptores sueltos de físico: `/\b(visible ribcage|visible hip bones?|flat stomach|toned abdomen|defined abs)\b/gi`
- Piel: `/\b(fair|light|medium|olive|tan|tanned|dark|deep|porcelain|pale)\b[-\s]?(to[-\s]\w+\b)?[^.,;:\n]{0,10}\bskin\b/gi`
- Ojos: `/\b(blue|green|brown|hazel|grey|gray|amber|dark)\b[^.,;:\n]{0,10}\beyes?\b/gi`
- Edad: `/\b(early|mid|late)?[-\s]?(teens|20s|30s|40s|twenties|thirties)\b/gi` y
  `/\b(young adult|\d{2}\s?(years old|yo))\b/gi`
- Tatuajes: `/\b(tattoos?|tattooed|ink(ed)?|sleeve tattoo)\b[^.,;:\n]{0,30}/gi`

Cada regex borra el match. NO borra líneas de estilo de pelo (`wavy`, `waves`,
`ponytail`, `center part`, `layers`) porque no matchean color.

### Componente 2 — Guard negativo

**2a. Anti-watermark (universal, in-prompt).** Como Seedream/Wan NO tienen parámetro
`negative_prompt` en KIE, el anti-watermark se añade como **cláusula de texto** en
`getFullPrompt`, al final del prompt ensamblado (aplica a los 3 motores):

```
Do NOT add any watermark, logo, brand name, readable text, caption or signature anywhere in the image.
```

Constante exportada `ANTI_WATERMARK_CLAUSE` para test. Se añade siempre (no depende del
config).

**2b. `buildIdentityNegative(measurements): string`** en `src/utils/sceneSanitizer.ts`.
Devuelve un `negative_prompt` para las rutas que SÍ lo soportan nativo (Qwen hoy; otros
si aplica). Composición:
- **Anti-slimming derivado del config:** si `bust`/`hips` (o `build`/curvas) están por
  encima del promedio → añade `"small chest, flat chest, reduced bust volume, normalized anatomy, athletic slimness, slim hips"`.
- **Fijos:** `"watermark, logo, brand text, readable text, signature, caption, extra fingers, deformed hands"`.
- Devuelve `''` si no hay nada que añadir (measurements vacío).

**Delivery por motor** (matriz explícita):
| Motor | negative nativo | anti-slimming | anti-watermark |
|---|---|---|---|
| Qwen (`qwen2/image-edit`) | ✅ `input.negative_prompt` | vía negative nativo | vía negative nativo + cláusula in-prompt |
| Seedream (sin param) | ❌ | ya cubierto por `[BODY:]` autoritativo | cláusula in-prompt |
| Wan (sin param hoy) | ❌ (verificar en impl si `wan/2-7-image` acepta `negative_prompt`; si sí, usarlo) | ya cubierto por `[BODY:]` autoritativo | cláusula in-prompt |

**2c. Wiring:** `AvatarStudioMain.handleGenerate` hoy NO pasa `negativePrompt` en la
llamada de generación de contenido (solo el body sheet lo hace). Se añade
`negativePrompt: deepfakeActive ? undefined : buildIdentityNegative(measurements)` al
objeto de params de `pollKieImageTask`/`generateImageKie`. El param ya está threaded en
`KieService`/`context.ts` → llega a `ctx.negativePrompt` (Qwen ya lo consume).

## Ubicación de los cambios

- **Crear** `src/utils/sceneSanitizer.ts`: `stripSceneIdentity`, `buildIdentityNegative`,
  `ANTI_WATERMARK_CLAUSE`, y las constantes regex (exportadas para test).
- **Modificar** `avatarStudioStore.ts` `getFullPrompt()`: sanear el `prompt` del usuario
  con `stripSceneIdentity` antes de ensamblar tags; añadir `ANTI_WATERMARK_CLAUSE` al
  final del prompt ensamblado.
- **Modificar** `AvatarStudioMain.tsx` `handleGenerate`: pasar
  `negativePrompt: buildIdentityNegative(measurements)` (no en deepfake).
- **Verificar** en impl si Wan acepta `negative_prompt` nativo; si sí, consumirlo en
  `wan.ts` (como qwen.ts ya hace).

## No incluido (YAGNI)

- UI/toggle nuevo: el escape es un tag de texto (`[LOOK: …]`), sin componente nuevo.
- Migración del path nano-banana/Gemini (`avatarPromptBuilder`): fuera de alcance; este
  spec cubre el path KIE (Seedream/Wan/Qwen). Se anota como deuda separada.
- LLM rewrite (enfoque B): descartado por latencia (venimos de optimizar tiempo).

## Testing

Unit tests (Vitest/Jest según el repo) de `src/utils/sceneSanitizer.ts`:

1. **JSON real → limpio:** el JSON del selfie (hair.color golden blonde, body.frame
   curvy, skin.tone) → `stripSceneIdentity` quita `hair`/`body`/`skin` y **conserva**
   `pose`, `clothing`, `background`, `photography`, `lighting`.
2. **`must_keep` filtrado:** una entrada `"golden-blonde wavy hair"` en `must_keep` se
   quita; `"mauve sofa"` se conserva.
3. **Prosa:** `"a curvy blonde woman with fair skin in a red dress on a beach"` →
   quita `blonde`/`curvy`/`fair skin`, conserva `red dress`, `beach`.
4. **Estilo preservado:** `"wavy hair, center part, ponytail"` → NO se toca (no es color).
5. **Escape `[LOOK:]`:** `"[LOOK: platinum wig] a woman ..."` → devuelto INTACTO.
6. **`buildIdentityNegative`:** config curvy (bust/hips altos) → incluye anti-slimming;
   config vacío → solo fijos o `''`; siempre incluible en Qwen.
7. **`ANTI_WATERMARK_CLAUSE`:** presente en el prompt ensamblado de `getFullPrompt`.

## Riesgos

- **Sobre-borrado en prosa:** el regex podría comer contexto legítimo (ej. "black dress"
  no debe matchear pelo — mitigado exigiendo `hair` cerca). Los tests de prosa cubren los
  falsos positivos comunes.
- **JSON inválido tras edición del usuario:** cae al path de prosa (regex), que es
  degradado pero funcional.
