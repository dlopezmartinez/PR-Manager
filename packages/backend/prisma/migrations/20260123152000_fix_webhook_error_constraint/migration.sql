-- Fix webhook_event_valid_status constraint
-- The original constraint prevented storing errors when processed=false
-- But we need to store errors to track failures for retry

ALTER TABLE "webhook_events" DROP CONSTRAINT IF EXISTS "webhook_event_valid_status";
