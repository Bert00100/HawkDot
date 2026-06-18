# Migrations

Esta pasta guarda **alterações no banco feitas DEPOIS da criação inicial**.

- As **tabelas padrão** (esquema base) ficam em [`../init/01_schema.sql`](../init/01_schema.sql)
  e são criadas automaticamente quando o container Postgres é criado pela primeira vez.
- As **migrations** daqui servem para evoluir esse esquema sem recriar o banco:
  adicionar coluna, criar índice, alterar tipo, etc.

## Convenção de nomes

```
NNNN_descricao.up.sql    # aplica a mudança
NNNN_descricao.down.sql  # reverte a mudança (rollback)
```

Exemplo: `0001_add_coluna_x.up.sql` / `0001_add_coluna_x.down.sql`

> Numere em ordem crescente (0001, 0002, ...). Cada `.up.sql` deve ser idempotente
> sempre que possível (`IF NOT EXISTS`, etc.).

## Como aplicar

```bash
./database/migrate.sh          # aplica as migrations pendentes
./database/migrate.sh status   # mostra quais já foram aplicadas
```

O controle do que já rodou fica na tabela `schema_migrations`.
