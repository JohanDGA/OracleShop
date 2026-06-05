create index idx_household_members_user
  on public.household_members (user_id);

create index idx_receipts_household_purchased
  on public.receipts (household_id, purchased_at desc)
  where deleted_at is null;

create index idx_receipt_items_canonical
  on public.receipt_items (canonical_product_id)
  where deleted_at is null;

create index idx_receipt_items_receipt
  on public.receipt_items (receipt_id)
  where deleted_at is null;

create index idx_canonical_products_household
  on public.canonical_products (household_id)
  where deleted_at is null;

create index idx_product_aliases_canonical
  on public.product_aliases (canonical_product_id);

create index idx_product_aliases_alias_trgm
  on public.product_aliases using gin (alias gin_trgm_ops);

create index idx_stores_household
  on public.stores (household_id)
  where deleted_at is null;

create index idx_shopping_lists_household
  on public.shopping_lists (household_id)
  where deleted_at is null;

create index idx_shopping_list_items_list
  on public.shopping_list_items (shopping_list_id);

create index idx_manual_expenses_household
  on public.manual_expenses (household_id)
  where deleted_at is null;

create index idx_price_alerts_household
  on public.price_alerts (household_id)
  where dismissed_at is null;
