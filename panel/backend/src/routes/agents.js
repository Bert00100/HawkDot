// =====================================================================
// Rotas CRUD de agentes — /api/agents
//   GET    /api/agents      -> lista
//   GET    /api/agents/:id  -> um
//   POST   /api/agents      -> cria
//   PUT    /api/agents/:id  -> atualiza
//   DELETE /api/agents/:id  -> remove
// =====================================================================

import { Router } from 'express';
import * as repo from '../repositories/agentsRepository.js';

export const agentsRouter = Router();

agentsRouter.get('/', async (req, res, next) => {
  try {
    res.json(await repo.listAgents());
  } catch (err) { next(err); }
});

agentsRouter.get('/:id', async (req, res, next) => {
  try {
    const agent = await repo.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: 'agente não encontrado' });
    res.json(agent);
  } catch (err) { next(err); }
});

agentsRouter.post('/', async (req, res, next) => {
  try {
    if (!req.body?.agent_id) {
      return res.status(400).json({ error: 'agent_id é obrigatório' });
    }
    res.status(201).json(await repo.createAgent(req.body));
  } catch (err) { next(err); }
});

agentsRouter.put('/:id', async (req, res, next) => {
  try {
    const agent = await repo.updateAgent(req.params.id, req.body);
    if (!agent) return res.status(404).json({ error: 'agente não encontrado' });
    res.json(agent);
  } catch (err) { next(err); }
});

agentsRouter.delete('/:id', async (req, res, next) => {
  try {
    const ok = await repo.deleteAgent(req.params.id);
    if (!ok) return res.status(404).json({ error: 'agente não encontrado' });
    res.status(204).end();
  } catch (err) { next(err); }
});
