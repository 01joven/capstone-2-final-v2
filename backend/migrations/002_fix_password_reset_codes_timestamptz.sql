-- Migration: Fix password_reset_codes timestamp columns to use timezone-aware types
-- Problem: TIMESTAMP WITHOUT TIME ZONE caused rate-limit and expiry checks to fail
--          when the server timezone (Manila/+08:00) differed from UTC stored values.
-- Fix: Convert all three timestamp columns to TIMESTAMPTZ (WITH TIME ZONE).
-- Applied: 2026-10-14

ALTER TABLE password_reset_codes
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'Asia/Manila',
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'Asia/Manila',
  ALTER COLUMN used_at    TYPE TIMESTAMPTZ USING used_at    AT TIME ZONE 'Asia/Manila';
