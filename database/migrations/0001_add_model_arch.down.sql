-- Migration 0001 (DOWN): remove model e arch de agents.
ALTER TABLE agents DROP COLUMN IF EXISTS arch;
ALTER TABLE agents DROP COLUMN IF EXISTS model;
