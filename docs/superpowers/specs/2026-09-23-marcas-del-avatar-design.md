# Marcas permanentes del avatar (tatuajes, cicatrices, lunares) — Diseño

**Fecha:** 2026-09-23
**Estado:** aprobado en conversación (decisiones de Lenny el 23-sep); prototipo de UI revisado
**Prototipo:** https://claude.ai/artifact/Q1VfH2PKEb8gyUNW4nYb4m

## Problema

Un avatar no puede tener un tatuaje. La meta es que una marca **sea parte de su cuerpo en toda generación futura**, no algo que haya que escribir en cada prompt. Hoy no hay ningún sitio donde ponerla, y tres cosas lo impiden a la vez:

1. **Las referencias `general` ("General Identity Photos") no llegan al modelo de imagen.** El array que viaja a KIE se arma a mano en `AvatarStudioMain.tsx:2051-2100` con los roles `face`, `angle`, `body`, `asset`, `pose`, `scene` y `place`; `generalRefs` se prepara (`:1898-1905`, `useImageOptimization.ts:103`) y se abandona. En Gemini directo solo se usa `avatarReferences[0]`, y **únicamente si no hay face ref** (`GeminiService.ts:2514-2522`) — en cuyo caso entraría etiquetada como `FACE_ANCHOR`, o sea que una foto de un antebrazo se leería como la cara. Las generales solo viajan de verdad en **vídeo**.

2. **El Identity Lock borra la palabra.** `sceneSanitizer.ts:77-78` define `TATTOO_RE`, está en `ALL_IDENTITY_RES` (`:94`) y `stripSceneIdentity` se aplica siempre al prompt de escena (`avatarStudioStore.ts:809`). Escribir *"rose tattoo on her left forearm"* llega al modelo como *"rose on her left forearm"*. Se clasificó el tatuaje como identidad que define el avatar (`docs/superpowers/specs/2026-07-21-identity-lock-design.md:28`) pero **el lado que la define nunca se construyó**: se quita de la escena y no hay dónde ponerlo.

3. **No hay dónde guardarla.** `avatar_references` (`supabase.ts:471-483`: `general|face|angle|body|body_nsfw|bust|glutes`) no tiene columna de zona, lado ni descripción, y arrastra un CHECK antiguo que rechaza tipos nuevos (`20260725190000_body_nsfw_reference_type.sql:20-35`: *"verificado con un insert de prueba: 23514"*). `bust` y `glutes` son el precedente de "referencia de región" y están **muertos**: `AvatarSelector.tsx:274-279` los descarta al cargar y nadie los crea.

## Qué es y qué no es

| | Referencia de escena (existe) | Marca permanente (este diseño) |
|---|---|---|
| Vive en | la generación | el avatar |
| Cuándo aplica | cuando se pide | siempre que la zona esté en cuadro y descubierta |
| Quién la define | el prompt | la ficha del avatar |
| Si nadie la menciona | no aparece | aparece igual |
| Dónde se guarda | en ningún sitio | tabla `avatar_marks` + horneada en las hojas |

## Decisiones

- **Zona de una lista cerrada + lado explícito.** Nada de texto libre: cada zona tiene su frase en inglés para el prompt, y el lado (`right`/`left`) es una columna aparte. Es el dato que los modelos más se inventan, y además espejean la imagen.
- **La visibilidad se mide por ROPA, no por NSFW.** Tres niveles: `always` (antebrazos, manos, cuello, nuca), `skin` (hombros, brazos, muslos, espalda, escote), `swim` (ingle, cadera, abdomen, costillas, lumbar, glúteos). La ingle se ve en bañador y **un bañador no es contenido adulto**: gatear esto por el modo NSFW del estudio sería el criterio equivocado.
- **Tabla propia `avatar_marks`**, no un tipo nuevo en `avatar_references`: una marca necesita zona, lado, contenido, estilo, tamaño y orientación, y esa tabla no tiene dónde ponerlos.
- **Tag `[MARKS: …]` inyectado en cada generación**, junto a `[FACE:]` y `[BODY:]` en `getFullPrompt` (`avatarStudioStore.ts:875-884`). Es la pieza de más impacto: funciona en **todos** los motores, incluidos los de solo texto, donde ninguna imagen extra llegaría.
- **El avatar manda sobre la escena.** `stripNegatedTattoos` (`promptSanitizer.ts:129-145`) se aplica al prompt de escena **antes** de ensamblar los tags, nunca al `[MARKS:]`. Y `TATTOO_RE` sigue borrando tatuajes que el usuario escriba en la escena: los tatuajes los define el avatar, no la toma.
- **Horneado en las tres hojas con Seedream i2i.** `routes/seedream.ts:2` — *"i2i PERMISIVO, hasta 10 imágenes"*, y `:146` resuelve `text-to-image` → `image-to-image` al llevar referencia. Es permisivo (`PROVIDER_TRAITS`), así que edita también la hoja nude, y **un solo motor para las tres hojas** evita que el tatuaje salga con distinto trazo en cada una. GPT Image 2, Flare, Nano Banana Pro y Gemini **no son permisivos**: quedan descartados para este trabajo.
- **UI: mapa corporal clicable**, con cada mitad rotulada ("Su derecha" a la izquierda del dibujo, invertido en la vista de espalda) y el texto exacto que se inyecta a la vista. La zona y el contenido los puede proponer el análisis de la foto; **el lado lo confirma siempre una persona**.

## Modelo de datos

Migración nueva, `supabase/migrations/20260923HHMMSS_avatar_marks.sql`:

```sql
create table if not exists avatar_marks (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    avatar_id uuid not null references avatars(id) on delete cascade,

    -- Lista cerrada: el prompt se arma de aquí, no de texto libre.
    zone text not null check (zone in (
        'cuello_lateral','nuca','detras_oreja',
        'hombro','brazo_exterior','brazo_interior',
        'antebrazo_interior','antebrazo_exterior','muneca','dorso_mano','dedos',
        'esternon','pecho','bajo_pecho','costillas','abdomen','cadera','ingle',
        'espalda_alta','omoplato','columna','lumbar','gluteo',
        'muslo_frontal','muslo_exterior','muslo_interior','pantorrilla','tobillo','pie'
    )),
    -- Nulo solo en zonas centrales (esternón, nuca, columna, lumbar, abdomen).
    side text check (side in ('right','left')),

    content text not null,              -- "peonía con hojas y capullo de rosa"
    ink_style text,                     -- "negro y gris, línea fina"
    coverage text,                      -- "dos tercios del antebrazo"
    orientation text,                   -- "de la muñeca al codo"

    -- La foto de la marca: material para hornear y para el rol `mark` (Fase 3).
    storage_path text,
    storage_provider text,

    baked_at timestamptz,               -- cuándo entró en las hojas canónicas
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists avatar_marks_avatar_idx on avatar_marks (avatar_id);
alter table avatar_marks enable row level security;
```

`avatar_marks` entra en `TENANT_TABLES` (`src/lib/org/orgTable.ts`): tiene `organization_id` y se lee siempre por `orgTable(ctx, 'avatar_marks')`.

## Zonas: frase, lado y ropa

| Zona | Frase para el modelo | Lado | Se ve con |
|---|---|---|---|
| `antebrazo_interior` | `inner {side} forearm` | sí | siempre |
| `antebrazo_exterior` | `outer {side} forearm` | sí | siempre |
| `dorso_mano` | `back of the {side} hand` | sí | siempre |
| `muneca` / `dedos` | `{side} wrist` / `{side} fingers` | sí | siempre |
| `cuello_lateral` / `nuca` / `detras_oreja` | `{side} side of the neck` / `nape of the neck` / `behind the {side} ear` | sí / no / sí | siempre |
| `hombro` / `brazo_exterior` / `brazo_interior` | `{side} shoulder` / `outer {side} upper arm` / `inner {side} upper arm` | sí | ropa ligera |
| `esternon` / `pecho` / `bajo_pecho` | `sternum, center of the chest` / `{side} chest` / `under the {side} breast` | no / sí / sí | ropa ligera · bañador |
| `costillas` / `abdomen` / `cadera` / `ingle` | `{side} ribs` / `stomach, below the navel` / `{side} hip` / `{side} groin, bikini line` | sí / no / sí / sí | bañador |
| `espalda_alta` / `omoplato` / `columna` / `lumbar` | `upper back` / `{side} shoulder blade` / `along the spine` / `lower back` | no / sí / no / no | ropa ligera · bañador |
| `gluteo` | `{side} buttock` | sí | bañador |
| `muslo_frontal` / `muslo_exterior` / `muslo_interior` | `front of the {side} thigh` / `outer {side} thigh` / `inner {side} thigh` | sí | ropa ligera |
| `pantorrilla` / `tobillo` / `pie` | `{side} calf` / `{side} ankle` / `top of the {side} foot` | sí | ropa ligera |

## Inyección en el prompt

En `getFullPrompt` (`avatarStudioStore.ts`), después de `[FACE: …]` y antes del ensamblado:

```
[MARKS — permanent tattoos and marks on her skin, part of her body, not clothing:
 inner right forearm — large black-and-grey fine-line peony with leaves, running wrist to elbow;
 back of the right hand — Medusa head with snakes, outline only;
 right groin, bikini line — small solid black rose.
 Reproduce each one ONLY when that area is in frame and uncovered; never print them on clothing.]
```

Orden de operaciones, y esto no es un detalle: `stripSceneIdentity` y `stripNegatedTattoos` se aplican **al prompt de escena**; los tags del avatar se añaden **después**. Hoy `getFullPrompt` hace `stripNegatedTattoos(assembled)` sobre el conjunto ya ensamblado — hay que moverlo para que no se coma el `[MARKS:]`.

## Horneado en las hojas canónicas

Es lo que convierte la marca en física: las hojas **son** la definición visual del avatar y viajan como referencia en cada generación.

1. Entrada: la hoja actual (`angle`, `body`, `body_nsfw`) + la foto de la marca + su zona, lado y orientación.
2. Motor: **Seedream i2i** para las tres, en la misma tanda.
3. Prompt de edición: *"add the tattoo shown in image 2 onto her `<zona>`; reproduce its design, scale and placement; change NOTHING else — same face, same body, same pose, same framing, same lighting"*. Anclar bien la identidad: Seedream es tan literal que llegó a **copiar la cara de una referencia de maniquí** (`routes/seedream.ts:101`).
4. Las dos hojas del Body Lab se generan juntas y la nude se hereda al refrescar la vestida, como ya hace `handleGenerateBody` en `AvatarEditDrawer.tsx` — si no, el cuerpo diverge.
5. Se guardan las hojas anteriores para poder deshacer, y se sella `baked_at`.

Efecto declarado: **cambia la identidad hacia adelante**. Lo generado antes no lleva la marca.

## Arreglo adyacente: la Angle Sheet

`planExtraRefs` (`src/services/kie/shared.ts:46-81`) ordena los roles `body`, `bust`, `glutes`, `asset`, `pose`, `scene`, `place`, `clone` — **`angle` no está**, así que la hoja de ángulos se descarta en seedream, flux-2, qwen3, gptImage25 y legacy; solo la ven nano-banana-pro y gpt-image-2. Es pérdida de identidad hoy, en los motores más usados, y es la misma lista donde entrará `mark`. Se arregla en el mismo trabajo.

## Fases

**Fase 0 — Registrar.** Migración, enum de zonas, `avatar_marks` en `TENANT_TABLES`, servicio y UI del mapa corporal. Las marcas se guardan y no hacen nada todavía.

**Fase 1 — El tag.** `[MARKS: …]` inyectado en `getFullPrompt` y el orden de saneado corregido. Aquí ya se nota en todos los motores.

**Fase 2 — Hornear.** Flujo de Seedream i2i sobre las tres hojas, con copia previa y `baked_at`.

**Fase 3 — Referencia de imagen.** Rol `mark` → `SKIN_MARK_REF` en `avatarPromptBuilder.ts` (`RefRole:17`, `ROLE_LABEL:365`, `ROLE_DESC:378`) con cláusula de **piel, no de ropa** (la de `asset` dice *"print on the outfit/props"*, que estamparía el tatuaje en la camiseta), más su entrada en `planExtraRefs` y en `kieReferenceImages`. Cabe: hoy se envían 5 de 8 en nano-banana-pro y 4 de 10 en seedream.

**Fase 4 — Angle Sheet** en `planExtraRefs`.

## Verificación

- `npx tsc --noEmit` y `npx eslint` sobre lo tocado; `npm test` para lo puro (frase de zona a partir de zona+lado, orden de saneado). Nunca `next build` local: la puerta es el build de Vercel.
- La migración se aplica por MCP de Supabase **solo con OK explícito**, y se comprueba con un insert de prueba que el CHECK acepta las zonas.
- Extremo a extremo: registrar las tres marcas de prueba, generar con y sin ellas y comparar; hornear y volver a generar para ver que la marca sale sin el tag.

## Expectativas y límites

- **El texto dentro de un tatuaje no se va a reproducir.** Los modelos de difusión destrozan la tipografía, y sobre piel curva peor. Sale una firma ilegible parecida; si tiene que ser exacta, solo horneada y nunca regenerada desde texto.
- **Las manos son la peor zona.** Los motores ya sufren con los dedos: un tatuaje ahí va a variar en cada generación.
- **Las marcas pequeñas y sólidas sobre zona plana** (la rosa de la ingle) son las que mejor se comportan.
- La fidelidad de **colocación** es floja en texto-a-imagen. Los que la respetan son los de edición literal sobre un clone, que es exactamente por lo que el horneado es la pieza central de este diseño y no un extra.
