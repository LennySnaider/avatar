-- URL del audio de preview (frase corta TTS con la voz clonada), generado
-- una vez bajo demanda desde Your Voices.
ALTER TABLE cloned_voices
    ADD COLUMN IF NOT EXISTS preview_audio_url TEXT;
