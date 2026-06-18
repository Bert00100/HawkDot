// =====================================================================
// HawkDot backend — ponto de entrada (sobe o servidor HTTP)
// =====================================================================

import { createApp } from './app.js';
import { config } from './config.js';
import { closePool } from './db.js';

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`[hawkdot] backend ouvindo na porta ${config.port}`);
});

// Encerramento limpo: fecha o pool de conexões ao receber SIGTERM/SIGINT.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[hawkdot] recebido ${sig}, encerrando...`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  });
}
