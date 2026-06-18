-- Adiciona public_ip à tabela agents para persistir o IP público
-- da máquina junto com sua identidade (além de system_snapshots).
ALTER TABLE agents ADD COLUMN public_ip VARCHAR(45);

INSERT INTO schema_migrations (version) VALUES ('0002_add_public_ip_agents')
ON CONFLICT DO NOTHING;
