/**
 * De quién es el video que sale del editor.
 *
 * Existe porque "Save to gallery" pasó de meter un `blob:` en el store a
 * persistir una fila de `generations` de verdad, y esa fila necesita dueño y
 * trazabilidad. Las dos reglas de abajo no son obvias, por eso viven aquí
 * sueltas y testeadas en vez de enterradas en el componente.
 */

/** Lo que un clip del timeline recuerda de su origen en la galería. */
export interface ExportClipProvenance {
    avatarId?: string | null
    sourceGenerationId?: string
}

/** Pista horneada en el MP4 durante este export. */
export interface ExportAudioChoice {
    name?: string
    author?: string
    trackId?: string
    source?: 'tiktok-cml' | 'trending-apify' | 'upload'
}

export interface ExportProvenance {
    /** `generations.avatar_id`: decide por qué cuenta de Upload-Post se publica. */
    avatarId: string | null
    metadata: Record<string, unknown>
}

export function buildExportProvenance(
    clips: ExportClipProvenance[],
    audio?: ExportAudioChoice,
): ExportProvenance {
    const avatarId = clips.find((c) => c.avatarId)?.avatarId ?? null

    const metadata: Record<string, unknown> = { source: 'video-editor' }

    // SÓLO con un clip. `getPostedGenerationMap` usa muxedFrom para marcar
    // también como "Posted" el item original de la galería; con varios clips
    // unidos, apuntar al primero señalaría como publicado un video que sólo
    // aportó un trozo.
    if (clips.length === 1 && clips[0].sourceGenerationId) {
        metadata.muxedFrom = clips[0].sourceGenerationId
    }

    // Sin nombre no hay etiqueta que mostrar, así que la clave no se escribe:
    // `audioLabelFromMetadata` devolvería undefined igualmente, pero dejar
    // basura en el jsonb confunde a quien lo lea después.
    if (audio?.name && audio.name.trim().length > 0) {
        metadata.audio = {
            name: audio.name,
            ...(audio.author ? { author: audio.author } : {}),
            ...(audio.trackId ? { trackId: audio.trackId } : {}),
            ...(audio.source ? { source: audio.source } : {}),
        }
    }

    return { avatarId, metadata }
}
