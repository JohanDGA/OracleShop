-- Habilita matching fuzzy (Capa 2) y prepara la columna normalizada que indexamos.

create extension if not exists pg_trgm;

alter table public.product_aliases
  add column if not exists alias_normalized text not null default '';

-- Índice trigram para similaridad (Capa 2).
create index if not exists idx_product_aliases_normalized_trgm
  on public.product_aliases using gin (alias_normalized gin_trgm_ops);

-- Unique compuesto: garantiza idempotencia del INSERT en la RPC v2
-- (ON CONFLICT por canonical + alias_normalized) y acelera lookups de Capa 1.
create unique index if not exists idx_product_aliases_unique_per_canonical
  on public.product_aliases (canonical_product_id, alias_normalized);
