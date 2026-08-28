-- Video stories currently have no server-generated poster frame — the
-- Flutter client already reads `thumbnailUrl` (StoryMediaItem/PublishedStory)
-- but the field was always empty, forcing a client-side video-frame
-- extraction just to render a grid tile.
ALTER TABLE stories
  ADD COLUMN thumbnail_url TEXT NULL AFTER media_url;
