-- Tabel referensi master produk dari database IPOS (50.600+ item)
-- Digunakan sebagai fallback kedua saat scan barcode: OpenFoodFacts tidak ketemu -> cek tabel ini
create table if not exists master_products_ipos (
  barcode text primary key,
  nama_item text not null,
  merek text,
  satuan text
);

create index if not exists idx_master_products_ipos_nama on master_products_ipos using gin (to_tsvector('simple', nama_item));

alter table master_products_ipos enable row level security;

create policy "master_products_ipos_select_authenticated"
  on master_products_ipos for select
  to authenticated
  using (true);
