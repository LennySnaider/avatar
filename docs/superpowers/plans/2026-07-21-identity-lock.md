# Identity Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el prompt de escena deje de dictar la identidad del avatar (pelo, cuerpo, piel, ojos, edad, tatuajes); el avatar la define y gana siempre, salvo override explícito `[LOOK: …]`.

**Architecture:** Un módulo puro nuevo (`sceneSanitizer.ts`) con dos funciones — `stripSceneIdentity` (quita identidad de la escena; JSON-aware + regex de prosa) y `buildIdentityNegative` (negative prompt derivado del config) — más una constante `ANTI_WATERMARK_CLAUSE`. Se cablean en el choke point compartido `getFullPrompt()` y en `handleGenerate`. El módulo solo importa TIPOS, así que es testeable con el test runner nativo de Node (cero dependencias nuevas).

**Tech Stack:** TypeScript, Next.js 15, Zustand. Tests con el runner nativo de Node v22 (`node --experimental-strip-types --test`) — verificado funcional en este repo.

## Global Constraints

- El módulo `sceneSanitizer.ts` **solo** puede importar con `import type` (nada de imports runtime con alias `@/`), para que el test corra bajo `node --experimental-strip-types` sin resolver alias de tsconfig.
- Conservar SIEMPRE el peinado/estilo (`wavy`, `waves`, `ponytail`, `center part`, `layers`) — es escena, no color.
- El escape es un tag de texto `[LOOK:` (case-insensitive). Si está presente, `stripSceneIdentity` devuelve el prompt INTACTO.
- Regex globales (`/g`): resetear `lastIndex = 0` antes de cualquier `.test()` (statefulness). `.replace()` es seguro.
- No UI nueva. No tocar el path nano-banana/Gemini (deuda separada).
- Comandos de test: `node --experimental-strip-types --test src/utils/sceneSanitizer.test.ts` desde la raíz del repo.

---

### Task 1: `stripSceneIdentity` + regex de identidad

**Files:**
- Create: `src/utils/sceneSanitizer.ts`
- Test: `src/utils/sceneSanitizer.test.ts`

**Interfaces:**
- Produces: `stripSceneIdentity(prompt: string): string`; constantes regex exportadas `HAIR_COLOR_RES`, `BODY_RES`, `SKIN_RE`, `EYE_RE`, `AGE_RES`, `TATTOO_RE`; helper interno `stripProse`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/utils/sceneSanitizer.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripSceneIdentity } from './sceneSanitizer.ts'

test('JSON: quita identidad y conserva escena', () => {
    const input = JSON.stringify({
        subject: { description: 'a golden blonde woman', age: 'young adult (20s)' },
        hair: { color: 'golden blonde', style: 'loose waves' },
        body: { frame: 'curvy with a defined waist' },
        skin: { tone: 'fair to light' },
        clothing: { top: 'black lace bra' },
        background: { setting: 'cozy living room' },
        pose: { position: 'standing near a mirror' },
    })
    const out = stripSceneIdentity(input)
    const obj = JSON.parse(out)
    assert.equal(obj.hair, undefined)
    assert.equal(obj.body, undefined)
    assert.equal(obj.skin, undefined)
    assert.equal(obj.subject.age, undefined)
    assert.deepEqual(obj.clothing, { top: 'black lace bra' })
    assert.deepEqual(obj.pose, { position: 'standing near a mirror' })
    assert.ok(obj.background.setting === 'cozy living room')
})

test('JSON: filtra must_keep de apariencia, conserva escena', () => {
    const input = JSON.stringify({
        constraints: {
            must_keep: ['golden-blonde wavy hair', 'mauve sofa', 'warm lamp on the right'],
        },
    })
    const obj = JSON.parse(stripSceneIdentity(input))
    assert.ok(!obj.constraints.must_keep.includes('golden-blonde wavy hair'))
    assert.ok(obj.constraints.must_keep.includes('mauve sofa'))
    assert.ok(obj.constraints.must_keep.includes('warm lamp on the right'))
})

test('Prosa: quita color de pelo/físico/piel, conserva escena', () => {
    const out = stripSceneIdentity(
        'a curvy blonde woman with fair skin in a red dress on a beach',
    )
    assert.ok(!/blonde/i.test(out))
    assert.ok(!/curvy/i.test(out))
    assert.ok(!/fair skin/i.test(out))
    assert.ok(/red dress/i.test(out))
    assert.ok(/beach/i.test(out))
})

test('Prosa: conserva el peinado/estilo (no es color)', () => {
    const out = stripSceneIdentity('wavy hair with a center part in a ponytail')
    assert.ok(/wavy/i.test(out))
    assert.ok(/center part/i.test(out))
    assert.ok(/ponytail/i.test(out))
})

test('Escape [LOOK:] → intacto', () => {
    const input = '[LOOK: platinum blonde wig] a woman with fair skin at a party'
    assert.equal(stripSceneIdentity(input), input)
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --experimental-strip-types --test src/utils/sceneSanitizer.test.ts`
Expected: FAIL — `Cannot find module './sceneSanitizer.ts'`.

- [ ] **Step 3: Implementar `sceneSanitizer.ts` (parte 1)**

```ts
// src/utils/sceneSanitizer.ts
//
// Identity Lock — el prompt de escena NO debe dictar la identidad del avatar.
// stripSceneIdentity quita color de pelo, físico, piel, ojos, edad y tatuajes
// de la escena (que llega como JSON estructurado o prosa), dejando solo
// pose/outfit/lugar/luz/mood. El avatar (config + body ref + [BODY:]/[FACE:])
// define la identidad. Escape: un tag [LOOK: …] apaga el saneador para looks
// intencionales (peluca, disfraz, shoot temático).
//
// IMPORTANTE: este módulo SOLO importa tipos → corre bajo el test runner nativo
// de Node sin resolver alias @/ (los import type se strippean en runtime).

// Color de pelo (no estilo): "<color> ... hair" y la forma inversa.
export const HAIR_COLOR_RES: RegExp[] = [
    /\b(?:golden|dark|light|dirty|platinum|strawberry|jet)?[-\s]?(?:blonde|blond|brunette|brown|black|red|auburn|ginger|redhead|silver|grey|gray|raven)\b[^.,;:\n]{0,15}\bhair\b/gi,
    /\bhair\b[^.,;:\n]{0,15}\b(?:blonde|blond|brunette|brown|black|red|auburn|ginger|redhead|silver|grey|gray|raven)\b/gi,
]

// Físico: adjetivo de cuerpo + sustantivo de cuerpo, y descriptores sueltos.
export const BODY_RES: RegExp[] = [
    /\b(?:voluptuous|hourglass|slim|slender|petite|curvy|thick|toned|fit|athletic|muscular|lean|plus[-\s]?size)\b[^.,;:\n]{0,40}\b(?:figure|body|frame|waist|thighs|abdomen|physique|build|bust|hips|silhouette)\b/gi,
    /\b(?:visible ribcage|visible hip bones?|flat stomach|toned abdomen|defined abs)\b/gi,
]

export const SKIN_RE =
    /\b(?:fair|light|medium|olive|tan|tanned|dark|deep|porcelain|pale)\b(?:[-\s]to[-\s]\w+)?[^.,;:\n]{0,10}\bskin\b/gi

export const EYE_RE =
    /\b(?:blue|green|brown|hazel|grey|gray|amber|dark)\b[^.,;:\n]{0,10}\beyes?\b/gi

export const AGE_RES: RegExp[] = [
    /\b(?:early|mid|late)?[-\s]?(?:teens|twenties|thirties|forties|20s|30s|40s)\b/gi,
    /\b(?:young adult|\d{2}\s?(?:years old|yo))\b/gi,
]

export const TATTOO_RE = /\b(?:tattoos?|tattooed|inked|sleeve tattoo)\b[^.,;:\n]{0,30}/gi

const ALL_IDENTITY_RES: RegExp[] = [
    ...HAIR_COLOR_RES,
    ...BODY_RES,
    SKIN_RE,
    EYE_RE,
    ...AGE_RES,
    TATTOO_RE,
]

// Keys de identidad borradas del JSON parseado (nivel superior).
const IDENTITY_KEYS = ['hair', 'body', 'physique', 'skin', 'demographics', 'tattoos']
// Keys de identidad dentro de `subject`.
const SUBJECT_IDENTITY_KEYS = ['age', 'face', 'physique', 'demographics', 'hair', 'body', 'skin']

/** Quita frases de identidad de texto libre y limpia espacios/puntuación. */
export function stripProse(text: string): string {
    let out = text
    for (const re of ALL_IDENTITY_RES) out = out.replace(re, ' ')
    return out
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,;:])/g, '$1')
        .replace(/([.,;:])\1+/g, '$1')
        .trim()
}

/** true si la cadena contiene algún atributo de identidad. */
function matchesIdentity(s: string): boolean {
    return ALL_IDENTITY_RES.some((re) => {
        re.lastIndex = 0
        return re.test(s)
    })
}

function sanitizeJsonObject(obj: Record<string, unknown>): void {
    for (const k of IDENTITY_KEYS) delete obj[k]

    const subject = obj.subject
    if (subject && typeof subject === 'object' && !Array.isArray(subject)) {
        const s = subject as Record<string, unknown>
        for (const k of SUBJECT_IDENTITY_KEYS) delete s[k]
        if (typeof s.description === 'string') s.description = stripProse(s.description)
    }

    const constraints = obj.constraints
    if (constraints && typeof constraints === 'object' && !Array.isArray(constraints)) {
        const c = constraints as Record<string, unknown>
        for (const key of ['must_keep', 'avoid']) {
            const arr = c[key]
            if (Array.isArray(arr)) {
                c[key] = arr.filter(
                    (item) => typeof item !== 'string' || !matchesIdentity(item),
                )
            }
        }
    }
}

/**
 * Quita la identidad del avatar del prompt de escena. JSON → borra keys;
 * prosa → regex. `[LOOK: …]` → devuelve intacto (override intencional).
 */
export function stripSceneIdentity(prompt: string): string {
    if (!prompt) return prompt
    if (/\[LOOK:/i.test(prompt)) return prompt

    const trimmed = prompt.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed)
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                sanitizeJsonObject(parsed as Record<string, unknown>)
                return JSON.stringify(parsed)
            }
        } catch {
            // JSON inválido (editado a mano) → cae a prosa.
        }
    }
    return stripProse(prompt)
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --experimental-strip-types --test src/utils/sceneSanitizer.test.ts`
Expected: PASS — `# pass 5  # fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/sceneSanitizer.ts src/utils/sceneSanitizer.test.ts
git commit -m "feat(identity-lock): stripSceneIdentity — quita identidad del prompt de escena"
```

---

### Task 2: `buildIdentityNegative` + `ANTI_WATERMARK_CLAUSE`

**Files:**
- Modify: `src/utils/sceneSanitizer.ts`
- Test: `src/utils/sceneSanitizer.test.ts`

**Interfaces:**
- Consumes: `PhysicalMeasurements` (type-only) desde `@/@types/supabase` (campos usados: `bust?: number`, `hips?: number`, `build?: CurveLevel` donde `CurveLevel = 1|2|3|4|5`).
- Produces: `ANTI_WATERMARK_CLAUSE: string`; `buildIdentityNegative(m?: Partial<PhysicalMeasurements> | null): string`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// Añadir a src/utils/sceneSanitizer.test.ts
import {
    buildIdentityNegative,
    ANTI_WATERMARK_CLAUSE,
} from './sceneSanitizer.ts'

test('buildIdentityNegative: config curvy → anti-slimming + fijos', () => {
    const neg = buildIdentityNegative({ bust: 100, waist: 60, hips: 105 })
    assert.ok(/athletic slimness/i.test(neg))
    assert.ok(/flat chest/i.test(neg))
    assert.ok(/watermark/i.test(neg))
})

test('buildIdentityNegative: config no-curvy → solo fijos (sin anti-slimming)', () => {
    const neg = buildIdentityNegative({ bust: 84, waist: 62, hips: 90 })
    assert.ok(!/athletic slimness/i.test(neg))
    assert.ok(/watermark/i.test(neg))
})

test('buildIdentityNegative: build alto (5) dispara anti-slimming', () => {
    const neg = buildIdentityNegative({ build: 5 })
    assert.ok(/athletic slimness/i.test(neg))
})

test('ANTI_WATERMARK_CLAUSE menciona watermark y text', () => {
    assert.ok(/watermark/i.test(ANTI_WATERMARK_CLAUSE))
    assert.ok(/text/i.test(ANTI_WATERMARK_CLAUSE))
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --experimental-strip-types --test src/utils/sceneSanitizer.test.ts`
Expected: FAIL — `buildIdentityNegative is not a function` / import no encontrado.

- [ ] **Step 3: Implementar (añadir a `sceneSanitizer.ts`)**

Añadir el import de tipo al inicio del archivo (debajo del comentario de cabecera):

```ts
import type { PhysicalMeasurements } from '@/@types/supabase'
```

Y al final del archivo:

```ts
/** Cláusula anti-watermark universal (in-prompt) — Seedream/Wan no tienen
 *  parámetro negative en KIE, así que va como texto para los 3 motores. */
export const ANTI_WATERMARK_CLAUSE =
    'Do NOT add any watermark, logo, brand name, readable text, caption or signature anywhere in the image.'

const FIXED_NEGATIVE =
    'watermark, logo, brand text, readable text, signature, caption, extra fingers, deformed hands'

// El avatar es curvy si busto/caderas o el nivel `build` están sobre el promedio.
// Umbrales alineados con los presets: bust≥95cm / hips≥100cm / build≥4.
function isCurvy(m?: Partial<PhysicalMeasurements> | null): boolean {
    if (!m) return false
    if (typeof m.bust === 'number' && m.bust >= 95) return true
    if (typeof m.hips === 'number' && m.hips >= 100) return true
    if (typeof m.build === 'number' && m.build >= 4) return true
    return false
}

/**
 * negative_prompt derivado del config para las rutas que lo soportan nativo
 * (Qwen hoy). Anti-slimming si el avatar es curvy + fijos (watermark/manos).
 * En Seedream/Wan el anti-slimming ya lo cubre el [BODY:] autoritativo y el
 * anti-watermark va por ANTI_WATERMARK_CLAUSE in-prompt.
 */
export function buildIdentityNegative(
    m?: Partial<PhysicalMeasurements> | null,
): string {
    const parts: string[] = []
    if (isCurvy(m)) {
        parts.push(
            'small chest, flat chest, reduced bust volume, normalized anatomy, athletic slimness, slim hips',
        )
    }
    parts.push(FIXED_NEGATIVE)
    return parts.join(', ')
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --experimental-strip-types --test src/utils/sceneSanitizer.test.ts`
Expected: PASS — `# pass 9  # fail 0`.

- [ ] **Step 5: Verificar que el import de tipo no rompe el stripping**

El `import type` debe strippearse. Si el runner se queja de `@/@types/supabase`, es que NO se está tratando como type-only. Confirmar que la línea usa `import type` (no `import`). El test de Step 4 pasando es la prueba.

- [ ] **Step 6: Commit**

```bash
git add src/utils/sceneSanitizer.ts src/utils/sceneSanitizer.test.ts
git commit -m "feat(identity-lock): buildIdentityNegative + ANTI_WATERMARK_CLAUSE"
```

---

### Task 3: Cablear en `getFullPrompt()`

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_store/avatarStudioStore.ts`

**Interfaces:**
- Consumes: `stripSceneIdentity`, `ANTI_WATERMARK_CLAUSE` de `@/utils/sceneSanitizer`.

- [ ] **Step 1: Añadir el import**

En el bloque de imports superior de `avatarStudioStore.ts`, añadir:

```ts
import { stripSceneIdentity, ANTI_WATERMARK_CLAUSE } from '@/utils/sceneSanitizer'
```

- [ ] **Step 2: Sanear el prompt de escena**

En `getFullPrompt()`, línea ~652. Reemplazar:

```ts
                const prompt = sanitizeCloneTags(rawPrompt)
```

por:

```ts
                // Identity Lock: quita del prompt de escena los atributos de
                // identidad (pelo/cuerpo/piel/ojos/edad/tatuajes) que compiten
                // con el avatar. El avatar (config + [BODY:]/[FACE:] + body ref)
                // define la identidad. [LOOK: …] en el prompt lo desactiva.
                const prompt = stripSceneIdentity(sanitizeCloneTags(rawPrompt))
```

- [ ] **Step 3: Anexar el anti-watermark al prompt ensamblado**

En `getFullPrompt()`, línea ~727-729. Reemplazar:

```ts
                const assembled =
                    tags.length > 0 ? `${tags.join(' ')} ${prompt}` : prompt
                return stripNegatedTattoos(assembled)
```

por:

```ts
                const assembled =
                    tags.length > 0 ? `${tags.join(' ')} ${prompt}` : prompt
                // Anti-watermark universal (Seedream/Wan no tienen param negative).
                return `${stripNegatedTattoos(assembled)} ${ANTI_WATERMARK_CLAUSE}`
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "avatarStudioStore|sceneSanitizer" | head`
Expected: sin salida (sin errores en esos archivos).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_store/avatarStudioStore.ts"
git commit -m "feat(identity-lock): sanear escena + anti-watermark en getFullPrompt"
```

---

### Task 4: Cablear `buildIdentityNegative` en `handleGenerate`

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/AvatarStudioMain.tsx`

**Interfaces:**
- Consumes: `buildIdentityNegative` de `@/utils/sceneSanitizer`; `measurements` (ya disponible en el scope de `handleGenerate`, usado hoy para `hairEmphasis`); `deepfakeActive` (ya en scope).

- [ ] **Step 1: Añadir el import**

En los imports de `AvatarStudioMain.tsx`, añadir:

```ts
import { buildIdentityNegative } from '@/utils/sceneSanitizer'
```

- [ ] **Step 2: Pasar `negativePrompt` en la llamada de generación**

En `handleGenerate`, dentro del objeto de params que se pasa a `pollKieImageTask` (el bloque que ya incluye `hairEmphasis`/`eyeEmphasis`, ~línea 1744-1756), añadir DESPUÉS de `eyeEmphasis`:

```ts
                                // Identity Lock: negative derivado del config
                                // para rutas con negative nativo (Qwen). En
                                // deepfake se omite (el cuerpo/cara vienen del
                                // lienzo, no del config).
                                negativePrompt: deepfakeActive
                                    ? undefined
                                    : buildIdentityNegative(measurements),
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "AvatarStudioMain" | head`
Expected: sin salida.

- [ ] **Step 4: Verificación de humo (build)**

Run: `npm run lint 2>&1 | tail -20`
Expected: sin errores nuevos en los archivos tocados.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/AvatarStudioMain.tsx"
git commit -m "feat(identity-lock): pasar buildIdentityNegative en handleGenerate"
```

---

## Follow-up (fuera del plan, opcional)

- **Wan negative nativo:** verificar en una generación real si `wan/2-7-image` (KIE)
  acepta `negative_prompt`. Si sí, consumir `ctx.negativePrompt` en `wan.ts` como hace
  `qwen.ts`. NO incluido porque un campo desconocido puede provocar 422; requiere prueba
  live. Wan ya recibe anti-watermark (in-prompt) y anti-slimming (`[BODY:]`).
- **Path nano-banana/Gemini:** migrar `avatarPromptBuilder` para pasar por
  `stripSceneIdentity`. Deuda separada.

## Self-Review

- **Cobertura del spec:** stripSceneIdentity (T1), buildIdentityNegative +
  ANTI_WATERMARK_CLAUSE (T2), wiring getFullPrompt (T3), wiring handleGenerate (T4),
  escape [LOOK:] (T1 test), matriz por-motor (anti-watermark in-prompt T3 = universal;
  negative nativo T4 = Qwen). ✔
- **Placeholders:** ninguno; todo el código y comandos son concretos. ✔
- **Consistencia de tipos:** `PhysicalMeasurements` type-only; `CurveLevel = 1..5`
  (build≥4); `stripSceneIdentity`/`buildIdentityNegative`/`ANTI_WATERMARK_CLAUSE`
  nombrados igual en definición, tests y wiring. ✔
