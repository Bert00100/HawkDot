// =====================================================================
// Rotas do DASHBOARD — /api/dashboard
//   GET /api/dashboard/summary                      -> cards do topo
//   GET /api/dashboard/networks                     -> tabela por rede
//   GET /api/dashboard/machines/:id                 -> detalhe (bloco 1)
//   GET /api/dashboard/machines/:id/tests           -> testes (bloco 2)
//   GET /api/dashboard/machines/:id/history?period= -> histórico (bloco 3)
//   GET /api/dashboard/machines/:id/interfaces      -> interfaces (bloco 4)
// =====================================================================

import { Router } from 'express';
import * as svc from '../services/dashboardService.js';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', async (req, res, next) => {
  try { res.json(await svc.getSummary()); } catch (err) { next(err); }
});

dashboardRouter.get('/networks', async (req, res, next) => {
  try { res.json(await svc.getNetworks()); } catch (err) { next(err); }
});

dashboardRouter.get('/machines/:id', async (req, res, next) => {
  try {
    const detail = await svc.getMachineDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'máquina não encontrada' });
    res.json(detail);
  } catch (err) { next(err); }
});

dashboardRouter.get('/machines/:id/tests', async (req, res, next) => {
  try { res.json(await svc.getMachineTests(req.params.id)); } catch (err) { next(err); }
});

dashboardRouter.get('/machines/:id/history', async (req, res, next) => {
  try {
    const period = req.query.period || '24h';
    res.json(await svc.getMachineHistory(req.params.id, period));
  } catch (err) { next(err); }
});

dashboardRouter.get('/machines/:id/interfaces', async (req, res, next) => {
  try { res.json(await svc.getMachineInterfaces(req.params.id)); } catch (err) { next(err); }
});
