# =====================================================================
# HawkDot — Painel (backend Node.js + frontend estático)
# Stack: Node.js 24.x (Active LTS) — conforme README
# Contexto de build: ./panel
# =====================================================================
FROM node:24-alpine

# Backend fica em /app/backend; frontend em /app/frontend
# (mesma estrutura do repositório, para o static funcionar).
WORKDIR /app/backend

# Instala dependências primeiro (aproveita cache de camadas do Docker)
COPY backend/package*.json ./
RUN npm install --omit=dev

# Código do backend e arquivos do frontend
COPY backend/ ./
COPY frontend/ /app/frontend/

EXPOSE 3000

CMD ["node", "src/server.js"]
