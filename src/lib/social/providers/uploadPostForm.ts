/**
 * Armado del cuerpo multipart de Upload-Post, aparte del cliente HTTP para
 * poder testearlo sin red (mismo criterio que `buildTrimArgs` en
 * VideoEditService).
 *
 * Aquí conviven DOS convenciones de nombre, y confundirlas no da error:
 *
 *   1. Overrides por plataforma → `${plataforma}_${clave}` (`tiktok_title`,
 *      `tiktok_music_id`, …). Los arma `buildPublishForm` desde
 *      `PlatformTarget.params`.
 *   2. Campos TOP-LEVEL del cuerpo → tal cual (`video`, `cover_url`,
 *      `audio_name`). Estos NO pasan por `params`: prefijados se convierten en
 *      campos inexistentes que la API IGNORA en silencio — el post se publica
 *      igual, sin el dato, y no hay forma de notarlo desde el código.
 *
 * Verificado contra el OpenAPI de Upload-Post (`POST /api/upload`).
 */
import type { PublishParams, VideoPostParams } from './SocialProvider'

/**
 * Build a FormData payload that matches Upload-Post's /upload* schema:
 *   user, platform[]=*, title, description, scheduled_date, timezone,
 *   {platform}_title, etc.
 *
 * Notes:
 * - `caption` (our API) maps to `title` (UP API). UP also accepts
 *   `description` for LinkedIn/Facebook/YouTube/Pinterest/Reddit; we
 *   mirror caption there so the same text shows on multi-platform posts.
 * - PlatformTarget.params is flattened into `{platform}_*` overrides
 *   when the value is a primitive (UP's per-platform field convention).
 *   Complex objects are JSON-stringified into `{platform}_params` as a
 *   fallback, but most params (privacy_level, share_to_feed, …) are
 *   primitives.
 */
export function buildPublishForm(params: PublishParams): FormData {
  const fd = new FormData()
  fd.append('user', params.username)
  for (const target of params.platforms) {
    fd.append('platform[]', target.platform)
  }
  fd.append('title', params.caption)
  fd.append('description', params.caption)
  if (params.scheduledAt) {
    fd.append('scheduled_date', params.scheduledAt.toISOString())
  }
  for (const target of params.platforms) {
    if (!target.params) continue
    for (const [key, value] of Object.entries(target.params)) {
      if (value === undefined || value === null) continue
      const fieldName = `${target.platform}_${key}`
      if (typeof value === 'object') {
        fd.append(fieldName, JSON.stringify(value))
      } else {
        fd.append(fieldName, String(value))
      }
    }
  }
  return fd
}

/**
 * Cuerpo de `POST /api/upload` (video). `video` viaja como URL pública, no
 * como binario.
 */
export function buildVideoUploadForm(params: VideoPostParams): FormData {
  const fd = buildPublishForm(params)
  fd.append('video', params.videoUrl)
  if (params.coverUrl) fd.append('cover_url', params.coverUrl)
  // TOP-LEVEL a propósito (ver cabecera): como `instagram_audio_name` sería un
  // campo inexistente y el Reel saldría sin etiqueta de audio, sin error.
  if (params.audioName) fd.append('audio_name', params.audioName)
  return fd
}
