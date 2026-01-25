-- Create WebhookEvent table for audit trail
CREATE TABLE "webhook_events" (
  id TEXT NOT NULL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_name TEXT NOT NULL,

  data JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMP,

  error TEXT,
  error_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT webhook_event_valid_status
    CHECK (processed = true OR error IS NULL)
);

CREATE INDEX idx_webhook_events_event_name
  ON "webhook_events"(event_name);
CREATE INDEX idx_webhook_events_processed
  ON "webhook_events"(processed);
CREATE INDEX idx_webhook_events_created_at
  ON "webhook_events"(created_at);
CREATE UNIQUE INDEX idx_webhook_events_event_id
  ON "webhook_events"(event_id);

-- Create WebhookQueue table for retry logic
CREATE TABLE "webhook_queue" (
  id TEXT NOT NULL PRIMARY KEY,
  webhook_event_id TEXT NOT NULL,

  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry TIMESTAMP NOT NULL,
  last_error TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (webhook_event_id)
    REFERENCES "webhook_events"(id) ON DELETE CASCADE,
  UNIQUE (webhook_event_id)
);

CREATE INDEX idx_webhook_queue_next_retry
  ON "webhook_queue"(next_retry);
CREATE INDEX idx_webhook_queue_retry_count
  ON "webhook_queue"(retry_count);
