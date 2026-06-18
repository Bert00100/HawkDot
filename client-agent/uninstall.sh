#!/usr/bin/env bash
# =====================================================================
# HawkDot — DESINSTALADOR do agente (Ubuntu/Linux)
#
# PASSO A PASSO (debug humano):
#   1. Para e remove o serviço/timer systemd (se existir).
#   2. Mata qualquer loop do agente rodando via nohup.
#   3. Remove os arquivos de runtime (config.json, state.json, agent.log).
#
# Obs: NÃO apaga os dados já enviados ao backend. Para zerar no servidor,
#      remova a máquina pelo painel/API (DELETE /api/agents/:id).
# =====================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> [1/3] Removendo serviço systemd (se houver)..."
if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" = "0" ]; then
  systemctl disable --now hawkdot-agent.timer 2>/dev/null || true
  rm -f /etc/systemd/system/hawkdot-agent.timer /etc/systemd/system/hawkdot-agent.service
  systemctl daemon-reload 2>/dev/null || true
  echo "    serviço removido."
else
  echo "    systemd indisponível ou sem root — nada a fazer aqui."
fi

echo "==> [2/3] Encerrando loop do agente (se estiver rodando)..."
pkill -f "$SCRIPT_DIR/agent.js" 2>/dev/null && echo "    processo encerrado." || echo "    nenhum processo em execução."

echo "==> [3/3] Removendo arquivos de runtime..."
rm -f config.json state.json agent.log
echo "    config.json, state.json e agent.log removidos."

echo ""
echo "✅ Agente desinstalado desta máquina."
