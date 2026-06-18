// =====================================================================
// HawkDot backend — configuração central (lida do ambiente)
//
// PASSO A PASSO (debug humano):
//   1. As variáveis vêm do .env (via docker-compose) ou do ambiente.
//   2. Em testes, usamos um banco separado (PGDATABASE=hawkdot_test) para
//      não bagunçar os dados reais.
//   3. Se algo de conexão falhar, confira estes valores primeiro.
// =====================================================================

export const config = {
  port: Number(process.env.PORT || 3000),

  db: {
    host: process.env.PGHOST || process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.PGPORT || process.env.POSTGRES_PORT || 5432),
    user: process.env.PGUSER || process.env.POSTGRES_USER || 'hawkdot',
    password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || '',
    database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'hawkdot_db',
  },
};
