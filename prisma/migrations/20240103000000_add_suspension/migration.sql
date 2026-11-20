-- Add suspension fields to users table
ALTER TABLE "users"
  ADD COLUMN "is_suspended"     BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN "suspended_reason" TEXT,
  ADD COLUMN "suspended_at"     TIMESTAMP(3);
