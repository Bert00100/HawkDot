// =====================================================================
// HawkDot backend — montagem do app Express (sem subir o servidor aqui)
//
// Separar `app` (sem listen) de `server` facilita os TESTES: os testes
// importam o app e sobem em uma porta efêmera só durante a execução.
//
// PASSO A PASSO (debug humano):
//   1. express.json() lê o corpo JSON das requisições.
//   2. /api/health        -> healthcheck simples (não confundir com saúde de rede).
//   3. /api/collect       -> ingestão vinda do agente.
//   4. /api/agents        -> CRUD.
//   5. /api/dashboard/*   -> dados das telas.
//   6. frontend estático  -> servido da pasta panel/frontend.
//   7. handler de erro    -> centraliza respostas de erro em JSON.
// =====================================================================

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRouter } from './routes/collect.js';
import { agentsRouter } from './routes/agents.js';
import { dashboardRouter } from './routes/dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '../../frontend');

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Healthcheck do serviço (responde mesmo sem banco populado).
  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'hawkdot-backend' }));

  app.use('/api/collect', collectRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/dashboard', dashboardRouter);

  // Frontend estático (HTML/CSS/JS puro).
  app.use(express.static(FRONTEND_DIR));

  // Handler de erro central: usa err.statusCode quando existir (ex: 400).
  app.use((err, req, res, next) => {
    console.error('[erro]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  });

  return app;
}
