# Librería de prompts: poses, uniformes y acciones por tramo — diseño

**Fecha:** 2026-08-01
**Estado:** aprobado por el usuario

## Problema

Tres huecos, medidos contra el código:

1. **Los presets de nicho no traen POSE.** Describen outfit + locación + luz +
   cámara, pero no qué hace el cuerpo. Ejemplo real del usuario (`sweet_girl`):
   *"…sitting on a windowsill hugging a plush pillow, golden morning light…,
   85mm portrait, shallow depth of field"* — no hay acción. Al subir el slider
   🌶️ el resultado es el avatar desnudo haciendo nada, que es literalmente la
   queja que ya originó los tramos (`spicyTiers`: *"manda todo sin ropa, sin
   mucho chiste o variedad"*).

2. **Las acciones spicy solo cubren el escalón bajo.** Son 10 y todas viven en
   `suggestive`/`lingerie` (lencería, bata, sábana, camisa mojada, medias). Los
   tramos `topless` (65-85) y `explicit` (85+) no tienen **ninguna**. El slider
   llega a 100; la librería acompaña hasta ~60. De vídeo hay 2 de 10.

3. **Cero rol ocupacional.** Los 8 nichos son estéticas (Sweet Girl, GFE,
   Gothic, Fitness, Baddie, E-girl, Boudoir, Lingerie). No hay uniformes, que es
   de lo que más tira en la plataforma.

**Bug latente encontrado de paso:** `handleUseActionPreset` concatena la acción
al FINAL (`${prompt}. ${preset.text}`). Es exactamente la posición donde el
presupuesto de prompt la trunca — el fallo que ya se corrigió para los chips de
estilo en `d5fb69e` ("morían en silencio").

## Asimetría que ordena el diseño

El modo 🌶️ **ya reescribe el vestuario** por tramo (`spicyTier.wardrobe`), pero
**no toca la pose**. De ahí:

- Los **nichos y uniformes** se escriben UNA vez; el slider les sube la ropa.
- Las **poses** sí necesitan variante por tramo: una pose de `explicit` no es la
  misma que una de `lingerie`.

## Arquitectura

### 1. `tier` en `ActionPreset`

Campo opcional `tier?: SpicyTier['key']`, **importando la clave desde
`@/utils/spicyTiers`** en vez de redeclarar las fronteras. Igual que el slider:
una sola fuente, o la etiqueta y el comportamiento se desincronizan. El drawer
agrupa las spicy por tramo usando las etiquetas reales de `spicyTier()`.

### 2. `nichePoses.ts` (nuevo) — poses por id de preset

```ts
export const NICHE_POSES: Record<string, { base: string; spicy?: string }>
```

Fichero aparte a propósito: los 90 presets existentes **no se tocan** (diff
enorme = riesgo alto sobre contenido ya validado). El consumidor compone
`text` + pose. `spicy` es la variante de tramo alto; si falta, se usa `base`.

Un test exige que **todo** preset de nicho tenga entrada — así el fichero no se
queda atrás cuando alguien añada presets.

### 3. Nicho `uniforms` 🌶️

15 profesiones: maestra, universitaria, enfermera, aeromoza · secretaria,
camarera, barista, doncella · policía, militar, bombera · entrenadora,
instructora de yoga, animadora.

Los de autoridad van **genéricos**: sin insignias, escudos, banderas ni nada que
imite un cuerpo real — además del motivo obvio, los motores rechazan uniformes
oficiales reconocibles.

### 4. Composición sin truncar

`handleUseActionPreset` inserta la acción **antes del bloque de cámara** en vez
de al final de la cadena.

## Restricción de contenido: adultez inequívoca

Ningún preset puede contener `school`, `schoolgirl`, `teen`, `young`, `girl` en
contexto de sujeto, ni equivalentes. "Alumna" se escribe como **universitaria
adulta** (campus, biblioteca, dorm). Motivo práctico además del evidente: el
saneador ya recorta señales de edad (`AGE_RES`), los motores rechazan la
ambigüedad y las plataformas cierran cuentas por ella. Se blinda con un test.

## Verificación

Los presets son datos, así que las invariantes van en tests:

- ids únicos en cada fichero (un id repetido pisa un preset en silencio).
- toda acción `category: 'spicy'` lleva `nsfw: true` **y** un `tier` válido — sin
  el flag se cuela en el Dice 🎲, sin el tramo no se agrupa.
- **guard de edad** sobre el texto de TODOS los presets (acciones + nichos +
  poses).
- vocabulario: los términos que ya se sabe que disparan filtros aguas abajo
  (`bikini`, `lingerie` crudos…) no aparecen en texto de preset.
- cobertura: todo preset de nicho tiene pose.

`npx tsc --noEmit` y `npm run lint` limpios. **No `npm run build`** (dev server
levantado, comparten `.next`).
