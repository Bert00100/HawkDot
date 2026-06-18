// Helpers de teste: sobe o app em porta efêmera e limpa o banco de teste.
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

export function startServer() {
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

export async function truncateAll() {
  await pool.query('TRUNCATE agents RESTART IDENTITY CASCADE');
}

export async function closeDb() {
  await pool.end();
}
