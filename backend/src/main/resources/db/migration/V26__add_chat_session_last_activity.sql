ALTER TABLE chat_session
    ADD COLUMN last_activity_at TIMESTAMPTZ;

UPDATE chat_session
SET last_activity_at = created_at
WHERE last_activity_at IS NULL;

ALTER TABLE chat_session
    ALTER COLUMN last_activity_at SET NOT NULL;

CREATE INDEX idx_chat_session_recent_activity
    ON chat_session (workspace_id, created_by, last_activity_at DESC, created_at DESC);
