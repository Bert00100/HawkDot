# HawkDot 🦅

Sistema de monitoramento de qualidade de internet instalado no cliente, com painel central na VPS para coleta e visualização dos dados.

## Sumário

- [Visão geral](#visão-geral)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Stack de tecnologia](#stack-de-tecnologia)
- [Quem trabalha em quê](#quem-trabalha-em-quê)
- [Como rodar o projeto](#como-rodar-o-projeto)
- [Padrões e boas práticas](#padrões-e-boas-práticas)

---

## Visão geral

O HawkDot é composto por três grandes partes:

1. **Agente cliente**: instalado na máquina/rede do cliente, mede a qualidade da conexão de internet e envia os dados para a VPS.
2. **API / Infra (Go)**: recebe, processa e armazena os dados enviados pelos agentes.
3. **Painel web (JS)**: interface onde a equipe e/ou clientes visualizam os dados coletados (gráficos, status, histórico).

Tudo é executado via **Docker**, o que significa que cada parte do sistema roda isolada em seu próprio "container" (um ambiente fechado com tudo que aquela parte precisa para funcionar). Isso facilita: instalar, atualizar, mover para outro servidor e evitar que um problema em uma parte afete as outras.

---

## Estrutura de pastas

```
/var/www/hawkdot/
├── README.md                 # este arquivo
├── docker-compose.yml        # define todos os containers do projeto
├── .gitignore                # arquivos/pastas que não vão pro Git
├── .env.example               # modelo de variáveis de ambiente (sem dados reais)
│
├── panel/                    # PAINEL WEB (front-end + back-end do painel)
│   ├── frontend/              # interface visual (o que o usuário vê)
│   ├── backend/               # lógica do painel, API que alimenta o frontend
│   └── Dockerfile
│
├── services-go/              # INFRA / BACKEND EM GO
│   ├── collector/             # recebe os dados enviados pelos agentes clientes
│   ├── processor/             # processa/organiza os dados recebidos
│   └── Dockerfile
│
├── client-agent/             # INSTALADOR / AGENTE QUE RODA NO CLIENTE
│   └── (a definir: linguagem ainda não decidida)
│
├── database/                 # BANCO DE DADOS
│   ├── init/                  # tabelas PADRÃO (criadas junto com o container)
│   ├── migrations/            # alterações na estrutura APÓS a criação
│   ├── seeds/                 # dados iniciais para testes
│   └── migrate.sh             # aplica as migrations pendentes
│
└── postgres-data/            # dados reais do Postgres (NUNCA vai pro Git)
```

> **Por que separar assim?** Cada pasta principal representa uma área de responsabilidade diferente. Isso significa que um desenvolvedor de front-end não precisa entender o código em Go para conseguir trabalhar, e vice-versa. Essa separação é chamada de **separação de responsabilidades** — um princípio fundamental em projetos de software, que evita que tudo fique misturado e difícil de manter.

---

## Stack de tecnologia

| Camada | Tecnologia | Versão recomendada | Tipo de versão |
|---|---|---|---|
| Banco de dados | PostgreSQL | **17.x** (ex: 17.10) | Estável, ampla maturidade |
| Painel web (front-end e/ou back-end) | Node.js | **24.x** (Active LTS) | LTS |
| Infra / Coleta de dados | Go | **1.26.x** | Estável (Go não tem trilha LTS oficial — veja nota abaixo) |
| Containerização | Docker + Docker Compose | Mais recente estável | — |

### Notas importantes sobre as versões

**Sobre o Postgres:** a versão estável mais recente é a 18.4, porém recomendo começar na **linha 17**, pois é uma versão mais madura (mais tempo em produção em outros projetos, menos chance de bugs desconhecidos). Se quiser usar recursos mais novos, a 18 também é uma opção válida e já está estável.

**Sobre o Node.js:** o conceito de "LTS" (Long Term Support / Suporte de Longo Prazo) existe justamente pra evitar isso: você usa uma versão que vai receber correções de segurança por mais tempo, em vez de correr atrás de versões muito novas o tempo todo. O Node.js 24 é a versão atualmente em Active LTS, ou seja, é a recomendada para projetos em produção agora.

**Sobre o Go:** aqui vale uma observação importante — diferente do Node.js, **a linguagem Go não possui um conceito oficial de "LTS"**. Cada versão major do Go é suportada apenas até existirem duas versões major mais novas que ela. Na prática, isso significa: usamos sempre a versão estável mais recente (atualmente **1.26.x**) e mantemos o hábito de atualizar a cada 6 meses aproximadamente, quando uma nova versão sai.

**Sobre Ruby/Rails:** você mencionou Ruby na ideia inicial do projeto. Caso decidam usar Ruby em alguma parte do painel, a versão estável mais recente é a 4.0.x, mas como é uma versão muito nova (lançamento recente), pode ser mais seguro considerar a série 3.3, que tem mais tempo de maturidade no mercado, até a 4.0 ganhar mais adoção.

**Sobre o Agente Cliente:** você mencionou que essa parte ainda não foi decidida (linguagem/stack do instalador). Recomendo Go também para essa parte, pelos seguintes motivos práticos para um agente que roda na máquina do cliente:
- Gera um único arquivo executável, sem precisar instalar nada extra na máquina do cliente
- Roda em Windows, Linux e Mac com o mesmo código-fonte
- Consome pouca memória, ideal para ficar rodando em segundo plano

---

## Quem trabalha em quê

### 🎨 Front-end (Painel Web)
**Pasta:** `panel/frontend/`

Responsável pela interface visual: gráficos de qualidade de internet, dashboards, telas de login, etc.

- Tecnologia: JavaScript (framework a definir — ex: React, Vue)
- Não precisa se preocupar com: banco de dados, infraestrutura, Go
- Acessa dados através de: chamadas à API do `panel/backend/`

### ⚙️ Back-end do Painel
**Pasta:** `panel/backend/`

Responsável pela lógica do painel: autenticação de usuários, regras de negócio, organização dos dados antes de mandar pro front-end.

- Tecnologia: Node.js (ou Ruby, a definir)
- Conecta-se com: banco de dados (Postgres) e com a API de infraestrutura (Go)

### 🛰️ Infra / Backend em Go
**Pasta:** `services-go/`

Responsável por **receber** os dados enviados pelos agentes instalados nos clientes, validar essas informações e gravar no banco.

- Tecnologia: Go
- Lida com: alta quantidade de conexões simultâneas (muitos clientes enviando dados ao mesmo tempo)
- Não lida com: interface visual

### 🗄️ Banco de Dados
**Pasta:** `database/`

Responsável por desenhar como os dados são organizados (tabelas, relacionamentos) e garantir que tudo migre de forma segura conforme o projeto cresce.

- Tecnologia: PostgreSQL
- Trabalha em conjunto com: quem desenvolve o back-end do painel e os serviços Go, já que ambos leem/gravam dados no banco

### 📡 Agente Cliente
**Pasta:** `client-agent/`

Responsável pelo programa que roda na máquina/rede do cliente, mede a qualidade da internet (latência, perda de pacotes, velocidade) e envia esses dados para a infraestrutura na VPS.

- Tecnologia: a definir (sugestão: Go, pelos motivos explicados acima)
- Comunica-se com: `services-go/collector/`

---

## Banco de dados

O banco é o **PostgreSQL** e tem duas partes bem separadas:

- **Tabelas padrão (esquema base):** ficam em `database/init/01_schema.sql` e são criadas
  **automaticamente quando o container do Postgres é criado pela primeira vez** (o Docker
  executa tudo que está em `database/init/`). Não precisa rodar nada à mão.
- **Migrations (alterações posteriores):** ficam em `database/migrations/` e servem para
  **evoluir o esquema depois** que o banco já existe (adicionar coluna, índice, etc.).
  Aplicadas com `./database/migrate.sh`. O controle do que já rodou fica na tabela
  `schema_migrations`.

> ⚠️ Os scripts de `database/init/` só rodam com o volume **vazio** (primeira criação).
> Se o banco já existe, qualquer mudança no esquema deve ser feita via **migration**.

### Relacionamento entre as tabelas

```
agents  ──<  collections  ──<  test_results
                          └──   system_snapshots   (1:1)
```

Uma máquina gera um `agent`; cada envio (~60s) gera uma `collection`; cada coleta gera
vários `test_results` (~12, um por teste) e exatamente um `system_snapshot`.

### Tabela `agents` — identidade do agente (cresce 1x por máquina)

| Coluna | Tipo | Descrição |
|---|---|---|
| id | INTEGER PK (identity) | Chave primária |
| agent_id | VARCHAR(100) UNIQUE NOT NULL | ID gerado pelo agente |
| agent_name | VARCHAR(100) | Nome do agente |
| hostname | VARCHAR(255) | Nome do computador |
| os | VARCHAR(50) | Sistema operacional |
| os_version | VARCHAR(50) | Versão do SO |
| serial_number | VARCHAR(100) | Número de série da BIOS |
| mac_addresses | TEXT | MACs separados por vírgula |
| local_ips | TEXT | IPs locais separados por vírgula |
| dns_servers | TEXT | DNS configurados |
| default_gateway | VARCHAR(45) | Gateway padrão |
| created_at | TIMESTAMPTZ | Primeiro registro |
| updated_at | TIMESTAMPTZ | Última atualização (trigger automática) |

### Tabela `collections` — cada envio (~a cada 60s)

| Coluna | Tipo | Descrição |
|---|---|---|
| id | BIGINT PK (identity) | Chave primária |
| agent_id | INTEGER FK → agents | Referência ao agente |
| collection_number | INTEGER | Número sequencial da coleta |
| local_time | TIMESTAMP | Horário local do agente |
| queue_depth | INTEGER | Quantos envios estão na fila |
| received_at | TIMESTAMPTZ | *(inferida)* Quando o collector recebeu |
| created_at | TIMESTAMPTZ | *(inferida)* Insert da linha |

> Restrição `UNIQUE (agent_id, collection_number)` para não gravar a mesma coleta 2x.

### Tabela `test_results` — cada teste individual (~12 por coleta)

| Coluna | Tipo | Descrição |
|---|---|---|
| id | BIGINT PK (identity) | Chave primária |
| collection_id | BIGINT FK → collections | Referência à coleta |
| type | VARCHAR(10) NOT NULL | `ping`, `dns`, `http`, `speed`, `route`, `tcp` (CHECK) |
| name | VARCHAR(100) | Nome do alvo (ex: "Cloudflare") |
| target | VARCHAR(255) | Host ou URL testado |
| success | BOOLEAN | Se o teste passou |
| latency_ms | DOUBLE PRECISION | *(inferida)* Latência média — ping |
| packet_loss_percent | DOUBLE PRECISION | *(inferida)* Perda de pacotes % — ping |
| jitter_ms | DOUBLE PRECISION | *(inferida)* Jitter — ping |
| response_time_ms | DOUBLE PRECISION | Tempo de resolução DNS |
| resolved_address | VARCHAR(45) | IP resolvido — dns |
| total_time_ms | DOUBLE PRECISION | Tempo total da requisição — http/speed |
| http_status_code | INTEGER | Código HTTP |
| throughput_mbps | DOUBLE PRECISION | Velocidade em Mbps — speed |
| bytes_transferred | BIGINT | Bytes baixados — speed |
| speed_kind | VARCHAR(10) | `internet` ou `internal` (CHECK) |
| route_hop_count | INTEGER | Número de hops — route |
| route_last_hop | VARCHAR(45) | IP do último hop — route |
| connect_time_ms | DOUBLE PRECISION | Tempo de conexão TCP — tcp |

### Tabela `system_snapshots` — hardware/SO por coleta (1:1)

| Coluna | Tipo | Descrição |
|---|---|---|
| id | BIGINT PK (identity) | Chave primária |
| collection_id | BIGINT FK → collections (UNIQUE) | Referência à coleta (1:1) |
| cpu_model | VARCHAR(255) | Modelo do processador |
| cpu_cores | INTEGER | Núcleos físicos |
| cpu_logical_cores | INTEGER | Núcleos lógicos |
| cpu_load_1 | DOUBLE PRECISION | Load médio 1 minuto |
| memory_physical_bytes | BIGINT | RAM total |
| memory_used_bytes | BIGINT | RAM em uso |
| memory_free_bytes | BIGINT | RAM livre |
| memory_alloc_bytes | BIGINT | RAM usada pelo processo |
| disk_total_bytes | BIGINT | Espaço total do disco |
| disk_free_bytes | BIGINT | Espaço livre no disco |
| temperature_c | DOUBLE PRECISION | Temperatura da CPU em °C |
| temp_source | VARCHAR(50) | Fonte do sensor de temperatura |
| public_ip | VARCHAR(45) | IP público |
| isp | VARCHAR(100) | Provedor de internet |
| interface_name | VARCHAR(100) | Interface ativa (Ethernet/Wi-Fi) |
| interface_status | VARCHAR(20) | Status da interface |
| interface_speed_mbps | DOUBLE PRECISION | Velocidade negociada do link |
| interface_hardware_port | VARCHAR(50) | Tipo de porta física |

> As colunas marcadas como *(inferida)* vieram cortadas no payload original e foram
> deduzidas — confirmar contra o JSON real do agente antes de subir para produção.

---

## Como rodar o projeto

```bash
# 1. Clonar o repositório (já feito, se você está lendo isso na VPS)
cd /var/www/hawkdot

# 2. Copiar o arquivo de variáveis de ambiente de exemplo
cp .env.example .env
# Depois, edite o .env com os valores reais (senhas, etc.)

# 3. Subir todos os containers
docker compose up -d

# 4. Verificar se está tudo rodando
docker ps
```

> **O que esses comandos fazem?** O `docker compose up -d` lê o arquivo `docker-compose.yml` e cria/inicia todos os containers descritos nele (banco de dados, painel, serviços Go) de uma vez só, em segundo plano (por isso o `-d`, de "detached").

---

## Padrões e boas práticas

Algumas regras simples que valem para qualquer pessoa contribuindo no projeto:

- **Nunca** commitar arquivos `.env` ou qualquer coisa com senha/token real (veja o `.gitignore`)
- Sempre criar uma branch nova para cada funcionalidade (não trabalhar direto na `main`)
- Escrever mensagens de commit que expliquem **o que** mudou e **por quê**
- Antes de instalar uma nova dependência (biblioteca), verificar se ela é mantida ativamente e tem boa reputação

---

## Status do projeto

🚧 Em desenvolvimento inicial — estrutura de pastas e infraestrutura sendo configuradas.