#!/usr/bin/env bash
# =====================================================================
# HawkDot — instalador do AGENTE para Ubuntu/Linux
#
# O que ele faz, PASSO A PASSO (debug humano):
#   1. Verifica se o Node.js (>= 18) está instalado.
#   2. Cria o config.json a partir do exemplo (backend, nome, intervalo).
#   3. Roda UMA coleta de teste (registra a máquina no backend).
#   4. (Opcional) instala um serviço systemd + timer para coletar a cada N s.
#
# Uso:
#   ./install.sh --backend http://SEU_SERVIDOR:3000 --name "Minha Maquina"
#   ./install.sh --backend http://localhost:3000 --no-service   (só registra)
# =====================================================================
set -euo pipefail

# ---- valores padrão ----
BACKEND_URL="http://localhost:3000"
AGENT_NAME=""
INTERVAL=60
INSTALL_SERVICE=true

# ---- lê os argumentos ----
while [ $# -gt 0 ]; do
  case "$1" in
    --backend)  BACKEND_URL="$2"; shift 2 ;;
    --name)     AGENT_NAME="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --no-service) INSTALL_SERVICE=false; shift ;;
    *) echo "argumento desconhecido: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> [1/4] Verificando Node.js..."
if ! command -v node >/dev/null 2>&1; then
  echo "ERRO: Node.js não encontrado. Instale com:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt-get install -y nodejs"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERRO: Node.js >= 18 é necessário (encontrado: $(node -v))."
  exit 1
fi
echo "    Node $(node -v) OK"

echo "==> [2/4] Gerando config.json..."
[ -z "$AGENT_NAME" ] && AGENT_NAME="$(hostname)"
# Usa o Node para gerar o JSON com os valores escolhidos (evita erro de escaping).
node -e "
  const fs = require('fs');
  const base = JSON.parse(fs.readFileSync('config.example.json','utf8'));
  base.backendUrl = process.argv[1];
  base.agentName  = process.argv[2];
  base.intervalSeconds = Number(process.argv[3]);
  fs.writeFileSync('config.json', JSON.stringify(base, null, 2));
" "$BACKEND_URL" "$AGENT_NAME" "$INTERVAL"
echo "    config.json criado (backend=$BACKEND_URL, nome=$AGENT_NAME, intervalo=${INTERVAL}s)"

echo "==> [3/4] Registrando a máquina (coleta de teste)..."
node agent.js --once

echo "==> [4/4] Configurando execução contínua..."
if [ "$INSTALL_SERVICE" = true ] && command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" = "0" ]; then
  cat > /etc/systemd/system/hawkdot-agent.service <<EOF
[Unit]
Description=HawkDot Agent (coleta de qualidade de rede)
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$SCRIPT_DIR
ExecStart=$(command -v node) $SCRIPT_DIR/agent.js --once
EOF
  cat > /etc/systemd/system/hawkdot-agent.timer <<EOF
[Unit]
Description=Executa o HawkDot Agent a cada ${INTERVAL}s

[Timer]
OnBootSec=30
OnUnitActiveSec=${INTERVAL}
Unit=hawkdot-agent.service

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now hawkdot-agent.timer
  echo "    serviço systemd instalado e ativo (hawkdot-agent.timer)"
else
  echo "    systemd indisponível ou sem root — pulei o serviço."
  echo "    Para rodar em loop manualmente:"
  echo "      cd $SCRIPT_DIR && nohup node agent.js > agent.log 2>&1 &"
fi

echo ""
echo "✅ Instalação concluída. Veja a máquina no painel: $BACKEND_URL"
