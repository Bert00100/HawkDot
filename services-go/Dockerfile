# =====================================================
# HawkDot — Infra / Backend em Go (collector + processor)
# Stack: Go 1.26.x — conforme README
# Build multi-stage: compila e gera um binário pequeno.
# =====================================================

# ---- Etapa 1: build ----
FROM golang:1.26-alpine AS builder

WORKDIR /src

# Baixa dependências primeiro (aproveita cache de camadas)
COPY go.* ./
RUN go mod download

# Copia o código e compila
COPY . ./
RUN go build -o /out/collector ./collector

# ---- Etapa 2: imagem final (enxuta) ----
FROM alpine:latest

WORKDIR /app
COPY --from=builder /out/collector ./collector

EXPOSE 8080

CMD ["./collector"]
