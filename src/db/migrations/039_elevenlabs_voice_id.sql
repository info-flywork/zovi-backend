-- Per-mock-character ElevenLabs voice assignment for AI chat TTS.
ALTER TABLE user_profiles
  ADD COLUMN elevenlabs_voice_id VARCHAR(64) NULL
    COMMENT 'ElevenLabs voice_id for mock character TTS'
    AFTER avatar_blurhash;
