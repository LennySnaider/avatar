-- Ajustes de TTS por voz (speed 0.5-2, pitch -12..12, emotion) usados por
-- Audio Preview y el modo Speak del Avatar Studio.
ALTER TABLE cloned_voices
    ADD COLUMN IF NOT EXISTS tts_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
