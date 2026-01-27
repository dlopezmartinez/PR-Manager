-- Add device tracking fields to sessions table for single-session enforcement
-- These fields enable tracking of which device each session belongs to and enforcing one active session per user

-- Add device_id column (nullable for existing sessions)
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "device_id" TEXT;

-- Add device_name column (human-readable device name)
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "device_name" TEXT;

-- Add is_active column to track active session (only one per user should be true)
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

-- Add last_sync_at to track when the session last synced
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "last_sync_at" TIMESTAMP(3);

-- Create index on userId + isActive for efficient lookups
CREATE INDEX IF NOT EXISTS "sessions_user_id_is_active_idx" ON "sessions"("user_id", "is_active");

-- Create index on deviceId for efficient lookups
CREATE INDEX IF NOT EXISTS "sessions_device_id_idx" ON "sessions"("device_id");
