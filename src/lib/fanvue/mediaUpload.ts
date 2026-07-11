/**
 * High-level media upload: take a `generations` row, stream its bytes from
 * Supabase storage, and run the full Fanvue multipart flow for a creator,
 * returning the `mediaUuid` usable in a post.
 *
 * Flow: create session → for each part get a presigned S3 URL and PUT the byte
 * range (capturing its ETag) → complete → poll until the media is ready.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FanvueClient } from './FanvueClient'
import type { FanvueMediaType, FanvueUploadPart } from './types'

/** Storage bucket holding generated avatar media. */
const GENERATIONS_BUCKET = 'generations'
/** Fallback S3 part size if the session omits/zeroes `partSize` (Fanvue uses ~6MB). */
const DEFAULT_PART_SIZE = 6 * 1024 * 1024

export interface UploadGenerationMediaInput {
    client: FanvueClient
    /** Managed-creator UUID for agency mode, or `null` to upload to self. */
    creatorUuid: string | null
    storagePath: string
    mediaType: FanvueMediaType
    /** Service-role Supabase client (its Storage API is DB-generic agnostic). */
    supabase: SupabaseClient
}

function deriveFilename(storagePath: string): string {
    const base = storagePath.split('/').pop() || 'media'
    return base.slice(0, 255)
}

/**
 * PUT one part to the exact presigned URL Fanvue handed us and return its ETag.
 *
 * SECURITY: we only ever PUT to that exact URL and refuse redirects, so a
 * compromised/malicious response can't make us send bytes to another host.
 */
async function putPart(signedUrl: string, chunk: ArrayBuffer): Promise<string> {
    const res = await fetch(signedUrl, {
        method: 'PUT',
        // Raw ArrayBuffer body: a valid BodyInit with no implicit Content-Type,
        // so the S3 presigned signature stays valid.
        body: chunk,
        redirect: 'error',
    })
    if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(
            `S3 part upload failed (${res.status}): ${body.slice(0, 200)}`,
        )
    }
    const etag = res.headers.get('etag') ?? res.headers.get('ETag')
    if (!etag) throw new Error('S3 part upload did not return an ETag')
    return etag
}

/**
 * Upload raw bytes (already in memory) through the full Fanvue multipart flow.
 * Shared core: `uploadGenerationMedia` downloads from storage then calls this;
 * voice notes (TTS buffers) call it directly.
 */
export async function uploadBufferMedia(input: {
    client: FanvueClient
    creatorUuid: string | null
    bytes: ArrayBuffer
    filename: string
    mediaType: FanvueMediaType
}): Promise<string> {
    const { client, creatorUuid, bytes, mediaType } = input
    const sizeBytes = bytes.byteLength
    if (sizeBytes === 0) throw new Error('Media is empty')
    const filename = input.filename.slice(0, 255)

    const session = await client.createUploadSession(creatorUuid, {
        name: filename,
        filename,
        mediaType,
        sizeBytes,
    })

    const partSize = session.partSize > 0 ? session.partSize : DEFAULT_PART_SIZE
    const totalParts =
        session.totalParts && session.totalParts > 0
            ? session.totalParts
            : Math.max(1, Math.ceil(sizeBytes / partSize))

    const parts: FanvueUploadPart[] = []
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * partSize
        const end = Math.min(start + partSize, sizeBytes)
        const chunk = bytes.slice(start, end)
        const signedUrl = await client.getPartSignedUrl(creatorUuid, session.uploadId, partNumber)
        const etag = await putPart(signedUrl, chunk)
        parts.push({ PartNumber: partNumber, ETag: etag })
    }

    await client.completeUpload(creatorUuid, session.uploadId, parts)
    await client.waitUntilMediaReady(creatorUuid, session.mediaUuid)
    return session.mediaUuid
}

export async function uploadGenerationMedia(
    input: UploadGenerationMediaInput,
): Promise<string> {
    const { client, creatorUuid, storagePath, mediaType, supabase } = input

    // Pull the bytes out of Supabase storage, then run the shared flow.
    const { data: blob, error } = await supabase.storage
        .from(GENERATIONS_BUCKET)
        .download(storagePath)
    if (error || !blob) {
        throw new Error(
            `Failed to download generation media: ${error?.message ?? 'not found'}`,
        )
    }
    // ArrayBuffer is a clean BodyInit (no ArrayBufferLike widening).
    const arrayBuffer = (await blob.arrayBuffer()) as ArrayBuffer
    return uploadBufferMedia({
        client,
        creatorUuid,
        bytes: arrayBuffer,
        filename: deriveFilename(storagePath),
        mediaType,
    })
}
