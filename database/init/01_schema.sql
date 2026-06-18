-- =====================================================================
-- HawkDot — ESQUEMA PADRÃO do banco (tabelas base)
--
-- Este arquivo roda AUTOMATICAMENTE na criação do container Postgres,
-- via /docker-entrypoint-initdb.d (montado no docker-compose.yml).
-- Ele só executa quando o banco é criado pela 1ª vez (volume vazio).
--
-- ALTERAÇÕES POSTERIORES (novas colunas, índices, etc.) NÃO entram aqui:
-- devem virar arquivos em database/migrations/ e ser aplicadas com
-- ./database/migrate.sh.
--
-- Relacionamento: agents -> collections -> test_results + system_snapshots
--
-- Mapeamento de tipos para PostgreSQL:
--   INT PK   -> GENERATED ALWAYS AS IDENTITY (auto incremento nativo)
--   DATETIME -> TIMESTAMPTZ (servidor) / TIMESTAMP (relógio local do agente)
--   FLOAT    -> DOUBLE PRECISION
--   Tabelas de alto volume usam BIGINT no PK para não estourar o INT.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Tabela de controle de migrations (usada por database/migrate.sh)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Tabela 1 — agents (identidade do agente, quase estática)
-- ---------------------------------------------------------------------
CREATE TABLE agents (
    id              INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id        VARCHAR(100)  NOT NULL UNIQUE,   -- ID gerado pelo agente
    agent_name      VARCHAR(100),
    hostname        VARCHAR(255),
    os              VARCHAR(50),
    os_version      VARCHAR(50),
    serial_number   VARCHAR(100),
    mac_addresses   TEXT,
    local_ips       TEXT,
    dns_servers     TEXT,
    default_gateway VARCHAR(45),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
COMMENT ON TABLE agents IS 'Identidade do agente instalado no cliente (cresce 1x por máquina).';

-- ---------------------------------------------------------------------
-- Tabela 2 — collections (cada envio, a cada ~60s)
-- (received_at e created_at: inferidas; vieram cortadas no payload)
-- ---------------------------------------------------------------------
CREATE TABLE collections (
    id                BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id          INTEGER     NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    collection_number INTEGER,                       -- número sequencial da coleta
    local_time        TIMESTAMP,                     -- horário local do agente
    queue_depth       INTEGER,                       -- envios na fila
    received_at       TIMESTAMPTZ NOT NULL DEFAULT now(), -- INFERIDA: quando o collector recebeu
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(), -- INFERIDA: insert da linha
    -- evita gravar a mesma coleta (mesmo nº) duas vezes para o mesmo agente
    CONSTRAINT uq_collections_agent_number UNIQUE (agent_id, collection_number)
);
COMMENT ON TABLE collections IS 'Cada envio do agente (~a cada 60s).';

-- ---------------------------------------------------------------------
-- Tabela 3 — test_results (cada teste individual; ~12 por coleta)
-- (latency_ms, packet_loss_percent, jitter_ms: inferidas — métricas de ping)
-- ---------------------------------------------------------------------
CREATE TABLE test_results (
    id                  BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    collection_id       BIGINT       NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    type                VARCHAR(10)  NOT NULL,        -- ping, dns, http, speed, route, tcp
    name                VARCHAR(100),                 -- alvo (ex: "Cloudflare")
    target              VARCHAR(255),                 -- host ou URL testado
    success             BOOLEAN,
    -- ping (INFERIDAS) -----------------------------------------------
    latency_ms          DOUBLE PRECISION,            -- latência média (ping)
    packet_loss_percent DOUBLE PRECISION,            -- perda de pacotes % (ping)
    jitter_ms           DOUBLE PRECISION,            -- jitter (ping)
    -- dns ------------------------------------------------------------
    response_time_ms    DOUBLE PRECISION,            -- tempo de resolução DNS
    resolved_address    VARCHAR(45),                 -- IP resolvido
    -- http / speed ---------------------------------------------------
    total_time_ms       DOUBLE PRECISION,            -- tempo total da requisição
    http_status_code    INTEGER,                     -- código HTTP
    throughput_mbps     DOUBLE PRECISION,            -- velocidade em Mbps
    bytes_transferred   BIGINT,                      -- bytes baixados
    speed_kind          VARCHAR(10),                 -- internet ou internal
    -- route ----------------------------------------------------------
    route_hop_count     INTEGER,                     -- número de hops
    route_last_hop      VARCHAR(45),                 -- IP do último hop
    -- tcp ------------------------------------------------------------
    connect_time_ms     DOUBLE PRECISION,            -- tempo de conexão TCP
    -- garante valores válidos nos campos "enum" --------------------
    CONSTRAINT chk_test_type  CHECK (type IN ('ping','dns','http','speed','route','tcp')),
    CONSTRAINT chk_speed_kind CHECK (speed_kind IS NULL OR speed_kind IN ('internet','internal'))
);
COMMENT ON TABLE test_results IS 'Cada teste individual de uma coleta (~12 linhas por coleta).';

-- ---------------------------------------------------------------------
-- Tabela 4 — system_snapshots (uma linha por coleta — relação 1:1)
-- ---------------------------------------------------------------------
CREATE TABLE system_snapshots (
    id                      BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    collection_id           BIGINT       NOT NULL UNIQUE REFERENCES collections(id) ON DELETE CASCADE,
    cpu_model               VARCHAR(255),
    cpu_cores               INTEGER,
    cpu_logical_cores       INTEGER,
    cpu_load_1              DOUBLE PRECISION,
    memory_physical_bytes   BIGINT,
    memory_used_bytes       BIGINT,
    memory_free_bytes       BIGINT,
    memory_alloc_bytes      BIGINT,
    disk_total_bytes        BIGINT,
    disk_free_bytes         BIGINT,
    temperature_c           DOUBLE PRECISION,
    temp_source             VARCHAR(50),
    public_ip               VARCHAR(45),
    isp                     VARCHAR(100),
    interface_name          VARCHAR(100),
    interface_status        VARCHAR(20),
    interface_speed_mbps    DOUBLE PRECISION,
    interface_hardware_port VARCHAR(50)
);
COMMENT ON TABLE system_snapshots IS 'Snapshot de hardware/SO por coleta (relação 1:1 com collections).';

-- ---------------------------------------------------------------------
-- Índices nas chaves estrangeiras / consultas frequentes
-- ---------------------------------------------------------------------
CREATE INDEX idx_collections_agent_id        ON collections (agent_id);
CREATE INDEX idx_test_results_collection_id  ON test_results (collection_id);
CREATE INDEX idx_test_results_type           ON test_results (type);
-- system_snapshots.collection_id já tem índice por causa do UNIQUE.

-- ---------------------------------------------------------------------
-- Trigger: mantém agents.updated_at sempre atualizado
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMIT;
