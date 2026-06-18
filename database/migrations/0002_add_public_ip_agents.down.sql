ALTER TABLE agents DROP COLUMN IF EXISTS public_ip;

DELETE FROM schema_migrations WHERE version = '0002_add_public_ip_agents';
