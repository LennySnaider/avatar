-- Allow TTS audio files in the public generations bucket (voice → lipsync pipeline).
-- Without audio/mpeg, /api/voice/tts-file fails with
-- "Failed to persist media: mime type audio/mpeg is not supported".
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/wav','audio/x-wav']
WHERE id = 'generations';
