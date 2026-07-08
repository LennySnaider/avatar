-- supabase/migrations/20260707120000_avatar_default_voice.sql
-- Voz principal del avatar: referencia opcional a una voz clonada.
ALTER TABLE avatars
    ADD COLUMN IF NOT EXISTS default_voice_id UUID REFERENCES cloned_voices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_voices_avatar ON cloned_voices(avatar_id);
