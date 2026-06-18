-- =====================================================================
-- Migration 0001 (UP): adiciona modelo do equipamento e arquitetura
-- ao cadastro do agente (campos quase estáticos, por isso em `agents`).
--   - model: modelo do equipamento (ex: "Latitude 7420")
--   - arch:  arquitetura do SO (ex: "x64", "arm64")
-- =====================================================================

ALTER TABLE agents ADD COLUMN IF NOT EXISTS model VARCHAR(255);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS arch  VARCHAR(50);
