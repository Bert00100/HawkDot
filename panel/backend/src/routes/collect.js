// =====================================================================
// Rota de INGESTÃO — o agente envia as coletas para cá.
//   POST /api/collect
// =====================================================================

import { Router } from 'express';
import { ingestCollection } from '../repositories/ingestRepository.js';

export const collectRouter = Router();

collectRouter.post('/', async (req, res, next) => {
  try {
    const payload = req.body;
    // Validação mínima: sem agent_id não dá pra associar a coleta.
    if (!payload?.agent?.agent_id) {
      return res.status(400).json({ error: 'agent.agent_id é obrigatório' });
    }
    const result = await ingestCollection(payload);
    return res.status(201).json({ ok: true, ...result });
  } catch (err) {
    return next(err);
  }
});
